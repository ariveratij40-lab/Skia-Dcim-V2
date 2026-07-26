package main

import (
	"fmt"
	"log"
	"net"
	"regexp"
	"strconv"
	"strings"
)

// ============================================================
// MOTOR DE VALIDACIÓN EMPRESARIAL
// Validaciones específicas por tipo de activo
// ============================================================

type ValidationRule struct {
	FieldName    string
	Required     bool
	Type         string // string, number, email, ip, mac, date, enum
	MinLength    int
	MaxLength    int
	Pattern      string // regex
	AllowedValues []string
	CustomValidator func(value string) (bool, string)
}

type AssetTypeValidator struct {
	AssetType string
	Rules     []ValidationRule
}

// ============================================================
// VALIDADORES POR TIPO DE ACTIVO
// ============================================================

func GetValidatorForAssetType(assetType string) *AssetTypeValidator {
	switch strings.ToLower(assetType) {
	case "switch":
		return getSwitchValidator()
	case "rack":
		return getRackValidator()
	case "ups", "pdu":
		return getUPSValidator()
	case "patch", "patch_panel":
		return getPatchPanelValidator()
	case "nodo", "node":
		return getNodeValidator()
	case "backbone":
		return getBackboneValidator()
	case "fibra", "fiber":
		return getFiberValidator()
	case "servidor", "server":
		return getServerValidator()
	case "mdf", "idf":
		return getMDFIDFValidator()
	default:
		return getGenericAssetValidator()
	}
}

// ============================================================
// VALIDADOR: SWITCH
// ============================================================
func getSwitchValidator() *AssetTypeValidator {
	return &AssetTypeValidator{
		AssetType: "switch",
		Rules: []ValidationRule{
			{
				FieldName: "nombre",
				Required:  true,
				Type:      "string",
				MinLength: 3,
				MaxLength: 255,
			},
			{
				FieldName: "modelo",
				Required:  true,
				Type:      "string",
				MinLength: 2,
				MaxLength: 100,
			},
			{
				FieldName: "fabricante",
				Required:  true,
				Type:      "string",
				MinLength: 2,
				MaxLength: 100,
				AllowedValues: []string{"Cisco", "Juniper", "Arista", "Dell", "HP", "Fortinet", "Ubiquiti"},
			},
			{
				FieldName: "serial_number",
				Required:  true,
				Type:      "string",
				MinLength: 3,
				MaxLength: 50,
			},
			{
				FieldName: "puertos",
				Required:  true,
				Type:      "number",
				CustomValidator: func(value string) (bool, string) {
					ports, err := strconv.Atoi(value)
					if err != nil {
						return false, "Debe ser un número"
					}
					if ports < 2 || ports > 256 {
						return false, "Cantidad de puertos debe estar entre 2 y 256"
					}
					return true, ""
				},
			},
			{
				FieldName: "ip",
				Required:  false,
				Type:      "ip",
			},
			{
				FieldName: "mac",
				Required:  false,
				Type:      "mac",
			},
			{
				FieldName: "estado",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"activo", "inactivo", "mantenimiento", "retirado"},
			},
			{
				FieldName: "ubicacion",
				Required:  true,
				Type:      "string",
				MinLength: 2,
				MaxLength: 100,
			},
			{
				FieldName: "rack",
				Required:  false,
				Type:      "string",
			},
			{
				FieldName: "u_inicial",
				Required:  false,
				Type:      "number",
			},
		},
	}
}

