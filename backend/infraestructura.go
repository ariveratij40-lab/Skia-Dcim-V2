package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

func getInfraSession(r *http.Request) (tenantID, branchID, userID string, err error) {
	token, e := r.Cookie("session_token")
	if e != nil {
		return "", "", "", fmt.Errorf("no session")
	}
	var tID, bID, uID sql.NullString
	e = db.QueryRow(`
		SELECT s.tenant_id, s.branch_id, s.user_id
		FROM sessions s WHERE s.token = $1 AND s.expires_at > $2`, token.Value, time.Now().Unix()).
		Scan(&tID, &bID, &uID)
	if e != nil {
		return "", "", "", fmt.Errorf("session not found")
	}
	// Si la sesión no tiene tenant_id, intentar auto-asignarlo (primer tenant del usuario)
	if tID.String == "" {
		var autoTenantID string
		db.QueryRow(`
			SELECT ut.tenant_id FROM user_tenants ut
			JOIN sessions s ON s.user_id = ut.user_id
			WHERE s.token = $1 LIMIT 1`, token.Value).Scan(&autoTenantID)
		if autoTenantID != "" {
			db.Exec(`UPDATE sessions SET tenant_id = $1 WHERE token = $2`, autoTenantID, token.Value)
			tID.String = autoTenantID
		} else {
			return "", "", "", fmt.Errorf("no tenant selected")
		}
	}
	// Si la sesión no tiene branch_id, auto-asignar la primera branch del tenant
	if !bID.Valid || bID.String == "" {
		var autoBranchID string
		db.QueryRow(`SELECT id FROM branches WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`, tID.String).Scan(&autoBranchID)
		if autoBranchID != "" {
			db.Exec(`UPDATE sessions SET branch_id = $1 WHERE token = $2`, autoBranchID, token.Value)
			bID.String = autoBranchID
		} else {
			// No hay branch: crear una por defecto para el tenant
			newBranchID := generateID()
			db.Exec(`INSERT INTO branches (id, tenant_id, name, status) VALUES ($1,$2,$3,'active') ON CONFLICT DO NOTHING`,
				newBranchID, tID.String, "Sede Principal")
			db.QueryRow(`SELECT id FROM branches WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`, tID.String).Scan(&autoBranchID)
			if autoBranchID != "" {
				db.Exec(`UPDATE sessions SET branch_id = $1 WHERE token = $2`, autoBranchID, token.Value)
				bID.String = autoBranchID
			}
		}
	}
	if bID.String == "" {
		return "", "", "", fmt.Errorf("no branch available for tenant")
	}
	return tID.String, bID.String, uID.String, nil
}

// ensureAssetType obtiene el ID del asset_type global por código
// La tabla asset_types es global (sin tenant_id) con códigos fijos: RACK, SWITCH, MDF, IDF, etc.
func ensureAssetType(tenantID, category, subcat string) (string, error) {
	var id string
	// Mapear category al código correcto en la tabla global
	code := category // Por defecto usar el mismo valor
	switch category {
	case "MDF_IDF":
		code = "MDF" // Se sobreescribirá si el tipo es IDF
	case "RACK":
		code = "RACK"
	case "SWITCH":
		code = "SWITCH"
	case "PATCH_PANEL":
		code = "PATCH_PANEL"
	case "UPS":
		code = "UPS"
	case "PDU":
		code = "PDU"
	case "BACKBONE":
		code = "BACKBONE"
	case "NODE":
		code = "NODE"
	}
	err := db.QueryRow(`SELECT id FROM asset_types WHERE code = $1 LIMIT 1`, code).Scan(&id)
	if err == nil {
		return id, nil
	}
	// Si no existe, intentar con el subcat
	err = db.QueryRow(`SELECT id FROM asset_types WHERE code = $1 LIMIT 1`, subcat).Scan(&id)
	if err == nil {
		return id, nil
	}
	// Fallback: primer asset_type disponible
	db.QueryRow(`SELECT id FROM asset_types LIMIT 1`).Scan(&id)
	return id, nil
}

