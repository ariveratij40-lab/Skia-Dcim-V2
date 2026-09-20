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

// Ordered operational gate. Stop at the first product failure: later presets
// and stress must not be reported as passing after a failed basic issuance.
func TestB2dOrderedPresetOperationalMatrix(t *testing.T) {
	b2dPresetOperationalMatrix(t, false, nil)
}

// B3a reuses the certified operational topology but forbids fixture publication.
func b2dPresetOperationalMatrix(t *testing.T, requireSeed bool, after func(*acceptanceFixture), afterType ...func(*acceptanceFixture, string)) {
	adminURL, runtimeURL := os.Getenv("NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL"), os.Getenv("NOMENCLATURE_ACCEPTANCE_RUNTIME_DATABASE_URL")
	if adminURL == "" || runtimeURL == "" {
		t.Skip("disposable PostgreSQL required")
	}
	admin, err := sql.Open("postgres", adminURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { admin.Close() })
	runtime, err := sql.Open("postgres", runtimeURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { runtime.Close() })
	f := newAcceptanceFixture(t, admin, runtime, uuid.NewString(), uuid.NewString())
	f.branch = uuid.NewString()
	f.exec(`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$2,'TIJ','Integrated matrix','active')`, f.branch, f.tenant)
	zone := uuid.NewString()
	f.exec(`INSERT INTO zones(id,tenant_id,branch_id,code,name,status) VALUES($1,$2,$3,'Z01','Integrated Zone','active')`, zone, f.tenant, f.branch)
	ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
	var location, distribution, rack string
	for _, p := range []struct {
		code, prefix, mode, scope string
		digits                    int
	}{
		{"MDF", "MDF", "CANONICAL_ZONE", "BRANCH", 3}, {"IDF", "IDF", "CANONICAL_ZONE", "BRANCH", 3},
		{"RACK", "RK", "CANONICAL_DISTRIBUTION", "DISTRIBUTION", 3}, {"SWITCH", "SW", "CANONICAL_HOUSING", "BRANCH", 4},
		{"UPS", "UPS", "CANONICAL_ZONE", "BRANCH", 4}, {"PDU", "PDU", "CANONICAL_HOUSING", "BRANCH", 4},
		{"PATCH_PANEL", "PP", "CANONICAL_HOUSING", "BRANCH", 4}, {"NODE", "ND", "CANONICAL_ZONE", "BRANCH", 4},
		{"FIREWALL", "FW", "CANONICAL_HOUSING", "BRANCH", 4}, {"SERVER", "SRV", "CANONICAL_HOUSING", "BRANCH", 4},
		{"CCTV", "CAM", "CANONICAL_ZONE", "BRANCH", 4}, {"AC_UNIT", "AC", "CANONICAL_ZONE", "BRANCH", 4},
	} {
		var preset string
		err = admin.QueryRow(`SELECT id FROM system_naming_presets WHERE asset_type_code=$1 AND preset_version=1`, p.code).Scan(&preset)
		if err == sql.ErrNoRows {
			if requireSeed {
				t.Fatalf("B3a requires migration-seeded preset %s", p.code)
			}
			preset = uuid.NewString()
			f.exec(`INSERT INTO system_naming_presets(id,preset_code,asset_type_code,preset_version,prefix,separator,include_branch,include_zone,include_distribution,include_housing,context_mode,sequence_scope,seq_digits,active) VALUES($1,$2,$3,1,$4,'-',true,$5,$6,$7,$8,$9,$10,true)`, preset, p.code+"_V1", p.code, p.prefix, p.mode == "CANONICAL_ZONE", p.mode == "CANONICAL_DISTRIBUTION", p.mode == "CANONICAL_HOUSING", p.mode, p.scope, p.digits)
		} else if err != nil {
			t.Fatal(err)
		}
		tx, e := BeginAuthenticatedTenantTx(ctx, runtime, f.tenant, f.branch, f.actor)
		if e != nil {
			t.Fatal(e)
		}
		exact, e := ReadExactSystemNamingPresetV2(ctx, tx, p.code, 1)
		if e != nil || exact.ID != preset {
			tx.Rollback()
			t.Fatalf("%s exact: %v", p.code, e)
		}
		operation := uuid.NewString()
		accepted, e := AcceptNomenclaturePreset(ctx, tx, f.tenant, f.actor, AcceptPresetInput{AssetTypeCode: p.code, PresetVersion: 1, OperationID: operation})
		if e != nil || accepted.Status != NomenclatureSuccessCreated {
			tx.Rollback()
			t.Fatalf("%s accept: %+v %v", p.code, accepted, e)
		}
		if e = tx.Commit(); e != nil {
			t.Fatal(e)
		}
		if f.count(`SELECT count(*) FROM naming_rules WHERE id=$1 AND source_type='PRESET'`, accepted.RuleID) != 1 {
			t.Fatal("provenance missing")
		}
		if requireSeed {
			assertB3aAcceptedMapping(t, f, accepted.RuleID, preset)
		}
		if f.count(`SELECT count(*) FROM audit_logs a JOIN naming_rules r ON r.id::text=a.entity_id WHERE r.id=$1 AND a.tenant_id=$2 AND a.user_id=$3 AND a.action='NOMENCLATURE_PRESET_ACCEPTED' AND a.changes->>'operation_id'=$4 AND a.changes->>'rule_id'=r.id::text AND a.changes->>'rule_version'=r.rule_version::text AND a.changes->>'source_type'=r.source_type AND a.changes->>'preset_id'=r.source_preset_id::text AND a.changes->>'preset_version'=r.source_preset_version::text`, accepted.RuleID, f.tenant, f.actor, operation) != 1 {
			t.Fatal("acceptance audit/provenance binding mismatch")
		}
		t.Logf("%s CONTEXT=%s SCOPE=%s PROVENANCE=PASS AUDIT=PASS", p.code, p.mode, p.scope)
		var typeID string
		if e = admin.QueryRow(`SELECT id FROM asset_types WHERE code=$1`, p.code).Scan(&typeID); e != nil {
			t.Fatal(e)
		}
		for n := 1; n <= 3; n++ {
			before := f.state()
			counterQuery := `SELECT jsonb_build_object('branch',(SELECT jsonb_agg(to_jsonb(c) ORDER BY nomenclature_id,branch_id) FROM nomenclature_branch_counters c WHERE tenant_id=$1),'placement',(SELECT jsonb_agg(to_jsonb(c) ORDER BY nomenclature_id,branch_id,placement_id) FROM nomenclature_counters c WHERE tenant_id=$1))::text`
			counters := f.json(counterQuery, f.tenant)
			tx, e = BeginAuthenticatedTenantTx(ctx, runtime, f.tenant, f.branch, f.actor)
			if e != nil {
				t.Fatal(e)
			}
			in := CanonicalNomenclatureInput{TenantID: f.tenant, BranchID: f.branch, AssetTypeCode: p.code, ZoneID: zone}
			if p.mode == "CANONICAL_DISTRIBUTION" {
				in.DistributionID = distribution
			}
			if p.mode == "CANONICAL_HOUSING" {
				in.HousingRackID = rack
			}
			preview, e := PreviewCanonicalNomenclature(ctx, tx, in)
			if e != nil {
				tx.Rollback()
				t.Fatalf("%s preview: %v", p.code, e)
			}
			if preview.SequenceReserved || counters != f.json(counterQuery, f.tenant) {
				tx.Rollback()
				t.Fatal("preview mutated counter")
			}
			if requireSeed && n == 1 {
				expected := map[string]string{
					"MDF": "MDF-TIJ-Z01-001", "IDF": "IDF-TIJ-Z01-001",
					"RACK": "RK-TIJ-MDF-TIJ-Z01-001-001", "SWITCH": "SW-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001",
					"UPS": "UPS-TIJ-Z01-0001", "PDU": "PDU-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001",
					"PATCH_PANEL": "PP-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001", "NODE": "ND-TIJ-Z01-0001",
					"FIREWALL": "FW-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001", "SERVER": "SRV-TIJ-RK-TIJ-MDF-TIJ-Z01-001-001-0001",
					"CCTV": "CAM-TIJ-Z01-0001", "AC_UNIT": "AC-TIJ-Z01-0001",
				}[p.code]
				if preview.IllustrativeCode != expected {
					tx.Rollback()
					t.Fatalf("seeded %s preview=%s expected=%s", p.code, preview.IllustrativeCode, expected)
				}
			}
			body := map[string]interface{}{"asset_type_id": typeID, "name": fmt.Sprintf("%s matrix %d", p.code, n), "inventory_status": "installed"}
			switch p.code {
			case "MDF", "IDF":
				body["zone_id"] = zone
				body["physical_identity"] = fmt.Sprintf("%s%02d", p.code, n)
			case "RACK":
				body["mdf_idf_id"] = distribution
			case "UPS":
				body["location_id"] = location
				body["mount_mode"] = "ROOM_MOUNTED"
			default:
				body["location_id"] = location
				body["zone_id"] = zone
				if p.mode == "CANONICAL_HOUSING" {
					body["housing_rack_id"] = rack
					body["mount_mode"] = "RACK_MOUNTED"
				}
			}
			payload, _ := json.Marshal(body)
			req := httptest.NewRequest(http.MethodPost, "/api/dcim/assets", bytes.NewReader(payload)).WithContext(withTenantDB(ctx, tx))
			response := httptest.NewRecorder()
			(&DCIMHandler{}).createAsset(response, req)
			var result struct {
				ID   string `json:"id"`
				Code string `json:"internal_code"`
			}
			if response.Code != 201 || json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Code != preview.IllustrativeCode {
				tx.Rollback()
				t.Fatalf("B2D_PRODUCT_DEFECT preset=%s context=%s scope=%s preview=%s HTTP=%d body=%s state_unchanged=%t counters_unchanged=%t", p.code, p.mode, p.scope, preview.IllustrativeCode, response.Code, response.Body.String(), before == f.state(), counters == f.json(counterQuery, f.tenant))
			}
			if n == 3 {
				tx.Rollback()
				if before != f.state() || counters != f.json(counterQuery, f.tenant) {
					t.Fatal("rollback delta")
				}
				t.Logf("%s ROLLBACK=PASS", p.code)
				continue
			}
			if e = tx.Commit(); e != nil {
				t.Fatalf("%s commit: %v", p.code, e)
			}
			t.Logf("%s ISSUANCE_%d=%s PREVIEW_EQUAL=YES", p.code, n, result.Code)
			if p.mode == "CANONICAL_HOUSING" {
				if f.count(`SELECT count(*) FROM assets WHERE id=$1 AND housing_rack_id=$2 AND location_id=$3 AND mount_mode='RACK_MOUNTED'`, result.ID, rack, location) != 1 {
					t.Fatal("generator/persisted housing mismatch")
				}
			} else if p.code != "RACK" {
				if f.count(`SELECT count(*) FROM assets WHERE id=$1 AND housing_rack_id IS NULL`, result.ID) != 1 {
					t.Fatal("non-Housing policy acquired Housing")
				}
			}
			if n == 1 && p.code == "MDF" {
				if e = admin.QueryRow(`SELECT a.location_id,m.id FROM assets a JOIN mdf_idf m ON m.asset_id=a.id WHERE a.id=$1`, result.ID).Scan(&location, &distribution); e != nil {
					t.Fatal(e)
				}
			}
			if n == 1 && p.code == "RACK" {
				if e = admin.QueryRow(`SELECT id FROM racks WHERE asset_id=$1`, result.ID).Scan(&rack); e != nil {
					t.Fatal(e)
				}
			}
			if n == 1 && p.code == "FIREWALL" {
				assertHF2HousingRejections(t, f, rack, location, typeID)
			}
			if n == 1 && (p.code == "FIREWALL" || p.code == "SERVER") {
				before := f.state()
				counterBefore := f.count(`SELECT last_seq FROM nomenclature_branch_counters WHERE nomenclature_id=$1 AND branch_id=$2`, accepted.RuleID, f.branch)
				domainTx, e := BeginAuthenticatedTenantTx(ctx, runtime, f.tenant, f.branch, f.actor)
				if e != nil {
					t.Fatal(e)
				}
				managed, e := reserveManagedAsset(domainTx, f.tenant, f.branch, f.actor, managedAssetInput{AssetTypeCode: p.code, Name: "HF2 direct domain", HousingRackID: rack})
				if e != nil {
					domainTx.Rollback()
					t.Fatal(e)
				}
				var persisted string
				if e = domainTx.QueryRow(`SELECT housing_rack_id::text FROM assets WHERE id=$1`, managed.AssetID).Scan(&persisted); e != nil || persisted != rack {
					domainTx.Rollback()
					t.Fatalf("managed housing=%s err=%v", persisted, e)
				}
				domainTx.Rollback()
				if before != f.state() || counterBefore != f.count(`SELECT last_seq FROM nomenclature_branch_counters WHERE nomenclature_id=$1 AND branch_id=$2`, accepted.RuleID, f.branch) {
					t.Fatal("managed rollback delta")
				}
				t.Logf("%s DIRECT_MANAGED_HOUSING=PASS ROLLBACK=PASS", p.code)
			}
		}
		for _, hook := range afterType {
			hook(f, p.code)
		}
	}
	if after != nil {
		after(f)
	}
}