// ============================================================
// VALIDADOR: RACK
// ============================================================
func getRackValidator() *AssetTypeValidator {
	return &AssetTypeValidator{
		AssetType: "rack",
		Rules: []ValidationRule{
			{
				FieldName: "nombre",
				Required:  true,
				Type:      "string",
				MinLength: 2,
				MaxLength: 100,
			},
			{
				FieldName: "altura_u",
				Required:  true,
				Type:      "number",
				CustomValidator: func(value string) (bool, string) {
					height, err := strconv.Atoi(value)
					if err != nil {
						return false, "Debe ser un número"
					}
					if height < 12 || height > 52 {
						return false, "Altura debe estar entre 12U y 52U"
					}
					return true, ""
				},
			},
			{
				FieldName: "ancho_mm",
				Required:  true,
				Type:      "number",
				CustomValidator: func(value string) (bool, string) {
					width, err := strconv.Atoi(value)
					if err != nil {
						return false, "Debe ser un número"
					}
					if width != 600 && width != 800 && width != 1000 {
						return false, "Ancho debe ser 600, 800 o 1000 mm"
					}
					return true, ""
				},
			},
			{
				FieldName: "profundidad_mm",
				Required:  true,
				Type:      "number",
				CustomValidator: func(value string) (bool, string) {
					depth, err := strconv.Atoi(value)
					if err != nil {
						return false, "Debe ser un número"
					}
					if depth < 600 || depth > 1200 {
						return false, "Profundidad debe estar entre 600 y 1200 mm"
					}
					return true, ""
				},
			},
			{
				FieldName: "ubicacion",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "sala",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "mdf_idf",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"MDF", "IDF"},
			},
			{
				FieldName: "estado",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"activo", "inactivo", "mantenimiento", "retirado"},
			},
		},
	}
}

// ============================================================
// VALIDADOR: UPS/PDU
// ============================================================
func getUPSValidator() *AssetTypeValidator {
	return &AssetTypeValidator{
		AssetType: "ups",
		Rules: []ValidationRule{
			{
				FieldName: "nombre",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "modelo",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "fabricante",
				Required:  true,
				Type:      "string",
				AllowedValues: []string{"APC", "Eaton", "Schneider", "Vertiv", "Panduit"},
			},
			{
				FieldName: "serial_number",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "capacidad_kva",
				Required:  true,
				Type:      "number",
				CustomValidator: func(value string) (bool, string) {
					kva, err := strconv.ParseFloat(value, 64)
					if err != nil {
						return false, "Debe ser un número"
					}
					if kva < 0.5 || kva > 500 {
						return false, "Capacidad debe estar entre 0.5 y 500 kVA"
					}
					return true, ""
				},
			},
			{
				FieldName: "voltaje",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"120V", "208V", "240V", "380V", "400V", "415V"},
			},
			{
				FieldName: "baterias",
				Required:  false,
				Type:      "string",
			},
			{
				FieldName: "estado",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"activo", "inactivo", "mantenimiento", "retirado"},
			},
		},
	}
}

// ============================================================
// VALIDADOR: PATCH PANEL
// ============================================================
func getPatchPanelValidator() *AssetTypeValidator {
	return &AssetTypeValidator{
		AssetType: "patch_panel",
		Rules: []ValidationRule{
			{
				FieldName: "nombre",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "puertos",
				Required:  true,
				Type:      "number",
				CustomValidator: func(value string) (bool, string) {
					ports, err := strconv.Atoi(value)
					if err != nil {
						return false, "Debe ser un número"
					}
					if ports < 12 || ports > 96 {
						return false, "Puertos debe estar entre 12 y 96"
					}
					return true, ""
				},
			},
			{
				FieldName: "categoria",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"Cat5e", "Cat6", "Cat6A", "Cat7", "Cat8"},
			},
			{
				FieldName: "tipo_conector",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"RJ45", "LC", "SC", "ST", "MPO"},
			},
		},
	}
}

// ============================================================
// VALIDADOR: NODO
// ============================================================
func getNodeValidator() *AssetTypeValidator {
	return &AssetTypeValidator{
		AssetType: "nodo",
		Rules: []ValidationRule{
			{
				FieldName: "nombre",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "categoria",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"Cat5e", "Cat6", "Cat6A", "Cat7", "Cat8"},
			},
			{
				FieldName: "longitud_metros",
				Required:  true,
				Type:      "number",
				CustomValidator: func(value string) (bool, string) {
					length, err := strconv.ParseFloat(value, 64)
					if err != nil {
						return false, "Debe ser un número"
					}
					if length < 1 || length > 100 {
						return false, "Longitud debe estar entre 1 y 100 metros"
					}
					return true, ""
				},
			},
			{
				FieldName: "jack_origen",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "jack_destino",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "patch_panel",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "puerto",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "switch",
				Required:  true,
				Type:      "string",
			},
		},
	}
}

