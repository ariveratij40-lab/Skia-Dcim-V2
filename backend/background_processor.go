package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ============================================================
// PROCESAMIENTO EN BACKGROUND CON WEBSOCKETS
// ============================================================

type ProcessingJob struct {
	JobID       string
	ImportID    int64
	Status      string // pending, processing, completed, failed
	Progress    int    // 0-100
	CurrentStep int
	TotalSteps  int
	Message     string
	StartedAt   time.Time
	CompletedAt time.Time
	Error       string
}

type ProcessingManager struct {
	jobs    map[string]*ProcessingJob
	clients map[string]map[*websocket.Conn]bool
	mu      sync.RWMutex
}

var (
	processingManager = &ProcessingManager{
		jobs:    make(map[string]*ProcessingJob),
		clients: make(map[string]map[*websocket.Conn]bool),
	}
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
)

// ============================================================
// CREAR NUEVO JOB
// ============================================================

func CreateProcessingJob(importID int64) string {
	jobID := fmt.Sprintf("job_%d_%d", importID, time.Now().UnixNano())

	job := &ProcessingJob{
		JobID:      jobID,
		ImportID:   importID,
		Status:     "pending",
		Progress:   0,
		CurrentStep: 1,
		TotalSteps: 10,
		StartedAt:  time.Now(),
	}

	processingManager.mu.Lock()
	processingManager.jobs[jobID] = job
	processingManager.clients[jobID] = make(map[*websocket.Conn]bool)
	processingManager.mu.Unlock()

	log.Printf("Created processing job: %s for import %d", jobID, importID)
	return jobID
}

// ============================================================
// ACTUALIZAR PROGRESO DEL JOB
// ============================================================

func UpdateJobProgress(jobID string, currentStep int, progress int, message string) {
	processingManager.mu.Lock()
	job, exists := processingManager.jobs[jobID]
	processingManager.mu.Unlock()

	if !exists {
		log.Printf("Job not found: %s", jobID)
		return
	}

	job.CurrentStep = currentStep
	job.Progress = progress
	job.Message = message

	// Notificar a todos los clientes conectados
	BroadcastJobUpdate(jobID, job)
}

// ============================================================
// COMPLETAR JOB
// ============================================================

func CompleteJob(jobID string) {
	processingManager.mu.Lock()
	job, exists := processingManager.jobs[jobID]
	processingManager.mu.Unlock()

	if !exists {
		return
	}

	job.Status = "completed"
	job.Progress = 100
	job.CompletedAt = time.Now()

	BroadcastJobUpdate(jobID, job)
	log.Printf("Job completed: %s", jobID)
}

// ============================================================
// FALLAR JOB
// ============================================================

func FailJob(jobID string, errorMsg string) {
	processingManager.mu.Lock()
	job, exists := processingManager.jobs[jobID]
	processingManager.mu.Unlock()

	if !exists {
		return
	}

	job.Status = "failed"
	job.Error = errorMsg
	job.CompletedAt = time.Now()

	BroadcastJobUpdate(jobID, job)
	log.Printf("Job failed: %s - %s", jobID, errorMsg)
}

// ============================================================
// WEBSOCKET: CONECTAR A JOB
// ============================================================

func HandleJobWebSocket(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Query().Get("job_id")
	if jobID == "" {
		http.Error(w, "Missing job_id", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	// Registrar cliente
	processingManager.mu.Lock()
	if _, exists := processingManager.clients[jobID]; !exists {
		processingManager.clients[jobID] = make(map[*websocket.Conn]bool)
	}
	processingManager.clients[jobID][conn] = true
	processingManager.mu.Unlock()

	// Enviar estado actual del job
	processingManager.mu.RLock()
	job, exists := processingManager.jobs[jobID]
	processingManager.mu.RUnlock()

	if exists {
		jobJSON, _ := json.Marshal(job)
		conn.WriteMessage(websocket.TextMessage, jobJSON)
	}

	// Escuchar mensajes (para mantener conexión abierta)
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}

		// Procesar comandos del cliente
		var cmd map[string]interface{}
		json.Unmarshal(message, &cmd)

		if cmd["action"] == "cancel" {
			FailJob(jobID, "Cancelled by user")
			break
		}
	}

	// Desregistrar cliente
	processingManager.mu.Lock()
	delete(processingManager.clients[jobID], conn)
	processingManager.mu.Unlock()
}

// ============================================================
// BROADCAST: NOTIFICAR A TODOS LOS CLIENTES
// ============================================================

func BroadcastJobUpdate(jobID string, job *ProcessingJob) {
	processingManager.mu.RLock()
	clients, exists := processingManager.clients[jobID]
	processingManager.mu.RUnlock()

	if !exists {
		return
	}

	jobJSON, _ := json.Marshal(job)

	processingManager.mu.Lock()
	for client := range clients {
		client.WriteMessage(websocket.TextMessage, jobJSON)
	}
	processingManager.mu.Unlock()
}

// ============================================================
// MODO SIMULACIÓN
// ============================================================

