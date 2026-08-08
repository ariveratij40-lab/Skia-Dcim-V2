package main

import (
	"bytes"
	"context"
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
	Model     string        `json:"model"`
	Messages  []ChatMessage `json:"messages"`
	Stream    bool          `json:"stream"`
	MaxTokens int           `json:"max_tokens,omitempty"`
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
	TenantName        string
	UserName          string
	TotalRacks        int
	TotalNodos        int
	TotalSwitches     int
	TotalPP           int
	TotalUPS          int
	TotalMDF          int
	TotalIDF          int
	TotalActivos      int
	TotalPlanos       int
	TicketsAbiertos   int
	TicketsCriticos   int
	NodosSinFluke     int
	NodosSinPanduit   int
	RacksSinCapacidad int
}

// getTenantContext arma el resumen que se le da al asistente de IA.
//
// Alcance de `assets` (C-6, ronda 2026-08-07 -- decisión explícita del
// usuario): a diferencia de las otras 8 métricas de esta función, que son
// tenant-wide porque sus tablas no tienen RLS (racks/switches/nodos/
// patch_panels/ups_pdus/mdf_idf/floor_plans -- limitación temporal
// documentada, no una decisión de que "deban" ser tenant-wide para
// siempre), `assets` SÍ tiene política RLS branch-aware
// (migrations/015_assets_rls.sql, ampliada en 016). El conteo de activos
// debe seguir el alcance real de la transacción de quien pregunta:
//   - usuario de sucursal: cuenta solo su sucursal (RLS lo filtra solo).
//   - admin/gestor con app.branch_scope_all='true' (ver
//     RequireTenantTxScoped/role_scope.go): cuenta todo el tenant.
//   - sin contexto de tenant válido: cero, nunca "todo el tenant" por
//     omisión.
//
// Por eso esta consulta específica va por `tdb` (la transacción con
// contexto de tenant que abrió el middleware), NO por `db` crudo -- si en
// algún momento se reactiva RLS sobre `assets`, este número queda
// automáticamente correcto sin tocar este archivo de nuevo. Las otras 8
// consultas siguen en `tdb` también (mismo *sql.Tx, no hay motivo para
// mezclar conexiones), pero su resultado no cambiaría aunque fueran por
// `db` porque esas tablas no tienen RLS hoy.
func getTenantContext(ctx context.Context, tdb TenantDB, tenantID string) TenantContext {
	tc := TenantContext{}

	// Nombre del tenant
	tdb.QueryRowContext(ctx, `SELECT name FROM tenants WHERE id = $1`, tenantID).Scan(&tc.TenantName)

	// Conteos de infraestructura sin RLS (tenant-wide hoy, limitación
	// documentada -- ver comentario de la función).
	tables := map[string]*int{
		`SELECT COUNT(*) FROM racks WHERE tenant_id = $1`:                    &tc.TotalRacks,
		`SELECT COUNT(*) FROM nodes WHERE tenant_id = $1`:                    &tc.TotalNodos,
		`SELECT COUNT(*) FROM switches WHERE tenant_id = $1`:                 &tc.TotalSwitches,
		`SELECT COUNT(*) FROM patch_panels WHERE tenant_id = $1`:             &tc.TotalPP,
		`SELECT COUNT(*) FROM ups_pdus WHERE tenant_id = $1`:                 &tc.TotalUPS,
		`SELECT COUNT(*) FROM mdf_idf WHERE tenant_id = $1 AND type = 'MDF'`: &tc.TotalMDF,
		`SELECT COUNT(*) FROM mdf_idf WHERE tenant_id = $1 AND type = 'IDF'`: &tc.TotalIDF,
		`SELECT COUNT(*) FROM floor_plans WHERE tenant_id = $1`:              &tc.TotalPlanos,
	}
	for query, dest := range tables {
		tdb.QueryRowContext(ctx, query, tenantID).Scan(dest)
	}

	// assets: branch-aware vía RLS -- ver comentario de la función.
	tdb.QueryRowContext(ctx, `SELECT COUNT(*) FROM assets WHERE tenant_id = $1`, tenantID).Scan(&tc.TotalActivos)

	// Tickets
	tdb.QueryRowContext(ctx, `SELECT COUNT(*) FROM tickets WHERE tenant_id = $1 AND status NOT IN ('cerrado','resuelto')`, tenantID).Scan(&tc.TicketsAbiertos)
	tdb.QueryRowContext(ctx, `SELECT COUNT(*) FROM tickets WHERE tenant_id = $1 AND priority = 'critica' AND status NOT IN ('cerrado','resuelto')`, tenantID).Scan(&tc.TicketsCriticos)

	// Normativa
	tdb.QueryRowContext(ctx, `SELECT COUNT(*) FROM nodes WHERE tenant_id = $1 AND (fluke_pdf IS NULL OR fluke_pdf = '')`, tenantID).Scan(&tc.NodosSinFluke)
	tdb.QueryRowContext(ctx, `SELECT COUNT(*) FROM nodes WHERE tenant_id = $1 AND (panduit_pdf IS NULL OR panduit_pdf = '')`, tenantID).Scan(&tc.NodosSinPanduit)

	return tc
}

// resolveAssetScopeLabel describe, en lenguaje natural, el alcance real
// bajo el que se contaron los activos -- para que el propio asistente se
// lo diga al usuario (decisión explícita del usuario, C-6 2026-08-07:
// "la respuesta debería incluir el alcance utilizado"). No es una cadena
// libre construida a partir de datos de sesión sin validar: branchID y
// scopeAll ya vienen de TenantIdentityFromContext/TenantScopeFromContext,
// es decir, ya pasaron por ExtractSessionContextSecure + resolveUserRole.
func resolveAssetScopeLabel(ctx context.Context, tdb TenantDB, branchID string, scopeAll bool) string {
	if scopeAll {
		return "tenant completo"
	}
	if branchID == "" {
		return "sin sucursal asignada"
	}
	var name string
	if err := tdb.QueryRowContext(ctx, `SELECT name FROM branches WHERE id = $1`, branchID).Scan(&name); err != nil || name == "" {
		return "sucursal no identificada"
	}
	return "sucursal " + name
}

