package main

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func exactPresetColumns() []string {
	return []string{"lookup_status", "id", "preset_code", "asset_type_code", "preset_version", "prefix", "separator", "include_branch", "include_building", "include_floor", "include_zone", "include_distribution", "include_housing", "include_placement", "context_mode", "sequence_scope", "seq_digits", "custom_segment_1", "custom_segment_2", "custom_segment_1_label", "custom_segment_2_label", "description", "active"}
}

func TestReadExactSystemNamingPresetV2Statuses(t *testing.T) {
	for _, tc := range []struct {
		name, status string
		active       bool
		wantErr      error
	}{
		{name: "active", status: "FOUND_ACTIVE", active: true},
		{name: "inactive", status: "FOUND_INACTIVE", active: false, wantErr: ErrNomenclaturePresetInactive},
		{name: "not found", status: "NOT_FOUND", wantErr: ErrNomenclaturePresetNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			row := sqlmock.NewRows(exactPresetColumns())
			if tc.status == "NOT_FOUND" {
				row.AddRow(tc.status, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)
			} else {
				row.AddRow(tc.status, "10000000-0000-4000-8000-000000000001", "SWITCH_V1", "SWITCH", 1, "SW", "-", true, false, false, false, false, false, false, NomenclatureContextLegacyInternalArea, NomenclatureSequenceBranch, 3, nil, nil, nil, nil, "Switch", tc.active)
			}
			mock.ExpectQuery(regexp.QuoteMeta("FROM public.read_system_naming_preset_v2($1,$2)")).WithArgs("SWITCH", 1).WillReturnRows(row)
			preset, gotErr := ReadExactSystemNamingPresetV2(context.Background(), db, " switch ", 1)
			if !errors.Is(gotErr, tc.wantErr) {
				t.Fatalf("error=%v want=%v", gotErr, tc.wantErr)
			}
			if tc.wantErr == nil && (preset.Policy.AssetTypeCode != "SWITCH" || preset.Policy.SequenceDigits != 3) {
				t.Fatalf("lossy policy: %#v", preset.Policy)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestResolveNomenclatureActorPrefersDatabaseSuperAdmin(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectQuery("ORDER BY CASE r.name WHEN 'super_admin'").WithArgs("tenant", "actor").WillReturnRows(
		sqlmock.NewRows([]string{"id", "email", "name", "role"}).AddRow("actor", " ADMIN@Example.Invalid ", "Admin", "super_admin"))
	a, err := resolveNomenclatureActor(context.Background(), db, "tenant", "actor")
	if err != nil {
		t.Fatal(err)
	}
	if a.Role != "super_admin" || a.Email != "admin@example.invalid" {
		t.Fatalf("actor not normalized: %#v", a)
	}
}

func TestResolveNomenclatureActorViewerDenied(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectQuery("SELECT u.id,u.email,u.name,r.name").WithArgs("tenant", "viewer").WillReturnError(sql.ErrNoRows)
	_, err = resolveNomenclatureActor(context.Background(), db, "tenant", "viewer")
	if !errors.Is(err, ErrNomenclatureUnauthorized) {
		t.Fatalf("viewer error=%v", err)
	}
}

func TestBeginAuthenticatedTenantTxUsesTransactionLocalActor(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT set_config('app.tenant_id', $1, true)")).WithArgs("tenant").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta("SELECT set_config('app.branch_id', $1, true)")).WithArgs("branch").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta("SELECT set_config('app.user_id', $1, true)")).WithArgs("actor").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectRollback()
	tx, err := BeginAuthenticatedTenantTx(context.Background(), db, "tenant", "branch", "actor")
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestLegacyTenantTxDoesNotAcquireActorAuthority(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT set_config('app.tenant_id', $1, true)")).WithArgs("tenant").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectRollback()
	tx, err := BeginTenantTx(context.Background(), db, "tenant", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestAcceptanceRejectsSpoofedOrMissingActorContext(t *testing.T) {
	input := AcceptPresetInput{AssetTypeCode: "SWITCH", PresetVersion: 1, OperationID: "10000000-0000-4000-8000-000000000001"}
	if _, err := AcceptNomenclaturePreset(context.Background(), nil, "tenant", "actor", input); !errors.Is(err, ErrNomenclatureUnauthorized) {
		t.Fatalf("missing authenticated context accepted: %v", err)
	}
	ctx := withTenantIdentity(context.Background(), "trusted", "tenant", "branch")
	if _, err := AcceptNomenclaturePreset(ctx, nil, "tenant", "spoofed", input); !errors.Is(err, ErrNomenclatureUnauthorized) {
		t.Fatalf("spoofed actor accepted: %v", err)
	}
	if _, err := CustomizeNomenclatureRule(ctx, nil, "other-tenant", "trusted", CustomizeNomenclatureInput{}); !errors.Is(err, ErrNomenclatureUnauthorized) {
		t.Fatalf("spoofed tenant accepted: %v", err)
	}
}
