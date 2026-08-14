# ARCHITECT DECISION — PHASE-002 Campaign A Canonical Host Retry

## Estado

- Decisión: AUTORIZADO CONDICIONALMENTE.
- Alcance: reejecución completa de CAMPAÑA A desde `ISO-001` hasta `ISO-022` usando exclusivamente el host canónico confirmado.
- Entorno: STAGING exclusivamente.
- Backend runtime esperado: `d155910c231e96446672508534ccec83bf0d830f`.
- Fixture: `SKIA-PHASE-002-FIXTURE-V1` previamente preparado y verificado.
- Manifest SHA-256 esperado: `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.
- Runner mínimo aprobado: `fb88dbc7c40c54cd2803b2756d15caeed73da929`.
- Base URL autorizada para esta ejecución: `https://skia.iamet.mx`.

## Fundamento

El diagnóstico read-only demostró que `https://mvp.skia.iamet.mx` es un alias legado que `global_nginx` redirige mediante `301` a `https://skia.iamet.mx$request_uri`. El runner no sigue redirects deliberadamente, por lo que la campaña anterior nunca alcanzó el backend. No se requiere modificar Nginx, DNS, backend ni el comportamiento fail-closed del runner.

## Precondiciones obligatorias

Antes del primer login:

1. Versionar y publicar `HTTP_REDIRECT_DIAGNOSTIC.md`.
2. Ejecutar desde un checkout limpio de `phase/002-fixture-implementation` que contenga esta decisión.
3. Confirmar backend runtime `d155910c231e96446672508534ccec83bf0d830f` y ausencia de divergencia relevante.
4. Confirmar por lectura que el fixture conserva las cardinalidades aprobadas y que no existen colisiones TEST ajenas.
5. Confirmar integridad del manifest mediante SHA-256 exacto `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.
6. Usar las credenciales TEST/contexto externos protegidos en modo `0600`.
7. Fijar `PHASE002_BASE_URL=https://skia.iamet.mx` exactamente. No utilizar el alias `mvp.skia.iamet.mx` y no usar `curl -L`/`--location`.
8. No modificar runner, fixtures, aplicación, Nginx, DNS, RLS ni infraestructura durante la campaña.

## Ejecución autorizada

- Ejecutar `tools/phase002/run_isolation_tests.sh` una sola vez con `PHASE002_CAMPAIGN=A`.
- Reiniciar la matriz desde `ISO-001`; no reutilizar filas de ejecuciones anteriores.
- Conservar únicamente la matriz redactada emitida por el runner y metadatos no sensibles.
- Si aparece `CROSS_TENANT_LEAK=true`, detenerse inmediatamente y clasificar como `FALLIDO` crítico.
- Si el runner queda `INCOMPLETE`, termina con código distinto de cero o aparece cualquier resultado `FALLIDO`, preservar exactamente la evidencia y detenerse; no corregir ni reejecutar bajo este gate.

## Correlación read-only posterior

Después de la ejecución se autoriza únicamente observación PostgreSQL read-only para:

- confirmar integridad/cardinalidad del fixture;
- contar sesiones TEST sin leer tokens/session IDs;
- correlacionar, cuando sea posible sin secretos, contexto tenant/branch con la matriz HTTP;
- observar nuevamente el estado efectivo de RLS sin modificarlo.

## Criterio de aceptación

CAMPAÑA A solo puede considerarse completada si:

1. `CAMPAIGN_EXECUTION_STATUS=COMPLETE`;
2. el runner alcanzó el backend canónico y los logins válidos pudieron evaluarse;
3. existe evidencia para toda la matriz `ISO-001`–`ISO-022` según la capacidad observacional definida;
4. no existe fuga cross-tenant;
5. cualquier fuga cross-branch, fallo de autorización o caso bloqueado queda reportado sin reinterpretación.

La ausencia de fugas solo puede afirmarse si las respuestas protegidas y el contenido de activos fueron realmente observables; status de redirect o ausencia de sesión no cuentan como prueba de aislamiento.

## No autorizado

Esta decisión NO autoriza:

- CAMPAÑA B;
- cambios RLS;
- rollback de fixtures;
- correcciones de código durante o después de la campaña;
- cambios Nginx/DNS;
- migraciones;
- deploy;
- producción.

Al finalizar, detenerse y presentar la matriz completa, resumen de sesiones TEST y estado RLS read-only para un nuevo dictamen arquitectónico.