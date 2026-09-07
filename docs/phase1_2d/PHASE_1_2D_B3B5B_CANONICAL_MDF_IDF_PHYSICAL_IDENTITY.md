# Phase 1.2D-B3B5B — Canonical MDF/IDF physical identity

## Contract

MDF/IDF technical identity (`assets.id`, generated `internal_code` and naming
sequence) is distinct from operator/customer physical identity. New MDF/IDF
creation requires explicit `physical_identity`; import accepts only an explicit
column with that name. Display name, serial, asset tag and source internal code
are never promoted implicitly.

The server trims the value, uppercases ASCII letters, converts whitespace runs
to `-`, collapses repeated `-`, and permits only `[A-Z0-9._/-]`. Empty or
unsupported input is rejected. `MDF 01`, ` mdf   01 ` and `MDF-01` normalize to
`MDF-01`; `MDF:01` is invalid.

## Storage and race safety

`locations` is the canonical MDF/IDF placement row and already owns tenant,
branch, Zone and placement type. Migration 031 adds the original value and a
generated normalized value there. A partial unique index enforces
`(tenant_id, branch_id, zone_id, placement_type,
normalized_physical_identity)` for non-null MDF/IDF identities.

`physical_identity_governed` is the persistent boundary between historical and
new state. Migration 031 initializes every pre-contract row to `false` without
guessing or rewriting identity. Such legacy rows may retain `NULL`. A governed
MDF/IDF has the marker set to `true`, non-null physical and normalized identity,
Zone and `asset_id`; the asset must resolve to the same tenant, branch and type
through both `assets` and `mdf_idf`.

Creation remains shell-first inside one request transaction: the handler inserts
an ungoverned placement shell, creates the asset and subtype, and atomically
attaches identity and changes the marker to `true`. A deferred constraint
trigger validates the current final row at commit. Consequently the temporary
shell is usable during canonical construction but a direct `skia_runtime`
MDF/IDF shell insert cannot commit durably.

Physical identity is write-once. Explicit legacy remediation may transition
`NULL` to a valid value after the canonical attachment exists. A normalized-
equivalent update is idempotent; value-to-NULL, value-to-different-value,
asset detachment, asset reattachment, governance downgrade, tenant/branch
mutation and placement-type escape are denied by the database. Zone relocation
revalidates the canonical graph, preserves identity, and the unique index
reevaluates the destination scope. A multi-column update cannot bypass these
checks. Explicit legacy remediation is the single transition from
`false + NULL` to `true + valid identity + valid graph`.

The lifecycle functions use SECURITY INVOKER semantics, hardened search paths
and schema-qualified reads. The immediate trigger covers identity, marker,
asset, type, tenant, branch and Zone. The deferred trigger covers INSERT and
UPDATE final state. Authorized deletion remains possible in canonical FK order
without leaving an identity-bearing orphan; normal application lifecycle remains
decommissioning rather than hard delete.

Multiple identities in one Zone, the same identity in another Zone, branch or
tenant, and the same identity for MDF versus IDF remain valid. A true duplicate
has one winner and one controlled conflict under concurrency. Location insertion
precedes nomenclature reservation in shared `createMdfIdf`, so rejection creates
no asset, location, subtype or log and consumes no sequence. Interactive and
import flows use the same service; neither updates nor upserts.

## Legacy and security

Existing rows remain nullable and are not backfilled, renamed, merged or
deleted. Their ungoverned NULL identity is the explicit legacy exception. New
application and direct runtime writes fail closed without identity. PUBLIC has
no EXECUTE privilege on either enforcement function. Migration 031
does not change RLS policies, FORCE RLS, role attributes, staging grants,
sequence grants or broad migrator authority.

The official bypass count remains 22: B3B4 already closed the authoritative
MDF/IDF import-create bypass, and B3B5 closes no additional matrix item. Stale
`COMMITTING` recovery remains deferred; normal claim and canonical persistence
remain transactionally coupled.

## Validation

PostgreSQL 16.14 validation covers clean/idempotent bootstrap, ledger 23,
legacy NULL compatibility, normalization equivalence, scoped uniqueness,
successful interactive/import creation, duplicate zero delta, concurrent
duplicate serialization, rollback, stale type and stale Zone behavior. Direct
SQL negatives cover durable runtime MDF/IDF shells, orphan identity, NULL
degradation, identity rewrite, marker downgrade, asset detach/reattach,
tenant/branch/type and multi-column escape. Relocation covers both an empty
destination scope and a duplicate destination conflict. A pre-031 fixture proves
legacy NULL preservation; migration failure proves transactional rollback.

The explicit PostgreSQL 16.14 harness also proves wrong-tenant, wrong-branch,
wrong-type and missing-subtype attachments each fail with no location write;
valid legacy remediation succeeds while duplicate and invalid-graph remediation
leave the original legacy row unchanged. The production-authorized lifecycle is
decommissioning: it preserves the governed location/asset/subtype graph and
leaves zero identity, location-asset or subtype orphans. Two simultaneous full
graph constructions for one domain identity produce exactly one winner and one
unique conflict; every location, asset and subtype belonging to the loser rolls
back, with no log or counter delta.
