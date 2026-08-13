# Reglas de desarrollo

## Inicio de una fase

Antes de implementar cualquier fase:

1. Partir de `main` actualizado según el flujo autorizado.
2. Crear una rama de trabajo; nunca modificar `main` directamente.
3. Leer `AGENTS.md`.
4. Leer `ARCHITECTURE.md`.
5. Leer la especificación aplicable en `docs/phases/active/`.
6. Confirmar que el cambio solicitado está dentro del alcance explícito.

## Ciclo de una fase

Toda fase sigue este ciclo:

`PROPUESTA → ESPECIFICACIÓN → IMPLEMENTACIÓN → PRUEBAS → AUDITORÍA TÉCNICA → APROBACIÓN → BASELINE`

- **Propuesta:** plantea una necesidad o mejora; todavía no autoriza su ejecución.
- **Especificación:** fija alcance, exclusiones, criterios de aceptación, riesgos y validaciones.
- **Implementación:** realiza únicamente el alcance aprobado en una rama.
- **Pruebas:** ejecuta y registra las verificaciones aplicables.
- **Auditoría técnica:** el Arquitecto Técnico / Auditor revisa coherencia global, arquitectura y criterios de aceptación.
- **Aprobación:** requiere aprobación técnica previa a integración y la aprobación final del Product Owner.
- **Baseline:** identifica el commit SHA aprobado como referencia técnica de la fase.

Que una implementación compile o pase sus pruebas no significa que esté aprobada automáticamente.

## Alcance y diseño

- GitHub es la fuente de verdad del código.
- Toda decisión arquitectónica debe documentarse antes del cambio estructural correspondiente.
- No alterar arquitectura, multi-tenancy, RLS, seguridad o esquema de base de datos fuera del alcance explícito de una fase.
- No reescribir migraciones existentes sin una decisión arquitectónica explícita.
- La deuda técnica registrada no constituye por sí sola autorización para corregirla.
- Mantener separados los cambios funcionales, estructurales y documentales cuando su revisión independiente aporte claridad.

## Rollback

Si una fase afecta base de datos, migraciones, RLS, autenticación, multi-tenancy, Docker, Nginx, infraestructura o despliegue, su especificación debe incluir una estrategia de rollback verificable o explicar explícitamente por qué el rollback no aplica.

La estrategia debe definirse antes de implementar el cambio y no autoriza por sí misma un deploy, restauración o acción destructiva.

## Seguridad y secretos

- No introducir passwords, tokens, API keys, claves privadas ni secretos nuevos en archivos versionados.
- No reproducir secretos completos en documentación, logs o reportes generados por agentes.
- Reportar todo secreto detectado de forma redactada y registrarlo como hallazgo de seguridad.
- La detección no autoriza su eliminación o rotación automática; la remediación debe pertenecer a una fase autorizada.

## Validación

- Después de modificar código, ejecutar las pruebas aplicables al área modificada.
- Registrar claramente qué validaciones se ejecutaron y su resultado.
- Si una prueba falla, no ocultar el fallo ni declarar aprobado el cambio.
- Una prueba no ejecutada debe reportarse como no ejecutada, junto con la razón.
- Para documentación, revisar el diff, las rutas mencionadas y la coherencia con el repositorio.

## Integración y despliegue

- No hacer `git push`, merge o deploy sin autorización explícita.
- No desplegar producción.
- SKIA permanece exclusivamente en staging hasta la aprobación formal de la primera fase funcional.
- `skia.mx` es un destino futuro, no un entorno operativo actual.
- Los datos actuales deben tratarse como datos de prueba.

## Finalización de una fase

Una fase solo puede considerarse completada cuando:

- su alcance explícito está implementado;
- las pruebas aplicables fueron ejecutadas y sus resultados quedaron visibles;
- no se ocultan fallos ni pendientes;
- la documentación relevante está actualizada;
- su especificación se mueve de `docs/phases/active/` a `docs/phases/completed/` mediante un cambio revisado y autorizado.

El registro de la fase completada debe contener como mínimo:

- identificador de fase;
- rama utilizada;
- commit SHA aprobado;
- fecha de aprobación;
- alcance implementado;
- pruebas ejecutadas;
- resultados;
- pendientes conocidos.

El commit SHA aprobado constituye el baseline técnico de la fase.
