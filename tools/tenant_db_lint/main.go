// Command tenant_db_lint es una verificación estática heurística (C-6):
// detecta llamadas a métodos de consulta sobre las tablas objetivo
// (assets, asset_logs y asset_relationships) (Query/QueryRow/Exec y sus
// variantes *Context) hechas directamente sobre el receptor `db` (la
// variable global de main.go) o sobre un selector que termina en `.DB`
// (p.ej. `h.DB`), dentro de los archivos de handlers del backend.
//
// Es deliberadamente simple: analiza sintaxis (go/ast), no tipos. No sabe
// que `h.DB` es un *sql.DB ni que `tdb` implementa TenantDB -- solo mira
// nombres. Esto significa:
//   - Falsos negativos: un alias distinto de "db"/"*.DB" que apunte a la
//     misma conexión no se detecta.
//   - Falsos positivos: una variable local llamada "db" que no sea la
//     conexión global también dispararía la alerta (no debería ocurrir si
//     se respeta la convención del proyecto, pero puede pasar).
//
// Es un cinturón adicional, no un reemplazo de la revisión de código ni de
// las pruebas de integración -- exactamente como se documentó en el
// informe de auditoría (C-6): "reduce mucho la posibilidad de olvidar
// SET LOCAL, pero no reemplaza la cobertura de código ni las políticas RLS".
//
// Uso:
//
//	go run ./tools/tenant_db_lint [-allow archivo1.go,archivo2.go] backend/*.go
//
// Sale con código de salida distinto de cero (y detalle en stdout) si
// encuentra alguna llamada prohibida. Pensado para correr en CI y como
// pre-commit local.
package main

import (
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// tenantQueryMethods son los métodos que, si se llaman directamente sobre
// `db`/`h.DB`, deben estar dentro de una función explícitamente eximida
// (jobs, migraciones, ops) o reemplazarse por el TenantDB del contexto.
var tenantQueryMethods = map[string]bool{
	"Query":           true,
	"QueryRow":        true,
	"Exec":            true,
	"QueryContext":    true,
	"QueryRowContext": true,
	"ExecContext":     true,
}

// defaultExemptFiles: archivos que por naturaleza operan cross-tenant o
// fuera del ciclo de vida de un request HTTP (migraciones, arranque,
// jobs en segundo plano, el propio middleware/contexto de tenant). Estos
// deben declarar su alcance explícitamente en el código, no a través de
// este linter.
var defaultExemptFiles = map[string]bool{
	"migrations.go":             true,
	"tenant_context.go":         true,
	"tenant_middleware.go":      true,
	"main.go":                   true,
	"postgres_session_store.go": true,
}

type finding struct {
	file   string
	line   int
	method string
	recv   string
}

var protectedTables = []string{"assets", "asset_logs", "asset_relationships"}

func main() {
	allowFlag := flag.String("allow", "", "lista separada por comas de archivos adicionales a exceptuar (además de los exentos por defecto)")
	flag.Parse()

	patterns := flag.Args()
	if len(patterns) == 0 {
		fmt.Fprintln(os.Stderr, "uso: tenant_db_lint [-allow a.go,b.go] <archivo.go o glob> [...]")
		os.Exit(2)
	}

	exempt := map[string]bool{}
	for k, v := range defaultExemptFiles {
		exempt[k] = v
	}
	if *allowFlag != "" {
		for _, f := range strings.Split(*allowFlag, ",") {
			exempt[strings.TrimSpace(f)] = true
		}
	}

	var files []string
	for _, p := range patterns {
		matches, err := filepath.Glob(p)
		if err != nil {
			fmt.Fprintf(os.Stderr, "patrón inválido %q: %v\n", p, err)
			os.Exit(2)
		}
		files = append(files, matches...)
	}
	sort.Strings(files)

	var findings []finding
	fset := token.NewFileSet()
	for _, path := range files {
		base := filepath.Base(path)
		if strings.HasSuffix(base, "_test.go") {
			continue // las pruebas de integración legítimamente usan db/testDB directo
		}
		if exempt[base] {
			continue
		}
		node, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			fmt.Fprintf(os.Stderr, "no se pudo parsear %s: %v\n", path, err)
			os.Exit(2)
		}

		ast.Inspect(node, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			if !tenantQueryMethods[sel.Sel.Name] {
				return true
			}
			if !queryTouchesProtectedTable(call) {
				return true
			}
			recvName, forbidden := describeReceiver(sel.X)
			if !forbidden {
				return true
			}
			if recvName == "db" && contextualDBAliasAt(node, call.Pos()) {
				return true
			}
			pos := fset.Position(call.Pos())
			findings = append(findings, finding{
				file:   path,
				line:   pos.Line,
				method: sel.Sel.Name,
				recv:   recvName,
			})
			return true
		})
	}

	if len(findings) == 0 {
		fmt.Println("tenant_db_lint: sin hallazgos.")
		return
	}

	fmt.Printf("tenant_db_lint: %d llamada(s) sospechosa(s) a la conexión global/‌h.DB fuera de archivos exentos:\n\n", len(findings))
	for _, f := range findings {
		fmt.Printf("  %s:%d  %s.%s(...)\n", f.file, f.line, f.recv, f.method)
	}
	fmt.Println("\nSi alguna de estas es intencional (job, migración, tarea admin), mueve la")
	fmt.Println("función a un archivo exento o pásalo con -allow. Si toca una tabla con")
	fmt.Println("tenant_id/RLS, debe usar TenantDBFromContext(r.Context()) en su lugar.")
	os.Exit(1)
}

