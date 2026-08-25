package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func infrastructureRequestWithTenantDB(req *http.Request, tenantTx TenantDB) *http.Request {
	ctx := withTenantDB(context.Background(), tenantTx)
	ctx = withTenantIdentity(ctx, "user-1", "tenant-1", "branch-1")
	return req.WithContext(ctx)
}

func TestSpecializedPostUsesInjectedTenantDB(t *testing.T) {
	tenantDatabase, tenantMock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer tenantDatabase.Close()

	globalDatabase, globalMock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer globalDatabase.Close()
	previousGlobal := db
	db = globalDatabase
	defer func() { db = previousGlobal }()

	tenantMock.ExpectQuery("SELECT id FROM asset_types").WithArgs("SWITCH").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("asset-type-1"))
	tenantMock.ExpectQuery("SELECT id,placement_type").WithArgs("placement-1", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows([]string{"id", "placement_type", "branch_id", "placement_code", "name", "status"}).AddRow("placement-1", "IDF", "branch-1", "IDF01", "IDF 01", "active"))
	tenantMock.ExpectQuery("SELECT id, prefix, separator").WithArgs("tenant-1", "SWITCH").
		WillReturnRows(sqlmock.NewRows([]string{"id", "prefix", "separator", "seq_digits", "last_seq", "include_branch", "include_placement", "custom_segment_1", "custom_segment_2"}).
			AddRow("rule-1", "SW", "-", 4, 0, false, true, "", ""))
	tenantMock.ExpectExec("INSERT INTO nomenclature_counters").WillReturnResult(sqlmock.NewResult(0, 1))
	tenantMock.ExpectQuery("SELECT last_seq FROM nomenclature_counters").WillReturnRows(sqlmock.NewRows([]string{"last_seq"}).AddRow(0))
	tenantMock.ExpectExec("UPDATE nomenclature_counters").WillReturnResult(sqlmock.NewResult(0, 1))
	tenantMock.ExpectExec("INSERT INTO assets").WillReturnResult(sqlmock.NewResult(0, 1))
	tenantMock.ExpectExec("INSERT INTO switches").WillReturnResult(sqlmock.NewResult(0, 1))

	req := httptest.NewRequest(http.MethodPost, "/api/infra/switches", strings.NewReader(`{"name":"Switch principal","placement_id":"placement-1"}`))
	req = infrastructureRequestWithTenantDB(req, tenantDatabase)
	rec := httptest.NewRecorder()
	handleSwitches(rec, req)

	if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), `"internal_code":"SW-IDF01-0001"`) {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if err := tenantMock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
	if err := globalMock.ExpectationsWereMet(); err != nil {
		t.Fatalf("specialized POST touched global db: %v", err)
	}
}

func TestSpecializedGetUsesInjectedTenantDB(t *testing.T) {
	tenantDatabase, tenantMock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer tenantDatabase.Close()

	globalDatabase, globalMock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer globalDatabase.Close()
	previousGlobal := db
	db = globalDatabase
	defer func() { db = previousGlobal }()

	tenantMock.ExpectQuery("FROM switches sw").WithArgs("tenant-1").
		WillReturnRows(sqlmock.NewRows([]string{"id", "internal_code", "manufacturer", "model", "serial_number", "status", "port_count", "uplink_count", "management_ip", "observations", "install_year", "created_at"}).
			AddRow("switch-1", "SW-0001", "", "", "", "active", 24, 2, "", "", 2026, time.Now()))

	req := infrastructureRequestWithTenantDB(httptest.NewRequest(http.MethodGet, "/api/infra/switches", nil), tenantDatabase)
	rec := httptest.NewRecorder()
	handleSwitches(rec, req)

	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"code":"SW-0001"`) {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if err := tenantMock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
	if err := globalMock.ExpectationsWereMet(); err != nil {
		t.Fatalf("specialized GET touched global db: %v", err)
	}
}

func TestSpecializedHandlerFailsClosedWithoutTenantDB(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/infra/switches", nil)
	rec := httptest.NewRecorder()
	handleSwitches(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}
