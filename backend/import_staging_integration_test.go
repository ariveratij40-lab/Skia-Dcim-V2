//go:build integration

package main

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "github.com/lib/pq"
)

func TestCanonicalImportStagingPostgresZeroDomainDelta(t *testing.T) {
	runtimeURL := os.Getenv("CANONICAL_IMPORT_RUNTIME_TEST_DATABASE_URL")
	adminURL := os.Getenv("CANONICAL_IMPORT_ADMIN_TEST_DATABASE_URL")
	if runtimeURL == "" || adminURL == "" {
		t.Skip("canonical import PostgreSQL DSNs not configured")
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
	const branch = "92000000-0000-4000-8000-000000000001"
	const user = "93000000-0000-4000-8000-000000000001"
	const zone = "94000000-0000-4000-8000-000000000001"
	counts := func() [7]int {
		var got [7]int
		err := adminDB.QueryRow(`SELECT
			(SELECT count(*) FROM assets),(SELECT count(*) FROM locations),
			(SELECT count(*) FROM mdf_idf),(SELECT count(*) FROM asset_logs),
			(SELECT count(*) FROM nomenclature_counters),
			(SELECT count(*) FROM inventory_imports),(SELECT count(*) FROM inventory_import_rows)`).Scan(
			&got[0], &got[1], &got[2], &got[3], &got[4], &got[5], &got[6])
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	before := counts()
	rows := []map[string]interface{}{
		{"asset_type_code": "MDF", "zone_id": zone, "name": "MDF A", "internal_code": "IMP-MDF"},
		{"asset_type_code": "IDF", "zone_code": "PROD", "name": "IDF A"},
		{"asset_type_code": "SWITCH", "name": "Switch A"},
		{"asset_type_code": "MDF", "name": "Missing zone"},
		{"asset_type_code": "IDF", "internal_area_id": "95000000-0000-4000-8000-000000000001"},
		{"asset_type_code": "MDF", "zone_id": "94000000-0000-4000-8000-000000000002"},
		{"asset_type_code": "MDF", "zone_id": "94000000-0000-4000-8000-000000000003"},
		{"asset_type_code": "UNKNOWN"},
	}
	summary, err := createAndStageCanonicalImport(context.Background(), runtimeDB,
		CanonicalImportScope{TenantID: tenant, BranchID: branch, UserID: user},
		"canonical.csv", "", "inventory", "integration", rows)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Total != 8 || summary.Valid != 3 || summary.Invalid != 5 || summary.State != "READY" {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	after := counts()
	for i, label := range []string{"assets", "locations", "mdf_idf", "asset_logs", "nomenclature_counters"} {
		if after[i] != before[i] {
			t.Fatalf("%s delta = %d, want 0", label, after[i]-before[i])
		}
	}
	if after[5]-before[5] != 1 || after[6]-before[6] != 8 {
		t.Fatalf("staging deltas = header:%d rows:%d", after[5]-before[5], after[6]-before[6])
	}
	var sourceCode, canonicalType, zoneID string
	if err := adminDB.QueryRow(`SELECT data->>'source_internal_code',data->>'asset_type_code',data->>'zone_id'
		FROM inventory_import_rows WHERE import_id=$1 AND row_number=1`, summary.ImportID).Scan(&sourceCode, &canonicalType, &zoneID); err != nil {
		t.Fatal(err)
	}
	if sourceCode != "IMP-MDF" || canonicalType != "MDF" || zoneID != zone {
		t.Fatalf("unexpected persisted canonical intent: %q %q %q", sourceCode, canonicalType, zoneID)
	}
}
