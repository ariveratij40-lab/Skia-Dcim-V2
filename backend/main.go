package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"golang.org/x/crypto/argon2"
)

// ==========================================
// Tipos de Datos
// ==========================================

type User struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	TenantID string `json:"tenantId"`
}

type Tenant struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Logo string `json:"logo"`
}

type Branch struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	TenantID string `json:"tenantId"`
	City     string `json:"city"`
	Status   string `json:"status"`
}

type Session struct {
	ID        string `json:"id"`
	UserID    string `json:"user_id"`
	TenantID  string `json:"tenantId"`
	BranchID  string `json:"branchId"`
	Token     string `json:"token"`
	ExpiresAt int64  `json:"expires_at"`
}

type SidebarItem struct {
	ID       string        `json:"id"`
	Label    string        `json:"label"`
	Icon     string        `json:"icon"`
	Path     string        `json:"path"`
	Children []SidebarItem `json:"children,omitempty"`
}

// ==========================================
// Respuestas
// ==========================================

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	SessionToken string   `json:"session_token"`
	User         User     `json:"user"`
	Tenants      []Tenant `json:"tenants"`
}

type SelectTenantRequest struct {
	TenantID string `json:"tenantId"`
}

type SelectBranchRequest struct {
	BranchID string `json:"branchId"`
}

type SidebarResponse struct {
	Items []SidebarItem `json:"items"`
}

// ==========================================
// Variables Globales
// ==========================================

var db *sql.DB

// ==========================================
// Main
// ==========================================

