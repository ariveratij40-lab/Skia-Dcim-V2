package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

var (
	ErrManualAssetCode             = errors.New("manual asset code is not allowed")
	ErrAssetNameNeeded             = errors.New("descriptive asset name is required")
	ErrCanonicalZoneNamingRequired = errors.New("canonical zone naming rule is required")
	ErrZoneRequired                = errors.New("canonical zone is required")
)

var installableAssetTypes = map[string]bool{
	"SWITCH": true, "RACK": true, "PATCH_PANEL": true,
	"UPS": true, "PDU": true, "NODE": true,
}

type managedAssetInput struct {
	AssetTypeCode     string
	Name              string
	ManualCode        string
	Status            string
	Manufacturer      string
	Model             string
	SerialNumber      string
	Observations      string
	InstallYear       int
	PlacementID       string
	PhysicalLocation  *ResolvedPhysicalLocation
	CanonicalZone     *CanonicalZone
	NamingContextMode string
}

// managedAssetReservation is state produced inside the request TenantTx.
// It deliberately does not retain or expose a database handle: the caller
// must keep using the TenantDB injected by RequireTenantTx for the satellite
// insert, and the middleware owns the only Commit/Rollback boundary.
type managedAssetReservation struct {
	AssetID    string
	Assignment NomenclatureAssignment
}

type mdfIdfCreateInput struct {
	TenantAssertion, BranchAssertion string
	Name, Type, ManualCode, Status   string
	SiteID, InternalAreaID, ZoneID   string
	Observations                     string
}

type mdfIdfCreateResult struct {
	Managed *managedAssetReservation
	MdfID   string
}

var (
	ErrTenantScopeMismatch = errors.New("tenant scope mismatch")
	ErrBranchScopeMismatch = errors.New("branch scope mismatch")
)

