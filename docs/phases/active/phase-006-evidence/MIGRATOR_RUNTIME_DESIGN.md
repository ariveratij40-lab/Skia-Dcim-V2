# PHASE-006 — Migrator / Runtime Separation Design

## Etapa B

- Estado de diseño: `COMPLETA`.
- Implementación: `BLOQUEADA` antes de modificar código por el límite estructural detectado en Etapa C.

## Configuración propuesta

- `DATABASE_URL`: conexión runtime obligatoriamente restringida.
- `MIGRATOR_DATABASE_URL`: conexión administrativa usada solo durante el arranque/migración.
- `SKIA_REQUIRE_RESTRICTED_RUNTIME_DB=true`: gate fail-closed para STAGING cuando se autorice el cutover.

Ningún valor o secreto debe versionarse. Las dos conexiones no deben resolver a una identidad equivalente ni permitir que runtime herede el rol migrador.

## Ciclo propuesto

1. Abrir conexión migradora.
2. Validar que es la identidad autorizada para DDL.
3. Ejecutar `runMigrations` y tareas de migración de arranque.
4. Cerrar la conexión migradora.
5. Abrir el pool runtime.
6. Consultar y validar `current_user`, `rolsuper`, `rolbypassrls`, memberships y ownership.
7. Fallar el arranque si runtime es superuser, BYPASSRLS, hereda bypass o posee tablas objetivo.
8. Inicializar stores y handlers exclusivamente con el pool runtime.

Las migraciones no deben ejecutarse con el pool runtime. Los handlers no deben conservar referencia a la conexión migradora.

## Rollback de configuración

El cutover futuro necesita un release backend identificable y una configuración externa versionada por checksum, no por contenido. Ante fallo de arranque o rutas, el rollback debe restaurar el release/configuración backend previos. No debe cambiar RLS, datos ni fixtures.

## Pruebas diseñadas

- ausencia de `DATABASE_URL` bajo gate: arranque rechazado;
- runtime superuser/BYPASSRLS: arranque rechazado;
- runtime owner o miembro de rol privilegiado: arranque rechazado;
- migrator ausente cuando existen migraciones requeridas: arranque rechazado;
- runtime restringido válido: inicialización permitida;
- secretos nunca aparecen en errores/logs.

Estas pruebas no se implementaron porque continuar con la convergencia parcial dejaría un backend que todavía no puede operar integralmente con RLS y la especificación exige detenerse ante el límite de autorización global.
