package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// ==========================================
// /api/dashboard/stats  (GET)
// Devuelve estadísticas reales del tenant autenticado.
// Si el tenant no tiene datos o la sesión no tiene tenant_id,
// devuelve isEmpty:true con stats en cero (nunca 401).
// ==========================================

type DashboardStats struct {
	ActivosTotal    int `json:"activosTotal"`
	ActivosMesAntes int `json:"activosMesAntes"`
	TicketsAbiertos int `json:"ticketsAbiertos"`
	TicketsCriticos int `json:"ticketsCriticos"`
	MdfIdfTotal     int `json:"mdfIdfTotal"`
	MdfIdfAtencion  int `json:"mdfIdfAtencion"`
	RacksTotal      int `json:"racksTotal"`
	SwitchesTotal   int `json:"switchesTotal"`
	UpsTotal        int `json:"upsTotal"`
	UsuariosActivos int `json:"usuariosActivos"`
	UsuariosOnline  int `json:"usuariosOnline"`
	SLACumplimiento int `json:"slaCumplimiento"` // porcentaje 0-100
}

type DashboardTicket struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Priority string `json:"priority"`
	Status   string `json:"status"`
	Time     string `json:"time"`
}

type DashboardAsset struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Status   string `json:"status"`
	Location string `json:"location"`
}

type DashboardResponse struct {
	Stats          DashboardStats    `json:"stats"`
	RecentTickets  []DashboardTicket `json:"recentTickets"`
	CriticalAssets []DashboardAsset  `json:"criticalAssets"`
	IsEmpty        bool              `json:"isEmpty"`   // true si el tenant no tiene datos
	UserName       string            `json:"userName"`  // nombre del usuario para el saludo
}

func handleDashboardStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		jsonErr(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Obtener sesión directamente sin usar getSession (que rechaza tenant_id NULL)
	// El dashboard es tolerante: si no hay tenant, muestra onboarding en lugar de error
	token := extractSessionToken(r)
	if token == "" {
		jsonErr(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID, userName string
	var tenantIDNull sql.NullString
	err := db.QueryRow(
		`SELECT u.id, u.name, s.tenant_id
		 FROM sessions s JOIN users u ON s.user_id = u.id
		 WHERE s.token = $1 AND s.expires_at > $2`,
		token, time.Now().Unix(),
	).Scan(&userID, &userName, &tenantIDNull)
	if err != nil {
		jsonErr(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Si el tenant no está asignado aún, devolver estado vacío con nombre de usuario
	// para que el dashboard muestre el asistente de onboarding
	if !tenantIDNull.Valid || tenantIDNull.String == "" {
		json.NewEncoder(w).Encode(DashboardResponse{
			Stats:          DashboardStats{SLACumplimiento: 100},
			RecentTickets:  []DashboardTicket{},
			CriticalAssets: []DashboardAsset{},
			IsEmpty:        true,
			UserName:       userName,
		})
		return
	}

	tenantID := tenantIDNull.String
	resp := DashboardResponse{
		RecentTickets:  []DashboardTicket{},
		CriticalAssets: []DashboardAsset{},
		UserName:       userName,
	}

	// ---- Activos totales del tenant ----
	db.QueryRow(
		`SELECT COUNT(*) FROM assets WHERE tenant_id = $1 AND status != 'decommissioned'`,
		tenantID,
	).Scan(&resp.Stats.ActivosTotal)

	// Activos creados el mes anterior (para calcular delta)
	lastMonth := time.Now().AddDate(0, -1, 0)
	db.QueryRow(
		`SELECT COUNT(*) FROM assets WHERE tenant_id = $1 AND created_at >= $2`,
		tenantID, lastMonth,
	).Scan(&resp.Stats.ActivosMesAntes)

	// ---- Tickets abiertos ----
	// La tabla tickets puede no existir si no se ha creado aún
	err = db.QueryRow(
		`SELECT COUNT(*) FROM tickets WHERE tenant_id = $1 AND status NOT IN ('cerrado','resuelto')`,
		tenantID,
	).Scan(&resp.Stats.TicketsAbiertos)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("WARN: tabla tickets no disponible: %v", err)
	}

	db.QueryRow(
		`SELECT COUNT(*) FROM tickets WHERE tenant_id = $1 AND priority = 'critica' AND status NOT IN ('cerrado','resuelto')`,
		tenantID,
	).Scan(&resp.Stats.TicketsCriticos)

	// ---- MDF/IDF ----
	db.QueryRow(
		`SELECT COUNT(*) FROM mdf_idf WHERE tenant_id = $1`,
		tenantID,
	).Scan(&resp.Stats.MdfIdfTotal)

	db.QueryRow(
		`SELECT COUNT(*) FROM mdf_idf m
		 JOIN assets a ON a.id = m.asset_id
		 WHERE m.tenant_id = $1 AND a.status = 'maintenance'`,
		tenantID,
	).Scan(&resp.Stats.MdfIdfAtencion)

	// ---- Racks ----
	db.QueryRow(
		`SELECT COUNT(*) FROM racks WHERE tenant_id = $1`,
		tenantID,
	).Scan(&resp.Stats.RacksTotal)

	// ---- Switches ----
	db.QueryRow(
		`SELECT COUNT(*) FROM switches WHERE tenant_id = $1`,
		tenantID,
	).Scan(&resp.Stats.SwitchesTotal)

	// ---- UPS ----
	db.QueryRow(
		`SELECT COUNT(*) FROM ups WHERE tenant_id = $1`,
		tenantID,
	).Scan(&resp.Stats.UpsTotal)

	// ---- Usuarios activos del tenant ----
	db.QueryRow(
		`SELECT COUNT(DISTINCT u.id) FROM users u
		 JOIN user_tenants ut ON ut.user_id = u.id
		 WHERE ut.tenant_id = $1 AND u.status = 'active'`,
		tenantID,
	).Scan(&resp.Stats.UsuariosActivos)

	// Usuarios con sesión activa en las últimas 24h
	db.QueryRow(
		`SELECT COUNT(DISTINCT s.user_id) FROM sessions s
		 JOIN user_tenants ut ON ut.user_id = s.user_id
		 WHERE ut.tenant_id = $1
		   AND s.tenant_id = $2
		   AND s.expires_at > $3
		   AND s.created_at > $4`,
		tenantID, tenantID, time.Now().Unix(), time.Now().Add(-24*time.Hour),
	).Scan(&resp.Stats.UsuariosOnline)

	// ---- SLA (calculado como % de tickets resueltos en tiempo) ----
	// Si no hay tickets, SLA = 100%
	var totalCerrados, totalEnTiempo int
	db.QueryRow(
		`SELECT COUNT(*) FROM tickets WHERE tenant_id = $1 AND status IN ('cerrado','resuelto')`,
		tenantID,
	).Scan(&totalCerrados)
	db.QueryRow(
		`SELECT COUNT(*) FROM tickets WHERE tenant_id = $1 AND status IN ('cerrado','resuelto') AND sla_met = true`,
		tenantID,
	).Scan(&totalEnTiempo)

	if totalCerrados > 0 {
		resp.Stats.SLACumplimiento = (totalEnTiempo * 100) / totalCerrados
	} else {
		resp.Stats.SLACumplimiento = 100 // sin tickets = 100%
	}

	// ---- Tickets recientes (últimos 4) ----
	ticketRows, err := db.Query(
		`SELECT id, title, priority, status, created_at
		 FROM tickets
		 WHERE tenant_id = $1
		 ORDER BY created_at DESC
		 LIMIT 4`,
		tenantID,
	)
	if err == nil {
		defer ticketRows.Close()
		for ticketRows.Next() {
			var t DashboardTicket
			var createdAt time.Time
			ticketRows.Scan(&t.ID, &t.Title, &t.Priority, &t.Status, &createdAt)
			t.Time = timeAgo(createdAt)
			resp.RecentTickets = append(resp.RecentTickets, t)
		}
	}

	// ---- Activos críticos (status = maintenance o con alerta) ----
	assetRows, err := db.Query(
		`SELECT a.name, at.name as type_name, a.status,
		        COALESCE(l.name, 'Sin ubicación') as location
		 FROM assets a
		 LEFT JOIN asset_types at ON at.id = a.asset_type_id
		 LEFT JOIN locations l ON l.id = a.location_id
		 WHERE a.tenant_id = $1
		   AND a.status IN ('maintenance', 'inactive')
		 ORDER BY a.updated_at DESC
		 LIMIT 4`,
		tenantID,
	)
	if err == nil {
		defer assetRows.Close()
		for assetRows.Next() {
			var a DashboardAsset
			var typeName sql.NullString
			assetRows.Scan(&a.Name, &typeName, &a.Status, &a.Location)
			a.Type = typeName.String
			if a.Status == "maintenance" {
				a.Status = "Atención"
			} else if a.Status == "inactive" {
				a.Status = "Inactivo"
			}
			resp.CriticalAssets = append(resp.CriticalAssets, a)
		}
	}

	// Determinar si el tenant está vacío (sin activos ni tickets)
	resp.IsEmpty = resp.Stats.ActivosTotal == 0 && resp.Stats.TicketsAbiertos == 0

	json.NewEncoder(w).Encode(resp)
}

// timeAgo convierte un tiempo a string relativo ("hace 2h", "hace 3d")
func timeAgo(t time.Time) string {
	diff := time.Since(t)
	if diff < time.Minute {
		return "ahora"
	}
	if diff < time.Hour {
		return fmt.Sprintf("hace %dm", int(diff.Minutes()))
	}
	if diff < 24*time.Hour {
		return fmt.Sprintf("hace %dh", int(diff.Hours()))
	}
	return fmt.Sprintf("hace %dd", int(diff.Hours()/24))
}
