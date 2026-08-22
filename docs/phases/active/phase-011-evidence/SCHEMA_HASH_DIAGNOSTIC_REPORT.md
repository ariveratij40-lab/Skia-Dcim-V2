# PHASE-011 — Schema Hash Diagnostic Report

## Final classification

**HASH_PROCEDURE_MISMATCH**

No production mutation occurred during this diagnostic.

## Versions and matrix

| Environment | pg_dump | bootstrap owner | Old hash | Unified hash |
|---|---:|---|---|---|
| Isolated production | 16.14 | `skia_migrator` | `d0d6e0541575a70bbca89ccb5786ac8f8144c34d1d5295c740c4db8a128ba827` | `521e1146bb3613bf251f61e362cb92e18c47a322f1931381752c6ceb9c4017f3` |
| Ephemeral run 1 | 16.14 | `skia_migrator` | `d0d6e0541575a70bbca89ccb5786ac8f8144c34d1d5295c740c4db8a128ba827` | `521e1146bb3613bf251f61e362cb92e18c47a322f1931381752c6ceb9c4017f3` |
| Ephemeral run 2 | 16.14 | `skia_migrator` | `d0d6e0541575a70bbca89ccb5786ac8f8144c34d1d5295c740c4db8a128ba827` | `521e1146bb3613bf251f61e362cb92e18c47a322f1931381752c6ceb9c4017f3` |
| Ephemeral matrix | 16.14 | admin | `d0d6e0541575a70bbca89ccb5786ac8f8144c34d1d5295c740c4db8a128ba827` | `521e1146bb3613bf251f61e362cb92e18c47a322f1931381752c6ceb9c4017f3` |
| PHASE-010-style matrix | 16.15 | admin | `61bdcf58f437c5ab4d5c48ad48b14c9ba1af3a0439eb7a04f22da9d4817f3792` | `521e1146bb3613bf251f61e362cb92e18c47a322f1931381752c6ceb9c4017f3` |
| Ephemeral matrix | 16.15 | `skia_migrator` | `61bdcf58f437c5ab4d5c48ad48b14c9ba1af3a0439eb7a04f22da9d4817f3792` | `521e1146bb3613bf251f61e362cb92e18c47a322f1931381752c6ceb9c4017f3` |

The old procedure removed only `\\restrict`/`\\unrestrict`. Its result is
sensitive to pg_dump 16.14 versus 16.15 output. Changing database owner does
not change either hash. The versioned unified normalizer removes transport,
comment and session metadata while retaining DDL and is stable across the
matrix.

## Manifest verification

All ten production ledger `(path, sha256)` pairs exactly match
`main@8139fc4c65c3cdacc9d7467285f3b3c4b977c7cb`. No bootstrap-source drift was
detected.

Per the gate, the portable hash is evidence only until a separate decision
authorizes it for Stage C/D continuation.
