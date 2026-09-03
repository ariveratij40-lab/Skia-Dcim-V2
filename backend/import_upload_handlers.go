package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

type importUploadStatus struct {
	TenantID       string
	BranchID       string
	Status         string
	Progress       int
	Message        string
	ItemsExtracted int
	Result         interface{}
}

var importUploadStatuses sync.Map

// ─── Route Registration ────────────────────────────────────────────────────────

func registerImportUploadRoutes() {
	http.HandleFunc("/api/import/upload/start", handleImportUploadStart)
	http.HandleFunc("/api/import/upload/chunk", handleImportUploadChunk)
	http.HandleFunc("/api/import/upload/process", handleImportUploadProcess)
	http.HandleFunc("/api/import/upload/status/", handleImportUploadStatus)
}

// ─── Upload Handlers ─────────────────────────────────────────────────────────

func handleImportUploadStart(w http.ResponseWriter, r *http.Request) {
	session := ExtractSessionContextSecure(r, db)
	if !session.Valid {
		http.Error(w, "Unauthorized: "+session.Error, http.StatusUnauthorized)
		return
	}

	sessionID := uuid.New().String()
	uploadID := uuid.New().String()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"sessionId": sessionID,
		"uploadId":  uploadID,
	})
}

func handleImportUploadChunk(w http.ResponseWriter, r *http.Request) {
	session := ExtractSessionContextSecure(r, db)
	if !session.Valid {
		http.Error(w, "Unauthorized: "+session.Error, http.StatusUnauthorized)
		return
	}

	uploadID := r.FormValue("uploadId")
	chunkIndex := r.FormValue("chunkIndex")
	totalChunks := r.FormValue("totalChunks")
	if _, err := uuid.Parse(uploadID); err != nil {
		http.Error(w, "Invalid upload ID", http.StatusBadRequest)
		return
	}
	if index, err := strconv.Atoi(chunkIndex); err != nil || index < 0 {
		http.Error(w, "Invalid chunk index", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("chunk")
	if err != nil {
		http.Error(w, "Failed to read chunk", http.StatusBadRequest)
		return
	}
	defer file.Close()

	chunkPath := fmt.Sprintf("/tmp/upload-%s-chunk-%s", uploadID, chunkIndex)
	f, err := os.Create(chunkPath)
	if err != nil {
		http.Error(w, "Failed to save chunk", http.StatusInternalServerError)
		return
	}
	defer f.Close()

	_, err = io.Copy(f, file)
	if err != nil {
		http.Error(w, "Failed to write chunk", http.StatusInternalServerError)
		return
	}

	log.Printf("Chunk %s/%s saved for upload %s", chunkIndex, totalChunks, uploadID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "chunk_received"})
}

// handleImportUploadProcess -- CORRECCIÓN 2026-08-07 (hallazgo Crítico,
// independiente de RLS): antes de este fix, el job de importación se
// creaba con session.BranchID (correcto), pero ese valor se perdía en el
// camino -- processImportFileAsync ni siquiera lo recibía como parámetro,
// y el INSERT INTO assets usaba un UUID de sucursal HARDCODEADO (la
// sucursal "Sede Principal - Miami" del tenant semilla original,
// migrations/002_seed.sql). Efecto: todo activo importado por cualquier
// tenant/usuario quedaba asignado a esa sucursal ajena -- corrupción de
// datos activa ya, sin depender de que RLS esté encendido. Corrección
// estructural acordada con el usuario:
//  1. Rechazar el job aquí mismo si tenant_id o branch_id de la sesión ya
//     validada vienen vacíos -- nunca crear un import_jobs sin ambos.
//  2. La sucursal usada es SIEMPRE session.BranchID, la misma que
//     ExtractSessionContextSecure ya resolvió y autorizó (existencia en
//     `branches` + autorización en `user_branches` para este usuario,
//     ver import_handlers.go) -- nunca un valor por defecto, nunca "la
//     primera sucursal disponible".
//  3. Ese mismo branch_id se propaga explícitamente hasta
//     processImportFileAsync (nuevo parámetro) y de ahí a cada INSERT en
//     `assets`.
func handleImportUploadProcess(w http.ResponseWriter, r *http.Request) {
	session := ExtractSessionContextSecure(r, db)
	if !session.Valid {
		http.Error(w, "Unauthorized: "+session.Error, http.StatusUnauthorized)
		return
	}
	// Defensa explícita (además de session.Valid): un job de importación
	// nunca debe crearse sin tenant_id NI branch_id ya resueltos y
	// autorizados. No debería poder ocurrir que session.Valid=true con
	// alguno de los dos vacío (ExtractSessionContextSecure ya lo exige),
	// pero esta ruta escribe directamente en `assets` más adelante -- vale
	// la pena no confiar ciegamente en ese invariante ajeno.
	if session.TenantID == "" || session.BranchID == "" {
		log.Printf("handleImportUploadProcess: sesión válida pero tenant_id/branch_id vacíos (tenant=%q, branch=%q) -- rechazando job", session.TenantID, session.BranchID)
		http.Error(w, "Unauthorized: sesión sin tenant o sucursal válidos", http.StatusUnauthorized)
		return
	}

	// Leer JSON del body
	var requestBody struct {
		UploadID    string `json:"uploadId"`
		FileName    string `json:"fileName"`
		TotalChunks int    `json:"totalChunks"`
		AssetType   string `json:"assetType"`
	}

	err := json.NewDecoder(r.Body).Decode(&requestBody)
	if err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	uploadID := requestBody.UploadID
	fileName := requestBody.FileName
	totalChunksInt := requestBody.TotalChunks
	if _, err := uuid.Parse(uploadID); err != nil || totalChunksInt <= 0 {
		http.Error(w, "Invalid upload metadata", http.StatusBadRequest)
		return
	}

	// Reconstruir archivo desde chunks
	filePath := fmt.Sprintf("/tmp/upload-%s", uploadID)
	outFile, err := os.Create(filePath)
	if err != nil {
		http.Error(w, "Failed to create file", http.StatusInternalServerError)
		return
	}
	defer outFile.Close()

	// Leer y concatenar chunks
	for i := 0; i < totalChunksInt; i++ {
		chunkPath := fmt.Sprintf("/tmp/upload-%s-chunk-%d", uploadID, i)
		chunkFile, err := os.Open(chunkPath)
		if err != nil {
			continue
		}
		io.Copy(outFile, chunkFile)
		chunkFile.Close()
		os.Remove(chunkPath)
	}

	// Iniciar procesamiento asincrónico
	jobUUID := uuid.New().String()
	fileType := detectFileType(fileName)

	// Validar que el tipo de archivo sea soportado
	if fileType == "unknown" {
		http.Error(w, "Unsupported file type. Please upload PDF, Excel, CSV, or Word files.", http.StatusBadRequest)
		return
	}

	// import_jobs/import_items are legacy compatibility tables, not canonical
	// staging authority. Progress remains transport-only and in-memory; durable
	// import state is created exclusively through migration 029 functions.
	importUploadStatuses.Store(jobUUID, importUploadStatus{TenantID: session.TenantID, BranchID: session.BranchID, Status: "parsing", Progress: 10, Message: "Iniciando procesamiento..."})
	go processImportFileAsync(filePath, fileName, requestBody.AssetType, session.TenantID, session.BranchID, session.UserID, jobUUID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"jobId": jobUUID})
}

