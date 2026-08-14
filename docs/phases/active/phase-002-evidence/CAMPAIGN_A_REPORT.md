# PHASE-002 — CAMPAÑA A isolation report

## Control

- Fecha: `2026-08-14` (`America/Tijuana`).
- Decisión: `ARCHITECT_DECISION_CAMPAIGN_A_GATE.md`.
- Rama: `phase/002-fixture-implementation`.
- Evidencia de preparación publicada: `fac49cb2d49d802f6f4a8e50c3cab40c157bf04b`.
- Backend runtime: `d155910c231e96446672508534ccec83bf0d830f`.
- Manifest SHA-256: `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`.
- Origen: `LOCAL` + `HTTP STAGING` + observación `POSTGRES STAGING` read-only.
- Resultado global: **BLOQUEADA — RUNNER INCOMPATIBLE CON BASH LOCAL**.

## Precondiciones

Antes del primer login se confirmó:

- `FIXTURE_PREPARATION_REPORT.md` versionado y publicado;
- manifest externo regular, no symlink, modo `0600` y checksum exacto;
- preflight read-only aprobado, `relevant_runtime_source_differs=false`;
- fixture V1 presente con cardinalidades exactas y sin colisiones;
- 9 credenciales TEST fuera de Git y archivo modo `0600`;
- contexto determinista fuera de Git y modo `0600`;
- RLS sin cambios y permiso normativo `dcim:view` todavía `NO ENFORCED`;
- frontend staging y backend accesibles mediante HTTPS.

## Ejecución observada

Se invocó únicamente `tools/phase002/run_isolation_tests.sh` contra staging con CAMPAÑA `A`. El runner realizó su secuencia hasta alcanzar el bucle de `ISO-021`, donde Bash 3.2 rechazó la expansión `${tenant^^}`:

```text
bad substitution
```

No se emitió la tabla final de veredictos. Aunque el proceso exterior reportó exit code `0`, la salida fatal y la ausencia completa de la matriz hacen que ese código no sea evidencia de éxito. Los resultados intermedios residían únicamente en el directorio temporal privado del runner y fueron eliminados por su trap de salida; no se conservaron cuerpos HTTP, cookies, tokens ni IDs de sesión.

No se modificó el runner ni se repitió con otro intérprete. Continuar habría requerido cambiar el mecanismo de ejecución después de iniciada la campaña, fuera del gate vigente.

## Matriz ISO-001 a ISO-022

| IDs | Ejecución | Estado | Razón |
| --- | --- | --- | --- |
| ISO-001–ISO-020 | solicitudes potencialmente emitidas antes del aborto; resultados no emitidos ni recuperables | BLOQUEADO | no existe evidencia tabular suficiente para aprobar, fallar o determinar fugas |
| ISO-021 | no completado | BLOQUEADO | incompatibilidad `${tenant^^}` al construir variables de actores OPERATOR |
| ISO-022 | no alcanzado | BLOQUEADO | el runner abortó antes de la correlación prevista |

No se asigna estado `APROBADO` ni `FALLIDO` a ninguna prueba sin evidencia preservada. En particular, no puede afirmarse ausencia de fuga cross-tenant o cross-branch.

## Observación read-only posterior

Una consulta `BEGIN READ ONLY`/`ROLLBACK`, sin IDs ni tokens, registró:

- usuarios fixture: `9`;
- sesiones fixture persistidas observadas: `0`;
- activos fixture: `60`;
- checksum e integridad del manifest: aprobados.

Esta observación confirma integridad del fixture y ausencia de sesiones persistidas visibles en PostgreSQL; no reconstruye los resultados HTTP eliminados y no valida aislamiento.

## Seguridad y temporales

- No se registraron passwords, hashes, cookies, tokens, session IDs ni cuerpos completos.
- Los temporales de respuestas/cookies del runner no se conservaron después de su salida.
- Las credenciales TEST permanecen fuera de Git en archivo `0600` a la espera de una decisión posterior.
- El manifest permanece externo y protegido para el rollback futuro autorizado.

## Conclusión

CAMPAÑA A **no quedó completada** y permanece `BLOQUEADA`. No existe una fuga crítica confirmada, pero tampoco evidencia suficiente para afirmar ausencia de fugas o aprobar el aislamiento.

Se requiere corregir y revisar de forma separada la portabilidad del runner antes de autorizar una nueva ejecución. No se ejecutó rollback, RLS, migraciones, deploy ni CAMPAÑA B.

## Corrección posterior del runner

