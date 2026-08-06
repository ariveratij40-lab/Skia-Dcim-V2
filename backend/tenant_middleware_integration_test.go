//go:build integration
// +build integration

package main

// ============================================================
// PRUEBAS DE INTEGRACIÓN — RLS "fail-closed" y ciclo de vida de
// RequireTenantTx (C-6)
//
// Usa una tabla sintética propia ("widgets"), no "assets", para no
// depender de todo el esquema de DCIM ni de que ops/2026-08-05_*.sql ya
// se haya corrido contra la BD de pruebas. Reproduce el mismo patrón de
// política (USING/WITH CHECK con current_setting('app.tenant_id', true))
// que se usó en el piloto real.
//
// DOS ROLES, DOS PROPÓSITOS (corrección de la ronda anterior):
//
//   - TEST_ADMIN_DATABASE_URL: rol con BYPASSRLS o superusuario. Se usa
//     EXCLUSIVAMENTE para preparar el escenario (crear tablas, políticas,
//     GRANTs, y sembrar filas). Nunca se usa para las aserciones que
//     prueban aislamiento -- si se usara, cualquier fuga cross-tenant
//     quedaría invisible porque este rol ve todo sin importar la política.
//   - TEST_DATABASE_URL: rol SIN superusuario y SIN BYPASSRLS -- igual que
//     skia_runtime en staging. Es el único rol contra el que corren las
//     aserciones de fail-closed / no-cross-tenant-leak / ciclo de vida del
//     middleware. Si apunta a un rol con privilegios elevados, la prueba
//     se salta (skipIfCanBypassRLS) con un mensaje explícito en vez de dar
//     un falso positivo -- eso NO es un SKIP que oculte un fallo de
//     preparación, es una condición real del entorno que invalida la
//     prueba (igual que correr una prueba de RLS contra un servidor sin
//     RLS habilitado).
//
// La ronda anterior sembraba datos usando el MISMO rol restringido
// envuelto en BeginTenantTx. Eso es fràgil por partida doble: (a) mezcla
// "preparar el escenario" con "el mecanismo bajo prueba" (si BeginTenantTx
// tuviera un bug, la siembra fallaría de forma indistinguible del fallo
// real que se quiere detectar), y (b) en el caso de sesiones/tenants/
// branches de TestRequireTenantTx_EndToEnd, requería que el rol
// restringido fuera además dueño de esas tablas -- una fidelidad con
// producción que no está garantizada. Separar "quién prepara" de "quién
// se prueba" resuelve ambos problemas.
//
// Correr con:
//   TEST_DATABASE_URL=postgres://skia_test_runtime:...@localhost:5432/skia_test?sslmode=disable \
//   TEST_ADMIN_DATABASE_URL=postgres://skia:skia@localhost:5432/skia_test?sslmode=disable \
//     go test -tags=integration ./... -run 'TestRLS|TestRequireTenantTx' -v
// ============================================================

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

// getAdminTestDB obtiene una conexión con un rol privilegiado (BYPASSRLS o
// superusuario), usada exclusivamente para preparar el escenario de cada
// prueba. Si no se puede conectar, o el rol no puede evadir RLS, esto es un
// fallo de preparación real -- t.Fatalf, no t.Skip -- porque sin esta
// conexión ninguna de las pruebas de este archivo puede sembrar datos de
// forma confiable.
func getAdminTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEST_ADMIN_DATABASE_URL")
	if dsn == "" {
		// Mismo default histórico que getTestDB en
		// postgres_session_store_integration_test.go: en una instancia de
		// Postgres local desechable, ese rol suele ser dueño de la BD.
		dsn = "postgres://skia:skia@localhost:5432/skia_test?sslmode=disable"
	}
	adminDB, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("no se pudo abrir conexión admin de pruebas (TEST_ADMIN_DATABASE_URL): %v", err)
	}
	if err := adminDB.Ping(); err != nil {
		t.Fatalf("no se pudo conectar con la conexión admin de pruebas (TEST_ADMIN_DATABASE_URL): %v", err)
	}
	return adminDB
}

