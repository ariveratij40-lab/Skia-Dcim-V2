# Phase 1.2F-B2c — Nomenclature acceptance domain

## Boundary

B2c introduces the internal, transaction-scoped authority for accepting and
customizing Nomenclature V2 rules. It adds no HTTP endpoint, UI, production
preset, catalog activation, physical authority, or Migration 039.

The authoritative flow is:

`authenticated session → tenant + actor → authenticated TenantTx → DB-backed
RBAC → exact preset → serialized state machine → tenant rule → provenance +
audit → commit`.

## Transaction and actor authority

`BeginAuthenticatedTenantTx` extends the existing tenant transaction with
transaction-local `app.user_id`. Tenant, branch, and actor are server-derived;
direct `BeginTenantTx` callers remain actor-less. The request middleware uses
the authenticated primitive, so the audit writer and the application mutation
share one transaction and rollback boundary.

Mutation authority is resolved from active `users`, `user_tenants`,
`user_roles`, `roles`, and the active tenant. Only `admin` and `super_admin`
are accepted, and `super_admin` wins when both roles are effective.

## Migration 038

Migration 038 adds the exact, non-fallback reader
`read_system_naming_preset_v2(text, integer)`. It distinguishes
`FOUND_ACTIVE`, `FOUND_INACTIVE`, and `NOT_FOUND` while returning the complete
V2 policy. It is owned by `skia_migrator`, is `SECURITY DEFINER`, has a fixed
`pg_catalog, pg_temp` search path, denies PUBLIC/onboarding, and grants only
exact EXECUTE to `skia_runtime`.

The migration minimally refines `write_nomenclature_onboarding_audit`: a NULL
preset is accepted only for a `CUSTOM` rule and the typed customization event.
PRESET acceptance/update and `DERIVED_FROM_PRESET` customization retain exact
preset validation. No arbitrary JSON, tenant, actor, or role is accepted from
the caller.

Two pure functions already referenced by naming-rule constraints/triggers also
receive exact runtime EXECUTE: `nomenclature_acceptance_snapshot_is_valid` and
`naming_rule_is_issued`. This is required for legitimate INSERT/UPDATE; it adds
no table access, sequence access, BYPASSRLS, or broad routine privilege.

## State machine and lineage

The service locks a deterministic `tenant:asset_type` advisory key, then locks
the complete rule lineage with `FOR UPDATE`. Outcomes are `CREATABLE`,
`ALREADY_ACCEPTED`, `LEGACY_EXISTING`, `CUSTOMIZED_PRESERVED`,
`INACTIVE_PRESERVED`, `ISSUED_PRESERVED`, `NEWER_PRESET_AVAILABLE`,
`PRESET_UNAVAILABLE`, and `CONFLICT`.

Initial acceptance creates a version-1 PRESET root. Explicit newer acceptance
creates one linear successor, deactivates its predecessor, preserves existing
asset references, and writes the update audit. Equivalent structure never
fabricates provenance. Legacy, customized, inactive, or issued state is
preserved. Customization creates either an independent CUSTOM root or a
DERIVED_FROM_PRESET successor. Issued rules remain immutable.

The acceptance snapshot contains exactly schema version, user, tenant, role,
normalized email, and non-empty name. Audit failure aborts the same TenantTx.
The retired `ApplyRecommendedNomenclature` mutation path was removed; V1
read/preview compatibility remains.

## Reproducibility and validation

- Manifest order: 037 → 038.
- Ledger: 30.
- PostgreSQL 16.14 schema fingerprint:
  `c36963ffc829ec1c20cb1e07c3279d2568ba6b5900f4e3697538c899c59cb4f9`.
- Fresh and second bootstrap pass; forced Migration 038 failure rolls back.
- Exact active/inactive/not-found behavior and runtime privilege boundaries pass.
- Real runtime acceptance covers create, repeat, successor, viewer denial, and
  two concurrent initial accepts producing one root/one active rule/one audit.
- Accepted preset custom segment values and labels are copied exactly to the
  tenant rule, including when a newer preset creates a successor.
- Production preset seed count remains zero and V2 catalog remains inactive.

## Test matrix completion

The PostgreSQL runtime matrix now explicitly covers legacy/customized/inactive/
issued preservation, unavailable exact versions, downgrade conflict, successor
retry from a new transaction, derived and independent customization, invalid
NULL-preset audit combinations, actor deletion, and service rollback after an
audit INSERT trigger deliberately raises an error. Persisted rules, provenance,
audits and assets are inspected independently of service return values.

Initial acceptance, successor acceptance, acceptance/customization and dual
customization races use two real transactions held at an advisory-lock barrier.
The test observes both waiters in PostgreSQL before releasing the barrier.
It checks active-rule uniqueness, one child per predecessor, increasing
versions, acyclic same-tenant/type lineage and exact audit counts.

The B2a regression runs 12 concurrent reservations for each of BRANCH, PLACEMENT
and DISTRIBUTION, tests rollback without sequence consumption, resolves real
Housing/Distribution records, compares database-backed preview with the commit
builder and rejects cross-tenant/cross-branch context.

## Approved issued-rule precedence

`ISSUED_PRESERVED` takes precedence over `NEWER_PRESET_AVAILABLE`. When the
current rule has issued identities under the canonical issued-rule contract,
normal acceptance returns `PRESERVED_OUTCOME`: no successor, no predecessor
deactivation, no rule/provenance rewrite, no asset rebinding, and no code or
sequence-authority change. An explicit conflicting acceptance command emits
one idempotent `NOMENCLATURE_PRESET_PRESERVED_CONFLICT` audit where required.
Structural customization has the same issued-rule protection.

The test matrix separates two cases: issued predecessors retain their active
authority and historical assets unchanged; unissued predecessors may acquire
exactly one explicit newer-preset successor and become inactive. The former
requirement to create a normal successor from a predecessor with assets is
replaced by these two independent assertions.

`ISSUED_RULE_POLICY_TRANSITION` is deferred policy/design work. It could later
retain historical rule authority while changing future issuance authority,
but it is not implemented or authorized by B2c.