// createMdfIdf owns the single MDF/IDF creation policy used by both HTTP
// entry points. The caller supplies the request-scoped TenantDB; commit and
// rollback remain exclusively owned by RequireTenantTx.
func createMdfIdf(ctx context.Context, tenantTx TenantDB, userID, tenantID, branchID string, input mdfIdfCreateInput) (*mdfIdfCreateResult, error) {
	if strings.TrimSpace(input.TenantAssertion) != "" && input.TenantAssertion != tenantID {
		return nil, ErrTenantScopeMismatch
	}
	if strings.TrimSpace(input.BranchAssertion) != "" && input.BranchAssertion != branchID {
		return nil, ErrBranchScopeMismatch
	}
	mdfType := strings.ToUpper(strings.TrimSpace(input.Type))
	if mdfType != "MDF" && mdfType != "IDF" {
		return nil, ErrInvalidDistributionType
	}
	if input.Status == "" {
		input.Status = "active"
	}
	scope := PhysicalScope{TenantID: tenantID, BranchID: branchID}
	zoneID, areaID, siteID := strings.TrimSpace(input.ZoneID), strings.TrimSpace(input.InternalAreaID), strings.TrimSpace(input.SiteID)
	var physicalLocation *ResolvedPhysicalLocation
	var canonicalZone *CanonicalZone
	var namingContextMode string
	if zoneID != "" {
		zone, err := ResolveCanonicalZone(ctx, tenantTx, scope, zoneID)
		if err != nil {
			return nil, err
		}
		if siteID != "" && zone.BuildingID != siteID {
			return nil, ErrPhysicalScopeMismatch
		}
		canonicalZone = &zone
		namingContextMode = "CANONICAL_ZONE"
		var compatibleRules int
		if err := tenantTx.QueryRowContext(ctx, `SELECT count(*) FROM naming_rules WHERE tenant_id=$1 AND asset_type_code=$2 AND active=TRUE AND context_mode='CANONICAL_ZONE'`, tenantID, mdfType).Scan(&compatibleRules); err != nil {
			return nil, err
		}
		if compatibleRules != 1 {
			return nil, ErrCanonicalZoneNamingRequired
		}
		if areaID != "" {
			resolved, err := ResolvePhysicalLocationForZone(ctx, tenantTx, scope, zone, siteID, areaID)
			if err != nil {
				return nil, err
			}
			physicalLocation = &resolved
		}
	} else if areaID != "" {
		resolved, err := ResolvePhysicalLocation(ctx, tenantTx, tenantID, branchID, siteID, areaID)
		if err != nil {
			return nil, ErrInvalidPhysicalLocation
		}
		physicalLocation = &resolved
		namingContextMode = "LEGACY_INTERNAL_AREA"
	} else {
		return nil, ErrZoneRequired
	}
	placementID := generateID()
	if _, err := tenantTx.ExecContext(ctx, `INSERT INTO locations(id,tenant_id,branch_id,placement_type,name,status,zone_id,internal_area_id) VALUES($1,$2,$3,$4,$5,'active',NULLIF($6,'')::uuid,NULLIF($7,'')::uuid)`, placementID, tenantID, branchID, mdfType, input.Name, zoneID, areaID); err != nil {
		return nil, err
	}
	managed, err := reserveManagedAsset(tenantTx, tenantID, branchID, userID, managedAssetInput{
		AssetTypeCode: mdfType, Name: input.Name, ManualCode: input.ManualCode,
		Status: input.Status, Observations: input.Observations, PlacementID: placementID,
		PhysicalLocation: physicalLocation, CanonicalZone: canonicalZone, NamingContextMode: namingContextMode,
	})
	if err != nil {
		return nil, err
	}
	mdfID := generateID()
	if _, err = tenantTx.ExecContext(ctx, `INSERT INTO mdf_idf (id,asset_id,tenant_id,branch_id,type) VALUES($1,$2,$3,$4,$5)`, mdfID, managed.AssetID, tenantID, branchID, mdfType); err != nil {
		return nil, err
	}
	if _, err = tenantTx.ExecContext(ctx, `UPDATE locations SET placement_code=$1,asset_id=$2,updated_at=NOW() WHERE id=$3 AND tenant_id=$4 AND branch_id=$5`, managed.Assignment.Code, managed.AssetID, placementID, tenantID, branchID); err != nil {
		return nil, err
	}
	if _, err = tenantTx.ExecContext(ctx, `INSERT INTO asset_logs(tenant_id,asset_id,event_type,new_value,notes,performed_by) VALUES($1,$2,'created',$3,$4,$5)`, tenantID, managed.AssetID, managed.Assignment.Code, "Alta MDF/IDF con ubicación física canónica", userID); err != nil {
		return nil, err
	}
	return &mdfIdfCreateResult{Managed: managed, MdfID: mdfID}, nil
}

