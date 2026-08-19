package main

import (
	"context"
	"database/sql"
	"errors"
)

// JobTenantContext is captured when a job is created and is immutable while
// the job runs. BranchScopeAll is false by default and must never be inferred
// from an empty BranchID.
type JobTenantContext struct {
	TenantID       string
	BranchID       string
	BranchScopeAll bool
}

func (scope JobTenantContext) Validate(requireBranch bool) error {
	if scope.TenantID == "" {
		return errors.New("job tenant context is required")
	}
	if requireBranch && scope.BranchID == "" {
		return errors.New("job branch context is required")
	}
	return nil
}

func BeginJobTenantTx(ctx context.Context, database *sql.DB, scope JobTenantContext, requireBranch bool) (*sql.Tx, error) {
	if err := scope.Validate(requireBranch); err != nil {
		return nil, err
	}
	return BeginTenantTxWithScope(ctx, database, scope.TenantID, scope.BranchID, scope.BranchScopeAll)
}
