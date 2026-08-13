# PHASE-001 — Baseline report (rondas 1, 2 y 3)

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

## Ronda 3 — Staging VPS

### Identidad de código observada

| Referencia | Repositorio/ruta | SHA | Observación |
| --- | --- | --- | --- |
| GitHub `main` / baseline PHASE-001 | `ariveratij40-lab/Skia-Dcim-V2` | `214e84da113cdb46f9309e72d7f5748a3d1ddca3` | Baseline autorizado. |
| Evidencia local publicada | `phase/001-execution` | `b0462252eb44e8f6723026172c1f6db92e9c0cbd` | Añade evidencia; no es código desplegado. |
| Checkout esperado del VPS | `/opt/apps/skia/staging` | `cc80606e744bf64e1534c4b6818d0ff2e29b5031` | Rama `main`, remoto `ariveratij40-lab/skia-platform`, árbol ampliamente modificado/no rastreado. |
| Release usado por API | `/opt/apps/skia/releases/d155910` | `d155910c231e96446672508534ccec83bf0d830f` | Checkout Git limpio; Compose label del contenedor API apunta a este release. |
| Fuente exacta de imagen web | Imagen `staging-skia_web_staging` | No demostrable | Sin etiqueta OCI de revisión; Compose label apunta al checkout staging. |

No existe un único “SHA del VPS” que represente todos los servicios. El SHA demostrable de la API desplegada es `d155910c231e96446672508534ccec83bf0d830f`; el frontend no expone una revisión fuente verificable.

### BL-010 — Checkout operativo diverge del repositorio canónico

- Origen de evidencia: `STAGING VPS`.
- Estado: `FALLIDO`.
- Evidencia resumida: `/opt/apps/skia/staging` usa el remoto `ariveratij40-lab/skia-platform`, SHA `cc80606…`, y contiene numerosos cambios staged/unstaged/untracked. No coincide con GitHub `main` ni con el baseline PHASE-001.
- Riesgo: crítico; no hay trazabilidad reproducible entre fuente canónica, checkout y servicios desplegados.
- Recomendación: diseñar una fase de convergencia y despliegue inmutable; no modificar el checkout durante PHASE-001.
- Fase correctiva sugerida: `PHASE-CORR-DEPLOYMENT-TRACEABILITY`.

### BL-011 — Servicios SKIA activos, sanos según Docker y sin reinicios

- Origen de evidencia: `STAGING VPS`.
- Estado: `APROBADO`.
- Evidencia resumida: API, PostgreSQL, web y dos Redis aparecen `running/healthy`; pgAdmin está `running` sin healthcheck; todos muestran `RestartCount=0`.
- Riesgo: medio; existen dos Redis y dos redes/configuraciones de Compose, lo que incrementa ambigüedad operativa.
- Recomendación: documentar cuál Redis y Compose son canónicos para cada servicio.
- Fase correctiva sugerida: `PHASE-CORR-DEPLOYMENT-TRACEABILITY`.

### BL-012 — Health HTTP básico disponible

- Origen de evidencia: `HTTP STAGING`.
- Estado: `APROBADO`.
- Evidencia resumida: API interna `http://127.0.0.1:8080/api/health`, frontend público y health público respondieron HTTP `200`.
- Riesgo: medio; solo demuestra disponibilidad no autenticada, no corrección funcional.
- Recomendación: conservar como smoke test y no extrapolar a login, tenant, branch o RLS.
- Fase correctiva sugerida: no aplica.

### BL-013 — Errores operativos visibles en logs

- Origen de evidencia: `STAGING VPS`.
- Estado: `FALLIDO`.
- Evidencia resumida: el API registra fallo de migración por permisos sobre `public`; API/PostgreSQL registran columnas/funciones ausentes; web registra Server Actions no encontradas.
- Riesgo: alto; indica divergencia de esquema y posibles despliegues frontend no coherentes.
- Recomendación: convertir cada error reproducible en fase correctiva después de cerrar la auditoría.
- Fase correctiva sugerida: `PHASE-CORR-MIGRATION-GOVERNANCE` y `PHASE-CORR-FRONTEND-DEPLOYMENT`.

## Conclusión de ronda 3

