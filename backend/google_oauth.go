package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// ==========================================
// Google OAuth2 - Configuración
// ==========================================

func getGoogleClientID() string {
	v := os.Getenv("GOOGLE_CLIENT_ID")
	if v == "" {
		log.Println("⚠️  GOOGLE_CLIENT_ID no configurado")
	}
	return v
}

func getGoogleClientSecret() string {
	v := os.Getenv("GOOGLE_CLIENT_SECRET")
	if v == "" {
		log.Println("⚠️  GOOGLE_CLIENT_SECRET no configurado")
	}
	return v
}

func getGoogleRedirectURL() string {
	v := os.Getenv("GOOGLE_REDIRECT_URL")
	if v == "" {
		v = "https://skia.iamet.mx/api/auth/google/callback"
	}
	return v
}

func getFrontendURL() string {
	v := os.Getenv("FRONTEND_URL")
	if v == "" {
		v = "https://skia.iamet.mx"
	}
	return v
}

// ==========================================
// Tipos de datos Google OAuth
// ==========================================

type GoogleUserInfo struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	VerifiedEmail bool   `json:"verified_email"`
}

// ==========================================
// Handler: Iniciar flujo OAuth con Google
// GET /api/auth/google
// ==========================================

func handleGoogleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	clientID := getGoogleClientID()
	if clientID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Google OAuth no está configurado en el servidor",
		})
		return
	}

	// Generar state anti-CSRF
	state := generateOpaqueToken()

	// Guardar state en cookie temporal (10 minutos)
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   600,
		Path:     "/",
	})

	// Construir URL de autorización de Google
	params := url.Values{}
	params.Set("client_id", clientID)
	params.Set("redirect_uri", getGoogleRedirectURL())
	params.Set("response_type", "code")
	params.Set("scope", "openid email profile")
	params.Set("state", state)
	params.Set("access_type", "offline")
	params.Set("prompt", "select_account")

	authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode()

	http.Redirect(w, r, authURL, http.StatusFound)
}

// ==========================================
// Handler: Callback de Google OAuth
// GET /api/auth/google/callback
// ==========================================

func handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	frontendURL := getFrontendURL()

	// Verificar error de Google
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		log.Printf("Google OAuth error: %s", errParam)
		http.Redirect(w, r, frontendURL+"/login?error=google_denied", http.StatusFound)
		return
	}

	// Verificar state anti-CSRF
	stateParam := r.URL.Query().Get("state")
	stateCookie, err := r.Cookie("oauth_state")
	if err != nil || stateParam == "" || stateCookie.Value != stateParam {
		log.Printf("OAuth state mismatch: cookie=%v param=%s", err, stateParam)
		http.Redirect(w, r, frontendURL+"/login?error=state_mismatch", http.StatusFound)
		return
	}

	// Limpiar cookie de state
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    "",
		HttpOnly: true,
		MaxAge:   -1,
		Path:     "/",
	})

	// Obtener código de autorización
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Redirect(w, r, frontendURL+"/login?error=no_code", http.StatusFound)
		return
	}

	// Intercambiar código por tokens
	accessToken, err := exchangeCodeForToken(code)
	if err != nil {
		log.Printf("Error exchanging code for token: %v", err)
		http.Redirect(w, r, frontendURL+"/login?error=token_exchange", http.StatusFound)
		return
	}

	// Obtener información del usuario de Google
	googleUser, err := getGoogleUserInfo(accessToken)
	if err != nil {
		log.Printf("Error getting Google user info: %v", err)
		http.Redirect(w, r, frontendURL+"/login?error=user_info", http.StatusFound)
		return
	}

	if !googleUser.VerifiedEmail {
		http.Redirect(w, r, frontendURL+"/login?error=email_not_verified", http.StatusFound)
		return
	}

	// Buscar o crear usuario en la base de datos
	sessionToken, redirectPath, err := findOrCreateGoogleUser(googleUser)
	if err != nil {
		log.Printf("Error processing Google user: %v", err)
		http.Redirect(w, r, frontendURL+"/login?error=server_error", http.StatusFound)
		return
	}

	// Establecer cookie de sesión
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    sessionToken,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400,
		Path:     "/",
	})

	// Redirigir al frontend con el path correspondiente
	http.Redirect(w, r, frontendURL+redirectPath, http.StatusFound)
}

