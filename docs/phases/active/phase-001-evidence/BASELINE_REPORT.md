# PHASE-001 — Baseline report (rondas 1 y 2)

## Control de ejecución

- Repositorio: `ariveratij40-lab/Skia-Dcim-V2`.
- Rama: `phase/001-execution`.
- Rama remota seguida: `origin/phase/001-execution`.
- Baseline autorizado y HEAD evaluado: `214e84da113cdb46f9309e72d7f5748a3d1ddca3`.
- Fecha: `2026-08-13` (`America/Tijuana`).
- Alcance ejecutado: inspección estática local, determinación de pruebas localmente viables, pruebas Go sin tag de integración y build local del backend.
- Acceso a VPS o servicios staging: no realizado.
- Correcciones: ninguna.

## Resumen ejecutivo

La arquitectura observada coincide en lo esencial con `ARCHITECTURE.md`: frontend Next.js, backend Go, PostgreSQL, Redis, Docker Compose y Nginx. La primera ronda confirma que el repositorio permite continuar con análisis y pruebas unitarias Go locales, pero no permite afirmar el comportamiento del VPS.

Se identifican como riesgos principales: secretos literales versionados, riesgo estático de reproducibilidad de la imagen frontend por un archivo requerido ausente, convivencia de tres mecanismos de migración, dos SQL con prefijo `015`, diferencias entre documentación y árbol actual, respaldos/binarios versionados y un fallo real de la suite Go local. Los hallazgos no fueron corregidos.

## Inventario de componentes

| Componente | Evidencia local | Estado |
| --- | --- | --- |
| Backend | Go `1.25` declarado; `backend/main.go`; API `net/http`; puerto 8080 | APROBADO |
| Frontend | Next.js 14, React 18, TypeScript; Pages Router; puerto 3000 | APROBADO |
| Datos | PostgreSQL 16 declarado en Compose | APROBADO |
| Caché | Redis 7 declarado en Compose | APROBADO |
| Contenedores | `docker-compose.yml`, Dockerfiles backend/frontend | APROBADO |
| Entrada HTTP | `nginx/20-skia-staging.conf` | APROBADO |
| Herramientas locales | Go `1.26.5`; Node/npm y Docker no detectados | APROBADO |

## Hallazgos

### BL-001 — Arquitectura y puntos de entrada identificables

- Origen de evidencia: `LOCAL`.
- Estado: `APROBADO`.
- Evidencia resumida: backend en `backend/main.go`; frontend mediante `frontend/pages/_app.tsx` y `frontend/pages/index.tsx`; servicios declarados en Compose y proxy Nginx.
- Riesgo: bajo; la evidencia es estática y no confirma ejecución en VPS.
- Recomendación: usar este inventario como referencia para la matriz de pruebas.
- Fase correctiva sugerida: no aplica.

