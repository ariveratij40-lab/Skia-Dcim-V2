package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

type PhysicalScope struct{ TenantID, BranchID string }

var (
	ErrInvalidPhysicalScope = errors.New("invalid_physical_scope")
	ErrZoneNotFound         = errors.New("zone_not_found_in_scope")
	ErrDistributionNotFound = errors.New("distribution_not_found_in_scope")
	ErrHousingNotFound      = errors.New("housing_not_found_in_scope")
	ErrStructuredPlacement  = errors.New("invalid_structured_placement")
	ErrRelationshipEndpoint = errors.New("relationship_endpoint_not_found_in_tenant")
	ErrRelationshipType     = errors.New("relationship_endpoint_type_not_allowed")
	ErrRelationshipBranch   = errors.New("relationship_endpoint_branch_unauthorized")
)

func (s PhysicalScope) valid() bool {
	return strings.TrimSpace(s.TenantID) != "" && strings.TrimSpace(s.BranchID) != ""
}

type CanonicalZone struct {
	ID, TenantID, BranchID, Code, Name, Status   string
	BuildingID, BuildingCode, FloorID, FloorName string
}

func ResolveCanonicalZone(ctx context.Context, tdb TenantDB, scope PhysicalScope, zoneID string) (CanonicalZone, error) {
	if tdb == nil || !scope.valid() || strings.TrimSpace(zoneID) == "" {
		return CanonicalZone{}, ErrInvalidPhysicalScope
	}
	var z CanonicalZone
	var buildingID, buildingCode, floorID, floorName sql.NullString
	err := tdb.QueryRowContext(ctx, `SELECT z.id,z.tenant_id,z.branch_id,z.code,z.name,z.status,
		b.id,b.code,f.id,f.name
		FROM zones z
		LEFT JOIN buildings b ON b.id=z.building_id AND b.tenant_id=z.tenant_id AND b.branch_id=z.branch_id
		LEFT JOIN floors f ON f.id=z.floor_id AND f.tenant_id=z.tenant_id AND f.building_id=z.building_id
		WHERE z.id=$1 AND z.tenant_id=$2 AND z.branch_id=$3 AND z.status='active'
		  AND (z.building_id IS NULL OR b.id IS NOT NULL)
		  AND (z.floor_id IS NULL OR (f.id IS NOT NULL AND z.building_id IS NOT NULL))`,
		zoneID, scope.TenantID, scope.BranchID).Scan(&z.ID, &z.TenantID, &z.BranchID, &z.Code, &z.Name, &z.Status,
		&buildingID, &buildingCode, &floorID, &floorName)
	if errors.Is(err, sql.ErrNoRows) {
		return CanonicalZone{}, ErrZoneNotFound
	}
	if err != nil {
		return CanonicalZone{}, fmt.Errorf("resolve canonical zone: %w", err)
	}
	z.BuildingID, z.BuildingCode = buildingID.String, buildingCode.String
	z.FloorID, z.FloorName = floorID.String, floorName.String
	return z, nil
}

type DistributionPoint struct {
	ID, AssetID, Type, LocationID, ZoneID, Status string
	LegacyInternalAreaID                          string
	Legacy                                        bool
}

func ResolveDistributionPoint(ctx context.Context, tdb TenantDB, scope PhysicalScope, id string, allowLegacy bool) (DistributionPoint, error) {
	if tdb == nil || !scope.valid() || strings.TrimSpace(id) == "" {
		return DistributionPoint{}, ErrInvalidPhysicalScope
	}
	var d DistributionPoint
	var zoneID, areaID sql.NullString
	err := tdb.QueryRowContext(ctx, `SELECT m.id,m.asset_id,m.type,l.id,l.zone_id,l.internal_area_id,a.status
		FROM mdf_idf m
		JOIN assets a ON a.id=m.asset_id AND a.tenant_id=m.tenant_id AND a.branch_id=m.branch_id
		JOIN locations l ON l.id=a.location_id AND l.tenant_id=a.tenant_id AND l.branch_id=a.branch_id
		WHERE m.id=$1 AND m.tenant_id=$2 AND m.branch_id=$3 AND m.type IN ('MDF','IDF')
		  AND a.status='active' AND l.status='active'`, id, scope.TenantID, scope.BranchID).
		Scan(&d.ID, &d.AssetID, &d.Type, &d.LocationID, &zoneID, &areaID, &d.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return DistributionPoint{}, ErrDistributionNotFound
	}
	if err != nil {
		return DistributionPoint{}, fmt.Errorf("resolve distribution: %w", err)
	}
	d.ZoneID, d.LegacyInternalAreaID = zoneID.String, areaID.String
	d.Legacy = !zoneID.Valid && areaID.Valid
	if !zoneID.Valid && !(allowLegacy && areaID.Valid) {
		return DistributionPoint{}, ErrDistributionNotFound
	}
	if zoneID.Valid {
		if _, err = ResolveCanonicalZone(ctx, tdb, scope, zoneID.String); err != nil {
			return DistributionPoint{}, ErrDistributionNotFound
		}
	}
	return d, nil
}

