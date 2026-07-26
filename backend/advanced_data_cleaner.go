package main

import (
	"log"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// AdvancedDataCleaner estructura para limpieza avanzada
type AdvancedDataCleaner struct {
	AssetType string
}

// CleanItemAdvanced limpia un item de forma avanzada
func (adc *AdvancedDataCleaner) CleanItemAdvanced(item map[string]interface{}) map[string]interface{} {
	cleaned := make(map[string]interface{})

	for key, value := range item {
		// Normalizar clave
		normalizedKey := normalizeKeyAdvanced(key)

		// Limpiar valor
		cleanedValue := cleanValueAdvanced(value, normalizedKey, adc.AssetType)

		if cleanedValue != "" {
			cleaned[normalizedKey] = cleanedValue
		}
	}

	// Enriquecer con campos derivados
	adc.enrichItem(cleaned)

	// Agregar campos por defecto
	if _, ok := cleaned["estado"]; !ok {
		cleaned["estado"] = "activo"
	}

	if _, ok := cleaned["tipo"]; !ok {
		cleaned["tipo"] = adc.AssetType
	}

	return cleaned
}

// normalizeKeyAdvanced normaliza claves de forma inteligente
func normalizeKeyAdvanced(key string) string {
	key = strings.ToLower(key)
	key = strings.TrimSpace(key)

	// Mapeo de sinónimos comunes
	synonyms := map[string]string{
		"nombre_del_equipo": "nombre",
		"equipment_name":    "nombre",
		"asset_name":        "nombre",
		"device_name":       "nombre",
		"id_equipo":         "id",
		"equipment_id":      "id",
		"asset_id":          "id",
		"device_id":         "id",
		"descripción":       "descripcion",
		"description":       "descripcion",
		"desc":              "descripcion",
		"ubicación":         "ubicacion",
		"location":          "ubicacion",
		"loc":               "ubicacion",
		"estado_equipo":     "estado",
		"equipment_status":  "estado",
		"status":            "estado",
		"modelo_equipo":     "modelo",
		"equipment_model":   "modelo",
		"model":             "modelo",
		"fabricante":        "marca",
		"manufacturer":      "marca",
		"brand":             "marca",
		"número_serie":      "serial_number",
		"serial":            "serial_number",
		"sn":                "serial_number",
		"dirección_ip":      "ip_address",
		"ip_address":        "ip_address",
		"ip":                "ip_address",
		"número_puertos":    "puertos",
		"num_ports":         "puertos",
		"ports":             "puertos",
	}

	if mapped, ok := synonyms[key]; ok {
		return mapped
	}

	// Remover caracteres especiales
	key = regexp.MustCompile(`[^a-z0-9_]`).ReplaceAllString(key, "_")
	key = regexp.MustCompile(`_+`).ReplaceAllString(key, "_")
	key = strings.Trim(key, "_")

	return key
}

// cleanValueAdvanced limpia valores de forma inteligente
func cleanValueAdvanced(value interface{}, key string, assetType string) string {
	// Usar normalizeValue() seguro en lugar de string(rune())
	strValue, valid := NormalizeValue(value)
	if !valid {
		return ""
	}

	strValue = strings.TrimSpace(strValue)

	// Remover espacios múltiples
	strValue = regexp.MustCompile(`\s+`).ReplaceAllString(strValue, " ")

	// Remover caracteres de control
	strValue = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, strValue)

	// Limpiar valores comunes basura
	basuraPatterns := []string{
		`^n/a$`, `^na$`, `^none$`, `^null$`, `^undefined$`,
		`^-+$`, `^_+$`, `^\s*$`, `^0+$`, `^\.+$`,
	}

	strValueLower := strings.ToLower(strValue)
	for _, pattern := range basuraPatterns {
		if regexp.MustCompile(pattern).MatchString(strValueLower) {
			return ""
		}
	}

	// Validar longitud mínima
	if len(strValue) < 2 {
		return ""
	}

	// Limpiar según el tipo de campo
	strValue = cleanByFieldType(strValue, key, assetType)

	return strValue
}

