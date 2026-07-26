package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// ============================================================
// PRUEBAS DE SESIÓN COMPLETAS (SIN OMISIONES)
// ============================================================

// TestRequireSessionContext_NoCookie prueba rechazo sin cookie
func TestRequireSessionContext_NoCookie(t *testing.T) {
	store := NewFakeSessionStore()
	req := httptest.NewRequest("GET", "/api/test", nil)
	ctx := context.Background()

	session, err := requireSessionContextWithStore(ctx, req, "", store)

	if err != ErrNoSession {
		t.Errorf("Expected ErrNoSession, got %v", err)
	}
	if session != nil {
		t.Errorf("Expected nil session, got %v", session)
	}
}

// TestRequireSessionContext_EmptyCookie prueba rechazo con cookie vacía
func TestRequireSessionContext_EmptyCookie(t *testing.T) {
	store := NewFakeSessionStore()
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: "",
	})
	ctx := context.Background()

	session, err := requireSessionContextWithStore(ctx, req, "", store)

	if err != ErrNoSession {
		t.Errorf("Expected ErrNoSession, got %v", err)
	}
	if session != nil {
		t.Errorf("Expected nil session, got %v", session)
	}
}

// TestRequireSessionContext_InvalidToken prueba token inexistente
func TestRequireSessionContext_InvalidToken(t *testing.T) {
	store := NewFakeSessionStore()
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: "invalid_token_12345",
	})
	ctx := context.Background()

	session, err := requireSessionContextWithStore(ctx, req, "", store)

	if err != ErrInvalidSession {
		t.Errorf("Expected ErrInvalidSession, got %v", err)
	}
	if session != nil {
		t.Errorf("Expected nil session, got %v", session)
	}
}

// TestRequireSessionContext_ExpiredToken prueba token expirado
func TestRequireSessionContext_ExpiredToken(t *testing.T) {
	store := NewFakeSessionStore()

	// Crear sesión expirada
	expiredSession := CreateExpiredSession("user-1", "tenant-1", "branch-1")
	store.AddSession(expiredSession)

	// Crear usuario activo
	userInfo := CreateActiveUser("user-1", "user@example.com")
	store.AddUser(userInfo)

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: expiredSession.SessionID,
	})
	ctx := context.Background()

	session, err := requireSessionContextWithStore(ctx, req, "", store)

	if err != ErrExpiredSession {
		t.Errorf("Expected ErrExpiredSession, got %v", err)
	}
	if session != nil {
		t.Errorf("Expected nil session, got %v", session)
	}
}

// TestRequireSessionContext_RevokedSession prueba sesión revocada
func TestRequireSessionContext_RevokedSession(t *testing.T) {
	store := NewFakeSessionStore()

	// Crear sesión revocada
	revokedSession := CreateRevokedSession("user-1", "tenant-1", "branch-1")
	store.AddSession(revokedSession)

	// Crear usuario activo
	userInfo := CreateActiveUser("user-1", "user@example.com")
	store.AddUser(userInfo)

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: revokedSession.SessionID,
	})
	ctx := context.Background()

	session, err := requireSessionContextWithStore(ctx, req, "", store)

	if err != ErrExpiredSession {
		t.Errorf("Expected ErrExpiredSession, got %v", err)
	}
	if session != nil {
		t.Errorf("Expected nil session, got %v", session)
	}
}

// TestRequireSessionContext_DisabledUser prueba usuario deshabilitado
func TestRequireSessionContext_DisabledUser(t *testing.T) {
	store := NewFakeSessionStore()

	// Crear sesión válida
	validSession := CreateValidSession("user-1", "tenant-1", "branch-1")
	store.AddSession(validSession)

	// Crear usuario deshabilitado
	userInfo := CreateDisabledUser("user-1", "user@example.com")
	store.AddUser(userInfo)

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: validSession.SessionID,
	})
	ctx := context.Background()

	session, err := requireSessionContextWithStore(ctx, req, "", store)

	if err != ErrUserDisabled {
		t.Errorf("Expected ErrUserDisabled, got %v", err)
	}
	if session != nil {
		t.Errorf("Expected nil session, got %v", session)
	}
}

// TestRequireSessionContext_UnauthorizedTenant prueba tenant no autorizado
func TestRequireSessionContext_UnauthorizedTenant(t *testing.T) {
	store := NewFakeSessionStore()

	// Crear sesión válida
	validSession := CreateValidSession("user-1", "tenant-1", "branch-1")
	store.AddSession(validSession)

	// Crear usuario activo
	userInfo := CreateActiveUser("user-1", "user@example.com")
	store.AddUser(userInfo)

	// NO dar acceso al tenant
	store.SetTenantAccess("user-1", "tenant-1", false)

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: validSession.SessionID,
	})
	ctx := context.Background()

	session, err := requireSessionContextWithStore(ctx, req, "", store)

	if err != ErrForbidden {
		t.Errorf("Expected ErrForbidden, got %v", err)
	}
	if session != nil {
		t.Errorf("Expected nil session, got %v", session)
	}
}

