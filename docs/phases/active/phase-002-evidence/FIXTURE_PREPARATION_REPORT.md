# PHASE-002 — Fixture preparation report

## Control

- Fecha: `2026-08-14` (`America/Tijuana`).
- Decisión: `ARCHITECT_DECISION_FIXTURE_PREPARATION_GATE.md`.
- Rama: `phase/002-fixture-implementation`.
- HEAD local al ejecutar: `d93d9f92a725043bc3ef2b6422217a3ad0dfcd5a`.
- Checkout exacto desde el que se ejecutó el tooling: `d93d9f92a725043bc3ef2b6422217a3ad0dfcd5a`.
- Último commit que modificó `prepare_fixtures.sql`: `925d0012e42debfc54fbdd44687b2867d2ec47a0`.
- Origen: `STAGING VPS` + `POSTGRES STAGING`.
- Alcance ejecutado: preflight inmediato, intento transaccional de preparación y verificación read-only.
- Preparación: **FALLIDA, SIN DATOS PERSISTIDOS**.
- Campaña HTTP, rollback manual, RLS, migraciones y deploy: **NO EJECUTADOS**.

## Precondiciones

| Control | Resultado |
| --- | --- |
| Reporte de preflight definitivo versionado | aprobado; commit local `d93d9f92a725043bc3ef2b6422217a3ad0dfcd5a` |
| Runtime backend activo | `d155910c231e96446672508534ccec83bf0d830f` |
| Entorno/base | `STAGING` / `skia_db` |
| Rol PostgreSQL efectivo | `skia_user` |
| Rango canónico antes de escribir | vacío; modo preparación |
| Colisiones TEST no canónicas | ninguna detectada |
| Perfil normativo | nombre neutral `operator`; permiso `dcim:view`; enforcement runtime `NO ENFORCED` |
| Respaldo previo | creado fuera de Git, permisos restrictivos, listado de restauración verificable y checksum SHA-256 confirmado |
| Credenciales temporales | nueve pares únicos generados fuera de Git; archivos locales `0600`; ningún valor o hash se registra aquí |
| Manifest previsto | ruta absoluta externa al repositorio bajo directorio `0700` |

El preflight se repitió inmediatamente antes del intento de preparación. Terminó con exit code `0`, dentro de `BEGIN READ ONLY`/`ROLLBACK`, y confirmó que la fuente runtime relevante no difería del SHA esperado. El SHA del frontend permanece `UNKNOWN/BLOQUEADO`.

## Resultado de preparación

El tooling inició una transacción y alcanzó las inserciones transaccionales previstas, pero `psql` rechazó la instrucción de exportación del manifest:

```text
ERROR: syntax error at or near "'manifest_path'"
```

La causa observada es la interpolación de la variable `manifest_path` en la metaorden `\copy`. `psql` terminó con exit code `3` y cerró la conexión con la transacción aún abierta; PostgreSQL revirtió automáticamente todas las inserciones. No se editó el script durante la ejecución ni se intentó una variante manual.

Clasificación: **FALLIDO**. El fallo pertenece al mecanismo de exportación del manifest del tooling aprobado, no a una incompatibilidad de esquema ni a una colisión de datos.

## Verificación inmediata

Se ejecutó `verify_fixtures.sql` sin modificaciones, en modo read-only. Terminó con exit code `0` y `ROLLBACK`. Como era esperable después de la reversión automática, los controles de presencia devolvieron cero frente a los conteos objetivo:

| Entidad | Observado | Esperado | Estado |
| --- | ---: | ---: | --- |
| tenants | 0 | 3 | FALLIDO |
| branches | 0 | 6 | FALLIDO |
| users | 0 | 9 | FALLIDO |
| roles | 0 | 3 | FALLIDO |
| assets | 0 | 60 | FALLIDO |
| asset_logs | 0 | 60 | FALLIDO |
| asset_relationships | 0 | 6 | FALLIDO |

Una comprobación read-only adicional confirmó también cero registros del rango autorizado en las once tablas contempladas por el manifest: `tenants`, `branches`, `users`, `roles`, `user_tenants`, `user_branches`, `user_roles`, `role_permissions`, `assets`, `asset_logs` y `asset_relationships`.

Los controles de ausencia de cruces FK y de ausencia de roles privilegiados/no canónicos permanecieron verdaderos porque no existe fixture persistido. Esto no constituye una verificación satisfactoria de Fixture V1.

## Manifest y rollback

- Manifest externo creado: **no**.
- Checksum del manifest: **no aplica**.
- Contenido sensible registrado: **ninguno**.
- Rollback manual: **no ejecutado**.
- Resultado de persistencia: **cero IDs supervivientes en todas las tablas autorizadas**.

La ausencia del manifest se verificó fuera del repositorio. No procede conservar un manifest vacío o incompleto.

## Bloqueante y siguiente decisión

Fixture V1 no quedó preparado. Antes de cualquier nuevo intento se requiere corregir y revisar la exportación externa del manifest en el tooling, validarla localmente y emitir una nueva autorización de ejecución. No debe iniciarse CAMPAÑA A.

El generador temporal y los archivos locales de credenciales/hashes derivados fueron eliminados después de documentar el fallo. No entraron al repositorio, no se utilizaron para HTTP y no se conserva material secreto recuperable de esa generación.

## Corrección posterior no ejecutada

La corrección sustituye la metaorden problemática `\copy` por una consulta CSV enviada a `\g :manifest_path`. Este mecanismo permite que psql expanda la variable como nombre de archivo; con `ON_ERROR_STOP`, cualquier fallo al abrir o escribir el destino termina la sesión antes de alcanzar `COMMIT`, provocando rollback automático.

Se agregó `prepare_fixtures.sh` como guard de cliente. El wrapper exige ruta absoluta externa, rechaza destinos dentro del repositorio, symlinks y archivos preexistentes, pre-crea el manifest con permisos `0600` y elimina el archivo incompleto si psql falla. Los IDs exactos y aliases del manifest no cambiaron.

Esta corrección fue validada únicamente de forma estática/local. No se repitió la preparación ni se ejecutó SQL, HTTP, fixture, rollback, RLS o deploy.
