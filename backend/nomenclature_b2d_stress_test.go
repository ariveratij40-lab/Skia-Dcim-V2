package main

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/google/uuid"
	"os"
	"strings"
	"sync"
	"testing"
)

func b2dStressDB(t *testing.T) (*sql.DB, *sql.DB) {
	t.Helper()
	if os.Getenv("B2D_EXTENDED") != "1" {
		t.Skip("extended gate only after 12 basic presets pass")
	}
	a, e := sql.Open("postgres", os.Getenv("NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL"))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { a.Close() })
	r, e := sql.Open("postgres", os.Getenv("NOMENCLATURE_ACCEPTANCE_RUNTIME_DATABASE_URL"))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { r.Close() })
	r.SetMaxOpenConns(40)
	return a, r
}

func TestB2dCounterStress(t *testing.T) {
	a, r := b2dStressDB(t)
	for _, label := range []string{"BRANCH", "PLACEMENT", "DISTRIBUTION", "independent_BRANCH", "independent_PLACEMENT", "independent_DISTRIBUTION"} {
		t.Run(label, func(t *testing.T) {
			if strings.HasPrefix(label, "independent_") {
				t.Parallel()
			}
			scope := strings.TrimPrefix(label, "independent_")
			f := newAcceptanceFixture(t, a, r, uuid.NewString(), uuid.NewString())
			tx, e := a.Begin()
			if e != nil {
				t.Fatal(e)
			}
			parent := setupCanonicalParentFixture(t, tx, f.tenant, f.branch, f.actor)
			if e = tx.Commit(); e != nil {
				t.Fatal(e)
			}
			mode := "LEGACY_INTERNAL_AREA"
			if scope == "DISTRIBUTION" {
				mode = "CANONICAL_DISTRIBUTION"
			}
			rule := uuid.NewString()
			f.exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,seq_digits,include_branch,include_placement,include_distribution,context_mode,sequence_scope) VALUES($1,$2,'SERVER','ST','-',6,true,$3,$4,$5,$6)`, rule, f.tenant, scope == "PLACEMENT", scope == "DISTRIBUTION", mode, scope)
			ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
			type outcome struct {
				seq    int
				code   string
				rolled bool
				err    error
			}
			out := make(chan outcome, 640)
			var wg sync.WaitGroup
			for w := 0; w < 32; w++ {
				wg.Add(1)
				go func(w int) {
					defer wg.Done()
					for j := 0; j < 20; j++ {
						tx, e := BeginAuthenticatedTenantTx(ctx, r, f.tenant, f.branch, f.actor)
						if e != nil {
							out <- outcome{err: e}
							continue
						}
						v, e := reserveManagedAsset(tx, f.tenant, f.branch, f.actor, managedAssetInput{AssetTypeCode: "SERVER", Name: "stress", PlacementID: parent.LocationID, DistributionID: parent.DistributionID})
						o := outcome{err: e, rolled: (w*20+j)%5 == 0}
						if e == nil {
							o.seq = v.Assignment.Sequence
							o.code = v.Assignment.Code
							if o.rolled {
								e = tx.Rollback()
							} else {
								e = tx.Commit()
							}
							o.err = e
						} else {
							tx.Rollback()
						}
						out <- o
					}
				}(w)
			}
			wg.Wait()
			close(out)
			seqs := map[int]bool{}
			codes := map[string]bool{}
			committed, rolled := 0, 0
			for o := range out {
				if o.err != nil {
					t.Fatal(o.err)
				}
				if o.rolled {
					rolled++
					continue
				}
				if seqs[o.seq] || codes[o.code] {
					t.Fatal("duplicate committed identity")
				}
				seqs[o.seq] = true
				codes[o.code] = true
				committed++
			}
			q := `SELECT last_seq FROM nomenclature_branch_counters WHERE nomenclature_id=$1`
			if scope != "BRANCH" {
				q = `SELECT last_seq FROM nomenclature_counters WHERE nomenclature_id=$1`
			}
			if f.count(q, rule) != committed || f.count(`SELECT count(*) FROM assets WHERE nomenclature_id=$1`, rule) != committed {
				t.Fatal("lost update/rollback consumption")
			}
			t.Logf("SCOPE=%s ATTEMPTED=640 COMMITTED=%d ROLLED_BACK=%d FAILED=0 UNIQUE_SEQUENCES=%d UNIQUE_CODES=%d COUNTER_BEFORE=0 COUNTER_AFTER=%d", scope, committed, rolled, len(seqs), len(codes), committed)
		})
	}
}

func TestB2dAcceptanceStress(t *testing.T) {
	rootTest := t
	a, r := b2dStressDB(t)
	p1, p2 := uuid.NewString(), uuid.NewString()
	if _, e := a.Exec(`UPDATE system_naming_presets SET active=false WHERE asset_type_code='SERVER'`); e != nil {
		t.Fatal(e)
	}
	_, e := a.Exec(`INSERT INTO system_naming_presets(id,preset_code,asset_type_code,preset_version,prefix,separator,include_branch,context_mode,sequence_scope,seq_digits,active) VALUES($1,'B2D_STRESS_101','SERVER',101,'SRV','-',true,'LEGACY_INTERNAL_AREA','BRANCH',3,true),($2,'B2D_STRESS_102','SERVER',102,'SRV2','-',true,'LEGACY_INTERNAL_AREA','BRANCH',3,false)`, p1, p2)
	if e != nil {
		t.Fatal(e)
	}
	for _, kind := range []string{"initial", "successor", "accept_customize", "customize_customize", "same_operation"} {
		for i := 0; i < 100; i++ {
			t.Run(fmt.Sprintf("%s_%03d", kind, i), func(t *testing.T) {
				f := newAcceptanceFixture(rootTest, a, r, p1, p2)
				f.t = t
				if kind != "initial" {
					f.accept(101)
					f.newer()
				}
				op1, op2 := uuid.NewString(), uuid.NewString()
				if kind == "same_operation" {
					op2 = op1
				}
				version := 101
				if kind != "initial" {
					version = 102
				}
				custom1 := kind == "customize_customize" || kind == "same_operation"
				custom2 := custom1 || kind == "accept_customize"
				results := f.race(func() (NomenclatureDomainResult, error) { return f.invoke(f.actor, custom1, version, op1) }, func() (NomenclatureDomainResult, error) { return f.invoke(f.actor, custom2, version, op2) })
				f.lineage()
				for _, v := range results {
					if v.AuditEventID != "" && f.count(`SELECT count(*) FROM audit_logs a JOIN naming_rules n ON a.entity_id=n.id::text WHERE a.id=$1 AND a.tenant_id=$2 AND a.user_id=$3 AND a.changes->>'rule_id'=$4 AND a.changes->>'rule_version'=n.rule_version::text AND a.changes->>'source_type'=n.source_type`, v.AuditEventID, f.tenant, f.actor, v.RuleID) != 1 {
						t.Fatal("audit/result binding")
					}
					// A preserved-conflict event records the requested preset, not the
					// source preset of the rule that correctly remains unchanged.
					if v.AuditEventID != "" && f.count(`SELECT count(*) FROM audit_logs a JOIN naming_rules n ON a.entity_id=n.id::text WHERE a.id=$1 AND a.changes->>'operation_id' IN ($2,$3) AND a.changes->>'action'=a.action AND ((a.action='NOMENCLATURE_PRESET_PRESERVED_CONFLICT' AND a.changes->>'preset_id'=$4 AND a.changes->>'preset_version'='102') OR (a.action<>'NOMENCLATURE_PRESET_PRESERVED_CONFLICT' AND a.changes->>'preset_id'=n.source_preset_id::text AND a.changes->>'preset_version'=n.source_preset_version::text)) AND (a.action<>'NOMENCLATURE_RULE_CUSTOMIZED' OR a.changes->>'request_fingerprint' ~ '^[0-9a-f]{64}$')`, v.AuditEventID, op1, op2, p2) != 1 {
						t.Fatal("operation/action/preset/fingerprint binding")
					}
				}
				if kind == "same_operation" {
					if results[0] != results[1] {
						t.Fatal("same operation diverged")
					}
					before := f.state()
					v, e := f.invoke(f.actor, true, 0, op1)
					if e != nil || v != results[0] || before != f.state() {
						t.Fatal("retry duplicated")
					}
				}
			})
		}
		t.Logf("%s ITERATIONS=100 GRAPH_AND_AUDIT_CHECK_EACH=PASS", kind)
	}
	// Independent global graph check, including all surviving fixtures.
	var invalid int
	e = a.QueryRow(`SELECT count(*) FROM naming_rules c JOIN naming_rules p ON p.id=c.supersedes_rule_id WHERE c.tenant_id<>p.tenant_id OR c.asset_type_code<>p.asset_type_code OR c.rule_version<=p.rule_version`).Scan(&invalid)
	if e != nil || invalid != 0 {
		t.Fatal("global lineage", invalid, e)
	}
	for _, q := range []string{
		`SELECT count(*) FROM (SELECT tenant_id,asset_type_code FROM naming_rules WHERE active GROUP BY 1,2 HAVING count(*)>1) x`,
		`SELECT count(*) FROM (SELECT supersedes_rule_id FROM naming_rules WHERE supersedes_rule_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) x`,
		`WITH RECURSIVE w AS (SELECT id,supersedes_rule_id,ARRAY[id] path,false cycle FROM naming_rules UNION ALL SELECT p.id,p.supersedes_rule_id,w.path||p.id,p.id=ANY(w.path) FROM w JOIN naming_rules p ON p.id=w.supersedes_rule_id WHERE NOT w.cycle) SELECT count(*) FROM w WHERE cycle`,
		`SELECT count(*) FROM audit_logs a JOIN naming_rules n ON n.id::text=a.entity_id WHERE a.entity_type='naming_rule' AND (a.tenant_id<>n.tenant_id OR a.changes->>'rule_version'<>n.rule_version::text OR a.changes->>'rule_id'<>n.id::text OR a.changes->>'action'<>a.action OR NOT(a.changes ? 'operation_id'))`,
	} {
		if e = a.QueryRow(q).Scan(&invalid); e != nil || invalid != 0 {
			t.Fatal("global graph/audit", invalid, e)
		}
	}
	t.Log("GLOBAL_RETAINED_500_FIXTURES_GRAPH_AND_AUDIT_VIOLATIONS=0")
}
