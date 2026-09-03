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
	"time"
)

// ==========================================
// Tipos para procesamiento de PDF con IA
// ==========================================

type ProcessPDFRequest struct {
	FileContent string `json:"file_content"` // Base64 encoded PDF content
	FileName    string `json:"file_name"`
	AssetType   string `json:"asset_type"` // switches, racks, etc.
}

type ProcessPDFResponse struct {
	Success       bool                   `json:"success"`
	Message       string                 `json:"message"`
	ExtractedData map[string]interface{} `json:"extracted_data,omitempty"`
	Error         string                 `json:"error,omitempty"`
}

type AIProcessingResult struct {
	AssetType       string                   `json:"asset_type"`
	TotalItems      int                      `json:"total_items"`
	ValidItems      int                      `json:"valid_items"`
	ItemsWithErrors int                      `json:"items_with_errors"`
	Warnings        []string                 `json:"warnings,omitempty"`
	ExtractedAssets []map[string]interface{} `json:"extracted_assets,omitempty"`
}

// ==========================================
// Handler para procesar PDF con IA
// ==========================================

func handleProcessPDFWithAI(w http.ResponseWriter, r *http.Request) {
	// Validar método
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Validar autenticación
	sessionToken := r.Header.Get("X-Session-Token")
	if sessionToken == "" {
		// Intentar obtener de cookie
		cookie, err := r.Cookie("session_token")
		if err != nil {
			http.Error(w, `{"success":false,"error":{"code":"UNAUTHORIZED","message":"No session cookie found"}}`, http.StatusUnauthorized)
			return
		}
		sessionToken = cookie.Value
	}

	// Obtener información de sesión
	userID, tenantID, branchID, email, err := getSessionInfo(sessionToken)
	if err != nil {
		http.Error(w, `{"success":false,"error":{"code":"UNAUTHORIZED","message":"Invalid session"}}`, http.StatusUnauthorized)
		return
	}

	// Parsear request
	var req ProcessPDFRequest
	err = json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, ProcessPDFResponse{
			Success: false,
			Error:   "Invalid request body",
		})
		return
	}

	// Validar campos requeridos
	if req.FileContent == "" || req.FileName == "" {
		respondJSON(w, http.StatusBadRequest, ProcessPDFResponse{
			Success: false,
			Error:   "file_content and file_name are required",
		})
		return
	}

	log.Printf("Processing PDF: %s for user %s (tenant: %s, branch: %s)", req.FileName, email, tenantID, branchID)

	// Procesar PDF con IA
	result, err := processPDFWithAI(req.FileContent, req.FileName, req.AssetType, tenantID, userID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, ProcessPDFResponse{
			Success: false,
			Error:   fmt.Sprintf("Error processing PDF: %v", err),
		})
		return
	}

	// Guardar resultado en BD
	importID, err := saveImportResult(tenantID, branchID, userID, req.FileName, req.AssetType, result)
	if err != nil {
		log.Printf("Error saving import result: %v", err)
		respondJSON(w, http.StatusInternalServerError, ProcessPDFResponse{
			Success: false,
			Error:   "Error saving import result",
		})
		return
	}

	// Responder exitosamente
	respondJSON(w, http.StatusOK, ProcessPDFResponse{
		Success: true,
		Message: fmt.Sprintf("PDF processed successfully. Import ID: %d", importID),
		ExtractedData: map[string]interface{}{
			"import_id":         importID,
			"asset_type":        result.AssetType,
			"total_items":       result.TotalItems,
			"valid_items":       result.ValidItems,
			"items_with_errors": result.ItemsWithErrors,
			"warnings":          result.Warnings,
		},
	})
}

// ==========================================
// Función para procesar PDF con IA
// ==========================================

func processPDFWithAI(fileContent, fileName, assetType, tenantID, userID string) (*AIProcessingResult, error) {
	result := &AIProcessingResult{
		AssetType:       assetType,
		TotalItems:      0,
		ValidItems:      0,
		ItemsWithErrors: 0,
		Warnings:        []string{},
		ExtractedAssets: []map[string]interface{}{},
	}

	// Crear prompt para IA
	prompt := buildPDFProcessingPrompt(fileName, assetType, fileContent)

	// Llamar a IA (OpenAI, Groq, etc.)
	aiResponse, err := callAIForPDFProcessing(prompt)
	if err != nil {
		return nil, fmt.Errorf("error calling AI: %w", err)
	}

	// Parsear respuesta de IA
	err = json.Unmarshal([]byte(aiResponse), result)
	if err != nil {
		// Si no es JSON válido, intentar extraer datos manualmente
		result.ValidItems = 1
		result.TotalItems = 1
		result.Warnings = append(result.Warnings, "Could not parse AI response as JSON")
		return result, nil
	}

	return result, nil
}

