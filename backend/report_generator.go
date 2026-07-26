package main

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/xuri/excelize/v2"
)

// ============================================================
// GENERADOR DE REPORTES AUTOMÁTICOS
// ============================================================

type ImportReport struct {
	ImportID       int64
	FileName       string
	AssetType      string
	TotalRows      int
	CorrectRows    int
	WarningRows    int
	ErrorRows      int
	DuplicateRows  int
	InsertedAssets int
	UpdatedAssets  int
	Duration       time.Duration
	GeneratedAt    time.Time
	GeneratedBy    string
	Errors         []string
	Warnings       []string
	Summary        map[string]interface{}
}

// ============================================================
// GENERAR REPORTE EN EXCEL
// ============================================================

func GenerateExcelReport(db *sql.DB, importID int64, outputPath string) (string, error) {
	f := excelize.NewFile()
	defer f.Close()

	// Hoja 1: Resumen
	f.SetSheetName("Sheet1", "Resumen")
	addSummarySheet(f, db, importID)

	// Hoja 2: Filas con errores
	addErrorsSheet(f, db, importID)

	// Hoja 3: Duplicados detectados
	addDuplicatesSheet(f, db, importID)

	// Hoja 4: Datos importados
	addDataSheet(f, db, importID)

	// Guardar archivo
	fileName := filepath.Join(outputPath, fmt.Sprintf("import_report_%d_%s.xlsx", importID, time.Now().Format("20060102_150405")))
	if err := f.SaveAs(fileName); err != nil {
		return "", err
	}

	// Guardar referencia en BD
	saveReportToDB(db, importID, "excel", fileName)

	return fileName, nil
}

func addSummarySheet(f *excelize.File, db *sql.DB, importID int64) {
	// Obtener datos de importación
	var fileName, assetType string
	var totalRows, correctRows, warningRows, errorRows, duplicateRows int
	var createdAt time.Time

	query := `
		SELECT file_name, asset_type, total_rows, correct_rows, warning_rows, error_rows, duplicate_rows, created_at
		FROM inventory_imports
		WHERE id = $1
	`

	db.QueryRow(query, importID).Scan(&fileName, &assetType, &totalRows, &correctRows, &warningRows, &errorRows, &duplicateRows, &createdAt)

	// Escribir datos
	f.SetCellValue("Resumen", "A1", "REPORTE DE IMPORTACIÓN DE INVENTARIO")
	f.SetCellValue("Resumen", "A3", "Información General")
	f.SetCellValue("Resumen", "A4", "ID de Importación:")
	f.SetCellValue("Resumen", "B4", importID)
	f.SetCellValue("Resumen", "A5", "Archivo:")
	f.SetCellValue("Resumen", "B5", fileName)
	f.SetCellValue("Resumen", "A6", "Tipo de Activo:")
	f.SetCellValue("Resumen", "B6", assetType)
	f.SetCellValue("Resumen", "A7", "Fecha de Importación:")
	f.SetCellValue("Resumen", "B7", createdAt.Format("2006-01-02 15:04:05"))

	f.SetCellValue("Resumen", "A9", "Estadísticas")
	f.SetCellValue("Resumen", "A10", "Total de Filas:")
	f.SetCellValue("Resumen", "B10", totalRows)
	f.SetCellValue("Resumen", "A11", "Filas Correctas:")
	f.SetCellValue("Resumen", "B11", correctRows)
	f.SetCellValue("Resumen", "A12", "Filas con Advertencias:")
	f.SetCellValue("Resumen", "B12", warningRows)
	f.SetCellValue("Resumen", "A13", "Filas con Errores:")
	f.SetCellValue("Resumen", "B13", errorRows)
	f.SetCellValue("Resumen", "A14", "Duplicados Detectados:")
	f.SetCellValue("Resumen", "B14", duplicateRows)

	// Calcular porcentajes
	successPercentage := 0.0
	if totalRows > 0 {
		successPercentage = (float64(correctRows) / float64(totalRows)) * 100
	}

	f.SetCellValue("Resumen", "A16", "Tasa de Éxito:")
	f.SetCellValue("Resumen", "B16", fmt.Sprintf("%.2f%%", successPercentage))
}

