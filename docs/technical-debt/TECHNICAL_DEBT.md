# Deuda técnica

Este registro documenta hallazgos conocidos. No autoriza cambios por sí mismo: cada corrección debe incorporarse al alcance explícito de una fase y respetar las decisiones arquitectónicas aplicables.

## Hallazgos iniciales

| ID | Hallazgo | Estado | Consideración |
| --- | --- | --- | --- |
| TD-001 | `README.md` y `SETUP.md` están desalineados con el árbol actual. | Pendiente | Contrastar cada instrucción con los archivos y flujos realmente existentes antes de actualizarla. |
| TD-002 | La documentación hace referencia a `docker-compose.staging.yml` y `docker-compose.prod.yml`, pero esos archivos no existen. | Pendiente | Determinar si las referencias deben retirarse o si existe una decisión futura de separar configuraciones. No crear configuración productiva sin autorización. |
| TD-003 | La documentación hace referencia a `.env.staging.example` y `.env.prod.example`, pero esos archivos no existen. | Pendiente | Definir una estrategia de ejemplos y secretos antes de agregar archivos de entorno. |
| TD-004 | `frontend/next.config.js` está ausente aunque `frontend/Dockerfile` intenta copiarlo. | Pendiente | Verificar el impacto en el build y decidir si debe añadirse el archivo o corregirse el Dockerfile dentro de una fase autorizada. |
| TD-005 | Existen dos migraciones con el prefijo `015`: `015_assets_rls.sql` y `015_naming_rules_custom_segments.sql`. | Pendiente | Evaluar orden, idempotencia y trazabilidad. No renombrar ni reescribir migraciones existentes sin decisión arquitectónica explícita. |
| TD-006 | Conviven migraciones SQL en `migrations/` con migraciones embebidas en `backend/migrations.go`. | Pendiente | Documentar responsabilidades, orden de ejecución y mecanismo canónico antes de modificar el sistema de migraciones. |
| TD-007 | Existen archivos `.bak` y respaldos versionados. | Pendiente | Revisar necesidad, retención, tamaño, sensibilidad y política de versionado antes de retirarlos. |
| TD-008 | Deben revisarse secretos y configuración sensible versionada. | Pendiente | Realizar una revisión específica, rotar credenciales si corresponde y evitar divulgar valores sensibles en reportes. |

## Criterios de gestión

- Asignar cada deuda a una fase explícita antes de implementarla.
- Documentar una decisión arquitectónica previa si la resolución afecta estructura, seguridad, multi-tenancy, RLS, base de datos o migraciones existentes.
- Conservar evidencia de pruebas y riesgos.
- No marcar un hallazgo como resuelto mientras existan fallos conocidos o validaciones pendientes.
