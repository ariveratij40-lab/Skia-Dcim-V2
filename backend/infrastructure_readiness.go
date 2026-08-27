package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

type InfrastructureReadinessAction struct {
	Kind   string `json:"kind"`
	Target string `json:"target"`
}

type InfrastructureReadinessStep struct {
	Key              string                         `json:"key"`
	Status           string                         `json:"status"`
	Count            int                            `json:"count"`
	Required         bool                           `json:"required"`
	Message          string                         `json:"message"`
	Action           *InfrastructureReadinessAction `json:"action"`
	UnresolvedCount  int                            `json:"unresolved_count,omitempty"`
	Example          string                         `json:"example,omitempty"`
	ConfiguredTypes  []string                       `json:"configured_asset_types,omitempty"`
	UnavailableTypes []string                       `json:"unavailable_asset_types,omitempty"`
}

type InfrastructureReadinessResponse struct {
	Branch struct {
		ID   string `json:"id"`
		Code string `json:"code"`
		Name string `json:"name"`
	} `json:"branch"`
	Ready    bool `json:"ready"`
	Progress struct {
		RequiredComplete int `json:"required_complete"`
		RequiredTotal    int `json:"required_total"`
		Percent          int `json:"percent"`
	} `json:"progress"`
	Steps []InfrastructureReadinessStep `json:"steps"`
}

type infrastructureReadinessCounts struct {
	Sites, InternalAreas, MdfIdf, ValidRacks, TotalRacks int
}

type readinessNamingRule struct {
	AssetTypeCode, Prefix, Separator, CustomSegment1, CustomSegment2  string
	SeqDigits                                                         int
	IncludeBranch, IncludePlacement, IncludeSite, IncludeInternalArea bool
}

func readinessAction(target string) *InfrastructureReadinessAction {
	return &InfrastructureReadinessAction{Kind: "open", Target: target}
}

func buildNomenclatureReadiness(branchCode string, rules []readinessNamingRule) InfrastructureReadinessStep {
	step := InfrastructureReadinessStep{Key: "nomenclature", Status: "unavailable", Required: false,
		Message: "Falta una regla activa para MDF o IDF."}
	configured := map[string]readinessNamingRule{}
	for _, rule := range rules {
		configured[rule.AssetTypeCode] = rule
		step.ConfiguredTypes = append(step.ConfiguredTypes, rule.AssetTypeCode)
	}
	for _, assetType := range []string{"MDF", "IDF"} {
		if _, ok := configured[assetType]; !ok {
			step.UnavailableTypes = append(step.UnavailableTypes, assetType)
		}
	}
	step.Count = len(step.ConfiguredTypes)
	if len(step.UnavailableTypes) == 0 {
		step.Status = "configured"
		step.Message = "SKIA encontró reglas activas para MDF e IDF."
	}
	rule, ok := configured["MDF"]
	if !ok {
		rule, ok = configured["IDF"]
	}
	if ok {
		parts := []string{rule.Prefix}
		if rule.IncludeBranch {
			parts = append(parts, branchCode)
		}
		if rule.IncludeSite {
			parts = append(parts, "[SITIO]")
		}
		if rule.IncludeInternalArea {
			parts = append(parts, "[AREA]")
		}
		if rule.IncludePlacement {
			parts = append(parts, "[UBICACIÓN]")
		}
		if rule.CustomSegment1 != "" {
			parts = append(parts, strings.ToUpper(strings.ReplaceAll(rule.CustomSegment1, " ", "")))
		}
		if rule.CustomSegment2 != "" {
			parts = append(parts, strings.ToUpper(strings.ReplaceAll(rule.CustomSegment2, " ", "")))
		}
		parts = append(parts, strings.Repeat("#", rule.SeqDigits))
		step.Example = strings.Join(parts, rule.Separator)
	}
	return step
}