type Housing struct {
	ID, RackID, AssetID, Type, DistributionID, LocationID string
}

func ResolveHousing(ctx context.Context, tdb TenantDB, scope PhysicalScope, id string) (Housing, error) {
	if tdb == nil || !scope.valid() || strings.TrimSpace(id) == "" {
		return Housing{}, ErrInvalidPhysicalScope
	}
	var h Housing
	var distributionID, locationID sql.NullString
	err := tdb.QueryRowContext(ctx, `SELECT r.id,r.id,r.asset_id,r.housing_type,r.mdf_idf_id,a.location_id
		FROM racks r JOIN assets a ON a.id=r.asset_id AND a.tenant_id=r.tenant_id AND a.branch_id=r.branch_id
		WHERE r.id=$1 AND r.tenant_id=$2 AND r.branch_id=$3
		  AND r.housing_type IN ('RACK','CABINET') AND a.status='active'`, id, scope.TenantID, scope.BranchID).
		Scan(&h.ID, &h.RackID, &h.AssetID, &h.Type, &distributionID, &locationID)
	if errors.Is(err, sql.ErrNoRows) {
		return Housing{}, ErrHousingNotFound
	}
	if err != nil {
		return Housing{}, fmt.Errorf("resolve housing: %w", err)
	}
	h.DistributionID, h.LocationID = distributionID.String, locationID.String
	if !distributionID.Valid {
		return Housing{}, ErrHousingNotFound
	}
	if _, err = ResolveDistributionPoint(ctx, tdb, scope, distributionID.String, true); err != nil {
		return Housing{}, ErrHousingNotFound
	}
	return h, nil
}

type PlacementPolicy string

const (
	PolicyBranch           PlacementPolicy = "BRANCH"
	PolicyZone             PlacementPolicy = "ZONE"
	PolicyMDFIDF           PlacementPolicy = "MDF_IDF"
	PolicyHousing          PlacementPolicy = "HOUSING"
	PolicyFreePlacement    PlacementPolicy = "FREE_PLACEMENT"
	PolicyRelationshipOnly PlacementPolicy = "RELATIONSHIP_ONLY"
)

type PlacementRequirements struct {
	AssetTypeCode        string
	Policy               PlacementPolicy
	ZoneRequired         bool
	DistributionRequired bool
	HousingRequired      bool
	AllowedHousingTypes  []string
	AllowedFreeTargets   []string
	RelationshipRequired bool
}

func ResolvePlacementRequirements(ctx context.Context, tdb TenantDB, assetTypeCode, _ string) (PlacementRequirements, error) {
	if tdb == nil || strings.TrimSpace(assetTypeCode) == "" {
		return PlacementRequirements{}, ErrInvalidPhysicalScope
	}
	code := strings.ToUpper(strings.TrimSpace(assetTypeCode))
	var raw sql.NullString
	if err := tdb.QueryRowContext(ctx, `SELECT placement_policy FROM asset_types WHERE code=$1`, code).Scan(&raw); err != nil {
		return PlacementRequirements{}, fmt.Errorf("resolve placement policy: %w", err)
	}
	policy := PlacementPolicy(raw.String)
	if !raw.Valid || policy == "" {
		if code == "UPS" {
			policy = PolicyZone
		} else {
			return PlacementRequirements{}, fmt.Errorf("placement_policy_unconfigured:%s", code)
		}
	}
	r := PlacementRequirements{AssetTypeCode: code, Policy: policy}
	switch policy {
	case PolicyBranch:
	case PolicyZone:
		r.ZoneRequired = true
	case PolicyMDFIDF:
		r.DistributionRequired = true
	case PolicyHousing:
		r.HousingRequired = true
		r.AllowedHousingTypes = []string{"RACK", "CABINET"}
	case PolicyFreePlacement:
		r.AllowedFreeTargets = []string{"ZONE", "HOUSING"}
	case PolicyRelationshipOnly:
		r.RelationshipRequired = true
	default:
		return PlacementRequirements{}, fmt.Errorf("unsupported_placement_policy:%s", policy)
	}
	return r, nil
}

type PhysicalPlacementInput struct {
	ZoneID, DistributionID, HousingID string
	FreeTargetType, FreeTargetID      string
	RelationshipOriginID              string
	RelationshipDestinationID         string
	UserID                            string
}

