package main

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/lib/pq"
)

func TestResolvePhysicalLocationRequiresExactActiveScope(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	mock.ExpectQuery("FROM buildings b JOIN internal_areas ia").
		WithArgs("site-1", "area-1", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows([]string{"site_id", "site_code", "site_name", "site_status", "area_id", "area_code", "area_name", "area_status"}).
			AddRow("site-1", "PARQUE", "Parque Industrial", "active", "area-1", "PROD", "Producción", "active"))
	got, err := ResolvePhysicalLocation(context.Background(), database, "tenant-1", "branch-1", "site-1", "area-1")
	if err != nil || got.SiteCode != "PARQUE" || got.AreaCode != "PROD" || !got.Active {
		t.Fatalf("resolved=%#v err=%v", got, err)
	}

	mock.ExpectQuery("FROM buildings b JOIN internal_areas ia").
		WithArgs("site-1", "area-other", "tenant-1", "branch-1").
		WillReturnError(sql.ErrNoRows)
	_, err = ResolvePhysicalLocation(context.Background(), database, "tenant-1", "branch-1", "site-1", "area-other")
	if !errors.Is(err, ErrInvalidPhysicalLocation) {
		t.Fatalf("scope mismatch err=%v", err)
	}

	mock.ExpectQuery("FROM buildings b JOIN internal_areas ia").
		WithArgs("site-1", "area-1", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows([]string{"site_id", "site_code", "site_name", "site_status", "area_id", "area_code", "area_name", "area_status"}).
			AddRow("site-1", "PARQUE", "Parque Industrial", "active", "area-1", "PROD", "Producción", "inactive"))
	_, err = ResolvePhysicalLocation(context.Background(), database, "tenant-1", "branch-1", "site-1", "area-1")
	if !errors.Is(err, ErrInvalidPhysicalLocation) {
		t.Fatalf("inactive area err=%v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func physicalRequest(method, target, body string, tdb TenantDB) *http.Request {
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	ctx := withTenantDB(request.Context(), tdb)
	ctx = withTenantIdentity(ctx, "user-1", "tenant-1", "branch-1")
	return request.WithContext(ctx)
}

func TestHandleSitesCreatesAndClassifiesDuplicate(t *testing.T) {
	for _, test := range []struct {
		name       string
		execError  error
		wantStatus int
	}{
		{name: "create", wantStatus: http.StatusCreated},
		{name: "duplicate", execError: &pq.Error{Code: "23505"}, wantStatus: http.StatusConflict},
	} {
		t.Run(test.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			mock.ExpectQuery("SELECT EXISTS").WithArgs("user-1", "tenant-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			expectation := mock.ExpectExec("INSERT INTO buildings").WithArgs(sqlmock.AnyArg(), "tenant-1", "branch-1", "PARQUE", "Parque Industrial", "")
			if test.execError != nil {
				expectation.WillReturnError(test.execError)
			} else {
				expectation.WillReturnResult(sqlmock.NewResult(0, 1))
			}
			recorder := httptest.NewRecorder()
			HandleSites(recorder, physicalRequest(http.MethodPost, "/api/dcim/sites", `{"code":"parque","name":"Parque Industrial"}`, database))
			if recorder.Code != test.wantStatus {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestHandleInternalAreasRequiresCanonicalHierarchyAndCreates(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectQuery("SELECT EXISTS").WithArgs("user-1", "tenant-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectQuery("SELECT EXISTS").WithArgs("site-1", "tenant-1", "branch-1", "floor-1", "zone-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectExec("INSERT INTO internal_areas").WithArgs(sqlmock.AnyArg(), "tenant-1", "branch-1", "site-1", "floor-1", "zone-1", "PROD", "Producción").WillReturnResult(sqlmock.NewResult(0, 1))
	recorder := httptest.NewRecorder()
	HandleInternalAreas(recorder, physicalRequest(http.MethodPost, "/api/dcim/internal-areas", `{"site_id":"site-1","floor_id":"floor-1","zone_id":"zone-1","code":"prod","name":"Producción"}`, database))
	if recorder.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestHandleFloorsCreatesCanonicalFloorAndClassifiesDuplicate(t *testing.T) {
	for _, test := range []struct {
		name       string
		execError  error
		wantStatus int
	}{{"create", nil, http.StatusCreated}, {"duplicate", &pq.Error{Code: "23505"}, http.StatusConflict}} {
		t.Run(test.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			mock.ExpectQuery("SELECT EXISTS").WithArgs("user-1", "tenant-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			mock.ExpectQuery("SELECT EXISTS").WithArgs("site-1", "tenant-1", "branch-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			expectation := mock.ExpectExec("INSERT INTO floors").WithArgs(sqlmock.AnyArg(), "tenant-1", "site-1", "P01", "Piso 1", nil)
			if test.execError != nil {
				expectation.WillReturnError(test.execError)
			} else {
				expectation.WillReturnResult(sqlmock.NewResult(0, 1))
			}
			recorder := httptest.NewRecorder()
			HandleFloors(recorder, physicalRequest(http.MethodPost, "/api/dcim/floors", `{"site_id":"site-1","code":"p01","name":"Piso 1"}`, database))
			if recorder.Code != test.wantStatus {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestHandleFloorsGetUsesServerScope(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectQuery("FROM floors f JOIN buildings b").WithArgs("tenant-1", "branch-1", "site-1").WillReturnRows(
		sqlmock.NewRows([]string{"id", "code", "name", "floor_number", "status", "building_id"}).AddRow("floor-1", "P01", "Piso 1", 1, "active", "site-1"))
	recorder := httptest.NewRecorder()
	HandleFloors(recorder, physicalRequest(http.MethodGet, "/api/dcim/floors?site_id=site-1", "", database))
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"id":"floor-1"`) {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestHandleZonesCreatesCanonicalZoneAndRejectsWrongFloor(t *testing.T) {
	for _, test := range []struct {
		name       string
		valid      bool
		wantStatus int
	}{{"create", true, http.StatusCreated}, {"wrong floor", false, http.StatusUnprocessableEntity}} {
		t.Run(test.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			mock.ExpectQuery("SELECT EXISTS").WithArgs("user-1", "tenant-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			mock.ExpectQuery("SELECT EXISTS").WithArgs("floor-1", "tenant-1", "site-1", "branch-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(test.valid))
			if test.valid {
				mock.ExpectExec("INSERT INTO zones").WithArgs(sqlmock.AnyArg(), "tenant-1", "branch-1", "site-1", "floor-1", "PROD", "Producción").WillReturnResult(sqlmock.NewResult(0, 1))
			}
			recorder := httptest.NewRecorder()
			HandleZones(recorder, physicalRequest(http.MethodPost, "/api/dcim/zones", `{"site_id":"site-1","floor_id":"floor-1","code":"prod","name":"Producción"}`, database))
			if recorder.Code != test.wantStatus {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestHandleZonesGetUsesServerScopeAndCanonicalParents(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectQuery("FROM zones z JOIN buildings b").WithArgs("tenant-1", "branch-1", "site-1", "floor-1").WillReturnRows(
		sqlmock.NewRows([]string{"id", "code", "name", "status", "building_id", "floor_id"}).AddRow("zone-1", "PROD", "Producción", "active", "site-1", "floor-1"))
	recorder := httptest.NewRecorder()
	HandleZones(recorder, physicalRequest(http.MethodGet, "/api/dcim/zones?site_id=site-1&floor_id=floor-1", "", database))
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"id":"zone-1"`) {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestHandleInternalAreasRejectsMissingCanonicalParents(t *testing.T) {
	for _, body := range []string{
		`{"site_id":"site-1","zone_id":"zone-1","code":"PROD","name":"Producción"}`,
		`{"site_id":"site-1","floor_id":"floor-1","code":"PROD","name":"Producción"}`,
	} {
		database, mock, err := sqlmock.New()
		if err != nil {
			t.Fatal(err)
		}
		mock.ExpectQuery("SELECT EXISTS").WithArgs("user-1", "tenant-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
		recorder := httptest.NewRecorder()
		HandleInternalAreas(recorder, physicalRequest(http.MethodPost, "/api/dcim/internal-areas", body, database))
		if recorder.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
		database.Close()
	}
}

func TestPhysicalCodeNormalizationDoesNotAcceptFreeText(t *testing.T) {
	if got := normalizedPhysicalCode(" parque-01 "); got != "PARQUE-01" {
		t.Fatalf("normalization=%q", got)
	}
	for _, invalid := range []string{"", "Parque industrial", "../PARQUE", "ÁREA"} {
		if physicalCodePattern.MatchString(normalizedPhysicalCode(invalid)) {
			t.Fatalf("accepted invalid canonical code %q", invalid)
		}
	}
}

func TestHandleFloorsExplicitNegativeMatrix(t *testing.T) {
	tests := []struct {
		name, body string
		parentOK   *bool
		insert     bool
	}{
		{"missing_site", `{"code":"P02","name":"Piso 2"}`, nil, false},
		{"malformed_site", `{"site_id":"not-a-uuid","code":"P02","name":"Piso 2"}`, boolPtr(false), false},
		{"cross_tenant_site", `{"site_id":"site-other-tenant","code":"P02","name":"Piso 2"}`, boolPtr(false), false},
		{"cross_branch_site", `{"site_id":"site-other-branch","code":"P02","name":"Piso 2"}`, boolPtr(false), false},
		{"client_scope_override_ignored", `{"site_id":"site-1","code":"P02","name":"Piso 2","tenant_id":"attacker","branch_id":"attacker"}`, boolPtr(true), true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			mock.ExpectQuery("SELECT EXISTS").WithArgs("user-1", "tenant-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			if test.parentOK != nil {
				mock.ExpectQuery("SELECT EXISTS").WithArgs(sqlmock.AnyArg(), "tenant-1", "branch-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(*test.parentOK))
			}
			if test.insert {
				mock.ExpectExec("INSERT INTO floors").WithArgs(sqlmock.AnyArg(), "tenant-1", "site-1", "P02", "Piso 2", nil).WillReturnResult(sqlmock.NewResult(0, 1))
			}
			recorder := httptest.NewRecorder()
			HandleFloors(recorder, physicalRequest(http.MethodPost, "/api/dcim/floors", test.body, database))
			if test.insert && recorder.Code != http.StatusCreated {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			if !test.insert && recorder.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestHandleZonesExplicitNegativeMatrix(t *testing.T) {
	tests := []struct {
		name, body string
		parentOK   *bool
		execErr    error
		want       int
	}{
		{"success", `{"site_id":"site-1","floor_id":"floor-1","code":"QA","name":"Calidad"}`, boolPtr(true), nil, http.StatusCreated},
		{"duplicate", `{"site_id":"site-1","floor_id":"floor-1","code":"QA","name":"Calidad"}`, boolPtr(true), &pq.Error{Code: "23505"}, http.StatusConflict},
		{"missing_site", `{"floor_id":"floor-1","code":"QA","name":"Calidad"}`, nil, nil, http.StatusUnprocessableEntity},
		{"missing_floor", `{"site_id":"site-1","code":"QA","name":"Calidad"}`, nil, nil, http.StatusUnprocessableEntity},
		{"wrong_site_floor", `{"site_id":"site-2","floor_id":"floor-1","code":"QA","name":"Calidad"}`, boolPtr(false), nil, http.StatusUnprocessableEntity},
		{"cross_tenant_site", `{"site_id":"site-other-tenant","floor_id":"floor-1","code":"QA","name":"Calidad"}`, boolPtr(false), nil, http.StatusUnprocessableEntity},
		{"cross_branch_site", `{"site_id":"site-other-branch","floor_id":"floor-1","code":"QA","name":"Calidad"}`, boolPtr(false), nil, http.StatusUnprocessableEntity},
		{"cross_tenant_floor", `{"site_id":"site-1","floor_id":"floor-other-tenant","code":"QA","name":"Calidad"}`, boolPtr(false), nil, http.StatusUnprocessableEntity},
		{"cross_branch_floor", `{"site_id":"site-1","floor_id":"floor-other-branch","code":"QA","name":"Calidad"}`, boolPtr(false), nil, http.StatusUnprocessableEntity},
		{"client_scope_override_ignored", `{"site_id":"site-1","floor_id":"floor-1","code":"QA","name":"Calidad","tenant_id":"attacker","branch_id":"attacker"}`, boolPtr(true), nil, http.StatusCreated},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			mock.ExpectQuery("SELECT EXISTS").WithArgs("user-1", "tenant-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			if test.parentOK != nil {
				mock.ExpectQuery("SELECT EXISTS").WithArgs(sqlmock.AnyArg(), "tenant-1", sqlmock.AnyArg(), "branch-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(*test.parentOK))
			}
			if test.want == http.StatusCreated || test.want == http.StatusConflict {
				expect := mock.ExpectExec("INSERT INTO zones").WithArgs(sqlmock.AnyArg(), "tenant-1", "branch-1", "site-1", "floor-1", "QA", "Calidad")
				if test.execErr != nil {
					expect.WillReturnError(test.execErr)
				} else {
					expect.WillReturnResult(sqlmock.NewResult(0, 1))
				}
			}
			recorder := httptest.NewRecorder()
			HandleZones(recorder, physicalRequest(http.MethodPost, "/api/dcim/zones", test.body, database))
			if recorder.Code != test.want {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestHandleInternalAreasExplicitNegativeMatrix(t *testing.T) {
	tests := []struct {
		name, body string
		graphQuery bool
	}{
		{"missing_site", `{"floor_id":"floor-1","zone_id":"zone-1","code":"QA","name":"Calidad"}`, false},
		{"missing_floor", `{"site_id":"site-1","zone_id":"zone-1","code":"QA","name":"Calidad"}`, false},
		{"missing_zone", `{"site_id":"site-1","floor_id":"floor-1","code":"QA","name":"Calidad"}`, false},
		{"zone_from_another_floor", `{"site_id":"site-1","floor_id":"floor-1","zone_id":"zone-other-floor","code":"QA","name":"Calidad"}`, true},
		{"zone_from_another_building", `{"site_id":"site-1","floor_id":"floor-1","zone_id":"zone-other-building","code":"QA","name":"Calidad"}`, true},
		{"floor_from_another_building", `{"site_id":"site-1","floor_id":"floor-other-building","zone_id":"zone-1","code":"QA","name":"Calidad"}`, true},
		{"cross_tenant_site", `{"site_id":"site-other-tenant","floor_id":"floor-1","zone_id":"zone-1","code":"QA","name":"Calidad"}`, true},
		{"cross_branch_site", `{"site_id":"site-other-branch","floor_id":"floor-1","zone_id":"zone-1","code":"QA","name":"Calidad"}`, true},
		{"cross_tenant_floor", `{"site_id":"site-1","floor_id":"floor-other-tenant","zone_id":"zone-1","code":"QA","name":"Calidad"}`, true},
		{"cross_branch_floor", `{"site_id":"site-1","floor_id":"floor-other-branch","zone_id":"zone-1","code":"QA","name":"Calidad"}`, true},
		{"cross_tenant_zone", `{"site_id":"site-1","floor_id":"floor-1","zone_id":"zone-other-tenant","code":"QA","name":"Calidad"}`, true},
		{"cross_branch_zone", `{"site_id":"site-1","floor_id":"floor-1","zone_id":"zone-other-branch","code":"QA","name":"Calidad"}`, true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			mock.ExpectQuery("SELECT EXISTS").WithArgs("user-1", "tenant-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			if test.graphQuery {
				mock.ExpectQuery("SELECT EXISTS").WithArgs(sqlmock.AnyArg(), "tenant-1", "branch-1", sqlmock.AnyArg(), sqlmock.AnyArg()).WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
			}
			recorder := httptest.NewRecorder()
			HandleInternalAreas(recorder, physicalRequest(http.MethodPost, "/api/dcim/internal-areas", test.body, database))
			if recorder.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func boolPtr(value bool) *bool { return &value }
