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
