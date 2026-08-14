# PHASE-005 — Blockers

| ID | Estado | Bloqueante | Riesgo |
|---|---|---|---|
| RLS-B01 | BLOQUEADO | API usa `skia_user` superuser/BYPASSRLS | RLS no aplica al runtime |
| RLS-B02 | BLOQUEADO | Accesos a tablas objetivo fuera de contexto transaccional | Fallos funcionales al usar `skia_runtime` y activar RLS |
| RLS-B03 | BLOQUEADO | Policies de logs/relaciones son tenant-only sin integridad branch demostrada | Acceso cross-branch a entidades relacionadas |
| RLS-B04 | BLOQUEADO | Runtime y migraciones usan actualmente la misma conexión | El rol restringido no puede ejecutar DDL de arranque |
| RLS-B05 | BLOQUEADO | Varias definiciones históricas compiten como fuente operativa | Activación no reproducible o policy equivocada |

No se detectó necesidad inmediata de modificar datos. Resolver estos bloqueantes requiere decisiones de arquitectura/configuración y, potencialmente, cambios de handlers o política. Etapa C no está autorizada ni es segura bajo el baseline observado.