func main() {
	runtimeDSN, migratorDSN, onboardingDSN, requireRestricted, err := databaseDSNsFromEnv()
	if err != nil {
		log.Fatalf("Database configuration invalid: %v", err)
	}

	db, err = sql.Open("postgres", runtimeDSN)
	if err != nil {
		log.Fatalf("Error opening runtime database: %v", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		log.Fatalf("Runtime database ping failed: %v", err)
	}
	if requireRestricted {
		if err := validateRestrictedRuntimeDB(db); err != nil {
			_ = db.Close()
			log.Fatalf("Runtime database security gate failed: %v", err)
		}
	}

	migratorDB, err := sql.Open("postgres", migratorDSN)
	if err != nil {
		_ = db.Close()
		log.Fatalf("Error opening migrator database: %v", err)
	}
	if err := migratorDB.Ping(); err != nil {
		_ = migratorDB.Close()
		_ = db.Close()
		log.Fatalf("Migrator database ping failed: %v", err)
	}

	onboardingDB, err := sql.Open("postgres", onboardingDSN)
	if err != nil {
		_ = migratorDB.Close()
		_ = db.Close()
		log.Fatalf("Error opening onboarding database: %v", err)
	}
	if err := onboardingDB.Ping(); err != nil {
		_ = onboardingDB.Close()
		_ = migratorDB.Close()
		_ = db.Close()
		log.Fatalf("Onboarding database ping failed: %v", err)
	}
	if requireRestricted {
		if err := validateOnboardingDB(onboardingDB); err != nil {
			_ = onboardingDB.Close()
			_ = migratorDB.Close()
			_ = db.Close()
			log.Fatalf("Onboarding database security gate failed: %v", err)
		}
	}
	defer db.Close()
	defer migratorDB.Close()
	defer onboardingDB.Close()

	// Aplicar migraciones pendientes automáticamente
	if err := runMigrations(migratorDB); err != nil {
		log.Printf("⚠️  Error en migraciones: %v", err)
	} else {
		log.Println("✅ Migraciones aplicadas")
	}

	// Migrar tabla de historial IA
	migrateAIChatHistory(migratorDB)
	log.Println("✅ Connected to runtime, migrator, and onboarding databases")

	// Inicializar SessionStore exclusivamente con el pool runtime.
	if err := InitializeSessionStore(db); err != nil {
		log.Fatalf("Failed to initialize session store: %v", err)
	}
	if err := ValidateSessionStoreInitialization(); err != nil {
		log.Fatalf("Session store validation failed: %v", err)
	}

	// ==========================================
	// Rutas
	// ==========================================

	http.HandleFunc("/api/health", handleHealth)
	http.HandleFunc("/api/dashboard/stats", handleDashboardStats)
	http.HandleFunc("/api/auth/login", handleLogin)
	http.HandleFunc("/api/auth/register", newRegisterHandler(onboardingDB))
	http.HandleFunc("/api/auth/forgot-password", handleForgotPassword)
	http.HandleFunc("/api/auth/reset-password", handleResetPassword)
	http.HandleFunc("/api/auth/tenants", handleGetTenants)
	http.HandleFunc("/api/auth/select-tenant", handleSelectTenant)
	http.HandleFunc("/api/auth/select-branch", handleSelectBranch)
	http.HandleFunc("/api/auth/me", handleGetMe)
	http.HandleFunc("/api/navigation/sidebar", handleGetSidebar)
	http.HandleFunc("/api/auth/logout", handleLogout)

	// Rutas Google OAuth2
	http.HandleFunc("/api/auth/google", handleGoogleLogin)
	http.HandleFunc("/api/auth/google/callback", handleGoogleCallback)

	// Rutas DCIM
	dcim := NewDCIMHandler(db)
	http.HandleFunc("/api/dcim/assets", dcim.HandleAssets)
	http.HandleFunc("/api/dcim/assets/", dcim.HandleAssetByID)
	http.HandleFunc("/api/dcim/asset-types", dcim.HandleAssetTypes)
	http.HandleFunc("/api/dcim/locations", RequireTenantTx(db, dcim.HandleLocations))
	// Fase 1: catálogos maestros (INV-DCM-0014) y jerarquía física (§15)
	http.HandleFunc("/api/dcim/catalogs", dcim.HandleCatalogs)
	http.HandleFunc("/api/dcim/hierarchy", RequireTenantTx(db, dcim.HandleHierarchy))
	// Fase 2: módulo RFID real (INV-TRK-0001)
	http.HandleFunc("/api/dcim/rfid/", dcim.HandleRFID)

	// Catálogos maestros CRUD (Fase 2 — INV-DCM-0014)
	http.HandleFunc("/api/dcim/catalogs/manufacturers", dcim.HandleManufacturers)
	http.HandleFunc("/api/dcim/catalogs/manufacturers/", dcim.HandleManufacturers)
	http.HandleFunc("/api/dcim/catalogs/models", dcim.HandleModels)
	http.HandleFunc("/api/dcim/catalogs/models/", dcim.HandleModels)
	http.HandleFunc("/api/dcim/catalogs/providers", dcim.HandleProviders)
	http.HandleFunc("/api/dcim/catalogs/providers/", dcim.HandleProviders)
	http.HandleFunc("/api/dcim/catalogs/naming-rules", RequireTenantTx(db, dcim.HandleNamingRules))
	http.HandleFunc("/api/dcim/catalogs/naming-rules/", RequireTenantTx(db, dcim.HandleNamingRules))
	http.HandleFunc("/api/dcim/placements", RequireTenantTx(db, HandlePlacements))
	http.HandleFunc("/api/dcim/sites", RequireTenantTx(db, HandleSites))
	http.HandleFunc("/api/dcim/internal-areas", RequireTenantTx(db, HandleInternalAreas))
	http.HandleFunc("/api/dcim/catalogs/locations", RequireTenantTx(db, dcim.HandleLocationsManage))
	http.HandleFunc("/api/dcim/catalogs/locations/", RequireTenantTx(db, dcim.HandleLocationsManage))

	// Infraestructura DCIM — endpoints por módulo
	http.HandleFunc("/api/infra/mdf-idf", RequireTenantTx(db, handleMdfIdf))
	http.HandleFunc("/api/infra/mdf-idf/check", RequireTenantTx(db, handleMdfIdfCheck)) // validación de duplicados en tiempo real
	http.HandleFunc("/api/infra/mdf-idf/", RequireTenantTx(db, handleEnsureRack))       // /api/infra/mdf-idf/{id}/ensure-rack
	http.HandleFunc("/api/infra/cert-evaluations", handleCertEvaluations)
	http.HandleFunc("/api/infra/cert-evaluations/", handleCertEvaluationItem)
	http.HandleFunc("/api/infra/racks", RequireTenantTx(db, handleRacks))
	http.HandleFunc("/api/infra/racks/", RequireTenantTx(db, handleRackLayout)) // /api/infra/racks/{id}/layout
	http.HandleFunc("/api/infra/switches", RequireTenantTx(db, handleSwitches))
	http.HandleFunc("/api/infra/patch-panels", RequireTenantTx(db, handlePatchPanels))
	http.HandleFunc("/api/infra/ups-pdus", RequireTenantTx(db, handleUpsPdus))
	http.HandleFunc("/api/infra/backbone", RequireTenantTx(db, handleBackbone))
	http.HandleFunc("/api/infra/backbone/check", RequireTenantTx(db, handleBackboneCheck))
	http.HandleFunc("/api/infra/nodos", RequireTenantTx(db, handleNodos))

	// Rutas CAPEX
	http.HandleFunc("/api/capex/projects", handleCapexProjects)
	http.HandleFunc("/api/capex/projects/", handleCapexProjects)
	http.HandleFunc("/api/capex/stats", handleCapexStats)

	// Rutas Configuración
	http.HandleFunc("/api/config/", handleConfigSection)
	http.HandleFunc("/api/config/integrations", handleIntegrations)
	http.HandleFunc("/api/config/integrations/", handleIntegrations)
	http.HandleFunc("/api/config/apikeys", handleApiKeys)
	http.HandleFunc("/api/config/apikeys/", handleApiKeys)
	http.HandleFunc("/api/config/rfid/readers", handleRFIDReaders)
	http.HandleFunc("/api/config/rfid/readers/", handleRFIDReaders)

	// Rutas Administración
	http.HandleFunc("/api/admin/users", handleAdminUsers)
	http.HandleFunc("/api/admin/users/", handleAdminUsers)
	http.HandleFunc("/api/admin/projects", handleAdminProjects)
	http.HandleFunc("/api/admin/projects/", handleAdminProjects)
	http.HandleFunc("/api/admin/integrators", handleAdminIntegrators)
	http.HandleFunc("/api/admin/integrators/", handleAdminIntegrators)
	http.HandleFunc("/api/admin/audit", handleAdminAudit)
	http.HandleFunc("/api/admin/feature-flags", handleAdminFeatureFlags)

	// Rutas Asistente IA
	// handleAIChat va con RequireTenantTxScoped (C-6, 2026-08-07): el
	// conteo de `assets` en el contexto de la IA debe respetar
	// app.branch_scope_all como cualquier otra consulta RLS-sensible
	// (ver ai_chat.go/getTenantContext). handleAIChatHistory no toca
	// `assets` ni ninguna tabla con RLS, pero se migra a RequireTenantTx
	// de todas formas para no dejar una segunda resolución de sesión ad
	// hoc en el mismo archivo.
	http.HandleFunc("/api/ai/chat", RequireTenantTxScoped(db, handleAIChat))
	http.HandleFunc("/api/ai/history", RequireTenantTx(db, handleAIChatHistory))
	http.HandleFunc("/api/ai/process-pdf", handleProcessPDFWithAI)

	// Rutas de Importación
	// Ruta principal de creación
	http.HandleFunc("/api/import/inventory", handleImportInventorySecure)
	// Dispatcher para subrutas (detalle, filas, commit)
	http.HandleFunc("/api/import/inventory/", handleInventoryImportRoutes)
	// Estadísticas e historial
	http.HandleFunc("/api/import/stats", handleImportStats)
	http.HandleFunc("/api/import/recent", handleRecentImports)
	// Las rutas legacy /api/activos* y /api/dcim/assets/delete escribían o
	// leían imported_assets sin contexto autenticado. El contrato canónico
	// PHASE-010 las retira: /api/dcim/assets[/id] es el API vigente y las
	// rutas /api/import/* retenidas exigen sesión + tenant + branch.
	http.HandleFunc("/api/import/assets", handleGetImportedAssets)
	http.HandleFunc("/api/import/details", handleGetImportDetails)
	http.HandleFunc("/api/import/search", handleSearchAssets)
	http.HandleFunc("/api/import/history", handleGetImportHistory)
	http.HandleFunc("/api/import/by-type", handleGetAssetsByType)
	http.HandleFunc("/api/import/export", handleExportImportData)
	// Import upload module
	registerImportUploadRoutes()
	// Inventory management
	http.HandleFunc("/api/inventory/clear-all", handleClearInventory)

	// Upload de imágenes
	uploadsDir := os.Getenv("UPLOADS_DIR")
	if uploadsDir == "" {
		uploadsDir = "/app/uploads"
	}
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		log.Printf("Warning: could not create uploads dir: %v", err)
	}
	http.HandleFunc("/api/upload", makeUploadHandler(uploadsDir))
	// Servir archivos estáticos subidos
	http.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadsDir))))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🚀 Server starting on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, corsMiddleware(http.DefaultServeMux)))
}

