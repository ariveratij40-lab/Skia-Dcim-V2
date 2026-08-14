# PHASE-005 — STAGING RLS Activation Report

## Resultado

- Fecha: `2026-08-14`.
- Gate: `ARCHITECT_DECISION_STAGING_RLS_ACTIVATION_GATE.md`.
- Rama: `phase/005-rls-enforcement`.
- Orígenes: `LOCAL`, `STAGING VPS`, `POSTGRES STAGING`, `HTTP STAGING`.
- Preflight externo: **APROBADO**.
- Artefacto canónico: **BLOQUEADO ANTES DE DDL**.
- Activación RLS: **NO EJECUTADA**.
- Rollback: **NO APLICA**; no existió cambio que restaurar.
- CAMPAÑA B: **NO EJECUTADA**.

## Baseline previo

La rama se encontraba limpia en
`4279339ca9a2779aa06a3536f0556bbb7809ec10`. Los tres artefactos SQL
coincidían sin diferencias con el commit aprobado
`05cc30798b163962428fe545201b5d9d09e245b1`.

| Control | Resultado |
|---|---|
| Health interno/público | `200` / `200` |
| Contenedor API | healthy; restart count `0` |
| Identidad API | `skia_runtime`; 2 conexiones observadas |
| Identidad migrador | `skia_user`, distinta del runtime |
| Runtime | LOGIN, NOSUPERUSER, NOBYPASSRLS |
| Ownership/herencia privilegiada | `0` / `0` |
| RLS/FORCE | `false/true` en las tres tablas |
| Fixture | 3 tenants / 6 branches / 60 activos TEST |
| Mappings inválidos | tenant `0`; branch `0` |

Hashes pre-activación observados:

- `assets`: `f39b9225e6e95b3e654e3161748f5c1a`;
- `asset_logs`: `4acd83f5389f69069dedf6f93fffca8b`;
- `asset_relationships`: `14a883076b3bc7bd6a2fc4491659c6bd`.

Los conteos relacionados de referencia fueron logs A1/A2/tenant A
`10/10/20` y relaciones same-branch A1/A2/tenant A `1/1/2`.

## Intento canónico

Se transmitió exactamente una vez el archivo
`ops/phase005/activate_canonical_rls.sql` a `psql -f /dev/stdin`, usando el
migrador y los guards de entorno/base/aprobación autorizados. No se reprodujo,
editó, concatenó ni ejecutó selectivamente su DDL.

El propio artefacto devolvió:

`BLOCKED: protected schema/FK baseline differs`

Después emitió error SQL no-cero, conforme al diseño fail-closed. El bloqueo
ocurrió antes de `BEGIN`, locks, policies o `ALTER TABLE`.

## Diagnóstico read-only

El esquema esperado sí está presente:

- las tres tablas existen;
- las 10 columnas UUID/no-null verificadas coinciden;
- las tres FKs objetivo a `assets(id)` coinciden exactamente.

La causa es un falso positivo del guard FK. El artefacto cuenta todas las FKs
de `public` cuya definición textual coincide con cualquiera de las tres
definiciones objetivo, pero no limita el conteo a `asset_logs` y
`asset_relationships`. STAGING contiene 11 FKs con esas formas genéricas; el
guard exige exactamente 3. Esto no representa incompatibilidad de las FKs
objetivo, pero el gate prohíbe modificar o reproducir manualmente el artefacto
durante la activación.

## Estado posterior

La verificación read-only confirmó:

- `relrowsecurity=false`, `relforcerowsecurity=true` en las tres tablas;
- los tres nombres y hashes previos permanecen exactos;
- no se ejecutó DDL ni se modificaron datos, fixtures, roles, grants,
  ownership, credenciales o configuración de aplicación.

No se ejecutó rollback porque el estado canónico nunca fue aplicado. Ejecutar
rollback sobre este estado no aportaría restauración y excedería la condición
automática del gate.

## Conclusión y bloqueante

El gate se detiene correctamente antes de DDL por una precondición fallida. Se
requiere corregir el guard para restringir la cuenta de FKs a las dos tablas
protegidas, validar/publicar nuevamente el artefacto y obtener revisión o gate
que autorice un nuevo intento. RLS permanece deshabilitado y CAMPAÑA B sigue
bloqueada.
