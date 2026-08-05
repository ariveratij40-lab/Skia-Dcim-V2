package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// ==========================================
// Helpers de sesión
// ==========================================

type sessionInfo struct {
	UserID   string
	TenantID string
	Role     string
}

func getSession(r *http.Request) (*sessionInfo, error) {
	token := extractSessionToken(r)
	if token == "" {
		return nil, sql.ErrNoRows
	}
	var userID string
	var tenantID sql.NullString
	err := db.QueryRow(
		`SELECT u.id, s.tenant_id
		 FROM sessions s JOIN users u ON s.user_id = u.id
		 WHERE s.token = $1 AND s.expires_at > $2`,
		token, time.Now().Unix(),
	).Scan(&userID, &tenantID)
	if err != nil {
		return nil, err
	}
	// SEGURIDAD CRITICA: rechazar sesiones sin tenant_id asignado
	// Previene acceso a datos antes de que el usuario seleccione su tenant
	if !tenantID.Valid || tenantID.String == "" {
		return nil, sql.ErrNoRows
	}
	// Obtener nombre del rol via JOIN con tabla roles
	var role string
	db.QueryRow(
		`SELECT r.name FROM user_roles ur
		 JOIN roles r ON r.id = ur.role_id
		 WHERE ur.user_id = $1 AND ur.tenant_id = $2 LIMIT 1`,
		userID, tenantID.String,
	).Scan(&role)
	return &sessionInfo{UserID: userID, TenantID: tenantID.String, Role: role}, nil
}