// ============================================================
// VALIDADOR: BACKBONE
// ============================================================
func getBackboneValidator() *AssetTypeValidator {
	return &AssetTypeValidator{
		AssetType: "backbone",
		Rules: []ValidationRule{
			{
				FieldName: "nombre",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "tipo",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"Cobre", "Fibra", "Mixto"},
			},
			{
				FieldName: "origen",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "destino",
				Required:  true,
				Type:      "string",
			},
		},
	}
}

// ============================================================
// VALIDADOR: FIBRA
// ============================================================
func getFiberValidator() *AssetTypeValidator {
	return &AssetTypeValidator{
		AssetType: "fibra",
		Rules: []ValidationRule{
			{
				FieldName: "nombre",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "tipo",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"OM1", "OM2", "OM3", "OM4", "OS1", "OS2"},
			},
			{
				FieldName: "hilos",
				Required:  true,
				Type:      "number",
				CustomValidator: func(value string) (bool, string) {
					strands, err := strconv.Atoi(value)
					if err != nil {
						return false, "Debe ser un número"
					}
					if strands < 2 || strands > 288 {
						return false, "Hilos debe estar entre 2 y 288"
					}
					return true, ""
				},
			},
			{
				FieldName: "longitud_metros",
				Required:  true,
				Type:      "number",
			},
			{
				FieldName: "conector_origen",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"LC", "SC", "ST", "MPO", "E2000"},
			},
			{
				FieldName: "conector_destino",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"LC", "SC", "ST", "MPO", "E2000"},
			},
		},
	}
}

// ============================================================
// VALIDADOR: SERVIDOR
// ============================================================
func getServerValidator() *AssetTypeValidator {
	return &AssetTypeValidator{
		AssetType: "servidor",
		Rules: []ValidationRule{
			{
				FieldName: "nombre",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "hostname",
				Required:  true,
				Type:      "string",
				Pattern:   "^[a-zA-Z0-9-]{1,63}$",
			},
			{
				FieldName: "modelo",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "fabricante",
				Required:  true,
				Type:      "string",
				AllowedValues: []string{"Dell", "HP", "Lenovo", "IBM", "Cisco", "Fujitsu"},
			},
			{
				FieldName: "serial_number",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "ip",
				Required:  true,
				Type:      "ip",
			},
			{
				FieldName: "mac",
				Required:  true,
				Type:      "mac",
			},
		},
	}
}

// ============================================================
// VALIDADOR: MDF/IDF
// ============================================================
func getMDFIDFValidator() *AssetTypeValidator {
	return &AssetTypeValidator{
		AssetType: "mdf_idf",
		Rules: []ValidationRule{
			{
				FieldName: "nombre",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "tipo",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"MDF", "IDF"},
			},
			{
				FieldName: "ubicacion",
				Required:  true,
				Type:      "string",
			},
			{
				FieldName: "racks",
				Required:  true,
				Type:      "number",
			},
		},
	}
}

// ============================================================
// VALIDADOR: ACTIVO GENÉRICO
// ============================================================
func getGenericAssetValidator() *AssetTypeValidator {
	return &AssetTypeValidator{
		AssetType: "generic",
		Rules: []ValidationRule{
			{
				FieldName: "nombre",
				Required:  true,
				Type:      "string",
				MinLength: 2,
				MaxLength: 255,
			},
			{
				FieldName: "estado",
				Required:  true,
				Type:      "enum",
				AllowedValues: []string{"activo", "inactivo", "mantenimiento", "retirado"},
			},
		},
	}
}

// ============================================================
// FUNCIÓN DE VALIDACIÓN PRINCIPAL
// ============================================================

type ValidationError struct {
	Field    string
	Value    string
	Message  string
	Severity string // error, warning
}