func buildInfrastructureReadiness(branchID, branchCode, branchName string, counts infrastructureReadinessCounts, nomenclature InfrastructureReadinessStep) InfrastructureReadinessResponse {
	response := InfrastructureReadinessResponse{}
	response.Branch.ID, response.Branch.Code, response.Branch.Name = branchID, branchCode, branchName
	response.Progress.RequiredTotal = 4

	branch := InfrastructureReadinessStep{Key: "branch", Status: "complete", Count: 1, Required: true, Message: "Sucursal activa y autorizada."}
	site := InfrastructureReadinessStep{Key: "site", Count: counts.Sites, Required: true, Action: readinessAction("site_create")}
	area := InfrastructureReadinessStep{Key: "internal_area", Count: counts.InternalAreas, Required: true}
	mdf := InfrastructureReadinessStep{Key: "mdf_idf", Count: counts.MdfIdf, Required: true}
	rack := InfrastructureReadinessStep{Key: "rack", Count: counts.ValidRacks, Required: false, UnresolvedCount: counts.TotalRacks - counts.ValidRacks}

	if counts.Sites > 0 {
		site.Status, site.Message = "complete", "Existe al menos un Sitio activo en la sucursal."
	} else {
		site.Status, site.Message = "pending", "Cree un Sitio antes de definir áreas internas."
	}
	if counts.Sites == 0 {
		area.Status, area.Message = "blocked", "Requiere primero un Sitio activo."
	} else if counts.InternalAreas > 0 {
		area.Status, area.Message = "complete", "Existe al menos un Área interna válida."
		area.Action = readinessAction("internal_area_create")
	} else {
		area.Status, area.Message = "pending", "Ya puede crear un Área interna dentro del Sitio."
		area.Action = readinessAction("internal_area_create")
	}
	if counts.Sites == 0 || counts.InternalAreas == 0 {
		mdf.Status, mdf.Message = "blocked", "Requiere un Sitio y un Área interna válidos."
	} else if counts.MdfIdf > 0 {
		mdf.Status, mdf.Message = "complete", "Existe al menos un MDF o IDF válido."
		mdf.Action = readinessAction("mdf_idf_create")
	} else {
		mdf.Status, mdf.Message = "pending", "Ya puede crear el primer MDF o IDF."
		mdf.Action = readinessAction("mdf_idf_create")
	}
	if counts.MdfIdf == 0 {
		rack.Status, rack.Message = "blocked", "Requiere primero un MDF o IDF válido."
	} else if counts.ValidRacks > 0 {
		rack.Status, rack.Message = "complete", "Existe al menos un Rack con relación MDF/IDF consistente."
		rack.Action = readinessAction("rack_create")
	} else {
		rack.Status, rack.Message = "available", "Ya puede crear el primer Rack."
		rack.Action = readinessAction("rack_create")
	}
	if rack.UnresolvedCount < 0 {
		rack.UnresolvedCount = 0
	}

	response.Steps = []InfrastructureReadinessStep{branch, site, area, nomenclature, mdf, rack}
	for _, step := range response.Steps {
		if step.Required && step.Status == "complete" {
			response.Progress.RequiredComplete++
		}
	}
	response.Progress.Percent = response.Progress.RequiredComplete * 100 / response.Progress.RequiredTotal
	response.Ready = response.Progress.RequiredComplete == response.Progress.RequiredTotal
	return response
}

