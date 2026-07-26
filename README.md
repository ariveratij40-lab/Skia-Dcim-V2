# SKIA DCIM V2 - Julio 2026

**Plataforma empresarial de gestión de infraestructura física de cableado (DCIM) con importación inteligente de inventarios.**

## 🎯 Descripción General

SKIA DCIM es una solución integral para la gestión de infraestructura de centros de datos, que incluye:

- **Gestión de activos**: Switches, racks, UPS/PDU, patch panels, nodos, backbones, fibra óptica y servidores
- **Importación empresarial**: Sistema de 10 pasos con validación inteligente, detección de duplicados y procesamiento asincrónico
- **Topología de red**: Visualización isométrica de la infraestructura
- **Auditoría completa**: Registro de todos los cambios y operaciones
- **Multi-tenant**: Soporte para múltiples organizaciones y sucursales
- **Certificación**: Integración con certificados de cableado (Panduit, etc.)

## 🏗️ Arquitectura

### Stack Tecnológico

| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| **Backend** | Go | 1.21+ |
| **Frontend** | Next.js + React | 14+ |
| **Base de datos** | PostgreSQL | 16 |
| **Cache** | Redis | 7 |
| **Contenedorización** | Docker Compose | 3.8 |
| **Reverse Proxy** | Nginx | (global) |

### Estructura del Proyecto

```
Skia-Dcim-V2/
├── backend/                      # API Go (34 módulos)
│   ├── main.go                  # Punto de entrada
│   ├── enterprise_validator.go  # Motor de validación
│   ├── duplicate_detector.go    # Detección de duplicados
│   ├── import_handlers.go       # Handlers de importación
│   ├── dcim_assets.go           # Gestión de activos
│   ├── migrations/              # Migraciones SQL
│   ├── Dockerfile               # Build del contenedor
│   ├── go.mod / go.sum          # Dependencias
│   └── *.go                     # Módulos especializados
├── frontend/                     # Aplicación Next.js
│   ├── pages/                   # Rutas y vistas
│   ├── components/              # Componentes React
│   ├── styles/                  # Estilos (Tailwind CSS)
│   ├── package.json             # Dependencias Node
│   ├── Dockerfile               # Build del contenedor
│   └── tsconfig.json            # Configuración TypeScript
├── migrations/                   # Scripts SQL de base de datos
│   ├── 001_init.sql             # Esquema inicial
│   ├── 004_dcim_inventory_schema.sql
│   ├── 010_create_inventory_imports_schema.sql
│   └── ...
├── docker-compose.yml            # Orquestación de servicios
├── docker-compose.staging.yml    # Configuración staging
├── docker-compose.prod.yml       # Configuración producción
├── .env.staging.example          # Variables de entorno (staging)
├── .env.prod.example             # Variables de entorno (producción)
├── deploy_enterprise_system.sh   # Script de despliegue
├── ENTERPRISE_IMPORT_GUIDE.md    # Guía de importación
├── INTEGRATION_CHECKLIST.md      # Checklist de integración
└── docs/                         # Documentación adicional
```

## 🚀 Inicio Rápido

### Requisitos Previos

- Docker & Docker Compose
- SSH configurado para acceso al VPS
- Credenciales de base de datos
- Variables de entorno configuradas

### Despliegue en VPS

```bash
# 1. Clonar el repositorio
git clone https://github.com/ariveratij40-lab/Skia-Dcim-V2.git
cd Skia-Dcim-V2

# 2. Configurar variables de entorno
cp .env.staging.example .env.staging
# Editar .env.staging con tus credenciales

# 3. Iniciar los servicios
docker-compose -f docker-compose.staging.yml up -d

# 4. Ejecutar migraciones
docker-compose exec skia_api_staging go run main.go -migrate

# 5. Verificar salud
curl http://localhost:8080/api/health
curl http://localhost:3000
```

### Acceso a Servicios

| Servicio | URL | Usuario | Contraseña |
|----------|-----|---------|-----------|
| **Frontend** | http://localhost:3000 | - | - |
| **Backend API** | http://localhost:8080 | - | - |
| **pgAdmin** | http://localhost:5050 | admin@skia.dev | admin |
| **PostgreSQL** | localhost:5432 | skia_user | skia_dev_pass |
| **Redis** | localhost:6379 | - | skia_redis_dev |

## 📊 Módulos Principales

### Backend (Go)

**Gestión de Activos:**
- `dcim_assets.go` - CRUD de activos (switches, racks, etc.)
- `dcim_assets_handler.go` - Handlers HTTP para activos
- `infraestructura.go` - Gestión de infraestructura

**Importación Empresarial:**
- `enterprise_validator.go` - Validación por tipo de activo
- `duplicate_detector.go` - Detección inteligente de duplicados
- `enterprise_import_workflow.go` - Flujo de 10 pasos
- `import_handlers.go` - Handlers de importación
- `import_inventory.go` - Lógica de inventario
- `report_generator.go` - Generación de reportes

**Procesamiento:**
- `background_processor.go` - Jobs asincrónico con WebSocket
- `multi_format_importer.go` - Soporte PDF, Excel, CSV, JSON
- `ai_pdf_processor.go` - Extracción de datos con IA

**Seguridad:**
- `session_context.go` - Contexto de sesión multi-tenant
- `postgres_session_store.go` - Almacenamiento de sesiones
- `enterprise_validator.go` - Validaciones de seguridad

### Frontend (React/TypeScript)

**Páginas Principales:**
- `/dashboard` - Panel de control
- `/infraestructura/activos` - Gestión de activos
- `/infraestructura/topologia` - Visualización de topología
- `/infraestructura/import-inventory` - Importación de inventarios
- `/administracion` - Panel de administración

