package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
)

// ─── Endpoint: GET /api/infra/racks/{id}/layout ────────────────────────────────
// Devuelve los activos asignados a un rack específico con su posición U
// ─── Endpoint: POST /api/infra/racks/{id}/layout ──────────────────────────────
// Persiste el layout completo de un rack (reemplaza todas las asignaciones)
// Reglas de integridad:
//   - Cada activo solo puede estar en un rack a la vez
//   - No se puede asignar más de los registrados en el inventario
//   - No se puede exceder la capacidad U del rack

func handleRackLayout(w http.ResponseWriter, r *http.Request) {
	tdb, dbOK := TenantDBFromContext(r.Context())
	_, tenantID, branchID, identityOK := TenantIdentityFromContext(r.Context())
	if !dbOK || !identityOK || tenantID == "" || branchID == "" {
		http.Error(w, `{"error":"missing tenant context"}`, http.StatusInternalServerError)
		return
	}

	// Extraer rackID de la URL: /api/infra/racks/{id}/layout
	path := strings.TrimPrefix(r.URL.Path, "/api/infra/racks/")
	path = strings.TrimSuffix(path, "/layout")
	rackID := strings.TrimSpace(path)
	if rackID == "" {
		http.Error(w, `{"error":"rack_id requerido"}`, http.StatusBadRequest)
		return
	}

	housing, err := ResolveHousing(r.Context(), tdb, PhysicalScope{TenantID: tenantID, BranchID: branchID}, rackID)
	if err != nil {
		writeCanonicalHousingError(w, ErrHousingRackNotFound)
		return
	}
	var totalU int
	_ = tdb.QueryRowContext(r.Context(), `SELECT total_u FROM racks WHERE id=$1 AND tenant_id=$2 AND branch_id=$3`, rackID, tenantID, branchID).Scan(&totalU)

	switch r.Method {
	case http.MethodGet:
		handleGetRackLayout(w, r, tdb, rackID, tenantID, branchID)
	case http.MethodPost:
		handlePostRackLayout(w, r, tdb, housing, tenantID, branchID, totalU)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── GET layout ───────────────────────────────────────────────────────────────

func handleGetRackLayout(w http.ResponseWriter, r *http.Request, tdb TenantDB, rackID, tenantID, branchID string) {
	type SlotInfo struct {
		AssetID      string `json:"asset_id"`
		InternalCode string `json:"internal_code"`
		Name         string `json:"name"`
		TypeCode     string `json:"asset_type_code"`
		Manufacturer string `json:"manufacturer"`
		Model        string `json:"model"`
		Status       string `json:"status"`
		RackUnit     int    `json:"rack_unit"`
		HeightU      int    `json:"height_u"`
	}

	// Buscar switches asignados a este rack
	var slots []SlotInfo

	// Switches
	swRows, _ := tdb.QueryContext(r.Context(), `
		SELECT a.id, a.internal_code, a.name, 'SWITCH', 
		       COALESCE(a.manufacturer,''), COALESCE(a.model,''), a.status,
		       COALESCE(sw.rack_unit,1), 1
		FROM switches sw
		JOIN assets a ON a.id = sw.asset_id
		WHERE a.housing_rack_id = $1 AND sw.tenant_id = $2 AND sw.branch_id=$3`, rackID, tenantID, branchID)
	if swRows != nil {
		defer swRows.Close()
		for swRows.Next() {
			var s SlotInfo
			_ = swRows.Scan(&s.AssetID, &s.InternalCode, &s.Name, &s.TypeCode, &s.Manufacturer, &s.Model, &s.Status, &s.RackUnit, &s.HeightU)
			slots = append(slots, s)
		}
	}

	// Patch Panels
	ppRows, _ := tdb.QueryContext(r.Context(), `
		SELECT a.id, a.internal_code, a.name, 'PATCH_PANEL',
		       COALESCE(a.manufacturer,''), COALESCE(a.model,''), a.status,
		       COALESCE(pp.rack_unit,1), 1
		FROM patch_panels pp
		JOIN assets a ON a.id = pp.asset_id
		WHERE a.housing_rack_id = $1 AND pp.tenant_id = $2 AND pp.branch_id=$3`, rackID, tenantID, branchID)
	if ppRows != nil {
		defer ppRows.Close()
		for ppRows.Next() {
			var s SlotInfo
			_ = ppRows.Scan(&s.AssetID, &s.InternalCode, &s.Name, &s.TypeCode, &s.Manufacturer, &s.Model, &s.Status, &s.RackUnit, &s.HeightU)
			slots = append(slots, s)
		}
	}

	// PDUs
	pduRows, _ := tdb.QueryContext(r.Context(), `
		SELECT a.id, a.internal_code, a.name, 'PDU',
		       COALESCE(a.manufacturer,''), COALESCE(a.model,''), a.status,
		       1, 1
		FROM pdus p
		JOIN assets a ON a.id = p.asset_id
		WHERE a.housing_rack_id = $1 AND p.tenant_id = $2 AND p.branch_id=$3`, rackID, tenantID, branchID)
	if pduRows != nil {
		defer pduRows.Close()
		for pduRows.Next() {
			var s SlotInfo
			_ = pduRows.Scan(&s.AssetID, &s.InternalCode, &s.Name, &s.TypeCode, &s.Manufacturer, &s.Model, &s.Status, &s.RackUnit, &s.HeightU)
			slots = append(slots, s)
		}
	}

	if slots == nil {
		slots = []SlotInfo{}
	}
	jsonResp(w, 200, map[string]interface{}{"slots": slots, "total_u": totalUFromDB(r.Context(), tdb, rackID, tenantID)})
}

func totalUFromDB(ctx context.Context, tdb TenantDB, rackID, tenantID string) int {
	var u int
	_ = tdb.QueryRowContext(ctx, `SELECT total_u FROM racks WHERE id = $1 AND tenant_id = $2`, rackID, tenantID).Scan(&u)
	if u == 0 {
		u = 42
	}
	return u
}

// ─── POST layout ──────────────────────────────────────────────────────────────

type RackLayoutAssignment struct {
	AssetID  string `json:"asset_id"`
	RackUnit int    `json:"rack_unit"`
	HeightU  int    `json:"height_u"`
}

type RackLayoutRequest struct {
	MdfIdfID    string                 `json:"mdf_idf_id"`
	Assignments []RackLayoutAssignment `json:"assignments"`
}

func handlePostRackLayout(w http.ResponseWriter, r *http.Request, tdb TenantDB, housing Housing, tenantID, branchID string, totalU int) {
	var req RackLayoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"body inválido"}`, http.StatusBadRequest)
		return
	}

	// ── Validaciones de integridad ────────────────────────────────────────────

	// 1. Resolver cada activo en el mismo tenant/branch y limitar el layout a
	// tipos cuyo housing canónico es Rack.
	for _, a := range req.Assignments {
		var typeCode string
		err := tdb.QueryRowContext(r.Context(), `SELECT at.code FROM assets a JOIN asset_types at ON at.id=a.asset_type_id WHERE a.id=$1 AND a.tenant_id=$2 AND a.branch_id=$3 FOR UPDATE OF a`, a.AssetID, tenantID, branchID).Scan(&typeCode)
		if err != nil || (typeCode != "SWITCH" && typeCode != "PATCH_PANEL" && typeCode != "PDU" && typeCode != "UPS") {
			writeCanonicalHousingError(w, ErrIncompatibleHousing)
			return
		}
	}

	// 2. Verificar que no se excede la capacidad U del rack
	totalUsed := 0
	for _, a := range req.Assignments {
		h := a.HeightU
		if h <= 0 {
			h = 1
		}
		totalUsed += h
	}
	if totalUsed > totalU {
		http.Error(w, fmt.Sprintf(`{"error":"el layout excede la capacidad del rack (%dU usadas, %dU disponibles)"}`, totalUsed, totalU), http.StatusConflict)
		return
	}

	// A2B has no canonical "unmounted" state for these types. Refuse a layout
	// replacement that would silently detach an existing housed asset.
	rows, err := tdb.QueryContext(r.Context(), `SELECT id FROM assets WHERE housing_rack_id=$1 AND tenant_id=$2 AND branch_id=$3`, housing.RackID, tenantID, branchID)
	if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}
	wanted := map[string]bool{}
	for _, a := range req.Assignments {
		wanted[a.AssetID] = true
	}
	for rows.Next() {
		var id string
		_ = rows.Scan(&id)
		if !wanted[id] {
			rows.Close()
			writeCanonicalHousingError(w, ErrCanonicalRelocationConflict)
			return
		}
	}
	rows.Close()

	// Actualizar used_u en el rack
	_, err = tdb.ExecContext(r.Context(), `UPDATE racks SET used_u=$1 WHERE id=$2 AND tenant_id=$3 AND branch_id=$4`, totalUsed, housing.RackID, tenantID, branchID)
	if err != nil {
		log.Printf("Error actualizando used_u del rack %s: %v", housing.RackID, err)
		http.Error(w, `{"error":"error actualizando capacidad del rack"}`, http.StatusInternalServerError)
		return
	}

	// Escribir nuevas asignaciones
	for _, a := range req.Assignments {
		rackUnit := a.RackUnit
		if rackUnit <= 0 {
			rackUnit = 1
		}

		// Determinar el tipo del activo
		var typeCode string
		_ = tdb.QueryRowContext(r.Context(), `SELECT at.code FROM assets a JOIN asset_types at ON at.id=a.asset_type_id WHERE a.id=$1 AND a.tenant_id=$2 AND a.branch_id=$3`, a.AssetID, tenantID, branchID).Scan(&typeCode)
		_, err = tdb.ExecContext(r.Context(), `UPDATE assets SET mount_mode='RACK_MOUNTED',housing_rack_id=$1,location_id=$2,updated_at=NOW() WHERE id=$3 AND tenant_id=$4 AND branch_id=$5`, housing.RackID, housing.LocationID, a.AssetID, tenantID, branchID)
		if err != nil {
			writeCanonicalHousingError(w, ErrIncompatibleHousing)
			return
		}

		switch typeCode {
		case "SWITCH":
			_, err = tdb.ExecContext(r.Context(), `UPDATE switches SET rack_unit=$1 WHERE asset_id=$2 AND tenant_id=$3 AND branch_id=$4`, rackUnit, a.AssetID, tenantID, branchID)
		case "PATCH_PANEL":
			_, err = tdb.ExecContext(r.Context(), `UPDATE patch_panels SET rack_unit=$1 WHERE asset_id=$2 AND tenant_id=$3 AND branch_id=$4`, rackUnit, a.AssetID, tenantID, branchID)
		case "PDU":
			// PDU has no canonical positional column beyond assets.housing_rack_id.
		case "UPS":
			// UPS canonical housing is already stored on assets.
		default:
			err = ErrIncompatibleHousing
		}

		if err != nil {
			log.Printf("Error asignando activo %s al rack %s (U%d): %v", a.AssetID, housing.RackID, rackUnit, err)
			http.Error(w, fmt.Sprintf(`{"error":"error asignando activo %s"}`, a.AssetID), http.StatusInternalServerError)
			return
		}
	}

	log.Printf("[RackLayout] Rack %s actualizado: %d activos, %dU usadas", housing.RackID, len(req.Assignments), totalUsed)
	jsonResp(w, 200, map[string]interface{}{
		"success":     true,
		"rack_id":     housing.RackID,
		"assignments": len(req.Assignments),
		"used_u":      totalUsed,
		"free_u":      totalU - totalUsed,
	})
}
