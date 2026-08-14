# PHASE-002 — Architect Decision: Portable Manifest Permission Guard

## Estado

- Fase: `PHASE-002`.
- Resultado del segundo intento controlado: `FALLIDO ANTES DE POSTGRESQL`.
- Persistencia de fixture: `0` registros.
- Manifest: eliminado por el wrapper; no persistió.
- Campaña HTTP, rollback operativo, RLS y deploy: no ejecutados.

## Hallazgo

El wrapper `tools/phase002/prepare_fixtures.sh` intentó detectar permisos del manifest mediante:

```bash
stat -f '%Lp' "$PHASE002_MANIFEST_PATH" 2>/dev/null || stat -c '%a' "$PHASE002_MANIFEST_PATH"
```

Este patrón no es portable. En GNU/Linux, `stat -f` es una opción válida con otra semántica (`--file-system`), por lo que puede terminar con exit code `0` sin devolver el modo BSD/macOS esperado. En consecuencia, el fallback `stat -c '%a'` no se ejecuta y el guard puede clasificar incorrectamente un archivo `0600` como incompatible.

## Decisión

La verificación de permisos del manifest debe ser explícitamente portable y fail-closed.

Codex debe corregir únicamente el guard de permisos y su documentación/evidencia asociada.

### Requisitos

1. No usar `stat -f ... || stat -c ...` como detección de plataforma.
2. Detectar una implementación soportada de forma inequívoca antes de consultar el modo.
3. Se permite, por ejemplo:
   - probar primero `stat -c '%a'` y aceptar su salida solo si coincide con un patrón octal esperado;
   - si no está soportado, probar `stat -f '%Lp'` y aceptar igualmente solo una salida octal válida;
   - si ninguna variante produce una salida válida, abortar fail-closed.
4. El valor final debe normalizarse y ser exactamente `600`.
5. El guard debe seguir ejecutándose antes de `psql`.
6. No cambiar SQL, UUIDs, cardinalidades, RBAC, manifest content, checksum ni lógica de preparación fuera de este defecto.
7. Mantener la eliminación automática del manifest ante cualquier fallo.
8. Documentar el segundo intento fallido en `FIXTURE_PREPARATION_REPORT.md` sin secretos.

## Validación local requerida

Antes de publicar:

- `bash -n tools/phase002/prepare_fixtures.sh`;
- prueba local simulada de la rama GNU (`stat -c`);
- prueba local simulada de la rama BSD/macOS (`stat -f`);
- prueba negativa donde ninguna variante devuelve modo octal válido y el wrapper aborta antes de `psql`;
- prueba negativa con modo distinto de `0600` y aborto antes de `psql`;
- confirmar limpieza del manifest en todos los fallos;
- `git diff --check`;
- confirmar ausencia de secretos y artefactos temporales.

No instalar software para estas validaciones.

## Gate de ejecución

Esta decisión **NO autoriza un tercer intento de preparación**.

Primero se requiere:

1. corregir el guard;
2. versionar la evidencia del segundo intento fallido;
3. publicar la corrección;
4. revisión del Arquitecto Técnico/Auditor sobre el commit publicado;
5. autorización separada para un tercer intento controlado.

Hasta entonces siguen prohibidos:

- SQL de escritura;
- creación de fixtures;
- campaña HTTP;
- rollback operativo;
- cambios RLS;
- deploy.
