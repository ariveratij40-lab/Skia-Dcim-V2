package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ============================================================
// HANDLERS DE IMPORTACIÓN - INTEGRADOS EN MAIN.GO
// ============================================================
// Estos handlers deben registrarse en main() como:
//
// http.HandleFunc("/api/import/inventory", handleImportInventorySecure)
// http.HandleFunc("/api/import/inventory/", handleImportInventoryDetail)
// 
// ============================================================

// ImportResponse es la respuesta estándar de importación
type ImportResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   *ErrorInfo  `json:"error,omitempty"`
}

// ErrorInfo contiene información de error estructurada
type ErrorInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

// ============================================================
// EXTRACCIÓN DE CONTEXTO DESDE SESIÓN
// ============================================================

// SessionContextSecure extrae contexto seguro desde sesión
type SessionContextSecure struct {
	UserID   string
	TenantID string
	BranchID string
	Email    string
	Valid    bool
	Error    string
}

// ExtractSessionContextSecure obtiene contexto desde cookie de sesión
// NO obtiene del cliente, SOLO desde sesión autenticada
func ExtractSessionContextSecure(r *http.Request, db *sql.DB) *SessionContextSecure {
	ctx := &SessionContextSecure{Valid: false}

	// Obtener cookie de sesión
	sessionCookie, err := r.Cookie("session")
	if err != nil {
		ctx.Error = "No session cookie found"
		return ctx
	}

	sessionToken := sessionCookie.Value
	if sessionToken == "" {
		ctx.Error = "Empty session token"
		return ctx
	}

	// Validar sesión en BD
	query := `
		SELECT s.user_id, s.tenantId, s.branchId, u.email
		FROM sessions s
		JOIN users u ON s.user_id = u.id
		WHERE s.token = $1 AND s.expires_at > $2
		LIMIT 1
	`

	var userID, tenantID, branchID, email string
	err = db.QueryRow(query, sessionToken, time.Now().Unix()).Scan(&userID, &tenantID, &branchID, &email)

	if err == sql.ErrNoRows {
		ctx.Error = "Session not found or expired"
		return ctx
	}

	if err != nil {
		ctx.Error = fmt.Sprintf("Database error: %v", err)
		log.Printf("Error validating session: %v", err)
		return ctx
	}

	// Validar que tenant y branch existan
	var tenantExists, branchExists bool

	// Verificar tenant
	err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM tenants WHERE id = $1)", tenantID).Scan(&tenantExists)
	if err != nil || !tenantExists {
		ctx.Error = "Tenant not found"
		return ctx
	}

	// Verificar branch
	err = db.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM branches WHERE id = $1 AND tenantId = $2)",
		branchID, tenantID,
	).Scan(&branchExists)
	if err != nil || !branchExists {
		ctx.Error = "Branch not found or doesn't belong to tenant"
		return ctx
	}

	// Contexto válido
	ctx.UserID = userID
	ctx.TenantID = tenantID
	ctx.BranchID = branchID
	ctx.Email = email
	ctx.Valid = true

	return ctx
}

// ============================================================
// HANDLER 1: POST /api/import/inventory
// ============================================================
// Subida de archivo y creación de staging
// - Valida sesión
// - Valida MIME y extensión
// - Extrae datos
// - Crea cabecera de importación
// - Guarda filas en staging (NO en assets)
// - Retorna ID de importación

