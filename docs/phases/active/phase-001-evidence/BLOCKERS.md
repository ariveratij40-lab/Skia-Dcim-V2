# PHASE-001 — Bloqueantes y activos versionados (ronda 1)

## Bloqueantes

### B-001 — Acceso a staging no autorizado/provisto

- Origen de evidencia: `STAGING VPS`, `POSTGRES STAGING`, `HTTP STAGING`.
- Estado: `BLOQUEADO`.
- Evidencia resumida: el repositorio local no concede acceso a SSH, Docker/Redis/PostgreSQL del VPS, logs, archivos o servicios reales.
- Riesgo: crítico; impide validar el estado efectivo.
- Recomendación: proporcionar un mecanismo expresamente autorizado y de mínimo privilegio. No buscar ni reutilizar credenciales existentes.
- Fase correctiva sugerida: no aplica.

### B-002 — Runner local incompleto para frontend y contenedores

- Origen de evidencia: `LOCAL`, `CONTAINER LOCAL`.
- Estado: `BLOQUEADO`.
- Evidencia resumida: Node/npm, Docker, dependencias frontend y `next.config.js` no están disponibles.
- Riesgo: medio; impide ejecutar builds frontend/contenedores en esta ronda.
- Recomendación: usar CI o runner autorizado; no instalar dependencias sin autorización.
- Fase correctiva sugerida: no aplica.

## Inventario de `.bak`, backups y artefactos relacionados

### BAK-001 — Dockerfiles `.bak`

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: están versionados `backend/Dockerfile.bak` y `frontend/Dockerfile.bak`.
- Riesgo: medio; confusión sobre fuente canónica y posible conservación de configuración obsoleta/sensible.
- Recomendación: revisar procedencia y política de retención antes de retirar.
- Fase correctiva sugerida: `PHASE-CORR-REPOSITORY-HYGIENE`.

### BAK-002 — Copias Go con sufijo backup

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: están versionados `backend/import_inventory.go.backup-phase3` y `backend/import_query_api.go.backup-phase3`.
- Riesgo: medio; duplicación de lógica y posible exposición histórica.
- Recomendación: comparar con archivos activos y definir retención en fase autorizada.
- Fase correctiva sugerida: `PHASE-CORR-REPOSITORY-HYGIENE`.

### BAK-003 — Árboles de integración respaldados

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: `backups/import-integration-20260724-073359/` contiene 3 archivos Go y `backups/routes-integration-20260724-103440/` contiene 5.
- Riesgo: medio; código duplicado versionado puede confundir auditorías y búsquedas de seguridad.
- Recomendación: definir política de archivo fuera del árbol canónico y revisar diferencias antes de cualquier eliminación.
- Fase correctiva sugerida: `PHASE-CORR-REPOSITORY-HYGIENE`.

### BAK-004 — Dump SQL versionado

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: existe `backups/skia_db_pre_migration_009_20260724_184642.sql` versionado.
- Riesgo: crítico; un dump puede contener datos, hashes, tokens o configuración sensible aunque los datos sean de prueba.
- Recomendación: análisis de contenido redactado, clasificación y decisión de retención/historial dentro de fase autorizada.
- Fase correctiva sugerida: `PHASE-CORR-SECRETS` y `PHASE-CORR-REPOSITORY-HYGIENE`.

### BAK-005 — Binarios backend versionados

- Origen de evidencia: `LOCAL`.
- Estado: `FALLIDO`.
- Evidencia resumida: `backend/skia-backend` y `backend/skia_backend` están rastreados como artefactos binarios.
- Riesgo: medio/alto; falta de reproducibilidad, tamaño y posible inclusión de metadatos/cadenas sensibles.
- Recomendación: verificar procedencia y política de artefactos en fase autorizada.
- Fase correctiva sugerida: `PHASE-CORR-REPOSITORY-HYGIENE`.
