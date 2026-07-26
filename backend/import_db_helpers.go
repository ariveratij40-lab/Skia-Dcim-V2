package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
)

// ============================================================
// TIPOS DE DATOS
// ============================================================

// ImportStats contiene estadísticas de importación
type ImportStats struct {
	TotalImports     int64 `json:"total_imports"`
	TotalItems       int64 `json:"total_items"`
	ValidItems       int64 `json:"valid_items"`
	ItemsWithErrors  int64 `json:"items_with_errors"`
	ItemsWithWarning int64 `json:"items_with_warning"`
}

// RecentImport contiene información de importación reciente
type RecentImport struct {
	ID                 string `json:"id"`
	FileName           string `json:"file_name"`
	AssetType          string `json:"asset_type"`
	TotalItems         int    `json:"total_items"`
	ValidItems         int    `json:"valid_items"`
	ItemsWithErrors    int    `json:"items_with_errors"`
	ExtractionMethod   string `json:"extraction_method"`
	CreatedAt          string `json:"created_at"`
}

// ============================================================
// GUARDAR DATOS
// ============================================================

// SaveImportToDB guarda un registro de importación
func SaveImportToDB(tenantID, branchID, userID, fileName, assetType, docType, method string, stats map[string]interface{}) (int64, error) {
	// Validar que branchID no sea vacío
	if branchID == "" {
		return 0, fmt.Errorf("branch_id is required")
	}

	var importID int64

	query := `
	INSERT INTO inventory_imports 
	(tenant_id, branch_id, user_id, file_name, asset_type, document_type, extraction_method, 
	 total_items, valid_items, items_with_warnings, items_with_errors)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	RETURNING id
	`

	err := db.QueryRow(
		query,
		tenantID,
		branchID,
		userID,
		fileName,
		assetType,
		docType,
		method,
		stats["total_items"],
		stats["valid_items"],
		stats["items_with_warnings"],
		stats["items_with_errors"],
	).Scan(&importID)

	if err != nil {
		return 0, err
	}

	log.Printf("✓ Import saved with ID: %d (tenant: %s, branch: %s)", importID, tenantID, branchID)
	return importID, nil
}

// SaveAssetsToDB guarda múltiples activos
func SaveAssetsToDB(importID int64, tenantID, branchID, userID, assetType string, items []map[string]interface{}) error {
	// Validar que branchID no sea vacío
	if branchID == "" {
		return fmt.Errorf("branch_id is required")
	}

	for _, item := range items {
		query := `
		INSERT INTO imported_assets 
		(import_id, tenant_id, branch_id, asset_type, nombre, metadata, created_by, updated_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`

		nombre := ""
		if n, ok := item["nombre"]; ok {
			if str, ok := n.(string); ok {
				nombre = str
			}
		}

		_, err := db.Exec(
			query,
			importID, tenantID, branchID, assetType, nombre, "{}", userID, userID,
		)

		if err != nil {
			log.Printf("ERROR saving asset: %v", err)
		}
	}

	log.Printf("✓ Saved %d assets (branch: %s)", len(items), branchID)
	return nil
}

// SaveErrorsToDB guarda errores de importación
func SaveErrorsToDB(importID int64, tenantID, branchID string, errors []string) error {
	// Validar que branchID no sea vacío
	if branchID == "" {
		return fmt.Errorf("branch_id is required")
	}

	for i, errMsg := range errors {
		query := `
		INSERT INTO import_errors 
		(import_id, tenant_id, branch_id, item_index, error_message) 
		VALUES ($1, $2, $3, $4, $5)
		`
		_, err := db.Exec(query, importID, tenantID, branchID, i, errMsg)
		if err != nil {
			log.Printf("ERROR saving error: %v", err)
		}
	}

	return nil
}

// SaveWarningsToDB guarda advertencias de importación
func SaveWarningsToDB(importID int64, tenantID, branchID string, warnings []string) error {
	// Validar que branchID no sea vacío
	if branchID == "" {
		return fmt.Errorf("branch_id is required")
	}

	for i, warnMsg := range warnings {
		query := `
		INSERT INTO import_warnings 
		(import_id, tenant_id, branch_id, item_index, warning_message) 
		VALUES ($1, $2, $3, $4, $5)
		`
		_, err := db.Exec(query, importID, tenantID, branchID, i, warnMsg)
		if err != nil {
			log.Printf("ERROR saving warning: %v", err)
		}
	}

	return nil
}

