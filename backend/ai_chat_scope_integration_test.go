//go:build integration
// +build integration

package main

// ============================================================
// PRUEBAS DE INTEGRACIÓN — alcance de `assets` en el contexto del
// asistente de IA (C-6, bloque ai_chat.go/duplicate_detector.go/
// import_upload_handlers.go, ronda 2026-08-07).
//
// Decisión explícita del usuario: el conteo de `assets` que ve el
// asistente de IA debe seguir el alcance real de la sesión (sucursal por
// defecto; tenant completo solo con app.branch_scope_all='true' vía rol
// autorizado), NUNCA ser tenant-wide por defecto solo para que coincida
// con el resto de las métricas del contexto (esas sí siguen siendo
// tenant-wide porque sus tablas no tienen RLS -- limitación temporal
// documentada, no una meta).
//
// A diferencia de branch_scope_all_integration_test.go (que usa una tabla
// sintética "widgets_branch_scoped" para no depender del esquema completo
// de DCIM), estas pruebas recrean una tabla `assets` real y llaman
// directamente a getTenantContext/resolveAssetScopeLabel -- exactamente
// el código que corre en producción. Esto es deliberado: la lección de
// esta misma ronda de auditoría fue que una política sintética que no
// coincide exactamente con la real (aunque tenga "la misma forma") puede
// dar falsa confianza si nunca se ejercita el nombre de tabla/función
// reales. Aquí sí se ejercitan.
//
// No se crean racks/nodes/switches/etc. (las otras 8 tablas que toca
// getTenantContext): esas consultas fallarán con "relation does not
// exist" dentro de la función, pero sus errores ya se descartan
// silenciosamente en el código original (mismo comportamiento que antes
// de esta migración) y sus contadores quedan en cero -- no hace falta
// recrear el esquema completo de DCIM para probar específicamente el
// comportamiento de `assets`, que es lo único que cambió.
// ============================================================

import (
	"context"
	"database/sql"
	"testing"
)

// setupAIChatAssetsSchema crea `tenants`, `branches` y `assets` mínimas
// (vía el rol admin, que bypassa RLS) con la misma política de
// migrations/016_assets_branch_scope_all.sql, y otorga al rol restringido
// exactamente los privilegios que skia_runtime tendría en producción.
func setupAIChatAssetsSchema(t *testing.T, adminDB *sql.DB, restrictedRole string) {
	t.Helper()
	ctx := context.Background()

	for _, tbl := range []string{"tickets", "floor_plans", "mdf_idf", "ups_pdus", "patch_panels", "switches", "nodes", "racks", "assets", "branches", "tenants"} {
		if _, err := adminDB.ExecContext(ctx, `DROP TABLE IF EXISTS `+tbl+` CASCADE`); err != nil {
			t.Fatalf("no se pudo limpiar %s: %v", tbl, err)
		}
	}
	stmts := []string{
		`CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL)`,
		`CREATE TABLE branches (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, name VARCHAR(255) NOT NULL)`,
		`CREATE TABLE assets (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, branch_id UUID, name VARCHAR(255) NOT NULL)`,
		`CREATE TABLE racks (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID)`,
		`CREATE TABLE nodes (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID, fluke_pdf TEXT, panduit_pdf TEXT)`,
		`CREATE TABLE switches (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID)`,
		`CREATE TABLE patch_panels (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID)`,
		`CREATE TABLE ups_pdus (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID)`,
		`CREATE TABLE mdf_idf (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID, type TEXT)`,
		`CREATE TABLE floor_plans (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID)`,
		`CREATE TABLE tickets (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID, status TEXT, priority TEXT)`,
	}
	for _, stmt := range stmts {
		if _, err := adminDB.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("no se pudo crear esquema (%s): %v", stmt, err)
		}
	}
	if _, err := adminDB.ExecContext(ctx, `ALTER TABLE assets ENABLE ROW LEVEL SECURITY`); err != nil {
		t.Fatalf("no se pudo habilitar RLS en assets: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `ALTER TABLE assets FORCE ROW LEVEL SECURITY`); err != nil {
		t.Fatalf("no se pudo forzar RLS en assets: %v", err)
	}
	// Misma forma exacta que migrations/016_assets_branch_scope_all.sql.
	if _, err := adminDB.ExecContext(ctx, `
		CREATE POLICY assets_tenant_branch_isolation ON assets
		USING (
			tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
			AND (
				branch_id IS NULL
				OR branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
				OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'
			)
		)
		WITH CHECK (
			tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
			AND (
				branch_id IS NULL
				OR branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
				OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'
			)
		)
	`); err != nil {
		t.Fatalf("no se pudo crear política RLS en assets: %v", err)
	}
	for _, tbl := range []string{"tenants", "branches", "assets", "racks", "nodes", "switches", "patch_panels", "ups_pdus", "mdf_idf", "floor_plans", "tickets"} {
		grant := `GRANT SELECT, INSERT, UPDATE, DELETE ON ` + tbl + ` TO "` + restrictedRole + `"`
		if _, err := adminDB.ExecContext(ctx, grant); err != nil {
			t.Fatalf("no se pudo otorgar privilegios sobre %s al rol restringido %q: %v", tbl, restrictedRole, err)
		}
	}
}

