package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
)

// ============================================================
// DETECTOR DE DUPLICADOS Y MÓDULO UPSERT
//
// ESTADO (C-6, ronda 2026-08-07): FUERA DE ALCANCE OPERATIVO -- verificado
// que ninguna función de este archivo tiene un llamador vivo. La única
// que las invoca es ProcessImportAsync (background_processor.go), y esa
// función a su vez no está registrada en ninguna ruta de main.go ni
// llamada desde ningún otro lugar del repo (grep exhaustivo sobre
// backend/*.go, sin resultados fuera de estos dos archivos). Tampoco lo
// están HandleJobWebSocket/HandleGetJobStatus/HandleListActiveJobs/
// ProcessImportWithSimulation, del mismo archivo -- todo indica un
// pipeline de importación asíncrona vía WebSocket que quedó reemplazado
// por el flujo real (import_upload_handlers.go) sin borrar el código
// anterior.
//
// Decisión explícita del usuario: NO migrar a TenantDBFromContext ahora
// (no hay ninguna ruta activa que ejercite este código, así que no
// bloquea la reactivación de RLS), pero TAMPOCO eliminarlo todavía -- se
// deja documentado como código legado, por si alguien quiere recuperar
// la funcionalidad. Si esto vuelve a registrarse como ruta o job activo
// en el futuro, DEBE migrarse a TenantDBFromContext (siguiendo el mismo
// patrón que dcim_assets.go/dashboard.go/ai_chat.go) ANTES de habilitarlo
// -- no basta con que "ya estuviera migrado antes", porque nunca lo
// estuvo: solo usó `db *sql.DB` crudo desde que se escribió.
//
// SÍ se corrigió, en esta misma ronda, un bug de aislamiento
// independiente de RLS/migración: updateAsset (más abajo) filtraba su
// UPDATE solo por `WHERE id = $10`, sin tenant_id/branch_id. No era
// explotable hoy (el único llamador, UpsertAsset, siempre pasa un
// assetID que ya salió de una búsqueda de DetectDuplicates filtrada por
// tenant_id/branch_id), pero es una defensa en profundidad razonable
// para código que, aunque hoy no se ejecute, sigue siendo código real que
// alguien podría reactivar.
// ============================================================

type DuplicateMatch struct {
	ExistingAssetID   string
	MatchFields       []string
	MatchConfidence   float64
	ExistingAssetData map[string]interface{}
}

// ============================================================
// FUNCIÓN: DETECTAR DUPLICADOS
// ============================================================

func DetectDuplicates(db TenantDB, tenantID string, branchID string, assetType string, assetData map[string]interface{}) ([]DuplicateMatch, error) {
	var matches []DuplicateMatch

	// Campos clave para búsqueda de duplicados
	searchFields := getSearchFieldsForAssetType(assetType)

	for _, field := range searchFields {
		value, exists := assetData[field]
		if !exists || value == "" {
			continue
		}

		valueStr := fmt.Sprintf("%v", value)
		if valueStr == "" {
			continue
		}

		// Buscar en la tabla assets
		query := `
			SELECT 
				id,
				name,
				metadata,
				serial_number,
				internal_code,
				rfid_tag,
				model,
				manufacturer,
				status,
				location_id,
				created_at
			FROM assets
			WHERE tenant_id = $1 
				AND branch_id = $2
				AND asset_type_id = $3
		`

		var args []interface{}
		args = append(args, tenantID, branchID, assetType)

		// Agregar condición según el campo
		switch field {
		case "serial_number":
			query += " AND serial_number = $4"
			args = append(args, valueStr)
		case "internal_code":
			query += " AND internal_code = $4"
			args = append(args, valueStr)
		case "rfid_tag":
			query += " AND rfid_tag = $4"
			args = append(args, valueStr)
		case "nombre", "name":
			query += " AND LOWER(name) = LOWER($4)"
			args = append(args, valueStr)
		case "mac":
			query += " AND metadata->>'mac' = $4"
			args = append(args, valueStr)
		case "ip":
			query += " AND metadata->>'ip' = $4"
			args = append(args, valueStr)
		}

		rows, err := db.Query(query, args...)
		if err != nil {
			log.Printf("Error querying duplicates: %v", err)
			continue
		}
		defer rows.Close()

		for rows.Next() {
			var id, name, serialNumber, internalCode, rfidTag, model, manufacturer, status, locationID string
			var metadata sql.NullString
			var createdAt sql.NullTime

			err := rows.Scan(&id, &name, &metadata, &serialNumber, &internalCode, &rfidTag, &model, &manufacturer, &status, &locationID, &createdAt)
			if err != nil {
				log.Printf("Error scanning duplicate: %v", err)
				continue
			}

			// Calcular confianza de coincidencia
			confidence := calculateMatchConfidence(field, assetData, map[string]interface{}{
				"id":            id,
				"name":          name,
				"serial_number": serialNumber,
				"internal_code": internalCode,
				"rfid_tag":      rfidTag,
				"model":         model,
				"manufacturer":  manufacturer,
				"status":        status,
				"location_id":   locationID,
			})

			if confidence > 70 { // Umbral de confianza
				match := DuplicateMatch{
					ExistingAssetID: id,
					MatchFields:     []string{field},
					MatchConfidence: confidence,
					ExistingAssetData: map[string]interface{}{
						"id":            id,
						"name":          name,
						"serial_number": serialNumber,
						"model":         model,
						"status":        status,
					},
				}

				// Verificar si ya existe este match
				found := false
				for i, existing := range matches {
					if existing.ExistingAssetID == id {
						matches[i].MatchFields = append(matches[i].MatchFields, field)
						matches[i].MatchConfidence = (matches[i].MatchConfidence + confidence) / 2
						found = true
						break
					}
				}

				if !found {
					matches = append(matches, match)
				}
			}
		}
	}

	return matches, nil
}

