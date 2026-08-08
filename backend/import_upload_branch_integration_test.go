//go:build integration
// +build integration

package main

// ============================================================
// PRUEBA DE INTEGRACIÓN — corrección del bug Crítico de branch_id
// hardcodeado en processImportFileAsync (import_upload_handlers.go,
// C-6, ronda 2026-08-07).
//
// Antes de esta corrección, TODO activo importado por CUALQUIER
// tenant/usuario quedaba insertado con
// branch_id='550e8400-e29b-41d4-a716-446655440201' (la sucursal "Sede
// Principal - Miami" del tenant semilla original, migrations/002_seed.sql)
// sin importar la sucursal real de la sesión -- corrupción de datos activa
// independientemente de RLS. La corrección hace que processImportFileAsync
// reciba branchID como parámetro explícito (propagado desde
// session.BranchID, ya validado por ExtractSessionContextSecure) y lo use
// en cada INSERT INTO assets, sin ningún valor por defecto.
//
// Esta prueba llama directamente a processImportFileAsync (no simula HTTP
// completo -- no hay parser CSV real, ver nota en parseCSVSimple) con un
// archivo .xlsx mínimo construido con excelize (ya es dependencia del
// proyecto), y confirma que el activo resultante en `assets` queda en la
// sucursal pasada explícitamente -- NUNCA en el UUID viejo hardcodeado.
//
// processImportFileAsync usa la variable global `db` (no recibe una
// conexión como parámetro) -- se le asigna la conexión admin de pruebas
// antes de llamar, siguiendo el mismo patrón ya usado en
// admin_users_rbac_test.go / tenant_middleware_integration_test.go. Se
// usa la conexión ADMIN (no la restringida) porque esta función todavía
// no abre ninguna transacción con contexto de tenant (RLS) -- eso es
// trabajo pendiente, deliberadamente pospuesto por el usuario hasta
// después de validar y corregir este bug de datos.
// ============================================================

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"github.com/xuri/excelize/v2"
)

const oldHardcodedBranchID = "550e8400-e29b-41d4-a716-446655440201"