// ==========================================
// Intercambiar código por access_token
// ==========================================

func exchangeCodeForToken(code string) (string, error) {
	data := url.Values{}
	data.Set("code", code)
	data.Set("client_id", getGoogleClientID())
	data.Set("client_secret", getGoogleClientSecret())
	data.Set("redirect_uri", getGoogleRedirectURL())
	data.Set("grant_type", "authorization_code")

	resp, err := http.PostForm("https://oauth2.googleapis.com/token", data)
	if err != nil {
		return "", fmt.Errorf("error calling token endpoint: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("error reading token response: %w", err)
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", fmt.Errorf("error parsing token response: %w", err)
	}

	if tokenResp.Error != "" {
		return "", fmt.Errorf("token error: %s - %s", tokenResp.Error, tokenResp.ErrorDesc)
	}

	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("empty access token received")
	}

	return tokenResp.AccessToken, nil
}

// ==========================================
// Obtener información del usuario de Google
// ==========================================

func getGoogleUserInfo(accessToken string) (*GoogleUserInfo, error) {
	req, err := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error calling userinfo endpoint: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading userinfo response: %w", err)
	}

	var userInfo GoogleUserInfo
	if err := json.Unmarshal(body, &userInfo); err != nil {
		return nil, fmt.Errorf("error parsing userinfo: %w", err)
	}

	if userInfo.Email == "" {
		return nil, fmt.Errorf("empty email from Google")
	}

	return &userInfo, nil
}

// ==========================================
// Buscar o crear usuario Google en la BD
// Retorna: sessionToken, redirectPath, error
// ==========================================

