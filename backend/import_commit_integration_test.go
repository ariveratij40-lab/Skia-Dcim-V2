//go:build integration

package main

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"sync"
	"testing"
)

type canonicalCommitCounts struct {
	Assets, Locations, MdfIdf, Logs, Counter int
}

func TestCanonicalImportCommitPostgreSQL16(t *testing.T) {
	runtimeURL := os.Getenv("CANONICAL_IMPORT_RUNTIME_TEST_DATABASE_URL")
	adminURL := os.Getenv("CANONICAL_IMPORT_ADMIN_TEST_DATABASE_URL")
	if runtimeURL == "" || adminURL == "" {
		t.Skip("canonical import commit PostgreSQL DSNs not configured")
	}
	runtimeDB, err := sql.Open("postgres", runtimeURL)
	if err != nil {
		t.Fatal(err)
	}
	defer runtimeDB.Close()
	adminDB, err := sql.Open("postgres", adminURL)
	if err != nil {
		t.Fatal(err)
	}
	defer adminDB.Close()

	const tenant = "91000000-0000-4000-8000-000000000001"
	const otherTenant = "91000000-0000-4000-8000-000000000002"
	const branch = "92000000-0000-4000-8000-000000000001"
	const otherBranch = "92000000-0000-4000-8000-000000000002"
	const foreignBranch = "92000000-0000-4000-8000-000000000003"
	const user = "93000000-0000-4000-8000-000000000001"
	const zone = "94000000-0000-4000-8000-000000000001"
	const mismatchZone = "94000000-0000-4000-8000-000000000004"
	const crossBranchZone = "94000000-0000-4000-8000-000000000002"
	const crossTenantZone = "94000000-0000-4000-8000-000000000003"
	scope := CanonicalImportScope{TenantID: tenant, BranchID: branch, UserID: user}

	snapshot := func() canonicalCommitCounts {
		var got canonicalCommitCounts
		if err := adminDB.QueryRow(`SELECT
			(SELECT count(*) FROM assets WHERE tenant_id=$1),
			(SELECT count(*) FROM locations WHERE tenant_id=$1),
			(SELECT count(*) FROM mdf_idf WHERE tenant_id=$1),
			(SELECT count(*) FROM asset_logs WHERE tenant_id=$1),
			(SELECT COALESCE(sum(c.last_seq),0) FROM nomenclature_branch_counters c JOIN naming_rules n ON n.id=c.nomenclature_id WHERE n.tenant_id=$1 AND c.branch_id=$2)`, tenant, branch).
			Scan(&got.Assets, &got.Locations, &got.MdfIdf, &got.Logs, &got.Counter); err != nil {
			t.Fatal(err)
		}
		return got
	}
	assertDelta := func(label string, before, after canonicalCommitCounts, want canonicalCommitCounts) {
		got := canonicalCommitCounts{after.Assets - before.Assets, after.Locations - before.Locations, after.MdfIdf - before.MdfIdf, after.Logs - before.Logs, after.Counter - before.Counter}
		if got != want {
			t.Fatalf("%s delta=%+v want=%+v", label, got, want)
		}
	}
	stage := func(name string, rows []map[string]interface{}) canonicalImportSummary {
		summary, err := createAndStageCanonicalImport(context.Background(), runtimeDB, scope, name, "", "csv", "test", rows)
		if err != nil {
			t.Fatal(err)
		}
		return summary
	}
	commit := func(importID int64, commitScope CanonicalImportScope) (importCommitResult, bool) {
		result, found, err := executeCanonicalImportCommit(context.Background(), runtimeDB, importID, commitScope)
		if err != nil {
			t.Fatal(err)
		}
		return result, found
	}

	// MDF and IDF each use the shared canonical service and produce the exact
	// base/location/subtype/log/counter delta required by that service.
	for _, assetType := range []string{"MDF", "IDF"} {
		one := stage("single-"+assetType+".csv", []map[string]interface{}{{"asset_type_code": assetType, "physical_identity": assetType + "-SINGLE", "zone_id": zone, "name": "Single " + assetType}})
		before := snapshot()
		oneResult, found := commit(one.ImportID, scope)
		if !found || oneResult.Status != "COMPLETED" || oneResult.CommittedRows != 1 || oneResult.FailedRows != 0 {
			t.Fatalf("single %s result=%+v found=%v", assetType, oneResult, found)
		}
		assertDelta("single "+assetType, before, snapshot(), canonicalCommitCounts{1, 1, 1, 1, 1})
	}

	// Zone input matrix: id, code and matching dual assertions commit. Missing,
	// mismatched and cross-scope assertions remain INVALID and write nothing.
	matrix := stage("zone-matrix.csv", []map[string]interface{}{
		{"asset_type_code": "MDF", "physical_identity": "MDF-MATRIX-1", "zone_id": zone, "name": "Matrix ID"},
		{"asset_type_code": "IDF", "physical_identity": "IDF-MATRIX-1", "zone_code": "PROD", "name": "Matrix code"},
		{"asset_type_code": "MDF", "physical_identity": "MDF-MATRIX-2", "zone_id": zone, "zone_code": "PROD", "name": "Matrix both"},
		{"asset_type_code": "MDF", "physical_identity": "MDF-MATRIX-3", "zone_id": zone, "zone_code": "MISMATCH", "name": "Mismatch"},
		{"asset_type_code": "IDF", "physical_identity": "IDF-MATRIX-2", "name": "Missing"},
		{"asset_type_code": "MDF", "physical_identity": "MDF-MATRIX-4", "zone_id": crossBranchZone, "name": "Cross branch"},
		{"asset_type_code": "IDF", "physical_identity": "IDF-MATRIX-3", "zone_id": crossTenantZone, "name": "Cross tenant"},
	})
	_, listedFound, listErr := listCanonicalImportRows(context.Background(), runtimeDB, matrix.ImportID, scope)
	if listErr != nil || !listedFound {
		t.Fatalf("matrix enumeration found=%v err=%v", listedFound, listErr)
	}
	before := snapshot()
	result, found := commit(matrix.ImportID, scope)
	if !found || result.Status != "PARTIAL" || result.TotalRows != 7 || result.CommittedRows != 3 || result.FailedRows != 4 {
		t.Fatalf("matrix result=%+v found=%v", result, found)
	}
	assertDelta("zone matrix", before, snapshot(), canonicalCommitCounts{3, 3, 3, 3, 3})

	// A second call is stable and never writes or advances nomenclature.
	before = snapshot()
	second, found := commit(matrix.ImportID, scope)
	if !found || second.AlreadyCommitted != 3 || second.FailedRows != 4 || second.Status != "PARTIAL" {
		t.Fatalf("second commit=%+v found=%v", second, found)
	}
	assertDelta("second commit", before, snapshot(), canonicalCommitCounts{})

	// Source internal_code is never authority. Explicit physical identity is:
	// normalization-equivalent true duplicates yield one create and one failure.
	duplicates := stage("duplicate-source.csv", []map[string]interface{}{
		{"asset_type_code": "MDF", "physical_identity": "MDF DUP 01", "zone_id": zone, "name": "Same source", "internal_code": "IMP-DUP"},
		{"asset_type_code": "MDF", "physical_identity": " mdf--dup   01 ", "zone_id": zone, "name": "Same source", "internal_code": "IMP-DUP"},
	})
	before = snapshot()
	duplicateResult, _ := commit(duplicates.ImportID, scope)
	if duplicateResult.Status != "PARTIAL" || duplicateResult.CommittedRows != 1 || duplicateResult.FailedRows != 1 {
		t.Fatalf("duplicate-source result=%+v", duplicateResult)
	}
	assertDelta("duplicate source", before, snapshot(), canonicalCommitCounts{1, 1, 1, 1, 1})
	var distinctCodes int
	if err := adminDB.QueryRow(`SELECT count(DISTINCT a.internal_code) FROM inventory_import_rows r JOIN assets a ON a.id=r.canonical_asset_id WHERE r.import_id=$1`, duplicates.ImportID).Scan(&distinctCodes); err != nil || distinctCodes != 1 {
		t.Fatalf("authoritative duplicate allocation distinct=%d err=%v", distinctCodes, err)
	}

	// Header existence is indistinguishable across tenant and branch scopes.
	if _, found := commit(matrix.ImportID, CanonicalImportScope{TenantID: tenant, BranchID: otherBranch, UserID: user}); found {
		t.Fatal("cross-branch import existence leaked")
	}
	if _, found := commit(matrix.ImportID, CanonicalImportScope{TenantID: otherTenant, BranchID: foreignBranch, UserID: user}); found {
		t.Fatal("cross-tenant import existence leaked")
	}

	// Current database state is authoritative: an inactive Zone after staging
	// fails through the post-rollback function with zero canonical delta.
	stale := stage("stale-zone.csv", []map[string]interface{}{{"asset_type_code": "MDF", "physical_identity": "MDF-STALE-ZONE", "zone_id": zone, "name": "Stale Zone"}})
	if _, err := adminDB.Exec(`UPDATE zones SET status='inactive' WHERE id=$1`, zone); err != nil {
		t.Fatal(err)
	}
	before = snapshot()
	staleResult, _ := commit(stale.ImportID, scope)
	assertDelta("stale zone", before, snapshot(), canonicalCommitCounts{})
	if staleResult.Status != "FAILED" || staleResult.FailedRows != 1 {
		t.Fatalf("stale result=%+v", staleResult)
	}
	if _, err := adminDB.Exec(`UPDATE zones SET status='active' WHERE id=$1`, zone); err != nil {
		t.Fatal(err)
	}

	// AssetType policy is re-read immediately before creation. A type made
	// non-canonical after staging fails with a complete zero delta.
	staleType := stage("stale-type.csv", []map[string]interface{}{{"asset_type_code": "MDF", "physical_identity": "MDF-STALE-TYPE", "zone_id": zone, "name": "Stale type"}})
	if _, err := adminDB.Exec(`UPDATE asset_types SET placement_policy=NULL WHERE code='MDF'`); err != nil {
		t.Fatal(err)
	}
	before = snapshot()
	staleTypeResult, _ := commit(staleType.ImportID, scope)
	assertDelta("stale asset type", before, snapshot(), canonicalCommitCounts{})
	if staleTypeResult.Status != "FAILED" || staleTypeResult.FailedRows != 1 {
		t.Fatalf("stale type result=%+v", staleTypeResult)
	}
	var staleTypeAsset sql.NullString
	if err := adminDB.QueryRow(`SELECT canonical_asset_id::text FROM inventory_import_rows WHERE import_id=$1`, staleType.ImportID).Scan(&staleTypeAsset); err != nil || staleTypeAsset.Valid {
		t.Fatalf("stale type asset=%v err=%v", staleTypeAsset, err)
	}
	if _, err := adminDB.Exec(`UPDATE asset_types SET placement_policy='ZONE' WHERE code='MDF'`); err != nil {
		t.Fatal(err)
	}

	// An unsupported type is INVALID at staging and never reaches canonical
	// persistence. Aggregate state is the exact database-produced FAILED value.
	unknown := stage("unknown-type.csv", []map[string]interface{}{{"asset_type_code": "UNKNOWN", "zone_id": zone, "name": "Unknown"}})
	before = snapshot()
	unknownResult, _ := commit(unknown.ImportID, scope)
	if unknownResult.Status != "FAILED" || unknownResult.FailedRows != 1 || unknownResult.CommittedRows != 0 {
		t.Fatalf("unknown result=%+v", unknownResult)
	}
	assertDelta("unknown type", before, snapshot(), canonicalCommitCounts{})

	// A subtype failure occurs after nomenclature reservation and asset insert.
	// The caller-owned row transaction rolls all of it back; FAILED is recorded
	// only afterward in a separate scoped transaction.
	forced := stage("forced-failure.csv", []map[string]interface{}{{"asset_type_code": "MDF", "physical_identity": "MDF-FORCED", "zone_id": zone, "name": "Forced failure"}})
	if _, err := adminDB.Exec(`CREATE FUNCTION fail_b3b5_mdf_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced b3b5 failure'; END $$; CREATE TRIGGER fail_b3b5_mdf_insert BEFORE INSERT ON mdf_idf FOR EACH ROW EXECUTE FUNCTION fail_b3b5_mdf_insert()`); err != nil {
		t.Fatal(err)
	}
	before = snapshot()
	forcedResult, _ := commit(forced.ImportID, scope)
	if _, err := adminDB.Exec(`DROP TRIGGER fail_b3b5_mdf_insert ON mdf_idf; DROP FUNCTION fail_b3b5_mdf_insert()`); err != nil {
		t.Fatal(err)
	}
	assertDelta("forced rollback", before, snapshot(), canonicalCommitCounts{})
	if forcedResult.Status != "FAILED" || forcedResult.FailedRows != 1 {
		t.Fatalf("forced result=%+v", forcedResult)
	}
	var forcedState string
	var forcedAsset sql.NullString
	if err := adminDB.QueryRow(`SELECT status,canonical_asset_id::text FROM inventory_import_rows WHERE import_id=$1`, forced.ImportID).Scan(&forcedState, &forcedAsset); err != nil || forcedState != "FAILED" || forcedAsset.Valid {
		t.Fatalf("forced row state=%s asset=%v err=%v", forcedState, forcedAsset, err)
	}

	// Two coordinators may enumerate the same VALID row, but the secure claim
	// lock serializes them and only one transaction creates the canonical row.
	concurrent := stage("concurrent.csv", []map[string]interface{}{{"asset_type_code": "IDF", "physical_identity": "IDF-CONCURRENT-ROW", "zone_id": zone, "name": "Concurrent IDF"}})
	before = snapshot()
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, found, err := executeCanonicalImportCommit(context.Background(), runtimeDB, concurrent.ImportID, scope)
			if err == nil && !found {
				err = sql.ErrNoRows
			}
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	assertDelta("concurrent same row", before, snapshot(), canonicalCommitCounts{1, 1, 1, 1, 1})
	var state, hash string
	var assetID sql.NullString
	var committedAt sql.NullTime
	if err := adminDB.QueryRow(`SELECT status,normalized_row_hash,canonical_asset_id::text,committed_at FROM inventory_import_rows WHERE import_id=$1`, concurrent.ImportID).Scan(&state, &hash, &assetID, &committedAt); err != nil || state != "COMMITTED" || len(hash) != 64 || !assetID.Valid || !committedAt.Valid {
		t.Fatalf("concurrent durable state=%s hash=%q asset=%v committed=%v err=%v", state, hash, assetID, committedAt, err)
	}

	// Two different valid imports racing for one physical identity are protected
	// by the database index: one winner, one controlled FAILED row, one delta.
	racingA := stage("physical-race-a.csv", []map[string]interface{}{{"asset_type_code": "MDF", "physical_identity": "MDF RACE 01", "zone_id": zone, "name": "Race A"}})
	racingB := stage("physical-race-b.csv", []map[string]interface{}{{"asset_type_code": "MDF", "physical_identity": " mdf--race 01 ", "zone_id": zone, "name": "Race B"}})
	before = snapshot()
	results := make(chan importCommitResult, 2)
	raceErrs := make(chan error, 2)
	for _, id := range []int64{racingA.ImportID, racingB.ImportID} {
		wg.Add(1)
		go func(importID int64) {
			defer wg.Done()
			result, _, err := executeCanonicalImportCommit(context.Background(), runtimeDB, importID, scope)
			if err != nil {
				raceErrs <- err
				return
			}
			results <- result
		}(id)
	}
	wg.Wait()
	close(results)
	close(raceErrs)
	for err := range raceErrs {
		if err != nil {
			t.Fatal(err)
		}
	}
	winners, conflicts := 0, 0
	for result := range results {
		if result.CommittedRows == 1 {
			winners++
		}
		if result.FailedRows == 1 {
			conflicts++
		}
	}
	if winners != 1 || conflicts != 1 {
		t.Fatalf("physical race winners=%d conflicts=%d", winners, conflicts)
	}
	assertDelta("physical identity race", before, snapshot(), canonicalCommitCounts{1, 1, 1, 1, 1})

	// A stale COMMITTING row is not auto-recovered or rewritten by the
	// coordinator. A wrong completion hash is denied and the claim rolls back.
	stuck := stage("stale-committing.csv", []map[string]interface{}{{"asset_type_code": "MDF", "physical_identity": "MDF-STUCK", "zone_id": zone, "name": "Stuck"}})
	stuckRows, _, err := listCanonicalImportRows(context.Background(), runtimeDB, stuck.ImportID, scope)
	if err != nil || len(stuckRows) != 1 {
		t.Fatalf("stuck rows=%d err=%v", len(stuckRows), err)
	}
	tx, err := BeginJobTenantTx(context.Background(), runtimeDB, JobTenantContext{TenantID: tenant, BranchID: branch}, true)
	if err != nil {
		t.Fatal(err)
	}
	if claim, err := claimCanonicalImportRow(context.Background(), tx, stuck.ImportID, stuckRows[0], scope); err != nil || claim != "READY_FOR_COMMIT" {
		_ = tx.Rollback()
		t.Fatalf("stuck claim=%s err=%v", claim, err)
	}
	var hashResult string
	if err := tx.QueryRow(`SELECT result_code FROM public.complete_import_row_commit($1,$2,$3::uuid,$4::uuid,$5,$6::uuid)`, stuck.ImportID, stuckRows[0].ID, tenant, branch, strings.Repeat("0", 64), "ffffffff-ffff-4fff-8fff-ffffffffffff").Scan(&hashResult); err != nil || hashResult != "HASH_MISMATCH" {
		_ = tx.Rollback()
		t.Fatalf("hash mismatch result=%s err=%v", hashResult, err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	stuckResult, _ := commit(stuck.ImportID, scope)
	if stuckResult.Status != "READY" || stuckResult.FailedRows != 1 {
		t.Fatalf("stale COMMITTING result=%+v", stuckResult)
	}
	if err := adminDB.QueryRow(`SELECT status FROM inventory_import_rows WHERE import_id=$1`, stuck.ImportID).Scan(&state); err != nil || state != "COMMITTING" {
		t.Fatalf("stale COMMITTING state=%s err=%v", state, err)
	}

	// A non-READY header is rejected by the same non-disclosing enumeration
	// contract and cannot move a counter or create a canonical row.
	tx, err = BeginJobTenantTx(context.Background(), runtimeDB, JobTenantContext{TenantID: tenant, BranchID: branch}, true)
	if err != nil {
		t.Fatal(err)
	}
	pendingID, err := createCanonicalImportHeader(context.Background(), tx, "pending.csv", "MDF", "csv", "test", user)
	if err == nil {
		err = tx.Commit()
	} else {
		_ = tx.Rollback()
	}
	if err != nil {
		t.Fatal(err)
	}
	before = snapshot()
	if _, found := commit(pendingID, scope); found {
		t.Fatal("non-ready import was exposed as commit-ready")
	}
	assertDelta("readiness failure", before, snapshot(), canonicalCommitCounts{})

	// Ensure the fixture's deliberately different Zone exists; this guards the
	// matching/mismatch test from accidentally comparing a row with itself.
	var mismatchExists bool
	if err := adminDB.QueryRow(`SELECT EXISTS(SELECT 1 FROM zones WHERE id=$1 AND code='MISMATCH')`, mismatchZone).Scan(&mismatchExists); err != nil || !mismatchExists {
		t.Fatalf("mismatch fixture missing: %v", err)
	}
}
