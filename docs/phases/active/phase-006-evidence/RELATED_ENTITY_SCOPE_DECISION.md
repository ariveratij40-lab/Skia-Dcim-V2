# PHASE-006 — Related Entity Scope Decision

## Decisión funcional

- `asset_logs`: `BRANCH-SCOPED` por herencia del activo asociado.
- `asset_relationships`: visible/escribible únicamente cuando source y target son visibles en el contexto tenant/branch autorizado.
- Relaciones cross-branch: denegadas para scope de branch; solo una operación multi-branch explícitamente autorizada podría evaluarlas.

## Viabilidad sin esquema

La semántica puede expresarse mediante policies que verifiquen existencia/visibilidad de los activos referenciados. No se propone añadir `branch_id` ni modificar FKs en esta fase.

Antes de aprobar esas policies se requieren pruebas de:

- lectura y escritura sin contexto: fail-closed;
- log cuyo activo pertenece a otra branch: denegado;
- relación con source o target fuera de branch: denegada;
- relación legítima dentro de branch: permitida;
- scope tenant-wide explícito: nunca cruza tenant.

Si las pruebas muestran recursión, ambigüedad, degradación no aceptable o imposibilidad de garantizar consistencia ante escrituras administrativas, deberá abrirse una fase de esquema/constraints. PHASE-006 no realizará ese cambio por inferencia.
