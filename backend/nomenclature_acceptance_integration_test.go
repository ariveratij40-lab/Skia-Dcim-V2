package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestNomenclatureAcceptancePostgreSQL16(t *testing.T) {
	adminURL := os.Getenv("NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL")
	runtimeURL := os.Getenv("NOMENCLATURE_ACCEPTANCE_RUNTIME_DATABASE_URL")
	if adminURL == "" || runtimeURL == "" {
		t.Skip("acceptance PostgreSQL URLs not set")
	}
	admin, err := sql.Open("postgres", adminURL)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	runtime, err := sql.Open("postgres", runtimeURL)
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()

	tenant, branch := uuid.NewString(), uuid.NewString()
	adminUser, viewerUser := uuid.NewString(), uuid.NewString()
	adminRole, viewerRole := uuid.NewString(), uuid.NewString()
	preset1, preset2, concurrentPreset := uuid.NewString(), uuid.NewString(), uuid.NewString()
	setup := []struct {
		query string
		args  []interface{}
	}{
		{`INSERT INTO tenants(id,name,status) VALUES($1,'B2c tenant','active')`, []interface{}{tenant}},
		{`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$2,'B2C','B2c branch','active')`, []interface{}{branch, tenant}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES ($1,' ADMIN@EXAMPLE.INVALID ','Admin','x','active'),($2,'viewer@example.invalid','Viewer','x','active')`, []interface{}{adminUser, viewerUser}},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$3),($2,$3)`, []interface{}{adminUser, viewerUser, tenant}},
		{`INSERT INTO roles(id,tenant_id,name,is_global) VALUES($1,$3,'admin',false),($2,$3,'viewer',false)`, []interface{}{adminRole, viewerRole, tenant}},
		{`INSERT INTO user_roles(user_id,tenant_id,role_id) VALUES($1,$3,$4),($2,$3,$5)`, []interface{}{adminUser, viewerUser, tenant, adminRole, viewerRole}},
		{`INSERT INTO system_naming_presets(id,preset_code,asset_type_code,preset_version,prefix,separator,include_branch,context_mode,sequence_scope,seq_digits,custom_segment_1,custom_segment_1_label,description,active) VALUES($1,'SERVER_V1','SERVER',1,'SRV','-',true,'LEGACY_INTERNAL_AREA','BRANCH',3,'E1','Edificio','Server v1',true),($2,'SERVER_V2','SERVER',2,'SERVER','-',true,'LEGACY_INTERNAL_AREA','BRANCH',4,'E2','Sitio','Server v2',false),($3,'FIREWALL_V1','FIREWALL',1,'FW','-',true,'LEGACY_INTERNAL_AREA','BRANCH',3,NULL,NULL,'Firewall v1',true)`, []interface{}{preset1, preset2, concurrentPreset}},
	}
	for _, statement := range setup {
		if _, err = admin.Exec(statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
	defer admin.Exec(`DELETE FROM system_naming_presets WHERE id IN($1,$2,$3)`, preset1, preset2, concurrentPreset)
	defer admin.Exec(`DELETE FROM tenants WHERE id=$1`, tenant)

	accept := func(user, code string, version int, operation string) (NomenclatureDomainResult, error) {
		ctx := withTenantIdentity(context.Background(), user, tenant, branch)
		tx, e := BeginAuthenticatedTenantTx(ctx, runtime, tenant, branch, user)
		if e != nil {
			return NomenclatureDomainResult{}, e
		}
		result, e := AcceptNomenclaturePreset(ctx, tx, tenant, user, AcceptPresetInput{AssetTypeCode: code, PresetVersion: version, OperationID: operation})
		if e != nil {
			_ = tx.Rollback()
			return result, e
		}
		e = tx.Commit()
		return result, e
	}
	created, err := accept(adminUser, "SERVER", 1, uuid.NewString())
	if err != nil || created.Status != NomenclatureSuccessCreated {
		t.Fatalf("create=%#v err=%v", created, err)
	}
	var segment, label string
	if err = admin.QueryRow(`SELECT custom_segment_1,custom_segment_1_label FROM naming_rules WHERE id=$1`, created.RuleID).Scan(&segment, &label); err != nil || segment != "E1" || label != "Edificio" {
		t.Fatalf("preset mapping segment=%q label=%q err=%v", segment, label, err)
	}
	existing, err := accept(adminUser, "SERVER", 1, uuid.NewString())
	if err != nil || existing.Status != NomenclatureSuccessExisting || existing.RuleID != created.RuleID {
		t.Fatalf("existing=%#v err=%v", existing, err)
	}
	if _, err = admin.Exec(`UPDATE system_naming_presets SET active=CASE WHEN id=$1 THEN false WHEN id=$2 THEN true ELSE active END WHERE id IN($1,$2)`, preset1, preset2); err != nil {
		t.Fatal(err)
	}
	successor, err := accept(adminUser, "SERVER", 2, uuid.NewString())
	if err != nil || successor.Status != NomenclatureSuccessSuccessor || successor.RuleVersion != 2 {
		t.Fatalf("successor=%#v err=%v", successor, err)
	}
	if err = admin.QueryRow(`SELECT custom_segment_1,custom_segment_1_label FROM naming_rules WHERE id=$1`, successor.RuleID).Scan(&segment, &label); err != nil || segment != "E2" || label != "Sitio" {
		t.Fatalf("successor mapping segment=%q label=%q err=%v", segment, label, err)
	}
	if _, err = accept(viewerUser, "FIREWALL", 1, uuid.NewString()); err != ErrNomenclatureUnauthorized {
		t.Fatalf("viewer err=%v", err)
	}

	results := make(chan NomenclatureDomainResult, 2)
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, e := accept(adminUser, "FIREWALL", 1, uuid.NewString())
			results <- r
			errs <- e
		}()
	}
	wg.Wait()
	close(results)
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	createdCount, existingCount := 0, 0
	for r := range results {
		if r.Status == NomenclatureSuccessCreated {
			createdCount++
		}
		if r.Status == NomenclatureSuccessExisting {
			existingCount++
		}
	}
	if createdCount != 1 || existingCount != 1 {
		t.Fatalf("concurrent results created=%d existing=%d", createdCount, existingCount)
	}
	var active, roots, audits int
	if err = admin.QueryRow(`SELECT count(*) FILTER(WHERE active),count(*) FILTER(WHERE supersedes_rule_id IS NULL) FROM naming_rules WHERE tenant_id=$1 AND asset_type_code='FIREWALL'`, tenant).Scan(&active, &roots); err != nil {
		t.Fatal(err)
	}
	if err = admin.QueryRow(`SELECT count(*) FROM audit_logs WHERE tenant_id=$1 AND entity_type='naming_rule'`, tenant).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if active != 1 || roots != 1 || audits != 3 {
		t.Fatalf("active=%d roots=%d audits=%d", active, roots, audits)
	}
}