// ============================================================
// FUNCIÓN: CALCULAR CONFIANZA DE COINCIDENCIA
// ============================================================

func calculateMatchConfidence(field string, newData map[string]interface{}, existingData map[string]interface{}) float64 {
	baseConfidence := 70.0

	// Aumentar confianza según el tipo de campo
	switch field {
	case "serial_number":
		baseConfidence = 95.0 // Serial es muy confiable
	case "internal_code":
		baseConfidence = 90.0
	case "rfid_tag":
		baseConfidence = 95.0
	case "mac":
		baseConfidence = 90.0
	case "ip":
		baseConfidence = 85.0
	case "nombre", "name":
		baseConfidence = 60.0 // Nombre es menos confiable
	}

	// Verificar si otros campos coinciden
	if newModel, ok := newData["modelo"]; ok {
		if existingModel, ok := existingData["model"]; ok {
			if fmt.Sprintf("%v", newModel) == fmt.Sprintf("%v", existingModel) {
				baseConfidence += 10
			}
		}
	}

	if baseConfidence > 100 {
		baseConfidence = 100
	}

	return baseConfidence
}

// ============================================================
// FUNCIÓN: OBTENER CAMPOS DE BÚSQUEDA POR TIPO
// ============================================================

func getSearchFieldsForAssetType(assetType string) []string {
	switch strings.ToLower(assetType) {
	case "switch":
		return []string{"serial_number", "internal_code", "mac", "ip", "nombre"}
	case "servidor", "server":
		return []string{"serial_number", "hostname", "mac", "ip"}
	case "rack":
		return []string{"internal_code", "nombre"}
	case "ups", "pdu":
		return []string{"serial_number", "internal_code", "nombre"}
	case "patch_panel":
		return []string{"internal_code", "nombre"}
	case "nodo", "node":
		return []string{"jack_origen", "jack_destino", "nombre"}
	case "fibra", "fiber":
		return []string{"nombre", "internal_code"}
	default:
		return []string{"serial_number", "internal_code", "rfid_tag", "nombre"}
	}
}

// ============================================================
// FUNCIÓN: UPSERT (INSERT OR UPDATE)
// ============================================================

type UpsertResult struct {
	AssetID string
	Action  string // "inserted" o "updated"
	IsNew   bool
	Changes map[string]interface{}
}

func UpsertAsset(db TenantDB, tenantID string, branchID string, assetType string, assetData map[string]interface{}) (*UpsertResult, error) {
	// Detectar duplicados
	duplicates, err := DetectDuplicates(db, tenantID, branchID, assetType, assetData)
	if err != nil {
		return nil, err
	}

	result := &UpsertResult{
		Changes: make(map[string]interface{}),
	}

	// Si hay duplicados, actualizar el existente
	if len(duplicates) > 0 {
		// Usar el match con mayor confianza
		bestMatch := duplicates[0]
		for _, match := range duplicates {
			if match.MatchConfidence > bestMatch.MatchConfidence {
				bestMatch = match
			}
		}

		// Actualizar el activo existente (tenant_id/branch_id explícitos --
		// ver corrección 2026-08-07 en la definición de updateAsset).
		err := updateAsset(db, tenantID, branchID, bestMatch.ExistingAssetID, assetData)
		if err != nil {
			return nil, err
		}

		result.AssetID = bestMatch.ExistingAssetID
		result.Action = "updated"
		result.IsNew = false
		result.Changes = assetData

		log.Printf("Activo actualizado: %s (duplicado de %s)", bestMatch.ExistingAssetID, assetData["nombre"])
		return result, nil
	}

	// Si no hay duplicados, insertar nuevo
	assetID, err := insertAsset(db, tenantID, branchID, assetType, assetData)
	if err != nil {
		return nil, err
	}

	result.AssetID = assetID
	result.Action = "inserted"
	result.IsNew = true
	result.Changes = assetData

	log.Printf("Nuevo activo creado: %s", assetID)
	return result, nil
}

