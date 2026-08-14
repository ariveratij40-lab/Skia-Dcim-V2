# PHASE-006 — Migrator / Runtime Separation Design

## Etapa B

- Estado de diseño: `COMPLETA`.
- Implementación local: `COMPLETA`.
- Cutover STAGING: `BLOQUEADO / NO AUTORIZADO`.

## Configuración propuesta

- `DATABASE_URL`: conexión runtime obligatoriamente restringida.
- `MIGRATOR_DATABASE_URL`: conexión administrativa usada solo durante el arranque/migración.
- `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`: gate fail-closed para STAGING cuando se autorice el cutover.

Ningún valor o secreto debe versionarse. Las dos conexiones no deben resolver a una identidad equivalente ni permitir que runtime herede el rol migrador.

## Ciclo implementado

1. Resolver `DATABASE_URL` y `MIGRATOR_DATABASE_URL` sin registrar valores.
2. Abrir conexión migradora.
3. Ejecutar `runMigrations` y `migrateAIChatHistory` exclusivamente con esa conexión.
4. Cerrar la conexión migradora.
5. Abrir el pool runtime.
6. Consultar y validar `current_user`, `rolsuper`, `rolbypassrls`, memberships y ownership.
7. Fallar el arranque si runtime es superuser, BYPASSRLS, hereda bypass o posee tablas objetivo.
8. Inicializar stores y handlers exclusivamente con el pool runtime.

Las migraciones no deben ejecutarse con el pool runtime. Los handlers no deben conservar referencia a la conexión migradora.

## Rollback de configuración

El cutover futuro necesita un release backend identificable y una configuración externa versionada por checksum, no por contenido. Ante fallo de arranque o rutas, el rollback debe restaurar el release/configuración backend previos. No debe cambiar RLS, datos ni fixtures.

## Gate runtime implementado

Con `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`, el arranque rechaza configuración ausente o DSN runtime/migrator idéntico. Tras conectar el pool runtime consulta su identidad y falla ante `SUPERUSER`, `BYPASSRLS`, ownership de tablas objetivo o membresía en un rol privilegiado. SessionStore, handlers y jobs solo reciben el pool runtime.

## Pruebas locales

- ausencia de `DATABASE_URL` bajo gate: arranque rechazado;
- runtime superuser/BYPASSRLS: arranque rechazado;
- runtime owner o miembro de rol privilegiado: arranque rechazado;
- migrator ausente cuando existen migraciones requeridas: arranque rechazado;
- runtime restringido válido: inicialización permitida;
- secretos nunca aparecen en errores/logs.

Las pruebas unitarias cubren configuración ausente, DSN idéntico, separación y rechazo de cada atributo privilegiado. No se usaron credenciales ni roles reales. La validación efectiva del rol `skia_runtime` y el cambio de URLs en STAGING permanecen para un gate posterior.
