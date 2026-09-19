# Phase 1.2F-B2b — Nomenclature V2 DB enforcement and audit writer

## Scope and authority boundary

Migration 037 adds database enforcement for the V2 nomenclature foundation. Go remains the only canonical identity generator: it resolves physical identifiers, orders and normalizes segments, formats sequences, and builds `internal_code`. PostgreSQL does not duplicate that full-string builder. It validates the persisted rule, type, tenant, branch, physical context, sequence scope, counter high-water mark, identity immutability, and the 100-byte storage boundary.

This slice does not implement the acceptance service, HTTP routes, frontend, production preset seed, catalog activation, or `TenantTx` propagation of `app.user_id`. The audit writer is intentionally unreachable from normal application flows until B2c establishes that trusted actor GUC from the authenticated session.

## Migration 037

`migrations/037_nomenclature_v2_enforcement_audit_writer.sql` is executed atomically with its bootstrap ledger record. It:

- validates existing managed identities and exact accepted provenance snapshots before structural changes;
- records immutable issued sequence authority on assets with `nomenclature_sequence_scope` and `nomenclature_sequence_scope_location_id`;
- adds scoped uniqueness for branch, placement, and distribution sequences without allocating or resetting counters;
- strengthens issued-rule detection to include managed assets and positive branch/location counters;
- protects identity-bearing rule and asset fields after issuance;
- replaces the obsolete database string reconstruction with structural validation;
- validates zone, placement, distribution, and housing through canonical tenant/branch-scoped authorities;
- uses deferred constraint triggers for final states that depend on satellite rows;
- enforces exact six-field acceptance snapshots while preserving `LEGACY_UNATTRIBUTED` rules;
- creates the four-value `nomenclature_onboarding_audit_action` enum and the narrow audit writer;
- creates no catalog preset rows and no counter table.

Administrative compatibility scans temporarily suspend `FORCE RLS` only inside the migration transaction while holding `ACCESS EXCLUSIVE` locks. The exact pre-migration `ENABLE/FORCE RLS` state is captured and restored before commit. Runtime does not receive `BYPASSRLS` or any new table/sequence privilege.

## Audit writer contract

The exact callable interface is:

```sql
public.write_nomenclature_onboarding_audit(
  uuid,
  uuid,
  uuid,
  public.nomenclature_onboarding_audit_action
) RETURNS uuid
```

It is owned by `skia_migrator`, is `SECURITY DEFINER`, and fixes `search_path` to `pg_catalog, pg_temp`. `PUBLIC` and `skia_onboarding` are denied; `skia_runtime` receives only exact `EXECUTE`. Runtime receives no direct `audit_logs` CRUD and no direct `system_naming_presets` access.

Tenant and actor are derived from `app.tenant_id` and `app.user_id`. The actor must be an active user, an active tenant member, and hold database-authoritative `admin` or `super_admin` membership for that tenant. The writer constructs the audit JSON internally and accepts no arbitrary JSON, tenant, actor, role, or entity type. `(tenant_id, action, operation_id)` provides retry idempotency. The event participates in the caller transaction, so a rollback removes both the representative rule mutation and audit row.

## Compatibility and release contract

- Migration order: `036 -> 037`.
- Expected ledger: `29`.
- Canonical PostgreSQL 16.14 schema fingerprint: `526264e8a52816a1110df02843fa2e806a1ca8d2634482ad1337757ca9a37ba1`.
- Production preset seed count: `0`.
- V2 catalog active: `NO`.
- Migration 038: not created.

Existing Migration 014/033 rules, inactive rules, issued rules, internal codes, counters, and legacy unattributed provenance are preserved. Migration 037 does not rename or reissue assets, infer provenance, reset counters, or consume a sequence.

## Validation

The PostgreSQL 16.14 harnesses cover clean bootstrap, second bootstrap, post-036 upgrade, forced rollback, exact snapshots, issued immutability, 100-byte acceptance and over-limit rejection without truncation, writer metadata and allow-list, actor/tenant authorization, idempotency, transaction rollback, zero production seeds, runtime validation, and the canonical schema fingerprint. B1 and B2a regressions, `go test ./...`, `go vet ./...`, and `go build ./...` remain release gates.