// All fixtures run against the disposable canonical schema as skia_runtime.
// Admin is used only to arrange fixtures and independently inspect persisted state.
type acceptanceFixture struct {
	t                                          *testing.T
	admin, runtime                             *sql.DB
	tenant, branch, actor, viewer, super, dual string
	p1, p2                                     string
}

func newAcceptanceFixture(t *testing.T, admin, runtime *sql.DB, p1, p2 string) *acceptanceFixture {
	t.Helper()
	f := &acceptanceFixture{t: t, admin: admin, runtime: runtime, tenant: uuid.NewString(), branch: uuid.NewString(), actor: uuid.NewString(), viewer: uuid.NewString(), super: uuid.NewString(), dual: uuid.NewString(), p1: p1, p2: p2}
	f.exec(`UPDATE system_naming_presets SET active=false WHERE id IN ($1,$2)`, p1, p2)
	f.exec(`UPDATE system_naming_presets SET active=true WHERE id=$1`, p1)
	f.exec(`INSERT INTO tenants(id,name,status) VALUES($1,'B2c matrix','active')`, f.tenant)
	f.exec(`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$2,'MAT','Matrix','active')`, f.branch, f.tenant)
	for _, u := range []string{f.actor, f.viewer, f.super, f.dual} {
		f.exec(`INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,'Matrix actor','test-only','active')`, u, " "+u+"@EXAMPLE.INVALID ")
		f.exec(`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$2)`, u, f.tenant)
	}
	for _, role := range []string{"admin", "viewer", "super_admin"} {
		rid := uuid.NewString()
		f.exec(`INSERT INTO roles(id,tenant_id,name,is_global) VALUES($1,$2,$3,false)`, rid, f.tenant, role)
		users := []string{f.actor, f.dual}
		if role == "viewer" {
			users = []string{f.viewer}
		}
		if role == "super_admin" {
			users = []string{f.super, f.dual}
		}
		for _, u := range users {
			f.exec(`INSERT INTO user_roles(user_id,tenant_id,role_id) VALUES($1,$2,$3)`, u, f.tenant, rid)
		}
	}
	t.Cleanup(func() {
		if _, e := admin.Exec(`DELETE FROM tenants WHERE id=$1`, f.tenant); e != nil {
			t.Error(e)
		}
		for _, u := range []string{f.actor, f.viewer, f.super, f.dual} {
			if _, e := admin.Exec(`DELETE FROM users WHERE id=$1`, u); e != nil {
				t.Error(e)
			}
		}
	})
	return f
}
func (f *acceptanceFixture) exec(q string, args ...interface{}) {
	f.t.Helper()
	if _, e := f.admin.Exec(q, args...); e != nil {
		f.t.Fatal(e)
	}
}
func (f *acceptanceFixture) count(q string, args ...interface{}) int {
	f.t.Helper()
	var n int
	if e := f.admin.QueryRow(q, args...).Scan(&n); e != nil {
		f.t.Fatal(e)
	}
	return n
}
func (f *acceptanceFixture) json(q string, args ...interface{}) string {
	f.t.Helper()
	var s string
	if e := f.admin.QueryRow(q, args...).Scan(&s); e != nil {
		f.t.Fatal(e)
	}
	return s
}
func (f *acceptanceFixture) state() string {
	return f.json(`SELECT jsonb_build_object('rules',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM naming_rules r WHERE tenant_id=$1),'[]'),'audits',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM audit_logs a WHERE tenant_id=$1),'[]'),'assets',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM assets a WHERE tenant_id=$1),'[]'))::text`, f.tenant)
}
func (f *acceptanceFixture) invoke(user string, custom bool, version int, op string) (NomenclatureDomainResult, error) {
	ctx := withTenantIdentity(context.Background(), user, f.tenant, f.branch)
	tx, e := BeginAuthenticatedTenantTx(ctx, f.runtime, f.tenant, f.branch, user)
	if e != nil {
		return NomenclatureDomainResult{}, e
	}
	defer tx.Rollback()
	var r NomenclatureDomainResult
	if custom {
		r, e = CustomizeNomenclatureRule(ctx, tx, f.tenant, user, CustomizeNomenclatureInput{AssetTypeCode: "SERVER", OperationID: op, Policy: CanonicalNomenclaturePolicy{AssetTypeCode: "SERVER", Prefix: "CUSTOM", Separator: "-", SequenceDigits: 3, ContextMode: NomenclatureContextLegacyInternalArea, SequenceScope: NomenclatureSequenceBranch}})
	} else {
		r, e = AcceptNomenclaturePreset(ctx, tx, f.tenant, user, AcceptPresetInput{AssetTypeCode: "SERVER", PresetVersion: version, OperationID: op})
	}
	if e != nil {
		return r, e
	}
	return r, tx.Commit()
}
func (f *acceptanceFixture) accept(v int) NomenclatureDomainResult {
	f.t.Helper()
	r, e := f.invoke(f.actor, false, v, uuid.NewString())
	if e != nil {
		f.t.Fatal(e)
	}
	return r
}
func (f *acceptanceFixture) newer() {
	f.exec(`UPDATE system_naming_presets SET active=false WHERE id=$1`, f.p1)
	f.exec(`UPDATE system_naming_presets SET active=true WHERE id=$1`, f.p2)
}
func (f *acceptanceFixture) lineage() {
	f.t.Helper()
	q := `WITH RECURSIVE r AS (SELECT * FROM naming_rules WHERE tenant_id=$1 AND asset_type_code='SERVER'), walk AS (SELECT id,supersedes_rule_id,ARRAY[id] path,false cycle FROM r UNION ALL SELECT p.id,p.supersedes_rule_id,w.path||p.id,p.id=ANY(w.path) FROM walk w JOIN r p ON p.id=w.supersedes_rule_id WHERE NOT w.cycle) SELECT (SELECT count(*) FROM r WHERE active)>1 OR EXISTS(SELECT 1 FROM r WHERE supersedes_rule_id IS NOT NULL GROUP BY supersedes_rule_id HAVING count(*)>1) OR EXISTS(SELECT 1 FROM r c JOIN naming_rules p ON p.id=c.supersedes_rule_id WHERE c.rule_version<=p.rule_version OR c.tenant_id<>p.tenant_id OR c.asset_type_code<>p.asset_type_code) OR EXISTS(SELECT 1 FROM walk WHERE cycle)`
	var invalid bool
	if e := f.admin.QueryRow(q, f.tenant).Scan(&invalid); e != nil {
		f.t.Fatal(e)
	}
	if invalid {
		f.t.Fatal("invalid persisted lineage")
	}
}
func (f *acceptanceFixture) audit(action string) int {
	return f.count(`SELECT count(*) FROM audit_logs WHERE tenant_id=$1 AND action=$2`, f.tenant, action)
}
func (f *acceptanceFixture) issue(rule string) string {
	f.exec(`INSERT INTO nomenclature_branch_counters(nomenclature_id,tenant_id,branch_id,last_seq) VALUES($1,$2,$3,1)`, rule, f.tenant, f.branch)
	id := uuid.NewString()
	f.exec(`INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name,nomenclature_id,nomenclature_sequence) SELECT $1,$2,$3,id,'SRV-MAT-001','Historical asset',$4,1 FROM asset_types WHERE code='SERVER' LIMIT 1`, id, f.tenant, f.branch, rule)
	if f.count(`SELECT count(*) FROM assets WHERE id=$1`, id) != 1 {
		f.t.Fatal("asset fixture missing")
	}
	return id
}
func (f *acceptanceFixture) race(a, b func() (NomenclatureDomainResult, error)) []NomenclatureDomainResult {
	f.t.Helper()
	hold, e := f.admin.Begin()
	if e != nil {
		f.t.Fatal(e)
	}
	defer hold.Rollback()
	if _, e = hold.Exec(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, f.tenant+":SERVER"); e != nil {
		f.t.Fatal(e)
	}
	type outcome struct {
		r NomenclatureDomainResult
		e error
	}
	ch := make(chan outcome, 2)
	for _, fn := range []func() (NomenclatureDomainResult, error){a, b} {
		go func(fn func() (NomenclatureDomainResult, error)) { r, e := fn(); ch <- outcome{r, e} }(fn)
	}
	deadline := time.Now().Add(10 * time.Second)
	blocked := 0
	for time.Now().Before(deadline) {
		blocked = f.count(`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND usename='skia_runtime' AND wait_event='advisory'`)
		if blocked >= 2 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if blocked < 2 {
		f.t.Fatal("two concurrent transactions did not reach advisory barrier")
	}
	if e = hold.Commit(); e != nil {
		f.t.Fatal(e)
	}
	var out []NomenclatureDomainResult
	for i := 0; i < 2; i++ {
		select {
		case o := <-ch:
			if o.e != nil {
				f.t.Fatal(o.e)
			}
			out = append(out, o.r)
		case <-time.After(10 * time.Second):
			f.t.Fatal("race timed out")
		}
	}
	f.t.Logf("overlapping outcomes: %s/%s -> %s/%s", out[0].Status, out[0].State, out[1].Status, out[1].State)
	f.lineage()
	return out
}

func TestNomenclatureAcceptanceMatrixPostgreSQL16(t *testing.T) {
	adminURL, runtimeURL := os.Getenv("NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL"), os.Getenv("NOMENCLATURE_ACCEPTANCE_RUNTIME_DATABASE_URL")
	if adminURL == "" || runtimeURL == "" {
		t.Skip("acceptance PostgreSQL URLs not set")
	}
	admin, e := sql.Open("postgres", adminURL)
	if e != nil {
		t.Fatal(e)
	}
	defer admin.Close()
	runtime, e := sql.Open("postgres", runtimeURL)
	if e != nil {
		t.Fatal(e)
	}
	defer runtime.Close()
	p1, p2 := uuid.NewString(), uuid.NewString()
	_, e = admin.Exec(`INSERT INTO system_naming_presets(id,preset_code,asset_type_code,preset_version,prefix,separator,include_branch,context_mode,sequence_scope,seq_digits,description,active) VALUES($1,'SERVER_MATRIX_101','SERVER',101,'SRV','-',true,'LEGACY_INTERNAL_AREA','BRANCH',3,'matrix one',true),($2,'SERVER_MATRIX_102','SERVER',102,'SRV2','-',true,'LEGACY_INTERNAL_AREA','BRANCH',3,'matrix two',false)`, p1, p2)
	if e != nil {
		t.Fatal(e)
	}
	defer admin.Exec(`DELETE FROM system_naming_presets WHERE id IN($1,$2)`, p1, p2)
	fixture := func(t *testing.T) *acceptanceFixture { return newAcceptanceFixture(t, admin, runtime, p1, p2) }
	t.Run("legacy_preserved", func(t *testing.T) {
		f := fixture(t)
		id := uuid.NewString()
		f.exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,seq_digits,active) VALUES($1,$2,'SERVER','LEGACY',3,true)`, id, f.tenant)
		before := f.state()
		r := f.accept(101)
		if r.State != AcceptanceLegacyExisting || r.RuleID != id || f.state() != before {
			t.Fatal("legacy not preserved")
		}
		f.lineage()
	})
	t.Run("inactive_preserved", func(t *testing.T) {
		f := fixture(t)
		r := f.accept(101)
		f.exec(`UPDATE naming_rules SET active=false WHERE id=$1`, r.RuleID)
		before := f.state()
		r = f.accept(101)
		if r.State != AcceptanceInactivePreserved || f.state() != before {
			t.Fatal("inactive not preserved")
		}
		f.lineage()
	})
	t.Run("service_unavailable", func(t *testing.T) {
		f := fixture(t)
		for _, tc := range []struct {
			v int
			e error
		}{{999, ErrNomenclaturePresetNotFound}, {102, ErrNomenclaturePresetInactive}} {
			before := f.state()
			_, e := f.invoke(f.actor, false, tc.v, uuid.NewString())
			if !errors.Is(e, tc.e) || f.state() != before {
				t.Fatalf("v%d error=%v", tc.v, e)
			}
		}
	})
	t.Run("issued_preserved", func(t *testing.T) {
		f := fixture(t)
		r := f.accept(101)
		asset := f.issue(r.RuleID)
		before := f.json(`SELECT to_jsonb(a)::text FROM assets a WHERE id=$1`, asset)
		ruleBefore := f.json(`SELECT to_jsonb(r)::text FROM naming_rules r WHERE id=$1`, r.RuleID)
		counterBefore := f.json(`SELECT to_jsonb(c)::text FROM nomenclature_branch_counters c WHERE nomenclature_id=$1 AND branch_id=$2`, r.RuleID, f.branch)
		f.newer()
		op := uuid.NewString()
		for i := 0; i < 2; i++ {
			got, e := f.invoke(f.actor, false, 102, op)
			if e != nil || got.State != AcceptanceIssuedPreserved || got.Status != NomenclaturePreservedOutcome || got.RuleID != r.RuleID {
				t.Fatalf("issued=%+v %v", got, e)
			}
		}
		if f.count(`SELECT count(*) FROM naming_rules WHERE tenant_id=$1 AND asset_type_code='SERVER'`, f.tenant) != 1 || f.audit("NOMENCLATURE_PRESET_PRESERVED_CONFLICT") != 1 || f.json(`SELECT to_jsonb(a)::text FROM assets a WHERE id=$1`, asset) != before {
			t.Fatal("issued identity changed")
		}
		if ruleBefore != f.json(`SELECT to_jsonb(r)::text FROM naming_rules r WHERE id=$1`, r.RuleID) || counterBefore != f.json(`SELECT to_jsonb(c)::text FROM nomenclature_branch_counters c WHERE nomenclature_id=$1 AND branch_id=$2`, r.RuleID, f.branch) || f.count(`SELECT count(*) FROM naming_rules WHERE id=$1 AND active`, r.RuleID) != 1 {
			t.Fatal("issued rule, provenance or sequence authority changed")
		}
		f.lineage()
	})
	t.Run("issued_customization_preserves_historical_asset", func(t *testing.T) {
		f := fixture(t)
		r := f.accept(101)
		f.issue(r.RuleID)
		before := f.state()
		got, e := f.invoke(f.actor, true, 0, uuid.NewString())
		if e != nil || got.State != AcceptanceIssuedPreserved || before != f.state() {
			t.Fatalf("issued customization changed history: %+v %v", got, e)
		}
		f.lineage()
	})
	t.Run("successor_and_retry", func(t *testing.T) {
		f := fixture(t)
		r := f.accept(101)
		before := f.json(`SELECT (to_jsonb(r)-'active'-'updated_at')::text FROM naming_rules r WHERE id=$1`, r.RuleID)
		f.newer()
		op := uuid.NewString()
		s, e := f.invoke(f.actor, false, 102, op)
		if e != nil || s.Status != NomenclatureSuccessSuccessor {
			t.Fatalf("%+v %v", s, e)
		}
		again, e := f.invoke(f.actor, false, 102, op)
		if e != nil || again.RuleID != s.RuleID || again.Status != NomenclatureSuccessExisting {
			t.Fatal("successor retry")
		}
		if f.count(`SELECT count(*) FROM naming_rules WHERE id=$1 AND supersedes_rule_id=$2 AND rule_version=2 AND active AND source_type='PRESET' AND source_preset_id=$3 AND source_preset_version=102`, s.RuleID, r.RuleID, p2) != 1 || f.count(`SELECT count(*) FROM naming_rules WHERE id=$1 AND NOT active`, r.RuleID) != 1 || f.audit("NOMENCLATURE_PRESET_UPDATE_ACCEPTED") != 1 || before != f.json(`SELECT (to_jsonb(r)-'active'-'updated_at')::text FROM naming_rules r WHERE id=$1`, r.RuleID) {
			t.Fatal("successor persisted assertions")
		}
		f.lineage()
	})
	t.Run("custom_derived_and_preserved", func(t *testing.T) {
		f := fixture(t)
		r := f.accept(101)
		before := f.json(`SELECT (to_jsonb(r)-'active'-'updated_at')::text FROM naming_rules r WHERE id=$1`, r.RuleID)
		c, e := f.invoke(f.actor, true, 0, uuid.NewString())
		if e != nil {
			t.Fatal(e)
		}
		if f.count(`SELECT count(*) FROM naming_rules WHERE id=$1 AND supersedes_rule_id=$2 AND rule_version=2 AND active AND source_type='DERIVED_FROM_PRESET' AND source_preset_id=$3 AND source_preset_version=101 AND customized_after_acceptance AND accepted_by=$4`, c.RuleID, r.RuleID, p1, f.actor) != 1 || f.audit("NOMENCLATURE_RULE_CUSTOMIZED") != 1 || before != f.json(`SELECT (to_jsonb(r)-'active'-'updated_at')::text FROM naming_rules r WHERE id=$1`, r.RuleID) {
			t.Fatal("derived lineage")
		}
		op := uuid.NewString()
		ruleBefore := f.json(`SELECT to_jsonb(r)::text FROM naming_rules r WHERE id=$1`, c.RuleID)
		for i := 0; i < 2; i++ {
			got, e := f.invoke(f.actor, false, 101, op)
			if e != nil || got.State != AcceptanceCustomizedPreserved {
				t.Fatalf("%+v %v", got, e)
			}
		}
		if f.audit("NOMENCLATURE_PRESET_PRESERVED_CONFLICT") != 1 || ruleBefore != f.json(`SELECT to_jsonb(r)::text FROM naming_rules r WHERE id=$1`, c.RuleID) {
			t.Fatal("customized overwritten")
		}
		f.lineage()
	})
	t.Run("independent_custom_and_null_rejections", func(t *testing.T) {
		f := fixture(t)
		c, e := f.invoke(f.actor, true, 0, uuid.NewString())
		if e != nil {
			t.Fatal(e)
		}
		if f.count(`SELECT count(*) FROM naming_rules WHERE id=$1 AND source_type='CUSTOM' AND source_preset_id IS NULL AND source_preset_version IS NULL`, c.RuleID) != 1 || f.audit("NOMENCLATURE_RULE_CUSTOMIZED") != 1 {
			t.Fatal("custom provenance")
		}
		for _, action := range []string{"NOMENCLATURE_PRESET_ACCEPTED", "NOMENCLATURE_PRESET_UPDATE_ACCEPTED"} {
			ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
			tx, e := BeginAuthenticatedTenantTx(ctx, runtime, f.tenant, f.branch, f.actor)
			if e != nil {
				t.Fatal(e)
			}
			_, e = writeNomenclatureAudit(ctx, tx, uuid.NewString(), c.RuleID, nil, action)
			tx.Rollback()
			if !errors.Is(e, ErrNomenclatureAudit) {
				t.Fatal("invalid null allowed")
			}
		}
		f.lineage()
	})
	t.Run("derived_null_rejected", func(t *testing.T) {
		f := fixture(t)
		f.accept(101)
		c, e := f.invoke(f.actor, true, 0, uuid.NewString())
		if e != nil {
			t.Fatal(e)
		}
		ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
		tx, e := BeginAuthenticatedTenantTx(ctx, runtime, f.tenant, f.branch, f.actor)
		if e != nil {
			t.Fatal(e)
		}
		defer tx.Rollback()
		if _, e = writeNomenclatureAudit(ctx, tx, uuid.NewString(), c.RuleID, nil, "NOMENCLATURE_RULE_CUSTOMIZED"); !errors.Is(e, ErrNomenclatureAudit) {
			t.Fatal("derived null allowed")
		}
	})
	t.Run("actor_deletion", func(t *testing.T) {
		f := fixture(t)
		r := f.accept(101)
		before := f.json(`SELECT accepted_by_snapshot::text FROM naming_rules WHERE id=$1`, r.RuleID)
		f.exec(`DELETE FROM users WHERE id=$1`, f.actor)
		if f.count(`SELECT count(*) FROM naming_rules WHERE id=$1 AND accepted_by IS NULL AND source_type='PRESET'`, r.RuleID) != 1 || before != f.json(`SELECT accepted_by_snapshot::text FROM naming_rules WHERE id=$1`, r.RuleID) || f.audit("NOMENCLATURE_PRESET_ACCEPTED") != 1 {
			t.Fatal("history not durable")
		}
	})
	t.Run("conflict_older_active_preset", func(t *testing.T) {
		f := fixture(t)
		f.newer()
		f.accept(102)
		f.exec(`UPDATE system_naming_presets SET active=false WHERE id=$1`, p2)
		f.exec(`UPDATE system_naming_presets SET active=true WHERE id=$1`, p1)
		before := f.state()
		r, e := f.invoke(f.actor, false, 101, uuid.NewString())
		if !errors.Is(e, ErrNomenclatureConflict) || r.State != AcceptanceConflict || before != f.state() {
			t.Fatalf("conflict=%+v %v", r, e)
		}
		f.lineage()
	})
	t.Run("audit_failure_rolls_back_service", func(t *testing.T) {
		f := fixture(t)
		f.accept(101)
		f.newer()
		before := f.state()
		f.exec(`CREATE FUNCTION public.b2c_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit rejection'; END $$`)
		f.exec(`CREATE TRIGGER b2c_reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION public.b2c_reject_audit()`)
		defer func() {
			f.exec(`DROP TRIGGER b2c_reject_audit ON audit_logs`)
			f.exec(`DROP FUNCTION public.b2c_reject_audit()`)
		}()
		r, e := f.invoke(f.actor, false, 102, uuid.NewString())
		if !errors.Is(e, ErrNomenclatureAudit) || r.Status != "" || f.state() != before {
			t.Fatalf("partial authority=%+v %v", r, e)
		}
		f.lineage()
	})
	for _, kind := range []string{"initial", "successor", "accept_customize", "customize_customize"} {
		t.Run("race_"+kind, func(t *testing.T) {
			f := fixture(t)
			if kind != "initial" {
				f.accept(101)
				f.newer()
			}
			a := func() (NomenclatureDomainResult, error) {
				v := 101
				if kind != "initial" {
					v = 102
				}
				return f.invoke(f.actor, false, v, uuid.NewString())
			}
			b := a
			if kind == "accept_customize" || kind == "customize_customize" {
				b = func() (NomenclatureDomainResult, error) { return f.invoke(f.actor, true, 0, uuid.NewString()) }
			}
			if kind == "customize_customize" {
				a = b
			}
			out := f.race(a, b)
			if kind == "initial" || kind == "successor" {
				want := 1
				if kind == "successor" {
					want = 2
				}
				if f.count(`SELECT count(*) FROM naming_rules WHERE tenant_id=$1 AND asset_type_code='SERVER'`, f.tenant) != want {
					t.Fatal("duplicate transition")
				}
			}
			if len(out) != 2 {
				t.Fatal("missing race result")
			}
			updates, customs, conflicts := 0, 0, 0
			for _, r := range out {
				if r.State == AcceptanceNewerPresetAvailable {
					updates++
				}
				if r.Status == NomenclatureSuccessSuccessor && r.State == AcceptanceCreatable {
					customs++
				}
				if r.State == AcceptanceCustomizedPreserved {
					conflicts++
				}
			}
			if f.audit("NOMENCLATURE_PRESET_UPDATE_ACCEPTED") != updates || f.audit("NOMENCLATURE_RULE_CUSTOMIZED") != customs || f.audit("NOMENCLATURE_PRESET_PRESERVED_CONFLICT") != conflicts || f.audit("NOMENCLATURE_PRESET_ACCEPTED") != 1 {
				t.Fatal("race audit count differs from legal committed transitions")
			}
		})
	}
	t.Run("roles_and_guc_cleanup", func(t *testing.T) {
		f := fixture(t)
		for _, u := range []string{f.viewer, f.actor, f.super, f.dual} {
			ctx := withTenantIdentity(context.Background(), u, f.tenant, f.branch)
			tx, e := BeginAuthenticatedTenantTx(ctx, runtime, f.tenant, f.branch, u)
			if e != nil {
				t.Fatal(e)
			}
			a, e := resolveNomenclatureActor(ctx, tx, f.tenant, u)
			tx.Rollback()
			if u == f.viewer {
				if !errors.Is(e, ErrNomenclatureUnauthorized) {
					t.Fatal("viewer")
				}
			} else if e != nil || ((u == f.super || u == f.dual) && a.Role != "super_admin") {
				t.Fatalf("actor=%+v %v", a, e)
			}
		}
		for _, u := range []string{f.super, f.dual} {
			r, e := f.invoke(u, false, 101, uuid.NewString())
			if e != nil || r.RuleID == "" {
				t.Fatal("super mutation", e)
			}
		}
		one, e := sql.Open("postgres", runtimeURL)
		if e != nil {
			t.Fatal(e)
		}
		defer one.Close()
		one.SetMaxOpenConns(1)
		for _, commit := range []bool{true, false} {
			ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
			tx, e := BeginAuthenticatedTenantTx(ctx, one, f.tenant, f.branch, f.actor)
			if e != nil {
				t.Fatal(e)
			}
			var tenant, branch, actor string
			if e = tx.QueryRow(`SELECT current_setting('app.tenant_id'),current_setting('app.branch_id'),current_setting('app.user_id')`).Scan(&tenant, &branch, &actor); e != nil || tenant != f.tenant || branch != f.branch || actor != f.actor {
				t.Fatal("GUC identity", e)
			}
			if commit {
				e = tx.Commit()
			} else {
				e = tx.Rollback()
			}
			if e != nil {
				t.Fatal(e)
			}
			var clean bool
			if e = one.QueryRow(`SELECT COALESCE(current_setting('app.tenant_id',true),'')='' AND COALESCE(current_setting('app.branch_id',true),'')='' AND COALESCE(current_setting('app.user_id',true),'')=''`).Scan(&clean); e != nil || !clean {
				t.Fatal("GUC leaked", e)
			}
		}
		tx, e := BeginTenantTx(context.Background(), one, f.tenant, f.branch)
		if e != nil {
			t.Fatal(e)
		}
		var actor string
		e = tx.QueryRow(`SELECT COALESCE(current_setting('app.user_id',true),'')`).Scan(&actor)
		tx.Rollback()
		if e != nil || actor != "" {
			t.Fatal("legacy actor authority", e)
		}
	})
	t.Run("policy_has_no_physical_identifiers", func(t *testing.T) {
		p := reflect.TypeOf(CanonicalNomenclaturePolicy{})
		for _, n := range []string{"BranchID", "ZoneID", "DistributionID", "HousingRackID", "PlacementID", "ZoneCode", "HousingCode"} {
			if _, ok := p.FieldByName(n); ok {
				t.Fatal("physical authority in policy", n)
			}
		}
	})
	t.Run("authenticated_identity_and_snapshot", func(t *testing.T) {
		f := fixture(t)
		ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
		tx, e := BeginAuthenticatedTenantTx(ctx, runtime, f.tenant, f.branch, f.actor)
		if e != nil {
			t.Fatal(e)
		}
		defer tx.Rollback()
		for _, identity := range []struct {
			ctx           context.Context
			tenant, actor string
		}{{context.Background(), f.tenant, f.actor}, {ctx, f.tenant, f.viewer}, {ctx, uuid.NewString(), f.actor}} {
			if _, e = AcceptNomenclaturePreset(identity.ctx, tx, identity.tenant, identity.actor, AcceptPresetInput{AssetTypeCode: "SERVER", PresetVersion: 101, OperationID: uuid.NewString()}); !errors.Is(e, ErrNomenclatureUnauthorized) {
				t.Fatal("caller identity promoted", e)
			}
		}
		tx.Rollback()
		r, e := f.invoke(f.dual, false, 101, uuid.NewString())
		if e != nil {
			t.Fatal(e)
		}
		if f.count(`SELECT count(*) FROM naming_rules WHERE id=$1 AND accepted_by=$2 AND accepted_by_snapshot->>'role'='super_admin' AND accepted_by_snapshot->>'email'=lower(trim(accepted_by_snapshot->>'email')) AND accepted_by_snapshot->>'name'<>'' AND (SELECT count(*) FROM jsonb_object_keys(accepted_by_snapshot))=6`, r.RuleID, f.dual) != 1 {
			t.Fatal("snapshot authority")
		}
	})
	t.Run("b2a_postgres_engine_regression", func(t *testing.T) {
		f := fixture(t)
		accepted := f.accept(101)
		setup, e := admin.Begin()
		if e != nil {
			t.Fatal(e)
		}
		defer setup.Rollback()
		parent := setupCanonicalParentFixture(t, setup, f.tenant, f.branch, f.actor)
		if e = setup.Commit(); e != nil {
			t.Fatal(e)
		}
		ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
		policy := CanonicalNomenclaturePolicy{RuleID: accepted.RuleID, AssetTypeCode: "SERVER", Prefix: "SRV", Separator: "-", SequenceDigits: 3, ContextMode: NomenclatureContextLegacyInternalArea, SequenceScope: NomenclatureSequenceBranch, IncludeBranch: true}
		for _, scope := range []string{NomenclatureSequenceBranch, NomenclatureSequencePlacement, NomenclatureSequenceDistribution} {
			t.Run(scope, func(t *testing.T) {
				p := policy
				p.SequenceScope = scope
				c := CanonicalNomenclatureComponents{PlacementLocationID: parent.IDFLocationID, DistributionLocationID: parent.LocationID}
				tx, e := BeginTenantTx(ctx, runtime, f.tenant, f.branch)
				if e != nil {
					t.Fatal(e)
				}
				next, e := peekCanonicalSequence(ctx, tx, p, f.tenant, f.branch, c)
				if e != nil || next != 1 {
					t.Fatal("initial peek", next, e)
				}
				n, e := reserveCanonicalSequence(ctx, tx, p, f.tenant, f.branch, c)
				if e != nil || n != 1 {
					t.Fatal("reserve", n, e)
				}
				if e = tx.Rollback(); e != nil {
					t.Fatal(e)
				}
				tx, e = BeginTenantTx(ctx, runtime, f.tenant, f.branch)
				if e != nil {
					t.Fatal(e)
				}
				next, e = peekCanonicalSequence(ctx, tx, p, f.tenant, f.branch, c)
				tx.Rollback()
				if e != nil || next != 1 {
					t.Fatal("rollback consumed sequence", next, e)
				}
				start := make(chan struct{})
				ready := make(chan struct{}, 12)
				values := make(chan int, 12)
				errs := make(chan error, 12)
				for i := 0; i < 12; i++ {
					go func() {
						tx, e := BeginTenantTx(ctx, runtime, f.tenant, f.branch)
						if e != nil {
							errs <- e
							ready <- struct{}{}
							return
						}
						defer tx.Rollback()
						ready <- struct{}{}
						<-start
						n, e := reserveCanonicalSequence(ctx, tx, p, f.tenant, f.branch, c)
						if e == nil {
							e = tx.Commit()
						}
						errs <- e
						values <- n
					}()
				}
				for i := 0; i < 12; i++ {
					<-ready
				}
				close(start)
				seen := map[int]bool{}
				for i := 0; i < 12; i++ {
					if e := <-errs; e != nil {
						t.Fatal(e)
					}
					n := <-values
					if seen[n] || n < 1 || n > 12 {
						t.Fatal("sequence collision", n)
					}
					seen[n] = true
				}
				if len(seen) != 12 {
					t.Fatal("missing sequences")
				}
			})
		}
		// Database-backed preview and commit builder consume identical resolved IDs.
		for _, mode := range []string{NomenclatureContextCanonicalDistribution, NomenclatureContextCanonicalHousing} {
			t.Run(mode, func(t *testing.T) {
				code := "FIREWALL"
				housing := mode == NomenclatureContextCanonicalHousing
				if housing {
					code = "CCTV"
				}
				rid := uuid.NewString()
				f.exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,seq_digits,include_branch,context_mode,sequence_scope,include_distribution,include_housing) VALUES($1,$2,$3,'X','-',3,true,$4,'BRANCH',$5,$6)`, rid, f.tenant, code, mode, !housing, housing)
				tx, e := BeginTenantTx(ctx, runtime, f.tenant, f.branch)
				if e != nil {
					t.Fatal(e)
				}
				defer tx.Rollback()
				in := CanonicalNomenclatureInput{TenantID: f.tenant, BranchID: f.branch, AssetTypeCode: code, DistributionID: parent.DistributionID, HousingRackID: parent.RackID, Policy: CanonicalNomenclaturePolicy{ContextMode: mode}}
				preview, e := PreviewCanonicalNomenclature(ctx, tx, in)
				if e != nil {
					t.Fatal(e)
				}
				p, e := loadCanonicalNomenclaturePolicy(ctx, tx, f.tenant, code, mode, false)
				if e != nil {
					t.Fatal(e)
				}
				in.Policy = p
				r, e := ResolveCanonicalNomenclature(ctx, tx, in)
				if e != nil {
					t.Fatal(e)
				}
				n, e := peekCanonicalSequence(ctx, tx, p, f.tenant, f.branch, r.Components)
				if e != nil || n != 1 || preview.SequenceReserved {
					t.Fatal("preview mutated counter", e)
				}
				n, e = reserveCanonicalSequence(ctx, tx, p, f.tenant, f.branch, r.Components)
				if e != nil {
					t.Fatal(e)
				}
				built, e := BuildCanonicalNomenclature(p, r.Components, n)
				if e != nil || built != preview.IllustrativeCode {
					t.Fatalf("preview=%s commit=%s %v", preview.IllustrativeCode, built, e)
				}
				if housing && (r.Housing == nil || r.Housing.ID != parent.RackID) {
					t.Fatal("housing resolution")
				}
				if !housing && (r.Distribution == nil || r.Distribution.ID != parent.DistributionID) {
					t.Fatal("distribution resolution")
				}
				if e = tx.Commit(); e != nil {
					t.Fatal(e)
				}
			})
		}
		otherBranch := uuid.NewString()
		f.exec(`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$2,'OTHER','Other','active')`, otherBranch, f.tenant)
		for _, scope := range []struct{ tenant, branch string }{{f.tenant, otherBranch}, {uuid.NewString(), uuid.NewString()}} {
			tx, e := BeginTenantTx(context.Background(), runtime, scope.tenant, scope.branch)
			if e != nil {
				t.Fatal(e)
			}
			s := PhysicalScope{TenantID: scope.tenant, BranchID: scope.branch}
			if _, e = ResolveHousing(context.Background(), tx, s, parent.RackID); e == nil {
				t.Fatal("cross-scope housing visible")
			}
			if _, e = ResolveDistributionPoint(context.Background(), tx, s, parent.DistributionID, false); e == nil {
				t.Fatal("cross-scope distribution visible")
			}
			var n int
			if e = tx.QueryRow(`SELECT count(*) FROM nomenclature_branch_counters WHERE nomenclature_id=$1`, accepted.RuleID).Scan(&n); e != nil || n != 0 {
				t.Fatal("cross-scope counter visible", e)
			}
			tx.Rollback()
		}
		t.Log(fmt.Sprintf("B2A_POSTGRES=PASS: 3 scopes x 12 concurrent reservations; rollback, preview, housing, distribution and isolation"))
	})
}
