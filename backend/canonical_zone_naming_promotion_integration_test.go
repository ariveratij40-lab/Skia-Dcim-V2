//go:build integration

package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// TestCanonicalZoneNamingPromotionHTTPPostgreSQL16 runs after the 033 harness
// has built the real pre-033 state and applied the migration. Final MDF/IDF
// rows are created exclusively through RequireTenantTx and createMdfIdf.
func TestCanonicalZoneNamingPromotionHTTPPostgreSQL16(t *testing.T) {
	adminDSN, runtimeDSN := os.Getenv("HF3_DATABASE_URL"), os.Getenv("HF3_RUNTIME_DATABASE_URL")
	if adminDSN == "" || runtimeDSN == "" {
		t.Skip("HF3 fixture URLs not set")
	}
	admin, err := sql.Open("postgres", adminDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	runtimeDB, err := sql.Open("postgres", runtimeDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer runtimeDB.Close()

	const tenant = "33000000-0000-4000-8000-000000000001"
	const branch = "33400000-0000-4000-8000-000000000001"
	const site = "33500000-0000-4000-8000-000000000001"
	const zone = "33700000-0000-4000-8000-000000000001"
	const area = "33800000-0000-4000-8000-000000000001"
	const token = "hf3-http-fixture"

	for _, q := range []string{
		`INSERT INTO users(id,email,name,password_hash,status) VALUES('33900000-0000-4000-8000-000000000001','hf3@example.invalid','HF3','x','active')`,
		`INSERT INTO user_tenants(user_id,tenant_id) VALUES('33900000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001')`,
		`INSERT INTO user_branches(user_id,branch_id) VALUES('33900000-0000-4000-8000-000000000001','33400000-0000-4000-8000-000000000001')`,
		`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES('33900000-0000-4000-8000-000000000002','33900000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','33400000-0000-4000-8000-000000000001','hf3-http-fixture',4102444800)`,
		`INSERT INTO floors(id,tenant_id,building_id,code,name,status) VALUES('33600000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','33500000-0000-4000-8000-000000000001','F1','Floor 1','active')`,
		`INSERT INTO zones(id,tenant_id,branch_id,building_id,floor_id,code,name,status) VALUES('33700000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','33400000-0000-4000-8000-000000000001','33500000-0000-4000-8000-000000000001','33600000-0000-4000-8000-000000000001','ZONE1','Zone 1','active')`,
		`INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,floor_id,zone_id,code,name,status) VALUES('33800000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','33400000-0000-4000-8000-000000000001','33500000-0000-4000-8000-000000000001','33600000-0000-4000-8000-000000000001','33700000-0000-4000-8000-000000000001','AREA1','Area 1','active')`,
	} {
		if _, err = admin.Exec(q); err != nil {
			t.Fatal(err)
		}
	}

	type state struct{ assets, locations, satellites, logs, counter int }
	rule := func(kind string) (id string) {
		if err := admin.QueryRow(`SELECT id FROM naming_rules WHERE tenant_id=$1 AND asset_type_code=$2 AND active AND context_mode='CANONICAL_ZONE'`, tenant, kind).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return
	}
	mdfRule, idfRule := rule("MDF"), rule("IDF")
	if mdfRule == idfRule {
		t.Fatal("MDF and IDF reused one rule")
	}
	var initialMDFSequence, initialIDFSequence int
	if err := admin.QueryRow(`SELECT last_seq FROM naming_rules WHERE id=$1`, mdfRule).Scan(&initialMDFSequence); err != nil {
		t.Fatal(err)
	}
	if err := admin.QueryRow(`SELECT last_seq FROM naming_rules WHERE id=$1`, idfRule).Scan(&initialIDFSequence); err != nil {
		t.Fatal(err)
	}
	if initialMDFSequence != 0 || initialIDFSequence != 0 {
		t.Fatalf("promoted/root sequences MDF=%d IDF=%d", initialMDFSequence, initialIDFSequence)
	}
	snapshot := func(ruleID string) (s state) {
		queries := []struct {
			q string
			p *int
		}{
			{`SELECT count(*) FROM assets WHERE tenant_id=$1`, &s.assets}, {`SELECT count(*) FROM locations WHERE tenant_id=$1`, &s.locations}, {`SELECT count(*) FROM mdf_idf WHERE tenant_id=$1`, &s.satellites}, {`SELECT count(*) FROM asset_logs WHERE tenant_id=$1`, &s.logs},
		}
		for _, x := range queries {
			if err := admin.QueryRow(x.q, tenant).Scan(x.p); err != nil {
				t.Fatal(err)
			}
		}
		if err := admin.QueryRow(`SELECT COALESCE(MAX(last_seq),0) FROM nomenclature_branch_counters WHERE nomenclature_id=$1 AND branch_id=$2`, ruleID, branch).Scan(&s.counter); err != nil {
			t.Fatal(err)
		}
		return
	}
	invoke := func(kind string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]string{"site_type": kind, "name": kind + " canonical", "physical_identity": kind + "-PHY-1", "site_id": site, "zone_id": zone, "internal_area_id": area})
		req := httptest.NewRequest(http.MethodPost, "/api/infra/mdf-idf", bytes.NewReader(body))
		req.AddCookie(&http.Cookie{Name: "session_token", Value: token})
		rec := httptest.NewRecorder()
		RequireTenantTx(runtimeDB, handleMdfIdf)(rec, req)
		return rec
	}
	for _, tc := range []struct{ kind, expected, rule string }{{"MDF", "MDF-B1-ZONE1-001", mdfRule}, {"IDF", "IDF-B1-ZONE1-001", idfRule}} {
		before := snapshot(tc.rule)
		rec := invoke(tc.kind)
		after := snapshot(tc.rule)
		if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), `"internal_code":"`+tc.expected+`"`) {
			t.Fatalf("%s status=%d body=%s", tc.kind, rec.Code, rec.Body.String())
		}
		if after.assets-before.assets != 1 || after.locations-before.locations != 1 || after.satellites-before.satellites != 1 || after.logs-before.logs != 1 || after.counter != 1 {
			t.Fatalf("%s delta before=%+v after=%+v", tc.kind, before, after)
		}
		var governed bool
		var storedZone, storedArea string
		if err := admin.QueryRow(`SELECT l.physical_identity_governed,l.zone_id,l.internal_area_id FROM locations l JOIN assets a ON a.id=l.asset_id WHERE a.internal_code=$1`, tc.expected).Scan(&governed, &storedZone, &storedArea); err != nil || !governed || storedZone != zone || storedArea != area {
			t.Fatalf("%s physical graph governed=%v zone=%s area=%s err=%v", tc.kind, governed, storedZone, storedArea, err)
		}
	}
	var predecessorActive bool
	var predecessorSeq, successorVersion, successorSeq int
	var successorSupersedes string
	if err := admin.QueryRow(`SELECT active,last_seq FROM naming_rules WHERE id='33100000-0000-4000-8000-000000000001'`).Scan(&predecessorActive, &predecessorSeq); err != nil {
		t.Fatal(err)
	}
	if err := admin.QueryRow(`SELECT rule_version,last_seq,supersedes_rule_id FROM naming_rules WHERE id=$1`, mdfRule).Scan(&successorVersion, &successorSeq, &successorSupersedes); err != nil {
		t.Fatal(err)
	}
	if predecessorActive || predecessorSeq != 7 || successorVersion != 2 || successorSeq != 1 || successorSupersedes != "33100000-0000-4000-8000-000000000001" {
		t.Fatalf("promotion predecessor active=%v seq=%d successor version=%d seq=%d supersedes=%s", predecessorActive, predecessorSeq, successorVersion, successorSeq, successorSupersedes)
	}

	// Post-033 isolated legacy-only state represents the original pre-migration
	// contract and proves the handler fails closed with no persistence delta.
	const negativeTenant = "33000000-0000-4000-8000-000000000005"
	const negativeBranch = "33400000-0000-4000-8000-000000000005"
	const negativeToken = "hf3-negative-fixture"
	negativeSetup := []struct {
		q    string
		args []interface{}
	}{
		{`INSERT INTO tenants(id,name) VALUES($1,'Negative')`, []interface{}{negativeTenant}},
		{`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$2,'N1','Negative','active')`, []interface{}{negativeBranch, negativeTenant}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES('33900000-0000-4000-8000-000000000005','negative@example.invalid','Negative','x','active')`, nil},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES('33900000-0000-4000-8000-000000000005',$1)`, []interface{}{negativeTenant}},
		{`INSERT INTO user_branches(user_id,branch_id) VALUES('33900000-0000-4000-8000-000000000005',$1)`, []interface{}{negativeBranch}},
		{`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES('33900000-0000-4000-8000-000000000006','33900000-0000-4000-8000-000000000005',$1,$2,$3,4102444800)`, []interface{}{negativeTenant, negativeBranch, negativeToken}},
		{`INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES('33500000-0000-4000-8000-000000000005',$1,$2,'NSITE','Negative Site','active')`, []interface{}{negativeTenant, negativeBranch}},
		{`INSERT INTO floors(id,tenant_id,building_id,code,name,status) VALUES('33600000-0000-4000-8000-000000000005',$1,'33500000-0000-4000-8000-000000000005','NF1','Negative Floor','active')`, []interface{}{negativeTenant}},
		{`INSERT INTO zones(id,tenant_id,branch_id,building_id,floor_id,code,name,status) VALUES('33700000-0000-4000-8000-000000000005',$1,$2,'33500000-0000-4000-8000-000000000005','33600000-0000-4000-8000-000000000005','NZONE','Negative Zone','active')`, []interface{}{negativeTenant, negativeBranch}},
		{`INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,floor_id,zone_id,code,name,status) VALUES('33800000-0000-4000-8000-000000000005',$1,$2,'33500000-0000-4000-8000-000000000005','33600000-0000-4000-8000-000000000005','33700000-0000-4000-8000-000000000005','NAREA','Negative Area','active')`, []interface{}{negativeTenant, negativeBranch}},
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,include_zone,context_mode,seq_digits,last_seq,active) VALUES('33100000-0000-4000-8000-000000000005',$1,'MDF','MDF','-',true,true,true,false,'LEGACY_INTERNAL_AREA',3,0,true)`, []interface{}{negativeTenant}},
		{`UPDATE naming_rules SET last_seq=4 WHERE id='33100000-0000-4000-8000-000000000005'`, nil},
	}
	for _, s := range negativeSetup {
		if _, err := admin.Exec(s.q, s.args...); err != nil {
			t.Fatal(err)
		}
	}
	var beforeAssets, beforeLocations, beforeSatellites, beforeLogs int
	if err := admin.QueryRow(`SELECT (SELECT count(*) FROM assets WHERE tenant_id=$1),(SELECT count(*) FROM locations WHERE tenant_id=$1),(SELECT count(*) FROM mdf_idf WHERE tenant_id=$1),(SELECT count(*) FROM asset_logs WHERE tenant_id=$1)`, negativeTenant).Scan(&beforeAssets, &beforeLocations, &beforeSatellites, &beforeLogs); err != nil {
		t.Fatal(err)
	}
	negativeBody, _ := json.Marshal(map[string]string{"site_type": "MDF", "name": "Denied", "physical_identity": "DENIED", "site_id": "33500000-0000-4000-8000-000000000005", "zone_id": "33700000-0000-4000-8000-000000000005", "internal_area_id": "33800000-0000-4000-8000-000000000005"})
	negativeReq := httptest.NewRequest(http.MethodPost, "/api/infra/mdf-idf", bytes.NewReader(negativeBody))
	negativeReq.AddCookie(&http.Cookie{Name: "session_token", Value: negativeToken})
	negativeRec := httptest.NewRecorder()
	RequireTenantTx(runtimeDB, handleMdfIdf)(negativeRec, negativeReq)
	if negativeRec.Code != http.StatusUnprocessableEntity || !strings.Contains(negativeRec.Body.String(), "NAMING_RULE_ZONE_CONTEXT_REQUIRED") {
		t.Fatalf("legacy-only status=%d body=%s", negativeRec.Code, negativeRec.Body.String())
	}
	var afterAssets, afterLocations, afterSatellites, afterLogs int
	if err := admin.QueryRow(`SELECT (SELECT count(*) FROM assets WHERE tenant_id=$1),(SELECT count(*) FROM locations WHERE tenant_id=$1),(SELECT count(*) FROM mdf_idf WHERE tenant_id=$1),(SELECT count(*) FROM asset_logs WHERE tenant_id=$1)`, negativeTenant).Scan(&afterAssets, &afterLocations, &afterSatellites, &afterLogs); err != nil {
		t.Fatal(err)
	}
	if [4]int{beforeAssets, beforeLocations, beforeSatellites, beforeLogs} != [4]int{afterAssets, afterLocations, afterSatellites, afterLogs} {
		t.Fatalf("legacy-only request wrote rows before=%v after=%v", [4]int{beforeAssets, beforeLocations, beforeSatellites, beforeLogs}, [4]int{afterAssets, afterLocations, afterSatellites, afterLogs})
	}
}
