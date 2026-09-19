package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

type NomenclatureAcceptanceState string

const (
	AcceptanceCreatable            NomenclatureAcceptanceState = "CREATABLE"
	AcceptanceAlreadyAccepted      NomenclatureAcceptanceState = "ALREADY_ACCEPTED"
	AcceptanceLegacyExisting       NomenclatureAcceptanceState = "LEGACY_EXISTING"
	AcceptanceCustomizedPreserved  NomenclatureAcceptanceState = "CUSTOMIZED_PRESERVED"
	AcceptanceInactivePreserved    NomenclatureAcceptanceState = "INACTIVE_PRESERVED"
	AcceptanceIssuedPreserved      NomenclatureAcceptanceState = "ISSUED_PRESERVED"
	AcceptanceNewerPresetAvailable NomenclatureAcceptanceState = "NEWER_PRESET_AVAILABLE"
	AcceptancePresetUnavailable    NomenclatureAcceptanceState = "PRESET_UNAVAILABLE"
	AcceptanceConflict             NomenclatureAcceptanceState = "CONFLICT"
)

type NomenclatureDomainStatus string

const (
	NomenclatureSuccessCreated   NomenclatureDomainStatus = "SUCCESS_CREATED"
	NomenclatureSuccessExisting  NomenclatureDomainStatus = "SUCCESS_EXISTING"
	NomenclatureSuccessSuccessor NomenclatureDomainStatus = "SUCCESS_SUCCESSOR"
	NomenclaturePreservedOutcome NomenclatureDomainStatus = "PRESERVED_OUTCOME"
)

var (
	ErrNomenclatureUnauthorized          = errors.New("nomenclature_unauthorized")
	ErrNomenclaturePresetNotFound        = errors.New("nomenclature_preset_not_found")
	ErrNomenclaturePresetInactive        = errors.New("nomenclature_preset_inactive")
	ErrNomenclatureInvalidPreset         = errors.New("nomenclature_invalid_preset")
	ErrNomenclatureConflict              = errors.New("nomenclature_conflict")
	ErrNomenclatureConcurrentStateChange = errors.New("nomenclature_concurrent_state_change")
	ErrNomenclatureAudit                 = errors.New("nomenclature_audit_failure")
	ErrNomenclatureDB                    = errors.New("nomenclature_db_failure")
)

type AcceptPresetInput struct {
	AssetTypeCode string
	PresetVersion int
	OperationID   string
}
type CustomizeNomenclatureInput struct {
	AssetTypeCode, OperationID string
	Policy                     CanonicalNomenclaturePolicy
}
type NomenclatureDomainResult struct {
	Status       NomenclatureDomainStatus
	State        NomenclatureAcceptanceState
	RuleID       string
	RuleVersion  int
	AuditEventID string
}
type exactSystemPreset struct {
	LookupStatus, ID, Code, Description      string
	CustomSegment1Label, CustomSegment2Label string
	Policy                                   CanonicalNomenclaturePolicy
	Active                                   bool
}
type nomenclatureActor struct{ UserID, TenantID, Role, Email, Name string }
type nomenclatureRuleState struct {
	ID, SourceType, SourcePresetID   string
	SourcePresetVersion, RuleVersion int
	Active, Issued                   bool
}