// TestRequireSessionContext_UnauthorizedBranch prueba branch no autorizado
func TestRequireSessionContext_UnauthorizedBranch(t *testing.T) {
	store := NewFakeSessionStore()

	// Crear sesión válida
	validSession := CreateValidSession("user-1", "tenant-1", "branch-1")
	store.AddSession(validSession)

	// Crear usuario activo
	userInfo := CreateActiveUser("user-1", "user@example.com")
	store.AddUser(userInfo)

	// Dar acceso al tenant
	store.SetTenantAccess("user-1", "tenant-1", true)

	// NO dar acceso al branch
	store.SetBranchAccess("user-1", "tenant-1", "branch-1", false)

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: validSession.SessionID,
	})
	ctx := context.Background()

	session, err := requireSessionContextWithStore(ctx, req, "", store)

	if err != ErrForbidden {
		t.Errorf("Expected ErrForbidden, got %v", err)
	}
	if session != nil {
		t.Errorf("Expected nil session, got %v", session)
	}
}

// TestRequireSessionContext_NoPermission prueba usuario sin permiso
func TestRequireSessionContext_NoPermission(t *testing.T) {
	store := NewFakeSessionStore()

	// Crear sesión válida
	validSession := CreateValidSession("user-1", "tenant-1", "branch-1")
	store.AddSession(validSession)

	// Crear usuario activo
	userInfo := CreateActiveUser("user-1", "user@example.com")
	store.AddUser(userInfo)

	// Dar acceso a tenant y branch
	store.SetTenantAccess("user-1", "tenant-1", true)
	store.SetBranchAccess("user-1", "tenant-1", "branch-1", true)

	// Dar roles
	store.SetRoles("user-1", "tenant-1", []string{"viewer"})

	// Dar permisos pero NO el requerido
	store.SetPermissions("user-1", "tenant-1", map[string]bool{
		"inventory.import.read": true,
	})

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: validSession.SessionID,
	})
	ctx := context.Background()

	session, err := requireSessionContextWithStore(ctx, req, "inventory.import.create", store)

	if err != ErrPermissionDenied {
		t.Errorf("Expected ErrPermissionDenied, got %v", err)
	}
	if session != nil {
		t.Errorf("Expected nil session, got %v", session)
	}
}

// TestRequireSessionContext_ValidSession prueba sesión válida completa
func TestRequireSessionContext_ValidSession(t *testing.T) {
	store := NewFakeSessionStore()

	// Crear sesión válida
	validSession := CreateValidSession("user-1", "tenant-1", "branch-1")
	store.AddSession(validSession)

	// Crear usuario activo
	userInfo := CreateActiveUser("user-1", "user@example.com")
	store.AddUser(userInfo)

	// Dar acceso a tenant y branch
	store.SetTenantAccess("user-1", "tenant-1", true)
	store.SetBranchAccess("user-1", "tenant-1", "branch-1", true)

	// Dar roles y permisos
	store.SetRoles("user-1", "tenant-1", []string{"admin", "editor"})
	store.SetPermissions("user-1", "tenant-1", map[string]bool{
		"inventory.import.create": true,
		"inventory.import.read":   true,
		"inventory.import.stats":  true,
		"inventory.import.commit": true,
	})

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: validSession.SessionID,
	})
	ctx := context.Background()

	session, err := requireSessionContextWithStore(ctx, req, "inventory.import.create", store)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if session == nil {
		t.Errorf("Expected session, got nil")
	}
	if session.UserID != "user-1" {
		t.Errorf("Expected UserID 'user-1', got %s", session.UserID)
	}
	if session.TenantID != "tenant-1" {
		t.Errorf("Expected TenantID 'tenant-1', got %s", session.TenantID)
	}
	if session.BranchID != "branch-1" {
		t.Errorf("Expected BranchID 'branch-1', got %s", session.BranchID)
	}
	if !session.Permissions["inventory.import.create"] {
		t.Errorf("Expected permission 'inventory.import.create'")
	}
}

// TestRequireSessionContext_SpecialCharacters prueba token con caracteres especiales
func TestRequireSessionContext_SpecialCharacters(t *testing.T) {
	store := NewFakeSessionStore()

	// Probar múltiples tokens con caracteres especiales
	specialTokens := []string{
		"token'with'quotes",
		`token"with"doublequotes`,
		"token;with;semicolons",
		"token--with--dashes",
		"token/*with*/comments",
		"token%00with%00null",
		"token\u0000with\u0000unicode",
		"token with spaces",
		"very_long_token_" + string(make([]byte, 1000)),
	}

	for _, token := range specialTokens {
		req := httptest.NewRequest("GET", "/api/test", nil)
		req.AddCookie(&http.Cookie{
			Name:  "session_token",
			Value: token,
		})
		ctx := context.Background()

		session, err := requireSessionContextWithStore(ctx, req, "", store)

		// Debe rechazar sin panic
		if err != ErrInvalidSession {
			t.Errorf("Token %q: expected ErrInvalidSession, got %v", token, err)
		}
		if session != nil {
			t.Errorf("Token %q: expected nil session, got %v", token, session)
		}
	}
}

