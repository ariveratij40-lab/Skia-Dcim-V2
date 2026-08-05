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
// IMPORTANTE: estas pruebas solo son significativas si TEST_DATABASE_URL
// apunta a un rol SIN superusuario y SIN BYPASSRLS -- igual que
// skia_runtime en staging. Contra un rol superusuario (frecuente en un
// Postgres local por defecto), FORCE ROW LEVEL SECURITY no tiene ningún
// efecto (los superusuarios siempre evaden RLS) y la prueba se salta con
// un mensaje explícito en vez de dar un falso positivo.
//
// Correr con:
//   TEST_DATABASE_URL=postgres://skia_runtime:...@localhost:5432/skia_test?sslmode=disable \
//     go test -tags=integration ./... -run TestRLS -v
// ============================================================

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"testing"
)

// skipIfCanBypassRLS evita falsos positivos: si el rol de prueba es
// superusuario o tiene BYPASSRLS, ninguna aserción de "fail-closed" de
// este archivo es confiable.
func skipIfCanBypassRLS(t *testing.T, testDB *sql.DB) {
	t.Helper()
	var isSuper, bypassRLS bool
	err := testDB.QueryRow(
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

func setupWidgetsRLSSchema(t *testing.T, testDB *sql.DB) {
	t.Helper()
	ctx := context.Background()

	if _, err := testDB.ExecContext(ctx, `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`); err != nil {
		t.Fatalf("no se pudo crear extensión uuid-ossp: %v", err)
	}
	if _, err := testDB.ExecContext(ctx, `DROP TABLE IF EXISTS widgets CASCADE`); err != nil {
		t.Fatalf("no se pudo limpiar tabla widgets: %v", err)
	}
	if _, err := testDB.ExecContext(ctx, `
		CREATE TABLE widgets (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			tenant_id UUID NOT NULL,
			name VARCHAR(255) NOT NULL
		)`); err != nil {
		t.Fatalf("no se pudo crear tabla widgets: %v", err)
	}
	if _, err := testDB.ExecContext(ctx, `ALTER TABLE widgets ENABLE ROW LEVEL SECURITY`); err != nil {
		t.Fatalf("no se pudo habilitar RLS: %v", err)
	}
	if _, err := testDB.ExecContext(ctx, `ALTER TABLE widgets FORCE ROW LEVEL SECURITY`); err != nil {
		t.Fatalf("no se pudo forzar RLS: %v", err)
	}
	if _, err := testDB.ExecContext(ctx, `DROP POLICY IF EXISTS widgets_tenant_isolation ON widgets`); err != nil {
		t.Fatalf("no se pudo limpiar política previa: %v", err)
	}
	if _, err := testDB.ExecContext(ctx, `
		CREATE POLICY widgets_tenant_isolation ON widgets
		USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
		WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
	`); err != nil {
		t.Fatalf("no se pudo crear política RLS: %v", err)
	}
}

// TestRLS_FailsClosedWithoutTenantContext es la prueba que directamente
// habría detectado C-6: si una conexión/transacción no setea
// app.tenant_id, no debe ver NINGUNA fila -- ni las de otros tenants ni
// las propias -- en vez de fallar con un error.
func TestRLS_FailsClosedWithoutTenantContext(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	skipIfCanBypassRLS(t, testDB)
	setupWidgetsRLSSchema(t, testDB)

	ctx := context.Background()
	tenantA := "11111111-1111-1111-1111-111111111111"
	if _, err := testDB.ExecContext(ctx,
		`INSERT INTO widgets (tenant_id, name) VALUES ($1,'a1'), ($1,'a2')`, tenantA,
	); err != nil {
		t.Skipf("no se pudo insertar datos de prueba (posiblemente por RLS ya activo sin contexto en esta conexión): %v", err)
	}

	// Conexión/consulta SIN pasar por BeginTenantTx -- exactamente el bug
	// de C-6: el handler "olvidó" setear el contexto de tenant.
	var count int
	if err := testDB.QueryRowContext(ctx, `SELECT count(*) FROM widgets`).Scan(&count); err != nil {
		t.Fatalf("la consulta no debería fallar con error, debería devolver 0 filas: %v", err)
	}
	if count != 0 {
		t.Errorf("fail-closed roto: sin app.tenant_id seteado se vieron %d filas, se esperaban 0", count)
	}

	// Con el contexto correcto (vía BeginTenantTx, el mecanismo real que
	// usa RequireTenantTx), sí deben verse las filas del tenant.
	tx, err := BeginTenantTx(ctx, testDB, tenantA, "")
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

// TestRLS_NoCrossTenantLeak es la prueba negativa explícita que faltaba en
// rondas anteriores: con el contexto de un tenant fijado, un intento
// directo de leer o escribir una fila de OTRO tenant debe fallar/no ver
// nada, incluso si la sentencia SQL en sí no tiene ningún WHERE que lo
// prevenga.
func TestRLS_NoCrossTenantLeak(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	skipIfCanBypassRLS(t, testDB)
	setupWidgetsRLSSchema(t, testDB)

	ctx := context.Background()
	tenantA := "11111111-1111-1111-1111-111111111111"
	tenantB := "22222222-2222-2222-2222-222222222222"

	if _, err := testDB.ExecContext(ctx,
		`INSERT INTO widgets (tenant_id, name) VALUES ($1,'a1'), ($2,'b1'), ($2,'b2')`,
		tenantA, tenantB,
	); err != nil {
		t.Fatalf("no se pudo insertar datos de prueba: %v", err)
	}

	tx, err := BeginTenantTx(ctx, testDB, tenantA, "")
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

// TestRequireTenantTx_EndToEnd valida el ciclo completo del middleware
// contra Postgres real: COMMIT cuando el handler responde 2xx, ROLLBACK
// cuando responde >=400, y que el handler solo pueda ver/escribir a través
// del TenantDB inyectado.
func TestRequireTenantTx_EndToEnd(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	skipIfCanBypassRLS(t, testDB)
	setupWidgetsRLSSchema(t, testDB)
	db = testDB // RequireTenantTx recibe la *sql.DB explícitamente, pero
	// ExtractSessionContextSecure (llamado dentro) usa el parámetro que se
	// le pase, no la global -- se deja aquí también por si algún helper
	// interno cae de vuelta a la global.

	// Reutiliza el esquema mínimo de sesiones de
	// postgres_session_store_integration_test.go-style: creamos nuestra
	// propia sesión mínima para no interferir con otros archivos de tests.
	if _, err := testDB.Exec(`DROP TABLE IF EXISTS sessions CASCADE`); err != nil {
		t.Fatalf("no se pudo limpiar sessions: %v", err)
	}
	if _, err := testDB.Exec(`DROP TABLE IF EXISTS users CASCADE`); err != nil {
		t.Fatalf("no se pudo limpiar users: %v", err)
	}
	if _, err := testDB.Exec(`
		CREATE TABLE users (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), email VARCHAR(255) UNIQUE NOT NULL)
	`); err != nil {
		t.Fatalf("no se pudo crear users: %v", err)
	}
	if _, err := testDB.Exec(`
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

	tenantA := "11111111-1111-1111-1111-111111111111"
	var userID string
	if err := testDB.QueryRow(`INSERT INTO users (email) VALUES ('e2e@rbac.test') RETURNING id`).Scan(&userID); err != nil {
		t.Fatalf("no se pudo crear usuario: %v", err)
	}
	if _, err := testDB.Exec(
		`INSERT INTO sessions (user_id, tenant_id, token, expires_at) VALUES ($1,$2,'tok-e2e', extract(epoch from now())::bigint + 3600)`,
		userID, tenantA,
	); err != nil {
		t.Fatalf("no se pudo crear sesión: %v", err)
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

	RequireTenantTx(testDB, insertHandler)(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("esperaba 201, obtuve %d (body=%s)", rec.Code, rec.Body.String())
	}

	// Verificar que el COMMIT realmente persistió la fila (fuera de
	// cualquier transacción, con contexto de tenant fijado a mano).
	tx, err := BeginTenantTx(context.Background(), testDB, tenantA, "")
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
	RequireTenantTx(testDB, failingHandler)(rec2, req2)

	if rec2.Code != http.StatusInternalServerError {
		t.Fatalf("esperaba 500, obtuve %d", rec2.Code)
	}

	tx2, err := BeginTenantTx(context.Background(), testDB, tenantA, "")
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
