# ARCHITECT DECISION — PHASE-002 CAMPAIGN A Gate

## Estado

- Decisión: AUTORIZADO CONDICIONALMENTE.
- Alcance: CAMPAÑA A de aislamiento autenticado sobre Fixture V1 ya preparado y verificado.
- Entorno: STAGING exclusivamente.
- Fixture esperado: `SKIA-PHASE-002-FIXTURE-V1`.
- Backend runtime esperado: `d155910c231e96446672508534ccec83bf0d830f`.
- Manifest SHA-256 esperado: `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.

## Fundamento

El cuarto intento de preparación completó COMMIT y la verificación read-only posterior terminó correctamente. Se verificaron 3 tenants, 6 branches, 9 usuarios, 3 roles neutrales `operator`, mappings esperados, 60 assets, 60 asset_logs y 6 asset_relationships. El manifest externo quedó protegido en modo `0600`, con 183 registros inventariados y checksum SHA-256 conocido. `dcim:view` continúa clasificado como metadata normativa `NO ENFORCED`; por tanto, CAMPAÑA A debe medir la autorización efectiva basada en sesión, mappings tenant/branch y filtros/contexto de handlers.

## Precondiciones obligatorias

Antes de cualquier login HTTP:

1. Versionar y publicar `FIXTURE_PREPARATION_REPORT.md` con la evidencia del cuarto intento exitoso.
2. Confirmar que el fixture sigue presente con las cardinalidades verificadas y que no aparecieron colisiones o cambios manuales.
3. Confirmar backend runtime `d155910c231e96446672508534ccec83bf0d830f` y `relevant_runtime_source_differs=false` mediante el preflight read-only aplicable.
4. Confirmar que el manifest externo existe, es regular, no symlink, modo `0600`, y que su SHA-256 sigue siendo exactamente `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.
5. Confirmar que el archivo temporal de credenciales de campaña existe fuera de Git, modo `0600`, contiene únicamente las nueve credenciales TEST y no ha sido expuesto en logs/evidencia.
6. No habilitar ni modificar RLS antes de CAMPAÑA A. La campaña debe medir el estado actual.

## Ejecución autorizada

Ejecutar únicamente `tools/phase002/run_isolation_tests.sh` y las observaciones read-only necesarias expresamente previstas por PHASE-002.

La campaña debe:

- usar exclusivamente actores TEST;
- no usar usuarios reales ni sesiones históricas;
- no imprimir passwords, cookies, tokens, session IDs completos ni cuerpos HTTP completos;
- capturar respuestas únicamente en temporales protegidos y eliminarlos al finalizar;
- registrar por caso `ISO-001` a `ISO-022`: código HTTP, resultado `APROBADO`/`FALLIDO`/`BLOQUEADO`, conteo esperado/observado cuando aplique, fuga cross-tenant y fuga cross-branch;
- validar contenido de activos, no solo códigos HTTP;
- tratar cualquier dato TEST de otro tenant como `FALLIDO` crítico;
- tratar cualquier branch no autorizada visible como `FALLIDO`, salvo un caso cuya especificación explícita espere otra semántica y cuya operación posterior confirme fail-closed;
- mantener `ISO-011`/`ISO-012` bloqueados en su parte de relaciones si sigue sin existir endpoint de lectura;
- mantener `ISO-016` y `ISO-022` bloqueados salvo que la observación read-only autorizada sea suficiente sin revelar secretos.

## Regla de detención

Detener CAMPAÑA A inmediatamente si ocurre cualquiera de los siguientes:

- fuga cross-tenant confirmada;
- corrupción o pérdida del manifest;
- divergencia del runtime backend;
- modificación inesperada del fixture;
- necesidad de cambiar código, SQL, RBAC, RLS, Docker, Nginx o configuración para continuar.

Un fallo funcional ordinario de una prueba puede registrarse y continuar únicamente si no implica fuga crítica ni riesgo de integridad.

## Evidencia requerida

Crear/actualizar evidencia bajo `docs/phases/active/phase-002-evidence/` con:

- matriz ISO-001..ISO-022;
- resumen de login/sesión/tenant/branch;
- resultados de aislamiento por tenant y branch;
- fugas observadas o ausencia de fugas;
- casos bloqueados y razón;
- backend runtime SHA;
- checksum del manifest, sin incluir su contenido ni rutas sensibles;
- confirmación de eliminación de temporales de respuestas y material de sesión no necesario.

No versionar credenciales, cookies, tokens, hashes de passwords reutilizables ni respuestas completas.

## No autorizado

Esta decisión NO autoriza:

- cambios RLS;
- migraciones;
- correcciones de backend/frontend durante la campaña;
- deploy;
- producción;
- rollback de fixtures al finalizar CAMPAÑA A.

Los fixtures deben permanecer intactos después de CAMPAÑA A hasta una decisión arquitectónica posterior, porque la especificación PHASE-002 exige preservar evidencia y controlar el ciclo de rollback de forma separada.

## Criterio de salida

CAMPAÑA A queda completada cuando todos los casos ejecutables tengan resultado visible y no existan secretos en evidencia. El resultado puede ser APROBADO, FALLIDO o BLOQUEADO; no debe reinterpretarse un fallo como aprobación.

Después de la campaña, detenerse y solicitar decisión arquitectónica antes de rollback, correcciones RLS o CAMPAÑA B.