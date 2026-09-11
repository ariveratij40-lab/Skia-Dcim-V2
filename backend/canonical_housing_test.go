package main

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func expectDistribution(mock sqlmock.Sqlmock, id, tenant, branch, typ, location string) {
	mock.ExpectQuery("SELECT m.id,m.asset_id,m.type").WithArgs(id, tenant, branch).
		WillReturnRows(sqlmock.NewRows([]string{"id", "asset_id", "type", "location_id", "zone_id", "internal_area_id", "status"}).
			AddRow(id, "distribution-asset", typ, location, "zone-1", nil, "active"))
	mock.ExpectQuery("SELECT z.id,z.tenant_id,z.branch_id").WithArgs("zone-1", tenant, branch).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "branch_id", "code", "name", "status", "building_id", "building_code", "floor_id", "floor_name"}).
			AddRow("zone-1", tenant, branch, "ZONE1", "Zone 1", "active", nil, nil, nil, nil))
}

func expectHousing(mock sqlmock.Sqlmock, id, tenant, branch, location string) {
	mock.ExpectQuery("SELECT r.id,r.id,r.asset_id").WithArgs(id, tenant, branch).
		WillReturnRows(sqlmock.NewRows([]string{"id", "rack_id", "asset_id", "housing_type", "mdf_idf_id", "location_id"}).
			AddRow(id, id, "rack-asset", "RACK", "distribution-1", location))
	expectDistribution(mock, "distribution-1", tenant, branch, "MDF", location)
}

func TestResolveCanonicalRackDerivesDistributionPlacement(t *testing.T) {
	db, mock := domainMock(t)
	expectDistribution(mock, "distribution-1", "tenant-1", "branch-1", "MDF", "location-1")
	state, err := ResolveCanonicalHousing(context.Background(), db, PhysicalScope{"tenant-1", "branch-1"}, CanonicalHousingRequest{AssetTypeCode: "RACK", DistributionPointID: "distribution-1"})
	if err != nil || state.LocationID != "location-1" || state.DistributionPointID != "distribution-1" || state.MountMode != "NONE" {
		t.Fatalf("state=%+v err=%v", state, err)
	}
	// Scoped SQL returning no rows is deliberately indistinguishable for foreign tenant/branch.
	mock.ExpectQuery("SELECT m.id,m.asset_id,m.type").WithArgs("missing", "tenant-1", "branch-1").WillReturnError(sql.ErrNoRows)
	if _, err = ResolveCanonicalHousing(context.Background(), db, PhysicalScope{"tenant-1", "branch-1"}, CanonicalHousingRequest{AssetTypeCode: "RACK", DistributionPointID: "missing"}); !errors.Is(err, ErrDistributionPointNotFound) {
		t.Fatalf("err=%v", err)
	}
}

func TestResolveCanonicalRackMountedEquipment(t *testing.T) {
	for _, code := range []string{"SWITCH", "PATCH_PANEL", "PDU"} {
		t.Run(code, func(t *testing.T) {
			db, mock := domainMock(t)
			expectHousing(mock, "rack-1", "tenant-1", "branch-1", "location-1")
			state, err := ResolveCanonicalHousing(context.Background(), db, PhysicalScope{"tenant-1", "branch-1"}, CanonicalHousingRequest{AssetTypeCode: code, HousingRackID: "rack-1"})
			if err != nil || state.MountMode != "RACK_MOUNTED" || state.HousingRackID != "rack-1" || state.LocationID != "location-1" {
				t.Fatalf("state=%+v err=%v", state, err)
			}
		})
	}
}

func TestResolveCanonicalUPSExplicitModes(t *testing.T) {
	db, mock := domainMock(t)
	expectHousing(mock, "rack-1", "tenant-1", "branch-1", "location-1")
	state, err := ResolveCanonicalHousing(context.Background(), db, PhysicalScope{"tenant-1", "branch-1"}, CanonicalHousingRequest{AssetTypeCode: "UPS", MountMode: "RACK_MOUNTED", HousingRackID: "rack-1"})
	if err != nil || state.HousingRackID != "rack-1" || state.LocationID != "location-1" {
		t.Fatalf("rack state=%+v err=%v", state, err)
	}
	mock.ExpectQuery("SELECT id,tenant_id,branch_id,placement_type").WithArgs("room-1", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "branch_id", "placement_type", "name", "status"}).AddRow("room-1", "tenant-1", "branch-1", "WAREHOUSE", "Room", "active"))
	state, err = ResolveCanonicalHousing(context.Background(), db, PhysicalScope{"tenant-1", "branch-1"}, CanonicalHousingRequest{AssetTypeCode: "UPS", MountMode: "ROOM_MOUNTED", PlacementID: "room-1"})
	if err != nil || state.HousingRackID != "" || state.LocationID != "room-1" {
		t.Fatalf("room state=%+v err=%v", state, err)
	}
	if _, err = ResolveCanonicalHousing(context.Background(), db, PhysicalScope{"tenant-1", "branch-1"}, CanonicalHousingRequest{AssetTypeCode: "UPS", MountMode: "NONE"}); !errors.Is(err, ErrInvalidMountMode) {
		t.Fatalf("invalid mode err=%v", err)
	}
	if _, err = ResolveCanonicalHousing(context.Background(), db, PhysicalScope{"tenant-1", "branch-1"}, CanonicalHousingRequest{AssetTypeCode: "UPS", MountMode: "ROOM_MOUNTED", PlacementID: "room-1", HousingRackID: "rack-1"}); !errors.Is(err, ErrHousingForbidden) {
		t.Fatalf("forbidden housing err=%v", err)
	}
}

func TestCanonicalResolversHideForeignScope(t *testing.T) {
	db, mock := domainMock(t)
	mock.ExpectQuery("SELECT m.id,m.asset_id,m.type").WithArgs("foreign-distribution", "tenant-1", "branch-1").WillReturnError(sql.ErrNoRows)
	if _, err := ResolveDistributionPoint(context.Background(), db, PhysicalScope{"tenant-1", "branch-1"}, "foreign-distribution", false); !errors.Is(err, ErrDistributionNotFound) {
		t.Fatalf("distribution err=%v", err)
	}
	mock.ExpectQuery("SELECT r.id,r.id,r.asset_id").WithArgs("foreign-rack", "tenant-1", "branch-1").WillReturnError(sql.ErrNoRows)
	if _, err := ResolveHousing(context.Background(), db, PhysicalScope{"tenant-1", "branch-1"}, "foreign-rack"); !errors.Is(err, ErrHousingNotFound) {
		t.Fatalf("housing err=%v", err)
	}
	mock.ExpectQuery("SELECT id,tenant_id,branch_id,placement_type").WithArgs("foreign-room", "tenant-1", "branch-1").WillReturnError(sql.ErrNoRows)
	if _, err := ResolveRoomPlacement(context.Background(), db, PhysicalScope{"tenant-1", "branch-1"}, "foreign-room"); !errors.Is(err, ErrPlacementNotFound) {
		t.Fatalf("placement err=%v", err)
	}
}
