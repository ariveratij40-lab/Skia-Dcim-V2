package main

import (
	"context"
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
	Success      bool              `json:"success"`
	Message      string            `json:"message"`
	DeletedCount map[string]int    `json:"deletedCount"`
	Log          ClearInventoryLog `json:"log"`
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
	RequireTenantTxScoped(db, handleClearInventoryContextual)(w, r)
}

func handleClearInventoryContextual(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tdb, dbOK := TenantDBFromContext(r.Context())
	userID, tenantID, _, identityOK := TenantIdentityFromContext(r.Context())
	scopeAll, scopeOK := TenantScopeFromContext(r.Context())
	if !dbOK || !identityOK || !scopeOK || tenantID == "" || userID == "" {
		http.Error(w, "Missing authorized tenant context", http.StatusInternalServerError)
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

	role, err := resolveUserRole(r.Context(), tdb, userID, tenantID)
	if err != nil {
		log.Printf("ERROR: Failed to resolve clear-inventory role: %v", err)
		http.Error(w, "Failed to verify authorization", http.StatusInternalServerError)
		return
	}
	if !clearInventoryAuthorized(role, scopeAll, validateAdminPassword(req.AdminPassword)) {
		log.Printf("SECURITY: Clear inventory denied (user=%s tenant=%s role=%s scope_all=%v)", userID, tenantID, role, scopeAll)
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	user, err := getUserByIDWithDB(r.Context(), tdb, userID)
	if err != nil {
		log.Printf("ERROR: Failed to get user: %v", err)
		http.Error(w, "Failed to verify user", http.StatusInternalServerError)
		return
	}

	// Contar items antes de eliminar
	deletedCount := make(map[string]int)

	// Eliminar assets
	var assetCount int
	err = tdb.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM assets WHERE tenant_id = $1
	`, tenantID).Scan(&assetCount)
	if err == nil {
		deletedCount["assets"] = assetCount
		_, err = tdb.ExecContext(r.Context(), `DELETE FROM assets WHERE tenant_id = $1`, tenantID)
		if err != nil {
			log.Printf("ERROR: Failed to delete assets: %v", err)
			http.Error(w, "Failed to delete assets", http.StatusInternalServerError)
			return
		}
	}

	// Eliminar racks
	var rackCount int
	err = tdb.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM racks WHERE tenant_id = $1
	`, tenantID).Scan(&rackCount)
	if err == nil {
		deletedCount["racks"] = rackCount
		_, err = tdb.ExecContext(r.Context(), `DELETE FROM racks WHERE tenant_id = $1`, tenantID)
		if err != nil {
			log.Printf("ERROR: Failed to delete racks: %v", err)
			http.Error(w, "Failed to delete racks", http.StatusInternalServerError)
			return
		}
	}

	// Eliminar patch panels
	var patchPanelCount int
	err = tdb.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM patch_panels WHERE tenant_id = $1
	`, tenantID).Scan(&patchPanelCount)
	if err == nil {
		deletedCount["patch_panels"] = patchPanelCount
		_, err = tdb.ExecContext(r.Context(), `DELETE FROM patch_panels WHERE tenant_id = $1`, tenantID)
		if err != nil {
			log.Printf("ERROR: Failed to delete patch panels: %v", err)
			http.Error(w, "Failed to delete patch panels", http.StatusInternalServerError)
			return
		}
	}

	// Eliminar import jobs
	var jobCount int
	err = tdb.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM import_jobs WHERE tenant_id = $1
	`, tenantID).Scan(&jobCount)
	if err == nil {
		deletedCount["import_jobs"] = jobCount
		_, err = tdb.ExecContext(r.Context(), `DELETE FROM import_jobs WHERE tenant_id = $1`, tenantID)
		if err != nil {
			log.Printf("ERROR: Failed to delete import jobs: %v", err)
			http.Error(w, "Failed to delete import jobs", http.StatusInternalServerError)
			return
		}
	}

	// Eliminar import items
	var itemCount int
	err = tdb.QueryRowContext(r.Context(), `
		SELECT COUNT(*) FROM import_items WHERE tenant_id = $1
	`, tenantID).Scan(&itemCount)
	if err == nil {
		deletedCount["import_items"] = itemCount
		_, err = tdb.ExecContext(r.Context(), `DELETE FROM import_items WHERE tenant_id = $1`, tenantID)
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

	_, err = tdb.ExecContext(r.Context(), `
		INSERT INTO inventory_clear_logs (id, tenant_id, user_id, user_email, timestamp, action, details, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, logID, tenantID, userID, user.Email, now, "CLEAR_ALL_INVENTORY", details, "SUCCESS")
	if err != nil {
		log.Printf("ERROR: Failed to create log: %v", err)
		http.Error(w, "Failed to create log", http.StatusInternalServerError)
		return
	}

	// Preparar respuesta
	logEntry := ClearInventoryLog{
		ID:        logID,
		TenantID:  tenantID,
		UserID:    userID,
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

	log.Printf("SUCCESS: Inventory cleared for tenant %s by user %s (%s)", tenantID, user.Email, userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ─── Funciones de Utilidad ────────────────────────────────────────────────────

func validateAdminPassword(password string) bool {
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	return adminPassword != "" && password == adminPassword
}

func clearInventoryAuthorized(role string, scopeAll, passwordValid bool) bool {
	return globalScopeRoles[role] && scopeAll && passwordValid
}

func getUserByIDWithDB(ctx context.Context, tdb TenantDB, userID string) (*User, error) {
	user := &User{}
	err := tdb.QueryRowContext(ctx, `
		SELECT id, email, name, tenant_id FROM users WHERE id = $1
	`, userID).Scan(&user.ID, &user.Email, &user.Name, &user.TenantID)
	if err != nil {
		return nil, err
	}
	return user, nil
}
