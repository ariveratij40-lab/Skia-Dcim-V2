package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// ==========================================
// Tipos para el chat IA
// ==========================================

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Messages []ChatMessage `json:"messages"`
	Model    string        `json:"model"` // "groq", "gpt", "ollama"
}

type OpenAIRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
	MaxTokens int          `json:"max_tokens,omitempty"`
}

type OpenAIResponse struct {
	Choices []struct {
		Message ChatMessage `json:"message"`
		Delta   struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// ==========================================
// Contexto dinámico del tenant
// ==========================================

type TenantContext struct {
	TenantName   string
	UserName     string
	TotalRacks   int
	TotalNodos   int
	TotalSwitches int
	TotalPP      int
	TotalUPS     int
	TotalMDF     int
	TotalIDF     int
	TotalActivos int
	TotalPlanos  int
	TicketsAbiertos int
	TicketsCriticos int
	NodosSinFluke   int
	NodosSinPanduit int
	RacksSinCapacidad int
}

func getTenantContext(tenantID string) TenantContext {
	ctx := TenantContext{}

	// Nombre del tenant
	db.QueryRow(`SELECT name FROM tenants WHERE id = $1`, tenantID).Scan(&ctx.TenantName)

	// Conteos de infraestructura
	tables := map[string]*int{
		`SELECT COUNT(*) FROM racks WHERE tenant_id = $1`:         &ctx.TotalRacks,
		`SELECT COUNT(*) FROM nodes WHERE tenant_id = $1`:         &ctx.TotalNodos,
		`SELECT COUNT(*) FROM switches WHERE tenant_id = $1`:      &ctx.TotalSwitches,
		`SELECT COUNT(*) FROM patch_panels WHERE tenant_id = $1`:  &ctx.TotalPP,
		`SELECT COUNT(*) FROM ups_pdus WHERE tenant_id = $1`:      &ctx.TotalUPS,
		`SELECT COUNT(*) FROM mdf_idf WHERE tenant_id = $1 AND type = 'MDF'`: &ctx.TotalMDF,
		`SELECT COUNT(*) FROM mdf_idf WHERE tenant_id = $1 AND type = 'IDF'`: &ctx.TotalIDF,
		`SELECT COUNT(*) FROM assets WHERE tenant_id = $1`:        &ctx.TotalActivos,
		`SELECT COUNT(*) FROM floor_plans WHERE tenant_id = $1`:   &ctx.TotalPlanos,
	}

	for query, dest := range tables {
		db.QueryRow(query, tenantID).Scan(dest)
	}

	// Tickets
	db.QueryRow(`SELECT COUNT(*) FROM tickets WHERE tenant_id = $1 AND status NOT IN ('cerrado','resuelto')`, tenantID).Scan(&ctx.TicketsAbiertos)
	db.QueryRow(`SELECT COUNT(*) FROM tickets WHERE tenant_id = $1 AND priority = 'critica' AND status NOT IN ('cerrado','resuelto')`, tenantID).Scan(&ctx.TicketsCriticos)

	// Normativa
	db.QueryRow(`SELECT COUNT(*) FROM nodes WHERE tenant_id = $1 AND (fluke_pdf IS NULL OR fluke_pdf = '')`, tenantID).Scan(&ctx.NodosSinFluke)
	db.QueryRow(`SELECT COUNT(*) FROM nodes WHERE tenant_id = $1 AND (panduit_pdf IS NULL OR panduit_pdf = '')`, tenantID).Scan(&ctx.NodosSinPanduit)

	return ctx
}

func buildSystemPrompt(ctx TenantContext, userName string) string {
	return fmt.Sprintf(`Eres SKIA AI, el asistente inteligente de SKIA DCIM — una plataforma de gestión de infraestructura de telecomunicaciones y redes.

Estás hablando con %s en la organización "%s".

ESTADO ACTUAL DE LA INFRAESTRUCTURA:
- Racks: %d | Nodos/Puntos de red: %d | Switches: %d | Patch Panels: %d
- UPS/PDUs: %d | MDF: %d | IDF: %d | Activos: %d | Planos: %d
- Tickets abiertos: %d (críticos: %d)
- Nodos sin Prueba Fluke: %d | Nodos sin Certificado Panduit: %d

CAPACIDADES:
- Puedes responder preguntas sobre el estado de la infraestructura usando los datos anteriores
- Puedes dar recomendaciones de mantenimiento, normativa TIA/ISO/ICREA y buenas prácticas
- Puedes ayudar a interpretar resultados de pruebas Fluke, categorías de cable y estándares
- Puedes sugerir acciones para mejorar la infraestructura
- Puedes explicar conceptos de cableado estructurado, DCIM, CCTV, control de acceso y voceo

INSTRUCCIONES:
- Responde siempre en español (México)
- Sé conciso pero completo. Usa listas cuando sea útil.
- Si el usuario pregunta por datos específicos que no tienes (ej: un rack en particular), indícalo claramente
- Cuando menciones problemas, siempre sugiere una acción concreta
- Usa emojis con moderación para hacer las respuestas más legibles
- Fecha y hora actual: %s`,
		userName,
		ctx.TenantName,
		ctx.TotalRacks, ctx.TotalNodos, ctx.TotalSwitches, ctx.TotalPP,
		ctx.TotalUPS, ctx.TotalMDF, ctx.TotalIDF, ctx.TotalActivos, ctx.TotalPlanos,
		ctx.TicketsAbiertos, ctx.TicketsCriticos,
		ctx.NodosSinFluke, ctx.NodosSinPanduit,
		time.Now().Format("02/01/2006 15:04"),
	)
}

// ==========================================
// Llamadas a LLMs
// ==========================================

func callGroq(messages []ChatMessage, stream bool, w http.ResponseWriter) (string, error) {
	apiKey := os.Getenv("GROQ_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("GROQ_API_KEY no configurada")
	}

	reqBody := OpenAIRequest{
		Model:     "llama-3.3-70b-versatile",
		Messages:  messages,
		Stream:    stream,
		MaxTokens: 1024,
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", "https://api.groq.com/openai/v1/chat/completions", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("error llamando Groq: %w", err)
	}
	defer resp.Body.Close()

	if stream && w != nil {
		return streamResponse(resp.Body, w)
	}

	var result OpenAIResponse
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Error != nil {
		return "", fmt.Errorf("Groq error: %s", result.Error.Message)
	}
	if len(result.Choices) > 0 {
		return result.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("respuesta vacía de Groq")
}

func callGPT(messages []ChatMessage, stream bool, w http.ResponseWriter) (string, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("OPENAI_API_KEY no configurada")
	}

	reqBody := OpenAIRequest{
		Model:     "gpt-4.1-mini",
		Messages:  messages,
		Stream:    stream,
		MaxTokens: 1024,
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("error llamando GPT: %w", err)
	}
	defer resp.Body.Close()

	if stream && w != nil {
		return streamResponse(resp.Body, w)
	}

	var result OpenAIResponse
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Error != nil {
		return "", fmt.Errorf("GPT error: %s", result.Error.Message)
	}
	if len(result.Choices) > 0 {
		return result.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("respuesta vacía de GPT")
}

func callOllama(messages []ChatMessage, stream bool, w http.ResponseWriter) (string, error) {
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://localhost:11434"
	}

	reqBody := OpenAIRequest{
		Model:    "llama3.1",
		Messages: messages,
		Stream:   stream,
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", ollamaURL+"/api/chat", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("error llamando Ollama: %w", err)
	}
	defer resp.Body.Close()

	if stream && w != nil {
		return streamResponse(resp.Body, w)
	}

	var result OpenAIResponse
	json.NewDecoder(resp.Body).Decode(&result)
	if len(result.Choices) > 0 {
		return result.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("respuesta vacía de Ollama")
}

// streamResponse envía SSE al cliente
func streamResponse(body io.Reader, w http.ResponseWriter) (string, error) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	var fullContent strings.Builder

	buf := make([]byte, 4096)
	for {
		n, err := body.Read(buf)
		if n > 0 {
			chunk := string(buf[:n])
			// Reenviar el chunk SSE al cliente
			fmt.Fprintf(w, "%s", chunk)
			if ok {
				flusher.Flush()
			}
			// Extraer contenido para el log
			for _, line := range strings.Split(chunk, "\n") {
				if strings.HasPrefix(line, "data: ") && line != "data: [DONE]" {
					var delta OpenAIResponse
					if jsonErr := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &delta); jsonErr == nil {
						if len(delta.Choices) > 0 {
							fullContent.WriteString(delta.Choices[0].Delta.Content)
						}
					}
				}
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
	}

	return fullContent.String(), nil
}

// ==========================================
// Handler principal /api/ai/chat
// ==========================================

func handleAIChat(w http.ResponseWriter, r *http.Request) {
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Autenticación
	sessionToken := extractSessionToken(r)
	if sessionToken == "" {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var userID, userName, tenantID string
	err := db.QueryRow(
		`SELECT u.id, u.name, s.tenant_id
		 FROM sessions s JOIN users u ON s.user_id = u.id
		 WHERE s.token = $1 AND s.expires_at > $2`,
		sessionToken, time.Now().Unix(),
	).Scan(&userID, &userName, &tenantID)

	if err != nil {
		http.Error(w, `{"error":"Invalid session"}`, http.StatusUnauthorized)
		return
	}

	// Parsear request
	var chatReq ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&chatReq); err != nil {
		http.Error(w, `{"error":"Invalid request"}`, http.StatusBadRequest)
		return
	}

	// Construir contexto del tenant
	tenantCtx := getTenantContext(tenantID)
	systemPrompt := buildSystemPrompt(tenantCtx, userName)

	// Prepend system message
	messages := append([]ChatMessage{
		{Role: "system", Content: systemPrompt},
	}, chatReq.Messages...)

	// Detectar si el cliente quiere streaming
	wantsStream := r.URL.Query().Get("stream") == "true"

	// Seleccionar modelo: groq (default) → gpt (fallback) → ollama
	model := chatReq.Model
	if model == "" {
		model = "groq"
	}

	var content string
	var callErr error

	switch model {
	case "groq":
		content, callErr = callGroq(messages, wantsStream, w)
		if callErr != nil {
			log.Printf("⚠️ Groq falló: %v — intentando GPT fallback", callErr)
			content, callErr = callGPT(messages, wantsStream, w)
		}
	case "gpt":
		content, callErr = callGPT(messages, wantsStream, w)
	case "ollama":
		content, callErr = callOllama(messages, wantsStream, w)
		if callErr != nil {
			log.Printf("⚠️ Ollama falló: %v — intentando GPT fallback", callErr)
			content, callErr = callGPT(messages, wantsStream, w)
		}
	default:
		content, callErr = callGroq(messages, wantsStream, w)
	}

	if callErr != nil {
		log.Printf("❌ Error en AI chat: %v", callErr)
		if !wantsStream {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "No se pudo obtener respuesta del asistente. Verifica la configuración de API Keys.",
			})
		}
		return
	}

	// Guardar en historial (opcional, no bloquea)
	go func() {
		if tenantID != "" && userID != "" && content != "" {
			db.Exec(
				`INSERT INTO ai_chat_history (tenant_id, user_id, user_message, assistant_message, model, created_at)
				 VALUES ($1, $2, $3, $4, $5, NOW())`,
				tenantID, userID,
				func() string {
					if len(chatReq.Messages) > 0 {
						return chatReq.Messages[len(chatReq.Messages)-1].Content
					}
					return ""
				}(),
				content, model,
			)
		}
	}()

	// Respuesta no-stream
	if !wantsStream {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"content": content,
			"model":   model,
		})
	}
}

