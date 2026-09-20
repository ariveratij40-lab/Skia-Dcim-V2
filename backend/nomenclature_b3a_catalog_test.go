package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func b3aPopulatedPost039Upgrade(t *testing.T) {
	admin := b3aDB(t, "B3A_PRE039_ADMIN_DATABASE_URL")
	t.Setenv("NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL", os.Getenv("B3A_PRE039_ADMIN_DATABASE_URL"))
	t.Setenv("NOMENCLATURE_ACCEPTANCE_RUNTIME_DATABASE_URL", os.Getenv("B3A_PRE039_RUNTIME_DATABASE_URL"))
	b2dPresetOperationalMatrix(t, false, nil, func(f *acceptanceFixture, code string) {
		if code != "MDF" {
			return
		}
		// A real B2c-accepted, issued MDF rule, assets, physical topology and audit
		// already exist. The other eleven catalog rows have not been published.
		var count int
		if e := admin.QueryRow("SELECT count(*) FROM system_naming_presets").Scan(&count); e != nil || count != 1 {
			t.Fatal("prepublication fixture", count, e)
		}
		other := newAcceptanceFixture(t, admin, f.runtime, uuid.NewString(), uuid.NewString())
		other.exec(`INSERT INTO naming_rules(tenant_id,asset_type_code,prefix,source_type,active) VALUES
($1,'UPS','LEG','LEGACY_UNATTRIBUTED',true),($1,'CCTV','CUSTOM','CUSTOM',true),($1,'NODE','OLD','CUSTOM',false)`, other.tenant)
		ctx := withTenantIdentity(context.Background(), other.actor, other.tenant, other.branch)
		tx, e := BeginAuthenticatedTenantTx(ctx, other.runtime, other.tenant, other.branch, other.actor)
		if e != nil {
			t.Fatal(e)
		}
		accepted, e := AcceptNomenclaturePreset(ctx, tx, other.tenant, other.actor, AcceptPresetInput{AssetTypeCode: "MDF", PresetVersion: 1, OperationID: uuid.NewString()})
		if e != nil {
			tx.Rollback()
			t.Fatal(e)
		}
		if e = tx.Commit(); e != nil {
			t.Fatal(e)
		}
		tx, e = BeginAuthenticatedTenantTx(ctx, other.runtime, other.tenant, other.branch, other.actor)
		if e != nil {
			t.Fatal(e)
		}
		_, e = CustomizeNomenclatureRule(ctx, tx, other.tenant, other.actor, CustomizeNomenclatureInput{
			AssetTypeCode: "MDF", OperationID: uuid.NewString(), Policy: CanonicalNomenclaturePolicy{AssetTypeCode: "MDF", Prefix: "CUSTOM", Separator: "-", IncludeBranch: true, IncludeZone: true, ContextMode: NomenclatureContextCanonicalZone, SequenceScope: NomenclatureSequenceBranch, SequenceDigits: 3},
		})
		if e != nil {
			tx.Rollback()
			t.Fatal(e)
		}
		if e = tx.Commit(); e != nil {
			t.Fatal(e)
		}
		if other.count("SELECT count(*) FROM naming_rules WHERE tenant_id=$1 AND source_type='DERIVED_FROM_PRESET'", other.tenant) != 1 {
			t.Fatal("derived fixture")
		}
		if accepted.RuleID == "" {
			t.Fatal("preset fixture")
		}
		// Add a legacy placement counter to complement operational branch counters.
		f.exec(`INSERT INTO nomenclature_counters(nomenclature_id,tenant_id,branch_id,placement_id,last_seq)
SELECT r.id,r.tenant_id,$2,l.id,7 FROM naming_rules r CROSS JOIN locations l
WHERE r.tenant_id=$1 AND r.asset_type_code='MDF' AND r.active AND l.tenant_id=$1 LIMIT 1`, f.tenant, f.branch)
		if f.count("SELECT count(*) FROM nomenclature_counters WHERE tenant_id=$1", f.tenant) != 1 {
			t.Fatal("placement counter fixture")
		}
		before := b3aSnapshot(t, admin)
		b3aExec(t, admin, b3aSQL(t))
		if before != b3aSnapshot(t, admin) {
			t.Fatal("populated upgrade tenant delta")
		}
		if fmt.Sprintf("%x", sha256.Sum256(b3aRows(t, admin))) != b3aHash {
			t.Fatal("upgraded catalog")
		}
		t.Log("POST039_POPULATED_UPGRADE=PASS LEGACY_CUSTOM_PRESET_DERIVED_INACTIVE_ISSUED=PRESERVED")
	})
}