func jsonErr(w http.ResponseWriter, msg string, code int) {
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// ==========================================
// /api/config/section  (GET + PUT)
// ==========================================

func handleConfigSection(w http.ResponseWriter, r *http.Request) {
	sess, err := getSession(r)
	if err != nil {
		jsonErr(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extraer sección de la URL: /api/config/{section}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/config/"), "/")
	section := parts[0]
	if section == "" {
		jsonErr(w, "Section required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case "GET":
		var data json.RawMessage
		err := db.QueryRow(
			`SELECT data FROM tenant_config WHERE tenant_id = $1 AND section = $2`,
			sess.TenantID, section,
		).Scan(&data)
		if err == sql.ErrNoRows {
			json.NewEncoder(w).Encode(map[string]interface{}{"data": map[string]interface{}{}})
			return
		}
		if err != nil {
			jsonErr(w, "DB error", http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]json.RawMessage{"data": data})

	case "PUT":
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		dataBytes, _ := json.Marshal(body)
		_, err := db.Exec(
			`INSERT INTO tenant_config (tenant_id, section, data, updated_at, updated_by)
			 VALUES ($1, $2, $3, NOW(), $4)
			 ON CONFLICT (tenant_id, section) DO UPDATE
			 SET data = $3, updated_at = NOW(), updated_by = $4`,
			sess.TenantID, section, string(dataBytes), sess.UserID,
		)
		if err != nil {
			jsonErr(w, "DB error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		// Registrar en audit log
		db.Exec(
			`INSERT INTO audit_logs (user_id, tenant_id, action, entity_type, entity_id, changes)
			 VALUES ($1, $2, 'UPDATE_CONFIG', 'config', $3, $4)`,
			sess.UserID, sess.TenantID, section, string(dataBytes),
		)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		jsonErr(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ==========================================
// /api/config/integrations  (GET)
// /api/config/integrations/{code}  (PUT)
// ==========================================

func handleIntegrations(w http.ResponseWriter, r *http.Request) {
	sess, err := getSession(r)
	if err != nil {
		jsonErr(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/config/integrations")
	code := strings.Trim(path, "/")

	if r.Method == "GET" {
		rows, err := db.Query(
			`SELECT integration_code, name, status, config FROM tenant_integrations WHERE tenant_id = $1 ORDER BY name`,
			sess.TenantID,
		)
		if err != nil {
			jsonErr(w, "DB error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type IntegRow struct {
			Code   string          `json:"code"`
			Name   string          `json:"name"`
			Status string          `json:"status"`
			Config json.RawMessage `json:"config"`
		}
		var list []IntegRow
		for rows.Next() {
			var row IntegRow
			rows.Scan(&row.Code, &row.Name, &row.Status, &row.Config)
			list = append(list, row)
		}
		if list == nil {
			list = []IntegRow{}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"integrations": list})
		return
	}

	if r.Method == "PUT" && code != "" {
		var body struct {
			Status string                 `json:"status"`
			Config map[string]interface{} `json:"config"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		configBytes, _ := json.Marshal(body.Config)
		_, err := db.Exec(
			`UPDATE tenant_integrations
			 SET status = $1, config = $2, updated_at = NOW()
			 WHERE tenant_id = $3 AND integration_code = $4`,
			body.Status, string(configBytes), sess.TenantID, code,
		)
		if err != nil {
			jsonErr(w, "DB error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
		return
	}

	jsonErr(w, "Method not allowed", http.StatusMethodNotAllowed)
}

// ==========================================
// /api/config/apikeys  (GET + POST + DELETE)
// ==========================================

func handleApiKeys(w http.ResponseWriter, r *http.Request) {
	sess, err := getSession(r)
	if err != nil {
		jsonErr(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/config/apikeys")
	keyID := strings.Trim(path, "/")

	switch r.Method {
	case "GET":
		rows, err := db.Query(
			`SELECT id, name, key_prefix, permissions, active, last_used_at, created_at
			 FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
			sess.TenantID,
		)
		if err != nil {
			jsonErr(w, "DB error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type KeyRow struct {
			ID          string          `json:"id"`
			Name        string          `json:"name"`
			KeyPrefix   string          `json:"keyPrefix"`
			Permissions json.RawMessage `json:"permissions"`
			Active      bool            `json:"active"`
			LastUsed    *string         `json:"lastUsed"`
			CreatedAt   string          `json:"createdAt"`
		}
		var list []KeyRow
		for rows.Next() {
			var row KeyRow
			var lastUsed sql.NullTime
			rows.Scan(&row.ID, &row.Name, &row.KeyPrefix, &row.Permissions, &row.Active, &lastUsed, &row.CreatedAt)
			if lastUsed.Valid {
				s := lastUsed.Time.Format("2006-01-02")
				row.LastUsed = &s
			}
			list = append(list, row)
		}
		if list == nil {
			list = []KeyRow{}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"keys": list})

	case "POST":
		var body struct {
			Name        string   `json:"name"`
			Permissions []string `json:"permissions"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		// Generar token aleatorio
		tokenBytes := make([]byte, 24)
		rand.Read(tokenBytes)
		token := "sk_live_" + hex.EncodeToString(tokenBytes)
		prefix := token[:20]
		// Guardar hash simple (en producción usar bcrypt/argon2)
		permsBytes, _ := json.Marshal(body.Permissions)
		var newID string
		err := db.QueryRow(
			`INSERT INTO api_keys (tenant_id, name, key_hash, key_prefix, permissions, active, created_by)
			 VALUES ($1, $2, $3, $4, $5, TRUE, $6) RETURNING id`,
			sess.TenantID, body.Name, token, prefix, string(permsBytes), sess.UserID,
		).Scan(&newID)
		if err != nil {
			jsonErr(w, "DB error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": newID, "key": token, "status": "ok"})

	case "DELETE":
		if keyID == "" {
			jsonErr(w, "Key ID required", http.StatusBadRequest)
			return
		}
		db.Exec(`DELETE FROM api_keys WHERE id = $1 AND tenant_id = $2`, keyID, sess.TenantID)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		jsonErr(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ==========================================
// /api/config/rfid/readers  (GET + POST + DELETE)
// ==========================================

func handleRFIDReaders(w http.ResponseWriter, r *http.Request) {
	sess, err := getSession(r)
	if err != nil {
		jsonErr(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/config/rfid/readers")
	readerID := strings.Trim(path, "/")

	switch r.Method {
	case "GET":
		rows, err := db.Query(
			`SELECT id, reader_code, name, ip_address, status, reader_type, location
			 FROM rfid_readers WHERE tenant_id = $1 ORDER BY name`,
			sess.TenantID,
		)
		if err != nil {
			jsonErr(w, "DB error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type RFIDRow struct {
			ID         string `json:"id"`
			Code       string `json:"code"`
			Name       string `json:"name"`
			IP         string `json:"ip"`
			Status     string `json:"status"`
			ReaderType string `json:"readerType"`
			Location   string `json:"location"`
		}
		var list []RFIDRow
		for rows.Next() {
			var row RFIDRow
			var ip, loc sql.NullString
			rows.Scan(&row.ID, &row.Code, &row.Name, &ip, &row.Status, &row.ReaderType, &loc)
			row.IP = ip.String
			row.Location = loc.String
			list = append(list, row)
		}
		if list == nil {
			list = []RFIDRow{}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"readers": list})

	case "POST":
		var body struct {
			Code       string `json:"code"`
			Name       string `json:"name"`
			IP         string `json:"ip"`
			ReaderType string `json:"readerType"`
			Location   string `json:"location"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		var newID string
		err := db.QueryRow(
			`INSERT INTO rfid_readers (tenant_id, reader_code, name, ip_address, reader_type, location, status)
			 VALUES ($1, $2, $3, $4, $5, $6, 'offline') RETURNING id`,
			sess.TenantID, body.Code, body.Name, body.IP, body.ReaderType, body.Location,
		).Scan(&newID)
		if err != nil {
			jsonErr(w, "DB error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": newID, "status": "ok"})

	case "DELETE":
		if readerID == "" {
			jsonErr(w, "Reader ID required", http.StatusBadRequest)
			return
		}
		db.Exec(`DELETE FROM rfid_readers WHERE id = $1 AND tenant_id = $2`, readerID, sess.TenantID)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		jsonErr(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ==========================================
// /api/admin/users  (GET + POST + PUT + DELETE)
// ==========================================

// adminUserRoles enumera los nombres de rol válidos para /api/admin/users.
// Server-side allowlist: nunca confiar en el valor crudo enviado por el cliente
// para construir un lookup de role_id (invariante #4 - autorización server-side).
var adminUserRoles = map[string]bool{"viewer": true, "operator": true, "admin": true}

// resolveRoleID resuelve un nombre de rol a su UUID dentro del alcance del tenant,
// prefiriendo un rol específico del tenant sobre uno global (tenant_id IS NULL).
// Corrige A-8: la tabla user_roles nunca tuvo columna `role`, solo `role_id` (FK a roles).
func resolveRoleID(tenantID, roleName string) (string, error) {
	var roleID string
	err := db.QueryRow(
		`SELECT id FROM roles
		 WHERE name = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
		 ORDER BY tenant_id NULLS LAST
		 LIMIT 1`,
		roleName, tenantID,
	).Scan(&roleID)
	return roleID, err
}

func handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	sess, err := getSession(r)
	if err != nil {
		jsonErr(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	// SEGURIDAD: /api/admin/users administra membresías y roles de todo el tenant;
	// solo el rol "admin" puede leerlo o modificarlo. Antes de este fix no había
	// ninguna verificación de rol aquí -- el bug de SQL de A-8 hacía fallar el
	// PUT antes de llegar a esta lógica, pero arreglar solo el SQL sin agregar
	// esta verificación habría abierto una escalación de privilegios real
	// (cualquier usuario autenticado pudiendo auto-asignarse "admin").
	if sess.Role != "admin" {
		jsonErr(w, "Forbidden", http.StatusForbidden)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/admin/users")
	userID := strings.Trim(path, "/")

	switch r.Method {
	case "GET":
		rows, err := db.Query(
			`SELECT u.id, u.email, u.name, u.created_at,
			        COALESCE(r.name, 'viewer') as role
			 FROM users u
			 JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = $1
			 LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = $1
			 LEFT JOIN roles r ON r.id = ur.role_id
			 ORDER BY u.name`,
			sess.TenantID,
		)
		if err != nil {
			jsonErr(w, "DB error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type UserRow struct {
			ID        string `json:"id"`
			Email     string `json:"email"`
			Name      string `json:"name"`
			Role      string `json:"role"`
			// Status: user_tenants no tiene columna status (A-9). No existe hoy
			// un mecanismo de desactivación de membresía por tenant; se reporta
			// "active" de forma fija hasta que se diseñe esa capacidad.
			Status    string `json:"status"`
			CreatedAt string `json:"createdAt"`
		}
		var list []UserRow
		for rows.Next() {
			var row UserRow
			row.Status = "active"
			rows.Scan(&row.ID, &row.Email, &row.Name, &row.CreatedAt, &row.Role)
			list = append(list, row)
		}
		if list == nil {
			list = []UserRow{}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"users": list})

	case "PUT":
		if userID == "" {
			jsonErr(w, "User ID required", http.StatusBadRequest)
			return
		}
		var body struct {
			Role string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if body.Role != "" {
			if !adminUserRoles[body.Role] {
				jsonErr(w, "Invalid role: "+body.Role, http.StatusBadRequest)
				return
			}
			roleID, err := resolveRoleID(sess.TenantID, body.Role)
			if err != nil {
				jsonErr(w, "Unknown role for this tenant: "+body.Role, http.StatusBadRequest)
				return
			}
			tx, err := db.Begin()
			if err != nil {
				jsonErr(w, "DB error: "+err.Error(), http.StatusInternalServerError)
				return
			}
			// user_roles.role_id es parte de la unique key (user_id, tenant_id, role_id);
			// el modelo de negocio de este endpoint asume un solo rol activo por
			// tenant, así que se reemplaza explícitamente en vez de solo insertar.
			if _, err := tx.Exec(
				`DELETE FROM user_roles WHERE user_id = $1 AND tenant_id = $2`,
				userID, sess.TenantID,
			); err != nil {
				tx.Rollback()
				jsonErr(w, "DB error: "+err.Error(), http.StatusInternalServerError)
				return
			}
			if _, err := tx.Exec(
				`INSERT INTO user_roles (user_id, tenant_id, role_id) VALUES ($1, $2, $3)`,
				userID, sess.TenantID, roleID,
			); err != nil {
				tx.Rollback()
				jsonErr(w, "DB error: "+err.Error(), http.StatusInternalServerError)
				return
			}
			if err := tx.Commit(); err != nil {
				jsonErr(w, "DB error: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	case "DELETE":
		if userID == "" {
			jsonErr(w, "User ID required", http.StatusBadRequest)
			return
		}
		db.Exec(`DELETE FROM user_tenants WHERE user_id = $1 AND tenant_id = $2`, userID, sess.TenantID)
		db.Exec(`DELETE FROM user_roles WHERE user_id = $1 AND tenant_id = $2`, userID, sess.TenantID)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		jsonErr(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ==========================================
// /api/admin/projects  (GET + POST + PUT + DELETE)
// ==========================================

func handleAdminProjects(w http.ResponseWriter, r *http.Request) {
	sess, err := getSession(r)
	if err != nil {
		jsonErr(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/admin/projects")
	projectID := strings.Trim(path, "/")

	switch r.Method {
	case "GET":
		rows, err := db.Query(
			`SELECT id, name, description, status, responsible, start_date, modules
			 FROM projects WHERE tenant_id = $1 ORDER BY name`,
			sess.TenantID,
		)
		if err != nil {
			jsonErr(w, "DB error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type ProjRow struct {
			ID          string          `json:"id"`
			Name        string          `json:"name"`
			Description string          `json:"description"`
			Status      string          `json:"status"`
			Responsible string          `json:"responsible"`
			StartDate   *string         `json:"startDate"`
			Modules     json.RawMessage `json:"modules"`
		}
		var list []ProjRow
		for rows.Next() {
			var row ProjRow
			var desc, resp sql.NullString
			var startDate sql.NullTime
			rows.Scan(&row.ID, &row.Name, &desc, &row.Status, &resp, &startDate, &row.Modules)
			row.Description = desc.String
			row.Responsible = resp.String
			if startDate.Valid {
				s := startDate.Time.Format("2006-01-02")
				row.StartDate = &s
			}
			list = append(list, row)
		}
		if list == nil {
			list = []ProjRow{}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"projects": list})

	case "POST":
		var body struct {
			Name        string   `json:"name"`
			Description string   `json:"description"`
			Status      string   `json:"status"`
			Responsible string   `json:"responsible"`
			StartDate   string   `json:"startDate"`
			Modules     []string `json:"modules"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		modulesBytes, _ := json.Marshal(body.Modules)
		var newID string
		err := db.QueryRow(
			`INSERT INTO projects (tenant_id, name, description, status, responsible, start_date, modules)
			 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
			sess.TenantID, body.Name, body.Description, body.Status, body.Responsible,
			nullString(body.StartDate), string(modulesBytes),
		).Scan(&newID)
		if err != nil {
			jsonErr(w, "DB error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": newID, "status": "ok"})

	case "PUT":
		if projectID == "" {
			jsonErr(w, "Project ID required", http.StatusBadRequest)
			return
		}
		var body struct {
			Name        string   `json:"name"`
			Description string   `json:"description"`
			Status      string   `json:"status"`
			Responsible string   `json:"responsible"`
			Modules     []string `json:"modules"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		modulesBytes, _ := json.Marshal(body.Modules)
		db.Exec(
			`UPDATE projects SET name=$1, description=$2, status=$3, responsible=$4, modules=$5, updated_at=NOW()
			 WHERE id=$6 AND tenant_id=$7`,
			body.Name, body.Description, body.Status, body.Responsible, string(modulesBytes), projectID, sess.TenantID,
		)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	case "DELETE":
		if projectID == "" {
			jsonErr(w, "Project ID required", http.StatusBadRequest)
			return
		}
		db.Exec(`DELETE FROM projects WHERE id = $1 AND tenant_id = $2`, projectID, sess.TenantID)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		jsonErr(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ==========================================
// /api/admin/integrators  (GET + POST + PUT + DELETE)
// ==========================================

func handleAdminIntegrators(w http.ResponseWriter, r *http.Request) {
	sess, err := getSession(r)
	if err != nil {
		jsonErr(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/admin/integrators")
	integratorID := strings.Trim(path, "/")

	switch r.Method {
	case "GET":
		rows, err := db.Query(
			`SELECT id, name, contact_name, email, phone, specialties, rating, projects_count, active
			 FROM integrators WHERE tenant_id = $1 ORDER BY name`,
			sess.TenantID,
		)
		if err != nil {
			jsonErr(w, "DB error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type IntRow struct {
			ID            string          `json:"id"`
			Name          string          `json:"name"`
			ContactName   string          `json:"contactName"`
			Email         string          `json:"email"`
			Phone         string          `json:"phone"`
			Specialties   json.RawMessage `json:"specialties"`
			Rating        int             `json:"rating"`
			ProjectsCount int             `json:"projectsCount"`
			Active        bool            `json:"active"`
		}
		var list []IntRow
		for rows.Next() {
			var row IntRow
			var cn, email, phone sql.NullString
			rows.Scan(&row.ID, &row.Name, &cn, &email, &phone, &row.Specialties, &row.Rating, &row.ProjectsCount, &row.Active)
			row.ContactName = cn.String
			row.Email = email.String
			row.Phone = phone.String
			list = append(list, row)
		}
		if list == nil {
			list = []IntRow{}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"integrators": list})

	case "POST":
		var body struct {
			Name        string   `json:"name"`
			ContactName string   `json:"contactName"`
			Email       string   `json:"email"`
			Phone       string   `json:"phone"`
			Specialties []string `json:"specialties"`
			Rating      int      `json:"rating"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		specsBytes, _ := json.Marshal(body.Specialties)
		var newID string
		err := db.QueryRow(
			`INSERT INTO integrators (tenant_id, name, contact_name, email, phone, specialties, rating)
			 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
			sess.TenantID, body.Name, body.ContactName, body.Email, body.Phone, string(specsBytes), body.Rating,
		).Scan(&newID)
		if err != nil {
			jsonErr(w, "DB error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"id": newID, "status": "ok"})

	case "DELETE":
		if integratorID == "" {
			jsonErr(w, "Integrator ID required", http.StatusBadRequest)
			return
		}
		db.Exec(`DELETE FROM integrators WHERE id = $1 AND tenant_id = $2`, integratorID, sess.TenantID)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		jsonErr(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ==========================================
// /api/admin/audit  (GET)
// ==========================================

func handleAdminAudit(w http.ResponseWriter, r *http.Request) {
	sess, err := getSession(r)
	if err != nil {
		jsonErr(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != "GET" {
		jsonErr(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := db.Query(
		`SELECT al.id, COALESCE(u.name, 'Sistema') as user_name, al.action,
		        al.entity_type, al.entity_id, al.ip_address, al.created_at
		 FROM audit_logs al
		 LEFT JOIN users u ON al.user_id = u.id
		 WHERE al.tenant_id = $1
		 ORDER BY al.created_at DESC LIMIT 200`,
		sess.TenantID,
	)
	if err != nil {
		jsonErr(w, "DB error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type AuditRow struct {
		ID         string `json:"id"`
		UserName   string `json:"userName"`
		Action     string `json:"action"`
		EntityType string `json:"entityType"`
		EntityID   string `json:"entityId"`
		IP         string `json:"ip"`
		CreatedAt  string `json:"createdAt"`
	}
	var list []AuditRow
	for rows.Next() {
		var row AuditRow
		var et, ei, ip sql.NullString
		rows.Scan(&row.ID, &row.UserName, &row.Action, &et, &ei, &ip, &row.CreatedAt)
		row.EntityType = et.String
		row.EntityID = ei.String
		row.IP = ip.String
		list = append(list, row)
	}
	if list == nil {
		list = []AuditRow{}
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"logs": list})
}

// ==========================================
// /api/admin/feature-flags  (GET + PUT)
// ==========================================

func handleAdminFeatureFlags(w http.ResponseWriter, r *http.Request) {
	sess, err := getSession(r)
	if err != nil {
		jsonErr(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case "GET":
		rows, err := db.Query(
			`SELECT ff.id, ff.code, ff.name, ff.description,
			        COALESCE(tff.enabled, ff.enabled) as enabled
			 FROM feature_flags ff
			 LEFT JOIN tenant_feature_flags tff ON tff.feature_flag_id = ff.id AND tff.tenant_id = $1
			 ORDER BY ff.name`,
			sess.TenantID,
		)
		if err != nil {
			jsonErr(w, "DB error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type FFRow struct {
			ID          string `json:"id"`
			Code        string `json:"code"`
			Name        string `json:"name"`
			Description string `json:"description"`
			Enabled     bool   `json:"enabled"`
		}
		var list []FFRow
		for rows.Next() {
			var row FFRow
			var desc sql.NullString
			rows.Scan(&row.ID, &row.Code, &row.Name, &desc, &row.Enabled)
			row.Description = desc.String
			list = append(list, row)
		}
		if list == nil {
			list = []FFRow{}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"flags": list})

	case "PUT":
		var body struct {
			Code    string `json:"code"`
			Enabled bool   `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		var flagID string
		err := db.QueryRow(`SELECT id FROM feature_flags WHERE code = $1`, body.Code).Scan(&flagID)
		if err != nil {
			jsonErr(w, "Feature flag not found", http.StatusNotFound)
			return
		}
		_, err = db.Exec(
			`INSERT INTO tenant_feature_flags (tenant_id, feature_flag_id, enabled)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (tenant_id, feature_flag_id) DO UPDATE SET enabled = $3`,
			sess.TenantID, flagID, body.Enabled,
		)
		if err != nil {
			jsonErr(w, "DB error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		jsonErr(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ==========================================
// Helpers
// ==========================================

func nullString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