func addErrorsSheet(f *excelize.File, db *sql.DB, importID int64) {
	f.NewSheet("Errores")

	// Encabezados
	f.SetCellValue("Errores", "A1", "Fila")
	f.SetCellValue("Errores", "B1", "Campo")
	f.SetCellValue("Errores", "C1", "Mensaje")
	f.SetCellValue("Errores", "D1", "Severidad")

	// Obtener errores
	query := `
		SELECT 
			ir.row_number,
			vr.field_name,
			vr.message,
			vr.severity
		FROM import_validation_results vr
		JOIN inventory_import_rows ir ON vr.import_row_id = ir.id
		WHERE ir.import_id = $1
		ORDER BY ir.row_number
	`

	rows, _ := db.Query(query, importID)
	defer rows.Close()

	rowNum := 2
	for rows.Next() {
		var rowNumber int
		var fieldName, message, severity string

		rows.Scan(&rowNumber, &fieldName, &message, &severity)

		f.SetCellValue("Errores", fmt.Sprintf("A%d", rowNum), rowNumber)
		f.SetCellValue("Errores", fmt.Sprintf("B%d", rowNum), fieldName)
		f.SetCellValue("Errores", fmt.Sprintf("C%d", rowNum), message)
		f.SetCellValue("Errores", fmt.Sprintf("D%d", rowNum), severity)

		rowNum++
	}
}

func addDuplicatesSheet(f *excelize.File, db *sql.DB, importID int64) {
	f.NewSheet("Duplicados")

	// Encabezados
	f.SetCellValue("Duplicados", "A1", "Fila")
	f.SetCellValue("Duplicados", "B1", "Activo Existente")
	f.SetCellValue("Duplicados", "C1", "Campos Coincidentes")
	f.SetCellValue("Duplicados", "D1", "Confianza")
	f.SetCellValue("Duplicados", "E1", "Acción")

	// Obtener duplicados
	query := `
		SELECT 
			ir.row_number,
			id.existing_asset_id,
			id.match_fields,
			id.match_confidence,
			id.action
		FROM import_duplicates id
		JOIN inventory_import_rows ir ON id.import_row_id = ir.id
		WHERE id.import_id = $1
		ORDER BY ir.row_number
	`

	rows, _ := db.Query(query, importID)
	defer rows.Close()

	rowNum := 2
	for rows.Next() {
		var rowNumber int
		var assetID, matchFieldsStr, action string
		var confidence float64

		rows.Scan(&rowNumber, &assetID, &matchFieldsStr, &confidence, &action)

		f.SetCellValue("Duplicados", fmt.Sprintf("A%d", rowNum), rowNumber)
		f.SetCellValue("Duplicados", fmt.Sprintf("B%d", rowNum), assetID)
		f.SetCellValue("Duplicados", fmt.Sprintf("C%d", rowNum), matchFieldsStr)
		f.SetCellValue("Duplicados", fmt.Sprintf("D%d", rowNum), fmt.Sprintf("%.2f%%", confidence))
		f.SetCellValue("Duplicados", fmt.Sprintf("E%d", rowNum), action)

		rowNum++
	}
}

func addDataSheet(f *excelize.File, db *sql.DB, importID int64) {
	f.NewSheet("Datos Importados")

	// Obtener datos
	query := `
		SELECT normalized_data
		FROM inventory_import_rows
		WHERE import_id = $1 AND status IN ('correct', 'warning', 'corrected')
		LIMIT 1000
	`

	rows, _ := db.Query(query, importID)
	defer rows.Close()

	// Escribir encabezados dinámicos
	headers := []string{"Nombre", "Modelo", "Fabricante", "Serial", "Estado", "Ubicación"}
	for i, header := range headers {
		f.SetCellValue("Datos Importados", fmt.Sprintf("%c1", rune('A'+i)), header)
	}

	// Escribir datos
	rowNum := 2
	for rows.Next() {
		var normalizedDataStr string
		rows.Scan(&normalizedDataStr)

		var data map[string]interface{}
		json.Unmarshal([]byte(normalizedDataStr), &data)

		f.SetCellValue("Datos Importados", fmt.Sprintf("A%d", rowNum), data["nombre"])
		f.SetCellValue("Datos Importados", fmt.Sprintf("B%d", rowNum), data["modelo"])
		f.SetCellValue("Datos Importados", fmt.Sprintf("C%d", rowNum), data["fabricante"])
		f.SetCellValue("Datos Importados", fmt.Sprintf("D%d", rowNum), data["serial_number"])
		f.SetCellValue("Datos Importados", fmt.Sprintf("E%d", rowNum), data["estado"])
		f.SetCellValue("Datos Importados", fmt.Sprintf("F%d", rowNum), data["ubicacion"])

		rowNum++
	}
}

// ============================================================
// GENERAR REPORTE EN CSV
// ============================================================

