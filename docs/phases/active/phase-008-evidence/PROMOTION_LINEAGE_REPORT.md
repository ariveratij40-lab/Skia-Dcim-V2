# PHASE-008 — Promotion lineage report

## Result

Stage A: **APROBADO**.

| Ref | Exact SHA |
|---|---|
| `main` audited baseline | `5b4f01e028508b1045aef1ecbb386947d627aac3` |
| PHASE-004 final lineage | `1f4b2e690bedd382c048e5b9f7bf8ec8d505d4bc` |
| PHASE-005 final lineage | `45e68b27435bcf9c1d241e177986a538a028f444` |
| PHASE-006 final lineage | `3a9aac33e4e479d0b98b54f7591645013aedc5d2` |
| PHASE-007 final approval | `96aacdbdc2e646c740430f8c0daf611a43cac439` |
| Candidate content baseline | `545fbe8048ed6eaf0488380948dd73fd0b1bfd52` |

The merge-base of `main` and PHASE-007 is exactly the audited `main` SHA.
PHASE-007 contains 69 commits not in `main`. Its approved integration mapping
selects PHASE-006 runtime/context, PHASE-004 branch enforcement semantics and
PHASE-005 canonical RLS tooling.

## Reproducible candidate mapping

The candidate is a clean branch from `main`, not a rewritten PHASE-007 branch:

```text
main 5b4f01e
  └─ candidate content 545fbe8
       ├─ backend + tenant lint == PHASE-007 approved trees
       ├─ ops/phase005 == PHASE-007 canonical RLS tree
       └─ PHASE-008 specification and CLI decision == published docs tree
```

Source mapping:

- PHASE-006 runtime/context source commits: `67e5fdd878543b81b98831c5e4a707f6e7405f53`
  and `27be9b64c658afcbcc74b233c5d132069817e8d7`.
- PHASE-004 runtime behavior: `01efd5099758d8ad85fc4bcdf4720c5e23e59270`;
  its final handler semantics are byte-equivalent to PHASE-006 `27be9b6` and
  are therefore represented once, not duplicated.
- PHASE-005 RLS sources: consolidated commits `03b4279` and `40c06b3`,
  corresponding to approved implementation/FK-guard lineage.
- PHASE-008 documents: published commits `2e29de7` and `d11b85b`.

Index-tree verification proved exact equality for `backend/`,
`tools/tenant_db_lint/` and `ops/phase005/` against PHASE-007. No runtime code
was manually edited during reconstruction.

## Scope audit

The complete PHASE-007 branch changes 111 files versus `main`, largely phase
history and PHASE-002 fixture/campaign tooling. Carrying all 69 commits would
put TEST fixture definitions into a promotion candidate. The clean candidate
instead contains 25 audited content files: approved backend/tests, tenant DB
lint, canonical RLS activation/rollback/validation, and PHASE-008 governance.

No unrelated runtime file, migration, Docker, Nginx, frontend, fixture script,
manifest, credential artifact or historical backup is included. Published
phase branches remain unchanged, so review separation did not rewrite or
discard history.