func jsonResp(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// nullableUUID convierte un string vacío a nil para columnas UUID nullable en PostgreSQL
func nullableUUID(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// ─── MDF/IDF ──────────────────────────────────────────────────────────────────

type MdfIdfRecord struct {
	ID               string    `json:"id"`
	Code             string    `json:"code"`
	Name             string    `json:"name"`
	Type             string    `json:"type"`
	Building         string    `json:"building"`
	Floor            string    `json:"floor"`
	Zone             string    `json:"zone"`
	Address          string    `json:"address"`
	Status           string    `json:"status"`
	Responsible      string    `json:"responsible"`
	ResponsibleEmail string    `json:"responsible_email"`
	RacksCount       int       `json:"racks_count"`
	SwitchesCount    int       `json:"switches_count"`
	UpsCount         int       `json:"ups_count"`
	NodesCount       int       `json:"nodes_count"`
	ServersCount     int       `json:"servers_count"`
	CapacityU        int       `json:"capacity_u"`
	UsedU            int       `json:"used_u"`
	Cooling          string    `json:"cooling"`
	PowerKva         float64   `json:"power_kva"`
	DocumentationPct int       `json:"documentation_pct"`
	Certified        bool      `json:"certified"`
	FloorPlanRef     string    `json:"floor_plan_ref"`
	PhotoURL         string    `json:"photo_url"`
	RefImageURL      string    `json:"ref_image_url"`
	Observations     string    `json:"observations"`
	Tags             []string  `json:"tags"`
	CreatedAt        time.Time `json:"created_at"`
}

func handleMdfIdf(w http.ResponseWriter, r *http.Request) {
	tenantID, branchID, userID, err := getInfraSession(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`
			SELECT a.id, a.internal_code, COALESCE(a.name, a.internal_code),
				COALESCE(m.type,'MDF'),
				COALESCE(a.status,'active'),
				COALESCE(m.rack_count,0), COALESCE(m.switch_count,0), COALESCE(m.ups_count,0),
				COALESCE(a.observations,''), a.created_at
			FROM mdf_idf m
			JOIN assets a ON a.id = m.asset_id
			WHERE m.tenant_id = $1
			ORDER BY a.created_at DESC`, tenantID)
		if err != nil {
			jsonResp(w, 200, []MdfIdfRecord{})
			return
		}
		defer rows.Close()
		var list []MdfIdfRecord
		for rows.Next() {
			var rec MdfIdfRecord
			_ = rows.Scan(&rec.ID, &rec.Code, &rec.Name, &rec.Type,
				&rec.Status,
				&rec.RacksCount, &rec.SwitchesCount, &rec.UpsCount,
				&rec.Observations, &rec.CreatedAt)
			rec.Tags = []string{}
			list = append(list, rec)
		}
		if list == nil {
			list = []MdfIdfRecord{}
		}
		jsonResp(w, 200, list)

	case http.MethodPost:
		var req struct {
			Code             string  `json:"code"`
			InternalCode     string  `json:"internal_code"` // alias enviado por el wizard
			SiteType         string  `json:"site_type"`     // alias enviado por el wizard
			Name             string  `json:"name"`
			Type             string  `json:"type"`
			Building         string  `json:"building"`
			Floor            string  `json:"floor"`
			Zone             string  `json:"zone"`
			Address          string  `json:"address"`
			Status           string  `json:"status"`
			Responsible      string  `json:"responsible"`
			ResponsibleEmail string  `json:"responsible_email"`
			Cooling          string  `json:"cooling"`
			PowerKva         float64 `json:"power_kva"`
			CapacityU        int     `json:"capacity_u"`
			Observations     string  `json:"observations"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
		// Normalizar aliases del wizard
		if req.Code == "" && req.InternalCode != "" {
			req.Code = req.InternalCode
		}
		if req.Type == "" && req.SiteType != "" {
			req.Type = req.SiteType
		}
		if req.Status == "" {
			req.Status = "active"
		}
		if req.Code == "" {
			req.Code = fmt.Sprintf("MDF-%s", generateID()[:8])
		}
		if req.Name == "" {
			req.Name = req.Code
		}

		atID, _ := ensureAssetType(tenantID, "MDF_IDF", "network")
		assetID := generateID()
		_, err = db.Exec(`
			INSERT INTO assets (id, tenant_id, branch_id, asset_type_id,
				internal_code, name, status, observations, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			assetID, tenantID, branchID, atID,
			req.Code, req.Name, req.Status, req.Observations, userID)
		if err != nil {
			http.Error(w, "Error creating asset: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Determinar el tipo MDF o IDF
		mdfType := req.Type
		if mdfType != "MDF" && mdfType != "IDF" {
			mdfType = "MDF"
		}
		mdfID := generateID()
		_, err = db.Exec(`
			INSERT INTO mdf_idf (id, asset_id, tenant_id, branch_id, type)
			VALUES ($1,$2,$3,$4,$5)`,
			mdfID, assetID, tenantID, branchID, mdfType)
		if err != nil {
			http.Error(w, "Error creating mdf_idf: "+err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResp(w, 201, map[string]string{"id": assetID, "mdf_id": mdfID})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── Racks ────────────────────────────────────────────────────────────────────

type RackRecord struct {
	ID           string    `json:"id"`
	Code         string    `json:"code"`
	Brand        string    `json:"brand"`
	Model        string    `json:"model"`
	HeightU      int       `json:"height_u"`
	TypePosts    string    `json:"type_posts"`
	RackType     string    `json:"rack_type"`
	Status       string    `json:"status"`
	Location     string    `json:"location"`
	FloorPlanRef string    `json:"floor_plan_ref"`
	PhotoURL     string    `json:"photo_url"`
	RefImageURL  string    `json:"ref_image_url"`
	Observations string    `json:"observations"`
	OrgHorizontal bool     `json:"org_horizontal"`
	OrgVertical  bool      `json:"org_vertical"`
	Pdu          bool      `json:"pdu"`
	Integrator   string    `json:"integrator"`
	InvoiceNo    string    `json:"invoice_no"`
	CostUsd      float64   `json:"cost_usd"`
	Po           string    `json:"po"`
	CostCenter   string    `json:"cost_center"`
	RfidTag      string    `json:"rfid_tag"`
	InstallYear  int       `json:"install_year"`
	CapacityU    int       `json:"capacity_u"`
	UsedU        int       `json:"used_u"`
	CreatedAt    time.Time `json:"created_at"`
}

func handleRacks(w http.ResponseWriter, r *http.Request) {
	tenantID, branchID, userID, err := getInfraSession(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`
			SELECT a.id, a.internal_code,
				COALESCE(a.manufacturer,''), COALESCE(a.model,''),
				COALESCE(rk.total_u,42),
				COALESCE(a.status,'active'),
				COALESCE(a.observations,''),
				COALESCE(a.install_year,0), COALESCE(rk.total_u,42), COALESCE(rk.used_u,0),
				a.created_at
			FROM racks rk
			JOIN assets a ON a.id = rk.asset_id
			WHERE rk.tenant_id = $1
			ORDER BY a.created_at DESC`, tenantID)
		if err != nil {
			jsonResp(w, 200, []RackRecord{})
			return
		}
		defer rows.Close()
		var list []RackRecord
		for rows.Next() {
			var rec RackRecord
			_ = rows.Scan(&rec.ID, &rec.Code,
				&rec.Brand, &rec.Model,
				&rec.HeightU,
				&rec.Status,
				&rec.Observations,
				&rec.InstallYear, &rec.CapacityU, &rec.UsedU,
				&rec.CreatedAt)
			list = append(list, rec)
		}
		if list == nil {
			list = []RackRecord{}
		}
		jsonResp(w, 200, list)

	case http.MethodPost:
		var req struct {
			InternalCode string  `json:"internal_code"`
			Location     string  `json:"location"`
			TotalU       int     `json:"total_u"`
			Status       string  `json:"status"`
			Manufacturer string  `json:"manufacturer"`
			Model        string  `json:"model"`
			RackType     string  `json:"rack_type"`
			PostCount    string  `json:"post_count"`
			Observations string  `json:"observations"`
			InstallYear  int     `json:"install_year"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
		if req.Status == "" {
			req.Status = "active"
		}
		if req.InternalCode == "" {
			req.InternalCode = fmt.Sprintf("RCK-%s", generateID()[:8])
		}
		if req.TotalU == 0 {
			req.TotalU = 42
		}

		atID, _ := ensureAssetType(tenantID, "RACK", "infrastructure")
		log.Printf("DEBUG RACK INSERT: tenantID=%s branchID=%s atID=%s", tenantID, branchID, atID)
		assetID := generateID()
		_, err = db.Exec(`
			INSERT INTO assets (id, tenant_id, branch_id, asset_type_id,
				internal_code, name, status, manufacturer, model, observations, install_year, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			assetID, tenantID, branchID, atID,
			req.InternalCode, req.InternalCode, req.Status,
			req.Manufacturer, req.Model, req.Observations, req.InstallYear, userID)
		if err != nil {
			http.Error(w, "Error creating asset: "+err.Error(), http.StatusInternalServerError)
			return
		}

		rackID := generateID()
		_, err = db.Exec(`
			INSERT INTO racks (id, asset_id, tenant_id, branch_id, total_u)
			VALUES ($1,$2,$3,$4,$5)`,
			rackID, assetID, tenantID, branchID, req.TotalU)
		if err != nil {
			http.Error(w, "Error creating rack: "+err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResp(w, 201, map[string]string{"id": assetID, "rack_id": rackID})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── Switches ─────────────────────────────────────────────────────────────────

type SWRecord struct {
	ID              string    `json:"id"`
	Code            string    `json:"code"`
	Brand           string    `json:"brand"`
	Model           string    `json:"model"`
	Serie           string    `json:"serie"`
	Tipo            string    `json:"tipo"`
	Ubicacion       string    `json:"ubicacion"`
	Status          string    `json:"status"`
	Puertos         int       `json:"puertos"`
	PuertosLibres   int       `json:"puertos_libres"`
	PuertosPoe      int       `json:"puertos_poe"`
	IP              string    `json:"ip"`
	Firmware        string    `json:"firmware"`
	Observaciones   string    `json:"observaciones"`
	AnioInstalacion int       `json:"anio_instalacion"`
	CentroCostos    string    `json:"centro_costos"`
	Proveedor       string    `json:"proveedor"`
	ContratoSla     string    `json:"contrato_sla"`
	RfidTag         string    `json:"rfid"`
	CreatedAt       time.Time `json:"created_at"`
}

func handleSwitches(w http.ResponseWriter, r *http.Request) {
	tenantID, branchID, userID, err := getInfraSession(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`
			SELECT a.id, a.internal_code,
				COALESCE(a.manufacturer,''), COALESCE(a.model,''),
				COALESCE(a.serial_number,''),
				COALESCE(a.status,'active'),
				COALESCE(sw.port_count,24), COALESCE(sw.uplink_count,0),
				COALESCE(sw.management_ip,''),
				COALESCE(a.observations,''),
				COALESCE(a.install_year,0),
				a.created_at
			FROM switches sw
			JOIN assets a ON a.id = sw.asset_id
			WHERE sw.tenant_id = $1
			ORDER BY a.created_at DESC`, tenantID)
		if err != nil {
			jsonResp(w, 200, []SWRecord{})
			return
		}
		defer rows.Close()
		var list []SWRecord
		for rows.Next() {
			var rec SWRecord
			_ = rows.Scan(&rec.ID, &rec.Code,
				&rec.Brand, &rec.Model, &rec.Serie,
				&rec.Status,
				&rec.Puertos, &rec.PuertosPoe,
				&rec.IP, &rec.Observaciones,
				&rec.AnioInstalacion, &rec.CreatedAt)
			list = append(list, rec)
		}
		if list == nil {
			list = []SWRecord{}
		}
		jsonResp(w, 200, list)

	case http.MethodPost:
		var req struct {
			InternalCode string `json:"internal_code"`
			Ubicacion    string `json:"ubicacion"`
			Tipo         string `json:"tipo"`
			PortCount    int    `json:"port_count"`
			UplinkCount  int    `json:"uplink_count"`
			ManagementIP string `json:"management_ip"`
			Status       string `json:"status"`
			Manufacturer string `json:"manufacturer"`
			Model        string `json:"model"`
			Serial       string `json:"serial"`
			Observations string `json:"observations"`
			InstallYear  int    `json:"install_year"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
		if req.Status == "" {
			req.Status = "active"
		}
		if req.InternalCode == "" {
			req.InternalCode = fmt.Sprintf("SW-%s", generateID()[:8])
		}
		if req.PortCount == 0 {
			req.PortCount = 24
		}

		atID, _ := ensureAssetType(tenantID, "SWITCH", "network")
		assetID := generateID()
		_, err = db.Exec(`
			INSERT INTO assets (id, tenant_id, branch_id, asset_type_id,
				internal_code, name, status, manufacturer, model, serial_number, observations, install_year, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
			assetID, tenantID, branchID, atID,
			req.InternalCode, req.InternalCode, req.Status,
			req.Manufacturer, req.Model, req.Serial, req.Observations, req.InstallYear, userID)
		if err != nil {
			http.Error(w, "Error creating asset: "+err.Error(), http.StatusInternalServerError)
			return
		}

		swID := generateID()
		_, err = db.Exec(`
			INSERT INTO switches (id, asset_id, tenant_id, branch_id,
				port_count, uplink_count, management_ip)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			swID, assetID, tenantID, branchID,
			req.PortCount, req.UplinkCount, req.ManagementIP)
		if err != nil {
			http.Error(w, "Error creating switch: "+err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResp(w, 201, map[string]string{"id": assetID, "switch_id": swID})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── UPS / PDUs ───────────────────────────────────────────────────────────────

type PowerDeviceRecord struct {
	ID              string    `json:"id"`
	Code            string    `json:"code"`
	Name            string    `json:"name"`
	DeviceType      string    `json:"device_type"`
	Kva             float64   `json:"kva"`
	BatteryRuntime  int       `json:"battery_runtime_min"`
	ManagementIP    string    `json:"management_ip"`
	Status          string    `json:"status"`
	Manufacturer    string    `json:"brand"`
	Model           string    `json:"model"`
	Observations    string    `json:"observations"`
	TotalOutlets    int       `json:"total_outlets"`
	Amperage        float64   `json:"amperage"`
	InstallYear     int       `json:"install_year"`
	CreatedAt       time.Time `json:"created_at"`
}

func handleUpsPdus(w http.ResponseWriter, r *http.Request) {
	tenantID, branchID, userID, err := getInfraSession(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		// Query UPS
		var list []PowerDeviceRecord
		rows, err := db.Query(`
			SELECT a.id, a.internal_code, a.name,
				'ups' as device_type,
				COALESCE(u.capacity_kva,0), COALESCE(u.battery_runtime_min,0),
				COALESCE(u.management_ip,''),
				COALESCE(a.status,'active'),
				COALESCE(a.manufacturer,''), COALESCE(a.model,''),
				COALESCE(a.observations,''),
				0, 0,
				COALESCE(a.install_year,0),
				a.created_at
			FROM ups u
			JOIN assets a ON a.id = u.asset_id
			WHERE u.tenant_id = $1
			ORDER BY a.created_at DESC`, tenantID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var rec PowerDeviceRecord
				_ = rows.Scan(&rec.ID, &rec.Code, &rec.Name, &rec.DeviceType,
					&rec.Kva, &rec.BatteryRuntime, &rec.ManagementIP, &rec.Status,
					&rec.Manufacturer, &rec.Model, &rec.Observations,
					&rec.TotalOutlets, &rec.Amperage, &rec.InstallYear, &rec.CreatedAt)
				list = append(list, rec)
			}
		}
		// Query PDUs
		rows2, err2 := db.Query(`
			SELECT a.id, a.internal_code, a.name,
				'pdu' as device_type,
				0, 0, COALESCE(p.management_ip,''),
				COALESCE(a.status,'active'),
				COALESCE(a.manufacturer,''), COALESCE(a.model,''),
				COALESCE(a.observations,''),
				COALESCE(p.outlet_count,0), COALESCE(p.amperage,0),
				COALESCE(a.install_year,0),
				a.created_at
			FROM pdus p
			JOIN assets a ON a.id = p.asset_id
			WHERE p.tenant_id = $1
			ORDER BY a.created_at DESC`, tenantID)
		if err2 == nil {
			defer rows2.Close()
			for rows2.Next() {
				var rec PowerDeviceRecord
				_ = rows2.Scan(&rec.ID, &rec.Code, &rec.Name, &rec.DeviceType,
					&rec.Kva, &rec.BatteryRuntime, &rec.ManagementIP, &rec.Status,
					&rec.Manufacturer, &rec.Model, &rec.Observations,
					&rec.TotalOutlets, &rec.Amperage, &rec.InstallYear, &rec.CreatedAt)
				list = append(list, rec)
			}
		}
		if list == nil {
			list = []PowerDeviceRecord{}
		}
		jsonResp(w, 200, list)

	case http.MethodPost:
		var req struct {
			InternalCode   string  `json:"internal_code"`
			Name           string  `json:"name"`
			DeviceType     string  `json:"device_type"`
			CapacityKva    float64 `json:"capacity_kva"`
			BatteryRuntime int     `json:"battery_runtime_min"`
			ManagementIP   string  `json:"management_ip"`
			Status         string  `json:"status"`
			Manufacturer   string  `json:"manufacturer"`
			Model          string  `json:"model"`
			Observations   string  `json:"observations"`
			OutletCount    int     `json:"outlet_count"`
			Amperage       float64 `json:"amperage"`
			InstallYear    int     `json:"install_year"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
		if req.Status == "" {
			req.Status = "active"
		}
		if req.DeviceType == "" {
			req.DeviceType = "ups"
		}
		if req.InternalCode == "" {
			prefix := "UPS"
			if req.DeviceType == "pdu" {
				prefix = "PDU"
			}
			req.InternalCode = fmt.Sprintf("%s-%s", prefix, generateID()[:8])
		}
		if req.Name == "" {
			req.Name = req.InternalCode
		}

		category := "UPS"
		if req.DeviceType == "pdu" {
			category = "PDU"
		}
		atID, _ := ensureAssetType(tenantID, category, "power")
		assetID := generateID()
		_, err = db.Exec(`
			INSERT INTO assets (id, tenant_id, branch_id, asset_type_id,
				internal_code, name, status, manufacturer, model, observations, install_year, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			assetID, tenantID, branchID, atID,
			req.InternalCode, req.Name, req.Status,
			req.Manufacturer, req.Model, req.Observations, req.InstallYear, userID)
		if err != nil {
			http.Error(w, "Error creating asset: "+err.Error(), http.StatusInternalServerError)
			return
		}

		devID := generateID()
		if req.DeviceType == "pdu" {
			_, err = db.Exec(`
				INSERT INTO pdus (id, asset_id, tenant_id, branch_id, outlet_count, amperage, management_ip)
				VALUES ($1,$2,$3,$4,$5,$6,$7)`,
				devID, assetID, tenantID, branchID, req.OutletCount, req.Amperage, req.ManagementIP)
		} else {
			_, err = db.Exec(`
				INSERT INTO ups (id, asset_id, tenant_id, branch_id, capacity_kva, battery_runtime_min, management_ip)
				VALUES ($1,$2,$3,$4,$5,$6,$7)`,
				devID, assetID, tenantID, branchID, req.CapacityKva, req.BatteryRuntime, req.ManagementIP)
		}
		if err != nil {
			http.Error(w, "Error creating device: "+err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResp(w, 201, map[string]string{"id": assetID, "device_id": devID})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── Patch Panels ─────────────────────────────────────────────────────────────

type PatchPanelRecord struct {
	ID           string    `json:"id"`
	Code         string    `json:"code"`
	Brand        string    `json:"brand"`
	Model        string    `json:"model"`
	Serial       string    `json:"serial"`
	Type         string    `json:"type"`
	Status       string    `json:"status"`
	Location     string    `json:"location"`
	FloorPlanRef string    `json:"floor_plan_ref"`
	PhotoURL     string    `json:"photo_url"`
	Observations string    `json:"observations"`
	PortsTotal   int       `json:"ports_total"`
	PortsFree    int       `json:"ports_free"`
	RfidTag      string    `json:"rfid_tag"`
	InstallYear  int       `json:"install_year"`
	Supplier     string    `json:"supplier"`
	SlaContract  string    `json:"sla_contract"`
	CostCenter   string    `json:"cost_center"`
	CreatedAt    time.Time `json:"created_at"`
}

func handlePatchPanels(w http.ResponseWriter, r *http.Request) {
	tenantID, branchID, userID, err := getInfraSession(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`
			SELECT a.id, a.internal_code,
				COALESCE(a.manufacturer,''), COALESCE(a.model,''),
				COALESCE(a.serial_number,''),
				COALESCE(pp.port_type,'Cat6A'),
				COALESCE(a.status,'active'),
				COALESCE(a.observations,''),
				COALESCE(pp.port_count,24),
				COALESCE(a.rfid_tag,''),
				COALESCE(a.install_year,0),
				a.created_at
			FROM patch_panels pp
			JOIN assets a ON a.id = pp.asset_id
			WHERE pp.tenant_id = $1
			ORDER BY a.created_at DESC`, tenantID)
		if err != nil {
			jsonResp(w, 200, []PatchPanelRecord{})
			return
		}
		defer rows.Close()
		var list []PatchPanelRecord
		for rows.Next() {
			var rec PatchPanelRecord
			_ = rows.Scan(&rec.ID, &rec.Code,
				&rec.Brand, &rec.Model, &rec.Serial,
				&rec.Type,
				&rec.Status,
				&rec.Observations,
				&rec.PortsTotal,
				&rec.RfidTag, &rec.InstallYear, &rec.CreatedAt)
			list = append(list, rec)
		}
		if list == nil {
			list = []PatchPanelRecord{}
		}
		jsonResp(w, 200, list)

	case http.MethodPost:
		var req struct {
			InternalCode string `json:"internal_code"`
			Location     string `json:"location"`
			PanelType    string `json:"panel_type"`
			PortCount    int    `json:"port_count"`
			Status       string `json:"status"`
			Manufacturer string `json:"manufacturer"`
			Model        string `json:"model"`
			Serial       string `json:"serial"`
			Observations string `json:"observations"`
			InstallYear  int    `json:"install_year"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
		if req.Status == "" {
			req.Status = "active"
		}
		if req.InternalCode == "" {
			req.InternalCode = fmt.Sprintf("PP-%s", generateID()[:8])
		}
		if req.PortCount == 0 {
			req.PortCount = 24
		}

		atID, _ := ensureAssetType(tenantID, "PATCH_PANEL", "network")
		assetID := generateID()
		_, err = db.Exec(`
			INSERT INTO assets (id, tenant_id, branch_id, asset_type_id,
				internal_code, name, status, manufacturer, model, serial_number, observations, install_year, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
			assetID, tenantID, branchID, atID,
			req.InternalCode, req.InternalCode, req.Status,
			req.Manufacturer, req.Model, req.Serial, req.Observations, req.InstallYear, userID)
		if err != nil {
			http.Error(w, "Error creating asset: "+err.Error(), http.StatusInternalServerError)
			return
		}

		ppID := generateID()
		_, err = db.Exec(`
			INSERT INTO patch_panels (id, asset_id, tenant_id, branch_id, port_count, port_type)
			VALUES ($1,$2,$3,$4,$5,$6)`,
			ppID, assetID, tenantID, branchID, req.PortCount, req.PanelType)
		if err != nil {
			http.Error(w, "Error creating patch panel: "+err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResp(w, 201, map[string]string{"id": assetID, "pp_id": ppID})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── Backbone ─────────────────────────────────────────────────────────────────

type BBRecord struct {
	ID              string    `json:"id"`
	Codigo          string    `json:"codigo"`
	Marca           string    `json:"marca"`
	TipoFibra       string    `json:"tipo_fibra"`
	IdfOrigen       string    `json:"idf_origen"`
	IdfDestino      string    `json:"idf_destino"`
	Hilos           string    `json:"hilos"`
	Longitud        string    `json:"longitud"`
	BandwidthGbps   float64   `json:"bandwidth_gbps"`
	Status          string    `json:"status"`
	Observaciones   string    `json:"observaciones"`
	AnioInstalacion int       `json:"anio_instalacion"`
	CreatedAt       time.Time `json:"created_at"`
}

func handleBackbone(w http.ResponseWriter, r *http.Request) {
	tenantID, branchID, userID, err := getInfraSession(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`
			SELECT a.id, a.internal_code,
				COALESCE(a.manufacturer,''),
				COALESCE(bl.link_type,'fiber'),
				COALESCE(bl.origin_id::text,''), COALESCE(bl.destination_id::text,''),
				COALESCE(bl.fiber_count::text,''), COALESCE(bl.cable_length_m::text,''),
				COALESCE(bl.bandwidth_gbps,0),
				COALESCE(a.status,'active'),
				COALESCE(a.observations,''),
				COALESCE(a.install_year,0),
				a.created_at
			FROM backbone_links bl
			JOIN assets a ON a.id = bl.asset_id
			WHERE bl.tenant_id = $1
			ORDER BY a.created_at DESC`, tenantID)
		if err != nil {
			jsonResp(w, 200, []BBRecord{})
			return
		}
		defer rows.Close()
		var list []BBRecord
		for rows.Next() {
			var rec BBRecord
			_ = rows.Scan(&rec.ID, &rec.Codigo, &rec.Marca,
				&rec.TipoFibra, &rec.IdfOrigen, &rec.IdfDestino,
				&rec.Hilos, &rec.Longitud, &rec.BandwidthGbps,
				&rec.Status, &rec.Observaciones,
				&rec.AnioInstalacion, &rec.CreatedAt)
			list = append(list, rec)
		}
		if list == nil {
			list = []BBRecord{}
		}
		jsonResp(w, 200, list)

	case http.MethodPost:
		var req struct {
			InternalCode  string  `json:"internal_code"`
			Manufacturer  string  `json:"manufacturer"`
			LinkType      string  `json:"link_type"`
			OriginID      string  `json:"origin_id"`
			DestinationID string  `json:"destination_id"`
			FiberCount    int     `json:"fiber_count"`
			CableLengthM  float64 `json:"cable_length_m"`
			BandwidthGbps float64 `json:"bandwidth_gbps"`
			Status        string  `json:"status"`
			Observations  string  `json:"observations"`
			InstallYear   int     `json:"install_year"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
		if req.Status == "" {
			req.Status = "active"
		}
		if req.InternalCode == "" {
			req.InternalCode = fmt.Sprintf("BB-%s", generateID()[:8])
		}
		if req.LinkType == "" {
			req.LinkType = "fiber"
		}

		atID, _ := ensureAssetType(tenantID, "BACKBONE", "network")
		assetID := generateID()
		_, err = db.Exec(`
			INSERT INTO assets (id, tenant_id, branch_id, asset_type_id,
				internal_code, name, status, manufacturer, observations, install_year, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			assetID, tenantID, branchID, atID,
			req.InternalCode, req.InternalCode, req.Status,
			req.Manufacturer, req.Observations, req.InstallYear, userID)
		if err != nil {
			http.Error(w, "Error creating asset: "+err.Error(), http.StatusInternalServerError)
			return
		}

		bbID := generateID()
		var originID, destID interface{}
		if req.OriginID != "" {
			originID = req.OriginID
		}
		if req.DestinationID != "" {
			destID = req.DestinationID
		}
		_, err = db.Exec(`
			INSERT INTO backbone_links (id, asset_id, tenant_id, branch_id,
				link_type, origin_id, destination_id, fiber_count, cable_length_m, bandwidth_gbps)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			bbID, assetID, tenantID, branchID,
			req.LinkType, originID, destID, req.FiberCount, req.CableLengthM, req.BandwidthGbps)
		if err != nil {
			http.Error(w, "Error creating backbone link: "+err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResp(w, 201, map[string]string{"id": assetID, "bb_id": bbID})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── Nodos ────────────────────────────────────────────────────────────────────

type NodeRecord struct {
	ID              string    `json:"id"`
	AssetID         string    `json:"asset_id"`
	Codigo          string    `json:"codigo"`
	Marca           string    `json:"marca"`
	NodeType        string    `json:"node_type"`
	IPAddress       string    `json:"ip_address"`
	MACAddress      string    `json:"mac_address"`
	SwitchPort      string    `json:"switch_port"`
	Status          string    `json:"status"`
	Observaciones   string    `json:"observaciones"`
	AnioInstalacion int       `json:"anio_instalacion"`
	CreatedAt       time.Time `json:"created_at"`
}

func handleNodos(w http.ResponseWriter, r *http.Request) {
	tenantID, branchID, userID, err := getInfraSession(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`
			SELECT n.id, n.asset_id, a.internal_code,
				COALESCE(a.manufacturer,''),
				COALESCE(n.node_type,'endpoint'),
				COALESCE(n.ip_address,''), COALESCE(n.mac_address,''),
				COALESCE(n.switch_port,''),
				COALESCE(a.status,'active'),
				COALESCE(a.observations,''),
				COALESCE(a.install_year,0),
				a.created_at
			FROM nodes n
			JOIN assets a ON a.id = n.asset_id
			WHERE n.tenant_id = $1
			ORDER BY a.created_at DESC`, tenantID)
		if err != nil {
			jsonResp(w, 200, []NodeRecord{})
			return
		}
		defer rows.Close()
		var list []NodeRecord
		for rows.Next() {
			var rec NodeRecord
			_ = rows.Scan(&rec.ID, &rec.AssetID, &rec.Codigo, &rec.Marca,
				&rec.NodeType, &rec.IPAddress, &rec.MACAddress, &rec.SwitchPort,
				&rec.Status, &rec.Observaciones, &rec.AnioInstalacion, &rec.CreatedAt)
			list = append(list, rec)
		}
		if list == nil {
			list = []NodeRecord{}
		}
		jsonResp(w, 200, list)

	case http.MethodPost:
		var req struct {
			InternalCode string `json:"internal_code"`
			NodeType     string `json:"node_type"`
			IPAddress    string `json:"ip_address"`
			MACAddress   string `json:"mac_address"`
			SwitchPort   string `json:"switch_port"`
			Status       string `json:"status"`
			Manufacturer string `json:"manufacturer"`
			Model        string `json:"model"`
			Observations string `json:"observations"`
			InstallYear  int    `json:"install_year"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
		if req.Status == "" {
			req.Status = "active"
		}
		if req.NodeType == "" {
			req.NodeType = "endpoint"
		}
		if req.InternalCode == "" {
			req.InternalCode = fmt.Sprintf("NOD-%s", generateID()[:8])
		}

		atID, _ := ensureAssetType(tenantID, "NODE", "network")
		assetID := generateID()
		_, err = db.Exec(`
			INSERT INTO assets (id, tenant_id, branch_id, asset_type_id,
				internal_code, name, status, manufacturer, model, observations, install_year, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			assetID, tenantID, branchID, atID,
			req.InternalCode, req.InternalCode, req.Status,
			req.Manufacturer, req.Model, req.Observations, req.InstallYear, userID)
		if err != nil {
			http.Error(w, "Error creating asset: "+err.Error(), http.StatusInternalServerError)
			return
		}

		nodeID := generateID()
		_, err = db.Exec(`
			INSERT INTO nodes (id, asset_id, tenant_id, branch_id, node_type, ip_address, mac_address, switch_port)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			nodeID, assetID, tenantID, branchID, req.NodeType, req.IPAddress, req.MACAddress, req.SwitchPort)
		if err != nil {
			http.Error(w, "Error creating node: "+err.Error(), http.StatusInternalServerError)
			return
		}
		jsonResp(w, 201, map[string]string{"id": nodeID, "asset_id": assetID})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
