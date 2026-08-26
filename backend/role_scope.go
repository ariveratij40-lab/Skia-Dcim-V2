package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
)

// ============================================================
// Resolución de alcance de sucursal por rol (C-6, ronda 2026-08-07)
//
// Algunas rutas necesitan ver/afectar TODAS las sucursales de un tenant,
// no solo la de la sesión activa -- pero solo para roles autorizados
// (hoy: "admin"). Esto complementa, no reemplaza, la resolución de
// sucursal de ExtractSessionContextSecure (import_handlers.go): esa sigue
// siendo la única fuente de branch_id individual; esto decide si, además,
// corresponde activar app.branch_scope_all para la transacción.
//
// Diseño acordado con el usuario: el alcance global NUNCA se infiere de la
// ausencia de sucursal -- se decide consultando el rol real del usuario
// contra la base, siempre, en cada resolución.
// ============================================================

// globalScopeRoles son los nombres de rol (columna roles.name) autorizados
// a operar con app.branch_scope_all='true'. Verificado en el código: el
// nombre "admin" existe y se usa como chequeo de autorización en
// config_admin.go (handleAdminUsers). El usuario mencionó también
// "gestores de tenant" como candidatos a alcance global -- no encontré
// evidencia de un nombre de rol distinto para eso en el esquema
// actualmente inspeccionado, así que queda como lista para ampliar
// cuando se confirme la taxonomía real de roles (Declarado, no
// Verificado, ver informe de auditoría).
var globalScopeRoles = map[string]bool{
	"admin": true,
}

// resolveUserRole obtiene el nombre de rol del usuario dentro de un
// tenant. Mismo patrón de consulta que sessionInfo en config_admin.go
// (user_roles JOIN roles). Devuelve "" (sin error) si el usuario no tiene
// ningún rol asignado en ese tenant -- eso NO es un error de base de
// datos, es un estado legítimo (p.ej. onboarding incompleto), y debe
// tratarse como "sin alcance global" por el llamador, no como fallo.
func resolveUserRole(ctx context.Context, tdb TenantDB, userID, tenantID string) (string, error) {
	var role string
	err := tdb.QueryRowContext(ctx,
		`SELECT r.name FROM user_roles ur
		 JOIN roles r ON r.id = ur.role_id
		 WHERE ur.user_id = $1 AND ur.tenant_id = $2 LIMIT 1`,
		userID, tenantID,
	).Scan(&role)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return role, nil
}

// RequireTenantTxScoped es una variante de RequireTenantTx para rutas que
// deben poder operar en alcance "todas las sucursales del tenant" para
// roles autorizados, y en la sucursal de la sesión para el resto:
//
//  1. Autentica igual que RequireTenantTx (ExtractSessionContextSecure).
//  2. Abre una transacción MÍNIMA, de solo lectura del rol, para
//     resolver el rol del usuario (user_roles/roles) -- estas tablas no
//     tienen RLS, así que no hace falta ningún contexto especial para
//     leerlas; se hace dentro de una transacción con contexto de tenant
//     de todas formas por consistencia y para no usar `database` crudo.
//  3. Si el rol está en globalScopeRoles, reabre la transacción real de
//     la request con BeginTenantTxWithScope(..., scopeAll=true). Si no,
//     con el branch de la sesión, igual que RequireTenantTx.
//  4. El resto del ciclo de vida (COMMIT/ROLLBACK según status HTTP,
//     manejo de panic) es idéntico a RequireTenantTx.
//
// Nota deliberada: NO reutiliza la transacción del paso 2 para la request
// -- se abre y cierra aparte, para que un fallo al leer el rol nunca dañe
// ni condicione la transacción real de la request, y para que quede claro
// en cualquier trace/log cuál transacción es cuál.
func RequireTenantTxScoped(database *sql.DB, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sessCtx := ExtractSessionContextSecure(r, database)
		if !sessCtx.Valid || sessCtx.TenantID == "" {
			respondSessionInvalid(w, sessCtx)
			return
		}

		scopeAll := false
		roleTx, roleErr := BeginTenantTx(r.Context(), database, sessCtx.TenantID, sessCtx.BranchID)
		if roleErr != nil {
			log.Printf("RequireTenantTxScoped: no se pudo abrir transacción para resolver rol (tenant=%s): %v", sessCtx.TenantID, roleErr)
			jsonErr(w, "Internal error", http.StatusInternalServerError)
			return
		}
		role, roleErr := resolveUserRole(r.Context(), roleTx, sessCtx.UserID, sessCtx.TenantID)
		_ = roleTx.Rollback() // transacción de solo lectura: siempre rollback, nunca escribe nada
		if roleErr != nil {
			log.Printf("RequireTenantTxScoped: error resolviendo rol (user=%s, tenant=%s): %v", sessCtx.UserID, sessCtx.TenantID, roleErr)
			jsonErr(w, "Internal error", http.StatusInternalServerError)
			return
		}
		if globalScopeRoles[role] {
			scopeAll = true
		}

		tx, err := BeginTenantTxWithScope(r.Context(), database, sessCtx.TenantID, sessCtx.BranchID, scopeAll)
		if err != nil {
			log.Printf("RequireTenantTxScoped: no se pudo abrir transacción con contexto de tenant (tenant=%s, scopeAll=%v): %v", sessCtx.TenantID, scopeAll, err)
			jsonErr(w, "Internal error", http.StatusInternalServerError)
			return
		}

		sw := newTransactionResponseWriter()
		ctx := withTenantDB(r.Context(), tx)
		ctx = withTenantIdentity(ctx, sessCtx.UserID, sessCtx.TenantID, sessCtx.BranchID)
		ctx = withTenantScope(ctx, scopeAll)
		req := r.WithContext(ctx)

		finalized := false
		defer func() {
			if finalized {
				return
			}
			if rbErr := tx.Rollback(); rbErr != nil && rbErr != sql.ErrTxDone {
				log.Printf("RequireTenantTxScoped: error en ROLLBACK (tenant=%s): %v", sessCtx.TenantID, rbErr)
			}
			if p := recover(); p != nil {
				log.Printf("RequireTenantTxScoped: panic en handler (tenant=%s), transacción revertida: %v", sessCtx.TenantID, p)
				panic(p)
			}
		}()

		next(sw, req)

		if sw.status >= 400 {
			if rbErr := tx.Rollback(); rbErr != nil && rbErr != sql.ErrTxDone {
				log.Printf("RequireTenantTxScoped: error en ROLLBACK (tenant=%s): %v", sessCtx.TenantID, rbErr)
			}
			finalized = true
			sw.FlushTo(w)
			return
		}
		if cErr := tx.Commit(); cErr != nil {
			log.Printf("RequireTenantTxScoped: error en COMMIT (tenant=%s): %v", sessCtx.TenantID, cErr)
			finalized = true
			jsonErr(w, "Internal error", http.StatusInternalServerError)
			return
		}
		finalized = true
		sw.FlushTo(w)
	}
}
