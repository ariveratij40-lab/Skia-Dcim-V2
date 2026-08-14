# PHASE-003 — Etapa A blockers

## P003-A-001 — Catálogo RBAC sin baseline efectivo

- Clasificación: `BLOQUEADO`.
- Fuente: `POSTGRES STAGING`.
- Evidencia: solo existe `admin`; tiene cero permisos; no existe `operator`; `role_permissions` no define semántica efectiva.
- Riesgo: cualquier clonación actual sería vacía o exigiría inventar privilegios.
- Recomendación: Etapa B debe justificar individualmente una definición mínima contra operaciones observadas; no usar el catálogo completo por defecto.

## P003-A-002 — Modelo SessionStore incompatible con staging

- Clasificación: `BLOQUEADO` para usar esa abstracción como fuente normativa.
- Fuente: `OBSERVADO EN CÓDIGO` + `POSTGRES STAGING`.
- Evidencia: el código consulta `user_permissions`, `user_branch_access` y `user_roles.role_name`; staging carece de las dos tablas y usa `user_roles.role_id`.
- Riesgo: diseñar permisos a partir de esa abstracción produciría un baseline no ejecutable.
- Recomendación: Etapa B debe basarse en rutas/checks realmente activos o elevar una decisión arquitectónica separada para alinear el modelo; Etapa A no autoriza corregirlo.

## P003-A-003 — Catálogo de permisos desacoplado de rutas mínimas

- Clasificación: `BLOQUEADO` para atribuir efectividad a los permission codes existentes.
- Fuente: `OBSERVADO EN CÓDIGO` + `POSTGRES STAGING`.
- Evidencia: las rutas mínimas de autenticación, tenant, branch y lectura de activos no consultan `permission.code`; usan sesión, mappings y contexto.
- Riesgo: asignar `dcim:view` podría parecer suficiente sin cambiar ni demostrar el comportamiento real.
- Recomendación: la futura matriz debe distinguir permisos declarativos, checks por nombre de rol y controles contextuales.

## P003-A-004 — Selección de branch y autorización efectiva ocurren en capas distintas

- Clasificación: `HALLAZGO`, con impacto en expectativas PHASE-002.
- Fuente: `OBSERVADO EN CÓDIGO`.
- Evidencia: `select-branch` valida pertenencia al tenant, no membresía del usuario; `ExtractSessionContextSecure` sí verifica `user_branches` al acceder a rutas protegidas.
- Riesgo: una selección cross-branch puede responder 2xx y ser rechazada solo en la operación posterior; evaluar únicamente el primer código HTTP produciría una conclusión incorrecta.
- Recomendación: la matriz funcional debe evaluar selección y acceso posterior como una secuencia, sin declarar autorización por un 2xx aislado.

## P003-A-005 — Endpoint de relaciones no localizado

- Clasificación: `BLOQUEADO` para los casos de relaciones de PHASE-002.
- Fuente: `OBSERVADO EN CÓDIGO`.
- Evidencia: no se detectó endpoint GET específico para `asset_relationships` en las rutas canónicas.
- Riesgo: no puede justificarse un permiso ni ejecutar la prueba funcional de relaciones mediante la API actual.
- Recomendación: mantener esos casos bloqueados hasta confirmar una ruta real o aprobar una fase que la exponga; no crearla dentro de PHASE-003 Etapa A.

## Estado de continuación

- Etapa A: ejecutada correctamente.
- Etapa B: pendiente de autorización/continuación; no iniciada en esta ronda.
- Etapa C: no autorizada.
- PHASE-002: continúa bloqueada para preparación.
