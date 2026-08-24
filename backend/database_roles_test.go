package main

import (
	"testing"
)

func TestValidateRuntimeRoleState(t *testing.T) {
	valid := runtimeRoleState{RoleName: "skia_runtime"}
	if err := validateRuntimeRoleState(valid); err != nil {
		t.Fatalf("restricted role should pass: %v", err)
	}

	cases := []runtimeRoleState{
		{RoleName: "skia_user", Superuser: true},
		{RoleName: "runtime_bypass", BypassRLS: true},
		{RoleName: "runtime_owner", OwnsProtectedTables: true},
		{RoleName: "runtime_inherited", InheritsPrivilegedRole: true},
	}
	for _, state := range cases {
		if err := validateRuntimeRoleState(state); err == nil {
			t.Errorf("unsafe role %q was accepted", state.RoleName)
		}
	}
}

func TestDatabaseDSNsRestrictedGateFailsClosed(t *testing.T) {
	t.Setenv("SKIA_REQUIRE_RESTRICTED_RUNTIME_DB", "true")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("MIGRATOR_DATABASE_URL", "")
	t.Setenv("ONBOARDING_DATABASE_URL", "")
	if _, _, _, _, err := databaseDSNsFromEnv(); err == nil {
		t.Fatal("missing restricted runtime configuration should fail")
	}

	t.Setenv("DATABASE_URL", "runtime-dsn")
	t.Setenv("MIGRATOR_DATABASE_URL", "migrator-dsn")
	if _, _, _, _, err := databaseDSNsFromEnv(); err == nil {
		t.Fatal("missing onboarding DSN should fail under restricted gate")
	}
}

func TestDatabaseDSNsSeparateConnections(t *testing.T) {
	t.Setenv("SKIA_REQUIRE_RESTRICTED_RUNTIME_DB", "true")
	t.Setenv("DATABASE_URL", "runtime-dsn")
	t.Setenv("MIGRATOR_DATABASE_URL", "migrator-dsn")
	t.Setenv("ONBOARDING_DATABASE_URL", "onboarding-dsn")
	runtime, migrator, onboarding, restricted, err := databaseDSNsFromEnv()
	if err != nil || !restricted || runtime != "runtime-dsn" || migrator != "migrator-dsn" || onboarding != "onboarding-dsn" {
		t.Fatalf("unexpected configuration: runtime=%q migrator=%q onboarding=%q restricted=%v err=%v", runtime, migrator, onboarding, restricted, err)
	}
}

func TestDatabaseDSNsRejectEveryRestrictedIdentityCollision(t *testing.T) {
	t.Setenv("SKIA_REQUIRE_RESTRICTED_RUNTIME_DB", "true")
	for _, test := range []struct {
		name                          string
		runtime, migrator, onboarding string
	}{
		{name: "runtime migrator", runtime: "same", migrator: "same", onboarding: "onboarding"},
		{name: "runtime onboarding", runtime: "same", migrator: "migrator", onboarding: "same"},
		{name: "migrator onboarding", runtime: "runtime", migrator: "same", onboarding: "same"},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("DATABASE_URL", test.runtime)
			t.Setenv("MIGRATOR_DATABASE_URL", test.migrator)
			t.Setenv("ONBOARDING_DATABASE_URL", test.onboarding)
			if _, _, _, _, err := databaseDSNsFromEnv(); err == nil {
				t.Fatal("colliding restricted identities should fail")
			}
		})
	}
}

func TestValidateOnboardingRoleState(t *testing.T) {
	if err := validateOnboardingRoleState(onboardingRoleState{RoleName: "skia_onboarding"}); err != nil {
		t.Fatalf("least-privilege onboarding role should pass: %v", err)
	}
	unsafe := []onboardingRoleState{
		{RoleName: "skia_runtime"},
		{RoleName: "skia_onboarding", Superuser: true},
		{RoleName: "skia_onboarding", CreateDB: true},
		{RoleName: "skia_onboarding", CreateRole: true},
		{RoleName: "skia_onboarding", BypassRLS: true},
		{RoleName: "skia_onboarding", InheritsPrivilegedRole: true},
		{RoleName: "skia_onboarding", MissingRequiredGrants: true},
		{RoleName: "skia_onboarding", UnexpectedTableGrants: true},
	}
	for _, state := range unsafe {
		if err := validateOnboardingRoleState(state); err == nil {
			t.Fatalf("unsafe onboarding state was accepted: %#v", state)
		}
	}
}
