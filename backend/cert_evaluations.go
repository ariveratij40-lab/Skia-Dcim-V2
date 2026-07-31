package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// ─── Tipos ────────────────────────────────────────────────────────────────────

type CertEvalRecord struct {
	ID         string          `json:"id"`
	TenantID   string          `json:"tenant_id"`
	SiteID     string          `json:"site_id"`
	SiteName   string          `json:"site_name"`
	Standard   string          `json:"standard"`
	Evaluator  string          `json:"evaluator"`
	EvalDate   string          `json:"eval_date"`
	Answers    json.RawMessage `json:"answers"`
	OverallPct *float64        `json:"overall_pct"`
	Badge      string          `json:"badge"`
	Notes      string          `json:"notes"`
	ReportURL  string          `json:"report_url"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

// ─── GET + POST /api/infra/cert-evaluations ───────────────────────────────────

func handleCertEvaluations(w http.ResponseWriter, r *http.Request) {
	tenantID, _, _, err := getInfraSession(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		// Filtro opcional por site_id
		siteID := r.URL.Query().Get("site_id")
		var rows *sql.Rows
		var qErr error
		if siteID != "" {
			rows, qErr = db.Query(`
				SELECT id, tenant_id, site_id, site_name, standard, evaluator,
				       eval_date::text, answers, overall_pct, badge, notes, report_url,
				       created_at, updated_at
				FROM cert_evaluations
				WHERE tenant_id = $1 AND site_id = $2
				ORDER BY created_at DESC`, tenantID, siteID)
		} else {
			rows, qErr = db.Query(`
				SELECT id, tenant_id, site_id, site_name, standard, evaluator,
				       eval_date::text, answers, overall_pct, badge, notes, report_url,
				       created_at, updated_at
				FROM cert_evaluations
				WHERE tenant_id = $1
				ORDER BY created_at DESC`, tenantID)
		}
		if qErr != nil {
			http.Error(w, qErr.Error(), 500)
			return
		}
		defer rows.Close()
		var list []CertEvalRecord
		for rows.Next() {
			var rec CertEvalRecord
			var overallPct sql.NullFloat64
			if err := rows.Scan(&rec.ID, &rec.TenantID, &rec.SiteID, &rec.SiteName,
				&rec.Standard, &rec.Evaluator, &rec.EvalDate, &rec.Answers,
				&overallPct, &rec.Badge, &rec.Notes, &rec.ReportURL,
				&rec.CreatedAt, &rec.UpdatedAt); err != nil {
				continue
			}
			if overallPct.Valid {
				v := overallPct.Float64
				rec.OverallPct = &v
			}
			list = append(list, rec)
		}
		if list == nil {
			list = []CertEvalRecord{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)

	case http.MethodPost:
		var body struct {
			SiteID     string          `json:"site_id"`
			SiteName   string          `json:"site_name"`
			Standard   string          `json:"standard"`
			Evaluator  string          `json:"evaluator"`
			EvalDate   string          `json:"eval_date"`
			Answers    json.RawMessage `json:"answers"`
			OverallPct *float64        `json:"overall_pct"`
			Badge      string          `json:"badge"`
			Notes      string          `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid body", 400)
			return
		}
		if body.SiteID == "" || body.Standard == "" {
			http.Error(w, "site_id and standard required", 400)
			return
		}
		if body.EvalDate == "" {
			body.EvalDate = time.Now().Format("2006-01-02")
		}
		if body.Badge == "" {
			body.Badge = "Encaminado"
		}
		answersJSON := body.Answers
		if answersJSON == nil {
			answersJSON = json.RawMessage("[]")
		}
		var newID string
		insertErr := db.QueryRow(`
			INSERT INTO cert_evaluations
			  (tenant_id, site_id, site_name, standard, evaluator, eval_date, answers, overall_pct, badge, notes)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			RETURNING id`,
			tenantID, body.SiteID, body.SiteName, body.Standard, body.Evaluator,
			body.EvalDate, answersJSON, body.OverallPct, body.Badge, body.Notes,
		).Scan(&newID)
		if insertErr != nil {
			http.Error(w, insertErr.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"id": newID, "status": "ok"})

	default:
		http.Error(w, "method not allowed", 405)
	}
}

// ─── GET + PUT + DELETE /api/infra/cert-evaluations/{id} ─────────────────────