Decisión aplicable: `ARCHITECT_DECISION_CAMPAIGN_A_RUNNER_PORTABILITY.md`.

La corrección local, todavía no ejecutada contra staging:

- reemplaza `${tenant^^}` por un `case` explícito `a|b|c → A|B|C`, independiente de locale y compatible con Bash 3.2;
- hace portable el guard de modo mediante detección explícita GNU/BSD, salida octal validada y normalización exacta a `600`;
- emite exactamente una matriz redactada desde el trap de salida;
- marca `COMPLETE` solo cuando el flujo termina normalmente y `INCOMPLETE` ante cualquier salida anormal;
- preserva las filas acumuladas antes de truncar/eliminar bodies y cookie jars temporales;
- registra una fila `FALLIDO` y termina con exit `86` ante una fuga cross-tenant confirmada;
- corrige la expresión jq de detección cross-tenant/cross-branch para evaluar el código completo sin cambiar endpoints ni expectativas.

Validaciones `LOCAL`, sin HTTP staging:

| Prueba | Resultado |
| --- | --- |
| `bash -n` | APROBADO |
| Ejecución completa simulada con Bash `3.2.57`, rama GNU del guard | exit `0`, una matriz `COMPLETE` |
| Mapeo de credenciales `a`, `b`, `c` | resolvió exactamente actores `A`, `B`, `C` |
| Rama BSD/macOS del guard | exit `0`, una matriz `COMPLETE` |
| Aborto simulado después de varias filas | exit `42`, una matriz parcial `INCOMPLETE` antes de limpiar |
| Fuga cross-tenant simulada | fila `FALLIDO` con fuga `true`, exit `86`, stop antes del siguiente caso |
| Salida sensible simulada | ningún body, password ni marcador sensible apareció en stdout |
| Limpieza de temporales | aprobada en caminos normal, aborto y fuga |
| `git diff --check` | APROBADO |

Esta validación no reejecutó CAMPAÑA A y no modifica la clasificación `BLOQUEADA` del intento anterior. Se requiere un gate arquitectónico posterior para una nueva campaña.

## Reintento completo autorizado

- Fecha: `2026-08-14` (`America/Tijuana`).
- Decisión: `ARCHITECT_DECISION_CAMPAIGN_A_RETRY.md`.
- HEAD de ejecución: `08554b0c56bb5894670cedbd4afe0d91b65e7f94`.
- Runner aprobado: `fb88dbc7c40c54cd2803b2756d15caeed73da929`.
- Resultado estructural del runner: `CAMPAIGN_EXECUTION_STATUS=COMPLETE`, exit code `0`.
- Resultado funcional global: **FALLIDO**.

Antes del primer request se confirmó checkout limpio, runtime backend `d155910c231e96446672508534ccec83bf0d830f`, `relevant_runtime_source_differs=false`, checksum exacto del manifest y todas las cardinalidades de Fixture V1. Credenciales y contexto permanecieron fuera de Git en modo `0600`.

El runner se ejecutó exactamente una vez desde `ISO-001`. Todas las solicitudes HTTP observaron código `301`; el runner no sigue redirects. Por ello no hubo login, sesión o consulta de activos evaluable, todos los conteos observados fueron `0` y ninguna denegación pudo aprobarse con los códigos esperados `401`/`403`/`404`.

### Matriz redactada

| ID | Actor/operación | HTTP | Estado | Esperado | Observado | Cross-tenant | Cross-branch |
| --- | --- | ---: | --- | ---: | ---: | --- | --- |
| ISO-001 | a_admin login | 301 | FALLIDO | N/A | N/A | false | false |
| ISO-001 | a_admin session | 301 | FALLIDO | N/A | N/A | false | false |
| ISO-002 | invalid login | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-003 | a_admin select tenant A | 301 | FALLIDO | N/A | N/A | false | false |
| ISO-004 | a_admin select branch A1 | 301 | FALLIDO | N/A | N/A | false | false |
| ISO-005 | a_operator assets A1 | 301 | FALLIDO | 10 | 0 | false | false |
| ISO-006 | a_operator deny branch A2 | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-007 | a_multi assets A1 | 301 | FALLIDO | 10 | 0 | false | false |
| ISO-007 | a_multi assets A2 | 301 | FALLIDO | 10 | 0 | false | false |
| ISO-008 | a_admin deny tenant B | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-009 | a_admin deny branch B1 | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-010 | a_admin manipulated tenant/branch query | 301 | FALLIDO | 10 | 0 | false | false |
| ISO-011 | a_admin own asset A1 | 301 | FALLIDO | N/A | N/A | false | false |
| ISO-011 | logs/relationships endpoint absent | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-012 | a_admin deny asset B1 | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-012 | relationship endpoint absent | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-013 | actor without context | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-014 | actor without branch | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-015 | invalid session | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-016 | expiry/revocation observation | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-017 | b_admin assets B1 | 301 | FALLIDO | 10 | 0 | false | false |
| ISO-018 | c_admin assets C2 | 301 | FALLIDO | 10 | 0 | false | false |
| ISO-019 | b_admin deny tenant C | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-019 | b_admin deny branch C1 | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-020 | c_admin deny tenant A | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-020 | c_admin deny branch A2 | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-021 | a_operator logout | 301 | FALLIDO | N/A | N/A | false | false |
| ISO-021 | a_operator reuse after logout | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-021 | b_operator logout | 301 | FALLIDO | N/A | N/A | false | false |
| ISO-021 | b_operator reuse after logout | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-021 | c_operator logout | 301 | FALLIDO | N/A | N/A | false | false |
| ISO-021 | c_operator reuse after logout | 301 | FALLIDO | 0 | 0 | false | false |
| ISO-022 | PostgreSQL context correlation | N/A | BLOQUEADO | N/A | N/A | false | false |

