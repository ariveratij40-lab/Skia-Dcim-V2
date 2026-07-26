package main

import (
	"fmt"
	"strconv"
)

// ============================================================
// NORMALIZACIÓN DE VALORES
// ============================================================

// NormalizeValue convierte valores de forma segura sin usar string(rune())
// Retorna (valor normalizado, es válido)
// NO pertenece a session_context.go - es responsabilidad de limpieza de datos
func NormalizeValue(value interface{}) (string, bool) {
	if value == nil {
		return "", false
	}

	switch v := value.(type) {
	case string:
		if v == "" {
			return "", false
		}
		return v, true
	case int:
		return strconv.Itoa(v), true
	case int32:
		return strconv.FormatInt(int64(v), 10), true
	case int64:
		return strconv.FormatInt(v, 10), true
	case float32:
		return strconv.FormatFloat(float64(v), 'f', -1, 32), true
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64), true
	case bool:
		if v {
			return "true", true
		}
		return "false", true
	default:
		return fmt.Sprintf("%v", v), true
	}
}

// NormalizeInt normaliza un valor a entero
func NormalizeInt(value interface{}) (int64, bool) {
	if value == nil {
		return 0, false
	}

	switch v := value.(type) {
	case int:
		return int64(v), true
	case int32:
		return int64(v), true
	case int64:
		return v, true
	case float32:
		return int64(v), true
	case float64:
		return int64(v), true
	case string:
		if i, err := strconv.ParseInt(v, 10, 64); err == nil {
			return i, true
		}
		return 0, false
	default:
		return 0, false
	}
}

// NormalizeFloat normaliza un valor a float
func NormalizeFloat(value interface{}) (float64, bool) {
	if value == nil {
		return 0, false
	}

	switch v := value.(type) {
	case int:
		return float64(v), true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case float32:
		return float64(v), true
	case float64:
		return v, true
	case string:
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f, true
		}
		return 0, false
	default:
		return 0, false
	}
}

// NormalizeBool normaliza un valor a booleano
func NormalizeBool(value interface{}) (bool, bool) {
	if value == nil {
		return false, false
	}

	switch v := value.(type) {
	case bool:
		return v, true
	case int:
		return v != 0, true
	case int32:
		return v != 0, true
	case int64:
		return v != 0, true
	case string:
		if b, err := strconv.ParseBool(v); err == nil {
			return b, true
		}
		return false, false
	default:
		return false, false
	}
}

// NormalizeMap normaliza un mapa de valores
func NormalizeMap(data map[string]interface{}) map[string]string {
	result := make(map[string]string)

	for key, value := range data {
		if normalized, ok := NormalizeValue(value); ok {
			result[key] = normalized
		}
	}

	return result
}

// NormalizeArray normaliza un array de valores
func NormalizeArray(data []interface{}) []string {
	var result []string

	for _, value := range data {
		if normalized, ok := NormalizeValue(value); ok {
			result = append(result, normalized)
		}
	}

	return result
}
