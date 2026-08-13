# PHASE-001 — Hallazgos de seguridad (ronda 1)

Todos los valores sensibles están omitidos o representados como `[REDACTADO]`. Este informe no autoriza eliminación ni rotación.

## Clasificación de material sensible detectado

| Tipo | Ubicación versionada | Valor |
| --- | --- | --- |
| Password de base de datos | `docker-compose.yml`, documentación y scripts operativos | `[REDACTADO]` |
| Password de Redis | `docker-compose.yml`, documentación | `[REDACTADO]` |
| Password de pgAdmin | `docker-compose.yml`, documentación | `[REDACTADO]` |
| Secreto JWT | `docker-compose.yml`, documentación | `[REDACTADO]` |
| OAuth client secret | `docker-compose.yml` | `[REDACTADO]` |
| DSN con credenciales | `backend/main.go` | `[REDACTADO]` |
| Passwords/hashes de usuarios de prueba | `migrations/`, documentación y dump versionado | `[REDACTADO]` |

La recomendación de contención o rotación expresa una medida futura condicionada. PHASE-001 no autoriza ejecutarla.

## SEC-001 — Secretos literales versionados en Compose

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: `docker-compose.yml` contiene passwords/secrets literales para PostgreSQL, Redis, pgAdmin, JWT y un client secret OAuth. Valores: `[REDACTADO]`.
- Riesgo: crítico; exposición en historial Git y uso no autorizado si los valores siguen vigentes.
- Recomendación: tratar como incidente potencial, confirmar vigencia sin revelar valores y proponer extracción/rotación para autorización posterior.
- Fase correctiva sugerida: `PHASE-CORR-SECRETS`.

## SEC-002 — Credenciales y hashes en SQL/documentación/scripts

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: migraciones seed/corrección, README/SETUP y el script de despliegue contienen credenciales, contraseñas de ejemplo o hashes versionados. Valores: `[REDACTADO]`.
- Riesgo: alto; ejemplos pueden reutilizarse y los hashes/credenciales pueden conservar valor operativo.
- Recomendación: inventariar exposición e historial y proponer clasificación/rotación para una autorización posterior; no borrar durante PHASE-001.
- Fase correctiva sugerida: `PHASE-CORR-SECRETS`.

## SEC-003 — Fallback de conexión local con credenciales

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: `backend/main.go` define un DSN de fallback literal cuando falta `DATABASE_URL`. Valor: `[REDACTADO]`.
- Riesgo: alto; puede conectar al destino incorrecto y normaliza credenciales embebidas.
- Recomendación: definir comportamiento fail-closed y configuración externa en fase autorizada.
- Fase correctiva sugerida: `PHASE-CORR-SECRETS`.

## SEC-004 — Cookies con atributos inconsistentes

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: algunas cookies usan `HttpOnly`, `Secure` y `SameSite=Lax`; otras rutas crean cookies sin todos esos atributos y el login principal fija `Secure=false`.
- Riesgo: alto; protección distinta según flujo y posible exposición en transporte no cifrado.
- Recomendación: construir matriz por flujo y validar headers reales en `HTTP STAGING` antes de una fase de endurecimiento.
- Fase correctiva sugerida: `PHASE-CORR-WEB-SECURITY`.

## SEC-005 — Política CORS con fallback comodín

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: los orígenes permitidos reciben credenciales, mientras otros orígenes obtienen `Access-Control-Allow-Origin: *`; el comportamiento real no fue probado.
- Riesgo: medio/alto; política permisiva y difícil de razonar junto con cookies y proxies.
- Recomendación: validar preflight y solicitudes con/sin Origin en `HTTP STAGING`, luego definir política explícita.
- Fase correctiva sugerida: `PHASE-CORR-WEB-SECURITY`.

## SEC-006 — Límites de carga no alineados

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: Nginx declara 50 MB, handlers usan límites de parseo de 100 MB y 500 MiB, y no se observó `http.MaxBytesReader` en la búsqueda estática.
- Riesgo: alto; consumo excesivo de recursos y comportamiento diferente según ruta/capa.
- Recomendación: inventariar cada endpoint y aplicar límites coherentes en una fase correctiva.
- Fase correctiva sugerida: `PHASE-CORR-UPLOAD-LIMITS`.

## SEC-007 — Sesión, tenant y branch tienen controles estáticos explícitos

- Origen de evidencia: `LOCAL`.
- Estado: `APROBADO`.
- Evidencia resumida: `requireSessionContextWithStore` valida token, revocación, expiración, usuario, acceso a tenant/branch, roles y permisos; existen middleware transaccional y pruebas unitarias/integración.
- Riesgo: medio; la revisión estática no demuestra cobertura uniforme de todas las rutas ni comportamiento efectivo con RLS.
- Recomendación: mapear rutas protegidas y ejecutar pruebas autorizadas de aislamiento.
- Fase correctiva sugerida: según resultados.

## SEC-008 — RLS efectivo y rol runtime sin verificar

- Origen de evidencia: `POSTGRES STAGING`.
- Estado: `BLOQUEADO`.
- Evidencia resumida: Compose y SQL operativo declaran un rol restringido y políticas RLS, pero no hay acceso autorizado para comprobar `current_user`, atributos del rol o políticas activas.
- Riesgo: crítico; la intención estática puede diferir del estado real.
- Recomendación: verificación de solo lectura y pruebas fail-closed con autorización expresa.
- Fase correctiva sugerida: según resultados.

## SEC-009 — Auth y aislamiento HTTP real sin verificar

- Origen de evidencia: `HTTP STAGING`.
- Estado: `BLOQUEADO`.
- Evidencia resumida: no se dispone de acceso autorizado ni cuentas/fixtures de prueba.
- Riesgo: crítico; no se validaron login, logout, selección de tenant/branch ni accesos cruzados.
- Recomendación: suministrar cuentas de prueba y mecanismo HTTP autorizado.
- Fase correctiva sugerida: según resultados.
