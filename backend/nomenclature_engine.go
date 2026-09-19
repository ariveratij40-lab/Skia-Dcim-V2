package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	NomenclatureContextLegacyInternalArea    = "LEGACY_INTERNAL_AREA"
	NomenclatureContextCanonicalZone         = "CANONICAL_ZONE"
	NomenclatureContextCanonicalDistribution = "CANONICAL_DISTRIBUTION"
	NomenclatureContextCanonicalHousing      = "CANONICAL_HOUSING"

	NomenclatureSequenceBranch       = "BRANCH"
	NomenclatureSequencePlacement    = "PLACEMENT"
	NomenclatureSequenceDistribution = "DISTRIBUTION"
)

var (
	ErrInvalidNomenclatureComponent = errors.New("invalid nomenclature component")
	ErrNomenclatureCodeTooLong      = errors.New("nomenclature code exceeds 100 bytes")
	ErrInvalidNomenclatureContext   = errors.New("invalid nomenclature context")
	ErrInvalidSequenceScope         = errors.New("invalid nomenclature sequence scope")
	atomicNomenclatureComponent     = regexp.MustCompile(`^[A-Z0-9][A-Z0-9._/]*$`)
)

// CanonicalNomenclaturePolicy is the single application vocabulary shared by
// preview and committed generation. It mirrors the Migration 036 rule fields;
// IncludeBuilding intentionally maps to the historical naming_rules.include_site
// column until that compatibility name is retired by a separately authorized gate.
type CanonicalNomenclaturePolicy struct {
	RuleID, AssetTypeCode, Prefix, Separator string
	ContextMode, SequenceScope               string
	SequenceDigits                           int
	IncludeBranch, IncludeBuilding           bool
	IncludeFloor, IncludeZone                bool
	IncludeDistribution, IncludeHousing      bool
	IncludePlacement, IncludeInternalArea    bool
	CustomSegment1, CustomSegment2           string
	LastSequence                             int
}

// CanonicalNomenclatureInput contains only authenticated scope and canonical
// identifiers. Codes are always resolved from the database, never accepted as
// authoritative input.
type CanonicalNomenclatureInput struct {
	TenantID, ActorID, BranchID, AssetTypeCode string
	ZoneID, DistributionID, HousingRackID      string
	PlacementID                                string
	Policy                                     CanonicalNomenclaturePolicy

	// Compatibility values are already-resolved server objects used by current
	// MDF/IDF and installable-asset callers. They are never populated from JSON.
	Placement        *ResolvedPlacement
	PhysicalLocation *ResolvedPhysicalLocation
	CanonicalZone    *CanonicalZone
}

type CanonicalNomenclatureComponents struct {
	Prefix, Branch, Building, Floor, Zone string
	InternalArea                          string
	Distribution, Housing, Placement      string
	CustomSegment1, CustomSegment2        string
	DistributionLocationID                string
	PlacementLocationID                   string
}

type CanonicalNomenclatureResolution struct {
	Components   CanonicalNomenclatureComponents
	Zone         *CanonicalZone
	Distribution *DistributionPoint
	Housing      *Housing
	Placement    *ResolvedPlacement
}

type CanonicalNomenclaturePreview struct {
	PresetOrRuleIdentity string                          `json:"preset_or_rule_identity"`
	ContextMode          string                          `json:"context_mode"`
	SequenceScope        string                          `json:"sequence_scope"`
	ResolvedComponents   CanonicalNomenclatureComponents `json:"resolved_components"`
	CodeTemplate         string                          `json:"code_template"`
	IllustrativeCode     string                          `json:"illustrative_code"`
	IllustrativeSequence int                             `json:"illustrative_sequence"`
	SequenceReserved     bool                            `json:"sequence_reserved"`
	Volatile             bool                            `json:"volatile"`
	Warnings             []string                        `json:"warnings"`
}

