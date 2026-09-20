package main

import (
	"context"
	"strings"
)

// resolveNomenclatureHousing is driven by the validated effective naming
// policy. Asset-type-specific satellite/legacy mounting rules are separate.
// The returned authority feeds BOTH nomenclature and asset persistence.
func resolveNomenclatureHousing(ctx context.Context, db TenantDB, scope PhysicalScope, policy CanonicalNomenclaturePolicy, req CanonicalHousingRequest) (*CanonicalHousingState, error) {
	if err := validateCanonicalNomenclaturePolicy(policy); err != nil {
		return nil, err
	}
	if policy.ContextMode != NomenclatureContextCanonicalHousing {
		return nil, nil
	}
	if strings.TrimSpace(req.HousingRackID) == "" {
		return nil, ErrInvalidAssetPlacement
	}
	h, err := ResolveHousing(ctx, db, scope, req.HousingRackID)
	if err != nil {
		return nil, err
	}
	if req.PlacementID != "" && req.PlacementID != h.LocationID {
		return nil, ErrPhysicalScopeMismatch
	}
	if req.DistributionPointID != "" && req.DistributionPointID != h.DistributionID {
		return nil, ErrPhysicalScopeMismatch
	}
	if req.MountMode != "" && req.MountMode != "NONE" && req.MountMode != "RACK_MOUNTED" {
		return nil, ErrPhysicalScopeMismatch
	}
	return &CanonicalHousingState{MountMode: "RACK_MOUNTED", LocationID: h.LocationID, HousingRackID: h.RackID, DistributionPointID: h.DistributionID}, nil
}
