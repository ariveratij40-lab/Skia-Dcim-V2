# Readiness V2 contract

Readiness is derived on demand; no `is_ready`/`setup_complete` column is introduced.

## Approved derived contracts

`PhysicalInfrastructureReadinessV2` contains Branch identity, three separate readiness views, blockers and actionable targets. Every result is scoped by session Tenant/Branch and computed in TenantDB. None is persisted as a generic boolean.

### Physical structure readiness

Required: authenticated accessible Tenant/Branch and at least one usable canonical Zone. Building and Floor are optional. MDF/IDF and Housing are not universal requirements.

### Initial onboarding readiness

Uses physical-structure readiness plus the minimum configuration required to enter normal V2 operation. It does not impose irrelevant telecom hierarchy. An effective naming rule is evaluated for the user's chosen first AssetType rather than as a universal physical prerequisite.

### AssetType creation readiness

For each type derive: active AssetType metadata; effective naming rule; required Zone; required MDF/IDF; required Housing; catalogs needed by its actual handler; and whether the final transaction can legally resolve all references. Values: `READY`, `BLOCKED_CONFIGURATION`, `BLOCKED_PLACEMENT`, `UNSUPPORTED_CONTRACT`.

## Computation

- Branch: authorized active membership/session.
- Zone: active row visible under FORCE RLS.
- MDF/IDF: canonical V2 Location with Zone, or explicit `LEGACY_COMPATIBLE` for existing rows.
- Housing: active RACK/CABINET with consistent asset, branch and parent.
- Naming: active tenant rule; presets are suggestions, not readiness.
- AssetType metadata: missing values produce `UNSUPPORTED_CONTRACT`, never guessed.

Current `/api/dcim/readiness` remains V1 until the V2 response is implemented or explicitly versioned. It currently requires Site/Area/MDF universally and must not be relabeled V2.
