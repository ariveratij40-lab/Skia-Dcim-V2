package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// completeCanonicalPhysicalContext reuses the engine's typed ID-only input.
// Operational adapters may know only a placement or housing reference. Resolve
// its ancestors inside the same TenantTx; never manufacture physical codes or
// silently override a contradictory explicit reference. Legacy context remains
// governed by its existing compatibility resolver.
func completeCanonicalPhysicalContext(ctx context.Context, tdb TenantDB, in CanonicalNomenclatureInput) (CanonicalNomenclatureInput, error) {
	if in.Policy.ContextMode == NomenclatureContextLegacyInternalArea {
		return in, nil
	}
	scope := PhysicalScope{TenantID: in.TenantID, BranchID: in.BranchID}
	bind := func(target *string, resolved string) error {
		if *target != "" && *target != resolved {
			return ErrPhysicalScopeMismatch
		}
		*target = resolved
		return nil
	}
	if in.Placement != nil {
		if err := bind(&in.PlacementID, in.Placement.ID); err != nil {
			return in, err
		}
	}
	if in.CanonicalZone != nil {
		if err := bind(&in.ZoneID, in.CanonicalZone.ID); err != nil {
			return in, err
		}
		// V2 references are re-resolved; compatibility objects are not a second
		// authority for codes, status or scope.
		in.CanonicalZone = nil
	}
	if in.HousingRackID != "" {
		h, err := ResolveHousing(ctx, tdb, scope, in.HousingRackID)
		if err != nil {
			return in, err
		}
		if err = bind(&in.DistributionID, h.DistributionID); err != nil {
			return in, err
		}
		if err = bind(&in.PlacementID, h.LocationID); err != nil {
			return in, err
		}
	}
	if in.DistributionID != "" {
		d, err := ResolveDistributionPoint(ctx, tdb, scope, in.DistributionID, false)
		if err != nil {
			return in, err
		}
		if err = bind(&in.PlacementID, d.LocationID); err != nil {
			return in, err
		}
		if err = bind(&in.ZoneID, d.ZoneID); err != nil {
			return in, err
		}
	}
	if in.PlacementID != "" {
		var zone sql.NullString
		err := tdb.QueryRowContext(ctx, `SELECT zone_id FROM locations
			WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND status='active'
			AND placement_type IN ('MDF','IDF','WAREHOUSE')`, in.PlacementID, in.TenantID, in.BranchID).Scan(&zone)
		if errors.Is(err, sql.ErrNoRows) {
			return in, ErrInvalidAssetPlacement
		}
		if err != nil {
			return in, fmt.Errorf("resolve canonical placement ancestry: %w", err)
		}
		if err = bind(&in.ZoneID, zone.String); err != nil {
			return in, err
		}
	}
	if in.Policy.ContextMode == NomenclatureContextCanonicalZone && in.ZoneID == "" {
		return in, ErrZoneRequired
	}
	return in, nil
}
