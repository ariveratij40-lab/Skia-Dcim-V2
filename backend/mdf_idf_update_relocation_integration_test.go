package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestGenericMdfIdfUpdateRelocationPostgreSQL16(t *testing.T) {
	adminDSN := os.Getenv("ASSET_NOMENCLATURE_TEST_DATABASE_URL")
	runtimeDSN := os.Getenv("ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL")
	if adminDSN == "" || runtimeDSN == "" {
		t.Skip("B2A admin/runtime PostgreSQL URLs not set")
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

	tenant, otherTenant, legacyTenant := uuid.NewString(), uuid.NewString(), uuid.NewString()
	branch, branchB, otherBranch, legacyBranch := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	user, userB, otherUser, legacyUser := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	token, tokenB, otherToken, legacyToken := "b2a-"+uuid.NewString(), "b2a-b-"+uuid.NewString(), "b2a-o-"+uuid.NewString(), "b2a-l-"+uuid.NewString()
	site, siteB, otherSite, legacySite := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	floor, floorB, otherFloor := uuid.NewString(), uuid.NewString(), uuid.NewString()
	zoneA, zoneB, crossBranchZone, crossTenantZone := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	areaA, areaB, crossBranchArea, crossTenantArea, unprovableArea, legacyArea := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	warehouse := uuid.NewString()
	mdfRule, idfRule, otherRule, legacyRule, rackRule, switchRule, serverRule := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()

	setup := []struct {
		query string
		args  []interface{}
	}{
		{`INSERT INTO tenants(id,name) VALUES($1,'B2A'),($2,'B2A other'),($3,'B2A legacy')`, []interface{}{tenant, otherTenant, legacyTenant}},
		{`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$5,'A','A','active'),($2,$5,'B','B','active'),($3,$6,'O','Other','active'),($4,$7,'L','Legacy','active')`, []interface{}{branch, branchB, otherBranch, legacyBranch, tenant, otherTenant, legacyTenant}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$5,'A','x','active'),($2,$6,'B','x','active'),($3,$7,'O','x','active'),($4,$8,'L','x','active')`, []interface{}{user, userB, otherUser, legacyUser, user + "@test", userB + "@test", otherUser + "@test", legacyUser + "@test"}},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$5),($2,$5),($3,$6),($4,$7)`, []interface{}{user, userB, otherUser, legacyUser, tenant, otherTenant, legacyTenant}},
		{`INSERT INTO user_branches(user_id,branch_id) VALUES($1,$5),($2,$6),($3,$7),($4,$8)`, []interface{}{user, userB, otherUser, legacyUser, branch, branchB, otherBranch, legacyBranch}},
		{`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES($1,$2,$3,$4,$5,4102444800),($6,$7,$3,$8,$9,4102444800),($10,$11,$12,$13,$14,4102444800),($15,$16,$17,$18,$19,4102444800)`, []interface{}{uuid.NewString(), user, tenant, branch, token, uuid.NewString(), userB, branchB, tokenB, uuid.NewString(), otherUser, otherTenant, otherBranch, otherToken, uuid.NewString(), legacyUser, legacyTenant, legacyBranch, legacyToken}},
		{`INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES($1,$5,$6,'SITEA','A','active'),($2,$5,$7,'SITEB','B','active'),($3,$8,$9,'SITEO','O','active'),($4,$10,$11,'SITEL','L','active')`, []interface{}{site, siteB, otherSite, legacySite, tenant, branch, branchB, otherTenant, otherBranch, legacyTenant, legacyBranch}},
		{`INSERT INTO floors(id,tenant_id,building_id,name) VALUES($1,$4,$5,'A'),($2,$4,$6,'B'),($3,$7,$8,'O')`, []interface{}{floor, floorB, otherFloor, tenant, site, siteB, otherTenant, otherSite}},
		{`INSERT INTO zones(id,tenant_id,branch_id,building_id,floor_id,code,name,status) VALUES($1,$5,$6,$7,$8,'ZA','A','active'),($2,$5,$6,$7,$8,'ZB','B','active'),($3,$5,$9,$10,$11,'ZC','Cross branch','active'),($4,$12,$13,$14,$15,'ZO','Cross tenant','active')`, []interface{}{zoneA, zoneB, crossBranchZone, crossTenantZone, tenant, branch, site, floor, branchB, siteB, floorB, otherTenant, otherBranch, otherSite, otherFloor}},
		{`INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,floor_id,zone_id,code,name,status) VALUES($1,$7,$8,$9,$10,$11,'AA','A','active'),($2,$7,$8,$9,$10,$12,'AB','B','active'),($3,$7,$13,$14,$15,$16,'AC','Cross branch','active'),($4,$17,$18,$19,$20,$21,'AO','Cross tenant','active'),($5,$7,$8,$9,NULL,NULL,'AU','Unprovable','active'),($6,$22,$23,$24,NULL,NULL,'AL','Legacy','active')`, []interface{}{areaA, areaB, crossBranchArea, crossTenantArea, unprovableArea, legacyArea, tenant, branch, site, floor, zoneA, zoneB, branchB, siteB, floorB, crossBranchZone, otherTenant, otherBranch, otherSite, otherFloor, crossTenantZone, legacyTenant, legacyBranch, legacySite}},
		{`INSERT INTO locations(id,tenant_id,branch_id,placement_type,placement_code,name,status) VALUES($1,$2,$3,'WAREHOUSE','WH','Warehouse','active')`, []interface{}{warehouse, tenant, branch}},
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_zone,context_mode,seq_digits,last_seq,active) VALUES($1,$5,'MDF','MDF','-',true,true,'CANONICAL_ZONE',3,0,true),($2,$5,'IDF','IDF','-',true,true,'CANONICAL_ZONE',3,0,true),($3,$6,'MDF','MDF','-',true,true,'CANONICAL_ZONE',3,0,true),($4,$7,'MDF','MDF','-',true,false,'LEGACY_INTERNAL_AREA',3,0,true)`, []interface{}{mdfRule, idfRule, otherRule, legacyRule, tenant, otherTenant, legacyTenant}},
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_placement,seq_digits,last_seq,active) VALUES($1,$4,'RACK','RK','-',true,true,3,0,true),($2,$4,'SWITCH','SW','-',true,true,3,0,true),($3,$4,'SERVER','SRV','-',true,false,3,0,true)`, []interface{}{rackRule, switchRule, serverRule, tenant}},
	}
	for _, statement := range setup {
		if _, err = adminDB.Exec(statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
	defer adminDB.Exec(`DELETE FROM tenants WHERE id IN ($1,$2,$3)`, tenant, otherTenant, legacyTenant)

	handler := &DCIMHandler{DB: runtimeDB}
	invoke := func(method, path, session string, body map[string]interface{}) *httptest.ResponseRecorder {
		encoded, _ := json.Marshal(body)
		req := httptest.NewRequest(method, path, bytes.NewReader(encoded))
		if session != "" {
			req.AddCookie(&http.Cookie{Name: "session_token", Value: session})
		}
		rec := httptest.NewRecorder()
		if strings.HasPrefix(path, "/api/dcim/assets/") {
			handler.HandleAssetByID(rec, req)
		} else {
			handler.HandleAssets(rec, req)
		}
		return rec
	}
	assetTypeID := func(code string) string {
		t.Helper()
		var id string
		if err := adminDB.QueryRow(`SELECT id FROM asset_types WHERE code=$1`, code).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	create := func(session, typ, name, zone string, extra map[string]interface{}) string {
		body := map[string]interface{}{"asset_type_id": assetTypeID(typ), "name": name}
		if zone != "" {
			body["zone_id"] = zone
		}
		for k, v := range extra {
			body[k] = v
		}
		rec := invoke(http.MethodPost, "/api/dcim/assets", session, body)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create %s status=%d body=%s", typ, rec.Code, rec.Body.String())
		}
		var response map[string]string
		if json.Unmarshal(rec.Body.Bytes(), &response) != nil || response["id"] == "" {
			t.Fatalf("create %s response=%s", typ, rec.Body.String())
		}
		return response["id"]
	}

	mdfID := create(token, "MDF", "MDF A", zoneA, nil)
	idfID := create(token, "IDF", "IDF A", zoneA, nil)
	branchBMDF := create(tokenB, "MDF", "MDF B", crossBranchZone, nil)
	otherMDF := create(otherToken, "MDF", "MDF O", crossTenantZone, nil)
	rackID := create(token, "RACK", "Rack", "", map[string]interface{}{"location_id": warehouse})
	switchID := create(token, "SWITCH", "Switch", "", map[string]interface{}{"location_id": warehouse})
	serverID := create(token, "SERVER", "Server", "", nil)

	legacyBody := map[string]interface{}{"type": "MDF", "name": "Legacy MDF", "site_id": legacySite, "internal_area_id": legacyArea}
	encodedLegacy, _ := json.Marshal(legacyBody)
	legacyReq := httptest.NewRequest(http.MethodPost, "/api/infra/mdf-idf", bytes.NewReader(encodedLegacy))
	legacyReq.AddCookie(&http.Cookie{Name: "session_token", Value: legacyToken})
	legacyCreate := httptest.NewRecorder()
	RequireTenantTx(runtimeDB, handleMdfIdf)(legacyCreate, legacyReq)
	if legacyCreate.Code != http.StatusCreated {
		t.Fatalf("legacy create status=%d body=%s", legacyCreate.Code, legacyCreate.Body.String())
	}
	var legacyResponse map[string]interface{}
	_ = json.Unmarshal(legacyCreate.Body.Bytes(), &legacyResponse)
	legacyAssetID, _ := legacyResponse["asset_id"].(string)

	type state struct {
		Location, Zone, Area, Code, TypeID, Name, Satellite string
		Sequence, Counter, Audit                            int
	}
	snapshot := func(assetID, ruleID, scopeBranch string) state {
		t.Helper()
		var s state
		var area sql.NullString
		if err := adminDB.QueryRow(`SELECT a.location_id::text,COALESCE(l.zone_id::text,''),l.internal_area_id,a.internal_code,a.asset_type_id::text,a.name,a.nomenclature_sequence,m.id::text||':'||m.type FROM assets a JOIN locations l ON l.id=a.location_id JOIN mdf_idf m ON m.asset_id=a.id WHERE a.id=$1`, assetID).Scan(&s.Location, &s.Zone, &area, &s.Code, &s.TypeID, &s.Name, &s.Sequence, &s.Satellite); err != nil {
			t.Fatal(err)
		}
		if area.Valid {
			s.Area = area.String
		}
		if err := adminDB.QueryRow(`SELECT COALESCE(MAX(last_seq),0) FROM nomenclature_branch_counters WHERE nomenclature_id=$1 AND branch_id=$2`, ruleID, scopeBranch).Scan(&s.Counter); err != nil {
			t.Fatal(err)
		}
		if err := adminDB.QueryRow(`SELECT count(*) FROM asset_logs WHERE asset_id=$1`, assetID).Scan(&s.Audit); err != nil {
			t.Fatal(err)
		}
		return s
	}
	assertRejectedUnchanged := func(label, assetID, ruleID, scopeBranch string, before state, rec *httptest.ResponseRecorder, expected int) {
		t.Helper()
		after := snapshot(assetID, ruleID, scopeBranch)
		if rec.Code != expected || after != before {
			t.Fatalf("%s status=%d before=%+v after=%+v body=%s", label, rec.Code, before, after, rec.Body.String())
		}
		lower := strings.ToLower(rec.Body.String())
		for _, forbidden := range []string{"pq:", "constraint", "sqlstate", "insert into", "update locations"} {
			if strings.Contains(lower, forbidden) {
				t.Fatalf("%s leaked %q: %s", label, forbidden, rec.Body.String())
			}
		}
	}

	mdfBefore := snapshot(mdfID, mdfRule, branch)
	mdfMove := invoke(http.MethodPut, "/api/dcim/assets/"+mdfID, token, map[string]interface{}{"zone_id": zoneB})
	mdfAfter := snapshot(mdfID, mdfRule, branch)
	if mdfMove.Code != http.StatusOK || mdfAfter.Location != mdfBefore.Location || mdfAfter.Zone != zoneB || mdfAfter.Area != "" || mdfAfter.Code != mdfBefore.Code || mdfAfter.Sequence != mdfBefore.Sequence || mdfAfter.Counter != mdfBefore.Counter || mdfAfter.Audit-mdfBefore.Audit != 1 {
		t.Fatalf("MDF relocation status=%d before=%+v after=%+v body=%s", mdfMove.Code, mdfBefore, mdfAfter, mdfMove.Body.String())
	}
	idfBefore := snapshot(idfID, idfRule, branch)
	idfMove := invoke(http.MethodPut, "/api/dcim/assets/"+idfID, token, map[string]interface{}{"zone_id": zoneB, "internal_area_id": areaB})
	idfAfter := snapshot(idfID, idfRule, branch)
	if idfMove.Code != http.StatusOK || idfAfter.Location != idfBefore.Location || idfAfter.Zone != zoneB || idfAfter.Area != areaB || idfAfter.Code != idfBefore.Code || idfAfter.Sequence != idfBefore.Sequence || idfAfter.Counter != idfBefore.Counter || idfAfter.Audit-idfBefore.Audit != 1 {
		t.Fatalf("IDF relocation status=%d before=%+v after=%+v body=%s", idfMove.Code, idfBefore, idfAfter, idfMove.Body.String())
	}

	assertMetadataOnly := func(label, assetID, ruleID, scopeBranch, newName string) {
		t.Helper()
		before := snapshot(assetID, ruleID, scopeBranch)
		rec := invoke(http.MethodPut, "/api/dcim/assets/"+assetID, token, map[string]interface{}{"name": newName})
		after := snapshot(assetID, ruleID, scopeBranch)
		expected := before
		expected.Name = newName
		if rec.Code != http.StatusOK || after != expected {
			t.Fatalf("%s status=%d before=%+v after=%+v body=%s", label, rec.Code, before, after, rec.Body.String())
		}
	}
	assertMetadataOnly("canonical MDF metadata", mdfID, mdfRule, branch, "MDF metadata updated")
	assertMetadataOnly("canonical IDF metadata", idfID, idfRule, branch, "IDF metadata updated")

	mdfStable := snapshot(mdfID, mdfRule, branch)
	failures := []struct {
		name, session string
		body          map[string]interface{}
		status        int
	}{
		{"tenant spoof", token, map[string]interface{}{"tenant_id": otherTenant}, http.StatusForbidden},
		{"branch spoof", token, map[string]interface{}{"branch_id": branchB}, http.StatusForbidden},
		{"arbitrary location", token, map[string]interface{}{"location_id": warehouse}, http.StatusUnprocessableEntity},
		{"MDF to SERVER", token, map[string]interface{}{"asset_type_id": assetTypeID("SERVER")}, http.StatusUnprocessableEntity},
		{"cross-tenant target", token, map[string]interface{}{"zone_id": crossTenantZone}, http.StatusUnprocessableEntity},
		{"cross-branch target", token, map[string]interface{}{"zone_id": crossBranchZone}, http.StatusUnprocessableEntity},
		{"dual mismatch", token, map[string]interface{}{"zone_id": zoneA, "internal_area_id": areaB}, http.StatusUnprocessableEntity},
		{"dual unprovable", token, map[string]interface{}{"zone_id": zoneA, "internal_area_id": unprovableArea}, http.StatusUnprocessableEntity},
		{"dual cross-tenant", token, map[string]interface{}{"zone_id": crossTenantZone, "internal_area_id": crossTenantArea}, http.StatusUnprocessableEntity},
		{"dual cross-branch", token, map[string]interface{}{"zone_id": crossBranchZone, "internal_area_id": crossBranchArea}, http.StatusUnprocessableEntity},
	}
	for _, test := range failures {
		rec := invoke(http.MethodPut, "/api/dcim/assets/"+mdfID, test.session, test.body)
		assertRejectedUnchanged(test.name, mdfID, mdfRule, branch, mdfStable, rec, test.status)
	}

	locationTargets := []struct {
		name, locationID string
	}{
		{"Rack/Housing reference", rackID},
		{"cross-tenant location", snapshot(otherMDF, otherRule, otherBranch).Location},
		{"cross-branch location", snapshot(branchBMDF, mdfRule, branchB).Location},
		{"legacy InternalArea location", snapshot(legacyAssetID, legacyRule, legacyBranch).Location},
		{"wrong placement type", warehouse},
	}
	for _, target := range locationTargets {
		before := snapshot(mdfID, mdfRule, branch)
		rec := invoke(http.MethodPut, "/api/dcim/assets/"+mdfID, token, map[string]interface{}{"location_id": target.locationID})
		assertRejectedUnchanged(target.name, mdfID, mdfRule, branch, before, rec, http.StatusUnprocessableEntity)
	}

	idfMutationBefore := snapshot(idfID, idfRule, branch)
	idfToRack := invoke(http.MethodPut, "/api/dcim/assets/"+idfID, token, map[string]interface{}{"asset_type_id": assetTypeID("RACK")})
	assertRejectedUnchanged("IDF to RACK", idfID, idfRule, branch, idfMutationBefore, idfToRack, http.StatusUnprocessableEntity)
	unauth := invoke(http.MethodPut, "/api/dcim/assets/"+mdfID, "", map[string]interface{}{"name": "No"})
	assertRejectedUnchanged("unauthenticated", mdfID, mdfRule, branch, mdfStable, unauth, http.StatusUnauthorized)
	crossBranchSource := invoke(http.MethodPut, "/api/dcim/assets/"+branchBMDF, token, map[string]interface{}{"name": "No"})
	if crossBranchSource.Code != http.StatusNotFound {
		t.Fatalf("cross-branch source status=%d body=%s", crossBranchSource.Code, crossBranchSource.Body.String())
	}
	crossTenantSource := invoke(http.MethodPut, "/api/dcim/assets/"+otherMDF, token, map[string]interface{}{"name": "No"})
	if crossTenantSource.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant source status=%d body=%s", crossTenantSource.Code, crossTenantSource.Body.String())
	}

	for _, conversion := range []struct {
		assetID, target string
	}{
		{serverID, "MDF"}, {serverID, "IDF"},
	} {
		rec := invoke(http.MethodPut, "/api/dcim/assets/"+conversion.assetID, token, map[string]interface{}{"asset_type_id": assetTypeID(conversion.target)})
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("conversion to %s status=%d body=%s", conversion.target, rec.Code, rec.Body.String())
		}
	}

	for _, metadata := range []struct{ id, name string }{{rackID, "Rack updated"}, {switchID, "Switch updated"}, {serverID, "Server updated"}} {
		rec := invoke(http.MethodPut, "/api/dcim/assets/"+metadata.id, token, map[string]interface{}{"name": metadata.name})
		if rec.Code != http.StatusOK {
			t.Fatalf("non-MDF update %s status=%d body=%s", metadata.name, rec.Code, rec.Body.String())
		}
	}

	legacyMetadata := invoke(http.MethodPut, "/api/dcim/assets/"+legacyAssetID, legacyToken, map[string]interface{}{"name": "Legacy metadata"})
	if legacyMetadata.Code != http.StatusOK {
		t.Fatalf("legacy metadata status=%d body=%s", legacyMetadata.Code, legacyMetadata.Body.String())
	}
	legacyRelocation := invoke(http.MethodPut, "/api/dcim/assets/"+legacyAssetID, legacyToken, map[string]interface{}{"zone_id": zoneA})
	if legacyRelocation.Code != http.StatusUnprocessableEntity || !strings.Contains(legacyRelocation.Body.String(), "legacy_relocation_not_supported") {
		t.Fatalf("legacy relocation status=%d body=%s", legacyRelocation.Code, legacyRelocation.Body.String())
	}

	rollbackBefore := snapshot(mdfID, mdfRule, branch)
	failureName := "fail_b2a_audit_" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	if _, err = adminDB.Exec(fmt.Sprintf(`CREATE FUNCTION %s() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced B2A failure'; END $$; CREATE TRIGGER %s BEFORE INSERT ON asset_logs FOR EACH ROW EXECUTE FUNCTION %s()`, failureName, failureName, failureName)); err != nil {
		t.Fatal(err)
	}
	forced := invoke(http.MethodPut, "/api/dcim/assets/"+mdfID, token, map[string]interface{}{"zone_id": zoneA})
	if _, err = adminDB.Exec(fmt.Sprintf(`DROP TRIGGER %s ON asset_logs; DROP FUNCTION %s()`, failureName, failureName)); err != nil {
		t.Fatal(err)
	}
	if forced.Code != http.StatusInternalServerError || snapshot(mdfID, mdfRule, branch) != rollbackBefore {
		t.Fatalf("forced rollback status=%d before=%+v after=%+v body=%s", forced.Code, rollbackBefore, snapshot(mdfID, mdfRule, branch), forced.Body.String())
	}
}