func handleInfrastructureReadiness(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	tdb, dbOK := TenantDBFromContext(r.Context())
	_, tenantID, branchID, identityOK := TenantIdentityFromContext(r.Context())
	if !dbOK || !identityOK || tenantID == "" || branchID == "" {
		http.Error(w, `{"error":"missing tenant context"}`, http.StatusInternalServerError)
		return
	}

	var branchCode, branchName string
	if err := tdb.QueryRowContext(r.Context(), `
		SELECT code,name FROM branches
		WHERE id=$1 AND tenant_id=$2 AND status='active'`, branchID, tenantID).Scan(&branchCode, &branchName); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error":"active branch not found"}`, http.StatusForbidden)
		} else {
			log.Printf("infrastructure readiness: resolve branch: %v", err)
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		}
		return
	}

	var counts infrastructureReadinessCounts
	err := tdb.QueryRowContext(r.Context(), `
		WITH valid_sites AS (
			SELECT b.id FROM buildings b
			WHERE b.tenant_id=$1 AND b.branch_id=$2 AND b.status='active'
		), valid_areas AS (
			SELECT ia.id FROM internal_areas ia
			JOIN valid_sites vs ON vs.id=ia.site_id
			WHERE ia.tenant_id=$1 AND ia.branch_id=$2 AND ia.status='active'
		), valid_distribution AS (
			SELECT a.id AS asset_id,m.id AS satellite_id,l.id AS placement_id
			FROM assets a
			JOIN asset_types at ON at.id=a.asset_type_id AND at.code IN ('MDF','IDF')
			JOIN mdf_idf m ON m.asset_id=a.id AND m.tenant_id=a.tenant_id AND m.branch_id=a.branch_id AND m.type=at.code
			JOIN locations l ON l.id=a.location_id AND l.asset_id=a.id AND l.tenant_id=a.tenant_id AND l.branch_id=a.branch_id
			JOIN valid_areas va ON va.id=l.internal_area_id
			WHERE a.tenant_id=$1 AND a.branch_id=$2 AND a.status='active'
			  AND a.inventory_status IS DISTINCT FROM 'retired'
			  AND l.status='active' AND l.placement_type=at.code
		), valid_racks AS (
			SELECT DISTINCT rk.id
			FROM racks rk
			JOIN assets ra ON ra.id=rk.asset_id AND ra.tenant_id=rk.tenant_id AND ra.branch_id=rk.branch_id
			JOIN valid_distribution vd ON vd.satellite_id=rk.mdf_idf_id AND vd.placement_id=ra.location_id
			WHERE rk.tenant_id=$1 AND rk.branch_id=$2 AND ra.status='active'
			  AND ra.inventory_status IS DISTINCT FROM 'retired'
		), all_racks AS (
			SELECT rk.id FROM racks rk JOIN assets ra ON ra.id=rk.asset_id
			WHERE rk.tenant_id=$1 AND rk.branch_id=$2 AND ra.tenant_id=$1 AND ra.branch_id=$2
			  AND ra.status='active' AND ra.inventory_status IS DISTINCT FROM 'retired'
		)
		SELECT (SELECT count(*) FROM valid_sites),
		       (SELECT count(*) FROM valid_areas),
		       (SELECT count(*) FROM valid_distribution),
		       (SELECT count(*) FROM valid_racks),
		       (SELECT count(*) FROM all_racks)`, tenantID, branchID).Scan(
		&counts.Sites, &counts.InternalAreas, &counts.MdfIdf, &counts.ValidRacks, &counts.TotalRacks,
	)
	if err != nil {
		log.Printf("infrastructure readiness: derive state: %v", err)
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}

	rules := []readinessNamingRule{}
	rows, err := tdb.QueryContext(r.Context(), `
		SELECT asset_type_code,prefix,separator,seq_digits,include_branch,include_placement,
		       include_site,include_internal_area,COALESCE(custom_segment_1,''),COALESCE(custom_segment_2,'')
		FROM naming_rules
		WHERE tenant_id=$1 AND asset_type_code IN ('MDF','IDF') AND active=true
		ORDER BY CASE asset_type_code WHEN 'MDF' THEN 0 ELSE 1 END`, tenantID)
	if err != nil {
		log.Printf("infrastructure readiness: resolve nomenclature: %v", err)
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var rule readinessNamingRule
		if err := rows.Scan(&rule.AssetTypeCode, &rule.Prefix, &rule.Separator, &rule.SeqDigits,
			&rule.IncludeBranch, &rule.IncludePlacement, &rule.IncludeSite, &rule.IncludeInternalArea,
			&rule.CustomSegment1, &rule.CustomSegment2); err != nil {
			log.Printf("infrastructure readiness: scan nomenclature: %v", err)
			http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
			return
		}
		rules = append(rules, rule)
	}
	if err := rows.Err(); err != nil {
		log.Printf("infrastructure readiness: iterate nomenclature: %v", err)
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}

	if err := json.NewEncoder(w).Encode(buildInfrastructureReadiness(branchID, branchCode, branchName, counts, buildNomenclatureReadiness(branchCode, rules))); err != nil {
		log.Printf("infrastructure readiness: encode response: %v", err)
	}
}