// queryTouchesProtectedTable intentionally classifies only SQL literals.
// Dynamic SQL remains subject to code review and must not be used for target
// tables; this keeps unrelated catalog/session accesses out of the gate.
func queryTouchesProtectedTable(call *ast.CallExpr) bool {
	if len(call.Args) == 0 {
		return false
	}
	literal, ok := call.Args[0].(*ast.BasicLit)
	if !ok || literal.Kind != token.STRING {
		return false
	}
	query := strings.ToLower(literal.Value)
	tokens := strings.FieldsFunc(query, func(r rune) bool {
		return !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9') && r != '_'
	})
	for _, table := range protectedTables {
		for _, token := range tokens {
			if token == table {
				return true
			}
		}
	}
	return false
}

// contextualDBAliasAt recognizes the reviewed pattern used by legacy infra
// handlers: `db, ok := TenantDBFromContext(r.Context())`. The local identifier
// shadows the package pool and is therefore a contextual *sql.Tx implementing
// TenantDB, not an unscoped connection.
func contextualDBAliasAt(node *ast.File, pos token.Pos) bool {
	for _, decl := range node.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Body == nil || pos < fn.Pos() || pos > fn.End() {
			continue
		}
		found := false
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			assign, ok := n.(*ast.AssignStmt)
			if !ok || len(assign.Lhs) == 0 || len(assign.Rhs) == 0 {
				return true
			}
			lhs, ok := assign.Lhs[0].(*ast.Ident)
			call, callOK := assign.Rhs[0].(*ast.CallExpr)
			if !ok || !callOK {
				return true
			}
			callee, calleeOK := call.Fun.(*ast.Ident)
			if calleeOK && lhs.Name == "db" && callee.Name == "TenantDBFromContext" {
				found = true
				return false
			}
			return true
		})
		return found
	}
	return false
}

// describeReceiver decide si una expresión receptora de un método de
// consulta es "la conexión global sin contexto de tenant": el identificador
// exacto `db`, o un selector cuyo último componente es `DB` (p.ej. `h.DB`,
// `handler.DB`). Cualquier otra cosa (incluido `tdb`, `tx` de una variable
// local que no se llame `db`, etc.) se considera fuera de alcance del
// linter -- ver limitaciones en el comentario de paquete.
func describeReceiver(expr ast.Expr) (string, bool) {
	switch e := expr.(type) {
	case *ast.Ident:
		if e.Name == "db" {
			return e.Name, true
		}
	case *ast.SelectorExpr:
		if e.Sel.Name == "DB" {
			if base, ok := e.X.(*ast.Ident); ok {
				return base.Name + ".DB", true
			}
			return "?.DB", true
		}
	}
	return "", false
}
