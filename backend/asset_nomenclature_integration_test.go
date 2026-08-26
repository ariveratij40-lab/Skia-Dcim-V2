package main

import (
	"bytes"
	"context"
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

	tenantID, branchID, userID, ruleID, placementID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
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
		{`INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,placement_code,status) VALUES($1,$2,$3,'Warehouse Atomic','WAREHOUSE','ALM01','active')`, []interface{}{placementID, tenantID, branchID}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,'Atomic user','x','active')`, []interface{}{userID, "atomic-" + userID + "@example.invalid"}},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$2)`, []interface{}{userID, tenantID}},
		{`INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)`, []interface{}{userID, branchID}},
		{`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES($1,$2,$3,$4,$5,4102444800)`, []interface{}{uuid.NewString(), userID, tenantID, branchID, "token-" + userID}},
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,seq_digits,last_seq,active,include_placement) VALUES($1,$2,'SWITCH','SW','-',4,0,true,true)`, []interface{}{ruleID, tenantID}},
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
		req := httptest.NewRequest(http.MethodPost, "/api/infra/switches", bytes.NewBufferString(fmt.Sprintf(`{"name":"Atomic switch","placement_id":%q}`, placementID)))
		req.AddCookie(&http.Cookie{Name: "session_token", Value: "token-" + userID})
		rec := httptest.NewRecorder()
		RequireTenantTx(runtimeDB, handleSwitches)(rec, req)
		return rec
	}
	assertRolledBack := func(label string) {
		var sequence, assets int
		if err := adminDB.QueryRow(`SELECT COALESCE(MAX(last_seq),0) FROM nomenclature_counters WHERE nomenclature_id=$1`, ruleID).Scan(&sequence); err != nil {
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
	if _, err = database.Exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_location,seq_digits,reset_per_location,last_seq,active) VALUES($1,$2,'SWITCH','SW','-',true,false,4,false,0,true)`, ruleID, tenantID); err != nil {
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

func TestPlacementScopedCountersAndWarehouseStatus(t *testing.T) {
	dsn := os.Getenv("ASSET_NOMENCLATURE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("database URL not set")
	}
	database, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	tenant, branch, p1, p2, warehouse, rule := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	site, area1, area2 := uuid.NewString(), uuid.NewString(), uuid.NewString()
	_, err = database.Exec(`INSERT INTO tenants(id,name) VALUES($1,'Placement counters')`, tenant)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Exec(`DELETE FROM tenants WHERE id=$1`, tenant)
	if _, err = database.Exec(`INSERT INTO branches(id,tenant_id,name,city) VALUES($1,$2,'B','TIJ')`, branch, tenant); err != nil {
		t.Fatal(err)
	}
	if _, err = database.Exec(`INSERT INTO buildings(id,tenant_id,branch_id,code,name) VALUES($1,$2,$3,'SITE','Site')`, site, tenant, branch); err != nil {
		t.Fatal(err)
	}
	if _, err = database.Exec(`INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,code,name) VALUES($1,$3,$4,$5,'A1','Area 1'),($2,$3,$4,$5,'A2','Area 2')`, area1, area2, tenant, branch, site); err != nil {
		t.Fatal(err)
	}
	for _, p := range []struct{ id, typ, code string }{{p1, "IDF", "IDF01"}, {p2, "IDF", "IDF02"}, {warehouse, "WAREHOUSE", "ALM01"}} {
		areaID := interface{}(nil)
		if p.id == p1 {
			areaID = area1
		} else if p.id == p2 {
			areaID = area2
		}
		if _, err = database.Exec(`INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,placement_code,status,internal_area_id) VALUES($1,$2,$3,$4,$5,$4,'active',$6)`, p.id, tenant, branch, p.code, p.typ, areaID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = database.Exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,include_branch,include_placement,last_seq,active) VALUES($1,$2,'SWITCH','SW',false,true,0,true)`, rule, tenant); err != nil {
		t.Fatal(err)
	}
	makePlacement := func(id, code, typ string) *ResolvedPlacement {
		return &ResolvedPlacement{ID: id, Type: typ, BranchID: branch, CanonicalCode: code, Name: code, Active: true}
	}
	reserve := func(p *ResolvedPlacement, commit bool) (NomenclatureAssignment, error) {
		tx, e := BeginTenantTx(context.Background(), database, tenant, branch)
		if e != nil {
			return NomenclatureAssignment{}, e
		}
		a, e := (&DCIMHandler{}).generateInternalCodeWithContext(tx, NomenclatureContext{TenantID: tenant, BranchID: branch, AssetTypeCode: "SWITCH", Placement: p})
		if e != nil {
			_ = tx.Rollback()
			return a, e
		}
		if commit {
			e = tx.Commit()
		} else {
			e = tx.Rollback()
		}
		return a, e
	}
	a1, err := reserve(makePlacement(p1, "IDF01", "IDF"), true)
	if err != nil || a1.Sequence != 1 || a1.Code != "SW-IDF01-0001" {
		t.Fatalf("p1 first: %#v %v", a1, err)
	}
	a2, err := reserve(makePlacement(p2, "IDF02", "IDF"), true)
	if err != nil || a2.Sequence != 1 || a2.Code != "SW-IDF02-0001" {
		t.Fatalf("p2 first: %#v %v", a2, err)
	}
	results := make(chan string, 12)
	failures := make(chan error, 12)
	var workers sync.WaitGroup
	for i := 0; i < 12; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			a, e := reserve(makePlacement(p1, "IDF01", "IDF"), true)
			if e != nil {
				failures <- e
				return
			}
			results <- a.Code
		}()
	}
	workers.Wait()
	close(results)
	close(failures)
	for e := range failures {
		t.Fatal(e)
	}
	seen := map[string]bool{}
	for code := range results {
		if seen[code] {
			t.Fatalf("duplicate placement code %s", code)
		}
		seen[code] = true
	}
	if len(seen) != 12 {
		t.Fatalf("got %d concurrent codes", len(seen))
	}
	rolled, err := reserve(makePlacement(p1, "IDF01", "IDF"), false)
	if err != nil {
		t.Fatal(err)
	}
	next, err := reserve(makePlacement(p1, "IDF01", "IDF"), false)
	if err != nil || rolled.Sequence != next.Sequence {
		t.Fatalf("rollback consumed sequence: %d %d %v", rolled.Sequence, next.Sequence, err)
	}
	// DB trigger is the final authority for warehouse operational state.
	var switchType string
	if err = database.QueryRow(`SELECT id FROM asset_types WHERE code='SWITCH'`).Scan(&switchType); err != nil {
		t.Fatal(err)
	}
	wa, err := reserve(makePlacement(warehouse, "ALM01", "WAREHOUSE"), true)
	if err != nil {
		t.Fatal(err)
	}
	assetID := uuid.NewString()
	if _, err = database.Exec(`INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,location_id,internal_code,nomenclature_id,nomenclature_sequence,name,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Stored switch','active')`, assetID, tenant, branch, switchType, warehouse, wa.Code, rule, wa.Sequence); err != nil {
		t.Fatal(err)
	}
	var status string
	if err = database.QueryRow(`SELECT status FROM assets WHERE id=$1`, assetID).Scan(&status); err != nil || status != "inactive" {
		t.Fatalf("warehouse status=%s err=%v", status, err)
	}
}

func TestSelectedBranchSessionMatchesTenantTxGUCAndAsset(t *testing.T) {
	adminDSN := os.Getenv("ASSET_NOMENCLATURE_TEST_DATABASE_URL")
	runtimeDSN := os.Getenv("ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL")
	if adminDSN == "" || runtimeDSN == "" {
		t.Skip("database URLs not set")
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
	tenant, branchA, branchB := uuid.NewString(), uuid.NewString(), uuid.NewString()
	user, session, placement, rule := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	token := "placement-branch-" + uuid.NewString()
	setup := []struct {
		query string
		args  []interface{}
	}{
		{`INSERT INTO tenants(id,name) VALUES($1,'Selected branch authority')`, []interface{}{tenant}},
		{`INSERT INTO branches(id,tenant_id,name) VALUES($1,$3,'A'),($2,$3,'B')`, []interface{}{branchA, branchB, tenant}},
		{`INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Branch user','x')`, []interface{}{user, user + "@example.test"}},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$2)`, []interface{}{user, tenant}},
		{`INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2),($1,$3)`, []interface{}{user, branchA, branchB}},
		{`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES($1,$2,$3,$4,$5,extract(epoch from now())::bigint+3600)`, []interface{}{session, user, tenant, branchB, token}},
		{`INSERT INTO locations(id,tenant_id,branch_id,name,placement_type,placement_code,status) VALUES($1,$2,$3,'Warehouse B','WAREHOUSE','ALM-B','active')`, []interface{}{placement, tenant, branchB}},
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,include_branch,include_placement,last_seq,active) VALUES($1,$2,'SWITCH','SW',false,true,0,true)`, []interface{}{rule, tenant}},
	}
	for _, statement := range setup {
		if _, err = adminDB.Exec(statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
	defer func() {
		_, _ = adminDB.Exec(`DELETE FROM users WHERE id=$1`, user)
		_, _ = adminDB.Exec(`DELETE FROM tenants WHERE id=$1`, tenant)
	}()
	var created string
	handler := func(w http.ResponseWriter, r *http.Request) {
		tdb, ok := TenantDBFromContext(r.Context())
		if !ok {
			http.Error(w, "missing tx", 500)
			return
		}
		_, gotTenant, gotBranch, ok := TenantIdentityFromContext(r.Context())
		if !ok || gotTenant != tenant || gotBranch != branchB {
			http.Error(w, "identity mismatch", 500)
			return
		}
		var guc string
		if err := tdb.QueryRow(`SELECT current_setting('app.branch_id')`).Scan(&guc); err != nil || guc != branchB {
			http.Error(w, "guc mismatch", 500)
			return
		}
		managed, err := reserveManagedAsset(tdb, tenant, branchB, user, managedAssetInput{AssetTypeCode: "SWITCH", Name: "Branch B switch", PlacementID: placement})
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		created = managed.AssetID
		w.WriteHeader(http.StatusCreated)
	}
	req := httptest.NewRequest(http.MethodPost, "/branch-placement", nil)
	req.AddCookie(&http.Cookie{Name: "session_token", Value: token})
	rec := httptest.NewRecorder()
	RequireTenantTx(runtimeDB, handler)(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var assetBranch string
	if err := adminDB.QueryRow(`SELECT branch_id FROM assets WHERE id=$1`, created).Scan(&assetBranch); err != nil || assetBranch != branchB {
		t.Fatalf("asset branch=%s err=%v", assetBranch, err)
	}
	var counterBranch string
	if err := adminDB.QueryRow(`SELECT branch_id FROM nomenclature_counters WHERE nomenclature_id=$1 AND placement_id=$2`, rule, placement).Scan(&counterBranch); err != nil || counterBranch != branchB {
		t.Fatalf("counter branch=%s err=%v", counterBranch, err)
	}
}