// cleanByFieldType limpia valores según el tipo de campo
func cleanByFieldType(value string, fieldName string, assetType string) string {
	switch fieldName {
	case "ip_address":
		return cleanIPAddress(value)
	case "serial_number":
		return cleanSerialNumber(value)
	case "puertos":
		return cleanNumericField(value)
	case "altura":
		return cleanNumericField(value)
	case "vlan":
		return cleanNumericField(value)
	case "estado":
		return normalizeStatus(value)
	case "nombre":
		return cleanName(value)
	default:
		return value
	}
}

// cleanIPAddress limpia direcciones IP
func cleanIPAddress(value string) string {
	// Validar formato IP
	ipPattern := regexp.MustCompile(`^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$`)
	if ipPattern.MatchString(value) {
		return value
	}
	return ""
}

// cleanSerialNumber limpia números de serie
func cleanSerialNumber(value string) string {
	// Remover espacios y caracteres especiales comunes
	value = strings.ReplaceAll(value, " ", "")
	value = strings.ReplaceAll(value, "-", "")
	value = strings.ReplaceAll(value, "_", "")

	// Debe tener al menos 3 caracteres
	if len(value) < 3 {
		return ""
	}

	return value
}

// cleanNumericField limpia campos numéricos
func cleanNumericField(value string) string {
	// Extraer solo números
	numPattern := regexp.MustCompile(`\d+`)
	matches := numPattern.FindAllString(value, -1)

	if len(matches) > 0 {
		return matches[0]
	}

	return ""
}

// normalizeStatus normaliza estados
func normalizeStatus(value string) string {
	value = strings.ToLower(value)

	statusMap := map[string]string{
		"activo":        "activo",
		"active":        "activo",
		"en_uso":        "activo",
		"in_use":        "activo",
		"operativo":     "activo",
		"operational":   "activo",
		"inactivo":      "inactivo",
		"inactive":      "inactivo",
		"fuera_servicio": "inactivo",
		"out_of_service": "inactivo",
		"mantenimiento": "mantenimiento",
		"maintenance":   "mantenimiento",
		"en_reparacion": "mantenimiento",
		"under_repair":  "mantenimiento",
		"retirado":      "retirado",
		"retired":       "retirado",
		"descontinuado": "retirado",
		"discontinued":  "retirado",
	}

	if mapped, ok := statusMap[value]; ok {
		return mapped
	}

	// Si no está en el mapa, devolver el valor original si es válido
	if len(value) > 2 {
		return value
	}

	return "activo"
}

// cleanName limpia nombres
func cleanName(value string) string {
	// Remover prefijos comunes
	prefixes := []string{"el ", "la ", "los ", "las ", "the ", "a ", "an "}
	valueLower := strings.ToLower(value)

	for _, prefix := range prefixes {
		if strings.HasPrefix(valueLower, prefix) {
			value = value[len(prefix):]
			break
		}
	}

	// Capitalizar primera letra
	if len(value) > 0 {
		value = strings.ToUpper(string(value[0])) + value[1:]
	}

	return value
}

// enrichItem enriquece un item con campos derivados
func (adc *AdvancedDataCleaner) enrichItem(item map[string]interface{}) {
	// Si hay nombre y no hay ID, usar nombre como ID
	if nombre, ok := item["nombre"]; ok && nombre != "" {
		if _, hasID := item["id"]; !hasID {
			// Generar ID a partir del nombre
			id := strings.ToUpper(strings.ReplaceAll(nombre.(string), " ", "_"))
			item["id"] = id
		}
	}

	// Si hay ubicación, extraer piso si es posible
	if ubicacion, ok := item["ubicacion"]; ok && ubicacion != "" {
		pisoPattern := regexp.MustCompile(`(?i)(piso|floor|p)\s*(\d+)`)
		matches := pisoPattern.FindStringSubmatch(ubicacion.(string))
		if len(matches) > 2 {
			item["piso"] = matches[2]
		}
	}

	// Si hay modelo y no hay marca, intentar extraer marca del modelo
	if modelo, ok := item["modelo"]; ok && modelo != "" {
		if _, hasMarca := item["marca"]; !hasMarca {
			marca := extractBrandFromModel(modelo.(string))
			if marca != "" {
				item["marca"] = marca
			}
		}
	}
}

