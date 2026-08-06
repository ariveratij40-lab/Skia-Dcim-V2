//go:build integration
// +build integration

package main

// ============================================================
// PRUEBAS DE INTEGRACIÓN — resolución unificada de branch_id en
// ExtractSessionContextSecure (import_handlers.go)
//
// Cubren los cinco escenarios pedidos explícitamente antes de migrar
// updateAsset/deleteAsset/HandleRFID/HandleLocationsManage a
// RequireTenantTx:
//
//  1. sesión con sucursal explícita y autorizada -> Valid=true.
//  2. sesión sin sucursal, exactamente una autorizada -> auto-resuelta,
//     Valid=true.
//  3. sesión sin sucursal, varias autorizadas -> Valid=false,
//     SessionReasonBranchSelectionNeeded, con la lista de opciones.
//  4. sesión con sucursal explícita pero NO autorizada para ese usuario ->
//     Valid=false, SessionReasonBranchNotAuthorized.
//  5. sesión sin sucursal y sin ninguna autorizada -> Valid=false,
//     SessionReasonNoBranchesAssigned.
//
// Además, dos pruebas a nivel de RequireTenantTx confirman que
// respondSessionInvalid traduce los casos 3 y 5 a 409/403 en vez de un 401
// genérico -- el detalle que le importa al frontend para decidir si debe
// mostrar un selector de sucursal o un error de permisos.
//
// Reutiliza getAdminTestDB/getTestDB/requireCanBypassRLS/
// requireDistinctRoles/currentRole de tenant_middleware_integration_test.go
// (mismo paquete): sembrar SIEMPRE vía el rol admin, resolver/asertar
// SIEMPRE vía el rol restringido -- misma disciplina que el resto del
// archivo de pruebas de C-6.
// ============================================================

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"testing"
)

// setupBranchResolutionSchema crea tenants/branches/users/user_branches/
// sessions vía el rol admin y otorga al rol restringido los privilegios
// que necesita ExtractSessionContextSecure para leerlas (igual que en
// producción, donde skia_runtime hace estas mismas consultas).
func setupBranchResolutionSchema(t *testing.T, adminDB *sql.DB, restrictedRole string) {
	t.Helper()
	for _, tbl := range []string{"sessions", "user_branches", "branches", "users", "tenants"} {
		if _, err := adminDB.Exec(`DROP TABLE IF EXISTS ` + tbl + ` CASCADE`); err != nil {
			t.Fatalf("no se pudo limpiar %s: %v", tbl, err)
		}
	}
	stmts := []string{
		`CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL)`,
		`CREATE TABLE branches (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL)`,
		`CREATE TABLE users (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), email VARCHAR(255) UNIQUE NOT NULL)`,
		`CREATE TABLE user_branches (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE, UNIQUE(user_id, branch_id))`,
		`CREATE TABLE sessions (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, tenant_id UUID, branch_id UUID, token VARCHAR(255) UNIQUE NOT NULL, expires_at BIGINT NOT NULL)`,
	}
	for _, stmt := range stmts {
		if _, err := adminDB.Exec(stmt); err != nil {
			t.Fatalf("no se pudo crear esquema de resolución de sucursal (%s): %v", stmt, err)
		}
	}
	for _, tbl := range []string{"tenants", "branches", "users", "user_branches", "sessions"} {
		if _, err := adminDB.Exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ` + tbl + ` TO "` + restrictedRole + `"`); err != nil {
			t.Fatalf("no se pudo otorgar privilegios sobre %s al rol restringido %q: %v", tbl, restrictedRole, err)
		}
	}
}

// branchFixture agrupa lo mínimo para crear una sesión de prueba: un
// tenant, cero o más sucursales, un usuario, autorizaciones opcionales en
// user_branches, y la sesión misma con o sin branch_id explícito.
type branchFixture struct {
	adminDB *sql.DB
	t       *testing.T
}

func (f branchFixture) newTenant(name string) string {
	f.t.Helper()
	var id string
	if err := f.adminDB.QueryRow(`INSERT INTO tenants (name) VALUES ($1) RETURNING id`, name).Scan(&id); err != nil {
		f.t.Fatalf("no se pudo crear tenant %q: %v", name, err)
	}
	return id
}

func (f branchFixture) newBranch(tenantID, name string) string {
	f.t.Helper()
	var id string
	if err := f.adminDB.QueryRow(`INSERT INTO branches (tenant_id, name) VALUES ($1,$2) RETURNING id`, tenantID, name).Scan(&id); err != nil {
		f.t.Fatalf("no se pudo crear branch %q: %v", name, err)
	}
	return id
}

func (f branchFixture) newUser(email string) string {
	f.t.Helper()
	var id string
	if err := f.adminDB.QueryRow(`INSERT INTO users (email) VALUES ($1) RETURNING id`, email).Scan(&id); err != nil {
		f.t.Fatalf("no se pudo crear usuario %q: %v", email, err)
	}
	return id
}

func (f branchFixture) authorize(userID, branchID string) {
	f.t.Helper()
	if _, err := f.adminDB.Exec(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1,$2)`, userID, branchID); err != nil {
		f.t.Fatalf("no se pudo autorizar user=%s branch=%s: %v", userID, branchID, err)
	}
}

