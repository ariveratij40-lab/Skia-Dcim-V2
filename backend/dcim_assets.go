package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ==========================================
// Tipos de Datos DCIM
// ==========================================

type AssetType struct {
	ID          string `json:"id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
}

type Location struct {
	ID          string `json:"id"`
	TenantID    string `json:"tenant_id"`
	BranchID    string `json:"branch_id"`
	Name        string `json:"name"`
	Floor       string `json:"floor"`
	Room        string `json:"room"`
	Zone        string `json:"zone"`
	Description string `json:"description"`
}

type Asset struct {
	ID              string     `json:"id"`
	TenantID        string     `json:"tenant_id"`
	BranchID        string     `json:"branch_id"`
	AssetTypeID     string     `json:"asset_type_id"`
	AssetTypeCode   string     `json:"asset_type_code"`
	AssetTypeName   string     `json:"asset_type_name"`
	LocationID      *string    `json:"location_id"`
	LocationName    *string    `json:"location_name"`
	InternalCode    string     `json:"internal_code"`
	Name            string     `json:"name"`
	SerialNumber    *string    `json:"serial_number"`
	Model           *string    `json:"model"`
	Manufacturer    *string    `json:"manufacturer"`
	ManufacturerID  *string    `json:"manufacturer_id"`
	ModelID         *string    `json:"model_id"`
	ProviderID      *string    `json:"provider_id"`
	Status          string     `json:"status"`
	InventoryStatus *string    `json:"inventory_status"`
	RFIDTag         *string    `json:"rfid_tag"`
	QRCode          *string    `json:"qr_code"`
	InstallYear     *int       `json:"install_year"`
	PurchaseDate    *string    `json:"purchase_date"`
	WarrantyExpiry  *string    `json:"warranty_expiry"`
	CostUSD         *float64   `json:"cost_usd"`
	Observations    *string    `json:"observations"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// TechnicalData contiene los campos específicos de la tabla satélite según el tipo de activo.
// Solo se usan los campos relevantes al tipo; el resto se ignora.
type TechnicalData struct {
	// RACK
	TotalU    *int     `json:"total_u"`
	HeightMM  *int     `json:"height_mm"`
	WidthMM   *int     `json:"width_mm"`
	DepthMM   *int     `json:"depth_mm"`
	PowerKW   *float64 `json:"power_kw"`
	// SWITCH
	PortCount    *int    `json:"port_count"`
	UplinkCount  *int    `json:"uplink_count"`
	ManagementIP *string `json:"management_ip"`
	RackID       *string `json:"rack_id"`
	RackUnit     *int    `json:"rack_unit"`
	// UPS
	CapacityKVA       *float64 `json:"capacity_kva"`
	BatteryRuntimeMin *int     `json:"battery_runtime_min"`
	// PDU
	OutletCount *int     `json:"outlet_count"`
	Amperage    *float64 `json:"amperage"`
	// PATCH_PANEL
	PortType *string `json:"port_type"`
	// MDF/IDF
	MDFType         *string `json:"mdf_type"`
	RackCount        *int    `json:"rack_count"`
	PatchPanelCount  *int    `json:"patch_panel_count"`
	SwitchCount      *int    `json:"switch_count"`
	UPSCount         *int    `json:"ups_count"`
}

type CreateAssetRequest struct {
	AssetTypeID     string         `json:"asset_type_id"`
	LocationID      *string        `json:"location_id"`
	TechnicalRoomID *string        `json:"technical_room_id"`
	Name            string         `json:"name"`
	SerialNumber    *string        `json:"serial_number"`
	Model           *string        `json:"model"`
	Manufacturer    *string        `json:"manufacturer"`
	ManufacturerID  *string        `json:"manufacturer_id"`
	ModelID         *string        `json:"model_id"`
	ProviderID      *string        `json:"provider_id"`
	Status          string         `json:"status"`
	InventoryStatus *string        `json:"inventory_status"`
	RFIDTag         *string        `json:"rfid_tag"`
	QRCode          *string        `json:"qr_code"`
	InstallYear     *int           `json:"install_year"`
	PurchaseDate    *string        `json:"purchase_date"`
	WarrantyExpiry  *string        `json:"warranty_expiry"`
	CostUSD         *float64       `json:"cost_usd"`
	Observations    *string        `json:"observations"`
	TechnicalData   *TechnicalData `json:"technical_data"`
}

type UpdateAssetRequest struct {
	AssetTypeID     *string  `json:"asset_type_id"`
	LocationID      *string  `json:"location_id"`
	InternalCode    *string  `json:"internal_code"`
	Name            *string  `json:"name"`
	SerialNumber    *string  `json:"serial_number"`
	Model           *string  `json:"model"`
	Manufacturer    *string  `json:"manufacturer"`
	ManufacturerID  *string  `json:"manufacturer_id"`
	ModelID         *string  `json:"model_id"`
	ProviderID      *string  `json:"provider_id"`
	Status          *string  `json:"status"`
	InventoryStatus *string  `json:"inventory_status"`
	RFIDTag         *string  `json:"rfid_tag"`
	QRCode          *string  `json:"qr_code"`
	InstallYear     *int     `json:"install_year"`
	PurchaseDate    *string  `json:"purchase_date"`
	WarrantyExpiry  *string  `json:"warranty_expiry"`
	CostUSD         *float64 `json:"cost_usd"`
	Observations    *string  `json:"observations"`
}

type AssetsListResponse struct {
	Assets []Asset `json:"assets"`
	Total  int     `json:"total"`
	Page   int     `json:"page"`
	Limit  int     `json:"limit"`
}

// ==========================================
// DCIMHandler
// ==========================================

type DCIMHandler struct {
	DB *sql.DB
}

func NewDCIMHandler(db *sql.DB) *DCIMHandler {
	return &DCIMHandler{DB: db}
}

// getSessionContext extrae tenant_id y branch_id de la sesión activa
func (h *DCIMHandler) getSessionContext(r *http.Request) (userID, tenantID, branchID string, err error) {
	cookie, err := r.Cookie("session_token")
	if err != nil {
		return "", "", "", err
	}
	token := cookie.Value

	var tenantNull, branchNull sql.NullString
	err = h.DB.QueryRow(
		`SELECT u.id, s.tenant_id, s.branch_id
		 FROM sessions s
		 JOIN users u ON s.user_id = u.id
		 WHERE s.token = $1 AND s.expires_at > $2`,
		token, time.Now().Unix(),
	).Scan(&userID, &tenantNull, &branchNull)
	if err != nil {
		return "", "", "", err
	}
	tenantID = tenantNull.String
	branchID = branchNull.String
	return
}

// ==========================================
// HandleAssets — GET (list) y POST (create)
// ==========================================
func (h *DCIMHandler) HandleAssets(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		h.listAssets(w, r)
	case http.MethodPost:
		h.createAsset(w, r)
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// HandleAssetByID — GET, PUT, DELETE para /api/dcim/assets/{id}
func (h *DCIMHandler) HandleAssetByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/dcim/assets/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		http.Error(w, `{"error":"missing asset id"}`, http.StatusBadRequest)
		return
	}
	assetID := parts[0]

	switch r.Method {
	case http.MethodGet:
		h.getAsset(w, r, assetID)
	case http.MethodPut:
		h.updateAsset(w, r, assetID)
	case http.MethodDelete:
		h.deleteAsset(w, r, assetID)
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// HandleAssetTypes — GET /api/dcim/asset-types
// Devuelve los 13 tipos canónicos desde la BD (INV-DCM-0014: Single Source of Truth)
func (h *DCIMHandler) HandleAssetTypes(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	rows, err := h.DB.Query(
		`SELECT id, code, name, COALESCE(description,''), COALESCE(icon,'')
		 FROM asset_types ORDER BY name`)
	if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	types := []AssetType{}
	for rows.Next() {
		var at AssetType
		if err := rows.Scan(&at.ID, &at.Code, &at.Name, &at.Description, &at.Icon); err != nil {
			continue
		}
		types = append(types, at)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"asset_types": types})
}

// HandleLocations — GET /api/dcim/locations
func (h *DCIMHandler) HandleLocations(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	_, tenantID, branchID, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	rows, err := h.DB.Query(
		`SELECT id, tenant_id, branch_id, name,
		        COALESCE(floor,''), COALESCE(room,''), COALESCE(zone,''), COALESCE(description,'')
		 FROM locations
		 WHERE tenant_id = $1 AND branch_id = $2
		 ORDER BY name`,
		tenantID, branchID,
	)
	if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	locations := []Location{}
	for rows.Next() {
		var l Location
		if err := rows.Scan(&l.ID, &l.TenantID, &l.BranchID, &l.Name, &l.Floor, &l.Room, &l.Zone, &l.Description); err != nil {
			continue
		}
		locations = append(locations, l)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"locations": locations})
}

