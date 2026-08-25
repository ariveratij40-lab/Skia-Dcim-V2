package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
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
	ID              string    `json:"id"`
	TenantID        string    `json:"tenant_id"`
	BranchID        string    `json:"branch_id"`
	AssetTypeID     string    `json:"asset_type_id"`
	AssetTypeCode   string    `json:"asset_type_code"`
	AssetTypeName   string    `json:"asset_type_name"`
	LocationID      *string   `json:"location_id"`
	LocationName    *string   `json:"location_name"`
	InternalCode    string    `json:"internal_code"`
	Name            string    `json:"name"`
	SerialNumber    *string   `json:"serial_number"`
	Model           *string   `json:"model"`
	Manufacturer    *string   `json:"manufacturer"`
	ManufacturerID  *string   `json:"manufacturer_id"`
	ModelID         *string   `json:"model_id"`
	ProviderID      *string   `json:"provider_id"`
	Status          string    `json:"status"`
	InventoryStatus *string   `json:"inventory_status"`
	RFIDTag         *string   `json:"rfid_tag"`
	QRCode          *string   `json:"qr_code"`
	InstallYear     *int      `json:"install_year"`
	PurchaseDate    *string   `json:"purchase_date"`
	WarrantyExpiry  *string   `json:"warranty_expiry"`
	CostUSD         *float64  `json:"cost_usd"`
	Observations    *string   `json:"observations"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	// Asignación de rack (se rellena en el listado vía LEFT JOIN)
	RackID   *string `json:"rack_id"`
	RackUnit *int    `json:"rack_unit"`
}

// TechnicalData contiene los campos específicos de la tabla satélite según el tipo de activo.
// Solo se usan los campos relevantes al tipo; el resto se ignora.
type TechnicalData struct {
	// RACK
	TotalU   *int     `json:"total_u"`
	HeightMM *int     `json:"height_mm"`
	WidthMM  *int     `json:"width_mm"`
	DepthMM  *int     `json:"depth_mm"`
	PowerKW  *float64 `json:"power_kw"`
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
	RackCount       *int    `json:"rack_count"`
	PatchPanelCount *int    `json:"patch_panel_count"`
	SwitchCount     *int    `json:"switch_count"`
	UPSCount        *int    `json:"ups_count"`
}

type CreateAssetRequest struct {
	AssetTypeID     string         `json:"asset_type_id"`
	InternalCode    string         `json:"internal_code"`
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

type NomenclatureAssignment struct {
	ID       string
	Code     string
	Sequence int
}

var ErrNomenclatureRequired = fmt.Errorf("active nomenclature is required")

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

	// Fix defensivo: si branchID está vacío (usuario sin branch asignado en sesión),
	// buscar el primer branch del tenant para evitar INSERT con branch_id vacío (INV-DCM-0013)
	if branchID == "" && tenantID != "" {
		var fallbackBranch sql.NullString
		_ = h.DB.QueryRow(
			`SELECT b.id FROM branches b
			 JOIN user_branches ub ON ub.branch_id = b.id
			 JOIN sessions s ON s.user_id = ub.user_id
			 WHERE s.token = $1 AND b.tenant_id = $2
			 LIMIT 1`,
			token, tenantID,
		).Scan(&fallbackBranch)
		if fallbackBranch.Valid && fallbackBranch.String != "" {
			branchID = fallbackBranch.String
			log.Printf("[getSessionContext] branchID fallback aplicado para tenant %s: %s", tenantID, branchID)
		} else {
			// Último recurso: primer branch del tenant
			_ = h.DB.QueryRow(
				`SELECT id FROM branches WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`,
				tenantID,
			).Scan(&fallbackBranch)
			if fallbackBranch.Valid {
				branchID = fallbackBranch.String
				log.Printf("[getSessionContext] branchID último recurso para tenant %s: %s", tenantID, branchID)
			}
		}
	}
	return
}

// ==========================================
// HandleAssets — GET (list) y POST (create)
// ==========================================
func (h *DCIMHandler) HandleAssets(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		// C-6: listAssets solo lee el TenantDB del contexto que este
		// middleware inyecta -- no usa h.DB directamente. createAsset
		// (POST) NO se envuelve aquí porque ya abre su propia transacción
		// vía BeginTenantTx (INV-DCM-0013); envolverlo también abriría una
		// segunda transacción anidada e innecesaria.
		RequireTenantTx(h.DB, h.listAssets)(w, r)
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
		// C-6: GET/PUT/DELETE de un activo individual usan el TenantDB del
		// contexto (getAsset/updateAsset/deleteAsset, todas migradas).
		RequireTenantTx(h.DB, func(w http.ResponseWriter, r *http.Request) {
			h.getAsset(w, r, assetID)
		})(w, r)
	case http.MethodPut:
		// C-6: updateAsset ahora usa el TenantDB del contexto (ver
		// migración de esta ronda, junto con deleteAsset/HandleRFID/
		// HandleLocationsManage).
		RequireTenantTx(h.DB, func(w http.ResponseWriter, r *http.Request) {
			h.updateAsset(w, r, assetID)
		})(w, r)
	case http.MethodDelete:
		RequireTenantTx(h.DB, func(w http.ResponseWriter, r *http.Request) {
			h.deleteAsset(w, r, assetID)
		})(w, r)
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
		ID     string  `json:"id"`
		Name   string  `json:"name"`
		Status string  `json:"status"`
		Floors []Floor `json:"floors"`
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
func (h *DCIMHandler) generateInternalCode(tx TenantDB, tenantID, branchID, assetTypeCode string) (NomenclatureAssignment, error) {
	// Obtener la regla de nomenclatura con bloqueo exclusivo (FOR UPDATE)
	var ruleID string
	var prefix, separator string
	var seqDigits, lastSeq int
	var includeBranch bool
	var customSeg1, customSeg2 sql.NullString
	err := tx.QueryRow(
		`SELECT id, prefix, separator, seq_digits, last_seq, include_branch,
		        COALESCE(custom_segment_1,''), COALESCE(custom_segment_2,'')
		 FROM naming_rules
		 WHERE tenant_id = $1 AND asset_type_code = $2 AND active = TRUE
		 FOR UPDATE`,
		tenantID, assetTypeCode,
	).Scan(&ruleID, &prefix, &separator, &seqDigits, &lastSeq, &includeBranch, &customSeg1, &customSeg2)

	if err == sql.ErrNoRows {
		return NomenclatureAssignment{}, ErrNomenclatureRequired
	} else if err != nil {
		return NomenclatureAssignment{}, fmt.Errorf("error leyendo naming_rule: %w", err)
	}

	// Incrementar secuencia
	newSeq := lastSeq + 1

	// Actualizar la secuencia en la BD (dentro de la misma transacción)
	if _, err = tx.Exec(
		`UPDATE naming_rules SET last_seq = $1, updated_at = NOW()
			 WHERE id = $2 AND tenant_id = $3`,
		newSeq, ruleID, tenantID,
	); err != nil {
		return NomenclatureAssignment{}, fmt.Errorf("error actualizando naming_rule seq: %w", err)
	}

	// Obtener código corto de la sucursal (primeras 3 letras de city o name)
	branchCode := ""
	if includeBranch {
		var city, name sql.NullString
		if err := tx.QueryRow(`SELECT city, name FROM branches WHERE id = $1 AND tenant_id = $2`, branchID, tenantID).Scan(&city, &name); err != nil {
			return NomenclatureAssignment{}, fmt.Errorf("error resolving branch component: %w", err)
		}
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
	// Agregar segmentos genéricos si están configurados
	if customSeg1.Valid && customSeg1.String != "" {
		parts = append(parts, strings.ToUpper(strings.ReplaceAll(customSeg1.String, " ", "")))
	}
	if customSeg2.Valid && customSeg2.String != "" {
		parts = append(parts, strings.ToUpper(strings.ReplaceAll(customSeg2.String, " ", "")))
	}
	parts = append(parts, seqStr)
	return NomenclatureAssignment{ID: ruleID, Code: strings.Join(parts, separator), Sequence: newSeq}, nil
}

func writeNomenclatureRequired(w http.ResponseWriter, assetTypeCode string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnprocessableEntity)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":      "nomenclature_required",
		"asset_type": strings.ToLower(assetTypeCode),
		"message":    fmt.Sprintf("No existe una nomenclatura activa para %s.", assetTypeCode),
	})
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
	// C-6: esta tabla tiene RLS+FORCE; sin el TenantDB del contexto (que
	// solo existe si se pasó por RequireTenantTx) la consulta vería 0 filas
	// de forma silenciosa. Mejor fallar explícito con 500 que devolver una
	// lista vacía que parece "el tenant no tiene activos".
	tdb, ok := TenantDBFromContext(r.Context())
	if !ok {
		log.Printf("listAssets: falta TenantDB en el contexto -- ¿se registró la ruta sin RequireTenantTx?")
		http.Error(w, `{"error":"internal error: missing tenant context"}`, http.StatusInternalServerError)
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
		       a.created_at, a.updated_at,
		       COALESCE(sw.rack_id::TEXT, pp.rack_id::TEXT, pdu.rack_id::TEXT) AS rack_id,
		       COALESCE(sw.rack_unit, pp.rack_unit) AS rack_unit
		FROM assets a
		JOIN asset_types at ON a.asset_type_id = at.id
		LEFT JOIN locations l ON a.location_id = l.id
		LEFT JOIN switches sw ON sw.asset_id = a.id
		LEFT JOIN patch_panels pp ON pp.asset_id = a.id
		LEFT JOIN pdus pdu ON pdu.asset_id = a.id
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

	rows, err := tdb.QueryContext(r.Context(), query, args...)
	if err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	assets := []Asset{}
	for rows.Next() {
		var a Asset
		var purchaseDate, warrantyExpiry sql.NullString
		var rackIDNull sql.NullString
		var rackUnitNull sql.NullInt64
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
			&rackIDNull, &rackUnitNull,
		)
		_ = purchaseDate
		_ = warrantyExpiry
		if rackIDNull.Valid {
			a.RackID = &rackIDNull.String
		}
		if rackUnitNull.Valid {
			v := int(rackUnitNull.Int64)
			a.RackUnit = &v
		}
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
			branch_id::TEXT as branch_id,
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
		WHERE tenant_id = $1 AND branch_id = $2
	`
	importedRows, err := tdb.QueryContext(r.Context(), importedQuery, tenantID, branchID)
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
		// imported_assets es una tabla opcional del pipeline legacy.
		// Si no existe, se ignora silenciosamente.
		_ = err
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
	tdb, ok := TenantDBFromContext(r.Context())
	if !ok {
		log.Printf("getAsset: falta TenantDB en el contexto -- ¿se registró la ruta sin RequireTenantTx?")
		http.Error(w, `{"error":"internal error: missing tenant context"}`, http.StatusInternalServerError)
		return
	}

	var a Asset
	err = tdb.QueryRowContext(r.Context(), `
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
	if branchID == "" {
		if qerr := h.DB.QueryRow(`SELECT id FROM branches WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`, tenantID).Scan(&branchID); qerr != nil {
			http.Error(w, `{"error":"branch context is required"}`, http.StatusBadRequest)
			return
		}
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
	if strings.TrimSpace(req.InternalCode) != "" {
		writeManagedAssetError(w, ErrManualAssetCode, "")
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
	tx, err := BeginTenantTx(r.Context(), h.DB, tenantID, branchID)
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
	assignment, err := h.generateInternalCode(tx, tenantID, branchID, assetTypeCode)
	if err != nil {
		if err == ErrNomenclatureRequired {
			writeNomenclatureRequired(w, assetTypeCode)
			return
		}
		log.Printf("ERROR generating internal_code: %v", err)
		http.Error(w, `{"error":"could not generate internal code"}`, http.StatusInternalServerError)
		return
	}

	newID := uuid.New().String()

	// Insertar en tabla principal assets
	_, err = tx.Exec(`
		INSERT INTO assets (
			id, tenant_id, branch_id, asset_type_id, location_id,
			internal_code, nomenclature_id, nomenclature_sequence,
			name, serial_number, model, manufacturer,
			manufacturer_id, model_id, provider_id,
			status, inventory_status,
			rfid_tag, qr_code, install_year, observations,
			purchase_date, warranty_expiry, cost_usd,
			created_by, updated_by
		) VALUES (
			$1,$2,$3,$4,$5,
			$6,$7,$8,
			$9,$10,$11,$12,
			$13,$14,$15,
			$16,$17,
			$18,$19,$20,$21,
			$22,$23,$24,
			$25,$26
		)`,
		newID, tenantID, branchID, req.AssetTypeID, req.LocationID,
		assignment.Code, assignment.ID, assignment.Sequence,
		req.Name, req.SerialNumber, req.Model, req.Manufacturer,
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
		logID, tenantID, newID, assignment.Code, userID,
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
		"id":              newID,
		"internal_code":   assignment.Code,
		"nomenclature_id": assignment.ID,
		"status":          "created",
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
	// C-6: tenantID/branchID/userID vienen del contexto que RequireTenantTx
	// ya validó (ExtractSessionContextSecure, con la resolución de
	// sucursal unificada de esta ronda) -- no se vuelve a consultar la
	// sesión con h.getSessionContext (que tenía su propia lógica de
	// fallback de sucursal, distinta y ahora reemplazada en el origen).
	userID, tenantID, branchID, ok := TenantIdentityFromContext(r.Context())
	if !ok {
		log.Printf("updateAsset: falta identidad de tenant en el contexto -- ¿se registró la ruta sin RequireTenantTx?")
		http.Error(w, `{"error":"internal error: missing tenant context"}`, http.StatusInternalServerError)
		return
	}
	tdb, ok := TenantDBFromContext(r.Context())
	if !ok {
		log.Printf("updateAsset: falta TenantDB en el contexto -- ¿se registró la ruta sin RequireTenantTx?")
		http.Error(w, `{"error":"internal error: missing tenant context"}`, http.StatusInternalServerError)
		return
	}

	// Verificar que el activo pertenece al tenant+branch
	var exists bool
	tdb.QueryRowContext(r.Context(),
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
	if req.InternalCode != nil {
		writeManagedAssetError(w, ErrManualAssetCode, "")
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

	_, err := tdb.ExecContext(r.Context(), query, args...)
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
	_, tenantID, branchID, ok := TenantIdentityFromContext(r.Context())
	if !ok {
		log.Printf("deleteAsset: falta identidad de tenant en el contexto -- ¿se registró la ruta sin RequireTenantTx?")
		http.Error(w, `{"error":"internal error: missing tenant context"}`, http.StatusInternalServerError)
		return
	}
	tdb, ok := TenantDBFromContext(r.Context())
	if !ok {
		log.Printf("deleteAsset: falta TenantDB en el contexto -- ¿se registró la ruta sin RequireTenantTx?")
		http.Error(w, `{"error":"internal error: missing tenant context"}`, http.StatusInternalServerError)
		return
	}

	result, err := tdb.ExecContext(r.Context(),
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
	_, tenantID, _, ok := TenantIdentityFromContext(r.Context())
	if !ok {
		log.Printf("HandleRFID: falta identidad de tenant en el contexto -- ¿se registró la ruta sin RequireTenantTx?")
		http.Error(w, `{"error":"internal error: missing tenant context"}`, http.StatusInternalServerError)
		return
	}
	tdb, ok := TenantDBFromContext(r.Context())
	if !ok {
		log.Printf("HandleRFID: falta TenantDB en el contexto -- ¿se registró la ruta sin RequireTenantTx?")
		http.Error(w, `{"error":"internal error: missing tenant context"}`, http.StatusInternalServerError)
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
		ID            string  `json:"id"`
		InternalCode  string  `json:"internal_code"`
		Name          string  `json:"name"`
		AssetTypeCode string  `json:"asset_type_code"`
		AssetTypeName string  `json:"asset_type_name"`
		Status        string  `json:"status"`
		Manufacturer  *string `json:"manufacturer"`
		Model         *string `json:"model"`
		SerialNumber  *string `json:"serial_number"`
		LocationName  *string `json:"location_name"`
		RFIDTag       *string `json:"rfid_tag"`
		QRCode        *string `json:"qr_code"`
		InstallYear   *int    `json:"install_year"`
		Observations  *string `json:"observations"`
	}

	var asset RFIDAsset
	var err error
	err = tdb.QueryRowContext(r.Context(), `
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
		err = tdb.QueryRowContext(r.Context(),
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
		err = tdb.QueryRowContext(r.Context(),
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
		err = tdb.QueryRowContext(r.Context(),
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
		err = tdb.QueryRowContext(r.Context(),
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
	logRows, err := tdb.QueryContext(r.Context(), `
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
	_, _ = tdb.ExecContext(r.Context(), `
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

// ==========================================
// CATÁLOGOS MAESTROS — CRUD completo
// ==========================================

// HandleManufacturers — /api/dcim/catalogs/manufacturers y /api/dcim/catalogs/manufacturers/{id}
func (h *DCIMHandler) HandleManufacturers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, tenantID, _, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	path := r.URL.Path
	mfID := ""
	pfx := "/api/dcim/catalogs/manufacturers/"
	if len(path) > len(pfx) {
		mfID = path[len(pfx):]
	}
	switch r.Method {
	case http.MethodGet:
		rows, err := h.DB.Query(
			`SELECT id, name, COALESCE(logo_url,''), COALESCE(website,''), COALESCE(country,''),
			        COALESCE(contact,''), status, COALESCE(notes,''), created_at
			 FROM catalogs_manufacturers WHERE tenant_id=$1 ORDER BY name`, tenantID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type MF struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			LogoURL   string `json:"logo_url"`
			Website   string `json:"website"`
			Country   string `json:"country"`
			Contact   string `json:"contact"`
			Status    string `json:"status"`
			Notes     string `json:"notes"`
			CreatedAt string `json:"created_at"`
		}
		list := []MF{}
		for rows.Next() {
			var m MF
			var ca interface{}
			if err := rows.Scan(&m.ID, &m.Name, &m.LogoURL, &m.Website, &m.Country, &m.Contact, &m.Status, &m.Notes, &ca); err == nil {
				m.CreatedAt = fmt.Sprintf("%v", ca)
				list = append(list, m)
			}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"manufacturers": list})
	case http.MethodPost:
		var b struct {
			Name    string `json:"name"`
			LogoURL string `json:"logo_url"`
			Website string `json:"website"`
			Country string `json:"country"`
			Contact string `json:"contact"`
			Notes   string `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Name == "" {
			http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
			return
		}
		newID := uuid.New().String()
		_, err := h.DB.Exec(
			`INSERT INTO catalogs_manufacturers (id,tenant_id,name,logo_url,website,country,contact,notes)
			 VALUES ($1,$2,$3,NULLIF($4,''),NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),NULLIF($8,''))`,
			newID, tenantID, b.Name, b.LogoURL, b.Website, b.Country, b.Contact, b.Notes)
		if err != nil {
			if strings.Contains(err.Error(), "unique") {
				http.Error(w, `{"error":"manufacturer already exists"}`, http.StatusConflict)
				return
			}
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": newID, "name": b.Name})
	case http.MethodPut:
		if mfID == "" {
			http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
			return
		}
		var b struct {
			Name    string `json:"name"`
			LogoURL string `json:"logo_url"`
			Website string `json:"website"`
			Country string `json:"country"`
			Contact string `json:"contact"`
			Notes   string `json:"notes"`
			Status  string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
			return
		}
		_, err := h.DB.Exec(
			`UPDATE catalogs_manufacturers SET name=$1,logo_url=NULLIF($2,''),website=NULLIF($3,''),
			 country=NULLIF($4,''),contact=NULLIF($5,''),notes=NULLIF($6,''),
			 status=COALESCE(NULLIF($7,''),'active'),updated_at=now() WHERE id=$8 AND tenant_id=$9`,
			b.Name, b.LogoURL, b.Website, b.Country, b.Contact, b.Notes, b.Status, mfID, tenantID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": mfID, "status": "updated"})
	case http.MethodDelete:
		if mfID == "" {
			http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
			return
		}
		_, err := h.DB.Exec(`UPDATE catalogs_manufacturers SET status='inactive',updated_at=now() WHERE id=$1 AND tenant_id=$2`, mfID, tenantID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": mfID, "status": "deactivated"})
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// HandleProviders — /api/dcim/catalogs/providers y /api/dcim/catalogs/providers/{id}
func (h *DCIMHandler) HandleProviders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, tenantID, _, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	path := r.URL.Path
	pvID := ""
	pfx := "/api/dcim/catalogs/providers/"
	if len(path) > len(pfx) {
		pvID = path[len(pfx):]
	}
	switch r.Method {
	case http.MethodGet:
		rows, err := h.DB.Query(
			`SELECT id,provider_type,legal_name,COALESCE(trade_name,''),COALESCE(tax_id,''),
			        COALESCE(contact_name,''),COALESCE(email,''),COALESCE(phone,''),
			        COALESCE(website,''),status,COALESCE(notes,''),created_at
			 FROM catalogs_providers WHERE tenant_id=$1 ORDER BY legal_name`, tenantID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type PV struct {
			ID           string `json:"id"`
			ProviderType string `json:"provider_type"`
			LegalName    string `json:"legal_name"`
			TradeName    string `json:"trade_name"`
			TaxID        string `json:"tax_id"`
			ContactName  string `json:"contact_name"`
			Email        string `json:"email"`
			Phone        string `json:"phone"`
			Website      string `json:"website"`
			Status       string `json:"status"`
			Notes        string `json:"notes"`
			CreatedAt    string `json:"created_at"`
		}
		list := []PV{}
		for rows.Next() {
			var p PV
			var ca interface{}
			if err := rows.Scan(&p.ID, &p.ProviderType, &p.LegalName, &p.TradeName, &p.TaxID,
				&p.ContactName, &p.Email, &p.Phone, &p.Website, &p.Status, &p.Notes, &ca); err == nil {
				p.CreatedAt = fmt.Sprintf("%v", ca)
				list = append(list, p)
			}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"providers": list})
	case http.MethodPost:
		var b struct {
			ProviderType string `json:"provider_type"`
			LegalName    string `json:"legal_name"`
			TradeName    string `json:"trade_name"`
			TaxID        string `json:"tax_id"`
			ContactName  string `json:"contact_name"`
			Email        string `json:"email"`
			Phone        string `json:"phone"`
			Website      string `json:"website"`
			Notes        string `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.LegalName == "" {
			http.Error(w, `{"error":"legal_name is required"}`, http.StatusBadRequest)
			return
		}
		if b.ProviderType == "" {
			b.ProviderType = "integrator"
		}
		newID := uuid.New().String()
		_, err := h.DB.Exec(
			`INSERT INTO catalogs_providers (id,tenant_id,provider_type,legal_name,trade_name,tax_id,contact_name,email,phone,website,notes)
			 VALUES ($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),NULLIF($11,''))`,
			newID, tenantID, b.ProviderType, b.LegalName, b.TradeName, b.TaxID, b.ContactName, b.Email, b.Phone, b.Website, b.Notes)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": newID, "legal_name": b.LegalName})
	case http.MethodPut:
		if pvID == "" {
			http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
			return
		}
		var b struct {
			ProviderType string `json:"provider_type"`
			LegalName    string `json:"legal_name"`
			TradeName    string `json:"trade_name"`
			TaxID        string `json:"tax_id"`
			ContactName  string `json:"contact_name"`
			Email        string `json:"email"`
			Phone        string `json:"phone"`
			Website      string `json:"website"`
			Notes        string `json:"notes"`
			Status       string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
			return
		}
		_, err := h.DB.Exec(
			`UPDATE catalogs_providers SET provider_type=COALESCE(NULLIF($1,''),'integrator'),legal_name=$2,
			 trade_name=NULLIF($3,''),tax_id=NULLIF($4,''),contact_name=NULLIF($5,''),
			 email=NULLIF($6,''),phone=NULLIF($7,''),website=NULLIF($8,''),
			 notes=NULLIF($9,''),status=COALESCE(NULLIF($10,''),'active'),updated_at=now()
			 WHERE id=$11 AND tenant_id=$12`,
			b.ProviderType, b.LegalName, b.TradeName, b.TaxID, b.ContactName, b.Email, b.Phone, b.Website, b.Notes, b.Status, pvID, tenantID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": pvID, "status": "updated"})
	case http.MethodDelete:
		if pvID == "" {
			http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
			return
		}
		_, err := h.DB.Exec(`UPDATE catalogs_providers SET status='inactive',updated_at=now() WHERE id=$1 AND tenant_id=$2`, pvID, tenantID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": pvID, "status": "deactivated"})
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

type namingRuleResponse struct {
	ID                  string `json:"id"`
	AssetTypeCode       string `json:"asset_type_code"`
	AssetTypeName       string `json:"asset_type_name"`
	Prefix              string `json:"prefix"`
	Separator           string `json:"separator"`
	IncludeBranch       bool   `json:"include_branch"`
	IncludeLocation     bool   `json:"include_location"`
	SeqDigits           int    `json:"seq_digits"`
	ResetPerLocation    bool   `json:"reset_per_location"`
	LastSeq             int    `json:"last_seq"`
	UpdatedAt           string `json:"updated_at"`
	NextCode            string `json:"next_code_preview"`
	CustomSegment1      string `json:"custom_segment_1"`
	CustomSegment2      string `json:"custom_segment_2"`
	CustomSegment1Label string `json:"custom_segment_1_label"`
	CustomSegment2Label string `json:"custom_segment_2_label"`
	Active              bool   `json:"active"`
	Description         string `json:"description"`
}

type nomenclatureAssetTypeResponse struct {
	Code                 string              `json:"code"`
	Name                 string              `json:"name"`
	Description          string              `json:"description"`
	RequiresNomenclature bool                `json:"requires_nomenclature"`
	Rule                 *namingRuleResponse `json:"rule"`
}

type namingRuleMutation struct {
	AssetTypeCode       string          `json:"asset_type_code"`
	Prefix              string          `json:"prefix"`
	Separator           string          `json:"separator"`
	IncludeBranch       *bool           `json:"include_branch"`
	IncludeLocation     *bool           `json:"include_location"`
	SeqDigits           *int            `json:"seq_digits"`
	ResetPerLocation    *bool           `json:"reset_per_location"`
	Active              *bool           `json:"active"`
	Description         *string         `json:"description"`
	CustomSegment1      *string         `json:"custom_segment_1"`
	CustomSegment2      *string         `json:"custom_segment_2"`
	CustomSegment1Label *string         `json:"custom_segment_1_label"`
	CustomSegment2Label *string         `json:"custom_segment_2_label"`
	TenantID            json.RawMessage `json:"tenant_id"`
	LastSeq             *int            `json:"last_seq"`
}

func namingRulePreview(rule namingRuleResponse) string {
	parts := []string{rule.Prefix}
	if rule.IncludeBranch {
		parts = append(parts, "BRANCH")
	}
	if rule.CustomSegment1 != "" {
		parts = append(parts, strings.ToUpper(strings.ReplaceAll(rule.CustomSegment1, " ", "")))
	}
	if rule.CustomSegment2 != "" {
		parts = append(parts, strings.ToUpper(strings.ReplaceAll(rule.CustomSegment2, " ", "")))
	}
	parts = append(parts, fmt.Sprintf("%0*d", rule.SeqDigits, rule.LastSeq+1))
	return strings.Join(parts, rule.Separator)
}

func validateNamingRuleMutation(body namingRuleMutation, creating bool) error {
	if body.TenantID != nil || body.LastSeq != nil {
		return fmt.Errorf("tenant_id and last_seq are server-controlled")
	}
	if creating && strings.TrimSpace(body.AssetTypeCode) == "" {
		return fmt.Errorf("asset_type_code is required")
	}
	if creating && strings.TrimSpace(body.Prefix) == "" {
		return fmt.Errorf("prefix is required")
	}
	if body.SeqDigits != nil && (*body.SeqDigits < 2 || *body.SeqDigits > 6) {
		return fmt.Errorf("seq_digits must be between 2 and 6")
	}
	if len(body.Separator) > 5 || len(body.Prefix) > 20 {
		return fmt.Errorf("prefix or separator is too long")
	}
	return nil
}

func unsupportedNomenclatureFeature(body namingRuleMutation) string {
	if body.IncludeLocation != nil && *body.IncludeLocation {
		return "include_location"
	}
	if body.ResetPerLocation != nil && *body.ResetPerLocation {
		return "reset_per_location"
	}
	return ""
}

func writeUnsupportedNomenclatureFeature(w http.ResponseWriter, field string) {
	message := "El segmento de ubicación aún no está disponible en el generador normativo."
	if field == "reset_per_location" {
		message = "Las secuencias independientes por ubicación aún no están disponibles en el generador normativo."
	}
	w.WriteHeader(http.StatusUnprocessableEntity)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   "unsupported_nomenclature_feature",
		"field":   field,
		"message": message,
	})
}

func requireNamingRuleAdmin(ctx context.Context, tdb TenantDB, userID, tenantID string) error {
	var allowed bool
	err := tdb.QueryRowContext(ctx, `SELECT EXISTS(
		SELECT 1 FROM user_roles ur
		JOIN roles r ON r.id=ur.role_id
		WHERE ur.user_id=$1 AND ur.tenant_id=$2 AND r.name IN ('admin','super_admin')
	)`, userID, tenantID).Scan(&allowed)
	if err != nil {
		return err
	}
	if !allowed {
		return errForbiddenNamingRuleMutation
	}
	return nil
}

func decodeNamingRuleMutation(r *http.Request) (namingRuleMutation, map[string]json.RawMessage, error) {
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		return namingRuleMutation{}, nil, err
	}
	b, err := json.Marshal(raw)
	if err != nil {
		return namingRuleMutation{}, nil, err
	}
	var mutation namingRuleMutation
	if err := json.Unmarshal(b, &mutation); err != nil {
		return namingRuleMutation{}, nil, err
	}
	return mutation, raw, nil
}

func rawField(raw map[string]json.RawMessage, key string) (string, bool) {
	v, ok := raw[key]
	if !ok {
		return "", false
	}
	if string(v) == "null" {
		return "", true
	}
	var value string
	if json.Unmarshal(v, &value) != nil {
		return "", true
	}
	return value, true
}

var errForbiddenNamingRuleMutation = errors.New("nomenclature mutation requires admin role")

// HandleNamingRules — tenant normative catalog and first-rule creation.
func (h *DCIMHandler) HandleNamingRules(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID, tenantID, _, ok := TenantIdentityFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"internal error: missing tenant context"}`, http.StatusInternalServerError)
		return
	}
	tdb, ok := TenantDBFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"internal error: missing tenant database"}`, http.StatusInternalServerError)
		return
	}
	path := r.URL.Path
	ruleID := ""
	pfx := "/api/dcim/catalogs/naming-rules/"
	if len(path) > len(pfx) {
		ruleID = path[len(pfx):]
	}
	switch r.Method {
	case http.MethodGet:
		authErr := requireNamingRuleAdmin(r.Context(), tdb, userID, tenantID)
		if authErr != nil && !errors.Is(authErr, errForbiddenNamingRuleMutation) {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		canManage := authErr == nil
		rows, err := tdb.QueryContext(r.Context(),
			`SELECT at.code, at.name, COALESCE(at.description,''), at.requires_nomenclature,
			        nr.id, nr.asset_type_code,
			        nr.prefix, nr.separator, nr.include_branch, nr.include_location,
			        nr.seq_digits, nr.reset_per_location, nr.last_seq, nr.updated_at,
			        COALESCE(nr.custom_segment_1,''), COALESCE(nr.custom_segment_2,''),
			        COALESCE(nr.custom_segment_1_label,'Segmento 1'), COALESCE(nr.custom_segment_2_label,'Segmento 2'),
			        nr.active, COALESCE(nr.description,'')
			 FROM asset_types at
			 LEFT JOIN naming_rules nr ON nr.asset_type_code=at.code AND nr.tenant_id=$1
			 ORDER BY at.requires_nomenclature DESC, at.name`, tenantID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		list := []namingRuleResponse{}
		catalog := []nomenclatureAssetTypeResponse{}
		for rows.Next() {
			var item nomenclatureAssetTypeResponse
			var ruleID, ruleType, prefix, separator, custom1, custom2, label1, label2, description sql.NullString
			var includeBranch, includeLocation, resetPerLocation, active sql.NullBool
			var seqDigits, lastSeq sql.NullInt64
			var ua interface{}
			if err := rows.Scan(&item.Code, &item.Name, &item.Description, &item.RequiresNomenclature,
				&ruleID, &ruleType, &prefix, &separator, &includeBranch, &includeLocation,
				&seqDigits, &resetPerLocation, &lastSeq, &ua, &custom1, &custom2,
				&label1, &label2, &active, &description); err != nil {
				http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
				return
			}
			if ruleID.Valid {
				rule := namingRuleResponse{ID: ruleID.String, AssetTypeCode: ruleType.String, AssetTypeName: item.Name,
					Prefix: prefix.String, Separator: separator.String, IncludeBranch: includeBranch.Bool,
					IncludeLocation: includeLocation.Bool, SeqDigits: int(seqDigits.Int64), ResetPerLocation: resetPerLocation.Bool,
					LastSeq: int(lastSeq.Int64), UpdatedAt: fmt.Sprintf("%v", ua), CustomSegment1: custom1.String,
					CustomSegment2: custom2.String, CustomSegment1Label: label1.String,
					CustomSegment2Label: label2.String, Active: active.Bool, Description: description.String}
				rule.NextCode = namingRulePreview(rule)
				item.Rule = &rule
				list = append(list, rule)
			}
			catalog = append(catalog, item)
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"asset_types": catalog, "naming_rules": list, "can_manage": canManage})
	case http.MethodPost:
		if ruleID != "" {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}
		if err := requireNamingRuleAdmin(r.Context(), tdb, userID, tenantID); err != nil {
			if errors.Is(err, errForbiddenNamingRuleMutation) {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			} else {
				http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			}
			return
		}
		var body namingRuleMutation
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || validateNamingRuleMutation(body, true) != nil {
			http.Error(w, `{"error":"invalid_nomenclature"}`, http.StatusUnprocessableEntity)
			return
		}
		if field := unsupportedNomenclatureFeature(body); field != "" {
			writeUnsupportedNomenclatureFeature(w, field)
			return
		}
		body.AssetTypeCode = strings.ToUpper(strings.TrimSpace(body.AssetTypeCode))
		var exists bool
		if err := tdb.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM asset_types WHERE code=$1)`, body.AssetTypeCode).Scan(&exists); err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		if !exists {
			http.Error(w, `{"error":"invalid_asset_type"}`, http.StatusUnprocessableEntity)
			return
		}
		id := uuid.NewString()
		includeBranch, includeLocation, resetPerLocation, active := true, false, false, true
		seqDigits := 4
		if body.IncludeBranch != nil {
			includeBranch = *body.IncludeBranch
		}
		if body.IncludeLocation != nil {
			includeLocation = *body.IncludeLocation
		}
		if body.ResetPerLocation != nil {
			resetPerLocation = *body.ResetPerLocation
		}
		if body.Active != nil {
			active = *body.Active
		}
		if body.SeqDigits != nil {
			seqDigits = *body.SeqDigits
		}
		_, err := tdb.ExecContext(r.Context(), `INSERT INTO naming_rules
			(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_location,seq_digits,
			 reset_per_location,last_seq,active,description,custom_segment_1,custom_segment_2,
			 custom_segment_1_label,custom_segment_2_label)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,NULLIF($12,''),NULLIF($13,''),$14,$15)`,
			id, tenantID, body.AssetTypeCode, strings.ToUpper(strings.TrimSpace(body.Prefix)), body.Separator,
			includeBranch, includeLocation, seqDigits, resetPerLocation, active, body.Description,
			body.CustomSegment1, body.CustomSegment2, body.CustomSegment1Label, body.CustomSegment2Label)
		if err != nil {
			var pqErr *pq.Error
			if errors.As(err, &pqErr) && pqErr.Code == "23505" {
				http.Error(w, `{"error":"nomenclature_already_exists"}`, http.StatusConflict)
			} else {
				http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			}
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{"id": id, "asset_type_code": body.AssetTypeCode, "last_seq": 0, "status": "created"})
	case http.MethodPut:
		if ruleID == "" {
			http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
			return
		}
		if err := requireNamingRuleAdmin(r.Context(), tdb, userID, tenantID); err != nil {
			if errors.Is(err, errForbiddenNamingRuleMutation) {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			} else {
				http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			}
			return
		}
		b, raw, err := decodeNamingRuleMutation(r)
		if err != nil || validateNamingRuleMutation(b, false) != nil {
			http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
			return
		}
		if field := unsupportedNomenclatureFeature(b); field != "" {
			writeUnsupportedNomenclatureFeature(w, field)
			return
		}
		custom1, hasCustom1 := rawField(raw, "custom_segment_1")
		custom2, hasCustom2 := rawField(raw, "custom_segment_2")
		label1, hasLabel1 := rawField(raw, "custom_segment_1_label")
		label2, hasLabel2 := rawField(raw, "custom_segment_2_label")
		var current namingRuleResponse
		if err := tdb.QueryRowContext(r.Context(), `SELECT prefix,separator,include_branch,include_location,seq_digits,reset_per_location,last_seq,
			COALESCE(custom_segment_1,''),COALESCE(custom_segment_2,''),COALESCE(custom_segment_1_label,'Segmento 1'),COALESCE(custom_segment_2_label,'Segmento 2')
			FROM naming_rules WHERE id=$1 AND tenant_id=$2`, ruleID, tenantID).Scan(&current.Prefix, &current.Separator, &current.IncludeBranch, &current.IncludeLocation, &current.SeqDigits, &current.ResetPerLocation, &current.LastSeq, &current.CustomSegment1, &current.CustomSegment2, &current.CustomSegment1Label, &current.CustomSegment2Label); err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			} else {
				http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			}
			return
		}
		structuralChange := (b.Prefix != "" && b.Prefix != current.Prefix) || (b.Separator != "" && b.Separator != current.Separator) ||
			(b.IncludeBranch != nil && *b.IncludeBranch != current.IncludeBranch) || (b.IncludeLocation != nil && *b.IncludeLocation != current.IncludeLocation) ||
			(b.SeqDigits != nil && *b.SeqDigits != current.SeqDigits) || (b.ResetPerLocation != nil && *b.ResetPerLocation != current.ResetPerLocation) ||
			(hasCustom1 && custom1 != current.CustomSegment1) || (hasCustom2 && custom2 != current.CustomSegment2) ||
			(hasLabel1 && label1 != current.CustomSegment1Label) || (hasLabel2 && label2 != current.CustomSegment2Label)
		if current.LastSeq > 0 && structuralChange {
			http.Error(w, `{"error":"normative_version_required"}`, http.StatusConflict)
			return
		}
		_, err = tdb.ExecContext(r.Context(),
			`UPDATE naming_rules
			 SET prefix=CASE WHEN $1!='' THEN $1 ELSE prefix END,
			     separator=CASE WHEN $2!='' THEN $2 ELSE separator END,
			     include_branch=COALESCE($3,include_branch),
			     include_location=COALESCE($4,include_location),
			     seq_digits=COALESCE($5,seq_digits),
			     reset_per_location=COALESCE($6,reset_per_location),
			     custom_segment_1=CASE WHEN $7 THEN NULLIF($8,'') ELSE custom_segment_1 END,
			     custom_segment_2=CASE WHEN $9 THEN NULLIF($10,'') ELSE custom_segment_2 END,
			     custom_segment_1_label=CASE WHEN $11 THEN $12 ELSE custom_segment_1_label END,
			     custom_segment_2_label=CASE WHEN $13 THEN $14 ELSE custom_segment_2_label END,
			     active=COALESCE($15,active),
			     description=COALESCE($16,description),
			     updated_at=now()
			 WHERE id=$17 AND tenant_id=$18`,
			b.Prefix, b.Separator, b.IncludeBranch, b.IncludeLocation, b.SeqDigits, b.ResetPerLocation,
			hasCustom1, custom1, hasCustom2, custom2, hasLabel1, label1, hasLabel2, label2,
			b.Active, b.Description, ruleID, tenantID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": ruleID, "status": "updated"})
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// HandleLocationsManage — /api/dcim/catalogs/locations y /api/dcim/catalogs/locations/{id}
func (h *DCIMHandler) HandleLocationsManage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, tenantID, branchID, ok := TenantIdentityFromContext(r.Context())
	if !ok {
		log.Printf("HandleLocationsManage: falta identidad de tenant en el contexto -- ¿se registró la ruta sin RequireTenantTx?")
		http.Error(w, `{"error":"internal error: missing tenant context"}`, http.StatusInternalServerError)
		return
	}
	tdb, ok := TenantDBFromContext(r.Context())
	if !ok {
		log.Printf("HandleLocationsManage: falta TenantDB en el contexto -- ¿se registró la ruta sin RequireTenantTx?")
		http.Error(w, `{"error":"internal error: missing tenant context"}`, http.StatusInternalServerError)
		return
	}
	path := r.URL.Path
	locID := ""
	pfx := "/api/dcim/catalogs/locations/"
	if len(path) > len(pfx) {
		locID = path[len(pfx):]
	}
	switch r.Method {
	case http.MethodGet:
		rows, err := tdb.QueryContext(r.Context(),
			`SELECT l.id, l.name, COALESCE(l.floor,''), COALESCE(l.room,''), COALESCE(l.zone,''),
			        COALESCE(l.description,''), l.created_at, COUNT(a.id) as asset_count
			 FROM locations l
			 LEFT JOIN assets a ON a.location_id=l.id AND a.tenant_id=l.tenant_id
			 WHERE l.tenant_id=$1 AND l.branch_id=$2
			 GROUP BY l.id,l.name,l.floor,l.room,l.zone,l.description,l.created_at
			 ORDER BY l.name`, tenantID, branchID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type Loc struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Floor       string `json:"floor"`
			Room        string `json:"room"`
			Zone        string `json:"zone"`
			Description string `json:"description"`
			CreatedAt   string `json:"created_at"`
			AssetCount  int    `json:"asset_count"`
		}
		list := []Loc{}
		for rows.Next() {
			var l Loc
			var ca interface{}
			if err := rows.Scan(&l.ID, &l.Name, &l.Floor, &l.Room, &l.Zone, &l.Description, &ca, &l.AssetCount); err == nil {
				l.CreatedAt = fmt.Sprintf("%v", ca)
				list = append(list, l)
			}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"locations": list})
	case http.MethodPost:
		var b struct {
			Name        string `json:"name"`
			Floor       string `json:"floor"`
			Room        string `json:"room"`
			Zone        string `json:"zone"`
			Description string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Name == "" {
			http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
			return
		}
		newID := uuid.New().String()
		_, err := tdb.ExecContext(r.Context(),
			`INSERT INTO locations (id,tenant_id,branch_id,name,floor,room,zone,description)
			 VALUES ($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),NULLIF($8,''))`,
			newID, tenantID, branchID, b.Name, b.Floor, b.Room, b.Zone, b.Description)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": newID, "name": b.Name})
	case http.MethodPut:
		if locID == "" {
			http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
			return
		}
		var b struct {
			Name        string `json:"name"`
			Floor       string `json:"floor"`
			Room        string `json:"room"`
			Zone        string `json:"zone"`
			Description string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
			return
		}
		_, err := tdb.ExecContext(r.Context(),
			`UPDATE locations SET name=$1,floor=NULLIF($2,''),room=NULLIF($3,''),zone=NULLIF($4,''),
			 description=NULLIF($5,''),updated_at=now() WHERE id=$6 AND tenant_id=$7`,
			b.Name, b.Floor, b.Room, b.Zone, b.Description, locID, tenantID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": locID, "status": "updated"})
	case http.MethodDelete:
		if locID == "" {
			http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
			return
		}
		// C-6 (ronda 2026-08-07): esta guardia es una regla de integridad
		// del TENANT COMPLETO, sin importar el rol ni la sucursal de quien
		// pide el borrado -- no debe depender de RLS acotado a la sesión
		// (a diferencia de RFID/dashboard, que sí varían por rol). Usa la
		// función SECURITY DEFINER assets_count_in_location_all_branches
		// (migrations/016_assets_branch_scope_all.sql), que cuenta activos
		// de TODAS las sucursales sin exponer las filas, con los
		// privilegios de su dueño (BYPASSRLS) en vez de los del llamador.
		var count int
		if err := tdb.QueryRowContext(r.Context(),
			`SELECT assets_count_in_location_all_branches($1, $2)`, locID, tenantID,
		).Scan(&count); err != nil {
			log.Printf("HandleLocationsManage: error verificando activos en todas las sucursales (location=%s, tenant=%s): %v", locID, tenantID, err)
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		if count > 0 {
			http.Error(w, fmt.Sprintf(`{"error":"cannot delete: location has %d assets assigned"}`, count), http.StatusConflict)
			return
		}
		_, err := tdb.ExecContext(r.Context(), `DELETE FROM locations WHERE id=$1 AND tenant_id=$2`, locID, tenantID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": locID, "status": "deleted"})
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// HandleModels — /api/dcim/catalogs/models y /api/dcim/catalogs/models/{id}
// Soporta ?manufacturer_id=UUID para filtrar por fabricante
func (h *DCIMHandler) HandleModels(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, tenantID, _, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	path := r.URL.Path
	modelID := ""
	pfx := "/api/dcim/catalogs/models/"
	if len(path) > len(pfx) {
		modelID = path[len(pfx):]
	}

	switch r.Method {
	case http.MethodGet:
		manufacturerID := r.URL.Query().Get("manufacturer_id")
		var rows *sql.Rows
		if manufacturerID != "" {
			rows, err = h.DB.Query(
				`SELECT m.id, m.manufacturer_id, mf.name as manufacturer_name,
				        m.name, COALESCE(m.part_number,''), COALESCE(m.description,''), m.status, m.created_at
				 FROM catalogs_models m
				 JOIN catalogs_manufacturers mf ON mf.id = m.manufacturer_id
				 WHERE m.tenant_id=$1 AND m.manufacturer_id=$2 AND m.status='active'
				 ORDER BY m.name`, tenantID, manufacturerID)
		} else {
			rows, err = h.DB.Query(
				`SELECT m.id, m.manufacturer_id, mf.name as manufacturer_name,
				        m.name, COALESCE(m.part_number,''), COALESCE(m.description,''), m.status, m.created_at
				 FROM catalogs_models m
				 JOIN catalogs_manufacturers mf ON mf.id = m.manufacturer_id
				 WHERE m.tenant_id=$1 AND m.status='active'
				 ORDER BY mf.name, m.name`, tenantID)
		}
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type Model struct {
			ID               string `json:"id"`
			ManufacturerID   string `json:"manufacturer_id"`
			ManufacturerName string `json:"manufacturer_name"`
			Name             string `json:"name"`
			PartNumber       string `json:"part_number"`
			Description      string `json:"description"`
			Status           string `json:"status"`
			CreatedAt        string `json:"created_at"`
		}
		list := []Model{}
		for rows.Next() {
			var m Model
			var ca interface{}
			if err := rows.Scan(&m.ID, &m.ManufacturerID, &m.ManufacturerName,
				&m.Name, &m.PartNumber, &m.Description, &m.Status, &ca); err == nil {
				m.CreatedAt = fmt.Sprintf("%v", ca)
				list = append(list, m)
			}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"models": list})

	case http.MethodPost:
		var b struct {
			ManufacturerID string `json:"manufacturer_id"`
			Name           string `json:"name"`
			PartNumber     string `json:"part_number"`
			Description    string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Name == "" || b.ManufacturerID == "" {
			http.Error(w, `{"error":"manufacturer_id and name are required"}`, http.StatusBadRequest)
			return
		}
		// Verificar que el fabricante pertenece al tenant
		var mfCount int
		h.DB.QueryRow(`SELECT COUNT(*) FROM catalogs_manufacturers WHERE id=$1 AND tenant_id=$2`, b.ManufacturerID, tenantID).Scan(&mfCount)
		if mfCount == 0 {
			http.Error(w, `{"error":"manufacturer not found"}`, http.StatusNotFound)
			return
		}
		newID := uuid.New().String()
		_, err := h.DB.Exec(
			`INSERT INTO catalogs_models (id, tenant_id, manufacturer_id, name, part_number, description)
			 VALUES ($1, $2, $3, $4, NULLIF($5,''), NULLIF($6,''))`,
			newID, tenantID, b.ManufacturerID, b.Name, b.PartNumber, b.Description)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": newID, "name": b.Name})

	case http.MethodPut:
		if modelID == "" {
			http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
			return
		}
		var b struct {
			Name        string `json:"name"`
			PartNumber  string `json:"part_number"`
			Description string `json:"description"`
			Status      string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
			return
		}
		_, err := h.DB.Exec(
			`UPDATE catalogs_models SET
			 name=COALESCE(NULLIF($1,''),name),
			 part_number=NULLIF($2,''),
			 description=NULLIF($3,''),
			 status=COALESCE(NULLIF($4,''),'active'),
			 updated_at=now()
			 WHERE id=$5 AND tenant_id=$6`,
			b.Name, b.PartNumber, b.Description, b.Status, modelID, tenantID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": modelID, "status": "updated"})

	case http.MethodDelete:
		if modelID == "" {
			http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
			return
		}
		_, err := h.DB.Exec(
			`UPDATE catalogs_models SET status='inactive', updated_at=now() WHERE id=$1 AND tenant_id=$2`,
			modelID, tenantID)
		if err != nil {
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": modelID, "status": "deactivated"})

	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}
