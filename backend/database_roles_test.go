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
	if _, _, _, err := databaseDSNsFromEnv(); err == nil {
		t.Fatal("missing restricted runtime configuration should fail")
	}

	t.Setenv("DATABASE_URL", "runtime-dsn")
	t.Setenv("MIGRATOR_DATABASE_URL", "runtime-dsn")
	if _, _, _, err := databaseDSNsFromEnv(); err == nil {
		t.Fatal("same runtime/migrator DSN should fail under restricted gate")
	}
}

func TestDatabaseDSNsSeparateConnections(t *testing.T) {
	t.Setenv("SKIA_REQUIRE_RESTRICTED_RUNTIME_DB", "true")
	t.Setenv("DATABASE_URL", "runtime-dsn")
	t.Setenv("MIGRATOR_DATABASE_URL", "migrator-dsn")
	runtime, migrator, restricted, err := databaseDSNsFromEnv()
	if err != nil || !restricted || runtime != "runtime-dsn" || migrator != "migrator-dsn" {
		t.Fatalf("unexpected configuration: runtime=%q migrator=%q restricted=%v err=%v", runtime, migrator, restricted, err)
	}
}
