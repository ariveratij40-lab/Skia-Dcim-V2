package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
)

const localDevelopmentDSN = "postgres://skia:skia@localhost:5432/skia_db?sslmode=disable"

func databaseDSNsFromEnv() (runtimeDSN, migratorDSN, onboardingDSN string, requireRestricted bool, err error) {
	runtimeDSN = os.Getenv("DATABASE_URL")
	migratorDSN = os.Getenv("MIGRATOR_DATABASE_URL")
	onboardingDSN = os.Getenv("ONBOARDING_DATABASE_URL")
	requireRestricted = os.Getenv("SKIA_REQUIRE_RESTRICTED_RUNTIME_DB") == "true"

	if runtimeDSN == "" {
		if requireRestricted {
			return "", "", "", true, errors.New("DATABASE_URL is required when restricted runtime gate is enabled")
		}
		runtimeDSN = localDevelopmentDSN
	}
	if migratorDSN == "" {
		if requireRestricted {
			return "", "", "", true, errors.New("MIGRATOR_DATABASE_URL is required when restricted runtime gate is enabled")
		}
		migratorDSN = runtimeDSN
	}
	if onboardingDSN == "" {
		if requireRestricted {
			return "", "", "", true, errors.New("ONBOARDING_DATABASE_URL is required when restricted runtime gate is enabled")
		}
		onboardingDSN = runtimeDSN
	}
	if requireRestricted && (runtimeDSN == migratorDSN || runtimeDSN == onboardingDSN || migratorDSN == onboardingDSN) {
		return "", "", "", true, errors.New("runtime, migrator, and onboarding database identities must be configured separately")
	}
	return runtimeDSN, migratorDSN, onboardingDSN, requireRestricted, nil
}

type runtimeRoleState struct {
	RoleName               string
	Superuser              bool
	CreateDB               bool
	CreateRole             bool
	BypassRLS              bool
	OwnsProtectedTables    bool
	InheritsPrivilegedRole bool
	MissingRequiredGrants  bool
	UnexpectedTableGrants  bool
	UnsafeProtectedGrants  bool
}