func ProcessImportWithSimulation(db *sql.DB, importID int64, simulate bool) error {
	jobID := CreateProcessingJob(importID)

	// Paso 1: Subida
	UpdateJobProgress(jobID, 1, 10, "Archivo subido")
	time.Sleep(1 * time.Second)

	// Paso 2: Extracción
	UpdateJobProgress(jobID, 2, 20, "Extrayendo datos...")
	time.Sleep(2 * time.Second)

	// Paso 3: Normalización
	UpdateJobProgress(jobID, 3, 30, "Normalizando datos...")
	time.Sleep(1 * time.Second)

	// Paso 4: Validación
	UpdateJobProgress(jobID, 4, 40, "Validando campos...")
	time.Sleep(2 * time.Second)

	// Paso 5: Duplicados
	UpdateJobProgress(jobID, 5, 50, "Detectando duplicados...")
	time.Sleep(1 * time.Second)

	// Paso 6: Vista previa
	UpdateJobProgress(jobID, 6, 60, "Generando vista previa...")
	time.Sleep(1 * time.Second)

	if simulate {
		// Modo simulación: no guardar
		UpdateJobProgress(jobID, 7, 80, "Simulación completada - no se guardaron datos")
		time.Sleep(1 * time.Second)

		CompleteJob(jobID)
		return nil
	}

	// Paso 7: Correcciones
	UpdateJobProgress(jobID, 7, 70, "Aplicando correcciones...")
	time.Sleep(1 * time.Second)

	// Paso 8: Aprobación
	UpdateJobProgress(jobID, 8, 80, "Aprobando importación...")
	time.Sleep(1 * time.Second)

	// Paso 9: Guardado
	UpdateJobProgress(jobID, 9, 90, "Guardando datos definitivamente...")
	time.Sleep(2 * time.Second)

	// Paso 10: Reportes
	UpdateJobProgress(jobID, 10, 95, "Generando reportes...")
	time.Sleep(1 * time.Second)

	CompleteJob(jobID)
	return nil
}

// ============================================================
// PROCESAMIENTO ASINCRÓNICO
// ============================================================

func ProcessImportAsync(db *sql.DB, importID int64, tenantID string, branchID string, assetType string) {
	go func() {
		jobID := CreateProcessingJob(importID)

		// Obtener filas a procesar
		query := `
			SELECT id, normalized_data
			FROM inventory_import_rows
			WHERE import_id = $1 AND status IN ('correct', 'warning', 'corrected')
		`

		rows, err := db.Query(query, importID)
		if err != nil {
			FailJob(jobID, fmt.Sprintf("Database error: %v", err))
			return
		}
		defer rows.Close()

		var totalRows int
		var processedRows int

		for rows.Next() {
			var rowID int64
			var normalizedDataStr string

			rows.Scan(&rowID, &normalizedDataStr)
			totalRows++

			var assetData map[string]interface{}
			json.Unmarshal([]byte(normalizedDataStr), &assetData)

			// UPSERT
			_, err := UpsertAsset(db, tenantID, branchID, assetType, assetData)
			if err != nil {
				log.Printf("Error upserting asset: %v", err)
				continue
			}

			processedRows++

			// Actualizar progreso
			progress := (processedRows * 100) / (totalRows + 1)
			UpdateJobProgress(jobID, 9, progress, fmt.Sprintf("Guardando activos: %d/%d", processedRows, totalRows))
		}

		// Generar reportes
		UpdateJobProgress(jobID, 10, 95, "Generando reportes...")
		GenerateAllReports(db, importID, "/tmp/reports")

		CompleteJob(jobID)
	}()
}

// ============================================================
// API: OBTENER ESTADO DEL JOB
// ============================================================

func HandleGetJobStatus(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Query().Get("job_id")
	if jobID == "" {
		http.Error(w, "Missing job_id", http.StatusBadRequest)
		return
	}

	processingManager.mu.RLock()
	job, exists := processingManager.jobs[jobID]
	processingManager.mu.RUnlock()

	if !exists {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

// ============================================================
// API: LISTAR JOBS ACTIVOS
// ============================================================

func HandleListActiveJobs(w http.ResponseWriter, r *http.Request) {
	processingManager.mu.RLock()
	defer processingManager.mu.RUnlock()

	var activeJobs []*ProcessingJob
	for _, job := range processingManager.jobs {
		if job.Status == "processing" || job.Status == "pending" {
			activeJobs = append(activeJobs, job)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(activeJobs)
}

// ============================================================
// API: CANCELAR JOB
// ============================================================

func HandleCancelJob(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Query().Get("job_id")
	if jobID == "" {
		http.Error(w, "Missing job_id", http.StatusBadRequest)
		return
	}

	FailJob(jobID, "Cancelled by user")

	response := map[string]interface{}{
		"status": "cancelled",
		"job_id": jobID,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ============================================================
// LIMPIAR JOBS ANTIGUOS
// ============================================================

func CleanupOldJobs() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		processingManager.mu.Lock()

		now := time.Now()
		for jobID, job := range processingManager.jobs {
			// Eliminar jobs completados hace más de 24 horas
			if (job.Status == "completed" || job.Status == "failed") &&
				now.Sub(job.CompletedAt) > 24*time.Hour {
				delete(processingManager.jobs, jobID)
				delete(processingManager.clients, jobID)
				log.Printf("Cleaned up old job: %s", jobID)
			}
		}

		processingManager.mu.Unlock()
	}
}

// ============================================================
// INICIALIZAR BACKGROUND PROCESSOR
// ============================================================

func InitBackgroundProcessor() {
	go CleanupOldJobs()
	log.Println("Background processor initialized")
}
