//go:build integration
// +build integration

package main

// ============================================================
// PRUEBAS DE INTEGRACIÓN — RBAC de /api/admin/users (A-8)
//
// Cubren lo prometido en el plan de remediación de A-8: viewer/operator NO
// pueden leer ni modificar /api/admin/users (incluida la escalación de
// privilegios que el fix de config_admin.go dejó posible si no se agrega
// autorización server-side), y admin sí puede, con el UPSERT correcto de
// role_id.
//
// Requiere una base de datos Postgres real y vacía (misma convención que
// postgres_session_store_integration_test.go): TEST_DATABASE_URL, o
// postgres://skia:skia@localhost:5432/skia_test?sslmode=disable por defecto.
//
// Correr con:
//   TEST_DATABASE_URL=postgres://... go test -tags=integration ./... -run RBAC -v
// ============================================================

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// setupAdminRBACSchema crea el subconjunto real del esquema (tal como está
// definido en migrations/001_init.sql) que toca handleAdminUsers: tenants,
// users, user_tenants, roles, user_roles, sessions. Se usa un esquema propio
// -- no el de setupTestTables() de postgres_session_store_integration_test.go
// -- porque aquel modela user_roles con una columna role_name de texto
// directo, que es exactamente el diseño antiguo e incorrecto que A-8 corrige;
// mezclarlos daría una prueba que no refleja el esquema real.
func setupAdminRBACSchema(t *testing.T, testDB *sql.DB) {
	t.Helper()
	ctx := context.Background()

	_, err := testDB.ExecContext(ctx, `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
	if err != nil {
		t.Fatalf("no se pudo crear extensión uuid-ossp: %v", err)
	}

	drop := []string{
		"sessions", "user_roles", "role_permissions", "roles",
		"user_tenants", "users", "tenants",
	}
	for _, tbl := range drop {
		if _, err := testDB.ExecContext(ctx, "DROP TABLE IF EXISTS "+tbl+" CASCADE"); err != nil {
			t.Fatalf("no se pudo limpiar tabla %s: %v", tbl, err)
		}
	}

	schema := `
	CREATE TABLE tenants (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		name VARCHAR(255) NOT NULL
	);

	CREATE TABLE users (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		email VARCHAR(255) UNIQUE NOT NULL,
		name VARCHAR(255) NOT NULL,
		password_hash VARCHAR(255) NOT NULL DEFAULT '',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE user_tenants (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, tenant_id)
	);

	CREATE TABLE roles (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
		name VARCHAR(255) NOT NULL,
		is_global BOOLEAN DEFAULT FALSE,
		UNIQUE(tenant_id, name)
	);

	CREATE TABLE user_roles (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
		role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, tenant_id, role_id)
	);

	CREATE TABLE sessions (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		tenant_id UUID,
		branch_id UUID,
		token VARCHAR(255) UNIQUE NOT NULL,
		expires_at BIGINT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`
	if _, err := testDB.ExecContext(ctx, schema); err != nil {
		t.Fatalf("no se pudo crear el esquema de prueba: %v", err)
	}
}

type rbacFixture struct {
	tenantID          string
	adminUserID       string
	operatorUserID    string
	viewerUserID      string
	adminSessionToken string
	operatorToken     string
	viewerToken       string
	roleIDByName      map[string]string
}

func seedRBACFixture(t *testing.T, testDB *sql.DB) rbacFixture {
	t.Helper()
	ctx := context.Background()
	f := rbacFixture{roleIDByName: map[string]string{}}

	mustScan := func(query string, args ...interface{}) string {
		var id string
		if err := testDB.QueryRowContext(ctx, query, args...).Scan(&id); err != nil {
			t.Fatalf("seed fixture: %v (query=%s)", err, query)
		}
		return id
	}

	f.tenantID = mustScan(`INSERT INTO tenants (name) VALUES ('Tenant RBAC Test') RETURNING id`)

	for _, name := range []string{"admin", "operator", "viewer"} {
		id := mustScan(
			`INSERT INTO roles (tenant_id, name, is_global) VALUES ($1, $2, FALSE) RETURNING id`,
			f.tenantID, name,
		)
		f.roleIDByName[name] = id
	}

	mkUser := func(email string) string {
		return mustScan(
			`INSERT INTO users (email, name, password_hash) VALUES ($1, $1, 'x') RETURNING id`,
			email,
		)
	}
	f.adminUserID = mkUser("admin@rbac.test")
	f.operatorUserID = mkUser("operator@rbac.test")
	f.viewerUserID = mkUser("viewer@rbac.test")

	for _, uid := range []string{f.adminUserID, f.operatorUserID, f.viewerUserID} {
		if _, err := testDB.ExecContext(ctx,
			`INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2)`, uid, f.tenantID,
		); err != nil {
			t.Fatalf("seed user_tenants: %v", err)
		}
	}

	assignRole := func(uid, roleName string) {
		if _, err := testDB.ExecContext(ctx,
			`INSERT INTO user_roles (user_id, tenant_id, role_id) VALUES ($1, $2, $3)`,
			uid, f.tenantID, f.roleIDByName[roleName],
		); err != nil {
			t.Fatalf("seed user_roles: %v", err)
		}
	}
	assignRole(f.adminUserID, "admin")
	assignRole(f.operatorUserID, "operator")
	assignRole(f.viewerUserID, "viewer")

	mkSession := func(uid, token string) {
		if _, err := testDB.ExecContext(ctx,
			`INSERT INTO sessions (user_id, tenant_id, token, expires_at) VALUES ($1, $2, $3, $4)`,
			uid, f.tenantID, token, time.Now().Add(time.Hour).Unix(),
		); err != nil {
			t.Fatalf("seed session: %v", err)
		}
	}
	f.adminSessionToken = "tok-admin-rbac-test"
	f.operatorToken = "tok-operator-rbac-test"
	f.viewerToken = "tok-viewer-rbac-test"
	mkSession(f.adminUserID, f.adminSessionToken)
	mkSession(f.operatorUserID, f.operatorToken)
	mkSession(f.viewerUserID, f.viewerToken)

	return f
}

func rbacRequest(method, path, token, body string) *http.Request {
	var req *http.Request
	if body != "" {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	req.AddCookie(&http.Cookie{Name: "session_token", Value: token})
	return req
}

// TestAdminUsers_ViewerAndOperatorForbidden prueba que viewer/operator no
// pueden leer ni escribir /api/admin/users -- antes de este fix no había
// NINGUNA verificación de rol en el handler.
func TestAdminUsers_ViewerAndOperatorForbidden(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	setupAdminRBACSchema(t, testDB)
	f := seedRBACFixture(t, testDB)
	db = testDB // handleAdminUsers usa la variable global `db`

	for _, tc := range []struct {
		name  string
		token string
	}{
		{"viewer", f.viewerToken},
		{"operator", f.operatorToken},
	} {
		t.Run(tc.name+"_GET", func(t *testing.T) {
			rec := httptest.NewRecorder()
			handleAdminUsers(rec, rbacRequest("GET", "/api/admin/users", tc.token, ""))
			if rec.Code != http.StatusForbidden {
				t.Errorf("%s GET /api/admin/users: esperado 403, obtuvo %d (body=%s)", tc.name, rec.Code, rec.Body.String())
			}
		})

		t.Run(tc.name+"_PUT_self_escalation", func(t *testing.T) {
			// Intento de auto-escalación: el propio viewer/operator trata de
			// ponerse a sí mismo como "admin".
			var targetID string
			if tc.name == "viewer" {
				targetID = f.viewerUserID
			} else {
				targetID = f.operatorUserID
			}
			rec := httptest.NewRecorder()
			body := `{"role":"admin"}`
			handleAdminUsers(rec, rbacRequest("PUT", "/api/admin/users/"+targetID, tc.token, body))
			if rec.Code != http.StatusForbidden {
				t.Errorf("%s PUT (auto-escalación): esperado 403, obtuvo %d (body=%s)", tc.name, rec.Code, rec.Body.String())
			}

			// Verificar en BD que el rol NO cambió.
			var roleName string
			err := testDB.QueryRow(
				`SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id
				 WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
				targetID, f.tenantID,
			).Scan(&roleName)
			if err != nil {
				t.Fatalf("no se pudo leer rol tras intento de escalación: %v", err)
			}
			if roleName != tc.name {
				t.Errorf("el rol de %s cambió a %q tras un PUT que debía ser rechazado", tc.name, roleName)
			}
		})
	}
}

