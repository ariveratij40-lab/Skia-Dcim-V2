//go:build integration
// +build integration

package main

// ============================================================
// PRUEBAS DE INTEGRACIÓN — alcance explícito "todas las sucursales"
// (app.branch_scope_all) para la política real de `assets` (C-6, ronda
// 2026-08-07).
//
// La política real es tenant+sucursal:
//   tenant_id = app.tenant_id
//   AND (branch_id IS NULL OR branch_id = app.branch_id
//        OR app.branch_scope_all = 'true')
//
// Usa una tabla sintética propia ("widgets_branch_scoped"), no "assets",
// para no depender del esquema completo de DCIM. Reproduce exactamente la
// misma forma de política que migrations/016_assets_branch_scope_all.sql,
// más una función SECURITY DEFINER equivalente a
// assets_count_in_location_all_branches para probar la guardia de
// integridad del borrado de ubicaciones.
//
// Los 6 escenarios pedidos explícitamente antes de continuar la migración
// de HandleRFID/dashboard.go/HandleLocationsManage:
//   1. Sin branch_scope_all, un contexto de sucursal A no ve filas de
//      sucursal B (equivalente: RFID cruzado da 404 para usuario de
//      sucursal).
//   2. Con branch_scope_all='true', sí se ven filas de cualquier
//      sucursal del tenant (equivalente: RFID cruzado funciona para
//      admin autorizado).
//   3. Un conteo agregado con contexto de sucursal A solo cuenta filas
//      de A (equivalente: dashboard de sucursal).
//   4. Un conteo agregado con branch_scope_all cuenta todas las
//      sucursales del tenant (equivalente: dashboard administrativo).
//   5. La función SECURITY DEFINER ve activos de TODAS las sucursales
//      sin importar el contexto de sesión de quien la invoca -- ningún
//      rol puede "esconder" activos de otra sucursal de la guardia de
//      integridad.
//   6. Sin branch_id NI branch_scope_all seteados, la consulta sigue
//      fallando cerrada (0 filas), no un error.
// ============================================================

import (
	"context"
	"database/sql"
	"testing"
)