func handleImportUploadStatus(w http.ResponseWriter, r *http.Request) {
	session := ExtractSessionContextSecure(r, db)
	if !session.Valid {
		http.Error(w, "Unauthorized: "+session.Error, http.StatusUnauthorized)
		return
	}

	jobUUID := strings.TrimPrefix(r.URL.Path, "/api/import/upload/status/")

	stored, ok := importUploadStatuses.Load(jobUUID)
	if !ok {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}
	status := stored.(importUploadStatus)
	if status.TenantID != session.TenantID || status.BranchID == "" || status.BranchID != session.BranchID {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":         status.Status,
		"progress":       status.Progress,
		"message":        status.Message,
		"itemsExtracted": status.ItemsExtracted,
		"result":         status.Result,
	})
}

// ─── Processing ──────────────────────────────────────────────────────────────

// processImportFileAsync -- ver corrección 2026-08-07 en la cabecera de
// handleImportUploadProcess: branchID ahora es un parámetro explícito, y
// se valida aquí también (defensa en profundidad -- esta función podría
// llamarse desde otro lugar en el futuro sin pasar por
// handleImportUploadProcess, y no debe confiar ciegamente en que quien la
// llama ya validó tenant/sucursal).
func processImportFileAsync(filePath, fileName, fallbackAssetType, tenantID, branchID, userID, jobUUID string) {
	log.Printf("DEBUG: processImportFileAsync started - job=%s, filePath=%s, fileName=%s", jobUUID, filePath, fileName)
	defer os.Remove(filePath)
	setStatus := func(status string, progress int, message string, items int, result interface{}) {
		importUploadStatuses.Store(jobUUID, importUploadStatus{TenantID: tenantID, BranchID: branchID, Status: status, Progress: progress, Message: message, ItemsExtracted: items, Result: result})
	}

	if tenantID == "" || branchID == "" || userID == "" {
		log.Printf("ERROR: processImportFileAsync called without authoritative scope (job=%s)", jobUUID)
		setStatus("error", 0, "Import rejected: missing authoritative context", 0, nil)
		return // el defer de más arriba ya limpia filePath
	}

	// Verificar que el archivo existe
	if _, err := os.Stat(filePath); err != nil {
		log.Printf("ERROR: File not found: %s - %v", filePath, err)
		setStatus("error", 0, "File not found", 0, nil)
		return
	}
	log.Printf("DEBUG: File exists: %s", filePath)

	setStatus("parsing", 10, "Detecting file type...", 0, nil)

	fileType := detectFileType(fileName)
	log.Printf("DEBUG: File type detected: %s", fileType)
	var items []map[string]interface{}
	var docType string
	var err error

	switch fileType {
	case "pdf":
		log.Printf("DEBUG: Parsing PDF file: %s", filePath)
		items, docType, err = parsePDFSimple(filePath)
		if err != nil {
			log.Printf("ERROR: parsePDFSimple failed: %v", err)
		}
	case "excel":
		log.Printf("DEBUG: Parsing Excel file: %s", filePath)
		items, docType, err = parseExcelSimple(filePath)
		if err != nil {
			log.Printf("ERROR: parseExcelSimple failed: %v", err)
		}
	case "csv":
		log.Printf("DEBUG: Parsing CSV file: %s", filePath)
		items, docType, err = parseCSVSimple(filePath)
		if err != nil {
			log.Printf("ERROR: parseCSVSimple failed: %v", err)
		}
	case "word":
		log.Printf("DEBUG: Parsing Word file: %s", filePath)
		items, docType, err = parseWordSimple(filePath)
		if err != nil {
			log.Printf("ERROR: parseWordSimple failed: %v", err)
		}
	default:
		log.Printf("ERROR: Unsupported file type: %s", fileType)
		setStatus("error", 0, "Unsupported file type", 0, nil)
		return
	}

	if err != nil {
		log.Printf("ERROR: File parsing failed: %v", err)
		setStatus("error", 0, "Failed to parse file", 0, nil)
		return
	}

	log.Printf("DEBUG: Successfully parsed file, extracted %d items", len(items))

	setStatus("staging", 50, fmt.Sprintf("Extracted %d items", len(items)), len(items), nil)
	summary, err := createAndStageCanonicalImport(context.Background(), db,
		CanonicalImportScope{TenantID: tenantID, BranchID: branchID, UserID: userID},
		fileName, fallbackAssetType, docType, fileType, items)
	if err != nil {
		log.Printf("ERROR: secure canonical staging failed: %v", err)
		setStatus("error", 0, "Secure staging failed", len(items), nil)
		return
	}
	setStatus("done", 100, "Import staged; canonical commit pending", len(items), map[string]interface{}{
		"importId": summary.ImportID, "aggregateState": summary.State, "validItems": summary.Valid, "invalidItems": summary.Invalid, "items": summary.Rows,
	})
}