Las filas internas `SETUP` de los actores también observaron login `301/FALLIDO`. No se registró `CROSS_TENANT_LEAK=true` ni `CROSS_BRANCH_LEAK=true`, pero esto significa que no se observó contenido debido al redirect; **no demuestra ausencia de fuga**.

### Correlación PostgreSQL read-only posterior

La observación autorizada se ejecutó mediante `BEGIN READ ONLY`/`ROLLBACK`:

- `current_user=skia_user`;
- `current_database=skia_db`;
- usuarios fixture: `9`;
- sesiones fixture: `0`;
- mappings `user_tenants`: `9`;
- mappings `user_branches`: `15`;
- activos fixture: `60`;
- tablas con RLS habilitado: `0`;
- integridad/checksum del manifest: aprobados.

Al no existir sesiones TEST persistidas, no fue posible correlacionar tenant/branch de sesión con la matriz HTTP. `ISO-022` permanece `BLOQUEADO`.

### Conclusión del reintento

La secuencia completa del runner terminó, pero CAMPAÑA A tiene resultado funcional **FALLIDO** por redirects `301` en todas las operaciones HTTP. El aislamiento autenticado continúa sin evidencia suficiente y no puede aprobarse. No se reejecutó, no se corrigió la URL/runner y no se siguieron redirects fuera de esta autorización.

No se ejecutó rollback, CAMPAÑA B, RLS, migraciones ni deploy. El fixture, manifest y credenciales protegidas permanecen disponibles hasta una decisión arquitectónica posterior.

## Reintento con host canónico

- Fecha: `2026-08-14` (`America/Tijuana`).
- Decisión: `ARCHITECT_DECISION_CAMPAIGN_A_CANONICAL_HOST_RETRY.md`.
- HEAD de ejecución: `4a103da195cd19076b7c6b7814253d90c4296dce`.
- Runner aprobado: `fb88dbc7c40c54cd2803b2756d15caeed73da929`.
- Base URL exacta: `https://skia.iamet.mx`.
- Resultado estructural: `CAMPAIGN_EXECUTION_STATUS=COMPLETE`, exit code `0`.
- Resultado funcional global: **FALLIDO — SELECCIÓN CROSS-BRANCH NO AUTORIZADA**.

Antes del primer login se confirmó checkout limpio, runtime backend esperado, ausencia de divergencia, todas las cardinalidades de Fixture V1, checksum exacto del manifest y archivos externos modo `0600`. El runner se ejecutó exactamente una vez desde `ISO-001`; no siguió redirects ni reutilizó filas anteriores.

### Matriz canónica redactada

