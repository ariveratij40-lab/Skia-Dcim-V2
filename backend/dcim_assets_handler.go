package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"
)

// handleGetDCIMAssets obtiene activos incluyendo los importados
func handleGetDCIMAssets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Obtener parámetros de paginación
	page := 1
	if p := r.URL.Query().Get("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	offset := (page - 1) * limit

	// Consultar activos importados
	query := `
		SELECT 
			id,
			nombre,
			asset_type,
			metadata->>'estado' as estado,
			metadata->>'ubicacion' as ubicacion,
			metadata->>'modelo' as modelo,
			metadata->>'serial_number' as serial_number,
			created_at
		FROM imported_assets
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := db.Query(query, limit, offset)
	if err != nil {
		log.Printf("Error querying imported_assets: %v", err)
		// Si hay error, devolver array vacío en lugar de error
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]interface{}{},
		})
		return
	}
	defer rows.Close()

	var assets []map[string]interface{}

	for rows.Next() {
		var id int
		var nombre, assetType, estado, ubicacion, modelo, serialNumber string
		var createdAt time.Time

		err := rows.Scan(&id, &nombre, &assetType, &estado, &ubicacion, &modelo, &serialNumber, &createdAt)
		if err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}

		asset := map[string]interface{}{
			"id":                strconv.Itoa(id),
			"tenant_id":         "default",
			"branch_id":         "default",
			"asset_type_id":     assetType,
			"asset_type_code":   assetType,
			"asset_type_name":   assetType,
			"location_id":       ubicacion,
			"location_name":     ubicacion,
			"internal_code":     "",
			"name":              nombre,
			"serial_number":     serialNumber,
			"model":             modelo,
			"manufacturer":      "",
			"status":            estado,
			"rfid_tag":          "",
			"install_year":      nil,
			"observations":      "Importado automáticamente",
			"created_at":        createdAt.Format(time.RFC3339),
			"updated_at":        createdAt.Format(time.RFC3339),
		}

		assets = append(assets, asset)
	}

	// Obtener total de activos importados
	var total int
	err = db.QueryRow("SELECT COUNT(*) FROM imported_assets").Scan(&total)
	if err != nil {
		log.Printf("Error counting imported_assets: %v", err)
		total = 0
	}

	response := map[string]interface{}{
		"data":  assets,
		"total": total,
		"page":  page,
		"limit": limit,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handlePostDCIMAssets crea un nuevo activo
func handlePostDCIMAssets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Guardar en imported_assets
	nombre := payload["name"].(string)
	assetType := payload["asset_type_code"].(string)
	estado := "activo"
	if s, ok := payload["status"].(string); ok {
		estado = s
	}

	metadata := map[string]interface{}{
		"estado":         estado,
		"ubicacion":      payload["location_name"],
		"modelo":         payload["model"],
		"serial_number":  payload["serial_number"],
		"manufacturer":   payload["manufacturer"],
		"observations":   payload["observations"],
	}

	metadataJSON, _ := json.Marshal(metadata)

	query := `
		INSERT INTO imported_assets (nombre, asset_type, metadata, created_at, updated_at)
		VALUES ($1, $2, $3, NOW(), NOW())
		RETURNING id
	`

	var id int
	err := db.QueryRow(query, nombre, assetType, string(metadataJSON)).Scan(&id)
	if err != nil {
		log.Printf("Error inserting asset: %v", err)
		http.Error(w, "Error creating asset", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"id":   strconv.Itoa(id),
		"name": nombre,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// handleDeleteDCIMAsset elimina un activo
func handleDeleteDCIMAsset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing id parameter", http.StatusBadRequest)
		return
	}

	query := "DELETE FROM imported_assets WHERE id = $1"
	result, err := db.Exec(query, id)
	if err != nil {
		log.Printf("Error deleting asset: %v", err)
		http.Error(w, "Error deleting asset", http.StatusInternalServerError)
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Printf("Error getting rows affected: %v", err)
	}

	response := map[string]interface{}{
		"deleted": rowsAffected > 0,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
