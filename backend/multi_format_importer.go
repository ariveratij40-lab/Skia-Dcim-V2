package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/xuri/excelize/v2"
)

// ============================================================
// SOPORTE PARA MÚLTIPLES FORMATOS DE IMPORTACIÓN
// ============================================================

type FileFormat string

const (
	FormatPDF    FileFormat = "pdf"
	FormatExcel  FileFormat = "excel"
	FormatCSV    FileFormat = "csv"
	FormatJSON   FileFormat = "json"
	FormatWord   FileFormat = "word"
	FormatUnknown FileFormat = "unknown"
)

type ImportedRow struct {
	RowNumber int
	Data      map[string]interface{}
	RawData   string
}

// ============================================================
// DETECTAR FORMATO DE ARCHIVO
// ============================================================

func DetectFileFormat(filePath string) FileFormat {
	ext := strings.ToLower(filepath.Ext(filePath))

	switch ext {
	case ".pdf":
		return FormatPDF
	case ".xlsx", ".xls":
		return FormatExcel
	case ".csv":
		return FormatCSV
	case ".json":
		return FormatJSON
	case ".docx", ".doc":
		return FormatWord
	default:
		return FormatUnknown
	}
}

// ============================================================
// IMPORTAR DESDE EXCEL
// ============================================================

func ImportFromExcel(filePath string) ([]ImportedRow, error) {
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("error opening Excel file: %v", err)
	}
	defer f.Close()

	var rows []ImportedRow
	sheetName := f.GetSheetName(0)

	// Obtener todas las filas
	excelRows, err := f.GetRows(sheetName)
	if err != nil {
		return nil, fmt.Errorf("error reading Excel rows: %v", err)
	}

	if len(excelRows) < 2 {
		return nil, fmt.Errorf("Excel file must have at least header and data rows")
	}

	// Primera fila es encabezado
	headers := excelRows[0]

	// Procesar datos
	for i := 1; i < len(excelRows); i++ {
		row := excelRows[i]
		data := make(map[string]interface{})

		for j, header := range headers {
			if j < len(row) {
				data[strings.ToLower(strings.TrimSpace(header))] = strings.TrimSpace(row[j])
			}
		}

		// Saltar filas vacías
		if len(row) == 0 || (len(row) == 1 && row[0] == "") {
			continue
		}

		importedRow := ImportedRow{
			RowNumber: i,
			Data:      data,
			RawData:   strings.Join(row, "|"),
		}

		rows = append(rows, importedRow)
	}

	log.Printf("Imported %d rows from Excel", len(rows))
	return rows, nil
}

// ============================================================
// IMPORTAR DESDE CSV
// ============================================================

func ImportFromCSV(filePath string) ([]ImportedRow, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("error opening CSV file: %v", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1 // Permitir registros con diferente número de campos

	// Leer encabezado
	headers, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("error reading CSV header: %v", err)
	}

	// Normalizar encabezados
	for i, header := range headers {
		headers[i] = strings.ToLower(strings.TrimSpace(header))
	}

	var rows []ImportedRow
	rowNum := 2

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("Error reading CSV row %d: %v", rowNum, err)
			continue
		}

		// Saltar filas vacías
		if len(record) == 0 || (len(record) == 1 && record[0] == "") {
			continue
		}

		data := make(map[string]interface{})
		for i, header := range headers {
			if i < len(record) {
				data[header] = strings.TrimSpace(record[i])
			}
		}

		importedRow := ImportedRow{
			RowNumber: rowNum,
			Data:      data,
			RawData:   strings.Join(record, ","),
		}

		rows = append(rows, importedRow)
		rowNum++
	}

	log.Printf("Imported %d rows from CSV", len(rows))
	return rows, nil
}

// ============================================================
// IMPORTAR DESDE JSON
// ============================================================