func validateRuntimeRoleState(state runtimeRoleState) error {
	if state.RoleName != "skia_runtime" {
		return fmt.Errorf("runtime database identity must be skia_runtime, got %q", state.RoleName)
	}
	if state.Superuser || state.CreateDB || state.CreateRole || state.BypassRLS || state.OwnsProtectedTables || state.InheritsPrivilegedRole || state.MissingRequiredGrants || state.UnexpectedTableGrants || state.UnsafeProtectedGrants {
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
		), required(table_name, privilege_type) AS (
			VALUES ('users','SELECT'),('user_tenants','SELECT'),('tenants','SELECT'),
			       ('user_branches','SELECT'),('branches','SELECT'),
		       ('sessions','SELECT'),('sessions','INSERT'),('sessions','UPDATE'),('sessions','DELETE'),
		       ('user_roles','SELECT'),('roles','SELECT'),
		       ('role_permissions','SELECT'),('permissions','SELECT'),
		       ('asset_types','SELECT'),('naming_rules','SELECT'),('naming_rules','INSERT'),('naming_rules','UPDATE'),
		       ('locations','SELECT'),('locations','INSERT'),('locations','UPDATE'),
		       ('nomenclature_counters','SELECT'),('nomenclature_counters','INSERT'),('nomenclature_counters','UPDATE'),
		       ('nomenclature_branch_counters','SELECT'),('nomenclature_branch_counters','INSERT'),('nomenclature_branch_counters','UPDATE'),
		       ('buildings','SELECT'),('buildings','INSERT'),('buildings','UPDATE'),
		       ('internal_areas','SELECT'),('internal_areas','INSERT'),('internal_areas','UPDATE'),
		       ('floors','SELECT'),('zones','SELECT'),('technical_rooms','SELECT'),
		       ('mdf_idf','SELECT'),('mdf_idf','INSERT'),('racks','SELECT'),('racks','INSERT'),
		       ('switches','SELECT'),('switches','INSERT'),('ups','SELECT'),('ups','INSERT'),
		       ('pdus','SELECT'),('pdus','INSERT'),('patch_panels','SELECT'),('patch_panels','INSERT'),
		       ('backbone_links','SELECT'),('backbone_links','INSERT'),('nodes','SELECT'),('nodes','INSERT')
		), protected(table_name, privilege_type) AS (
			VALUES ('assets','SELECT'),('assets','INSERT'),('assets','UPDATE'),('assets','DELETE'),
			       ('asset_logs','SELECT'),('asset_logs','INSERT'),('asset_logs','UPDATE'),('asset_logs','DELETE'),
			       ('asset_relationships','SELECT'),('asset_relationships','INSERT'),('asset_relationships','UPDATE'),('asset_relationships','DELETE')
		), actual AS (
			SELECT table_name, privilege_type
			FROM information_schema.role_table_grants
			WHERE grantee = current_user AND table_schema = 'public'
		)
		SELECT current_user,
		       current_setting('is_superuser') = 'on',
		       r.rolcreatedb,
		       r.rolcreaterole,
		       r.rolbypassrls,
		       EXISTS (
			 SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
			 WHERE n.nspname='public' AND c.relname IN ('assets','asset_logs','asset_relationships')
			   AND c.relowner=r.oid
		       ),
		       EXISTS (
			 SELECT 1 FROM inherited i JOIN pg_roles inherited_role ON inherited_role.oid=i.roleid
			 WHERE inherited_role.rolsuper OR inherited_role.rolcreatedb OR inherited_role.rolcreaterole OR inherited_role.rolbypassrls
		       ),
		       EXISTS (SELECT * FROM required EXCEPT SELECT * FROM actual),
		       EXISTS (SELECT * FROM actual EXCEPT (SELECT * FROM required UNION ALL SELECT * FROM protected)),
		       (SELECT count(*) FROM actual a JOIN protected p USING (table_name, privilege_type)) NOT IN (0, 12)
		       OR ((SELECT count(*) FROM actual a JOIN protected p USING (table_name, privilege_type)) = 12
		           AND NOT (SELECT bool_and(c.relrowsecurity AND c.relforcerowsecurity)
		                    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
		                    WHERE n.nspname='public' AND c.relname IN ('assets','asset_logs','asset_relationships')))
		FROM pg_roles r WHERE r.rolname=current_user`
	var state runtimeRoleState
	if err := database.QueryRow(query).Scan(
		&state.RoleName,
		&state.Superuser,
		&state.CreateDB,
		&state.CreateRole,
		&state.BypassRLS,
		&state.OwnsProtectedTables,
		&state.InheritsPrivilegedRole,
		&state.MissingRequiredGrants,
		&state.UnexpectedTableGrants,
		&state.UnsafeProtectedGrants,
	); err != nil {
		return fmt.Errorf("cannot inspect runtime role: %w", err)
	}
	return validateRuntimeRoleState(state)
}

type onboardingRoleState struct {
	RoleName               string
	Superuser              bool
	CreateDB               bool
	CreateRole             bool
	BypassRLS              bool
	InheritsPrivilegedRole bool
	MissingRequiredGrants  bool
	UnexpectedTableGrants  bool
}

func validateOnboardingRoleState(state onboardingRoleState) error {
	if state.RoleName != "skia_onboarding" {
		return fmt.Errorf("onboarding database identity must be skia_onboarding, got %q", state.RoleName)
	}
	if state.Superuser || state.CreateDB || state.CreateRole || state.BypassRLS || state.InheritsPrivilegedRole || state.MissingRequiredGrants || state.UnexpectedTableGrants {
		return errors.New("skia_onboarding does not satisfy least-privilege requirements")
	}
	return nil
}

func validateOnboardingDB(database *sql.DB) error {
	const query = `
		WITH RECURSIVE inherited(roleid) AS (
			SELECT roleid FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
			UNION
			SELECT m.roleid FROM pg_auth_members m JOIN inherited i ON m.member = i.roleid
		), required(table_name, privilege_type) AS (
			VALUES ('users','SELECT'),('users','INSERT'),('tenants','INSERT'),
			       ('branches','INSERT'),('user_tenants','INSERT'),('user_branches','INSERT'),
			       ('roles','SELECT'),('roles','INSERT'),('user_roles','INSERT')
		), actual AS (
			SELECT table_name, privilege_type
			FROM information_schema.role_table_grants
			WHERE grantee = current_user AND table_schema = 'public'
		)
		SELECT current_user, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls,
		       EXISTS (
			 SELECT 1 FROM inherited i JOIN pg_roles inherited_role ON inherited_role.oid=i.roleid
			 WHERE inherited_role.rolsuper OR inherited_role.rolcreatedb OR inherited_role.rolcreaterole OR inherited_role.rolbypassrls
		       ),
		       EXISTS (SELECT * FROM required EXCEPT SELECT * FROM actual),
		       EXISTS (SELECT * FROM actual EXCEPT SELECT * FROM required)
		FROM pg_roles r WHERE r.rolname=current_user`
	var state onboardingRoleState
	if err := database.QueryRow(query).Scan(
		&state.RoleName,
		&state.Superuser,
		&state.CreateDB,
		&state.CreateRole,
		&state.BypassRLS,
		&state.InheritsPrivilegedRole,
		&state.MissingRequiredGrants,
		&state.UnexpectedTableGrants,
	); err != nil {
		return fmt.Errorf("cannot inspect onboarding role: %w", err)
	}
	return validateOnboardingRoleState(state)
}
