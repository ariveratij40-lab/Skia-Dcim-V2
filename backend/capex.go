package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// ==========================================
// Tipos CAPEX
// ==========================================

type CapexLineItem struct {
	ID          string  `json:"id"`
	Description string  `json:"description"`
	Category    string  `json:"category"`
	Quantity    float64 `json:"quantity"`
	Unit        string  `json:"unit"`
	UnitCostUSD float64 `json:"unit_cost_usd"`
	TotalUSD    float64 `json:"total_usd"`
	Supplier    string  `json:"supplier"`
	PartNumber  string  `json:"part_number"`
	Status      string  `json:"status"`
	Notes       string  `json:"notes"`
}

type CapexProject struct {
	ID               string          `json:"id"`
	Code             string          `json:"code"`
	Name             string          `json:"name"`
	Description      string          `json:"description"`
	Category         string          `json:"category"`
	Status           string          `json:"status"`
	Priority         string          `json:"priority"`
	Responsible      string          `json:"responsible"`
	ResponsibleEmail string          `json:"responsible_email"`
	Department       string          `json:"department"`
	CostCenter       string          `json:"cost_center"`
	BudgetUSD        float64         `json:"budget_usd"`
	SpentUSD         float64         `json:"spent_usd"`
	Currency         string          `json:"currency"`
	ExchangeRate     float64         `json:"exchange_rate"`
	FiscalYear       int             `json:"fiscal_year"`
	Quarter          string          `json:"quarter"`
	StartDate        string          `json:"start_date"`
	EndDate          string          `json:"end_date"`
	PONumber         string          `json:"po_number"`
	InvoiceNumber    string          `json:"invoice_number"`
	Integrator       string          `json:"integrator"`
	Justification    string          `json:"justification"`
	ROIMonths        int             `json:"roi_months"`
	Observations     string          `json:"observations"`
	LineItems        []CapexLineItem `json:"line_items"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
}

// ==========================================
// GET /api/capex/projects
// POST /api/capex/projects
// ==========================================

func handleCapexProjects(w http.ResponseWriter, r *http.Request) {
	tenantID, _, userID, err := getInfraSession(r)
	if err != nil || tenantID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Extraer ID de la URL si viene /api/capex/projects/{id}
	path := strings.TrimPrefix(r.URL.Path, "/api/capex/projects")
	path = strings.Trim(path, "/")
	projectID := path

	switch r.Method {
	// ── GET ──────────────────────────────────────────────────────
	case http.MethodGet:
		if projectID != "" {
			// Detalle de un proyecto con sus partidas
			handleCapexProjectDetail(w, tenantID, projectID)
			return
		}
		// Listado de proyectos del tenant
		rows, err := db.Query(`
			SELECT id, code, name, COALESCE(description,''),
			       category, status, priority,
			       COALESCE(responsible,''), COALESCE(department,''), COALESCE(cost_center,''),
			       budget_usd, spent_usd, currency, exchange_rate,
			       COALESCE(fiscal_year,0), COALESCE(quarter,''),
			       COALESCE(start_date::text,''), COALESCE(end_date::text,''),
			       COALESCE(po_number,''), COALESCE(invoice_number,''),
			       COALESCE(integrator,''), COALESCE(justification,''),
			       COALESCE(roi_months,0), COALESCE(observations,''),
			       created_at, updated_at
			FROM capex_projects
			WHERE tenant_id = $1
			ORDER BY created_at DESC`, tenantID)
		if err != nil {
			log.Printf("ERROR GET capex_projects: %v", err)
			json.NewEncoder(w).Encode([]CapexProject{})
			return
		}
		defer rows.Close()
		var list []CapexProject
		for rows.Next() {
			var p CapexProject
			if scanErr := rows.Scan(
				&p.ID, &p.Code, &p.Name, &p.Description,
				&p.Category, &p.Status, &p.Priority,
				&p.Responsible, &p.Department, &p.CostCenter,
				&p.BudgetUSD, &p.SpentUSD, &p.Currency, &p.ExchangeRate,
				&p.FiscalYear, &p.Quarter,
				&p.StartDate, &p.EndDate,
				&p.PONumber, &p.InvoiceNumber,
				&p.Integrator, &p.Justification,
				&p.ROIMonths, &p.Observations,
				&p.CreatedAt, &p.UpdatedAt,
			); scanErr != nil {
				log.Printf("SCAN capex_projects: %v", scanErr)
				continue
			}
			p.LineItems = []CapexLineItem{}
			list = append(list, p)
		}
		if list == nil {
			list = []CapexProject{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)

	// ── POST ─────────────────────────────────────────────────────
	case http.MethodPost:
		var req struct {
			Code             string          `json:"code"`
			Name             string          `json:"name"`
			Description      string          `json:"description"`
			Category         string          `json:"category"`
			Status           string          `json:"status"`
			Priority         string          `json:"priority"`
			Responsible      string          `json:"responsible"`
			ResponsibleEmail string          `json:"responsible_email"`
			Department       string          `json:"department"`
			CostCenter       string          `json:"cost_center"`
			BudgetUSD        float64         `json:"budget_usd"`
			Currency         string          `json:"currency"`
			ExchangeRate     float64         `json:"exchange_rate"`
			FiscalYear       int             `json:"fiscal_year"`
			Quarter          string          `json:"quarter"`
			StartDate        string          `json:"start_date"`
			EndDate          string          `json:"end_date"`
			PONumber         string          `json:"po_number"`
			InvoiceNumber    string          `json:"invoice_number"`
			Integrator       string          `json:"integrator"`
			Justification    string          `json:"justification"`
			ROIMonths        int             `json:"roi_months"`
			Observations     string          `json:"observations"`
			LineItems        []CapexLineItem `json:"line_items"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
			return
		}
		// Defaults
		if req.Code == "" {
			req.Code = fmt.Sprintf("CAPEX-%d-%s", time.Now().Year(), generateID()[:6])
		}
		if req.Status == "" {
			req.Status = "planificado"
		}
		if req.Priority == "" {
			req.Priority = "media"
		}
		if req.Category == "" {
			req.Category = "infraestructura"
		}
		if req.Currency == "" {
			req.Currency = "USD"
		}
		if req.ExchangeRate == 0 {
			req.ExchangeRate = 1
		}
		if req.FiscalYear == 0 {
			req.FiscalYear = time.Now().Year()
		}

		// Parsear fechas opcionales
		var startDate, endDate interface{}
		if req.StartDate != "" {
			startDate = req.StartDate
		}
		if req.EndDate != "" {
			endDate = req.EndDate
		}

		newID := generateID()
		_, dbErr := db.Exec(`
			INSERT INTO capex_projects (
				id, tenant_id, code, name, description, category, status, priority,
				responsible, responsible_email, department, cost_center,
				budget_usd, spent_usd, currency, exchange_rate,
				fiscal_year, quarter, start_date, end_date,
				po_number, invoice_number, integrator, justification,
				roi_months, observations, created_by
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,
				$9,$10,$11,$12,
				$13,0,$14,$15,
				$16,$17,$18,$19,
				$20,$21,$22,$23,
				$24,$25,$26
			)`,
			newID, tenantID, req.Code, req.Name, req.Description, req.Category, req.Status, req.Priority,
			req.Responsible, req.ResponsibleEmail, req.Department, req.CostCenter,
			req.BudgetUSD, req.Currency, req.ExchangeRate,
			req.FiscalYear, req.Quarter, startDate, endDate,
			req.PONumber, req.InvoiceNumber, req.Integrator, req.Justification,
			req.ROIMonths, req.Observations, userID,
		)
		if dbErr != nil {
			log.Printf("ERROR POST capex_projects: %v", dbErr)
			http.Error(w, `{"error":"`+dbErr.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		// Insertar partidas si vienen en el body
		if len(req.LineItems) > 0 {
			insertCapexLineItems(newID, tenantID, req.LineItems)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": newID, "code": req.Code})

	// ── PUT ──────────────────────────────────────────────────────
	case http.MethodPut:
		if projectID == "" {
			http.Error(w, `{"error":"project id required"}`, http.StatusBadRequest)
			return
		}
		var req struct {
			Status       string  `json:"status"`
			SpentUSD     float64 `json:"spent_usd"`
			Observations string  `json:"observations"`
			PONumber     string  `json:"po_number"`
			InvoiceNumber string `json:"invoice_number"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
			return
		}
		_, dbErr := db.Exec(`
			UPDATE capex_projects
			SET status=$1, spent_usd=$2, observations=$3,
			    po_number=$4, invoice_number=$5, updated_at=NOW()
			WHERE id=$6 AND tenant_id=$7`,
			req.Status, req.SpentUSD, req.Observations,
			req.PONumber, req.InvoiceNumber, projectID, tenantID,
		)
		if dbErr != nil {
			log.Printf("ERROR PUT capex_projects: %v", dbErr)
			http.Error(w, `{"error":"`+dbErr.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})

	// ── DELETE ───────────────────────────────────────────────────
	case http.MethodDelete:
		if projectID == "" {
			http.Error(w, `{"error":"project id required"}`, http.StatusBadRequest)
			return
		}
		_, dbErr := db.Exec(
			`DELETE FROM capex_projects WHERE id=$1 AND tenant_id=$2`,
			projectID, tenantID,
		)
		if dbErr != nil {
			http.Error(w, `{"error":"`+dbErr.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ==========================================
// Detalle de proyecto con partidas
// ==========================================

func handleCapexProjectDetail(w http.ResponseWriter, tenantID, projectID string) {
	var p CapexProject
	err := db.QueryRow(`
		SELECT id, code, name, COALESCE(description,''),
		       category, status, priority,
		       COALESCE(responsible,''), COALESCE(responsible_email,''),
		       COALESCE(department,''), COALESCE(cost_center,''),
		       budget_usd, spent_usd, currency, exchange_rate,
		       COALESCE(fiscal_year,0), COALESCE(quarter,''),
		       COALESCE(start_date::text,''), COALESCE(end_date::text,''),
		       COALESCE(po_number,''), COALESCE(invoice_number,''),
		       COALESCE(integrator,''), COALESCE(justification,''),
		       COALESCE(roi_months,0), COALESCE(observations,''),
		       created_at, updated_at
		FROM capex_projects
		WHERE id=$1 AND tenant_id=$2`, projectID, tenantID,
	).Scan(
		&p.ID, &p.Code, &p.Name, &p.Description,
		&p.Category, &p.Status, &p.Priority,
		&p.Responsible, &p.ResponsibleEmail,
		&p.Department, &p.CostCenter,
		&p.BudgetUSD, &p.SpentUSD, &p.Currency, &p.ExchangeRate,
		&p.FiscalYear, &p.Quarter,
		&p.StartDate, &p.EndDate,
		&p.PONumber, &p.InvoiceNumber,
		&p.Integrator, &p.Justification,
		&p.ROIMonths, &p.Observations,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		} else {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		}
		return
	}

	// Cargar partidas
	p.LineItems = loadCapexLineItems(projectID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

// ==========================================
// GET /api/capex/stats — resumen por tenant
// ==========================================

func handleCapexStats(w http.ResponseWriter, r *http.Request) {
	tenantID, _, _, err := getInfraSession(r)
	if err != nil || tenantID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	type Stats struct {
		TotalProjects    int     `json:"total_projects"`
		TotalBudgetUSD   float64 `json:"total_budget_usd"`
		TotalSpentUSD    float64 `json:"total_spent_usd"`
		AvailableUSD     float64 `json:"available_usd"`
		ExecutionPct     float64 `json:"execution_pct"`
		Planificado      int     `json:"planificado"`
		EnEjecucion      int     `json:"en_ejecucion"`
		Completado       int     `json:"completado"`
		Cancelado        int     `json:"cancelado"`
		CurrentYear      int     `json:"current_year"`
		BudgetCurrentYear float64 `json:"budget_current_year"`
	}

	var s Stats
	s.CurrentYear = time.Now().Year()

	// Totales globales
	db.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(budget_usd),0), COALESCE(SUM(spent_usd),0)
		FROM capex_projects WHERE tenant_id=$1`, tenantID,
	).Scan(&s.TotalProjects, &s.TotalBudgetUSD, &s.TotalSpentUSD)

	s.AvailableUSD = s.TotalBudgetUSD - s.TotalSpentUSD
	if s.TotalBudgetUSD > 0 {
		s.ExecutionPct = (s.TotalSpentUSD / s.TotalBudgetUSD) * 100
	}

	// Por estado
	rows, _ := db.Query(`
		SELECT status, COUNT(*) FROM capex_projects
		WHERE tenant_id=$1 GROUP BY status`, tenantID)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var st string
			var cnt int
			rows.Scan(&st, &cnt)
			switch st {
			case "planificado":
				s.Planificado = cnt
			case "en_ejecucion":
				s.EnEjecucion = cnt
			case "completado":
				s.Completado = cnt
			case "cancelado":
				s.Cancelado = cnt
			}
		}
	}

	// Presupuesto año actual
	db.QueryRow(`
		SELECT COALESCE(SUM(budget_usd),0) FROM capex_projects
		WHERE tenant_id=$1 AND fiscal_year=$2`, tenantID, s.CurrentYear,
	).Scan(&s.BudgetCurrentYear)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}

// ==========================================
// POST /api/capex/projects/{id}/items
// GET  /api/capex/projects/{id}/items
// ==========================================

func handleCapexItems(w http.ResponseWriter, r *http.Request) {
	tenantID, _, _, err := getInfraSession(r)
	if err != nil || tenantID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Extraer capex_id de la URL: /api/capex/projects/{id}/items
	path := strings.TrimPrefix(r.URL.Path, "/api/capex/projects/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 {
		http.Error(w, `{"error":"invalid path"}`, http.StatusBadRequest)
		return
	}
	capexID := parts[0]

	// Verificar que el proyecto pertenece al tenant
	var ownerID string
	db.QueryRow(`SELECT tenant_id FROM capex_projects WHERE id=$1`, capexID).Scan(&ownerID)
	if ownerID != tenantID {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	switch r.Method {
	case http.MethodGet:
		items := loadCapexLineItems(capexID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(items)

	case http.MethodPost:
		var items []CapexLineItem
		if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
			// Intentar decodificar como objeto único
			var single CapexLineItem
			if err2 := json.NewDecoder(r.Body).Decode(&single); err2 != nil {
				http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
				return
			}
			items = []CapexLineItem{single}
		}
		insertCapexLineItems(capexID, tenantID, items)

		// Recalcular spent_usd del proyecto
		recalcCapexSpent(capexID)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"status": "created"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ==========================================
// Helpers internos
// ==========================================

func loadCapexLineItems(capexID string) []CapexLineItem {
	rows, err := db.Query(`
		SELECT id, COALESCE(description,''), COALESCE(category,''),
		       quantity, COALESCE(unit,''), unit_cost_usd, total_usd,
		       COALESCE(supplier,''), COALESCE(part_number,''),
		       COALESCE(status,'pendiente'), COALESCE(notes,'')
		FROM capex_line_items
		WHERE capex_id=$1
		ORDER BY created_at ASC`, capexID)
	if err != nil {
		return []CapexLineItem{}
	}
	defer rows.Close()
	var items []CapexLineItem
	for rows.Next() {
		var it CapexLineItem
		rows.Scan(&it.ID, &it.Description, &it.Category,
			&it.Quantity, &it.Unit, &it.UnitCostUSD, &it.TotalUSD,
			&it.Supplier, &it.PartNumber, &it.Status, &it.Notes)
		items = append(items, it)
	}
	if items == nil {
		return []CapexLineItem{}
	}
	return items
}

func insertCapexLineItems(capexID, tenantID string, items []CapexLineItem) {
	for _, it := range items {
		if it.Description == "" {
			continue
		}
		if it.Quantity == 0 {
			it.Quantity = 1
		}
		if it.Status == "" {
			it.Status = "pendiente"
		}
		itemID := generateID()
		_, dbErr := db.Exec(`
			INSERT INTO capex_line_items (
				id, capex_id, tenant_id, description, category,
				quantity, unit, unit_cost_usd,
				supplier, part_number, status, notes
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			itemID, capexID, tenantID, it.Description, it.Category,
			it.Quantity, it.Unit, it.UnitCostUSD,
			it.Supplier, it.PartNumber, it.Status, it.Notes,
		)
		if dbErr != nil {
			log.Printf("ERROR insert capex_line_item: %v", dbErr)
		}
	}
}

func recalcCapexSpent(capexID string) {
	db.Exec(`
		UPDATE capex_projects
		SET spent_usd = (
			SELECT COALESCE(SUM(total_usd),0) FROM capex_line_items
			WHERE capex_id = $1 AND status = 'ejecutado'
		), updated_at = NOW()
		WHERE id = $1`, capexID)
}
