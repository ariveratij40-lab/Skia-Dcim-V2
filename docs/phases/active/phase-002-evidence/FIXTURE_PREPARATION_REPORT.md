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

Al momento de versionarla, esta corrección se validó únicamente de forma estática/local. El reintento autorizado posteriormente se registra a continuación.

## Segundo intento controlado

- Fecha: `2026-08-14` (`America/Tijuana`).
- Decisión: `ARCHITECT_DECISION_FIXTURE_PREPARATION_RETRY.md`.
- HEAD y decisión de ejecución: `2d13793cfe4a64bd154aa3f372c78a5a3851ab53`.
- Tooling correctivo aprobado: `60a52319d20a47ffbe19cbb2d54027731c10bd9d`.
- Origen: `STAGING VPS` + `POSTGRES STAGING`.
- Resultado: **FALLIDO ANTES DE PSQL; SIN DATOS PERSISTIDOS**.

Antes del reintento se confirmó que el tooling no había cambiado desde el commit correctivo, el respaldo externo seguía presente con modo `0600`, su checksum SHA-256 coincidía con la evidencia previa y `pg_restore --list` podía inspeccionarlo. Se generaron nueve credenciales completamente nuevas fuera de Git, con archivos `0600`.

El preflight read-only se repitió inmediatamente antes del intento y terminó con exit code `0`. Confirmó:

- runtime backend `d155910c231e96446672508534ccec83bf0d830f`;
- `relevant_runtime_source_differs=false`;
- base `skia_db` y rol runtime `skia_user`;
- rango canónico vacío y ausencia de colisiones TEST;
- rol neutral `operator` y permiso normativo `dcim:view`, `NO ENFORCED`.

Se invocó una sola vez `prepare_fixtures.sh`, sin ejecutar directamente el SQL. El wrapper terminó con exit code `24` en su comprobación local de permisos:

```text
BLOCKED: manifest permissions are not 0600
```

En GNU/Linux, `stat -f '%Lp'` no se comportó como el probe de formato BSD esperado por la expresión de fallback y produjo un valor distinto de `600`. El guard bloqueó antes de invocar `psql`; por tanto, `prepare_fixtures.sql` no fue procesado y no comenzó ninguna transacción de escritura.

Conforme a la decisión arquitectónica, no se corrigió ni reintentó interactivamente. Una consulta posterior `BEGIN READ ONLY`/`ROLLBACK` confirmó cero IDs en las once tablas autorizadas: `tenants`, `branches`, `users`, `roles`, `user_tenants`, `user_branches`, `user_roles`, `role_permissions`, `assets`, `asset_logs` y `asset_relationships`.

- Manifest externo: no existe; el wrapper eliminó el archivo pre-creado.
- Checksum de manifest: no aplica.
- Directorio externo vacío del reintento: eliminado.
- Credenciales/hashes frescos y generador temporal: eliminados; no fueron usados ni versionados.
- `verify_fixtures.sql`: no se ejecutó porque el wrapper no alcanzó psql; la verificación aplicable fue el survivor check read-only ordenado para fallos.
- CAMPAÑA A, HTTP, rollback, RLS, migraciones y deploy: no ejecutados.

Clasificación del segundo intento: **FALLIDO / BLOQUEADO POR PORTABILIDAD DEL GUARD DE PERMISOS**. Fixture V1 permanece ausente y CAMPAÑA A continúa no autorizada. Se requiere una nueva corrección revisada y una autorización separada antes de cualquier preparación futura.

## Corrección portable posterior

Decisión aplicable: `ARCHITECT_DECISION_PORTABLE_STAT_GUARD.md`.

El guard ahora prueba primero la variante GNU `stat -c '%a'` y solo acepta su resultado si es un modo octal de tres o cuatro dígitos. Si esa salida no es válida, prueba explícitamente la variante BSD/macOS `stat -f '%Lp'` bajo el mismo criterio. El modo validado se normaliza y debe ser exactamente `600`; una implementación desconocida, salida no octal o cualquier modo diferente bloquea antes de `psql`.

Validaciones `LOCAL` sin acceso externo:

| Prueba | Resultado |
| --- | --- |
| `bash -n tools/phase002/prepare_fixtures.sh` | APROBADO |
| Rama GNU simulada (`stat -c` → `600`) | APROBADO; cliente simulado invocado y manifest `0600` |
| Rama BSD/macOS simulada (`stat -c` no soportado, `stat -f` → `0600`) | APROBADO; cliente simulado invocado y manifest `0600` |
| Ninguna variante devuelve octal válido | APROBADO; exit `24`, cliente no invocado y manifest eliminado |
| Modo diferente de `0600` | APROBADO; exit `24`, cliente no invocado y manifest eliminado |
| `git diff --check` | APROBADO |