func loadCanonicalNomenclaturePolicy(ctx context.Context, tdb TenantDB, tenantID, assetTypeCode, contextMode string, lock bool) (CanonicalNomenclaturePolicy, error) {
	if tdb == nil || strings.TrimSpace(tenantID) == "" || strings.TrimSpace(assetTypeCode) == "" {
		return CanonicalNomenclaturePolicy{}, ErrInvalidNomenclatureContext
	}
	query := `SELECT id,asset_type_code,prefix,separator,seq_digits,last_seq,
		include_branch,include_site,include_floor,include_zone,include_distribution,
		include_housing,include_placement,include_internal_area,context_mode,sequence_scope,
		COALESCE(custom_segment_1,''),COALESCE(custom_segment_2,'')
		FROM naming_rules WHERE tenant_id=$1 AND asset_type_code=$2 AND active=TRUE`
	args := []interface{}{tenantID, strings.ToUpper(strings.TrimSpace(assetTypeCode))}
	if contextMode != "" {
		query += ` AND context_mode=$3`
		args = append(args, contextMode)
	}
	if lock {
		query += ` FOR UPDATE`
	}
	var p CanonicalNomenclaturePolicy
	err := tdb.QueryRowContext(ctx, query, args...).Scan(
		&p.RuleID, &p.AssetTypeCode, &p.Prefix, &p.Separator, &p.SequenceDigits, &p.LastSequence,
		&p.IncludeBranch, &p.IncludeBuilding, &p.IncludeFloor, &p.IncludeZone, &p.IncludeDistribution,
		&p.IncludeHousing, &p.IncludePlacement, &p.IncludeInternalArea, &p.ContextMode, &p.SequenceScope,
		&p.CustomSegment1, &p.CustomSegment2,
	)
	if errors.Is(err, sql.ErrNoRows) {
		if contextMode == NomenclatureContextCanonicalZone {
			return CanonicalNomenclaturePolicy{}, ErrCanonicalZoneNamingRequired
		}
		return CanonicalNomenclaturePolicy{}, ErrNomenclatureRequired
	}
	if err != nil {
		return CanonicalNomenclaturePolicy{}, fmt.Errorf("load canonical nomenclature policy: %w", err)
	}
	return p, validateCanonicalNomenclaturePolicy(p)
}

func validateCanonicalNomenclaturePolicy(p CanonicalNomenclaturePolicy) error {
	if p.SequenceDigits < 2 || p.SequenceDigits > 6 {
		return ErrInvalidNomenclatureComponent
	}
	switch p.ContextMode {
	case NomenclatureContextLegacyInternalArea:
		if p.IncludeZone || p.IncludeDistribution || p.IncludeHousing {
			return ErrInvalidNomenclatureContext
		}
	case NomenclatureContextCanonicalZone:
		if !p.IncludeZone || p.IncludeInternalArea || p.IncludeDistribution || p.IncludeHousing || p.IncludePlacement {
			return ErrInvalidNomenclatureContext
		}
	case NomenclatureContextCanonicalDistribution:
		if !p.IncludeDistribution || p.IncludeInternalArea || p.IncludeHousing || p.IncludePlacement {
			return ErrInvalidNomenclatureContext
		}
	case NomenclatureContextCanonicalHousing:
		if !p.IncludeHousing || p.IncludeInternalArea || p.IncludePlacement {
			return ErrInvalidNomenclatureContext
		}
	default:
		return ErrInvalidNomenclatureContext
	}
	switch p.SequenceScope {
	case NomenclatureSequenceBranch:
	case NomenclatureSequencePlacement:
		if !p.IncludePlacement {
			return ErrInvalidSequenceScope
		}
	case NomenclatureSequenceDistribution:
		if !p.IncludeDistribution {
			return ErrInvalidSequenceScope
		}
	default:
		return ErrInvalidSequenceScope
	}
	if p.IncludeHousing && p.IncludePlacement {
		return ErrInvalidNomenclatureContext
	}
	return nil
}

