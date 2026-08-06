//go:build integration
// +build integration

package main

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

// ============================================================
// PRUEBAS DE INTEGRACIÓN DE PostgresSessionStore
// ============================================================

// getTestDB obtiene conexión a BD de prueba
func getTestDB(t *testing.T) *sql.DB {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://skia:skia@localhost:5432/skia_test?sslmode=disable"
	}

	testDB, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	if err := testDB.Ping(); err != nil {
		t.Fatalf("Failed to ping test database: %v", err)
	}

	return testDB
}

// setupTestTables crea tablas de prueba
func setupTestTables(t *testing.T, testDB *sql.DB) {
	ctx := context.Background()

	// Limpiar tablas existentes
	testDB.ExecContext(ctx, "DROP TABLE IF EXISTS sessions CASCADE")
	testDB.ExecContext(ctx, "DROP TABLE IF EXISTS users CASCADE")
	testDB.ExecContext(ctx, "DROP TABLE IF EXISTS user_roles CASCADE")
	testDB.ExecContext(ctx, "DROP TABLE IF EXISTS user_permissions CASCADE")

	// Crear tablas
	schema := `
	CREATE TABLE users (
		id VARCHAR(36) PRIMARY KEY,
		email VARCHAR(255) NOT NULL,
		user_name VARCHAR(255) NOT NULL,
		disabled BOOLEAN DEFAULT FALSE,
		status VARCHAR(50) DEFAULT 'active'
	);

	CREATE TABLE sessions (
		session_id VARCHAR(255) PRIMARY KEY,
		user_id VARCHAR(36) NOT NULL REFERENCES users(id),
		tenant_id VARCHAR(36) NOT NULL,
		branch_id VARCHAR(36) NOT NULL,
		revoked BOOLEAN DEFAULT FALSE,
		expires_at TIMESTAMP NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE user_roles (
		id SERIAL PRIMARY KEY,
		user_id VARCHAR(36) NOT NULL REFERENCES users(id),
		tenant_id VARCHAR(36) NOT NULL,
		role_name VARCHAR(100) NOT NULL
	);

	CREATE TABLE user_permissions (
		id SERIAL PRIMARY KEY,
		user_id VARCHAR(36) NOT NULL REFERENCES users(id),
		tenant_id VARCHAR(36) NOT NULL,
		permission_name VARCHAR(100) NOT NULL
	);
	`

	if _, err := testDB.ExecContext(ctx, schema); err != nil {
		t.Fatalf("Failed to create test tables: %v", err)
	}
}

// TestPostgresSessionStore_ValidToken prueba token válido
func TestPostgresSessionStore_ValidToken(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	setupTestTables(t, testDB)

	ctx := context.Background()
	store := NewPostgresSessionStore(testDB)

	// Crear usuario
	userID := "user-1"
	_, err := testDB.ExecContext(ctx,
		"INSERT INTO users (id, email, user_name, disabled, status) VALUES ($1, $2, $3, $4, $5)",
		userID, "user@example.com", "Test User", false, "active")
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Crear sesión
	sessionID := "valid-session-token"
	tenantID := "tenant-1"
	branchID := "branch-1"
	expiresAt := time.Now().Add(24 * time.Hour)

	_, err = testDB.ExecContext(ctx,
		"INSERT INTO sessions (session_id, user_id, tenant_id, branch_id, revoked, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
		sessionID, userID, tenantID, branchID, false, expiresAt)
	if err != nil {
		t.Fatalf("Failed to create session: %v", err)
	}

	// Buscar sesión
	session, err := store.FindSessionByToken(ctx, sessionID)
	if err != nil {
		t.Fatalf("Failed to find session: %v", err)
	}

	if session == nil {
		t.Fatal("Expected session, got nil")
	}

	if session.SessionID != sessionID {
		t.Errorf("Expected session ID %s, got %s", sessionID, session.SessionID)
	}

	if session.TenantID != tenantID {
		t.Errorf("Expected tenant ID %s, got %s", tenantID, session.TenantID)
	}

	if session.BranchID != branchID {
		t.Errorf("Expected branch ID %s, got %s", branchID, session.BranchID)
	}
}

// TestPostgresSessionStore_ExpiredToken prueba token expirado
func TestPostgresSessionStore_ExpiredToken(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	setupTestTables(t, testDB)

	ctx := context.Background()
	store := NewPostgresSessionStore(testDB)

	// Crear usuario
	userID := "user-2"
	_, err := testDB.ExecContext(ctx,
		"INSERT INTO users (id, email, user_name, disabled, status) VALUES ($1, $2, $3, $4, $5)",
		userID, "user2@example.com", "Test User 2", false, "active")
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Crear sesión expirada
	sessionID := "expired-session-token"
	expiresAt := time.Now().Add(-1 * time.Hour)

	_, err = testDB.ExecContext(ctx,
		"INSERT INTO sessions (session_id, user_id, tenant_id, branch_id, revoked, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
		sessionID, userID, "tenant-1", "branch-1", false, expiresAt)
	if err != nil {
		t.Fatalf("Failed to create session: %v", err)
	}

	// Buscar sesión
	session, err := store.FindSessionByToken(ctx, sessionID)
	if err != nil {
		t.Fatalf("Failed to find session: %v", err)
	}

	// Debe retornar la sesión (la validación de expiración es responsabilidad del caller)
	if session == nil {
		t.Fatal("Expected session, got nil")
	}

	if !session.ExpiresAt.Before(time.Now()) {
		t.Error("Expected expired session")
	}
}