func findOrCreateGoogleUser(googleUser *GoogleUserInfo) (string, string, error) {
	// 1. Buscar si el usuario ya existe
	var userID, userName string
	err := db.QueryRow(
		"SELECT id, name FROM users WHERE email = $1 AND status = 'active' LIMIT 1",
		googleUser.Email,
	).Scan(&userID, &userName)

	isNewUser := false
	var tenantID string
	var branchID string

	if err == sql.ErrNoRows {
		// Usuario nuevo: crear tenant, usuario, branch, roles
		isNewUser = true
		var createErr error
		userID, tenantID, branchID, createErr = createNewGoogleTenant(googleUser)
		if createErr != nil {
			return "", "", fmt.Errorf("error creating new tenant: %w", createErr)
		}
		userName = googleUser.Name
	} else if err != nil {
		return "", "", fmt.Errorf("error querying user: %w", err)
	} else {
		// Usuario existente: obtener su tenant y branch
		err = db.QueryRow(
			`SELECT ut.tenant_id FROM user_tenants ut WHERE ut.user_id = $1 LIMIT 1`,
			userID,
		).Scan(&tenantID)
		if err != nil && err != sql.ErrNoRows {
			log.Printf("Warning: could not get tenant for user %s: %v", userID, err)
		}

		if tenantID != "" {
			err = db.QueryRow(
				`SELECT ub.branch_id FROM user_branches ub WHERE ub.user_id = $1 LIMIT 1`,
				userID,
			).Scan(&branchID)
			if err != nil && err != sql.ErrNoRows {
				log.Printf("Warning: could not get branch for user %s: %v", userID, err)
			}
		}
	}

	// 2. Crear sesión
	sessionToken := generateOpaqueToken()
	sessionID := generateID()

	if tenantID != "" && branchID != "" {
		_, err = db.Exec(
			`INSERT INTO sessions (id, user_id, token, tenant_id, branch_id, expires_at, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
			sessionID, userID, sessionToken, tenantID, branchID,
			time.Now().Add(24*time.Hour).Unix(),
		)
	} else if tenantID != "" {
		_, err = db.Exec(
			`INSERT INTO sessions (id, user_id, token, tenant_id, expires_at, created_at)
			 VALUES ($1, $2, $3, $4, $5, NOW())`,
			sessionID, userID, sessionToken, tenantID,
			time.Now().Add(24*time.Hour).Unix(),
		)
	} else {
		_, err = db.Exec(
			`INSERT INTO sessions (id, user_id, token, expires_at, created_at)
			 VALUES ($1, $2, $3, $4, NOW())`,
			sessionID, userID, sessionToken,
			time.Now().Add(24*time.Hour).Unix(),
		)
	}

	if err != nil {
		return "", "", fmt.Errorf("error creating session: %w", err)
	}

	log.Printf("✅ Google OAuth: user=%s email=%s new=%v tenant=%s branch=%s",
		userID, googleUser.Email, isNewUser, tenantID, branchID)

	// 3. Determinar redirect
	redirectPath := "/dashboard"
	if tenantID == "" {
		redirectPath = "/select-tenant"
	} else if branchID == "" {
		redirectPath = "/select-branch"
	}

	return sessionToken, redirectPath, nil
}

// ==========================================
// Crear nuevo tenant para usuario de Google
// ==========================================

func createNewGoogleTenant(googleUser *GoogleUserInfo) (userID, tenantID, branchID string, err error) {
	// Derivar nombre de organización del email
	emailParts := strings.Split(googleUser.Email, "@")
	orgName := googleUser.Name
	if len(emailParts) > 1 {
		domain := emailParts[1]
		// Remover extensión (.com, .mx, etc.)
		domainParts := strings.Split(domain, ".")
		if len(domainParts) > 0 {
			orgName = strings.Title(domainParts[0])
		}
	}

	// Crear tenant
	tenantID = generateID()
	_, err = db.Exec(
		`INSERT INTO tenants (id, name, logo, status, created_at) VALUES ($1, $2, '', 'active', NOW())`,
		tenantID, orgName,
	)
	if err != nil {
		return "", "", "", fmt.Errorf("error creating tenant: %w", err)
	}

	// Crear usuario (sin password, autenticado por Google)
	userID = generateID()
	// Generar un password_hash vacío/placeholder para usuarios OAuth
	placeholderHash := "$google_oauth$" + googleUser.ID
	_, err = db.Exec(
		`INSERT INTO users (id, email, name, password_hash, status, created_at)
		 VALUES ($1, $2, $3, $4, 'active', NOW())`,
		userID, googleUser.Email, googleUser.Name, placeholderHash,
	)
	if err != nil {
		// Rollback tenant
		db.Exec("DELETE FROM tenants WHERE id = $1", tenantID)
		return "", "", "", fmt.Errorf("error creating user: %w", err)
	}

	// Crear branch por defecto
	branchID = generateID()
	_, err = db.Exec(
		`INSERT INTO branches (id, tenant_id, name, city, status, created_at)
		 VALUES ($1, $2, $3, 'Principal', 'active', NOW())`,
		branchID, tenantID, orgName+" - Sede Principal",
	)
	if err != nil {
		log.Printf("Warning: could not create default branch: %v", err)
		branchID = ""
	}

	// Asociar usuario con tenant
	_, err = db.Exec(
		`INSERT INTO user_tenants (id, user_id, tenant_id, created_at) VALUES ($1, $2, $3, NOW())`,
		generateID(), userID, tenantID,
	)
	if err != nil {
		log.Printf("Warning: could not create user_tenant: %v", err)
	}

	// Asociar usuario con branch
	if branchID != "" {
		_, err = db.Exec(
			`INSERT INTO user_branches (id, user_id, branch_id, created_at) VALUES ($1, $2, $3, NOW())`,
			generateID(), userID, branchID,
		)
		if err != nil {
			log.Printf("Warning: could not create user_branch: %v", err)
		}
	}

	// Crear rol admin para el nuevo tenant
	roleID := generateID()
	_, err = db.Exec(
		`INSERT INTO roles (id, tenant_id, name, description, is_global, created_at)
		 VALUES ($1, $2, 'admin', 'Administrador del Tenant', FALSE, NOW())
		 ON CONFLICT (tenant_id, name) DO UPDATE SET id = roles.id`,
		roleID, tenantID,
	)
	if err != nil {
		// Obtener el id existente si hubo conflicto
		db.QueryRow("SELECT id FROM roles WHERE tenant_id = $1 AND name = 'admin'", tenantID).Scan(&roleID)
	}

	// Asignar rol admin al usuario
	if roleID != "" {
		_, err = db.Exec(
			`INSERT INTO user_roles (id, user_id, tenant_id, role_id, created_at)
			 VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT DO NOTHING`,
			generateID(), userID, tenantID, roleID,
		)
		if err != nil {
			log.Printf("Warning: could not assign role: %v", err)
		}
	}

	return userID, tenantID, branchID, nil
}
