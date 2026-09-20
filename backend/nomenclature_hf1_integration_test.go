package main

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
)

// A new transaction must replay the original customization, not append another
// successor whose audit points at the first result.
func assertHF1CustomizationRetry(t *testing.T, f *acceptanceFixture) {
	f.accept(101)
	op := uuid.NewString()
	first, err := f.invoke(f.actor, true, 0, op)
	if err != nil {
		t.Fatal(err)
	}
	before := f.state()
	retry, err := f.invoke(f.actor, true, 0, op)
	if err != nil {
		t.Fatal(err)
	}
	if retry != first || f.state() != before {
		t.Fatalf("retry changed authority: first=%+v retry=%+v customization_audits=%d", first, retry, f.audit("NOMENCLATURE_RULE_CUSTOMIZED"))
	}
}

func hf1Customize(t *testing.T, f *acceptanceFixture, op string, p CanonicalNomenclaturePolicy) (NomenclatureDomainResult, error) {
	t.Helper()
	// A brand new connection pool on every invocation proves durable replay.
	db, err := sql.Open("postgres", os.Getenv("NOMENCLATURE_ACCEPTANCE_RUNTIME_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
	tx, err := BeginAuthenticatedTenantTx(ctx, db, f.tenant, f.branch, f.actor)
	if err != nil {
		return NomenclatureDomainResult{}, err
	}
	defer tx.Rollback()
	r, err := CustomizeNomenclatureRule(ctx, tx, f.tenant, f.actor, CustomizeNomenclatureInput{AssetTypeCode: "SERVER", OperationID: op, Policy: p})
	if err != nil {
		return r, err
	}
	return r, tx.Commit()
}

func assertHF1LabelsAndConflicts(t *testing.T, f *acceptanceFixture, segments [4]string) {
	f.accept(101)
	p := CanonicalNomenclaturePolicy{AssetTypeCode: "SERVER", Prefix: "CUSTOM", Separator: "-", SequenceDigits: 3, ContextMode: NomenclatureContextLegacyInternalArea, SequenceScope: NomenclatureSequenceBranch, CustomSegment1: segments[0], CustomSegment1Label: segments[1], CustomSegment2: segments[2], CustomSegment2Label: segments[3]}
	op := uuid.NewString()
	first, err := hf1Customize(t, f, op, p)
	if err != nil {
		t.Fatal(err)
	}
	var got [4]string
	if err = f.admin.QueryRow(`SELECT COALESCE(custom_segment_1,''),COALESCE(custom_segment_1_label,''),COALESCE(custom_segment_2,''),COALESCE(custom_segment_2_label,'') FROM naming_rules WHERE id=$1`, first.RuleID).Scan(&got[0], &got[1], &got[2], &got[3]); err != nil || got != segments {
		t.Fatalf("labels=%q want=%q err=%v", got, segments, err)
	}
	before := f.state()
	retry, err := hf1Customize(t, f, op, p)
	if err != nil || retry != first || before != f.state() {
		t.Fatalf("durable retry=%+v first=%+v err=%v", retry, first, err)
	}
	p.CustomSegment1Label += " conflicting"
	_, err = hf1Customize(t, f, op, p)
	if !errors.Is(err, ErrNomenclatureConflict) || before != f.state() {
		t.Fatalf("conflict mutated state: %v", err)
	}
	if f.count(`SELECT count(*) FROM naming_rules WHERE tenant_id=$1 AND asset_type_code='SERVER'`, f.tenant) != 2 || f.audit("NOMENCLATURE_RULE_CUSTOMIZED") != 1 {
		t.Fatal("duplicate successor/audit")
	}
	f.lineage()
	// The secure writer itself must reject rebinding even if called without the
	// domain replay check. Each attempt has its own rollback boundary.
	p.CustomSegment1Label = segments[1]
	fingerprint, err := customizationFingerprint(p)
	if err != nil {
		t.Fatal(err)
	}
	for _, mismatch := range []string{"result", "preset", "action", "fingerprint"} {
		ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
		tx, e := BeginAuthenticatedTenantTx(ctx, f.runtime, f.tenant, f.branch, f.actor)
		if e != nil {
			t.Fatal(e)
		}
		rule, preset, action, hash := first.RuleID, f.p1, "NOMENCLATURE_RULE_CUSTOMIZED", fingerprint
		switch mismatch {
		case "result":
			rule = uuid.NewString()
		case "preset":
			preset = uuid.NewString()
		case "action":
			action = "NOMENCLATURE_PRESET_ACCEPTED"
		case "fingerprint":
			hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
		}
		var event string
		e = tx.QueryRowContext(ctx, `SELECT public.write_nomenclature_onboarding_audit($1::uuid,$2::uuid,$3::uuid,$4::public.nomenclature_onboarding_audit_action,$5)`, op, rule, preset, action, hash).Scan(&event)
		_ = tx.Rollback()
		if e == nil || before != f.state() {
			t.Fatalf("writer accepted %s rebinding", mismatch)
		}
	}
}
