# PHASE-005 — Architect Decision: CAMPAÑA B Retry Gate

## Estado

- Decisión: AUTORIZADO CONDICIONALMENTE.
- Alcance: una sola nueva ejecución completa de CAMPAÑA B desde `ISO-001` hasta `ISO-022`.
- Entorno: STAGING exclusivamente.
- Runner mínimo aprobado: commit `d012f4f09a4fb6272a088f4e3ffd0352d0fa4799`.
- Host canónico: `https://skia.iamet.mx`.
- Runtime esperado: `skia_runtime` restringido.
- RLS esperado al inicio y durante toda la campaña: `relrowsecurity=true`, `relforcerowsecurity=true` en `assets`, `asset_logs` y `asset_relationships`.
- Policies/hashes esperados: exactamente los canónicos PHASE-005 ya publicados.

## Fundamento

El primer intento de CAMPAÑA B quedó bloqueado porque el runner podía terminar sin emitir evidencia de terminación. El commit aprobado corrige esa debilidad instalando temprano los traps de `EXIT`, `HUP`, `INT` y `TERM`, preservando `CAMPAIGN_EXECUTION_STATUS`, `PROCESS_EXIT_CODE` y al menos la cabecera de matriz para toda terminación normal o controlable.

La causa externa exacta que terminó el intento anterior no es recuperable, pero la causa por la cual no existió evidencia sí quedó identificada y corregida. La validación local cubrió salida normal, fallo temprano, fallo controlado, HUP, INT y TERM.

## Precondiciones obligatorias

Antes del primer HTTP:

1. Working tree limpio en `phase/005-rls-enforcement` y runner idéntico al blob publicado por `d012f4f09a4fb6272a088f4e3ffd0352d0fa4799`.
2. Backend healthy, restart count `0`, health interno/público `200/200`.
3. API conectada como `skia_runtime`; rol NOSUPERUSER/NOBYPASSRLS y sin ownership/herencia privilegiada sobre tablas objetivo.
4. RLS/FORCE `true/true` en las tres tablas objetivo.
5. Policies y hashes canónicos exactos, sin drift.
6. Fixture canónico íntegro: 3 tenants, 6 branches, 9 users, 60 assets, 60 logs y 6 relationships; mappings tenant/branch inválidos = `0/0`.
7. Manifest externo regular, no symlink, modo `0600` y SHA-256 exacto `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.
8. Contexto y credenciales TEST externos al repositorio, regulares, no symlink y modo `0600`.
9. Generar `EMAIL_INVALID` y `PASSWORD_INVALID` de forma efímera; confirmar read-only que el email inválido no existe antes de ejecutar el runner.
10. Configurar exactamente `PHASE002_CAMPAIGN=B` y `PHASE002_BASE_URL=https://skia.iamet.mx`.

Si cualquier precondición falla, no ejecutar el runner y publicar evidencia de bloqueo.

## Ejecución autorizada

- Ejecutar `tools/phase002/run_isolation_tests.sh` exactamente una vez.
- La campaña comienza nuevamente en `ISO-001`; no reutilizar resultados del intento bloqueado anterior.
- No usar `curl -L` ni seguir redirects.
- No modificar durante la campaña runner, código, fixtures, sesiones, RLS, policies, PostgreSQL, Nginx, Docker, credenciales runtime ni infraestructura.
- Preservar únicamente la salida redactada del runner: `CAMPAIGN_EXECUTION_STATUS`, `PROCESS_EXIT_CODE` y matriz ISO.
- Si el runner termina `INCOMPLETE`, con exit distinto de cero, señal controlable, `CROSS_TENANT_LEAK=true` o cualquier `FALLIDO` crítico, detenerse; no corregir ni reintentar bajo este gate.

## Correlación PostgreSQL read-only posterior

Después del runner se autoriza exclusivamente lectura para:

- verificar que RLS/FORCE y hashes canónicos permanecen exactos;
- confirmar runtime `skia_runtime` y health;
- contabilizar sesiones TEST activas sin leer tokens/IDs;
- confirmar mappings tenant/branch inválidos = `0/0`;
- confirmar integridad/cardinalidad del fixture;
- correlacionar ISO-022 con contextos tenant/branch de actores TEST sin exponer material sensible.

No se autoriza mutar, revocar o borrar sesiones.

## Comparación A/B

Si CAMPAÑA B queda `COMPLETE`, actualizar `CAMPAIGN_B_REPORT.md` con una comparación explícita contra la CAMPAÑA A final publicada.

La comparación debe distinguir:

- hechos observados en A;
- hechos observados en B;
- variables que no permanecieron constantes entre campañas;
- mejoras que sí pueden atribuirse a RLS solo cuando exista evidencia causal suficiente.

No atribuir causalmente a RLS ninguna diferencia que también pueda explicarse por cambios de runtime, código o entorno.

## Criterio de cierre

CAMPAÑA B solo puede declararse completada si:

1. `CAMPAIGN_EXECUTION_STATUS=COMPLETE`;
2. `PROCESS_EXIT_CODE=0`;
3. existe matriz para `ISO-001`–`ISO-022` con resultados emitidos o bloqueos explícitos definidos por la especificación;
4. no existe fuga cross-tenant ni cross-branch observada;
5. A-OPERATOR A2 permanece denegado;
6. mappings inválidos permanecen `0/0`;
7. RLS/FORCE y hashes canónicos permanecen intactos;
8. backend permanece healthy como `skia_runtime`.

Los casos estructuralmente no observables pueden permanecer `BLOQUEADO`, siempre que la campaña sea `COMPLETE` y el bloqueo sea el previsto por la matriz.

## No autorizado

Este gate NO autoriza:

- deshabilitar o modificar RLS/policies;
- rollback canónico RLS;
- cambios de código o tooling durante/después de la campaña;
- modificar fixtures, mappings o sesiones;
- migraciones, esquema, roles, grants u ownership;
- deploy/restart de servicios;
- cambios Nginx/DNS/Redis/frontend;
- producción;
- una segunda reejecución si este intento falla o queda `INCOMPLETE`.

## Salida requerida

Versionar y publicar la evidencia final de CAMPAÑA B y la comparación A/B en la rama PHASE-005. Después detenerse para dictamen arquitectónico final de PHASE-005.