func assertHF2HousingRejections(t *testing.T, f *acceptanceFixture, rack, location, typeID string) {
	t.Helper()
	foreign := newAcceptanceFixture(t, f.admin, f.runtime, uuid.NewString(), uuid.NewString())
	setup, e := f.admin.Begin()
	if e != nil {
		t.Fatal(e)
	}
	parent := setupCanonicalParentFixture(t, setup, foreign.tenant, foreign.branch, foreign.actor)
	if e = setup.Commit(); e != nil {
		t.Fatal(e)
	}
	otherBranch := uuid.NewString()
	f.exec(`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$2,'OTHER','Other','active')`, otherBranch, f.tenant)
	for _, test := range []struct{ name, branch, rack, distribution string }{
		{"cross_tenant", f.branch, parent.RackID, ""}, {"cross_branch", otherBranch, rack, ""}, {"nonexistent", f.branch, uuid.NewString(), ""}, {"distribution_mismatch", f.branch, rack, parent.DistributionID},
	} {
		before := f.state()
		q := `SELECT jsonb_build_object('branch',(SELECT jsonb_agg(to_jsonb(c) ORDER BY nomenclature_id,branch_id) FROM nomenclature_branch_counters c WHERE tenant_id=$1),'placement',(SELECT jsonb_agg(to_jsonb(c) ORDER BY nomenclature_id,branch_id,placement_id) FROM nomenclature_counters c WHERE tenant_id=$1))::text`
		counters := f.json(q, f.tenant)
		ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, test.branch)
		tx, e := BeginAuthenticatedTenantTx(ctx, f.runtime, f.tenant, test.branch, f.actor)
		if e != nil {
			t.Fatal(e)
		}
		body, _ := json.Marshal(map[string]string{"asset_type_id": typeID, "name": "negative", "housing_rack_id": test.rack, "mdf_idf_id": test.distribution, "location_id": location, "inventory_status": "installed"})
		req := httptest.NewRequest(http.MethodPost, "/api/dcim/assets", bytes.NewReader(body)).WithContext(withTenantDB(ctx, tx))
		r := httptest.NewRecorder()
		(&DCIMHandler{}).createAsset(r, req)
		tx.Rollback()
		if r.Code < 400 || r.Code >= 500 {
			t.Fatalf("%s HTTP=%d %s", test.name, r.Code, r.Body.String())
		}
		if before != f.state() || counters != f.json(q, f.tenant) {
			t.Fatal("rejection mutated state")
		}
		t.Logf("HF2_%s=REJECTED HTTP=%d COUNTER_DELTA=0", test.name, r.Code)
	}
}
