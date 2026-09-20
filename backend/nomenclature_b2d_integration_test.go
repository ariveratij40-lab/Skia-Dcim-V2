package main

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
)

// B2d tests the approved UPS_V1 policy through the existing operational writer,
// not just a builder supplied with context that the real writer never passes.
func TestB2dUPSCanonicalZoneOperationalPostgreSQL16(t *testing.T) {
	adminURL, runtimeURL := os.Getenv("NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL"), os.Getenv("NOMENCLATURE_ACCEPTANCE_RUNTIME_DATABASE_URL")
	if adminURL == "" || runtimeURL == "" {
		t.Skip("B2d requires disposable PostgreSQL URLs")
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
	f.exec(`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$2,'TIJ','B2d TIJ','active')`, f.branch, f.tenant)
	preset := uuid.NewString()
	f.exec(`INSERT INTO system_naming_presets(id,preset_code,asset_type_code,preset_version,prefix,separator,include_branch,include_zone,context_mode,sequence_scope,seq_digits,active) VALUES($1,'UPS_V1','UPS',1,'UPS','-',true,true,'CANONICAL_ZONE','BRANCH',4,true)`, preset)
	// The enclosing disposable database is removed by the harness; don't delete
	// a referenced preset or rewrite immutable rules to make fixture cleanup pass.
	setup, err := admin.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer setup.Rollback()
	parent := setupCanonicalParentFixture(t, setup, f.tenant, f.branch, f.actor)
	if err = setup.Commit(); err != nil {
		t.Fatal(err)
	}
	var zone string
	if err = admin.QueryRow(`SELECT zone_id FROM locations WHERE id=$1`, parent.LocationID).Scan(&zone); err != nil {
		t.Fatal(err)
	}
	f.exec(`UPDATE zones SET code='Z01' WHERE id=$1`, zone)
	ctx := withTenantIdentity(context.Background(), f.actor, f.tenant, f.branch)
	tx, err := BeginAuthenticatedTenantTx(ctx, runtime, f.tenant, f.branch, f.actor)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	exact, err := ReadExactSystemNamingPresetV2(ctx, tx, "UPS", 1)
	if err != nil || exact.ID != preset {
		t.Fatalf("exact preset: %+v %v", exact, err)
	}
	accepted, err := AcceptNomenclaturePreset(ctx, tx, f.tenant, f.actor, AcceptPresetInput{AssetTypeCode: "UPS", PresetVersion: 1, OperationID: uuid.NewString()})
	if err != nil || accepted.Status != NomenclatureSuccessCreated {
		t.Fatalf("accept: %+v %v", accepted, err)
	}
	preview, err := PreviewCanonicalNomenclature(ctx, tx, CanonicalNomenclatureInput{TenantID: f.tenant, BranchID: f.branch, AssetTypeCode: "UPS", ZoneID: zone})
	if err != nil || preview.IllustrativeCode != "UPS-TIJ-Z01-0001" || preview.SequenceReserved {
		t.Fatalf("preview: %+v %v", preview, err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if f.count(`SELECT count(*) FROM nomenclature_branch_counters WHERE nomenclature_id=$1`, accepted.RuleID) != 0 {
		t.Fatal("preview reserved sequence")
	}
	t.Logf("EXACT_PRESET=PASS ACCEPTANCE=PASS PREVIEW=%s COUNTER_DELTA=0", preview.IllustrativeCode)
	token := "b2d-test-only-" + uuid.NewString()
	f.exec(`INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)`, f.actor, f.branch)
	f.exec(`INSERT INTO sessions(id,user_id,tenant_id,branch_id,token,expires_at) VALUES($1,$2,$3,$4,$5,4102444800)`, uuid.NewString(), f.actor, f.tenant, f.branch, token)
	before := f.state()
	body := fmt.Sprintf(`{"name":"B2d UPS","device_type":"ups","mount_mode":"ROOM_MOUNTED","placement_id":%q}`, parent.LocationID)
	req := httptest.NewRequest(http.MethodPost, "/api/infra/ups-pdus", bytes.NewBufferString(body))
	req.AddCookie(&http.Cookie{Name: "session_token", Value: token})
	response := httptest.NewRecorder()
	RequireTenantTx(runtime, handleUpsPdus)(response, req)
	if response.Code != http.StatusCreated {
		if before != f.state() || f.count(`SELECT count(*) FROM nomenclature_branch_counters WHERE nomenclature_id=$1`, accepted.RuleID) != 0 {
			t.Fatal("failed writer left partial state")
		}
		// Diagnose the same server-side chain without changing product code or
		// bypassing runtime privileges. Always roll back this diagnostic call.
		diagnostic, e := BeginAuthenticatedTenantTx(ctx, runtime, f.tenant, f.branch, f.actor)
		if e != nil {
			t.Fatal(e)
		}
		housing, housingErr := ResolveCanonicalHousing(ctx, diagnostic, PhysicalScope{TenantID: f.tenant, BranchID: f.branch}, CanonicalHousingRequest{AssetTypeCode: "UPS", MountMode: "ROOM_MOUNTED", PlacementID: parent.LocationID})
		_, issuanceErr := reserveManagedAsset(diagnostic, f.tenant, f.branch, f.actor, managedAssetInput{AssetTypeCode: "UPS", Name: "Diagnostic UPS", PlacementID: housing.LocationID, DistributionID: housing.DistributionPointID, MountMode: housing.MountMode, HousingRackID: housing.HousingRackID})
		diagnostic.Rollback()
		t.Logf("HOUSING_RESOLUTION_ERROR=%v MANAGED_ISSUANCE_ERROR=%v", housingErr, issuanceErr)
		t.Fatalf("B2D_PRODUCT_DEFECT: accepted canonical UPS preset cannot issue through existing handler: HTTP=%d body=%s; rule/assets/audit unchanged, counter delta=0", response.Code, response.Body.String())
	}
	assertB2dHF1OperationalContexts(t, f, parent, zone, token, accepted, response)
}