// extractBrandFromModel extrae la marca del modelo
func extractBrandFromModel(modelo string) string {
	// Marcas comunes
	brands := []string{
		"Cisco", "Juniper", "Arista", "Dell", "HP", "Lenovo",
		"Panduit", "Commscope", "Leoni", "Belden", "Corning",
		"3Com", "Extreme", "Fortinet", "Palo Alto", "Ubiquiti",
	}

	modeloLower := strings.ToLower(modelo)
	for _, brand := range brands {
		if strings.Contains(modeloLower, strings.ToLower(brand)) {
			return brand
		}
	}

	// Intentar extraer la primera palabra como marca
	parts := strings.Fields(modelo)
	if len(parts) > 0 && len(parts[0]) > 2 {
		return parts[0]
	}

	return ""
}

// CleanAndValidateItemsAdvanced limpia y valida items de forma avanzada
func CleanAndValidateItemsAdvanced(items []map[string]interface{}, assetType string) ([]map[string]interface{}, map[string]interface{}) {
	cleaner := &AdvancedDataCleaner{AssetType: assetType}
	validator := &StrictValidator{AssetType: assetType}

	var cleanedItems []map[string]interface{}
	stats := map[string]interface{}{
		"total_items":         len(items),
		"cleaned_items":       0,
		"valid_items":         0,
		"items_with_warnings": 0,
		"items_with_errors":   0,
		"errors":              []string{},
		"warnings":            []string{},
	}

	for i, item := range items {
		// Limpiar item
		cleanedItem := cleaner.CleanItemAdvanced(item)

		// Validar item
		validationResult := validator.ValidateStrict(cleanedItem)

		if !validationResult.IsValid {
			stats["items_with_errors"] = stats["items_with_errors"].(int) + 1
			for _, err := range validationResult.Errors {
				// Usar strconv.Itoa() en lugar de string(rune())
				stats["errors"] = append(stats["errors"].([]string), "Item "+strconv.Itoa(i)+": "+err)
			}
			continue
		}

		if len(validationResult.Warnings) > 0 {
			stats["items_with_warnings"] = stats["items_with_warnings"].(int) + 1
			for _, warn := range validationResult.Warnings {
				// Usar strconv.Itoa() en lugar de string(rune())
				stats["warnings"] = append(stats["warnings"].([]string), "Item "+strconv.Itoa(i)+": "+warn)
			}
		}

		cleanedItems = append(cleanedItems, cleanedItem)
		stats["valid_items"] = stats["valid_items"].(int) + 1
	}

	stats["cleaned_items"] = len(cleanedItems)

	log.Printf("✓ Advanced data cleaning complete: %d/%d items valid", stats["valid_items"], stats["total_items"])

	return cleanedItems, stats
}

// StrictValidator validador estricto por tipo de activo
type StrictValidator struct {
	AssetType string
}

// ValidationResult resultado de validación
type ValidationResult struct {
	IsValid  bool
	Errors   []string
	Warnings []string
}

// ValidateStrict valida de forma estricta
func (sv *StrictValidator) ValidateStrict(item map[string]interface{}) ValidationResult {
	result := ValidationResult{
		IsValid:  true,
		Errors:   []string{},
		Warnings: []string{},
	}

	// Validaciones comunes
	if nombre, ok := item["nombre"]; !ok || nombre == "" {
		result.Errors = append(result.Errors, "Campo 'nombre' es requerido")
		result.IsValid = false
	}

	// Validaciones específicas por tipo
	switch sv.AssetType {
	case "activos":
		result = sv.validateActivosStrict(item, result)
	case "racks":
		result = sv.validateRacksStrict(item, result)
	case "switches":
		result = sv.validateSwitchesStrict(item, result)
	case "ups_pdu":
		result = sv.validateUPSPDUStrict(item, result)
	case "patch_panels":
		result = sv.validatePatchPanelsStrict(item, result)
	case "backbone":
		result = sv.validateBackboneStrict(item, result)
	case "nodos":
		result = sv.validateNodosStrict(item, result)
	}

	return result
}