// HandleCatalogs — GET /api/dcim/catalogs
// Single Source of Truth para el frontend (INV-DCM-0014).
// Devuelve en una sola llamada: asset_types, manufacturers, models, providers, statuses.
func (h *DCIMHandler) HandleCatalogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	_, tenantID, _, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Asset Types (globales)
	atRows, err := h.DB.Query(`SELECT id, code, name, COALESCE(description,''), COALESCE(icon,'') FROM asset_types ORDER BY name`)
	if err != nil {
		http.Error(w, `{"error":"database error fetching asset_types"}`, http.StatusInternalServerError)
		return
	}
	defer atRows.Close()
	assetTypes := []AssetType{}
	for atRows.Next() {
		var at AssetType
		if err := atRows.Scan(&at.ID, &at.Code, &at.Name, &at.Description, &at.Icon); err == nil {
			assetTypes = append(assetTypes, at)
		}
	}

	// Manufacturers (por tenant)
	type Manufacturer struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Status string `json:"status"`
	}
	mfRows, err := h.DB.Query(
		`SELECT id, name, status FROM catalogs_manufacturers WHERE tenant_id = $1 AND status = 'active' ORDER BY name`,
		tenantID,
	)
	manufacturers := []Manufacturer{}
	if err == nil {
		defer mfRows.Close()
		for mfRows.Next() {
			var m Manufacturer
			if err := mfRows.Scan(&m.ID, &m.Name, &m.Status); err == nil {
				manufacturers = append(manufacturers, m)
			}
		}
	}

	// Providers (por tenant)
	type Provider struct {
		ID           string `json:"id"`
		ProviderType string `json:"provider_type"`
		LegalName    string `json:"legal_name"`
		TradeName    string `json:"trade_name"`
		Status       string `json:"status"`
	}
	pvRows, err := h.DB.Query(
		`SELECT id, provider_type, legal_name, COALESCE(trade_name,''), status FROM catalogs_providers WHERE tenant_id = $1 AND status = 'active' ORDER BY legal_name`,
		tenantID,
	)
	providers := []Provider{}
	if err == nil {
		defer pvRows.Close()
		for pvRows.Next() {
			var p Provider
			if err := pvRows.Scan(&p.ID, &p.ProviderType, &p.LegalName, &p.TradeName, &p.Status); err == nil {
				providers = append(providers, p)
			}
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"asset_types":   assetTypes,
		"manufacturers": manufacturers,
		"providers":     providers,
		// Estados canónicos del sistema (INV-DCM-0014: no hardcodeados en el frontend)
		"operational_statuses": []string{"active", "inactive", "maintenance", "decommissioned", "unknown"},
		"inventory_statuses":   []string{"planned", "ordered", "received", "inventory", "installed", "retired"},
	})
}