func seedAIChatAsset(t *testing.T, adminDB *sql.DB, tenantID, branchID, name string) {
	t.Helper()
	if _, err := adminDB.ExecContext(context.Background(),
		`INSERT INTO assets (tenant_id, branch_id, name) VALUES ($1,$2,$3)`,
		tenantID, branchID, name,
	); err != nil {
		t.Fatalf("no se pudo sembrar activo (branch=%s, name=%s): %v", branchID, name, err)
	}
}

// TestGetTenantContext_AssetsScope_BranchOnly: un usuario de sucursal
// (RequireTenantTxScoped con scopeAll=false, rol no autorizado) solo debe
// ver los activos de su propia sucursal en el contexto del asistente de
// IA -- igual que en RFID/dashboard.
func TestGetTenantContext_AssetsScope_BranchOnly(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	skipIfCanBypassRLS(t, restrictedDB)

	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupAIChatAssetsSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantID := "44444444-4444-4444-4444-444444444444"
	branchA := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaae"
	branchB := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbe"

	if _, err := adminDB.ExecContext(ctx, `INSERT INTO tenants (id, name) VALUES ($1, 'Tenant Chat A')`, tenantID); err != nil {
		t.Fatalf("no se pudo sembrar tenant: %v", err)
	}
	seedAIChatAsset(t, adminDB, tenantID, branchA, "a1")
	seedAIChatAsset(t, adminDB, tenantID, branchA, "a2")
	seedAIChatAsset(t, adminDB, tenantID, branchB, "b1")
	seedAIChatAsset(t, adminDB, tenantID, branchB, "b2")
	seedAIChatAsset(t, adminDB, tenantID, branchB, "b3")

	// Contexto: exactamente lo que RequireTenantTxScoped le da a un
	// usuario cuyo rol NO está en globalScopeRoles.
	tx, err := BeginTenantTx(ctx, restrictedDB, tenantID, branchA)
	if err != nil {
		t.Fatalf("BeginTenantTx: %v", err)
	}
	defer tx.Rollback()

	tc := getTenantContext(ctx, tx, tenantID)
	if tc.TotalActivos != 2 {
		t.Errorf("con contexto de sucursal A (sin scope_all), getTenantContext.TotalActivos esperaba 2, obtuvo %d -- el asistente de IA estaría filtrando mal o filtrando cruzado", tc.TotalActivos)
	}
}

// TestGetTenantContext_AssetsScope_ScopeAllSeesAllBranches: un rol
// autorizado (globalScopeRoles) debe ver el total del tenant.
func TestGetTenantContext_AssetsScope_ScopeAllSeesAllBranches(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	skipIfCanBypassRLS(t, restrictedDB)

	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupAIChatAssetsSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantID := "55555555-5555-5555-5555-555555555555"
	branchA := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaf"
	branchB := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbf"

	if _, err := adminDB.ExecContext(ctx, `INSERT INTO tenants (id, name) VALUES ($1, 'Tenant Chat B')`, tenantID); err != nil {
		t.Fatalf("no se pudo sembrar tenant: %v", err)
	}
	seedAIChatAsset(t, adminDB, tenantID, branchA, "a1")
	seedAIChatAsset(t, adminDB, tenantID, branchA, "a2")
	seedAIChatAsset(t, adminDB, tenantID, branchB, "b1")
	seedAIChatAsset(t, adminDB, tenantID, branchB, "b2")
	seedAIChatAsset(t, adminDB, tenantID, branchB, "b3")

	// Contexto: exactamente lo que RequireTenantTxScoped le da a un rol
	// en globalScopeRoles (hoy: "admin").
	tx, err := BeginTenantTxWithScope(ctx, restrictedDB, tenantID, branchA, true)
	if err != nil {
		t.Fatalf("BeginTenantTxWithScope: %v", err)
	}
	defer tx.Rollback()

	tc := getTenantContext(ctx, tx, tenantID)
	if tc.TotalActivos != 5 {
		t.Errorf("con branch_scope_all='true', getTenantContext.TotalActivos esperaba 5 (todo el tenant), obtuvo %d", tc.TotalActivos)
	}
}

