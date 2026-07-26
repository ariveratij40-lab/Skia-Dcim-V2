package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
)

// handleGetImportedAssets obtiene activos importados
func handleGetImportedAssets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionCtx, err := requireSessionContext(r.Context(), r, "inventory.import.read")
	if err != nil {
		writeSessionError(w, err)
		return
	}

	// Parámetros de consulta
	importID := r.URL.Query().Get("importId")
	assetType := r.URL.Query().Get("assetType")
	limit := r.URL.Query().Get("limit")
	offset := r.URL.Query().Get("offset")

	if limit == "" {
		limit = "50"
	}
	if offset == "" {
		offset = "0"
	}

	limitInt, _ := strconv.Atoi(limit)
	offsetInt, _ := strconv.Atoi(offset)

	query := `
	SELECT id, import_id, nombre, asset_type, estado, created_at
	FROM imported_assets
	WHERE tenant_id = $1 AND branch_id = $2
	`

	args := []interface{}{sessionCtx.TenantID, sessionCtx.BranchID}
	argNum := 3

	if importID != "" {
		query += ` AND import_id = $` + strconv.Itoa(argNum)
		args = append(args, importID)
		argNum++
	}

	if assetType != "" {
		query += ` AND asset_type = $` + strconv.Itoa(argNum)
		args = append(args, assetType)
		argNum++
	}

	query += ` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(argNum) + ` OFFSET $` + strconv.Itoa(argNum+1)
	args = append(args, limitInt, offsetInt)

	rows, err := db.Query(query, args...)
	if err != nil {
		log.Printf("ERROR querying assets: %v", err)
		http.Error(w, "Error querying assets", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var assets []map[string]interface{}

	for rows.Next() {
		var id, importID int
		var nombre, assetType, estado, createdAt string

		err := rows.Scan(&id, &importID, &nombre, &assetType, &estado, &createdAt)
		if err != nil {
			log.Printf("ERROR scanning row: %v", err)
			continue
		}

		assets = append(assets, map[string]interface{}{
			"id":        id,
			"importId":  importID,
			"nombre":    nombre,
			"assetType": assetType,
			"estado":    estado,
			"createdAt": createdAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"assets": assets,
		"count":  len(assets),
	})
}

// handleGetImportDetails obtiene detalles de una importación
func handleGetImportDetails(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionCtx, err := requireSessionContext(r.Context(), r, "inventory.import.read")
	if err != nil {
		writeSessionError(w, err)
		return
	}

	importID := r.URL.Query().Get("id")
	if importID == "" {
		http.Error(w, "Import ID is required", http.StatusBadRequest)
		return
	}

	// Obtener detalles de la importación con filtro multi-tenant
	query := `
	SELECT id, file_name, asset_type, document_type, extraction_method,
	       total_items, valid_items, items_with_errors, items_with_warnings,
	       created_at, updated_at
	FROM inventory_imports
	WHERE id = $1 AND tenant_id = $2 AND branch_id = $3
	`

	var id int
	var fileName, assetType, docType, method string
	var totalItems, validItems, errorsCount, warningsCount int
	var createdAt, updatedAt string

	err = db.QueryRow(query, importID, sessionCtx.TenantID, sessionCtx.BranchID).Scan(
		&id, &fileName, &assetType, &docType, &method,
		&totalItems, &validItems, &errorsCount, &warningsCount,
		&createdAt, &updatedAt,
	)

	if err != nil {
		log.Printf("ERROR querying import: %v", err)
		// Responder 404 para no revelar existencia de importación de otro tenant
		http.Error(w, "Import not found", http.StatusNotFound)
		return
	}

	// Obtener errores
	errorsQuery := `
	SELECT error_message FROM import_errors
	WHERE import_id = $1
	LIMIT 10
	`

	errRows, _ := db.Query(errorsQuery, id)
	defer errRows.Close()

	var errors []string
	for errRows.Next() {
		var errMsg string
		errRows.Scan(&errMsg)
		errors = append(errors, errMsg)
	}

	// Obtener advertencias
	warningsQuery := `
	SELECT warning_message FROM import_warnings
	WHERE import_id = $1
	LIMIT 10
	`

	warnRows, _ := db.Query(warningsQuery, id)
	defer warnRows.Close()

	var warnings []string
	for warnRows.Next() {
		var warnMsg string
		warnRows.Scan(&warnMsg)
		warnings = append(warnings, warnMsg)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":                id,
		"fileName":          fileName,
		"assetType":         assetType,
		"documentType":      docType,
		"extractionMethod":  method,
		"totalItems":        totalItems,
		"validItems":        validItems,
		"itemsWithErrors":   errorsCount,
		"itemsWithWarnings": warningsCount,
		"errors":            errors,
		"warnings":          warnings,
		"createdAt":         createdAt,
		"updatedAt":         updatedAt,
	})
}

// handleSearchAssets busca activos
func handleSearchAssets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionCtx, err := requireSessionContext(r.Context(), r, "inventory.import.read")
	if err != nil {
		writeSessionError(w, err)
		return
	}

	searchTerm := r.URL.Query().Get("q")
	assetType := r.URL.Query().Get("type")
	estado := r.URL.Query().Get("estado")

	if searchTerm == "" {
		http.Error(w, "Search term is required", http.StatusBadRequest)
		return
	}

	query := `
	SELECT id, nombre, asset_type, estado, created_at
	FROM imported_assets
	WHERE tenant_id = $1 AND branch_id = $2
	AND (nombre ILIKE $3 OR descripcion ILIKE $3)
	`

	args := []interface{}{sessionCtx.TenantID, sessionCtx.BranchID, "%" + searchTerm + "%"}
	argNum := 4

	if assetType != "" {
		query += ` AND asset_type = $` + strconv.Itoa(argNum)
		args = append(args, assetType)
		argNum++
	}

	if estado != "" {
		query += ` AND estado = $` + strconv.Itoa(argNum)
		args = append(args, estado)
	}

	query += ` ORDER BY created_at DESC LIMIT 100`

	rows, err := db.Query(query, args...)
	if err != nil {
		log.Printf("ERROR searching assets: %v", err)
		http.Error(w, "Error searching assets", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var assets []map[string]interface{}

	for rows.Next() {
		var id int
		var nombre, assetType, estado, createdAt string

		err := rows.Scan(&id, &nombre, &assetType, &estado, &createdAt)
		if err != nil {
			continue
		}

		assets = append(assets, map[string]interface{}{
			"id":        id,
			"nombre":    nombre,
			"assetType": assetType,
			"estado":    estado,
			"createdAt": createdAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": assets,
		"count":   len(assets),
	})
}

// handleGetImportHistory obtiene historial de importaciones
func handleGetImportHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionCtx, err := requireSessionContext(r.Context(), r, "inventory.import.read")
	if err != nil {
		writeSessionError(w, err)
		return
	}

	days := r.URL.Query().Get("days")
	if days == "" {
		days = "30"
	}

	query := `
	SELECT id, file_name, asset_type, total_items, valid_items, 
	       items_with_errors, extraction_method, created_at
	FROM inventory_imports
	WHERE tenant_id = $1 AND branch_id = $2
	AND created_at >= NOW() - INTERVAL '` + days + ` days'
	ORDER BY created_at DESC
	`

	rows, err := db.Query(query, sessionCtx.TenantID, sessionCtx.BranchID)
	if err != nil {
		log.Printf("ERROR querying history: %v", err)
		http.Error(w, "Error querying history", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var imports []map[string]interface{}

	for rows.Next() {
		var id int
		var fileName, assetType, method string
		var totalItems, validItems, errorsCount int
		var createdAt string

		err := rows.Scan(&id, &fileName, &assetType, &totalItems, &validItems, &errorsCount, &method, &createdAt)
		if err != nil {
			continue
		}

		imports = append(imports, map[string]interface{}{
			"id":               id,
			"fileName":         fileName,
			"assetType":        assetType,
			"totalItems":       totalItems,
			"validItems":       validItems,
			"itemsWithErrors":  errorsCount,
			"extractionMethod": method,
			"createdAt":        createdAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"imports": imports,
		"count":   len(imports),
	})
}

// handleGetAssetsByType obtiene activos por tipo
func handleGetAssetsByType(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionCtx, err := requireSessionContext(r.Context(), r, "inventory.import.read")
	if err != nil {
		writeSessionError(w, err)
		return
	}

	assetType := r.URL.Query().Get("type")
	if assetType == "" {
		http.Error(w, "Asset type is required", http.StatusBadRequest)
		return
	}

	query := `
	SELECT asset_type, COUNT(*) as count, 
	       COUNT(CASE WHEN estado = 'activo' THEN 1 END) as active_count
	FROM imported_assets
	WHERE tenant_id = $1 AND branch_id = $2 AND asset_type = $3
	GROUP BY asset_type
	`

	var assetTypeResult string
	var totalCount, activeCount int

	err = db.QueryRow(query, sessionCtx.TenantID, sessionCtx.BranchID, assetType).Scan(&assetTypeResult, &totalCount, &activeCount)
	if err != nil {
		log.Printf("ERROR querying assets by type: %v", err)
		http.Error(w, "Error querying assets", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"assetType":     assetTypeResult,
		"totalCount":    totalCount,
		"activeCount":   activeCount,
		"inactiveCount": totalCount - activeCount,
	})
}

// handleExportImportData exporta datos de importación
func handleExportImportData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionCtx, err := requireSessionContext(r.Context(), r, "inventory.import.read")
	if err != nil {
		writeSessionError(w, err)
		return
	}

	importID := r.URL.Query().Get("importId")
	format := r.URL.Query().Get("format")

	if format == "" {
		format = "json"
	}

	query := `
	SELECT id, nombre, asset_type, estado, created_at
	FROM imported_assets
	WHERE tenant_id = $1 AND branch_id = $2
	`

	args := []interface{}{sessionCtx.TenantID, sessionCtx.BranchID}

	if importID != "" {
		query += ` AND import_id = $3`
		args = append(args, importID)
	}

	query += ` ORDER BY created_at DESC`

	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, "Error querying data", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var assets []map[string]interface{}

	for rows.Next() {
		var id int
		var nombre, assetType, estado, createdAt string

		err := rows.Scan(&id, &nombre, &assetType, &estado, &createdAt)
		if err != nil {
			continue
		}

		assets = append(assets, map[string]interface{}{
			"id":        id,
			"nombre":    nombre,
			"assetType": assetType,
			"estado":    estado,
			"createdAt": createdAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")

	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=inventory_export.csv")

		// Escribir CSV
		w.Write([]byte("ID,Nombre,Tipo,Estado,Fecha\n"))
		for _, asset := range assets {
			line := strings.Join([]string{
				strconv.Itoa(asset["id"].(int)),
				asset["nombre"].(string),
				asset["assetType"].(string),
				asset["estado"].(string),
				asset["createdAt"].(string),
			}, ",")
			w.Write([]byte(line + "\n"))
		}
	} else {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"assets": assets,
			"count":  len(assets),
		})
	}
}
