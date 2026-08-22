package main

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

var inventoryImportTestColumns = []string{
	"id", "filename", "file_type", "status", "total_rows", "valid_rows",
	"error_rows", "duplicate_rows", "created_at", "updated_at",
}

func installInventoryRouteDBMock(t *testing.T) sqlmock.Sqlmock {
	t.Helper()
	mockDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create SQL mock: %v", err)
	}
	previousDB := db
	db = mockDB
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("unmet SQL expectations: %v", err)
		}
		db = previousDB
		mockDB.Close()
	})
	return mock
}

func expectInventoryRouteSession(mock sqlmock.Sqlmock, token, userID, tenantID, branchID string) {
	mock.ExpectQuery(regexp.QuoteMeta(`
		SELECT s.user_id, s.tenant_id, s.branch_id, u.email
		FROM sessions s
		JOIN users u ON s.user_id = u.id
		WHERE s.token = $1 AND s.expires_at > $2
		LIMIT 1
	`)).WithArgs(token, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "tenant_id", "branch_id", "email"}).
			AddRow(userID, tenantID, branchID, "user@example.com"))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT EXISTS(SELECT 1 FROM tenants WHERE id = $1)")).
		WithArgs(tenantID).WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery("JOIN user_branches").WithArgs(branchID, tenantID, userID).
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
}

func expectInventoryDetailFound(mock sqlmock.Sqlmock, importID, tenantID, branchID string) {
	mock.ExpectQuery("FROM inventory_imports").WithArgs(importID, tenantID, branchID).
		WillReturnRows(sqlmock.NewRows(inventoryImportTestColumns).
			AddRow(importID, "inventory.csv", "csv", "staging", 10, 10, 0, 0, time.Now(), time.Now()))
	mock.ExpectQuery("FROM import_errors").WithArgs(importID, tenantID).
		WillReturnRows(sqlmock.NewRows([]string{"error_message"}))
}

func runInventoryRouteTest(t *testing.T, method, path, token string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	if token != "" {
		req.AddCookie(&http.Cookie{Name: "session_token", Value: token})
	}
	w := httptest.NewRecorder()
	handleInventoryImportRoutes(w, req)
	return w
}

func TestHandleInventoryImportRoutes_InvalidSessionFailsClosed(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	mock.ExpectQuery("FROM sessions").WithArgs("invalid-session", sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "tenant_id", "branch_id", "email"}))
	if got := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/1", "invalid-session").Code; got != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", got)
	}
}

func TestHandleInventoryImportRoutes_InvalidTenantFailsClosed(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	mock.ExpectQuery("FROM sessions").WithArgs("test-session", sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "tenant_id", "branch_id", "email"}).
			AddRow("user-1", "tenant-missing", "branch-1", "user@example.com"))
	mock.ExpectQuery("SELECT EXISTS").WithArgs("tenant-missing").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	if got := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/1", "test-session").Code; got != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", got)
	}
}

func TestHandleInventoryImportRoutes_UnauthorizedBranchFailsClosed(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	mock.ExpectQuery("FROM sessions").WithArgs("test-session", sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"user_id", "tenant_id", "branch_id", "email"}).
			AddRow("user-1", "tenant-1", "branch-other", "user@example.com"))
	mock.ExpectQuery("SELECT EXISTS").WithArgs("tenant-1").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery("JOIN user_branches").WithArgs("branch-other", "tenant-1", "user-1").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	if got := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/1", "test-session").Code; got != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", got)
	}
}

func TestHandleInventoryImportRoutes_CrossTenantImportFailsClosed(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	expectInventoryRouteSession(mock, "tenant-a-session", "user-a", "tenant-a", "branch-a")
	mock.ExpectQuery("FROM inventory_imports").WithArgs("2", "tenant-a", "branch-a").
		WillReturnRows(sqlmock.NewRows(inventoryImportTestColumns))
	if got := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/2", "tenant-a-session").Code; got != http.StatusNotFound {
		t.Fatalf("expected cross-tenant import to be hidden with 404, got %d", got)
	}
}

func TestHandleInventoryImportRoutes_CrossBranchImportFailsClosed(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	expectInventoryRouteSession(mock, "branch-a-session", "user-a", "tenant-a", "branch-a")
	mock.ExpectQuery("FROM inventory_imports").WithArgs("3", "tenant-a", "branch-a").
		WillReturnRows(sqlmock.NewRows(inventoryImportTestColumns))
	if got := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/3", "branch-a-session").Code; got != http.StatusNotFound {
		t.Fatalf("expected cross-branch import to be hidden with 404, got %d", got)
	}
}

func TestHandleInventoryImportRoutes_NonexistentImport(t *testing.T) {
	mock := installInventoryRouteDBMock(t)
	expectInventoryRouteSession(mock, "test-session", "user-1", "tenant-1", "branch-1")
	mock.ExpectQuery("FROM inventory_imports").WithArgs("999", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows(inventoryImportTestColumns))
	if got := runInventoryRouteTest(t, http.MethodGet, "/api/import/inventory/999", "test-session").Code; got != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", got)
	}
}
