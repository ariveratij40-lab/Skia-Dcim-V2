package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

var ErrInvalidAssetPlacement = errors.New("invalid asset placement")

type AssetPlacementContext struct {
	TenantID, BranchID, PlacementID string
}

type ResolvedPlacement struct {
	ID            string `json:"id"`
	Type          string `json:"type"`
	BranchID      string `json:"branch_id"`
	CanonicalCode string `json:"canonical_code"`
	Name          string `json:"name"`
	Status        string `json:"status"`
	Active        bool   `json:"active"`
}

func ResolveAssetPlacement(requestContext context.Context, tdb TenantDB, ctx AssetPlacementContext) (ResolvedPlacement, error) {
	var p ResolvedPlacement
	var status string
	err := tdb.QueryRowContext(requestContext, `SELECT id,placement_type,branch_id,placement_code,name,status
		FROM locations WHERE id=$1 AND tenant_id=$2 AND branch_id=$3
		  AND placement_type IN ('MDF','IDF','WAREHOUSE') AND status='active'`,
		ctx.PlacementID, ctx.TenantID, ctx.BranchID).
		Scan(&p.ID, &p.Type, &p.BranchID, &p.CanonicalCode, &p.Name, &status)
	if err == sql.ErrNoRows {
		return ResolvedPlacement{}, ErrInvalidAssetPlacement
	}
	if err != nil {
		return ResolvedPlacement{}, fmt.Errorf("resolve placement: %w", err)
	}
	p.Active = status == "active"
	p.Status = status
	return p, nil
}

func HandlePlacements(w http.ResponseWriter, r *http.Request) {
	tdb, dbOK := TenantDBFromContext(r.Context())
	_, tenantID, branchID, identityOK := TenantIdentityFromContext(r.Context())
	if !dbOK || !identityOK || tenantID == "" || branchID == "" {
		http.Error(w, `{"error":"missing tenant context"}`, 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	requestedBranch := strings.TrimSpace(r.URL.Query().Get("branch_id"))
	if requestedBranch != "" && requestedBranch != branchID {
		http.Error(w, `{"error":"invalid branch"}`, 422)
		return
	}
	switch r.Method {
	case http.MethodGet:
		var branchName string
		if err := tdb.QueryRowContext(r.Context(), `SELECT name FROM branches WHERE id=$1 AND tenant_id=$2`, branchID, tenantID).Scan(&branchName); err != nil {
			http.Error(w, `{"error":"invalid branch"}`, 422)
			return
		}
		rows, err := tdb.QueryContext(r.Context(), `SELECT id,placement_type,placement_code,name,status FROM locations WHERE tenant_id=$1 AND branch_id=$2 AND placement_type IN ('MDF','IDF','WAREHOUSE') ORDER BY placement_type,name`, tenantID, branchID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, 500)
			return
		}
		defer rows.Close()
		items := []ResolvedPlacement{}
		for rows.Next() {
			var p ResolvedPlacement
			var status string
			if rows.Scan(&p.ID, &p.Type, &p.CanonicalCode, &p.Name, &status) == nil {
				p.BranchID = branchID
				p.Active = status == "active"
				p.Status = status
				items = append(items, p)
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"branch_id": branchID, "branch_name": branchName, "placements": items})
	case http.MethodPost:
		var body struct{ Type, Name string }
		if json.NewDecoder(r.Body).Decode(&body) != nil || strings.ToUpper(body.Type) != "WAREHOUSE" || strings.TrimSpace(body.Name) == "" {
			http.Error(w, `{"error":"invalid warehouse"}`, 422)
			return
		}
		id := uuid.NewString()
		code := "ALM-" + strings.ToUpper(strings.ReplaceAll(id[:8], "-", ""))
		_, err := tdb.ExecContext(r.Context(), `INSERT INTO locations(id,tenant_id,branch_id,placement_type,placement_code,name,status) VALUES($1,$2,$3,'WAREHOUSE',$4,$5,'active')`, id, tenantID, branchID, code, strings.TrimSpace(body.Name))
		if err != nil {
			http.Error(w, `{"error":"database error"}`, 500)
			return
		}
		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(map[string]string{"id": id, "type": "WAREHOUSE", "code": code, "name": body.Name})
	default:
		http.Error(w, `{"error":"method not allowed"}`, 405)
	}
}
