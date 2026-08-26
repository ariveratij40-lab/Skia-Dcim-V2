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

func TestHandleInternalAreasValidatesOptionalHierarchyAndCreates(t *testing.T) {
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
