# B3b R4-HF2 — ratified recovery security matrix

Application baseline: `0c01d79ae714465ab95aac896e4100d0be893185`.
Authority: explicit user policy ratification, Recovery Security Authority Matrix.
Status: HF3 pre-restore procedure implemented and validated locally. The original
post-restore normalization remains unsupported; historical findings follow below.
This document belongs to the tooling candidate, not Application Package A.
No commit/publication, application migration, VPS operation or production change.

## Extension and exact function authority

Canonical disposable PostgreSQL 16.14, post-039 ledger count 31, was rebuilt
using the canonical restricted migrator and provisioning, with the canonical
Compose initial administrator `skia_bootstrap`.

| Extension | Schema | Required owner | Authority |
| --- | --- | --- | --- |
| plpgsql | pg_catalog | skia_bootstrap | Ratified recovery invariant |
| uuid-ossp | public | skia_migrator | Ratified recovery invariant |

Missing/extra extensions or schema/owner drift must fail comparison. No automatic
repair of unexpected extensions. No system-wide ownership normalization.

The exact ten extension-member signatures below were queried through
`pg_extension -> pg_depend (deptype=e) -> pg_proc`, not name matching.
Every return type is `pg_catalog.uuid`; every owner is `skia_bootstrap`.

| Schema | Function | Argument types | Return type | Owner |
| --- | --- | --- | --- | --- |
| public | uuid_generate_v1 | () | uuid | skia_bootstrap |
| public | uuid_generate_v1mc | () | uuid | skia_bootstrap |
| public | uuid_generate_v3 | (uuid, text) | uuid | skia_bootstrap |
| public | uuid_generate_v4 | () | uuid | skia_bootstrap |
| public | uuid_generate_v5 | (uuid, text) | uuid | skia_bootstrap |
| public | uuid_nil | () | uuid | skia_bootstrap |
| public | uuid_ns_dns | () | uuid | skia_bootstrap |
| public | uuid_ns_oid | () | uuid | skia_bootstrap |
| public | uuid_ns_url | () | uuid | skia_bootstrap |
| public | uuid_ns_x500 | () | uuid | skia_bootstrap |

Argument names on v3/v5 are `namespace` and `name`. Extension ownership and
member function ownership are separate authorities. No recursive transfer.

## Database ACL classification

`ops/phase011/provision_database_roles.sql` explicitly establishes the database
owner as skia_migrator and explicit CONNECT for runtime/onboarding. These are
EXPLICIT_CANONICAL. Target parameterization must require exact equality to
`current_database()`, use safely quoted identifiers, and preflight before grants.

PUBLIC CONNECT/TEMPORARY are POSTGRES_DEFAULT: observed, not explicitly established
by the canonical provisioner; verify only, do not introduce a new normalization
policy. Owner CONNECT/CREATE/TEMPORARY arise from PostgreSQL owner/default ACL
semantics. Bootstrap effective access is administrative superuser access, not an
extra explicit CONNECT grant. No separate `postgres` role exists in this canonical
cluster; the earlier postgres-admin fixture is not a role policy for this release.

## Role authority classification

Columns: LOGIN, SUPERUSER, CREATEDB, CREATEROLE, INHERIT, REPLICATION, BYPASSRLS.

| Role | Exact observed values |
| --- | --- |
| skia_bootstrap | true, true, true, true, true, true, true |
| skia_migrator | true, false, false, false, false, false, false |
| skia_onboarding | true, false, false, false, false, false, false |
| skia_runtime | true, false, false, false, true, false, false |

For migrator/onboarding/runtime, all attributes except REPLICATION are explicit
VERSIONED_PROVISIONING values in the canonical CREATE ROLE statements.
REPLICATION=false is POSTGRES_DEFAULT, verification-only absent separate authority.
Bootstrap values are BOOTSTRAP_CREATION from `POSTGRES_USER=skia_bootstrap` in the
canonical Compose and PostgreSQL initial superuser creation: do not rewrite them
merely to match observations. No application-role membership was observed.
Onboarding/runtime no-membership guards are versioned validators; absent bootstrap
and migrator memberships are observed empty, not permission to edit memberships.
Passwords and all secrets remain outside this contract.

## Technical stop: post-restore extension owner mutation