// setupBranchScopedSchema crea la tabla sintética y su política (vía el
// rol admin, que bypassa RLS) y otorga al rol restringido exactamente lo
// que necesitaría skia_runtime en producción: privilegios de tabla más
// EXECUTE sobre la función SECURITY DEFINER (nunca el resto de la
// jerarquía de esa función).
func setupBranchScopedSchema(t *testing.T, adminDB *sql.DB, restrictedRole string) {
	t.Helper()
	ctx := context.Background()

	if _, err := adminDB.ExecContext(ctx, `DROP TABLE IF EXISTS widgets_branch_scoped CASCADE`); err != nil {
		t.Fatalf("no se pudo limpiar widgets_branch_scoped: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `
		CREATE TABLE widgets_branch_scoped (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			tenant_id UUID NOT NULL,
			branch_id UUID,
			name VARCHAR(255) NOT NULL
		)`); err != nil {
		t.Fatalf("no se pudo crear widgets_branch_scoped: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `ALTER TABLE widgets_branch_scoped ENABLE ROW LEVEL SECURITY`); err != nil {
		t.Fatalf("no se pudo habilitar RLS: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `ALTER TABLE widgets_branch_scoped FORCE ROW LEVEL SECURITY`); err != nil {
		t.Fatalf("no se pudo forzar RLS: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `DROP POLICY IF EXISTS widgets_branch_scoped_isolation ON widgets_branch_scoped`); err != nil {
		t.Fatalf("no se pudo limpiar política previa: %v", err)
	}
	// Misma forma exacta que migrations/016_assets_branch_scope_all.sql.
	if _, err := adminDB.ExecContext(ctx, `
		CREATE POLICY widgets_branch_scoped_isolation ON widgets_branch_scoped
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
		t.Fatalf("no se pudo crear política RLS: %v", err)
	}
	grant := `GRANT SELECT, INSERT, UPDATE, DELETE ON widgets_branch_scoped TO "` + restrictedRole + `"`
	if _, err := adminDB.ExecContext(ctx, grant); err != nil {
		t.Fatalf("no se pudo otorgar privilegios sobre widgets_branch_scoped al rol restringido %q: %v", restrictedRole, err)
	}

	// Función SECURITY DEFINER equivalente a
	// assets_count_in_location_all_branches, para probar la guardia de
	// integridad (escenario 5). Se crea con el rol admin (BYPASSRLS), así
	// que su dueño automáticamente puede evadir RLS -- igual que en la
	// migración real.
	if _, err := adminDB.ExecContext(ctx, `DROP FUNCTION IF EXISTS widgets_branch_scoped_count_all_branches(uuid)`); err != nil {
		t.Fatalf("no se pudo limpiar función previa: %v", err)
	}
	if _, err := adminDB.ExecContext(ctx, `
		CREATE FUNCTION widgets_branch_scoped_count_all_branches(p_tenant_id uuid)
		RETURNS bigint
		LANGUAGE sql
		SECURITY DEFINER
		SET search_path = public
		AS $func$
			SELECT COUNT(*) FROM widgets_branch_scoped WHERE tenant_id = p_tenant_id;
		$func$
	`); err != nil {
		t.Fatalf("no se pudo crear función SECURITY DEFINER de prueba: %v", err)
	}
	grantFn := `GRANT EXECUTE ON FUNCTION widgets_branch_scoped_count_all_branches(uuid) TO "` + restrictedRole + `"`
	if _, err := adminDB.ExecContext(ctx, grantFn); err != nil {
		t.Fatalf("no se pudo otorgar EXECUTE sobre la función de prueba al rol restringido %q: %v", restrictedRole, err)
	}
}

// TestBranchScopeAll_WithoutFlag_OnlySeesOwnBranch: escenarios 1 y 3
// (equivalente RFID/dashboard de sucursal).
func TestBranchScopeAll_WithoutFlag_OnlySeesOwnBranch(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	skipIfCanBypassRLS(t, restrictedDB)

	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupBranchScopedSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantID := "11111111-1111-1111-1111-111111111111"
	branchA := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	branchB := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

	// Siembra vía rol admin (bypassa RLS): 2 filas en A, 3 en B.
	seed := func(branchID, name string) {
		if _, err := adminDB.ExecContext(ctx,
			`INSERT INTO widgets_branch_scoped (tenant_id, branch_id, name) VALUES ($1,$2,$3)`,
			tenantID, branchID, name,
		); err != nil {
			t.Fatalf("no se pudo sembrar widget (branch=%s, name=%s): %v", branchID, name, err)
		}
	}
	seed(branchA, "a1")
	seed(branchA, "a2")
	seed(branchB, "b1")
	seed(branchB, "b2")
	seed(branchB, "b3")

	// Contexto: tenant + sucursal A, SIN branch_scope_all -- exactamente
	// lo que RequireTenantTx (no Scoped) le daría a un usuario operativo.
	tx, err := BeginTenantTx(ctx, restrictedDB, tenantID, branchA)
	if err != nil {
		t.Fatalf("BeginTenantTx: %v", err)
	}
	defer tx.Rollback()

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM widgets_branch_scoped WHERE tenant_id = $1`, tenantID).Scan(&count); err != nil {
		t.Fatalf("consulta no debería fallar: %v", err)
	}
	if count != 2 {
		t.Errorf("con contexto de sucursal A (sin scope_all) se esperaban 2 filas (solo las propias), se obtuvieron %d -- una fuga cross-sucursal o un undercount indican que la política no se comporta como se espera", count)
	}
}

// TestBranchScopeAll_WithFlag_SeesAllBranches: escenarios 2 y 4
// (equivalente RFID/dashboard administrativo).
func TestBranchScopeAll_WithFlag_SeesAllBranches(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	skipIfCanBypassRLS(t, restrictedDB)

	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupBranchScopedSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantID := "22222222-2222-2222-2222-222222222222"
	branchA := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab"
	branchB := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc"

	seed := func(branchID, name string) {
		if _, err := adminDB.ExecContext(ctx,
			`INSERT INTO widgets_branch_scoped (tenant_id, branch_id, name) VALUES ($1,$2,$3)`,
			tenantID, branchID, name,
		); err != nil {
			t.Fatalf("no se pudo sembrar widget (branch=%s, name=%s): %v", branchID, name, err)
		}
	}
	seed(branchA, "a1")
	seed(branchA, "a2")
	seed(branchB, "b1")
	seed(branchB, "b2")
	seed(branchB, "b3")

	// Contexto: tenant + sucursal A, CON branch_scope_all='true' --
	// exactamente lo que RequireTenantTxScoped le daría a un rol en
	// globalScopeRoles (hoy: "admin").
	tx, err := BeginTenantTxWithScope(ctx, restrictedDB, tenantID, branchA, true)
	if err != nil {
		t.Fatalf("BeginTenantTxWithScope: %v", err)
	}
	defer tx.Rollback()

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM widgets_branch_scoped WHERE tenant_id = $1`, tenantID).Scan(&count); err != nil {
		t.Fatalf("consulta no debería fallar: %v", err)
	}
	if count != 5 {
		t.Errorf("con branch_scope_all='true' se esperaban las 5 filas de ambas sucursales, se obtuvieron %d", count)
	}
}

