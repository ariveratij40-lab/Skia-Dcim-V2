package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func withMockDatabase(t *testing.T) (sqlmock.Sqlmock, func()) {
	t.Helper()
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	previousDB := db
	db = database
	return mock, func() {
		db = previousDB
		database.Close()
	}
}

func TestSelectTenantAuthorizationDatabaseErrorFailsClosed(t *testing.T) {
	mock, cleanup := withMockDatabase(t)
	defer cleanup()
	mock.ExpectQuery("SELECT user_id FROM sessions").
		WithArgs("session-1", sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow("user-1"))
	mock.ExpectQuery("SELECT EXISTS.*FROM user_tenants").
		WithArgs("user-1", "tenant-1").
		WillReturnError(errors.New("permission denied for table user_tenants"))

	request := httptest.NewRequest(http.MethodPost, "/api/auth/select-tenant", strings.NewReader(`{"tenantId":"tenant-1"}`))
	request.AddCookie(&http.Cookie{Name: "session_token", Value: "session-1"})
	recorder := httptest.NewRecorder()
	handleSelectTenant(recorder, request)
	if recorder.Code != http.StatusInternalServerError || strings.Contains(recorder.Body.String(), "permission denied") {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestLogoutDeletesRuntimeSession(t *testing.T) {
	mock, cleanup := withMockDatabase(t)
	defer cleanup()
	mock.ExpectExec("DELETE FROM sessions WHERE token").
		WithArgs("session-1").WillReturnResult(sqlmock.NewResult(0, 1))

	request := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	request.AddCookie(&http.Cookie{Name: "session_token", Value: "session-1"})
	recorder := httptest.NewRecorder()
	handleLogout(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "logged_out") {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestLogoutDatabaseErrorDoesNotReportSuccess(t *testing.T) {
	mock, cleanup := withMockDatabase(t)
	defer cleanup()
	mock.ExpectExec("DELETE FROM sessions WHERE token").
		WithArgs("session-1").WillReturnError(errors.New("permission denied for table sessions"))

	request := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	request.AddCookie(&http.Cookie{Name: "session_token", Value: "session-1"})
	recorder := httptest.NewRecorder()
	handleLogout(recorder, request)
	if recorder.Code != http.StatusInternalServerError || strings.Contains(recorder.Body.String(), "permission denied") {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
