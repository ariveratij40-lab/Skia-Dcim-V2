package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
)

const localDevelopmentDSN = "postgres://skia:skia@localhost:5432/skia_db?sslmode=disable"

func databaseDSNsFromEnv() (runtimeDSN, migratorDSN string, requireRestricted bool, err error) {
	runtimeDSN = os.Getenv("DATABASE_URL")
	migratorDSN = os.Getenv("MIGRATOR_DATABASE_URL")
	requireRestricted = os.Getenv("SKIA_REQUIRE_RESTRICTED_RUNTIME_DB") == "true"

	if runtimeDSN == "" {
		if requireRestricted {
			return "", "", true, errors.New("DATABASE_URL is required when restricted runtime gate is enabled")
		}
		runtimeDSN = localDevelopmentDSN
	}
	if migratorDSN == "" {
		if requireRestricted {
			return "", "", true, errors.New("MIGRATOR_DATABASE_URL is required when restricted runtime gate is enabled")
		}
		migratorDSN = runtimeDSN
	}
	if requireRestricted && runtimeDSN == migratorDSN {
		return "", "", true, errors.New("runtime and migrator database identities must be configured separately")
	}
	return runtimeDSN, migratorDSN, requireRestricted, nil
}

type runtimeRoleState struct {
	RoleName               string
	Superuser              bool
	BypassRLS              bool
	OwnsProtectedTables    bool
	InheritsPrivilegedRole bool
}

func validateRuntimeRoleState(state runtimeRoleState) error {
	if state.RoleName == "" {
		return errors.New("runtime role identity is empty")
	}
	if state.Superuser || state.BypassRLS || state.OwnsProtectedTables || state.InheritsPrivilegedRole {
		return fmt.Errorf("runtime role %q does not satisfy restricted-role requirements", state.RoleName)
	}
	return nil
}

func validateRestrictedRuntimeDB(database *sql.DB) error {
	const query = `
		WITH RECURSIVE inherited(roleid) AS (
			SELECT roleid FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
			UNION
			SELECT m.roleid FROM pg_auth_members m JOIN inherited i ON m.member = i.roleid
		)
		SELECT current_user,
		       current_setting('is_superuser') = 'on',
		       r.rolbypassrls,
		       EXISTS (
			 SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
			 WHERE n.nspname='public' AND c.relname IN ('assets','asset_logs','asset_relationships')
			   AND c.relowner=r.oid
		       ),
		       EXISTS (
			 SELECT 1 FROM inherited i JOIN pg_roles inherited_role ON inherited_role.oid=i.roleid
			 WHERE inherited_role.rolsuper OR inherited_role.rolbypassrls
		       )
		FROM pg_roles r WHERE r.rolname=current_user`
	var state runtimeRoleState
	if err := database.QueryRow(query).Scan(
		&state.RoleName,
		&state.Superuser,
		&state.BypassRLS,
		&state.OwnsProtectedTables,
		&state.InheritsPrivilegedRole,
	); err != nil {
		return fmt.Errorf("cannot inspect runtime role: %w", err)
	}
	return validateRuntimeRoleState(state)
}
