package main

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

// ============================================================
// PRUEBAS DEL DISPATCHER
// ============================================================

// TestHandleInventoryImportRoutes_DetailValid prueba GET /{id} válido
func TestHandleInventoryImportRoutes_DetailValid(t *testing.T) {
	// El handler autentica y consulta el inventario mediante el *sql.DB global
	// que main inicializa en runtime. La prueba debe proporcionar esa misma
	// dependencia; FakeSessionStore no participa en este flujo seguro.
	mockDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	previousDB := db
	db = mockDB
	t.Cleanup(func() {
		db = previousDB
		mockDB.Close()
	})

	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT s.user_id, s.tenant_id, s.branch_id, u.email
		FROM sessions s
		JOIN users u ON s.user_id = u.id
		WHERE s.token = $1 AND s.expires_at > $2
		LIMIT 1
	`)).WithArgs("test-session", sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "tenant_id", "branch_id", "email"}).
			AddRow("user-1", "tenant-1", "branch-1", "user@example.com"))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT EXISTS(SELECT 1 FROM tenants WHERE id = $1)")).
		WithArgs("tenant-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT EXISTS(
				SELECT 1 FROM branches b
				JOIN user_branches ub ON ub.branch_id = b.id
				WHERE b.id = $1 AND b.tenant_id = $2 AND b.status = 'active' AND ub.user_id = $3
			)`)).WithArgs("branch-1", "tenant-1", "user-1").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery("FROM inventory_imports").WithArgs("1", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "filename", "file_type", "status", "total_rows", "valid_rows",
			"error_rows", "duplicate_rows", "created_at", "updated_at",
		}).AddRow("1", "inventory.csv", "csv", "staging", 10, 10, 0, 0, time.Now(), time.Now()))
	mock.ExpectQuery("FROM import_errors").WithArgs("1", "tenant-1").
		WillReturnRows(sqlmock.NewRows([]string{"error_message"}))

	// Crear request
	req := httptest.NewRequest("GET", "/api/import/inventory/1", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: "test-session",
	})

	// Ejecutar handler
	w := httptest.NewRecorder()
	handleInventoryImportRoutes(w, req)

	// Verificar respuesta
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	if w.Header().Get("Content-Type") != "application/json" {
		t.Errorf("Expected JSON content type, got %s", w.Header().Get("Content-Type"))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet SQL expectations: %v", err)
	}
}

