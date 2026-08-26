package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"sort"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

func TestPhysicalLocationHierarchyPostgreSQL16(t *testing.T) {
	adminDSN := os.Getenv("ASSET_NOMENCLATURE_TEST_DATABASE_URL")
	runtimeDSN := os.Getenv("ASSET_NOMENCLATURE_RUNTIME_TEST_DATABASE_URL")
	if adminDSN == "" || runtimeDSN == "" {
		t.Skip("physical location PostgreSQL URLs not set")
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

	tenant, otherTenant := uuid.NewString(), uuid.NewString()
	branch, otherBranch := uuid.NewString(), uuid.NewString()
	user, rule := uuid.NewString(), uuid.NewString()
	for _, statement := range []struct {
		query string
		args  []interface{}
	}{
		{`INSERT INTO tenants(id,name) VALUES($1,'Physical hierarchy'),($2,'Other physical tenant')`, []interface{}{tenant, otherTenant}},
		{`INSERT INTO branches(id,tenant_id,code,name,city,status) VALUES($1,$3,'TJ','Tijuana','Tijuana','active'),($2,$4,'OTR','Other','Other','active')`, []interface{}{branch, otherBranch, tenant, otherTenant}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,'Physical user','x','active')`, []interface{}{user, user + "@example.invalid"}},
		{`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_site,include_internal_area,include_placement,seq_digits,last_seq,active) VALUES($1,$2,'MDF','MDF','-',true,true,true,false,3,0,true)`, []interface{}{rule, tenant}},
	} {
		if _, err = adminDB.Exec(statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
	defer adminDB.Exec(`DELETE FROM users WHERE id=$1; DELETE FROM tenants WHERE id IN ($2,$3)`, user, tenant, otherTenant)

	site, otherSite := uuid.NewString(), uuid.NewString()
	prodArea, warehouseArea := uuid.NewString(), uuid.NewString()
	setupTx, err := BeginTenantTx(context.Background(), runtimeDB, tenant, branch)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = setupTx.Exec(`INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES($1,$2,$3,'PARQUE','Parque Industrial','active')`, site, tenant, branch); err != nil {
		t.Fatal(err)
	}
	if _, err = setupTx.Exec(`INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES($1,$2,$3,'CORP','Corporativo','active')`, otherSite, tenant, branch); err != nil {
		t.Fatal(err)
	}
	if _, err = setupTx.Exec(`INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,code,name,status) VALUES($1,$3,$4,$5,'PROD','Producción','active'),($2,$3,$4,$5,'ALM','Almacén','active')`, prodArea, warehouseArea, tenant, branch, site); err != nil {
		t.Fatal(err)
	}
	if err = setupTx.Commit(); err != nil {
		t.Fatal(err)
	}

	// Site/Area duplicate and mismatch constraints are DB-enforced.
	constraintTx, err := BeginTenantTx(context.Background(), runtimeDB, tenant, branch)
	if err != nil {
		t.Fatal(err)
	}
	_, err = constraintTx.Exec(`INSERT INTO buildings(tenant_id,branch_id,code,name) VALUES($1,$2,'PARQUE','Duplicate')`, tenant, branch)
	var pqErr *pq.Error
	if !errors.As(err, &pqErr) || pqErr.Code != "23505" {
		t.Fatalf("duplicate Site code err=%v", err)
	}
	_ = constraintTx.Rollback()

	if _, err = ResolvePhysicalLocation(context.Background(), runtimeDB, tenant, branch, site, ""); !errors.Is(err, ErrInvalidPhysicalLocation) {
		t.Fatalf("missing area accepted: %v", err)
	}
	if _, err = ResolvePhysicalLocation(context.Background(), runtimeDB, tenant, otherBranch, site, prodArea); !errors.Is(err, ErrInvalidPhysicalLocation) {
		t.Fatalf("cross branch accepted: %v", err)
	}
	if _, err = ResolvePhysicalLocation(context.Background(), runtimeDB, tenant, branch, otherSite, prodArea); !errors.Is(err, ErrInvalidPhysicalLocation) {
		t.Fatalf("site/area mismatch accepted: %v", err)
	}

	createMDF := func(areaID, name string, commit bool) (NomenclatureAssignment, error) {
		tx, beginErr := BeginTenantTx(context.Background(), runtimeDB, tenant, branch)
		if beginErr != nil {
			return NomenclatureAssignment{}, beginErr
		}
		physical, createErr := ResolvePhysicalLocation(context.Background(), tx, tenant, branch, site, areaID)
		locationID := uuid.NewString()
		if createErr == nil {
			_, createErr = tx.Exec(`INSERT INTO locations(id,tenant_id,branch_id,placement_type,name,status,internal_area_id) VALUES($1,$2,$3,'MDF',$4,'active',$5)`, locationID, tenant, branch, name, areaID)
		}
		var managed *managedAssetReservation
		if createErr == nil {
			managed, createErr = reserveManagedAsset(tx, tenant, branch, user, managedAssetInput{AssetTypeCode: "MDF", Name: name, PlacementID: locationID, PhysicalLocation: &physical})
		}
		if createErr == nil {
			_, createErr = tx.Exec(`INSERT INTO mdf_idf(id,asset_id,tenant_id,branch_id,type) VALUES($1,$2,$3,$4,'MDF')`, uuid.NewString(), managed.AssetID, tenant, branch)
		}
		if createErr == nil {
			_, createErr = tx.Exec(`UPDATE locations SET placement_code=$1,asset_id=$2 WHERE id=$3`, managed.Assignment.Code, managed.AssetID, locationID)
		}
		if createErr == nil {
			_, createErr = tx.Exec(`INSERT INTO asset_logs(tenant_id,asset_id,event_type,new_value,notes) VALUES($1,$2,'created',$3,'physical hierarchy test')`, tenant, managed.AssetID, managed.Assignment.Code)
		}
		if createErr != nil || !commit {
			_ = tx.Rollback()
		} else {
			createErr = tx.Commit()
		}
		if managed == nil {
			return NomenclatureAssignment{}, createErr
		}
		return managed.Assignment, createErr
	}

	first, err := createMDF(prodArea, "MDF Producción", true)
	if err != nil || first.Code != "MDF-TJ-PARQUE-PROD-001" || first.Sequence != 1 {
		t.Fatalf("first MDF=%#v err=%v", first, err)
	}
	second, err := createMDF(warehouseArea, "MDF Almacén físico", true)
	if err != nil || second.Code != "MDF-TJ-PARQUE-ALM-002" || second.Sequence != 2 {
		t.Fatalf("shared branch/rule counter=%#v err=%v", second, err)
	}
	if _, err = adminDB.Exec(`CREATE FUNCTION fail_physical_mdf_satellite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced MDF satellite failure'; END $$; CREATE TRIGGER fail_physical_mdf_satellite BEFORE INSERT ON mdf_idf FOR EACH ROW EXECUTE FUNCTION fail_physical_mdf_satellite()`); err != nil {
		t.Fatal(err)
	}
	if _, err = createMDF(prodArea, "MDF satellite failure", true); err == nil {
		t.Fatal("forced satellite failure was accepted")
	}
	if _, err = adminDB.Exec(`DROP TRIGGER fail_physical_mdf_satellite ON mdf_idf; DROP FUNCTION fail_physical_mdf_satellite()`); err != nil {
		t.Fatal(err)
	}
	if _, err = adminDB.Exec(`CREATE FUNCTION fail_physical_mdf_asset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced MDF asset failure'; END $$; CREATE TRIGGER fail_physical_mdf_asset BEFORE INSERT ON assets FOR EACH ROW EXECUTE FUNCTION fail_physical_mdf_asset()`); err != nil {
		t.Fatal(err)
	}
	if _, err = createMDF(prodArea, "MDF asset failure", true); err == nil {
		t.Fatal("forced asset failure was accepted")
	}
	if _, err = adminDB.Exec(`DROP TRIGGER fail_physical_mdf_asset ON assets; DROP FUNCTION fail_physical_mdf_asset()`); err != nil {
		t.Fatal(err)
	}
	var counter, failedAssets, failedLocations int
	if err = adminDB.QueryRow(`SELECT last_seq FROM nomenclature_branch_counters WHERE nomenclature_id=$1 AND branch_id=$2`, rule, branch).Scan(&counter); err != nil {
		t.Fatal(err)
	}
	if err = adminDB.QueryRow(`SELECT count(*) FROM assets WHERE tenant_id=$1 AND name IN ('MDF satellite failure','MDF asset failure')`, tenant).Scan(&failedAssets); err != nil {
		t.Fatal(err)
	}
	if err = adminDB.QueryRow(`SELECT count(*) FROM locations WHERE tenant_id=$1 AND name IN ('MDF satellite failure','MDF asset failure')`, tenant).Scan(&failedLocations); err != nil {
		t.Fatal(err)
	}
	if counter != 2 || failedAssets != 0 || failedLocations != 0 {
		t.Fatalf("forced failure rollback counter=%d assets=%d locations=%d", counter, failedAssets, failedLocations)
	}
	rolled, err := createMDF(prodArea, "MDF rollback", false)
	if err != nil {
		t.Fatal(err)
	}
	afterRollback, err := createMDF(prodArea, "MDF after rollback", true)
	if err != nil || rolled.Sequence != afterRollback.Sequence {
		t.Fatalf("rollback consumed sequence rolled=%d next=%d err=%v", rolled.Sequence, afterRollback.Sequence, err)
	}

	// Twelve concurrent creations remain unique on the one shared branch/rule counter.
	const workers = 12
	results := make(chan NomenclatureAssignment, workers)
	failures := make(chan error, workers)
	var group sync.WaitGroup
	for index := 0; index < workers; index++ {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			assignment, createErr := createMDF([]string{prodArea, warehouseArea}[index%2], fmt.Sprintf("Concurrent MDF %d", index), true)
			if createErr != nil {
				failures <- createErr
				return
			}
			results <- assignment
		}(index)
	}
	group.Wait()
	close(results)
	close(failures)
	for createErr := range failures {
		t.Fatal(createErr)
	}
	sequences := make([]int, 0, workers)
	codes := map[string]bool{}
	for assignment := range results {
		sequences = append(sequences, assignment.Sequence)
		if codes[assignment.Code] {
			t.Fatalf("duplicate code %s", assignment.Code)
		}
		codes[assignment.Code] = true
	}
	sort.Ints(sequences)
	if len(sequences) != workers || sequences[0] != 4 || sequences[len(sequences)-1] != 15 {
		t.Fatalf("concurrent sequences=%v", sequences)
	}

	// Inactive physical nodes are rejected.
	inactiveTx, err := BeginTenantTx(context.Background(), runtimeDB, tenant, branch)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = inactiveTx.Exec(`UPDATE internal_areas SET status='inactive' WHERE id=$1`, prodArea); err != nil {
		t.Fatal(err)
	}
	if err = inactiveTx.Commit(); err != nil {
		t.Fatal(err)
	}
	checkTx, err := BeginTenantTx(context.Background(), runtimeDB, tenant, branch)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = ResolvePhysicalLocation(context.Background(), checkTx, tenant, branch, site, prodArea); !errors.Is(err, ErrInvalidPhysicalLocation) {
		t.Fatalf("inactive area accepted: %v", err)
	}
	_ = checkTx.Rollback()

	// FORCE RLS hides the physical catalog without GUC and from another scope.
	var visible int
	if err = runtimeDB.QueryRow(`SELECT count(*) FROM buildings WHERE id=$1`, site).Scan(&visible); err != nil || visible != 0 {
		t.Fatalf("global runtime visibility=%d err=%v", visible, err)
	}
	otherTx, err := BeginTenantTx(context.Background(), runtimeDB, otherTenant, otherBranch)
	if err != nil {
		t.Fatal(err)
	}
	if err = otherTx.QueryRow(`SELECT count(*) FROM buildings WHERE id=$1`, site).Scan(&visible); err != nil || visible != 0 {
		t.Fatalf("cross-tenant Site visibility=%d err=%v", visible, err)
	}
	_ = otherTx.Rollback()

	for _, table := range []string{"buildings", "floors", "zones", "internal_areas", "nomenclature_branch_counters"} {
		var enabled, forced bool
		if err = adminDB.QueryRow(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass`, table).Scan(&enabled, &forced); err != nil || !enabled || !forced {
			t.Fatalf("%s RLS enabled=%v forced=%v err=%v", table, enabled, forced, err)
		}
	}
	for _, table := range []string{"buildings", "internal_areas", "nomenclature_branch_counters"} {
		var allowed, deleteAllowed, truncateAllowed bool
		if err = adminDB.QueryRow(`SELECT has_table_privilege('skia_runtime',$1,'SELECT,INSERT,UPDATE'),has_table_privilege('skia_runtime',$1,'DELETE'),has_table_privilege('skia_runtime',$1,'TRUNCATE')`, table).Scan(&allowed, &deleteAllowed, &truncateAllowed); err != nil || !allowed || deleteAllowed || truncateAllowed {
			t.Fatalf("%s grants allowed=%v delete=%v truncate=%v err=%v", table, allowed, deleteAllowed, truncateAllowed, err)
		}
	}
}