func ResolveCanonicalNomenclature(ctx context.Context, tdb TenantDB, in CanonicalNomenclatureInput) (CanonicalNomenclatureResolution, error) {
	if tdb == nil || strings.TrimSpace(in.TenantID) == "" || strings.TrimSpace(in.BranchID) == "" || strings.TrimSpace(in.AssetTypeCode) == "" {
		return CanonicalNomenclatureResolution{}, ErrInvalidNomenclatureContext
	}
	p := in.Policy
	if err := validateCanonicalNomenclaturePolicy(p); err != nil {
		return CanonicalNomenclatureResolution{}, err
	}
	r := CanonicalNomenclatureResolution{Components: CanonicalNomenclatureComponents{
		Prefix: p.Prefix, CustomSegment1: p.CustomSegment1, CustomSegment2: p.CustomSegment2,
	}}
	if p.IncludeBranch {
		if err := tdb.QueryRowContext(ctx, `SELECT code FROM branches WHERE id=$1 AND tenant_id=$2 AND status='active'`, in.BranchID, in.TenantID).Scan(&r.Components.Branch); err != nil {
			return CanonicalNomenclatureResolution{}, fmt.Errorf("resolve canonical branch: %w", err)
		}
	}
	scope := PhysicalScope{TenantID: in.TenantID, BranchID: in.BranchID}
	resolveZone := func(zoneID string) (*CanonicalZone, error) {
		if in.CanonicalZone != nil && (zoneID == "" || in.CanonicalZone.ID == zoneID) {
			z := *in.CanonicalZone
			if (z.TenantID != "" && z.TenantID != in.TenantID) || (z.BranchID != "" && z.BranchID != in.BranchID) || z.Status != "active" {
				return nil, ErrZoneNotFound
			}
			return &z, nil
		}
		z, err := ResolveCanonicalZone(ctx, tdb, scope, zoneID)
		return &z, err
	}
	var zone *CanonicalZone
	switch p.ContextMode {
	case NomenclatureContextCanonicalZone:
		z, err := resolveZone(in.ZoneID)
		if err != nil {
			return CanonicalNomenclatureResolution{}, err
		}
		zone = z
	case NomenclatureContextCanonicalDistribution:
		d, err := ResolveDistributionPoint(ctx, tdb, scope, in.DistributionID, false)
		if err != nil {
			return CanonicalNomenclatureResolution{}, err
		}
		r.Distribution = &d
		r.Components.Distribution = d.CanonicalCode
		r.Components.DistributionLocationID = d.LocationID
		z, err := resolveZone(d.ZoneID)
		if err != nil {
			return CanonicalNomenclatureResolution{}, err
		}
		zone = z
	case NomenclatureContextCanonicalHousing:
		h, err := ResolveHousing(ctx, tdb, scope, in.HousingRackID)
		if err != nil {
			return CanonicalNomenclatureResolution{}, err
		}
		r.Housing = &h
		r.Components.Housing = h.CanonicalCode
		if p.IncludeDistribution || p.IncludeZone || p.IncludeBuilding || p.IncludeFloor || p.SequenceScope == NomenclatureSequenceDistribution {
			d, err := ResolveDistributionPoint(ctx, tdb, scope, h.DistributionID, false)
			if err != nil {
				return CanonicalNomenclatureResolution{}, err
			}
			r.Distribution = &d
			r.Components.Distribution = d.CanonicalCode
			r.Components.DistributionLocationID = d.LocationID
			z, err := resolveZone(d.ZoneID)
			if err != nil {
				return CanonicalNomenclatureResolution{}, err
			}
			zone = z
		}
	case NomenclatureContextLegacyInternalArea:
		if p.IncludeBuilding || p.IncludeInternalArea {
			if in.PhysicalLocation == nil || !in.PhysicalLocation.Active {
				return CanonicalNomenclatureResolution{}, ErrInvalidPhysicalLocation
			}
			r.Components.Building = in.PhysicalLocation.SiteCode
			if p.IncludeInternalArea {
				r.Components.InternalArea = in.PhysicalLocation.AreaCode
			}
		}
	}
	if zone != nil {
		r.Zone = zone
		if p.IncludeBuilding {
			r.Components.Building = zone.BuildingCode
		}
		if p.IncludeFloor {
			r.Components.Floor = zone.FloorCode
		}
		if p.IncludeZone {
			r.Components.Zone = zone.Code
		}
	}
	if p.IncludePlacement {
		var placement ResolvedPlacement
		if in.Placement != nil {
			placement = *in.Placement
			if !placement.Active || (placement.BranchID != "" && placement.BranchID != in.BranchID) {
				return CanonicalNomenclatureResolution{}, ErrInvalidAssetPlacement
			}
		} else {
			placementID := in.PlacementID
			var err error
			placement, err = ResolveAssetPlacement(ctx, tdb, AssetPlacementContext{TenantID: in.TenantID, BranchID: in.BranchID, PlacementID: placementID})
			if err != nil {
				return CanonicalNomenclatureResolution{}, err
			}
		}
		r.Placement = &placement
		r.Components.Placement = placement.CanonicalCode
		r.Components.PlacementLocationID = placement.ID
	}
	return r, nil
}

