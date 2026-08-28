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

func TestMdfIdfZoneHandlerPostgreSQL16(t *testing.T) {
	adminDSN := os.Getenv("ASSET_NOMENCLATURE_TEST_DATABASE_URL")
	runtimeDSN := os.Getenv("ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL")
	if adminDSN == "" || runtimeDSN == "" {
		t.Skip("MDF/IDF Zone admin/runtime PostgreSQL URLs not set")
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
	user, legacyUser := uuid.NewString(), uuid.NewString()
	token, legacyToken := "b1d-"+uuid.NewString(), "b1d-legacy-"+uuid.NewString()
	site, siteB, otherSite, legacySite := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	floor, floorB, otherFloor := uuid.NewString(), uuid.NewString(), uuid.NewString()
	zone, mismatchZone, crossBranchZone, crossTenantZone := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	area, unprovableArea, branchBArea, otherArea, legacyArea := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	warehouseLocation, wrongBranchLocation, wrongTenantLocation, legacyLocation := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	mdfRule, idfRule, legacyRule, serverRule, rackRule, switchRule := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	legacyFallbackRule := uuid.NewString()

	setup := []struct {
		query string
		args  []interface{}
	}{
		{`INSERT INTO tenants(id,name) VALUES($1,'B1D'),($2,'B1D other'),($3,'B1D legacy')`, []interface{}{tenant, otherTenant, legacyTenant}},
		{`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$5,'TJ','Primary','active'),($2,$5,'B2','Second','active'),($3,$6,'OT','Other','active'),($4,$7,'LG','Legacy','active')`, []interface{}{branch, branchB, otherBranch, legacyBranch, tenant, otherTenant, legacyTenant}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$3,'B1D user','x','active'),($2,$4,'B1D legacy','x','active')`, []interface{}{user, legacyUser, user + "@example.invalid", legacyUser + "@example.invalid"}},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$3),($2,$4)`, []interface{}{user, legacyUser, tenant, legacyTenant}},
		{`INSERT INTO user_branches(user_id,branch_id) VALUES($1,$3),($2,$4)`, []interface{}{user, legacyUser, branch, legacyBranch}},
		{`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES($1,$2,$3,$4,$5,4102444800),($6,$7,$8,$9,$10,4102444800)`, []interface{}{uuid.NewString(), user, tenant, branch, token, uuid.NewString(), legacyUser, legacyTenant, legacyBranch, legacyToken}},
		{`INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES($1,$5,$6,'SITE','Site','active'),($2,$5,$7,'SITEB','Site B','active'),($3,$8,$9,'OTHER','Other','active'),($4,$10,$11,'LEGACY','Legacy','active')`, []interface{}{site, siteB, otherSite, legacySite, tenant, branch, branchB, otherTenant, otherBranch, legacyTenant, legacyBranch}},
		{`INSERT INTO floors(id,tenant_id,building_id,name) VALUES($1,$4,$5,'Floor'),($2,$4,$6,'Floor B'),($3,$7,$8,'Other Floor')`, []interface{}{floor, floorB, otherFloor, tenant, site, siteB, otherTenant, otherSite}},
		{`INSERT INTO zones(id,tenant_id,branch_id,building_id,floor_id,code,name,status) VALUES($1,$5,$6,$7,$8,'ZA','Zone A','active'),($2,$5,$6,$7,$8,'ZB','Zone B','active'),($3,$5,$9,$10,$11,'ZC','Cross branch','active'),($4,$12,$13,$14,$15,'ZX','Cross tenant','active')`, []interface{}{zone, mismatchZone, crossBranchZone, crossTenantZone, tenant, branch, site, floor, branchB, siteB, floorB, otherTenant, otherBranch, otherSite, otherFloor}},
		{`INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,floor_id,zone_id,code,name,status) VALUES
		 ($1,$6,$7,$8,$9,$10,'AREA','Area','active'),
		 ($2,$6,$7,$8,NULL,NULL,'UNPROVABLE','Unprovable','active'),
		 ($3,$6,$11,$12,$13,$14,'BRANCHB','Branch B','active'),
		 ($4,$15,$16,$17,$18,$19,'OTHER','Other tenant','active'),
		 ($5,$20,$21,$22,NULL,NULL,'LEG','Legacy area','active')`, []interface{}{area, unprovableArea, branchBArea, otherArea, legacyArea, tenant, branch, site, floor, zone, branchB, siteB, floorB, crossBranchZone, otherTenant, otherBranch, otherSite, otherFloor, crossTenantZone, legacyTenant, legacyBranch, legacySite}},
		{`INSERT INTO locations(id,tenant_id,branch_id,placement_type,placement_code,name,status,internal_area_id) VALUES
		 ($1,$5,$6,'WAREHOUSE','WH01','Warehouse placement','active',NULL),
		 ($2,$5,$7,'WAREHOUSE','WHB','Wrong branch placement','active',NULL),
		 ($3,$8,$9,'WAREHOUSE','WHO','Wrong tenant placement','active',NULL),
		 ($4,$10,$11,'MDF','LEG01','Legacy placement','active',$12)`, []interface{}{warehouseLocation, wrongBranchLocation, wrongTenantLocation, legacyLocation, tenant, branch, branchB, otherTenant, otherBranch, legacyTenant, legacyBranch, legacyArea}},
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,include_zone,context_mode,seq_digits,last_seq,active) VALUES($1,$4,'MDF','MDF','-',true,false,false,true,'CANONICAL_ZONE',3,0,true),($2,$4,'IDF','IDF','-',true,false,false,true,'CANONICAL_ZONE',3,0,true),($3,$5,'MDF','MDF','-',true,true,true,false,'LEGACY_INTERNAL_AREA',3,0,true)`, []interface{}{mdfRule, idfRule, legacyRule, tenant, legacyTenant}},
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_placement,seq_digits,last_seq,active) VALUES
		 ($1,$4,'SERVER','SRV','-',true,false,3,0,true),
		 ($2,$4,'RACK','RK','-',true,true,3,0,true),
		 ($3,$4,'SWITCH','SW','-',true,true,3,0,true)`, []interface{}{serverRule, rackRule, switchRule, tenant}},
	}
	for _, statement := range setup {
		if _, err = adminDB.Exec(statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
	defer adminDB.Exec(`DELETE FROM tenants WHERE id IN ($1,$2,$3)`, tenant, otherTenant, legacyTenant)

	invoke := func(session, typ, name string, extra map[string]string) *httptest.ResponseRecorder {
		body := map[string]string{"type": typ, "name": name}
		for key, value := range extra {
			body[key] = value
		}
		encoded, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/api/infra/mdf-idf", bytes.NewReader(encoded))
		req.AddCookie(&http.Cookie{Name: "session_token", Value: session})
		rec := httptest.NewRecorder()
		RequireTenantTx(runtimeDB, handleMdfIdf)(rec, req)
		return rec
	}
	var mdfTypeID, idfTypeID, serverTypeID, rackTypeID, switchTypeID string
	if err = adminDB.QueryRow(`SELECT id FROM asset_types WHERE code='MDF'`).Scan(&mdfTypeID); err != nil {
		t.Fatal(err)
	}
	if err = adminDB.QueryRow(`SELECT id FROM asset_types WHERE code='IDF'`).Scan(&idfTypeID); err != nil {
		t.Fatal(err)
	}
	if err = adminDB.QueryRow(`SELECT id FROM asset_types WHERE code='SERVER'`).Scan(&serverTypeID); err != nil {
		t.Fatal(err)
	}
	if err = adminDB.QueryRow(`SELECT id FROM asset_types WHERE code='RACK'`).Scan(&rackTypeID); err != nil {
		t.Fatal(err)
	}
	if err = adminDB.QueryRow(`SELECT id FROM asset_types WHERE code='SWITCH'`).Scan(&switchTypeID); err != nil {
		t.Fatal(err)
	}
	invokeGeneric := func(session, assetTypeID, name string, extra map[string]interface{}) *httptest.ResponseRecorder {
		body := map[string]interface{}{"asset_type_id": assetTypeID, "name": name}
		for key, value := range extra {
			body[key] = value
		}
		encoded, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/api/dcim/assets", bytes.NewReader(encoded))
		req.AddCookie(&http.Cookie{Name: "session_token", Value: session})
		rec := httptest.NewRecorder()
		(&DCIMHandler{DB: runtimeDB}).HandleAssets(rec, req)
		return rec
	}
	type persistedState struct{ Locations, Assets, Subtypes, Counter, Audit int }
	snapshot := func(scopeTenant, rule, scopeBranch string) persistedState {
		t.Helper()
		var state persistedState
		queries := []struct {
			query string
			dest  *int
			args  []interface{}
		}{
			{`SELECT count(*) FROM locations WHERE tenant_id=$1`, &state.Locations, []interface{}{scopeTenant}},
			{`SELECT count(*) FROM assets WHERE tenant_id=$1`, &state.Assets, []interface{}{scopeTenant}},
			{`SELECT count(*) FROM mdf_idf WHERE tenant_id=$1`, &state.Subtypes, []interface{}{scopeTenant}},
			{`SELECT COALESCE(MAX(last_seq),0) FROM nomenclature_branch_counters WHERE nomenclature_id=$1 AND branch_id=$2`, &state.Counter, []interface{}{rule, scopeBranch}},
			{`SELECT count(*) FROM asset_logs WHERE tenant_id=$1`, &state.Audit, []interface{}{scopeTenant}},
		}
		for _, query := range queries {
			if err = adminDB.QueryRow(query.query, query.args...).Scan(query.dest); err != nil {
				t.Fatal(err)
			}
		}
		return state
	}
	assertDeniedWithoutWrites := func(label string, before persistedState, rec *httptest.ResponseRecorder) {
		t.Helper()
		after := snapshot(tenant, mdfRule, branch)
		if rec.Code < 400 || rec.Code >= 500 || after != before {
			t.Fatalf("%s status=%d before=%+v after=%+v body=%s", label, rec.Code, before, after, rec.Body.String())
		}
		body := strings.ToLower(rec.Body.String())
		for _, forbidden := range []string{"pq:", "constraint", "insert into", "relation ", "sqlstate"} {
			if strings.Contains(body, forbidden) {
				t.Fatalf("%s exposed database detail %q: %s", label, forbidden, rec.Body.String())
			}
		}
	}

	mdf := invoke(token, "MDF", "Zone MDF", map[string]string{"zone_id": zone})
	if mdf.Code != http.StatusCreated || !strings.Contains(mdf.Body.String(), `"internal_code":"MDF-TJ-ZA-001"`) {
		t.Fatalf("MDF status=%d body=%s", mdf.Code, mdf.Body.String())
	}
	idf := invoke(token, "IDF", "Zone IDF", map[string]string{"zone_id": zone})
	if idf.Code != http.StatusCreated || !strings.Contains(idf.Body.String(), `"internal_code":"IDF-TJ-ZA-001"`) {
		t.Fatalf("IDF status=%d body=%s", idf.Code, idf.Body.String())
	}
	dual := invoke(token, "MDF", "Dual MDF", map[string]string{"zone_id": zone, "internal_area_id": area})
	if dual.Code != http.StatusCreated || !strings.Contains(dual.Body.String(), `"internal_code":"MDF-TJ-ZA-002"`) {
		t.Fatalf("dual status=%d body=%s", dual.Code, dual.Body.String())
	}
	var dualReferences string
	if err = adminDB.QueryRow(`SELECT zone_id::text||'|'||internal_area_id::text FROM locations WHERE tenant_id=$1 AND name='Dual MDF'`, tenant).Scan(&dualReferences); err != nil || dualReferences != zone+"|"+area {
		t.Fatalf("dual references=%q err=%v", dualReferences, err)
	}

	assertExactCreationDelta := func(label string, before, after persistedState) {
		t.Helper()
		if after.Locations-before.Locations != 1 || after.Assets-before.Assets != 1 || after.Subtypes-before.Subtypes != 1 || after.Counter-before.Counter != 1 || after.Audit-before.Audit != 1 {
			t.Fatalf("%s non-exact side effects before=%+v after=%+v", label, before, after)
		}
	}
	genericMDFBefore := snapshot(tenant, mdfRule, branch)
	genericMDF := invokeGeneric(token, mdfTypeID, "Generic Zone MDF", map[string]interface{}{"zone_id": zone})
	if genericMDF.Code != http.StatusCreated || !strings.Contains(genericMDF.Body.String(), `"internal_code":"MDF-TJ-ZA-003"`) {
		t.Fatalf("generic MDF status=%d body=%s", genericMDF.Code, genericMDF.Body.String())
	}
	assertExactCreationDelta("generic MDF", genericMDFBefore, snapshot(tenant, mdfRule, branch))
	genericIDFBefore := snapshot(tenant, idfRule, branch)
	genericIDF := invokeGeneric(token, idfTypeID, "Generic Zone IDF", map[string]interface{}{"zone_id": zone})
	if genericIDF.Code != http.StatusCreated || !strings.Contains(genericIDF.Body.String(), `"internal_code":"IDF-TJ-ZA-002"`) {
		t.Fatalf("generic IDF status=%d body=%s", genericIDF.Code, genericIDF.Body.String())
	}
	assertExactCreationDelta("generic IDF", genericIDFBefore, snapshot(tenant, idfRule, branch))
	for name, test := range map[string]struct {
		extra map[string]interface{}
		code  int
	}{
		"generic missing zone":                {map[string]interface{}{}, http.StatusUnprocessableEntity},
		"generic tenant spoof":                {map[string]interface{}{"zone_id": zone, "tenant_id": otherTenant}, http.StatusForbidden},
		"generic branch spoof":                {map[string]interface{}{"zone_id": zone, "branch_id": branchB}, http.StatusForbidden},
		"generic cross tenant":                {map[string]interface{}{"zone_id": crossTenantZone}, http.StatusUnprocessableEntity},
		"generic cross branch":                {map[string]interface{}{"zone_id": crossBranchZone}, http.StatusUnprocessableEntity},
		"generic wrong-tenant location":       {map[string]interface{}{"zone_id": zone, "location_id": wrongTenantLocation}, http.StatusUnprocessableEntity},
		"generic wrong-branch location":       {map[string]interface{}{"zone_id": zone, "location_id": wrongBranchLocation}, http.StatusUnprocessableEntity},
		"generic warehouse location":          {map[string]interface{}{"zone_id": zone, "location_id": warehouseLocation}, http.StatusUnprocessableEntity},
		"generic legacy MDF location":         {map[string]interface{}{"zone_id": zone, "location_id": legacyLocation}, http.StatusUnprocessableEntity},
		"generic dual mismatch":               {map[string]interface{}{"zone_id": mismatchZone, "internal_area_id": area}, http.StatusUnprocessableEntity},
		"generic structural asset type spoof": {map[string]interface{}{"type": "SERVER", "asset_type_code": "SERVER"}, http.StatusUnprocessableEntity},
	} {
		before := snapshot(tenant, mdfRule, branch)
		rec := invokeGeneric(token, mdfTypeID, name, test.extra)
		if rec.Code != test.code || snapshot(tenant, mdfRule, branch) != before {
			t.Fatalf("%s status=%d before=%+v after=%+v body=%s", name, rec.Code, before, snapshot(tenant, mdfRule, branch), rec.Body.String())
		}
		responseBody := strings.ToLower(rec.Body.String())
		for _, forbidden := range []string{"pq:", "constraint", "insert into", "relation ", "sqlstate", "locations", "assets", "mdf_idf"} {
			if strings.Contains(responseBody, forbidden) {
				t.Fatalf("%s exposed database detail %q: %s", name, forbidden, rec.Body.String())
			}
		}
	}
	multipleRuleBefore := snapshot(tenant, mdfRule, branch)
	duplicateActiveRule := uuid.NewString()
	if _, duplicateErr := adminDB.Exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_zone,context_mode,seq_digits,last_seq,active,rule_version,supersedes_rule_id) VALUES($1,$2,'MDF','MDF2','-',true,true,'CANONICAL_ZONE',3,0,true,2,$3)`, duplicateActiveRule, tenant, mdfRule); duplicateErr == nil {
		t.Fatal("canonical schema accepted multiple active MDF naming rules")
	}
	if after := snapshot(tenant, mdfRule, branch); after != multipleRuleBefore {
		t.Fatalf("multiple-rule rejection mutated persistence before=%+v after=%+v", multipleRuleBefore, after)
	}
	rack := invokeGeneric(token, rackTypeID, "Generic rack", map[string]interface{}{"location_id": warehouseLocation, "technical_data": map[string]interface{}{"total_u": 42}})
	if rack.Code != http.StatusCreated {
		t.Fatalf("generic RACK status=%d body=%s", rack.Code, rack.Body.String())
	}
	var rackRows int
	if err = adminDB.QueryRow(`SELECT count(*) FROM racks r JOIN assets a ON a.id=r.asset_id WHERE a.tenant_id=$1 AND a.name='Generic rack'`, tenant).Scan(&rackRows); err != nil || rackRows != 1 {
		t.Fatalf("generic RACK rows=%d err=%v", rackRows, err)
	}
	switchRec := invokeGeneric(token, switchTypeID, "Generic switch", map[string]interface{}{"location_id": warehouseLocation, "technical_data": map[string]interface{}{"port_count": 24}})
	if switchRec.Code != http.StatusCreated {
		t.Fatalf("generic SWITCH status=%d body=%s", switchRec.Code, switchRec.Body.String())
	}
	var switchRows int
	if err = adminDB.QueryRow(`SELECT count(*) FROM switches s JOIN assets a ON a.id=s.asset_id WHERE a.tenant_id=$1 AND a.name='Generic switch'`, tenant).Scan(&switchRows); err != nil || switchRows != 1 {
		t.Fatalf("generic SWITCH rows=%d err=%v", switchRows, err)
	}
	server := invokeGeneric(token, serverTypeID, "Generic server", map[string]interface{}{})
	if server.Code != http.StatusCreated {
		t.Fatalf("non-MDF generic status=%d body=%s", server.Code, server.Body.String())
	}
	var serverRows int
	if err = adminDB.QueryRow(`SELECT count(*) FROM assets WHERE tenant_id=$1 AND name='Generic server'`, tenant).Scan(&serverRows); err != nil || serverRows != 1 {
		t.Fatalf("generic SERVER rows=%d err=%v", serverRows, err)
	}
	for name, test := range map[string]struct {
		extra map[string]string
		code  int
	}{
		"missing zone":      {map[string]string{}, http.StatusUnprocessableEntity},
		"cross branch":      {map[string]string{"zone_id": crossBranchZone}, http.StatusUnprocessableEntity},
		"cross tenant":      {map[string]string{"zone_id": crossTenantZone}, http.StatusUnprocessableEntity},
		"tenant spoof":      {map[string]string{"zone_id": zone, "tenant_id": otherTenant}, http.StatusForbidden},
		"branch spoof":      {map[string]string{"zone_id": zone, "branch_id": branchB}, http.StatusForbidden},
		"dual mismatch":     {map[string]string{"zone_id": mismatchZone, "internal_area_id": area}, http.StatusUnprocessableEntity},
		"dual unprovable":   {map[string]string{"zone_id": zone, "internal_area_id": unprovableArea}, http.StatusUnprocessableEntity},
		"dual cross branch": {map[string]string{"zone_id": zone, "internal_area_id": branchBArea}, http.StatusUnprocessableEntity},
		"dual cross tenant": {map[string]string{"zone_id": zone, "internal_area_id": otherArea}, http.StatusUnprocessableEntity},
	} {
		before := snapshot(tenant, mdfRule, branch)
		rec := invoke(token, "MDF", name, test.extra)
		if rec.Code != test.code {
			t.Fatalf("%s status=%d body=%s", name, rec.Code, rec.Body.String())
		}
		assertDeniedWithoutWrites(name, before, rec)
	}
	unauthBefore := snapshot(tenant, mdfRule, branch)
	unauthBody, _ := json.Marshal(map[string]string{"type": "MDF", "name": "unauthenticated", "zone_id": zone})
	unauthReq := httptest.NewRequest(http.MethodPost, "/api/infra/mdf-idf", bytes.NewReader(unauthBody))
	unauthRec := httptest.NewRecorder()
	RequireTenantTx(runtimeDB, handleMdfIdf)(unauthRec, unauthReq)
	if unauthRec.Code != http.StatusUnauthorized || snapshot(tenant, mdfRule, branch) != unauthBefore {
		t.Fatalf("unauthenticated status=%d body=%s", unauthRec.Code, unauthRec.Body.String())
	}

	if _, err = adminDB.Exec(`UPDATE naming_rules SET active=false WHERE id=$1`, mdfRule); err != nil {
		t.Fatal(err)
	}
	if _, err = adminDB.Exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,include_zone,context_mode,seq_digits,last_seq,active,rule_version,supersedes_rule_id) VALUES($1,$2,'MDF','MDF','-',true,true,true,false,'LEGACY_INTERNAL_AREA',3,0,true,2,$3)`, legacyFallbackRule, tenant, mdfRule); err != nil {
		t.Fatal(err)
	}
	missingBefore := snapshot(tenant, mdfRule, branch)
	missingRule := invoke(token, "MDF", "Missing Zone rule", map[string]string{"zone_id": zone})
	if missingRule.Code != http.StatusUnprocessableEntity || !strings.Contains(missingRule.Body.String(), "NAMING_RULE_ZONE_CONTEXT_REQUIRED") {
		t.Fatalf("missing rule status=%d body=%s", missingRule.Code, missingRule.Body.String())
	}
	assertDeniedWithoutWrites("legacy-rule-only Zone", missingBefore, missingRule)
	genericMissingBefore := snapshot(tenant, mdfRule, branch)
	genericMissingRule := invokeGeneric(token, mdfTypeID, "Generic missing Zone rule", map[string]interface{}{"zone_id": zone})
	if genericMissingRule.Code != http.StatusUnprocessableEntity || !strings.Contains(genericMissingRule.Body.String(), "NAMING_RULE_ZONE_CONTEXT_REQUIRED") || snapshot(tenant, mdfRule, branch) != genericMissingBefore {
		t.Fatalf("generic missing rule status=%d body=%s", genericMissingRule.Code, genericMissingRule.Body.String())
	}
	if _, err = adminDB.Exec(`UPDATE naming_rules SET active=false WHERE id=$1`, legacyFallbackRule); err != nil {
		t.Fatal(err)
	}
	if _, err = adminDB.Exec(`UPDATE naming_rules SET active=true WHERE id=$1`, mdfRule); err != nil {
		t.Fatal(err)
	}

	rollbackBefore := snapshot(tenant, mdfRule, branch)
	failure := "fail_b1d_audit_" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	if _, err = adminDB.Exec(fmt.Sprintf(`CREATE FUNCTION %s() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced B1D failure'; END $$; CREATE TRIGGER %s BEFORE INSERT ON asset_logs FOR EACH ROW EXECUTE FUNCTION %s()`, failure, failure, failure)); err != nil {
		t.Fatal(err)
	}
	failed := invoke(token, "MDF", "Rollback MDF", map[string]string{"zone_id": zone})
	if _, err = adminDB.Exec(fmt.Sprintf(`DROP TRIGGER %s ON asset_logs; DROP FUNCTION %s()`, failure, failure)); err != nil {
		t.Fatal(err)
	}
	if failed.Code != http.StatusInternalServerError {
		t.Fatalf("rollback status=%d body=%s", failed.Code, failed.Body.String())
	}
	rollbackAfter := snapshot(tenant, mdfRule, branch)
	if rollbackAfter != rollbackBefore {
		t.Fatalf("forced rollback before=%+v after=%+v", rollbackBefore, rollbackAfter)
	}
	genericRollbackBefore := snapshot(tenant, mdfRule, branch)
	genericFailure := "fail_b2_audit_" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	if _, err = adminDB.Exec(fmt.Sprintf(`CREATE FUNCTION %s() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced B2 failure'; END $$; CREATE TRIGGER %s BEFORE INSERT ON asset_logs FOR EACH ROW EXECUTE FUNCTION %s()`, genericFailure, genericFailure, genericFailure)); err != nil {
		t.Fatal(err)
	}
	genericFailed := invokeGeneric(token, mdfTypeID, "Generic rollback MDF", map[string]interface{}{"zone_id": zone})
	if _, err = adminDB.Exec(fmt.Sprintf(`DROP TRIGGER %s ON asset_logs; DROP FUNCTION %s()`, genericFailure, genericFailure)); err != nil {
		t.Fatal(err)
	}
	if genericFailed.Code != http.StatusInternalServerError || snapshot(tenant, mdfRule, branch) != genericRollbackBefore {
		t.Fatalf("generic rollback status=%d before=%+v after=%+v body=%s", genericFailed.Code, genericRollbackBefore, snapshot(tenant, mdfRule, branch), genericFailed.Body.String())
	}

	legacy := invoke(legacyToken, "MDF", "Legacy MDF", map[string]string{"site_id": legacySite, "internal_area_id": legacyArea})
	if legacy.Code != http.StatusCreated || !strings.Contains(legacy.Body.String(), `"internal_code":"MDF-LG-LEGACY-LEG-001"`) {
		t.Fatalf("legacy status=%d body=%s", legacy.Code, legacy.Body.String())
	}
	legacyBeforeRead := snapshot(legacyTenant, legacyRule, legacyBranch)
	legacyGet := httptest.NewRequest(http.MethodGet, "/api/infra/mdf-idf", nil)
	legacyGet.AddCookie(&http.Cookie{Name: "session_token", Value: legacyToken})
	legacyGetRec := httptest.NewRecorder()
	RequireTenantTx(runtimeDB, handleMdfIdf)(legacyGetRec, legacyGet)
	if legacyGetRec.Code != http.StatusOK || !strings.Contains(legacyGetRec.Body.String(), `"internal_area_id":"`+legacyArea+`"`) || !strings.Contains(legacyGetRec.Body.String(), `"zone_id":""`) || !strings.Contains(legacyGetRec.Body.String(), `"placement_authority":"LEGACY_INTERNAL_AREA"`) {
		t.Fatalf("legacy GET status=%d body=%s", legacyGetRec.Code, legacyGetRec.Body.String())
	}
	if legacyAfterRead := snapshot(legacyTenant, legacyRule, legacyBranch); legacyAfterRead != legacyBeforeRead {
		t.Fatalf("legacy GET mutated state before=%+v after=%+v", legacyBeforeRead, legacyAfterRead)
	}

	get := httptest.NewRequest(http.MethodGet, "/api/infra/mdf-idf", nil)
	get.AddCookie(&http.Cookie{Name: "session_token", Value: token})
	getRec := httptest.NewRecorder()
	RequireTenantTx(runtimeDB, handleMdfIdf)(getRec, get)
	if getRec.Code != http.StatusOK || !strings.Contains(getRec.Body.String(), `"zone_id":"`+zone+`"`) || !strings.Contains(getRec.Body.String(), `"placement_authority":"CANONICAL_ZONE"`) {
		t.Fatalf("GET status=%d body=%s", getRec.Code, getRec.Body.String())
	}
}