La auditoría remota de solo lectura se ejecutó correctamente. Los servicios básicos están disponibles, pero la trazabilidad Git/despliegue, el estado efectivo de RLS, los errores de migración/esquema y la ausencia de una revisión fuente verificable para el frontend impiden aprobar técnicamente a SKIA para avanzar.

## Ronda 4 — Autenticación y aislamiento funcional

### Descubrimiento seguro

- Origen de evidencia: `POSTGRES STAGING`, `STAGING VPS`.
- Estado: `APROBADO`.
- Evidencia resumida: existe un actor lógico (`actor_1`) con rol `admin`, asociado a `tenant_1` y `branch_1`. El correo no coincide con patrones demo/test. No se encontraron fixtures ni cuentas de prueba autorizadas. No se leyeron passwords, tokens, cookies ni IDs completos.
- Cobertura: 1 actor, 1 tenant y 1 branch.

El inventario no ofrece dos tenants o dos branches para probar cruces y el único actor no está clasificado como cuenta de prueba. Recuperar o resetear su contraseña está fuera de alcance. Por ello no se ejecutaron login, logout autenticado, selección de contexto ni consultas autenticadas.

### BL-014 — Acceso sin sesión falla cerrado

- Origen de evidencia: `HTTP STAGING`.
- Estado: `APROBADO`.
- Evidencia resumida: GET sin cookies a `/api/auth/me`, `/api/auth/tenants`, `/api/dcim/assets` y `/api/import/recent` respondió `401` en los cuatro casos. No se conservaron ni mostraron cuerpos completos.
- Riesgo: medio; confirma únicamente ausencia de acceso anónimo en esos endpoints.
- Recomendación: conservar como smoke test; validar rutas restantes en una futura matriz autenticada.
- Fase correctiva sugerida: según cobertura posterior.

### BL-015 — Sesiones existentes observables solo de forma agregada

- Origen de evidencia: `POSTGRES STAGING`.
- Estado: `APROBADO`.
- Evidencia resumida: 16 sesiones históricas, 14 expiradas y 2 no expiradas; ninguna carece de tenant o branch. No se leyeron tokens, session IDs ni usuarios asociados.
- Riesgo: medio; la presencia de sesiones no autoriza su uso y no prueba validación/revocación HTTP.
- Recomendación: usar exclusivamente cuentas/fixtures de prueba suministrados expresamente en una futura ronda.
- Fase correctiva sugerida: no aplica.

### BL-016 — Login y aislamiento cruzado bloqueados por falta de fixtures

- Origen de evidencia: `HTTP STAGING`, `POSTGRES STAGING`.
- Estado: `BLOQUEADO`.
- Evidencia resumida: no existe una cuenta de prueba utilizable sin recuperar credenciales; solo hay un tenant y una branch. No se intentó login, reset, reutilización de sesión ni modificación de usuarios.
- Riesgo: crítico; no se demostró el comportamiento funcional tenant/branch ni la relación entre filtros de aplicación y RLS.
- Recomendación: crear/proveer mediante una fase autorizada al menos dos tenants, dos branches por alcance relevante y actores segregados, con credenciales entregadas fuera del repositorio.
- Fase correctiva sugerida: fase de fixtures y validación de aislamiento por aprobar.

## Clasificación final de aislamiento

**C) Pruebas insuficientes/BLOQUEADAS.**

La aplicación bloquea los accesos sin sesión observados, pero no fue posible demostrar ni refutar cruces tenant/branch. PostgreSQL continúa mostrando RLS deshabilitado en las tablas auditadas, por lo que tampoco existe defensa en profundidad demostrada a nivel BD. Esta conclusión no permite declarar seguro el sistema.

## Conclusión de ejecución de PHASE-001

- **PHASE-001 ejecutada y auditada correctamente:** sí para las rondas autorizadas. Las pruebas no posibles quedaron explícitamente `BLOQUEADO` y no se ocultaron fallos.
- **SKIA técnicamente aprobado para avanzar:** no. Persisten RLS no habilitado, falta de trazabilidad del despliegue, divergencia de esquema, suite Go fallida y pruebas autenticadas/aislamiento cruzado sin ejecutar.
