# Arquitectura actual de SKIA

Este documento describe únicamente la arquitectura observable en el repositorio actual. No representa componentes futuros ni una arquitectura objetivo.

## Estado del entorno

SKIA opera exclusivamente en **STAGING**. No existe producción operativa y los datos actuales son de prueba. El dominio previsto para un futuro entorno productivo es `skia.mx`, condicionado a la aprobación de la primera fase funcional de staging.

## Vista general

SKIA es una aplicación web DCIM compuesta por un frontend Next.js, una API HTTP en Go, PostgreSQL, Redis y un reverse proxy Nginx. Los servicios se describen en `docker-compose.yml` y comparten la red Docker externa `infra_network`.

## Backend

- Ubicación: `backend/`.
- Lenguaje y módulo: Go 1.25, módulo `skia-backend`.
- Punto de entrada: `backend/main.go`, función `main()`.
- Servidor: `net/http` con rutas registradas sobre `http.DefaultServeMux`.
- Puerto predeterminado: `8080`.
- Persistencia: PostgreSQL mediante `github.com/lib/pq` y la variable `DATABASE_URL`.
- Sesiones: almacenamiento de sesiones en PostgreSQL.
- Capacidades observadas: autenticación, OAuth de Google, RBAC, contexto multi-tenant y de sucursal, activos DCIM, importación de inventario, procesamiento en segundo plano, WebSocket, generación de reportes y procesamiento de PDF/Excel.
- El arranque inicializa el almacén de sesiones, ejecuta `runMigrations(db)` y registra las rutas HTTP.

## Frontend

- Ubicación: `frontend/`.
- Framework: Next.js 14 con React 18 y TypeScript.
- Enrutamiento: Pages Router bajo `frontend/pages/`.
- Inicialización global: `frontend/pages/_app.tsx`.
- Ruta raíz: `frontend/pages/index.tsx`, que redirige a `/login`.
- Puerto del contenedor: `3000`.
- Comunicación HTTP: Axios; la URL de la API se obtiene de `NEXT_PUBLIC_API_URL`.
- UI y cliente: Tailwind CSS, Zustand, Recharts, Lucide React, PDF.js, jsPDF y html2canvas.

## Datos y migraciones

- Motor: PostgreSQL 16.
- Los SQL versionados en `migrations/` se montan en `/docker-entrypoint-initdb.d` para inicializar volúmenes nuevos.
- Existe una migración adicional en `backend/migrations/`.
- `backend/migrations.go` contiene migraciones embebidas y registra versiones en `schema_migrations`.
- El repositorio contiene lógica de aislamiento multi-tenant, contexto de sucursal y políticas RLS.
- `ops/` contiene SQL operativo relacionado con roles de ejecución y RLS.

## Caché y servicios auxiliares

- Redis 7 se ejecuta como servicio de Compose con persistencia habilitada.
- pgAdmin está incluido como herramienta de administración de PostgreSQL.
- El backend incluye soporte para WebSocket, Excel y procesamiento de PDF.

## Contenedores y red

`docker-compose.yml` define los servicios:

- `skia_postgres_staging`.
- `skia_redis`.
- `skia_pgadmin`.
- `skia_api_staging`.
- `skia_web_staging`.

Los servicios usan la red externa `infra_network`. PostgreSQL, Redis, la API, el frontend y pgAdmin publican sus puertos solamente en `127.0.0.1`.

## Entrada HTTP y staging

`nginx/20-skia-staging.conf` configura terminación TLS y proxy inverso para los nombres observados `skia.iamet.mx` y `mvp.skia.iamet.mx`:

- `/api/` y `/uploads/` se envían a `skia_api_staging:8080`.
- El resto del tráfico se envía a `skia_web_staging:3000`.

Esta configuración pertenece al staging actual; no constituye un despliegue productivo.

## Flujo de dependencias

1. El navegador accede a Nginx.
2. Nginx dirige la interfaz al frontend Next.js y las rutas de API o archivos al backend Go.
3. El frontend consume la API Go.
4. El backend usa PostgreSQL para datos y sesiones, y dispone de Redis como servicio de infraestructura.

## Restricciones arquitectónicas

La arquitectura, el modelo multi-tenant, RLS, la seguridad y el esquema de base de datos solo pueden cambiar dentro del alcance explícito de una fase. Toda modificación estructural requiere una decisión arquitectónica documentada previamente. Las migraciones existentes no deben reescribirse sin esa decisión explícita.

Las responsabilidades de aprobación se definen en `docs/governance/SOURCE_OF_TRUTH.md` y los controles de especificación, rollback, pruebas y baseline en `docs/governance/DEVELOPMENT_RULES.md`. Una propuesta técnica, incluso si proviene de un agente y resulta viable, no constituye por sí sola una decisión arquitectónica.
