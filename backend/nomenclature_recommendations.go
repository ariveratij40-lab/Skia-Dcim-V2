package main

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/lib/pq"
)

// SystemPreset is supplied by a separately authorized adapter. Phase 1.2D-A
// deliberately does not read system_naming_presets or widen runtime grants.
type SystemPreset struct {
	AssetTypeCode, Prefix, Separator string
	Version, SeqDigits               int
	IncludeBranch, IncludePlacement  bool
}

type RecommendationConflict struct{ AssetTypeCode, Reason string }
type ApplyRecommendationsResult struct {
	Created, Unchanged []string
	Conflicts          []RecommendationConflict
}

var ErrInvalidSystemPresetType = errors.New("invalid_system_naming_preset_type")

var supportedSystemPresetTypes = map[string]struct{}{
	"MDF": {}, "IDF": {}, "RACK": {}, "SWITCH": {}, "UPS": {}, "PDU": {},
	"PATCH_PANEL": {}, "NODE": {}, "BACKBONE": {}, "FIREWALL": {},
	"SERVER": {}, "CCTV": {}, "AC_UNIT": {},
}

// ReadActiveSystemNamingPresets is the only application database adapter for
// the global catalog. It calls the narrow SECURITY DEFINER interface and never
// queries system_naming_presets directly.
func ReadActiveSystemNamingPresets(ctx context.Context, tdb TenantDB, assetTypeCodes []string) ([]SystemPreset, error) {
	if tdb == nil {
		return nil, ErrInvalidPhysicalScope
	}
	if len(assetTypeCodes) == 0 {
		return []SystemPreset{}, nil
	}
	normalized := make([]string, 0, len(assetTypeCodes))
	seen := make(map[string]struct{}, len(assetTypeCodes))
	for _, raw := range assetTypeCodes {
		code := strings.ToUpper(strings.TrimSpace(raw))
		if _, ok := supportedSystemPresetTypes[code]; !ok {
			return nil, fmt.Errorf("%w:%s", ErrInvalidSystemPresetType, code)
		}
		if _, duplicate := seen[code]; !duplicate {
			normalized = append(normalized, code)
			seen[code] = struct{}{}
		}
	}
	rows, err := tdb.QueryContext(ctx, `SELECT asset_type_code,preset_version,prefix,separator,
		include_branch,include_placement,seq_digits
		FROM public.read_active_system_naming_presets($1::text[])`, pq.Array(normalized))
	if err != nil {
		return nil, fmt.Errorf("read active system naming presets: %w", err)
	}
	defer rows.Close()
	presets := make([]SystemPreset, 0, len(normalized))
	for rows.Next() {
		var preset SystemPreset
		if err = rows.Scan(&preset.AssetTypeCode, &preset.Version, &preset.Prefix, &preset.Separator,
			&preset.IncludeBranch, &preset.IncludePlacement, &preset.SeqDigits); err != nil {
			return nil, fmt.Errorf("scan active system naming preset: %w", err)
		}
		presets = append(presets, preset)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate active system naming presets: %w", err)
	}
	return presets, nil
}

func PreviewRecommendedCode(p SystemPreset, branchCode, placementCode string, nextSequence int) string {
	scope := NomenclatureSequenceBranch
	if p.IncludePlacement {
		scope = NomenclatureSequencePlacement
	}
	policy := CanonicalNomenclaturePolicy{Prefix: p.Prefix, Separator: p.Separator,
		AssetTypeCode: p.AssetTypeCode, ContextMode: NomenclatureContextLegacyInternalArea,
		SequenceScope: scope, SequenceDigits: p.SeqDigits,
		IncludeBranch: p.IncludeBranch, IncludePlacement: p.IncludePlacement}
	code, err := BuildCanonicalNomenclature(policy, CanonicalNomenclatureComponents{
		Prefix: p.Prefix, Branch: branchCode, Placement: placementCode,
		PlacementLocationID: placementCode,
	}, nextSequence)
	if err != nil {
		return ""
	}
	return code
}
