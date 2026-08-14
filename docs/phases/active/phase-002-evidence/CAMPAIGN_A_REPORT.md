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