// TestPostgresSessionStore_RevokedSession prueba sesión revocada
func TestPostgresSessionStore_RevokedSession(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	setupTestTables(t, testDB)

	ctx := context.Background()
	store := NewPostgresSessionStore(testDB)

	// Crear usuario
	userID := "user-3"
	_, err := testDB.ExecContext(ctx,
		"INSERT INTO users (id, email, user_name, disabled, status) VALUES ($1, $2, $3, $4, $5)",
		userID, "user3@example.com", "Test User 3", false, "active")
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Crear sesión revocada
	sessionID := "revoked-session-token"
	expiresAt := time.Now().Add(24 * time.Hour)

	_, err = testDB.ExecContext(ctx,
		"INSERT INTO sessions (session_id, user_id, tenant_id, branch_id, revoked, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
		sessionID, userID, "tenant-1", "branch-1", true, expiresAt)
	if err != nil {
		t.Fatalf("Failed to create session: %v", err)
	}

	// Buscar sesión
	session, err := store.FindSessionByToken(ctx, sessionID)
	if err != nil {
		t.Fatalf("Failed to find session: %v", err)
	}

	if session == nil {
		t.Fatal("Expected session, got nil")
	}

	if !session.Revoked {
		t.Error("Expected revoked session")
	}
}

// TestPostgresSessionStore_UserDisabled prueba usuario deshabilitado
func TestPostgresSessionStore_UserDisabled(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	setupTestTables(t, testDB)

	ctx := context.Background()
	store := NewPostgresSessionStore(testDB)

	// Crear usuario deshabilitado
	userID := "user-4"
	_, err := testDB.ExecContext(ctx,
		"INSERT INTO users (id, email, user_name, disabled, status) VALUES ($1, $2, $3, $4, $5)",
		userID, "user4@example.com", "Test User 4", true, "disabled")
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Obtener información del usuario
	userInfo, err := store.GetUserInfo(ctx, userID)
	if err != nil {
		t.Fatalf("Failed to get user info: %v", err)
	}

	if userInfo == nil {
		t.Fatal("Expected user info, got nil")
	}

	if !userInfo.Disabled {
		t.Error("Expected disabled user")
	}

	if userInfo.Status != "disabled" {
		t.Errorf("Expected status 'disabled', got %s", userInfo.Status)
	}
}

// TestPostgresSessionStore_TenantAccess prueba acceso a tenant
func TestPostgresSessionStore_TenantAccess(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	setupTestTables(t, testDB)

	ctx := context.Background()
	store := NewPostgresSessionStore(testDB)

	// Crear usuario
	userID := "user-5"
	_, err := testDB.ExecContext(ctx,
		"INSERT INTO users (id, email, user_name, disabled, status) VALUES ($1, $2, $3, $4, $5)",
		userID, "user5@example.com", "Test User 5", false, "active")
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Verificar acceso a tenant (debe retornar false sin registros)
	hasAccess, err := store.UserHasTenantAccess(ctx, userID, "tenant-1")
	if err != nil {
		t.Fatalf("Failed to check tenant access: %v", err)
	}

	if hasAccess {
		t.Error("Expected no tenant access, got true")
	}
}

// TestPostgresSessionStore_BranchAccess prueba acceso a branch
func TestPostgresSessionStore_BranchAccess(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	setupTestTables(t, testDB)

	ctx := context.Background()
	store := NewPostgresSessionStore(testDB)

	// Crear usuario
	userID := "user-6"
	_, err := testDB.ExecContext(ctx,
		"INSERT INTO users (id, email, user_name, disabled, status) VALUES ($1, $2, $3, $4, $5)",
		userID, "user6@example.com", "Test User 6", false, "active")
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Verificar acceso a branch (debe retornar false sin registros)
	hasAccess, err := store.UserHasBranchAccess(ctx, userID, "tenant-1", "branch-1")
	if err != nil {
		t.Fatalf("Failed to check branch access: %v", err)
	}

	if hasAccess {
		t.Error("Expected no branch access, got true")
	}
}

