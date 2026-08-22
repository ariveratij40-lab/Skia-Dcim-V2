# Draft PR — PHASE-012 Main Promotion

- Base: `main`
- Head: `phase/012-main-promotion`
- Functional candidate: `92eac07c3931c30d198b8842ee458820bcba18d6`
- Evidence baseline: `a4541a8e50122de1810ac319289e432fd44d364c`
- Status: **DRAFT / BLOCKED — DO NOT MERGE**

The frontend, bootstrap, RLS and dark-deployment identity controls pass. The
mandatory backend suite panics in
`TestHandleInventoryImportRoutes_DetailValid`; see `BLOCKERS.md`. Merge requires
a corrective gate and complete green revalidation.