**Componentes Especializados:**
- `EnterpriseImportFlow.tsx` - UI de importación de 10 pasos
- `IsometricTopology.tsx` - Visualización 3D de infraestructura
- `MdfIdfWizard.tsx` - Asistente para MDF/IDF
- `SwitchAdmin.tsx` - Administración de switches
- `AICopilotPanel.tsx` - Asistente IA integrado

## 🔄 Flujo de Importación Empresarial (10 Pasos)

```
1. SUBIDA          → Usuario carga archivo (PDF, Excel, CSV, JSON)
2. EXTRACCIÓN      → Extrae datos del archivo (modelo BD2026 o LLM)
3. NORMALIZACIÓN   → Normaliza campos según tipo de activo
4. VALIDACIÓN      → Valida cada campo según reglas específicas
5. DUPLICADOS      → Detecta activos existentes similares
6. VISTA PREVIA    → Muestra datos para revisión
7. CORRECCIONES    → Usuario corrige errores/advertencias
8. APROBACIÓN      → Usuario aprueba la importación
9. GUARDADO        → UPSERT atómico en base de datos
10. REPORTES       → Genera reportes automáticos (Excel, CSV, JSON)
```

## 🗄️ Base de Datos

### Esquemas Principales

**Inventario:**
- `activos` - Registro principal de activos
- `switches`, `racks`, `ups_pdus`, `patch_panels`, `nodos`, `backbones`, `fibras`, `servidores`

**Importación:**
- `inventory_imports` - Registro de importaciones
- `inventory_import_rows` - Filas individuales
- `import_validation_results` - Resultados de validación
- `import_duplicates` - Duplicados detectados
- `import_templates` - Plantillas por tipo

**Auditoría:**
- `audit_logs` - Registro de todos los cambios
- `import_logs` - Historial de eventos de importación

### Migraciones

Se ejecutan automáticamente al iniciar:

```sql
001_init.sql                    -- Esquema base
002_seed.sql                    -- Datos iniciales
003_rbac_validation_data.sql    -- RBAC y validaciones
004_dcim_inventory_schema.sql   -- Esquema DCIM
005_dcim_seed.sql               -- Datos DCIM
006_config_admin_schema.sql     -- Configuración
007_fix_password_hashes.sql     -- Correcciones
009_add_unique_branches_constraint.sql
010_create_inventory_imports_schema.sql
```

## 🔐 Seguridad

- ✅ Autenticación JWT con sesiones
- ✅ Multi-tenant con aislamiento de datos
- ✅ RBAC (Role-Based Access Control) granular
- ✅ Transacciones atómicas con rollback
- ✅ Auditoría completa de cambios
- ✅ Variables de entorno para secretos
- ✅ Validación de entrada en cada paso

## 📝 Configuración

### Variables de Entorno (.env.staging)

```bash
# Base de datos
DB_HOST=skia_postgres_staging
DB_PORT=5432
DB_NAME=skia_db
DB_USER=skia_user
DB_PASSWORD=skia_dev_pass

# Redis
REDIS_HOST=skia_redis
REDIS_PORT=6379
REDIS_PASSWORD=skia_redis_dev

# JWT
JWT_SECRET=skia_dev_jwt_secret_change_in_prod

# APIs Externas
OPENAI_API_KEY=${OPENAI_API_KEY}
GROQ_API_KEY=${GROQ_API_KEY}

# Aplicación
APP_ENV=development
PORT=8080
UPLOADS_DIR=/app/uploads
```

## 🧪 Testing

```bash
# Tests unitarios
cd backend
go test ./...

# Tests de integración
go test -tags=integration ./...

# Coverage
go test -cover ./...
```

## 📊 Monitoreo

### Health Checks

```bash
# Backend
curl http://localhost:8080/api/health

# Frontend
curl http://localhost:3000

# Base de datos
docker-compose exec skia_postgres_staging pg_isready
```

### Logs

```bash
# Backend
docker-compose logs -f skia_api_staging

# Frontend
docker-compose logs -f skia_web_staging

# Base de datos
docker-compose logs -f skia_postgres_staging
```

## 🚢 Despliegue a Producción

### Preparación

1. Revisar `INTEGRATION_CHECKLIST.md`
2. Configurar `.env.prod` con credenciales reales
3. Ejecutar `deploy_enterprise_system.sh`

```bash
# Despliegue automático
./deploy_enterprise_system.sh

# O manual
docker-compose -f docker-compose.prod.yml up -d
```

## 📚 Documentación Adicional

- **[ENTERPRISE_IMPORT_GUIDE.md](./ENTERPRISE_IMPORT_GUIDE.md)** - Guía completa de importación
- **[INTEGRATION_CHECKLIST.md](./INTEGRATION_CHECKLIST.md)** - Checklist de integración
- **[VALIDACION_PRE_ENTREGA.md](./VALIDACION_PRE_ENTREGA.md)** - Validaciones pre-entrega
- **[docs/](./docs/)** - Documentación técnica adicional

## 🤝 Contribución

1. Crear rama desde `main`: `git checkout -b feature/nueva-funcionalidad`
2. Hacer commits descriptivos
3. Push a la rama
4. Crear Pull Request

## 📄 Licencia

MIT License - Ver [LICENSE](./LICENSE)

## 👥 Contacto

Para soporte o preguntas sobre SKIA DCIM V2, contacta al equipo de desarrollo.

---

**Versión:** 2.0.0 (Julio 2026)  
**Última actualización:** 2026-07-26  
**Estado:** ✅ Producción Ready
