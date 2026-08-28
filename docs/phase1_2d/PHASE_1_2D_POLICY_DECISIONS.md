# Phase 1.2D policy decisions

All eight decisions were reviewed and approved. The authoritative details are recorded in `PHASE_1_2D_POLICY_APPROVAL.md`.

## POLICY-1D-01 — UPS placement — APPROVED_WITH_CHANGES

- **Question:** May UPS be floor/Zone-standing or must it use Housing?
- **Current:** UPS has no structured `rack_id`; layout stores it in `assets.specs`.
- **Risk:** false Housing readiness and competing JSON authority.
- **Options:** always HOUSING; always ZONE; controlled mode by subtype.
- **Decision:** default ZONE unless authoritative type/subtype metadata requires HOUSING. Rack/cabinet-mounted UPS may use HOUSING. Backend policy resolution is authoritative; UI asks only when metadata is insufficient.
- **Compatibility:** legacy JSON is read-only compatibility, never V2 authority. **Backend:** resolver selects policy. **Frontend:** no unnecessary mode prompt. **DB:** no 1.2D schema change. **Security:** scope either reference. **Tests:** both modes, spoofing, rollback.

## POLICY-1D-02 — MDF/IDF canonical placement cutover — APPROVED

- **Question:** Must new MDF/IDF use `locations.zone_id` immediately?
- **Current:** Site+InternalArea mandatory; `internal_area_id` written.
- **Risk:** V2 Zone never becomes authority.
- **Options:** hard cutover; dual-write; V2 write plus legacy read.
- **Recommended:** new V2 writes require Zone and set `zone_id`; legacy rows dual-read without inferred rewrite.
- **Compatibility:** existing rows remain. **Backend:** new Zone resolver. **Frontend:** Zone selector. **DB:** none. **Security:** scoped FK/RLS. **Tests:** legacy/V2 and cross-scope.

## POLICY-1D-03 — MDF/IDF prerequisite — APPROVED

- **Question:** Which assets require a distribution parent?
- **Current:** all installable types require an MDF/IDF/WAREHOUSE Location; only Rack has `mdf_idf_id`.
- **Risk:** endpoints/AC/CCTV are forced into telecom hierarchy.
- **Options:** universal; metadata driven; handler-specific.
- **Recommended:** metadata driven; MDF_IDF and HOUSING imply a distribution chain, ZONE does not.
- **Compatibility:** V1 handlers continue until migrated. **Backend:** shared policy service. **Frontend:** conditional selectors. **DB:** populate reviewed metadata later. **Security:** resolve parent in scope. **Tests:** required/not-required cases.

## POLICY-1D-04 — Housing vocabulary and compatibility — APPROVED

- **Question:** How is Cabinet exposed while storage remains `racks`?
- **Current:** APIs/UI universally say Rack; 023 adds `housing_type`.
- **Risk:** Cabinet is invisible or treated as a Rack subtype accidentally.
- **Options:** rename everything; parallel table; domain alias.
- **Recommended:** Housing DTO with `housing_id/type`; retain `rack_id` alias and `racks` table.
- **Compatibility:** additive DTO. **Backend:** shared Housing resolver. **Frontend:** label by type. **DB:** none. **Security:** scoped ID. **Tests:** RACK/CABINET parity.

## POLICY-1D-05 — Equipment operational readiness — APPROVED_WITH_CHANGES

- **Question:** Does creation fail or create inactive when prerequisites are absent?
- **Current:** invalid placement fails; WAREHOUSE forces inactive.
- **Risk:** inconsistent active assets.
- **Options:** reject; draft/inactive; auto-parent.
- **Decision:** reject operational creation and never auto-create parents. No generic Draft/inactive workflow is introduced in 1.2D unless an existing safe semantic is separately proven.
- **Compatibility:** current specialized handlers remain strict. **Backend:** deterministic reason codes. **Frontend:** block with CTA. **DB:** none. **Security:** no bypass. **Tests:** rejection, warehouse compatibility and rollback.

## POLICY-1D-06 — Preset acceptance semantics — APPROVED_WITH_CHANGES

- **Question:** What happens to existing tenant rules on apply-all?
- **Current:** presets empty/inaccessible; used rules structurally immutable.
- **Risk:** overwriting issued-code semantics.
- **Options:** overwrite; skip; conflict/version.
- **Decision:** transactionally create missing rules, preserve issued/custom rules, report deterministic conflicts, remain idempotent and consume no asset sequence.
- **Compatibility:** preserve all issued rules. **Backend:** transactional service. **Frontend:** result summary. **DB:** grant/read path later, no schema assumed. **Security:** admin only. **Tests:** repeat, conflict, rollback, no sequence use.

## POLICY-1D-07 — Readiness decomposition — APPROVED_WITH_CHANGES

- **Question:** Must onboarding require MDF/IDF or Housing?
- **Current:** requires Site, Area and MDF/IDF; Rack optional.
- **Risk:** artificial hierarchy for non-telecom tenants.
- **Options:** current universal gates; Branch+Zone; intent-selected profile.
- **Decision:** expose separately derived PHYSICAL_STRUCTURE_READINESS, INITIAL_ONBOARDING_READINESS and ASSET_TYPE_CREATION_READINESS; do not persist generic booleans.
- **Compatibility:** V1 endpoint must be versioned or response evolved deliberately. **Backend:** two readiness views. **Frontend:** choose intent. **DB:** none. **Security:** session scope. **Tests:** no Building/Floor/Rack.

## POLICY-1D-08 — TechnicalRoom/InternalArea lifecycle — APPROVED

- **Question:** Can either remain writable in V2?
- **Current:** InternalArea is active authority; TechnicalRoom is hierarchy/catalog compatibility.
- **Risk:** three physical authorities.
- **Options:** keep all; freeze new writes; immediate removal.
- **Recommended:** freeze TechnicalRoom for V2; retain legacy reads. InternalArea remains dual-read only after Zone cutover, with no removal in 1.2D.
- **Compatibility:** preserve rows/endpoints until consumers migrate. **Backend:** provenance flags. **Frontend:** stop offering them in V2 forms. **DB:** none. **Security:** existing RLS remains. **Tests:** legacy visibility and no V2 dependency.