// setupImportUploadSchema crea versiones mínimas de import_jobs,
// import_items y assets -- solo las columnas que
// processImportFileAsync/updateImportJobProgress/updateImportJobError
// realmente tocan.
func setupImportUploadSchema(t *testing.T, adminDB *sql.DB) {
	t.Helper()
	ctx := context.Background()
	for _, tbl := range []string{"import_items", "assets", "import_jobs"} {
		if _, err := adminDB.ExecContext(ctx, `DROP TABLE IF EXISTS `+tbl+` CASCADE`); err != nil {
			t.Fatalf("no se pudo limpiar %s: %v", tbl, err)
		}
	}
	stmts := []string{
		`CREATE TABLE import_jobs (
			id BIGSERIAL PRIMARY KEY,
			job_uuid VARCHAR(255),
			tenant_id UUID NOT NULL,
			user_id UUID,
			branch_id UUID,
			file_name VARCHAR(255),
			file_type VARCHAR(50),
			status VARCHAR(50) NOT NULL DEFAULT 'parsing',
			progress INT NOT NULL DEFAULT 0,
			message TEXT,
			result_json JSONB,
			items_extracted INT NOT NULL DEFAULT 0,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE import_items (
			id BIGSERIAL PRIMARY KEY,
			import_job_id BIGINT NOT NULL,
			tenant_id UUID NOT NULL,
			name VARCHAR(255),
			ip_address VARCHAR(64),
			mac_address VARCHAR(64),
			model VARCHAR(255),
			brand VARCHAR(255),
			serial_number VARCHAR(255),
			location VARCHAR(255),
			category VARCHAR(50),
			confidence_score NUMERIC
		)`,
		`CREATE TABLE assets (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			tenant_id UUID NOT NULL,
			branch_id UUID,
			asset_type_id UUID,
			internal_code VARCHAR(255),
			name VARCHAR(255),
			serial_number VARCHAR(255),
			model VARCHAR(255),
			manufacturer VARCHAR(255),
			status VARCHAR(50),
			observations TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
	}
	for _, stmt := range stmts {
		if _, err := adminDB.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("no se pudo crear esquema (%s): %v", stmt, err)
		}
	}
}

// makeTestXLSX crea un .xlsx mínimo con una fila (name, ip) -- el formato
// que parseExcelSimple espera (row[0]=name, row[1]=ip).
func makeTestXLSX(t *testing.T, name, ip string) string {
	t.Helper()
	f := excelize.NewFile()
	sheet := f.GetSheetName(0)
	if err := f.SetCellValue(sheet, "A1", name); err != nil {
		t.Fatalf("no se pudo escribir celda A1: %v", err)
	}
	if err := f.SetCellValue(sheet, "B1", ip); err != nil {
		t.Fatalf("no se pudo escribir celda B1: %v", err)
	}
	path := "/tmp/test-import-" + name + ".xlsx"
	if err := f.SaveAs(path); err != nil {
		t.Fatalf("no se pudo guardar xlsx de prueba: %v", err)
	}
	t.Cleanup(func() { os.Remove(path) })
	return path
}

// insertTestImportJob crea la fila de import_jobs que processImportFileAsync
// espera poder actualizar (progress/status) durante su ejecución.
func insertTestImportJob(t *testing.T, adminDB *sql.DB, tenantID, branchID string) int64 {
	t.Helper()
	var id int64
	err := adminDB.QueryRowContext(context.Background(), `
		INSERT INTO import_jobs (job_uuid, tenant_id, branch_id, file_name, file_type, status, progress, message, created_at)
		VALUES ('test-job', $1, $2, 'test.xlsx', 'excel', 'parsing', 10, 'Iniciando...', NOW())
		RETURNING id
	`, tenantID, func() interface{} {
		if branchID == "" {
			return nil
		}
		return branchID
	}()).Scan(&id)
	if err != nil {
		t.Fatalf("no se pudo crear import_job de prueba: %v", err)
	}
	return id
}

// withGlobalTestDB asigna temporalmente la variable global `db` (la que
// usa processImportFileAsync internamente) y la restaura al terminar --
// mismo patrón que admin_users_rbac_test.go/tenant_middleware_integration_test.go.
func withGlobalTestDB(t *testing.T, testDB *sql.DB) {
	t.Helper()
	original := db
	db = testDB
	t.Cleanup(func() { db = original })
}

// TestProcessImportFileAsync_UsesRealSessionBranch_NotHardcodedUUID:
// escenario principal del fix -- un import con branch_id explícito de
// sucursal A debe dejar el activo en la sucursal A, nunca en el UUID
// viejo hardcodeado.
func TestProcessImportFileAsync_UsesRealSessionBranch_NotHardcodedUUID(t *testing.T) {
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	setupImportUploadSchema(t, adminDB)
	withGlobalTestDB(t, adminDB)

	tenantID := "11111111-2222-3333-4444-555555555555"
	branchNorte := "66666666-7777-8888-9999-000000000001"

	dbJobID := insertTestImportJob(t, adminDB, tenantID, branchNorte)
	xlsxPath := makeTestXLSX(t, "ActivoNorte", "10.0.0.9")

	processImportFileAsync(dbJobID, xlsxPath, "test.xlsx", tenantID, branchNorte, "test-job-uuid")

	var count int
	var gotBranchID string
	err := adminDB.QueryRowContext(context.Background(),
		`SELECT COUNT(*), COALESCE(MAX(branch_id::text), '') FROM assets WHERE tenant_id = $1`,
		tenantID,
	).Scan(&count, &gotBranchID)
	if err != nil {
		t.Fatalf("no se pudo consultar assets: %v", err)
	}
	if count != 1 {
		t.Fatalf("esperaba exactamente 1 activo insertado, encontré %d", count)
	}
	if gotBranchID != branchNorte {
		t.Errorf("branch_id del activo importado: esperaba %q (sucursal real de la sesión), obtuve %q", branchNorte, gotBranchID)
	}
	if gotBranchID == oldHardcodedBranchID {
		t.Errorf("REGRESIÓN: el activo quedó asignado al UUID viejo hardcodeado (%s) -- el fix no está aplicado", oldHardcodedBranchID)
	}
}

// TestProcessImportFileAsync_DifferentBranch_AssetLandsThere: repite el
// mismo flujo con una sucursal distinta, para confirmar que el valor
// realmente se propaga (no es una coincidencia de un solo caso) --
// "una prueba que importe con una sucursal distinta y confirme que el
// activo queda en ella", pedido explícito del usuario.
func TestProcessImportFileAsync_DifferentBranch_AssetLandsThere(t *testing.T) {
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	setupImportUploadSchema(t, adminDB)
	withGlobalTestDB(t, adminDB)

	tenantID := "22222222-3333-4444-5555-666666666666"
	branchSur := "77777777-8888-9999-0000-000000000002"

	dbJobID := insertTestImportJob(t, adminDB, tenantID, branchSur)
	xlsxPath := makeTestXLSX(t, "ActivoSur", "10.0.0.10")

	processImportFileAsync(dbJobID, xlsxPath, "test.xlsx", tenantID, branchSur, "test-job-uuid-2")

	var gotBranchID string
	err := adminDB.QueryRowContext(context.Background(),
		`SELECT branch_id::text FROM assets WHERE tenant_id = $1`,
		tenantID,
	).Scan(&gotBranchID)
	if err != nil {
		t.Fatalf("no se pudo consultar el activo importado: %v", err)
	}
	if gotBranchID != branchSur {
		t.Errorf("con sucursal Sur, esperaba branch_id=%q, obtuve %q", branchSur, gotBranchID)
	}
}

// TestProcessImportFileAsync_EmptyBranchID_RejectsJob_NoAssetCreated:
// escenario de rechazo -- sin branch_id, el job debe fallar
// explícitamente y NO debe crearse ningún activo (nunca un valor por
// defecto silencioso).
func TestProcessImportFileAsync_EmptyBranchID_RejectsJob_NoAssetCreated(t *testing.T) {
	adminDB := getAdminTestDB(t)
	defer adminDB.Close()
	requireCanBypassRLS(t, adminDB)

	setupImportUploadSchema(t, adminDB)
	withGlobalTestDB(t, adminDB)

	tenantID := "33333333-4444-5555-6666-777777777777"

	dbJobID := insertTestImportJob(t, adminDB, tenantID, "")
	xlsxPath := makeTestXLSX(t, "ActivoSinSucursal", "10.0.0.11")

	processImportFileAsync(dbJobID, xlsxPath, "test.xlsx", tenantID, "", "test-job-uuid-3")

	var count int
	if err := adminDB.QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM assets WHERE tenant_id = $1`, tenantID,
	).Scan(&count); err != nil {
		t.Fatalf("no se pudo consultar assets: %v", err)
	}
	if count != 0 {
		t.Errorf("sin branch_id, esperaba 0 activos insertados (job rechazado), encontré %d", count)
	}

	var status, message string
	if err := adminDB.QueryRowContext(context.Background(),
		`SELECT status, message FROM import_jobs WHERE id = $1`, dbJobID,
	).Scan(&status, &message); err != nil {
		t.Fatalf("no se pudo consultar el job: %v", err)
	}
	if status != "error" {
		t.Errorf("sin branch_id, esperaba status='error' en el job, obtuve %q (mensaje: %q)", status, message)
	}
}
