package main

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func domainMock(t *testing.T) (*sql.DB, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db, mock
}

func expectZone(mock sqlmock.Sqlmock, zone, tenant, branch string, building, floor interface{}) {
	mock.ExpectQuery("SELECT z.id,z.tenant_id,z.branch_id").WithArgs(zone, tenant, branch).
		WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "branch_id", "code", "name", "status", "building_id", "building_code", "floor_id", "floor_name"}).
			AddRow(zone, tenant, branch, "Z1", "Zone", "active", building, building, floor, floor))
}

func TestResolveCanonicalZoneOptionalParentsAndScope(t *testing.T) {
	db, mock := domainMock(t)
	expectZone(mock, "z1", "t1", "b1", nil, nil)
	z, err := ResolveCanonicalZone(context.Background(), db, PhysicalScope{"t1", "b1"}, "z1")
	if err != nil || z.BuildingID != "" || z.FloorID != "" {
		t.Fatalf("optional parents: z=%+v err=%v", z, err)
	}
	mock.ExpectQuery("SELECT z.id,z.tenant_id,z.branch_id").WithArgs("z-other", "t1", "b1").WillReturnError(sql.ErrNoRows)
	if _, err = ResolveCanonicalZone(context.Background(), db, PhysicalScope{"t1", "b1"}, "z-other"); !errors.Is(err, ErrZoneNotFound) {
		t.Fatalf("cross scope err=%v", err)
	}
	if err = mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestResolveCanonicalZoneBuildingFloorConsistency(t *testing.T) {
	db, mock := domainMock(t)
	expectZone(mock, "z1", "t1", "b1", "site1", "floor1")
	z, err := ResolveCanonicalZone(context.Background(), db, PhysicalScope{"t1", "b1"}, "z1")
	if err != nil || z.BuildingID != "site1" || z.FloorID != "floor1" {
		t.Fatalf("resolved=%+v err=%v", z, err)
	}
	mock.ExpectQuery("SELECT z.id,z.tenant_id,z.branch_id").WithArgs("bad", "t1", "b1").WillReturnError(sql.ErrNoRows)
	if _, err = ResolveCanonicalZone(context.Background(), db, PhysicalScope{"t1", "b1"}, "bad"); !errors.Is(err, ErrZoneNotFound) {
		t.Fatal(err)
	}
}

func TestDistributionLegacyReadAndV2Requirement(t *testing.T) {
	db, mock := domainMock(t)
	rows := func() *sqlmock.Rows {
		return sqlmock.NewRows([]string{"id", "asset_id", "type", "location_id", "zone_id", "internal_area_id", "status"}).AddRow("m1", "a1", "MDF", "l1", nil, "ia1", "active")
	}
	mock.ExpectQuery("SELECT m.id,m.asset_id,m.type").WithArgs("m1", "t1", "b1").WillReturnRows(rows())
	d, err := ResolveDistributionPoint(context.Background(), db, PhysicalScope{"t1", "b1"}, "m1", true)
	if err != nil || !d.Legacy {
		t.Fatalf("legacy=%+v err=%v", d, err)
	}
	mock.ExpectQuery("SELECT m.id,m.asset_id,m.type").WithArgs("m1", "t1", "b1").WillReturnRows(rows())
	if _, err = ResolveDistributionPoint(context.Background(), db, PhysicalScope{"t1", "b1"}, "m1", false); !errors.Is(err, ErrDistributionNotFound) {
		t.Fatal(err)
	}
}

func TestHousingRackAndCabinetResolveScopedDistribution(t *testing.T) {
	for _, typ := range []string{"RACK", "CABINET"} {
		t.Run(typ, func(t *testing.T) {
			db, mock := domainMock(t)
			mock.ExpectQuery("SELECT r.id,r.id,r.asset_id").WithArgs("h1", "t1", "b1").WillReturnRows(sqlmock.NewRows([]string{"id", "rack_id", "asset_id", "housing_type", "mdf_idf_id", "location_id"}).AddRow("h1", "h1", "a1", typ, "m1", "l1"))
			mock.ExpectQuery("SELECT m.id,m.asset_id,m.type").WithArgs("m1", "t1", "b1").WillReturnRows(sqlmock.NewRows([]string{"id", "asset_id", "type", "location_id", "zone_id", "internal_area_id", "status"}).AddRow("m1", "ma", "MDF", "ml", nil, "ia", "active"))
			h, err := ResolveHousing(context.Background(), db, PhysicalScope{"t1", "b1"}, "h1")
			if err != nil || h.Type != typ || h.RackID != h.ID {
				t.Fatalf("h=%+v err=%v", h, err)
			}
		})
	}
}

func TestPlacementPolicyAndUPSDefaults(t *testing.T) {
	tests := []struct {
		code, subtype               string
		dbValue                     interface{}
		policy                      PlacementPolicy
		dist, housing, relationship bool
	}{
		{"BRANCH_ASSET", "", "BRANCH", PolicyBranch, false, false, false},
		{"NODE", "", "ZONE", PolicyZone, false, false, false},
		{"RACK", "", "MDF_IDF", PolicyMDFIDF, true, false, false},
		{"SWITCH", "", "HOUSING", PolicyHousing, false, true, false},
		{"UPS", "", nil, PolicyZone, false, false, false},
		{"UPS", "RACK_MOUNTED", nil, PolicyZone, false, false, false},
		{"UPS", "CLIENT_SPOOFED_HOUSING", "ZONE", PolicyZone, false, false, false},
		{"UPS", "", "HOUSING", PolicyHousing, false, true, false},
		{"AP", "", "FREE_PLACEMENT", PolicyFreePlacement, false, false, false},
		{"BACKBONE", "", "RELATIONSHIP_ONLY", PolicyRelationshipOnly, false, false, true},
	}
	for _, tt := range tests {
		db, mock := domainMock(t)
		mock.ExpectQuery(regexp.QuoteMeta("SELECT placement_policy FROM asset_types WHERE code=$1")).WithArgs(tt.code).
			WillReturnRows(sqlmock.NewRows([]string{"placement_policy"}).AddRow(tt.dbValue))
		r, err := ResolvePlacementRequirements(context.Background(), db, tt.code, tt.subtype)
		if err != nil || r.Policy != tt.policy || r.DistributionRequired != tt.dist || r.HousingRequired != tt.housing || r.RelationshipRequired != tt.relationship {
			t.Fatalf("%s/%s r=%+v err=%v", tt.code, tt.subtype, r, err)
		}
	}
}

func TestFreePlacementRequiresScopedStructuredTarget(t *testing.T) {
	db, mock := domainMock(t)
	expectZone(mock, "z1", "t1", "b1", nil, nil)
	resolved, err := ResolveFreePlacement(context.Background(), db, PhysicalScope{"t1", "b1"}, "ZONE", "z1")
	if err != nil || resolved.Type != "ZONE" || resolved.Zone == nil {
		t.Fatalf("resolved=%+v err=%v", resolved, err)
	}
	if _, err = ResolveFreePlacement(context.Background(), db, PhysicalScope{"t1", "b1"}, "FREE_TEXT", "loading dock"); !errors.Is(err, ErrStructuredPlacement) {
		t.Fatalf("arbitrary target err=%v", err)
	}
	mock.ExpectQuery("SELECT z.id,z.tenant_id,z.branch_id").WithArgs("cross", "t1", "b1").WillReturnError(sql.ErrNoRows)
	if _, err = ResolveFreePlacement(context.Background(), db, PhysicalScope{"t1", "b1"}, "ZONE", "cross"); !errors.Is(err, ErrStructuredPlacement) {
		t.Fatalf("cross-scope err=%v", err)
	}
}

func relationshipRows(id, tenant, branch, code string, authorized bool) *sqlmock.Rows {
	return sqlmock.NewRows([]string{"id", "tenant_id", "branch_id", "code", "authorized"}).AddRow(id, tenant, branch, code, authorized)
}

func expectRelationshipEndpoint(mock sqlmock.Sqlmock, id, tenant, user, branch, code string, authorized bool) {
	mock.ExpectQuery("SELECT a.id,a.tenant_id,a.branch_id,at.code").WithArgs(id, tenant, user).
		WillReturnRows(relationshipRows(id, tenant, branch, code, authorized))
}

func TestRelationshipEndpointsSameAndInterBranchAuthority(t *testing.T) {
	tests := []struct {
		name                             string
		originBranch, destBranch         string
		originAuthorized, destAuthorized bool
		wantErr                          error
		interBranch                      bool
	}{
		{"same branch valid", "b1", "b1", true, true, nil, false},
		{"same branch unauthorized", "b1", "b1", false, true, ErrRelationshipBranch, false},
		{"inter branch both authorized", "b1", "b2", true, true, nil, true},
		{"inter branch only origin", "b1", "b2", true, false, ErrRelationshipBranch, false},
		{"inter branch only destination", "b1", "b2", false, true, ErrRelationshipBranch, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock := domainMock(t)
			expectRelationshipEndpoint(mock, "origin", "t1", "u1", tt.originBranch, "MDF", tt.originAuthorized)
			if tt.originAuthorized {
				expectRelationshipEndpoint(mock, "destination", "t1", "u1", tt.destBranch, "IDF", tt.destAuthorized)
			}
			got, err := ResolveRelationshipEndpoints(context.Background(), db, PhysicalScope{"t1", "b1"}, "u1", "origin", "destination")
			if tt.wantErr == nil && (err != nil || got.InterBranch != tt.interBranch) {
				t.Fatalf("relationship=%+v err=%v", got, err)
			}
			if tt.wantErr != nil && !errors.Is(err, tt.wantErr) {
				t.Fatalf("err=%v want=%v", err, tt.wantErr)
			}
		})
	}
}

