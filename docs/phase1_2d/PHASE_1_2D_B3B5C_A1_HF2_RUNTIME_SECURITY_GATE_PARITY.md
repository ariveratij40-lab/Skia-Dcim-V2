# Phase 1.2D B3B5C-A1-HF2 — Runtime security gate parity

## Production symptom and fail-closed behavior

After migration 032, the SQL runtime-role validator approved the effective
`skia_runtime` grants, but backend startup stopped at the restricted-role
security gate. This was the intended fail-closed response to a contract
disagreement; the gate itself was not disabled or bypassed.

## Root cause

The provisioning script and SQL validator both authorize exactly `SELECT` and
`INSERT` on `floors` and `zones`. The equivalent required-grant matrix embedded
in `validateRestrictedRuntimeDB` still listed only `SELECT`. Consequently, the
Go exact-contract comparison classified the valid `INSERT` grants as
unexpected.

HF2 adds only the two missing required entries:

- `floors`: `SELECT`, `INSERT`
- `zones`: `SELECT`, `INSERT`

The Go gate, SQL validator, and provisioning contract are therefore identical.

## Security regression coverage

The gate continues to reject missing required grants and unexpected table
grants, including `UPDATE` or `DELETE` on `floors` and `zones`. Existing tests
continue to cover elevated role attributes, protected-table ownership,
privileged-role inheritance, unsafe RLS state, missing secure preset-reader
execution, and direct access to `system_naming_presets`. PostgreSQL validation
also verifies that `TRUNCATE`, `REFERENCES`, and `TRIGGER` remain absent.

## Migration and deployment status

Migrations 027 through 032 are unchanged and no migration 033 is introduced.
The expected ledger remains 24 and the canonical schema fingerprint remains
`60792d2369485275cb3d75679d26e006af6292f2fbe70d48e76dcc71e17fd463`.

This hotfix has not been deployed. Production and the VPS were not accessed or
modified; deployment validation remains pending separate authorization.