func ReadExactSystemNamingPresetV2(ctx context.Context, tdb TenantDB, code string, version int) (exactSystemPreset, error) {
	var p exactSystemPreset
	var id, pcode, atype, prefix, sep, mode, scope, desc, c1, c2, l1, l2 sql.NullString
	var pv, digits sql.NullInt64
	var branch, building, floor, zone, distribution, housing, placement, active sql.NullBool
	err := tdb.QueryRowContext(ctx, `SELECT lookup_status,id,preset_code,asset_type_code,preset_version,prefix,separator,include_branch,include_building,include_floor,include_zone,include_distribution,include_housing,include_placement,context_mode,sequence_scope,seq_digits,custom_segment_1,custom_segment_2,custom_segment_1_label,custom_segment_2_label,description,active FROM public.read_system_naming_preset_v2($1,$2)`, strings.ToUpper(strings.TrimSpace(code)), version).Scan(&p.LookupStatus, &id, &pcode, &atype, &pv, &prefix, &sep, &branch, &building, &floor, &zone, &distribution, &housing, &placement, &mode, &scope, &digits, &c1, &c2, &l1, &l2, &desc, &active)
	if err != nil {
		return p, fmt.Errorf("%w: exact preset read", ErrNomenclatureDB)
	}
	if p.LookupStatus == "NOT_FOUND" {
		return p, ErrNomenclaturePresetNotFound
	}
	p.ID, p.Code, p.Description, p.Active = id.String, pcode.String, desc.String, active.Bool
	p.CustomSegment1Label, p.CustomSegment2Label = l1.String, l2.String
	p.Policy = CanonicalNomenclaturePolicy{AssetTypeCode: atype.String, Prefix: prefix.String, Separator: sep.String, ContextMode: mode.String, SequenceScope: scope.String, SequenceDigits: int(digits.Int64), IncludeBranch: branch.Bool, IncludeBuilding: building.Bool, IncludeFloor: floor.Bool, IncludeZone: zone.Bool, IncludeDistribution: distribution.Bool, IncludeHousing: housing.Bool, IncludePlacement: placement.Bool, CustomSegment1: c1.String, CustomSegment2: c2.String}
	if p.LookupStatus == "FOUND_INACTIVE" || !p.Active {
		return p, ErrNomenclaturePresetInactive
	}
	if p.LookupStatus != "FOUND_ACTIVE" || int(pv.Int64) != version || validateCanonicalNomenclaturePolicy(p.Policy) != nil {
		return p, ErrNomenclatureInvalidPreset
	}
	return p, nil
}

