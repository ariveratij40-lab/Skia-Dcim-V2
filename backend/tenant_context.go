package main

import (
	"context"
	"database/sql"
	"errors"
)

// BeginTenantTx starts a request-scoped transaction with tenant context.
func BeginTenantTx(ctx context.Context, database *sql.DB, tenantID, branchID string) (*sql.Tx, error) {
	if tenantID == "" {
		return nil, errors.New("tenant context is required")
	}
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `SELECT set_config('app.tenant_id', $1, true)`, tenantID); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if branchID != "" {
		if _, err = tx.ExecContext(ctx, `SELECT set_config('app.branch_id', $1, true)`, branchID); err != nil {
			_ = tx.Rollback()
			return nil, err
		}
	}
	return tx, nil
}
