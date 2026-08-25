package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

var (
	ErrManualAssetCode = errors.New("manual asset code is not allowed")
	ErrAssetNameNeeded = errors.New("descriptive asset name is required")
)

type managedAssetInput struct {
	AssetTypeCode string
	Name          string
	ManualCode    string
	Status        string
	Manufacturer  string
	Model         string
	SerialNumber  string
	Observations  string
	InstallYear   int
}

type managedAssetTx struct {
	DB         TenantDB
	AssetID    string
	Assignment NomenclatureAssignment
}

func beginManagedAsset(database TenantDB, tenantID, branchID, userID string, input managedAssetInput) (*managedAssetTx, error) {
	if strings.TrimSpace(input.ManualCode) != "" {
		return nil, ErrManualAssetCode
	}
	if strings.TrimSpace(input.Name) == "" {
		return nil, ErrAssetNameNeeded
	}
	if input.Status == "" {
		input.Status = "active"
	}
	var assetTypeID string
	if err := database.QueryRow(`SELECT id FROM asset_types WHERE code=$1`, input.AssetTypeCode).Scan(&assetTypeID); err != nil {
		return nil, fmt.Errorf("resolve asset type: %w", err)
	}
	assignment, err := (&DCIMHandler{}).generateInternalCode(database, tenantID, branchID, input.AssetTypeCode)
	if err != nil {
		return nil, err
	}
	assetID := uuid.NewString()
	_, err = database.Exec(`
		INSERT INTO assets (
			id, tenant_id, branch_id, asset_type_id,
			internal_code, nomenclature_id, nomenclature_sequence, name,
			status, manufacturer, model, serial_number, observations, install_year, created_by
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),NULLIF($11,''),NULLIF($12,''),NULLIF($13,''),NULLIF($14,0),$15)`,
		assetID, tenantID, branchID, assetTypeID,
		assignment.Code, assignment.ID, assignment.Sequence, strings.TrimSpace(input.Name),
		input.Status, input.Manufacturer, input.Model, input.SerialNumber, input.Observations, input.InstallYear, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("insert managed asset: %w", err)
	}
	return &managedAssetTx{DB: database, AssetID: assetID, Assignment: assignment}, nil
}

func writeManagedAssetError(w http.ResponseWriter, err error, assetTypeCode string) {
	w.Header().Set("Content-Type", "application/json")
	switch {
	case errors.Is(err, ErrNomenclatureRequired):
		writeNomenclatureRequired(w, assetTypeCode)
	case errors.Is(err, ErrManualAssetCode):
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "manual_code_not_allowed", "asset_type": strings.ToLower(assetTypeCode),
			"message": "El código técnico se genera exclusivamente a partir de la nomenclatura activa.",
		})
	case errors.Is(err, ErrAssetNameNeeded):
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "name_required", "message": "El nombre descriptivo es obligatorio."})
	case strings.Contains(err.Error(), "unique"):
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "asset_code_conflict", "message": "No fue posible reservar un código técnico único."})
	default:
		http.Error(w, `{"error":"database error creating asset"}`, http.StatusInternalServerError)
	}
}

func commitManagedAsset(w http.ResponseWriter, managed *managedAssetTx, payload map[string]interface{}) bool {
	if payload == nil {
		payload = map[string]interface{}{}
	}
	payload["asset_id"] = managed.AssetID
	payload["internal_code"] = managed.Assignment.Code
	payload["nomenclature_id"] = managed.Assignment.ID
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(payload)
	return true
}