func normalizeAtomicNomenclatureComponent(value, separator string, required bool, maxBytes int) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		if required {
			return "", ErrInvalidNomenclatureComponent
		}
		return "", nil
	}
	if !utf8.ValidString(value) {
		return "", ErrInvalidNomenclatureComponent
	}
	for _, r := range value {
		if r > 0x7f || r < 0x20 || r == 0x7f {
			return "", ErrInvalidNomenclatureComponent
		}
	}
	value = strings.ToUpper(value)
	if len([]byte(value)) > maxBytes || !atomicNomenclatureComponent.MatchString(value) || (separator != "" && strings.Contains(value, separator)) {
		return "", ErrInvalidNomenclatureComponent
	}
	return value, nil
}

func validateTrustedCanonicalCompound(value string, required bool) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		if required {
			return "", ErrInvalidNomenclatureComponent
		}
		return "", nil
	}
	if !utf8.ValidString(value) || len([]byte(value)) > 100 || strings.ToUpper(value) != value {
		return "", ErrInvalidNomenclatureComponent
	}
	for _, r := range value {
		if r < 0x20 || r == 0x7f {
			return "", ErrInvalidNomenclatureComponent
		}
	}
	return value, nil
}

func buildCanonicalNomenclature(p CanonicalNomenclaturePolicy, c CanonicalNomenclatureComponents, sequence string, display bool) (string, error) {
	if err := validateCanonicalNomenclaturePolicy(p); err != nil {
		return "", err
	}
	if p.Separator == "" || len([]byte(p.Separator)) > 5 {
		return "", ErrInvalidNomenclatureComponent
	}
	prefix, err := normalizeAtomicNomenclatureComponent(c.Prefix, p.Separator, true, 20)
	if err != nil {
		return "", err
	}
	parts := []string{prefix}
	addAtomic := func(value string, required bool) error {
		if display && strings.HasPrefix(value, "[") && strings.HasSuffix(value, "]") {
			parts = append(parts, value)
			return nil
		}
		normalized, e := normalizeAtomicNomenclatureComponent(value, p.Separator, required, 50)
		if e != nil {
			return e
		}
		if normalized != "" {
			parts = append(parts, normalized)
		}
		return nil
	}
	if p.IncludeBranch && addAtomic(c.Branch, true) != nil {
		return "", ErrInvalidNomenclatureComponent
	}
	if p.IncludeBuilding && addAtomic(c.Building, true) != nil {
		return "", ErrInvalidNomenclatureComponent
	}
	if p.IncludeFloor && addAtomic(c.Floor, true) != nil {
		return "", ErrInvalidNomenclatureComponent
	}
	if p.IncludeZone && addAtomic(c.Zone, true) != nil {
		return "", ErrInvalidNomenclatureComponent
	}
	if p.IncludeInternalArea && addAtomic(c.InternalArea, true) != nil {
		return "", ErrInvalidNomenclatureComponent
	}
	if p.IncludeDistribution {
		v, e := validateTrustedCanonicalCompound(c.Distribution, true)
		if display && strings.HasPrefix(c.Distribution, "[") {
			v, e = c.Distribution, nil
		}
		if e != nil {
			return "", e
		}
		parts = append(parts, v)
	}
	if p.IncludeHousing {
		v, e := validateTrustedCanonicalCompound(c.Housing, true)
		if display && strings.HasPrefix(c.Housing, "[") {
			v, e = c.Housing, nil
		}
		if e != nil {
			return "", e
		}
		parts = append(parts, v)
	} else if p.IncludePlacement {
		v, e := validateTrustedCanonicalCompound(c.Placement, true)
		if display && strings.HasPrefix(c.Placement, "[") {
			v, e = c.Placement, nil
		}
		if e != nil {
			return "", e
		}
		parts = append(parts, v)
	}
	if err := addAtomic(c.CustomSegment1, false); err != nil {
		return "", err
	}
	if err := addAtomic(c.CustomSegment2, false); err != nil {
		return "", err
	}
	if display && sequence == "[NEXT]" {
		parts = append(parts, sequence)
	} else {
		if len(sequence) != p.SequenceDigits {
			return "", ErrInvalidNomenclatureComponent
		}
		if _, err := strconv.Atoi(sequence); err != nil {
			return "", ErrInvalidNomenclatureComponent
		}
		parts = append(parts, sequence)
	}
	code := strings.Join(parts, p.Separator)
	if len([]byte(code)) > 100 {
		return "", ErrNomenclatureCodeTooLong
	}
	return code, nil
}