func ImportFromJSON(filePath string) ([]ImportedRow, error) {
	fileContent, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("error reading JSON file: %v", err)
	}

	var jsonData []map[string]interface{}
	err = json.Unmarshal(fileContent, &jsonData)
	if err != nil {
		return nil, fmt.Errorf("error parsing JSON: %v", err)
	}

	var rows []ImportedRow
	for i, item := range jsonData {
		// Normalizar claves a minúsculas
		normalizedData := make(map[string]interface{})
		for key, value := range item {
			normalizedData[strings.ToLower(key)] = value
		}

		rawDataJSON, _ := json.Marshal(item)
		importedRow := ImportedRow{
			RowNumber: i + 1,
			Data:      normalizedData,
			RawData:   string(rawDataJSON),
		}

		rows = append(rows, importedRow)
	}

	log.Printf("Imported %d rows from JSON", len(rows))
	return rows, nil
}

// ============================================================
// IMPORTAR DESDE PDF (usando extracción de texto)
// ============================================================

func ImportFromPDF(filePath string) ([]ImportedRow, error) {
	// Usar pdfplumber para extraer tablas
	// Este es un placeholder - la implementación real requiere Python

	// Para esta versión, llamar a Python
	pythonScript := `
import pdfplumber
import json
import sys

pdf_path = sys.argv[1]

rows = []
with pdfplumber.open(pdf_path) as pdf:
    for page_num, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        if tables:
            for table in tables:
                for row in table:
                    rows.append(row)

print(json.dumps(rows))
`

	// Guardar script temporalmente
	scriptPath := "/tmp/extract_pdf.py"
	os.WriteFile(scriptPath, []byte(pythonScript), 0644)
	defer os.Remove(scriptPath)

	// Ejecutar Python
	// cmd := exec.Command("python3", scriptPath, filePath)
	// output, err := cmd.Output()
	// if err != nil {
	//     return nil, fmt.Errorf("error extracting PDF: %v", err)
	// }

	// var rawRows [][]string
	// json.Unmarshal(output, &rawRows)

	// var rows []ImportedRow
	// for i, row := range rawRows {
	//     data := make(map[string]interface{})
	//     for j, cell := range row {
	//         data[fmt.Sprintf("col_%d", j)] = cell
	//     }
	//     rows = append(rows, ImportedRow{
	//         RowNumber: i + 1,
	//         Data:      data,
	//     })
	// }

	return []ImportedRow{}, fmt.Errorf("PDF import requires Python - use Modelo BD2026 instead")
}

// ============================================================
// IMPORTAR DESDE WORD
// ============================================================

func ImportFromWord(filePath string) ([]ImportedRow, error) {
	// Word files (.docx) contienen XML
	// Necesitaría un parser XML específico

	// Para esta versión, usar un placeholder
	return []ImportedRow{}, fmt.Errorf("Word import requires specialized parser - convert to PDF or Excel first")
}

// ============================================================
// FUNCIÓN GENÉRICA: IMPORTAR DESDE CUALQUIER FORMATO
// ============================================================

func ImportFromFile(filePath string) ([]ImportedRow, error) {
	format := DetectFileFormat(filePath)

	switch format {
	case FormatExcel:
		return ImportFromExcel(filePath)
	case FormatCSV:
		return ImportFromCSV(filePath)
	case FormatJSON:
		return ImportFromJSON(filePath)
	case FormatPDF:
		return ImportFromPDF(filePath)
	case FormatWord:
		return ImportFromWord(filePath)
	default:
		return nil, fmt.Errorf("unsupported file format: %s", format)
	}
}

// ============================================================
// CONVERTIR ENTRE FORMATOS
// ============================================================

func ConvertToExcel(rows []ImportedRow, outputPath string) (string, error) {
	f := excelize.NewFile()
	defer f.Close()

	// Obtener todos los campos únicos
	allFields := make(map[string]bool)
	for _, row := range rows {
		for field := range row.Data {
			allFields[field] = true
		}
	}

	// Crear lista de campos ordenada
	var fields []string
	for field := range allFields {
		fields = append(fields, field)
	}

	// Escribir encabezados
	for i, field := range fields {
		f.SetCellValue("Sheet1", fmt.Sprintf("%c1", rune('A'+i)), field)
	}

	// Escribir datos
	for rowIdx, row := range rows {
		for colIdx, field := range fields {
			value := row.Data[field]
			f.SetCellValue("Sheet1", fmt.Sprintf("%c%d", rune('A'+colIdx), rowIdx+2), value)
		}
	}

	fileName := filepath.Join(outputPath, "converted_data.xlsx")
	if err := f.SaveAs(fileName); err != nil {
		return "", err
	}

	return fileName, nil
}

