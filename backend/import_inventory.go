package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

// handleImportInventory maneja la importación de inventario desde PDF
func handleImportInventory(w http.ResponseWriter, r *http.Request) {
	log.Println("=== handleImportInventory iniciado ===")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verificar autenticación con contexto seguro
	sessionCtx, err := requireSessionContext(r.Context(), r, "inventory.import.create")
	if err != nil {
		log.Printf("ERROR: Session validation failed: %v", err)
		writeSessionError(w, err)
		return
	}

	log.Println("✓ Session validated")

	// Parsear el formulario multipart
	err = r.ParseMultipartForm(100 * 1024 * 1024)
	if err != nil {
		log.Printf("ERROR parsing form: %v", err)
		http.Error(w, "Error parsing form: "+err.Error(), http.StatusBadRequest)
		return
	}

	log.Println("✓ Form parsed")

	// Obtener el archivo PDF
	file, handler, err := r.FormFile("pdf")
	if err != nil {
		log.Printf("ERROR getting file: %v", err)
		http.Error(w, "Error getting file: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	log.Printf("✓ File received: %s", handler.Filename)

	// Obtener el tipo de activo
	assetType := r.FormValue("assetType")
	log.Printf("Asset type: %s", assetType)

	if assetType == "" {
		log.Println("ERROR: assetType is empty")
		http.Error(w, "assetType is required", http.StatusBadRequest)
		return
	}

	// Leer el contenido del PDF
	pdfContent, err := io.ReadAll(file)
	if err != nil {
		log.Printf("ERROR reading file: %v", err)
		http.Error(w, "Error reading file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("✓ PDF read: %d bytes", len(pdfContent))

	// Guardar el PDF temporalmente
	tmpDir := os.TempDir()
	tmpFile := filepath.Join(tmpDir, handler.Filename)
	err = os.WriteFile(tmpFile, pdfContent, 0644)
	if err != nil {
		log.Printf("ERROR saving temp file: %v", err)
		http.Error(w, "Error saving temp file: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer os.Remove(tmpFile)

	log.Printf("✓ Temp file saved: %s", tmpFile)

	// Extraer texto del PDF
	log.Println("→ Extracting text from PDF with pdfplumber...")
	extractedText, err := extractTextFromPDFWithPython(tmpFile)
	if err != nil {
		log.Printf("ERROR extracting text: %v", err)
		http.Error(w, "Error extracting text from PDF: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("✓ Text extracted: %d chars", len(extractedText))

	// Detectar tipo de documento
	log.Println("→ Detecting document type...")
	docType := detectDocumentType(extractedText)
	log.Printf("✓ Document type detected: %s", docType)

	// Intentar extracción determinista primero
	var extractedData *ExtractedData
	log.Println("→ Attempting deterministic extraction (BD2026 Model)...")
	extractedData, err = extractDeterministic(extractedText, assetType, docType)

	if err != nil || extractedData == nil || len(extractedData.Items) == 0 {
		log.Println("→ Deterministic extraction failed, falling back to LLM...")
		extractedData, err = processWithAI(extractedText, assetType, sessionCtx.TenantID)
		if err != nil {
			log.Printf("ERROR processing with LLM: %v", err)
			extractedData = &ExtractedData{
				Items: []map[string]interface{}{
					{
						"nombre":      "Activo importado del PDF",
						"descripcion": "Datos extraídos del documento",
						"estado":      "activo",
					},
				},
				Count:        1,
				Method:       "fallback",
				DocumentType: docType,
			}
		} else {
			extractedData.Method = "llm"
			extractedData.DocumentType = docType
		}
	} else {
		extractedData.Method = "deterministic"
		extractedData.DocumentType = docType
	}

	log.Printf("✓ Data extracted: %d items using %s method", len(extractedData.Items), extractedData.Method)

	// FASE 1: Limpiar y validar datos
	log.Println("→ Cleaning and validating data...")
	cleanedItems, stats := CleanAndValidateItemsSimple(extractedData.Items, assetType)
	log.Printf("✓ Data cleaned: %d/%d items valid", stats["valid_items"], stats["total_items"])

	// FASE 2: Guardar en base de datos
	log.Println("→ Saving to database...")
	importID, err := SaveImportToDB(
		sessionCtx.TenantID,
		sessionCtx.BranchID,
		sessionCtx.UserID,
		handler.Filename,
		assetType,
		docType,
		extractedData.Method,
		stats,
	)
	if err != nil {
		log.Printf("ERROR saving import: %v", err)
		http.Error(w, "Error saving import: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Guardar activos
	err = SaveAssetsToDB(importID, sessionCtx.TenantID, sessionCtx.BranchID, sessionCtx.UserID, assetType, cleanedItems)
	if err != nil {
		log.Printf("ERROR saving assets: %v", err)
		http.Error(w, "Error saving assets: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Guardar errores y advertencias
	if errors, ok := stats["errors"].([]string); ok && len(errors) > 0 {
		SaveErrorsToDB(importID, sessionCtx.TenantID, sessionCtx.BranchID, errors)
	}
	if warnings, ok := stats["warnings"].([]string); ok && len(warnings) > 0 {
		SaveWarningsToDB(importID, sessionCtx.TenantID, sessionCtx.BranchID, warnings)
	}

	log.Printf("✓ Import completed: ID=%d, Items=%d", importID, stats["valid_items"])

	// Responder con éxito
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":            true,
		"importId":           importID,
		"fileName":           handler.Filename,
		"assetType":          assetType,
		"method":             extractedData.Method,
		"documentType":       extractedData.DocumentType,
		"itemsImported":      stats["valid_items"],
		"totalItems":         stats["total_items"],
		"itemsWithErrors":    stats["items_with_errors"],
		"itemsWithWarnings":  stats["items_with_warnings"],
		"items":              cleanedItems[:min(10, len(cleanedItems))], // Primeros 10 items
	})
}

// handleImportStats obtiene estadísticas de importación
func handleImportStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionCtx, err := requireSessionContext(r.Context(), r, "inventory.import.stats")
	if err != nil {
		writeSessionError(w, err)
		return
	}

	stats, err := GetImportStatsToDB(r.Context(), sessionCtx.TenantID, sessionCtx.BranchID)
	if err != nil {
		log.Printf("ERROR getting stats: %v", err)
		http.Error(w, "Error getting stats: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// handleRecentImports obtiene importaciones recientes
func handleRecentImports(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionCtx, err := requireSessionContext(r.Context(), r, "inventory.import.read")
	if err != nil {
		writeSessionError(w, err)
		return
	}

	imports, err := GetRecentImportsToDB(r.Context(), sessionCtx.TenantID, sessionCtx.BranchID, 10)
	if err != nil {
		log.Printf("ERROR getting imports: %v", err)
		http.Error(w, "Error getting imports: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"imports": imports,
	})
}

// extractTextFromPDFWithPython extrae texto del PDF
func extractTextFromPDFWithPython(pdfPath string) (string, error) {
	log.Println("→ Running Python pdfplumber extraction...")

	pythonScript := `
import pdfplumber
import sys

try:
    with pdfplumber.open(sys.argv[1]) as pdf:
        full_text = ""
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                full_text += f"\\n--- PAGE {i+1} ---\\n{text}"
        print(full_text)
except Exception as e:
    print(f"ERROR: {str(e)}", file=sys.stderr)
    sys.exit(1)
`

	cmd := exec.Command("python3", "-c", pythonScript, pdfPath)
	var out bytes.Buffer
	var errOut bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errOut

	err := cmd.Run()
	if err != nil {
		log.Printf("ERROR running Python: %v", err)
		return "", fmt.Errorf("error extracting PDF: %v - %s", err, errOut.String())
	}

	extractedText := out.String()
	log.Printf("✓ Python extraction successful: %d chars", len(extractedText))
	return extractedText, nil
}

// detectDocumentType detecta el tipo de documento
func detectDocumentType(text string) string {
	text = strings.ToLower(text)

	if strings.Contains(text, "memoria técnica") || strings.Contains(text, "memoria tecnica") {
		return "technical_memo"
	}
	if strings.Contains(text, "inventario") {
		return "inventory_list"
	}
	if strings.Contains(text, "rack") && strings.Contains(text, "switch") {
		return "infrastructure_doc"
	}
	if strings.Contains(text, "mdf") || strings.Contains(text, "idf") {
		return "network_topology"
	}
	if strings.Contains(text, "activo") || strings.Contains(text, "equipo") {
		return "asset_list"
	}

	return "generic_document"
}

// extractDeterministic extrae datos usando el Modelo BD2026
func extractDeterministic(text, assetType, docType string) (*ExtractedData, error) {
	log.Printf("→ Using BD2026 deterministic model for %s", docType)

	var items []map[string]interface{}

	switch docType {
	case "technical_memo", "infrastructure_doc", "network_topology":
		items = extractFromTechnicalMemo(text, assetType)
	case "inventory_list", "asset_list":
		items = extractFromInventoryList(text, assetType)
	default:
		items = extractFromGenericDocument(text, assetType)
	}

	if len(items) == 0 {
		return nil, fmt.Errorf("no items extracted using deterministic model")
	}

	return &ExtractedData{
		Items: items,
		Count: len(items),
	}, nil
}

// extractFromTechnicalMemo extrae datos de memorias técnicas
func extractFromTechnicalMemo(text, assetType string) []map[string]interface{} {
	var items []map[string]interface{}

	lines := strings.Split(text, "\n")

	var inTable bool
	var headers []string

	for i, line := range lines {
		line = strings.TrimSpace(line)

		if strings.Contains(line, "ID") || strings.Contains(line, "Nombre") || strings.Contains(line, "Equipo") {
			inTable = true
			headers = parseHeaders(line)
			log.Printf("→ Found table headers: %v", headers)
			continue
		}

		if inTable && line != "" && !strings.HasPrefix(line, "---") {
			if strings.HasPrefix(line, "---") || (i > 0 && strings.HasPrefix(lines[i-1], "---")) {
				inTable = false
				continue
			}

			item := parseTableRow(line, headers, assetType)
			if len(item) > 0 {
				items = append(items, item)
			}
		}
	}

	if len(items) == 0 {
		items = extractEquipmentPatterns(text, assetType)
	}

	return items
}

// extractFromInventoryList extrae datos de listas
func extractFromInventoryList(text, assetType string) []map[string]interface{} {
	var items []map[string]interface{}

	lines := strings.Split(text, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || len(line) < 3 {
			continue
		}

		item := map[string]interface{}{
			"nombre":      line,
			"descripcion": "Importado del inventario",
			"estado":      "activo",
		}

		if strings.Contains(line, "-") {
			parts := strings.Split(line, "-")
			if len(parts) >= 2 {
				item["nombre"] = strings.TrimSpace(parts[0])
				item["descripcion"] = strings.TrimSpace(parts[1])
			}
		}

		items = append(items, item)

		if len(items) >= 100 {
			break
		}
	}

	return items
}

// extractFromGenericDocument extrae datos de documentos genéricos
func extractFromGenericDocument(text, assetType string) []map[string]interface{} {
	return extractEquipmentPatterns(text, assetType)
}

// extractEquipmentPatterns busca patrones de equipos
func extractEquipmentPatterns(text, assetType string) []map[string]interface{} {
	var items []map[string]interface{}

	patterns := map[string]*regexp.Regexp{
		"activos":       regexp.MustCompile(`(?i)(equipo|activo|dispositivo|aparato)[\s:]+([A-Za-z0-9\-_]+)`),
		"racks":         regexp.MustCompile(`(?i)(rack|gabinete)[\s:]+([A-Za-z0-9\-_]+)`),
		"switches":      regexp.MustCompile(`(?i)(switch|conmutador)[\s:]+([A-Za-z0-9\-_]+)`),
		"ups_pdu":       regexp.MustCompile(`(?i)(ups|pdu)[\s:]+([A-Za-z0-9\-_]+)`),
		"patch_panels":  regexp.MustCompile(`(?i)(patch panel|panel)[\s:]+([A-Za-z0-9\-_]+)`),
		"backbone":      regexp.MustCompile(`(?i)(backbone|fibra)[\s:]+([A-Za-z0-9\-_]+)`),
		"nodos":         regexp.MustCompile(`(?i)(nodo|node)[\s:]+([A-Za-z0-9\-_]+)`),
	}

	pattern, ok := patterns[assetType]
	if !ok {
		pattern = patterns["activos"]
	}

	matches := pattern.FindAllStringSubmatch(text, -1)
	for _, match := range matches {
		if len(match) >= 3 {
			item := map[string]interface{}{
				"nombre":      match[2],
				"tipo":        match[1],
				"descripcion": "Detectado automáticamente",
				"estado":      "activo",
			}
			items = append(items, item)

			if len(items) >= 100 {
				break
			}
		}
	}

	return items
}

// parseHeaders parsea encabezados de tabla
func parseHeaders(headerLine string) []string {
	var headers []string
	if strings.Contains(headerLine, "|") {
		headers = strings.Split(headerLine, "|")
	} else {
		headers = strings.Fields(headerLine)
	}

	for i, h := range headers {
		headers[i] = strings.TrimSpace(strings.ToLower(h))
	}

	return headers
}

// parseTableRow parsea una fila de tabla
func parseTableRow(line string, headers []string, assetType string) map[string]interface{} {
	var values []string

	if strings.Contains(line, "|") {
		values = strings.Split(line, "|")
	} else {
		values = strings.Fields(line)
	}

	item := make(map[string]interface{})

	for i, header := range headers {
		if i < len(values) {
			value := strings.TrimSpace(values[i])
			if value != "" {
				item[header] = value
			}
		}
	}

	if _, ok := item["estado"]; !ok {
		item["estado"] = "activo"
	}

	return item
}

// processWithAI procesa con IA
func processWithAI(extractedText, assetType string, tenantID string) (*ExtractedData, error) {
	groqAPIKey := os.Getenv("GROQ_API_KEY")
	if groqAPIKey == "" {
		return nil, fmt.Errorf("GROQ_API_KEY not set")
	}

	log.Println("✓ GROQ_API_KEY found")

	prompt := buildPromptForAssetType(assetType, extractedText)

	groqRequest := map[string]interface{}{
		"model": "llama-3.3-70b-versatile",
		"messages": []map[string]interface{}{
			{
				"role":    "user",
				"content": prompt,
			},
		},
		"max_tokens": 4096,
	}

	jsonData, _ := json.Marshal(groqRequest)
	req, _ := http.NewRequest("POST", "https://api.groq.com/openai/v1/chat/completions", bytes.NewBuffer(jsonData))
	req.Header.Set("Authorization", "Bearer "+groqAPIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error calling Groq API: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Groq API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("error decoding Groq response: %v", err)
	}

	log.Println("✓ Groq response decoded")

	if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if message, ok := choice["message"].(map[string]interface{}); ok {
				if content, ok := message["content"].(string); ok {
					var extractedData ExtractedData
					err := json.Unmarshal([]byte(content), &extractedData)
					if err == nil && len(extractedData.Items) > 0 {
						return &extractedData, nil
					}

					jsonStr := extractJSONFromText(content)
					if jsonStr != "" {
						err := json.Unmarshal([]byte(jsonStr), &extractedData)
						if err == nil && len(extractedData.Items) > 0 {
							return &extractedData, nil
						}
					}
				}
			}
		}
	}

	return nil, fmt.Errorf("failed to process data with AI")
}

// extractJSONFromText extrae JSON del texto
func extractJSONFromText(content string) string {
	startIdx := strings.Index(content, "{")
	endIdx := strings.LastIndex(content, "}")

	if startIdx != -1 && endIdx != -1 && endIdx > startIdx {
		jsonStr := content[startIdx : endIdx+1]
		var test interface{}
		if err := json.Unmarshal([]byte(jsonStr), &test); err == nil {
			return jsonStr
		}
	}

	startIdx = strings.Index(content, "[")
	endIdx = strings.LastIndex(content, "]")

	if startIdx != -1 && endIdx != -1 && endIdx > startIdx {
		jsonStr := content[startIdx : endIdx+1]
		var test interface{}
		if err := json.Unmarshal([]byte(jsonStr), &test); err == nil {
			return jsonStr
		}
	}

	return ""
}

// buildPromptForAssetType construye el prompt
func buildPromptForAssetType(assetType, text string) string {
	basePrompt := `Analiza el siguiente texto y extrae TODOS los elementos mencionados.
Devuelve SOLO un JSON válido con la estructura: {"items": [...], "count": N}
NO incluyas explicaciones, solo el JSON válido.`

	return basePrompt + "\n\nTexto a procesar:\n" + text
}

// ExtractedData estructura para datos extraídos
type ExtractedData struct {
	Items        []map[string]interface{} `json:"items"`
	Count        int                      `json:"count"`
	Method       string                   `json:"method"`
	DocumentType string                   `json:"documentType"`
}

// min retorna el mínimo
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
