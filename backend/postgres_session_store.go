package main

import (
	"context"
	"database/sql"
	"fmt"
)

// ============================================================
// PostgresSessionStore
// ============================================================

// PostgresSessionStore implementa SessionStore usando PostgreSQL
type PostgresSessionStore struct {
	db *sql.DB
}

// NewPostgresSessionStore crea una nueva instancia de PostgresSessionStore
func NewPostgresSessionStore(db *sql.DB) *PostgresSessionStore {
	return &PostgresSessionStore{db: db}
}

// FindSessionByToken busca una sesión por token en PostgreSQL
func (s *PostgresSessionStore) FindSessionByToken(
	ctx context.Context,
	token string,
) (*StoredSession, error) {
	if token == "" {
		return nil, ErrInvalidToken
	}

	query := `
		SELECT session_id, user_id, tenant_id, branch_id, revoked, expires_at, created_at
		FROM sessions
		WHERE session_id = $1
	`

	row := s.db.QueryRowContext(ctx, query, token)

	session := &StoredSession{}
	err := row.Scan(
		&session.SessionID,
		&session.UserID,
		&session.TenantID,
		&session.BranchID,
		&session.Revoked,
		&session.ExpiresAt,
		&session.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, ErrSessionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDatabaseError, err)
	}

	return session, nil
}

// UserHasTenantAccess verifica acceso a tenant en PostgreSQL
func (s *PostgresSessionStore) UserHasTenantAccess(
	ctx context.Context,
	userID string,
	tenantID string,
) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM user_tenant_access
			WHERE user_id = $1 AND tenant_id = $2
		)
	`

	var exists bool
	err := s.db.QueryRowContext(ctx, query, userID, tenantID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("%w: %v", ErrDatabaseError, err)
	}

	return exists, nil
}

// UserHasBranchAccess verifica acceso a branch en PostgreSQL
func (s *PostgresSessionStore) UserHasBranchAccess(
	ctx context.Context,
	userID string,
	tenantID string,
	branchID string,
) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM user_branch_access
			WHERE user_id = $1 AND tenant_id = $2 AND branch_id = $3
		)
	`

	var exists bool
	err := s.db.QueryRowContext(ctx, query, userID, tenantID, branchID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("%w: %v", ErrDatabaseError, err)
	}

	return exists, nil
}

// LoadRoles carga roles desde PostgreSQL
func (s *PostgresSessionStore) LoadRoles(
	ctx context.Context,
	userID string,
	tenantID string,
) ([]string, error) {
	query := `
		SELECT role_name FROM user_roles
		WHERE user_id = $1 AND tenant_id = $2
		ORDER BY role_name
	`

	rows, err := s.db.QueryContext(ctx, query, userID, tenantID)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDatabaseError, err)
	}
	defer rows.Close()

	var roles []string
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrDatabaseError, err)
		}
		roles = append(roles, role)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDatabaseError, err)
	}

	return roles, nil
}

// LoadPermissions carga permisos desde PostgreSQL
func (s *PostgresSessionStore) LoadPermissions(
	ctx context.Context,
	userID string,
	tenantID string,
) (map[string]bool, error) {
	query := `
		SELECT permission_name FROM user_permissions
		WHERE user_id = $1 AND tenant_id = $2
		ORDER BY permission_name
	`

	rows, err := s.db.QueryContext(ctx, query, userID, tenantID)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDatabaseError, err)
	}
	defer rows.Close()

	permissions := make(map[string]bool)
	for rows.Next() {
		var permission string
		if err := rows.Scan(&permission); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrDatabaseError, err)
		}
		permissions[permission] = true
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDatabaseError, err)
	}

	return permissions, nil
}

// GetUserInfo obtiene información del usuario desde PostgreSQL
func (s *PostgresSessionStore) GetUserInfo(
	ctx context.Context,
	userID string,
) (*UserInfo, error) {
	query := `
		SELECT id, email, name, false as disabled, 'active' as status
		FROM users
		WHERE id = $1
	`

	row := s.db.QueryRowContext(ctx, query, userID)

	user := &UserInfo{}
	err := row.Scan(
		&user.UserID,
		&user.Email,
		&user.UserName,
		&user.Disabled,
		&user.Status,
	)

	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrDatabaseError, err)
	}

	return user, nil
}