La corrección no modifica SQL, UUIDs, cardinalidades, RBAC, contenido del manifest, checksum ni lógica funcional de preparación. No autoriza ni ejecuta un tercer intento.

## Tercer intento controlado

- Fecha: `2026-08-14` (`America/Tijuana`).
- Decisión: `ARCHITECT_DECISION_FIXTURE_PREPARATION_RETRY_3.md`.
- HEAD y decisión de ejecución: `f8a341cd20d58753df9bb06093ab40a2378d6b03`.
- Tooling aprobado: `1e3cd6f5233bfbb587da81803e5f6bf2f86cc6f2`.
- Origen: `STAGING VPS` + `POSTGRES STAGING`.
- Resultado: **FALLIDO ANTES DE BEGIN; SIN DATOS PERSISTIDOS**.

Se confirmó que la decisión posterior no introdujo cambios adicionales en `tools/phase002/`. El respaldo externo permanecía legible, con modo `0600`, checksum SHA-256 consistente y formato inspeccionable por `pg_restore`. Se generaron nueve credenciales nuevas fuera de Git en archivos `0600`, y se creó un destino externo nuevo bajo un directorio `0700` sin manifest preexistente.

El preflight read-only inmediato terminó con exit code `0` y confirmó runtime backend `d155910c231e96446672508534ccec83bf0d830f`, `relevant_runtime_source_differs=false`, base `skia_db`, rol `skia_user`, rango canónico vacío y ausencia de colisiones TEST.

`prepare_fixtures.sh` se invocó exactamente una vez. El canal efímero de entrada utilizó incorrectamente un filtro limitado a las primeras 20 líneas al concatenar hashes y SQL. En consecuencia, psql recibió un documento truncado y terminó con exit code `3`:

```text
reached EOF without finding closing \endif(s)
```

El error ocurrió durante el procesamiento de metaórdenes psql, antes de alcanzar `BEGIN`. No fue un fallo del guard portable ni del contenido completo de `prepare_fixtures.sql`, sino de la orquestación usada para entregarlo. No se realizó corrección ni segunda invocación bajo esta autorización.

El wrapper eliminó el manifest pre-creado. Un survivor check posterior mediante `BEGIN READ ONLY`/`ROLLBACK` confirmó cero IDs en las once tablas autorizadas: `tenants`, `branches`, `users`, `roles`, `user_tenants`, `user_branches`, `user_roles`, `role_permissions`, `assets`, `asset_logs` y `asset_relationships`.

- Manifest externo: no existe.
- Checksum de manifest: no aplica.
- Directorio externo vacío: eliminado.
- Credenciales, hashes y generador temporal: eliminados; no usados ni versionados.
- `verify_fixtures.sql`: no ejecutado porque la preparación no alcanzó PostgreSQL; se aplicó el survivor check read-only del failure path.
- HTTP, CAMPAÑA A, rollback, RLS, migraciones y deploy: no ejecutados.

Clasificación: **TERCER INTENTO FALLIDO POR ENTRADA TRUNCADA / CERO PERSISTENCIA**. Fixture V1 sigue ausente. Cualquier nuevo intento requiere decisión arquitectónica separada.

## Corrección de ejecución SQL canónica

Decisión aplicable: `ARCHITECT_DECISION_CANONICAL_SQL_EXECUTION.md`.

El wrapper ahora resuelve físicamente su propio directorio y exige `prepare_fixtures.sql` como archivo regular, no symlink, bajo `tools/phase002/` del mismo checkout Git. Ambos archivos deben estar rastreados y sin diferencias staged o unstaged frente a `HEAD`; el checkout legado `/opt/apps/skia/staging` se rechaza. La única ejecución permitida del SQL es `psql -f` sobre esa ruta canónica validada.

El wrapper no acepta cuerpo SQL por stdin ni opciones psql arbitrarias. Solo admite las variables psql aprobadas, añade internamente `manifest_path` y la raíz Git verificada, y registra únicamente el SHA no sensible del checkout de tooling.

Validaciones `LOCAL` con psql simulado, sin conexión PostgreSQL:

| Prueba | Resultado |
| --- | --- |
| `bash -n tools/phase002/prepare_fixtures.sh` | APROBADO |
| Rama GNU del guard de modo | APROBADO; un solo `-f` apunta al SQL canónico y manifest `0600` |
| Rama BSD/macOS del guard de modo | APROBADO; un solo `-f` apunta al SQL canónico y manifest `0600` |
| stdin vacío | APROBADO; no altera la ruta ni la invocación canónica |
| SQL canónico ausente | APROBADO; bloquea antes de psql y no crea manifest |
| SQL canónico como symlink | APROBADO; bloquea antes de psql y no crea manifest |
| SQL canónico con modificación local | APROBADO; bloquea antes de psql y no crea manifest |
| Wrapper con modificación local | APROBADO; bloquea antes de psql y no crea manifest |
| `git diff --check` | APROBADO |

