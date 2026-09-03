package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// CanonicalStagingPayload is the single server-side representation shared by
// staging, preview and the future commit coordinator. Tenant and branch are
// deliberately absent: their authority is the transaction-local GUC scope.
type CanonicalStagingPayload struct {
	SourceRowNumber    int                    `json:"source_row_number"`
	AssetTypeCode      string                 `json:"asset_type_code"`
	Manufacturer       string                 `json:"manufacturer,omitempty"`
	Model              string                 `json:"model,omitempty"`
	SerialNumber       string                 `json:"serial_number,omitempty"`
	AssetTag           string                 `json:"asset_tag,omitempty"`
	Name               string                 `json:"name,omitempty"`
	Description        string                 `json:"description,omitempty"`
	PlacementIntent    string                 `json:"placement_intent,omitempty"`
	ZoneID             string                 `json:"zone_id,omitempty"`
	ZoneCode           string                 `json:"zone_code,omitempty"`
	SourceInternalCode string                 `json:"source_internal_code,omitempty"`
	SourceLocationID   string                 `json:"source_location_id,omitempty"`
	SourceIdentifiers  map[string]string      `json:"source_identifiers,omitempty"`
	Metadata           map[string]interface{} `json:"metadata,omitempty"`
	RawSource          map[string]interface{} `json:"raw_source"`
}

type CanonicalStagingRow struct {
	Payload         CanonicalStagingPayload
	NormalizedHash  string
	State           string
	ValidationError *string
}

type CanonicalImportScope struct {
	TenantID string
	BranchID string
	UserID   string
}

type canonicalImportSummary struct {
	ImportID int64
	Total    int
	Valid    int
	Invalid  int
	State    string
	Rows     []CanonicalStagingRow
}

func normalizedString(v interface{}) string {
	return strings.TrimSpace(fmt.Sprint(v))
}

func firstNormalized(raw map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value, ok := raw[key]; ok {
			if normalized := normalizedString(value); normalized != "" && normalized != "<nil>" {
				return normalized
			}
		}
	}
	return ""
}

func canonicalAssetTypeCandidate(raw map[string]interface{}, fallback string) string {
	candidate := strings.ToUpper(firstNormalized(raw, "asset_type_code", "asset_type", "category"))
	if candidate == "" {
		candidate = strings.ToUpper(strings.TrimSpace(fallback))
	}
	switch candidate {
	case "MDF_IDF":
		if strings.HasPrefix(strings.ToUpper(firstNormalized(raw, "name")), "MDF") {
			return "MDF"
		}
		return "IDF"
	case "RACKS":
		return "RACK"
	case "SWITCHES":
		return "SWITCH"
	case "UPS_PDU":
		if strings.HasPrefix(strings.ToUpper(firstNormalized(raw, "name")), "UPS") {
			return "UPS"
		}
		return "PDU"
	case "PATCH_PANELS":
		return "PATCH_PANEL"
	case "NODOS":
		return "NODE"
	case "BACKBONE":
		return "BACKBONE"
	default:
		return candidate
	}
}

