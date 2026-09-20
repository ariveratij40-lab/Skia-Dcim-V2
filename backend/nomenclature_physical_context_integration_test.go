package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

func assertB2dHF1OperationalContexts(t *testing.T, f *acceptanceFixture, parent canonicalParentFixture, zone, token string, accepted NomenclatureDomainResult, first *httptest.ResponseRecorder) {
	t.Helper()
	ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
	invoke := func(body string, handler http.HandlerFunc) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/test-existing-writer", bytes.NewBufferString(body))
		req.AddCookie(&http.Cookie{Name: "session_token", Value: token})
		r := httptest.NewRecorder()
		RequireTenantTx(f.runtime, handler)(r, req)
		return r
	}
	assertCode := func(r *httptest.ResponseRecorder, want string) {
		t.Helper()
		var body struct {
			Code string `json:"internal_code"`
		}
		if r.Code != http.StatusCreated || json.Unmarshal(r.Body.Bytes(), &body) != nil || body.Code != want {
			t.Fatalf("want=%s HTTP=%d body=%s", want, r.Code, r.Body.String())
		}
	}
	assertCode(first, "UPS-TIJ-Z01-0001")
	assertCode(invoke(fmt.Sprintf(`{"name":"UPS second","device_type":"ups","mount_mode":"ROOM_MOUNTED","placement_id":%q}`, parent.LocationID), handleUpsPdus), "UPS-TIJ-Z01-0002")
	if f.count(`SELECT count(*) FROM assets a JOIN locations l ON l.id=a.location_id WHERE a.nomenclature_id=$1 AND l.zone_id=$2 AND a.internal_code IN ('UPS-TIJ-Z01-0001','UPS-TIJ-Z01-0002')`, accepted.RuleID, zone) != 2 {
		t.Fatal("UPS physical/rule authority lost")
	}
	provenance := f.json(`SELECT to_jsonb(r)::text FROM naming_rules r WHERE id=$1`, accepted.RuleID)
	tx, e := BeginAuthenticatedTenantTx(ctx, f.runtime, f.tenant, f.branch, f.actor)
	if e != nil {
		t.Fatal(e)
	}
	rolled, e := reserveManagedAsset(tx, f.tenant, f.branch, f.actor, managedAssetInput{AssetTypeCode: "UPS", Name: "rollback", PlacementID: parent.LocationID, MountMode: "ROOM_MOUNTED"})
	if e != nil {
		tx.Rollback()
		t.Fatal(e)
	}
	if rolled.Assignment.Code != "UPS-TIJ-Z01-0003" {
		tx.Rollback()
		t.Fatal(rolled.Assignment)
	}
	tx.Rollback()
	if f.count(`SELECT last_seq FROM nomenclature_branch_counters WHERE nomenclature_id=$1 AND branch_id=$2`, accepted.RuleID, f.branch) != 2 || f.count(`SELECT count(*) FROM assets WHERE id=$1`, rolled.AssetID) != 0 {
		t.Fatal("rollback consumed identity")
	}
	if provenance != f.json(`SELECT to_jsonb(r)::text FROM naming_rules r WHERE id=$1`, accepted.RuleID) {
		t.Fatal("rollback modified rule/provenance")
	}
	t.Log("UPS_FIRST=UPS-TIJ-Z01-0001 UPS_SECOND=UPS-TIJ-Z01-0002 UPS_ROLLBACK_COUNTER_DELTA=0")

	// Test policies only. Existing parent RACK fixture already uses Distribution.
	f.exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,seq_digits,include_branch,context_mode,sequence_scope,include_housing) VALUES($1,$2,'SWITCH','SW','-',4,true,'CANONICAL_HOUSING','BRANCH',true)`, uuid.NewString(), f.tenant)
	f.exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,seq_digits,include_branch,context_mode,sequence_scope,include_placement) VALUES($1,$2,'NODE','ND','-',4,true,'LEGACY_INTERNAL_AREA','PLACEMENT',true)`, uuid.NewString(), f.tenant)
	for _, tt := range []struct {
		code, body string
		handler    http.HandlerFunc
		in         CanonicalNomenclatureInput
	}{
		{"RACK", fmt.Sprintf(`{"name":"HF1 rack","mdf_idf_id":%q}`, parent.DistributionID), handleRacks, CanonicalNomenclatureInput{DistributionID: parent.DistributionID, PlacementID: parent.LocationID}},
		{"SWITCH", fmt.Sprintf(`{"name":"HF1 switch","housing_rack_id":%q}`, parent.RackID), handleSwitches, CanonicalNomenclatureInput{HousingRackID: parent.RackID, PlacementID: parent.LocationID}},
		{"NODE", fmt.Sprintf(`{"name":"HF1 node","placement_id":%q}`, parent.LocationID), handleNodos, CanonicalNomenclatureInput{PlacementID: parent.LocationID}},
	} {
		t.Run("context_"+tt.code, func(t *testing.T) {
			tx, e := BeginAuthenticatedTenantTx(ctx, f.runtime, f.tenant, f.branch, f.actor)
			if e != nil {
				t.Fatal(e)
			}
			in := tt.in
			in.TenantID = f.tenant
			in.BranchID = f.branch
			in.AssetTypeCode = tt.code
			preview, e := PreviewCanonicalNomenclature(ctx, tx, in)
			tx.Rollback()
			if e != nil || preview.SequenceReserved {
				t.Fatalf("preview=%+v err=%v", preview, e)
			}
			assertCode(invoke(tt.body, tt.handler), preview.IllustrativeCode)
			// Normal POST uses the same context as the specialized adapters.
			var typeID string
			if e = f.admin.QueryRow(`SELECT id FROM asset_types WHERE code=$1`, tt.code).Scan(&typeID); e != nil {
				t.Fatal(e)
			}
			body := fmt.Sprintf(`{"name":"Generic HF1","asset_type_id":%q,"location_id":%q,"mdf_idf_id":%q,"housing_rack_id":%q,"inventory_status":"installed"}`, typeID, parent.LocationID, tt.in.DistributionID, tt.in.HousingRackID)
			r := invoke(body, (&DCIMHandler{}).createAsset)
			if r.Code != http.StatusCreated {
				t.Fatalf("generic %s HTTP=%d body=%s", tt.code, r.Code, r.Body.String())
			}
		})
	}
	var upsType string
	if e = f.admin.QueryRow(`SELECT id FROM asset_types WHERE code='UPS'`).Scan(&upsType); e != nil {
		t.Fatal(e)
	}
	assertCode(invoke(fmt.Sprintf(`{"name":"Generic UPS","asset_type_id":%q,"location_id":%q,"mount_mode":"ROOM_MOUNTED","inventory_status":"installed"}`, upsType, parent.LocationID), (&DCIMHandler{}).createAsset), "UPS-TIJ-Z01-0003")

	// Building/Floor codes come from the Zone hierarchy, not the caller.
	var buildingCode, floorCode string
	if e = f.admin.QueryRow(`SELECT b.code,COALESCE(fl.code,'') FROM zones z JOIN buildings b ON b.id=z.building_id JOIN floors fl ON fl.id=z.floor_id WHERE z.id=$1`, zone).Scan(&buildingCode, &floorCode); e != nil {
		t.Fatal(e)
	}
	tx, e = BeginAuthenticatedTenantTx(ctx, f.runtime, f.tenant, f.branch, f.actor)
	if e != nil {
		t.Fatal(e)
	}
	p, e := loadCanonicalNomenclaturePolicy(ctx, tx, f.tenant, "UPS", "", false)
	if e != nil {
		tx.Rollback()
		t.Fatal(e)
	}
	p.IncludeBuilding, p.IncludeFloor = true, true
	resolved, e := ResolveCanonicalNomenclature(ctx, tx, CanonicalNomenclatureInput{TenantID: f.tenant, BranchID: f.branch, AssetTypeCode: "UPS", PlacementID: parent.LocationID, Policy: p})
	tx.Rollback()
	if e != nil || resolved.Components.Building != buildingCode || resolved.Components.Floor != floorCode || resolved.Zone.ID != zone {
		t.Fatalf("hierarchy=%+v err=%v", resolved, e)
	}

	otherBranch := uuid.NewString()
	f.exec(`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$2,'OTHER','Other','active')`, otherBranch, f.tenant)
	otherZone, otherPlacement := uuid.NewString(), uuid.NewString()
	f.exec(`INSERT INTO zones(id,tenant_id,branch_id,code,name,status) VALUES($1,$2,$3,'Z02','Other Zone','active')`, otherZone, f.tenant, otherBranch)
	f.exec(`INSERT INTO locations(id,tenant_id,branch_id,zone_id,placement_type,placement_code,name,status) VALUES($1,$2,$3,$4,'WAREHOUSE','WH02','Other placement','active')`, otherPlacement, f.tenant, otherBranch, otherZone)
	foreign := newAcceptanceFixture(t, f.admin, f.runtime, uuid.NewString(), uuid.NewString())
	setup, e := f.admin.Begin()
	if e != nil {
		t.Fatal(e)
	}
	foreignParent := setupCanonicalParentFixture(t, setup, foreign.tenant, foreign.branch, foreign.actor)
	if e = setup.Commit(); e != nil {
		t.Fatal(e)
	}
	var foreignZone string
	if e = f.admin.QueryRow(`SELECT zone_id FROM locations WHERE id=$1`, foreignParent.LocationID).Scan(&foreignZone); e != nil {
		t.Fatal(e)
	}
	for _, mode := range []string{"cross_tenant", "cross_branch"} {
		for _, ref := range []string{"ZONE", "DISTRIBUTION", "HOUSING", "PLACEMENT"} {
			t.Run(mode+"_"+ref, func(t *testing.T) {
				branch := f.branch
				source := foreignParent
				sourceZone := foreignZone
				if mode == "cross_branch" {
					branch = otherBranch
					source = parent
					sourceZone = zone
				}
				input := managedAssetInput{Name: "invalid", PlacementID: source.LocationID}
				if ref != "PLACEMENT" {
					input.PlacementID = parent.LocationID
					if mode == "cross_branch" {
						input.PlacementID = otherPlacement
					}
				}
				switch ref {
				case "ZONE":
					input.AssetTypeCode = "UPS"
					input.ZoneID = sourceZone
					input.MountMode = "ROOM_MOUNTED"
					if mode == "cross_tenant" {
						input.PlacementID = parent.LocationID
					}
				case "DISTRIBUTION":
					input.AssetTypeCode = "RACK"
					input.DistributionID = source.DistributionID
				case "HOUSING":
					input.AssetTypeCode = "SWITCH"
					input.HousingRackID = source.RackID
					input.MountMode = "RACK_MOUNTED"
				case "PLACEMENT":
					input.AssetTypeCode = "NODE"
				}
				before := f.state()
				counterBefore := f.json(`SELECT jsonb_build_object('branch',(SELECT jsonb_agg(to_jsonb(c) ORDER BY nomenclature_id,branch_id) FROM nomenclature_branch_counters c WHERE tenant_id=$1),'placement',(SELECT jsonb_agg(to_jsonb(c) ORDER BY nomenclature_id,branch_id,placement_id) FROM nomenclature_counters c WHERE tenant_id=$1))::text`, f.tenant)
				c := withTenantIdentity(context.Background(), f.actor, f.tenant, branch)
				tx, e := BeginAuthenticatedTenantTx(c, f.runtime, f.tenant, branch, f.actor)
				if e != nil {
					t.Fatal(e)
				}
				_, e = reserveManagedAsset(tx, f.tenant, branch, f.actor, input)
				tx.Rollback()
				if e == nil {
					t.Fatal("cross scope accepted")
				}
				if before != f.state() || counterBefore != f.json(`SELECT jsonb_build_object('branch',(SELECT jsonb_agg(to_jsonb(c) ORDER BY nomenclature_id,branch_id) FROM nomenclature_branch_counters c WHERE tenant_id=$1),'placement',(SELECT jsonb_agg(to_jsonb(c) ORDER BY nomenclature_id,branch_id,placement_id) FROM nomenclature_counters c WHERE tenant_id=$1))::text`, f.tenant) {
					t.Fatal("cross scope mutated identity")
				}
			})
		}
	}
}
