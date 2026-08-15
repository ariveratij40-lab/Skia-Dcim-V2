# PHASE-007 — Consolidation lineage report

## Result

- Origin: LOCAL / Git read-only inventory.
- Execution branch: `phase/007-staging-consolidation-cleanup`.
- Selected base: `phase/006-runtime-role-context` at
  `3a9aac33e4e479d0b98b54f7591645013aedc5d2`.
- Strategy: **APPROVED — deterministic selective integration**.
- Semantic conflicts: none detected.

This report was established before integrating PHASE-005 or PHASE-004
artifacts into the execution branch.

## Branch tips

| Lineage | Tip | Classification |
|---|---|---|
| PHASE-002 tooling/fixtures | `16f5b34f83e723c2ca66dff43dbf5dab18293b29` | fixture tooling plus completed Campaign A evidence |
| PHASE-004 branch enforcement | `1f4b2e690bedd382c048e5b9f7bf8ec8d505d4bc` | runtime fix `01efd509` plus closure evidence |
| PHASE-005 canonical RLS | `45e68b27435bcf9c1d241e177986a538a028f444` | RLS tooling, runner hardening and activation/Campaign B evidence |
| PHASE-006 restricted runtime/context | `3a9aac33e4e479d0b98b54f7591645013aedc5d2` | final application/runtime lineage and cutover evidence |

## Merge-base and ancestry

| Pair | Merge-base |
|---|---|
| PHASE-004 / PHASE-005 | `5b4f01e028508b1045aef1ecbb386947d627aac3` |
| PHASE-004 / PHASE-006 | `5b4f01e028508b1045aef1ecbb386947d627aac3` |
| PHASE-005 / PHASE-006 | `c47c2e4ba2165557da5d381952dee4cfac50a938` |

No final tip is an ancestor of another final tip. PHASE-005 and PHASE-006 are
parallel after the initial PHASE-005 audit. PHASE-004 is a separate parallel
lineage from an earlier common baseline.

## Runtime-affecting changes

### PHASE-004

`01efd5099758d8ad85fc4bcdf4720c5e23e59270` introduced fail-closed branch
selection based on explicit `user_branches` mapping and its focused tests.

PHASE-006 later detected and corrected the same regression in
`27be9b64c658afcbcc74b233c5d132069817e8d7`. The complete
`branchSelectionDeps` and `handleSelectBranchWithDeps` block at both approved
commits is byte-identical. Therefore PHASE-006 contains the approved PHASE-004
runtime behavior; replaying `01efd509` would duplicate/supersede later code.

### PHASE-006

`67e5fdd878543b81b98831c5e4a707f6e7405f53` and `27be9b6` contain the final
application lineage:

- runtime/migrator DB separation and restricted-runtime startup gate;
- tenant/branch transactional context;
- tenant-wide semantics and contextual background/import jobs;
- scoped infrastructure and inventory operations;
- final branch mapping enforcement;
- focused runtime/context/job/branch tests and tenant DB lint updates.

The affected runtime files include `backend/main.go`, `database_roles.go`,
`tenant_context.go`, `job_context.go`, background/import/inventory handlers,
infrastructure/dashboard/rack handlers and their focused tests.

### PHASE-005

PHASE-005 does not contain the final PHASE-006 application code. Its approved
runtime-adjacent changes are operational tooling, not backend handlers:

- `05cc30798b163962428fe545201b5d9d09e245b1`: canonical RLS activation,
  rollback and local validation under `ops/phase005/`;
- `aa127cf58e42b3eaddd38d7550455ce06098f25b`: exact semantic FK guard;
- `d012f4f09a4fb6272a088f4e3ffd0352d0fa4799`: guaranteed runner termination
  evidence and local emission tests.

The remaining PHASE-005-only commits after the PHASE-005/006 merge-base are
architect decisions and evidence. They are required traceability but do not
replace PHASE-006 backend code.

## File-level integration decision

| Concern | Canonical source selected |
|---|---|
| Branch authorization | PHASE-006 final (`27be9b6`), semantically identical handler to PHASE-004 |
| Runtime/migrator separation | PHASE-006 final |
| Tenant/branch transaction context | PHASE-006 final |
| Background jobs/imports | PHASE-006 final |
| Canonical RLS tooling | PHASE-005 commits `05cc307` + `aa127cf` |
| Campaign runner termination evidence | PHASE-005 commit `d012f4f` |
| PHASE-004 historical evidence | copy exact files from PHASE-004 tip; do not replay superseded backend |
| PHASE-005 evidence | cherry-pick approved unique chain in original order |
| PHASE-007 specification | exact published document at `8d4f0fa` |

## Deterministic integration sequence

1. Base the branch on PHASE-006 final `3a9aac33`.
2. Add the published PHASE-007 specification and this report.
3. Cherry-pick the complete PHASE-005 unique chain from `387a9c6` through
   `45e68b2` in original order, resolving only mechanical documentation
   conflicts while retaining PHASE-006 runtime files.
4. Preserve PHASE-004 specification/evidence exactly from its final tip in a
   documentation-only integration commit; do not replay `01efd509` backend.
5. Validate all required focused/local suites and confirm no migration rewrite.

No approved runtime behavior is lost by this strategy. Selecting PHASE-005 as
base would lose PHASE-006 application code; selecting PHASE-004 would lose both
PHASE-006 runtime convergence and PHASE-005 RLS tooling. PHASE-006 is therefore
the only safe runtime base.