func handleCertEvaluationItem(w http.ResponseWriter, r *http.Request) {
	tenantID, _, _, err := getInfraSession(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/infra/cert-evaluations/"), "/")
	evalID := parts[0]
	if evalID == "" {
		http.Error(w, "id required", 400)
		return
	}

	// Sub-ruta: /api/infra/cert-evaluations/{id}/report
	if len(parts) >= 2 && parts[1] == "report" {
		handleGenerateCertReport(w, r, tenantID, evalID)
		return
	}

	switch r.Method {
	case http.MethodGet:
		var rec CertEvalRecord
		var overallPct sql.NullFloat64
		qErr := db.QueryRow(`
			SELECT id, tenant_id, site_id, site_name, standard, evaluator,
			       eval_date::text, answers, overall_pct, badge, notes, report_url,
			       created_at, updated_at
			FROM cert_evaluations
			WHERE id = $1 AND tenant_id = $2`, evalID, tenantID).Scan(
			&rec.ID, &rec.TenantID, &rec.SiteID, &rec.SiteName,
			&rec.Standard, &rec.Evaluator, &rec.EvalDate, &rec.Answers,
			&overallPct, &rec.Badge, &rec.Notes, &rec.ReportURL,
			&rec.CreatedAt, &rec.UpdatedAt)
		if qErr == sql.ErrNoRows {
			http.Error(w, "not found", 404)
			return
		}
		if qErr != nil {
			http.Error(w, qErr.Error(), 500)
			return
		}
		if overallPct.Valid {
			v := overallPct.Float64
			rec.OverallPct = &v
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(rec)

	case http.MethodPut:
		var body struct {
			Standard   string          `json:"standard"`
			Evaluator  string          `json:"evaluator"`
			EvalDate   string          `json:"eval_date"`
			Answers    json.RawMessage `json:"answers"`
			OverallPct *float64        `json:"overall_pct"`
			Badge      string          `json:"badge"`
			Notes      string          `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid body", 400)
			return
		}
		answersJSON := body.Answers
		if answersJSON == nil {
			answersJSON = json.RawMessage("[]")
		}
		_, execErr := db.Exec(`
			UPDATE cert_evaluations
			SET standard=$1, evaluator=$2, eval_date=$3, answers=$4,
			    overall_pct=$5, badge=$6, notes=$7, updated_at=NOW()
			WHERE id=$8 AND tenant_id=$9`,
			body.Standard, body.Evaluator, body.EvalDate, answersJSON,
			body.OverallPct, body.Badge, body.Notes, evalID, tenantID)
		if execErr != nil {
			http.Error(w, execErr.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	case http.MethodDelete:
		_, execErr := db.Exec(`
			DELETE FROM cert_evaluations WHERE id=$1 AND tenant_id=$2`, evalID, tenantID)
		if execErr != nil {
			http.Error(w, execErr.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})

	default:
		http.Error(w, "method not allowed", 405)
	}
}

// ─── POST /api/infra/cert-evaluations/{id}/report ─────────────────────────────
// Genera un reporte ejecutivo HTML detallado (guardado como archivo) y devuelve la URL.

// Banco de preguntas embebido en el backend para generar el reporte
type normQuestion struct {
	ID          string
	Category    string
	Question    string
	NormRef     string
	Criticality string
	OperRisk    string
}

var normQuestions = []normQuestion{
	// Telecomunicaciones
	{"tel-1", "Telecomunicaciones", "¿El cableado horizontal cumple con la categoría mínima Cat 6A o superior?", "ANSI/TIA-568 §6.3", "alta", "Limitación de velocidad a 1 Gbps máximo, incompatibilidad con PoE++ y sistemas 10G futuros."},
	{"tel-2", "Telecomunicaciones", "¿Todos los cables están etiquetados en ambos extremos según TIA-606?", "ANSI/TIA-606 §5.2", "media", "Dificultad para diagnóstico de fallas, tiempo de resolución de incidentes aumenta hasta 300%%."},
	{"tel-3", "Telecomunicaciones", "¿Los patch panels están documentados con plano de conexiones actualizado?", "ANSI/TIA-606 §6.1", "media", "Errores en movimientos, adiciones y cambios (MAC). Riesgo de desconexiones accidentales."},
	{"tel-4", "Telecomunicaciones", "¿Se han realizado pruebas de normativa de canal con resultados PASS?", "ANSI/TIA-568 §6.7", "critica", "Sin normativa no existe garantía de rendimiento. Fallas intermitentes, pérdida de paquetes."},
	{"tel-5", "Telecomunicaciones", "¿El cuarto de telecomunicaciones cumple con las dimensiones mínimas de TIA-569?", "ANSI/TIA-569 §4.3", "alta", "Espacio insuficiente para mantenimiento, riesgo de accidentes, imposibilidad de expansión."},
	// Energía
	{"ene-1", "Energía", "¿Existe UPS con autonomía mínima de 15 minutos para equipos críticos?", "ANSI/TIA-942-C §5.3.2", "critica", "Pérdida de datos, corrupción de sistemas, tiempo de inactividad no planificado."},
	{"ene-2", "Energía", "¿El circuito eléctrico dedicado está protegido con breaker diferencial (GFCI)?", "ANSI/TIA-942-C §5.3.1", "alta", "Riesgo de incendio eléctrico, electrocución de personal, daño a equipos."},
	{"ene-3", "Energía", "¿Se cuenta con PDU con monitoreo de consumo por toma o por circuito?", "ANSI/TIA-942-C §5.3.4", "media", "Imposibilidad de detectar sobrecargas hasta que ocurre una falla."},
	{"ene-4", "Energía", "¿El sistema eléctrico cuenta con tierra física certificada (<5 Ω)?", "ANSI/TIA-942-C §5.3.5", "alta", "Interferencias electromagnéticas, daño a equipos por descargas, riesgo de electrocución."},
	{"ene-5", "Energía", "¿Existe plan de mantenimiento preventivo para UPS con registros actualizados?", "ANSI/TIA-942-C §5.3.3", "alta", "Falla del UPS sin previo aviso, pérdida de autonomía, interrupción de servicios críticos."},
	// Ambiente
	{"amb-1", "Ambiente", "¿La temperatura se mantiene entre 18°C y 27°C (ASHRAE A1)?", "ANSI/TIA-942-C §5.4.1", "alta", "Temperatura alta: falla prematura de equipos. Temperatura baja: condensación."},
	{"amb-2", "Ambiente", "¿La humedad relativa se mantiene entre 40%% y 60%% (ASHRAE A1)?", "ANSI/TIA-942-C §5.4.2", "media", "Corrosión de contactos, fallas por ESD, reducción de vida útil de equipos."},
	{"amb-3", "Ambiente", "¿El sistema de climatización tiene redundancia N+1 o superior?", "ANSI/TIA-942-C §5.4.3", "alta", "Falla única de climatización causa sobrecalentamiento y apagado de equipos."},
	{"amb-4", "Ambiente", "¿Existe monitoreo ambiental con alertas automáticas configuradas?", "ANSI/TIA-942-C §5.4.4", "media", "Sin monitoreo, condiciones fuera de rango pueden pasar desapercibidas."},
	{"amb-5", "Ambiente", "¿El cuarto está libre de humedad, goteras, condensación o inundaciones?", "ANSI/TIA-569-D §4.5", "critica", "Cortocircuito, falla catastrófica de equipos, pérdida total de servicios."},
	// Seguridad física
	{"seg-1", "Seguridad física", "¿El acceso está controlado por tarjeta, biométrico o llave de seguridad?", "ANSI/TIA-942-C §5.5.1", "alta", "Acceso no autorizado, sabotaje, robo de equipos, modificaciones no controladas."},
	{"seg-2", "Seguridad física", "¿Existe registro de acceso electrónico o bitácora física actualizada?", "ANSI/TIA-942-C §5.5.2", "media", "Imposibilidad de auditar accesos, dificultad para investigar incidentes."},
	{"seg-3", "Seguridad física", "¿El cuarto cuenta con cámara de vigilancia funcional con grabación ≥ 30 días?", "ANSI/TIA-942-C §5.5.3", "media", "Sin evidencia visual para investigación de incidentes."},
	{"seg-4", "Seguridad física", "¿Los racks tienen cerradura individual o están en área de acceso restringido?", "ANSI/TIA-942-C §5.5.4", "media", "Acceso no controlado a equipos individuales, riesgo de extracción de hardware."},
	{"seg-5", "Seguridad física", "¿Existe política documentada de acceso y procedimiento de visitantes?", "ANSI/TIA-942-C §5.5.5", "baja", "Accesos no controlados, incumplimiento normativo, responsabilidad legal."},
	// Protección contra incendio
	{"inc-1", "Protección contra incendio", "¿Existe detector de humo o incendio certificado UL dentro del cuarto?", "ANSI/TIA-942-C §5.6.1", "critica", "Sin detección temprana, un incendio puede destruir la instalación completa."},
	{"inc-2", "Protección contra incendio", "¿Se cuenta con extintor de CO2 o agente limpio con recarga vigente?", "ANSI/TIA-942-C §5.6.2", "alta", "Sin extintor adecuado, un incendio pequeño puede propagarse y destruir equipos."},
	{"inc-3", "Protección contra incendio", "¿El cuarto está libre de materiales combustibles o almacenamiento no autorizado?", "ANSI/TIA-569-D §4.6", "alta", "Mayor carga de fuego, propagación rápida de incendio, invalidación de seguros."},
	{"inc-4", "Protección contra incendio", "¿Los cables están organizados y sin acumulación que represente riesgo de incendio?", "ANSI/TIA-569-D §6.5", "media", "Cortocircuito por daño mecánico, sobrecalentamiento, dificultad para mantenimiento."},
	{"inc-5", "Protección contra incendio", "¿Existe plan de emergencia y se realizan simulacros documentados?", "ANSI/TIA-942-C §5.6.5", "media", "Respuesta inadecuada ante emergencias, mayor daño, riesgo para el personal."},
	// Documentación
	{"doc-1", "Documentación", "¿Existe plano actualizado de distribución de racks y equipos (As-Built)?", "ANSI/TIA-606-C §7.1", "alta", "Errores en intervenciones, tiempo de resolución de fallas aumentado."},
	{"doc-2", "Documentación", "¿El inventario de activos está completo y actualizado en el sistema DCIM?", "ANSI/TIA-606-C §7.2", "media", "Activos no gestionados, imposibilidad de planificar capacidad."},
	{"doc-3", "Documentación", "¿Existe diagrama de red lógica y física actualizado?", "ANSI/TIA-606-C §7.3", "alta", "Diagnóstico de fallas complejo, cambios sin visibilidad de impacto."},
	{"doc-4", "Documentación", "¿Se cuenta con procedimientos escritos de operación y mantenimiento?", "ANSI/TIA-942-C §5.7.4", "media", "Operaciones inconsistentes, errores humanos, dependencia de conocimiento individual."},
	{"doc-5", "Documentación", "¿Los certificados de pruebas, calibraciones y garantías están archivados?", "ANSI/TIA-606-C §7.5", "baja", "Pérdida de garantías, imposibilidad de reclamar servicios, incumplimiento en auditorías."},
}

var normCategories = []string{
	"Telecomunicaciones", "Energía", "Ambiente",
	"Seguridad física", "Protección contra incendio", "Documentación",
}

var catColors = map[string]string{
	"Telecomunicaciones":           "#3b82f6",
	"Energía":                      "#f59e0b",
	"Ambiente":                     "#14b8a6",
	"Seguridad física":             "#8b5cf6",
	"Protección contra incendio":   "#ef4444",
	"Documentación":                "#64748b",
}

var catIcons = map[string]string{
	"Telecomunicaciones":           "🌐",
	"Energía":                      "⚡",
	"Ambiente":                     "🌡",
	"Seguridad física":             "🛡",
	"Protección contra incendio":   "🔥",
	"Documentación":                "📄",
}

func handleGenerateCertReport(w http.ResponseWriter, r *http.Request, tenantID, evalID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}

	// Leer la evaluación
	var rec CertEvalRecord
	var overallPct sql.NullFloat64
	err := db.QueryRow(`
		SELECT id, tenant_id, site_id, site_name, standard, evaluator,
		       eval_date::text, answers, overall_pct, badge, notes, report_url,
		       created_at, updated_at
		FROM cert_evaluations
		WHERE id = $1 AND tenant_id = $2`, evalID, tenantID).Scan(
		&rec.ID, &rec.TenantID, &rec.SiteID, &rec.SiteName,
		&rec.Standard, &rec.Evaluator, &rec.EvalDate, &rec.Answers,
		&overallPct, &rec.Badge, &rec.Notes, &rec.ReportURL,
		&rec.CreatedAt, &rec.UpdatedAt)
	if err == sql.ErrNoRows {
		http.Error(w, "not found", 404)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	if overallPct.Valid {
		v := overallPct.Float64
		rec.OverallPct = &v
	}

	// Parsear answers
	type evalAnswer struct {
		QuestionID  string `json:"question_id"`
		Answer      string `json:"answer"`
		Observation string `json:"observation"`
		EvidenceURL string `json:"evidence_url"`
		AnsweredAt  string `json:"answered_at"`
	}
	var answers []evalAnswer
	_ = json.Unmarshal(rec.Answers, &answers)
	answerMap := map[string]evalAnswer{}
	for _, a := range answers {
		answerMap[a.QuestionID] = a
	}

	// Calcular estadísticas por categoría
	type catStat struct {
		Name      string
		Compliant int
		Total     int
		Applicable int
		Pct       *float64
	}
	catStats := []catStat{}
	for _, cat := range normCategories {
		var compliant, applicable int
		for _, q := range normQuestions {
			if q.Category != cat {
				continue
			}
			a := answerMap[q.ID]
			if a.Answer == "cumple" {
				compliant++
				applicable++
			} else if a.Answer == "no_cumple" {
				applicable++
			}
		}
		var pct *float64
		if applicable > 0 {
			v := float64(compliant) / float64(applicable) * 100
			pct = &v
		}
		catStats = append(catStats, catStat{cat, compliant, 5, applicable, pct})
	}

	// Colores según badge
	badgeColor := "#f59e0b"
	badgeBg := "#fef3c7"
	if rec.Badge == "Certificable" {
		badgeColor = "#10b981"
		badgeBg = "#d1fae5"
	} else if rec.Badge == "Crítico" {
		badgeColor = "#ef4444"
		badgeBg = "#fee2e2"
	}

	overallStr := "N/A"
	if rec.OverallPct != nil {
		overallStr = fmt.Sprintf("%.1f%%", *rec.OverallPct)
	}
	evaluatorStr := rec.Evaluator
	if evaluatorStr == "" {
		evaluatorStr = "No especificado"
	}

	// ── CSS del reporte ────────────────────────────────────────────────────────
	css := `
	* { box-sizing: border-box; margin: 0; padding: 0; }
	body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; background: #f1f5f9; color: #1e293b; }
	.page { max-width: 960px; margin: 0 auto; background: white; }
	/* HEADER */
	.header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #334155 100%); color: white; padding: 48px 56px 40px; }
	.header-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
	.header-logo { font-size: 26px; font-weight: 900; letter-spacing: -1px; }
	.header-logo span { color: #60a5fa; }
	.header-tagline { font-size: 12px; color: #94a3b8; font-weight: 500; }
	.header-divider { width: 1px; height: 32px; background: #334155; }
	.header-doc-type { font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #60a5fa; margin-bottom: 8px; }
	.header-title { font-size: 28px; font-weight: 800; line-height: 1.2; margin-bottom: 6px; }
	.header-subtitle { font-size: 14px; color: #94a3b8; margin-bottom: 24px; }
	.header-badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 20px; border-radius: 999px; font-size: 14px; font-weight: 700; }
	.header-score { font-size: 56px; font-weight: 900; line-height: 1; margin-top: 24px; }
	.header-score-label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
	.header-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-top: 32px; border-top: 1px solid #334155; padding-top: 24px; }
	.header-meta-item label { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 4px; }
	.header-meta-item span { font-size: 13px; font-weight: 600; color: #e2e8f0; }
	/* SECTION */
	.section { padding: 40px 56px; border-bottom: 1px solid #e2e8f0; }
	.section:last-child { border-bottom: none; }
	.section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
	.section-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
	.section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2.5px; color: #64748b; }
	/* SUMMARY TABLE */
	.summary-table { width: 100%%; border-collapse: collapse; font-size: 13px; }
	.summary-table th { background: #f8fafc; padding: 10px 14px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
	.summary-table td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
	.summary-table tr:last-child td { border-bottom: none; }
	.summary-table tr:hover td { background: #f8fafc; }
	/* CATEGORY CARDS */
	.cat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
	.cat-card { border-radius: 14px; padding: 20px; border: 1px solid #e2e8f0; }
	.cat-icon { font-size: 20px; margin-bottom: 10px; }
	.cat-name { font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 12px; }
	.cat-score { font-size: 28px; font-weight: 900; line-height: 1; margin-bottom: 4px; }
	.cat-detail { font-size: 11px; color: #94a3b8; margin-bottom: 10px; }
	.bar-bg { background: #e2e8f0; border-radius: 999px; height: 6px; overflow: hidden; }
	.bar-fill { height: 6px; border-radius: 999px; }
	/* FINDINGS */
	.finding-card { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
	.finding-card.critica { background: #fef2f2; border-color: #fecaca; }
	.finding-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
	.finding-badge { padding: 2px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; white-space: nowrap; }
	.finding-badge.critica { background: #fee2e2; color: #dc2626; }
	.finding-badge.alta { background: #ffedd5; color: #ea580c; }
	.finding-question { font-size: 13px; font-weight: 600; color: #1e293b; flex: 1; }
	.finding-meta { font-size: 11px; color: #94a3b8; margin-bottom: 6px; }
	.finding-risk { font-size: 12px; color: #92400e; background: #fef3c7; padding: 6px 10px; border-radius: 6px; }
	.finding-risk.critica { color: #991b1b; background: #fee2e2; }
	.finding-obs { font-size: 12px; color: #475569; margin-top: 8px; padding: 8px 10px; background: white; border-radius: 6px; border: 1px solid #e2e8f0; }
	/* CATEGORY DETAIL */
	.cat-detail-section { margin-bottom: 40px; }
	.cat-detail-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-radius: 12px; margin-bottom: 16px; }
	.cat-detail-title { font-size: 15px; font-weight: 800; }
	.cat-detail-score { margin-left: auto; font-size: 20px; font-weight: 900; }
	/* QUESTION ROW */
	.q-row { border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 12px; overflow: hidden; }
	.q-header { display: flex; align-items: flex-start; gap: 12px; padding: 16px 20px; }
	.q-num { width: 24px; height: 24px; border-radius: 50%%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #64748b; flex-shrink: 0; margin-top: 1px; }
	.q-text { font-size: 13px; font-weight: 600; color: #1e293b; flex: 1; line-height: 1.5; }
	.q-answer { padding: 2px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
	.q-answer.cumple { background: #d1fae5; color: #065f46; }
	.q-answer.no_cumple { background: #fee2e2; color: #991b1b; }
	.q-answer.na { background: #f1f5f9; color: #64748b; }
	.q-meta { padding: 0 20px 12px 56px; display: flex; gap: 8px; flex-wrap: wrap; }
	.q-tag { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: #f1f5f9; color: #475569; }
	.q-tag.critica { background: #fee2e2; color: #dc2626; }
	.q-tag.alta { background: #ffedd5; color: #ea580c; }
	.q-tag.media { background: #fef9c3; color: #a16207; }
	.q-tag.baja { background: #dbeafe; color: #1d4ed8; }
	.q-body { padding: 0 20px 16px 56px; }
	.q-obs { font-size: 12px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; }
	.q-obs-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 4px; }
	.q-evidence { margin-top: 10px; }
	.q-evidence-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 8px; }
	.q-evidence img { max-width: 100%%; max-height: 280px; border-radius: 10px; border: 1px solid #e2e8f0; object-fit: contain; display: block; }
	/* RECOMMENDATION */
	.rec-box { background: linear-gradient(135deg, #eff6ff, #f0fdf4); border: 1px solid #bfdbfe; border-radius: 14px; padding: 24px; }
	.rec-box.warning { background: linear-gradient(135deg, #fffbeb, #fff7ed); border-color: #fde68a; }
	.rec-box.danger { background: linear-gradient(135deg, #fef2f2, #fff1f2); border-color: #fecaca; }
	.rec-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #1d4ed8; margin-bottom: 8px; }
	.rec-box.warning .rec-title { color: #92400e; }
	.rec-box.danger .rec-title { color: #991b1b; }
	.rec-text { font-size: 14px; color: #1e293b; line-height: 1.7; }
	/* NOTES */
	.notes-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
	.notes-text { font-size: 13px; color: #475569; line-height: 1.7; white-space: pre-wrap; }
	/* FOOTER */
	.footer { background: #0f172a; padding: 32px 56px; }
	.footer-brand { font-size: 16px; font-weight: 900; color: white; margin-bottom: 4px; }
	.footer-brand span { color: #60a5fa; }
	.footer-text { font-size: 11px; color: #64748b; line-height: 1.6; }
	.footer-disclaimer { font-size: 10px; color: #475569; margin-top: 12px; padding-top: 12px; border-top: 1px solid #1e293b; }
	/* PRINT BUTTON */
	.print-btn { position: fixed; bottom: 28px; right: 28px; background: #3b82f6; color: white; border: none; padding: 14px 28px; border-radius: 14px; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 24px rgba(59,130,246,0.4); display: flex; align-items: center; gap: 8px; z-index: 100; }
	.print-btn:hover { background: #2563eb; }
	@media print {
	  .print-btn { display: none; }
	  body { background: white; }
	  .page { max-width: 100%%; }
	  .q-row { break-inside: avoid; }
	  .cat-detail-section { break-inside: avoid; }
	  .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
	}
`

	// ── Construir sección de tarjetas por categoría ────────────────────────────
	var catCardsHTML strings.Builder
	for _, cs := range catStats {
		color := catColors[cs.Name]
		icon := catIcons[cs.Name]
		pctStr := "N/A"
		barWidth := 0
		if cs.Pct != nil {
			pctStr = fmt.Sprintf("%.0f%%", *cs.Pct)
			barWidth = int(*cs.Pct)
		}
		barColor := color
		if cs.Pct != nil {
			if *cs.Pct >= 85 {
				barColor = "#10b981"
			} else if *cs.Pct >= 50 {
				barColor = "#f59e0b"
			} else {
				barColor = "#ef4444"
			}
		}
		scoreColor := "#64748b"
		if cs.Pct != nil {
			if *cs.Pct >= 85 {
				scoreColor = "#10b981"
			} else if *cs.Pct >= 50 {
				scoreColor = "#f59e0b"
			} else {
				scoreColor = "#ef4444"
			}
		}
		catCardsHTML.WriteString(fmt.Sprintf(`
		<div class="cat-card" style="border-color:%s33; background: %s08;">
		  <div class="cat-icon">%s</div>
		  <div class="cat-name">%s</div>
		  <div class="cat-score" style="color:%s">%s</div>
		  <div class="cat-detail">%d cumple de %d aplicables</div>
		  <div class="bar-bg"><div class="bar-fill" style="width:%d%%; background:%s"></div></div>
		</div>`, color, color, icon, cs.Name, scoreColor, pctStr, cs.Compliant, cs.Applicable, barWidth, barColor))
	}

	// ── Construir tabla resumen ────────────────────────────────────────────────
	var summaryRowsHTML strings.Builder
	totalCompliant, totalApplicable := 0, 0
	for _, cs := range catStats {
		pctStr := "N/A"
		pctColor := "#64748b"
		if cs.Pct != nil {
			pctStr = fmt.Sprintf("%.0f%%", *cs.Pct)
			if *cs.Pct >= 85 {
				pctColor = "#10b981"
			} else if *cs.Pct >= 50 {
				pctColor = "#f59e0b"
			} else {
				pctColor = "#ef4444"
			}
		}
		icon := catIcons[cs.Name]
		totalCompliant += cs.Compliant
		totalApplicable += cs.Applicable
		summaryRowsHTML.WriteString(fmt.Sprintf(`
		<tr>
		  <td><strong>%s %s</strong></td>
		  <td style="text-align:center">%d / %d</td>
		  <td style="text-align:center; font-weight:700; color:%s">%s</td>
		</tr>`, icon, cs.Name, cs.Compliant, cs.Applicable, pctColor, pctStr))
	}

	// ── Construir hallazgos críticos ───────────────────────────────────────────
	var findingsHTML strings.Builder
	findingsCount := 0
	for _, q := range normQuestions {
		a := answerMap[q.ID]
		if a.Answer != "no_cumple" {
			continue
		}
		if q.Criticality != "critica" && q.Criticality != "alta" {
			continue
		}
		findingsCount++
		cardClass := "finding-card"
		badgeClass := "finding-badge alta"
		if q.Criticality == "critica" {
			cardClass = "finding-card critica"
			badgeClass = "finding-badge critica"
		}
		critLabel := "Alta"
		if q.Criticality == "critica" {
			critLabel = "Crítica"
		}
		riskClass := "finding-risk"
		if q.Criticality == "critica" {
			riskClass = "finding-risk critica"
		}
		obsHTML := ""
		if a.Observation != "" {
			obsHTML = fmt.Sprintf(`<div class="finding-obs"><strong>Observación:</strong> %s</div>`, a.Observation)
		}
		findingsHTML.WriteString(fmt.Sprintf(`
		<div class="%s">
		  <div class="finding-header">
		    <span class="%s">%s</span>
		    <span class="finding-question">%s</span>
		  </div>
		  <div class="finding-meta">%s · %s</div>
		  <div class="%s">⚠ Riesgo: %s</div>
		  %s
		</div>`, cardClass, badgeClass, critLabel, q.Question, q.Category, q.NormRef, riskClass, q.OperRisk, obsHTML))
	}
	if findingsCount == 0 {
		findingsHTML.WriteString(`<div style="padding:20px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; color:#166534; font-size:13px; font-weight:600;">✅ No se identificaron hallazgos críticos o de alta severidad en esta evaluación.</div>`)
	}

	// ── Construir detalle por categoría ───────────────────────────────────────
	var detailHTML strings.Builder
	for _, cat := range normCategories {
		color := catColors[cat]
		icon := catIcons[cat]
		// Calcular pct de esta categoría
		var catPctStr string
		for _, cs := range catStats {
			if cs.Name == cat {
				if cs.Pct != nil {
					catPctStr = fmt.Sprintf("%.0f%%", *cs.Pct)
				} else {
					catPctStr = "N/A"
				}
				break
			}
		}
		scoreColor := "#64748b"
		for _, cs := range catStats {
			if cs.Name == cat && cs.Pct != nil {
				if *cs.Pct >= 85 {
					scoreColor = "#10b981"
				} else if *cs.Pct >= 50 {
					scoreColor = "#f59e0b"
				} else {
					scoreColor = "#ef4444"
				}
			}
		}
		detailHTML.WriteString(fmt.Sprintf(`
		<div class="cat-detail-section">
		  <div class="cat-detail-header" style="background:%s10; border:1px solid %s30;">
		    <span style="font-size:20px">%s</span>
		    <span class="cat-detail-title" style="color:%s">%s</span>
		    <span class="cat-detail-score" style="color:%s">%s</span>
		  </div>`, color, color, icon, color, cat, scoreColor, catPctStr))

		qNum := 0
		for _, q := range normQuestions {
			if q.Category != cat {
				continue
			}
			qNum++
			a := answerMap[q.ID]
			answerLabel := "Sin responder"
			answerClass := "q-answer na"
			if a.Answer == "cumple" {
				answerLabel = "✓ Cumple"
				answerClass = "q-answer cumple"
			} else if a.Answer == "no_cumple" {
				answerLabel = "✕ No cumple"
				answerClass = "q-answer no_cumple"
			} else {
				answerLabel = "N/A"
				answerClass = "q-answer na"
			}
			critClass := "q-tag " + q.Criticality
			critLabel := map[string]string{"baja": "Baja", "media": "Media", "alta": "Alta", "critica": "Crítica"}[q.Criticality]

			// Observación
			obsHTML := ""
			if a.Observation != "" {
				obsHTML = fmt.Sprintf(`
				<div class="q-obs">
				  <div class="q-obs-label">Observación del evaluador</div>
				  %s
				</div>`, a.Observation)
			}

			// Evidencia fotográfica
			evidenceHTML := ""
			if a.EvidenceURL != "" {
				evidenceHTML = fmt.Sprintf(`
				<div class="q-evidence">
				  <div class="q-evidence-label">Evidencia fotográfica</div>
				  <img src="%s" alt="Evidencia %s" />
				</div>`, a.EvidenceURL, q.ID)
			}

			hasBody := a.Observation != "" || a.EvidenceURL != ""
			bodyHTML := ""
			if hasBody {
				bodyHTML = fmt.Sprintf(`<div class="q-body">%s%s</div>`, obsHTML, evidenceHTML)
			}

			detailHTML.WriteString(fmt.Sprintf(`
			<div class="q-row">
			  <div class="q-header">
			    <span class="q-num">%d</span>
			    <span class="q-text">%s</span>
			    <span class="%s">%s</span>
			  </div>
			  <div class="q-meta">
			    <span class="q-tag">%s</span>
			    <span class="%s">%s</span>
			  </div>
			  %s
			</div>`, qNum, q.Question, answerClass, answerLabel, q.NormRef, critClass, critLabel, bodyHTML))
		}
		detailHTML.WriteString(`</div>`)
	}

	// ── Recomendación ─────────────────────────────────────────────────────────
	recClass := "rec-box"
	recTitle := "Recomendación"
	recText := "La instalación está en condiciones avanzadas de preparación. Se recomienda proceder con auditoría formal por organismo certificador acreditado."
	if rec.Badge == "Encaminado" {
		recClass = "rec-box warning"
		recText = "Se identificaron áreas de mejora. Atienda los hallazgos críticos antes de solicitar normativa formal."
	} else if rec.Badge == "Crítico" {
		recClass = "rec-box danger"
		recText = "La instalación presenta deficiencias críticas. Se requiere plan de acción correctiva urgente antes de considerar cualquier proceso de normativa."
	}

	// ── Notas del evaluador ────────────────────────────────────────────────────
	notesHTML := ""
	if rec.Notes != "" {
		notesHTML = fmt.Sprintf(`
		<div class="section">
		  <div class="section-header">
		    <div class="section-icon" style="background:#f1f5f9">📝</div>
		    <div class="section-title">Notas del evaluador</div>
		  </div>
		  <div class="notes-box"><p class="notes-text">%s</p></div>
		</div>`, rec.Notes)
	}

	// ── Construir HTML final ───────────────────────────────────────────────────
	reportHTML := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reporte Ejecutivo — %s</title>
<style>%s</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-brand">
      <div>
        <div class="header-logo">SK<span>IA</span> DCIM</div>
        <div class="header-tagline">Sistema de Gestión de Infraestructura de Cableado</div>
      </div>
      <div class="header-divider"></div>
      <div style="font-size:11px; color:#64748b">Documento confidencial · Uso interno</div>
    </div>
    <div class="header-doc-type">Reporte Ejecutivo de Normativa</div>
    <div class="header-title">%s</div>
    <div class="header-subtitle">Evaluación de preparación para certificación · %s</div>
    <div style="display:flex; align-items:center; gap:24px; margin-top:16px">
      <div>
        <div class="header-score" style="color:%s">%s</div>
        <div class="header-score-label">Resultado global</div>
      </div>
      <div class="header-badge" style="background:%s; color:%s; border:2px solid %s">%s</div>
    </div>
    <div class="header-meta">
      <div class="header-meta-item"><label>Estándar</label><span>%s</span></div>
      <div class="header-meta-item"><label>Evaluador</label><span>%s</span></div>
      <div class="header-meta-item"><label>Fecha</label><span>%s</span></div>
      <div class="header-meta-item"><label>Generado</label><span>%s</span></div>
    </div>
  </div>

  <!-- RESUMEN POR CATEGORÍA -->
  <div class="section">
    <div class="section-header">
      <div class="section-icon" style="background:#eff6ff">📊</div>
      <div class="section-title">Resumen por categoría</div>
    </div>
    <div class="cat-grid">%s</div>
    <table class="summary-table">
      <thead><tr><th>Categoría</th><th style="text-align:center">Cumple / Aplicables</th><th style="text-align:center">Resultado</th></tr></thead>
      <tbody>%s
        <tr style="background:#f8fafc; font-weight:700">
          <td>Total evaluación</td>
          <td style="text-align:center">%d / %d</td>
          <td style="text-align:center; font-size:15px; color:%s">%s</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- HALLAZGOS CRÍTICOS -->
  <div class="section">
    <div class="section-header">
      <div class="section-icon" style="background:#fef2f2">⚠️</div>
      <div class="section-title">Hallazgos críticos y de alta severidad</div>
    </div>
    %s
  </div>

  <!-- RECOMENDACIÓN -->
  <div class="section">
    <div class="section-header">
      <div class="section-icon" style="background:#f0fdf4">💡</div>
      <div class="section-title">Recomendación</div>
    </div>
    <div class="%s">
      <div class="rec-title">%s</div>
      <p class="rec-text">%s</p>
    </div>
  </div>

  <!-- NOTAS -->
  %s

  <!-- DETALLE COMPLETO POR CATEGORÍA -->
  <div class="section">
    <div class="section-header">
      <div class="section-icon" style="background:#f8fafc">🔍</div>
      <div class="section-title">Detalle completo de la evaluación</div>
    </div>
    %s
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-brand">SK<span>IA</span> DCIM</div>
    <div class="footer-text">Sistema de Gestión de Infraestructura de Cableado · v2</div>
    <div class="footer-disclaimer">Este reporte es una evaluación interna de preparación para normativa generada por SKIA DCIM. No constituye una certificación oficial ni reemplaza la auditoría por un organismo certificador acreditado. La información contenida es confidencial y de uso exclusivo del cliente.</div>
  </div>

</div>
<button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
</body>
</html>`,
		rec.SiteName,
		css,
		rec.SiteName,
		rec.EvalDate,
		badgeColor, overallStr,
		badgeBg, badgeColor, badgeColor,
		rec.Badge,
		rec.Standard,
		evaluatorStr,
		rec.EvalDate,
		time.Now().Format("02/01/2006 15:04"),
		catCardsHTML.String(),
		summaryRowsHTML.String(),
		totalCompliant, totalApplicable,
		badgeColor, overallStr,
		findingsHTML.String(),
		recClass, recTitle, recText,
		notesHTML,
		detailHTML.String(),
	)

	// Guardar el HTML como archivo en /app/uploads/
	uploadsDir := os.Getenv("UPLOADS_DIR")
	if uploadsDir == "" {
		uploadsDir = "/app/uploads"
	}
	filename := fmt.Sprintf("report_%s_%s.html", evalID[:8], time.Now().Format("20060102_150405"))
	filePath := uploadsDir + "/" + filename
	if err := os.WriteFile(filePath, []byte(reportHTML), 0644); err != nil {
		http.Error(w, "error saving report: "+err.Error(), 500)
		return
	}

	reportURL := "/uploads/" + filename

	// Actualizar la evaluación con la URL del reporte
	_, execErr := db.Exec(`
		UPDATE cert_evaluations SET report_url=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,
		reportURL, evalID, tenantID)
	if execErr != nil {
		http.Error(w, execErr.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":     "ok",
		"report_url": reportURL,
	})
}