// ==========================================
// Función para construir prompt de IA
// ==========================================

func buildPDFProcessingPrompt(fileName, assetType, fileContent string) string {
	prompt := fmt.Sprintf(`
Eres un asistente especializado en extracción de datos de documentos técnicos de infraestructura.

Archivo: %s
Tipo de Activo: %s

Contenido del documento (primeros 1000 caracteres):
%s

Por favor, extrae los siguientes datos en formato JSON:
{
  "asset_type": "%s",
  "total_items": <número total de items encontrados>,
  "valid_items": <número de items válidos>,
  "items_with_errors": <número de items con errores>,
  "warnings": [<lista de advertencias>],
  "extracted_assets": [
    {
      "name": "<nombre del activo>",
      "model": "<modelo>",
      "serial": "<número de serie>",
      "location": "<ubicación>",
      "status": "<estado>"
    }
  ]
}

Responde SOLO con el JSON, sin explicaciones adicionales.
`, fileName, assetType, truncateString(fileContent, 1000), assetType)

	return prompt
}

// ==========================================
// Función para llamar a IA
// ==========================================

func callAIForPDFProcessing(prompt string) (string, error) {
	// Obtener modelo configurado (por defecto: gpt-4)
	model := os.Getenv("AI_MODEL")
	if model == "" {
		model = "gpt-4"
	}

	// Preparar request para OpenAI
	messages := []ChatMessage{
		{
			Role:    "system",
			Content: "You are a technical document extraction assistant. Extract data from infrastructure documents and return JSON.",
		},
		{
			Role:    "user",
			Content: prompt,
		},
	}

	openaiReq := OpenAIRequest{
		Model:     model,
		Messages:  messages,
		MaxTokens: 2000,
	}

	// Serializar request
	reqBody, err := json.Marshal(openaiReq)
	if err != nil {
		return "", fmt.Errorf("error marshaling request: %w", err)
	}

	// Llamar a OpenAI API
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("OPENAI_API_KEY not configured")
	}

	apiURL := os.Getenv("OPENAI_API_BASE")
	if apiURL == "" {
		apiURL = "https://api.openai.com/v1"
	}

	req, err := http.NewRequest("POST", apiURL+"/chat/completions", bytes.NewBuffer(reqBody))
	if err != nil {
		return "", fmt.Errorf("error creating request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("error calling OpenAI API: %w", err)
	}
	defer resp.Body.Close()

	// Leer respuesta
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("error reading response: %w", err)
	}

	// Parsear respuesta
	var openaiResp OpenAIResponse
	err = json.Unmarshal(respBody, &openaiResp)
	if err != nil {
		return "", fmt.Errorf("error parsing OpenAI response: %w", err)
	}

	// Verificar errores
	if openaiResp.Error != nil {
		return "", fmt.Errorf("OpenAI error: %s", openaiResp.Error.Message)
	}

	// Extraer contenido
	if len(openaiResp.Choices) == 0 {
		return "", fmt.Errorf("no choices in OpenAI response")
	}

	return openaiResp.Choices[0].Message.Content, nil
}

// ==========================================
// Función para guardar resultado en BD
// ==========================================

func saveImportResult(tenantID, branchID, userID, fileName, assetType string, result *AIProcessingResult) (int64, error) {
	summary, err := createAndStageCanonicalImport(context.Background(), db,
		CanonicalImportScope{TenantID: tenantID, BranchID: branchID, UserID: userID},
		fileName, assetType, "pdf", "ai", result.ExtractedAssets)
	if err != nil {
		return 0, fmt.Errorf("secure AI staging failed: %w", err)
	}
	// Report server-derived counts rather than trusting model-provided totals.
	result.TotalItems, result.ValidItems, result.ItemsWithErrors = summary.Total, summary.Valid, summary.Invalid
	return summary.ImportID, nil
}

// ==========================================
// Funciones auxiliares
// ==========================================

func truncateString(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen] + "..."
	}
	return s
}

func respondJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

// ==========================================
// Función para obtener información de sesión
// ==========================================

func getSessionInfo(sessionToken string) (string, string, string, string, error) {
	query := `
		SELECT s.user_id, s.tenant_id, s.branch_id, u.email
		FROM sessions s
		JOIN users u ON s.user_id = u.id
		WHERE s.token = $1 AND s.expires_at > $2
		LIMIT 1
	`

	var userID, tenantID, branchID, email string
	err := db.QueryRow(query, sessionToken, time.Now().Unix()).Scan(&userID, &tenantID, &branchID, &email)
	if err != nil {
		return "", "", "", "", err
	}

	return userID, tenantID, branchID, email, nil
}