// TestGetTenantContext_AssetsScope_NoBranchNoScopeAll_FailsClosed: sin
// sucursal ni alcance global, el conteo de activos debe ser cero, nunca
// el total del tenant por omisión.
func TestGetTenantContext_AssetsScope_NoBranchNoScopeAll_FailsClosed(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	skipIfCanBypassRLS(t, restrictedDB)

	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupAIChatAssetsSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantID := "66666666-6666-6666-6666-666666666666"
	branchA := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaf"

	if _, err := adminDB.ExecContext(ctx, `INSERT INTO tenants (id, name) VALUES ($1, 'Tenant Chat C')`, tenantID); err != nil {
		t.Fatalf("no se pudo sembrar tenant: %v", err)
	}
	seedAIChatAsset(t, adminDB, tenantID, branchA, "a1")

	tx, err := BeginTenantTx(ctx, restrictedDB, tenantID, "")
	if err != nil {
		t.Fatalf("BeginTenantTx: %v", err)
	}
	defer tx.Rollback()

	tc := getTenantContext(ctx, tx, tenantID)
	if tc.TotalActivos != 0 {
		t.Errorf("sin sucursal ni branch_scope_all, getTenantContext.TotalActivos esperaba 0 (fail-closed), obtuvo %d", tc.TotalActivos)
	}
}

// TestResolveAssetScopeLabel_ScopeAll: con scopeAll=true, la etiqueta
// siempre es "tenant completo" sin importar branchID.
func TestResolveAssetScopeLabel_ScopeAll(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)
	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)
	setupAIChatAssetsSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantID := "77777777-7777-7777-7777-777777777777"
	tx, err := BeginTenantTx(ctx, restrictedDB, tenantID, "")
	if err != nil {
		t.Fatalf("BeginTenantTx: %v", err)
	}
	defer tx.Rollback()

	label := resolveAssetScopeLabel(ctx, tx, "cualquier-cosa-se-ignora", true)
	if label != "tenant completo" {
		t.Errorf("con scopeAll=true esperaba 'tenant completo', obtuve %q", label)
	}
}

// TestResolveAssetScopeLabel_EmptyBranch: sin sucursal ni scope_all, la
// etiqueta debe declarar explícitamente la ausencia de alcance, nunca
// inventar un "tenant completo" implícito.
func TestResolveAssetScopeLabel_EmptyBranch(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)
	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)
	setupAIChatAssetsSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantID := "88888888-8888-8888-8888-888888888888"
	tx, err := BeginTenantTx(ctx, restrictedDB, tenantID, "")
	if err != nil {
		t.Fatalf("BeginTenantTx: %v", err)
	}
	defer tx.Rollback()

	label := resolveAssetScopeLabel(ctx, tx, "", false)
	if label != "sin sucursal asignada" {
		t.Errorf("con branchID vacío y scopeAll=false esperaba 'sin sucursal asignada', obtuve %q", label)
	}
}

// TestResolveAssetScopeLabel_KnownBranch: con una sucursal real, la
// etiqueta debe incluir su nombre.
func TestResolveAssetScopeLabel_KnownBranch(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)
	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)
	setupAIChatAssetsSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantID := "99999999-9999-9999-9999-999999999999"
	branchID := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaf"

	if _, err := adminDB.ExecContext(ctx, `INSERT INTO tenants (id, name) VALUES ($1, 'Tenant Chat D')`, tenantID); err != nil {
		t.Fatalf("no se pudo sembrar tenant: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `INSERT INTO branches (id, tenant_id, name) VALUES ($1,$2,$3)`, branchID, tenantID, "Norte"); err != nil {
		t.Fatalf("no se pudo sembrar sucursal: %v", err)
	}

	tx, err := BeginTenantTx(ctx, restrictedDB, tenantID, branchID)
	if err != nil {
		t.Fatalf("BeginTenantTx: %v", err)
	}
	defer tx.Rollback()

	label := resolveAssetScopeLabel(ctx, tx, branchID, false)
	if label != "sucursal Norte" {
		t.Errorf("esperaba 'sucursal Norte', obtuve %q", label)
	}
}

// TestResolveAssetScopeLabel_UnknownBranch: un branchID que no existe en
// `branches` (caso borde -- no debería ocurrir si ExtractSessionContextSecure
// ya lo validó, pero la función no debe asumir eso ciegamente) debe
// devolver una etiqueta explícita de "no identificada", nunca un string
// vacío ni un pánico.
func TestResolveAssetScopeLabel_UnknownBranch(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)
	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)
	setupAIChatAssetsSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantID := "aaaaaaaa-0000-0000-0000-000000000000"
	fakeBranchID := "ffffffff-ffff-ffff-ffff-ffffffffffff"

	tx, err := BeginTenantTx(ctx, restrictedDB, tenantID, "")
	if err != nil {
		t.Fatalf("BeginTenantTx: %v", err)
	}
	defer tx.Rollback()

	label := resolveAssetScopeLabel(ctx, tx, fakeBranchID, false)
	if label != "sucursal no identificada" {
		t.Errorf("con branchID inexistente esperaba 'sucursal no identificada', obtuve %q", label)
	}
}