// ==========================================
// Handler para obtener historial de chat
// ==========================================

func handleAIChatHistory(w http.ResponseWriter, r *http.Request) {
	sessionToken := extractSessionToken(r)
	if sessionToken == "" {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var userID, tenantID string
	err := db.QueryRow(
		`SELECT u.id, s.tenant_id FROM sessions s JOIN users u ON s.user_id = u.id
		 WHERE s.token = $1 AND s.expires_at > $2`,
		sessionToken, time.Now().Unix(),
	).Scan(&userID, &tenantID)
	if err != nil {
		http.Error(w, `{"error":"Invalid session"}`, http.StatusUnauthorized)
		return
	}

	rows, err := db.Query(
		`SELECT user_message, assistant_message, model, created_at
		 FROM ai_chat_history
		 WHERE tenant_id = $1 AND user_id = $2
		 ORDER BY created_at DESC LIMIT 50`,
		tenantID, userID,
	)
	if err != nil {
		// Tabla puede no existir aún — devolver vacío
		json.NewEncoder(w).Encode(map[string]interface{}{"history": []interface{}{}})
		return
	}
	defer rows.Close()

	type HistoryItem struct {
		UserMessage      string `json:"user_message"`
		AssistantMessage string `json:"assistant_message"`
		Model            string `json:"model"`
		CreatedAt        string `json:"created_at"`
	}

	var history []HistoryItem
	for rows.Next() {
		var item HistoryItem
		var createdAt time.Time
		rows.Scan(&item.UserMessage, &item.AssistantMessage, &item.Model, &createdAt)
		item.CreatedAt = createdAt.Format("02/01/2006 15:04")
		history = append(history, item)
	}

	if history == nil {
		history = []HistoryItem{}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"history": history})
}

// ==========================================
// Migración de tabla historial IA
// ==========================================

func migrateAIChatHistory(db *sql.DB) {
	db.Exec(`
		CREATE TABLE IF NOT EXISTS ai_chat_history (
			id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			tenant_id         UUID REFERENCES tenants(id) ON DELETE CASCADE,
			user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
			user_message      TEXT,
			assistant_message TEXT,
			model             VARCHAR(50),
			created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
}