// TestBranchScopeAll_SecurityDefinerFunction_SeesAllBranchesRegardlessOfCallerContext:
// escenario 5 (guardia de integridad del borrado de ubicaciones).
func TestBranchScopeAll_SecurityDefinerFunction_SeesAllBranchesRegardlessOfCallerContext(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	skipIfCanBypassRLS(t, restrictedDB)

	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupBranchScopedSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantID := "33333333-3333-3333-3333-333333333333"
	branchA := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaad"
	branchB := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd"

	seed := func(branchID, name string) {
		if _, err := adminDB.ExecContext(ctx,
			`INSERT INTO widgets_branch_scoped (tenant_id, branch_id, name) VALUES ($1,$2,$3)`,
			tenantID, branchID, name,
		); err != nil {
			t.Fatalf("no se pudo sembrar widget (branch=%s, name=%s): %v", branchID, name, err)
		}
	}
	seed(branchA, "a1")
	seed(branchB, "b1")
	seed(branchB, "b2")

	// Deliberadamente un contexto de OPERADOR NORMAL (sucursal A, SIN
	// branch_scope_all) -- exactamente lo que cualquier rol tendría al
	// pedir el borrado. La función debe ver las 3 filas de todas formas,
	// porque SECURITY DEFINER corre con los privilegios de su dueño, no
	// del contexto de sesión de quien la invoca.
	tx, err := BeginTenantTx(ctx, restrictedDB, tenantID, branchA)
	if err != nil {
		t.Fatalf("BeginTenantTx: %v", err)
	}
	defer tx.Rollback()

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT widgets_branch_scoped_count_all_branches($1)`, tenantID).Scan(&count); err != nil {
		t.Fatalf("la función SECURITY DEFINER no debería fallar: %v", err)
	}
	if count != 3 {
		t.Errorf("la guardia de integridad debe ver TODAS las sucursales sin importar el contexto del llamador: se esperaban 3 filas, se obtuvieron %d -- si es menor a 3, un rol podría borrar algo que todavía está en uso en otra sucursal", count)
	}
}

// TestBranchScopeAll_NoBranchNoScopeAll_FailsClosed: escenario 6.
func TestBranchScopeAll_NoBranchNoScopeAll_FailsClosed(t *testing.T) {
	restrictedDB := getTestDB(t)
	defer restrictedDB.Close()
	skipIfCanBypassRLS(t, restrictedDB)

	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	restrictedRole := currentRole(t, restrictedDB)
	requireDistinctRoles(t, currentRole(t, adminDB), restrictedRole)

	setupBranchScopedSchema(t, adminDB, restrictedRole)

	ctx := context.Background()
	tenantID := "44444444-4444-4444-4444-444444444444"
	branchA := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaae"

	if _, err := adminDB.ExecContext(ctx,
		`INSERT INTO widgets_branch_scoped (tenant_id, branch_id, name) VALUES ($1,$2,'a1')`,
		tenantID, branchA,
	); err != nil {
		t.Fatalf("no se pudo sembrar widget: %v", err)
	}

	// BeginTenantTx con branchID="" y sin scope_all -- ni app.branch_id ni
	// app.branch_scope_all quedan seteados. Debe seguir fallando cerrado:
	// 0 filas, no un error, y sobre todo NUNCA las filas con sucursal
	// asignada de otra parte.
	tx, err := BeginTenantTx(ctx, restrictedDB, tenantID, "")
	if err != nil {
		t.Fatalf("BeginTenantTx no debería fallar solo por branchID vacío: %v", err)
	}
	defer tx.Rollback()

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM widgets_branch_scoped WHERE tenant_id = $1`, tenantID).Scan(&count); err != nil {
		t.Fatalf("la consulta no debería fallar con error, debería devolver 0 filas: %v", err)
	}
	if count != 0 {
		t.Errorf("fail-closed roto: sin app.branch_id ni app.branch_scope_all seteados se vieron %d filas, se esperaban 0", count)
	}
}
