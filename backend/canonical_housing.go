package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

var (
	ErrInvalidPayload              = errors.New("invalid payload")
	ErrDistributionPointNotFound   = errors.New("distribution point not found")
	ErrHousingRackNotFound         = errors.New("housing rack not found")
	ErrPlacementNotFound           = errors.New("placement not found")
	ErrInvalidParentType           = errors.New("invalid parent type")
	ErrInvalidMountMode            = errors.New("invalid mount mode")
	ErrHousingRequired             = errors.New("housing required")
	ErrHousingForbidden            = errors.New("housing forbidden")
	ErrIncompatibleHousing         = errors.New("incompatible housing")
	ErrCanonicalRelocationConflict = errors.New("canonical relocation conflict")
)

type RoomPlacement struct {
	ID, TenantID, BranchID, Type, Name, Status string
}

// ResolveRoomPlacement resolves a client UUID inside the request TenantTx.
// Tenant and branch always come from the authenticated session.
func ResolveRoomPlacement(ctx context.Context, tdb TenantDB, scope PhysicalScope, locationID string) (RoomPlacement, error) {
	if tdb == nil || !scope.valid() || strings.TrimSpace(locationID) == "" {
		return RoomPlacement{}, ErrPlacementNotFound
	}
	var p RoomPlacement
	err := tdb.QueryRowContext(ctx, `SELECT id,tenant_id,branch_id,placement_type,name,status
		FROM locations WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND status='active'`,
		locationID, scope.TenantID, scope.BranchID).
		Scan(&p.ID, &p.TenantID, &p.BranchID, &p.Type, &p.Name, &p.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return RoomPlacement{}, ErrPlacementNotFound
	}
	if err != nil {
		return RoomPlacement{}, fmt.Errorf("resolve room placement: %w", err)
	}
	return p, nil
}

type CanonicalHousingRequest struct {
	AssetTypeCode       string
	DistributionPointID string
	HousingRackID       string
	MountMode           string
	PlacementID         string
}

type CanonicalHousingState struct {
	MountMode           string
	LocationID          string
	HousingRackID       string
	DistributionPointID string
}

func ResolveCanonicalHousing(ctx context.Context, tdb TenantDB, scope PhysicalScope, req CanonicalHousingRequest) (CanonicalHousingState, error) {
	assetType := strings.ToUpper(strings.TrimSpace(req.AssetTypeCode))
	mountMode := strings.ToUpper(strings.TrimSpace(req.MountMode))
	switch assetType {
	case "RACK":
		if strings.TrimSpace(req.DistributionPointID) == "" {
			return CanonicalHousingState{}, ErrHousingRequired
		}
		parent, err := ResolveDistributionPoint(ctx, tdb, scope, req.DistributionPointID, false)
		if err != nil {
			if errors.Is(err, ErrDistributionNotFound) {
				return CanonicalHousingState{}, ErrDistributionPointNotFound
			}
			return CanonicalHousingState{}, err
		}
		if req.PlacementID != "" && req.PlacementID != parent.LocationID {
			return CanonicalHousingState{}, ErrPhysicalScopeMismatch
		}
		return CanonicalHousingState{MountMode: "NONE", LocationID: parent.LocationID, DistributionPointID: parent.ID}, nil

	case "PATCH_PANEL", "SWITCH", "PDU":
		if strings.TrimSpace(req.HousingRackID) == "" {
			return CanonicalHousingState{}, ErrHousingRequired
		}
		housing, err := ResolveHousing(ctx, tdb, scope, req.HousingRackID)
		if err != nil {
			if errors.Is(err, ErrHousingNotFound) {
				return CanonicalHousingState{}, ErrHousingRackNotFound
			}
			return CanonicalHousingState{}, err
		}
		if req.PlacementID != "" && req.PlacementID != housing.LocationID {
			return CanonicalHousingState{}, ErrPhysicalScopeMismatch
		}
		return CanonicalHousingState{MountMode: "RACK_MOUNTED", LocationID: housing.LocationID, HousingRackID: housing.RackID}, nil

	case "UPS":
		switch mountMode {
		case "RACK_MOUNTED":
			if strings.TrimSpace(req.HousingRackID) == "" {
				return CanonicalHousingState{}, ErrHousingRequired
			}
			housing, err := ResolveHousing(ctx, tdb, scope, req.HousingRackID)
			if err != nil {
				if errors.Is(err, ErrHousingNotFound) {
					return CanonicalHousingState{}, ErrHousingRackNotFound
				}
				return CanonicalHousingState{}, err
			}
			if req.PlacementID != "" && req.PlacementID != housing.LocationID {
				return CanonicalHousingState{}, ErrPhysicalScopeMismatch
			}
			return CanonicalHousingState{MountMode: mountMode, LocationID: housing.LocationID, HousingRackID: housing.RackID}, nil
		case "ROOM_MOUNTED":
			if strings.TrimSpace(req.HousingRackID) != "" {
				return CanonicalHousingState{}, ErrHousingForbidden
			}
			placement, err := ResolveRoomPlacement(ctx, tdb, scope, req.PlacementID)
			if err != nil {
				return CanonicalHousingState{}, err
			}
			return CanonicalHousingState{MountMode: mountMode, LocationID: placement.ID}, nil
		default:
			return CanonicalHousingState{}, ErrInvalidMountMode
		}
	default:
		return CanonicalHousingState{}, ErrInvalidParentType
	}
}

func writeCanonicalHousingError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	status, code := http.StatusInternalServerError, "INTERNAL_ERROR"
	switch {
	case errors.Is(err, ErrInvalidPayload):
		status, code = http.StatusBadRequest, "INVALID_PAYLOAD"
	case errors.Is(err, ErrDistributionPointNotFound):
		status, code = http.StatusNotFound, "DISTRIBUTION_POINT_NOT_FOUND"
	case errors.Is(err, ErrHousingRackNotFound):
		status, code = http.StatusNotFound, "HOUSING_RACK_NOT_FOUND"
	case errors.Is(err, ErrPlacementNotFound):
		status, code = http.StatusNotFound, "PLACEMENT_NOT_FOUND"
	case errors.Is(err, ErrCanonicalRelocationConflict):
		status, code = http.StatusConflict, "CANONICAL_RELOCATION_CONFLICT"
	case errors.Is(err, ErrIncompatibleHousing):
		status, code = http.StatusConflict, "INCOMPATIBLE_HOUSING"
	case errors.Is(err, ErrPhysicalScopeMismatch):
		status, code = http.StatusConflict, "PHYSICAL_SCOPE_MISMATCH"
	case errors.Is(err, ErrInvalidParentType):
		status, code = http.StatusUnprocessableEntity, "INVALID_PARENT_TYPE"
	case errors.Is(err, ErrInvalidMountMode):
		status, code = http.StatusUnprocessableEntity, "INVALID_MOUNT_MODE"
	case errors.Is(err, ErrHousingRequired):
		status, code = http.StatusUnprocessableEntity, "HOUSING_REQUIRED"
	case errors.Is(err, ErrHousingForbidden):
		status, code = http.StatusUnprocessableEntity, "HOUSING_FORBIDDEN"
	}
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}
