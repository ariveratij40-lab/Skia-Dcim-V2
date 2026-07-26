# Sistema Empresarial de Importación de Inventarios - SKIA DCIM

## 📋 Descripción General

Sistema completo de importación de inventarios con arquitectura empresarial de 10 pasos, validación inteligente, detección de duplicados y procesamiento en background.

## 🏗️ Arquitectura

### Componentes Implementados

#### 1. **Base de Datos (SQL)**
- `inventory_imports` - Registro principal de importaciones
- `inventory_import_rows` - Filas individuales con estado
- `import_validation_results` - Resultados de validaciones
- `import_duplicates` - Duplicados detectados
- `import_logs` - Historial de eventos
- `audit_logs` - Registro de auditoría permanente
- `import_templates` - Plantillas por tipo de activo
- `import_reports` - Reportes generados

#### 2. **Backend (Go)**

**Módulos principales:**

- `enterprise_validator.go` - Motor de validación por tipo de activo
- `duplicate_detector.go` - Detección de duplicados y UPSERT
- `enterprise_import_workflow.go` - Flujo de 10 pasos
- `report_generator.go` - Generación de reportes (Excel, CSV, JSON)
- `multi_format_importer.go` - Soporte para múltiples formatos
- `background_processor.go` - Procesamiento asincrónico con WebSockets

#### 3. **Frontend (React/TypeScript)**

- `EnterpriseImportFlow.tsx` - UI para los 10 pasos
- Interfaz visual con progreso en tiempo real
- Vista previa editable de datos
- Correcciones por usuario
- Descarga de reportes

## 🔄 Flujo de 10 Pasos

```
1. SUBIDA
   └─ Usuario selecciona archivo (PDF, Excel, CSV, JSON)
   
2. EXTRACCIÓN
   └─ Modelo BD2026 o LLM extrae datos del archivo
   
3. NORMALIZACIÓN
   └─ Normaliza campos según tipo de activo
   
4. VALIDACIÓN
   └─ Valida cada campo según reglas específicas
   
5. DETECCIÓN DE DUPLICADOS
   └─ Busca activos existentes similares
   
6. VISTA PREVIA
   └─ Muestra datos para revisión del usuario
   
7. CORRECCIONES
   └─ Usuario puede corregir errores/advertencias
   
8. APROBACIÓN
   └─ Usuario aprueba la importación
   
9. GUARDADO
   └─ UPSERT atómico en base de datos
   
10. REPORTES
    └─ Genera reportes automáticos
```

## 📊 Validadores por Tipo de Activo

### Switch
- Campos requeridos: nombre, modelo, serial
- Validaciones: MAC válido, IP válido, puerto numérico
- Búsqueda de duplicados: serial, MAC, IP

### Rack
- Campos requeridos: nombre, altura
- Validaciones: altura numérica (1-50)
- Búsqueda de duplicados: nombre, código interno

### UPS/PDU
- Campos requeridos: nombre, capacidad
- Validaciones: capacidad numérica, voltaje válido
- Búsqueda de duplicados: serial, código interno

### Patch Panel
- Campos requeridos: nombre, puertos
- Validaciones: puertos numérico (1-1000)
- Búsqueda de duplicados: nombre, código interno

### Nodo
- Campos requeridos: nombre, jack origen, jack destino
- Validaciones: jacks válidos
- Búsqueda de duplicados: jacks, nombre

### Backbone
- Campos requeridos: nombre, tipo fibra
- Validaciones: tipo fibra válido (SM, MM)
- Búsqueda de duplicados: nombre, tipo

### Fibra
- Campos requeridos: nombre, longitud
- Validaciones: longitud numérica
- Búsqueda de duplicados: nombre, código interno

### Servidor
- Campos requeridos: nombre, hostname
- Validaciones: hostname válido, IP válida
- Búsqueda de duplicados: hostname, MAC, IP

## 🔍 Detección de Duplicados

**Algoritmo:**
1. Busca coincidencias exactas en campos clave
2. Calcula confianza (70-100%)
3. Si confianza > 70%: marca como duplicado
4. UPSERT automático: actualiza existente

**Campos clave por tipo:**
- Switch: serial_number, mac, ip
- Rack: internal_code, nombre
- UPS: serial_number, internal_code
- Patch Panel: internal_code, nombre
- Nodo: jack_origen, jack_destino
- Backbone: nombre, tipo_fibra
- Fibra: nombre, internal_code
- Servidor: hostname, mac, ip

## 📁 Formatos Soportados

### Entrada
- ✅ PDF (extracción de tablas)
- ✅ Excel (.xlsx, .xls)
- ✅ CSV
- ✅ JSON (array de objetos)
- ⚠️ Word (.docx) - requiere conversión

### Salida (Reportes)
- ✅ Excel (múltiples hojas: resumen, errores, duplicados, datos)
- ✅ CSV (datos tabulares)
- ✅ JSON (estructura completa)

## 🚀 Procesamiento en Background