// TestPostgresSessionStore_LoadRoles prueba carga de roles
func TestPostgresSessionStore_LoadRoles(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	setupTestTables(t, testDB)

	ctx := context.Background()
	store := NewPostgresSessionStore(testDB)

	// Crear usuario
	userID := "user-7"
	_, err := testDB.ExecContext(ctx,
		"INSERT INTO users (id, email, user_name, disabled, status) VALUES ($1, $2, $3, $4, $5)",
		userID, "user7@example.com", "Test User 7", false, "active")
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Agregar rol
	_, err = testDB.ExecContext(ctx,
		"INSERT INTO user_roles (user_id, tenant_id, role_name) VALUES ($1, $2, $3)",
		userID, "tenant-1", "admin")
	if err != nil {
		t.Fatalf("Failed to create role: %v", err)
	}

	// Cargar roles
	roles, err := store.LoadRoles(ctx, userID, "tenant-1")
	if err != nil {
		t.Fatalf("Failed to load roles: %v", err)
	}

	if len(roles) != 1 {
		t.Errorf("Expected 1 role, got %d", len(roles))
	}

	if roles[0] != "admin" {
		t.Errorf("Expected role 'admin', got %s", roles[0])
	}
}

// TestPostgresSessionStore_LoadPermissions prueba carga de permisos
func TestPostgresSessionStore_LoadPermissions(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	setupTestTables(t, testDB)

	ctx := context.Background()
	store := NewPostgresSessionStore(testDB)

	// Crear usuario
	userID := "user-8"
	_, err := testDB.ExecContext(ctx,
		"INSERT INTO users (id, email, user_name, disabled, status) VALUES ($1, $2, $3, $4, $5)",
		userID, "user8@example.com", "Test User 8", false, "active")
	if err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Agregar permiso
	_, err = testDB.ExecContext(ctx,
		"INSERT INTO user_permissions (user_id, tenant_id, permission_name) VALUES ($1, $2, $3)",
		userID, "tenant-1", "inventory.import.read")
	if err != nil {
		t.Fatalf("Failed to create permission: %v", err)
	}

	// Cargar permisos
	permissions, err := store.LoadPermissions(ctx, userID, "tenant-1")
	if err != nil {
		t.Fatalf("Failed to load permissions: %v", err)
	}

	if len(permissions) != 1 {
		t.Errorf("Expected 1 permission, got %d", len(permissions))
	}

	if !permissions["inventory.import.read"] {
		t.Error("Expected permission 'inventory.import.read' to be true")
	}
}

// TestPostgresSessionStore_MultiTenantIsolation prueba aislamiento multi-tenant
func TestPostgresSessionStore_MultiTenantIsolation(t *testing.T) {
	testDB := getTestDB(t)
	defer testDB.Close()
	setupTestTables(t, testDB)

	ctx := context.Background()
	store := NewPostgresSessionStore(testDB)

	// Crear dos usuarios en diferentes tenants
	user1ID := "user-tenant1"
	user2ID := "user-tenant2"

	_, err := testDB.ExecContext(ctx,
		"INSERT INTO users (id, email, user_name, disabled, status) VALUES ($1, $2, $3, $4, $5)",
		user1ID, "user1@tenant1.com", "User Tenant 1", false, "active")
	if err != nil {
		t.Fatalf("Failed to create user 1: %v", err)
	}

	_, err = testDB.ExecContext(ctx,
		"INSERT INTO users (id, email, user_name, disabled, status) VALUES ($1, $2, $3, $4, $5)",
		user2ID, "user2@tenant2.com", "User Tenant 2", false, "active")
	if err != nil {
		t.Fatalf("Failed to create user 2: %v", err)
	}

	// Agregar roles a diferentes tenants
	_, err = testDB.ExecContext(ctx,
		"INSERT INTO user_roles (user_id, tenant_id, role_name) VALUES ($1, $2, $3)",
		user1ID, "tenant-1", "admin")
	if err != nil {
		t.Fatalf("Failed to create role for tenant 1: %v", err)
	}

	_, err = testDB.ExecContext(ctx,
		"INSERT INTO user_roles (user_id, tenant_id, role_name) VALUES ($1, $2, $3)",
		user2ID, "tenant-2", "admin")
	if err != nil {
		t.Fatalf("Failed to create role for tenant 2: %v", err)
	}

	// Cargar roles para usuario 1 en tenant 1
	roles1, err := store.LoadRoles(ctx, user1ID, "tenant-1")
	if err != nil {
		t.Fatalf("Failed to load roles for tenant 1: %v", err)
	}

	// Cargar roles para usuario 1 en tenant 2 (debe estar vacío)
	roles1Tenant2, err := store.LoadRoles(ctx, user1ID, "tenant-2")
	if err != nil {
		t.Fatalf("Failed to load roles for tenant 2: %v", err)
	}

	if len(roles1) != 1 {
		t.Errorf("Expected 1 role for user 1 in tenant 1, got %d", len(roles1))
	}

	if len(roles1Tenant2) != 0 {
		t.Errorf("Expected 0 roles for user 1 in tenant 2, got %d", len(roles1Tenant2))
	}

	// Cargar roles para usuario 2 en tenant 2
	roles2, err := store.LoadRoles(ctx, user2ID, "tenant-2")
	if err != nil {
		t.Fatalf("Failed to load roles for user 2 in tenant 2: %v", err)
	}

	if len(roles2) != 1 {
		t.Errorf("Expected 1 role for user 2 in tenant 2, got %d", len(roles2))
	}

	// Verificar aislamiento
	if len(roles1) == len(roles1Tenant2) {
		t.Error("Expected different role counts for different tenants")
	}
}