// scopeLabel describe bajo qué alcance se contaron los activos (ver
// resolveAssetScopeLabel) -- decisión explícita del usuario (C-6,
// 2026-08-07): el asistente debe declarar el alcance, no solo el número,
// justamente porque el resto de las métricas de este prompt SON
// tenant-wide (limitación temporal, no garantía de alcance) y los activos
// pueden no serlo.
func buildSystemPrompt(ctx TenantContext, userName string, scopeLabel string) string {
	return fmt.Sprintf(`Eres SKIA AI, el asistente inteligente de SKIA DCIM — una plataforma de gestión de infraestructura de telecomunicaciones y redes.

Estás hablando con %s en la organización "%s".

ESTADO ACTUAL DE LA INFRAESTRUCTURA:
- Racks: %d | Nodos/Puntos de red: %d | Switches: %d | Patch Panels: %d
- UPS/PDUs: %d | MDF: %d | IDF: %d | Planos: %d
- Activos: %d (alcance: %s)
- Tickets abiertos: %d (críticos: %d)
- Nodos sin Prueba Fluke: %d | Nodos sin Certificado Panduit: %d

NOTA SOBRE ALCANCE DE DATOS:
- El conteo de "Activos" refleja el alcance indicado arriba (una sucursal específica, o el tenant completo si quien pregunta tiene permiso de alcance global). Si el alcance es una sucursal, acláralo si el usuario pregunta por el total de la organización.
- El resto de las métricas (racks, nodos, switches, etc.) son del tenant completo independientemente del alcance de activos.

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
		ctx.TotalUPS, ctx.TotalMDF, ctx.TotalIDF, ctx.TotalPlanos,
		ctx.TotalActivos, scopeLabel,
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

// handleAIChat se registra en main.go envuelto en RequireTenantTxScoped
// (no RequireTenantTx): necesita saber si el usuario tiene
// app.branch_scope_all='true' para poder decirle al asistente -- y al
// propio usuario, en la respuesta -- bajo qué alcance está contando
// activos (ver getTenantContext/resolveAssetScopeLabel). Antes de esta
// migración (C-6, ronda 2026-08-07) este handler resolvía la sesión por
// su cuenta con una consulta ad hoc a `sessions`/`users`, divergente de
// ExtractSessionContextSecure -- el mismo patrón de riesgo que ya se
// corrigió en dcim_assets.go.
func handleAIChat(w http.ResponseWriter, r *http.Request) {
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tdb, ok := TenantDBFromContext(r.Context())
	if !ok {
		log.Printf("handleAIChat: falta contexto de tenant -- ¿se registró sin RequireTenantTxScoped?")
		jsonErr(w, "Internal error", http.StatusInternalServerError)
		return
	}
	userID, tenantID, branchID, ok := TenantIdentityFromContext(r.Context())
	if !ok {
		log.Printf("handleAIChat: falta identidad de tenant -- ¿se registró sin RequireTenantTxScoped?")
		jsonErr(w, "Internal error", http.StatusInternalServerError)
		return
	}
	scopeAll, _ := TenantScopeFromContext(r.Context()) // ok=false → false, nunca alcance global por defecto

	var userName string
	if err := tdb.QueryRowContext(r.Context(), `SELECT name FROM users WHERE id = $1`, userID).Scan(&userName); err != nil {
		log.Printf("handleAIChat: no se pudo resolver nombre de usuario %s: %v", userID, err)
	}

	// Parsear request
	var chatReq ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&chatReq); err != nil {
		http.Error(w, `{"error":"Invalid request"}`, http.StatusBadRequest)
		return
	}

	// Construir contexto del tenant (assets respeta el alcance real de la
	// sesión -- ver getTenantContext)
	tenantCtx := getTenantContext(r.Context(), tdb, tenantID)
	scopeLabel := resolveAssetScopeLabel(r.Context(), tdb, branchID, scopeAll)
	systemPrompt := buildSystemPrompt(tenantCtx, userName, scopeLabel)

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
			"content":     content,
			"model":       model,
			"asset_scope": scopeLabel,
		})
	}
}

// ==========================================
// Handler para obtener historial de chat
// ==========================================

// handleAIChatHistory se registra en main.go envuelto en RequireTenantTx
// (no necesita Scoped -- ai_chat_history no tiene RLS ni concepto de
// sucursal; migrado igual para no mantener una segunda resolución de
// sesión ad hoc divergente de ExtractSessionContextSecure en el mismo
// archivo que handleAIChat).
func handleAIChatHistory(w http.ResponseWriter, r *http.Request) {
	tdb, ok := TenantDBFromContext(r.Context())
	if !ok {
		log.Printf("handleAIChatHistory: falta contexto de tenant -- ¿se registró sin RequireTenantTx?")
		jsonErr(w, "Internal error", http.StatusInternalServerError)
		return
	}
	userID, tenantID, _, ok := TenantIdentityFromContext(r.Context())
	if !ok {
		log.Printf("handleAIChatHistory: falta identidad de tenant -- ¿se registró sin RequireTenantTx?")
		jsonErr(w, "Internal error", http.StatusInternalServerError)
		return
	}

	rows, err := tdb.QueryContext(r.Context(),
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
