package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/lib/pq"
)

func nomenclatureRequest(req *http.Request, tdb TenantDB, userID, tenantID string) *http.Request {
	ctx := withTenantDB(context.Background(), tdb)
	ctx = withTenantIdentity(ctx, userID, tenantID, "branch-1")
	return req.WithContext(ctx)
}

func expectNomenclatureAdmin(mock sqlmock.Sqlmock, allowed bool) {
	mock.ExpectQuery("SELECT EXISTS").WithArgs("user-1", "tenant-1").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(allowed))
}

func TestNamingRulesGetReturnsTypesWithoutRules(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	expectNomenclatureAdmin(mock, false)
	mock.ExpectQuery("FROM asset_types at").WithArgs("tenant-1").WillReturnRows(sqlmock.NewRows([]string{
		"code", "name", "description", "requires_nomenclature", "id", "rule_type", "prefix", "separator",
		"include_branch", "include_location", "seq_digits", "reset_per_location", "last_seq", "updated_at",
		"custom_1", "custom_2", "label_1", "label_2", "active", "rule_description",
	}).AddRow("SERVER", "Servidor", "", false, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil).
		AddRow("SWITCH", "Switch", "", true, "rule-1", "SWITCH", "SW", "-", true, false, 4, false, 0, time.Now(), "", "", "Segmento 1", "Segmento 2", false, "Inactive norm"))

	req := nomenclatureRequest(httptest.NewRequest(http.MethodGet, "/api/dcim/catalogs/naming-rules", nil), database, "user-1", "tenant-1")
	rec := httptest.NewRecorder()
	NewDCIMHandler(nil).HandleNamingRules(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"code":"SERVER"`) || !strings.Contains(rec.Body.String(), `"rule":null`) || !strings.Contains(rec.Body.String(), `"active":false`) || !strings.Contains(rec.Body.String(), `"can_manage":false`) {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestNamingRulesPostDuplicateIsConflict(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	expectNomenclatureAdmin(mock, true)
	mock.ExpectQuery("SELECT EXISTS\\(SELECT 1 FROM asset_types").WithArgs("MDF").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectExec("INSERT INTO naming_rules").WillReturnError(&pq.Error{Code: "23505"})
	req := nomenclatureRequest(httptest.NewRequest(http.MethodPost, "/api/dcim/catalogs/naming-rules", strings.NewReader(`{"asset_type_code":"MDF","prefix":"MDF"}`)), database, "user-1", "tenant-1")
	rec := httptest.NewRecorder()
	NewDCIMHandler(nil).HandleNamingRules(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestNamingRulesPostRejectsUnknownAssetType(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	expectNomenclatureAdmin(mock, true)
	mock.ExpectQuery("SELECT EXISTS\\(SELECT 1 FROM asset_types").WithArgs("UNKNOWN").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	req := nomenclatureRequest(httptest.NewRequest(http.MethodPost, "/api/dcim/catalogs/naming-rules", strings.NewReader(`{"asset_type_code":"UNKNOWN","prefix":"XX"}`)), database, "user-1", "tenant-1")
	rec := httptest.NewRecorder()
	NewDCIMHandler(nil).HandleNamingRules(rec, req)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestNamingRulesPostCreatesFirstRule(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	expectNomenclatureAdmin(mock, true)
	mock.ExpectQuery("SELECT EXISTS\\(SELECT 1 FROM asset_types").WithArgs("MDF").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectExec("INSERT INTO naming_rules").WithArgs(sqlmock.AnyArg(), "tenant-1", "MDF", "MDF", "-", true, false, 4, false, true,
		sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))

	body := `{"asset_type_code":"MDF","prefix":"mdf","separator":"-"}`
	req := nomenclatureRequest(httptest.NewRequest(http.MethodPost, "/api/dcim/catalogs/naming-rules", strings.NewReader(body)), database, "user-1", "tenant-1")
	rec := httptest.NewRecorder()
	NewDCIMHandler(nil).HandleNamingRules(rec, req)
	if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), `"last_seq":0`) {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestNamingRulesMutationRequiresAdmin(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	expectNomenclatureAdmin(mock, false)
	req := nomenclatureRequest(httptest.NewRequest(http.MethodPost, "/api/dcim/catalogs/naming-rules", strings.NewReader(`{}`)), database, "user-1", "tenant-1")
	rec := httptest.NewRecorder()
	NewDCIMHandler(nil).HandleNamingRules(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestNamingRulesRejectsClientAuthorityFields(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	expectNomenclatureAdmin(mock, true)
	body := `{"asset_type_code":"MDF","prefix":"MDF","tenant_id":"other","last_seq":9}`
	req := nomenclatureRequest(httptest.NewRequest(http.MethodPost, "/api/dcim/catalogs/naming-rules", strings.NewReader(body)), database, "user-1", "tenant-1")
	rec := httptest.NewRecorder()
	NewDCIMHandler(nil).HandleNamingRules(rec, req)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestNamingRulesLocksStructureAfterIssuance(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	expectNomenclatureAdmin(mock, true)
	mock.ExpectQuery("SELECT prefix,separator").WithArgs("rule-1", "tenant-1").WillReturnRows(sqlmock.NewRows([]string{
		"prefix", "separator", "include_branch", "include_location", "seq_digits", "reset_per_location", "last_seq", "custom_1", "custom_2", "label_1", "label_2",
	}).AddRow("MDF", "-", true, false, 4, false, 3, "", "", "Segmento 1", "Segmento 2"))
	req := nomenclatureRequest(httptest.NewRequest(http.MethodPut, "/api/dcim/catalogs/naming-rules/rule-1", strings.NewReader(`{"prefix":"NEW"}`)), database, "user-1", "tenant-1")
	rec := httptest.NewRecorder()
	NewDCIMHandler(nil).HandleNamingRules(rec, req)
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "normative_version_required") {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
