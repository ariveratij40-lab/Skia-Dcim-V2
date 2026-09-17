# Existing database upgrade contract

`ops/phase011/run_database_bootstrap.sh` has two explicit data contracts,
selected with `SKIA_DATABASE_CONTRACT`:

- `clean` (the default) retains the Phase 011 guarantee that bootstrap does
  not introduce tenants, users, or assets. It requires `0|0|0` after the
  repeated bootstrap.
- `upgrade` captures the existing tenant, user, and asset counts before
  applying migrations and requires the exact same counts afterward. Existing
  business rows therefore do not block a schema upgrade and cannot silently
  disappear during it.

The upgrade preservation check measures both sides with `skia_bootstrap`.
This is an administrative observation boundary, not application authority:
it guarantees equivalent visibility before and after migrations even when
protected tables use `FORCE ROW LEVEL SECURITY`. The restricted
`skia_migrator` remains the migration executor and is not granted
`BYPASSRLS`; no tenant/branch context is fabricated for the comparison.

Both modes run the same canonical manifest twice and retain the exact ledger,
schema fingerprint, role provisioning, role validators, Migration 035 legacy
Rack precheck, checksum protection, and idempotency checks. The upgrade mode
does not weaken Migration 035: any populated legacy satellite `rack_id` still
fails before the migration is invoked.

For an existing database, invoke the canonical runner with:

```sh
SKIA_DATABASE_CONTRACT=upgrade \
SKIA_PROD_ROOT=/path/to/isolated-release-root \
/path/to/canonical/source/ops/phase011/run_database_bootstrap.sh
```

The isolated root must supply the canonical `source/` tree, the versioned
`runtime/provision_database_roles.sql`, and the authorized runtime secrets.
Clean database construction continues to omit the variable or set it to
`clean`.
