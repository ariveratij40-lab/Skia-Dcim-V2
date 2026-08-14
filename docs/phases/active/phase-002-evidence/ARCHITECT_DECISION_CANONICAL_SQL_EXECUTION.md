# PHASE-002 — Architect Decision: Canonical SQL Execution

## Estado

- Fase: `PHASE-002`.
- Motivo: tercer intento controlado de preparación falló antes de `BEGIN` porque el canal efímero entregó únicamente un fragmento inicial de `prepare_fixtures.sql`.
- Resultado del intento: `FALLIDO SIN PERSISTENCIA`.
- Nuevo intento de preparación: `NO AUTORIZADO` hasta aplicar y revisar esta decisión.

## Diagnóstico

El tercer intento no descubrió un defecto del SQL ni de PostgreSQL. El fallo ocurrió porque el contenido ejecutado no correspondió al archivo canónico completo: `psql` recibió solo las primeras líneas y terminó con `reached EOF without finding closing \endif(s)` antes de alcanzar `BEGIN`.

La ejecución de una fase controlada no debe depender de copiar, recortar, reconstruir, transmitir parcialmente o ensamblar el SQL por un canal efímero. El wrapper debe ser la única entrada y debe ejecutar directamente el archivo canónico versionado.

## Decisión obligatoria

`tools/phase002/prepare_fixtures.sh` debe resolver por sí mismo el archivo SQL canónico desde su propio checkout y ejecutar ese archivo completo mediante `psql -f`.

No se permite que el operador proporcione el cuerpo SQL por stdin, heredoc, fragmentos, sustitución de comandos, archivos temporales reconstruidos o contenido transportado parcialmente.

### Resolución del SQL canónico

El wrapper debe:

1. determinar su propio directorio físico de forma fail-closed;
2. resolver `prepare_fixtures.sql` en ese mismo directorio;
3. exigir que el archivo exista, sea regular y no sea symlink;
4. exigir que pertenezca al checkout/repositorio esperado;
5. comprobar que no tenga modificaciones locales respecto del commit de tooling autorizado;
6. registrar únicamente el SHA/identidad no sensible del tooling usado;
7. invocar exactamente ese archivo mediante `psql ... -f "$sql_path"`.

Si cualquiera de estas comprobaciones falla, el wrapper debe abortar antes de invocar `psql`.

## Pinning de tooling

Para un futuro reintento, el wrapper debe poder demostrar que el SQL ejecutado corresponde exactamente al tooling autorizado por el Arquitecto Técnico/Auditor.

La implementación puede realizar esta comprobación mediante Git sobre el checkout canónico, siempre que:

- no dependa del checkout legado `/opt/apps/skia/staging`;
- no acepte un archivo SQL externo equivalente por nombre;
- no acepte un worktree con cambios locales en `prepare_fixtures.sh` o `prepare_fixtures.sql`;
- falle cerrado ante procedencia ambigua.

El SHA exacto a autorizar para un siguiente intento será el commit correctivo que resulte de esta decisión; no debe hardcodearse anticipadamente un SHA aún no publicado.

## Wrapper como única entrada

En preparación real queda prohibido:

- ejecutar `prepare_fixtures.sql` directamente;
- alimentar el SQL por stdin;
- usar `ssh ... 'psql ...' < prepare_fixtures.sql` si ello introduce una transformación/canal intermedio no atestado;
- copiar el SQL a `/tmp` y ejecutarlo desde allí;
- usar solo una sección del archivo;
- reconstruir el SQL desde snippets.

La única entrada autorizable será el wrapper versionado, que abrirá directamente el SQL canónico local por ruta validada y lo pasará a `psql -f`.

## Manifest y transacción

La corrección no debe cambiar:

- UUIDs deterministas;
- cardinalidades;
- modelo RBAC aprobado;
- exportación del manifest mediante `\g :manifest_path` antes de `COMMIT`;
- guard de permisos `0600` portable;
- limpieza de manifest incompleto;
- rollback por IDs exactos.

## Validación local requerida

Antes de solicitar un nuevo intento:

1. `bash -n tools/phase002/prepare_fixtures.sh`;
2. prueba con `psql` simulado que capture argumentos y demuestre uso de `-f <ruta-canónica>/prepare_fixtures.sql`;
3. demostrar que stdin vacío/no usado no altera la ejecución;
4. demostrar bloqueo si el SQL canónico falta;
5. demostrar bloqueo si el SQL es symlink;
6. demostrar bloqueo si el SQL tiene modificación local respecto del tooling autorizado/revisado;
7. demostrar bloqueo si el wrapper tiene modificación local;
8. conservar las pruebas GNU/BSD del guard `stat`;
9. `git diff --check`;
10. confirmar ausencia de secretos, credenciales, hashes, manifests reales y temporales persistentes.

No instalar software para estas validaciones.

## Evidencia

Actualizar `FIXTURE_PREPARATION_REPORT.md` con el tercer intento y la corrección posterior. La evidencia debe dejar explícito:

- que `BEGIN` no fue alcanzado;
- que hubo cero sobrevivientes;
- que el manifest fue eliminado;
- que credenciales/hashes/generador fueron eliminados;
- que la causa fue transporte parcial del SQL, no PostgreSQL ni el modelo de fixture.

## Autorización

Autorizado ahora:

- corregir localmente el wrapper conforme a esta decisión;
- validar estáticamente/localmente;
- actualizar evidencia;
- commit y push de la corrección para revisión.

No autorizado todavía:

- cuarto intento de preparación;
- SQL de escritura;
- CAMPAÑA A HTTP;
- rollback operativo;
- cambios RLS;
- migraciones;
- deploy.

Después de publicar el commit correctivo, el Arquitecto Técnico/Auditor revisará directamente el diff y decidirá si existe autorización para un cuarto intento controlado.
