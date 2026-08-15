# PHASE-005 — CAMPAÑA B Runner Read-only Diagnostic

## Resultado

- Fecha: `2026-08-14` / `2026-08-15 UTC`.
- Rama: `phase/005-rls-enforcement`.
- Baseline: `b6ba15b40e5185738c62fb406fbe9e0d4091ef0d`.
- Diagnóstico STAGING: exclusivamente read-only.
- Reejecución CAMPAÑA B: **NO EJECUTADA**.
- Corrección mínima del runner: **APROBADA LOCALMENTE**.

## Evidencia del incidente

La única invocación anterior imprimió solamente
`INVALID_INPUT_PREFLIGHT=APPROVED`. No emitió:

- `CAMPAIGN_EXECUTION_STATUS`;
- `PROCESS_EXIT_CODE`;
- cabecera o filas de matriz ISO.

La correlación PostgreSQL read-only posterior encontró 5 sesiones TEST creadas
en el minuto `2026-08-15 00:12 UTC`, coincidente con la invocación. Corresponden
al patrón de actores iniciales de la matriz. Por ello el proceso superó guards,
carga de inputs y entró en HTTP; no fue solamente un fallo previo a ISO-001.

No existe registro persistido del signal/exit exacto que terminó el proceso.
Reconstruirlo desde sesiones o logs supondría inferir resultados ISO no
emitidos, lo cual está prohibido por el gate y no se realizó.

## Causa técnica

El runner anterior instalaba `trap finalize EXIT` después de:

- guards de ambiente/aprobación/rutas/modos;
- comprobación de herramientas y raíz Git;
- `source` de contexto y credenciales;
- creación inicial de temporales.

Además, no capturaba `HUP`, `INT` ni `TERM`. Una terminación por signal podía
evitar la ruta `EXIT` normal y perder por completo status, exit code y matriz,
incluso después de iniciar HTTP. El diseño tampoco garantizaba evidencia para
fallos tempranos anteriores a la instalación del trap.

El disparador externo específico no es recuperable del intento anterior; la
causa determinable de que no existiera evidencia fue la cobertura incompleta
del ciclo de terminación del runner.

## Corrección mínima

`tools/phase002/run_isolation_tests.sh` ahora:

1. inicializa estado y emisor antes de cualquier guard;
2. instala `EXIT`, `HUP`, `INT` y `TERM` antes de operaciones que pueden fallar;
3. puede emitir una cabecera segura incluso si todavía no existe archivo de
   resultados;
4. convierte señales controlables en exits deterministas:
   - HUP `129`;
   - INT `130`;
   - TERM `143`;
5. desinstala traps dentro de `finalize` para evitar recursión;
6. limpia temporales solo cuando el directorio fue creado;
7. conserva `COMPLETE` únicamente para final normal con
   `campaign_complete=true` y exit `0`; todo lo demás es `INCOMPLETE`.

No cambió ninguna expectativa ISO, request, validación de contenido, manejo de
credenciales, detección de fugas ni semántica funcional de la campaña.

## Validación local sin red

Se añadió `tools/phase002/tests/test_runner_emission.sh`. El test extrae la
inicialización real del runner hasta antes de ISO-001, usa archivos sintéticos
modo `0600` y no realiza HTTP ni conexión externa.

| Terminación | Resultado esperado | Resultado |
|---|---|---|
| Guard inicial fallido | `INCOMPLETE`, exit `1`, cabecera | APROBADO |
| Terminación normal | `COMPLETE`, exit `0`, cabecera | APROBADO |
| Comando controlado fallido | `INCOMPLETE`, exit `1`, cabecera | APROBADO |
| HUP | `INCOMPLETE`, exit `129`, cabecera | APROBADO |
| INT | `INCOMPLETE`, exit `130`, cabecera | APROBADO |
| TERM | `INCOMPLETE`, exit `143`, cabecera | APROBADO |

Validaciones:

- `bash -n`: APROBADO;
- `RUNNER_EMISSION_TESTS=APPROVED`;
- `shellcheck`: no disponible, no instalado;
- `git diff --check`: APROBADO antes de versionar.

## Estado de STAGING

No se modificó STAGING. El único acceso adicional fue una consulta agregada de
timestamps/counts de sesiones TEST, sin IDs ni tokens. No se modificaron RLS,
policies, PostgreSQL, fixtures, sesiones, infraestructura o servicios.

CAMPAÑA B continúa bloqueada y no fue reintentada. La corrección queda lista
para revisión arquitectónica; cualquier nueva campaña requiere otro gate.
