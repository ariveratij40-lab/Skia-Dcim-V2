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
	mdfRule, idfRule, legacyRule := uuid.NewString(), uuid.NewString(), uuid.NewString()
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
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,include_zone,context_mode,seq_digits,last_seq,active) VALUES($1,$4,'MDF','MDF','-',true,false,false,true,'CANONICAL_ZONE',3,0,true),($2,$4,'IDF','IDF','-',true,false,false,true,'CANONICAL_ZONE',3,0,true),($3,$5,'MDF','MDF','-',true,true,true,false,'LEGACY_INTERNAL_AREA',3,0,true)`, []interface{}{mdfRule, idfRule, legacyRule, tenant, legacyTenant}},
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
	type persistedState struct{ Locations, Assets, Subtypes, Counter int }
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