// requireCanBypassRLS es la contraparte de skipIfCanBypassRLS: aquí, NO
// evadir RLS es el fallo de preparación (el rol admin no serviría para
// sembrar datos sin quedar sujeto a las mismas políticas que se están
// probando), así que es Fatalf y no Skip.
func requireCanBypassRLS(t *testing.T, adminDB *sql.DB) {
	t.Helper()
	var isSuper, bypassRLS bool
	err := adminDB.QueryRow(
		`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
	).Scan(&isSuper, &bypassRLS)
	if err != nil {
		t.Fatalf("no se pudo verificar atributos del rol admin de prueba: %v", err)
	}
	if !isSuper && !bypassRLS {
		t.Fatalf("TEST_ADMIN_DATABASE_URL apunta a un rol sin rolsuper y sin rolbypassrls -- " +
			"no sirve para sembrar datos de prueba de forma confiable (quedaría sujeto a las " +
			"mismas políticas RLS que estas pruebas intentan validar). Usa un rol distinto del " +
			"restringido (TEST_DATABASE_URL), con BYPASSRLS o superusuario, solo para preparación.")
	}
}

// currentRole devuelve el current_user de una conexión -- se usa para
// otorgarle privilegios explícitos al rol restringido sobre las tablas que
// crea/siembra el rol admin.
func currentRole(t *testing.T, db *sql.DB) string {
	t.Helper()
	var role string
	if err := db.QueryRow(`SELECT current_user`).Scan(&role); err != nil {
		t.Fatalf("no se pudo obtener current_user: %v", err)
	}
	return role
}

// requireDistinctRoles falla rápido y con un mensaje claro si
// TEST_DATABASE_URL y TEST_ADMIN_DATABASE_URL terminan apuntando al mismo
// rol (p.ej. porque ninguna de las dos variables se configuró y ambas
// cayeron en el mismo default) -- en ese caso "separar por rol" no está
// ocurriendo realmente y las pruebas de esta ronda no significan nada más
// que la ronda anterior.
func requireDistinctRoles(t *testing.T, adminRole, restrictedRole string) {
	t.Helper()
	if adminRole == restrictedRole {
		t.Fatalf("TEST_DATABASE_URL y TEST_ADMIN_DATABASE_URL resuelven al mismo rol (%q) -- "+
			"configúralas por separado: TEST_DATABASE_URL debe ser el rol restringido "+
			"(equivalente a skia_runtime) y TEST_ADMIN_DATABASE_URL un rol con BYPASSRLS/superusuario "+
			"distinto, usado solo para preparar datos.", adminRole)
	}
}

// skipIfCanBypassRLS evita falsos positivos: si el rol de prueba BAJO
// EVALUACIÓN (TEST_DATABASE_URL) es superusuario o tiene BYPASSRLS, ninguna
// aserción de "fail-closed" de este archivo es confiable. Esto es distinto
// de requireCanBypassRLS: aquí NO evadir RLS es la condición esperada del
// rol restringido, y SÍ evadirla es lo que invalida la prueba -- por eso
// sigue siendo un Skip legítimo (una condición real del entorno, no un
// fallo de preparación oculto).
func skipIfCanBypassRLS(t *testing.T, restrictedDB *sql.DB) {
	t.Helper()
	var isSuper, bypassRLS bool
	err := restrictedDB.QueryRow(
		`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
	).Scan(&isSuper, &bypassRLS)
	if err != nil {
		t.Fatalf("no se pudo verificar atributos del rol de prueba: %v", err)
	}
	if isSuper || bypassRLS {
		t.Skipf("TEST_DATABASE_URL usa un rol con rolsuper=%v rolbypassrls=%v -- "+
			"FORCE ROW LEVEL SECURITY no tiene efecto sobre este rol, así que esta "+
			"prueba no puede validar nada real. Usa un rol de prueba sin privilegios "+
			"elevados (igual que skia_runtime) para que esta prueba sea significativa.",
			isSuper, bypassRLS)
	}
}