// ─── File Parsers ────────────────────────────────────────────────────────────

func parsePDFSimple(filePath string) ([]map[string]interface{}, string, error) {
	log.Printf("DEBUG: parsePDFSimple called with filePath=%s", filePath)

	// Verificar que el archivo existe
	if _, err := os.Stat(filePath); err != nil {
		log.Printf("ERROR: File does not exist: %s - %v", filePath, err)
		return nil, "", fmt.Errorf("file not found: %v", err)
	}

	cmd := exec.Command("pdftotext", "-layout", filePath, "-")
	log.Printf("DEBUG: Executing pdftotext command: %v", cmd.Args)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		log.Printf("ERROR: pdftotext failed: %v", err)
		log.Printf("DEBUG: pdftotext stderr: %s", stderr.String())
		return nil, "", fmt.Errorf("pdftotext failed: %s", stderr.String())
	}

	output := stdout.Bytes()

	text := string(output)
	log.Printf("DEBUG: pdftotext extracted %d characters", len(text))

	items := extractStructuredItemsFromText(text)
	log.Printf("DEBUG: extractStructuredItemsFromText returned %d items", len(items))

	return items, "inventory", nil
}

func parseExcelSimple(filePath string) ([]map[string]interface{}, string, error) {
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return nil, "", err
	}
	defer f.Close()

	var items []map[string]interface{}
	rows, err := f.GetRows(f.GetSheetName(0))
	if err != nil {
		return nil, "", err
	}

	for _, row := range rows {
		if len(row) < 2 {
			continue
		}

		item := map[string]interface{}{
			"name":     row[0],
			"ip":       row[1],
			"category": "other",
		}
		items = append(items, item)
	}

	return items, "inventory", nil
}