// HandleHierarchy — GET /api/dcim/hierarchy
// Devuelve la jerarquía física completa del tenant: buildings → floors → zones → technical_rooms
func (h *DCIMHandler) HandleHierarchy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	_, tenantID, branchID, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	type TechnicalRoom struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		RoomType string `json:"room_type"`
		Status   string `json:"status"`
	}
	type Zone struct {
		ID             string          `json:"id"`
		Name           string          `json:"name"`
		Status         string          `json:"status"`
		TechnicalRooms []TechnicalRoom `json:"technical_rooms"`
	}
	type Floor struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		FloorNumber *int   `json:"floor_number"`
		Status      string `json:"status"`
		Zones       []Zone `json:"zones"`
	}
	type Building struct {
		ID       string  `json:"id"`
		Name     string  `json:"name"`
		Status   string  `json:"status"`
		Floors   []Floor `json:"floors"`
	}

	// Obtener buildings del branch
	bRows, err := h.DB.Query(
		`SELECT id, name, status FROM buildings WHERE tenant_id = $1 AND branch_id = $2 AND status = 'active' ORDER BY name`,
		tenantID, branchID,
	)
	if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}
	defer bRows.Close()

	buildings := []Building{}
	for bRows.Next() {
		var b Building
		if err := bRows.Scan(&b.ID, &b.Name, &b.Status); err != nil {
			continue
		}
		// Floors de este building
		fRows, _ := h.DB.Query(
			`SELECT id, name, floor_number, status FROM floors WHERE tenant_id = $1 AND building_id = $2 AND status = 'active' ORDER BY floor_number NULLS LAST, name`,
			tenantID, b.ID,
		)
		b.Floors = []Floor{}
		if fRows != nil {
			defer fRows.Close()
			for fRows.Next() {
				var f Floor
				if err := fRows.Scan(&f.ID, &f.Name, &f.FloorNumber, &f.Status); err != nil {
					continue
				}
				// Zones de este floor
				zRows, _ := h.DB.Query(
					`SELECT id, name, status FROM zones WHERE tenant_id = $1 AND floor_id = $2 AND status = 'active' ORDER BY name`,
					tenantID, f.ID,
				)
				f.Zones = []Zone{}
				if zRows != nil {
					defer zRows.Close()
					for zRows.Next() {
						var z Zone
						if err := zRows.Scan(&z.ID, &z.Name, &z.Status); err != nil {
							continue
						}
						// Technical rooms de esta zone
						trRows, _ := h.DB.Query(
							`SELECT id, name, room_type, status FROM technical_rooms WHERE tenant_id = $1 AND zone_id = $2 AND status = 'active' ORDER BY name`,
							tenantID, z.ID,
						)
						z.TechnicalRooms = []TechnicalRoom{}
						if trRows != nil {
							defer trRows.Close()
							for trRows.Next() {
								var tr TechnicalRoom
								if err := trRows.Scan(&tr.ID, &tr.Name, &tr.RoomType, &tr.Status); err == nil {
									z.TechnicalRooms = append(z.TechnicalRooms, tr)
								}
							}
						}
						f.Zones = append(f.Zones, z)
					}
				}
				b.Floors = append(b.Floors, f)
			}
		}
		buildings = append(buildings, b)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"buildings": buildings})
}

// ==========================================
// generateInternalCode — Motor de Nomenclaturas (INV-DCM-0015)
// Genera el internal_code de forma transaccional usando SELECT FOR UPDATE
// para prevenir colisiones en entornos concurrentes.
// Formato: [PREFIX][SEP][BRANCH_CODE][SEP][SEQ_PADDED]
// Ejemplo: SW-TIJ-0001
// ==========================================
func (h *DCIMHandler) generateInternalCode(tx *sql.Tx, tenantID, branchID, assetTypeCode string) (string, error) {
	// Obtener la regla de nomenclatura con bloqueo exclusivo (FOR UPDATE)
	var prefix, separator string
	var seqDigits, lastSeq int
	var includeBranch bool

	err := tx.QueryRow(
		`SELECT prefix, separator, seq_digits, last_seq, include_branch
		 FROM naming_rules
		 WHERE tenant_id = $1 AND asset_type_code = $2
		 FOR UPDATE`,
		tenantID, assetTypeCode,
	).Scan(&prefix, &separator, &seqDigits, &lastSeq, &includeBranch)

	if err == sql.ErrNoRows {
		// Sin regla configurada: usar prefijo genérico basado en el tipo
		prefix = strings.ToUpper(assetTypeCode[:minInt(3, len(assetTypeCode))])
		separator = "-"
		seqDigits = 4
		lastSeq = 0
		includeBranch = false
	} else if err != nil {
		return "", fmt.Errorf("error leyendo naming_rule: %w", err)
	}

	// Incrementar secuencia
	newSeq := lastSeq + 1

	// Actualizar la secuencia en la BD (dentro de la misma transacción)
	if err == nil { // Solo actualizar si la regla existe
		_, err = tx.Exec(
			`UPDATE naming_rules SET last_seq = $1, updated_at = NOW()
			 WHERE tenant_id = $2 AND asset_type_code = $3`,
			newSeq, tenantID, assetTypeCode,
		)
		if err != nil {
			return "", fmt.Errorf("error actualizando naming_rule seq: %w", err)
		}
	}

	// Obtener código corto de la sucursal (primeras 3 letras de city o name)
	branchCode := ""
	if includeBranch {
		var city, name sql.NullString
		_ = tx.QueryRow(`SELECT city, name FROM branches WHERE id = $1`, branchID).Scan(&city, &name)
		if city.Valid && city.String != "" {
			branchCode = strings.ToUpper(strings.ReplaceAll(city.String, " ", ""))
			if len(branchCode) > 3 {
				branchCode = branchCode[:3]
			}
		} else if name.Valid && name.String != "" {
			branchCode = strings.ToUpper(strings.ReplaceAll(name.String, " ", ""))
			if len(branchCode) > 3 {
				branchCode = branchCode[:3]
			}
		}
	}

	// Formatear secuencial con padding
	seqStr := fmt.Sprintf("%0*d", seqDigits, newSeq)

	// Construir el código
	parts := []string{prefix}
	if branchCode != "" {
		parts = append(parts, branchCode)
	}
	parts = append(parts, seqStr)

	return strings.Join(parts, separator), nil
}

