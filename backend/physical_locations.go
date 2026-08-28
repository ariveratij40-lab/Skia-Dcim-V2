package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

var ErrInvalidPhysicalLocation = errors.New("invalid physical location")
var ErrPhysicalScopeMismatch = errors.New("physical placement scope mismatch")

type ResolvedPhysicalLocation struct {
	SiteID, SiteCode, SiteName string
	AreaID, AreaCode, AreaName string
	Active                     bool
}

func ResolvePhysicalLocation(ctx context.Context, tdb TenantDB, tenantID, branchID, siteID, areaID string) (ResolvedPhysicalLocation, error) {
	var result ResolvedPhysicalLocation
	if strings.TrimSpace(tenantID) == "" || strings.TrimSpace(branchID) == "" || strings.TrimSpace(siteID) == "" || strings.TrimSpace(areaID) == "" {
		return result, ErrInvalidPhysicalLocation
	}
	var siteStatus, areaStatus string
	err := tdb.QueryRowContext(ctx, `
		SELECT b.id,b.code,b.name,b.status,ia.id,ia.code,ia.name,ia.status
		FROM buildings b JOIN internal_areas ia
		  ON ia.site_id=b.id AND ia.tenant_id=b.tenant_id AND ia.branch_id=b.branch_id
		WHERE b.id=$1 AND ia.id=$2 AND b.tenant_id=$3 AND b.branch_id=$4`,
		siteID, areaID, tenantID, branchID,
	).Scan(&result.SiteID, &result.SiteCode, &result.SiteName, &siteStatus, &result.AreaID, &result.AreaCode, &result.AreaName, &areaStatus)
	if errors.Is(err, sql.ErrNoRows) {
		return ResolvedPhysicalLocation{}, ErrInvalidPhysicalLocation
	}
	if err != nil {
		return ResolvedPhysicalLocation{}, err
	}
	result.Active = siteStatus == "active" && areaStatus == "active"
	if !result.Active {
		return ResolvedPhysicalLocation{}, ErrInvalidPhysicalLocation
	}
	return result, nil
}

// ResolvePhysicalLocationForZone validates an optional compatibility
// InternalArea against an already-authoritative canonical Zone. It never
// infers a Zone from the InternalArea and therefore cannot turn a legacy
// reference into V2 placement authority.
func ResolvePhysicalLocationForZone(ctx context.Context, tdb TenantDB, scope PhysicalScope, zone CanonicalZone, siteID, areaID string) (ResolvedPhysicalLocation, error) {
	var result ResolvedPhysicalLocation
	if tdb == nil || !scope.valid() || strings.TrimSpace(areaID) == "" || zone.ID == "" || zone.TenantID != scope.TenantID || zone.BranchID != scope.BranchID {
		return result, ErrPhysicalScopeMismatch
	}
	var siteStatus, areaStatus string
	err := tdb.QueryRowContext(ctx, `
		SELECT b.id,b.code,b.name,b.status,ia.id,ia.code,ia.name,ia.status
		FROM internal_areas ia
		JOIN buildings b ON b.id=ia.site_id AND b.tenant_id=ia.tenant_id AND b.branch_id=ia.branch_id
		WHERE ia.id=$1 AND ia.zone_id=$2 AND ia.tenant_id=$3 AND ia.branch_id=$4
		  AND ($5::text='' OR ia.site_id::text=$5::text)`, areaID, zone.ID, scope.TenantID, scope.BranchID, strings.TrimSpace(siteID)).
		Scan(&result.SiteID, &result.SiteCode, &result.SiteName, &siteStatus, &result.AreaID, &result.AreaCode, &result.AreaName, &areaStatus)
	if errors.Is(err, sql.ErrNoRows) {
		return ResolvedPhysicalLocation{}, ErrPhysicalScopeMismatch
	}
	if err != nil {
		return ResolvedPhysicalLocation{}, err
	}
	result.Active = siteStatus == "active" && areaStatus == "active"
	if !result.Active || (zone.BuildingID != "" && result.SiteID != zone.BuildingID) {
		return ResolvedPhysicalLocation{}, ErrPhysicalScopeMismatch
	}
	return result, nil
}

