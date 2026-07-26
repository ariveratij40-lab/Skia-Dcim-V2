package main

import (
	"context"
	"fmt"
	"time"
)

// ============================================================
// FakeSessionStore
// ============================================================

// FakeSessionStore implementa SessionStore para pruebas
type FakeSessionStore struct {
	sessions     map[string]*StoredSession
	users        map[string]*UserInfo
	tenantAccess map[string]bool
	branchAccess map[string]bool
	roles        map[string][]string
	permissions  map[string]map[string]bool
	errors       map[string]error
}

// NewFakeSessionStore crea una nueva instancia de FakeSessionStore
func NewFakeSessionStore() *FakeSessionStore {
	return &FakeSessionStore{
		sessions:     make(map[string]*StoredSession),
		users:        make(map[string]*UserInfo),
		tenantAccess: make(map[string]bool),
		branchAccess: make(map[string]bool),
		roles:        make(map[string][]string),
		permissions:  make(map[string]map[string]bool),
		errors:       make(map[string]error),
	}
}

// AddSession agrega una sesión al store fake
func (f *FakeSessionStore) AddSession(session *StoredSession) {
	f.sessions[session.SessionID] = session
}

// AddUser agrega un usuario al store fake
func (f *FakeSessionStore) AddUser(user *UserInfo) {
	f.users[user.UserID] = user
}

// SetTenantAccess establece acceso a tenant
func (f *FakeSessionStore) SetTenantAccess(userID, tenantID string, hasAccess bool) {
	key := fmt.Sprintf("%s:%s", userID, tenantID)
	f.tenantAccess[key] = hasAccess
}

// SetBranchAccess establece acceso a branch
func (f *FakeSessionStore) SetBranchAccess(userID, tenantID, branchID string, hasAccess bool) {
	key := fmt.Sprintf("%s:%s:%s", userID, tenantID, branchID)
	f.branchAccess[key] = hasAccess
}

// SetRoles establece roles de un usuario
func (f *FakeSessionStore) SetRoles(userID, tenantID string, roles []string) {
	key := fmt.Sprintf("%s:%s", userID, tenantID)
	f.roles[key] = roles
}

// SetPermissions establece permisos de un usuario
func (f *FakeSessionStore) SetPermissions(userID, tenantID string, permissions map[string]bool) {
	key := fmt.Sprintf("%s:%s", userID, tenantID)
	f.permissions[key] = permissions
}

// SetError establece un error para un método
func (f *FakeSessionStore) SetError(method, key string, err error) {
	errorKey := fmt.Sprintf("%s:%s", method, key)
	f.errors[errorKey] = err
}

// FindSessionByToken busca una sesión (fake)
func (f *FakeSessionStore) FindSessionByToken(
	ctx context.Context,
	token string,
) (*StoredSession, error) {
	errorKey := fmt.Sprintf("FindSessionByToken:%s", token)
	if err, exists := f.errors[errorKey]; exists {
		return nil, err
	}

	if token == "" {
		return nil, ErrInvalidToken
	}

	session, exists := f.sessions[token]
	if !exists {
		return nil, ErrSessionNotFound
	}

	return session, nil
}

// UserHasTenantAccess verifica acceso a tenant (fake)
func (f *FakeSessionStore) UserHasTenantAccess(
	ctx context.Context,
	userID string,
	tenantID string,
) (bool, error) {
	errorKey := fmt.Sprintf("UserHasTenantAccess:%s:%s", userID, tenantID)
	if err, exists := f.errors[errorKey]; exists {
		return false, err
	}

	key := fmt.Sprintf("%s:%s", userID, tenantID)
	hasAccess, exists := f.tenantAccess[key]
	if !exists {
		return false, nil
	}

	return hasAccess, nil
}

