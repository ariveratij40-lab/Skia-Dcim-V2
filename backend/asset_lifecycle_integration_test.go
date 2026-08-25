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

// TestSwitchLifecyclePostgres reproduce el flujo de QA contra PostgreSQL real.
// La misma prueba demuestra persistencia de base+satélite, baja, inventario
// operacional, auditoría, rollback y no reutilización del consecutivo.
func TestSwitchLifecyclePostgres(t *testing.T) {
	adminDSN := os.Getenv("ASSET_NOMENCLATURE_TEST_DATABASE_URL")
	runtimeDSN := os.Getenv("ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL")
	if adminDSN == "" || runtimeDSN == "" {
		t.Skip("asset lifecycle admin/runtime test database URLs not set")
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

	tenantID, branchID, userID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	ruleID, placementID := uuid.NewString(), uuid.NewString()
	token := "lifecycle-" + uuid.NewString()
	setup := []struct {
		query string
		args  []interface{}
	}{
		{`INSERT INTO tenants(id,name) VALUES($1,'Lifecycle integration')`, []interface{}{tenantID}},
		{`INSERT INTO branches(id,tenant_id,name,city,status) VALUES($1,$2,'Lifecycle branch','TIJ','active')`, []interface{}{branchID, tenantID}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,'Lifecycle user','x','active')`, []interface{}{userID, "lifecycle-" + userID + "@example.invalid"}},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$2)`, []interface{}{userID, tenantID}},
		{`INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)`, []interface{}{userID, branchID}},
		{`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES($1,$2,$3,$4,$5,4102444800)`, []interface{}{uuid.NewString(), userID, tenantID, branchID, token}},
		{`INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,placement_code,status) VALUES($1,$2,$3,'IDF Lifecycle','IDF','IDF01','active')`, []interface{}{placementID, tenantID, branchID}},
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,seq_digits,last_seq,active,include_placement) VALUES($1,$2,'SWITCH','SW','-',4,0,true,true)`, []interface{}{ruleID, tenantID}},
	}
	for _, statement := range setup {
		if _, err = adminDB.Exec(statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
	defer adminDB.Exec(`DELETE FROM tenants WHERE id=$1`, tenantID)

	invokeCreate := func(name string) string {
		t.Helper()
		request := httptest.NewRequest(http.MethodPost, "/api/infra/switches", bytes.NewBufferString(fmt.Sprintf(`{"name":%q,"placement_id":%q}`, name, placementID)))
		request.AddCookie(&http.Cookie{Name: "session_token", Value: token})
		recorder := httptest.NewRecorder()
		RequireTenantTx(runtimeDB, handleSwitches)(recorder, request)
		if recorder.Code != http.StatusCreated {
			t.Fatalf("create status=%d body=%s", recorder.Code, recorder.Body.String())
		}
		var response struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil || response.ID == "" {
			t.Fatalf("create response=%s err=%v", recorder.Body.String(), err)
		}
		return response.ID
	}
	invokeDelete := func(assetID string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(http.MethodDelete, "/api/dcim/assets/"+assetID, nil)
		request.AddCookie(&http.Cookie{Name: "session_token", Value: token})
		recorder := httptest.NewRecorder()
		(&DCIMHandler{DB: runtimeDB}).HandleAssetByID(recorder, request)
		return recorder
	}

	assetID := invokeCreate("Lifecycle switch 1")
	var assetStatus string
	var satelliteCount, sequence int
	if err = adminDB.QueryRow(`SELECT status FROM assets WHERE id=$1`, assetID).Scan(&assetStatus); err != nil || assetStatus != "active" {
		t.Fatalf("asset before decommission status=%q err=%v", assetStatus, err)
	}
	if err = adminDB.QueryRow(`SELECT count(*) FROM switches WHERE asset_id=$1`, assetID).Scan(&satelliteCount); err != nil || satelliteCount != 1 {
		t.Fatalf("switch satellite count=%d err=%v", satelliteCount, err)
	}
	if err = adminDB.QueryRow(`SELECT last_seq FROM nomenclature_counters WHERE nomenclature_id=$1 AND branch_id=$2 AND placement_id=$3`, ruleID, branchID, placementID).Scan(&sequence); err != nil || sequence != 1 {
		t.Fatalf("initial sequence=%d err=%v", sequence, err)
	}

	recorder := invokeDelete(assetID)
	if recorder.Code != http.StatusOK {
		t.Fatalf("decommission status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var auditCount int
	if err = adminDB.QueryRow(`SELECT status FROM assets WHERE id=$1`, assetID).Scan(&assetStatus); err != nil || assetStatus != "decommissioned" {
		t.Fatalf("asset after decommission status=%q err=%v", assetStatus, err)
	}
	if err = adminDB.QueryRow(`SELECT count(*) FROM switches WHERE asset_id=$1`, assetID).Scan(&satelliteCount); err != nil || satelliteCount != 1 {
		t.Fatalf("satellite was not preserved count=%d err=%v", satelliteCount, err)
	}
	if err = adminDB.QueryRow(`SELECT count(*) FROM asset_logs WHERE asset_id=$1 AND event_type='status_change' AND new_value='decommissioned'`, assetID).Scan(&auditCount); err != nil || auditCount != 1 {
		t.Fatalf("decommission audit count=%d err=%v", auditCount, err)
	}
	getSwitches := httptest.NewRequest(http.MethodGet, "/api/infra/switches", nil)
	getSwitches.AddCookie(&http.Cookie{Name: "session_token", Value: token})
	getSwitchesRecorder := httptest.NewRecorder()
	RequireTenantTx(runtimeDB, handleSwitches)(getSwitchesRecorder, getSwitches)
	if getSwitchesRecorder.Code != http.StatusOK || bytes.Contains(getSwitchesRecorder.Body.Bytes(), []byte(assetID)) {
		t.Fatalf("decommissioned switch remained operational: status=%d body=%s", getSwitchesRecorder.Code, getSwitchesRecorder.Body.String())
	}
	getHistory := httptest.NewRequest(http.MethodGet, "/api/dcim/assets?status=decommissioned", nil)
	getHistory.AddCookie(&http.Cookie{Name: "session_token", Value: token})
	getHistoryRecorder := httptest.NewRecorder()
	(&DCIMHandler{DB: runtimeDB}).HandleAssets(getHistoryRecorder, getHistory)
	if getHistoryRecorder.Code != http.StatusOK || !bytes.Contains(getHistoryRecorder.Body.Bytes(), []byte(assetID)) {
		t.Fatalf("decommissioned asset is not historically queryable: status=%d body=%s", getHistoryRecorder.Code, getHistoryRecorder.Body.String())
	}

	otherTenantID, otherBranchID, otherUserID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	otherToken := "lifecycle-other-" + uuid.NewString()
	otherSetup := []struct {
		query string
		args  []interface{}
	}{
		{`INSERT INTO tenants(id,name) VALUES($1,'Other tenant')`, []interface{}{otherTenantID}},
		{`INSERT INTO branches(id,tenant_id,name,status) VALUES($1,$2,'Other branch','active')`, []interface{}{otherBranchID, otherTenantID}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,'Other user','x','active')`, []interface{}{otherUserID, "other-" + otherUserID + "@example.invalid"}},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$2)`, []interface{}{otherUserID, otherTenantID}},
		{`INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)`, []interface{}{otherUserID, otherBranchID}},
		{`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES($1,$2,$3,$4,$5,4102444800)`, []interface{}{uuid.NewString(), otherUserID, otherTenantID, otherBranchID, otherToken}},
	}
	for _, statement := range otherSetup {
		if _, err = adminDB.Exec(statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
	defer adminDB.Exec(`DELETE FROM tenants WHERE id=$1`, otherTenantID)
	crossTenantRequest := httptest.NewRequest(http.MethodDelete, "/api/dcim/assets/"+assetID, nil)
	crossTenantRequest.AddCookie(&http.Cookie{Name: "session_token", Value: otherToken})
	crossTenantRecorder := httptest.NewRecorder()
	(&DCIMHandler{DB: runtimeDB}).HandleAssetByID(crossTenantRecorder, crossTenantRequest)
	if crossTenantRecorder.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant decommission status=%d body=%s", crossTenantRecorder.Code, crossTenantRecorder.Body.String())
	}

	triggerName := "fail_lifecycle_audit_" + uuid.NewString()[:8]
	if _, err = adminDB.Exec(fmt.Sprintf(`CREATE FUNCTION %s() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced audit failure'; END $$; CREATE TRIGGER %s BEFORE INSERT ON asset_logs FOR EACH ROW EXECUTE FUNCTION %s()`, triggerName, triggerName, triggerName)); err != nil {
		t.Fatal(err)
	}
	rollbackAssetID := invokeCreate("Lifecycle rollback")
	recorder = invokeDelete(rollbackAssetID)
	if _, dropErr := adminDB.Exec(fmt.Sprintf(`DROP TRIGGER %s ON asset_logs; DROP FUNCTION %s()`, triggerName, triggerName)); dropErr != nil {
		t.Fatal(dropErr)
	}
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("forced rollback status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err = adminDB.QueryRow(`SELECT status FROM assets WHERE id=$1`, rollbackAssetID).Scan(&assetStatus); err != nil || assetStatus != "active" {
		t.Fatalf("rollback did not restore active status=%q err=%v", assetStatus, err)
	}

	thirdAssetID := invokeCreate("Lifecycle switch 3")
	var thirdSequence int
	if err = adminDB.QueryRow(`SELECT nomenclature_sequence FROM assets WHERE id=$1`, thirdAssetID).Scan(&thirdSequence); err != nil || thirdSequence != 3 {
		t.Fatalf("sequence was reused: got=%d err=%v", thirdSequence, err)
	}
	if err = adminDB.QueryRow(`SELECT last_seq FROM nomenclature_counters WHERE nomenclature_id=$1 AND branch_id=$2 AND placement_id=$3`, ruleID, branchID, placementID).Scan(&sequence); err != nil || sequence != 3 {
		t.Fatalf("counter moved backwards: got=%d err=%v", sequence, err)
	}
}
