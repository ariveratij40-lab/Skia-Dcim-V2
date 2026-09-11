package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
)

type canonicalParentFixture struct{ LocationID, IDFLocationID, DistributionID, IDFDistributionID, RackID string }

func setupCanonicalParentFixture(t *testing.T, q *sql.Tx, tenantID, branchID, userID string) canonicalParentFixture {
	t.Helper()
	siteID, floorID, zoneID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	locationID, distributionAssetID, distributionID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	idfLocationID, idfAssetID, idfDistributionID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	rackAssetID, rackID := uuid.NewString(), uuid.NewString()
	mdfRule, idfRule, rackRule := uuid.NewString(), uuid.NewString(), uuid.NewString()
	statements := []struct {
		query string
		args  []interface{}
	}{
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,seq_digits,last_seq,active) VALUES($1,$2,'MDF','MDF','-',false,3,0,true),($3,$2,'IDF','IDF','-',false,3,0,true),($4,$2,'RACK','RK','-',false,3,0,true)`, []interface{}{mdfRule, tenantID, idfRule, rackRule}},
		{`INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES($1,$2,$3,'A2B-SITE','A2B Site','active')`, []interface{}{siteID, tenantID, branchID}},
		{`INSERT INTO floors(id,tenant_id,building_id,name,status) VALUES($1,$2,$3,'A2B Floor','active')`, []interface{}{floorID, tenantID, siteID}},
		{`INSERT INTO zones(id,tenant_id,branch_id,building_id,floor_id,code,name,status) VALUES($1,$2,$3,$4,$5,'A2B-ZONE','A2B Zone','active')`, []interface{}{zoneID, tenantID, branchID, siteID, floorID}},
		{`INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,placement_code,status,zone_id) VALUES($1,$2,$3,'Canonical MDF','MDF','MDF01','active',$4)`, []interface{}{locationID, tenantID, branchID, zoneID}},
		{`INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,status,created_by,mount_mode) SELECT $1,$2,$3,id,$4,'MDF-001',$5,1,'Canonical MDF','active',$6,'NONE' FROM asset_types WHERE code='MDF'`, []interface{}{distributionAssetID, tenantID, branchID, locationID, mdfRule, userID}},
		{`INSERT INTO mdf_idf(id,asset_id,tenant_id,branch_id,type) VALUES($1,$2,$3,$4,'MDF')`, []interface{}{distributionID, distributionAssetID, tenantID, branchID}},
		{`UPDATE locations SET asset_id=$1,physical_identity='MDF01',physical_identity_governed=true WHERE id=$2`, []interface{}{distributionAssetID, locationID}},
		{`INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,placement_code,status,zone_id) VALUES($1,$2,$3,'Canonical IDF','IDF','IDF01','active',$4)`, []interface{}{idfLocationID, tenantID, branchID, zoneID}},
		{`INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,status,created_by,mount_mode) SELECT $1,$2,$3,id,$4,'IDF-001',$5,1,'Canonical IDF','active',$6,'NONE' FROM asset_types WHERE code='IDF'`, []interface{}{idfAssetID, tenantID, branchID, idfLocationID, idfRule, userID}},
		{`INSERT INTO mdf_idf(id,asset_id,tenant_id,branch_id,type) VALUES($1,$2,$3,$4,'IDF')`, []interface{}{idfDistributionID, idfAssetID, tenantID, branchID}},
		{`UPDATE locations SET asset_id=$1,physical_identity='IDF01',physical_identity_governed=true WHERE id=$2`, []interface{}{idfAssetID, idfLocationID}},
		{`INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,status,created_by,mount_mode) SELECT $1,$2,$3,id,$4,'RK-001',$5,1,'Canonical Rack','active',$6,'NONE' FROM asset_types WHERE code='RACK'`, []interface{}{rackAssetID, tenantID, branchID, locationID, rackRule, userID}},
		{`INSERT INTO racks(id,asset_id,tenant_id,branch_id,total_u,mdf_idf_id) VALUES($1,$2,$3,$4,42,$5)`, []interface{}{rackID, rackAssetID, tenantID, branchID, distributionID}},
		{`INSERT INTO nomenclature_branch_counters(nomenclature_id,tenant_id,branch_id,last_seq) VALUES($1,$2,$3,1)`, []interface{}{rackRule, tenantID, branchID}},
	}
	for _, statement := range statements {
		if _, err := q.Exec(statement.query, statement.args...); err != nil {
			t.Fatalf("canonical parent fixture: %v", err)
		}
	}
	return canonicalParentFixture{LocationID: locationID, IDFLocationID: idfLocationID, DistributionID: distributionID, IDFDistributionID: idfDistributionID, RackID: rackID}
}

func TestCanonicalHousingSpecializedHTTPPostgreSQL16(t *testing.T) {
	adminDSN := os.Getenv("ASSET_NOMENCLATURE_TEST_DATABASE_URL")
	runtimeDSN := os.Getenv("ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL")
	if adminDSN == "" || runtimeDSN == "" {
		t.Skip("canonical housing database URLs not set")
	}
	adminDB, err := sql.Open("postgres", adminDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer adminDB.Close()
	runtimeDB, err := sql.Open("postgres", runtimeDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer runtimeDB.Close()
	tenantID, branchID, userID, token := uuid.NewString(), uuid.NewString(), uuid.NewString(), "housing-"+uuid.NewString()
	for _, s := range []struct {
		q string
		a []interface{}
	}{
		{`INSERT INTO tenants(id,name) VALUES($1,'A2B')`, []interface{}{tenantID}},
		{`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$2,'A2B','A2B','active')`, []interface{}{branchID, tenantID}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,'A2B','x','active')`, []interface{}{userID, "a2b-" + userID + "@example.invalid"}},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$2)`, []interface{}{userID, tenantID}},
		{`INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)`, []interface{}{userID, branchID}},
		{`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES($1,$2,$3,$4,$5,4102444800)`, []interface{}{uuid.NewString(), userID, tenantID, branchID, token}},
	} {
		if _, err = adminDB.Exec(s.q, s.a...); err != nil {
			t.Fatal(err)
		}
	}
	defer adminDB.Exec(`DELETE FROM tenants WHERE id=$1`, tenantID)
	parentTx, err := adminDB.Begin()
	if err != nil {
		t.Fatal(err)
	}
	parent := setupCanonicalParentFixture(t, parentTx, tenantID, branchID, userID)
	if err = parentTx.Commit(); err != nil {
		t.Fatal(err)
	}
	for _, code := range []string{"SWITCH", "PATCH_PANEL", "PDU", "UPS"} {
		_, err = adminDB.Exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,seq_digits,last_seq,active,include_placement) VALUES($1,$2,$3,$3,'-',3,0,true,true)`, uuid.NewString(), tenantID, code)
		if err != nil {
			t.Fatal(err)
		}
	}

	invoke := func(path, body string, handler http.HandlerFunc) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(body))
		req.AddCookie(&http.Cookie{Name: "session_token", Value: token})
		rec := httptest.NewRecorder()
		RequireTenantTx(runtimeDB, handler)(rec, req)
		return rec
	}
	tests := []struct {
		name, path, body          string
		handler                   http.HandlerFunc
		mountMode, housingRackID  string
		expectedDistributionPoint string
	}{
		{"rack mdf", "/api/infra/racks", fmt.Sprintf(`{"name":"Rack MDF","mdf_idf_id":%q}`, parent.DistributionID), handleRacks, "NONE", "", parent.DistributionID},
		{"rack idf", "/api/infra/racks", fmt.Sprintf(`{"name":"Rack IDF","mdf_idf_id":%q}`, parent.IDFDistributionID), handleRacks, "NONE", "", parent.IDFDistributionID},
		{"switch", "/api/infra/switches", fmt.Sprintf(`{"name":"Switch","housing_rack_id":%q}`, parent.RackID), handleSwitches, "RACK_MOUNTED", parent.RackID, ""},
		{"patch", "/api/infra/patch-panels", fmt.Sprintf(`{"name":"Panel","housing_rack_id":%q}`, parent.RackID), handlePatchPanels, "RACK_MOUNTED", parent.RackID, ""},
		{"pdu", "/api/infra/ups-pdus", fmt.Sprintf(`{"name":"PDU","device_type":"pdu","housing_rack_id":%q}`, parent.RackID), handleUpsPdus, "RACK_MOUNTED", parent.RackID, ""},
		{"ups rack", "/api/infra/ups-pdus", fmt.Sprintf(`{"name":"UPS Rack","device_type":"ups","mount_mode":"RACK_MOUNTED","housing_rack_id":%q}`, parent.RackID), handleUpsPdus, "RACK_MOUNTED", parent.RackID, ""},
		{"ups room", "/api/infra/ups-pdus", fmt.Sprintf(`{"name":"UPS Room","device_type":"ups","mount_mode":"ROOM_MOUNTED","placement_id":%q}`, parent.LocationID), handleUpsPdus, "ROOM_MOUNTED", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := invoke(tt.path, tt.body, tt.handler)
			if rec.Code != http.StatusCreated {
				t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
			}
			var created struct {
				ID string `json:"id"`
			}
			if err := json.NewDecoder(rec.Body).Decode(&created); err != nil || created.ID == "" {
				t.Fatalf("response=%s err=%v", rec.Body.String(), err)
			}
			var mountMode, locationID string
			var housingRackID sql.NullString
			if err := adminDB.QueryRow(`SELECT mount_mode,location_id,housing_rack_id FROM assets WHERE id=$1 AND tenant_id=$2 AND branch_id=$3`, created.ID, tenantID, branchID).Scan(&mountMode, &locationID, &housingRackID); err != nil {
				t.Fatal(err)
			}
			expectedLocationID := parent.LocationID
			if tt.expectedDistributionPoint == parent.IDFDistributionID {
				expectedLocationID = parent.IDFLocationID
			}
			if mountMode != tt.mountMode || locationID != expectedLocationID || housingRackID.String != tt.housingRackID {
				t.Fatalf("canonical state mount=%s location=%s rack=%s", mountMode, locationID, housingRackID.String)
			}
			if tt.expectedDistributionPoint != "" {
				var distributionID string
				if err := adminDB.QueryRow(`SELECT mdf_idf_id FROM racks WHERE asset_id=$1`, created.ID).Scan(&distributionID); err != nil || distributionID != tt.expectedDistributionPoint {
					t.Fatalf("rack parent=%s err=%v", distributionID, err)
				}
			}
		})
	}
	before := 0
	_ = adminDB.QueryRow(`SELECT count(*) FROM assets WHERE tenant_id=$1`, tenantID).Scan(&before)
	rec := invoke("/api/infra/switches", `{"name":"Invalid"}`, handleSwitches)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("missing rack status=%d body=%s", rec.Code, rec.Body.String())
	}
	after := 0
	_ = adminDB.QueryRow(`SELECT count(*) FROM assets WHERE tenant_id=$1`, tenantID).Scan(&after)
	if after != before {
		t.Fatalf("invalid create durable delta before=%d after=%d", before, after)
	}
}
