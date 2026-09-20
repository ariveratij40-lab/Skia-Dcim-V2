# B2c HF1 — controlled correction

Base: `74c2825a44f0a3afe27448343f4d3989184a9b63`.

## Decision before Migration 039

On PostgreSQL 16.14 the new `hf1_customization_retry` test reproduced two
successors (versions 2 and 3) sharing one customization audit UUID when the
same operation was retried in a new transaction. Existing audit uniqueness
is tenant/action/operation, and its writer returns an existing event without
checking the result binding. Runtime has no direct audit SELECT (intentionally).
Application locks alone cannot recover a durable request identity that is not
stored, nor correct the callable writer's mismatched-result reuse.

Migration 039 is therefore required solely for operation/event binding:
an exact secure replay interface and a fingerprint-aware writer must serialize
tenant/operation, validate actor/action/result/preset/request identity, and fail
closed on conflicting reuse. No direct audit access, seed, physical authority,
counter, sequence grant, RLS change or catalog activation is authorized.
Historical events without a request fingerprint must not be assigned an
invented fingerprint during replay.

## Compatibility decision

Legacy POST/PUT lack explicit operation identity and successor intent. They
must fail closed rather than guess these inputs. GET, historical display,
V1 recommendations and preview remain. No replacement HTTP feature is added.

## Rollback boundary

Only disposable local databases are authorized. No deployed database is touched.
The migration must be transactional and previous migrations immutable. Restoring
old application writers is not an approved operational rollback: it would
restore the defects. No production rollback or deployment is authorized here.

## Validation status

Defect reproduction: PASS (regression assertion fails on the authorized base).

The initial SQL draft syntax error was corrected before the authorized retry.
Permission-review timeouts did not count as technical validation failures.
The explicit retry ran successfully in local PostgreSQL 16.14.

## Implemented binding

The audit table is the existing durable store; no new table is introduced.
An additional unique index binds tenant/operation independently of action.
Migration 039 aborts if historical data already contains ambiguous operation
reuse; it does not delete or rewrite that history.

`read_nomenclature_customization_operation(uuid,text)` authenticates the actor
from transaction-local GUCs and DB roles, locks tenant/operation and either
returns the original rule/version/event or rejects a different actor, action or
fingerprint. It exposes no arbitrary audit query. The five-argument audit writer
binds the fingerprint to the exact actor/action/rule/preset result. The original
four-argument signature remains a compatibility wrapper with exact event checks;
it cannot silently return an event for another rule. Both entrypoints retain
SECURITY DEFINER, migrator ownership, safe search_path and PUBLIC/onboarding deny.

The domain checks durable replay before creating a successor. Lock order is
operation then tenant/type lineage in both mutation paths. No process-memory
cache participates. Tenant scopes are independent; one tenant never receives
another tenant's result. Historical events lacking fingerprints fail closed on
customization replay. Issued-rule transition policy remains deferred.

## Request and label contract

Fingerprint version 1 uses typed JSON and SHA-256, not map/presentation JSON.
It includes every policy field except counter state (forced to zero), including
both custom labels and the optional explicit predecessor RuleID. Type, prefix
and segment values use canonical uppercase/trim normalization. Labels are retained
verbatim; empty optional values/labels use the existing SQL NULL convention.
The event also binds the actual result whose immutable lineage identifies its
predecessor. Retries return the original result even after later successors.

Tests vary every identity-bearing field, prove equivalent normalization, and
exercise none/first/second/both/empty-label customization, fresh-connection replay,
conflicting labels, concurrent same-operation replay and direct writer attempts
to rebind result, preset, action or fingerprint. Exactly one successor/event is
persisted. Preset acceptance tests continue to verify its original labels.

## Privilege validation

The runtime validator compares exact regprocedure identities using effective
privileges (including PUBLIC/defaults and inherited roles), not routine names.
The existing UUID helpers and trigger entrypoints are individually allowlisted;
this does not grant them new privileges. Secure nomenclature/import interfaces
retain exact signatures, including the two HF1 signatures. Tests create an
unauthorized overload with PUBLIC, explicit and inherited EXECUTE: each fails
validation; removing it restores PASS. Table/sequence effective grants and
transitive privileged membership are also checked. No direct audit/preset/staging
grant, sequence grant or BYPASSRLS is added.

## Recorded local evidence

- Migration 039 SHA-256:
  `0e1ea8fcb607031d7aab050e26a51364150d7da45b9b708e0a341cdd4b79a0ab`.
- Manifest 038 → 039; actual ledger count 31.
- Measured PostgreSQL 16.14 schema fingerprint:
  `e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6`.
- Clean bootstrap, second bootstrap, existing upgrade and checksum rejection PASS.
- Forced 039 failure restores the entire pre-039 schema hash and ledger 30.
- B1/B2a/B2b/B2c and HF1 PostgreSQL regressions PASS.
- Bootstrap contracts preserve existing data and pass clean/idempotent/fail-closed cases.
- Full Go tests, vet, build and diff check PASS. DB tests run separately with
  explicit runtime/admin fixture connections rather than counting skipped tests.
- Seed count remains zero in bootstrap; no catalog activation or deployed access.

## Residual boundary

The old frontend still submits the deprecated POST/PUT and now receives HTTP 409;
its existing error text is generic. This is the authorized fail-closed choice,
not a new HTTP/frontend feature. A future UI/API gate must provide explicit domain
commands. B2d's integrated matrix has not been started. No commit, push, PR or
deployment is authorized by the continuation gate; this candidate awaits review.