// ============================================================
// FUNCIÓN: INSERTAR NUEVO ACTIVO
// ============================================================

func insertAsset(db TenantDB, tenantID string, branchID string, assetType string, assetData map[string]interface{}) (string, error) {
	query := `
		INSERT INTO assets (
			tenant_id,
			branch_id,
			asset_type_id,
			name,
			serial_number,
			internal_code,
			rfid_tag,
			model,
			manufacturer,
			status,
			location_id,
			metadata,
			created_at,
			updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
		RETURNING id
	`

	var assetID string
	err := db.QueryRow(
		query,
		tenantID,
		branchID,
		assetType,
		assetData["nombre"],
		assetData["serial_number"],
		assetData["internal_code"],
		assetData["rfid_tag"],
		assetData["modelo"],
		assetData["fabricante"],
		assetData["estado"],
		assetData["ubicacion"],
		assetData, // metadata como JSONB
	).Scan(&assetID)

	if err != nil {
		log.Printf("Error inserting asset: %v", err)
		return "", err
	}

	return assetID, nil
}

// ============================================================
// FUNCIÓN: ACTUALIZAR ACTIVO EXISTENTE
// ============================================================

// updateAsset -- CORRECCIÓN 2026-08-07 (C-6, hallazgo independiente de
// RLS): la versión original filtraba solo por `WHERE id = $10`, sin
// tenant_id ni branch_id. Hoy no era explotable porque el único llamador
// (UpsertAsset) siempre pasa un assetID que ya salió de
// DetectDuplicates, cuya propia consulta SÍ filtra por tenant_id/
// branch_id -- pero es frágil: cualquier otro llamador futuro (o un bug
// en DetectDuplicates) habría permitido actualizar un activo de OTRO
// tenant/sucursal sin que esta función lo evitara por su cuenta. Se
// agregan tenant_id/branch_id como parámetros explícitos y como
// condición WHERE adicional -- defensa en profundidad, independiente de
// si esta función corre dentro de una transacción con contexto RLS o no.
// Decisión del usuario: corregir esto ahora mismo aunque el archivo
// completo quede fuera de alcance operativo (ver nota de cabecera del
// archivo) -- es un bug de aislamiento real, aunque no explotable hoy.
func updateAsset(db TenantDB, tenantID string, branchID string, assetID string, assetData map[string]interface{}) error {
	query := `
		UPDATE assets SET
			name = COALESCE($1, name),
			serial_number = COALESCE($2, serial_number),
			internal_code = COALESCE($3, internal_code),
			rfid_tag = COALESCE($4, rfid_tag),
			model = COALESCE($5, model),
			manufacturer = COALESCE($6, manufacturer),
			status = COALESCE($7, status),
			location_id = COALESCE($8, location_id),
			metadata = jsonb_set(metadata, '{}', $9::jsonb),
			updated_at = NOW()
		WHERE id = $10 AND tenant_id = $11 AND branch_id = $12
	`

	_, err := db.Exec(
		query,
		assetData["nombre"],
		assetData["serial_number"],
		assetData["internal_code"],
		assetData["rfid_tag"],
		assetData["modelo"],
		assetData["fabricante"],
		assetData["estado"],
		assetData["ubicacion"],
		assetData,
		assetID,
		tenantID,
		branchID,
	)

	if err != nil {
		log.Printf("Error updating asset: %v", err)
		return err
	}

	return nil
}

// ============================================================
// FUNCIÓN: UPSERT CON TRANSACCIÓN (MÚLTIPLES ACTIVOS)
// ============================================================

func UpsertAssetsTransaction(db *sql.DB, tenantID string, branchID string, assetType string, assetsList []map[string]interface{}) ([]UpsertResult, error) {
	scope := JobTenantContext{TenantID: tenantID, BranchID: branchID}
	tx, err := BeginJobTenantTx(context.Background(), db, scope, true)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var results []UpsertResult

	for _, assetData := range assetsList {
		// Detectar duplicados
		duplicates, err := DetectDuplicates(tx, tenantID, branchID, assetType, assetData)
		if err != nil {
			log.Printf("Error detecting duplicates: %v", err)
			continue
		}

		result := UpsertResult{
			Changes: make(map[string]interface{}),
		}

		if len(duplicates) > 0 {
			// Actualizar existente
			bestMatch := duplicates[0]
			for _, match := range duplicates {
				if match.MatchConfidence > bestMatch.MatchConfidence {
					bestMatch = match
				}
			}

			result.AssetID = bestMatch.ExistingAssetID
			result.Action = "updated"
			result.IsNew = false
		} else {
			// Insertar nuevo
			result.Action = "inserted"
			result.IsNew = true
		}

		result.Changes = assetData
		results = append(results, result)
	}

	// Confirmar transacción
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return results, nil
}