// TestHandleInventoryImportRoutes_RowsValid prueba GET /{id}/rows válido
func TestHandleInventoryImportRoutes_RowsValid(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	expectInventoryRouteSession(mock, "test-session", "user-1", "tenant-1", "branch-1")
	mock.ExpectQuery("FROM inventory_import_rows").
		WithArgs("1", "tenant-1", "branch-1", 50, 0).
		WillReturnRows(sqlmock.NewRows([]string{"id", "row_number", "status", "data", "error_message", "created_at"}).
			AddRow("10", 1, "valid", `{\"serial_number\":\"TEST-001\"}`, nil, time.Now()))
	w := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/1/rows", "test-session")

	// Verificar respuesta
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_CommitNotImplemented prueba POST /{id}/commit (501)
func TestHandleInventoryImportRoutes_CommitNotImplemented(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	expectInventoryRouteSession(mock, "test-session", "user-1", "tenant-1", "branch-1")
	w := runInventoryRouteTest(t, http.MethodPost, "/api/import/inventory/1/commit", "test-session")

	// Verificar respuesta 501
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Expected status 501, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_InvalidID prueba ID inválido
func TestHandleInventoryImportRoutes_InvalidID(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	expectInventoryRouteSession(mock, "test-session", "user-1", "tenant-1", "branch-1")
	w := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/invalid-id", "test-session")

	// Verificar respuesta 400
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_EmptyPath prueba ruta vacía
func TestHandleInventoryImportRoutes_EmptyPath(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	expectInventoryRouteSession(mock, "test-session", "user-1", "tenant-1", "branch-1")
	w := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/", "test-session")

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_UnknownRoute prueba ruta desconocida
func TestHandleInventoryImportRoutes_UnknownRoute(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	expectInventoryRouteSession(mock, "test-session", "user-1", "tenant-1", "branch-1")
	w := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/1/unknown", "test-session")

	// Verificar respuesta 404
	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_NoSession prueba sin sesión
func TestHandleInventoryImportRoutes_NoSession(t *testing.T) {
	installInventoryRouteDBMock(t)
	w := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/1", "")

	// Verificar respuesta 401
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}
}

// PermissionCatalogAbsenceDoesNotGateRoute documents the current approved
// contract: this dispatcher validates session/tenant/branch, but does not
// consult inventory.import.read.
func TestHandleInventoryImportRoutes_PermissionCatalogAbsenceDoesNotGateRoute(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	expectInventoryRouteSession(mock, "test-session", "user-1", "tenant-1", "branch-1")
	expectInventoryDetailFound(mock, "1", "tenant-1", "branch-1")
	w := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/1", "test-session")
	if w.Code != http.StatusOK {
		t.Errorf("Expected current DB-backed contract to return 200, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_WrongMethod prueba método incorrecto
func TestHandleInventoryImportRoutes_WrongMethod(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	expectInventoryRouteSession(mock, "test-session", "user-1", "tenant-1", "branch-1")
	w := runInventoryRouteTest(t, http.MethodPost, "/api/import/inventory/1", "test-session")

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected status 405, got %d", w.Code)
	}
}

// ============================================================
// PRUEBAS DE VALIDACIÓN
// ============================================================

// ============================================================
// TestValidateImportIDFormat_Valid prueba ID numérico válido
func TestValidateImportIDFormat_Valid(t *testing.T) {
	err := validateImportIDFormat("123")
	if err != nil {
		t.Errorf("expected no error for valid numeric import ID, got %v", err)
	}
}

// TestValidateImportIDFormat_ValidLarge prueba ID numérico grande (BIGINT)
func TestValidateImportIDFormat_ValidLarge(t *testing.T) {
	err := validateImportIDFormat("9223372036854775807")
	if err != nil {
		t.Errorf("expected no error for valid large numeric import ID, got %v", err)
	}
}

// TestValidateImportIDFormat_Invalid prueba ID inválido
func TestValidateImportIDFormat_Invalid(t *testing.T) {
	err := validateImportIDFormat("invalid-id")
	if err == nil {
		t.Errorf("expected error for invalid import ID, got nil")
	}
}

// TestValidateImportIDFormat_Empty prueba ID vacío
func TestValidateImportIDFormat_Empty(t *testing.T) {
	err := validateImportIDFormat("")
	if err == nil {
		t.Errorf("expected error for empty import ID, got nil")
	}
}

// TestValidateImportIDFormat_UUIDRejected prueba que UUID es rechazado
func TestValidateImportIDFormat_UUIDRejected(t *testing.T) {
	err := validateImportIDFormat("550e8400-e29b-41d4-a716-446655440000")
	if err == nil {
		t.Errorf("expected error for UUID import ID, got nil")
	}
}

// TestValidateImportIDFormat_Float prueba que números decimales son rechazados
func TestValidateImportIDFormat_Float(t *testing.T) {
	err := validateImportIDFormat("12.5")
	if err == nil {
		t.Errorf("expected error for float import ID, got nil")
	}
}

// TestValidateImportIDFormat_Scientific prueba que notación científica es rechazada
func TestValidateImportIDFormat_Scientific(t *testing.T) {
	err := validateImportIDFormat("1e5")
	if err == nil {
		t.Errorf("expected error for scientific notation import ID, got nil")
	}
}

// TestValidateImportIDFormat_WithSpaces prueba que espacios son rechazados
func TestValidateImportIDFormat_WithSpaces(t *testing.T) {
	err := validateImportIDFormat(" 123 ")
	if err == nil {
		t.Errorf("expected error for import ID with spaces, got nil")
	}
}

// ============================================================

// ============================================================
// PRUEBAS DE AISLAMIENTO MULTI-TENANT
// ============================================================

// TestMultiTenantIsolation_DifferentBranches prueba aislamiento entre sucursales
func TestMultiTenantIsolation_DifferentBranches(t *testing.T) {
	mock := installInventoryRouteDBMock(t)

	// Cada sesión se resuelve por el mismo contrato DB-backed y la consulta
	// permanece limitada a su branch. El mock simula que el ID pedido solo
	// existe en la otra branch, por lo que ambos intentos deben ocultarse.
	expectInventoryRouteSession(mock, "branch-1-session", "user-1", "tenant-1", "branch-1")
	mock.ExpectQuery("FROM inventory_imports").WithArgs("2", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows(inventoryImportTestColumns))
	if got := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/2", "branch-1-session").Code; got != http.StatusNotFound {
		t.Fatalf("branch-1 cross-branch lookup: expected 404, got %d", got)
	}

	expectInventoryRouteSession(mock, "branch-2-session", "user-2", "tenant-1", "branch-2")
	mock.ExpectQuery("FROM inventory_imports").WithArgs("1", "tenant-1", "branch-2").
		WillReturnRows(sqlmock.NewRows(inventoryImportTestColumns))
	if got := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/1", "branch-2-session").Code; got != http.StatusNotFound {
		t.Fatalf("branch-2 cross-branch lookup: expected 404, got %d", got)
	}
}
