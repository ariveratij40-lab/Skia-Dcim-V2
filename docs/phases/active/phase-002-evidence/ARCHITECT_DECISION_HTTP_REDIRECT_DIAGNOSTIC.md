# ARCHITECT DECISION — PHASE-002 HTTP Redirect Diagnostic

## Estado

- Decisión: AUTORIZADO — DIAGNÓSTICO READ-ONLY / NO REEJECUCIÓN.
- Alcance: determinar la causa exacta de los HTTP `301` observados en CAMPAÑA A.
- Entorno: STAGING exclusivamente.
- CAMPAÑA A permanece funcionalmente `FALLIDO` e inconclusa para aislamiento.

## Hallazgo que motiva la decisión

La ejecución completa del runner devolvió `301` en todas las solicitudes. El runner vigente construye las solicitudes como `PHASE002_BASE_URL + path` y `curl` no usa `--location`; por tanto, no sigue redirects. Esto es correcto para evidencia fail-closed, pero impide saber si el `301` proviene de canonicalización de host, esquema, slash/path, reverse proxy o routing de aplicación.

## Objetivo

Identificar el destino y origen de los redirects sin autenticar actores TEST, sin crear sesiones y sin seguir redirects.

## Acciones autorizadas

1. Versionar/publicar primero la evidencia actual de CAMPAÑA A fallida.
2. Confirmar el backend runtime esperado y el estado del fixture mediante controles read-only ya aprobados.
3. Ejecutar solicitudes HTTP no autenticadas y de solo diagnóstico contra:
   - `/api/health`;
   - `/api/auth/me`;
   - `/api/auth/login` únicamente mediante método que no envíe credenciales ni body sensible cuando sea posible para observar routing/headers.
4. Para cada solicitud registrar únicamente:
   - URL/host lógico no sensible utilizado;
   - método;
   - status;
   - header `Location` si existe;
   - `Server`, `Via`, `X-Forwarded-*` u otros headers de routing no sensibles que ayuden a atribuir el redirect;
   - no registrar cookies, `Set-Cookie`, tokens, cuerpos completos ni credenciales.
5. No usar `curl -L` / `--location` y no seguir manualmente el redirect dentro de esta decisión.
6. Inspeccionar read-only la configuración efectiva de Nginx/reverse proxy y rutas del backend únicamente en la medida necesaria para correlacionar el `301`, redactando cualquier secreto.
7. Comparar la `PHASE002_BASE_URL` usada por el runner con el endpoint público que previamente respondió HTTP 200 para `/api/health`, sin revelar información sensible.

## Criterios de clasificación

- `REDIRECT_CANONICAL_HOST`: Location cambia únicamente host.
- `REDIRECT_SCHEME`: Location cambia HTTP/HTTPS.
- `REDIRECT_PATH`: Location cambia path/trailing slash/prefix.
- `REDIRECT_PROXY_CONFIG`: regla del reverse proxy identificada como causa.
- `REDIRECT_APPLICATION`: backend/frontend identificado como emisor.
- `BLOQUEADO`: no puede atribuirse sin seguir redirects o realizar cambios.

## No autorizado

Esta decisión NO autoriza:

- reejecutar CAMPAÑA A;
- seguir redirects;
- modificar `PHASE002_BASE_URL`, runner, Nginx, aplicación o DNS;
- logins TEST;
- crear/revocar sesiones;
- rollback;
- CAMPAÑA B;
- cambios RLS;
- migraciones;
- deploy.

## Salida requerida

Crear evidencia que indique para cada endpoint el status y destino de redirect redactado, la capa que lo origina cuando pueda demostrarse y la corrección mínima propuesta. Detenerse después del diagnóstico y solicitar nueva decisión antes de modificar tooling o reejecutar CAMPAÑA A.