// validateActivosStrict valida activos de forma estricta
func (sv *StrictValidator) validateActivosStrict(item map[string]interface{}, result ValidationResult) ValidationResult {
	// Validar estado
	if estado, ok := item["estado"]; ok {
		estadoStr := estado.(string)
		validStates := []string{"activo", "inactivo", "mantenimiento", "retirado"}
		found := false
		for _, s := range validStates {
			if estadoStr == s {
				found = true
				break
			}
		}
		if !found {
			result.Warnings = append(result.Warnings, "Estado '"+estadoStr+"' no es estándar")
		}
	}

	// Validar que tenga al menos nombre y estado
	if _, ok := item["estado"]; !ok {
		result.Warnings = append(result.Warnings, "Campo 'estado' no especificado")
	}

	return result
}

// validateRacksStrict valida racks de forma estricta
func (sv *StrictValidator) validateRacksStrict(item map[string]interface{}, result ValidationResult) ValidationResult {
	// Validar altura
	if altura, ok := item["altura"]; ok {
		alturaStr := altura.(string)
		if !regexp.MustCompile(`^\d+$`).MatchString(alturaStr) {
			result.Errors = append(result.Errors, "Campo 'altura' debe ser numérico")
			result.IsValid = false
		}
	} else {
		result.Warnings = append(result.Warnings, "Campo 'altura' no especificado")
	}

	return result
}

// validateSwitchesStrict valida switches de forma estricta
func (sv *StrictValidator) validateSwitchesStrict(item map[string]interface{}, result ValidationResult) ValidationResult {
	// Validar puertos
	if puertos, ok := item["puertos"]; ok {
		puertosStr := puertos.(string)
		if !regexp.MustCompile(`^\d+$`).MatchString(puertosStr) {
			result.Errors = append(result.Errors, "Campo 'puertos' debe ser numérico")
			result.IsValid = false
		}
	} else {
		result.Warnings = append(result.Warnings, "Campo 'puertos' no especificado")
	}

	return result
}

// validateUPSPDUStrict valida UPS/PDU de forma estricta
func (sv *StrictValidator) validateUPSPDUStrict(item map[string]interface{}, result ValidationResult) ValidationResult {
	// Validar capacidad
	if capacidad, ok := item["capacidad"]; ok {
		capacidadStr := capacidad.(string)
		if !regexp.MustCompile(`^\d+(\.\d+)?\s*(kVA|kW)?$`).MatchString(capacidadStr) {
			result.Errors = append(result.Errors, "Campo 'capacidad' formato inválido")
			result.IsValid = false
		}
	} else {
		result.Warnings = append(result.Warnings, "Campo 'capacidad' no especificado")
	}

	return result
}

// validatePatchPanelsStrict valida patch panels de forma estricta
func (sv *StrictValidator) validatePatchPanelsStrict(item map[string]interface{}, result ValidationResult) ValidationResult {
	// Validar puertos
	if puertos, ok := item["puertos"]; ok {
		puertosStr := puertos.(string)
		if !regexp.MustCompile(`^\d+$`).MatchString(puertosStr) {
			result.Errors = append(result.Errors, "Campo 'puertos' debe ser numérico")
			result.IsValid = false
		}
	} else {
		result.Warnings = append(result.Warnings, "Campo 'puertos' no especificado")
	}

	return result
}

// validateBackboneStrict valida backbone de forma estricta
func (sv *StrictValidator) validateBackboneStrict(item map[string]interface{}, result ValidationResult) ValidationResult {
	// Validar tipo
	if _, ok := item["tipo"]; !ok {
		result.Errors = append(result.Errors, "Campo 'tipo' es requerido para backbone")
		result.IsValid = false
	}

	return result
}

// validateNodosStrict valida nodos de forma estricta
func (sv *StrictValidator) validateNodosStrict(item map[string]interface{}, result ValidationResult) ValidationResult {
	// Validar ubicación
	if _, ok := item["ubicacion"]; !ok {
		result.Errors = append(result.Errors, "Campo 'ubicacion' es requerido para nodos")
		result.IsValid = false
	}

	return result
}