No se cambió `prepare_fixtures.sql`, UUIDs, cardinalidades, RBAC, manifest, checksum ni rollback. Esta corrección no ejecutó preparación, SQL, HTTP, fixtures, rollback, RLS, migraciones o deploy y no autoriza un cuarto intento.

## Cuarto intento controlado

- Fecha: `2026-08-14` (`America/Tijuana`).
- Decisión: `ARCHITECT_DECISION_FIXTURE_PREPARATION_RETRY_4.md`.
- HEAD y decisión de ejecución: `fb0792e08c5c9c2e9ae0cf20d19747ca0b34341f`.
- Tooling canónico mínimo aprobado: `d5e916abbc82c4797df45e9b53dfd7a32c621916`.
- Origen: `STAGING VPS` + `POSTGRES STAGING`.
- Resultado: **PREPARADO Y VERIFICADO**.

### Precondiciones

- Se creó un checkout Git aislado y limpio de `phase/002-fixture-implementation`, fuera del checkout legado y con HEAD `fb0792e08c5c9c2e9ae0cf20d19747ca0b34341f`. La ruta de tooling no presentaba cambios staged/unstaged.
- El respaldo externo previo permanecía legible, modo `0600`, checksum SHA-256 consistente y formato reconocido por `pg_restore --list`.
- Se generaron nueve credenciales nuevas fuera de Git. Los passwords no se registran en evidencia.
- El destino del manifest era absoluto, externo al repositorio, no existía y su directorio padre tenía modo `0700`.
- El preflight read-only inmediato terminó con exit code `0`: runtime backend `d155910c231e96446672508534ccec83bf0d830f`, `relevant_runtime_source_differs=false`, base `skia_db`, rol `skia_user`, rango canónico vacío y sin colisiones TEST.

### Preparación

Se invocó exactamente una vez `tools/phase002/prepare_fixtures.sh` desde el checkout canónico. El wrapper registró SHA `fb0792e08c5c9c2e9ae0cf20d19747ca0b34341f`, abrió directamente `prepare_fixtures.sql` mediante `psql -f`, alcanzó `COMMIT` y declaró completa la preparación. No se transportó SQL por stdin ni se ejecutó el archivo directamente.

El envoltorio SSH terminó inicialmente con exit code `1` después del éxito porque la limpieza posterior intentó usar la opción BSD `rm -P`, no soportada en GNU. Este error ocurrió después del `COMMIT` y del exit `0` del wrapper; no afectó la preparación. El archivo temporal de hashes se eliminó inmediatamente con `shred -u` y se confirmó ausente.

### Manifest

- Archivo regular: sí.
- Symlink: no.
- Modo: `0600`.
- Filas sin header: `183`.
- SHA-256: `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.
- IDs exactos: únicos y con formato válido.
- Aliases: aprobados contra los patrones canónicos de Fixture V1.

| Tabla | Conteo |
| --- | ---: |
| tenants | 3 |
| branches | 6 |
| users | 9 |
| roles | 3 |
| user_tenants | 9 |
| user_branches | 15 |
| user_roles | 9 |
| role_permissions | 3 |
| assets | 60 |
| asset_logs | 60 |
| asset_relationships | 6 |

### Verificación inmediata

`verify_fixtures.sql` se ejecutó mediante `psql -f` en una transacción `BEGIN READ ONLY` finalizada con `ROLLBACK`; exit code `0`.

- 3 tenants, 6 branches, 9 users, 3 roles, 60 assets, 60 logs y 6 relaciones: conteos exactos aprobados.
- Cada branch contiene 10 activos y metadata válida.
- Los nueve actores están asociados exclusivamente a su tenant; ADMIN/MULTI tienen dos branches y OPERATOR solo branch 1.
- Coherencia cross-tenant de FKs: aprobada, sin mismatch.
- Tres roles neutrales `operator`, permiso normativo exacto `dcim:view` y permission-set hash esperado: aprobados.
- Enforcement runtime de `dcim:view`: permanece `NO ENFORCED`.
- Roles privilegiados `admin`/`super_admin` dentro del fixture: ninguno.
- Roles obsoletos o no canónicos: ninguno.

### Seguridad y límites

El generador y los hashes temporales fueron eliminados. Las credenciales plaintext necesarias para una eventual campaña posterior permanecen fuera de Git en un archivo local `0600`; no fueron usadas. El manifest y su checksum permanecen protegidos fuera del repositorio para un futuro rollback autorizado.

No se ejecutó HTTP, login, CAMPAÑA A, rollback, RLS, migraciones o deploy. El resultado **PREPARADO Y VERIFICADO** no autoriza por sí mismo la campaña funcional ni declara seguro el aislamiento.
