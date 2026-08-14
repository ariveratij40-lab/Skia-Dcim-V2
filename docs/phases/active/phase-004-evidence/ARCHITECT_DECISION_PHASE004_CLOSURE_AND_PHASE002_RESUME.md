# ARCHITECT DECISION — PHASE-004 Closure and PHASE-002 Resume

## Estado

- PHASE-004: APROBADA EN STAGING, pendiente únicamente de versionar la evidencia final de limpieza/validación.
- Backend runtime aprobado: `01efd5099758d8ad85fc4bcdf4720c5e23e59270`.
- PHASE-002: autorizada para reanudar CAMPAÑA A después de publicar la evidencia final de PHASE-004 y verificar que el fixture permanece íntegro.

## Fundamento

La corrección PHASE-004 quedó desplegada y validada en STAGING. A-OPERATOR puede seleccionar A1 y recibe HTTP 403 al intentar A2; su contexto permanece en A1. A-MULTI conserva acceso legítimo a A1 y A2. La única sesión inválida predeploy fue eliminada mediante la limpieza controlada autorizada y el conteo posterior de sesiones TEST fuera de `user_branches` quedó en cero. No se observaron nuevas sesiones inválidas desde el deploy.

## Cierre de PHASE-004

Codex queda autorizado para, sin nueva aprobación manual:

1. Versionar y publicar exclusivamente la evidencia final de PHASE-004 (`STALE_SESSION_CLEANUP_REPORT.md`, `IMPLEMENTATION_REPORT.md`, `BLOCKERS.md` y cualquier ajuste documental estrictamente necesario para reflejar el cierre).
2. Marcar PHASE-004 como `APROBADA EN STAGING` en su evidencia de cierre.
3. No hacer merge a `main` ni mover todavía la especificación a `completed/` salvo decisión posterior explícita.

## Reanudación de PHASE-002

Después de publicar la evidencia final de PHASE-004, Codex queda autorizado para volver a `phase/002-fixture-implementation` y ejecutar autónomamente una nueva CAMPAÑA A completa, con estas precondiciones:

1. Confirmar backend runtime exacto `01efd5099758d8ad85fc4bcdf4720c5e23e59270` y health interno/público HTTP 200.
2. Confirmar fixture V1 íntegro y manifest con checksum previamente aprobado.
3. Confirmar cero sesiones TEST fuera de `user_branches` antes del primer login.
4. Usar exclusivamente `PHASE002_BASE_URL=https://skia.iamet.mx`.
5. Ejecutar `tools/phase002/run_isolation_tests.sh` exactamente una vez con CAMPAÑA A desde `ISO-001`.
6. Ejecutar después únicamente correlación PostgreSQL read-only necesaria para validar tenant/branch/sesiones y preservar la matriz completa.

## Criterios de detención inmediata

Detener la campaña sin corregir ni reintentar si ocurre cualquiera de los siguientes:

- `CROSS_TENANT_LEAK=true`;
- sesión TEST con branch no presente en `user_branches`;
- nueva mutación de contexto cross-branch no autorizada;
- runtime distinto del SHA aprobado;
- runner `INCOMPLETE` o exit code distinto de cero;
- cambio inesperado de esquema, RLS o infraestructura.

## No autorizado

Esta decisión NO autoriza:

- CAMPAÑA B;
- cambios RLS;
- rollback de fixtures;
- migraciones o cambios de esquema;
- deploy adicional;
- cambios de Nginx/DNS;
- producción;
- merge a `main`.

Al finalizar la nueva CAMPAÑA A, Codex debe versionar/publicar la evidencia resultante en la rama PHASE-002 y detenerse para dictamen arquitectónico.