// UserHasBranchAccess verifica acceso a branch (fake)
func (f *FakeSessionStore) UserHasBranchAccess(
	ctx context.Context,
	userID string,
	tenantID string,
	branchID string,
) (bool, error) {
	errorKey := fmt.Sprintf("UserHasBranchAccess:%s:%s:%s", userID, tenantID, branchID)
	if err, exists := f.errors[errorKey]; exists {
		return false, err
	}

	key := fmt.Sprintf("%s:%s:%s", userID, tenantID, branchID)
	hasAccess, exists := f.branchAccess[key]
	if !exists {
		return false, nil
	}

	return hasAccess, nil
}

// LoadRoles carga roles (fake)
func (f *FakeSessionStore) LoadRoles(
	ctx context.Context,
	userID string,
	tenantID string,
) ([]string, error) {
	errorKey := fmt.Sprintf("LoadRoles:%s:%s", userID, tenantID)
	if err, exists := f.errors[errorKey]; exists {
		return nil, err
	}

	key := fmt.Sprintf("%s:%s", userID, tenantID)
	roles, exists := f.roles[key]
	if !exists {
		return []string{}, nil
	}

	return roles, nil
}

// LoadPermissions carga permisos (fake)
func (f *FakeSessionStore) LoadPermissions(
	ctx context.Context,
	userID string,
	tenantID string,
) (map[string]bool, error) {
	errorKey := fmt.Sprintf("LoadPermissions:%s:%s", userID, tenantID)
	if err, exists := f.errors[errorKey]; exists {
		return nil, err
	}

	key := fmt.Sprintf("%s:%s", userID, tenantID)
	permissions, exists := f.permissions[key]
	if !exists {
		return make(map[string]bool), nil
	}

	return permissions, nil
}

// GetUserInfo obtiene información del usuario (fake)
func (f *FakeSessionStore) GetUserInfo(
	ctx context.Context,
	userID string,
) (*UserInfo, error) {
	errorKey := fmt.Sprintf("GetUserInfo:%s", userID)
	if err, exists := f.errors[errorKey]; exists {
		return nil, err
	}

	user, exists := f.users[userID]
	if !exists {
		return nil, ErrUserNotFound
	}

	return user, nil
}

// ============================================================
// HELPERS PARA PRUEBAS
// ============================================================

// CreateValidSession crea una sesión válida para pruebas
func CreateValidSession(userID, tenantID, branchID string) *StoredSession {
	return &StoredSession{
		SessionID: "valid-session-" + userID,
		UserID:    userID,
		TenantID:  tenantID,
		BranchID:  branchID,
		Revoked:   false,
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
	}
}

// CreateExpiredSession crea una sesión expirada para pruebas
func CreateExpiredSession(userID, tenantID, branchID string) *StoredSession {
	return &StoredSession{
		SessionID: "expired-session-" + userID,
		UserID:    userID,
		TenantID:  tenantID,
		BranchID:  branchID,
		Revoked:   false,
		ExpiresAt: time.Now().Add(-1 * time.Hour),
		CreatedAt: time.Now().Add(-25 * time.Hour),
	}
}

// CreateRevokedSession crea una sesión revocada para pruebas
func CreateRevokedSession(userID, tenantID, branchID string) *StoredSession {
	return &StoredSession{
		SessionID: "revoked-session-" + userID,
		UserID:    userID,
		TenantID:  tenantID,
		BranchID:  branchID,
		Revoked:   true,
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
	}
}

// CreateActiveUser crea un usuario activo para pruebas
func CreateActiveUser(userID, email string) *UserInfo {
	return &UserInfo{
		UserID:   userID,
		Email:    email,
		UserName: "Test User " + userID,
		Disabled: false,
		Status:   "active",
	}
}

// CreateDisabledUser crea un usuario deshabilitado para pruebas
func CreateDisabledUser(userID, email string) *UserInfo {
	return &UserInfo{
		UserID:   userID,
		Email:    email,
		UserName: "Disabled User " + userID,
		Disabled: true,
		Status:   "disabled",
	}
}
