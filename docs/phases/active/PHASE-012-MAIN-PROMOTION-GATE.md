# PHASE-012 — Main Promotion Gate

## Baselines

- Base: `main@8139fc4c65c3cdacc9d7467285f3b3c4b977c7cb`.
- Functional candidate: `92eac07c3931c30d198b8842ee458820bcba18d6`.
- PHASE-011 final evidence: `a4541a8e50122de1810ac319289e432fd44d364c`.
- Promotion branch: `phase/012-main-promotion`.

## Objective and boundary

Verify lineage, complete delta, clean backend/frontend validation,
bootstrap/RLS artifacts and deployed dark-candidate identity before requesting a
separate main merge approval. This phase does not authorize merge, rebuild,
redeploy, database/RLS mutation, Nginx enablement, DNS change or public traffic.

## Acceptance

All mandatory validations must pass. Any failure yields `BLOCKED`; a draft PR
may preserve review context but must not be represented as merge-ready.
