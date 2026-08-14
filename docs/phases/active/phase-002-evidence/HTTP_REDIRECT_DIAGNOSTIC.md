# PHASE-002 — HTTP 301 redirect diagnostic

## Control

- Fecha: `2026-08-14` (`America/Tijuana`).
- Decisión: `ARCHITECT_DECISION_HTTP_REDIRECT_DIAGNOSTIC.md`.
- Rama: `phase/002-fixture-implementation`.
- Evidencia de CAMPAÑA A publicada: `23a1c6a46f4088690c39d853eb36c7222fd509df`.
- Backend runtime: `d155910c231e96446672508534ccec83bf0d830f`.
- Origen: `HTTP STAGING` + `STAGING VPS` read-only.
- Clasificación: **REDIRECT_CANONICAL_HOST / REDIRECT_PROXY_CONFIG**.

No se enviaron credenciales, cuerpos, cookies ni tokens. Las solicitudes no usaron `--location` y ningún redirect fue seguido manualmente.

## Precondiciones read-only

- Preflight aprobado; `relevant_runtime_source_differs=false`.
- Fixture canónico presente en modo de verificación/convergencia.
- Usuarios fixture: `9`.
- Activos fixture: `60`.
- Manifest externo con checksum esperado: aprobado.

## Resultados HTTP

| Host lógico | Método | Endpoint | Status | Location | Server |
| --- | --- | --- | ---: | --- | --- |
| `mvp.skia.iamet.mx` | GET | `/api/health` | 301 | `https://skia.iamet.mx/api/health` | nginx |
| `mvp.skia.iamet.mx` | GET | `/api/auth/me` | 301 | `https://skia.iamet.mx/api/auth/me` | nginx |
| `mvp.skia.iamet.mx` | HEAD | `/api/auth/login` | 301 | `https://skia.iamet.mx/api/auth/login` | nginx |
| `skia.iamet.mx` | GET | `/api/health` | 200 | ausente | nginx |
| `skia.iamet.mx` | GET | `/api/auth/me` | 401 | ausente | nginx |
| `skia.iamet.mx` | HEAD | `/api/auth/login` | 405 | ausente | nginx |

El `405` de HEAD sobre login es consistente con haber alcanzado routing de aplicación sin enviar un POST ni credenciales; no se interpreta como fallo de login.

## Correlación del reverse proxy

El contenedor efectivo es `global_nginx` y monta la configuración desde `/opt/infra/nginx/sites-enabled`. La regla SKIA activa declara:

- `skia.iamet.mx` como dominio oficial;
- `mvp.skia.iamet.mx` como alias anterior;
- un bloque HTTPS para `mvp.skia.iamet.mx` con `return 301 https://skia.iamet.mx$request_uri`;
- un bloque HTTPS separado para `skia.iamet.mx` que envía `/api/` a `skia_api_staging:8080`.

La misma ruta se conserva y únicamente cambia el host. El redirect se origina en Nginx antes de alcanzar el backend. No es un redirect de esquema, trailing slash ni aplicación.

## Causa de CAMPAÑA A

CAMPAÑA A utilizó `PHASE002_BASE_URL=https://mvp.skia.iamet.mx`. El runner fail-closed no sigue redirects, por lo que las solicitudes terminaron correctamente en el `301` del alias y nunca alcanzaron los handlers de autenticación o activos.

El endpoint público canónico que responde health `200` es `https://skia.iamet.mx/api/health`.

## Corrección mínima propuesta

Para una futura ejecución expresamente autorizada, proporcionar al runner el host canónico ya configurado:

```text
PHASE002_BASE_URL=https://skia.iamet.mx
```

No se requiere cambiar Nginx, DNS, backend ni la política fail-closed del runner para corregir este origen específico. Sería razonable añadir en una fase revisada un precheck no autenticado que exija health `200` y rechace redirects antes del primer login, pero esta propuesta no equivale a autorización.

## Límites

No se reejecutó CAMPAÑA A, no se siguieron redirects y no se modificó base URL, runner, proxy, DNS, aplicación o fixture. No se ejecutó rollback, CAMPAÑA B, RLS, migraciones ni deploy.