// minInt helper para longitud de string (evita conflicto con builtin min de Go 1.21+)
func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ==========================================
// listAssets — GET /api/dcim/assets
// ==========================================
func (h *DCIMHandler) listAssets(w http.ResponseWriter, r *http.Request) {
	_, tenantID, branchID, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	q := r.URL.Query()
	statusFilter := q.Get("status")
	typeFilter := q.Get("type")
	search := q.Get("search")

	query := `
		SELECT a.id, a.tenant_id, a.branch_id,
		       a.asset_type_id, at.code, at.name AS type_name,
		       a.location_id, l.name AS location_name,
		       a.internal_code, a.name,
		       a.serial_number, a.model, a.manufacturer,
		       a.manufacturer_id, a.model_id, a.provider_id,
		       a.status, a.inventory_status,
		       a.rfid_tag, a.qr_code,
		       a.install_year, a.observations,
		       a.created_at, a.updated_at
		FROM assets a
		JOIN asset_types at ON a.asset_type_id = at.id
		LEFT JOIN locations l ON a.location_id = l.id
		WHERE a.tenant_id = $1 AND a.branch_id = $2`

	args := []interface{}{tenantID, branchID}
	argIdx := 3

	if statusFilter != "" {
		query += ` AND a.status = $` + itoa(argIdx)
		args = append(args, statusFilter)
		argIdx++
	}
	if typeFilter != "" {
		query += ` AND at.code = $` + itoa(argIdx)
		args = append(args, typeFilter)
		argIdx++
	}
	if search != "" {
		query += ` AND (a.name ILIKE $` + itoa(argIdx) + ` OR a.internal_code ILIKE $` + itoa(argIdx) + `)`
		args = append(args, "%"+search+"%")
		argIdx++
	}

	query += ` ORDER BY a.internal_code`

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	assets := []Asset{}
	for rows.Next() {
		var a Asset
		var purchaseDate, warrantyExpiry sql.NullString
		err := rows.Scan(
			&a.ID, &a.TenantID, &a.BranchID,
			&a.AssetTypeID, &a.AssetTypeCode, &a.AssetTypeName,
			&a.LocationID, &a.LocationName,
			&a.InternalCode, &a.Name,
			&a.SerialNumber, &a.Model, &a.Manufacturer,
			&a.ManufacturerID, &a.ModelID, &a.ProviderID,
			&a.Status, &a.InventoryStatus,
			&a.RFIDTag, &a.QRCode,
			&a.InstallYear, &a.Observations,
			&a.CreatedAt, &a.UpdatedAt,
		)
		_ = purchaseDate
		_ = warrantyExpiry
		if err != nil {
			log.Printf("Error scanning asset: %v", err)
			continue
		}
		assets = append(assets, a)
	}

	// Agregar activos importados — filtrado por tenant_id (INV-CORE-0002 / corrige F-AST-01)
	importedQuery := `
		SELECT
			CAST(id AS TEXT) as id,
			tenant_id::TEXT as tenant_id,
			$2::TEXT as branch_id,
			asset_type as asset_type_id,
			asset_type as asset_type_code,
			asset_type as asset_type_name,
			metadata->>'ubicacion' as location_id,
			metadata->>'ubicacion' as location_name,
			'' as internal_code,
			nombre as name,
			metadata->>'serial_number' as serial_number,
			metadata->>'modelo' as model,
			'' as manufacturer,
			NULL::UUID as manufacturer_id,
			NULL::UUID as model_id,
			NULL::UUID as provider_id,
			COALESCE(metadata->>'estado','active') as status,
			NULL::VARCHAR as inventory_status,
			'' as rfid_tag,
			NULL::VARCHAR as qr_code,
			NULL::INT as install_year,
			'Importado automáticamente' as observations,
			created_at,
			updated_at
		FROM imported_assets
		WHERE tenant_id = $1
	`
	importedRows, err := h.DB.Query(importedQuery, tenantID, branchID)
	if err == nil {
		defer importedRows.Close()
		for importedRows.Next() {
			var a Asset
			err := importedRows.Scan(
				&a.ID, &a.TenantID, &a.BranchID,
				&a.AssetTypeID, &a.AssetTypeCode, &a.AssetTypeName,
				&a.LocationID, &a.LocationName,
				&a.InternalCode, &a.Name,
				&a.SerialNumber, &a.Model, &a.Manufacturer,
				&a.ManufacturerID, &a.ModelID, &a.ProviderID,
				&a.Status, &a.InventoryStatus,
				&a.RFIDTag, &a.QRCode,
				&a.InstallYear, &a.Observations,
				&a.CreatedAt, &a.UpdatedAt,
			)
			if err != nil {
				log.Printf("Error scanning imported asset: %v", err)
				continue
			}
			assets = append(assets, a)
		}
	} else {
		log.Printf("Error querying imported_assets: %v", err)
	}

	json.NewEncoder(w).Encode(AssetsListResponse{
		Assets: assets,
		Total:  len(assets),
		Page:   1,
		Limit:  100,
	})
}

