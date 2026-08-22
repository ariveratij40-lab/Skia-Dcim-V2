# ARCHITECT DECISION — PHASE-011 RESTORE DIFF CARDINALITY CORRECTION GATE

## Decision

**APPROVED FOR ONE CONTROLLED REVALIDATION AND CONTINUATION IF PROVEN.**

The previous gate's requirement that the dump/restore comparison contain exactly 15 serializer-only CHECK differences is corrected. The complete enumerator found 16, and all 16 were matched by table/name, confined to CHECK constraints, and reduced to zero differences after the already-approved narrow cast-placement normalization. No evidence supports treating the sixteenth item as semantic drift merely because the earlier sample/count was incomplete.

This decision changes only the expected cardinality from 15 to 16. It does not broaden the normalization rules or acceptable difference classes.

## Required preconditions

Before any revalidation:

- production remains empty and isolated;
- canonical RLS/FORCE remains `true/true` on the three protected tables;
- canonical policy hashes and 12 runtime grants remain exact;
- runtime remains NOSUPERUSER/NOBYPASSRLS and owns no protected table;
- ledger remains 10/10;
- PostgreSQL and Redis remain healthy;
- no application containers, Nginx routing, DNS or public production traffic have been activated.

Any mismatch is a hard stop.

## Authorized Stage-E revalidation

Exactly one disposable restore revalidation is authorized using the existing protected production-empty backup, provided its SHA-256 remains exactly:

`44e99e91fe76bb5183e53e3429cbf32c5f1b76d6c75392ee3d164385ce7116d8`

The validator MUST require:

1. exactly 225 constraints in source and restore;
2. identical constraint identity sets by schema/table/name/type;
3. exactly 16 raw differences;
4. every raw difference is a CHECK constraint;
5. all 16 differences match by identity;
6. the only accepted normalization is the previously reviewed equivalent cast-placement normalization; no additional rewrite rule may be introduced;
7. after that normalization, difference count is exactly zero;
8. common semantic SHA is exactly `19f95417bba53f97adc66ae024abcbcde87bca9a650a0ea22f1e00024fe840b1`;
9. ledger, business-data counts, columns, indexes, functions, triggers, sequences, canonical policy names/hashes, grants, role properties and RLS/FORCE are equal to the source contract;
10. any unexpected difference, 15 or 17+ raw diffs, identity mismatch, additional normalization need, or semantic SHA change causes BLOCKED.

The disposable restore target must be removed after validation regardless of outcome.

## Stage-E approval semantics

If all checks above pass, Stage E is **APPROVED — BACKUP/RESTORE SEMANTIC EQUIVALENCE PROVEN**. The textual/portable dump hash is explicitly non-authoritative for dump/restore equivalence because PostgreSQL may reserialize semantically identical CHECK expressions.

This does not weaken bootstrap validation: deterministic clean-bootstrap validation and dump/restore validation remain separate controls.

## Continuation authorization

If Stage E passes exactly as specified, Codex is authorized to continue PHASE-011 Stages F-H under the existing specification:

- immutable build from the approved production source SHA;
- dark backend/frontend deployment on the isolated production stack;
- internal health and smoke/security validation;
- evidence publication.

DNS changes, public traffic activation, production user/business-data creation, and STAGING modifications remain prohibited.

## Hard stop

No retry beyond this single revalidation is authorized. Any deviation from the exact 16-difference contract or any failure in Stages F-H results in `BLOCKED` and requires a new architectural decision.

Final PHASE-011 classification remains either:

- `READY FOR PRODUCTION TRAFFIC ACTIVATION GATE`, or
- `BLOCKED`.