func reserveManagedAsset(tenantTx TenantDB, tenantID, branchID, userID string, input managedAssetInput) (*managedAssetReservation, error) {
	if strings.TrimSpace(input.ManualCode) != "" {
		return nil, ErrManualAssetCode
	}
	if strings.TrimSpace(input.Name) == "" {
		return nil, ErrAssetNameNeeded
	}
	if input.Status == "" {
		input.Status = "active"
	}
	var assetTypeID string
	if tenantTx == nil {
		return nil, errors.New("request TenantDB is required")
	}
	if err := tenantTx.QueryRow(`SELECT id FROM asset_types WHERE code=$1`, input.AssetTypeCode).Scan(&assetTypeID); err != nil {
		return nil, fmt.Errorf("resolve asset type: %w", err)
	}
	var placement *ResolvedPlacement
	if installableAssetTypes[input.AssetTypeCode] {
		if strings.TrimSpace(input.PlacementID) == "" {
			return nil, ErrInvalidAssetPlacement
		}
		resolved, resolveErr := ResolveAssetPlacement(context.Background(), tenantTx, AssetPlacementContext{TenantID: tenantID, BranchID: branchID, PlacementID: input.PlacementID})
		if resolveErr != nil {
			return nil, resolveErr
		}
		placement = &resolved
		if resolved.Type == "WAREHOUSE" {
			input.Status = "inactive"
		}
	}
	assignment, err := (&DCIMHandler{}).generateInternalCodeWithContext(tenantTx, NomenclatureContext{TenantID: tenantID, BranchID: branchID, AssetTypeCode: input.AssetTypeCode, Placement: placement, PhysicalLocation: input.PhysicalLocation, CanonicalZone: input.CanonicalZone, ContextMode: input.NamingContextMode})
	if err != nil {
		return nil, err
	}
	assetID := uuid.NewString()
	_, err = tenantTx.Exec(`
		INSERT INTO assets (
			id, tenant_id, branch_id, asset_type_id,
			internal_code, nomenclature_id, nomenclature_sequence, name,
			status, manufacturer, model, serial_number, observations, install_year, created_by, location_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),NULLIF($11,''),NULLIF($12,''),NULLIF($13,''),NULLIF($14,0),$15,NULLIF($16,'')::uuid)`,
		assetID, tenantID, branchID, assetTypeID,
		assignment.Code, assignment.ID, assignment.Sequence, strings.TrimSpace(input.Name),
		input.Status, input.Manufacturer, input.Model, input.SerialNumber, input.Observations, input.InstallYear, userID, input.PlacementID,
	)
	if err != nil {
		return nil, fmt.Errorf("insert managed asset: %w", err)
	}
	return &managedAssetReservation{AssetID: assetID, Assignment: assignment}, nil
}

func writeManagedAssetError(w http.ResponseWriter, err error, assetTypeCode string) {
	w.Header().Set("Content-Type", "application/json")
	switch {
	case errors.Is(err, ErrNomenclatureRequired):
		writeNomenclatureRequired(w, assetTypeCode)
	case errors.Is(err, ErrManualAssetCode):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "manual_code_not_allowed", "asset_type": strings.ToLower(assetTypeCode),
			"message": "El código técnico se genera exclusivamente a partir de la nomenclatura activa.",
		})
	case errors.Is(err, ErrAssetNameNeeded):
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "name_required", "message": "El nombre descriptivo es obligatorio."})
	case errors.Is(err, ErrInvalidAssetPlacement):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid_asset_placement", "field": "placement_id", "message": "Seleccione una ubicación activa de la sucursal actual."})
	case errors.Is(err, ErrInvalidPhysicalLocation):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid_physical_location", "message": "Seleccione un sitio y un área interna activos de la sucursal actual."})
	case errors.Is(err, ErrZoneRequired):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "ZONE_REQUIRED", "field": "zone_id", "message": "Seleccione una Zona canónica activa de la sucursal actual."})
	case errors.Is(err, ErrZoneNotFound):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "ZONE_NOT_AUTHORIZED", "field": "zone_id", "message": "La Zona no está disponible en la sucursal actual."})
	case errors.Is(err, ErrPhysicalScopeMismatch):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "PLACEMENT_SCOPE_MISMATCH", "message": "Las referencias físicas no pertenecen al mismo ámbito autorizado."})
	case errors.Is(err, ErrCanonicalZoneNamingRequired):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "NAMING_RULE_ZONE_CONTEXT_REQUIRED", "asset_type": strings.ToLower(assetTypeCode), "message": "Configure y active una nomenclatura compatible con Zona antes de crear el activo."})
	case strings.Contains(err.Error(), "unique"):
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "asset_code_conflict", "message": "No fue posible reservar un código técnico único."})
	default:
		http.Error(w, `{"error":"database error creating asset"}`, http.StatusInternalServerError)
	}
}

func writeManagedAssetCreated(w http.ResponseWriter, managed *managedAssetReservation, payload map[string]interface{}) bool {
	if payload == nil {
		payload = map[string]interface{}{}
	}
	payload["asset_id"] = managed.AssetID
	payload["internal_code"] = managed.Assignment.Code
	payload["nomenclature_id"] = managed.Assignment.ID
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(payload)
	return true
}