func ConvertToCSV(rows []ImportedRow, outputPath string) (string, error) {
	// Obtener todos los campos únicos
	allFields := make(map[string]bool)
	for _, row := range rows {
		for field := range row.Data {
			allFields[field] = true
		}
	}

	// Crear lista de campos ordenada
	var fields []string
	for field := range allFields {
		fields = append(fields, field)
	}

	fileName := filepath.Join(outputPath, "converted_data.csv")
	file, err := os.Create(fileName)
	if err != nil {
		return "", err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// Escribir encabezados
	writer.Write(fields)

	// Escribir datos
	for _, row := range rows {
		var record []string
		for _, field := range fields {
			value := fmt.Sprintf("%v", row.Data[field])
			record = append(record, value)
		}
		writer.Write(record)
	}

	return fileName, nil
}

func ConvertToJSON(rows []ImportedRow, outputPath string) (string, error) {
	var jsonData []map[string]interface{}
	for _, row := range rows {
		jsonData = append(jsonData, row.Data)
	}

	jsonBytes, err := json.MarshalIndent(jsonData, "", "  ")
	if err != nil {
		return "", err
	}

	fileName := filepath.Join(outputPath, "converted_data.json")
	err = os.WriteFile(fileName, jsonBytes, 0644)
	if err != nil {
		return "", err
	}

	return fileName, nil
}

// ============================================================
// VALIDAR FORMATO DE ARCHIVO
// ============================================================

func ValidateFileFormat(filePath string) (bool, string) {
	format := DetectFileFormat(filePath)

	if format == FormatUnknown {
		return false, "Formato de archivo no soportado"
	}

	// Verificar que el archivo existe
	if _, err := os.Stat(filePath); err != nil {
		return false, "Archivo no encontrado"
	}

	// Validaciones específicas por formato
	switch format {
	case FormatExcel:
		f, err := excelize.OpenFile(filePath)
		if err != nil {
			return false, "Archivo Excel inválido"
		}
		f.Close()
		return true, "Excel válido"

	case FormatCSV:
		file, err := os.Open(filePath)
		if err != nil {
			return false, "Archivo CSV inválido"
		}
		defer file.Close()

		reader := csv.NewReader(file)
		_, err = reader.Read()
		if err != nil {
			return false, "Archivo CSV sin encabezados"
		}
		return true, "CSV válido"

	case FormatJSON:
		fileContent, err := os.ReadFile(filePath)
		if err != nil {
			return false, "Archivo JSON inválido"
		}

		var jsonData []map[string]interface{}
		err = json.Unmarshal(fileContent, &jsonData)
		if err != nil {
			return false, "JSON no es un array de objetos"
		}
		return true, "JSON válido"

	default:
		return true, fmt.Sprintf("%s válido", format)
	}
}

// ============================================================
// OBTENER ESTADÍSTICAS DE ARCHIVO
// ============================================================

type FileStatistics struct {
	Format    string
	RowCount  int
	FieldCount int
	FileSize  int64
	Fields    []string
}

func GetFileStatistics(filePath string) (*FileStatistics, error) {
	rows, err := ImportFromFile(filePath)
	if err != nil {
		return nil, err
	}

	fileInfo, _ := os.Stat(filePath)

	// Obtener campos únicos
	fieldMap := make(map[string]bool)
	for _, row := range rows {
		for field := range row.Data {
			fieldMap[field] = true
		}
	}

	var fields []string
	for field := range fieldMap {
		fields = append(fields, field)
	}

	return &FileStatistics{
		Format:     string(DetectFileFormat(filePath)),
		RowCount:   len(rows),
		FieldCount: len(fields),
		FileSize:   fileInfo.Size(),
		Fields:     fields,
	}, nil
}
