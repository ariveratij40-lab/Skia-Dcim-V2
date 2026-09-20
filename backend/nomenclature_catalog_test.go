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

func nomenclatureRequest(req *http.Request, tdb TenantDB, userID, tenantID string) *http.Request {
	ctx := withTenantDB(context.Background(), tdb)
	ctx = withTenantIdentity(ctx, userID, tenantID, "branch-1")
	return req.WithContext(ctx)
}

func expectNomenclatureAdmin(mock sqlmock.Sqlmock, allowed bool) {
	mock.ExpectQuery("SELECT EXISTS").WithArgs("user-1", "tenant-1").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(allowed))
}

func TestCanonicalZoneNamingPreviewContract(t *testing.T) {
	rule := namingRuleResponse{
		Prefix: "MDF", Separator: "-", SeqDigits: 3, LastSeq: 0,
		IncludeBranch: true, IncludeZone: true, ContextMode: "CANONICAL_ZONE",
	}
	if got, want := namingRulePreview(rule), "MDF-[SUCURSAL]-[ZONA]-001"; got != want {
		t.Fatalf("preview=%q want=%q", got, want)
	}
	rule.Prefix = "IDF"
	if got, want := namingRulePreview(rule), "IDF-[SUCURSAL]-[ZONA]-001"; got != want {
		t.Fatalf("preview=%q want=%q", got, want)
	}
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
		"include_branch", "include_placement", "include_site", "include_internal_area", "include_zone", "context_mode", "rule_version", "include_location", "seq_digits", "reset_per_location", "last_seq", "updated_at",
		"custom_1", "custom_2", "label_1", "label_2", "active", "rule_description",
	}).AddRow("SERVER", "Servidor", "", false, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil).
		AddRow("MDF", "MDF", "", true, "rule-1", "MDF", "MDF", "-", true, false, false, false, true, "CANONICAL_ZONE", 2, false, 3, false, 0, time.Now(), "", "", "Segmento 1", "Segmento 2", true, "Canonical norm"))

	req := nomenclatureRequest(httptest.NewRequest(http.MethodGet, "/api/dcim/catalogs/naming-rules", nil), database, "user-1", "tenant-1")
	rec := httptest.NewRecorder()
	NewDCIMHandler(nil).HandleNamingRules(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"code":"SERVER"`) || !strings.Contains(rec.Body.String(), `"rule":null`) || !strings.Contains(rec.Body.String(), `"context_mode":"CANONICAL_ZONE"`) || !strings.Contains(rec.Body.String(), `"include_zone":true`) || !strings.Contains(rec.Body.String(), `"rule_version":2`) || !strings.Contains(rec.Body.String(), `"can_manage":false`) {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestNamingRulesLegacyMutationsFailClosed(t *testing.T) {
	for _, method := range []string{http.MethodPost, http.MethodPut} {
		for _, body := range []string{`{}`, `{"asset_type_code":"MDF","prefix":"MDF"}`, `{"prefix":"NEW","tenant_id":"other","last_seq":9}`, `{"include_location":true,"reset_per_location":true}`} {
			t.Run(method+body, func(t *testing.T) {
				database, mock, err := sqlmock.New()
				if err != nil {
					t.Fatal(err)
				}
				defer database.Close()
				req := nomenclatureRequest(httptest.NewRequest(method, "/api/dcim/catalogs/naming-rules/rule-1", strings.NewReader(body)), database, "user-1", "tenant-1")
				rec := httptest.NewRecorder()
				NewDCIMHandler(nil).HandleNamingRules(rec, req)
				if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "canonical_nomenclature_mutation_required") {
					t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
				}
				if err := mock.ExpectationsWereMet(); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
}
