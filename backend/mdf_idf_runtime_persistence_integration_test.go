package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
)

// TestMdfIdfRuntimePersistencePostgreSQL16 exercises the production request
// path with the restricted runtime identity. It proves the base asset,
// satellite, placement and audit are one TenantTx, and that an audit failure
// rolls the entire unit (including the branch-scoped sequence) back.
func TestMdfIdfRuntimePersistencePostgreSQL16(t *testing.T) {
	adminDSN := os.Getenv("ASSET_NOMENCLATURE_TEST_DATABASE_URL")
	runtimeDSN := os.Getenv("ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL")
	if adminDSN == "" || runtimeDSN == "" {
		t.Skip("MDF/IDF admin/runtime PostgreSQL URLs not set")
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

	tenantID, otherTenantID := uuid.NewString(), uuid.NewString()
	branchID, otherBranchID, crossTenantBranchID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	userID, token := uuid.NewString(), "mdf-runtime-"+uuid.NewString()
	ruleID, siteID, areaID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	otherBranchSiteID, otherBranchAreaID := uuid.NewString(), uuid.NewString()
	otherTenantSiteID, otherTenantAreaID := uuid.NewString(), uuid.NewString()
	setup := []struct {
		query string
		args  []interface{}
	}{
		{`INSERT INTO tenants(id,name) VALUES($1,'MDF runtime'),($2,'MDF other tenant')`, []interface{}{tenantID, otherTenantID}},
		{`INSERT INTO branches(id,tenant_id,code,name,city,status) VALUES($1,$4,'TJ','Primary','Tijuana','active'),($2,$4,'MEX','Other branch','Mexico','active'),($3,$5,'OTR','Cross tenant','Other','active')`, []interface{}{branchID, otherBranchID, crossTenantBranchID, tenantID, otherTenantID}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,'MDF runtime user','x','active')`, []interface{}{userID, userID + "@example.invalid"}},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$2)`, []interface{}{userID, tenantID}},
		{`INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)`, []interface{}{userID, branchID}},
		{`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES($1,$2,$3,$4,$5,4102444800)`, []interface{}{uuid.NewString(), userID, tenantID, branchID, token}},
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,include_placement,seq_digits,last_seq,active) VALUES($1,$2,'MDF','MDF','-',true,true,true,false,3,0,true)`, []interface{}{ruleID, tenantID}},
		{`INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES($1,$2,$3,'PARQUE','Parque','active')`, []interface{}{siteID, tenantID, branchID}},
		{`INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,code,name,status) VALUES($1,$2,$3,$4,'PROD','Producción','active')`, []interface{}{areaID, tenantID, branchID, siteID}},
		{`INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES($1,$2,$3,'SUC-B','Sucursal B','active')`, []interface{}{otherBranchSiteID, tenantID, otherBranchID}},
		{`INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,code,name,status) VALUES($1,$2,$3,$4,'AREA-B','Área B','active')`, []interface{}{otherBranchAreaID, tenantID, otherBranchID, otherBranchSiteID}},
		{`INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES($1,$2,$3,'TEN-B','Tenant B','active')`, []interface{}{otherTenantSiteID, otherTenantID, crossTenantBranchID}},
		{`INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,code,name,status) VALUES($1,$2,$3,$4,'AREA-TB','Área Tenant B','active')`, []interface{}{otherTenantAreaID, otherTenantID, crossTenantBranchID, otherTenantSiteID}},
	}
	for _, statement := range setup {
		if _, err = adminDB.Exec(statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
	defer adminDB.Exec(`DELETE FROM tenants WHERE id IN ($1,$2)`, tenantID, otherTenantID)

	invoke := func(name, requestedSiteID, requestedAreaID string) *httptest.ResponseRecorder {
		t.Helper()
		body, marshalErr := json.Marshal(map[string]interface{}{
			"name": name, "site_type": "MDF", "site_id": requestedSiteID,
			"internal_area_id": requestedAreaID, "status": "active",
		})
		if marshalErr != nil {
			t.Fatal(marshalErr)
		}
		request := httptest.NewRequest(http.MethodPost, "/api/infra/mdf-idf", bytes.NewReader(body))
		request.AddCookie(&http.Cookie{Name: "session_token", Value: token})
		recorder := httptest.NewRecorder()
		RequireTenantTx(runtimeDB, handleMdfIdf)(recorder, request)
		return recorder
	}
	if crossBranch := invoke("MDF cross branch", otherBranchSiteID, otherBranchAreaID); crossBranch.Code != http.StatusUnprocessableEntity {
		t.Fatalf("cross-branch physical context status=%d body=%s", crossBranch.Code, crossBranch.Body.String())
	}
	if crossTenant := invoke("MDF cross tenant", otherTenantSiteID, otherTenantAreaID); crossTenant.Code != http.StatusUnprocessableEntity {
		t.Fatalf("cross-tenant physical context status=%d body=%s", crossTenant.Code, crossTenant.Body.String())
	}

	failureFunction := "fail_mdf_audit_" + uuid.NewString()[:8]
	if _, err = adminDB.Exec(fmt.Sprintf(`CREATE FUNCTION %s() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced MDF audit failure'; END $$; CREATE TRIGGER %s BEFORE INSERT ON asset_logs FOR EACH ROW EXECUTE FUNCTION %s()`, failureFunction, failureFunction, failureFunction)); err != nil {
		t.Fatal(err)
	}
	failed := invoke("MDF audit rollback", siteID, areaID)
	if _, err = adminDB.Exec(fmt.Sprintf(`DROP TRIGGER %s ON asset_logs; DROP FUNCTION %s()`, failureFunction, failureFunction)); err != nil {
		t.Fatal(err)
	}
	if failed.Code != http.StatusInternalServerError {
		t.Fatalf("audit failure status=%d body=%s", failed.Code, failed.Body.String())
	}
	var count, sequence int
	for label, query := range map[string]string{
		"asset":     `SELECT count(*) FROM assets WHERE tenant_id=$1 AND name='MDF audit rollback'`,
		"satellite": `SELECT count(*) FROM mdf_idf WHERE tenant_id=$1`,
		"placement": `SELECT count(*) FROM locations WHERE tenant_id=$1 AND name='MDF audit rollback'`,
		"audit":     `SELECT count(*) FROM asset_logs WHERE tenant_id=$1`,
	} {
		if err = adminDB.QueryRow(query, tenantID).Scan(&count); err != nil || count != 0 {
			t.Fatalf("%s survived rollback count=%d err=%v", label, count, err)
		}
	}
	if err = adminDB.QueryRow(`SELECT COALESCE(MAX(last_seq),0) FROM nomenclature_branch_counters WHERE nomenclature_id=$1 AND branch_id=$2`, ruleID, branchID).Scan(&sequence); err != nil || sequence != 0 {
		t.Fatalf("rollback consumed sequence=%d err=%v", sequence, err)
	}

	commitFailureFunction := "fail_mdf_commit_" + uuid.NewString()[:8]
	if _, err = adminDB.Exec(fmt.Sprintf(`CREATE FUNCTION %s() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced deferred commit failure'; END $$; CREATE CONSTRAINT TRIGGER %s AFTER INSERT ON assets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.name = 'MDF commit failure') EXECUTE FUNCTION %s()`, commitFailureFunction, commitFailureFunction, commitFailureFunction)); err != nil {
		t.Fatal(err)
	}
	commitFailed := invoke("MDF commit failure", siteID, areaID)
	if _, err = adminDB.Exec(fmt.Sprintf(`DROP TRIGGER %s ON assets; DROP FUNCTION %s()`, commitFailureFunction, commitFailureFunction)); err != nil {
		t.Fatal(err)
	}
	if commitFailed.Code != http.StatusInternalServerError {
		t.Fatalf("commit failure leaked success status=%d body=%s", commitFailed.Code, commitFailed.Body.String())
	}
	if err = adminDB.QueryRow(`SELECT count(*) FROM assets WHERE tenant_id=$1 AND name='MDF commit failure'`, tenantID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("commit failure persisted asset count=%d err=%v", count, err)
	}
	if err = adminDB.QueryRow(`SELECT COALESCE(MAX(last_seq),0) FROM nomenclature_branch_counters WHERE nomenclature_id=$1 AND branch_id=$2`, ruleID, branchID).Scan(&sequence); err != nil || sequence != 0 {
		t.Fatalf("commit failure consumed sequence=%d err=%v", sequence, err)
	}

	created := invoke("MDF persisted", siteID, areaID)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body.String())
	}
	var response struct {
		ID           string `json:"id"`
		InternalCode string `json:"internal_code"`
	}
	if err = json.Unmarshal(created.Body.Bytes(), &response); err != nil || response.ID == "" || response.InternalCode != "MDF-TJ-PARQUE-PROD-001" {
		t.Fatalf("create response=%s err=%v", created.Body.String(), err)
	}
	if err = adminDB.QueryRow(`SELECT count(*) FROM assets a JOIN mdf_idf m ON m.asset_id=a.id JOIN locations l ON l.asset_id=a.id JOIN asset_logs al ON al.asset_id=a.id WHERE a.id=$1 AND a.tenant_id=$2 AND a.branch_id=$3 AND al.event_type='created'`, response.ID, tenantID, branchID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("complete MDF persistence count=%d err=%v", count, err)
	}
	if err = adminDB.QueryRow(`SELECT last_seq FROM nomenclature_branch_counters WHERE nomenclature_id=$1 AND branch_id=$2`, ruleID, branchID).Scan(&sequence); err != nil || sequence != 1 {
		t.Fatalf("committed sequence=%d err=%v", sequence, err)
	}

	assertInvisible := func(label, scopedTenant, scopedBranch string) {
		t.Helper()
		tx, beginErr := BeginTenantTx(context.Background(), runtimeDB, scopedTenant, scopedBranch)
		if beginErr != nil {
			t.Fatal(beginErr)
		}
		defer tx.Rollback()
		var assets, logs int
		if queryErr := tx.QueryRow(`SELECT count(*) FROM assets WHERE id=$1`, response.ID).Scan(&assets); queryErr != nil {
			t.Fatal(queryErr)
		}
		if queryErr := tx.QueryRow(`SELECT count(*) FROM asset_logs WHERE asset_id=$1`, response.ID).Scan(&logs); queryErr != nil {
			t.Fatal(queryErr)
		}
		if assets != 0 || logs != 0 {
			t.Fatalf("%s leaked assets=%d logs=%d", label, assets, logs)
		}
	}
	assertInvisible("cross-branch", tenantID, otherBranchID)
	assertInvisible("cross-tenant", otherTenantID, crossTenantBranchID)

	for _, privilege := range []struct {
		table   string
		allowed string
		denied  string
	}{
		{"assets", "SELECT,INSERT,UPDATE,DELETE", "TRUNCATE,REFERENCES,TRIGGER"},
		{"asset_logs", "SELECT,INSERT", "UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER"},
		{"asset_relationships", "", "SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER"},
	} {
		if privilege.allowed != "" {
			var allowed bool
			if err = adminDB.QueryRow(`SELECT has_table_privilege('skia_runtime',$1,$2)`, privilege.table, privilege.allowed).Scan(&allowed); err != nil || !allowed {
				t.Fatalf("%s missing %s err=%v", privilege.table, privilege.allowed, err)
			}
		}
		var denied bool
		if err = adminDB.QueryRow(`SELECT has_table_privilege('skia_runtime',$1,$2)`, privilege.table, privilege.denied).Scan(&denied); err != nil || denied {
			t.Fatalf("%s unexpectedly has %s err=%v", privilege.table, privilege.denied, err)
		}
	}
}
