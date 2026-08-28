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
)

func TestResolvePhysicalLocationForZoneRequiresExactScope(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	zone := CanonicalZone{ID: "z1", TenantID: "t1", BranchID: "b1", BuildingID: "s1"}
	mock.ExpectQuery("SELECT b.id,b.code,b.name").WithArgs("ia1", "z1", "t1", "b1", "s1").
		WillReturnRows(sqlmock.NewRows([]string{"site_id", "site_code", "site_name", "site_status", "area_id", "area_code", "area_name", "area_status"}).
			AddRow("s1", "SITE", "Site", "active", "ia1", "AREA", "Area", "active"))
	resolved, err := ResolvePhysicalLocationForZone(context.Background(), database, PhysicalScope{"t1", "b1"}, zone, "s1", "ia1")
	if err != nil || resolved.AreaID != "ia1" || !resolved.Active {
		t.Fatalf("resolved=%+v err=%v", resolved, err)
	}
	mock.ExpectQuery("SELECT b.id,b.code,b.name").WithArgs("bad", "z1", "t1", "b1", "").WillReturnError(sql.ErrNoRows)
	if _, err = ResolvePhysicalLocationForZone(context.Background(), database, PhysicalScope{"t1", "b1"}, zone, "", "bad"); !errors.Is(err, ErrPhysicalScopeMismatch) {
		t.Fatalf("mismatch err=%v", err)
	}
}

func TestMdfIdfZoneRequestContractFailsClosed(t *testing.T) {
	for _, test := range []struct {
		name, body, errorCode string
		status                int
	}{
		{"tenant spoof", `{"type":"MDF","name":"x","zone_id":"z1","tenant_id":"other"}`, "tenant_scope_mismatch", http.StatusForbidden},
		{"branch spoof", `{"type":"MDF","name":"x","zone_id":"z1","branch_id":"other"}`, "branch_scope_mismatch", http.StatusForbidden},
		{"missing placement", `{"type":"MDF","name":"x"}`, "ZONE_REQUIRED", http.StatusUnprocessableEntity},
		{"invalid type", `{"type":"SERVER","name":"x","zone_id":"z1"}`, "invalid_distribution_type", http.StatusUnprocessableEntity},
	} {
		t.Run(test.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			req := infrastructureRequestWithTenantDB(httptest.NewRequest(http.MethodPost, "/api/infra/mdf-idf", strings.NewReader(test.body)), database)
			rec := httptest.NewRecorder()
			handleMdfIdf(rec, req)
			if rec.Code != test.status || !strings.Contains(rec.Body.String(), test.errorCode) {
				t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
			}
			if err = mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("failed request touched database: %v", err)
			}
		})
	}
}

func TestCanonicalZoneNamingErrorContract(t *testing.T) {
	rec := httptest.NewRecorder()
	writeManagedAssetError(rec, ErrCanonicalZoneNamingRequired, "MDF")
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "NAMING_RULE_ZONE_CONTEXT_REQUIRED") {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}