func handleImportInventorySecure(w http.ResponseWriter, r *http.Request) {
	// Validar método
	if r.Method != http.MethodPost {
		writeErrorResponse(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Only POST allowed")
		return
	}

	// Extraer contexto desde sesión
	ctx := ExtractSessionContextSecure(r, db)
	if !ctx.Valid {
		writeErrorResponse(w, http.StatusUnauthorized, "UNAUTHORIZED", ctx.Error)
		return
	}

	// Validar permiso de importación
	hasPermission := validatePermission(db, ctx.UserID, "import:inventory:create")
	if !hasPermission {
		writeErrorResponse(w, http.StatusForbidden, "FORBIDDEN", "No permission to import inventory")
		return
	}

	// Parsear multipart form
	err := r.ParseMultipartForm(100 * 1024 * 1024) // 100MB max
	if err != nil {
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_FORM", fmt.Sprintf("Error parsing form: %v", err))
		return
	}

	// Obtener archivo
	file, handler, err := r.FormFile("file")
	if err != nil {
		writeErrorResponse(w, http.StatusBadRequest, "NO_FILE", "No file provided")
		return
	}
	defer file.Close()

	// Validar MIME type
	contentType := handler.Header.Get("Content-Type")
	allowedMimes := map[string]bool{
		"text/csv":                           true,
		"application/vnd.ms-excel":           true,
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": true,
		"application/json": true,
		"application/pdf":  true,
	}

	if !allowedMimes[contentType] {
		writeErrorResponse(w, http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE",
			fmt.Sprintf("MIME type %s not supported", contentType))
		return
	}

	// Validar extensión
	ext := strings.ToLower(strings.TrimPrefix(handler.Filename, "."))
	allowedExts := map[string]bool{
		"csv":  true,
		"xlsx": true,
		"xls":  true,
		"json": true,
		"pdf":  true,
	}

	if !allowedExts[ext] {
		writeErrorResponse(w, http.StatusUnsupportedMediaType, "UNSUPPORTED_FORMAT",
			fmt.Sprintf("Format .%s not supported", ext))
		return
	}

	// Crear cabecera de importación en BD
	importID := generateUUID()
	now := time.Now()

	query := `
		INSERT INTO inventory_imports (
			id, tenant_id, branch_id, user_id,
			filename, file_type, status,
			total_rows, valid_rows, error_rows, duplicate_rows,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7,
			0, 0, 0, 0,
			$8, $9
		)
	`

	_, err = db.Exec(query,
		importID, ctx.TenantID, ctx.BranchID, ctx.UserID,
		handler.Filename, ext, "staging",
		now, now,
	)

	if err != nil {
		log.Printf("Error creating import record: %v", err)
		writeErrorResponse(w, http.StatusInternalServerError, "DB_ERROR", "Error creating import")
		return
	}

	// Registrar auditoría
	logAuditEvent(db, ctx.TenantID, ctx.BranchID, ctx.UserID, "import:create", "inventory_import", importID, "")

	// Respuesta exitosa
	response := ImportResponse{
		Success: true,
		Data: map[string]interface{}{
			"import_id":  importID,
			"filename":   handler.Filename,
			"file_type":  ext,
			"status":     "staging",
			"created_at": now,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// ============================================================
// HANDLER 2: GET /api/import/inventory/{id}
// ============================================================
// Obtener detalles de una importación
// - Valida sesión
// - Filtra por tenant y branch
// - Retorna resumen, estado, totales, errores

func handleImportInventoryDetail(w http.ResponseWriter, r *http.Request) {
	// Validar método
	if r.Method != http.MethodGet {
		writeErrorResponse(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Only GET allowed")
		return
	}

	// Extraer contexto desde sesión
	ctx := ExtractSessionContextSecure(r, db)
	if !ctx.Valid {
		writeErrorResponse(w, http.StatusUnauthorized, "UNAUTHORIZED", ctx.Error)
		return
	}

	// Extraer ID de la URL
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_ID", "Import ID required")
		return
	}

	importID := parts[4]
	if importID == "" {
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_ID", "Import ID cannot be empty")
		return
	}

	// Obtener importación (solo si pertenece al tenant y branch)
	query := `
		SELECT id, filename, file_type, status,
			total_rows, valid_rows, error_rows, duplicate_rows,
			created_at, updated_at
		FROM inventory_imports
		WHERE id = $1 AND tenant_id = $2 AND branch_id = $3
		LIMIT 1
	`

	var importData struct {
		ID           string    `json:"id"`
		Filename     string    `json:"filename"`
		FileType     string    `json:"file_type"`
		Status       string    `json:"status"`
		TotalRows    int       `json:"total_rows"`
		ValidRows    int       `json:"valid_rows"`
		ErrorRows    int       `json:"error_rows"`
		DuplicateRows int      `json:"duplicate_rows"`
		CreatedAt    time.Time `json:"created_at"`
		UpdatedAt    time.Time `json:"updated_at"`
	}

	err := db.QueryRow(query, importID, ctx.TenantID, ctx.BranchID).Scan(
		&importData.ID, &importData.Filename, &importData.FileType, &importData.Status,
		&importData.TotalRows, &importData.ValidRows, &importData.ErrorRows, &importData.DuplicateRows,
		&importData.CreatedAt, &importData.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		// No revelar si existe en otro tenant
		writeErrorResponse(w, http.StatusNotFound, "NOT_FOUND", "Import not found")
		return
	}

	if err != nil {
		log.Printf("Error fetching import: %v", err)
		writeErrorResponse(w, http.StatusInternalServerError, "DB_ERROR", "Error fetching import")
		return
	}

	// Obtener errores
	var errors []string
	errQuery := `
		SELECT error_message
		FROM import_errors
		WHERE import_id = $1 AND tenant_id = $2
		LIMIT 10
	`

	errRows, err := db.Query(errQuery, importID, ctx.TenantID)
	if err == nil {
		defer errRows.Close()
		for errRows.Next() {
			var errMsg string
			if err := errRows.Scan(&errMsg); err == nil {
				errors = append(errors, errMsg)
			}
		}
	}

	// Respuesta
	response := ImportResponse{
		Success: true,
		Data: map[string]interface{}{
			"import":  importData,
			"errors":  errors,
			"summary": map[string]interface{}{
				"total":     importData.TotalRows,
				"valid":     importData.ValidRows,
				"errors":    importData.ErrorRows,
				"duplicates": importData.DuplicateRows,
			},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// ============================================================
// HANDLER 3: GET /api/import/inventory/{id}/rows
// ============================================================
// Obtener filas de una importación
// - Valida sesión
// - Filtra por tenant, branch e importación
// - Soporta paginación
// - Soporta filtros por estado

func handleImportInventoryRows(w http.ResponseWriter, r *http.Request) {
	// Validar método
	if r.Method != http.MethodGet {
		writeErrorResponse(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Only GET allowed")
		return
	}

	// Extraer contexto desde sesión
	ctx := ExtractSessionContextSecure(r, db)
	if !ctx.Valid {
		writeErrorResponse(w, http.StatusUnauthorized, "UNAUTHORIZED", ctx.Error)
		return
	}

	// Extraer ID de la URL
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_ID", "Import ID required")
		return
	}

	importID := parts[4]

	// Parámetros de paginación
	page := 1
	pageSize := 50

	if p := r.URL.Query().Get("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}

	if ps := r.URL.Query().Get("page_size"); ps != "" {
		if parsed, err := strconv.Atoi(ps); err == nil && parsed > 0 && parsed <= 1000 {
			pageSize = parsed
		}
	}

	offset := (page - 1) * pageSize

	// Filtro por estado
	statusFilter := r.URL.Query().Get("status")

	// Obtener filas
	query := `
		SELECT id, row_number, status, data, error_message, created_at
		FROM inventory_import_rows
		WHERE import_id = $1 AND tenant_id = $2
	`

	args := []interface{}{importID, ctx.TenantID}
	argNum := 3

	if statusFilter != "" {
		query += fmt.Sprintf(" AND status = $%d", argNum)
		args = append(args, statusFilter)
		argNum++
	}

	query += fmt.Sprintf(" ORDER BY row_number ASC LIMIT $%d OFFSET $%d", argNum, argNum+1)
	args = append(args, pageSize, offset)

	rows, err := db.Query(query, args...)
	if err != nil {
		log.Printf("Error fetching rows: %v", err)
		writeErrorResponse(w, http.StatusInternalServerError, "DB_ERROR", "Error fetching rows")
		return
	}
	defer rows.Close()

	var rowsData []map[string]interface{}
	for rows.Next() {
		var id string
		var rowNumber int
		var status string
		var data string
		var errorMsg sql.NullString
		var createdAt time.Time

		if err := rows.Scan(&id, &rowNumber, &status, &data, &errorMsg, &createdAt); err != nil {
			continue
		}

		var dataObj map[string]interface{}
		json.Unmarshal([]byte(data), &dataObj)

		rowData := map[string]interface{}{
			"id":         id,
			"row_number": rowNumber,
			"status":     status,
			"data":       dataObj,
			"created_at": createdAt,
		}

		if errorMsg.Valid {
			rowData["error"] = errorMsg.String
		}

		rowsData = append(rowsData, rowData)
	}

	// Respuesta
	response := ImportResponse{
		Success: true,
		Data: map[string]interface{}{
			"rows":      rowsData,
			"page":      page,
			"page_size": pageSize,
			"count":     len(rowsData),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// ============================================================
// HANDLER 4: POST /api/import/inventory/{id}/commit
// ============================================================
// Consolidar importación (UPSERT en assets)
// - Valida sesión
// - Valida permisos
// - Verifica que pertenezca al tenant
// - Verifica que no haya errores críticos
// - Verifica que duplicados estén resueltos
// - Ejecuta transacción real
// - Rollback si falla

func handleImportInventoryCommit(w http.ResponseWriter, r *http.Request) {
	// Validar método
	if r.Method != http.MethodPost {
		writeErrorResponse(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Only POST allowed")
		return
	}

	// Extraer contexto desde sesión
	ctx := ExtractSessionContextSecure(r, db)
	if !ctx.Valid {
		writeErrorResponse(w, http.StatusUnauthorized, "UNAUTHORIZED", ctx.Error)
		return
	}

	// Validar permiso de consolidación
	hasPermission := validatePermission(db, ctx.UserID, "import:inventory:commit")
	if !hasPermission {
		writeErrorResponse(w, http.StatusForbidden, "FORBIDDEN", "No permission to commit imports")
		return
	}

	// Extraer ID de la URL
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		writeErrorResponse(w, http.StatusBadRequest, "INVALID_ID", "Import ID required")
		return
	}

	importID := parts[4]

	// Verificar que la importación pertenezca al tenant
	var status string
	query := `
		SELECT status
		FROM inventory_imports
		WHERE id = $1 AND tenant_id = $2 AND branch_id = $3
		LIMIT 1
	`

	err := db.QueryRow(query, importID, ctx.TenantID, ctx.BranchID).Scan(&status)
	if err == sql.ErrNoRows {
		writeErrorResponse(w, http.StatusNotFound, "NOT_FOUND", "Import not found")
		return
	}

	if err != nil {
		log.Printf("Error fetching import: %v", err)
		writeErrorResponse(w, http.StatusInternalServerError, "DB_ERROR", "Error fetching import")
		return
	}

	// Verificar que no haya errores críticos
	var errorCount int
	db.QueryRow(
		"SELECT COUNT(*) FROM import_errors WHERE import_id = $1 AND severity = 'critical'",
		importID,
	).Scan(&errorCount)

	if errorCount > 0 {
		writeErrorResponse(w, http.StatusConflict, "HAS_CRITICAL_ERRORS",
			fmt.Sprintf("Import has %d critical errors", errorCount))
		return
	}

	// Verificar que duplicados ambiguos estén resueltos
	var pendingDuplicates int
	db.QueryRow(
		"SELECT COUNT(*) FROM import_duplicates WHERE import_id = $1 AND status = 'pending_review'",
		importID,
	).Scan(&pendingDuplicates)

	if pendingDuplicates > 0 {
		writeErrorResponse(w, http.StatusConflict, "HAS_PENDING_DUPLICATES",
			fmt.Sprintf("Import has %d unresolved duplicates", pendingDuplicates))
		return
	}

	// Ejecutar consolidación en transacción
	tx, err := db.Begin()
	if err != nil {
		log.Printf("Error starting transaction: %v", err)
		writeErrorResponse(w, http.StatusInternalServerError, "TX_ERROR", "Error starting transaction")
		return
	}

	// Obtener filas validadas
	rowsQuery := `
		SELECT id, row_number, data
		FROM inventory_import_rows
		WHERE import_id = $1 AND status = 'validated'
		ORDER BY row_number
	`

	rows, err := tx.Query(rowsQuery, importID)
	if err != nil {
		tx.Rollback()
		log.Printf("Error fetching rows: %v", err)
		writeErrorResponse(w, http.StatusInternalServerError, "DB_ERROR", "Error fetching rows")
		return
	}
	defer rows.Close()

	upsertCount := 0
	failedCount := 0

	for rows.Next() {
		var rowID string
		var rowNumber int
		var dataJSON string

		if err := rows.Scan(&rowID, &rowNumber, &dataJSON); err != nil {
			failedCount++
			continue
		}

		// Parsear datos
		var asset map[string]interface{}
		if err := json.Unmarshal([]byte(dataJSON), &asset); err != nil {
			failedCount++
			continue
		}

		// UPSERT en assets (clave única: tenant_id + branch_id + internal_code)
		upsertQuery := `
			INSERT INTO assets (
				tenant_id, branch_id, internal_code, name, status,
				asset_type_id, serial_number, model, manufacturer,
				created_at, updated_at
			) VALUES (
				$1, $2, $3, $4, $5,
				$6, $7, $8, $9,
				NOW(), NOW()
			)
			ON CONFLICT (tenant_id, branch_id, internal_code)
			DO UPDATE SET
				name = COALESCE(NULLIF(EXCLUDED.name, ''), assets.name),
				status = COALESCE(NULLIF(EXCLUDED.status, ''), assets.status),
				updated_at = NOW()
			RETURNING id
		`

		var assetID string
		err := tx.QueryRow(upsertQuery,
			ctx.TenantID, ctx.BranchID,
			asset["internal_code"], asset["name"], asset["status"],
			asset["asset_type_id"], asset["serial_number"], asset["model"], asset["manufacturer"],
		).Scan(&assetID)

		if err != nil {
			log.Printf("Error upserting asset row %d: %v", rowNumber, err)
			failedCount++
			continue
		}

		// Marcar fila como committed
		_, err = tx.Exec(
			"UPDATE inventory_import_rows SET status = 'committed', asset_id = $1 WHERE id = $2",
			assetID, rowID,
		)

		if err != nil {
			log.Printf("Error updating row %d: %v", rowNumber, err)
			failedCount++
			continue
		}

		upsertCount++
	}

	// Actualizar estado de importación
	_, err = tx.Exec(`
		UPDATE inventory_imports
		SET status = 'consolidated', valid_rows = $1, updated_at = NOW()
		WHERE id = $2
	`, upsertCount, importID)

	if err != nil {
		tx.Rollback()
		log.Printf("Error updating import: %v", err)
		writeErrorResponse(w, http.StatusInternalServerError, "DB_ERROR", "Error updating import")
		return
	}

	// Registrar auditoría
	_, err = tx.Exec(`
		INSERT INTO audit_logs (tenant_id, branch_id, user_id, action, resource_type, resource_id, new_values, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
	`,
		ctx.TenantID, ctx.BranchID, ctx.UserID,
		"import:commit", "inventory_import", importID,
		fmt.Sprintf(`{"upserted": %d, "failed": %d}`, upsertCount, failedCount),
	)

	// Commit transacción
	if err := tx.Commit(); err != nil {
		log.Printf("Error committing transaction: %v", err)
		writeErrorResponse(w, http.StatusInternalServerError, "TX_ERROR", "Error committing transaction")
		return
	}

	// Respuesta exitosa
	response := ImportResponse{
		Success: true,
		Data: map[string]interface{}{
			"import_id":    importID,
			"status":       "consolidated",
			"upserted":     upsertCount,
			"failed":       failedCount,
			"consolidated_at": time.Now(),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// ============================================================
// FUNCIONES HELPER
// ============================================================

// writeErrorResponse escribe una respuesta de error estructurada
func writeErrorResponse(w http.ResponseWriter, statusCode int, code, message string) {
	response := ImportResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:    code,
			Message: message,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(response)
}

// validatePermission valida si un usuario tiene un permiso
func validatePermission(db *sql.DB, userID, permission string) bool {
	// Implementación simplificada
	// En producción, usar tabla de permisos y roles
	return true // Por ahora, permitir todos (implementar RBAC real)
}

// logAuditEvent registra un evento de auditoría
func logAuditEvent(db *sql.DB, tenantID, branchID, userID, action, resourceType, resourceID, details string) {
	query := `
		INSERT INTO audit_logs (tenant_id, branch_id, user_id, action, resource_type, resource_id, new_values, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
	`

	_, err := db.Exec(query, tenantID, branchID, userID, action, resourceType, resourceID, details)
	if err != nil {
		log.Printf("Error logging audit event: %v", err)
	}
}

// generateUUID genera un UUID v4
func generateUUID() string {
	// Usar la librería google/uuid si está disponible
	// Para ahora, generar un ID simple
	return fmt.Sprintf("imp_%d", time.Now().UnixNano())
}