func BuildCanonicalNomenclature(p CanonicalNomenclaturePolicy, c CanonicalNomenclatureComponents, sequence int) (string, error) {
	if sequence < 0 || sequence >= pow10(p.SequenceDigits) {
		return "", ErrInvalidNomenclatureComponent
	}
	return buildCanonicalNomenclature(p, c, fmt.Sprintf("%0*d", p.SequenceDigits, sequence), false)
}

func BuildCanonicalNomenclatureTemplate(p CanonicalNomenclaturePolicy, c CanonicalNomenclatureComponents) (string, error) {
	return buildCanonicalNomenclature(p, c, "[NEXT]", true)
}

func BuildCanonicalNomenclatureDisplay(p CanonicalNomenclaturePolicy, c CanonicalNomenclatureComponents, sequence int) (string, error) {
	if sequence < 0 || sequence >= pow10(p.SequenceDigits) {
		return "", ErrInvalidNomenclatureComponent
	}
	return buildCanonicalNomenclature(p, c, fmt.Sprintf("%0*d", p.SequenceDigits, sequence), true)
}

func pow10(n int) int {
	v := 1
	for i := 0; i < n; i++ {
		v *= 10
	}
	return v
}

func sequenceLocationID(p CanonicalNomenclaturePolicy, c CanonicalNomenclatureComponents) (string, error) {
	switch p.SequenceScope {
	case NomenclatureSequenceBranch:
		return "", nil
	case NomenclatureSequencePlacement:
		if c.PlacementLocationID == "" {
			return "", ErrInvalidSequenceScope
		}
		return c.PlacementLocationID, nil
	case NomenclatureSequenceDistribution:
		if c.DistributionLocationID == "" {
			return "", ErrInvalidSequenceScope
		}
		return c.DistributionLocationID, nil
	default:
		return "", ErrInvalidSequenceScope
	}
}

func peekCanonicalSequence(ctx context.Context, tdb TenantDB, p CanonicalNomenclaturePolicy, tenantID, branchID string, c CanonicalNomenclatureComponents) (int, error) {
	locationID, err := sequenceLocationID(p, c)
	if err != nil {
		return 0, err
	}
	var last int
	if p.SequenceScope == NomenclatureSequenceBranch {
		err = tdb.QueryRowContext(ctx, `SELECT last_seq FROM nomenclature_branch_counters WHERE nomenclature_id=$1 AND branch_id=$2`, p.RuleID, branchID).Scan(&last)
	} else {
		err = tdb.QueryRowContext(ctx, `SELECT last_seq FROM nomenclature_counters WHERE nomenclature_id=$1 AND branch_id=$2 AND placement_id=$3`, p.RuleID, branchID, locationID).Scan(&last)
	}
	if errors.Is(err, sql.ErrNoRows) {
		// Reservation creates an absent scoped counter at zero. Preview must
		// mirror that exact route without writing, rather than consulting the
		// compatibility high-water mark on naming_rules.
		return 1, nil
	}
	if err != nil {
		return 0, err
	}
	return last + 1, nil
}

