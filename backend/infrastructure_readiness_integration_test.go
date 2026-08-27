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

func TestInfrastructureReadinessPostgreSQL16IsolationAndRefresh(t *testing.T) {
	adminDSN := os.Getenv("ASSET_NOMENCLATURE_TEST_DATABASE_URL")
	runtimeDSN := os.Getenv("ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL")
	if adminDSN == "" || runtimeDSN == "" {
		t.Skip("readiness admin/runtime PostgreSQL URLs not set")
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

	tenantA, tenantB := uuid.NewString(), uuid.NewString()
	branchA, branchA2, branchB := uuid.NewString(), uuid.NewString(), uuid.NewString()
	userA, userB := uuid.NewString(), uuid.NewString()
	tokenA, tokenA2, tokenB := "ready-"+uuid.NewString(), "ready-"+uuid.NewString(), "ready-"+uuid.NewString()
	siteA, areaA := uuid.NewString(), uuid.NewString()
	mdfRule, rackRule := uuid.NewString(), uuid.NewString()
	statements := []struct {
		query string
		args  []interface{}
	}{
		{`INSERT INTO tenants(id,name) VALUES($1,'Readiness A'),($2,'Readiness B')`, []interface{}{tenantA, tenantB}},
		{`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$4,'A1','Branch A','active'),($2,$4,'A2','Branch A2','active'),($3,$5,'B1','Branch B','active')`, []interface{}{branchA, branchA2, branchB, tenantA, tenantB}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$3,'User A','x','active'),($2,$4,'User B','x','active')`, []interface{}{userA, userB, userA + "@example.invalid", userB + "@example.invalid"}},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$3),($2,$4)`, []interface{}{userA, userB, tenantA, tenantB}},
		{`INSERT INTO user_branches(user_id,branch_id) VALUES($1,$3),($1,$4),($2,$5)`, []interface{}{userA, userB, branchA, branchA2, branchB}},
		{`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES($1,$2,$3,$4,$5,4102444800),($6,$2,$3,$7,$8,4102444800),($9,$10,$11,$12,$13,4102444800)`, []interface{}{uuid.NewString(), userA, tenantA, branchA, tokenA, uuid.NewString(), branchA2, tokenA2, uuid.NewString(), userB, tenantB, branchB, tokenB}},
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,include_placement,seq_digits,last_seq,active) VALUES($1,$3,'MDF','MDF','-',true,true,true,false,3,0,true),($2,$3,'RACK','RK','-',true,false,false,true,3,0,true)`, []interface{}{mdfRule, rackRule, tenantA}},
	}
	for _, statement := range statements {
		if _, err = adminDB.Exec(statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
	defer adminDB.Exec(`DELETE FROM tenants WHERE id IN ($1,$2)`, tenantA, tenantB)

	readiness := func(token string) InfrastructureReadinessResponse {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/api/dcim/readiness", nil)
		req.AddCookie(&http.Cookie{Name: "session_token", Value: token})
		rec := httptest.NewRecorder()
		RequireTenantTx(runtimeDB, handleInfrastructureReadiness)(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("readiness status=%d body=%s", rec.Code, rec.Body.String())
		}
		var response InfrastructureReadinessResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		return response
	}
	if got := readiness(tokenA); readinessStep(t, got, "site").Status != "pending" || readinessStep(t, got, "internal_area").Status != "blocked" {
		t.Fatalf("empty=%+v", got)
	}
	if _, err = adminDB.Exec(`INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES($1,$2,$3,'SITE','Site','active')`, siteA, tenantA, branchA); err != nil {
		t.Fatal(err)
	}
	if got := readiness(tokenA); readinessStep(t, got, "site").Status != "complete" || readinessStep(t, got, "internal_area").Status != "available" {
		t.Fatalf("site=%+v", got)
	}
	if _, err = adminDB.Exec(`INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,code,name,status) VALUES($1,$2,$3,$4,'AREA','Area','active')`, areaA, tenantA, branchA, siteA); err != nil {
		t.Fatal(err)
	}
	if got := readiness(tokenA); readinessStep(t, got, "internal_area").Status != "complete" || readinessStep(t, got, "mdf_idf").Status != "available" {
		t.Fatalf("area=%+v", got)
	}

	body := fmt.Sprintf(`{"name":"MDF readiness","site_type":"MDF","site_id":%q,"internal_area_id":%q}`, siteA, areaA)
	post := httptest.NewRequest(http.MethodPost, "/api/infra/mdf-idf", bytes.NewBufferString(body))
	post.AddCookie(&http.Cookie{Name: "session_token", Value: tokenA})
	postRec := httptest.NewRecorder()
	RequireTenantTx(runtimeDB, handleMdfIdf)(postRec, post)
	if postRec.Code != http.StatusCreated {
		t.Fatalf("MDF POST status=%d body=%s", postRec.Code, postRec.Body.String())
	}
	var created map[string]interface{}
	if err = json.Unmarshal(postRec.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	assetID, _ := created["asset_id"].(string)
	if assetID == "" {
		t.Fatalf("missing asset_id: %s", postRec.Body.String())
	}
	if got := readiness(tokenA); !got.Ready || readinessStep(t, got, "mdf_idf").Status != "complete" || readinessStep(t, got, "rack").Status != "available" {
		t.Fatalf("MDF readiness=%+v", got)
	}
	for _, status := range []string{"inactive", "maintenance", "decommissioned"} {
		if _, err = adminDB.Exec(`UPDATE assets SET status=$1 WHERE id=$2`, status, assetID); err != nil {
			t.Fatal(err)
		}
		if got := readiness(tokenA); readinessStep(t, got, "mdf_idf").Count != 0 || got.Ready {
			t.Fatalf("MDF status %s counted as active: %+v", status, got)
		}
	}
	if _, err = adminDB.Exec(`UPDATE assets SET status='active',inventory_status='retired' WHERE id=$1`, assetID); err != nil {
		t.Fatal(err)
	}
	if got := readiness(tokenA); readinessStep(t, got, "mdf_idf").Count != 0 || got.Ready {
		t.Fatalf("retired MDF counted as active: %+v", got)
	}
	if _, err = adminDB.Exec(`UPDATE assets SET status='active',inventory_status=NULL WHERE id=$1`, assetID); err != nil {
		t.Fatal(err)
	}

	rackReq := httptest.NewRequest(http.MethodPost, "/api/infra/mdf-idf/"+assetID+"/ensure-rack", bytes.NewBufferString(`{"total_u":42}`))
	rackReq.AddCookie(&http.Cookie{Name: "session_token", Value: tokenA})
	rackRec := httptest.NewRecorder()
	RequireTenantTx(runtimeDB, handleEnsureRack)(rackRec, rackReq)
	if rackRec.Code != http.StatusCreated {
		t.Fatalf("rack status=%d body=%s", rackRec.Code, rackRec.Body.String())
	}
	var createdRack map[string]interface{}
	if err = json.Unmarshal(rackRec.Body.Bytes(), &createdRack); err != nil {
		t.Fatal(err)
	}
	rackAssetID, _ := createdRack["rack_asset_id"].(string)
	rackID, _ := createdRack["rack_id"].(string)
	if rackAssetID == "" || rackID == "" {
		t.Fatalf("missing rack identity: %s", rackRec.Body.String())
	}
	if got := readiness(tokenA); readinessStep(t, got, "rack").Status != "complete" {
		t.Fatalf("rack readiness=%+v", got)
	}
	for _, status := range []string{"inactive", "maintenance", "decommissioned"} {
		if _, err = adminDB.Exec(`UPDATE assets SET status=$1 WHERE id=$2`, status, rackAssetID); err != nil {
			t.Fatal(err)
		}
		got := readiness(tokenA)
		if rack := readinessStep(t, got, "rack"); rack.Count != 0 || rack.UnresolvedCount != 0 || rack.Status != "available" {
			t.Fatalf("Rack status %s counted or classified unresolved: %+v", status, rack)
		}
	}
	if _, err = adminDB.Exec(`UPDATE assets SET status='active',inventory_status='retired' WHERE id=$1`, rackAssetID); err != nil {
		t.Fatal(err)
	}
	if rack := readinessStep(t, readiness(tokenA), "rack"); rack.Count != 0 || rack.UnresolvedCount != 0 {
		t.Fatalf("retired Rack counted or classified unresolved: %+v", rack)
	}
	if _, err = adminDB.Exec(`UPDATE assets SET status='active',inventory_status=NULL WHERE id=$1`, rackAssetID); err != nil {
		t.Fatal(err)
	}
	if _, err = adminDB.Exec(`UPDATE racks SET mdf_idf_id=NULL WHERE id=$1`, rackID); err != nil {
		t.Fatal(err)
	}
	if rack := readinessStep(t, readiness(tokenA), "rack"); rack.Count != 0 || rack.UnresolvedCount != 1 || rack.Status != "available" {
		t.Fatalf("legacy Rack was not isolated as unresolved: %+v", rack)
	}

	if got := readiness(tokenA2); got.Branch.ID != branchA2 || readinessStep(t, got, "site").Count != 0 || got.Ready {
		t.Fatalf("cross branch leaked: %+v", got)
	}
	if got := readiness(tokenB); got.Branch.ID != branchB || readinessStep(t, got, "site").Count != 0 || got.Ready {
		t.Fatalf("cross tenant leaked: %+v", got)
	}

	tx, err := runtimeDB.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`SELECT set_config('app.tenant_id',$1,true),set_config('app.branch_id',$2,true)`, tenantB, branchB); err != nil {
		t.Fatal(err)
	}
	var visible int
	if err = tx.QueryRow(`SELECT count(*) FROM buildings WHERE id=$1`, siteA).Scan(&visible); err != nil || visible != 0 {
		t.Fatalf("RLS cross tenant visible=%d err=%v", visible, err)
	}
}
