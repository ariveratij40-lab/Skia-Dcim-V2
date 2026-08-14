# PHASE-002 — Definitive read-only preflight report

## Control

- Fecha: `2026-08-14` (`America/Tijuana`).
- Decisión: `ARCHITECT_DECISION_PREFLIGHT_FINAL_GATE.md`.
- Rama: `phase/002-fixture-implementation`.
- Corrección de procedencia publicada: `5635565` (`fix(phase-002): correct preflight SHA provenance labels`).
- Origen de ejecución: `STAGING VPS` + `POSTGRES STAGING`.
- Modalidad: script revisado enviado por entrada estándar efímera; no se instaló ni persistió tooling en el VPS.
- Resultado del proceso: exit code `0`.
- Transacción PostgreSQL: `BEGIN READ ONLY` finalizada con `ROLLBACK`.

## Procedencia

| Campo | Valor | Estado |
| --- | --- | --- |
| PHASE-003 specification SHA | `d2e9c3519a18915ab3867d6526f0d1100559bd16` | registrado como especificación, no como evidencia completa |
| PHASE-003 authoritative evidence SHA | `7d68fa2e6b2dff05cfec9d21fed81c88414fd90c` | verificado en el tooling publicado |
| Active backend runtime SHA | `d155910c231e96446672508534ccec83bf0d830f` | verificado |
| Relevant runtime source differs | `false` | rutas auditadas limpias frente al SHA runtime |
| Frontend runtime SHA | `UNKNOWN/BLOQUEADO` | no resuelto por esta ronda |

Docker Compose identifica `/opt/apps/skia/releases/d155910` como working directory del servicio API y su `docker-compose.yml` como archivo de configuración del proyecto staging. El checkout de esa fuente activa reportó HEAD exacto `d155910c231e96446672508534ccec83bf0d830f` y ninguna modificación en las rutas de autenticación, sesión/contexto, tenant/branch, nombres de rol o activos auditadas.

El checkout legado `/opt/apps/skia/staging` no se utilizó como procedencia runtime.

## Resultado PostgreSQL

| Control | Resultado |
| --- | --- |
| Base esperada/real | `skia_db` / `skia_db` |
| Rol efectivo | `skia_user` |
| Tablas requeridas | presentes; guard aprobado |
| Compatibilidad de `roles.name` con `operator` | aprobada por guard read-only |
| Colisiones TEST no canónicas | ninguna detectada |
| Rango canónico fixture existente | vacío; modo `preparation` |
| Nombre runtime neutral | `operator` |
| Permission code normativo | `dcim:view` |
| Permission ID | `550e8400-e29b-41d4-a716-446655440401` |
| Permission global | `false` |
| Permission-set hash | `978f98df2482ec29fc64744ae3524640` |
| Enforcement runtime del permiso | `NO ENFORCED` |

## Clasificación

**PREFLIGHT READ-ONLY DEFINITIVO: APROBADO.**

El resultado demuestra que las precondiciones read-only evaluadas por el tooling son compatibles con el baseline aprobado. No demuestra aislamiento funcional, no resuelve el SHA del frontend y no convierte `dcim:view` en control efectivo.

## Autorización posterior

- Preparación de fixtures: `NO AUTORIZADA` por este reporte.
- Campaña HTTP: `NO AUTORIZADA`.
- Rollback: `NO AUTORIZADO`.
- Cambios RLS: `NO AUTORIZADOS`.
- Deploy: `NO AUTORIZADO`.

Una ejecución de preparación requiere una autorización posterior y separada.