func reserveCanonicalSequence(ctx context.Context, tdb TenantDB, p CanonicalNomenclaturePolicy, tenantID, branchID string, c CanonicalNomenclatureComponents) (int, error) {
	locationID, err := sequenceLocationID(p, c)
	if err != nil {
		return 0, err
	}
	var last int
	if p.SequenceScope == NomenclatureSequenceBranch {
		if _, err = tdb.ExecContext(ctx, `INSERT INTO nomenclature_branch_counters(nomenclature_id,tenant_id,branch_id,last_seq) VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING`, p.RuleID, tenantID, branchID); err != nil {
			return 0, err
		}
		if err = tdb.QueryRowContext(ctx, `SELECT last_seq FROM nomenclature_branch_counters WHERE nomenclature_id=$1 AND branch_id=$2 FOR UPDATE`, p.RuleID, branchID).Scan(&last); err != nil {
			return 0, err
		}
		last++
		if _, err = tdb.ExecContext(ctx, `UPDATE nomenclature_branch_counters SET last_seq=$1,updated_at=now() WHERE nomenclature_id=$2 AND branch_id=$3`, last, p.RuleID, branchID); err != nil {
			return 0, err
		}
		if _, err = tdb.ExecContext(ctx, `UPDATE naming_rules SET last_seq=GREATEST(last_seq,$1),updated_at=NOW() WHERE id=$2 AND tenant_id=$3`, last, p.RuleID, tenantID); err != nil {
			return 0, err
		}
		return last, nil
	}
	if _, err = tdb.ExecContext(ctx, `INSERT INTO nomenclature_counters(nomenclature_id,tenant_id,branch_id,placement_id,last_seq) VALUES($1,$2,$3,$4,0) ON CONFLICT DO NOTHING`, p.RuleID, tenantID, branchID, locationID); err != nil {
		return 0, err
	}
	if err = tdb.QueryRowContext(ctx, `SELECT last_seq FROM nomenclature_counters WHERE nomenclature_id=$1 AND branch_id=$2 AND placement_id=$3 FOR UPDATE`, p.RuleID, branchID, locationID).Scan(&last); err != nil {
		return 0, err
	}
	last++
	if _, err = tdb.ExecContext(ctx, `UPDATE nomenclature_counters SET last_seq=$1,updated_at=now() WHERE nomenclature_id=$2 AND branch_id=$3 AND placement_id=$4`, last, p.RuleID, branchID, locationID); err != nil {
		return 0, err
	}
	return last, nil
}

func PreviewCanonicalNomenclature(ctx context.Context, tdb TenantDB, in CanonicalNomenclatureInput) (CanonicalNomenclaturePreview, error) {
	p, err := loadCanonicalNomenclaturePolicy(ctx, tdb, in.TenantID, in.AssetTypeCode, in.Policy.ContextMode, false)
	if err != nil {
		return CanonicalNomenclaturePreview{}, err
	}
	in.Policy = p
	resolved, err := ResolveCanonicalNomenclature(ctx, tdb, in)
	if err != nil {
		return CanonicalNomenclaturePreview{}, err
	}
	next, err := peekCanonicalSequence(ctx, tdb, p, in.TenantID, in.BranchID, resolved.Components)
	if err != nil {
		return CanonicalNomenclaturePreview{}, err
	}
	illustrative, err := BuildCanonicalNomenclature(p, resolved.Components, next)
	if err != nil {
		return CanonicalNomenclaturePreview{}, err
	}
	template, err := BuildCanonicalNomenclatureTemplate(p, resolved.Components)
	if err != nil {
		return CanonicalNomenclaturePreview{}, err
	}
	return CanonicalNomenclaturePreview{
		PresetOrRuleIdentity: p.RuleID, ContextMode: p.ContextMode, SequenceScope: p.SequenceScope,
		ResolvedComponents: resolved.Components, CodeTemplate: template, IllustrativeCode: illustrative,
		IllustrativeSequence: next, SequenceReserved: false, Volatile: true,
		Warnings: []string{"illustrative sequence is not reserved"},
	}, nil
}
