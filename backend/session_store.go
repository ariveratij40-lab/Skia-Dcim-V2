package main

import (
	"context"
	"errors"
	"time"
)

// ============================================================
// INTERFAZ SessionStore
// ============================================================

// SessionStore define la interfaz para acceso a datos de sesión
// Permite inyección de dependencias y facilita pruebas
type SessionStore interface {
	// FindSessionByToken busca una sesión por token
	FindSessionByToken(
		ctx context.Context,
		token string,
	) (*StoredSession, error)

	// UserHasTenantAccess verifica si un usuario tiene acceso a un tenant
	UserHasTenantAccess(
		ctx context.Context,
		userID string,
		tenantID string,
	) (bool, error)

	// UserHasBranchAccess verifica si un usuario tiene acceso a una sucursal
	UserHasBranchAccess(
		ctx context.Context,
		userID string,
		tenantID string,
		branchID string,
	) (bool, error)

	// LoadRoles carga los roles de un usuario en un tenant
	LoadRoles(
		ctx context.Context,
		userID string,
		tenantID string,
	) ([]string, error)

	// LoadPermissions carga los permisos de un usuario en un tenant
	LoadPermissions(
		ctx context.Context,
		userID string,
		tenantID string,
	) (map[string]bool, error)

	// GetUserInfo obtiene información del usuario
	GetUserInfo(
		ctx context.Context,
		userID string,
	) (*UserInfo, error)
}

// ============================================================
// ESTRUCTURAS DE DATOS
// ============================================================

// StoredSession representa una sesión almacenada en BD
type StoredSession struct {
	SessionID string
	UserID    string
	TenantID  string
	BranchID  string
	Revoked   bool
	ExpiresAt time.Time
	CreatedAt time.Time
}

// UserInfo representa información de usuario para sesión
type UserInfo struct {
	UserID   string
	Email    string
	UserName string
	Disabled bool
	Status   string
}

// ============================================================
// ERRORES PERSONALIZADOS
// ============================================================

var (
	ErrSessionNotFound    = errors.New("session not found")
	ErrSessionRevoked     = errors.New("session revoked")
	ErrSessionExpired     = errors.New("session expired")
	ErrUserNotFound       = errors.New("user not found")
	ErrUserDisabled       = errors.New("user disabled")
	ErrTenantNotFound     = errors.New("tenant not found")
	ErrBranchNotFound     = errors.New("branch not found")
	ErrAccessDenied       = errors.New("access denied")
	ErrDatabaseError      = errors.New("database error")
	ErrInvalidToken       = errors.New("invalid token")
	ErrNoActiveTenant     = errors.New("no active tenant")
	ErrNoActiveBranch     = errors.New("no active branch")
	ErrPermissionDenied   = errors.New("permission denied")
	ErrInternalError      = errors.New("internal server error")
)
