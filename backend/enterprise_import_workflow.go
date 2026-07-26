package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"
)

// ============================================================
// FLUJO EMPRESARIAL DE 10 PASOS
// ============================================================

type WorkflowStep struct {
	Step        int
	Name        string
	Description string
	Status      string // pending, processing, completed, failed
	Progress    int    // 0-100
	StartedAt   time.Time
	CompletedAt time.Time
	Errors      []string
}

type ImportWorkflow struct {
	ImportID      int64
	TenantID      string
	BranchID      string
	UserID        string
	CurrentStep   int
	Steps         []WorkflowStep
	TotalRows     int
	ProcessedRows int
	Status        string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// ============================================================
// PASO 1: ARCHIVO SUBIDO
// ============================================================

func HandleStep1FileUpload(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parsear multipart form
	err := r.ParseMultipartForm(100 * 1024 * 1024) // 100MB max
	if err != nil {
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Error getting file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	assetType := r.FormValue("asset_type")
	tenantID := r.FormValue("tenant_id")
	branchID := r.FormValue("branch_id")
	userID := r.FormValue("user_id")

	// Leer contenido del archivo
	fileContent, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Error reading file", http.StatusBadRequest)
		return
	}

	// Crear registro de importación
	var importID int64
	query := `
		INSERT INTO inventory_imports (
			tenant_id, branch_id, user_id, file_name, file_size, 
			asset_type, workflow_status, mode, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, 'parsing', 'normal', NOW(), NOW())
		RETURNING id
	`

	err = db.QueryRow(query, tenantID, branchID, userID, handler.Filename, len(fileContent), assetType).Scan(&importID)
	if err != nil {
		http.Error(w, "Error creating import record", http.StatusInternalServerError)
		return
	}

	// Registrar evento
	logEvent(db, importID, "file_uploaded", fmt.Sprintf("Archivo %s subido (%d bytes)", handler.Filename, len(fileContent)))

	// Responder
	response := map[string]interface{}{
		"import_id":   importID,
		"file_name":   handler.Filename,
		"file_size":   len(fileContent),
		"asset_type":  assetType,
		"step":        1,
		"status":      "success",
		"next_step":   2,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ============================================================
// PASO 2-3: EXTRACCIÓN Y NORMALIZACIÓN
// ============================================================

func HandleStep2Extraction(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	importIDStr := r.URL.Query().Get("import_id")
	importID, _ := strconv.ParseInt(importIDStr, 10, 64)

	// Obtener archivo
	var fileName string
	var assetType string
	query := `SELECT file_name, asset_type FROM inventory_imports WHERE id = $1`
	db.QueryRow(query, importID).Scan(&fileName, &assetType)

	// Extraer datos del PDF (usar Modelo BD2026 o LLM)
	extractedData, err := extractDataFromFile(fileName, assetType)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error extracting data: %v", err), http.StatusInternalServerError)
		return
	}

	// Guardar filas extraídas
	for i, row := range extractedData {
		query := `
			INSERT INTO inventory_import_rows (
				import_id, row_number, raw_data, normalized_data, status, created_at, updated_at
			) VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())
		`

		rawJSON, _ := json.Marshal(row)
		normalizedJSON, _ := json.Marshal(normalizeData(row, assetType))

		_, err := db.Exec(query, importID, i+1, string(rawJSON), string(normalizedJSON))
		if err != nil {
			log.Printf("Error inserting row: %v", err)
		}
	}

	// Actualizar estado
	updateImportStatus(db, importID, "validating", len(extractedData))

	// Registrar evento
	logEvent(db, importID, "extraction_completed", fmt.Sprintf("%d filas extraídas", len(extractedData)))

	response := map[string]interface{}{
		"import_id":      importID,
		"total_rows":     len(extractedData),
		"step":           3,
		"status":         "success",
		"next_step":      4,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ============================================================
// PASO 4: VALIDACIÓN
// ============================================================

func HandleStep4Validation(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	importIDStr := r.URL.Query().Get("import_id")
	importID, _ := strconv.ParseInt(importIDStr, 10, 64)

	// Obtener tipo de activo
	var assetType string
	db.QueryRow(`SELECT asset_type FROM inventory_imports WHERE id = $1`, importID).Scan(&assetType)

	// Obtener todas las filas
	query := `
		SELECT id, row_number, normalized_data 
		FROM inventory_import_rows 
		WHERE import_id = $1 AND status = 'pending'
	`

	rows, _ := db.Query(query, importID)
	defer rows.Close()

	correctCount := 0
	warningCount := 0
	errorCount := 0

	for rows.Next() {
		var rowID int64
		var rowNumber int
		var normalizedDataStr string

		rows.Scan(&rowID, &rowNumber, &normalizedDataStr)

		var normalizedData map[string]interface{}
		json.Unmarshal([]byte(normalizedDataStr), &normalizedData)

		// Validar
		validationErrors := ValidateAssetData(assetType, normalizedData)

		if len(validationErrors) == 0 {
			correctCount++
			updateRowStatus(db, rowID, "correct")
		} else {
			// Guardar errores de validación
			for _, validError := range validationErrors {
				saveValidationError(db, rowID, validError)
			}

			hasError := false
			for _, validError := range validationErrors {
				if validError.Severity == "error" {
					hasError = true
					break
				}
			}

			if hasError {
				errorCount++
				updateRowStatus(db, rowID, "error")
			} else {
				warningCount++
				updateRowStatus(db, rowID, "warning")
			}
		}
	}

	// Actualizar estadísticas
	updateImportStats(db, importID, correctCount, warningCount, errorCount, 0)

	// Registrar evento
	logEvent(db, importID, "validation_completed", fmt.Sprintf("Correctas: %d, Advertencias: %d, Errores: %d", correctCount, warningCount, errorCount))

	response := map[string]interface{}{
		"import_id":      importID,
		"correct_rows":   correctCount,
		"warning_rows":   warningCount,
		"error_rows":     errorCount,
		"step":           5,
		"status":         "success",
		"next_step":      6,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ============================================================
// PASO 5-6: DETECCIÓN DE DUPLICADOS
// ============================================================

func HandleStep5DuplicateDetection(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	importIDStr := r.URL.Query().Get("import_id")
	importID, _ := strconv.ParseInt(importIDStr, 10, 64)

	// Obtener información de importación
	var tenantID, branchID, assetType string
	query := `SELECT tenant_id, branch_id, asset_type FROM inventory_imports WHERE id = $1`
	db.QueryRow(query, importID).Scan(&tenantID, &branchID, &assetType)

	// Obtener filas válidas
	query = `
		SELECT id, row_number, normalized_data 
		FROM inventory_import_rows 
		WHERE import_id = $1 AND status IN ('correct', 'warning')
	`

	rows, _ := db.Query(query, importID)
	defer rows.Close()

	duplicateCount := 0

	for rows.Next() {
		var rowID int64
		var rowNumber int
		var normalizedDataStr string

		rows.Scan(&rowID, &rowNumber, &normalizedDataStr)

		var normalizedData map[string]interface{}
		json.Unmarshal([]byte(normalizedDataStr), &normalizedData)

		// Detectar duplicados
		duplicates, err := DetectDuplicates(db, tenantID, branchID, assetType, normalizedData)
		if err != nil {
			continue
		}

		if len(duplicates) > 0 {
			duplicateCount++
			updateRowStatus(db, rowID, "duplicate")

			// Guardar información de duplicado
			for _, dup := range duplicates {
				saveDuplicateInfo(db, importID, rowID, dup)
			}
		}
	}

	// Registrar evento
	logEvent(db, importID, "duplicate_detection_completed", fmt.Sprintf("%d duplicados detectados", duplicateCount))

	response := map[string]interface{}{
		"import_id":       importID,
		"duplicate_count": duplicateCount,
		"step":            6,
		"status":          "success",
		"next_step":       7,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ============================================================
// PASO 7: VISTA PREVIA
// ============================================================

func HandleStep7Preview(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	importIDStr := r.URL.Query().Get("import_id")
	importID, _ := strconv.ParseInt(importIDStr, 10, 64)

	// Obtener resumen de filas
	query := `
		SELECT 
			status,
			COUNT(*) as count
		FROM inventory_import_rows
		WHERE import_id = $1
		GROUP BY status
	`

	rows, _ := db.Query(query, importID)
	defer rows.Close()

	summary := make(map[string]int)
	for rows.Next() {
		var status string
		var count int
		rows.Scan(&status, &count)
		summary[status] = count
	}

	// Obtener primeras 10 filas para vista previa
	query = `
		SELECT id, row_number, normalized_data, status, validation_errors
		FROM inventory_import_rows
		WHERE import_id = $1
		LIMIT 10
	`

	previewRows, _ := db.Query(query, importID)
	defer previewRows.Close()

	var preview []map[string]interface{}
	for previewRows.Next() {
		var rowID int64
		var rowNumber int
		var normalizedDataStr string
		var status string
		var errorsStr sql.NullString

		previewRows.Scan(&rowID, &rowNumber, &normalizedDataStr, &status, &errorsStr)

		var normalizedData map[string]interface{}
		json.Unmarshal([]byte(normalizedDataStr), &normalizedData)

		preview = append(preview, map[string]interface{}{
			"row_id":    rowID,
			"row_number": rowNumber,
			"data":      normalizedData,
			"status":    status,
		})
	}

	response := map[string]interface{}{
		"import_id": importID,
		"summary":   summary,
		"preview":   preview,
		"step":      7,
		"status":    "success",
		"next_step": 8,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ============================================================
// PASO 8-9: CORRECCIONES Y APROBACIÓN
// ============================================================

func HandleStep8Corrections(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var corrections map[string]interface{}
	json.NewDecoder(r.Body).Decode(&corrections)

	importIDStr := r.URL.Query().Get("import_id")
	importID, _ := strconv.ParseInt(importIDStr, 10, 64)
	userID := r.URL.Query().Get("user_id")

	// Aplicar correcciones
	for rowIDStr, correctedData := range corrections {
		rowID, _ := strconv.ParseInt(rowIDStr, 10, 64)

		query := `
			UPDATE inventory_import_rows
			SET user_corrections = $1, corrected_by = $2, corrected_at = NOW(), status = 'corrected'
			WHERE id = $3
		`

		correctedJSON, _ := json.Marshal(correctedData)
		db.Exec(query, string(correctedJSON), userID, rowID)
	}

	// Registrar evento
	logEvent(db, importID, "user_corrected", fmt.Sprintf("%d filas corregidas por usuario", len(corrections)))

	response := map[string]interface{}{
		"import_id":        importID,
		"corrections_applied": len(corrections),
		"step":             9,
		"status":           "success",
		"next_step":        10,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func HandleStep9Approval(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	importIDStr := r.URL.Query().Get("import_id")
	importID, _ := strconv.ParseInt(importIDStr, 10, 64)
	userID := r.URL.Query().Get("user_id")

	// Actualizar estado de aprobación
	query := `
		UPDATE inventory_imports
		SET workflow_status = 'approved', approved_by = $1, approved_at = NOW()
		WHERE id = $2
	`

	db.Exec(query, userID, importID)

	// Registrar evento
	logEvent(db, importID, "import_approved", fmt.Sprintf("Importación aprobada por usuario %s", userID))

	response := map[string]interface{}{
		"import_id": importID,
		"status":    "approved",
		"step":      10,
		"next_step": 11,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ============================================================
// PASO 10: GUARDAR DEFINITIVAMENTE
// ============================================================

func HandleStep10Save(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	importIDStr := r.URL.Query().Get("import_id")
	importID, _ := strconv.ParseInt(importIDStr, 10, 64)

	// Obtener información de importación
	var tenantID, branchID, assetType string
	query := `SELECT tenant_id, branch_id, asset_type FROM inventory_imports WHERE id = $1`
	db.QueryRow(query, importID).Scan(&tenantID, &branchID, &assetType)

	// Iniciar transacción
	tx, err := db.Begin()
	if err != nil {
		http.Error(w, "Error starting transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Obtener todas las filas aceptadas
	query = `
		SELECT id, normalized_data, user_corrections
		FROM inventory_import_rows
		WHERE import_id = $1 AND status IN ('correct', 'warning', 'corrected')
	`

	rows, _ := tx.Query(query, importID)
	defer rows.Close()

	insertedCount := 0
	updatedCount := 0

	for rows.Next() {
		var rowID int64
		var normalizedDataStr string
		var userCorrectionsStr sql.NullString

		rows.Scan(&rowID, &normalizedDataStr, &userCorrectionsStr)

		var assetData map[string]interface{}
		json.Unmarshal([]byte(normalizedDataStr), &assetData)

		// Aplicar correcciones del usuario si existen
		if userCorrectionsStr.Valid {
			var corrections map[string]interface{}
			json.Unmarshal([]byte(userCorrectionsStr.String), &corrections)
			for key, value := range corrections {
				assetData[key] = value
			}
		}

		// UPSERT
		result, err := UpsertAsset(db, tenantID, branchID, assetType, assetData)
		if err != nil {
			log.Printf("Error upserting asset: %v", err)
			continue
		}

		if result.IsNew {
			insertedCount++
		} else {
			updatedCount++
		}

		// Marcar fila como aceptada
		updateRowStatus(tx, rowID, "accepted")
	}

	// Confirmar transacción
	if err := tx.Commit(); err != nil {
		http.Error(w, "Error committing transaction", http.StatusInternalServerError)
		return
	}

	// Actualizar estado final
	query = `
		UPDATE inventory_imports
		SET workflow_status = 'completed', import_completed_at = NOW()
		WHERE id = $1
	`
	db.Exec(query, importID)

	// Registrar evento
	logEvent(db, importID, "import_completed", fmt.Sprintf("Importación completada: %d nuevos, %d actualizados", insertedCount, updatedCount))

	response := map[string]interface{}{
		"import_id":      importID,
		"inserted":       insertedCount,
		"updated":        updatedCount,
		"step":           11,
		"status":         "completed",
		"workflow_complete": true,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

func updateImportStatus(db *sql.DB, importID int64, status string, totalRows int) {
	query := `UPDATE inventory_imports SET workflow_status = $1, total_rows = $2, updated_at = NOW() WHERE id = $3`
	db.Exec(query, status, totalRows, importID)
}

func updateRowStatus(db interface{}, rowID int64, status string) {
	var query string
	switch v := db.(type) {
	case *sql.DB:
		query = `UPDATE inventory_import_rows SET status = $1, updated_at = NOW() WHERE id = $2`
		v.Exec(query, status, rowID)
	case *sql.Tx:
		query = `UPDATE inventory_import_rows SET status = $1, updated_at = NOW() WHERE id = $2`
		v.Exec(query, status, rowID)
	}
}

func updateImportStats(db *sql.DB, importID int64, correct, warning, errors, duplicates int) {
	query := `
		UPDATE inventory_imports 
		SET correct_rows = $1, warning_rows = $2, error_rows = $3, duplicate_rows = $4, updated_at = NOW()
		WHERE id = $5
	`
	db.Exec(query, correct, warning, errors, duplicates, importID)
}

func logEvent(db *sql.DB, importID int64, eventType string, description string) {
	query := `INSERT INTO import_logs (import_id, event_type, description, created_at) VALUES ($1, $2, $3, NOW())`
	db.Exec(query, importID, eventType, description)
}

func saveValidationError(db *sql.DB, rowID int64, validError ValidationError) {
	query := `
		INSERT INTO import_validation_results (
			import_row_id, validation_type, field_name, is_valid, severity, message, created_at
		) VALUES ($1, 'field_validation', $2, false, $3, $4, NOW())
	`
	db.Exec(query, rowID, validError.Field, validError.Severity, validError.Message)
}

func saveDuplicateInfo(db *sql.DB, importID int64, rowID int64, dup DuplicateMatch) {
	query := `
		INSERT INTO import_duplicates (
			import_id, import_row_id, existing_asset_id, match_fields, match_confidence, action, created_at
		) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
	`

	matchFieldsJSON, _ := json.Marshal(dup.MatchFields)
	db.Exec(query, importID, rowID, dup.ExistingAssetID, string(matchFieldsJSON), dup.MatchConfidence)
}

func extractDataFromFile(fileName string, assetType string) ([]map[string]interface{}, error) {
	// Implementar extracción según tipo de archivo
	// Usar Modelo BD2026 para documentos estructurados
	// Usar LLM para documentos no estructurados
	return []map[string]interface{}{}, nil
}

func normalizeData(row map[string]interface{}, assetType string) map[string]interface{} {
	// Normalizar datos según tipo de activo
	return row
}