type StructuredPlacement struct {
	Type    string
	Zone    *CanonicalZone
	Housing *Housing
}

func ResolveFreePlacement(ctx context.Context, tdb TenantDB, scope PhysicalScope, targetType, targetID string) (StructuredPlacement, error) {
	targetType = strings.ToUpper(strings.TrimSpace(targetType))
	if strings.TrimSpace(targetID) == "" {
		return StructuredPlacement{}, ErrStructuredPlacement
	}
	switch targetType {
	case "ZONE":
		zone, err := ResolveCanonicalZone(ctx, tdb, scope, targetID)
		if err != nil {
			return StructuredPlacement{}, ErrStructuredPlacement
		}
		return StructuredPlacement{Type: targetType, Zone: &zone}, nil
	case "HOUSING":
		housing, err := ResolveHousing(ctx, tdb, scope, targetID)
		if err != nil {
			return StructuredPlacement{}, ErrStructuredPlacement
		}
		return StructuredPlacement{Type: targetType, Housing: &housing}, nil
	default:
		return StructuredPlacement{}, ErrStructuredPlacement
	}
}

type RelationshipEndpoint struct{ ID, TenantID, BranchID, AssetTypeCode string }
type ResolvedRelationship struct {
	Origin, Destination RelationshipEndpoint
	InterBranch         bool
}

func resolveRelationshipEndpoint(ctx context.Context, tdb TenantDB, scope PhysicalScope, userID, endpointID string) (RelationshipEndpoint, error) {
	if tdb == nil || !scope.valid() || strings.TrimSpace(userID) == "" || strings.TrimSpace(endpointID) == "" {
		return RelationshipEndpoint{}, ErrRelationshipEndpoint
	}
	var endpoint RelationshipEndpoint
	var branchAuthorized bool
	err := tdb.QueryRowContext(ctx, `SELECT a.id,a.tenant_id,a.branch_id,at.code,
		EXISTS(SELECT 1 FROM user_branches ub JOIN branches b ON b.id=ub.branch_id
			WHERE ub.user_id=$3 AND ub.branch_id=a.branch_id AND b.tenant_id=$2 AND b.status='active')
		FROM assets a JOIN asset_types at ON at.id=a.asset_type_id
		WHERE a.id=$1 AND a.tenant_id=$2 AND a.status='active'`, endpointID, scope.TenantID, userID).
		Scan(&endpoint.ID, &endpoint.TenantID, &endpoint.BranchID, &endpoint.AssetTypeCode, &branchAuthorized)
	if errors.Is(err, sql.ErrNoRows) {
		return RelationshipEndpoint{}, ErrRelationshipEndpoint
	}
	if err != nil {
		return RelationshipEndpoint{}, fmt.Errorf("resolve relationship endpoint: %w", err)
	}
	if !branchAuthorized {
		return RelationshipEndpoint{}, ErrRelationshipBranch
	}
	if endpoint.AssetTypeCode != "MDF" && endpoint.AssetTypeCode != "IDF" {
		return RelationshipEndpoint{}, ErrRelationshipType
	}
	return endpoint, nil
}

func ResolveRelationshipEndpoints(ctx context.Context, tdb TenantDB, scope PhysicalScope, userID, originID, destinationID string) (ResolvedRelationship, error) {
	origin, err := resolveRelationshipEndpoint(ctx, tdb, scope, userID, originID)
	if err != nil {
		return ResolvedRelationship{}, fmt.Errorf("origin: %w", err)
	}
	destination, err := resolveRelationshipEndpoint(ctx, tdb, scope, userID, destinationID)
	if err != nil {
		return ResolvedRelationship{}, fmt.Errorf("destination: %w", err)
	}
	return ResolvedRelationship{Origin: origin, Destination: destination, InterBranch: origin.BranchID != destination.BranchID}, nil
}

type ReadinessReason string

const (
	ReasonBranchUnavailable      ReadinessReason = "BRANCH_UNAVAILABLE"
	ReasonZoneRequired           ReadinessReason = "ZONE_REQUIRED"
	ReasonDistributionRequired   ReadinessReason = "MDF_IDF_REQUIRED"
	ReasonHousingRequired        ReadinessReason = "HOUSING_REQUIRED"
	ReasonNamingRequired         ReadinessReason = "NAMING_RULE_REQUIRED"
	ReasonPlacementPolicyMissing ReadinessReason = "PLACEMENT_POLICY_UNCONFIGURED"
	ReasonStructuredPlacement    ReadinessReason = "STRUCTURED_PLACEMENT_REQUIRED"
	ReasonRelationshipEndpoints  ReadinessReason = "RELATIONSHIP_ENDPOINTS_REQUIRED"
	ReasonRelationshipAuthority  ReadinessReason = "RELATIONSHIP_ENDPOINT_AUTHORITY_REQUIRED"
)

