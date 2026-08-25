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
	mock.ExpectQuery("SELECT id, prefix, separator").
		WithArgs("tenant-1", "SWITCH").
		WillReturnRows(sqlmock.NewRows([]string{"id", "prefix", "separator", "seq_digits", "last_seq", "include_branch", "custom_segment_1", "custom_segment_2"}))

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
	mock.ExpectQuery("SELECT id, prefix, separator").
		WithArgs("tenant-1", "SWITCH").
		WillReturnRows(sqlmock.NewRows([]string{"id", "prefix", "separator", "seq_digits", "last_seq", "include_branch", "custom_segment_1", "custom_segment_2"}).
			AddRow("rule-1", "SW", "-", 3, 41, false, "TIJ", ""))
	mock.ExpectExec("UPDATE naming_rules SET last_seq").
		WithArgs(42, "rule-1", "tenant-1").WillReturnResult(sqlmock.NewResult(0, 1))

	assignment, err := (&DCIMHandler{}).generateInternalCode(database, "tenant-1", "branch-1", "SWITCH")
	if err != nil {
		t.Fatal(err)
	}
	if assignment.ID != "rule-1" || assignment.Sequence != 42 || assignment.Code != "SW-TIJ-042" {
		t.Fatalf("unexpected assignment: %#v", assignment)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestManagedAssetRejectsManualCodeAndRequiresIndependentName(t *testing.T) {
	if _, err := beginManagedAsset(nil, "tenant-1", "branch-1", "user-1", managedAssetInput{
		AssetTypeCode: "SWITCH", Name: "Switch Patio", ManualCode: "SW-ARBITRARY-1",
	}); !errors.Is(err, ErrManualAssetCode) {
		t.Fatalf("expected manual code rejection, got %v", err)
	}
	if _, err := beginManagedAsset(nil, "tenant-1", "branch-1", "user-1", managedAssetInput{
		AssetTypeCode: "SWITCH",
	}); !errors.Is(err, ErrAssetNameNeeded) {
		t.Fatalf("expected descriptive name requirement, got %v", err)
	}
}
