package main

import (
	"context"
	"database/sql"
	"errors"
	"github.com/google/uuid"
	"strings"
	"testing"
)

// Fail at an actual domain SQL boundary, preserving the caller-owned rollback.
type b2dFailDB struct {
	TenantDB
	needle string
	hit    bool
}

func (d *b2dFailDB) ExecContext(c context.Context, q string, a ...interface{}) (sql.Result, error) {
	if strings.Contains(q, d.needle) {
		d.hit = true
		return nil, errors.New("B2d injected boundary failure")
	}
	return d.TenantDB.ExecContext(c, q, a...)
}
func (d *b2dFailDB) Exec(q string, a ...interface{}) (sql.Result, error) {
	return d.ExecContext(context.Background(), q, a...)
}
func (d *b2dFailDB) QueryRowContext(c context.Context, q string, a ...interface{}) *sql.Row {
	if strings.Contains(q, d.needle) {
		d.hit = true
		return d.TenantDB.QueryRowContext(c, `SELECT 1/0`)
	}
	return d.TenantDB.QueryRowContext(c, q, a...)
}
func (d *b2dFailDB) QueryRow(q string, a ...interface{}) *sql.Row {
	return d.QueryRowContext(context.Background(), q, a...)
}

func TestB2dFailureAndReconciliation(t *testing.T) {
	a, r := b2dStressDB(t)
	p1, p2 := uuid.NewString(), uuid.NewString()
	if _, e := a.Exec(`UPDATE system_naming_presets SET active=false WHERE asset_type_code='SERVER'`); e != nil {
		t.Fatal(e)
	}
	if _, e := a.Exec(`INSERT INTO system_naming_presets(id,preset_code,asset_type_code,preset_version,prefix,separator,include_branch,context_mode,sequence_scope,seq_digits,active) VALUES($1,'FAIL_101','SERVER',101,'SRV','-',true,'LEGACY_INTERNAL_AREA','BRANCH',3,true),($2,'FAIL_102','SERVER',102,'SRV2','-',true,'LEGACY_INTERNAL_AREA','BRANCH',3,false)`, p1, p2); e != nil {
		t.Fatal(e)
	}
	for _, entry := range []struct {
		name, needle     string
		successor, issue bool
	}{
		{"preset_read", "read_system_naming_preset_v2", false, false}, {"authorization", "SELECT u.id,u.email", false, false},
		{"lock", "pg_advisory_xact_lock", false, false}, {"rule_insert", "INSERT INTO naming_rules", false, false},
		{"predecessor_deactivation", "UPDATE naming_rules SET active=false", true, false}, {"provenance_atomic_insert", "INSERT INTO naming_rules", true, false},
		{"audit", "write_nomenclature_onboarding_audit", true, false}, {"sequence_reservation", "INSERT INTO nomenclature_branch_counters", false, true},
		{"asset_insert", "INSERT INTO assets", false, true}, {"precommit", "NEVER_MATCH", false, false},
	} {
		t.Run(entry.name, func(t *testing.T) {
			f := newAcceptanceFixture(t, a, r, p1, p2)
			if entry.successor || entry.issue {
				f.accept(101)
			}
			if entry.successor {
				f.newer()
			}
			before := f.state()
			counters := f.json(`SELECT COALESCE(jsonb_agg(to_jsonb(c)),'[]')::text FROM nomenclature_branch_counters c WHERE tenant_id=$1`, f.tenant)
			ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
			tx, e := BeginAuthenticatedTenantTx(ctx, r, f.tenant, f.branch, f.actor)
			if e != nil {
				t.Fatal(e)
			}
			d := &b2dFailDB{TenantDB: tx, needle: entry.needle}
			if entry.issue {
				_, e = reserveManagedAsset(d, f.tenant, f.branch, f.actor, managedAssetInput{AssetTypeCode: "SERVER", Name: "failure"})
			} else {
				v := 101
				if entry.successor {
					v = 102
				}
				_, e = AcceptNomenclaturePreset(ctx, d, f.tenant, f.actor, AcceptPresetInput{AssetTypeCode: "SERVER", PresetVersion: v, OperationID: uuid.NewString()})
			}
			tx.Rollback()
			if entry.name != "precommit" && (e == nil || !d.hit) {
				t.Fatalf("boundary not hit %v", e)
			}
			if entry.name == "precommit" && e != nil {
				t.Fatal(e)
			}
			if before != f.state() || counters != f.json(`SELECT COALESCE(jsonb_agg(to_jsonb(c)),'[]')::text FROM nomenclature_branch_counters c WHERE tenant_id=$1`, f.tenant) {
				t.Fatal("partial state")
			}
			f.lineage()
			t.Log("RULE_SUCCESSOR_PROVENANCE_AUDIT_COUNTER_IDENTITY_DELTA=0")
		})
	}
	t.Run("deferred_distribution", func(t *testing.T) {
		f := newAcceptanceFixture(t, a, r, p1, p2)
		setup, e := a.Begin()
		if e != nil {
			t.Fatal(e)
		}
		parent := setupCanonicalParentFixture(t, setup, f.tenant, f.branch, f.actor)
		if e = setup.Commit(); e != nil {
			t.Fatal(e)
		}
		before := f.state()
		counter := f.count(`SELECT last_seq FROM nomenclature_counters WHERE tenant_id=$1`, f.tenant)
		ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
		tx, e := BeginAuthenticatedTenantTx(ctx, r, f.tenant, f.branch, f.actor)
		if e != nil {
			t.Fatal(e)
		}
		_, e = reserveManagedAsset(tx, f.tenant, f.branch, f.actor, managedAssetInput{AssetTypeCode: "RACK", Name: "missing satellite", PlacementID: parent.LocationID, DistributionID: parent.DistributionID})
		if e != nil {
			tx.Rollback()
			t.Fatal(e)
		}
		if e = tx.Commit(); e == nil {
			t.Fatal("deferred distribution/satellite accepted")
		}
		if before != f.state() || counter != f.count(`SELECT last_seq FROM nomenclature_counters WHERE tenant_id=$1`, f.tenant) {
			t.Fatal("commit failure left partial state")
		}
	})
	t.Run("unknown_client_outcome_durable_reconciliation", func(t *testing.T) {
		f := newAcceptanceFixture(t, a, r, p1, p2)
		f.accept(101)
		op := uuid.NewString()
		first, e := f.invoke(f.actor, true, 0, op)
		if e != nil {
			t.Fatal(e)
		}
		before := f.state()
		policy := CanonicalNomenclaturePolicy{AssetTypeCode: "SERVER", Prefix: "CUSTOM", Separator: "-", SequenceDigits: 3, ContextMode: NomenclatureContextLegacyInternalArea, SequenceScope: NomenclatureSequenceBranch}
		replay, e := hf1Customize(t, f, op, policy)
		if e != nil || first != replay || before != f.state() {
			t.Fatalf("durable reconciliation: %v", e)
		}
		t.Log("NETWORK_SIMULATION=NOT_AVAILABLE NEW_CONNECTION_RECONCILIATION=RECONCILED_NOT_DUPLICATED")
	})
}