### BL-002 — Riesgo estático de reproducibilidad de la imagen frontend

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO` (inspección estática; no es resultado de `docker build`).
- Evidencia resumida: `frontend/Dockerfile` copia `frontend/next.config.js`, pero ese archivo no existe en el baseline. Docker no está disponible y la imagen no fue construida.
- Riesgo: alto; la referencia ausente compromete la reproducibilidad declarada, pero el fallo empírico de `docker build` no ha sido demostrado.
- Recomendación: confirmar mediante build en un entorno autorizado y definir una fase correctiva sin corregirlo dentro de PHASE-001.
- Fase correctiva sugerida: `PHASE-CORR-FRONTEND-BUILD`.

### BL-003 — Build de aplicación Next.js no ejecutado

- Origen de evidencia: `LOCAL`.
- Estado: `BLOQUEADO`.
- Evidencia resumida: `npm run build` no fue ejecutado porque Node/npm no están disponibles y `frontend/node_modules` está ausente. No se instalaron dependencias. No se afirma que el build Next.js falle.
- Riesgo: medio; esta estación no puede producir evidencia del build de aplicación.
- Recomendación: proporcionar un runner autorizado y reproducible o ejecutar en CI sin corregir hallazgos durante PHASE-001.
- Fase correctiva sugerida: no aplica; requisito de ejecución de PHASE-001.

### BL-004 — Estado del staging real no verificable desde el repositorio local

- Origen de evidencia: `STAGING VPS`, `POSTGRES STAGING`, `HTTP STAGING`.
- Estado: `BLOQUEADO`.
- Evidencia resumida: no existe un mecanismo de acceso al VPS expresamente autorizado para esta ejecución.
- Riesgo: alto; no se puede inferir disponibilidad, configuración efectiva, rol PostgreSQL, RLS ni flujos HTTP reales desde evidencia local.
- Recomendación: habilitar un mecanismo de acceso de solo lectura/ejecución controlada con credenciales suministradas de forma segura.
- Fase correctiva sugerida: no aplica; bloqueo operativo de PHASE-001.

### BL-005 — Documentación operativa desalineada

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: README/SETUP mencionan archivos Compose, archivos `.env` y documentos que no existen en el árbol actual.
- Riesgo: medio; puede inducir despliegues o configuraciones incorrectos.
- Recomendación: corregir documentación en una fase posterior basada en el flujo operativo canónico.
- Fase correctiva sugerida: `PHASE-CORR-DOCUMENTATION`.

### BL-006 — Configuración declarada no equivale a estado efectivo

- Origen de evidencia: `LOCAL`.
- Estado: `APROBADO`.
- Evidencia resumida: Compose declara nombres staging, red externa y puertos enlazados a loopback; Nginx declara proxy TLS a frontend/API.
- Riesgo: medio; no demuestra que el VPS utilice exactamente estos archivos ni estos valores.
- Recomendación: contrastar más adelante con evidencia `STAGING VPS` expresamente autorizada.
- Fase correctiva sugerida: no aplica.

### BL-007 — Suite Go local falla durante ejecución

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: `env GOCACHE=/private/tmp/skia-phase001-go-cache go test ./...` terminó con exit code `1` en aproximadamente 6.62 s. `TestHandleInventoryImportRoutes_DetailValid` produjo un `nil pointer dereference` al llegar a `ExtractSessionContextSecure` con una DB nula. Las pruebas con tag `integration` no fueron incluidas.
- Riesgo: alto; la suite predeterminada no está verde y un handler test no dispone correctamente su dependencia de base de datos.
- Recomendación: registrar y aislar la causa en una fase correctiva; no corregir durante PHASE-001.
- Fase correctiva sugerida: `PHASE-CORR-GO-TESTS`.

### BL-008 — Backend Go compila localmente

- Origen de evidencia: `LOCAL`.
- Estado: `APROBADO`.
- Evidencia resumida: `env GOCACHE=/private/tmp/skia-phase001-go-cache go build -trimpath -o /private/tmp/skia-phase001-backend-audit .` terminó con exit code `0` en aproximadamente 5.32 s. Produjo un binario Mach-O arm64 de 14,645,922 bytes, que no fue ejecutado y se eliminó al terminar.
- Riesgo: bajo/medio; prueba compilación para macOS arm64, no el build Alpine ni el VPS.
- Recomendación: conservar separado de futuros resultados `CONTAINER LOCAL` o `STAGING VPS`.
- Fase correctiva sugerida: no aplica.

### BL-009 — Módulo, checksums y configuración Go

- Origen de evidencia: `LOCAL`.
- Estado: `APROBADO`.
- Evidencia resumida: `backend/go.mod` declara Go `1.25.0`; el runner usa Go `1.26.5`; `go env` resolvió el módulo correcto. La prueba llegó a ejecución y el build terminó correctamente, por lo que las dependencias y checksums requeridos fueron resolubles. Los hashes de `go.mod` y `go.sum` fueron idénticos antes y después.
- Riesgo: bajo; no constituye verificación exhaustiva de todas las dependencias opcionales o de integración.
- Recomendación: repetir en el toolchain/imagen canónicos cuando estén disponibles.
- Fase correctiva sugerida: no aplica.

## Variables de entorno referenciadas

La inspección de nombres, sin leer ni reproducir valores, identificó:

- Backend/runtime: `ADMIN_PASSWORD`, `AI_MODEL`, `APP_BASE_URL`, `DATABASE_URL`, `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`, `GROQ_API_KEY`, `OLLAMA_URL`, `OPENAI_API_BASE`, `OPENAI_API_KEY`, `PORT`, `RESEND_API_KEY`, `UPLOADS_DIR`.
- Pruebas Go de integración: `TEST_DATABASE_URL`, `TEST_ADMIN_DATABASE_URL`.
- Compose/host: `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `SKIA_RUNTIME_DB_PASSWORD`.
- Frontend: `NEXT_PUBLIC_API_URL`.

## Conclusión de ronda 2

Las validaciones locales fueron ejecutadas y documentadas correctamente. El backend compila, pero la suite Go predeterminada falla. El frontend y los contenedores no fueron construidos. SKIA no queda técnicamente aprobado para avanzar: persisten hallazgos `FALLIDO` y validaciones de staging `BLOQUEADO`/`NO EJECUTADO`.
