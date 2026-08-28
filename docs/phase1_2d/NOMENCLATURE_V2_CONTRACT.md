# Nomenclature V2 contract

`system_naming_presets` contains global recommendations; `naming_rules` contains effective tenant configuration. A preset never generates an asset code directly.

Runtime reads recommendations only through `public.read_active_system_naming_presets(text[])`, the migration-024 SECURITY DEFINER projection. Runtime has no direct table privilege. The adapter validates a fixed AssetType allow-list and remains separate from tenant-rule application.

## Operations

1. List presets through a backend service running under controlled authority; runtime has no direct grant today.
2. Preview a preset/rule using pure segment assembly and explicit placeholders. Preview performs no lock, UPDATE or counter insert.
3. Apply recommended rules in one TenantTx. Create missing tenant rules; never silently overwrite used or customized rules. Return deterministic conflicts. The operation is idempotent and consumes no sequence.
4. Customize through the existing naming-rule admin contract.
5. Asset preview resolves Zone/Housing labels but never reserves.
6. Final creation alone calls the transactional sequence allocator and persists code, nomenclature ID and sequence.

## Apply-all service

`ApplyRecommendedNomenclature(ctx, TenantDB, tenantID, actorID)` is the domain operation used by one admin endpoint. It reads a reviewed preset version through a narrowly authorized repository, creates missing rules, reports used/custom conflicts, audits the decision, creates no assets and consumes no sequence. Runtime preset grant, backend exact allow-list and read path must be introduced atomically in the implementation phase.

Current code largely preserves preview purity (`buildReadinessRuleExample` and UI previews); `generateInternalCodeWithContext` reserves and therefore must never serve preview endpoints.
