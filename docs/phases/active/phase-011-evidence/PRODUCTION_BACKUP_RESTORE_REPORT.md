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

The exact comparison guard did not pass. Production and restore both contained
225 constraints, but 15 CHECK expressions were reserialized by dump/restore
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
