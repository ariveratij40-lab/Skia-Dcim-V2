# ARCHITECT DECISION — PHASE-002 Campaign A Runner Portability

## Estado

- CAMPAÑA A ejecutada: `BLOQUEADA / INCOMPLETA`.
- Fixture V1: debe permanecer intacto.
- Reejecución de CAMPAÑA A: NO AUTORIZADA hasta corregir, versionar y revisar el runner.
- RLS, rollback, migraciones y deploy: NO AUTORIZADOS.

## Hallazgo

El runner abortó en `ISO-021` porque utiliza expansión de mayúsculas `${tenant^^}`, disponible en Bash 4+ pero no en Bash 3.2. Debido a que la matriz de resultados se mantiene únicamente en un archivo temporal y se imprime al final, el aborto impidió conservar evidencia verificable de `ISO-001`–`ISO-020`.

La campaña no permite concluir si hubo o no fuga cross-tenant/cross-branch. Los resultados parciales no deben reconstruirse por memoria, logs incompletos ni inferencia.

## Corrección autorizada

Modificar únicamente `tools/phase002/run_isolation_tests.sh` y la evidencia de CAMPAÑA A para:

1. Eliminar `${var^^}` y cualquier otra dependencia no soportada por Bash 3.2 en el flujo ejecutado. La conversión de `a|b|c` a `A|B|C` debe ser explícita y determinista; preferencia: `case` sobre los tres tenants permitidos. No depender de locale para semántica de seguridad.
2. Mantener `set -euo pipefail` y el comportamiento fail-closed.
3. Hacer portable el helper de modo de archivos usando la misma estrategia aprobada para `prepare_fixtures.sh`: probar GNU `stat -c`, aceptar solo modo octal válido, caer explícitamente a BSD/macOS `stat -f`, normalizar y exigir `600`.
4. Preservar evidencia parcial no sensible ante cualquier salida anormal después de iniciar la matriz. El runner debe emitir siempre, mediante trap/función de cierre, las filas acumuladas en `results.tsv` antes de destruir el directorio temporal. Nunca debe emitir bodies HTTP, cookies, tokens, passwords, session IDs ni archivos temporales completos.
5. La evidencia parcial debe incluir una marca inequívoca de ejecución incompleta cuando el exit code sea distinto de cero, para impedir que un conjunto parcial se interprete como campaña completa.
6. Mantener el criterio actual de contenido: HTTP 2xx no basta; las pruebas de activos deben validar conteos y ausencia de alias de otros tenant/branch.
7. Mantener stop inmediato ante fuga cross-tenant confirmada. Si se implementa ese stop, primero debe registrarse la fila `FALLIDO` que demuestra la fuga y luego terminar la campaña conservando la matriz parcial.
8. No cambiar endpoints, expectativas funcionales ISO, credenciales, fixtures, SQL, RLS ni backend para hacer pasar las pruebas.

## Validación local obligatoria antes de publicar

- `bash -n`.
- Ejecución/simulación explícita bajo Bash 3.2 cuando esté disponible; si no está disponible, validar estáticamente ausencia de construcciones Bash 4+ y reportar la limitación.
- Camino `a`, `b`, `c` produce exactamente `A`, `B`, `C` para resolver variables de credenciales.
- Simular aborto después de varias filas y demostrar que la matriz parcial redacted se emite con estado `INCOMPLETE` antes de limpiar temporales.
- Simular salida normal y demostrar una sola matriz final marcada `COMPLETE`.
- Confirmar que ningún body/cookie/token/password/session ID entra en stdout/evidencia.
- Validar ramas GNU y BSD del guard de permisos o reutilizar una función ya probada sin degradar el control.
- `git diff --check`.

## Evidencia del intento bloqueado

`CAMPAIGN_A_REPORT.md` debe registrar:

- que el runner alcanzó el punto previo a `ISO-021` pero los resultados anteriores no son recuperables como evidencia formal;
- que `ISO-001`–`ISO-022` quedan `BLOQUEADO` para conclusión global de la campaña;
- que el control posterior confirmó `fixture_users=9`, `fixture_sessions=0`, `fixture_assets=60` e integridad del manifest;
- que no puede confirmarse ni descartarse una fuga a partir de la ejecución abortada.

## Siguiente gate

Después de publicar la corrección, el Arquitecto Técnico/Auditor revisará el commit. Solo una decisión posterior podrá autorizar reejecutar CAMPAÑA A desde el inicio con credenciales existentes protegidas o con credenciales nuevas, según el estado verificado del fixture.
