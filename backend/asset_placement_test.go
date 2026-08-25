package main

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestResolveAssetPlacementIsTenantBranchScoped(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectQuery("SELECT id,placement_type").WithArgs("p1", "t1", "b1").WillReturnRows(sqlmock.NewRows([]string{"id", "placement_type", "branch_id", "placement_code", "name", "status"}).AddRow("p1", "IDF", "b1", "IDF01", "IDF 01", "active"))
	p, err := ResolveAssetPlacement(context.Background(), db, AssetPlacementContext{TenantID: "t1", BranchID: "b1", PlacementID: "p1"})
	if err != nil || p.CanonicalCode != "IDF01" {
		t.Fatalf("placement=%#v err=%v", p, err)
	}
	mock.ExpectQuery("SELECT id,placement_type").WithArgs("p1", "t1", "b2").WillReturnError(sql.ErrNoRows)
	_, err = ResolveAssetPlacement(context.Background(), db, AssetPlacementContext{TenantID: "t1", BranchID: "b2", PlacementID: "p1"})
	if !errors.Is(err, ErrInvalidAssetPlacement) {
		t.Fatalf("cross branch err=%v", err)
	}
	if err = mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestInstallableAssetRequiresPlacementBeforeSequence(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mock.ExpectQuery("SELECT id FROM asset_types").WithArgs("SWITCH").WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("at1"))
	_, err = reserveManagedAsset(db, "t1", "b1", "u1", managedAssetInput{AssetTypeCode: "SWITCH", Name: "Switch"})
	if !errors.Is(err, ErrInvalidAssetPlacement) {
		t.Fatalf("err=%v", err)
	}
	if err = mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
