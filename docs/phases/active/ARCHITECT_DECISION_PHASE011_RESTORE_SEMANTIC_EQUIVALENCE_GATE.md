# ARCHITECT DECISION — PHASE-011 RESTORE SEMANTIC EQUIVALENCE GATE

## Decision

**APPROVED FOR RESTORE-PROOF REVALIDATION AND CONTINUATION.**

Stage E demonstrated a successful backup and restore, but the exact dump-derived hash changed because PostgreSQL reserialized 15 CHECK constraints with semantically equivalent cast placement. Exact text identity of `pg_get_constraintdef`/dump output is therefore not a valid restore-equivalence invariant for those CHECK expressions.

This decision does not waive structural verification. It replaces the invalid text-serialization equality criterion with a stricter semantic restore contract.

## Authoritative restore-equivalence contract

A restored database is considered equivalent only if ALL of the following hold:

1. backup file exists, is regular, mode `0600`, checksum recorded, and was produced from the exact isolated production database after approved Stage D;
2. restore completes successfully into a disposable PostgreSQL 16 database;
3. bootstrap ledger paths and SHA-256 values match exactly 10/10;
4. business data counts match exactly, including the expected empty production baseline;
5. table/column inventory, types, nullability, defaults, identity/generated semantics and sequence properties match semantically;
6. FK/PK/UNIQUE constraints match by table, column identity, referenced table/columns, match type, update/delete actions, deferrability and validation state;
7. CHECK constraints match by logical behavior, not raw serializer text. At minimum, every differing CHECK must be individually paired to the same table/constraint identity and proven equivalent by normalized parse/expression form or by deterministic truth-table probes covering accepted and rejected representative values;
8. indexes, functions, triggers and extensions match semantically;
9. canonical RLS state matches exactly: three policy names, exact canonical policy hashes, and RLS/FORCE `true/true`;
10. runtime grants, role attributes and protected-table ownership match exactly;
11. portable schema normalization must match for all categories not known to be serializer-sensitive; serializer-sensitive CHECK text must be excluded from the raw text hash and represented through its semantic fingerprint/probes instead;
12. PostgreSQL/Redis health remains good and no production business data is introduced.

Any unpaired constraint, behavior difference, object-count difference, permission difference, policy/RLS difference, ledger difference or unexpected restore warning is a hard stop.

## Required implementation

Codex is authorized to add a PHASE-011 restore-semantic validator without modifying historical PHASE-005 or PHASE-010 artifacts.

The validator must:

- enumerate all 225 constraints in source and restored DB;
- classify exact matches and serializer-only CHECK differences;
- require the known serializer-only set to be exactly 15 unless a new gate is obtained;
- prove each of the 15 differs only by semantically equivalent cast placement;
- include negative/positive probes for those CHECKs where practical;
- emit a deterministic semantic restore fingerprint independent of PostgreSQL 16.14/16.15 textual cast rendering;
- fail closed for any additional or materially different constraint.

## Authorized execution

One new disposable restore validation is authorized using the existing approved backup, or a fresh backup created from the unchanged isolated production state if required by the validator. The production database itself must not be mutated by this validation.

If the semantic restore contract passes completely, Stage E is classified **APPROVED** even though the old raw hash differs.

After Stage E approval, Codex may continue PHASE-011 Stages F-H under the existing constraints:

- immutable backend/frontend build from the exact authorized main source;
- dark deploy only;
- internal/loopback health and smoke tests;
- no DNS change;
- no public traffic activation;
- no production users or business data.

Final classification remains:

- `READY FOR PRODUCTION TRAFFIC ACTIVATION GATE`, or
- `BLOCKED`.

## Explicit non-authorization

This gate does not authorize changing CHECK constraints, rewriting migrations, altering production RLS/grants/roles, changing Nginx public routing, DNS, certificates serving public traffic, or loading production data.