// newSession crea una sesión con token único y, opcionalmente, branch_id
// explícito (pasar "" para dejarlo NULL, el caso que dispara la
// resolución automática/ambigua).
func (f branchFixture) newSession(userID, tenantID, branchID, token string) {
	f.t.Helper()
	var err error
	if branchID == "" {
		_, err = f.adminDB.Exec(
			`INSERT INTO sessions (user_id, tenant_id, branch_id, token, expires_at) VALUES ($1,$2,NULL,$3, extract(epoch from now())::bigint + 3600)`,
			userID, tenantID, token,
		)
	} else {
		_, err = f.adminDB.Exec(
			`INSERT INTO sessions (user_id, tenant_id, branch_id, token, expires_at) VALUES ($1,$2,$3,$4, extract(epoch from now())::bigint + 3600)`,
			userID, tenantID, branchID, token,
		)
	}
	if err != nil {
		f.t.Fatalf("no se pudo crear sesión (token=%s): %v", token, err)
	}
}

func requestWithToken(token string) *http.Request {
	req := httptest.NewRequest("GET", "/probe", nil)
	req.AddCookie(&http.Cookie{Name: "session_token", Value: token})
	return req
}

// TestExtractSessionContextSecure_ExplicitBranch_Authorized: escenario 1.
func TestExtractSessionContextSecure_ExplicitBranch_Authorized(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)
	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupBranchResolutionSchema(t, adminDB, restrictedRole)
	f := branchFixture{adminDB: adminDB, t: t}

	tenantID := f.newTenant("Tenant 1")
	branchID := f.newBranch(tenantID, "Sucursal única")
	userID := f.newUser("u1@test.local")
	f.authorize(userID, branchID)
	f.newSession(userID, tenantID, branchID, "tok-explicit-authorized")

	ctx := ExtractSessionContextSecure(requestWithToken("tok-explicit-authorized"), restrictedDB)
	if !ctx.Valid {
		t.Fatalf("esperaba Valid=true, obtuve Valid=false (Reason=%s, Error=%s)", ctx.Reason, ctx.Error)
	}
	if ctx.BranchID != branchID {
		t.Errorf("esperaba BranchID=%s, obtuve %s", branchID, ctx.BranchID)
	}
}

// TestExtractSessionContextSecure_NoBranch_SingleAuthorized: escenario 2.
func TestExtractSessionContextSecure_NoBranch_SingleAuthorized(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)
	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupBranchResolutionSchema(t, adminDB, restrictedRole)
	f := branchFixture{adminDB: adminDB, t: t}

	tenantID := f.newTenant("Tenant 2")
	branchID := f.newBranch(tenantID, "Única autorizada")
	// Segunda sucursal del mismo tenant, pero el usuario NO está
	// autorizado para ella -- no debe contar para la resolución.
	otherBranch := f.newBranch(tenantID, "Otra sucursal, sin autorizar")
	_ = otherBranch
	userID := f.newUser("u2@test.local")
	f.authorize(userID, branchID)
	f.newSession(userID, tenantID, "", "tok-single-auto")

	ctx := ExtractSessionContextSecure(requestWithToken("tok-single-auto"), restrictedDB)
	if !ctx.Valid {
		t.Fatalf("esperaba auto-resolución exitosa (Valid=true), obtuve Valid=false (Reason=%s, Error=%s)", ctx.Reason, ctx.Error)
	}
	if ctx.BranchID != branchID {
		t.Errorf("esperaba que se auto-resolviera a la única sucursal autorizada %s, obtuve %s", branchID, ctx.BranchID)
	}
}

// TestExtractSessionContextSecure_NoBranch_MultipleAuthorized: escenario 3.
func TestExtractSessionContextSecure_NoBranch_MultipleAuthorized(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)
	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupBranchResolutionSchema(t, adminDB, restrictedRole)
	f := branchFixture{adminDB: adminDB, t: t}

	tenantID := f.newTenant("Tenant 3")
	branchA := f.newBranch(tenantID, "Sucursal A")
	branchB := f.newBranch(tenantID, "Sucursal B")
	userID := f.newUser("u3@test.local")
	f.authorize(userID, branchA)
	f.authorize(userID, branchB)
	f.newSession(userID, tenantID, "", "tok-multi-ambiguous")

	ctx := ExtractSessionContextSecure(requestWithToken("tok-multi-ambiguous"), restrictedDB)
	if ctx.Valid {
		t.Fatalf("esperaba Valid=false por ambigüedad de sucursal, obtuve Valid=true con BranchID=%s", ctx.BranchID)
	}
	if ctx.Reason != SessionReasonBranchSelectionNeeded {
		t.Errorf("esperaba Reason=%s, obtuve %s (Error=%s)", SessionReasonBranchSelectionNeeded, ctx.Reason, ctx.Error)
	}
	if len(ctx.AvailableBranches) != 2 {
		t.Errorf("esperaba 2 sucursales candidatas, obtuve %d", len(ctx.AvailableBranches))
	}
}

