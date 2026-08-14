# ARCHITECT DECISION — PHASE-002 Campaign A Retry

## Estado

- Decisión: AUTORIZADO CONDICIONALMENTE.
- Alcance: reejecución completa de CAMPAÑA A desde `ISO-001` hasta `ISO-022`.
- Entorno: STAGING exclusivamente.
- Runner mínimo aprobado: commit `fb88dbc7c40c54cd2803b2756d15caeed73da929`.
- Backend runtime esperado: `d155910c231e96446672508534ccec83bf0d830f`.
- Fixture esperado: `SKIA-PHASE-002-FIXTURE-V1` previamente preparado y verificado.
- Manifest SHA-256 esperado: `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.

## Fundamento

El primer intento de CAMPAÑA A quedó bloqueado por una incompatibilidad de Bash 3.2 y perdió la matriz acumulada. El commit aprobado corrige la expansión Bash 4+, hace portable el guard de permisos, preserva una matriz parcial ante abortos y detiene inmediatamente la ejecución ante una fuga cross-tenant detectada.

## Precondiciones obligatorias

Antes de la primera solicitud HTTP:

1. Ejecutar desde un checkout limpio de `phase/002-fixture-implementation` que contenga este gate y como mínimo `fb88dbc7c40c54cd2803b2756d15caeed73da929`.
2. Confirmar nuevamente backend runtime `d155910c231e96446672508534ccec83bf0d830f` y ausencia de divergencia relevante respecto de la traza autorizada.
3. Confirmar por lectura que el fixture conserva las cardinalidades aprobadas: 3 tenants, 6 branches, 9 users, 3 roles, 9 user_tenants, 15 user_branches, 9 user_roles, 3 role_permissions, 60 assets, 60 asset_logs y 6 asset_relationships.
4. Confirmar integridad exacta del manifest mediante SHA-256 `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.
5. Usar únicamente credenciales TEST y contexto externo protegidos en modo `0600`; no imprimir ni versionar passwords, hashes, cookies, tokens, session IDs o cuerpos HTTP completos.
6. No modificar runner, fixtures, aplicación, base de datos, RLS o infraestructura durante la campaña.

## Ejecución autorizada

- Ejecutar `tools/phase002/run_isolation_tests.sh` una sola vez con `PHASE002_CAMPAIGN=A`.
- La campaña debe comenzar nuevamente desde `ISO-001`; los resultados no recuperables del intento anterior no se reutilizan.
- Conservar únicamente la matriz redactada emitida por el runner y metadatos no sensibles necesarios para la evidencia.
- Si el runner marca `INCOMPLETE`, termina con código distinto de cero o detecta `CROSS_TENANT_LEAK=true`, detenerse inmediatamente. No corregir ni reejecutar bajo este gate.
- Una fuga cross-tenant confirmada constituye `FALLIDO` crítico y bloquea toda continuación.
- Una fuga cross-branch, denegación inesperada o cualquier otro resultado `FALLIDO` debe quedar visible y no reinterpretarse como aprobado.

## Correlación read-only posterior

Después de la ejecución se autoriza exclusivamente observación PostgreSQL read-only necesaria para:

- confirmar integridad/cardinalidad del fixture;
- contabilizar sesiones TEST sin leer tokens/session IDs;
- correlacionar, cuando sea posible sin datos sensibles, el contexto tenant/branch de las sesiones con la matriz HTTP.

Esta autorización no permite alterar, revocar o eliminar sesiones.

## Criterio de resultado

CAMPAÑA A solo puede clasificarse globalmente como completada si el runner emite `CAMPAIGN_EXECUTION_STATUS=COMPLETE` y existe evidencia para toda la matriz `ISO-001`–`ISO-022`.

Los casos explícitamente no observables por el runner pueden permanecer `BLOQUEADO` cuando así lo define la especificación, pero cualquier `FALLIDO` debe preservarse como tal. No declarar aislamiento aprobado si existen fugas o pruebas críticas sin evidencia suficiente.

## No autorizado

Este gate NO autoriza:

- CAMPAÑA B;
- cambios RLS;
- rollback de fixtures;
- correcciones de código durante o después de la campaña;
- migraciones;
- deploy;
- producción.

Al finalizar CAMPAÑA A, detenerse y presentar la matriz completa y la evidencia read-only para un nuevo dictamen arquitectónico.