// setupWidgetsRLSSchema crea la tabla, la política RLS y los GRANTs
// necesarios usando el rol ADMIN (bypassa RLS por definición), y le otorga
// al rol restringido exactamente los privilegios que tendría skia_runtime
// en producción sobre una tabla protegida por RLS: SELECT/INSERT/UPDATE/
// DELETE a nivel de tabla (la política decide qué filas, no el GRANT).
func setupWidgetsRLSSchema(t *testing.T, adminDB *sql.DB, restrictedRole string) {
	t.Helper()
	ctx := context.Background()

	if _, err := adminDB.ExecContext(ctx, `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`); err != nil {
		t.Fatalf("no se pudo crear extensión uuid-ossp: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `DROP TABLE IF EXISTS widgets CASCADE`); err != nil {
		t.Fatalf("no se pudo limpiar tabla widgets: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `
		CREATE TABLE widgets (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			tenant_id UUID NOT NULL,
			name VARCHAR(255) NOT NULL
		)`); err != nil {
		t.Fatalf("no se pudo crear tabla widgets: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `ALTER TABLE widgets ENABLE ROW LEVEL SECURITY`); err != nil {
		t.Fatalf("no se pudo habilitar RLS: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `ALTER TABLE widgets FORCE ROW LEVEL SECURITY`); err != nil {
		t.Fatalf("no se pudo forzar RLS: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `DROP POLICY IF EXISTS widgets_tenant_isolation ON widgets`); err != nil {
		t.Fatalf("no se pudo limpiar política previa: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `
		CREATE POLICY widgets_tenant_isolation ON widgets
		USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
		WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
	`); err != nil {
		t.Fatalf("no se pudo crear política RLS: %v", err)
	}
	grant := fmt.Sprintf(`GRANT SELECT, INSERT, UPDATE, DELETE ON widgets TO "%s"`, restrictedRole)
	if _, err := adminDB.ExecContext(ctx, grant); err != nil {
		t.Fatalf("no se pudo otorgar privilegios sobre widgets al rol restringido %q: %v", restrictedRole, err)
	}
}

// seedWidget inserta una fila directamente con el rol admin (bypassa RLS
// por definición, así que no necesita BeginTenantTx ni app.tenant_id
// seteado). Esta es la preparación del escenario -- deliberadamente NO usa
// el mecanismo bajo prueba.
func seedWidget(t *testing.T, adminDB *sql.DB, tenantID, name string) {
	t.Helper()
	if _, err := adminDB.Exec(`INSERT INTO widgets (tenant_id, name) VALUES ($1,$2)`, tenantID, name); err != nil {
		t.Fatalf("no se pudo sembrar widget (tenant=%s, name=%s) vía rol admin: %v", tenantID, name, err)
	}
}

// TestRLS_FailsClosedWithoutTenantContext es la prueba que directamente
// habría detectado C-6: si una conexión/transacción no setea
// app.tenant_id, no debe ver NINGUNA fila -- ni las de otros tenants ni
// las propias -- en vez de fallar con un error.
func TestRLS_FailsClosedWithoutTenantContext(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	skipIfCanBypassRLS(t, restrictedDB)

	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	restrictedRole := currentRole(t, restrictedDB)
	adminRole := currentRole(t, adminDB)
	requireDistinctRoles(t, adminRole, restrictedRole)

	setupWidgetsRLSSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantA := "11111111-1111-1111-1111-111111111111"

	// Siembra vía rol admin -- no pasa por BeginTenantTx ni por el rol
	// restringido, así que no puede confundirse con el mecanismo bajo
	// prueba.
	seedWidget(t, adminDB, tenantA, "a1")
	seedWidget(t, adminDB, tenantA, "a2")

	// Conexión/consulta del rol RESTRINGIDO, SIN pasar por BeginTenantTx --
	// exactamente el bug de C-6: el handler "olvidó" setear el contexto de
	// tenant.
	var count int
	if err := restrictedDB.QueryRowContext(ctx, `SELECT count(*) FROM widgets`).Scan(&count); err != nil {
		t.Fatalf("la consulta no debería fallar con error, debería devolver 0 filas: %v", err)
	}
	if count != 0 {
		t.Errorf("fail-closed roto: sin app.tenant_id seteado se vieron %d filas, se esperaban 0", count)
	}

	// Con el contexto correcto (vía BeginTenantTx sobre el rol restringido,
	// el mecanismo real que usa RequireTenantTx), sí deben verse las filas
	// del tenant.
	tx, err := BeginTenantTx(ctx, restrictedDB, tenantA, "")
	if err != nil {
		t.Fatalf("BeginTenantTx no debería fallar con un tenantID válido: %v", err)
	}
	defer tx.Rollback()
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM widgets`).Scan(&count); err != nil {
		t.Fatalf("consulta dentro de BeginTenantTx no debería fallar: %v", err)
	}
	if count != 2 {
		t.Errorf("con app.tenant_id=%s seteado se esperaban 2 filas, se obtuvieron %d", tenantA, count)
	}
}

// TestRLS_NoCrossTenantLeak es la prueba negativa explícita: con el
// contexto de un tenant fijado, un intento directo de leer o escribir una
// fila de OTRO tenant debe fallar/no ver nada, incluso si la sentencia SQL
// en sí no tiene ningún WHERE que lo prevenga.
func TestRLS_NoCrossTenantLeak(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	skipIfCanBypassRLS(t, restrictedDB)

	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	restrictedRole := currentRole(t, restrictedDB)
	adminRole := currentRole(t, adminDB)
	requireDistinctRoles(t, adminRole, restrictedRole)

	setupWidgetsRLSSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantA := "11111111-1111-1111-1111-111111111111"
	tenantB := "22222222-2222-2222-2222-222222222222"

	// Siembra de ambos tenants vía rol admin -- una sola conexión sin
	// contexto de tenant puede escribir filas de tenants distintos porque
	// bypassa RLS; no hay que abrir una transacción por tenant como exigía
	// hacerlo el rol restringido en la ronda anterior.
	seedWidget(t, adminDB, tenantA, "a1")
	seedWidget(t, adminDB, tenantB, "b1")
	seedWidget(t, adminDB, tenantB, "b2")

	tx, err := BeginTenantTx(ctx, restrictedDB, tenantA, "")
	if err != nil {
		t.Fatalf("BeginTenantTx: %v", err)
	}
	defer tx.Rollback()

	// Lectura: un SELECT sin WHERE, con el contexto de A, no debe ver las
	// filas de B.
	var total int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM widgets`).Scan(&total); err != nil {
		t.Fatalf("consulta no debería fallar: %v", err)
	}
	if total != 1 {
		t.Errorf("con contexto de tenant A se esperaba ver solo 1 fila (la propia), se vieron %d", total)
	}

	// Escritura: intentar actualizar explícitamente una fila de B mientras
	// el contexto activo es A. Debe afectar 0 filas (bloqueado por USING),
	// no un error -- y sobre todo, NUNCA debe tener éxito.
	res, err := tx.ExecContext(ctx, `UPDATE widgets SET name = 'hijacked' WHERE tenant_id = $1`, tenantB)
	if err != nil {
		t.Fatalf("el UPDATE no debería fallar con error, debería afectar 0 filas: %v", err)
	}
	affected, _ := res.RowsAffected()
	if affected != 0 {
		t.Errorf("fuga cross-tenant: un UPDATE con contexto de tenant A modificó %d fila(s) de tenant B", affected)
	}

	// Intentar INSERTAR una fila etiquetada como tenant B mientras el
	// contexto activo es A debe violar el WITH CHECK.
	if _, err := tx.ExecContext(ctx, `INSERT INTO widgets (tenant_id, name) VALUES ($1, 'sneaky')`, tenantB); err == nil {
		t.Error("fuga cross-tenant: se pudo insertar una fila de tenant B con el contexto de tenant A activo")
	}
}

// setupSessionSchema crea tenants/branches/users/sessions vía el rol admin
// y otorga al rol restringido exactamente lo que necesita
// ExtractSessionContextSecure (llamada dentro de RequireTenantTx con la
// conexión restringida, igual que en producción con skia_runtime): SELECT
// sobre las cuatro tablas, más INSERT sobre widgets (ya otorgado por
// setupWidgetsRLSSchema).
func setupSessionSchema(t *testing.T, adminDB *sql.DB, restrictedRole string) {
	t.Helper()

	for _, tbl := range []string{"sessions", "user_branches", "users", "branches", "tenants"} {
		if _, err := adminDB.Exec(`DROP TABLE IF EXISTS ` + tbl + ` CASCADE`); err != nil {
			t.Fatalf("no se pudo limpiar %s: %v", tbl, err)
		}
	}
	if _, err := adminDB.Exec(`
		CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL)
	`); err != nil {
		t.Fatalf("no se pudo crear tenants: %v", err)
	}
	if _, err := adminDB.Exec(`
		CREATE TABLE branches (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL)
	`); err != nil {
		t.Fatalf("no se pudo crear branches: %v", err)
	}
	if _, err := adminDB.Exec(`
		CREATE TABLE users (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), email VARCHAR(255) UNIQUE NOT NULL)
	`); err != nil {
		t.Fatalf("no se pudo crear users: %v", err)
	}
	if _, err := adminDB.Exec(`
		CREATE TABLE user_branches (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
			UNIQUE(user_id, branch_id)
		)
	`); err != nil {
		t.Fatalf("no se pudo crear user_branches: %v", err)
	}
	if _, err := adminDB.Exec(`
		CREATE TABLE sessions (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			tenant_id UUID,
			branch_id UUID,
			token VARCHAR(255) UNIQUE NOT NULL,
			expires_at BIGINT NOT NULL
		)
	`); err != nil {
		t.Fatalf("no se pudo crear sessions: %v", err)
	}

	for _, tbl := range []string{"tenants", "branches", "users", "user_branches", "sessions"} {
		grant := fmt.Sprintf(`GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO "%s"`, tbl, restrictedRole)
		if _, err := adminDB.Exec(grant); err != nil {
			t.Fatalf("no se pudo otorgar privilegios sobre %s al rol restringido %q: %v", tbl, restrictedRole, err)
		}
	}
}

// TestRequireTenantTx_EndToEnd valida el ciclo completo del middleware
// contra Postgres real: COMMIT cuando el handler responde 2xx, ROLLBACK
// cuando responde >=400, y que el handler solo pueda ver/escribir a través
// del TenantDB inyectado.
func TestRequireTenantTx_EndToEnd(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	skipIfCanBypassRLS(t, restrictedDB)

	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	restrictedRole := currentRole(t, restrictedDB)
	adminRole := currentRole(t, adminDB)
	requireDistinctRoles(t, adminRole, restrictedRole)

	setupWidgetsRLSSchema(t, adminDB, restrictedRole)
	setupSessionSchema(t, adminDB, restrictedRole)

	// db = restrictedDB: RequireTenantTx recibe la *sql.DB explícitamente,
	// pero se deja también en la global por si algún helper interno cae de
	// vuelta a ella.
	db = restrictedDB

	// Siembra de tenant/branch/usuario/sesión vía rol admin (bypassa RLS;
	// estas tablas no tienen políticas RLS en este archivo, pero mantener
	// la siembra separada de las aserciones es la misma disciplina para
	// todo el archivo).
	var tenantA, branchA string
	if err := adminDB.QueryRow(`INSERT INTO tenants (name) VALUES ('Tenant E2E') RETURNING id`).Scan(&tenantA); err != nil {
		t.Fatalf("no se pudo crear tenant: %v", err)
	}
	if err := adminDB.QueryRow(`INSERT INTO branches (tenant_id, name) VALUES ($1, 'Branch E2E') RETURNING id`, tenantA).Scan(&branchA); err != nil {
		t.Fatalf("no se pudo crear branch: %v", err)
	}
	var userID string
	if err := adminDB.QueryRow(`INSERT INTO users (email) VALUES ('e2e@rbac.test') RETURNING id`).Scan(&userID); err != nil {
		t.Fatalf("no se pudo crear usuario: %v", err)
	}
	if _, err := adminDB.Exec(
		`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`,
		userID, branchA,
	); err != nil {
		t.Fatalf("no se pudo autorizar usuario en branch: %v", err)
	}

	if _, err := adminDB.Exec(
		`INSERT INTO sessions (user_id, tenant_id, branch_id, token, expires_at) VALUES ($1,$2,$3,'tok-e2e', extract(epoch from now())::bigint + 3600)`,
		userID, tenantA, branchA,
	); err != nil {
		t.Fatalf("no se pudo crear sesión: %v", err)
	}

	// Verificación explícita del fixture ANTES de invocar el middleware:
	// llama a ExtractSessionContextSecure directamente, con la MISMA
	// conexión (restrictedDB) que usará RequireTenantTx, y si no es válido
	// falla con el motivo exacto en vez de dejar que se traduzca en un 401
	// opaco más abajo. Esto es lo que habría hecho evidente, sin
	// adivinar, cualquier descalce entre el fixture de sesión y lo que
	// ExtractSessionContextSecure realmente exige.
	preflightReq := httptest.NewRequest("GET", "/preflight", nil)
	preflightReq.AddCookie(&http.Cookie{Name: "session_token", Value: "tok-e2e"})
	if sessCheck := ExtractSessionContextSecure(preflightReq, restrictedDB); !sessCheck.Valid {
		t.Fatalf("fixture de sesión inválido para ExtractSessionContextSecure antes de probar el "+
			"middleware (esto NO es el fallo que la prueba busca detectar, es un defecto del fixture): %s",
			sessCheck.Error)
	}

	// Handler de prueba: inserta un widget usando el TenantDB del contexto.
	insertHandler := func(w http.ResponseWriter, r *http.Request) {
		tdb, ok := TenantDBFromContext(r.Context())
		if !ok {
			t.Fatal("el handler no recibió TenantDB en el contexto")
		}
		if _, err := tdb.ExecContext(r.Context(), `INSERT INTO widgets (tenant_id, name) VALUES ($1,'via-middleware')`, tenantA); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}

	req := httptest.NewRequest("POST", "/widgets", nil)
	req.AddCookie(&http.Cookie{Name: "session_token", Value: "tok-e2e"})
	rec := httptest.NewRecorder()

	RequireTenantTx(restrictedDB, insertHandler)(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("esperaba 201, obtuve %d (body=%s)", rec.Code, rec.Body.String())
	}

	// Verificar que el COMMIT realmente persistió la fila (fuera de
	// cualquier transacción, con contexto de tenant fijado a mano sobre el
	// rol restringido -- exactamente como lo vería una request real).
	tx, err := BeginTenantTx(context.Background(), restrictedDB, tenantA, "")
	if err != nil {
		t.Fatalf("BeginTenantTx de verificación: %v", err)
	}
	defer tx.Rollback()
	var count int
	if err := tx.QueryRow(`SELECT count(*) FROM widgets WHERE name = 'via-middleware'`).Scan(&count); err != nil {
		t.Fatalf("verificación post-commit: %v", err)
	}
	if count != 1 {
		t.Errorf("esperaba que el COMMIT del middleware hubiera persistido 1 fila, encontré %d", count)
	}

	// Handler que falla (>=400): el middleware debe hacer ROLLBACK y no
	// persistir el INSERT.
	failingHandler := func(w http.ResponseWriter, r *http.Request) {
		tdb, ok := TenantDBFromContext(r.Context())
		if !ok {
			t.Fatal("el handler no recibió TenantDB en el contexto")
		}
		if _, err := tdb.ExecContext(r.Context(), `INSERT INTO widgets (tenant_id, name) VALUES ($1,'should-not-persist')`, tenantA); err != nil {
			t.Fatalf("el INSERT dentro del handler no debería fallar: %v", err)
		}
		http.Error(w, `{"error":"algo salió mal después de escribir"}`, http.StatusInternalServerError)
	}

	req2 := httptest.NewRequest("POST", "/widgets", nil)
	req2.AddCookie(&http.Cookie{Name: "session_token", Value: "tok-e2e"})
	rec2 := httptest.NewRecorder()
	RequireTenantTx(restrictedDB, failingHandler)(rec2, req2)

	if rec2.Code != http.StatusInternalServerError {
		t.Fatalf("esperaba 500, obtuve %d", rec2.Code)
	}

	tx2, err := BeginTenantTx(context.Background(), restrictedDB, tenantA, "")
	if err != nil {
		t.Fatalf("BeginTenantTx de verificación 2: %v", err)
	}
	defer tx2.Rollback()
	var count2 int
	if err := tx2.QueryRow(`SELECT count(*) FROM widgets WHERE name = 'should-not-persist'`).Scan(&count2); err != nil {
		t.Fatalf("verificación post-rollback: %v", err)
	}
	if count2 != 0 {
		t.Errorf("ROLLBACK no funcionó: se esperaban 0 filas 'should-not-persist', se encontraron %d", count2)
	}
}
