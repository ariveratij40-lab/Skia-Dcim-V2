package main

import (
	"github.com/google/uuid"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/lib/pq"
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
	TenantID string `json:"tenantId"`
	BranchID string `json:"branchId"`
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
	var err error
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://skia:skia@localhost:5432/skia_db?sslmode=disable"
	}

	db, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Error connecting to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Database ping failed: %v", err)
	}

	log.Println("✅ Connected to database")

	// Inicializar SessionStore con PostgreSQL
	if err := InitializeSessionStore(db); err != nil {
		log.Fatalf("Failed to initialize session store: %v", err)
	}

	// Validar que SessionStore está inicializado
	if err := ValidateSessionStoreInitialization(); err != nil {
		log.Fatalf("Session store validation failed: %v", err)
	}

	// Aplicar migraciones pendientes automáticamente
	if err := runMigrations(db); err != nil {
		log.Printf("⚠️  Error en migraciones: %v", err)
	} else {
		log.Println("✅ Migraciones aplicadas")
	}

	// Migrar tabla de historial IA
	migrateAIChatHistory(db)

	// ==========================================
	// Rutas
	// ==========================================

	http.HandleFunc("/api/health", handleHealth)
	http.HandleFunc("/api/dashboard/stats", handleDashboardStats)
	http.HandleFunc("/api/auth/login", handleLogin)
	http.HandleFunc("/api/auth/register", handleRegister)
	http.HandleFunc("/api/auth/forgot-password", handleForgotPassword)
	http.HandleFunc("/api/auth/tenants", handleGetTenants)
	http.HandleFunc("/api/auth/select-tenant", handleSelectTenant)
	http.HandleFunc("/api/auth/select-branch", handleSelectBranch)
	http.HandleFunc("/api/auth/me", handleGetMe)
	http.HandleFunc("/api/navigation/sidebar", handleGetSidebar)
	http.HandleFunc("/api/auth/logout", handleLogout)

	// Rutas DCIM
	dcim := NewDCIMHandler(db)
	http.HandleFunc("/api/dcim/assets", dcim.HandleAssets)
	http.HandleFunc("/api/dcim/assets/", dcim.HandleAssetByID)
	http.HandleFunc("/api/dcim/asset-types", dcim.HandleAssetTypes)
	http.HandleFunc("/api/dcim/locations", dcim.HandleLocations)

	// Infraestructura DCIM — endpoints por módulo
	http.HandleFunc("/api/infra/mdf-idf", handleMdfIdf)
	http.HandleFunc("/api/infra/racks", handleRacks)
	http.HandleFunc("/api/infra/switches", handleSwitches)
	http.HandleFunc("/api/infra/patch-panels", handlePatchPanels)
	http.HandleFunc("/api/infra/ups-pdus", handleUpsPdus)
	http.HandleFunc("/api/infra/backbone", handleBackbone)
	http.HandleFunc("/api/infra/nodos", handleNodos)

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
	http.HandleFunc("/api/ai/chat", handleAIChat)
	http.HandleFunc("/api/ai/history", handleAIChatHistory)
	http.HandleFunc("/api/ai/process-pdf", handleProcessPDFWithAI)

	// Rutas de Importación
	// Ruta principal de creación
	http.HandleFunc("/api/import/inventory", handleImportInventorySecure)
	// Dispatcher para subrutas (detalle, filas, commit)
	http.HandleFunc("/api/import/inventory/", handleInventoryImportRoutes)
	// Estadísticas e historial
	http.HandleFunc("/api/import/stats", handleImportStats)
	http.HandleFunc("/api/import/recent", handleRecentImports)
	http.HandleFunc("/api/dcim/assets/delete", handleDeleteDCIMAsset)
	http.HandleFunc("/api/activos", handleGetActivos)
	http.HandleFunc("/api/activos/by-type", handleGetActivosByType)
	http.HandleFunc("/api/activos/search", handleSearchActivos)
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
	err := db.QueryRow(
		"SELECT id, name, password_hash FROM users WHERE email = $1 AND status = 'active' LIMIT 1",
		req.Email,
	).Scan(&userID, &userName, &passwordHash)
	if err != nil {
		// Respuesta genérica para no revelar si el email existe
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
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
			continue
		}
		tenants = append(tenants, t)
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
			`SELECT ub.branch_id FROM user_branches ub
			 WHERE ub.user_id = $1 LIMIT 1`,
			userID,
		).Scan(&autoBranchID)
		if err != nil && err != sql.ErrNoRows {
			log.Printf("Error fetching branch: %v", err)
		} else if err == sql.ErrNoRows {
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
	}

	// Establecer cookie HttpOnly
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    sessionToken,
		HttpOnly: true,
		Secure:   false, // true en producción con HTTPS
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400, // 24 horas
		Path:     "/",
	})

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

	if err != nil {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
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
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	// SEGURIDAD CRITICA: verificar que el tenant pertenece al usuario
	var belongs bool
	db.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM user_tenants WHERE user_id = $1 AND tenant_id = $2)",
		userID, req.TenantID,
	).Scan(&belongs)
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
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sessionToken := extractSessionToken(r)
	if sessionToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
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
	// Obtener tenant_id de la sesión activa
	var tenantID string
	err := db.QueryRow(
		"SELECT tenant_id FROM sessions WHERE token = $1 AND expires_at > $2",
		sessionToken, time.Now().Unix(),
	).Scan(&tenantID)
	if err != nil || tenantID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	// SEGURIDAD CRITICA: verificar que la branch pertenece al tenant de la sesión
	var belongs bool
	db.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM branches WHERE id = $1 AND tenant_id = $2)",
		req.BranchID, tenantID,
	).Scan(&belongs)
	if !belongs {
		log.Printf("SECURITY: tenant %s attempted to access branch %s without permission", tenantID, req.BranchID)
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	// Actualizar sesión con branch_id validado
	_, err = db.Exec(
		"UPDATE sessions SET branch_id = $1 WHERE token = $2",
		req.BranchID, sessionToken,
	)
	if err != nil {
		log.Printf("ERROR select-branch update session: %v branchID=[%s] token=[%s]", err, req.BranchID, sessionToken)
		http.Error(w, "Error updating session", http.StatusInternalServerError)
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
		db.Exec("DELETE FROM sessions WHERE token = $1", sessionToken)
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
	return fmt.Sprintf("$argon2id$v=19$m=65536,t=1,p=4$%s$%s",
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
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
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
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

func handleRegister(w http.ResponseWriter, r *http.Request) {
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
	err := db.QueryRow("SELECT id FROM users WHERE email = $1", req.Email).Scan(&existingID)
	if err == nil {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "El correo ya está registrado"})
		return
	}
	// Hash de la contraseña
	pwdHash := hashPassword(req.Password)
	// Crear tenant
	tenantID := generateID()
	_, err = db.Exec(
		`INSERT INTO tenants (id, name, logo, created_at) VALUES ($1, $2, '', NOW())`,
		tenantID, req.OrgName,
	)
	if err != nil {
		log.Printf("Error creating tenant: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error al crear la organización: " + err.Error()})
		return
	}
	// Crear usuario con password_hash
	userID := generateID()
	_, err = db.Exec(
		`INSERT INTO users (id, email, name, password_hash, status, created_at) VALUES ($1, $2, $3, $4, 'active', NOW())`,
		userID, req.Email, req.Name, pwdHash,
	)
	if err != nil {
		log.Printf("Error creating user: %v", err)
		// Rollback tenant
		db.Exec("DELETE FROM tenants WHERE id = $1", tenantID)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error al crear el usuario: " + err.Error()})
		return
	}
	// Crear branch (sede) por defecto para el nuevo tenant
	defaultBranchID := generateID()
	_, err = db.Exec(
		`INSERT INTO branches (id, tenant_id, name, city, status, created_at) VALUES ($1, $2, $3, 'Principal', 'active', NOW())`,
		defaultBranchID, tenantID, req.OrgName+" - Sede Principal",
	)
	if err != nil {
		log.Printf("Warning: could not create default branch: %v", err)
		defaultBranchID = ""
	}
	// Asociar usuario con tenant (sin columna role)
	_, err = db.Exec(
		`INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2)`,
		userID, tenantID,
	)
	if err != nil {
		log.Printf("Error creating user_tenant: %v", err)
	}
	// Crear rol admin para el nuevo tenant y asignarlo al usuario
	roleID := generateID()
	_, err = db.Exec(
		`INSERT INTO roles (id, tenant_id, name, description, is_global, created_at)
		 VALUES ($1, $2, 'admin', 'Administrador del Tenant', FALSE, NOW())
		 ON CONFLICT (tenant_id, name) DO UPDATE SET id = roles.id RETURNING id`,
		roleID, tenantID,
	)
	if err != nil {
		// Si falla el RETURNING, obtener el id existente
		db.QueryRow("SELECT id FROM roles WHERE tenant_id = $1 AND name = 'admin'", tenantID).Scan(&roleID)
	}
	// Asignar rol al usuario
	if roleID != "" {
		_, err = db.Exec(
			`INSERT INTO user_roles (id, user_id, tenant_id, role_id, created_at)
			 VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT DO NOTHING`,
			generateID(), userID, tenantID, roleID,
		)
		if err != nil {
			log.Printf("Error assigning role: %v", err)
		}
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "created",
		"message":   "Organización creada exitosamente. Ya puedes iniciar sesión.",
		"tenant_id": tenantID,
		"user_id":   userID,
		"branch_id": defaultBranchID,
	})
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

func handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
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
	// Siempre responder OK (seguridad: no revelar si el email existe)
	// En producción aquí se enviaría el correo con el enlace de reset
	log.Printf("Password reset requested for: %s", req.Email)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": "Si el correo está registrado, recibirás las instrucciones en breve.",
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
