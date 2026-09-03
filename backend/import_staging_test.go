package main

import (
	"context"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

const (
	testImportTenant = "11111111-1111-4111-8111-111111111111"
	testImportBranch = "22222222-2222-4222-8222-222222222222"
	testImportZoneA  = "33333333-3333-4333-8333-333333333333"
	testImportZoneB  = "44444444-4444-4444-8444-444444444444"
)

func TestCanonicalPayloadHashDeterministicAndMeaningful(t *testing.T) {
	a := CanonicalStagingPayload{SourceRowNumber: 1, AssetTypeCode: "MDF", Name: "Core", ZoneID: testImportZoneA, ZoneCode: "PROD", RawSource: map[string]interface{}{"b": 2, "a": 1}}
	b := a
	b.RawSource = map[string]interface{}{"a": 1, "b": 2}
	hashA, err := canonicalPayloadHash(a)
	if err != nil {
		t.Fatal(err)
	}
	hashB, err := canonicalPayloadHash(b)
	if err != nil {
		t.Fatal(err)
	}
	if hashA != hashB {
		t.Fatalf("source key order changed canonical hash: %s != %s", hashA, hashB)
	}
	b.ZoneID = testImportZoneB
	hashB, _ = canonicalPayloadHash(b)
	if hashA == hashB {
		t.Fatal("meaningful zone change did not change canonical hash")
	}
	b = a
	b.AssetTypeCode = "IDF"
	hashB, _ = canonicalPayloadHash(b)
	if hashA == hashB {
		t.Fatal("asset type change did not change canonical hash")
	}
}

func TestCanonicalAssetTypeCandidateDeniesRawID(t *testing.T) {
	raw := map[string]interface{}{"asset_type_id": "a0000000-0000-0000-0000-000000000001", "category": "switches"}
	if got := canonicalAssetTypeCandidate(raw, ""); got != "SWITCH" {
		t.Fatalf("canonical type = %q, want SWITCH", got)
	}
}

func TestNormalizeCanonicalImportRowMDFZoneMatrix(t *testing.T) {
	tests := []struct {
		name       string
		raw        map[string]interface{}
		zoneByID   string
		zoneByCode string
		wantState  string
	}{
		{"zone id", map[string]interface{}{"asset_type_code": "MDF", "zone_id": testImportZoneA}, testImportZoneA, "", "VALID"},
		{"zone code", map[string]interface{}{"asset_type_code": "IDF", "zone_code": " prod "}, "", testImportZoneA, "VALID"},
		{"both match", map[string]interface{}{"asset_type_code": "MDF", "zone_id": testImportZoneA, "zone_code": "PROD"}, testImportZoneA, testImportZoneA, "VALID"},
		{"both mismatch", map[string]interface{}{"asset_type_code": "MDF", "zone_id": testImportZoneA, "zone_code": "OTHER"}, testImportZoneA, testImportZoneB, "INVALID"},
		{"missing", map[string]interface{}{"asset_type_code": "IDF", "internal_area_id": "legacy"}, "", "", "INVALID"},
		{"tenant spoof", map[string]interface{}{"asset_type_code": "MDF", "zone_id": testImportZoneA, "tenant_id": testImportZoneB}, "", "", "INVALID"},
		{"branch spoof", map[string]interface{}{"asset_type_code": "MDF", "zone_id": testImportZoneA, "branch_id": testImportZoneB}, "", "", "INVALID"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			if tc.name != "tenant spoof" && tc.name != "branch spoof" {
				mock.ExpectQuery(regexp.QuoteMeta("SELECT placement_policy FROM asset_types WHERE code=$1")).WithArgs(tc.raw["asset_type_code"]).WillReturnRows(sqlmock.NewRows([]string{"placement_policy"}).AddRow("ZONE"))
			}
			if tc.zoneByID != "" {
				mock.ExpectQuery("SELECT id::text, upper\\(code\\) FROM zones").WithArgs(testImportZoneA, testImportTenant, testImportBranch).WillReturnRows(sqlmock.NewRows([]string{"id", "code"}).AddRow(tc.zoneByID, "PROD"))
			}
			if tc.zoneByCode != "" {
				mock.ExpectQuery("SELECT id::text, upper\\(code\\) FROM zones").WithArgs(sqlmock.AnyArg(), testImportTenant, testImportBranch).WillReturnRows(sqlmock.NewRows([]string{"id", "code"}).AddRow(tc.zoneByCode, "PROD"))
			}
			row, err := normalizeCanonicalImportRow(context.Background(), database, CanonicalImportScope{TenantID: testImportTenant, BranchID: testImportBranch}, 1, "", tc.raw)
			if err != nil {
				t.Fatal(err)
			}
			if row.State != tc.wantState {
				t.Fatalf("state = %s, want %s (%v)", row.State, tc.wantState, row.ValidationError)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestSourceInternalCodeAndLocationRemainMetadataOnly(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT placement_policy FROM asset_types WHERE code=$1")).WithArgs("SWITCH").WillReturnRows(sqlmock.NewRows([]string{"placement_policy"}).AddRow("HOUSING"))
	row, err := normalizeCanonicalImportRow(context.Background(), database, CanonicalImportScope{TenantID: testImportTenant, BranchID: testImportBranch}, 1, "", map[string]interface{}{
		"asset_type_code": "SWITCH", "internal_code": "IMP-1234", "location_id": testImportZoneA,
	})
	if err != nil {
		t.Fatal(err)
	}
	if row.State != "VALID" || row.Payload.SourceInternalCode != "IMP-1234" || row.Payload.SourceLocationID != testImportZoneA {
		t.Fatalf("unexpected normalized row: %+v", row)
	}
}

func TestStageCanonicalImportRowsUsesSecureFunctionsOnly(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT placement_policy FROM asset_types WHERE code=$1")).WithArgs("MDF").WillReturnRows(sqlmock.NewRows([]string{"placement_policy"}).AddRow("ZONE"))
	mock.ExpectQuery("SELECT id::text, upper\\(code\\) FROM zones").WithArgs(testImportZoneA, testImportTenant, testImportBranch).WillReturnRows(sqlmock.NewRows([]string{"id", "code"}).AddRow(testImportZoneA, "PROD"))
	mock.ExpectQuery("SELECT result_code,row_id,row_status FROM public.stage_inventory_import_row").WillReturnRows(sqlmock.NewRows([]string{"result_code", "row_id", "row_status"}).AddRow("ROW_STAGED", 91, "VALID"))
	mock.ExpectQuery("SELECT public.update_inventory_import_progress").WithArgs(int64(77), 1, 1, 0).WillReturnRows(sqlmock.NewRows([]string{"result"}).AddRow("PROGRESS_UPDATED"))
	mock.ExpectQuery("SELECT result_code,aggregate_state FROM public.finalize_inventory_import_staging").WithArgs(int64(77)).WillReturnRows(sqlmock.NewRows([]string{"result_code", "aggregate_state"}).AddRow("STAGING_FINALIZED", "READY"))

	summary, err := stageCanonicalImportRows(context.Background(), database,
		CanonicalImportScope{TenantID: testImportTenant, BranchID: testImportBranch}, 77, "", []map[string]interface{}{{
			"asset_type_code": "MDF", "zone_id": testImportZoneA, "internal_code": "IMP-NOT-AUTHORITY",
		}})
	if err != nil {
		t.Fatal(err)
	}
	if summary.Total != 1 || summary.Valid != 1 || summary.Invalid != 0 || summary.State != "READY" {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestPreviewDelegatesToCanonicalNormalizer(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT placement_policy FROM asset_types WHERE code=$1")).WithArgs("SWITCH").WillReturnRows(sqlmock.NewRows([]string{"placement_policy"}).AddRow("HOUSING"))
	preview, err := previewCanonicalImportRow(context.Background(), database,
		CanonicalImportScope{TenantID: testImportTenant, BranchID: testImportBranch}, 3, "SWITCH", map[string]interface{}{"name": " Access 01 "})
	if err != nil {
		t.Fatal(err)
	}
	if preview.State != "VALID" || preview.Payload.Name != "Access 01" {
		t.Fatalf("unexpected preview: %+v", preview)
	}
}
