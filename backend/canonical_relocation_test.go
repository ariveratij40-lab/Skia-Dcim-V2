package main

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestRelocateCanonicalEquipmentUpdatesAuthorityAndAudit(t *testing.T) {
	db, mock := domainMock(t)
	current := canonicalRelocationSnapshot{
		AssetType: "SWITCH", LocationID: "location-old", HousingRackID: "rack-old", MountMode: "RACK_MOUNTED",
	}
	target := CanonicalHousingState{LocationID: "location-new", HousingRackID: "rack-new", MountMode: "RACK_MOUNTED"}

	mock.ExpectExec(regexp.QuoteMeta("UPDATE assets SET location_id=$1,housing_rack_id=NULLIF($2,'')::uuid,mount_mode=$3,updated_at=NOW()")) .
		WithArgs("location-new", "rack-new", "RACK_MOUNTED", "asset-1", "tenant-1", "branch-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO asset_logs").
		WithArgs("tenant-1", "asset-1", sqlmock.AnyArg(), sqlmock.AnyArg(), "Relocalización canónica de equipo", "user-1").
		WillReturnResult(sqlmock.NewResult(1, 1))

	result, err := relocateCanonicalEquipment(context.Background(), db, "user-1", "tenant-1", "branch-1", "asset-1", current, target)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Changed || result.AssetType != "SWITCH" || result.LocationID != "location-new" || result.HousingRackID != "rack-new" || result.MountMode != "RACK_MOUNTED" {
		t.Fatalf("unexpected result: %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRelocateCanonicalRackCascadesChildrenAndAudits(t *testing.T) {
	db, mock := domainMock(t)
	current := canonicalRelocationSnapshot{AssetType: "RACK", LocationID: "location-old", MountMode: "NONE"}
	target := CanonicalHousingState{LocationID: "location-new", DistributionPointID: "distribution-new", MountMode: "NONE"}

	mock.ExpectQuery("SELECT id::text,mdf_idf_id::text FROM racks").
		WithArgs("rack-asset", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows([]string{"id", "mdf_idf_id"}).AddRow("rack-satellite", "distribution-old"))
	mock.ExpectQuery("SELECT id::text,COALESCE\\(location_id::text,''\\),COALESCE\\(housing_rack_id::text,''\\),COALESCE\\(mount_mode,'NONE'\\)").
		WithArgs("rack-satellite", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows([]string{"id", "location_id", "housing_rack_id", "mount_mode"}).
			AddRow("child-1", "location-old", "rack-satellite", "RACK_MOUNTED").
			AddRow("child-2", "location-new", "rack-satellite", "RACK_MOUNTED"))
	mock.ExpectExec("UPDATE racks SET mdf_idf_id=\\$1").
		WithArgs("distribution-new", "rack-satellite", "tenant-1", "branch-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE assets SET location_id=\\$1,mount_mode='NONE',housing_rack_id=NULL").
		WithArgs("location-new", "rack-asset", "tenant-1", "branch-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE assets SET location_id=\\$1,updated_at=NOW\\(\\)").
		WithArgs("location-new", "rack-satellite", "tenant-1", "branch-1").
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec("INSERT INTO asset_logs").
		WithArgs("tenant-1", "rack-asset", sqlmock.AnyArg(), sqlmock.AnyArg(), "Relocalización canónica de Rack", "user-1").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO asset_logs").
		WithArgs("tenant-1", "child-1", sqlmock.AnyArg(), sqlmock.AnyArg(), "Cascada de relocalización por movimiento de Rack", "user-1").
		WillReturnResult(sqlmock.NewResult(2, 1))

	result, err := relocateCanonicalRack(context.Background(), db, "user-1", "tenant-1", "branch-1", "rack-asset", current, target)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Changed || result.DistributionPointID != "distribution-new" || result.LocationID != "location-new" || result.CascadedAssets != 2 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCanonicalRelocationHidesForeignAssetScope(t *testing.T) {
	db, mock := domainMock(t)
	mock.ExpectQuery("SELECT at.code,a.asset_type_id::text").
		WithArgs("foreign-asset", "tenant-1", "branch-1").WillReturnError(sql.ErrNoRows)

	_, err := relocateCanonicalAsset(context.Background(), db, "user-1", "tenant-1", "branch-1", CanonicalRelocationRequest{AssetID: "foreign-asset", HousingRackID: "rack-1"})
	if !errors.Is(err, ErrRelocationAssetNotFound) {
		t.Fatalf("expected scoped not-found, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCanonicalRelocationRejectsIncompatibleDestinationFields(t *testing.T) {
	db, mock := domainMock(t)
	mock.ExpectQuery("SELECT at.code,a.asset_type_id::text").
		WithArgs("switch-1", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows([]string{"code", "asset_type_id", "location_id", "housing_rack_id", "mount_mode"}).
			AddRow("SWITCH", "type-switch", "location-1", "rack-1", "RACK_MOUNTED"))

	_, err := relocateCanonicalAsset(context.Background(), db, "user-1", "tenant-1", "branch-1", CanonicalRelocationRequest{
		AssetID: "switch-1", HousingRackID: "rack-2", PlacementID: "room-1",
	})
	if !errors.Is(err, ErrInvalidPayload) {
		t.Fatalf("expected invalid payload, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
