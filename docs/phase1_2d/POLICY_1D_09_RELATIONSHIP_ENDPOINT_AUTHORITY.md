# POLICY-1D-09 — Relationship endpoint authority

Status: `APPROVED`.

`RELATIONSHIP_ONLY` may connect endpoints in the same Branch or different Branches of the same Tenant. Every endpoint is resolved independently from its asset identity. It must exist, be active, belong to the authenticated Tenant, have an authoritative Branch, be an allowed endpoint type and have active `user_branches` membership for the authenticated user.

Cross-Tenant relationships are always forbidden. Client `tenant_id`, `branch_id`, `origin_branch_id` and `destination_branch_id` are never authorization inputs.

For the currently proven Backbone contract, the allowed endpoint types are MDF and IDF. Migration 004 describes `origin_id` and `destination_id` as MDF/IDF endpoints; no broader endpoint matrix is evidenced. Fiber/backbone uses this subset. Other passive cabling relationship types remain deferred until a canonical type/handler contract exists.

`backbone_links.branch_id` is retained as legacy/current relationship context. It does not prove either endpoint's ownership or authorization and cannot replace the two endpoint checks.

The domain resolver can prove same-Tenant dual-Branch membership. A normal `RequireTenantTx` carries one active Branch and FORCE RLS may hide the second Branch's assets. Therefore HTTP inter-Branch creation must use an established server-authorized dual-Branch scope or fail with a deterministic authority requirement. It must never widen scope from client input. No schema change is part of this decision.