type ReadinessEvaluation struct {
	Ready        bool
	Reasons      []ReadinessReason
	Requirements PlacementRequirements
}

func EvaluatePhysicalStructureReadiness(ctx context.Context, tdb TenantDB, scope PhysicalScope) (ReadinessEvaluation, error) {
	result := ReadinessEvaluation{}
	if tdb == nil || !scope.valid() {
		result.Reasons = []ReadinessReason{ReasonBranchUnavailable}
		return result, nil
	}
	var branch, zones int
	err := tdb.QueryRowContext(ctx, `SELECT
		(SELECT count(*) FROM branches WHERE id=$1 AND tenant_id=$2 AND status='active'),
		(SELECT count(*) FROM zones WHERE tenant_id=$2 AND branch_id=$1 AND status='active')`, scope.BranchID, scope.TenantID).Scan(&branch, &zones)
	if err != nil {
		return result, fmt.Errorf("physical readiness: %w", err)
	}
	if branch == 0 {
		result.Reasons = append(result.Reasons, ReasonBranchUnavailable)
	}
	if zones == 0 {
		result.Reasons = append(result.Reasons, ReasonZoneRequired)
	}
	result.Ready = len(result.Reasons) == 0
	return result, nil
}

func EvaluateAssetTypeCreationReadiness(ctx context.Context, tdb TenantDB, scope PhysicalScope, assetTypeCode, subtype string, input PhysicalPlacementInput) (ReadinessEvaluation, error) {
	r := ReadinessEvaluation{}
	req, err := ResolvePlacementRequirements(ctx, tdb, assetTypeCode, subtype)
	if err != nil {
		r.Reasons = []ReadinessReason{ReasonPlacementPolicyMissing}
		return r, nil
	}
	r.Requirements = req
	if req.ZoneRequired {
		if _, e := ResolveCanonicalZone(ctx, tdb, scope, input.ZoneID); e != nil {
			r.Reasons = append(r.Reasons, ReasonZoneRequired)
		}
	}
	if req.DistributionRequired {
		if _, e := ResolveDistributionPoint(ctx, tdb, scope, input.DistributionID, false); e != nil {
			r.Reasons = append(r.Reasons, ReasonDistributionRequired)
		}
	}
	if req.HousingRequired {
		if _, e := ResolveHousing(ctx, tdb, scope, input.HousingID); e != nil {
			r.Reasons = append(r.Reasons, ReasonHousingRequired)
		}
	}
	if req.Policy == PolicyFreePlacement {
		if _, e := ResolveFreePlacement(ctx, tdb, scope, input.FreeTargetType, input.FreeTargetID); e != nil {
			r.Reasons = append(r.Reasons, ReasonStructuredPlacement)
		}
	}
	if req.RelationshipRequired {
		if _, e := ResolveRelationshipEndpoints(ctx, tdb, scope, input.UserID, input.RelationshipOriginID, input.RelationshipDestinationID); e != nil {
			if errors.Is(e, ErrRelationshipBranch) {
				r.Reasons = append(r.Reasons, ReasonRelationshipAuthority)
			} else {
				r.Reasons = append(r.Reasons, ReasonRelationshipEndpoints)
			}
		}
	}
	var naming bool
	if e := tdb.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM naming_rules WHERE tenant_id=$1 AND asset_type_code=$2 AND active=true)`, scope.TenantID, req.AssetTypeCode).Scan(&naming); e != nil {
		return r, fmt.Errorf("asset readiness naming: %w", e)
	}
	if !naming {
		r.Reasons = append(r.Reasons, ReasonNamingRequired)
	}
	r.Ready = len(r.Reasons) == 0
	return r, nil
}

func EvaluateInitialOnboardingReadiness(ctx context.Context, tdb TenantDB, scope PhysicalScope, chosenAssetType string) (ReadinessEvaluation, error) {
	physical, err := EvaluatePhysicalStructureReadiness(ctx, tdb, scope)
	if err != nil || !physical.Ready || strings.TrimSpace(chosenAssetType) == "" {
		return physical, err
	}
	var configured bool
	if err = tdb.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM naming_rules WHERE tenant_id=$1 AND asset_type_code=$2 AND active=true)`, scope.TenantID, strings.ToUpper(chosenAssetType)).Scan(&configured); err != nil {
		return physical, err
	}
	if !configured {
		physical.Ready = false
		physical.Reasons = append(physical.Reasons, ReasonNamingRequired)
	}
	return physical, nil
}
