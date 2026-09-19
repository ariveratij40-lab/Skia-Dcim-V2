package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestGenerateInternalCodeRequiresActiveNomenclature(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectQuery("SELECT id,asset_type_code,prefix,separator").
		WithArgs("tenant-1", "SWITCH").
		WillReturnRows(sqlmock.NewRows([]string{"id", "asset_type_code", "prefix", "separator", "seq_digits", "last_seq", "include_branch", "include_site", "include_floor", "include_zone", "include_distribution", "include_housing", "include_placement", "include_internal_area", "context_mode", "sequence_scope", "custom_segment_1", "custom_segment_2"}))

	_, err = (&DCIMHandler{}).generateInternalCode(database, "tenant-1", "branch-1", "SWITCH")
	if !errors.Is(err, ErrNomenclatureRequired) {
		t.Fatalf("expected nomenclature_required, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestNomenclatureAPIErrorContract(t *testing.T) {
	recorder := httptest.NewRecorder()
	writeManagedAssetError(recorder, ErrNomenclatureRequired, "SWITCH")
	if recorder.Code != http.StatusUnprocessableEntity || !strings.Contains(recorder.Body.String(), `"error":"nomenclature_required"`) || !strings.Contains(recorder.Body.String(), `"asset_type":"switch"`) {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	recorder = httptest.NewRecorder()
	writeManagedAssetError(recorder, ErrManualAssetCode, "SWITCH")
	if recorder.Code != http.StatusUnprocessableEntity || !strings.Contains(recorder.Body.String(), `"error":"manual_code_not_allowed"`) {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestGenerateInternalCodeUsesLockedSequence(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectQuery("SELECT id,asset_type_code,prefix,separator").
		WithArgs("tenant-1", "SWITCH").
		WillReturnRows(sqlmock.NewRows([]string{"id", "asset_type_code", "prefix", "separator", "seq_digits", "last_seq", "include_branch", "include_site", "include_floor", "include_zone", "include_distribution", "include_housing", "include_placement", "include_internal_area", "context_mode", "sequence_scope", "custom_segment_1", "custom_segment_2"}).
			AddRow("rule-1", "SWITCH", "SW", "-", 4, 41, true, false, false, false, false, false, false, false, NomenclatureContextLegacyInternalArea, NomenclatureSequenceBranch, "EDGE", "CORE"))
	mock.ExpectQuery("SELECT code FROM branches").WithArgs("branch-1", "tenant-1").WillReturnRows(sqlmock.NewRows([]string{"code"}).AddRow("TJ"))
	mock.ExpectExec("INSERT INTO nomenclature_branch_counters").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT last_seq FROM nomenclature_branch_counters").WithArgs("rule-1", "branch-1").WillReturnRows(sqlmock.NewRows([]string{"last_seq"}).AddRow(41))
	mock.ExpectExec("UPDATE nomenclature_branch_counters").WithArgs(42, "rule-1", "branch-1").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE naming_rules SET last_seq=GREATEST").WithArgs(42, "rule-1", "tenant-1").WillReturnResult(sqlmock.NewResult(0, 1))

	assignment, err := (&DCIMHandler{}).generateInternalCode(database, "tenant-1", "branch-1", "SWITCH")
	if err != nil {
		t.Fatal(err)
	}
	if assignment.ID != "rule-1" || assignment.Sequence != 42 || assignment.Code != "SW-TJ-EDGE-CORE-0042" {
		t.Fatalf("unexpected assignment: %#v", assignment)
	}
	preview := namingRulePreview(namingRuleResponse{
		Prefix: "SW", Separator: "-", IncludeBranch: true, SeqDigits: 4,
		LastSeq: 41, CustomSegment1: "EDGE", CustomSegment2: "CORE",
	})
	if strings.Replace(preview, "[SUCURSAL]", "TJ", 1) != assignment.Code {
		t.Fatalf("preview %q does not match generated code %q", preview, assignment.Code)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestManagedAssetRejectsManualCodeAndRequiresIndependentName(t *testing.T) {
	if _, err := reserveManagedAsset(nil, "tenant-1", "branch-1", "user-1", managedAssetInput{
		AssetTypeCode: "SWITCH", Name: "Switch Patio", ManualCode: "SW-ARBITRARY-1",
	}); !errors.Is(err, ErrManualAssetCode) {
		t.Fatalf("expected manual code rejection, got %v", err)
	}
	if _, err := reserveManagedAsset(nil, "tenant-1", "branch-1", "user-1", managedAssetInput{
		AssetTypeCode: "SWITCH",
	}); !errors.Is(err, ErrAssetNameNeeded) {
		t.Fatalf("expected descriptive name requirement, got %v", err)
	}
}