func parseCSVSimple(filePath string) ([]map[string]interface{}, string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, "", err
	}
	defer f.Close()

	// Leer como CSV
	var items []map[string]interface{}
	// Implementar lectura CSV aquí
	return items, "inventory", nil
}

func parseWordSimple(filePath string) ([]map[string]interface{}, string, error) {
	cmd := exec.Command("libreoffice", "--headless", "--convert-to", "txt", "--outdir", "/tmp", filePath)
	if err := cmd.Run(); err != nil {
		return nil, "", fmt.Errorf("libreoffice failed: %v", err)
	}

	txtFile := strings.TrimSuffix(filePath, filepath.Ext(filePath)) + ".txt"
	defer os.Remove(txtFile)

	data, err := os.ReadFile(txtFile)
	if err != nil {
		return nil, "", fmt.Errorf("failed to read txt: %v", err)
	}

	text := string(data)
	items := extractStructuredItemsFromText(text)
	return items, "inventory", nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func detectFileType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".pdf":
		return "pdf"
	case ".xlsx", ".xls":
		return "excel"
	case ".csv":
		return "csv"
	case ".docx", ".doc":
		return "word"
	default:
		return "unknown"
	}
}

func isValidIP(ip string) bool {
	parts := strings.Split(ip, ".")
	if len(parts) != 4 {
		return false
	}
	if strings.HasSuffix(ip, ".") {
		return false
	}
	return true
}

