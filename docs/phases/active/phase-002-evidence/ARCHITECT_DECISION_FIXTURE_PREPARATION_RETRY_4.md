# ARCHITECT DECISION — PHASE-002 Fixture Preparation Retry 4

## Estado

- Decisión: AUTORIZADO CONDICIONALMENTE.
- Alcance: cuarto intento controlado de preparación de `SKIA-PHASE-002-FIXTURE-V1` y verificación inmediata.
- Entorno: STAGING exclusivamente.
- Tooling mínimo aprobado: commit `d5e916abbc82c4797df45e9b53dfd7a32c621916`.
- Backend runtime esperado: `d155910c231e96446672508534ccec83bf0d830f`.

## Fundamento

Los tres intentos anteriores fallaron de forma fail-closed y no dejaron datos persistidos. El tercer fallo fue causado por truncamiento del canal efímero usado para entregar SQL, no por el SQL canónico. El wrapper aprobado ahora resuelve `prepare_fixtures.sql` desde su propio checkout Git, exige archivos rastreados y sin modificaciones staged/unstaged, rechaza el checkout legado `/opt/apps/skia/staging` y ejecuta exclusivamente `psql -f` sobre el archivo canónico.

## Precondiciones obligatorias

Antes de cualquier escritura:

1. Actualizar la referencia remota y ejecutar desde un checkout limpio de `phase/002-fixture-implementation` que contenga como mínimo `d5e916abbc82c4797df45e9b53dfd7a32c621916` y esta decisión.
2. Ejecutar nuevamente el preflight read-only y exigir resultado aprobado.
3. Confirmar backend runtime `d155910c231e96446672508534ccec83bf0d830f` y `relevant_runtime_source_differs=false`.
4. Confirmar rango canónico vacío y ausencia de colisiones TEST.
5. Confirmar respaldo externo verificable de `skia_db` conforme a la evidencia previa.
6. Generar credenciales de prueba nuevas fuera de Git; no registrar passwords, hashes reutilizables, cookies ni tokens en evidencia.
7. Crear un destino de manifest nuevo, absoluto, externo al repositorio, no symlink, inicialmente inexistente; el wrapper debe precrearlo en modo `0600`.
8. No copiar, truncar, concatenar, filtrar, reconstruir ni alimentar `prepare_fixtures.sql` por stdin. La única ruta autorizada es el wrapper canónico y su invocación interna `psql -f`.

## Ejecución autorizada

- Invocar `tools/phase002/prepare_fixtures.sh` exactamente una vez.
- No ejecutar `prepare_fixtures.sql` directamente.
- No modificar tooling durante el intento.
- Si el wrapper o psql devuelve código distinto de cero, detenerse inmediatamente y ejecutar únicamente survivor check read-only sobre las tablas autorizadas. No corregir y reintentar bajo esta decisión.

## Verificación tras éxito de preparación

Solo si la preparación devuelve exit code `0`:

1. Confirmar que el manifest existe, es archivo regular, no symlink y modo `0600`.
2. Calcular SHA-256 externamente y conservar únicamente checksum/resumen no sensible en evidencia versionada.
3. Verificar cardinalidades exactas esperadas del fixture y coherencia tenant/branch.
4. Ejecutar `verify_fixtures.sql` únicamente en modo read-only.
5. Registrar resultado como `APROBADO`, `FALLIDO` o `BLOQUEADO` sin ocultar discrepancias.

Si la preparación hace commit pero cualquier verificación posterior falla, detenerse. Conservar manifest y checksum protegidos. No ejecutar rollback automático sin nueva autorización.

## No autorizado

Esta decisión NO autoriza:

- CAMPAÑA A HTTP ni logins autenticados;
- cambios RLS;
- migraciones;
- rollback operativo, salvo una decisión posterior explícita;
- deploy;
- producción;
- cambios de arquitectura o esquema.

## Criterio de salida

El cuarto intento solo puede declararse exitoso si preparación, manifest, checksum, cardinalidades y `verify_fixtures.sql` quedan aprobados. Un fallo en cualquier punto mantiene PHASE-002 bloqueada para CAMPAÑA A.