var physicalCodePattern = regexp.MustCompile(`^[A-Z0-9]+(?:-[A-Z0-9]+)*$`)

func normalizedPhysicalCode(value string) string {
	return strings.ToUpper(strings.TrimSpace(value))
}

func physicalLocationRequestContext(w http.ResponseWriter, r *http.Request) (TenantDB, string, string, string, bool) {
	tdb, dbOK := TenantDBFromContext(r.Context())
	userID, tenantID, branchID, identityOK := TenantIdentityFromContext(r.Context())
	if !dbOK || !identityOK || userID == "" || tenantID == "" || branchID == "" {
		http.Error(w, `{"error":"missing tenant context"}`, http.StatusInternalServerError)
		return nil, "", "", "", false
	}
	return tdb, userID, tenantID, branchID, true
}

func HandleSites(w http.ResponseWriter, r *http.Request) {
	tdb, userID, tenantID, branchID, ok := physicalLocationRequestContext(w, r)
	if !ok {
		return
	}
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		var branchCode string
		if err := tdb.QueryRowContext(r.Context(), `SELECT code FROM branches WHERE id=$1 AND tenant_id=$2 AND status='active'`, branchID, tenantID).Scan(&branchCode); err != nil {
			http.Error(w, `{"error":"invalid branch"}`, http.StatusUnprocessableEntity)
			return
		}
		rows, err := tdb.QueryContext(r.Context(), `SELECT id,code,name,status,COALESCE(address,'') FROM buildings WHERE tenant_id=$1 AND branch_id=$2 ORDER BY name`, tenantID, branchID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, 500)
			return
		}
		defer rows.Close()
		items := []map[string]string{}
		for rows.Next() {
			var id, code, name, status, address string
			if err = rows.Scan(&id, &code, &name, &status, &address); err != nil {
				http.Error(w, `{"error":"database error"}`, 500)
				return
			}
			items = append(items, map[string]string{"id": id, "code": code, "name": name, "status": status, "address": address})
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"branch_code": branchCode, "sites": items})
	case http.MethodPost:
		if err := requireNamingRuleAdmin(r.Context(), tdb, userID, tenantID); err != nil {
			if errors.Is(err, errForbiddenNamingRuleMutation) {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			} else {
				http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			}
			return
		}
		var body struct{ Code, Name, Address string }
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			http.Error(w, `{"error":"invalid request"}`, 400)
			return
		}
		body.Code = normalizedPhysicalCode(body.Code)
		body.Name = strings.TrimSpace(body.Name)
		if !physicalCodePattern.MatchString(body.Code) || body.Name == "" {
			http.Error(w, `{"error":"invalid site"}`, 422)
			return
		}
		id := uuid.NewString()
		if _, err := tdb.ExecContext(r.Context(), `INSERT INTO buildings(id,tenant_id,branch_id,code,name,address,status) VALUES($1,$2,$3,$4,$5,NULLIF($6,''),'active')`, id, tenantID, branchID, body.Code, body.Name, strings.TrimSpace(body.Address)); err != nil {
			var pqErr *pq.Error
			if errors.As(err, &pqErr) && pqErr.Code == "23505" {
				http.Error(w, `{"error":"duplicate site code"}`, 409)
			} else {
				http.Error(w, `{"error":"database error"}`, 500)
			}
			return
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]string{"id": id, "code": body.Code, "name": body.Name, "status": "active"})
	default:
		http.Error(w, `{"error":"method not allowed"}`, 405)
	}
}

