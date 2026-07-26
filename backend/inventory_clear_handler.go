package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ClearInventoryRequest struct {
	AdminPassword string `json:"adminPassword"`
}

type ClearInventoryResponse struct {
	Success      bool                   `json:"success"`
	Message      string                 `json:"message"`
	DeletedCount map[string]int         `json:"deletedCount"`
	Log          ClearInventoryLog      `json:"log"`
}

type ClearInventoryLog struct {
	ID        string    `json:"id"`
	TenantID  string    `json:"tenantId"`
	UserID    string    `json:"userId"`
	UserEmail string    `json:"userEmail"`
	Timestamp time.Time `json:"timestamp"`
	Action    string    `json:"action"`
	Details   string    `json:"details"`
	Status    string    `json:"status"`
}

// ─── Endpoint Handler ──────────────────────────────────────────────────────────

func handleClearInventory(w http.ResponseWriter, r *http.Request) {
	// Validar método
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extraer sesión
	session := ExtractSessionContextSecure(r, db)
	if !session.Valid {
		http.Error(w, "Unauthorized: "+session.Error, http.StatusUnauthorized)
		return
	}

	// Leer request
	var req ClearInventoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validar que se proporcionó contraseña
	if req.AdminPassword == "" {
		http.Error(w, "Admin password is required", http.StatusBadRequest)
		return
	}

	// Obtener usuario para validar que es admin
	user, err := getUserByID(session.UserID)
	if err != nil {
		log.Printf("ERROR: Failed to get user: %v", err)
		http.Error(w, "Failed to verify user", http.StatusInternalServerError)
		return
	}

	// Validar contraseña de admin
	if !validateAdminPassword(req.AdminPassword) {
		log.Printf("SECURITY: Invalid admin password attempt by user %s (%s)", user.Email, session.UserID)
		http.Error(w, "Invalid admin password", http.StatusUnauthorized)
		return
	}

	// Iniciar transacción
	tx, err := db.Begin()
	if err != nil {
		log.Printf("ERROR: Failed to begin transaction: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Contar items antes de eliminar
	deletedCount := make(map[string]int)

	// Eliminar assets
	var assetCount int
	err = tx.QueryRow(`
		SELECT COUNT(*) FROM assets WHERE tenant_id = $1
	`, session.TenantID).Scan(&assetCount)
	if err == nil {
		deletedCount["assets"] = assetCount
		_, err = tx.Exec(`DELETE FROM assets WHERE tenant_id = $1`, session.TenantID)
		if err != nil {
			log.Printf("ERROR: Failed to delete assets: %v", err)
			http.Error(w, "Failed to delete assets", http.StatusInternalServerError)
			return
		}
	}

	// Eliminar racks
	var rackCount int
	err = tx.QueryRow(`
		SELECT COUNT(*) FROM racks WHERE tenant_id = $1
	`, session.TenantID).Scan(&rackCount)
	if err == nil {
		deletedCount["racks"] = rackCount
		_, err = tx.Exec(`DELETE FROM racks WHERE tenant_id = $1`, session.TenantID)
		if err != nil {
			log.Printf("ERROR: Failed to delete racks: %v", err)
			http.Error(w, "Failed to delete racks", http.StatusInternalServerError)
			return
		}
	}

	// Eliminar patch panels
	var patchPanelCount int
	err = tx.QueryRow(`
		SELECT COUNT(*) FROM patch_panels WHERE tenant_id = $1
	`, session.TenantID).Scan(&patchPanelCount)
	if err == nil {
		deletedCount["patch_panels"] = patchPanelCount
		_, err = tx.Exec(`DELETE FROM patch_panels WHERE tenant_id = $1`, session.TenantID)
		if err != nil {
			log.Printf("ERROR: Failed to delete patch panels: %v", err)
			http.Error(w, "Failed to delete patch panels", http.StatusInternalServerError)
			return
		}
	}

	// Eliminar import jobs
	var jobCount int
	err = tx.QueryRow(`
		SELECT COUNT(*) FROM import_jobs WHERE tenant_id = $1
	`, session.TenantID).Scan(&jobCount)
	if err == nil {
		deletedCount["import_jobs"] = jobCount
		_, err = tx.Exec(`DELETE FROM import_jobs WHERE tenant_id = $1`, session.TenantID)
		if err != nil {
			log.Printf("ERROR: Failed to delete import jobs: %v", err)
			http.Error(w, "Failed to delete import jobs", http.StatusInternalServerError)
			return
		}
	}

	// Eliminar import items
	var itemCount int
	err = tx.QueryRow(`
		SELECT COUNT(*) FROM import_items WHERE tenant_id = $1
	`, session.TenantID).Scan(&itemCount)
	if err == nil {
		deletedCount["import_items"] = itemCount
		_, err = tx.Exec(`DELETE FROM import_items WHERE tenant_id = $1`, session.TenantID)
		if err != nil {
			log.Printf("ERROR: Failed to delete import items: %v", err)
			http.Error(w, "Failed to delete import items", http.StatusInternalServerError)
			return
		}
	}

	// Crear log de eliminación
	logID := fmt.Sprintf("%d-%d", time.Now().Unix(), os.Getpid())
	now := time.Now()
	details := fmt.Sprintf("Assets: %d, Racks: %d, Patch Panels: %d, Import Jobs: %d, Import Items: %d",
		deletedCount["assets"], deletedCount["racks"], deletedCount["patch_panels"],
		deletedCount["import_jobs"], deletedCount["import_items"])

	_, err = tx.Exec(`
		INSERT INTO inventory_clear_logs (id, tenant_id, user_id, user_email, timestamp, action, details, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, logID, session.TenantID, session.UserID, user.Email, now, "CLEAR_ALL_INVENTORY", details, "SUCCESS")
	if err != nil {
		log.Printf("ERROR: Failed to create log: %v", err)
		http.Error(w, "Failed to create log", http.StatusInternalServerError)
		return
	}

	// Confirmar transacción
	if err = tx.Commit(); err != nil {
		log.Printf("ERROR: Failed to commit transaction: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Preparar respuesta
	logEntry := ClearInventoryLog{
		ID:        logID,
		TenantID:  session.TenantID,
		UserID:    session.UserID,
		UserEmail: user.Email,
		Timestamp: now,
		Action:    "CLEAR_ALL_INVENTORY",
		Details:   details,
		Status:    "SUCCESS",
	}

	response := ClearInventoryResponse{
		Success:      true,
		Message:      "Inventario eliminado exitosamente",
		DeletedCount: deletedCount,
		Log:          logEntry,
	}

	log.Printf("SUCCESS: Inventory cleared for tenant %s by user %s (%s)", session.TenantID, user.Email, session.UserID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ─── Funciones de Utilidad ────────────────────────────────────────────────────

func validateAdminPassword(password string) bool {
	// Obtener contraseña de admin desde variable de entorno
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminPassword == "" {
		// Si no está configurada, usar una contraseña por defecto (CAMBIAR EN PRODUCCIÓN)
		adminPassword = "admin123456"
	}

	// Comparar contraseñas
	return password == adminPassword
}

func getUserByID(userID string) (*User, error) {
	user := &User{}
	err := db.QueryRow(`
		SELECT id, email, name, tenant_id FROM users WHERE id = $1
	`, userID).Scan(&user.ID, &user.Email, &user.Name, &user.TenantID)
	if err != nil {
		return nil, err
	}
	return user, nil
}


