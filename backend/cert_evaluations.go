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
// Genera un reporte ejecutivo HTML (guardado como archivo) y devuelve la URL.

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

	// Generar HTML del reporte ejecutivo
	badgeColor := "#f59e0b"
	if rec.Badge == "Certificable" {
		badgeColor = "#10b981"
	} else if rec.Badge == "Crítico" {
		badgeColor = "#ef4444"
	}

	overallStr := "N/A"
	if rec.OverallPct != nil {
		overallStr = fmt.Sprintf("%.1f%%", *rec.OverallPct)
	}

	evaluatorStr := rec.Evaluator
	if evaluatorStr == "" {
		evaluatorStr = "No especificado"
	}

	notesSection := ""
	if rec.Notes != "" {
		notesSection = fmt.Sprintf(`<div class="section"><div class="section-title">Notas del Evaluador</div><p style="font-size:14px;color:#475569;line-height:1.6">%s</p></div>`, rec.Notes)
	}

	reportHTML := fmt.Sprintf(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reporte Ejecutivo — %s</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #1e293b; }
  .page { max-width: 900px; margin: 0 auto; background: white; min-height: 100vh; }
  .header { background: linear-gradient(135deg, #1e293b 0%%, #334155 100%%); color: white; padding: 40px 48px; }
  .header-logo { font-size: 28px; font-weight: 900; letter-spacing: -1px; margin-bottom: 8px; }
  .header-logo span { color: #60a5fa; }
  .header-title { font-size: 14px; color: #94a3b8; margin-bottom: 24px; }
  .header-main { font-size: 22px; font-weight: 700; }
  .header-sub { font-size: 13px; color: #cbd5e1; margin-top: 4px; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 999px; font-size: 13px; font-weight: 700; margin-top: 16px; background: %s22; color: %s; border: 1.5px solid %s55; }
  .section { padding: 32px 48px; border-bottom: 1px solid #e2e8f0; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #64748b; margin-bottom: 16px; }
  .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .meta-item label { font-size: 11px; color: #94a3b8; font-weight: 600; display: block; margin-bottom: 4px; }
  .meta-item span { font-size: 14px; font-weight: 600; color: #1e293b; }
  .score-big { font-size: 48px; font-weight: 900; color: %s; line-height: 1; display: block; }
  .cat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .cat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
  .cat-name { font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 8px; }
  .cat-bar-bg { background: #e2e8f0; border-radius: 999px; height: 8px; }
  .cat-bar { height: 8px; border-radius: 999px; background: #3b82f6; }
  .cat-pct { font-size: 13px; color: #64748b; margin-top: 6px; }
  .footer { padding: 24px 48px; background: #f8fafc; }
  .footer-text { font-size: 11px; color: #94a3b8; }
  .print-btn { position: fixed; bottom: 24px; right: 24px; background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(59,130,246,0.4); }
  @media print { .print-btn { display: none; } body { background: white; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-logo">SK<span>IA</span> DCIM</div>
    <div class="header-title">Sistema de Gestión de Infraestructura de Cableado</div>
    <div class="header-main">Reporte Ejecutivo de Normativa</div>
    <div class="header-sub">%s · %s</div>
    <div class="badge">%s</div>
  </div>

  <div class="section">
    <div class="section-title">Información de la Evaluación</div>
    <div class="meta-grid">
      <div class="meta-item"><label>Sitio evaluado</label><span>%s</span></div>
      <div class="meta-item"><label>Estándar de referencia</label><span>%s</span></div>
      <div class="meta-item"><label>Fecha de evaluación</label><span>%s</span></div>
      <div class="meta-item"><label>Responsable</label><span>%s</span></div>
      <div class="meta-item"><label>Resultado global</label><span class="score-big">%s</span></div>
      <div class="meta-item"><label>Clasificación</label><span>%s</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Resultados por Categoría</div>
    <div class="cat-grid">
      <div class="cat-card"><div class="cat-name">Telecomunicaciones</div><div class="cat-bar-bg"><div class="cat-bar" style="width:0%%"></div></div><div class="cat-pct">Ver evaluación completa</div></div>
      <div class="cat-card"><div class="cat-name">Energía</div><div class="cat-bar-bg"><div class="cat-bar" style="width:0%%"></div></div><div class="cat-pct">Ver evaluación completa</div></div>
      <div class="cat-card"><div class="cat-name">Ambiente</div><div class="cat-bar-bg"><div class="cat-bar" style="width:0%%"></div></div><div class="cat-pct">Ver evaluación completa</div></div>
      <div class="cat-card"><div class="cat-name">Seguridad física</div><div class="cat-bar-bg"><div class="cat-bar" style="width:0%%"></div></div><div class="cat-pct">Ver evaluación completa</div></div>
      <div class="cat-card"><div class="cat-name">Protección contra incendio</div><div class="cat-bar-bg"><div class="cat-bar" style="width:0%%"></div></div><div class="cat-pct">Ver evaluación completa</div></div>
      <div class="cat-card"><div class="cat-name">Documentación</div><div class="cat-bar-bg"><div class="cat-bar" style="width:0%%"></div></div><div class="cat-pct">Ver evaluación completa</div></div>
    </div>
  </div>

  %s

  <div class="footer">
    <div class="footer-text">Reporte generado el %s · SKIA DCIM v2 · Evaluación interna de preparación para normativa. No equivale a certificación oficial.</div>
  </div>
</div>
<button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
</body>
</html>`,
		rec.SiteName,
		badgeColor, badgeColor, badgeColor,
		badgeColor,
		rec.SiteName, rec.EvalDate,
		rec.Badge,
		rec.SiteName,
		rec.Standard,
		rec.EvalDate,
		evaluatorStr,
		overallStr,
		rec.Badge,
		notesSection,
		time.Now().Format("02/01/2006 15:04"),
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
