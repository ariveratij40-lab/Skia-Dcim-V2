package main

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"testing"
)

func TestB2dSecurityMatrix(t *testing.T) {
	a, r := b2dStressDB(t)
	f := newAcceptanceFixture(t, a, r, uuid.NewString(), uuid.NewString())
	g := newAcceptanceFixture(t, a, r, uuid.NewString(), uuid.NewString())
	type physical struct {
		tenant, branch, actor, zone, building, floor string
		parent                                       canonicalParentFixture
	}
	var refs []physical
	for _, owner := range []*acceptanceFixture{f, g} {
		for i := 0; i < 2; i++ {
			branch := owner.branch
			if i == 1 {
				branch = uuid.NewString()
				owner.exec(`INSERT INTO branches(id,tenant_id,code,name,status) VALUES($1,$2,'SECOND','Second','active')`, branch, owner.tenant)
			}
			tx, e := a.Begin()
			if e != nil {
				t.Fatal(e)
			}
			p := setupCanonicalParentFixture(t, tx, owner.tenant, branch, owner.actor, i == 1)
			if e = tx.Commit(); e != nil {
				t.Fatal(e)
			}
			x := physical{tenant: owner.tenant, branch: branch, actor: owner.actor, parent: p}
			if e = a.QueryRow(`SELECT z.id,z.building_id,z.floor_id FROM locations l JOIN zones z ON z.id=l.zone_id WHERE l.id=$1`, p.LocationID).Scan(&x.zone, &x.building, &x.floor); e != nil {
				t.Fatal(e)
			}
			refs = append(refs, x)
		}
	}
	for _, viewer := range refs {
		for _, target := range refs {
			ctx := withTenantIdentity(context.Background(), viewer.actor, viewer.tenant, viewer.branch)
			tx, e := BeginAuthenticatedTenantTx(ctx, r, viewer.tenant, viewer.branch, viewer.actor)
			if e != nil {
				t.Fatal(e)
			}
			scope := PhysicalScope{TenantID: viewer.tenant, BranchID: viewer.branch}
			allowed := viewer.tenant == target.tenant && viewer.branch == target.branch
			checks := []error{}
			_, e = ResolveCanonicalZone(ctx, tx, scope, target.zone)
			checks = append(checks, e)
			_, e = ResolveDistributionPoint(ctx, tx, scope, target.parent.DistributionID, false)
			checks = append(checks, e)
			_, e = ResolveDistributionPoint(ctx, tx, scope, target.parent.IDFDistributionID, false)
			checks = append(checks, e)
			_, e = ResolveHousing(ctx, tx, scope, target.parent.RackID)
			checks = append(checks, e)
			_, e = ResolveAssetPlacement(ctx, tx, AssetPlacementContext{TenantID: viewer.tenant, BranchID: viewer.branch, PlacementID: target.parent.LocationID})
			checks = append(checks, e)
			for _, e := range checks {
				if (e == nil) != allowed {
					tx.Rollback()
					t.Fatalf("physical isolation allowed=%v err=%v", allowed, e)
				}
			}
			for _, entry := range []struct{ table, id string }{{"buildings", target.building}, {"floors", target.floor}, {"mdf_idf", target.parent.DistributionID}, {"racks", target.parent.RackID}, {"locations", target.parent.LocationID}} {
				var n int
				if e = tx.QueryRow(`SELECT count(*) FROM `+entry.table+` WHERE id=$1`, entry.id).Scan(&n); e != nil {
					tx.Rollback()
					t.Fatal(e)
				}
				if (n == 1) != allowed {
					tx.Rollback()
					t.Fatalf("RLS %s allowed=%v visible=%d", entry.table, allowed, n)
				}
			}
			var rules int
			if e = tx.QueryRow(`SELECT count(*) FROM naming_rules WHERE tenant_id=$1`, target.tenant).Scan(&rules); e != nil {
				t.Fatal(e)
			}
			if (rules > 0) != (viewer.tenant == target.tenant) {
				t.Fatal("tenant-wide naming rule scope changed")
			}
			for _, table := range []string{"nomenclature_branch_counters", "nomenclature_counters"} {
				var visible int
				if e = tx.QueryRow(`SELECT count(*) FROM `+table+` WHERE tenant_id=$1 AND branch_id=$2`, target.tenant, target.branch).Scan(&visible); e != nil {
					t.Fatal(e)
				}
				if (visible > 0) != allowed {
					t.Fatalf("counter isolation %s allowed=%v visible=%d", table, allowed, visible)
				}
			}
			tx.Rollback()
		}
	}
	t.Log("TWO_TENANTS_FOUR_BRANCHES_PHYSICAL_AND_RULE_READS=PASS")
	// GUC and DB-backed actor authority are independent of client role claims.
	for _, kind := range []string{"supplied_actor", "supplied_tenant", "client_role_super_admin", "missing_guc", "wrong_guc", "inactive", "removed_membership", "viewer", "admin", "super_admin", "dual"} {
		t.Run(kind, func(t *testing.T) {
			x := newAcceptanceFixture(t, a, r, uuid.NewString(), uuid.NewString())
			actor := x.actor
			if kind == "viewer" || kind == "client_role_super_admin" {
				actor = x.viewer
			}
			if kind == "super_admin" {
				actor = x.super
			}
			if kind == "dual" {
				actor = x.dual
			}
			if kind == "inactive" {
				x.exec(`UPDATE users SET status='inactive' WHERE id=$1`, actor)
			}
			if kind == "removed_membership" {
				x.exec(`DELETE FROM user_tenants WHERE user_id=$1 AND tenant_id=$2`, actor, x.tenant)
			}
			ctx := withTenantIdentity(context.Background(), actor, x.tenant, x.branch)
			tx, e := BeginAuthenticatedTenantTx(ctx, r, x.tenant, x.branch, actor)
			if e != nil {
				t.Fatal(e)
			}
			defer tx.Rollback()
			if kind == "missing_guc" {
				_, e = tx.Exec(`SELECT set_config('app.user_id','',true)`)
			}
			if kind == "wrong_guc" {
				_, e = tx.Exec(`SELECT set_config('app.user_id',$1,true)`, x.viewer)
			}
			if e != nil {
				t.Fatal(e)
			}
			tenantArg, actorArg := x.tenant, actor
			if kind == "supplied_actor" {
				actorArg = x.super
			}
			if kind == "supplied_tenant" {
				tenantArg = g.tenant
			}
			input := AcceptPresetInput{AssetTypeCode: "UPS", PresetVersion: 1, OperationID: uuid.NewString()}
			if kind == "client_role_super_admin" {
				if e = json.Unmarshal([]byte(`{"role":"super_admin"}`), &input); e != nil {
					t.Fatal(e)
				}
			}
			_, e = AcceptNomenclaturePreset(ctx, tx, tenantArg, actorArg, input)
			allowed := kind == "admin" || kind == "super_admin" || kind == "dual"
			if allowed && e != nil {
				t.Fatal(e)
			}
			if !allowed && e == nil {
				t.Fatalf("B2D_PRODUCT_DEFECT actor spoof %s accepted", kind)
			}
			if kind == "dual" {
				resolved, e := resolveNomenclatureActor(ctx, tx, x.tenant, actor)
				if e != nil || resolved.Role != "super_admin" {
					t.Fatal("dual role", e)
				}
			}
		})
	}
}