**Características:**
- WebSocket para actualizaciones en tiempo real
- Progreso visual (0-100%)
- Cancelación de jobs
- Modo simulación (sin guardar)
- Limpieza automática de jobs antiguos

**API Endpoints:**
```
GET /api/import/job-status?job_id=...
GET /api/import/active-jobs
POST /api/import/cancel-job?job_id=...
WS /api/import/job-ws?job_id=...
```

## 🔐 Seguridad

**Características implementadas:**
- Transacciones atómicas con rollback
- Validación de entrada en cada paso
- Auditoría completa de cambios
- Soporte multi-tenant
- Permisos por rama (branch)
- Registro de usuario que realizó importación

## 📈 Estadísticas

Cada importación registra:
- Total de filas procesadas
- Filas correctas
- Filas con advertencias
- Filas con errores
- Duplicados detectados
- Activos insertados
- Activos actualizados
- Duración total

## 🔧 Integración

### 1. Registrar Rutas en main.go

```go
// Paso 1: Subida
http.HandleFunc("/api/import/step1-upload", func(w http.ResponseWriter, r *http.Request) {
    HandleStep1FileUpload(w, r, db)
})

// Paso 2: Extracción
http.HandleFunc("/api/import/step2-extraction", func(w http.ResponseWriter, r *http.Request) {
    HandleStep2Extraction(w, r, db)
})

// ... (pasos 3-10)

// WebSocket
http.HandleFunc("/api/import/job-ws", HandleJobWebSocket)
http.HandleFunc("/api/import/job-status", HandleGetJobStatus)
http.HandleFunc("/api/import/active-jobs", HandleListActiveJobs)
http.HandleFunc("/api/import/cancel-job", HandleCancelJob)
```

### 2. Inicializar en main()

```go
func main() {
    // ... conexión a BD ...
    
    // Inicializar procesador en background
    InitBackgroundProcessor()
    
    // Iniciar servidor
    http.ListenAndServe(":8080", nil)
}
```

### 3. Actualizar AppLayout

```tsx
<NavLink href="/infraestructura/import-enterprise">
  <Icon>📊</Icon>
  Importación Empresarial
</NavLink>
```

## 📝 Ejemplos de Uso

### Importar desde Excel

```bash
curl -X POST http://localhost:8080/api/import/step1-upload \
  -F "file=@inventario.xlsx" \
  -F "asset_type=switch" \
  -F "tenant_id=default" \
  -F "branch_id=default" \
  -F "user_id=user123"
```

### Obtener Estado del Job

```bash
curl http://localhost:8080/api/import/job-status?job_id=job_1_123456
```

### Conectar WebSocket

```javascript
const ws = new WebSocket('ws://localhost:8080/api/import/job-ws?job_id=job_1_123456');

ws.onmessage = (event) => {
  const job = JSON.parse(event.data);
  console.log(`Progreso: ${job.progress}% - ${job.message}`);
};
```

## 🧪 Modo Simulación

Para probar sin guardar datos:

```bash
curl -X POST http://localhost:8080/api/import/simulate \
  -H "Content-Type: application/json" \
  -d '{"import_id": 1, "simulate": true}'
```

## 📊 Reportes Automáticos

Los reportes se generan automáticamente al completar la importación:

**Excel:**
- Hoja 1: Resumen (estadísticas generales)
- Hoja 2: Errores (detalle de validaciones fallidas)
- Hoja 3: Duplicados (coincidencias encontradas)
- Hoja 4: Datos (activos importados)

**CSV:**
- Formato tabular con todos los campos

**JSON:**
- Estructura completa con metadatos

## 🔍 Auditoría

Todos los cambios se registran en `audit_logs`:

```sql
SELECT * FROM audit_logs 
WHERE import_id = 1 
ORDER BY created_at DESC;
```

Eventos registrados:
- file_uploaded
- extraction_completed
- validation_completed
- duplicate_detection_completed
- user_corrected
- import_approved
- import_completed

## ⚡ Optimizaciones

- Índices en campos de búsqueda de duplicados
- Paginación de filas grandes
- Caché de validadores
- Limpieza automática de jobs antiguos
- Compresión de reportes

## 🐛 Troubleshooting

**Problema:** "Error al procesar el PDF"
- Solución: Verificar que pdfplumber está instalado en el contenedor

**Problema:** "Duplicados no se detectan"
- Solución: Verificar que los campos clave existen en los datos

**Problema:** "WebSocket desconectado"
- Solución: Verificar que el job_id es válido

## 📚 Referencias

- Reporte de Auditoría: ResumenAuditoriaModuloActivos.txt
- Esquema de BD: 010_enterprise_import_schema.sql
- Modelos de validación: enterprise_validator.go

## 🎯 Próximos Pasos

1. ✅ Integrar con AppLayout
2. ✅ Registrar rutas en main.go
3. ✅ Reconstruir backend y frontend
4. ✅ Pruebas de importación
5. ✅ Generación de reportes
6. ✅ Monitoreo en producción

---

**Versión:** 1.0.0  
**Última actualización:** 2026-07-24  
**Estado:** ✅ Completo
