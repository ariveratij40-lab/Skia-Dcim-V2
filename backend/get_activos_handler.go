package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
)

// handleGetActivos obtiene activos incluyendo los importados
func handleGetActivos(w http.ResponseWriter, r *http.Request) {
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

	// Obtener activos importados
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
		http.Error(w, "Error fetching data", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var activos []map[string]interface{}

	for rows.Next() {
		var id int
		var nombre, assetType, estado, ubicacion, modelo, serialNumber string
		var createdAt string

		err := rows.Scan(&id, &nombre, &assetType, &estado, &ubicacion, &modelo, &serialNumber, &createdAt)
		if err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}

		activo := map[string]interface{}{
			"id":             id,
			"nombre":         nombre,
			"assetType":      assetType,
			"estado":         estado,
			"ubicacion":      ubicacion,
			"modelo":         modelo,
			"serialNumber":   serialNumber,
			"createdAt":      createdAt,
			"source":         "imported",
		}

		activos = append(activos, activo)
	}

	// Obtener total de activos importados
	var total int
	err = db.QueryRow("SELECT COUNT(*) FROM imported_assets").Scan(&total)
	if err != nil {
		log.Printf("Error counting imported_assets: %v", err)
		total = 0
	}

	response := map[string]interface{}{
		"activos": activos,
		"total":   total,
		"page":    page,
		"limit":   limit,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleGetActivosByType obtiene activos por tipo
func handleGetActivosByType(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	assetType := r.URL.Query().Get("type")
	if assetType == "" {
		http.Error(w, "Missing type parameter", http.StatusBadRequest)
		return
	}

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
		WHERE asset_type = $1
		ORDER BY created_at DESC
	`

	rows, err := db.Query(query, assetType)
	if err != nil {
		log.Printf("Error querying imported_assets by type: %v", err)
		http.Error(w, "Error fetching data", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var activos []map[string]interface{}

	for rows.Next() {
		var id int
		var nombre, assetType, estado, ubicacion, modelo, serialNumber string
		var createdAt string

		err := rows.Scan(&id, &nombre, &assetType, &estado, &ubicacion, &modelo, &serialNumber, &createdAt)
		if err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}

		activo := map[string]interface{}{
			"id":             id,
			"nombre":         nombre,
			"assetType":      assetType,
			"estado":         estado,
			"ubicacion":      ubicacion,
			"modelo":         modelo,
			"serialNumber":   serialNumber,
			"createdAt":      createdAt,
			"source":         "imported",
		}

		activos = append(activos, activo)
	}

	response := map[string]interface{}{
		"activos": activos,
		"type":    assetType,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleSearchActivos busca activos por nombre
func handleSearchActivos(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "Missing q parameter", http.StatusBadRequest)
		return
	}

	searchQuery := `
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
		WHERE nombre ILIKE $1 OR metadata->>'serial_number' ILIKE $1
		ORDER BY created_at DESC
		LIMIT 100
	`

	rows, err := db.Query(searchQuery, "%"+query+"%")
	if err != nil {
		log.Printf("Error searching imported_assets: %v", err)
		http.Error(w, "Error fetching data", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var activos []map[string]interface{}

	for rows.Next() {
		var id int
		var nombre, assetType, estado, ubicacion, modelo, serialNumber string
		var createdAt string

		err := rows.Scan(&id, &nombre, &assetType, &estado, &ubicacion, &modelo, &serialNumber, &createdAt)
		if err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}

		activo := map[string]interface{}{
			"id":             id,
			"nombre":         nombre,
			"assetType":      assetType,
			"estado":         estado,
			"ubicacion":      ubicacion,
			"modelo":         modelo,
			"serialNumber":   serialNumber,
			"createdAt":      createdAt,
			"source":         "imported",
		}

		activos = append(activos, activo)
	}

	response := map[string]interface{}{
		"activos": activos,
		"query":   query,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
