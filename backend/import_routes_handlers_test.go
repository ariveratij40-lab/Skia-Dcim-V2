package main

import (
	"context"
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
				WHERE b.id = $1 AND b.tenant_id = $2 AND ub.user_id = $3
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
	// Configurar store fake
	store := NewFakeSessionStore()
	session := CreateValidSession("user-1", "tenant-1", "branch-1")
	store.AddSession(session)
	userInfo := CreateActiveUser("user-1", "user@example.com")
	store.AddUser(userInfo)
	store.SetTenantAccess("user-1", "tenant-1", true)
	store.SetBranchAccess("user-1", "tenant-1", "branch-1", true)
	store.SetPermissions("user-1", "tenant-1", map[string]bool{"inventory.import.read": true})
	SetSessionStore(store)
	defer func() { SetSessionStore(nil) }()

	// Crear request
	req := httptest.NewRequest("GET", "/api/import/inventory/550e8400-e29b-41d4-a716-446655440000/rows", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: session.SessionID,
	})

	// Ejecutar handler
	w := httptest.NewRecorder()
	handleInventoryImportRoutes(w, req)

	// Verificar respuesta
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_CommitNotImplemented prueba POST /{id}/commit (501)
func TestHandleInventoryImportRoutes_CommitNotImplemented(t *testing.T) {
	// Configurar store fake
	store := NewFakeSessionStore()
	session := CreateValidSession("user-1", "tenant-1", "branch-1")
	store.AddSession(session)
	userInfo := CreateActiveUser("user-1", "user@example.com")
	store.AddUser(userInfo)
	store.SetTenantAccess("user-1", "tenant-1", true)
	store.SetBranchAccess("user-1", "tenant-1", "branch-1", true)
	store.SetPermissions("user-1", "tenant-1", map[string]bool{"inventory.import.commit": true})
	SetSessionStore(store)
	defer func() { SetSessionStore(nil) }()

	// Crear request
	req := httptest.NewRequest("POST", "/api/import/inventory/550e8400-e29b-41d4-a716-446655440000/commit", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: session.SessionID,
	})

	// Ejecutar handler
	w := httptest.NewRecorder()
	handleInventoryImportRoutes(w, req)

	// Verificar respuesta 501
	if w.Code != http.StatusNotImplemented {
		t.Errorf("Expected status 501, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_InvalidID prueba ID inválido
func TestHandleInventoryImportRoutes_InvalidID(t *testing.T) {
	// Crear request con ID inválido
	req := httptest.NewRequest("GET", "/api/import/inventory/invalid-id", nil)

	// Ejecutar handler
	w := httptest.NewRecorder()
	handleInventoryImportRoutes(w, req)

	// Verificar respuesta 400
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_EmptyPath prueba ruta vacía
func TestHandleInventoryImportRoutes_EmptyPath(t *testing.T) {
	// Crear request con ruta vacía
	req := httptest.NewRequest("GET", "/api/import/inventory/", nil)

	// Ejecutar handler
	w := httptest.NewRecorder()
	handleInventoryImportRoutes(w, req)

	// Verificar respuesta 404
	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_UnknownRoute prueba ruta desconocida
func TestHandleInventoryImportRoutes_UnknownRoute(t *testing.T) {
	// Crear request con ruta desconocida
	req := httptest.NewRequest("GET", "/api/import/inventory/550e8400-e29b-41d4-a716-446655440000/unknown", nil)

	// Ejecutar handler
	w := httptest.NewRecorder()
	handleInventoryImportRoutes(w, req)

	// Verificar respuesta 404
	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_NoSession prueba sin sesión
func TestHandleInventoryImportRoutes_NoSession(t *testing.T) {
	// Configurar store vacío
	store := NewFakeSessionStore()
	SetSessionStore(store)
	defer func() { SetSessionStore(nil) }()

	// Crear request sin cookie
	req := httptest.NewRequest("GET", "/api/import/inventory/550e8400-e29b-41d4-a716-446655440000", nil)

	// Ejecutar handler
	w := httptest.NewRecorder()
	handleInventoryImportRoutes(w, req)

	// Verificar respuesta 401
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_NoPermission prueba sin permiso
func TestHandleInventoryImportRoutes_NoPermission(t *testing.T) {
	// Configurar store fake SIN permiso
	store := NewFakeSessionStore()
	session := CreateValidSession("user-1", "tenant-1", "branch-1")
	store.AddSession(session)
	userInfo := CreateActiveUser("user-1", "user@example.com")
	store.AddUser(userInfo)
	store.SetTenantAccess("user-1", "tenant-1", true)
	store.SetBranchAccess("user-1", "tenant-1", "branch-1", true)
	store.SetPermissions("user-1", "tenant-1", map[string]bool{}) // Sin permisos
	SetSessionStore(store)
	defer func() { SetSessionStore(nil) }()

	// Crear request
	req := httptest.NewRequest("GET", "/api/import/inventory/550e8400-e29b-41d4-a716-446655440000", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: session.SessionID,
	})

	// Ejecutar handler
	w := httptest.NewRecorder()
	handleInventoryImportRoutes(w, req)

	// Verificar respuesta 403
	if w.Code != http.StatusForbidden {
		t.Errorf("Expected status 403, got %d", w.Code)
	}
}

// TestHandleInventoryImportRoutes_WrongMethod prueba método incorrecto
func TestHandleInventoryImportRoutes_WrongMethod(t *testing.T) {
	// Configurar store fake
	store := NewFakeSessionStore()
	session := CreateValidSession("user-1", "tenant-1", "branch-1")
	store.AddSession(session)
	userInfo := CreateActiveUser("user-1", "user@example.com")
	store.AddUser(userInfo)
	store.SetTenantAccess("user-1", "tenant-1", true)
	store.SetBranchAccess("user-1", "tenant-1", "branch-1", true)
	store.SetPermissions("user-1", "tenant-1", map[string]bool{"inventory.import.read": true})
	SetSessionStore(store)
	defer func() { SetSessionStore(nil) }()

	// Crear request con método POST (debe ser GET)
	req := httptest.NewRequest("POST", "/api/import/inventory/550e8400-e29b-41d4-a716-446655440000", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: session.SessionID,
	})

	// Ejecutar handler
	w := httptest.NewRecorder()
	handleInventoryImportRoutes(w, req)

	// Verificar respuesta 404 (ruta no encontrada)
	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", w.Code)
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
	// Configurar dos sesiones con diferentes branches
	store := NewFakeSessionStore()

	// Usuario 1 en branch-1
	session1 := CreateValidSession("user-1", "tenant-1", "branch-1")
	store.AddSession(session1)
	user1 := CreateActiveUser("user-1", "user1@example.com")
	store.AddUser(user1)
	store.SetTenantAccess("user-1", "tenant-1", true)
	store.SetBranchAccess("user-1", "tenant-1", "branch-1", true)
	store.SetPermissions("user-1", "tenant-1", map[string]bool{"inventory.import.read": true})

	// Usuario 2 en branch-2
	session2 := CreateValidSession("user-2", "tenant-1", "branch-2")
	store.AddSession(session2)
	user2 := CreateActiveUser("user-2", "user2@example.com")
	store.AddUser(user2)
	store.SetTenantAccess("user-2", "tenant-1", true)
	store.SetBranchAccess("user-2", "tenant-1", "branch-2", true)
	store.SetPermissions("user-2", "tenant-1", map[string]bool{"inventory.import.read": true})

	SetSessionStore(store)
	defer func() { SetSessionStore(nil) }()

	// Verificar que usuario 1 puede acceder a branch-1
	ctx := context.Background()
	session1Ctx, err := requireSessionContext(ctx, &http.Request{}, "inventory.import.read")
	if err != nil {
		t.Errorf("User 1 should have access to branch-1, got error: %v", err)
	}
	if session1Ctx.BranchID != "branch-1" {
		t.Errorf("Expected branch-1, got %s", session1Ctx.BranchID)
	}

	// Verificar que usuario 2 puede acceder a branch-2
	session2Ctx, err := requireSessionContext(ctx, &http.Request{}, "inventory.import.read")
	if err != nil {
		t.Errorf("User 2 should have access to branch-2, got error: %v", err)
	}
	if session2Ctx.BranchID != "branch-2" {
		t.Errorf("Expected branch-2, got %s", session2Ctx.BranchID)
	}

	// Verificar que son diferentes
	if session1Ctx.BranchID == session2Ctx.BranchID {
		t.Errorf("Different users should have different branch contexts")
	}
}