| ID | Actor/operación | HTTP | Estado runner | Esperado | Observado | Cross-tenant | Cross-branch |
| --- | --- | ---: | --- | ---: | ---: | --- | --- |
| ISO-001 | a_admin login | 200 | APROBADO | N/A | N/A | false | false |
| ISO-001 | a_admin session | 200 | APROBADO | N/A | N/A | false | false |
| ISO-002 | invalid login | 401 | APROBADO | 0 | 0 | false | false |
| ISO-003 | a_admin select tenant A | 200 | APROBADO | N/A | N/A | false | false |
| ISO-004 | a_admin select branch A1 | 200 | APROBADO | N/A | N/A | false | false |
| ISO-005 | a_operator assets A1 | 200 | APROBADO | 10 | 10 | false | false |
| ISO-006 | a_operator select unauthorized A2 | 200 | **FALLIDO** | 0 | 0 | false | false |
| ISO-007 | a_multi assets A1 | 200 | APROBADO | 10 | 10 | false | false |
| ISO-007 | a_multi assets A2 | 200 | APROBADO | 10 | 10 | false | false |
| ISO-008 | a_admin deny tenant B | 403 | APROBADO | 0 | 0 | false | false |
| ISO-009 | a_admin deny branch B1 | 403 | APROBADO | 0 | 0 | false | false |
| ISO-010 | manipulated query remains A1 | 200 | APROBADO | 10 | 10 | false | false |
| ISO-011 | own asset A1 | 200 | APROBADO | N/A | N/A | false | false |
| ISO-011 | logs/relationships endpoint absent | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-012 | deny asset B1 | 404 | APROBADO | 0 | 0 | false | false |
| ISO-012 | relationship endpoint absent | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-013 | actor without context | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-014 | actor without branch | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-015 | invalid session | 401 | APROBADO | 0 | 0 | false | false |
| ISO-016 | expiry/revocation observation | N/A | BLOQUEADO | N/A | N/A | false | false |
| ISO-017 | b_admin assets B1 | 200 | APROBADO | 10 | 10 | false | false |
| ISO-018 | c_admin assets C2 | 200 | APROBADO | 10 | 10 | false | false |
| ISO-019 | b_admin deny tenant C | 403 | APROBADO | 0 | 0 | false | false |
| ISO-019 | b_admin deny branch C1 | 403 | APROBADO | 0 | 0 | false | false |
| ISO-020 | c_admin deny tenant A | 403 | APROBADO | 0 | 0 | false | false |
| ISO-020 | c_admin deny branch A2 | 403 | APROBADO | 0 | 0 | false | false |
| ISO-021 | a_operator logout | 200 | APROBADO | N/A | N/A | false | false |
| ISO-021 | a_operator reuse after logout | 401 | APROBADO | 0 | 0 | false | false |
| ISO-021 | b_operator logout | 200 | APROBADO | N/A | N/A | false | false |
| ISO-021 | b_operator reuse after logout | 401 | APROBADO | 0 | 0 | false | false |
| ISO-021 | c_operator logout | 200 | APROBADO | N/A | N/A | false | false |
| ISO-021 | c_operator reuse after logout | 401 | APROBADO | 0 | 0 | false | false |
| ISO-022 | PostgreSQL context correlation | N/A | BLOQUEADO en runner; **FALLIDO combinado** | N/A | N/A | false | true |

Todos los logins `SETUP` requeridos devolvieron `200/APROBADO`. Las consultas de activos observables devolvieron exactamente 10 aliases de la branch esperada y cero aliases de otros tenants/branches. No se confirmó fuga de datos cross-tenant.

### Hallazgo ISO-006

El actor lógico `A-OPERATOR`, limitado por fixture a `TEST-BRANCH-A1`, recibió HTTP `200` al seleccionar `TEST-BRANCH-A2`. El runner registró correctamente `ISO-006=FALLIDO`.

La correlación PostgreSQL posterior confirmó una sesión activa de `A-OPERATOR` con contexto `TEST-TENANT-A / TEST-BRANCH-A2`, y una sesión fixture cuyo branch no existe en `user_branches` para ese actor. Esto demuestra una **mutación de contexto cross-branch no autorizada**. El runner no consultó activos A2 después de esa selección, por lo que esta evidencia no afirma que datos A2 hayan sido filtrados al actor; sí demuestra que la selección fail-closed falló.

### Correlación PostgreSQL read-only

La observación se realizó mediante `BEGIN READ ONLY`/`ROLLBACK`, sin leer tokens ni IDs de sesión:

- `current_user=skia_user`;
- `current_database=skia_db`;
- sesiones fixture: `5`;
- sesiones fixture activas: `5`;
- sesiones sin tenant/branch: `0`;
- sesiones con tenant fuera de `user_tenants`: `0`;
- sesiones con branch fuera de `user_branches`: `1`;
- activos fixture: `60`;
- tablas relevantes con RLS habilitado: `0`;
- checksum/integridad del manifest: aprobados.

Contextos agregados observados:

