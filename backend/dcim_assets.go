package main

import (
	"database/sql"
	"encoding/json"
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
	ID             string      `json:"id"`
	TenantID       string      `json:"tenant_id"`
	BranchID       string      `json:"branch_id"`
	AssetTypeID    string      `json:"asset_type_id"`
	AssetTypeCode  string      `json:"asset_type_code"`
	AssetTypeName  string      `json:"asset_type_name"`
	LocationID     *string     `json:"location_id"`
	LocationName   *string     `json:"location_name"`
	InternalCode   string      `json:"internal_code"`
	Name           string      `json:"name"`
	SerialNumber   *string     `json:"serial_number"`
	Model          *string     `json:"model"`
	Manufacturer   *string     `json:"manufacturer"`
	Status         string      `json:"status"`
	RFIDTag        *string     `json:"rfid_tag"`
	InstallYear    *int        `json:"install_year"`
	Observations   *string     `json:"observations"`
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`
}

type CreateAssetRequest struct {
	AssetTypeID  string  `json:"asset_type_id"`
	LocationID   *string `json:"location_id"`
	InternalCode string  `json:"internal_code"`
	Name         string  `json:"name"`
	SerialNumber *string `json:"serial_number"`
	Model        *string `json:"model"`
	Manufacturer *string `json:"manufacturer"`
	Status       string  `json:"status"`
	RFIDTag      *string `json:"rfid_tag"`
	InstallYear  *int    `json:"install_year"`
	Observations *string `json:"observations"`
}

type UpdateAssetRequest struct {
	AssetTypeID  *string `json:"asset_type_id"`
	LocationID   *string `json:"location_id"`
	InternalCode *string `json:"internal_code"`
	Name         *string `json:"name"`
	SerialNumber *string `json:"serial_number"`
	Model        *string `json:"model"`
	Manufacturer *string `json:"manufacturer"`
	Status       *string `json:"status"`
	RFIDTag      *string `json:"rfid_tag"`
	InstallYear  *int    `json:"install_year"`
	Observations *string `json:"observations"`
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
// Usa sql.NullString para manejar tenant_id/branch_id NULL sin error de Scan
func (h *DCIMHandler) getSessionContext(r *http.Request) (userID, tenantID, branchID string, err error) {
	// Leer session_token desde cookie HttpOnly
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

// HandleAssets enruta GET (list) y POST (create)
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

// HandleAssetByID enruta GET, PUT, DELETE para /api/dcim/assets/{id}
func (h *DCIMHandler) HandleAssetByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	// Extraer ID del path: /api/dcim/assets/{id}
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

// HandleAssetTypes devuelve el catálogo de tipos de activo
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

// HandleLocations devuelve ubicaciones del tenant+branch
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

// ==========================================
// listAssets — GET /api/dcim/assets
// ==========================================
func (h *DCIMHandler) listAssets(w http.ResponseWriter, r *http.Request) {
	_, tenantID, branchID, err := h.getSessionContext(r)
	if err != nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Query params opcionales
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
		       a.status, a.rfid_tag, a.install_year, a.observations,
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
		err := rows.Scan(
			&a.ID, &a.TenantID, &a.BranchID,
			&a.AssetTypeID, &a.AssetTypeCode, &a.AssetTypeName,
			&a.LocationID, &a.LocationName,
			&a.InternalCode, &a.Name,
			&a.SerialNumber, &a.Model, &a.Manufacturer,
			&a.Status, &a.RFIDTag, &a.InstallYear, &a.Observations,
			&a.CreatedAt, &a.UpdatedAt,
		)
		if err != nil {
			continue
		}
		assets = append(assets, a)
	}
	
	// Agregar activos importados — filtrado por tenant_id y branch_id de la sesión activa
	// INVARIANTE INV-DCM-0012: toda fuente de datos agregada a un listado debe pasar
	// por el mismo filtro de tenant que la fuente primaria (corrige F-AST-01)
	importedQuery := `
		SELECT 
			CAST(id AS TEXT) as id,
			tenant_id,
			branch_id,
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
			metadata->>'estado' as status,
			'' as rfid_tag,
			NULL as install_year,
			'Importado automáticamente' as observations,
			created_at,
			updated_at
		FROM imported_assets
		WHERE tenant_id = $1 AND branch_id = $2
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
				&a.Status, &a.RFIDTag, &a.InstallYear, &a.Observations,
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
		       a.status, a.rfid_tag, a.install_year, a.observations,
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
		&a.Status, &a.RFIDTag, &a.InstallYear, &a.Observations,
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
	if req.InternalCode == "" || req.Name == "" || req.AssetTypeID == "" {
		http.Error(w, `{"error":"internal_code, name and asset_type_id are required"}`, http.StatusBadRequest)
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}

	newID := uuid.New().String()

	_, err = h.DB.Exec(`
		INSERT INTO assets (id, tenant_id, branch_id, asset_type_id, location_id,
		                    internal_code, name, serial_number, model, manufacturer,
		                    status, rfid_tag, install_year, observations, created_by, updated_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		newID, tenantID, branchID, req.AssetTypeID, req.LocationID,
		req.InternalCode, req.Name, req.SerialNumber, req.Model, req.Manufacturer,
		req.Status, req.RFIDTag, req.InstallYear, req.Observations, userID, userID,
	)
	if err != nil {
		log.Printf("ERROR creating asset: %v", err)
		if strings.Contains(err.Error(), "unique") {
			http.Error(w, `{"error":"internal_code already exists for this branch"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"database error: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": newID, "status": "created"})
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
	if req.InternalCode != nil {
		setClauses = append(setClauses, "internal_code = $"+itoa(idx))
		args = append(args, *req.InternalCode)
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
	if req.RFIDTag != nil {
		setClauses = append(setClauses, "rfid_tag = $"+itoa(idx))
		args = append(args, *req.RFIDTag)
		idx++
	}
	if req.InstallYear != nil {
		setClauses = append(setClauses, "install_year = $"+itoa(idx))
		args = append(args, *req.InstallYear)
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