func canonicalPayloadHash(payload CanonicalStagingPayload) (string, error) {
	// RawSource is evidence, not canonical identity. Excluding it makes the
	// hash stable across source key order and normalization-equivalent input.
	hashMaterial := payload
	hashMaterial.RawSource = nil
	encoded, err := json.Marshal(hashMaterial)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

func invalidCanonicalRow(payload CanonicalStagingPayload, message string) (CanonicalStagingRow, error) {
	hash, err := canonicalPayloadHash(payload)
	if err != nil {
		return CanonicalStagingRow{}, err
	}
	return CanonicalStagingRow{Payload: payload, NormalizedHash: hash, State: "INVALID", ValidationError: &message}, nil
}

// normalizeCanonicalImportRow resolves all canonical authorities through the
// tenant-scoped transaction. Client asset_type_id, tenant_id, branch_id and
// location_id can never select canonical identity or placement.
func normalizeCanonicalImportRow(ctx context.Context, tdb TenantDB, scope CanonicalImportScope, rowNumber int, fallbackType string, raw map[string]interface{}) (CanonicalStagingRow, error) {
	identifiers := make(map[string]string)
	for _, key := range []string{"ip", "ip_address", "mac", "mac_address", "hostname"} {
		if value := firstNormalized(raw, key); value != "" {
			identifiers[key] = value
		}
	}
	var metadata map[string]interface{}
	if supplied, ok := raw["metadata"].(map[string]interface{}); ok {
		metadata = supplied
	}
	payload := CanonicalStagingPayload{
		SourceRowNumber:    rowNumber,
		Manufacturer:       strings.TrimSpace(firstNormalized(raw, "manufacturer", "brand")),
		Model:              strings.TrimSpace(firstNormalized(raw, "model")),
		SerialNumber:       strings.TrimSpace(firstNormalized(raw, "serial_number", "serial")),
		AssetTag:           strings.TrimSpace(firstNormalized(raw, "asset_tag")),
		Name:               strings.TrimSpace(firstNormalized(raw, "name")),
		Description:        strings.TrimSpace(firstNormalized(raw, "description", "observations")),
		SourceInternalCode: strings.TrimSpace(firstNormalized(raw, "internal_code", "asset_code", "code")),
		SourceLocationID:   strings.TrimSpace(firstNormalized(raw, "location_id")),
		SourceIdentifiers:  identifiers,
		Metadata:           metadata,
		RawSource:          raw,
	}

	if assertion := firstNormalized(raw, "tenant_id"); assertion != "" && assertion != scope.TenantID {
		return invalidCanonicalRow(payload, "tenant assertion does not match server scope")
	}
	if assertion := firstNormalized(raw, "branch_id"); assertion != "" && assertion != scope.BranchID {
		return invalidCanonicalRow(payload, "branch assertion does not match server scope")
	}

	typeCode := canonicalAssetTypeCandidate(raw, fallbackType)
	payload.AssetTypeCode = typeCode
	var placement sql.NullString
	if typeCode == "" {
		return invalidCanonicalRow(payload, "unknown canonical asset type")
	}
	err := tdb.QueryRowContext(ctx, `SELECT placement_policy FROM asset_types WHERE code=$1`, typeCode).Scan(&placement)
	if errors.Is(err, sql.ErrNoRows) {
		return invalidCanonicalRow(payload, "unknown canonical asset type")
	}
	if err != nil {
		return CanonicalStagingRow{}, err
	}
	payload.PlacementIntent = placement.String

	if typeCode == "MDF" || typeCode == "IDF" {
		zoneID := strings.TrimSpace(firstNormalized(raw, "zone_id"))
		zoneCode := strings.ToUpper(strings.TrimSpace(firstNormalized(raw, "zone_code")))
		if zoneID == "" && zoneCode == "" {
			return invalidCanonicalRow(payload, "zone is required for MDF/IDF")
		}

		var resolvedID, resolvedCode string
		if zoneID != "" {
			if _, err := uuid.Parse(zoneID); err != nil {
				return invalidCanonicalRow(payload, "zone_id is invalid")
			}
			err := tdb.QueryRowContext(ctx, `
				SELECT id::text, upper(code) FROM zones
				WHERE id=$1::uuid AND tenant_id=$2::uuid AND branch_id=$3::uuid AND status='active'`,
				zoneID, scope.TenantID, scope.BranchID).Scan(&resolvedID, &resolvedCode)
			if errors.Is(err, sql.ErrNoRows) {
				return invalidCanonicalRow(payload, "zone is outside authoritative tenant/branch scope")
			}
			if err != nil {
				return CanonicalStagingRow{}, err
			}
		}
		if zoneCode != "" {
			var codeID, canonicalCode string
			err := tdb.QueryRowContext(ctx, `
				SELECT id::text, upper(code) FROM zones
				WHERE upper(code)=$1 AND tenant_id=$2::uuid AND branch_id=$3::uuid AND status='active'`,
				zoneCode, scope.TenantID, scope.BranchID).Scan(&codeID, &canonicalCode)
			if errors.Is(err, sql.ErrNoRows) {
				return invalidCanonicalRow(payload, "zone is outside authoritative tenant/branch scope")
			}
			if err != nil {
				return CanonicalStagingRow{}, err
			}
			if resolvedID != "" && resolvedID != codeID {
				return invalidCanonicalRow(payload, "zone_id and zone_code do not match")
			}
			resolvedID, resolvedCode = codeID, canonicalCode
		}
		payload.ZoneID, payload.ZoneCode = resolvedID, resolvedCode
	}

	hash, err := canonicalPayloadHash(payload)
	if err != nil {
		return CanonicalStagingRow{}, err
	}
	return CanonicalStagingRow{Payload: payload, NormalizedHash: hash, State: "VALID"}, nil
}

// previewCanonicalImportRow intentionally delegates to the exact staging
// normalizer. It performs reads only and never reserves nomenclature or writes
// counters. A future HTTP preview surface can expose this result without
// introducing a second interpretation of import data.
func previewCanonicalImportRow(ctx context.Context, tdb TenantDB, scope CanonicalImportScope, rowNumber int, fallbackType string, raw map[string]interface{}) (CanonicalStagingRow, error) {
	return normalizeCanonicalImportRow(ctx, tdb, scope, rowNumber, fallbackType, raw)
}

func createCanonicalImportHeader(ctx context.Context, tdb TenantDB, fileName, assetType, documentType, method, userID string) (int64, error) {
	var importID int64
	err := tdb.QueryRowContext(ctx, `SELECT public.create_inventory_import_staging($1,$2,$3,$4,$5::uuid)`,
		fileName, assetType, documentType, method, userID).Scan(&importID)
	return importID, err
}

func stageCanonicalImportRows(ctx context.Context, tdb TenantDB, scope CanonicalImportScope, importID int64, fallbackType string, rows []map[string]interface{}) (canonicalImportSummary, error) {
	summary := canonicalImportSummary{ImportID: importID}
	for i, raw := range rows {
		row, err := normalizeCanonicalImportRow(ctx, tdb, scope, i+1, fallbackType, raw)
		if err != nil {
			return summary, err
		}
		payloadJSON, err := json.Marshal(row.Payload)
		if err != nil {
			return summary, err
		}
		var resultCode, rowState string
		var rowID int64
		err = tdb.QueryRowContext(ctx, `SELECT result_code,row_id,row_status FROM public.stage_inventory_import_row($1,$2,$3::jsonb,$4,$5,$6,NULL)`,
			importID, i+1, payloadJSON, row.NormalizedHash, row.State, row.ValidationError).Scan(&resultCode, &rowID, &rowState)
		if err != nil {
			return summary, err
		}
		if resultCode != "ROW_STAGED" && resultCode != "ROW_UNCHANGED" {
			return summary, fmt.Errorf("secure row staging rejected: %s", resultCode)
		}
		summary.Total++
		if row.State == "VALID" {
			summary.Valid++
		} else {
			summary.Invalid++
		}
		summary.Rows = append(summary.Rows, row)
	}
	var progressResult string
	if err := tdb.QueryRowContext(ctx, `SELECT public.update_inventory_import_progress($1,$2,$3,$4,0)`, importID, summary.Total, summary.Valid, summary.Invalid).Scan(&progressResult); err != nil {
		return summary, err
	}
	if progressResult != "PROGRESS_UPDATED" {
		return summary, fmt.Errorf("secure progress update rejected: %s", progressResult)
	}
	var finalizeResult string
	if err := tdb.QueryRowContext(ctx, `SELECT result_code,aggregate_state FROM public.finalize_inventory_import_staging($1)`, importID).Scan(&finalizeResult, &summary.State); err != nil {
		return summary, err
	}
	if finalizeResult != "STAGING_FINALIZED" && finalizeResult != "STAGING_INCOMPLETE" {
		return summary, fmt.Errorf("secure staging finalize rejected: %s", finalizeResult)
	}
	return summary, nil
}

func createAndStageCanonicalImport(ctx context.Context, database *sql.DB, scope CanonicalImportScope, fileName, fallbackType, documentType, method string, rows []map[string]interface{}) (canonicalImportSummary, error) {
	jobTx, err := BeginJobTenantTx(ctx, database, JobTenantContext{TenantID: scope.TenantID, BranchID: scope.BranchID}, true)
	if err != nil {
		return canonicalImportSummary{}, err
	}
	defer jobTx.Rollback()
	importID, err := createCanonicalImportHeader(ctx, jobTx, fileName, fallbackType, documentType, method, scope.UserID)
	if err != nil {
		return canonicalImportSummary{}, err
	}
	summary, err := stageCanonicalImportRows(ctx, jobTx, scope, importID, fallbackType, rows)
	if err != nil {
		return summary, err
	}
	if err := jobTx.Commit(); err != nil {
		return summary, err
	}
	return summary, nil
}