| Actor lógico | Tenant | Branch | Sesiones |
| --- | --- | --- | ---: |
| A-ADMIN | TEST-TENANT-A | TEST-BRANCH-A1 | 1 |
| A-MULTI | TEST-TENANT-A | TEST-BRANCH-A2 | 1 |
| A-OPERATOR | TEST-TENANT-A | TEST-BRANCH-A2 | 1 |
| B-ADMIN | TEST-TENANT-B | TEST-BRANCH-B1 | 1 |
| C-ADMIN | TEST-TENANT-C | TEST-BRANCH-C2 | 1 |

Las dos primeras consultas de correlación abortaron en modo read-only por supuestos incorrectos sobre el tipo `BIGINT` de `expires_at` y una cláusula `GROUP BY`; no realizaron escrituras. La consulta final corrigió únicamente esas expresiones y produjo los resultados anteriores.

### Dictamen de campaña

CAMPAÑA A alcanzó el backend canónico y completó la matriz, pero queda **FALLIDA** por `ISO-006` y por la correlación cross-branch de `ISO-022`. El aislamiento cross-tenant observado por las rutas cubiertas fue fail-closed, pero el aislamiento multi-branch no puede aprobarse. Además, RLS permanece deshabilitado en las tablas relevantes, sin defensa en profundidad.

No se corrigió código, no se revocaron sesiones y no se reejecutó la campaña. No se ejecutó rollback, CAMPAÑA B, RLS, migraciones ni deploy. Fixture, manifest y credenciales permanecen protegidos hasta una decisión posterior.

## Reanudación posterior a PHASE-004

- Fecha: `2026-08-14` (`America/Tijuana`).
- Decisión: `ARCHITECT_DECISION_PHASE004_CLOSURE_AND_PHASE002_RESUME.md`.
- Evidencia final PHASE-004 publicada: `1f4b2e6`.
- HEAD PHASE-002 de ejecución: `4a103da195cd19076b7c6b7814253d90c4296dce`.
- Backend runtime: `01efd5099758d8ad85fc4bcdf4720c5e23e59270`.
- Base URL exacta: `https://skia.iamet.mx`.
- Resultado estructural: `CAMPAIGN_EXECUTION_STATUS=INCOMPLETE`, exit code `1`.
- Estado: **BLOQUEADO — INPUT EXTERNO DE LOGIN INVÁLIDO AUSENTE**.

### Precondiciones

Antes del único lanzamiento se confirmó:

- health interno y público HTTP `200`;
- backend saludable, sin reinicios y con el SHA autorizado;
- fixture íntegro: 3 tenants, 6 branches, 9 usuarios, 60 activos, 60 logs y 6 relaciones;
- manifest modo `0600` y checksum aprobado `6850065c8a25c654e3efff6ef27ddfaaed7d0a0c783edd081eacdb0c86f6c161`;
- cero sesiones TEST fuera de `user_branches`;
- RLS relevante sin cambios, con conteo habilitado `0`.

### Único lanzamiento

El runner se inició una sola vez desde `ISO-001`. Los dos registros de `ISO-001` aprobaron con HTTP `200`: login y lectura de sesión de A-ADMIN.

Antes de efectuar `ISO-002`, el guard del runner detectó que el archivo externo protegido no contenía `EMAIL_INVALID` ni `PASSWORD_INVALID`. El proceso terminó con exit code `1`, emitió `INCOMPLETE` y eliminó sus cuerpos, cookies y archivos temporales conforme al trap seguro. La salida redactada quedó fuera del repositorio en un archivo modo `0600`.

| ID | Actor/operación | HTTP | Estado | Cross-tenant | Cross-branch |
| --- | --- | ---: | --- | --- | --- |
| ISO-001 | a_admin login | 200 | APROBADO | false | false |
| ISO-001 | a_admin session | 200 | APROBADO | false | false |
| ISO-002..ISO-022 | no ejecutados | N/A | NO EJECUTADO | false | false |

### Correlación posterior read-only

Después de detener la campaña, sin más solicitudes HTTP:

- sesiones fixture observadas: `9`;
- sesiones TEST fuera de `user_branches`: `0`;
- health interno: HTTP `200`;
- health público: HTTP `200`.

### Dictamen

La nueva CAMPAÑA A **no se completó** y no puede aprobarse. Conforme al criterio de detención inmediata, no se añadieron las variables faltantes y no se reintentó el runner. No hubo evidencia de fuga cross-tenant, mutación cross-branch nueva ni cambio de runtime; la causa fue exclusivamente la ausencia de los dos inputs externos requeridos para la prueba negativa de login.

No se ejecutó CAMPAÑA B, rollback de fixtures, RLS, migraciones, cambios de esquema, deploy adicional ni corrección del runner.