PostgreSQL 16 ALTER EXTENSION supports UPDATE, SET SCHEMA, ADD and DROP member,
but no OWNER TO subcommand. The exact PostgreSQL 16.14 disposable probe of
`ALTER EXTENSION "uuid-ossp" OWNER TO skia_migrator` raised SQLSTATE 42601.
It was caught within a transaction and rolled back; no owner mutation occurred.
Reference: https://www.postgresql.org/docs/16/sql-alterextension.html

The ratification prohibits REASSIGN OWNED and broad/recursive owner repair.
No direct pg_catalog edits, extension drop/recreation or dependency surgery were
implemented as a workaround. Therefore this candidate does not claim an executable
post-restore normalization procedure or structural equality after normalization.
plpgsql must be verified, and drift must stop rather than trigger unsafe repair.

A possible separately reviewed recovery procedure would establish the ratified
extensions in an empty isolated destination before pg_restore, preserving member
owners, then restore and normalize the explicit database CONNECT ACLs. That is a
proposal, not executed validation or an approved replacement for the requested
post-restore owner repair. No recovery PASS can be declared from this proposal.

## Historical evidence remains failed

RESTORED_PRE_PROVISION_STRUCTURAL_SCHEMA_HASH=
`a187df5ee23a81a38da4764482eee02ab62cefe86c3b35b73c0ae41beb570f7c`.
SECURITY_STRUCTURE_MATCH_PRE_PROVISION=NO.
The missing explicit database CONNECT ACLs and postgres-owned uuid-ossp in the
historical restore remain genuine differences, not serialization normalization.
B3B_STRUCTURAL_V1, R2/R6 raw gates and Application Package A remain unchanged.
Migration 040 SHA256 remains
`773811a472b08eaa44c114bb7af00b4479c27c3fd4242d726bc355c554a69bd6`.
No Migration 041. R1-R7, the complete negative matrix, final regressions and
publication remain gated; this document is not a PASS report.

## HF3 superseding procedure (explicit authorization)

The earlier blocked operation above remains historical. HF3 explicitly authorizes
precreation instead of owner repair. `ops/phase010/b3b_recovery.py` implements:

1. Exact role/membership and source extension preconditions; no password handling.
2. New target only, owner skia_migrator, template0, explicit source encoding,
   collation and ctype. Non-libc locale contracts are rejected, not guessed.
3. Verify plpgsql already canonical. Precreate uuid-ossp 1.1 under SET LOCAL ROLE
   skia_migrator. Verify exact ten members, signatures, result and bootstrap owners.
4. Normal custom pg_restore with exit-on-error; nonzero or stderr stops. No TOC
   filtering, --clean, --if-exists or owner rewrites.
5. Exact requested/current database match inside a transaction, then only the two
   explicit CONNECT grants. Restrictive identifier syntax and psql literal quoting
   plus PostgreSQL format('%I') prevent SQL injection. PUBLIC ACL is not changed.
6. Strict structural/data/security comparison and independent second recovery.

`test_b3b_recovery.sh` creates only local disposable containers, archives Package A
from its exact SHA, and removes its own containers afterward. Candidate tooling
provenance tests use an isolated temporary Git fixture, not a repository commit.
The baseline contains a synthetic tenant to exercise nonempty data preservation.

Two restores have matched on PostgreSQL 16.14 with encoding UTF8 and
LC_COLLATE/LC_CTYPE en_US.utf8. Normal restore exit=0, stderr empty; extension
members remain owned by bootstrap. The source/target structural hash including
explicit extension membership is recorded by the harness, not equated to older
payload hashes from historical runs. The additional security summary now expands
NULL relation ACL with acldefault: pg_dump represents explicit owner-only default
ACL as implicit NULL on restore. This is identical PostgreSQL authority; no grant
is discarded. The structural verifier already used that same ACL interpretation.

Tests individually roll back default/constraint/index/function-security/RLS/grant,
CONNECT/member-function-owner/extension-membership/role-attribute/membership
mutations and require detection and restoration. Wrong extension owner is created
in a separate empty target, never changed via catalog writes. Final release
readiness still requires the complete current R1-R7 result and regressions.

Final publication authorization replaces the historical temporary Git fixture:
the harness now requires and archives the actual `B3B_TOOLING_SHA`, executes that
package, validates it against repository Git, and binds checkpoint recovery
metadata to its exact artifact checksums. No temporary commit is authoritative.