// TestRequireSessionContext_DatabaseError prueba error de BD
func TestRequireSessionContext_DatabaseError(t *testing.T) {
	store := NewFakeSessionStore()

	// Crear sesión válida
	validSession := CreateValidSession("user-1", "tenant-1", "branch-1")
	store.AddSession(validSession)

	// Simular error en GetUserInfo
	store.SetError("GetUserInfo", "user-1", ErrDatabaseError)

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: validSession.SessionID,
	})
	ctx := context.Background()

	session, err := requireSessionContextWithStore(ctx, req, "", store)

	if err != ErrInternalError {
		t.Errorf("Expected ErrInternalError, got %v", err)
	}
	if session != nil {
		t.Errorf("Expected nil session, got %v", session)
	}
}

// TestRequireSessionContext_NoActiveTenant prueba sin tenant activo
func TestRequireSessionContext_NoActiveTenant(t *testing.T) {
	store := NewFakeSessionStore()

	// Crear sesión sin tenant
	session := &StoredSession{
		SessionID: "session-no-tenant",
		UserID:    "user-1",
		TenantID:  "",
		BranchID:  "branch-1",
		Revoked:   false,
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
	}
	store.AddSession(session)

	// Crear usuario activo
	userInfo := CreateActiveUser("user-1", "user@example.com")
	store.AddUser(userInfo)

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: session.SessionID,
	})
	ctx := context.Background()

	sess, err := requireSessionContextWithStore(ctx, req, "", store)

	if err != ErrNoActiveTenant {
		t.Errorf("Expected ErrNoActiveTenant, got %v", err)
	}
	if sess != nil {
		t.Errorf("Expected nil session, got %v", sess)
	}
}

// TestRequireSessionContext_NoActiveBranch prueba sin branch activo
func TestRequireSessionContext_NoActiveBranch(t *testing.T) {
	store := NewFakeSessionStore()

	// Crear sesión sin branch
	session := &StoredSession{
		SessionID: "session-no-branch",
		UserID:    "user-1",
		TenantID:  "tenant-1",
		BranchID:  "",
		Revoked:   false,
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
	}
	store.AddSession(session)

	// Crear usuario activo
	userInfo := CreateActiveUser("user-1", "user@example.com")
	store.AddUser(userInfo)

	// Dar acceso al tenant
	store.SetTenantAccess("user-1", "tenant-1", true)

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session_token",
		Value: session.SessionID,
	})
	ctx := context.Background()

	sess, err := requireSessionContextWithStore(ctx, req, "", store)

	if err != ErrNoActiveBranch {
		t.Errorf("Expected ErrNoActiveBranch, got %v", err)
	}
	if sess != nil {
		t.Errorf("Expected nil session, got %v", sess)
	}
}

// ============================================================
// PRUEBAS DE TRADUCCIÓN DE ERRORES
// ============================================================

// TestTranslateSessionError prueba traducción de errores a HTTP
func TestTranslateSessionError(t *testing.T) {
	tests := []struct {
		err        error
		statusCode int
	}{
		{ErrNoSession, http.StatusUnauthorized},
		{ErrInvalidSession, http.StatusUnauthorized},
		{ErrExpiredSession, http.StatusUnauthorized},
		{ErrUserDisabled, http.StatusUnauthorized},
		{ErrForbidden, http.StatusForbidden},
		{ErrPermissionDenied, http.StatusForbidden},
		{ErrNoActiveTenant, http.StatusForbidden},
		{ErrNoActiveBranch, http.StatusForbidden},
		{ErrInternalError, http.StatusInternalServerError},
	}

	for _, test := range tests {
		code, _ := translateSessionError(test.err)
		if code != test.statusCode {
			t.Errorf("Error %v: expected status %d, got %d", test.err, test.statusCode, code)
		}
	}
}

// TestRequirePermission prueba validación de permisos
func TestRequirePermission(t *testing.T) {
	tests := []struct {
		name       string
		session    *SessionContext
		permission string
		shouldFail bool
	}{
		{
			name:       "Nil session",
			session:    nil,
			permission: "inventory.import.create",
			shouldFail: true,
		},
		{
			name: "Permission exists",
			session: &SessionContext{
				Permissions: map[string]bool{
					"inventory.import.create": true,
				},
			},
			permission: "inventory.import.create",
			shouldFail: false,
		},
		{
			name: "Permission not exists",
			session: &SessionContext{
				Permissions: map[string]bool{
					"inventory.import.read": true,
				},
			},
			permission: "inventory.import.create",
			shouldFail: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := requirePermission(test.session, test.permission)
			if test.shouldFail && err == nil {
				t.Errorf("Expected error, got nil")
			}
			if !test.shouldFail && err != nil {
				t.Errorf("Expected no error, got %v", err)
			}
		})
	}
}