func extractStructuredItemsFromText(text string) []map[string]interface{} {
	var items []map[string]interface{}
	lines := strings.Split(text, "\n")

	currentSection := ""
	var sectionCount int

	for _, line := range lines {
		// Detectar secciones
		lowerLine := strings.ToLower(line)
		if strings.Contains(lowerLine, "1. mdf") || strings.Contains(lowerLine, "mdf principal") {
			currentSection = "mdf_idf"
			sectionCount++
			continue
		}
		if strings.Contains(lowerLine, "2. idf") || strings.Contains(lowerLine, "distribuidores intermedios") {
			currentSection = "mdf_idf"
			sectionCount++
			continue
		}
		if strings.Contains(lowerLine, "3. backbone") || strings.Contains(lowerLine, "backbone") {
			currentSection = "backbone"
			sectionCount++
			continue
		}
		if strings.Contains(lowerLine, "4. rack") || strings.Contains(lowerLine, "racks") {
			currentSection = "racks"
			sectionCount++
			continue
		}
		if strings.Contains(lowerLine, "5. switch") || strings.Contains(lowerLine, "switches") {
			currentSection = "switches"
			sectionCount++
			continue
		}
		if strings.Contains(lowerLine, "6. ups") || strings.Contains(lowerLine, "ups/pdu") {
			currentSection = "ups_pdu"
			sectionCount++
			continue
		}
		if strings.Contains(lowerLine, "7. patch") || strings.Contains(lowerLine, "patch panel") {
			currentSection = "patch_panels"
			sectionCount++
			continue
		}
		if strings.Contains(lowerLine, "8. nodo") || strings.Contains(lowerLine, "inventario de nodos") || strings.Contains(lowerLine, "nodos") {
			currentSection = "nodos"
			sectionCount++
			continue
		}

		// Limpiar línea
		cleanLine := strings.TrimSpace(line)
		if cleanLine == "" {
			continue
		}

		// Ignorar cabeceras de tablas y líneas que son solo texto descriptivo
		lowerCleanLine := strings.ToLower(cleanLine)
		if strings.Contains(lowerCleanLine, "memoria técnica") ||
			strings.Contains(lowerCleanLine, "documento ficticio") ||
			strings.Contains(lowerCleanLine, "documento de prueba") ||
			strings.Contains(lowerCleanLine, "todos los nombres") ||
			strings.HasPrefix(lowerCleanLine, "id ") ||
			strings.HasPrefix(lowerCleanLine, "origen ") ||
			strings.HasPrefix(lowerCleanLine, "rack ") ||
			strings.HasPrefix(lowerCleanLine, "equipo ") ||
			strings.HasPrefix(lowerCleanLine, "nodo ") ||
			strings.HasPrefix(lowerCleanLine, "ubicación") ||
			strings.HasPrefix(lowerCleanLine, "destino") ||
			strings.HasPrefix(lowerCleanLine, "tipo") ||
			strings.HasPrefix(lowerCleanLine, "hilos") ||
			strings.HasPrefix(lowerCleanLine, "longitud") ||
			strings.HasPrefix(lowerCleanLine, "switch") ||
			strings.HasPrefix(lowerCleanLine, "fibra") ||
			strings.HasPrefix(lowerCleanLine, "puerto") ||
			strings.HasPrefix(lowerCleanLine, "vlan") ||
			strings.HasPrefix(lowerCleanLine, "ip") ||
			strings.HasPrefix(lowerCleanLine, "activo") ||
			strings.HasPrefix(lowerCleanLine, "categoría") ||
			strings.HasPrefix(lowerCleanLine, "color") ||
			strings.HasPrefix(lowerCleanLine, "panel") ||
			strings.HasPrefix(lowerCleanLine, "marca") ||
			strings.HasPrefix(lowerCleanLine, "puertos") ||
			strings.HasPrefix(lowerCleanLine, "capacidad") ||
			strings.HasPrefix(lowerCleanLine, "altura") ||
			len(cleanLine) < 3 { // Líneas muy cortas probablemente sean basura
			continue
		}

		// Parsear según sección
		fields := strings.Fields(cleanLine)
		if len(fields) < 2 {
			continue
		} // Necesitamos al menos 2 campos

		// Validación: el primer campo debe ser un ID válido
		firstField := fields[0]
		isValidID := strings.HasPrefix(firstField, "MDF-") || strings.HasPrefix(firstField, "IDF-") ||
			strings.HasPrefix(firstField, "RACK-") || strings.HasPrefix(firstField, "SW-") ||
			strings.HasPrefix(firstField, "UPS-") || strings.HasPrefix(firstField, "PP-") ||
			strings.HasPrefix(firstField, "N-") || strings.HasPrefix(firstField, "PDU-")

		if !isValidID {
			continue
		} // Saltar líneas que no comienzan con un ID válido

		item := map[string]interface{}{
			"category": currentSection,
		}

		switch currentSection {
		case "mdf_idf":
			if (strings.HasPrefix(firstField, "MDF-") || strings.HasPrefix(firstField, "IDF-")) && len(fields) >= 2 {
				item["name"] = firstField
				item["location"] = fields[1]
				if len(fields) > 2 {
					item["model"] = fields[2]
				}
				item["category"] = "mdf_idf"
				items = append(items, item)
			}
		case "racks":
			if strings.HasPrefix(firstField, "RACK-") && len(fields) >= 2 {
				item["name"] = firstField
				item["model"] = fields[1] + "U"
				item["category"] = "racks"
				items = append(items, item)
			}
		case "switches":
			if strings.HasPrefix(firstField, "SW-") && len(fields) >= 2 {
				item["name"] = firstField
				if len(fields) >= 3 {
					item["brand"] = fields[2]
				}
				// Buscar IP en los últimos campos
				for j := len(fields) - 1; j >= 0; j-- {
					if isValidIP(fields[j]) {
						item["ip"] = fields[j]
						break
					}
				}
				item["category"] = "switches"
				items = append(items, item)
			}
		case "ups_pdu":
			if (strings.HasPrefix(firstField, "UPS-") || strings.HasPrefix(firstField, "PDU-")) && len(fields) >= 2 {
				item["name"] = firstField
				if len(fields) >= 3 {
					item["model"] = fields[1] + " " + fields[2]
				}
				item["category"] = "ups_pdu"
				items = append(items, item)
			}
		case "patch_panels":
			if strings.HasPrefix(firstField, "PP-") && len(fields) >= 2 {
				item["name"] = firstField
				item["model"] = fields[1]
				item["category"] = "patch_panels"
				items = append(items, item)
			}
		case "nodos":
			if strings.HasPrefix(firstField, "N-") && len(fields) >= 2 {
				item["name"] = firstField
				// Buscar IP en los campos
				for _, field := range fields {
					if isValidIP(field) {
						item["ip"] = field
						break
					}
				}
				item["category"] = "nodos"
				items = append(items, item)
			}
		case "backbone":
			if strings.HasPrefix(firstField, "MDF-") && len(fields) >= 4 {
				item["name"] = firstField + " to " + fields[1]
				item["model"] = fields[2] + " " + fields[3] + " hilos"
				item["category"] = "backbone"
				items = append(items, item)
			}
		}
	}

	return items
}

func updateImportJobProgress(jobID int64, progress int, message string) {
	_, err := db.Exec(`
		UPDATE import_jobs
		SET progress = $1, message = $2, updated_at = NOW()
		WHERE id = $3
	`, progress, message, jobID)

	if err != nil {
		log.Printf("Error updating job progress: %v", err)
	}
}

func updateImportJobError(jobID int64, errorMsg string) {
	_, err := db.Exec(`
		UPDATE import_jobs
		SET status = 'error', progress = 0, message = $1, updated_at = NOW()
		WHERE id = $2
	`, errorMsg, jobID)

	if err != nil {
		log.Printf("Error updating job error: %v", err)
	}
}