// TestExtractSessionContextSecure_ExplicitBranch_NotAuthorized: escenario 4.
func TestExtractSessionContextSecure_ExplicitBranch_NotAuthorized(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)
	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupBranchResolutionSchema(t, adminDB, restrictedRole)
	f := branchFixture{adminDB: adminDB, t: t}

	tenantID := f.newTenant("Tenant 4")
	branchID := f.newBranch(tenantID, "Sucursal ajena")
	userID := f.newUser("u4@test.local")
	// Deliberadamente NO se llama f.authorize: el usuario no tiene fila en
	// user_branches para esta sucursal, aunque la sesión la traiga.
	f.newSession(userID, tenantID, branchID, "tok-explicit-unauthorized")

	ctx := ExtractSessionContextSecure(requestWithToken("tok-explicit-unauthorized"), restrictedDB)
	if ctx.Valid {
		t.Fatalf("esperaba Valid=false (sucursal no autorizada), obtuve Valid=true")
	}
	if ctx.Reason != SessionReasonBranchNotAuthorized {
		t.Errorf("esperaba Reason=%s, obtuve %s (Error=%s)", SessionReasonBranchNotAuthorized, ctx.Reason, ctx.Error)
	}
}

// TestExtractSessionContextSecure_NoBranch_NoneAuthorized: escenario 5.
func TestExtractSessionContextSecure_NoBranch_NoneAuthorized(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)
	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupBranchResolutionSchema(t, adminDB, restrictedRole)
	f := branchFixture{adminDB: adminDB, t: t}

	tenantID := f.newTenant("Tenant 5")
	userID := f.newUser("u5@test.local")
	// Ninguna sucursal creada ni autorizada para este usuario.
	f.newSession(userID, tenantID, "", "tok-none-authorized")

	ctx := ExtractSessionContextSecure(requestWithToken("tok-none-authorized"), restrictedDB)
	if ctx.Valid {
		t.Fatalf("esperaba Valid=false (sin sucursales autorizadas), obtuve Valid=true")
	}
	if ctx.Reason != SessionReasonNoBranchesAssigned {
		t.Errorf("esperaba Reason=%s, obtuve %s (Error=%s)", SessionReasonNoBranchesAssigned, ctx.Reason, ctx.Error)
	}
}

// TestRequireTenantTx_BranchSelectionRequired_Returns409 confirma que el
// middleware traduce la ambigüedad de sucursal a 409 con la lista de
// opciones, no a un 401 genérico.
func TestRequireTenantTx_BranchSelectionRequired_Returns409(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)
	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupBranchResolutionSchema(t, adminDB, restrictedRole)
	f := branchFixture{adminDB: adminDB, t: t}

	tenantID := f.newTenant("Tenant 409")
	branchA := f.newBranch(tenantID, "A")
	branchB := f.newBranch(tenantID, "B")
	userID := f.newUser("u409@test.local")
	f.authorize(userID, branchA)
	f.authorize(userID, branchB)
	f.newSession(userID, tenantID, "", "tok-409")

	handlerCalled := false
	handler := func(w http.ResponseWriter, r *http.Request) { handlerCalled = true }

	req := requestWithToken("tok-409")
	rec := httptest.NewRecorder()
	RequireTenantTx(restrictedDB, handler)(rec, req)

	if handlerCalled {
		t.Error("el handler no debería haberse invocado: la sesión es ambigua, la transacción no debió abrirse")
	}
	if rec.Code != http.StatusConflict {
		t.Errorf("esperaba 409, obtuve %d (body=%s)", rec.Code, rec.Body.String())
	}
}

// TestRequireTenantTx_NoBranchesAssigned_Returns403 confirma que un
// usuario sin ninguna sucursal autorizada recibe 403, no 401 (está
// autenticado, pero no autorizado para operar en este tenant).
func TestRequireTenantTx_NoBranchesAssigned_Returns403(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)
	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupBranchResolutionSchema(t, adminDB, restrictedRole)
	f := branchFixture{adminDB: adminDB, t: t}

	tenantID := f.newTenant("Tenant 403")
	userID := f.newUser("u403@test.local")
	f.newSession(userID, tenantID, "", "tok-403")

	handlerCalled := false
	handler := func(w http.ResponseWriter, r *http.Request) { handlerCalled = true }

	req := requestWithToken("tok-403")
	rec := httptest.NewRecorder()
	RequireTenantTx(restrictedDB, handler)(rec, req)

	if handlerCalled {
		t.Error("el handler no debería haberse invocado: el usuario no tiene sucursales autorizadas")
	}
	if rec.Code != http.StatusForbidden {
		t.Errorf("esperaba 403, obtuve %d (body=%s)", rec.Code, rec.Body.String())
	}
}