func ValidateAssetData(assetType string, data map[string]interface{}) []ValidationError {
	validator := GetValidatorForAssetType(assetType)
	var errors []ValidationError

	for _, rule := range validator.Rules {
		value, exists := data[rule.FieldName]
		valueStr := ""

		if exists {
			switch v := value.(type) {
			case string:
				valueStr = v
			case float64:
				valueStr = fmt.Sprintf("%v", v)
			case int:
				valueStr = fmt.Sprintf("%d", v)
			default:
				valueStr = fmt.Sprintf("%v", v)
			}
		}

		// Validar si es requerido
		if rule.Required && (valueStr == "" || !exists) {
			errors = append(errors, ValidationError{
				Field:    rule.FieldName,
				Value:    valueStr,
				Message:  fmt.Sprintf("Campo requerido: %s", rule.FieldName),
				Severity: "error",
			})
			continue
		}

		// Si no es requerido y está vacío, saltarlo
		if !rule.Required && valueStr == "" {
			continue
		}

		// Validar según tipo
		if err := validateFieldByType(rule, valueStr); err != nil {
			errors = append(errors, ValidationError{
				Field:    rule.FieldName,
				Value:    valueStr,
				Message:  err.Error(),
				Severity: "error",
			})
		}
	}

	return errors
}

func validateFieldByType(rule ValidationRule, value string) error {
	switch rule.Type {
	case "string":
		if len(value) < rule.MinLength {
			return fmt.Errorf("Mínimo %d caracteres", rule.MinLength)
		}
		if rule.MaxLength > 0 && len(value) > rule.MaxLength {
			return fmt.Errorf("Máximo %d caracteres", rule.MaxLength)
		}
		if rule.Pattern != "" {
			matched, err := regexp.MatchString(rule.Pattern, value)
			if err != nil || !matched {
				return fmt.Errorf("Formato inválido")
			}
		}

	case "number":
		if _, err := strconv.ParseFloat(value, 64); err != nil {
			return fmt.Errorf("Debe ser un número")
		}

	case "email":
		if !strings.Contains(value, "@") {
			return fmt.Errorf("Email inválido")
		}

	case "ip":
		if net.ParseIP(value) == nil {
			return fmt.Errorf("IP inválida")
		}

	case "mac":
		if !isValidMAC(value) {
			return fmt.Errorf("MAC inválida")
		}

	case "enum":
		if !contains(rule.AllowedValues, value) {
			return fmt.Errorf("Valor no permitido. Opciones: %s", strings.Join(rule.AllowedValues, ", "))
		}

	case "date":
		// Validar formato de fecha
		if !isValidDate(value) {
			return fmt.Errorf("Fecha inválida")
		}
	}

	// Validador personalizado
	if rule.CustomValidator != nil {
		if valid, msg := rule.CustomValidator(value); !valid {
			return fmt.Errorf("%s", msg)
		}
	}

	return nil
}

func isValidMAC(mac string) bool {
	matched, _ := regexp.MatchString(`^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$`, mac)
	return matched
}

func isValidDate(date string) bool {
	// Aceptar formatos comunes
	patterns := []string{
		`^\d{4}-\d{2}-\d{2}$`,       // YYYY-MM-DD
		`^\d{2}/\d{2}/\d{4}$`,       // MM/DD/YYYY
		`^\d{1,2}-\d{1,2}-\d{4}$`,   // D-M-YYYY
	}

	for _, pattern := range patterns {
		matched, _ := regexp.MatchString(pattern, date)
		if matched {
			return true
		}
	}
	return false
}

func contains(slice []string, item string) bool {
	for _, v := range slice {
		if strings.EqualFold(v, item) {
			return true
		}
	}
	return false
}

// ============================================================
// FUNCIÓN PARA REGISTRAR ERRORES DE VALIDACIÓN
// ============================================================

func SaveValidationErrors(db interface{}, importRowID int64, errors []ValidationError) error {
	// Aquí se guardarían los errores en la tabla import_validation_results
	log.Printf("Validación completada para fila %d: %d errores", importRowID, len(errors))
	for _, err := range errors {
		log.Printf("  - %s: %s (%s)", err.Field, err.Message, err.Severity)
	}
	return nil
}
