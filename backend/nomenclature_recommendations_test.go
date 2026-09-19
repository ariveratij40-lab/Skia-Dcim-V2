package main

import (
	"context"
	"database/sql"
	"errors"
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

func TestPreviewRecommendedCodeDoesNotTouchDatabase(t *testing.T) {
	got := PreviewRecommendedCode(SystemPreset{Prefix: "SW", Separator: "-", SeqDigits: 4, IncludeBranch: true, IncludePlacement: true}, "TJ", "Z1", 1)
	if got != "SW-TJ-Z1-0001" {
		t.Fatalf("preview=%q", got)
	}
}
