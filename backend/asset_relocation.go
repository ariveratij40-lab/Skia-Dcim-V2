package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

var (
	ErrAssetTypeMutationDenied = errors.New("asset type mutation is not allowed")
	ErrLegacyRelocationDenied  = errors.New("legacy MDF/IDF relocation is not supported")
)

type mdfIdfRelocationInput struct {
	AssetID, AssetTypeCode, CurrentAssetTypeID string
	RequestedAssetTypeID, RequestedLocationID  *string
	ZoneID, SiteID, InternalAreaID             *string
}

// relocateMdfIdf applies only canonical same-branch Zone relocation. The MDF
// or IDF keeps its dedicated locations row, asset identity, internal code and
// nomenclature sequence. RequireTenantTx owns the only commit/rollback.
func relocateMdfIdf(ctx context.Context, tdb TenantDB, userID, tenantID, branchID string, input mdfIdfRelocationInput) (bool, error) {
	if input.RequestedAssetTypeID != nil && strings.TrimSpace(*input.RequestedAssetTypeID) != input.CurrentAssetTypeID {
		return false, ErrAssetTypeMutationDenied
	}
	if input.RequestedLocationID != nil {
		return false, ErrInvalidAssetPlacement
	}
	relocationRequested := input.ZoneID != nil || input.SiteID != nil || input.InternalAreaID != nil
	if !relocationRequested {
		return false, nil
	}
	if input.ZoneID == nil || strings.TrimSpace(*input.ZoneID) == "" {
		return false, ErrZoneRequired
	}

	var locationID, currentZoneID string
	var currentArea sql.NullString
	err := tdb.QueryRowContext(ctx, `
		SELECT l.id,COALESCE(l.zone_id::text,''),l.internal_area_id
		FROM assets a
		JOIN asset_types at ON at.id=a.asset_type_id AND at.code=$4
		JOIN mdf_idf m ON m.asset_id=a.id AND m.tenant_id=a.tenant_id AND m.branch_id=a.branch_id AND m.type=at.code
		JOIN locations l ON l.id=a.location_id AND l.asset_id=a.id AND l.tenant_id=a.tenant_id AND l.branch_id=a.branch_id
		WHERE a.id=$1 AND a.tenant_id=$2 AND a.branch_id=$3
		FOR UPDATE OF a,l`, input.AssetID, tenantID, branchID, input.AssetTypeCode).
		Scan(&locationID, &currentZoneID, &currentArea)
	if errors.Is(err, sql.ErrNoRows) {
		return false, ErrInvalidAssetPlacement
	}
	if err != nil {
		return false, err
	}
	if currentZoneID == "" {
		return false, ErrLegacyRelocationDenied
	}

	scope := PhysicalScope{TenantID: tenantID, BranchID: branchID}
	targetZone, err := ResolveCanonicalZone(ctx, tdb, scope, strings.TrimSpace(*input.ZoneID))
	if err != nil {
		return false, err
	}
	targetSiteID := ""
	if input.SiteID != nil {
		targetSiteID = strings.TrimSpace(*input.SiteID)
		if targetSiteID == "" || targetZone.BuildingID != targetSiteID {
			return false, ErrPhysicalScopeMismatch
		}
	}
	targetAreaID := ""
	if input.InternalAreaID != nil {
		targetAreaID = strings.TrimSpace(*input.InternalAreaID)
		if targetAreaID == "" {
			return false, ErrPhysicalScopeMismatch
		}
		if _, err = ResolvePhysicalLocationForZone(ctx, tdb, scope, targetZone, targetSiteID, targetAreaID); err != nil {
			return false, err
		}
	}
	if _, err = tdb.ExecContext(ctx, `UPDATE locations SET zone_id=$1,internal_area_id=NULLIF($2,'')::uuid,updated_at=NOW() WHERE id=$3 AND asset_id=$4 AND tenant_id=$5 AND branch_id=$6`, targetZone.ID, targetAreaID, locationID, input.AssetID, tenantID, branchID); err != nil {
		return false, err
	}
	if _, err = tdb.ExecContext(ctx, `INSERT INTO asset_logs(tenant_id,asset_id,event_type,old_value,new_value,notes,performed_by) VALUES($1,$2,'location_change',$3,$4,'Relocalización MDF/IDF a Zona canónica',$5)`, tenantID, input.AssetID, currentZoneID, targetZone.ID, userID); err != nil {
		return false, err
	}
	return true, nil
}

func writeAssetRelocationError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	switch {
	case errors.Is(err, ErrAssetTypeMutationDenied):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "asset_type_change_not_allowed", "message": "MDF/IDF no admite conversión de tipo mediante la actualización genérica."})
	case errors.Is(err, ErrLegacyRelocationDenied):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "legacy_relocation_not_supported", "message": "La relocalización de infraestructura legacy requiere un flujo de remediación separado."})
	default:
		writeManagedAssetError(w, err, "")
	}
}
