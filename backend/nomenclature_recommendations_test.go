package main

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestReadActiveSystemNamingPresetsSuccessAndEmpty(t *testing.T) {
	db, mock := domainMock(t)
	mock.ExpectQuery("FROM public.read_active_system_naming_presets").WithArgs(`{"MDF","IDF"}`).
		WillReturnRows(sqlmock.NewRows([]string{"asset_type_code", "preset_version", "prefix", "separator", "include_branch", "include_placement", "seq_digits"}).
			AddRow("IDF", 1, "IDF", "-", true, false, 3).
			AddRow("MDF", 2, "MDF", "-", true, false, 3))
	presets, err := ReadActiveSystemNamingPresets(context.Background(), db, []string{" mdf ", "IDF", "MDF"})
	if err != nil || len(presets) != 2 || presets[0].AssetTypeCode != "IDF" || presets[1].Version != 2 {
		t.Fatalf("presets=%+v err=%v", presets, err)
	}
	empty, err := ReadActiveSystemNamingPresets(context.Background(), db, nil)
	if err != nil || len(empty) != 0 {
		t.Fatalf("empty=%+v err=%v", empty, err)
	}
	if err = mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestReadActiveSystemNamingPresetsInvalidTypeFailsBeforeSQL(t *testing.T) {
	db, mock := domainMock(t)
	_, err := ReadActiveSystemNamingPresets(context.Background(), db, []string{"MDF'); DELETE FROM system_naming_presets; --"})
	if !errors.Is(err, ErrInvalidSystemPresetType) {
		t.Fatalf("err=%v", err)
	}
	if err = mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("invalid input touched database: %v", err)
	}
}

func TestReadActiveSystemNamingPresetsDatabaseError(t *testing.T) {
	db, mock := domainMock(t)
	mock.ExpectQuery("FROM public.read_active_system_naming_presets").WithArgs(`{"SWITCH"}`).WillReturnError(sql.ErrTxDone)
	_, err := ReadActiveSystemNamingPresets(context.Background(), db, []string{"SWITCH"})
	if err == nil {
		t.Fatal("expected database error")
	}
}

func TestPresetReaderFeedsPureApplyService(t *testing.T) {
	db, mock := domainMock(t)
	mock.ExpectQuery("FROM public.read_active_system_naming_presets").WithArgs(`{"MDF"}`).
		WillReturnRows(sqlmock.NewRows([]string{"asset_type_code", "preset_version", "prefix", "separator", "include_branch", "include_placement", "seq_digits"}).
			AddRow("MDF", 1, "MDF", "-", true, false, 3))
	presets, err := ReadActiveSystemNamingPresets(context.Background(), db, []string{"MDF"})
	if err != nil {
		t.Fatal(err)
	}
	mock.ExpectQuery("SELECT id,prefix,separator,seq_digits,last_seq,include_branch,include_placement").WithArgs("t1", "MDF").WillReturnError(sql.ErrNoRows)
	mock.ExpectExec("INSERT INTO naming_rules").WillReturnResult(sqlmock.NewResult(1, 1))
	result, err := ApplyRecommendedNomenclature(context.Background(), db, "t1", presets)
	if err != nil || len(result.Created) != 1 {
		t.Fatalf("result=%+v err=%v", result, err)
	}
}

func TestPreviewRecommendedCodeDoesNotTouchDatabase(t *testing.T) {
	got := PreviewRecommendedCode(SystemPreset{Prefix: "SW", Separator: "-", SeqDigits: 4, IncludeBranch: true, IncludePlacement: true}, "TJ", "Z1", 1)
	if got != "SW-TJ-Z1-0001" {
		t.Fatalf("preview=%q", got)
	}
}

func TestApplyRecommendedNomenclatureIdempotencyAndConflicts(t *testing.T) {
	db, mock := domainMock(t)
	query := "SELECT id,prefix,separator,seq_digits,last_seq,include_branch,include_placement"
	mock.ExpectQuery(query).WithArgs("t1", "MDF").WillReturnError(sql.ErrNoRows)
	mock.ExpectExec("INSERT INTO naming_rules").WithArgs(sqlmock.AnyArg(), "t1", "MDF", "MDF", "-", true, false, 3).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(query).WithArgs("t1", "IDF").WillReturnRows(sqlmock.NewRows([]string{"id", "prefix", "separator", "seq_digits", "last_seq", "include_branch", "include_placement"}).AddRow("r1", "IDF", "-", 3, 0, true, false))
	mock.ExpectQuery(query).WithArgs("t1", "SWITCH").WillReturnRows(sqlmock.NewRows([]string{"id", "prefix", "separator", "seq_digits", "last_seq", "include_branch", "include_placement"}).AddRow("r2", "CUSTOM", "-", 4, 7, true, true))
	presets := []SystemPreset{{AssetTypeCode: "MDF", Prefix: "MDF", Separator: "-", SeqDigits: 3, IncludeBranch: true}, {AssetTypeCode: "IDF", Prefix: "IDF", Separator: "-", SeqDigits: 3, IncludeBranch: true}, {AssetTypeCode: "SWITCH", Prefix: "SW", Separator: "-", SeqDigits: 4, IncludeBranch: true, IncludePlacement: true}}
	r, err := ApplyRecommendedNomenclature(context.Background(), db, "t1", presets)
	if err != nil || len(r.Created) != 1 || len(r.Unchanged) != 1 || len(r.Conflicts) != 1 || r.Conflicts[0].Reason != "ISSUED_RULE_IMMUTABLE" {
		t.Fatalf("r=%+v err=%v", r, err)
	}
	if err = mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestApplyRecommendedNomenclatureRollbackSurface(t *testing.T) {
	db, mock := domainMock(t)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id,prefix,separator,seq_digits,last_seq,include_branch,include_placement")).WithArgs("t1", "MDF").WillReturnError(sql.ErrNoRows)
	mock.ExpectExec("INSERT INTO naming_rules").WillReturnError(sql.ErrTxDone)
	_, err := ApplyRecommendedNomenclature(context.Background(), db, "t1", []SystemPreset{{AssetTypeCode: "MDF", Prefix: "MDF", Separator: "-", SeqDigits: 3}})
	if err == nil {
		t.Fatal("expected transaction error")
	}
}
