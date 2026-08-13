# Gobernanza para agentes y colaboradores

Este archivo establece las reglas permanentes de trabajo para todo el repositorio SKIA. Aplica a personas, agentes automatizados y cualquier herramienta que proponga o ejecute cambios.

## Contexto oficial

- El repositorio canónico es `ariveratij40-lab/Skia-Dcim-V2`.
- `main` es la rama base oficial y no debe modificarse directamente.
- SKIA se encuentra exclusivamente en **STAGING**.
- No existe un entorno productivo operativo.
- Los datos actuales son datos de prueba.
- El futuro entorno productivo será `skia.mx`, únicamente después de que se apruebe la primera fase funcional de staging.
- Está prohibido desplegar a producción mientras esa aprobación no exista.

La autoridad, la fuente de verdad y el estado operativo se definen en `docs/governance/SOURCE_OF_TRUTH.md`. El ciclo de fase, sus controles y su trazabilidad se definen en `docs/governance/DEVELOPMENT_RULES.md`.

## Autoridad aplicable

- El Product Owner es propietario del producto y autoridad final de aprobación.
- El Arquitecto Técnico / Auditor define arquitectura y criterios de aceptación, revisa la coherencia global y emite la aprobación técnica previa a la integración.
- El Ingeniero de Implementación / Codex implementa solamente el alcance aprobado. Puede proponer mejoras, pero no puede modificar unilateralmente arquitectura, alcance, modelo de datos, seguridad, RLS o infraestructura.
- GitHub es la fuente de verdad del código y el registro de trazabilidad.
- Staging es el entorno de ejecución y validación.

Una propuesta del agente no equivale a una decisión arquitectónica ni amplía el alcance autorizado.

## Lectura obligatoria

Antes de implementar una fase se deben leer, en este orden:

1. `AGENTS.md`.
2. `ARCHITECTURE.md`.
3. La especificación correspondiente en `docs/phases/active/`.
4. `docs/governance/DEVELOPMENT_RULES.md`.

Si falta la especificación activa o su alcance es ambiguo, no se debe iniciar un cambio estructural ni ampliar el alcance por inferencia.

## Reglas de cambio

- Todo cambio funcional debe partir de una rama creada desde `main`.
- No se permite trabajar directamente sobre `main`.
- Las decisiones arquitectónicas deben documentarse antes de realizar cambios estructurales.
- No se debe alterar la arquitectura, el modelo multi-tenant, RLS, la seguridad ni el esquema de base de datos fuera del alcance explícito de una fase.
- Las migraciones existentes no se reescriben sin una decisión arquitectónica explícita y documentada.
- Se deben preservar los cambios locales ajenos al trabajo en curso.
- No se debe hacer `git push`, merge o deploy sin autorización explícita.
- No se debe desplegar producción.

## Seguridad y secretos

- No introducir passwords, tokens, API keys, claves privadas ni secretos nuevos en archivos versionados.
- No mostrar secretos completos en documentación, logs ni reportes generados por agentes.
- Si se detecta un secreto existente, reportarlo de forma redactada y registrarlo como hallazgo de seguridad.
- Detectar un secreto no autoriza automáticamente su eliminación o rotación; cualquiera de esas acciones debe formar parte de una fase autorizada.

## Verificación y reporte

- Después de modificar código se deben ejecutar las pruebas aplicables al alcance del cambio.
- Si una prueba falla, el fallo debe reportarse de forma visible y el cambio no puede declararse aprobado.
- No se deben ocultar, omitir ni reinterpretar resultados fallidos.
- Los cambios exclusivamente documentales deben validarse revisando el diff, enlaces, rutas y consistencia con el estado real del repositorio.
- Una implementación que compila o pasa pruebas no queda automáticamente aprobada; requiere auditoría técnica y aprobación conforme al ciclo de fase.

## Límites de autoridad

Una solicitud concreta o una fase activa define el alcance autorizado. Cualquier modificación adicional que afecte arquitectura, datos, seguridad, infraestructura, despliegue o comportamiento funcional requiere autorización explícita y, cuando corresponda, una decisión arquitectónica previa.
