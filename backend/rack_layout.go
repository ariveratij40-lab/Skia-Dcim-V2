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
	_, tenantID, _, identityOK := TenantIdentityFromContext(r.Context())
	if !dbOK || !identityOK || tenantID == "" {
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

	// Verificar que el rack pertenece al tenant
	var totalU int
	err := tdb.QueryRowContext(r.Context(),
		`SELECT rk.total_u FROM racks rk
		 JOIN assets a ON a.id = rk.asset_id
		 WHERE rk.id = $1 AND rk.tenant_id = $2`,
		rackID, tenantID,
	).Scan(&totalU)
	if err != nil {
		http.Error(w, `{"error":"rack no encontrado"}`, http.StatusNotFound)
		return
	}

	switch r.Method {
	case http.MethodGet:
		handleGetRackLayout(w, r, tdb, rackID, tenantID)
	case http.MethodPost:
		handlePostRackLayout(w, r, tdb, rackID, tenantID, totalU)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── GET layout ───────────────────────────────────────────────────────────────

func handleGetRackLayout(w http.ResponseWriter, r *http.Request, tdb TenantDB, rackID, tenantID string) {
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
		WHERE sw.rack_id = $1 AND sw.tenant_id = $2`, rackID, tenantID)
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
		WHERE pp.rack_id = $1 AND pp.tenant_id = $2`, rackID, tenantID)
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
		WHERE p.rack_id = $1 AND p.tenant_id = $2`, rackID, tenantID)
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

func handlePostRackLayout(w http.ResponseWriter, r *http.Request, tdb TenantDB, rackID, tenantID string, totalU int) {
	var req RackLayoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"body inválido"}`, http.StatusBadRequest)
		return
	}

	// ── Validaciones de integridad ────────────────────────────────────────────

	// 1. Verificar que los activos pertenecen al tenant
	for _, a := range req.Assignments {
		var count int
		_ = tdb.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM assets WHERE id=$1 AND tenant_id=$2`, a.AssetID, tenantID).Scan(&count)
		if count == 0 {
			http.Error(w, fmt.Sprintf(`{"error":"activo %s no pertenece al tenant"}`, a.AssetID), http.StatusForbidden)
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

	// 3. Verificar que los activos no están ya asignados a OTRO rack
	for _, a := range req.Assignments {
		var existingRack *string
		// Revisar en switches
		_ = tdb.QueryRowContext(r.Context(), `SELECT rack_id FROM switches WHERE asset_id=$1 AND rack_id IS NOT NULL AND rack_id != $2 AND tenant_id=$3`, a.AssetID, rackID, tenantID).Scan(&existingRack)
		if existingRack != nil {
			http.Error(w, fmt.Sprintf(`{"error":"el activo %s ya está asignado a otro rack"}`, a.AssetID), http.StatusConflict)
			return
		}
		// Revisar en patch_panels
		_ = tdb.QueryRowContext(r.Context(), `SELECT rack_id FROM patch_panels WHERE asset_id=$1 AND rack_id IS NOT NULL AND rack_id != $2 AND tenant_id=$3`, a.AssetID, rackID, tenantID).Scan(&existingRack)
		if existingRack != nil {
			http.Error(w, fmt.Sprintf(`{"error":"el activo %s ya está asignado a otro rack"}`, a.AssetID), http.StatusConflict)
			return
		}
	}

	// Limpiar asignaciones anteriores de este rack
	_, err := tdb.ExecContext(r.Context(), `UPDATE switches SET rack_id=NULL, rack_unit=NULL WHERE rack_id=$1 AND tenant_id=$2`, rackID, tenantID)
	if err != nil {
		log.Printf("Error limpiando switches del rack %s: %v", rackID, err)
		http.Error(w, `{"error":"error limpiando layout anterior"}`, http.StatusInternalServerError)
		return
	}
	_, err = tdb.ExecContext(r.Context(), `UPDATE patch_panels SET rack_id=NULL, rack_unit=NULL WHERE rack_id=$1 AND tenant_id=$2`, rackID, tenantID)
	if err != nil {
		log.Printf("Error limpiando patch_panels del rack %s: %v", rackID, err)
		http.Error(w, `{"error":"error limpiando layout anterior"}`, http.StatusInternalServerError)
		return
	}
	_, err = tdb.ExecContext(r.Context(), `UPDATE pdus SET rack_id=NULL WHERE rack_id=$1 AND tenant_id=$2`, rackID, tenantID)
	if err != nil {
		log.Printf("Error limpiando PDUs del rack %s: %v", rackID, err)
		http.Error(w, `{"error":"error limpiando layout anterior"}`, http.StatusInternalServerError)
		return
	}

	// Actualizar used_u en el rack
	_, err = tdb.ExecContext(r.Context(), `UPDATE racks SET used_u=$1 WHERE id=$2 AND tenant_id=$3`, totalUsed, rackID, tenantID)
	if err != nil {
		log.Printf("Error actualizando used_u del rack %s: %v", rackID, err)
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
		_ = tdb.QueryRowContext(r.Context(), `SELECT at.code FROM assets a JOIN asset_types at ON at.id=a.asset_type_id WHERE a.id=$1 AND a.tenant_id=$2`, a.AssetID, tenantID).Scan(&typeCode)

		switch typeCode {
		case "SWITCH":
			_, err = tdb.ExecContext(r.Context(), `UPDATE switches SET rack_id=$1, rack_unit=$2 WHERE asset_id=$3 AND tenant_id=$4`,
				rackID, rackUnit, a.AssetID, tenantID)
		case "PATCH_PANEL":
			_, err = tdb.ExecContext(r.Context(), `UPDATE patch_panels SET rack_id=$1, rack_unit=$2 WHERE asset_id=$3 AND tenant_id=$4`,
				rackID, rackUnit, a.AssetID, tenantID)
		case "PDU":
			_, err = tdb.ExecContext(r.Context(), `UPDATE pdus SET rack_id=$1 WHERE asset_id=$2 AND tenant_id=$3`,
				rackID, a.AssetID, tenantID)
		case "UPS":
			// UPS no tiene tabla satelite con rack_id — guardar en specs del asset
			_, err = tdb.ExecContext(r.Context(), `UPDATE assets SET specs=jsonb_set(COALESCE(specs,'{}'), '{rack_id}', $1::jsonb) WHERE id=$2 AND tenant_id=$3`,
				fmt.Sprintf(`"%s"`, rackID), a.AssetID, tenantID)
		default:
			// Para otros tipos, guardar en specs del asset
			_, err = tdb.ExecContext(r.Context(), `UPDATE assets SET specs=jsonb_set(COALESCE(specs,'{}'), '{rack_id}', $1::jsonb) WHERE id=$2 AND tenant_id=$3`,
				fmt.Sprintf(`"%s"`, rackID), a.AssetID, tenantID)
		}

		if err != nil {
			log.Printf("Error asignando activo %s al rack %s (U%d): %v", a.AssetID, rackID, rackUnit, err)
			http.Error(w, fmt.Sprintf(`{"error":"error asignando activo %s"}`, a.AssetID), http.StatusInternalServerError)
			return
		}
	}

	log.Printf("[RackLayout] Rack %s actualizado: %d activos, %dU usadas", rackID, len(req.Assignments), totalUsed)
	jsonResp(w, 200, map[string]interface{}{
		"success":     true,
		"rack_id":     rackID,
		"assignments": len(req.Assignments),
		"used_u":      totalUsed,
		"free_u":      totalU - totalUsed,
	})
}