// ============================================================
// CONSULTAR DATOS CON AISLAMIENTO MULTI-TENANT
// ============================================================

// GetImportStatsToDB obtiene estadísticas de importación
// CRÍTICO: Filtra por branch_id para aislamiento multi-tenant
func GetImportStatsToDB(ctx context.Context, tenantID, branchID string) (*ImportStats, error) {
	// Validar que branchID no sea vacío
	if branchID == "" {
		return nil, fmt.Errorf("branch_id is required for stats query")
	}

	query := `
	SELECT 
		COUNT(*) as total_imports,
		COALESCE(SUM(total_items), 0) as total_items,
		COALESCE(SUM(valid_items), 0) as valid_items,
		COALESCE(SUM(items_with_errors), 0) as items_with_errors,
		COALESCE(SUM(items_with_warnings), 0) as items_with_warning
	FROM inventory_imports
	WHERE tenant_id = $1 AND branch_id = $2
	`

	stats := &ImportStats{}

	err := db.QueryRowContext(ctx, query, tenantID, branchID).Scan(
		&stats.TotalImports,
		&stats.TotalItems,
		&stats.ValidItems,
		&stats.ItemsWithErrors,
		&stats.ItemsWithWarning,
	)

	if err != nil && err != sql.ErrNoRows {
		log.Printf("ERROR querying stats for branch %s: %v", branchID, err)
		return nil, err
	}

	// Si no hay filas, retornar stats vacías (no error)
	if err == sql.ErrNoRows {
		return &ImportStats{}, nil
	}

	log.Printf("✓ Stats retrieved for branch %s: %d imports", branchID, stats.TotalImports)
	return stats, nil
}

// GetRecentImportsToDB obtiene importaciones recientes
// CRÍTICO: Filtra por branch_id para aislamiento multi-tenant
func GetRecentImportsToDB(ctx context.Context, tenantID, branchID string, limit int) ([]RecentImport, error) {
	// Validar que branchID no sea vacío
	if branchID == "" {
		return nil, fmt.Errorf("branch_id is required for recent imports query")
	}

	// Validar límite
	if limit <= 0 || limit > 1000 {
		limit = 10 // Valor por defecto
	}

	query := `
	SELECT 
		id, file_name, asset_type, total_items, valid_items, 
		items_with_errors, extraction_method, created_at
	FROM inventory_imports
	WHERE tenant_id = $1 AND branch_id = $2
	ORDER BY created_at DESC
	LIMIT $3
	`

	rows, err := db.QueryContext(ctx, query, tenantID, branchID, limit)
	if err != nil {
		log.Printf("ERROR querying recent imports for branch %s: %v", branchID, err)
		return nil, err
	}
	defer rows.Close()

	var imports []RecentImport

	for rows.Next() {
		var imp RecentImport

		err := rows.Scan(
			&imp.ID,
			&imp.FileName,
			&imp.AssetType,
			&imp.TotalItems,
			&imp.ValidItems,
			&imp.ItemsWithErrors,
			&imp.ExtractionMethod,
			&imp.CreatedAt,
		)
		if err != nil {
			log.Printf("ERROR scanning recent import: %v", err)
			return nil, err
		}

		imports = append(imports, imp)
	}

	if err := rows.Err(); err != nil {
		log.Printf("ERROR iterating recent imports: %v", err)
		return nil, err
	}

	log.Printf("✓ Retrieved %d recent imports for branch %s", len(imports), branchID)
	return imports, nil
}

// ============================================================
// VALIDACIÓN DE AISLAMIENTO MULTI-TENANT
// ============================================================

// ValidateImportBelongsToBranch valida que una importación pertenece a la sucursal
// Retorna true si la importación existe y pertenece a tenant+branch
func ValidateImportBelongsToBranch(ctx context.Context, importID, tenantID, branchID string) (bool, error) {
	if branchID == "" {
		return false, fmt.Errorf("branch_id is required for validation")
	}

	query := `
	SELECT 1 FROM inventory_imports
	WHERE id = $1 AND tenant_id = $2 AND branch_id = $3
	LIMIT 1
	`

	var exists int
	err := db.QueryRowContext(ctx, query, importID, tenantID, branchID).Scan(&exists)

	if err == sql.ErrNoRows {
		return false, nil
	}

	if err != nil {
		log.Printf("ERROR validating import %s for branch %s: %v", importID, branchID, err)
		return false, err
	}

	return true, nil
}
