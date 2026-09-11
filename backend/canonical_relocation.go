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
	ErrRelocationAssetNotFound = errors.New("relocation asset not found")
	ErrRelocationUnsupported   = errors.New("asset type does not support canonical relocation")
)

type CanonicalRelocationRequest struct {
	AssetID             string  `json:"asset_id"`
	DistributionPointID string  `json:"distribution_point_id,omitempty"`
	HousingRackID       string  `json:"housing_rack_id,omitempty"`
	MountMode           string  `json:"mount_mode,omitempty"`
	PlacementID         string  `json:"placement_id,omitempty"`
	ZoneID              *string `json:"zone_id,omitempty"`
	SiteID              *string `json:"site_id,omitempty"`
	InternalAreaID      *string `json:"internal_area_id,omitempty"`
}

type CanonicalRelocationAsset struct {
	ID                  string `json:"id"`
	Code                string `json:"code"`
	Name                string `json:"name"`
	AssetType           string `json:"asset_type"`
	LocationID          string `json:"location_id"`
	HousingRackID       string `json:"housing_rack_id"`
	MountMode           string `json:"mount_mode"`
	DistributionPointID string `json:"distribution_point_id"`
}

type CanonicalRelocationResult struct {
	AssetID             string `json:"asset_id"`
	AssetType           string `json:"asset_type"`
	LocationID          string `json:"location_id"`
	HousingRackID       string `json:"housing_rack_id,omitempty"`
	MountMode           string `json:"mount_mode"`
	DistributionPointID string `json:"distribution_point_id,omitempty"`
	CascadedAssets      int    `json:"cascaded_assets"`
	Changed             bool   `json:"changed"`
}

type canonicalRelocationSnapshot struct {
	AssetType, AssetTypeID, LocationID, HousingRackID, MountMode string
}

type relocationChildSnapshot struct {
	AssetID, LocationID, HousingRackID, MountMode string
}

