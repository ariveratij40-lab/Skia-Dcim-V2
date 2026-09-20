package main

import (
	"bytes"
	"context"
	"github.com/google/uuid"
	"net/http/httptest"
	"testing"
)

// Execute the historical 014 SERVER policy shape and the 033 zone policy
// against the current database; never attribute or rewrite historical rules.
func TestB2dLegacyCompatibility(t *testing.T) {
	a, r := b2dStressDB(t)
	f := newAcceptanceFixture(t, a, r, uuid.NewString(), uuid.NewString())
	rule := uuid.NewString()
	f.exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_location,seq_digits,reset_per_location,last_seq) VALUES($1,$2,'SERVER','SRV','-',true,false,4,false,0)`, rule, f.tenant)
	building, zone := uuid.NewString(), uuid.NewString()
	f.exec(`INSERT INTO buildings(id,tenant_id,branch_id,code,name,status) VALUES($1,$2,$3,'LEG','Legacy','active')`, building, f.tenant, f.branch)
	f.exec(`INSERT INTO zones(id,tenant_id,branch_id,building_id,code,name,status) VALUES($1,$2,$3,$4,'Z01','Legacy','active')`, zone, f.tenant, f.branch, building)
	// The 033 default is canonical Zone, not an accepted system preset.
	f.exec(`INSERT INTO naming_rules(tenant_id,asset_type_code,prefix,separator,include_branch,include_zone,context_mode,seq_digits) SELECT $1,kind,kind,'-',true,true,'CANONICAL_ZONE',3 FROM (VALUES ('MDF'),('IDF')) AS kinds(kind)`, f.tenant)
	before := f.state()
	ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
	tx, e := BeginAuthenticatedTenantTx(ctx, r, f.tenant, f.branch, f.actor)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback()
	for _, code := range []string{"SERVER", "MDF", "IDF"} {
		preview, e := PreviewCanonicalNomenclature(ctx, tx, CanonicalNomenclatureInput{TenantID: f.tenant, BranchID: f.branch, AssetTypeCode: code, ZoneID: zone})
		if e != nil || preview.SequenceReserved {
			t.Fatalf("legacy preview %s: %+v %v", code, preview, e)
		}
		t.Logf("LEGACY_%s_PREVIEW=%s", code, preview.IllustrativeCode)
	}
	if _, e = ReadActiveSystemNamingPresets(ctx, tx, []string{"SERVER", "MDF", "IDF"}); e != nil {
		t.Fatal(e)
	}
	for _, method := range []string{"GET", "POST", "PUT"} {
		req := httptest.NewRequest(method, "/api/dcim/naming-rules", bytes.NewBufferString(`{"asset_type_code":"SERVER","prefix":"NO_WRITE"}`)).WithContext(withTenantDB(ctx, tx))
		out := httptest.NewRecorder()
		(&DCIMHandler{}).HandleNamingRules(out, req)
		expected := 409
		if method == "GET" {
			expected = 200
		}
		if out.Code != expected {
			t.Fatalf("%s status=%d body=%s", method, out.Code, out.Body.String())
		}
	}
	tx.Rollback()
	if before != f.state() {
		t.Fatal("legacy reads/blocked writes changed history")
	}
	if f.count(`SELECT count(*) FROM naming_rules WHERE tenant_id=$1 AND source_type<>'LEGACY_UNATTRIBUTED'`, f.tenant) != 0 {
		t.Fatal("automatic attribution")
	}
	t.Log("LEGACY_014_POLICY_033_POLICY_READ_PREVIEW_NO_RENAME_NO_REISSUE=PASS; CURRENT_POST_PUT=409")
}
