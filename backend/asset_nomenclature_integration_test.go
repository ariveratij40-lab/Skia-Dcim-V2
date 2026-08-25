package main

import (
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

func TestSpecializedHandlerRollbackIsAtomic(t *testing.T) {
	adminDSN := os.Getenv("ASSET_NOMENCLATURE_TEST_DATABASE_URL")
	runtimeDSN := os.Getenv("ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL")
	if adminDSN == "" || runtimeDSN == "" {
		t.Skip("asset nomenclature admin/runtime test database URLs not set")
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

	tenantID, branchID, userID, ruleID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	setupTx, err := adminDB.Begin()
	if err != nil {
		t.Fatal(err)
	}
	setupStatements := []struct {
		query string
		args  []interface{}
	}{
		{`INSERT INTO tenants(id,name) VALUES($1,'Atomic handler test')`, []interface{}{tenantID}},
		{`INSERT INTO branches(id,tenant_id,name,city) VALUES($1,$2,'Atomic branch','TIJ')`, []interface{}{branchID, tenantID}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,'Atomic user','x','active')`, []interface{}{userID, "atomic-" + userID + "@example.invalid"}},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$2)`, []interface{}{userID, tenantID}},
		{`INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)`, []interface{}{userID, branchID}},
		{`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES($1,$2,$3,$4,$5,4102444800)`, []interface{}{uuid.NewString(), userID, tenantID, branchID, "token-" + userID}},
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,seq_digits,last_seq,active) VALUES($1,$2,'SWITCH','SW','-',4,0,true)`, []interface{}{ruleID, tenantID}},
	}
	for _, statement := range setupStatements {
		if _, err = setupTx.Exec(statement.query, statement.args...); err != nil {
			_ = setupTx.Rollback()
			t.Fatal(err)
		}
	}
	if err = setupTx.Commit(); err != nil {
		t.Fatal(err)
	}
	defer adminDB.Exec(`DELETE FROM tenants WHERE id=$1`, tenantID)

	invoke := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/infra/switches", bytes.NewBufferString(`{"name":"Atomic switch"}`))
		req.AddCookie(&http.Cookie{Name: "session_token", Value: "token-" + userID})
		rec := httptest.NewRecorder()
		RequireTenantTx(runtimeDB, handleSwitches)(rec, req)
		return rec
	}
	assertRolledBack := func(label string) {
		var sequence, assets int
		if err := adminDB.QueryRow(`SELECT last_seq FROM naming_rules WHERE id=$1`, ruleID).Scan(&sequence); err != nil {
			t.Fatal(err)
		}
		if err := adminDB.QueryRow(`SELECT count(*) FROM assets WHERE tenant_id=$1`, tenantID).Scan(&assets); err != nil {
			t.Fatal(err)
		}
		if sequence != 0 || assets != 0 {
			t.Fatalf("%s was not atomic: sequence=%d assets=%d", label, sequence, assets)
		}
	}

	if _, err = adminDB.Exec(`
		CREATE FUNCTION phase019_fail_switch_insert() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'forced satellite failure'; END $$;
		CREATE TRIGGER phase019_fail_switch BEFORE INSERT ON switches
		FOR EACH ROW EXECUTE FUNCTION phase019_fail_switch_insert()`); err != nil {
		t.Fatal(err)
	}
	rec := invoke()
	if _, err = adminDB.Exec(`DROP TRIGGER phase019_fail_switch ON switches; DROP FUNCTION phase019_fail_switch_insert()`); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("satellite failure status=%d body=%s", rec.Code, rec.Body.String())
	}
	assertRolledBack("satellite insert failure")

	if _, err = adminDB.Exec(`
		CREATE FUNCTION phase019_fail_asset_insert() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'forced asset failure'; END $$;
		CREATE TRIGGER phase019_fail_asset BEFORE INSERT ON assets
		FOR EACH ROW EXECUTE FUNCTION phase019_fail_asset_insert()`); err != nil {
		t.Fatal(err)
	}
	rec = invoke()
	if _, err = adminDB.Exec(`DROP TRIGGER phase019_fail_asset ON assets; DROP FUNCTION phase019_fail_asset_insert()`); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("asset failure status=%d body=%s", rec.Code, rec.Body.String())
	}
	assertRolledBack("asset insert failure")
}

func TestAssetNomenclatureConcurrentSequence(t *testing.T) {
	dsn := os.Getenv("ASSET_NOMENCLATURE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("ASSET_NOMENCLATURE_TEST_DATABASE_URL not set")
	}
	database, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	tenantID, branchA, branchB, ruleID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	if _, err = database.Exec(`INSERT INTO tenants(id,name) VALUES($1,'Nomenclature integration')`, tenantID); err != nil {
		t.Fatal(err)
	}
	defer database.Exec(`DELETE FROM tenants WHERE id=$1`, tenantID)
	if _, err = database.Exec(`INSERT INTO branches(id,tenant_id,name,city) VALUES($1,$3,'A','TIJ'),($2,$3,'B','MEX')`, branchA, branchB, tenantID); err != nil {
		t.Fatal(err)
	}
	if _, err = database.Exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_location,seq_digits,reset_per_location,last_seq,active) VALUES($1,$2,'SWITCH','SW','-',false,false,4,false,0,true)`, ruleID, tenantID); err != nil {
		t.Fatal(err)
	}

	const workers = 12
	codes := make(chan string, workers)
	errs := make(chan error, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			tx, err := database.Begin()
			if err != nil {
				errs <- err
				return
			}
			assignment, err := (&DCIMHandler{}).generateInternalCode(tx, tenantID, []string{branchA, branchB}[i%2], "SWITCH")
			if err == nil {
				_, err = tx.Exec(`INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name,nomenclature_id,nomenclature_sequence) SELECT $1,$2,$3,id,$4,$5,$6,$7 FROM asset_types WHERE code='SWITCH'`, uuid.NewString(), tenantID, []string{branchA, branchB}[i%2], assignment.Code, fmt.Sprintf("Switch %d", i), assignment.ID, assignment.Sequence)
			}
			if err == nil {
				err = tx.Commit()
			} else {
				_ = tx.Rollback()
			}
			if err != nil {
				errs <- err
				return
			}
			codes <- assignment.Code
		}(i)
	}
	wg.Wait()
	close(errs)
	close(codes)
	for err := range errs {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for code := range codes {
		if seen[code] {
			t.Fatalf("duplicate code generated: %s", code)
		}
		seen[code] = true
	}
	if len(seen) != workers {
		t.Fatalf("generated %d unique codes, want %d", len(seen), workers)
	}

	rollbackTx, err := database.Begin()
	if err != nil {
		t.Fatal(err)
	}
	rolledBack, err := (&DCIMHandler{}).generateInternalCode(rollbackTx, tenantID, branchA, "SWITCH")
	if err != nil {
		t.Fatal(err)
	}
	_ = rollbackTx.Rollback()
	commitTx, err := database.Begin()
	if err != nil {
		t.Fatal(err)
	}
	next, err := (&DCIMHandler{}).generateInternalCode(commitTx, tenantID, branchA, "SWITCH")
	if err != nil {
		t.Fatal(err)
	}
	_ = commitTx.Rollback()
	if next.Sequence != rolledBack.Sequence {
		t.Fatalf("rollback consumed sequence: rolled back=%d next=%d", rolledBack.Sequence, next.Sequence)
	}

	otherTenant, otherBranch, otherRule := uuid.NewString(), uuid.NewString(), uuid.NewString()
	if _, err = database.Exec(`INSERT INTO tenants(id,name) VALUES($1,'Other tenant')`, otherTenant); err != nil {
		t.Fatal(err)
	}
	defer database.Exec(`DELETE FROM tenants WHERE id=$1`, otherTenant)
	if _, err = database.Exec(`INSERT INTO branches(id,tenant_id,name) VALUES($1,$2,'Other')`, otherBranch, otherTenant); err != nil {
		t.Fatal(err)
	}
	if _, err = database.Exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,active) VALUES($1,$2,'RACK','RK',true)`, otherRule, otherTenant); err != nil {
		t.Fatal(err)
	}
	isolationTx, err := database.Begin()
	if err != nil {
		t.Fatal(err)
	}
	_, err = (&DCIMHandler{}).generateInternalCode(isolationTx, tenantID, branchA, "RACK")
	_ = isolationTx.Rollback()
	if !errors.Is(err, ErrNomenclatureRequired) {
		t.Fatalf("cross-tenant rule leaked: %v", err)
	}

	if _, err = database.Exec(`UPDATE naming_rules SET active=false WHERE id=$1`, ruleID); err != nil {
		t.Fatal(err)
	}
	inactiveTx, err := database.Begin()
	if err != nil {
		t.Fatal(err)
	}
	_, err = (&DCIMHandler{}).generateInternalCode(inactiveTx, tenantID, branchA, "SWITCH")
	_ = inactiveTx.Rollback()
	if !errors.Is(err, ErrNomenclatureRequired) {
		t.Fatalf("inactive rule accepted: %v", err)
	}
}