func TestRelationshipEndpointsRejectMissingCrossTenantAndInvalidType(t *testing.T) {
	tests := []struct {
		name, failingID string
		rows            *sqlmock.Rows
		want            error
	}{
		{"missing origin", "origin", nil, ErrRelationshipEndpoint},
		{"cross tenant origin", "origin", nil, ErrRelationshipEndpoint},
		{"invalid origin type", "origin", relationshipRows("origin", "t1", "b1", "SWITCH", true), ErrRelationshipType},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock := domainMock(t)
			expect := mock.ExpectQuery("SELECT a.id,a.tenant_id,a.branch_id,at.code").WithArgs(tt.failingID, "t1", "u1")
			if tt.rows == nil {
				expect.WillReturnError(sql.ErrNoRows)
			} else {
				expect.WillReturnRows(tt.rows)
			}
			_, err := ResolveRelationshipEndpoints(context.Background(), db, PhysicalScope{"t1", "client-spoofed-branch"}, "u1", "origin", "destination")
			if !errors.Is(err, tt.want) {
				t.Fatalf("err=%v want=%v", err, tt.want)
			}
		})
	}

	t.Run("missing or cross-tenant destination", func(t *testing.T) {
		db, mock := domainMock(t)
		expectRelationshipEndpoint(mock, "origin", "t1", "u1", "b1", "MDF", true)
		mock.ExpectQuery("SELECT a.id,a.tenant_id,a.branch_id,at.code").WithArgs("destination", "t1", "u1").WillReturnError(sql.ErrNoRows)
		_, err := ResolveRelationshipEndpoints(context.Background(), db, PhysicalScope{"t1", "b1"}, "u1", "origin", "destination")
		if !errors.Is(err, ErrRelationshipEndpoint) {
			t.Fatalf("err=%v", err)
		}
	})
}

