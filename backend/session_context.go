package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"
)

// ============================================================
// ESTRUCTURA SessionContext
// ============================================================

// SessionContext contiene información de la sesión validada
type SessionContext struct {
	SessionID   string
	UserID      string
	TenantID    string
	BranchID    string
	Email       string
	UserName    string
	Roles       []string
	Permissions map[string]bool
}

// ============================================================
// ERRORES DE SESIÓN
// ============================================================

var (
	ErrNoSession       = errors.New("no session")
	ErrInvalidSession  = errors.New("invalid session")
	ErrExpiredSession  = errors.New("expired session")
	ErrForbidden       = errors.New("forbidden")
)

// ============================================================
// VARIABLE GLOBAL sessionStore
// ============================================================

// sessionStore es la instancia global del store de sesiones
// Se inicializa en main() con PostgresSessionStore
var sessionStore SessionStore

// SetSessionStore establece el store de sesiones (para pruebas)
func SetSessionStore(store SessionStore) {
	sessionStore = store
}

// ============================================================
// FUNCIÓN requireSessionContext (WRAPPER)
// ============================================================

// requireSessionContext valida sesión usando el store global
func requireSessionContext(
	ctx context.Context,
	r *http.Request,
	requiredPermission string,
) (*SessionContext, error) {
	if sessionStore == nil {
		return nil, ErrInternalError
	}
	return requireSessionContextWithStore(ctx, r, requiredPermission, sessionStore)
}

// ============================================================
// FUNCIÓN requireSessionContext CON INYECCIÓN
// ============================================================

// requireSessionContextWithStore valida sesión usando SessionStore inyectado
// Implementa 12 pasos de validación sin acoplamiento global
func requireSessionContextWithStore(
	ctx context.Context,
	r *http.Request,
	requiredPermission string,
	store SessionStore,
) (*SessionContext, error) {
	// PASO 1: Leer cookie session_token
	cookie, err := r.Cookie("session_token")
	if err != nil {
		return nil, ErrNoSession
	}

	// PASO 2: Rechazar cookie inexistente o vacía
	token := cookie.Value
	if token == "" {
		return nil, ErrNoSession
	}

	// PASO 3: Consultar tabla sessions usando store
	storedSession, err := store.FindSessionByToken(ctx, token)
	if err != nil {
		if errors.Is(err, ErrSessionNotFound) {
			return nil, ErrInvalidSession
		}
		return nil, ErrInternalError
	}

	// PASO 4: Verificar que no esté revocada
	if storedSession.Revoked {
		return nil, ErrExpiredSession
	}

	// PASO 5: Verificar expiración
	if time.Now().After(storedSession.ExpiresAt) {
		return nil, ErrExpiredSession
	}

	// PASO 6: Obtener usuario activo
	userInfo, err := store.GetUserInfo(ctx, storedSession.UserID)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return nil, ErrInvalidSession
		}
		return nil, ErrInternalError
	}

	// PASO 7: Confirmar que usuario no esté deshabilitado
	if userInfo.Disabled || userInfo.Status != "active" {
		return nil, ErrUserDisabled
	}

	// PASO 8: Resolver tenant activo autorizado
	if storedSession.TenantID == "" {
		return nil, ErrNoActiveTenant
	}

	hasTenantAccess, err := store.UserHasTenantAccess(ctx, storedSession.UserID, storedSession.TenantID)
	if err != nil {
		return nil, ErrInternalError
	}
	if !hasTenantAccess {
		return nil, ErrForbidden
	}

	// PASO 9: Resolver sucursal activa autorizada
	if storedSession.BranchID == "" {
		return nil, ErrNoActiveBranch
	}

	hasBranchAccess, err := store.UserHasBranchAccess(
		ctx,
		storedSession.UserID,
		storedSession.TenantID,
		storedSession.BranchID,
	)
	if err != nil {
		return nil, ErrInternalError
	}
	if !hasBranchAccess {
		return nil, ErrForbidden
	}

	// PASO 10: Obtener roles
	roles, err := store.LoadRoles(ctx, storedSession.UserID, storedSession.TenantID)
	if err != nil {
		return nil, ErrInternalError
	}

	// PASO 11: Obtener permisos
	permissions, err := store.LoadPermissions(ctx, storedSession.UserID, storedSession.TenantID)
	if err != nil {
		return nil, ErrInternalError
	}

	// PASO 12: Validar permiso requerido si se especificó
	if requiredPermission != "" {
		if !permissions[requiredPermission] {
			return nil, ErrPermissionDenied
		}
	}

	// Devolver contexto inmutable
	sessionCtx := &SessionContext{
		SessionID:   storedSession.SessionID,
		UserID:      storedSession.UserID,
		TenantID:    storedSession.TenantID,
		BranchID:    storedSession.BranchID,
		Email:       userInfo.Email,
		UserName:    userInfo.UserName,
		Roles:       roles,
		Permissions: permissions,
	}

	return sessionCtx, nil
}

// ============================================================
// HELPERS PARA TRADUCCIÓN DE ERRORES
// ============================================================

// translateSessionError traduce errores de sesión a códigos HTTP
func translateSessionError(err error) (int, string) {
	switch err {
	case ErrNoSession, ErrInvalidSession, ErrExpiredSession, ErrUserDisabled:
		return http.StatusUnauthorized, "Unauthorized"
	case ErrForbidden, ErrPermissionDenied, ErrNoActiveTenant, ErrNoActiveBranch:
		return http.StatusForbidden, "Forbidden"
	case ErrInternalError:
		return http.StatusInternalServerError, "Internal Server Error"
	default:
		return http.StatusInternalServerError, "Internal Server Error"
	}
}

// writeSessionError escribe error de sesión como respuesta HTTP
func writeSessionError(w http.ResponseWriter, err error) {
	code, message := translateSessionError(err)
	w.WriteHeader(code)
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"error":"%s"}`, message)
}

// ============================================================
// VALIDACIÓN DE PERMISOS
// ============================================================

// requirePermission valida que el contexto tenga un permiso específico
func requirePermission(session *SessionContext, permission string) error {
	if session == nil {
		return ErrInternalError
	}

	if !session.Permissions[permission] {
		return ErrPermissionDenied
	}

	return nil
}


