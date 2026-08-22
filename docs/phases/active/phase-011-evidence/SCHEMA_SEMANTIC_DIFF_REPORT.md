# PHASE-011 — Schema Semantic Diff Report

## Result

**SEMANTIC EQUALITY PROVEN; ZERO SEMANTIC DIFFS**

Production and both exact PostgreSQL 16.14 ephemeral reproductions produced
identical counts and hashes in every populated category:

| Category | Count | Semantic MD5 |
|---|---:|---|
| columns | 553 | `1e0695f7dd7d3b2fd21d902070de2511` |
| constraints | 225 | `3dd157ffc9ac401ea0ca2c2f9e3c777d` |
| extensions | 1 | `b1324228f43db2f24ff3117a70c93f8f` |
| functions | 11 | `8ebf8ec05bc09db5aebc9324d74ebd99` |
| indexes | 160 | `89038a585d0e6bd1ee83a4fe80499b2d` |
| bootstrap ledger | 10 | `a475f801721833b4ece97520678619d4` |
| RLS table flags | 58 | `201faa768c04636b6f1c2b01d04606fb` |
| sequences | 8 | `157e3b6914c86edac3f1b585122b0fd1` |
| triggers | 2 | `87adedbb4739ed0cd99294c9d9426614` |

Policy count is zero in production and references, as expected before Stage D.
RLS on `assets`, `asset_logs` and `asset_relationships` remains off/off.

The comparison includes types, nullability, defaults, generated/identity
metadata, constraint definitions/actions, index expressions, sequence
properties, extension versions, function/trigger definitions, RLS flags,
policies and exact ledger checksums.

No object-level semantic drift was found. The only observed difference is
non-semantic pg_dump representation between patch versions 16.14 and 16.15.