func TestPhysicalAndInitialReadinessAreDerived(t *testing.T) {
	db, mock := domainMock(t)
	mock.ExpectQuery("SELECT.*count\\(\\*\\).*branches").WithArgs("b1", "t1").WillReturnRows(sqlmock.NewRows([]string{"branches", "zones"}).AddRow(1, 1))
	r, err := EvaluatePhysicalStructureReadiness(context.Background(), db, PhysicalScope{"t1", "b1"})
	if err != nil || !r.Ready {
		t.Fatalf("r=%+v err=%v", r, err)
	}
	mock.ExpectQuery("SELECT.*count\\(\\*\\).*branches").WithArgs("b1", "t1").WillReturnRows(sqlmock.NewRows([]string{"branches", "zones"}).AddRow(1, 1))
	mock.ExpectQuery("SELECT EXISTS.*naming_rules").WithArgs("t1", "NODE").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	r, err = EvaluateInitialOnboardingReadiness(context.Background(), db, PhysicalScope{"t1", "b1"}, "NODE")
	if err != nil || r.Ready || len(r.Reasons) != 1 || r.Reasons[0] != ReasonNamingRequired {
		t.Fatalf("r=%+v err=%v", r, err)
	}
}

func TestAssetReadinessDeterministicMissingReasons(t *testing.T) {
	db, mock := domainMock(t)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT placement_policy FROM asset_types WHERE code=$1")).WithArgs("SWITCH").WillReturnRows(sqlmock.NewRows([]string{"placement_policy"}).AddRow("HOUSING"))
	mock.ExpectQuery("SELECT EXISTS.*naming_rules").WithArgs("t1", "SWITCH").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	// Zone, Distribution and Housing reject empty IDs before issuing SQL.
	r, err := EvaluateAssetTypeCreationReadiness(context.Background(), db, PhysicalScope{"t1", "b1"}, "SWITCH", "", PhysicalPlacementInput{})
	if err != nil {
		t.Fatal(err)
	}
	if r.Ready || len(r.Reasons) != 2 || r.Reasons[0] != ReasonHousingRequired || r.Reasons[1] != ReasonNamingRequired {
		t.Fatalf("reasons=%v", r.Reasons)
	}
}
