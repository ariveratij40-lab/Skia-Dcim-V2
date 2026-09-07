package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
)

const (
	importCommitModeCreateOnly = "CREATE_ONLY"
	importCommitGenericFailure = "CANONICAL_WRITE_FAILED"
)

type importCommitRow struct {
	ID               int64
	Number           int
	Status           string
	NormalizedHash   string
	Data             []byte
	CanonicalAssetID sql.NullString
}

type importCommitResult struct {
	ImportID         int64  `json:"import_id"`
	Status           string `json:"status"`
	Mode             string `json:"mode"`
	TotalRows        int    `json:"total_rows"`
	CommittedRows    int    `json:"committed_rows"`
	FailedRows       int    `json:"failed_rows"`
	AlreadyCommitted int    `json:"already_committed_rows"`
}

type importRowCommitOutcome string

const (
	rowCommitCreated importRowCommitOutcome = "created"
	rowCommitAlready importRowCommitOutcome = "already_committed"
	rowCommitFailed  importRowCommitOutcome = "failed"
)

func listCanonicalImportRows(ctx context.Context, database *sql.DB, importID int64, scope CanonicalImportScope) ([]importCommitRow, bool, error) {
	tx, err := BeginJobTenantTx(ctx, database, JobTenantContext{TenantID: scope.TenantID, BranchID: scope.BranchID}, true)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT result_code,row_id,row_number,row_status,normalized_row_hash,row_data,canonical_asset_id FROM public.list_import_rows_for_commit($1,$2::uuid,$3::uuid)`, importID, scope.TenantID, scope.BranchID)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	var result []importCommitRow
	found := false
	for rows.Next() {
		var code string
		var rowID, rowNumber sql.NullInt64
		var status, hash sql.NullString
		var data []byte
		var assetID sql.NullString
		if err := rows.Scan(&code, &rowID, &rowNumber, &status, &hash, &data, &assetID); err != nil {
			return nil, false, err
		}
		switch code {
		case "NOT_FOUND_OR_UNAUTHORIZED":
			return nil, false, nil
		case "IMPORT_EMPTY":
			found = true
		case "IMPORT_ROW":
			found = true
			result = append(result, importCommitRow{ID: rowID.Int64, Number: int(rowNumber.Int64), Status: status.String, NormalizedHash: hash.String, Data: data, CanonicalAssetID: assetID})
		default:
			return nil, false, fmt.Errorf("unexpected row enumeration result: %s", code)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return result, found, nil
}

func decodeAndRevalidateImportRow(ctx context.Context, tdb TenantDB, scope CanonicalImportScope, row importCommitRow) (CanonicalStagingPayload, error) {
	if row.NormalizedHash == "" {
		return CanonicalStagingPayload{}, errors.New("staged hash is missing")
	}
	var staged CanonicalStagingPayload
	if err := json.Unmarshal(row.Data, &staged); err != nil {
		return CanonicalStagingPayload{}, errors.New("staged payload is invalid")
	}
	stagedHash, err := canonicalPayloadHash(staged)
	if err != nil || stagedHash != row.NormalizedHash {
		return CanonicalStagingPayload{}, errors.New("staged payload hash mismatch")
	}
	if staged.RawSource == nil {
		return CanonicalStagingPayload{}, errors.New("staged source evidence is missing")
	}
	revalidated, err := normalizeCanonicalImportRow(ctx, tdb, scope, row.Number, staged.AssetTypeCode, staged.RawSource)
	if err != nil {
		return CanonicalStagingPayload{}, err
	}
	if revalidated.State != "VALID" || revalidated.NormalizedHash != row.NormalizedHash {
		return CanonicalStagingPayload{}, errors.New("canonical validation changed since staging")
	}
	return revalidated.Payload, nil
}

func claimCanonicalImportRow(ctx context.Context, tdb TenantDB, importID int64, row importCommitRow, scope CanonicalImportScope) (string, error) {
	var resultCode string
	var rowStatus sql.NullString
	var data []byte
	var assetID sql.NullString
	err := tdb.QueryRowContext(ctx, `SELECT result_code,row_status,row_data,canonical_asset_id FROM public.claim_import_row_for_commit($1,$2,$3::uuid,$4::uuid,$5)`, importID, row.ID, scope.TenantID, scope.BranchID, row.NormalizedHash).Scan(&resultCode, &rowStatus, &data, &assetID)
	return resultCode, err
}

func completeCanonicalImportRow(ctx context.Context, tdb TenantDB, importID int64, rowID int64, expectedHash string, scope CanonicalImportScope, assetID string) error {
	var resultCode string
	var rowStatus sql.NullString
	var completedAssetID sql.NullString
	if err := tdb.QueryRowContext(ctx, `SELECT result_code,row_status,canonical_asset_id FROM public.complete_import_row_commit($1,$2,$3::uuid,$4::uuid,$5,$6::uuid)`, importID, rowID, scope.TenantID, scope.BranchID, expectedHash, assetID).Scan(&resultCode, &rowStatus, &completedAssetID); err != nil {
		return err
	}
	if resultCode != "COMMITTED" || rowStatus.String != "COMMITTED" || !completedAssetID.Valid || completedAssetID.String != assetID {
		return fmt.Errorf("commit completion rejected: %s", resultCode)
	}
	return nil
}

func recordImportRowFailure(ctx context.Context, database *sql.DB, importID int64, row importCommitRow, scope CanonicalImportScope, errorCode string) error {
	tx, err := BeginJobTenantTx(ctx, database, JobTenantContext{TenantID: scope.TenantID, BranchID: scope.BranchID}, true)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var resultCode, rowStatus string
	var attempts int
	if err := tx.QueryRowContext(ctx, `SELECT result_code,row_status,commit_attempts FROM public.fail_import_row_after_rollback($1,$2,$3::uuid,$4::uuid,$5,$6)`, importID, row.ID, scope.TenantID, scope.BranchID, row.NormalizedHash, errorCode).Scan(&resultCode, &rowStatus, &attempts); err != nil {
		return err
	}
	if resultCode != "FAILED_RECORDED" || rowStatus != "FAILED" {
		return fmt.Errorf("failure persistence rejected: %s", resultCode)
	}
	return tx.Commit()
}

func commitCanonicalImportRow(ctx context.Context, database *sql.DB, importID int64, row importCommitRow, scope CanonicalImportScope) (outcome importRowCommitOutcome, err error) {
	if row.Status == "COMMITTED" {
		return rowCommitAlready, nil
	}
	if row.Status != "VALID" && row.Status != "valid" && row.Status != "validated" {
		return rowCommitFailed, nil
	}
	tx, err := BeginJobTenantTx(ctx, database, JobTenantContext{TenantID: scope.TenantID, BranchID: scope.BranchID}, true)
	if err != nil {
		return rowCommitFailed, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	payload, err := decodeAndRevalidateImportRow(ctx, tx, scope, row)
	if err != nil {
		log.Printf("canonical import row revalidation failed import=%d row=%d: %v", importID, row.ID, err)
		_ = tx.Rollback()
		if failureErr := recordImportRowFailure(ctx, database, importID, row, scope, "CANONICAL_VALIDATION_FAILED"); failureErr != nil {
			return rowCommitFailed, fmt.Errorf("revalidation failed and failure was not persisted: %w", failureErr)
		}
		return rowCommitFailed, nil
	}
	claimResult, err := claimCanonicalImportRow(ctx, tx, importID, row, scope)
	if err != nil {
		log.Printf("canonical import row write failed import=%d row=%d: %v", importID, row.ID, err)
		return rowCommitFailed, err
	}
	if claimResult == "ALREADY_COMMITTED" {
		return rowCommitAlready, nil
	}
	if claimResult != "READY_FOR_COMMIT" {
		log.Printf("canonical import row claim rejected import=%d row=%d result=%s", importID, row.ID, claimResult)
		return rowCommitFailed, nil
	}

	if payload.AssetTypeCode != "MDF" && payload.AssetTypeCode != "IDF" {
		err = errors.New("asset type is not supported by canonical import commit")
	} else {
		var created *mdfIdfCreateResult
		created, err = createMdfIdf(ctx, tx, scope.UserID, scope.TenantID, scope.BranchID, mdfIdfCreateInput{
			Name: payload.Name, Type: payload.AssetTypeCode, ZoneID: payload.ZoneID, Observations: payload.Description,
			PhysicalIdentity: payload.PhysicalIdentity,
		})
		if err == nil {
			err = completeCanonicalImportRow(ctx, tx, importID, row.ID, row.NormalizedHash, scope, created.Managed.AssetID)
		}
	}
	if err != nil {
		log.Printf("canonical import row write failed import=%d row=%d: %v", importID, row.ID, err)
		_ = tx.Rollback()
		if failureErr := recordImportRowFailure(ctx, database, importID, row, scope, controlledImportCommitError(err)); failureErr != nil {
			return rowCommitFailed, fmt.Errorf("canonical write failed and failure was not persisted: %w", failureErr)
		}
		return rowCommitFailed, nil
	}
	if err := tx.Commit(); err != nil {
		return rowCommitFailed, err
	}
	committed = true
	return rowCommitCreated, nil
}

func recomputeCanonicalImportState(ctx context.Context, database *sql.DB, importID int64, scope CanonicalImportScope) (string, error) {
	tx, err := BeginJobTenantTx(ctx, database, JobTenantContext{TenantID: scope.TenantID, BranchID: scope.BranchID}, true)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var resultCode, state string
	if err := tx.QueryRowContext(ctx, `SELECT result_code,aggregate_state FROM public.recompute_inventory_import_state($1,$2::uuid,$3::uuid)`, importID, scope.TenantID, scope.BranchID).Scan(&resultCode, &state); err != nil {
		return "", err
	}
	if resultCode != "STATE_RECOMPUTED" {
		return "", fmt.Errorf("aggregate recompute rejected: %s", resultCode)
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return state, nil
}

func executeCanonicalImportCommit(ctx context.Context, database *sql.DB, importID int64, scope CanonicalImportScope) (importCommitResult, bool, error) {
	rows, found, err := listCanonicalImportRows(ctx, database, importID, scope)
	result := importCommitResult{ImportID: importID, Mode: importCommitModeCreateOnly, TotalRows: len(rows)}
	if err != nil || !found {
		return result, found, err
	}
	for _, row := range rows {
		outcome, rowErr := commitCanonicalImportRow(ctx, database, importID, row, scope)
		if rowErr != nil {
			return result, true, rowErr
		}
		switch outcome {
		case rowCommitCreated:
			result.CommittedRows++
		case rowCommitAlready:
			result.AlreadyCommitted++
		case rowCommitFailed:
			result.FailedRows++
		}
	}
	result.Status, err = recomputeCanonicalImportState(ctx, database, importID, scope)
	return result, true, err
}

func handleCanonicalImportCommit(w http.ResponseWriter, r *http.Request, sessionCtx SessionContextSecure, importID int64) {
	result, found, err := executeCanonicalImportCommit(r.Context(), db, importID, CanonicalImportScope{TenantID: sessionCtx.TenantID, BranchID: sessionCtx.BranchID, UserID: sessionCtx.UserID})
	if err != nil {
		log.Printf("canonical import commit failed import=%d tenant=%s branch=%s: %v", importID, sessionCtx.TenantID, sessionCtx.BranchID, err)
		writeErrorResponse(w, http.StatusInternalServerError, "COMMIT_FAILED", "Canonical import commit failed")
		return
	}
	if !found {
		writeErrorResponse(w, http.StatusNotFound, "NOT_FOUND", "Import not found")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(ImportResponse{Success: true, Data: result})
}

func controlledImportCommitError(err error) string {
	if errors.Is(err, ErrZoneRequired) || errors.Is(err, ErrInvalidPhysicalLocation) || errors.Is(err, ErrPhysicalScopeMismatch) {
		return "CANONICAL_VALIDATION_FAILED"
	}
	if strings.Contains(strings.ToLower(err.Error()), "duplicate") || strings.Contains(strings.ToLower(err.Error()), "unique") {
		return "CANONICAL_CONFLICT"
	}
	return importCommitGenericFailure
}