// ==========================================
// Middleware
// ==========================================

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Permitir credenciales (cookies) — requiere origen específico, no wildcard
		origin := r.Header.Get("Origin")
		allowedOrigins := map[string]bool{
			"https://skia.iamet.mx": true,
			"http://skia.iamet.mx":  true,
			"http://localhost:3000": true,
			"http://localhost:3001": true,
		}
		if allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		} else {
			// Peticiones server-side (Next.js proxy) no tienen Origin — permitir
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Solo forzar Content-Type JSON en rutas /api (excepto /uploads/)
		if strings.HasPrefix(r.URL.Path, "/api/") && !strings.HasPrefix(r.URL.Path, "/uploads/") {
			w.Header().Set("Content-Type", "application/json")
		}

		next.ServeHTTP(w, r)
	})
}

func extractSessionToken(r *http.Request) string {
	cookie, err := r.Cookie("session_token")
	if err == nil {
		return cookie.Value
	}
	return ""
}

// ==========================================
// Handlers
// ==========================================

func handleHealth(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sessionCookie, err := newSessionCookie("")
	if err != nil {
		log.Printf("Invalid session cookie configuration: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.Email == "" || req.Password == "" {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}
	// Buscar usuario con password_hash
	var userID, userName, passwordHash string
	err = db.QueryRow(
		"SELECT id, name, password_hash FROM users WHERE email = $1 AND status = 'active' LIMIT 1",
		req.Email,
	).Scan(&userID, &userName, &passwordHash)
	if errors.Is(err, sql.ErrNoRows) {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}
	if err != nil {
		log.Printf("Login user lookup failed: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	// Verificar contraseña con argon2id
	if !verifyPassword(req.Password, passwordHash) {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Generar session token opaco
	sessionToken := generateOpaqueToken()

	// Obtener tenants del usuario
	rows, err := db.Query(
		`SELECT DISTINCT t.id, t.name, t.logo 
		 FROM tenants t
		 JOIN user_tenants ut ON t.id = ut.tenant_id
		 WHERE ut.user_id = $1`,
		userID,
	)
	if err != nil {
		http.Error(w, "Error fetching tenants", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tenants []Tenant
	for rows.Next() {
		var t Tenant
		if err := rows.Scan(&t.ID, &t.Name, &t.Logo); err != nil {
			log.Printf("Login tenant row scan failed: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		tenants = append(tenants, t)
	}
	if err := rows.Err(); err != nil {
		log.Printf("Login tenant iteration failed: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Auto-asignar tenant si el usuario tiene exactamente uno
	autoTenantID := ""
	if len(tenants) == 1 {
		autoTenantID = tenants[0].ID
	}

	// Obtener branch del usuario
	autoBranchID := ""
	if autoTenantID != "" {
		err = db.QueryRow(
			`SELECT ub.branch_id
			 FROM user_branches ub
			 JOIN branches b ON b.id = ub.branch_id
			 WHERE ub.user_id = $1 AND b.tenant_id = $2
			 ORDER BY b.created_at, b.id
			 LIMIT 1`,
			userID, autoTenantID,
		).Scan(&autoBranchID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			log.Printf("Error fetching branch: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		} else if errors.Is(err, sql.ErrNoRows) {
			log.Printf("No branch found for user %s", userID)
		} else {
			log.Printf("Branch found for user %s: %s", userID, autoBranchID)
		}
	}

	// Guardar sesión en DB con tenant_id y branch_id automático cuando aplica
	if autoTenantID != "" && autoBranchID != "" {
		_, err = db.Exec(
			`INSERT INTO sessions (id, user_id, token, tenant_id, branch_id, expires_at, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
			generateID(), userID, sessionToken, autoTenantID, autoBranchID, time.Now().Add(24*time.Hour).Unix(),
		)
	} else if autoTenantID != "" {
		_, err = db.Exec(
			`INSERT INTO sessions (id, user_id, token, tenant_id, expires_at, created_at)
			 VALUES ($1, $2, $3, $4, $5, NOW())`,
			generateID(), userID, sessionToken, autoTenantID, time.Now().Add(24*time.Hour).Unix(),
		)
	} else {
		_, err = db.Exec(
			`INSERT INTO sessions (id, user_id, token, expires_at, created_at)
			 VALUES ($1, $2, $3, $4, NOW())`,
			generateID(), userID, sessionToken, time.Now().Add(24*time.Hour).Unix(),
		)
	}
	if err != nil {
		log.Printf("Error saving session: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Establecer cookie HttpOnly
	sessionCookie.Value = sessionToken
	http.SetCookie(w, sessionCookie)

	response := LoginResponse{
		SessionToken: sessionToken,
		User: User{
			ID:    userID,
			Email: req.Email,
			Name:  userName,
		},
		Tenants: tenants,
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func handleGetTenants(w http.ResponseWriter, r *http.Request) {
	sessionToken := extractSessionToken(r)
	if sessionToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Obtener usuario desde sesión
	var userID string
	err := db.QueryRow(
		"SELECT user_id FROM sessions WHERE token = $1 AND expires_at > $2",
		sessionToken, time.Now().Unix(),
	).Scan(&userID)

	if errors.Is(err, sql.ErrNoRows) {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}
	if err != nil {
		log.Printf("Get tenants session lookup failed: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	rows, err := db.Query(
		`SELECT DISTINCT t.id, t.name, t.logo 
		 FROM tenants t
		 JOIN user_tenants ut ON t.id = ut.tenant_id
		 WHERE ut.user_id = $1`,
		userID,
	)
	if err != nil {
		http.Error(w, "Error fetching tenants", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tenants []Tenant
	for rows.Next() {
		var t Tenant
		if err := rows.Scan(&t.ID, &t.Name, &t.Logo); err != nil {
			continue
		}
		tenants = append(tenants, t)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"tenants": tenants})
}

func handleSelectTenant(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sessionToken := extractSessionToken(r)
	if sessionToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var req SelectTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.TenantID == "" {
		http.Error(w, "TenantID required", http.StatusBadRequest)
		return
	}
	// Obtener el user_id de la sesión activa
	var userID string
	err := db.QueryRow(
		"SELECT user_id FROM sessions WHERE token = $1 AND expires_at > $2",
		sessionToken, time.Now().Unix(),
	).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if err != nil {
		log.Printf("Select tenant session lookup failed: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	// SEGURIDAD CRITICA: verificar que el tenant pertenece al usuario
	var belongs bool
	err = db.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM user_tenants WHERE user_id = $1 AND tenant_id = $2)",
		userID, req.TenantID,
	).Scan(&belongs)
	if err != nil {
		log.Printf("Select tenant authorization check failed: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if !belongs {
		log.Printf("SECURITY: user %s attempted to access tenant %s without permission", userID, req.TenantID)
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	// Actualizar sesión con tenant_id validado
	_, err = db.Exec(
		"UPDATE sessions SET tenant_id = $1 WHERE token = $2",
		req.TenantID, sessionToken,
	)
	if err != nil {
		log.Printf("ERROR select-tenant update session: %v tenantID=[%s] token=[%s]", err, req.TenantID, sessionToken)
		http.Error(w, "Error updating session", http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleSelectBranch(w http.ResponseWriter, r *http.Request) {
	handleSelectBranchWithDeps(w, r, branchSelectionDeps{
		loadAuthorizedBranches: func(token string, now int64) ([]authorizedBranch, error) {
			rows, err := db.Query(`SELECT b.id,b.name,COALESCE(b.city,''),b.id=s.branch_id
				FROM sessions s
				JOIN user_branches ub ON ub.user_id=s.user_id
				JOIN branches b ON b.id=ub.branch_id AND b.tenant_id=s.tenant_id
				WHERE s.token=$1 AND s.expires_at>$2 AND b.status='active'
				ORDER BY b.name`, token, now)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			var branches []authorizedBranch
			for rows.Next() {
				var branch authorizedBranch
				if err := rows.Scan(&branch.ID, &branch.Name, &branch.City, &branch.Selected); err != nil {
					return nil, err
				}
				branches = append(branches, branch)
			}
			return branches, rows.Err()
		},
		loadSession: func(token string, now int64) (string, string, error) {
			var userID, tenantID string
			err := db.QueryRow(
				"SELECT user_id, tenant_id FROM sessions WHERE token = $1 AND expires_at > $2",
				token, now,
			).Scan(&userID, &tenantID)
			return userID, tenantID, err
		},
		userHasBranchAccess: func(userID, tenantID, branchID string) (bool, error) {
			var allowed bool
			err := db.QueryRow(
				`SELECT EXISTS(
					SELECT 1
					FROM branches b
					JOIN user_branches ub ON ub.branch_id = b.id
					WHERE b.id = $1 AND b.tenant_id = $2 AND b.status='active' AND ub.user_id = $3
				)`,
				branchID, tenantID, userID,
			).Scan(&allowed)
			return allowed, err
		},
		updateBranch: func(token, userID, tenantID, branchID string, now int64) (bool, error) {
			result, err := db.Exec(
				`UPDATE sessions s
				 SET branch_id = $1
				 WHERE s.token = $2
				   AND s.user_id = $3
				   AND s.tenant_id = $4
				   AND s.expires_at > $5
				   AND EXISTS (
					 SELECT 1
					 FROM branches b
					 JOIN user_branches ub ON ub.branch_id = b.id
					 WHERE b.id = $1 AND b.tenant_id = s.tenant_id AND b.status='active' AND ub.user_id = s.user_id
				   )`,
				branchID, token, userID, tenantID, now,
			)
			if err != nil {
				return false, err
			}
			rows, err := result.RowsAffected()
			return rows == 1, err
		},
	})
}

type branchSelectionDeps struct {
	loadAuthorizedBranches func(token string, now int64) ([]authorizedBranch, error)
	loadSession            func(token string, now int64) (userID, tenantID string, err error)
	userHasBranchAccess    func(userID, tenantID, branchID string) (bool, error)
	updateBranch           func(token, userID, tenantID, branchID string, now int64) (bool, error)
}

type authorizedBranch struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	City     string `json:"city"`
	Selected bool   `json:"selected"`
}

func handleSelectBranchWithDeps(w http.ResponseWriter, r *http.Request, deps branchSelectionDeps) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sessionToken := extractSessionToken(r)
	if sessionToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method == http.MethodGet {
		if deps.loadAuthorizedBranches == nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		branches, err := deps.loadAuthorizedBranches(sessionToken, time.Now().Unix())
		if err != nil {
			log.Printf("ERROR authorized branch list failed: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if len(branches) == 0 {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"branches": branches})
		return
	}
	var req SelectBranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.BranchID == "" {
		http.Error(w, "BranchID required", http.StatusBadRequest)
		return
	}
	now := time.Now().Unix()
	userID, tenantID, err := deps.loadSession(sessionToken, now)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		log.Printf("ERROR select-branch session lookup failed: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if userID == "" || tenantID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	allowed, err := deps.userHasBranchAccess(userID, tenantID, req.BranchID)
	if err != nil {
		log.Printf("ERROR select-branch authorization check failed")
		http.Error(w, "Error checking branch access", http.StatusInternalServerError)
		return
	}
	if !allowed {
		log.Printf("SECURITY: branch selection denied for authenticated user")
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	updated, err := deps.updateBranch(sessionToken, userID, tenantID, req.BranchID, now)
	if err != nil {
		log.Printf("ERROR select-branch update session: %v", err)
		http.Error(w, "Error updating session", http.StatusInternalServerError)
		return
	}
	if !updated {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleGetMe(w http.ResponseWriter, r *http.Request) {
	sessionToken := extractSessionToken(r)
	log.Printf("DEBUG /me sessionToken=[%s] len=%d", sessionToken, len(sessionToken))
	if sessionToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID, email, name string
	var tenantID, branchID sql.NullString
	err := db.QueryRow(
		`SELECT u.id, u.email, u.name, s.tenant_id, s.branch_id
		 FROM sessions s
		 JOIN users u ON s.user_id = u.id
		 WHERE s.token = $1 AND s.expires_at > $2`,
		sessionToken, time.Now().Unix(),
	).Scan(&userID, &email, &name, &tenantID, &branchID)

	if err != nil {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"user": map[string]string{
			"id":        userID,
			"email":     email,
			"name":      name,
			"tenant_id": tenantID.String,
			"branch_id": branchID.String,
		},
	})
}

func handleGetSidebar(w http.ResponseWriter, r *http.Request) {
	sessionToken := extractSessionToken(r)
	if sessionToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var userID string
	var tenantIDNull sql.NullString
	err := db.QueryRow(
		`SELECT u.id, s.tenant_id
		 FROM sessions s
		 JOIN users u ON s.user_id = u.id
		 WHERE s.token = $1 AND s.expires_at > $2`,
		sessionToken, time.Now().Unix(),
	).Scan(&userID, &tenantIDNull)
	if err != nil {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}
	tenantID := tenantIDNull.String

	// Obtener rol del usuario via JOIN con tabla roles
	var role string
	db.QueryRow(
		`SELECT r.name FROM user_roles ur
		 JOIN roles r ON r.id = ur.role_id
		 WHERE ur.user_id = $1 AND ur.tenant_id = $2 LIMIT 1`,
		userID, tenantID,
	).Scan(&role)

	// Construir sidebar basado en rol
	items := buildSidebar(role)

	response := SidebarResponse{Items: items}
	json.NewEncoder(w).Encode(response)
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionToken := extractSessionToken(r)
	if sessionToken != "" {
		if _, err := db.Exec("DELETE FROM sessions WHERE token = $1", sessionToken); err != nil {
			log.Printf("Logout session deletion failed: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    "",
		HttpOnly: true,
		MaxAge:   -1,
		Path:     "/",
	})

	json.NewEncoder(w).Encode(map[string]string{"status": "logged_out"})
}

// ==========================================
// Funciones Auxiliares
// ==========================================

func generateOpaqueToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func generateID() string {
	return uuid.New().String()
}

func hashPassword(password string) string {
	salt := make([]byte, 16)
	rand.Read(salt)
	hash := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
	// Usar RawURLEncoding para evitar '/' en el salt/hash que rompe la decodificación en verifyPassword
	return fmt.Sprintf("$argon2id$v=19$m=65536,t=1,p=4$%s$%s",
		base64.RawURLEncoding.EncodeToString(salt),
		base64.RawURLEncoding.EncodeToString(hash),
	)
}

// verifyPassword compara una contraseña en texto plano contra un hash argon2id almacenado.
// Formato esperado: $argon2id$v=19$m=65536,t=1,p=4$<salt_b64>$<hash_b64>
func verifyPassword(password, encodedHash string) bool {
	parts := strings.Split(encodedHash, "$")
	// Formato: ["", "argon2id", "v=19", "m=65536,t=1,p=4", "<salt>", "<hash>"]
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	// Intentar primero RawURLEncoding (hashes nuevos), luego RawStdEncoding (hashes legacy con '/')
	salt, err := base64.RawURLEncoding.DecodeString(parts[4])
	if err != nil {
		salt, err = base64.RawStdEncoding.DecodeString(parts[4])
		if err != nil {
			return false
		}
	}
	expectedHash, err := base64.RawURLEncoding.DecodeString(parts[5])
	if err != nil {
		expectedHash, err = base64.RawStdEncoding.DecodeString(parts[5])
		if err != nil {
			return false
		}
	}
	computedHash := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, uint32(len(expectedHash)))
	// Comparación en tiempo constante para prevenir timing attacks
	if len(computedHash) != len(expectedHash) {
		return false
	}
	var diff byte
	for i := range computedHash {
		diff |= computedHash[i] ^ expectedHash[i]
	}
	return diff == 0
}

func buildSidebar(role string) []SidebarItem {
	baseItems := []SidebarItem{
		{
			ID:    "dashboard",
			Label: "Dashboard",
			Icon:  "LayoutDashboard",
			Path:  "/dashboard",
		},
	}

	if role == "admin" || role == "super_admin" {
		baseItems = append(baseItems, []SidebarItem{
			{
				ID:    "infrastructure",
				Label: "Infraestructura",
				Icon:  "Building2",
				Path:  "/infrastructure",
				Children: []SidebarItem{
					{ID: "assets", Label: "Activos", Icon: "Package", Path: "/infrastructure/assets"},
					{ID: "racks", Label: "Racks", Icon: "Grid3x3", Path: "/infrastructure/racks"},
					{
						ID: "catalogs", Label: "Catálogos", Icon: "BookOpen", Path: "/infrastructure/catalogs",
						Children: []SidebarItem{
							{ID: "manufacturers", Label: "Fabricantes", Icon: "Factory", Path: "/infrastructure/catalogs/fabricantes"},
							{ID: "providers", Label: "Proveedores", Icon: "Truck", Path: "/infrastructure/catalogs/proveedores"},
							{ID: "locations", Label: "Ubicaciones", Icon: "MapPin", Path: "/infrastructure/catalogs/ubicaciones"},
							{ID: "naming-rules", Label: "Nomenclaturas", Icon: "Tag", Path: "/infrastructure/catalogs/nomenclaturas"},
						},
					},
				},
			},
			{
				ID:    "admin",
				Label: "Administración",
				Icon:  "Settings",
				Path:  "/admin",
			},
		}...)
	}

	return baseItems
}

// ==========================================
// Handlers de Registro y Recuperación de Contraseña
// ==========================================

type RegisterRequest struct {
	OrgName  string `json:"org_name"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Phone    string `json:"phone"`
}

func newRegisterHandler(registrationDB registrationDB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		handleRegisterWithDB(w, r, registrationDB)
	}
}

type registrationDB interface {
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
	BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
}

func handleRegisterWithDB(w http.ResponseWriter, r *http.Request, registrationDB registrationDB) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
		return
	}
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Solicitud inválida"})
		return
	}
	if req.Email == "" || req.Password == "" || req.Name == "" || req.OrgName == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Todos los campos son obligatorios"})
		return
	}
	if len(req.Password) < 6 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "La contraseña debe tener al menos 6 caracteres"})
		return
	}
	// Verificar si el email ya existe
	var existingID string
	err := registrationDB.QueryRowContext(r.Context(), "SELECT id FROM users WHERE email = $1", req.Email).Scan(&existingID)
	if err == nil {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "El correo ya está registrado"})
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		log.Printf("Error checking existing registration email: %v", err)
		writeRegistrationInternalError(w)
		return
	}
	// Hash de la contraseña
	pwdHash := hashPassword(req.Password)
	tx, err := registrationDB.BeginTx(r.Context(), nil)
	if err != nil {
		log.Printf("Error beginning registration transaction: %v", err)
		writeRegistrationInternalError(w)
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	// Crear tenant
	tenantID := generateID()
	_, err = tx.ExecContext(r.Context(),
		`INSERT INTO tenants (id, name, logo, created_at) VALUES ($1, $2, '', NOW())`,
		tenantID, req.OrgName,
	)
	if err != nil {
		log.Printf("Error creating tenant: %v", err)
		writeRegistrationInternalError(w)
		return
	}
	// Crear usuario con password_hash
	userID := generateID()
	_, err = tx.ExecContext(r.Context(),
		`INSERT INTO users (id, email, name, password_hash, status, created_at) VALUES ($1, $2, $3, $4, 'active', NOW())`,
		userID, req.Email, req.Name, pwdHash,
	)
	if err != nil {
		log.Printf("Error creating user: %v", err)
		if isUniqueViolation(err) {
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "El correo ya está registrado"})
			return
		}
		writeRegistrationInternalError(w)
		return
	}
	// Crear branch (sede) por defecto para el nuevo tenant
	defaultBranchID := generateID()
	_, err = tx.ExecContext(r.Context(),
		`INSERT INTO branches (id, tenant_id, name, city, status, created_at) VALUES ($1, $2, $3, 'Principal', 'active', NOW())`,
		defaultBranchID, tenantID, req.OrgName+" - Sede Principal",
	)
	if err != nil {
		log.Printf("Error creating default branch: %v", err)
		writeRegistrationInternalError(w)
		return
	}
	// Asociar usuario con tenant (sin columna role)
	_, err = tx.ExecContext(r.Context(),
		`INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2)`,
		userID, tenantID,
	)
	if err != nil {
		log.Printf("Error creating user_tenant: %v", err)
		writeRegistrationInternalError(w)
		return
	}
	// La autorización de sucursal es explícita; el rol no sustituye este mapping.
	_, err = tx.ExecContext(r.Context(),
		`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`,
		userID, defaultBranchID,
	)
	if err != nil {
		log.Printf("Error creating user_branch: %v", err)
		writeRegistrationInternalError(w)
		return
	}
	// Crear rol admin para el nuevo tenant y asignarlo al usuario
	roleID := generateID()
	err = tx.QueryRowContext(r.Context(),
		`WITH inserted_role AS (
			 INSERT INTO roles (id, tenant_id, name, description, is_global, created_at)
			 VALUES ($1, $2, 'admin', 'Administrador del Tenant', FALSE, NOW())
			 ON CONFLICT (tenant_id, name) DO NOTHING
			 RETURNING id
		 )
		 SELECT id FROM inserted_role
		 UNION ALL
		 SELECT id FROM roles WHERE tenant_id = $2 AND name = 'admin'
		 LIMIT 1`,
		roleID, tenantID,
	).Scan(&roleID)
	if err != nil {
		log.Printf("Error creating admin role: %v", err)
		writeRegistrationInternalError(w)
		return
	}
	// Asignar rol al usuario
	_, err = tx.ExecContext(r.Context(),
		`INSERT INTO user_roles (id, user_id, tenant_id, role_id, created_at)
		 VALUES ($1, $2, $3, $4, NOW())`,
		generateID(), userID, tenantID, roleID,
	)
	if err != nil {
		log.Printf("Error assigning role: %v", err)
		writeRegistrationInternalError(w)
		return
	}
	if err = tx.Commit(); err != nil {
		log.Printf("Error committing registration transaction: %v", err)
		writeRegistrationInternalError(w)
		return
	}
	committed = true
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "created",
		"message":   "Organización creada exitosamente. Ya puedes iniciar sesión.",
		"tenant_id": tenantID,
		"user_id":   userID,
		"branch_id": defaultBranchID,
	})
}

func writeRegistrationInternalError(w http.ResponseWriter) {
	w.WriteHeader(http.StatusInternalServerError)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "No fue posible crear la organización"})
}

func isUniqueViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23505"
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

type ResetPasswordRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

// generateResetToken genera un token seguro de 48 bytes en base64 URL-safe
func generateResetToken() (string, error) {
	b := make([]byte, 48)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// sendPasswordResetEmail envía el correo de recuperación via Resend API
func sendPasswordResetEmail(toEmail, toName, resetLink string) error {
	resendKey := os.Getenv("RESEND_API_KEY")
	if resendKey == "" {
		log.Printf("[WARN] RESEND_API_KEY no configurado, simulando envío a %s", toEmail)
		log.Printf("[RESET LINK] %s", resetLink)
		return nil
	}

	htmlBody := fmt.Sprintf(`
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0f172a; margin:0; padding:40px 20px;">
  <div style="max-width:520px; margin:0 auto; background:#1e293b; border-radius:12px; overflow:hidden; border:1px solid #334155;">
    <div style="background:linear-gradient(135deg,#1d4ed8,#0ea5e9); padding:32px; text-align:center;">
      <h1 style="color:#fff; margin:0; font-size:24px; font-weight:700;">SKIA DCIM</h1>
      <p style="color:#bfdbfe; margin:8px 0 0; font-size:13px;">Plataforma de Infraestructura Física</p>
    </div>
    <div style="padding:40px 32px;">
      <h2 style="color:#f1f5f9; font-size:20px; margin:0 0 16px;">Recupera tu contraseña</h2>
      <p style="color:#94a3b8; font-size:15px; line-height:1.6; margin:0 0 24px;">Hola <strong style="color:#e2e8f0;">%s</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta SKIA DCIM.</p>
      <div style="text-align:center; margin:32px 0;">
        <a href="%s" style="display:inline-block; background:linear-gradient(135deg,#1d4ed8,#0ea5e9); color:#fff; text-decoration:none; padding:14px 32px; border-radius:8px; font-size:15px; font-weight:600;">Restablecer contraseña</a>
      </div>
      <p style="color:#64748b; font-size:13px; line-height:1.6; margin:24px 0 0;">Este enlace expirará en <strong>1 hora</strong>. Si no solicitaste este cambio, puedes ignorar este correo.</p>
      <hr style="border:none; border-top:1px solid #334155; margin:24px 0;">
      <p style="color:#475569; font-size:12px; margin:0;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><span style="color:#60a5fa; word-break:break-all;">%s</span></p>
    </div>
    <div style="background:#0f172a; padding:20px 32px; text-align:center;">
      <p style="color:#475569; font-size:12px; margin:0;">© 2025 SKIA DCIM · <a href="https://skia.iamet.mx" style="color:#60a5fa; text-decoration:none;">skia.iamet.mx</a></p>
    </div>
  </div>
</body>
</html>`, toName, resetLink, resetLink)

	payload := map[string]interface{}{
		"from":    "SKIA DCIM <noreply@iamet.mx>",
		"to":      []string{toEmail},
		"subject": "Recupera tu contraseña — SKIA DCIM",
		"html":    htmlBody,
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", "https://api.resend.com/emails", strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+resendKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend error %d: %s", resp.StatusCode, string(respBody))
	}
	log.Printf("✅ Correo de reset enviado a %s via Resend", toEmail)
	return nil
}

func handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	var req ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.Email == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "El correo es obligatorio"})
		return
	}

	// Buscar usuario (respuesta genérica por seguridad)
	var userID, userName string
	err := db.QueryRow(
		"SELECT id, name FROM users WHERE email = $1 AND status = 'active' LIMIT 1",
		req.Email,
	).Scan(&userID, &userName)

	if err == nil {
		// Usuario existe: generar token y guardarlo
		token, tokenErr := generateResetToken()
		if tokenErr == nil {
			expiresAt := time.Now().Add(1 * time.Hour)
			_, dbErr := db.Exec(
				`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
				userID, token, expiresAt,
			)
			if dbErr == nil {
				baseURL := os.Getenv("APP_BASE_URL")
				if baseURL == "" {
					baseURL = "https://skia.iamet.mx"
				}
				resetLink := fmt.Sprintf("%s/reset-password?token=%s", baseURL, token)
				if sendErr := sendPasswordResetEmail(req.Email, userName, resetLink); sendErr != nil {
					log.Printf("[ERROR] Error enviando correo de reset a %s: %v", req.Email, sendErr)
				}
			} else {
				log.Printf("[ERROR] Error guardando token de reset: %v", dbErr)
			}
		}
	}

	// Siempre responder OK (no revelar si el email existe)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Si el correo está registrado, recibirás las instrucciones en breve.",
	})
}

func handleResetPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.Token == "" || req.Password == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Token y contraseña son obligatorios"})
		return
	}
	if len(req.Password) < 6 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "La contraseña debe tener al menos 6 caracteres"})
		return
	}

	// Buscar token válido
	var tokenID, userID string
	var expiresAt time.Time
	var used bool
	err := db.QueryRow(
		`SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token = $1 LIMIT 1`,
		req.Token,
	).Scan(&tokenID, &userID, &expiresAt, &used)

	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Token inválido o expirado"})
		return
	}
	if used {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Este enlace ya fue utilizado"})
		return
	}
	if time.Now().After(expiresAt) {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "El enlace ha expirado. Solicita uno nuevo."})
		return
	}

	// Hashear nueva contraseña
	newHash := hashPassword(req.Password)

	// Actualizar contraseña y marcar token como usado en transacción
	tx, err := db.Begin()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error interno"})
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec("UPDATE users SET password_hash = $1 WHERE id = $2", newHash, userID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error actualizando contraseña"})
		return
	}
	if _, err := tx.Exec("UPDATE password_reset_tokens SET used = TRUE WHERE id = $1", tokenID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error interno"})
		return
	}
	if err := tx.Commit(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error interno"})
		return
	}

	log.Printf("✅ Contraseña restablecida para usuario %s", userID)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Contraseña actualizada correctamente. Ya puedes iniciar sesión.",
	})
}

// ==========================================
// Upload de imágenes
// ==========================================

// makeUploadHandler devuelve un handler que acepta multipart/form-data con
// campo "file", guarda la imagen en uploadsDir y responde con la URL pública.
func makeUploadHandler(uploadsDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		// Límite de 500 MB para PDFs grandes
		if err := r.ParseMultipartForm(500 << 20); err != nil {
			http.Error(w, `{"error":"file too large or bad form"}`, http.StatusBadRequest)
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, `{"error":"field 'file' missing"}`, http.StatusBadRequest)
			return
		}
		defer file.Close()

		// Validar tipo MIME
		ext := strings.ToLower(filepath.Ext(header.Filename))
		allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true, ".pdf": true}
		if !allowed[ext] {
			http.Error(w, `{"error":"unsupported file type"}`, http.StatusBadRequest)
			return
		}

		// Nombre único
		id := uuid.New().String()
		filename := id + ext
		destPath := filepath.Join(uploadsDir, filename)

		dest, err := os.Create(destPath)
		if err != nil {
			log.Printf("Upload: cannot create file %s: %v", destPath, err)
			http.Error(w, `{"error":"server error saving file"}`, http.StatusInternalServerError)
			return
		}
		defer dest.Close()

		if _, err := io.Copy(dest, file); err != nil {
			log.Printf("Upload: error writing file %s: %v", destPath, err)
			http.Error(w, `{"error":"server error writing file"}`, http.StatusInternalServerError)
			return
		}

		// URL pública relativa al backend
		publicURL := "/uploads/" + filename

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"url":      publicURL,
			"filename": filename,
		})
	}
}