func GenerateCSVReport(db *sql.DB, importID int64, outputPath string) (string, error) {
	fileName := filepath.Join(outputPath, fmt.Sprintf("import_report_%d_%s.csv", importID, time.Now().Format("20060102_150405")))
	file, err := os.Create(fileName)
	if err != nil {
		return "", err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// Escribir encabezados
	headers := []string{"Fila", "Nombre", "Modelo", "Fabricante", "Serial", "Estado", "Ubicación", "Validación"}
	writer.Write(headers)

	// Obtener datos
	query := `
		SELECT 
			ir.row_number,
			ir.normalized_data,
			ir.status
		FROM inventory_import_rows ir
		WHERE ir.import_id = $1
		ORDER BY ir.row_number
	`

	rows, _ := db.Query(query, importID)
	defer rows.Close()

	for rows.Next() {
		var rowNumber int
		var normalizedDataStr, status string

		rows.Scan(&rowNumber, &normalizedDataStr, &status)

		var data map[string]interface{}
		json.Unmarshal([]byte(normalizedDataStr), &data)

		record := []string{
			strconv.Itoa(rowNumber),
			fmt.Sprintf("%v", data["nombre"]),
			fmt.Sprintf("%v", data["modelo"]),
			fmt.Sprintf("%v", data["fabricante"]),
			fmt.Sprintf("%v", data["serial_number"]),
			fmt.Sprintf("%v", data["estado"]),
			fmt.Sprintf("%v", data["ubicacion"]),
			status,
		}

		writer.Write(record)
	}

	// Guardar referencia en BD
	saveReportToDB(db, importID, "csv", fileName)

	return fileName, nil
}

// ============================================================
// GENERAR REPORTE EN JSON
// ============================================================

func GenerateJSONReport(db *sql.DB, importID int64, outputPath string) (string, error) {
	// Obtener información de importación
	var fileName, assetType string
	var totalRows, correctRows, warningRows, errorRows, duplicateRows int

	query := `
		SELECT file_name, asset_type, total_rows, correct_rows, warning_rows, error_rows, duplicate_rows
		FROM inventory_imports
		WHERE id = $1
	`

	db.QueryRow(query, importID).Scan(&fileName, &assetType, &totalRows, &correctRows, &warningRows, &errorRows, &duplicateRows)

	// Obtener datos
	query = `
		SELECT row_number, normalized_data, status
		FROM inventory_import_rows
		WHERE import_id = $1
		ORDER BY row_number
	`

	rows, _ := db.Query(query, importID)
	defer rows.Close()

	var data []map[string]interface{}
	for rows.Next() {
		var rowNumber int
		var normalizedDataStr, status string

		rows.Scan(&rowNumber, &normalizedDataStr, &status)

		var normalizedData map[string]interface{}
		json.Unmarshal([]byte(normalizedDataStr), &normalizedData)

		data = append(data, map[string]interface{}{
			"row_number": rowNumber,
			"data":       normalizedData,
			"status":     status,
		})
	}

	// Crear reporte
	report := map[string]interface{}{
		"import_id":      importID,
		"file_name":      fileName,
		"asset_type":     assetType,
		"statistics": map[string]int{
			"total_rows":     totalRows,
			"correct_rows":   correctRows,
			"warning_rows":   warningRows,
			"error_rows":     errorRows,
			"duplicate_rows": duplicateRows,
		},
		"data": data,
	}

	// Guardar archivo
	fileName = filepath.Join(outputPath, fmt.Sprintf("import_report_%d_%s.json", importID, time.Now().Format("20060102_150405")))
	jsonData, _ := json.MarshalIndent(report, "", "  ")
	err := os.WriteFile(fileName, jsonData, 0644)
	if err != nil {
		return "", err
	}

	// Guardar referencia en BD
	saveReportToDB(db, importID, "json", fileName)

	return fileName, nil
}

// ============================================================
// GUARDAR REFERENCIA DE REPORTE EN BD
// ============================================================

func saveReportToDB(db *sql.DB, importID int64, reportType string, filePath string) error {
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return err
	}

	query := `
		INSERT INTO import_reports (import_id, report_type, file_path, file_size, generated_at, generated_by)
		VALUES ($1, $2, $3, $4, NOW(), 'system')
	`

	_, err = db.Exec(query, importID, reportType, filePath, fileInfo.Size())
	return err
}

// ============================================================
// GENERAR TODOS LOS REPORTES
// ============================================================

func GenerateAllReports(db *sql.DB, importID int64, outputPath string) (map[string]string, error) {
	results := make(map[string]string)

	// Crear directorio si no existe
	os.MkdirAll(outputPath, 0755)

	// Generar Excel
	excelFile, err := GenerateExcelReport(db, importID, outputPath)
	if err != nil {
		log.Printf("Error generating Excel report: %v", err)
	} else {
		results["excel"] = excelFile
	}

	// Generar CSV
	csvFile, err := GenerateCSVReport(db, importID, outputPath)
	if err != nil {
		log.Printf("Error generating CSV report: %v", err)
	} else {
		results["csv"] = csvFile
	}

	// Generar JSON
	jsonFile, err := GenerateJSONReport(db, importID, outputPath)
	if err != nil {
		log.Printf("Error generating JSON report: %v", err)
	} else {
		results["json"] = jsonFile
	}

	return results, nil
}
