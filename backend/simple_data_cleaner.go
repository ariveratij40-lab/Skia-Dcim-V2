package main

import (
	"log"
	"strings"
)

// SimpleDataCleaner estructura para limpieza simple
type SimpleDataCleaner struct {
	AssetType string
}

// CleanItemSimple limpia un item de forma simple
func (sdc *SimpleDataCleaner) CleanItemSimple(item map[string]interface{}) map[string]interface{} {
	cleaned := make(map[string]interface{})

	for key, value := range item {
		// Normalizar clave
		normalizedKey := strings.ToLower(strings.TrimSpace(key))

		// Convertir valor a string usando normalizeValue() seguro
		strValue, valid := NormalizeValue(value)
		if !valid {
			continue
		}

		// Solo agregar si tiene contenido
		if strValue != "" && strValue != "n/a" && strValue != "null" && strValue != "-" {
			cleaned[normalizedKey] = strValue
		}
	}

	// Agregar campos por defecto
	if _, ok := cleaned["estado"]; !ok {
		cleaned["estado"] = "activo"
	}

	if _, ok := cleaned["tipo"]; !ok {
		cleaned["tipo"] = sdc.AssetType
	}

	return cleaned
}

// CleanAndValidateItemsSimple limpia y valida items de forma simple
func CleanAndValidateItemsSimple(items []map[string]interface{}, assetType string) ([]map[string]interface{}, map[string]interface{}) {
	cleaner := &SimpleDataCleaner{AssetType: assetType}

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

	for _, item := range items {
		// Limpiar item
		cleanedItem := cleaner.CleanItemSimple(item)

		// Validación simple: solo requiere que tenga al menos un campo además de estado y tipo
		if len(cleanedItem) < 3 {
			stats["items_with_errors"] = stats["items_with_errors"].(int) + 1
			continue
		}

		cleanedItems = append(cleanedItems, cleanedItem)
		stats["valid_items"] = stats["valid_items"].(int) + 1
	}

	stats["cleaned_items"] = len(cleanedItems)

	log.Printf("✓ Simple data cleaning complete: %d/%d items valid", stats["valid_items"], stats["total_items"])

	return cleanedItems, stats
}