func HandleInternalAreas(w http.ResponseWriter, r *http.Request) {
	tdb, userID, tenantID, branchID, ok := physicalLocationRequestContext(w, r)
	if !ok {
		return
	}
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		siteID := strings.TrimSpace(r.URL.Query().Get("site_id"))
		if siteID == "" {
			http.Error(w, `{"error":"site_id required"}`, 422)
			return
		}
		rows, err := tdb.QueryContext(r.Context(), `SELECT ia.id,ia.code,ia.name,ia.status,ia.site_id,ia.floor_id,ia.zone_id FROM internal_areas ia JOIN buildings b ON b.id=ia.site_id AND b.tenant_id=ia.tenant_id AND b.branch_id=ia.branch_id WHERE ia.tenant_id=$1 AND ia.branch_id=$2 AND ia.site_id=$3 ORDER BY ia.name`, tenantID, branchID, siteID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, 500)
			return
		}
		defer rows.Close()
		items := []map[string]interface{}{}
		for rows.Next() {
			var id, code, name, status, parent string
			var floorID, zoneID sql.NullString
			if rows.Scan(&id, &code, &name, &status, &parent, &floorID, &zoneID) != nil {
				http.Error(w, `{"error":"database error"}`, 500)
				return
			}
			items = append(items, map[string]interface{}{"id": id, "code": code, "name": name, "status": status, "site_id": parent, "floor_id": nullableString(floorID), "zone_id": nullableString(zoneID)})
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"internal_areas": items})
	case http.MethodPost:
		if err := requireNamingRuleAdmin(r.Context(), tdb, userID, tenantID); err != nil {
			if errors.Is(err, errForbiddenNamingRuleMutation) {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			} else {
				http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			}
			return
		}
		var raw struct {
			SiteID  string `json:"site_id"`
			FloorID string `json:"floor_id"`
			ZoneID  string `json:"zone_id"`
			Code    string `json:"code"`
			Name    string `json:"name"`
		}
		if json.NewDecoder(r.Body).Decode(&raw) != nil {
			http.Error(w, `{"error":"invalid request"}`, 400)
			return
		}
		raw.SiteID = strings.TrimSpace(raw.SiteID)
		raw.FloorID = strings.TrimSpace(raw.FloorID)
		raw.ZoneID = strings.TrimSpace(raw.ZoneID)
		raw.Code = normalizedPhysicalCode(raw.Code)
		raw.Name = strings.TrimSpace(raw.Name)
		if raw.SiteID == "" || (raw.ZoneID != "" && raw.FloorID == "") || !physicalCodePattern.MatchString(raw.Code) || raw.Name == "" {
			http.Error(w, `{"error":"invalid internal area"}`, 422)
			return
		}
		var active bool
		if err := tdb.QueryRowContext(r.Context(), `SELECT EXISTS(
			SELECT 1 FROM buildings b
			LEFT JOIN floors f ON f.id=NULLIF($4,'')::uuid AND f.tenant_id=b.tenant_id AND f.building_id=b.id AND f.status='active'
			LEFT JOIN zones z ON z.id=NULLIF($5,'')::uuid AND z.tenant_id=b.tenant_id AND z.floor_id=f.id AND z.status='active'
			WHERE b.id=$1 AND b.tenant_id=$2 AND b.branch_id=$3 AND b.status='active'
			  AND ($4='' OR f.id IS NOT NULL) AND ($5='' OR z.id IS NOT NULL))`, raw.SiteID, tenantID, branchID, raw.FloorID, raw.ZoneID).Scan(&active); err != nil || !active {
			http.Error(w, `{"error":"invalid site"}`, 422)
			return
		}
		id := uuid.NewString()
		if _, err := tdb.ExecContext(r.Context(), `INSERT INTO internal_areas(id,tenant_id,branch_id,site_id,floor_id,zone_id,code,name,status) VALUES($1,$2,$3,$4,NULLIF($5,'')::uuid,NULLIF($6,'')::uuid,$7,$8,'active')`, id, tenantID, branchID, raw.SiteID, raw.FloorID, raw.ZoneID, raw.Code, raw.Name); err != nil {
			var pqErr *pq.Error
			if errors.As(err, &pqErr) && pqErr.Code == "23505" {
				http.Error(w, `{"error":"duplicate internal area code"}`, 409)
			} else {
				http.Error(w, `{"error":"database error"}`, 500)
			}
			return
		}
		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": id, "site_id": raw.SiteID, "floor_id": emptyToNil(raw.FloorID), "zone_id": emptyToNil(raw.ZoneID), "code": raw.Code, "name": raw.Name, "status": "active"})
	default:
		http.Error(w, `{"error":"method not allowed"}`, 405)
	}
}

func nullableString(value sql.NullString) interface{} {
	if !value.Valid {
		return nil
	}
	return value.String
}

func emptyToNil(value string) interface{} {
	if value == "" {
		return nil
	}
	return value
}
