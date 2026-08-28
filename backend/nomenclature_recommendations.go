package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
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
	parts := []string{p.Prefix}
	if p.IncludeBranch {
		parts = append(parts, branchCode)
	}
	if p.IncludePlacement {
		parts = append(parts, placementCode)
	}
	parts = append(parts, fmt.Sprintf("%0*d", p.SeqDigits, nextSequence))
	return strings.Join(parts, p.Separator)
}

func ApplyRecommendedNomenclature(ctx context.Context, tdb TenantDB, tenantID string, presets []SystemPreset) (ApplyRecommendationsResult, error) {
	result := ApplyRecommendationsResult{}
	if tdb == nil || strings.TrimSpace(tenantID) == "" {
		return result, ErrInvalidPhysicalScope
	}
	for _, p := range presets {
		code := strings.ToUpper(strings.TrimSpace(p.AssetTypeCode))
		var id, prefix, separator string
		var digits, lastSeq int
		var includeBranch, includePlacement bool
		err := tdb.QueryRowContext(ctx, `SELECT id,prefix,separator,seq_digits,last_seq,include_branch,include_placement
			FROM naming_rules WHERE tenant_id=$1 AND asset_type_code=$2`, tenantID, code).
			Scan(&id, &prefix, &separator, &digits, &lastSeq, &includeBranch, &includePlacement)
		if err == nil {
			if prefix == p.Prefix && separator == p.Separator && digits == p.SeqDigits && includeBranch == p.IncludeBranch && includePlacement == p.IncludePlacement {
				result.Unchanged = append(result.Unchanged, code)
			} else {
				reason := "CUSTOMIZED_RULE"
				if lastSeq > 0 {
					reason = "ISSUED_RULE_IMMUTABLE"
				}
				result.Conflicts = append(result.Conflicts, RecommendationConflict{code, reason})
			}
			continue
		}
		if err != sql.ErrNoRows {
			return result, fmt.Errorf("inspect tenant naming rule: %w", err)
		}
		_, err = tdb.ExecContext(ctx, `INSERT INTO naming_rules
			(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_placement,seq_digits,last_seq,active)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,true)`, uuid.NewString(), tenantID, code, p.Prefix, p.Separator, p.IncludeBranch, p.IncludePlacement, p.SeqDigits)
		if err != nil {
			return result, fmt.Errorf("create recommended naming rule: %w", err)
		}
		result.Created = append(result.Created, code)
	}
	return result, nil
}