const b3aHash = "2c32e4b53c3969e310d70feb2e6d56e6c54dd71d73c4b9f7c83b5863219cad45"
const b3aArray = `jsonb_build_array(p.preset_code,p.asset_type_code,p.preset_version,p.prefix,p.separator,p.include_branch,p.include_building,p.include_floor,p.include_zone,p.include_distribution,p.include_housing,p.include_placement,p.context_mode,p.sequence_scope,p.seq_digits,p.custom_segment_1,p.custom_segment_1_label,p.custom_segment_2,p.custom_segment_2_label,p.description,p.active)`
const b3aPath = "../migrations/040_nomenclature_v2_initial_preset_catalog.sql"

type b3aQuerier interface {
	Query(string, ...interface{}) (*sql.Rows, error)
}

func b3aRows(t *testing.T, q b3aQuerier) []byte {
	t.Helper()
	rows, e := q.Query("SELECT " + b3aArray + " FROM public.system_naming_presets p ORDER BY asset_type_code COLLATE \"C\"")
	if e != nil {
		t.Fatal(e)
	}
	defer rows.Close()
	out := []json.RawMessage{}
	for rows.Next() {
		var raw []byte
		if e = rows.Scan(&raw); e != nil {
			t.Fatal(e)
		}
		var compact bytes.Buffer
		if e = json.Compact(&compact, raw); e != nil {
			t.Fatal(e)
		}
		out = append(out, json.RawMessage(compact.Bytes()))
	}
	if e = rows.Err(); e != nil {
		t.Fatal(e)
	}
	b, e := json.Marshal(out)
	if e != nil {
		t.Fatal(e)
	}
	return append(b, '\n')
}
func b3aSQL(t *testing.T) string {
	t.Helper()
	b, e := os.ReadFile(b3aPath)
	if e != nil {
		t.Fatal(e)
	}
	return string(b)
}
func b3aDB(t *testing.T, key string) *sql.DB {
	t.Helper()
	s := os.Getenv(key)
	if s == "" {
		t.Skip("disposable B3a PostgreSQL required")
	}
	if os.Getenv("B3A_DISPOSABLE") != "YES" {
		t.Fatal("explicit disposable harness required")
	}
	d, e := sql.Open("postgres", s)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { d.Close() })
	return d
}
func b3aExec(t *testing.T, db interface {
	Exec(string, ...interface{}) (sql.Result, error)
}, q string, args ...interface{}) {
	t.Helper()
	if _, e := db.Exec(q, args...); e != nil {
		t.Fatal(e)
	}
}
func b3aSnapshot(t *testing.T, q b3aQuerier) string {
	t.Helper()
	r, e := q.Query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('system_naming_presets','production_bootstrap_migrations') ORDER BY tablename")
	if e != nil {
		t.Fatal(e)
	}
	var names []string
	for r.Next() {
		var n string
		if e = r.Scan(&n); e != nil {
			t.Fatal(e)
		}
		names = append(names, n)
	}
	r.Close()
	var all strings.Builder
	for _, n := range names {
		rows, e := q.Query(`SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text FROM (SELECT to_jsonb(x) v FROM public."` + n + `" x) s`)
		if e != nil {
			t.Fatal(e)
		}
		rows.Next()
		var s string
		if e = rows.Scan(&s); e != nil {
			t.Fatal(e)
		}
		rows.Close()
		all.WriteString(n + ":" + s + "\n")
	}
	return all.String()
}
func TestB3aSourceContract(t *testing.T) {
	b, e := os.ReadFile("../docs/phase1_2f/B3_DEFINITION_CATALOG_CANONICAL.json")
	if e != nil {
		t.Fatal(e)
	}
	if fmt.Sprintf("%x", sha256.Sum256(b)) != b3aHash {
		t.Fatal("source hash")
	}
	var rows [][]interface{}
	if e = json.Unmarshal(b, &rows); e != nil || len(rows) != 12 {
		t.Fatal("matrix cardinality", e)
	}
	for _, r := range rows {
		if len(r) != 21 {
			t.Fatal("field count")
		}
		for i := 15; i <= 19; i++ {
			if r[i] != nil {
				t.Fatal("NULL metadata")
			}
		}
	}
	if !strings.Contains(b3aSQL(t), strings.TrimSpace(string(b))) {
		t.Fatal("migration diverges from exact JSON")
	}
}
func TestB3aMigrationConflictsAndRollback(t *testing.T) {
	db := b3aDB(t, "B3A_PRE039_ADMIN_DATABASE_URL")
	var n int
	if e := db.QueryRow("SELECT count(*) FROM system_naming_presets").Scan(&n); e != nil || n != 0 {
		t.Fatal("pre039 must have empty catalog", n, e)
	}
	for _, tc := range []struct{ name, change string }{
		{"preset_code", "jsonb_set(r,'{1}','\"UPS\"')"},
		{"type_version", "jsonb_set(r,'{0}','\"CONFLICT\"')"},
		{"active", "jsonb_set(r,'{20}','false')"},
		{"description_null_empty", "jsonb_set(r,'{19}','\"\"')"},
		{"label_null_empty", "jsonb_set(r,'{16}','\"\"')"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tx, e := db.Begin()
			if e != nil {
				t.Fatal(e)
			}
			defer tx.Rollback()
			// Reuse migration projection for one deliberately conflicting first row.
			s := b3aSQL(t)
			start := strings.Index(s, "INSERT INTO public.system_naming_presets")
			end := strings.Index(s[start:], ";") + start
			insert := s[start : end+1]
			b, _ := os.ReadFile("../docs/phase1_2f/B3_DEFINITION_CATALOG_CANONICAL.json")
			var rr []json.RawMessage
			json.Unmarshal(b, &rr)
			b3aExec(t, tx, "DO $fixture$ DECLARE r jsonb := '"+string(rr[0])+"'::jsonb; BEGIN r := "+tc.change+"; "+insert+" END $fixture$;")
			before := string(b3aRows(t, tx))
			state := b3aSnapshot(t, tx)
			b3aExec(t, tx, "SAVEPOINT attempt")
			if _, e = tx.Exec(b3aSQL(t)); e == nil {
				t.Fatal("conflict accepted")
			}
			b3aExec(t, tx, "ROLLBACK TO SAVEPOINT attempt")
			if before != string(b3aRows(t, tx)) || state != b3aSnapshot(t, tx) {
				t.Fatal("failure changed state")
			}
			if e = tx.QueryRow("SELECT count(*) FROM production_bootstrap_migrations WHERE path LIKE 'migrations/040_%'").Scan(&n); e != nil || n != 0 {
				t.Fatal("failure ledger", e)
			}
		})
	}
	t.Run("forced_mid_insert", func(t *testing.T) {
		tx, e := db.Begin()
		if e != nil {
			t.Fatal(e)
		}
		defer tx.Rollback()
		before := b3aSnapshot(t, tx)
		// Test-only trigger injects failure after five inserts, without editing 040.
		b3aExec(t, tx, `CREATE FUNCTION public.b3a_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (SELECT count(*) FROM system_naming_presets)>=5 THEN RAISE EXCEPTION 'injected sixth insert failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER b3a_fail BEFORE INSERT ON system_naming_presets FOR EACH ROW EXECUTE FUNCTION public.b3a_fail(); SAVEPOINT attempt`)
		if _, e = tx.Exec(b3aSQL(t)); e == nil || !strings.Contains(e.Error(), "injected sixth") {
			t.Fatal("injection not reached", e)
		}
		b3aExec(t, tx, "ROLLBACK TO SAVEPOINT attempt")
		if string(b3aRows(t, tx)) != "[]\n" || before != b3aSnapshot(t, tx) {
			t.Fatal("partial seed after rollback")
		}
	})
	t.Run("upgrade_zero_mutation", func(t *testing.T) {
		tx, e := db.Begin()
		if e != nil {
			t.Fatal(e)
		}
		defer tx.Rollback()
		// Nonempty legacy/custom/inactive tenant rules before publication.
		b3aExec(t, tx, `INSERT INTO tenants(id,name) VALUES('b3a00000-0000-4000-8000-000000000001','B3a upgrade');
INSERT INTO naming_rules(tenant_id,asset_type_code,prefix,source_type,active) VALUES
('b3a00000-0000-4000-8000-000000000001','UPS','LEG','LEGACY_UNATTRIBUTED',true),
('b3a00000-0000-4000-8000-000000000001','CCTV','CUSTOM','CUSTOM',true),
('b3a00000-0000-4000-8000-000000000001','NODE','OLD','CUSTOM',false)`)
		before := b3aSnapshot(t, tx)
		b3aExec(t, tx, b3aSQL(t))
		if before != b3aSnapshot(t, tx) {
			t.Fatal("tenant mutation")
		}
		if fmt.Sprintf("%x", sha256.Sum256(b3aRows(t, tx))) != b3aHash {
			t.Fatal("DB catalog hash")
		}
		first := string(b3aRows(t, tx))
		b3aExec(t, tx, b3aSQL(t))
		if first != string(b3aRows(t, tx)) || before != b3aSnapshot(t, tx) {
			t.Fatal("idempotency")
		}
	})
}
func assertB3aAcceptedMapping(t *testing.T, f *acceptanceFixture, rule, preset string) {
	t.Helper()
	if f.count(`SELECT count(*) FROM naming_rules r JOIN system_naming_presets p ON p.id=r.source_preset_id
WHERE r.id=$1 AND p.id=$2 AND r.source_type='PRESET' AND r.source_preset_version=p.preset_version
AND ROW(r.asset_type_code,r.prefix,r.separator,r.include_branch,r.include_site,r.include_floor,r.include_zone,r.include_distribution,r.include_housing,r.include_placement,r.context_mode,r.sequence_scope,r.seq_digits,r.custom_segment_1,r.custom_segment_1_label,r.custom_segment_2,r.custom_segment_2_label)
IS NOT DISTINCT FROM ROW(p.asset_type_code,p.prefix,p.separator,p.include_branch,p.include_building,p.include_floor,p.include_zone,p.include_distribution,p.include_housing,p.include_placement,p.context_mode,p.sequence_scope,p.seq_digits,p.custom_segment_1,p.custom_segment_1_label,p.custom_segment_2,p.custom_segment_2_label)
AND r.accepted_by=$3 AND r.accepted_by_snapshot=jsonb_build_object('schema_version',1,'user_id',$3::text,'tenant_id',$4::text,'role','admin','email',lower(trim((SELECT email FROM users WHERE id=$3))),'name','Matrix actor')`, rule, preset, f.actor, f.tenant) != 1 {
		t.Fatal("lossless mapping/exact actor snapshot")
	}
}
func TestB3aSeededOperationalMatrix(t *testing.T) {
	admin := b3aDB(t, "NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL")
	if fmt.Sprintf("%x", sha256.Sum256(b3aRows(t, admin))) != b3aHash {
		t.Fatal("actual migration seed required")
	}
	t.Log("DB_CATALOG_HASH=" + b3aHash)
	if _, err := admin.Exec("UPDATE system_naming_presets SET prefix='INVALID' WHERE preset_code='MDF_V1'"); err == nil {
		t.Fatal("published structural mutation accepted")
	}
	b2dPresetOperationalMatrix(t, true, func(f *acceptanceFixture) {
		if rows, err := f.runtime.Query("SELECT * FROM system_naming_presets"); err == nil {
			rows.Close()
			t.Fatal("runtime direct preset SELECT allowed")
		}
		before := b3aSnapshot(t, admin)
		b3aExec(t, admin, b3aSQL(t))
		if before != b3aSnapshot(t, admin) {
			t.Fatal("issued rules/assets/counters/audit/physical delta")
		}
		ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
		tx, e := BeginAuthenticatedTenantTx(ctx, f.runtime, f.tenant, f.branch, f.actor)
		if e != nil {
			t.Fatal(e)
		}
		defer tx.Rollback()
		var count int
		types := "'{MDF,IDF,RACK,SWITCH,UPS,PDU,PATCH_PANEL,NODE,FIREWALL,SERVER,CCTV,AC_UNIT}'::text[]"
		if e = tx.QueryRow("SELECT count(*) FROM read_active_system_naming_presets(" + types + ")").Scan(&count); e != nil || count != 0 {
			t.Fatal("V1 guard", count, e)
		}
		if e = tx.QueryRow("SELECT count(*) FROM read_active_system_naming_presets_v2(" + types + ")").Scan(&count); e != nil || count != 12 {
			t.Fatal("V2 count", count, e)
		}
		for _, code := range []string{"MDF", "IDF", "RACK", "SWITCH", "UPS", "PDU", "PATCH_PANEL", "NODE", "FIREWALL", "SERVER", "CCTV", "AC_UNIT"} {
			var s string
			if e = tx.QueryRow("SELECT lookup_status FROM read_system_naming_preset_v2($1,1)", code).Scan(&s); e != nil || s != "FOUND_ACTIVE" {
				t.Fatal(code, s, e)
			}
		}
		var status string
		if e = tx.QueryRow("SELECT lookup_status FROM read_system_naming_preset_v2('UPS',999)").Scan(&status); e != nil || status != "NOT_FOUND" {
			t.Fatal(status, e)
		}
		tx.Rollback()
		acceptedState := f.state()
		b3aExec(t, admin, "UPDATE system_naming_presets SET active=false WHERE preset_code='SERVER_V1'")
		defer b3aExec(t, admin, "UPDATE system_naming_presets SET active=true WHERE preset_code='SERVER_V1'")
		if f.count("SELECT count(*) FROM read_active_system_naming_presets_v2(ARRAY['SERVER'])") != 0 {
			t.Fatal("inactive exposed")
		}
		if e = admin.QueryRow("SELECT lookup_status FROM read_system_naming_preset_v2('SERVER',1)").Scan(&status); e != nil || status != "FOUND_INACTIVE" {
			t.Fatal(status, e)
		}
		fresh := newAcceptanceFixture(t, admin, f.runtime, uuid.NewString(), uuid.NewString())
		result, e := fresh.invoke(fresh.actor, false, 1, uuid.NewString())
		if e == nil {
			t.Fatalf("inactive acceptance permitted: %+v", result)
		}
		// The accepted operational tenant remains unchanged, including issued codes.
		if acceptedState != f.state() {
			t.Fatal("deactivation changed accepted rules/assets/provenance/audit")
		}
		if f.count("SELECT count(*) FROM naming_rules WHERE tenant_id=$1 AND asset_type_code='SERVER' AND active AND source_type='PRESET'", f.tenant) != 1 {
			t.Fatal("accepted rule lost")
		}
		t.Log("SEEDED_PREVIEW=12 SEEDED_ACCEPTANCE=12 ZONE_DISTRIBUTION_HOUSING_ISSUANCE=PASS")
	})
	t.Run("populated_post039_upgrade", b3aPopulatedPost039Upgrade)
}
