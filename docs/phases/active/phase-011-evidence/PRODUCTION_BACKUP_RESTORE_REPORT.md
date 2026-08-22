# PHASE-011 — Production Backup/Restore Report

## Status

**BLOCKED — RESTORE HASH/SEMANTIC PROCEDURE MISMATCH**

A production-empty custom-format backup was created after Stage D:

- file: `skia_prod_empty_20260822T155542Z.dump`;
- mode: `0600`;
- bytes: `183619`;
- SHA-256: `44e99e91fe76bb5183e53e3429cbf32c5f1b76d6c75392ee3d164385ce7116d8`.

Restore into the disposable `skia_prod_restore_validation` database succeeded.
The restored copy had ledger 10, business counts `0/0/0`, three canonical
policies and RLS/FORCE `true/true`. The disposable database was removed.

The original exact comparison guard did not pass. Production and restore both contained
225 constraints, but CHECK expressions were reserialized by dump/restore
with semantically equivalent cast placement (`varchar[]::text[]` versus
per-element `varchar::text`). Consequently:

- production constraint fingerprint: `3dd157ffc9ac401ea0ca2c2f9e3c777d`;
- restore constraint fingerprint: `0ba8b53050f8bbf5ea86e230e3a28994`;
- production portable schema hash after Stage D:
  `632957ac375f083e81856b0878f3ec2b3cd880b5254da11faf41b8bac000339f`;
- restore portable schema hash:
  `5b4a2fd4ee1c7783ed70e794a315adf000ddf72e9df7bb1ebcaf853770701545`.

All other fingerprint categories matched, including canonical policies, RLS,
ledger, columns, indexes, functions, triggers and sequences. Nevertheless the
required exact restore hash did not match, so Stage E is not approved and Stage
F was not entered.

## Semantic-equivalence gate revalidation — 2026-08-22

The versioned `ops/phase011/validate_restore_semantics.sh` validator was applied
to one newly restored disposable target using the same verified backup. It
confirmed:

- 225 source and 225 restored constraints;
- every difference was a CHECK constraint paired by table and constraint name;
- zero differences after the narrowly scoped cast-placement normalization;
- identical deterministic semantic SHA-256:
  `19f95417bba53f97adc66ae024abcbcde87bca9a650a0ea22f1e00024fe840b1`.

The definitive enumeration contained **16** serializer-only CHECK identities,
not the exactly 15 required by
`ARCHITECT_DECISION_PHASE011_RESTORE_SEMANTIC_EQUIVALENCE_GATE.md`. The validator
therefore failed closed before approval. The target was removed and Stage F was
not entered. Accepting the additional identity requires a new architectural
decision even though the limited normalization produced semantic equality.

## Cardinality-corrected revalidation

The authorized correction changed only the exact count from 15 to 16 and fixed
the expected semantic SHA. One disposable revalidation then approved all
required controls:

- constraints: `225/225`;
- serializer-only CHECK differences: exactly `16`;
- differences after the approved normalization: `0`;
- source/restore semantic SHA-256:
  `19f95417bba53f97adc66ae024abcbcde87bca9a650a0ea22f1e00024fe840b1`;
- all non-CHECK fingerprint categories shared SHA-256
  `182cc41757aa12bb7887df97340b2e8967b95813eb03d7fc9c16263ca7a1b08f`;
- ledger `10/10`, business data `0/0/0`, grants `12/12`.

The target was removed. Stage E is **APPROVED — BACKUP/RESTORE SEMANTIC
EQUIVALENCE PROVEN**.