func resolveNomenclatureActor(ctx context.Context, tdb TenantDB, tenantID, actorID string) (nomenclatureActor, error) {
	var a nomenclatureActor
	err := tdb.QueryRowContext(ctx, `SELECT u.id,u.email,u.name,r.name FROM users u JOIN user_tenants ut ON ut.user_id=u.id AND ut.tenant_id=$1 JOIN tenants t ON t.id=ut.tenant_id AND t.status='active' JOIN user_roles ur ON ur.user_id=u.id AND ur.tenant_id=$1 JOIN roles r ON r.id=ur.role_id WHERE u.id=$2 AND u.status='active' AND r.name IN ('admin','super_admin') AND (r.tenant_id=$1 OR (r.tenant_id IS NULL AND r.is_global AND r.name='super_admin')) ORDER BY CASE r.name WHEN 'super_admin' THEN 0 ELSE 1 END LIMIT 1`, tenantID, actorID).Scan(&a.UserID, &a.Email, &a.Name, &a.Role)
	if errors.Is(err, sql.ErrNoRows) {
		return a, ErrNomenclatureUnauthorized
	}
	if err != nil {
		return a, fmt.Errorf("%w: actor authority", ErrNomenclatureDB)
	}
	a.TenantID = tenantID
	a.Email = strings.ToLower(strings.TrimSpace(a.Email))
	a.Name = strings.TrimSpace(a.Name)
	if a.Name == "" {
		return a, ErrNomenclatureUnauthorized
	}
	return a, nil
}
func lockNomenclatureAuthority(ctx context.Context, tdb TenantDB, tenantID, code string) error {
	_, err := tdb.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, tenantID+":"+code)
	if err != nil {
		return fmt.Errorf("%w: authority lock", ErrNomenclatureDB)
	}
	return nil
}
func loadNomenclatureLineage(ctx context.Context, tdb TenantDB, tenantID, code string) ([]nomenclatureRuleState, error) {
	rows, err := tdb.QueryContext(ctx, `SELECT r.id,r.rule_version,r.active,r.source_type,
		COALESCE(r.source_preset_id::text,''),COALESCE(r.source_preset_version,0),
		(r.last_seq>0
		 OR EXISTS(SELECT 1 FROM assets a WHERE a.nomenclature_id=r.id)
		 OR EXISTS(SELECT 1 FROM nomenclature_branch_counters c WHERE c.nomenclature_id=r.id AND c.last_seq>0)
		 OR EXISTS(SELECT 1 FROM nomenclature_counters c WHERE c.nomenclature_id=r.id AND c.last_seq>0))
		FROM naming_rules r WHERE r.tenant_id=$1 AND r.asset_type_code=$2
		ORDER BY r.rule_version,r.id FOR UPDATE OF r`, tenantID, code)
	if err != nil {
		return nil, fmt.Errorf("%w: lock lineage", ErrNomenclatureDB)
	}
	defer rows.Close()
	var out []nomenclatureRuleState
	for rows.Next() {
		var r nomenclatureRuleState
		if err := rows.Scan(&r.ID, &r.RuleVersion, &r.Active, &r.SourceType, &r.SourcePresetID, &r.SourcePresetVersion, &r.Issued); err != nil {
			return nil, fmt.Errorf("%w: scan lineage", ErrNomenclatureDB)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("%w: iterate lineage", ErrNomenclatureDB)
	}
	return out, nil
}
func acceptanceSnapshot(a nomenclatureActor) ([]byte, error) {
	return json.Marshal(map[string]interface{}{"schema_version": 1, "user_id": a.UserID, "tenant_id": a.TenantID, "role": a.Role, "email": a.Email, "name": a.Name})
}

func insertNomenclatureRule(ctx context.Context, tdb TenantDB, tenantID string, version int, parentID *string, p CanonicalNomenclaturePolicy, labels [2]string, source string, presetID *string, presetVersion *int, actor *nomenclatureActor, customized bool) (string, error) {
	id := uuid.NewString()
	var parent, sp, sv, accepted, snapshot interface{}
	if parentID != nil {
		parent = *parentID
	}
	if presetID != nil {
		sp = *presetID
	}
	if presetVersion != nil {
		sv = *presetVersion
	}
	if actor != nil && source != "CUSTOM" {
		b, e := acceptanceSnapshot(*actor)
		if e != nil {
			return "", fmt.Errorf("%w: snapshot", ErrNomenclatureDB)
		}
		accepted = actor.UserID
		snapshot = string(b)
	}
	_, err := tdb.ExecContext(ctx, `INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_location,seq_digits,reset_per_location,last_seq,custom_segment_1,custom_segment_2,custom_segment_1_label,custom_segment_2_label,include_placement,include_site,include_internal_area,rule_version,supersedes_rule_id,context_mode,include_zone,include_floor,include_distribution,include_housing,sequence_scope,source_type,source_preset_id,source_preset_version,accepted_by,accepted_at,accepted_by_snapshot,customized_after_acceptance,active) VALUES($1,$2,$3,$4,$5,$6,false,$7,false,0,NULLIF($8,''),NULLIF($9,''),NULLIF($27,''),NULLIF($28,''),$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::uuid,CASE WHEN $24::uuid IS NULL THEN NULL ELSE transaction_timestamp() END,$25::jsonb,$26,true)`, id, tenantID, p.AssetTypeCode, p.Prefix, p.Separator, p.IncludeBranch, p.SequenceDigits, p.CustomSegment1, p.CustomSegment2, p.IncludePlacement, p.IncludeBuilding, p.IncludeInternalArea, version, parent, p.ContextMode, p.IncludeZone, p.IncludeFloor, p.IncludeDistribution, p.IncludeHousing, p.SequenceScope, source, sp, sv, accepted, snapshot, customized, labels[0], labels[1])
	if err != nil {
		return "", fmt.Errorf("%w: insert rule", ErrNomenclatureDB)
	}
	return id, nil
}
func writeNomenclatureAudit(ctx context.Context, tdb TenantDB, op, rule string, presetID *string, action string) (string, error) {
	var preset interface{}
	if presetID != nil {
		preset = *presetID
	}
	var event string
	err := tdb.QueryRowContext(ctx, `SELECT public.write_nomenclature_onboarding_audit($1::uuid,$2::uuid,$3::uuid,$4::public.nomenclature_onboarding_audit_action)`, op, rule, preset, action).Scan(&event)
	if err != nil {
		return "", ErrNomenclatureAudit
	}
	return event, nil
}
func validateAcceptanceInput(code string, version int, op string) (string, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if _, ok := supportedSystemPresetTypes[code]; !ok || version <= 0 {
		return "", ErrNomenclatureInvalidPreset
	}
	u, e := uuid.Parse(op)
	if e != nil || u == uuid.Nil {
		return "", ErrNomenclatureConflict
	}
	return code, nil
}

func AcceptNomenclaturePreset(ctx context.Context, tdb TenantDB, tenantID, actorID string, in AcceptPresetInput) (NomenclatureDomainResult, error) {
	var zero NomenclatureDomainResult
	trustedActor, trustedTenant, _, authenticated := TenantIdentityFromContext(ctx)
	if !authenticated || trustedActor != actorID || trustedTenant != tenantID || tdb == nil {
		return zero, ErrNomenclatureUnauthorized
	}
	code, err := validateAcceptanceInput(in.AssetTypeCode, in.PresetVersion, in.OperationID)
	if err != nil {
		return zero, err
	}
	actor, err := resolveNomenclatureActor(ctx, tdb, tenantID, actorID)
	if err != nil {
		return zero, err
	}
	preset, err := ReadExactSystemNamingPresetV2(ctx, tdb, code, in.PresetVersion)
	if err != nil {
		return zero, err
	}
	if err = lockNomenclatureAuthority(ctx, tdb, tenantID, code); err != nil {
		return zero, err
	}
	lineage, err := loadNomenclatureLineage(ctx, tdb, tenantID, code)
	if err != nil {
		return zero, err
	}
	var active *nomenclatureRuleState
	for i := range lineage {
		if lineage[i].Active {
			if active != nil {
				return zero, ErrNomenclatureConcurrentStateChange
			}
			active = &lineage[i]
		}
	}
	if active == nil && len(lineage) > 0 {
		r := lineage[len(lineage)-1]
		return NomenclatureDomainResult{Status: NomenclaturePreservedOutcome, State: AcceptanceInactivePreserved, RuleID: r.ID, RuleVersion: r.RuleVersion}, nil
	}
	if active == nil {
		v := in.PresetVersion
		id, e := insertNomenclatureRule(ctx, tdb, tenantID, 1, nil, preset.Policy, [2]string{preset.CustomSegment1Label, preset.CustomSegment2Label}, "PRESET", &preset.ID, &v, &actor, false)
		if e != nil {
			return zero, e
		}
		audit, e := writeNomenclatureAudit(ctx, tdb, in.OperationID, id, &preset.ID, "NOMENCLATURE_PRESET_ACCEPTED")
		if e != nil {
			return zero, e
		}
		return NomenclatureDomainResult{Status: NomenclatureSuccessCreated, State: AcceptanceCreatable, RuleID: id, RuleVersion: 1, AuditEventID: audit}, nil
	}
	r := NomenclatureDomainResult{RuleID: active.ID, RuleVersion: active.RuleVersion}
	if active.SourceType == "PRESET" && active.SourcePresetID == preset.ID && active.SourcePresetVersion == in.PresetVersion {
		r.Status = NomenclatureSuccessExisting
		r.State = AcceptanceAlreadyAccepted
		return r, nil
	}
	if active.SourceType == "LEGACY_UNATTRIBUTED" {
		r.Status = NomenclaturePreservedOutcome
		r.State = AcceptanceLegacyExisting
		return r, nil
	}
	if active.SourceType == "CUSTOM" || active.SourceType == "DERIVED_FROM_PRESET" {
		r.Status = NomenclaturePreservedOutcome
		r.State = AcceptanceCustomizedPreserved
		a, e := writeNomenclatureAudit(ctx, tdb, in.OperationID, active.ID, &preset.ID, "NOMENCLATURE_PRESET_PRESERVED_CONFLICT")
		if e != nil {
			return zero, e
		}
		r.AuditEventID = a
		return r, nil
	}
	if active.Issued {
		r.Status = NomenclaturePreservedOutcome
		r.State = AcceptanceIssuedPreserved
		a, e := writeNomenclatureAudit(ctx, tdb, in.OperationID, active.ID, &preset.ID, "NOMENCLATURE_PRESET_PRESERVED_CONFLICT")
		if e != nil {
			return zero, e
		}
		r.AuditEventID = a
		return r, nil
	}
	if active.SourceType == "PRESET" && in.PresetVersion > active.SourcePresetVersion {
		if _, e := tdb.ExecContext(ctx, `UPDATE naming_rules SET active=false,updated_at=transaction_timestamp() WHERE id=$1 AND tenant_id=$2 AND active`, active.ID, tenantID); e != nil {
			return zero, fmt.Errorf("%w: deactivate predecessor", ErrNomenclatureDB)
		}
		v := in.PresetVersion
		id, e := insertNomenclatureRule(ctx, tdb, tenantID, active.RuleVersion+1, &active.ID, preset.Policy, [2]string{preset.CustomSegment1Label, preset.CustomSegment2Label}, "PRESET", &preset.ID, &v, &actor, false)
		if e != nil {
			return zero, e
		}
		audit, e := writeNomenclatureAudit(ctx, tdb, in.OperationID, id, &preset.ID, "NOMENCLATURE_PRESET_UPDATE_ACCEPTED")
		if e != nil {
			return zero, e
		}
		return NomenclatureDomainResult{Status: NomenclatureSuccessSuccessor, State: AcceptanceNewerPresetAvailable, RuleID: id, RuleVersion: active.RuleVersion + 1, AuditEventID: audit}, nil
	}
	r.Status = NomenclaturePreservedOutcome
	r.State = AcceptanceConflict
	return r, ErrNomenclatureConflict
}

func CustomizeNomenclatureRule(ctx context.Context, tdb TenantDB, tenantID, actorID string, in CustomizeNomenclatureInput) (NomenclatureDomainResult, error) {
	var zero NomenclatureDomainResult
	trustedActor, trustedTenant, _, authenticated := TenantIdentityFromContext(ctx)
	if !authenticated || trustedActor != actorID || trustedTenant != tenantID || tdb == nil {
		return zero, ErrNomenclatureUnauthorized
	}
	code, err := validateAcceptanceInput(in.AssetTypeCode, 1, in.OperationID)
	if err != nil {
		return zero, err
	}
	in.Policy.AssetTypeCode = code
	if validateCanonicalNomenclaturePolicy(in.Policy) != nil {
		return zero, ErrNomenclatureInvalidPreset
	}
	actor, err := resolveNomenclatureActor(ctx, tdb, tenantID, actorID)
	if err != nil {
		return zero, err
	}
	if err = lockNomenclatureAuthority(ctx, tdb, tenantID, code); err != nil {
		return zero, err
	}
	lineage, err := loadNomenclatureLineage(ctx, tdb, tenantID, code)
	if err != nil {
		return zero, err
	}
	var active *nomenclatureRuleState
	for i := range lineage {
		if lineage[i].Active {
			if active != nil {
				return zero, ErrNomenclatureConcurrentStateChange
			}
			active = &lineage[i]
		}
	}
	version := 1
	var parent, presetID *string
	var presetVersion *int
	source := "CUSTOM"
	var snapshotActor *nomenclatureActor
	if active != nil {
		if active.Issued {
			return NomenclatureDomainResult{
				Status:      NomenclaturePreservedOutcome,
				State:       AcceptanceIssuedPreserved,
				RuleID:      active.ID,
				RuleVersion: active.RuleVersion,
			}, nil
		}
		version = active.RuleVersion + 1
		parent = &active.ID
		if active.SourceType == "PRESET" || active.SourceType == "DERIVED_FROM_PRESET" {
			source = "DERIVED_FROM_PRESET"
			presetID = &active.SourcePresetID
			v := active.SourcePresetVersion
			presetVersion = &v
			snapshotActor = &actor
		}
		if _, e := tdb.ExecContext(ctx, `UPDATE naming_rules SET active=false,updated_at=transaction_timestamp() WHERE id=$1 AND tenant_id=$2 AND active`, active.ID, tenantID); e != nil {
			return zero, fmt.Errorf("%w: deactivate predecessor", ErrNomenclatureDB)
		}
	}
	id, err := insertNomenclatureRule(ctx, tdb, tenantID, version, parent, in.Policy, [2]string{}, source, presetID, presetVersion, snapshotActor, source == "DERIVED_FROM_PRESET")
	if err != nil {
		return zero, err
	}
	audit, err := writeNomenclatureAudit(ctx, tdb, in.OperationID, id, presetID, "NOMENCLATURE_RULE_CUSTOMIZED")
	if err != nil {
		return zero, err
	}
	status := NomenclatureSuccessCreated
	if parent != nil {
		status = NomenclatureSuccessSuccessor
	}
	return NomenclatureDomainResult{Status: status, State: AcceptanceCreatable, RuleID: id, RuleVersion: version, AuditEventID: audit}, nil
}
