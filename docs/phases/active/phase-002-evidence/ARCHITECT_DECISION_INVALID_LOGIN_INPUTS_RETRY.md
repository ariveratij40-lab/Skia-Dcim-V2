# ARCHITECT DECISION — PHASE-002 Invalid Login Inputs + Campaign A Retry

## Estado

- Decisión: AUTORIZADO CONDICIONALMENTE.
- Alcance: suministrar valores temporales inválidos para `EMAIL_INVALID` y `PASSWORD_INVALID` y reejecutar CAMPAÑA A completa desde `ISO-001`.
- Entorno: STAGING exclusivamente.
- Backend runtime esperado: `01efd5099758d8ad85fc4bcdf4720c5e23e59270`.
- Host canónico: `https://skia.iamet.mx`.

## Fundamento

El intento anterior quedó `INCOMPLETE` en `ISO-002` porque faltaban dos inputs externos exigidos por el runner para probar login inválido. No se observó fuga, nueva sesión inválida ni mutación cross-branch; el backend permaneció saludable y en el runtime PHASE-004 aprobado. La ausencia de estos inputs es un bloqueo de orquestación del test, no un defecto funcional del backend.

## Inputs autorizados

Codex puede generar automáticamente, fuera de Git y fuera de la base auditada, valores efímeros para:

- `EMAIL_INVALID`
- `PASSWORD_INVALID`

Requisitos:

1. Deben ser sintácticamente válidos para el endpoint de login, pero no corresponder a ningún usuario TEST ni usuario real conocido.
2. Deben generarse de forma aleatoria/única por intento.
3. Deben almacenarse únicamente en el archivo externo de credenciales/contexto ya protegido en modo `0600`, o en otro archivo temporal externo con modo `0600`.
4. No deben imprimirse, versionarse, reutilizarse como credenciales reales ni persistirse después de la campaña.
5. Antes de ejecutar el runner, se debe confirmar por lectura que el email inválido no existe en `users`; no registrar el valor completo en evidencia.

## Precondiciones obligatorias

Antes de `ISO-001`:

- rama `phase/002-fixture-implementation` limpia y sincronizada;
- runtime backend exacto `01efd5099758d8ad85fc4bcdf4720c5e23e59270`;
- health interno y público HTTP 200;
- fixture V1 íntegro con cardinalidades aprobadas;
- manifest SHA-256 íntegro según evidencia publicada;
- sesiones TEST fuera de `user_branches` = `0`;
- `PHASE002_BASE_URL=https://skia.iamet.mx`;
- runner sin modificaciones locales.

## Ejecución autorizada

- Generar automáticamente los dos inputs inválidos efímeros.
- Ejecutar `tools/phase002/run_isolation_tests.sh` exactamente una vez con CAMPAÑA `A`, desde `ISO-001`.
- Ejecutar únicamente la correlación PostgreSQL read-only posterior ya definida para sesiones/contexto/fixture.
- Publicar la evidencia de la campaña al terminar.

No es necesario solicitar aprobación adicional para la generación de estos valores temporales ni para commit/push de la evidencia dentro de esta fase.

## Fail-closed

Detenerse inmediatamente y no reintentar bajo esta decisión si ocurre cualquiera de estos casos:

- runner `INCOMPLETE`;
- exit code distinto de `0`;
- `CROSS_TENANT_LEAK=true`;
- nueva sesión con tenant o branch fuera de mappings;
- runtime inesperado;
- fixture/manifest divergente;
- health deja de ser 200;
- necesidad de modificar código, esquema, RLS o infraestructura.

Los resultados `FALLIDO` funcionales dentro de una campaña `COMPLETE` deben conservarse y reportarse; no deben corregirse ni reejecutarse automáticamente.

## No autorizado

- CAMPAÑA B;
- cambios RLS;
- rollback de fixtures;
- migraciones o esquema;
- cambios de Nginx/DNS;
- deploy adicional;
- producción.

## Salida requerida

Al finalizar, publicar una matriz completa `ISO-001`–`ISO-022`, la clasificación funcional global, la correlación PostgreSQL read-only y confirmar que los valores inválidos temporales fueron eliminados sin exponerlos.