// ==========================================
// getAsset — GET /api/dcim/assets/{id}
// ==========================================
func (h *DCIMHandler) getAsset(w http.ResponseWriter, r *http.Request, assetID string) {
	_, tenantID, branchID, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var a Asset
	err = h.DB.QueryRow(`
		SELECT a.id, a.tenant_id, a.branch_id,
		       a.asset_type_id, at.code, at.name AS type_name,
		       a.location_id, l.name AS location_name,
		       a.internal_code, a.name,
		       a.serial_number, a.model, a.manufacturer,
		       a.manufacturer_id, a.model_id, a.provider_id,
		       a.status, a.inventory_status,
		       a.rfid_tag, a.qr_code,
		       a.install_year, a.observations,
		       a.created_at, a.updated_at
		FROM assets a
		JOIN asset_types at ON a.asset_type_id = at.id
		LEFT JOIN locations l ON a.location_id = l.id
		WHERE a.id = $1 AND a.tenant_id = $2 AND a.branch_id = $3`,
		assetID, tenantID, branchID,
	).Scan(
		&a.ID, &a.TenantID, &a.BranchID,
		&a.AssetTypeID, &a.AssetTypeCode, &a.AssetTypeName,
		&a.LocationID, &a.LocationName,
		&a.InternalCode, &a.Name,
		&a.SerialNumber, &a.Model, &a.Manufacturer,
		&a.ManufacturerID, &a.ModelID, &a.ProviderID,
		&a.Status, &a.InventoryStatus,
		&a.RFIDTag, &a.QRCode,
		&a.InstallYear, &a.Observations,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"asset not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(a)
}

// ==========================================
// createAsset — POST /api/dcim/assets
// INV-DCM-0013: Transacción polimórfica atómica.
// INV-DCM-0015: internal_code generado por el backend, nunca por el frontend.
// ==========================================
func (h *DCIMHandler) createAsset(w http.ResponseWriter, r *http.Request) {
	userID, tenantID, branchID, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req CreateAssetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validaciones básicas
	if req.Name == "" || req.AssetTypeID == "" {
		http.Error(w, `{"error":"name and asset_type_id are required"}`, http.StatusBadRequest)
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}

	// Obtener el código del tipo de activo para el motor de nomenclaturas
	var assetTypeCode string
	err = h.DB.QueryRow(`SELECT code FROM asset_types WHERE id = $1`, req.AssetTypeID).Scan(&assetTypeCode)
	if err != nil {
		http.Error(w, `{"error":"asset_type_id not found"}`, http.StatusBadRequest)
		return
	}

	// ─── INICIO DE TRANSACCIÓN POLIMÓRFICA (INV-DCM-0013) ───────────────────────
	tx, err := h.DB.Begin()
	if err != nil {
		http.Error(w, `{"error":"could not begin transaction"}`, http.StatusInternalServerError)
		return
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	// Generar internal_code transaccional (INV-DCM-0015)
	internalCode, err := h.generateInternalCode(tx, tenantID, branchID, assetTypeCode)
	if err != nil {
		log.Printf("ERROR generating internal_code: %v", err)
		http.Error(w, `{"error":"could not generate internal code"}`, http.StatusInternalServerError)
		return
	}

	newID := uuid.New().String()

	// Insertar en tabla principal assets
	_, err = tx.Exec(`
		INSERT INTO assets (
			id, tenant_id, branch_id, asset_type_id, location_id,
			internal_code, name, serial_number, model, manufacturer,
			manufacturer_id, model_id, provider_id,
			status, inventory_status,
			rfid_tag, qr_code, install_year, observations,
			purchase_date, warranty_expiry, cost_usd,
			created_by, updated_by
		) VALUES (
			$1,$2,$3,$4,$5,
			$6,$7,$8,$9,$10,
			$11,$12,$13,
			$14,$15,
			$16,$17,$18,$19,
			$20,$21,$22,
			$23,$24
		)`,
		newID, tenantID, branchID, req.AssetTypeID, req.LocationID,
		internalCode, req.Name, req.SerialNumber, req.Model, req.Manufacturer,
		req.ManufacturerID, req.ModelID, req.ProviderID,
		req.Status, req.InventoryStatus,
		req.RFIDTag, req.QRCode, req.InstallYear, req.Observations,
		req.PurchaseDate, req.WarrantyExpiry, req.CostUSD,
		userID, userID,
	)
	if err != nil {
		log.Printf("ERROR inserting asset: %v", err)
		if strings.Contains(err.Error(), "uq_assets_tenant_branch_code") || strings.Contains(err.Error(), "unique") {
			http.Error(w, `{"error":"internal_code already exists for this branch"}`, http.StatusConflict)
		} else {
			http.Error(w, `{"error":"database error creating asset"}`, http.StatusInternalServerError)
		}
		return
	}

	// ─── Insertar en tabla satélite según tipo (INV-DCM-0013) ────────────────────
	td := req.TechnicalData
	satID := uuid.New().String()

	switch assetTypeCode {
	case "RACK":
		totalU := 42
		if td != nil && td.TotalU != nil {
			totalU = *td.TotalU
		}
		heightMM := (*int)(nil)
		widthMM := (*int)(nil)
		depthMM := (*int)(nil)
		powerKW := (*float64)(nil)
		if td != nil {
			heightMM = td.HeightMM
			widthMM = td.WidthMM
			depthMM = td.DepthMM
			powerKW = td.PowerKW
		}
		_, err = tx.Exec(`
			INSERT INTO racks (id, asset_id, tenant_id, branch_id, total_u, height_mm, width_mm, depth_mm, power_kw)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			satID, newID, tenantID, branchID, totalU, heightMM, widthMM, depthMM, powerKW,
		)

	case "SWITCH":
		portCount := 24
		uplinkCount := 2
		var managementIP *string
		var rackID *string
		var rackUnit *int
		if td != nil {
			if td.PortCount != nil {
				portCount = *td.PortCount
			}
			if td.UplinkCount != nil {
				uplinkCount = *td.UplinkCount
			}
			managementIP = td.ManagementIP
			rackID = td.RackID
			rackUnit = td.RackUnit
		}
		_, err = tx.Exec(`
			INSERT INTO switches (id, asset_id, tenant_id, branch_id, port_count, uplink_count, management_ip, rack_id, rack_unit)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			satID, newID, tenantID, branchID, portCount, uplinkCount, managementIP, rackID, rackUnit,
		)

	case "UPS":
		var capacityKVA *float64
		var batteryRuntime *int
		var managementIP *string
		if td != nil {
			capacityKVA = td.CapacityKVA
			batteryRuntime = td.BatteryRuntimeMin
			managementIP = td.ManagementIP
		}
		_, err = tx.Exec(`
			INSERT INTO ups (id, asset_id, tenant_id, branch_id, capacity_kva, battery_runtime_min, management_ip)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			satID, newID, tenantID, branchID, capacityKVA, batteryRuntime, managementIP,
		)

	case "PDU":
		outletCount := 8
		var amperage *float64
		var managementIP *string
		var rackID *string
		if td != nil {
			if td.OutletCount != nil {
				outletCount = *td.OutletCount
			}
			amperage = td.Amperage
			managementIP = td.ManagementIP
			rackID = td.RackID
		}
		_, err = tx.Exec(`
			INSERT INTO pdus (id, asset_id, tenant_id, branch_id, outlet_count, amperage, management_ip, rack_id)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			satID, newID, tenantID, branchID, outletCount, amperage, managementIP, rackID,
		)

	case "PATCH_PANEL":
		portCount := 24
		portType := "RJ45"
		var rackID *string
		var rackUnit *int
		if td != nil {
			if td.PortCount != nil {
				portCount = *td.PortCount
			}
			if td.PortType != nil {
				portType = *td.PortType
			}
			rackID = td.RackID
			rackUnit = td.RackUnit
		}
		_, err = tx.Exec(`
			INSERT INTO patch_panels (id, asset_id, tenant_id, branch_id, port_count, port_type, rack_id, rack_unit)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			satID, newID, tenantID, branchID, portCount, portType, rackID, rackUnit,
		)

	case "MDF", "IDF":
		mdfType := assetTypeCode
		rackCount := 0
		ppCount := 0
		swCount := 0
		upsCount := 0
		if td != nil {
			if td.MDFType != nil {
				mdfType = *td.MDFType
			}
			if td.RackCount != nil {
				rackCount = *td.RackCount
			}
			if td.PatchPanelCount != nil {
				ppCount = *td.PatchPanelCount
			}
			if td.SwitchCount != nil {
				swCount = *td.SwitchCount
			}
			if td.UPSCount != nil {
				upsCount = *td.UPSCount
			}
		}
		_, err = tx.Exec(`
			INSERT INTO mdf_idf (id, asset_id, tenant_id, branch_id, type, rack_count, patch_panel_count, switch_count, ups_count)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			satID, newID, tenantID, branchID, mdfType, rackCount, ppCount, swCount, upsCount,
		)

	default:
		// Tipos sin tabla satélite (NODE, BACKBONE, FIREWALL, SERVER, CCTV, AC_UNIT):
		// solo se insertan en assets. No es un error.
		satID = ""
	}

	if err != nil {
		log.Printf("ERROR inserting satellite table for type %s: %v", assetTypeCode, err)
		http.Error(w, `{"error":"database error creating satellite record"}`, http.StatusInternalServerError)
		return
	}

	// ─── Registrar en asset_logs (INV-DCM-0016: Auditoría Obligatoria) ───────────
	logID := uuid.New().String()
	_, logErr := tx.Exec(`
		INSERT INTO asset_logs (id, tenant_id, asset_id, event_type, new_value, notes, performed_by)
		VALUES ($1,$2,$3,'created',$4,'Activo creado vía ActivoWizard',$5)`,
		logID, tenantID, newID, internalCode, userID,
	)
	if logErr != nil {
		log.Printf("WARN: error registrando asset_log: %v", logErr)
		// No es fatal — no abortamos la transacción por un log fallido
	}

	// ─── COMMIT ──────────────────────────────────────────────────────────────────
	if err = tx.Commit(); err != nil {
		log.Printf("ERROR committing transaction: %v", err)
		http.Error(w, `{"error":"transaction commit failed"}`, http.StatusInternalServerError)
		return
	}

	resp := map[string]string{
		"id":            newID,
		"internal_code": internalCode,
		"status":        "created",
	}
	if satID != "" {
		resp["satellite_id"] = satID
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

// ==========================================
// updateAsset — PUT /api/dcim/assets/{id}
// ==========================================
func (h *DCIMHandler) updateAsset(w http.ResponseWriter, r *http.Request, assetID string) {
	userID, tenantID, branchID, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Verificar que el activo pertenece al tenant+branch
	var exists bool
	h.DB.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM assets WHERE id=$1 AND tenant_id=$2 AND branch_id=$3)`,
		assetID, tenantID, branchID,
	).Scan(&exists)
	if !exists {
		http.Error(w, `{"error":"asset not found"}`, http.StatusNotFound)
		return
	}

	var req UpdateAssetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Construir UPDATE dinámico solo con campos enviados
	setClauses := []string{"updated_by = $1", "updated_at = NOW()"}
	args := []interface{}{userID}
	idx := 2

	if req.Name != nil {
		setClauses = append(setClauses, "name = $"+itoa(idx))
		args = append(args, *req.Name)
		idx++
	}
	if req.AssetTypeID != nil {
		setClauses = append(setClauses, "asset_type_id = $"+itoa(idx))
		args = append(args, *req.AssetTypeID)
		idx++
	}
	if req.LocationID != nil {
		setClauses = append(setClauses, "location_id = $"+itoa(idx))
		args = append(args, *req.LocationID)
		idx++
	}
	if req.Status != nil {
		setClauses = append(setClauses, "status = $"+itoa(idx))
		args = append(args, *req.Status)
		idx++
	}
	if req.InventoryStatus != nil {
		setClauses = append(setClauses, "inventory_status = $"+itoa(idx))
		args = append(args, *req.InventoryStatus)
		idx++
	}
	if req.SerialNumber != nil {
		setClauses = append(setClauses, "serial_number = $"+itoa(idx))
		args = append(args, *req.SerialNumber)
		idx++
	}
	if req.Model != nil {
		setClauses = append(setClauses, "model = $"+itoa(idx))
		args = append(args, *req.Model)
		idx++
	}
	if req.Manufacturer != nil {
		setClauses = append(setClauses, "manufacturer = $"+itoa(idx))
		args = append(args, *req.Manufacturer)
		idx++
	}
	if req.ManufacturerID != nil {
		setClauses = append(setClauses, "manufacturer_id = $"+itoa(idx))
		args = append(args, *req.ManufacturerID)
		idx++
	}
	if req.ModelID != nil {
		setClauses = append(setClauses, "model_id = $"+itoa(idx))
		args = append(args, *req.ModelID)
		idx++
	}
	if req.ProviderID != nil {
		setClauses = append(setClauses, "provider_id = $"+itoa(idx))
		args = append(args, *req.ProviderID)
		idx++
	}
	if req.RFIDTag != nil {
		setClauses = append(setClauses, "rfid_tag = $"+itoa(idx))
		args = append(args, *req.RFIDTag)
		idx++
	}
	if req.QRCode != nil {
		setClauses = append(setClauses, "qr_code = $"+itoa(idx))
		args = append(args, *req.QRCode)
		idx++
	}
	if req.InstallYear != nil {
		setClauses = append(setClauses, "install_year = $"+itoa(idx))
		args = append(args, *req.InstallYear)
		idx++
	}
	if req.PurchaseDate != nil {
		setClauses = append(setClauses, "purchase_date = $"+itoa(idx))
		args = append(args, *req.PurchaseDate)
		idx++
	}
	if req.WarrantyExpiry != nil {
		setClauses = append(setClauses, "warranty_expiry = $"+itoa(idx))
		args = append(args, *req.WarrantyExpiry)
		idx++
	}
	if req.CostUSD != nil {
		setClauses = append(setClauses, "cost_usd = $"+itoa(idx))
		args = append(args, *req.CostUSD)
		idx++
	}
	if req.Observations != nil {
		setClauses = append(setClauses, "observations = $"+itoa(idx))
		args = append(args, *req.Observations)
		idx++
	}

	args = append(args, assetID, tenantID, branchID)
	query := `UPDATE assets SET ` + strings.Join(setClauses, ", ") +
		` WHERE id = $` + itoa(idx) +
		` AND tenant_id = $` + itoa(idx+1) +
		` AND branch_id = $` + itoa(idx+2)

	_, err = h.DB.Exec(query, args...)
	if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"id": assetID, "status": "updated"})
}

// ==========================================
// deleteAsset — DELETE /api/dcim/assets/{id}
// ==========================================
func (h *DCIMHandler) deleteAsset(w http.ResponseWriter, r *http.Request, assetID string) {
	_, tenantID, branchID, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	result, err := h.DB.Exec(
		`DELETE FROM assets WHERE id = $1 AND tenant_id = $2 AND branch_id = $3`,
		assetID, tenantID, branchID,
	)
	if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		http.Error(w, `{"error":"asset not found"}`, http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"id": assetID, "status": "deleted"})
}

// ==========================================
// Utilidad
// ==========================================
func itoa(i int) string {
	return strconv.Itoa(i)
}

// ==========================================
// HandleRFID — GET /api/dcim/rfid/{code}
// Resuelve un código RFID o QR a su activo, tabla satélite y últimos 5 logs.
// Implementa INV-TRK-0001: un código resuelve a un único activo dentro del tenant.
// ==========================================
func (h *DCIMHandler) HandleRFID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	_, tenantID, _, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	// Extraer el código del path: /api/dcim/rfid/{code}
	code := strings.TrimPrefix(r.URL.Path, "/api/dcim/rfid/")
	code = strings.TrimSpace(code)
	if code == "" {
		http.Error(w, `{"error":"code is required"}`, http.StatusBadRequest)
		return
	}

	// Buscar el activo por rfid_tag o qr_code (INV-TRK-0001: único por tenant)
	type RFIDAsset struct {
		ID             string  `json:"id"`
		InternalCode   string  `json:"internal_code"`
		Name           string  `json:"name"`
		AssetTypeCode  string  `json:"asset_type_code"`
		AssetTypeName  string  `json:"asset_type_name"`
		Status         string  `json:"status"`
		Manufacturer   *string `json:"manufacturer"`
		Model          *string `json:"model"`
		SerialNumber   *string `json:"serial_number"`
		LocationName   *string `json:"location_name"`
		RFIDTag        *string `json:"rfid_tag"`
		QRCode         *string `json:"qr_code"`
		InstallYear    *int    `json:"install_year"`
		Observations   *string `json:"observations"`
	}

	var asset RFIDAsset
	err = h.DB.QueryRow(`
		SELECT a.id, a.internal_code, a.name,
		       at.code, at.name,
		       a.status, a.manufacturer, a.model, a.serial_number,
		       l.name, a.rfid_tag, a.qr_code, a.install_year, a.observations
		FROM assets a
		JOIN asset_types at ON at.id = a.asset_type_id
		LEFT JOIN locations l ON l.id = a.location_id
		WHERE a.tenant_id = $1
		  AND (a.rfid_tag = $2 OR a.qr_code = $2)
		LIMIT 1`,
		tenantID, code,
	).Scan(
		&asset.ID, &asset.InternalCode, &asset.Name,
		&asset.AssetTypeCode, &asset.AssetTypeName,
		&asset.Status, &asset.Manufacturer, &asset.Model, &asset.SerialNumber,
		&asset.LocationName, &asset.RFIDTag, &asset.QRCode, &asset.InstallYear, &asset.Observations,
	)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"asset not found for this code"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}

	// Obtener datos de la tabla satélite según el tipo
	satellite := map[string]interface{}{}
	switch asset.AssetTypeCode {
	case "SWITCH":
		var portCount, uplinkCount int
		var managementIP *string
		var rackUnit *int
		err = h.DB.QueryRow(
			`SELECT port_count, COALESCE(uplink_count,0), management_ip, rack_unit FROM switches WHERE asset_id = $1`,
			asset.ID,
		).Scan(&portCount, &uplinkCount, &managementIP, &rackUnit)
		if err == nil {
			satellite["port_count"] = portCount
			satellite["uplink_count"] = uplinkCount
			satellite["management_ip"] = managementIP
			satellite["rack_unit"] = rackUnit
		}
	case "RACK":
		var totalU, usedU int
		var heightMM, widthMM, depthMM *int
		var powerKW *float64
		err = h.DB.QueryRow(
			`SELECT total_u, used_u, height_mm, width_mm, depth_mm, power_kw FROM racks WHERE asset_id = $1`,
			asset.ID,
		).Scan(&totalU, &usedU, &heightMM, &widthMM, &depthMM, &powerKW)
		if err == nil {
			satellite["total_u"] = totalU
			satellite["used_u"] = usedU
			satellite["height_mm"] = heightMM
			satellite["width_mm"] = widthMM
			satellite["depth_mm"] = depthMM
			satellite["power_kw"] = powerKW
		}
	case "MDF", "IDF":
		var mdfType string
		var rackCount, ppCount, swCount, upsCount int
		err = h.DB.QueryRow(
			`SELECT type, COALESCE(rack_count,0), COALESCE(patch_panel_count,0), COALESCE(switch_count,0), COALESCE(ups_count,0) FROM mdf_idf WHERE asset_id = $1`,
			asset.ID,
		).Scan(&mdfType, &rackCount, &ppCount, &swCount, &upsCount)
		if err == nil {
			satellite["type"] = mdfType
			satellite["rack_count"] = rackCount
			satellite["patch_panel_count"] = ppCount
			satellite["switch_count"] = swCount
			satellite["ups_count"] = upsCount
		}
	case "UPS":
		var capacityKVA *float64
		var batteryMin *int
		var mgmtIP *string
		err = h.DB.QueryRow(
			`SELECT capacity_kva, battery_runtime_min, management_ip FROM ups WHERE asset_id = $1`,
			asset.ID,
		).Scan(&capacityKVA, &batteryMin, &mgmtIP)
		if err == nil {
			satellite["capacity_kva"] = capacityKVA
			satellite["battery_runtime_min"] = batteryMin
			satellite["management_ip"] = mgmtIP
		}
	}

	// Últimos 5 logs del activo (INV-TRK-0001: auditoría inmutable)
	type AssetLog struct {
		ID          string  `json:"id"`
		EventType   string  `json:"event_type"`
		Notes       *string `json:"notes"`
		PerformedAt string  `json:"performed_at"`
		PerformedBy *string `json:"performed_by_name"`
	}
	logRows, err := h.DB.Query(`
		SELECT al.id, al.event_type, al.notes, al.performed_at,
		       u.full_name
		FROM asset_logs al
		LEFT JOIN users u ON u.id = al.performed_by
		WHERE al.asset_id = $1
		ORDER BY al.performed_at DESC
		LIMIT 5`,
		asset.ID,
	)
	logs := []AssetLog{}
	if err == nil {
		defer logRows.Close()
		for logRows.Next() {
			var l AssetLog
			var performedAt interface{}
			if err := logRows.Scan(&l.ID, &l.EventType, &l.Notes, &performedAt, &l.PerformedBy); err == nil {
				l.PerformedAt = fmt.Sprintf("%v", performedAt)
				logs = append(logs, l)
			}
		}
	}

	// Registrar el escaneo en asset_logs (INV-TRK-0001: toda reasignación queda registrada)
	scanID := uuid.New().String()
	_, _ = h.DB.Exec(`
		INSERT INTO asset_logs (id, tenant_id, asset_id, event_type, new_value, notes)
		VALUES ($1, $2, $3, 'rfid_scan', $4, 'Escaneo vía portal web')`,
		scanID, tenantID, asset.ID, code,
	)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"asset":     asset,
		"satellite": satellite,
		"logs":      logs,
	})
}