// TestAdminUsers_AdminCanListAndChangeRoles prueba el camino feliz: admin
// puede listar usuarios y cambiar el rol de otro usuario, y el cambio queda
// reflejado correctamente vía role_id (A-8).
func TestAdminUsers_AdminCanListAndChangeRoles(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	setupAdminRBACSchema(t, testDB)
	f := seedRBACFixture(t, testDB)
	db = testDB

	// GET como admin -> 200 y lista de 3 usuarios.
	rec := httptest.NewRecorder()
	handleAdminUsers(rec, rbacRequest("GET", "/api/admin/users", f.adminSessionToken, ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("admin GET /api/admin/users: esperado 200, obtuvo %d (body=%s)", rec.Code, rec.Body.String())
	}
	var listResp struct {
		Users []struct {
			ID   string `json:"id"`
			Role string `json:"role"`
		} `json:"users"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("respuesta GET no es el JSON esperado: %v (body=%s)", err, rec.Body.String())
	}
	if len(listResp.Users) != 3 {
		t.Errorf("esperaba 3 usuarios en la lista, obtuve %d", len(listResp.Users))
	}

	// PUT como admin: ascender al viewer a "operator".
	rec = httptest.NewRecorder()
	handleAdminUsers(rec, rbacRequest("PUT", "/api/admin/users/"+f.viewerUserID, f.adminSessionToken, `{"role":"operator"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("admin PUT role change: esperado 200, obtuvo %d (body=%s)", rec.Code, rec.Body.String())
	}

	var roleName string
	var roleCount int
	if err := testDB.QueryRow(
		`SELECT COUNT(*) FROM user_roles WHERE user_id = $1 AND tenant_id = $2`,
		f.viewerUserID, f.tenantID,
	).Scan(&roleCount); err != nil {
		t.Fatalf("no se pudo contar user_roles: %v", err)
	}
	if roleCount != 1 {
		t.Errorf("esperaba exactamente 1 fila de user_roles tras el cambio (un solo rol activo por tenant), obtuve %d", roleCount)
	}
	if err := testDB.QueryRow(
		`SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id
		 WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
		f.viewerUserID, f.tenantID,
	).Scan(&roleName); err != nil {
		t.Fatalf("no se pudo leer el rol actualizado: %v", err)
	}
	if roleName != "operator" {
		t.Errorf("esperaba rol 'operator' tras el PUT, obtuve %q", roleName)
	}

	// PUT con un nombre de rol inválido debe rechazarse (allowlist server-side).
	rec = httptest.NewRecorder()
	handleAdminUsers(rec, rbacRequest("PUT", "/api/admin/users/"+f.viewerUserID, f.adminSessionToken, `{"role":"superadmin_inventado"}`))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("PUT con rol inválido: esperado 400, obtuvo %d (body=%s)", rec.Code, rec.Body.String())
	}
}

// TestAdminUsers_DeleteRequiresAdmin prueba que DELETE también respeta la
// verificación de rol agregada en este fix.
func TestAdminUsers_DeleteRequiresAdmin(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	setupAdminRBACSchema(t, testDB)
	f := seedRBACFixture(t, testDB)
	db = testDB

	rec := httptest.NewRecorder()
	handleAdminUsers(rec, rbacRequest("DELETE", "/api/admin/users/"+f.operatorUserID, f.viewerToken, ""))
	if rec.Code != http.StatusForbidden {
		t.Errorf("viewer DELETE: esperado 403, obtuvo %d", rec.Code)
	}

	rec = httptest.NewRecorder()
	handleAdminUsers(rec, rbacRequest("DELETE", "/api/admin/users/"+f.operatorUserID, f.adminSessionToken, ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("admin DELETE: esperado 200, obtuvo %d (body=%s)", rec.Code, rec.Body.String())
	}

	var count int
	if err := testDB.QueryRow(
		`SELECT COUNT(*) FROM user_tenants WHERE user_id = $1 AND tenant_id = $2`,
		f.operatorUserID, f.tenantID,
	).Scan(&count); err != nil {
		t.Fatalf("no se pudo verificar borrado: %v", err)
	}
	if count != 0 {
		t.Errorf("esperaba que user_tenants quedara sin filas para el usuario borrado, quedaron %d", count)
	}
}