func init() {
	http.HandleFunc("/api/dcim/relocations", func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			http.Error(w, `{"error":"database unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		RequireTenantTx(db, handleCanonicalRelocations)(w, r)
	})
}

func handleCanonicalRelocations(w http.ResponseWriter, r *http.Request) {
	userID, tenantID, branchID, identityOK := TenantIdentityFromContext(r.Context())
	tdb, dbOK := TenantDBFromContext(r.Context())
	if !identityOK || !dbOK || userID == "" || tenantID == "" || branchID == "" {
		http.Error(w, `{"error":"missing tenant context"}`, http.StatusInternalServerError)
		return
	}

	switch r.Method {
	case http.MethodGet:
		listCanonicalRelocationAssets(w, r, tdb, tenantID, branchID)
	case http.MethodPost:
		var req CanonicalRelocationRequest
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&req); err != nil || strings.TrimSpace(req.AssetID) == "" {
			writeCanonicalHousingError(w, ErrInvalidPayload)
			return
		}
		result, err := relocateCanonicalAsset(r.Context(), tdb, userID, tenantID, branchID, req)
		if err != nil {
			writeCanonicalRelocationError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

func listCanonicalRelocationAssets(w http.ResponseWriter, r *http.Request, tdb TenantDB, tenantID, branchID string) {
	rows, err := tdb.Query(`
		SELECT a.id::text,a.internal_code,COALESCE(a.name,a.internal_code),at.code,
		       COALESCE(a.location_id::text,''),COALESCE(a.housing_rack_id::text,''),
		       COALESCE(a.mount_mode,'NONE'),COALESCE(r.mdf_idf_id::text,'')
		FROM assets a
		JOIN asset_types at ON at.id=a.asset_type_id
		LEFT JOIN racks r ON r.asset_id=a.id AND r.tenant_id=a.tenant_id AND r.branch_id=a.branch_id
		WHERE a.tenant_id=$1 AND a.branch_id=$2
		  AND a.status <> 'decommissioned'
		  AND at.code IN ('MDF','IDF','RACK','PATCH_PANEL','SWITCH','PDU','UPS')
		ORDER BY at.code,a.internal_code`, tenantID, branchID)
	if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	assets := []CanonicalRelocationAsset{}
	for rows.Next() {
		var item CanonicalRelocationAsset
		if err := rows.Scan(&item.ID, &item.Code, &item.Name, &item.AssetType, &item.LocationID,
			&item.HousingRackID, &item.MountMode, &item.DistributionPointID); err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		assets = append(assets, item)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"assets": assets})
}

func relocateCanonicalAsset(ctx context.Context, tdb TenantDB, userID, tenantID, branchID string, req CanonicalRelocationRequest) (CanonicalRelocationResult, error) {
	assetID := strings.TrimSpace(req.AssetID)
	if tdb == nil || assetID == "" || tenantID == "" || branchID == "" || userID == "" {
		return CanonicalRelocationResult{}, ErrInvalidPayload
	}

	var current canonicalRelocationSnapshot
	err := tdb.QueryRowContext(ctx, `
		SELECT at.code,a.asset_type_id::text,COALESCE(a.location_id::text,''),
		       COALESCE(a.housing_rack_id::text,''),COALESCE(a.mount_mode,'NONE')
		FROM assets a JOIN asset_types at ON at.id=a.asset_type_id
		WHERE a.id=$1 AND a.tenant_id=$2 AND a.branch_id=$3 AND a.status <> 'decommissioned'
		FOR UPDATE OF a`, assetID, tenantID, branchID).
		Scan(&current.AssetType, &current.AssetTypeID, &current.LocationID, &current.HousingRackID, &current.MountMode)
	if errors.Is(err, sql.ErrNoRows) {
		return CanonicalRelocationResult{}, ErrRelocationAssetNotFound
	}
	if err != nil {
		return CanonicalRelocationResult{}, err
	}

	scope := PhysicalScope{TenantID: tenantID, BranchID: branchID}
	switch current.AssetType {
	case "MDF", "IDF":
		if strings.TrimSpace(req.DistributionPointID) != "" || strings.TrimSpace(req.HousingRackID) != "" || strings.TrimSpace(req.MountMode) != "" || strings.TrimSpace(req.PlacementID) != "" {
			return CanonicalRelocationResult{}, ErrInvalidPayload
		}
		changed, err := relocateMdfIdf(ctx, tdb, userID, tenantID, branchID, mdfIdfRelocationInput{
			AssetID: assetID, AssetTypeCode: current.AssetType, CurrentAssetTypeID: current.AssetTypeID,
			ZoneID: req.ZoneID, SiteID: req.SiteID, InternalAreaID: req.InternalAreaID,
		})
		if err != nil {
			return CanonicalRelocationResult{}, err
		}
		return CanonicalRelocationResult{AssetID: assetID, AssetType: current.AssetType, LocationID: current.LocationID, MountMode: "NONE", Changed: changed}, nil

	case "RACK":
		if strings.TrimSpace(req.DistributionPointID) == "" || strings.TrimSpace(req.HousingRackID) != "" || strings.TrimSpace(req.PlacementID) != "" || strings.TrimSpace(req.MountMode) != "" {
			return CanonicalRelocationResult{}, ErrInvalidPayload
		}
		target, err := ResolveCanonicalHousing(ctx, tdb, scope, CanonicalHousingRequest{AssetTypeCode: "RACK", DistributionPointID: strings.TrimSpace(req.DistributionPointID)})
		if err != nil {
			return CanonicalRelocationResult{}, err
		}
		return relocateCanonicalRack(ctx, tdb, userID, tenantID, branchID, assetID, current, target)

	case "PATCH_PANEL", "SWITCH", "PDU":
		if strings.TrimSpace(req.HousingRackID) == "" || strings.TrimSpace(req.DistributionPointID) != "" || strings.TrimSpace(req.PlacementID) != "" || strings.TrimSpace(req.MountMode) != "" {
			return CanonicalRelocationResult{}, ErrInvalidPayload
		}
		target, err := ResolveCanonicalHousing(ctx, tdb, scope, CanonicalHousingRequest{AssetTypeCode: current.AssetType, HousingRackID: strings.TrimSpace(req.HousingRackID)})
		if err != nil {
			return CanonicalRelocationResult{}, err
		}
		return relocateCanonicalEquipment(ctx, tdb, userID, tenantID, branchID, assetID, current, target)

	case "UPS":
		if strings.TrimSpace(req.DistributionPointID) != "" {
			return CanonicalRelocationResult{}, ErrInvalidPayload
		}
		target, err := ResolveCanonicalHousing(ctx, tdb, scope, CanonicalHousingRequest{
			AssetTypeCode: "UPS", HousingRackID: strings.TrimSpace(req.HousingRackID),
			MountMode: strings.TrimSpace(req.MountMode), PlacementID: strings.TrimSpace(req.PlacementID),
		})
		if err != nil {
			return CanonicalRelocationResult{}, err
		}
		return relocateCanonicalEquipment(ctx, tdb, userID, tenantID, branchID, assetID, current, target)
	default:
		return CanonicalRelocationResult{}, ErrRelocationUnsupported
	}
}

func relocateCanonicalRack(ctx context.Context, tdb TenantDB, userID, tenantID, branchID, assetID string, current canonicalRelocationSnapshot, target CanonicalHousingState) (CanonicalRelocationResult, error) {
	var rackID, currentParentID string
	err := tdb.QueryRowContext(ctx, `SELECT id::text,mdf_idf_id::text FROM racks
		WHERE asset_id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE`, assetID, tenantID, branchID).
		Scan(&rackID, &currentParentID)
	if errors.Is(err, sql.ErrNoRows) {
		return CanonicalRelocationResult{}, ErrRelocationAssetNotFound
	}
	if err != nil {
		return CanonicalRelocationResult{}, err
	}

	children, err := loadRelocationChildren(ctx, tdb, tenantID, branchID, rackID)
	if err != nil {
		return CanonicalRelocationResult{}, err
	}
	if _, err = tdb.ExecContext(ctx, `UPDATE racks SET mdf_idf_id=$1 WHERE id=$2 AND tenant_id=$3 AND branch_id=$4`, target.DistributionPointID, rackID, tenantID, branchID); err != nil {
		return CanonicalRelocationResult{}, err
	}
	if _, err = tdb.ExecContext(ctx, `UPDATE assets SET location_id=$1,mount_mode='NONE',housing_rack_id=NULL,updated_at=NOW()
		WHERE id=$2 AND tenant_id=$3 AND branch_id=$4`, target.LocationID, assetID, tenantID, branchID); err != nil {
		return CanonicalRelocationResult{}, err
	}
	if _, err = tdb.ExecContext(ctx, `UPDATE assets SET location_id=$1,updated_at=NOW()
		WHERE housing_rack_id=$2 AND tenant_id=$3 AND branch_id=$4`, target.LocationID, rackID, tenantID, branchID); err != nil {
		return CanonicalRelocationResult{}, err
	}

	changed := currentParentID != target.DistributionPointID || current.LocationID != target.LocationID
	if err = writeCanonicalRelocationAudit(ctx, tdb, tenantID, userID, assetID, "Relocalización canónica de Rack",
		map[string]string{"location_id": current.LocationID, "mdf_idf_id": currentParentID, "mount_mode": current.MountMode},
		map[string]string{"location_id": target.LocationID, "mdf_idf_id": target.DistributionPointID, "mount_mode": "NONE"}); err != nil {
		return CanonicalRelocationResult{}, err
	}
	for _, child := range children {
		if child.LocationID == target.LocationID {
			continue
		}
		if err = writeCanonicalRelocationAudit(ctx, tdb, tenantID, userID, child.AssetID, "Cascada de relocalización por movimiento de Rack",
			map[string]string{"location_id": child.LocationID, "housing_rack_id": child.HousingRackID, "mount_mode": child.MountMode},
			map[string]string{"location_id": target.LocationID, "housing_rack_id": child.HousingRackID, "mount_mode": child.MountMode}); err != nil {
			return CanonicalRelocationResult{}, err
		}
	}
	return CanonicalRelocationResult{AssetID: assetID, AssetType: "RACK", LocationID: target.LocationID, MountMode: "NONE", DistributionPointID: target.DistributionPointID, CascadedAssets: len(children), Changed: changed}, nil
}

func relocateCanonicalEquipment(ctx context.Context, tdb TenantDB, userID, tenantID, branchID, assetID string, current canonicalRelocationSnapshot, target CanonicalHousingState) (CanonicalRelocationResult, error) {
	if _, err := tdb.ExecContext(ctx, `UPDATE assets SET location_id=$1,housing_rack_id=NULLIF($2,'')::uuid,mount_mode=$3,updated_at=NOW()
		WHERE id=$4 AND tenant_id=$5 AND branch_id=$6`, target.LocationID, target.HousingRackID, target.MountMode, assetID, tenantID, branchID); err != nil {
		return CanonicalRelocationResult{}, err
	}
	changed := current.LocationID != target.LocationID || current.HousingRackID != target.HousingRackID || current.MountMode != target.MountMode
	if err := writeCanonicalRelocationAudit(ctx, tdb, tenantID, userID, assetID, "Relocalización canónica de equipo",
		map[string]string{"location_id": current.LocationID, "housing_rack_id": current.HousingRackID, "mount_mode": current.MountMode},
		map[string]string{"location_id": target.LocationID, "housing_rack_id": target.HousingRackID, "mount_mode": target.MountMode}); err != nil {
		return CanonicalRelocationResult{}, err
	}
	return CanonicalRelocationResult{AssetID: assetID, AssetType: current.AssetType, LocationID: target.LocationID, HousingRackID: target.HousingRackID, MountMode: target.MountMode, Changed: changed}, nil
}

func loadRelocationChildren(ctx context.Context, tdb TenantDB, tenantID, branchID, rackID string) ([]relocationChildSnapshot, error) {
	rows, err := tdb.QueryContext(ctx, `SELECT id::text,COALESCE(location_id::text,''),COALESCE(housing_rack_id::text,''),COALESCE(mount_mode,'NONE')
		FROM assets WHERE housing_rack_id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE`, rackID, tenantID, branchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	children := []relocationChildSnapshot{}
	for rows.Next() {
		var child relocationChildSnapshot
		if err := rows.Scan(&child.AssetID, &child.LocationID, &child.HousingRackID, &child.MountMode); err != nil {
			return nil, err
		}
		children = append(children, child)
	}
	return children, rows.Err()
}

func writeCanonicalRelocationAudit(ctx context.Context, tdb TenantDB, tenantID, userID, assetID, notes string, before, after map[string]string) error {
	oldValue, err := json.Marshal(before)
	if err != nil {
		return err
	}
	newValue, err := json.Marshal(after)
	if err != nil {
		return err
	}
	_, err = tdb.ExecContext(ctx, `INSERT INTO asset_logs(tenant_id,asset_id,event_type,old_value,new_value,notes,performed_by)
		VALUES($1,$2,'location_change',$3,$4,$5,$6)`, tenantID, assetID, string(oldValue), string(newValue), notes, userID)
	return err
}

func writeCanonicalRelocationError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	switch {
	case errors.Is(err, ErrRelocationAssetNotFound):
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "ASSET_NOT_FOUND"})
	case errors.Is(err, ErrRelocationUnsupported):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "RELOCATION_UNSUPPORTED"})
	case errors.Is(err, ErrZoneRequired):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "ZONE_REQUIRED"})
	case errors.Is(err, ErrZoneNotFound):
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "ZONE_NOT_FOUND"})
	case errors.Is(err, ErrInvalidAssetPlacement):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "INVALID_ASSET_PLACEMENT"})
	case errors.Is(err, ErrInvalidPhysicalScope):
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "PHYSICAL_SCOPE_MISMATCH"})
	case errors.Is(err, ErrAssetTypeMutationDenied), errors.Is(err, ErrLegacyRelocationDenied):
		writeAssetRelocationError(w, err)
	default:
		writeCanonicalHousingError(w, err)
	}
}
