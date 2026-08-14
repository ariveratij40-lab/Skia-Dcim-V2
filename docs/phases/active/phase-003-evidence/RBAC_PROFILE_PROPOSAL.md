# PHASE-003 — Propuesta de perfiles RBAC mínimos

## Control de etapa

- Etapa: `ETAPA B — PROPUESTA RBAC`.
- Estado: `PROPUESTO — NO APROBADO`.
- Rama: `phase/003-rbac-baseline-execution`.
- Baseline de la rama: `d2e9c3519a18915ab3867d6526f0d1100559bd16`.
- Fuente técnica: evidencia de Etapa A y código canónico publicado en GitHub.
- Escrituras, DDL, cambios RLS, ejecución de fixtures y deploy: no ejecutados.
- Decisión rectora: `ARCHITECT_DECISION_ETAPA_B.md` publicada en GitHub.

Esta propuesta debe ser revisada y aprobada por el Arquitecto Técnico / Auditor antes de cualquier Etapa C. Una propuesta de Codex no constituye una decisión arquitectónica.

## Resultado de la validación dirigida

La búsqueda completa de `dcim:view` en el código canónico no encontró ningún uso runtime. Sus únicas fuentes técnicas son el seed `migrations/002_seed.sql`, un backup versionado y la documentación de esta fase. No aparece como argumento de `requiredPermission`, llamada a `requirePermission`, consulta por código ni condición en los handlers usados por PHASE-002.

Por tanto:

- `dcim:view` es `NO ENFORCED` para las rutas PHASE-002 actuales;
- retirar o asignar ese permiso no cambia por sí mismo el acceso observado a dichas rutas;
- no puede contarse como barrera de seguridad;
- su inclusión en los perfiles es únicamente una propuesta de catálogo normativo mínimo y trazable.

## Baseline propuesto en dos capas

### Capa A — autorización efectiva actual

| Control | Función actual |
| --- | --- |
| `SESSION` | autentica mediante sesión vigente; login crea la sesión y logout la elimina |
| `TENANT_MAPPING` | `user_tenants` limita listado y selección de tenant |
| `BRANCH_MAPPING` | `ExtractSessionContextSecure` exige una asociación `user_branches` para el contexto protegido |
| `HANDLER_FILTER` | los GET de activos filtran explícitamente por tenant y branch de la sesión |
| `RBAC_PERMISSION` | ninguno demostrado en las operaciones PHASE-002 |
| `RLS` | declarado en el modelo, pero no efectivo en staging según Etapa A |

La Capa A constituye el comportamiento que CAMPAÑA A debe evaluar. No equivale a una declaración de seguridad aprobada y carece de defensa en profundidad efectiva a nivel RLS.

### Capa B — catálogo RBAC normativo propuesto

El conjunto exacto propuesto para los roles TEST es `{dcim:view}`. Su estado es `NO ENFORCED`; sirve para evitar roles vacíos, documentar intención de lectura y dar a PHASE-002 una entrada determinista sin clonar roles existentes inconsistentes.

La Capa B no sustituye ni amplía la Capa A. Cualquier fase futura que conecte permission codes al runtime constituye un cambio de autorización y deberá analizar nuevamente la compatibilidad de estos perfiles.

## Principio de diseño

La CAMPAÑA A de PHASE-002 requiere autenticación, selección de contexto y lectura de activos. No requiere crear, editar o eliminar activos ni administrar usuarios o roles. Por denegación por defecto y mínimo privilegio, se propone un único permission code declarativo para los tres perfiles:

| Permission code propuesto | Permission ID del seed canónico | Justificación | Estado efectivo actual |
| --- | --- | --- | --- |
| `dcim:view` | `550e8400-e29b-41d4-a716-446655440401` | representa normativamente la lectura DCIM requerida por ISO-005, ISO-007, ISO-017 e ISO-018 | `NO ENFORCED`: ningún handler PHASE-002 auditado consulta este código |

El ID debe verificarse nuevamente por igualdad exacta de `permissions.code` e ID durante un futuro preflight autorizado. El hash MD5 del conjunto ordenado de un solo ID, usando el mismo algoritmo del tooling PHASE-002, es `978f98df2482ec29fc64744ae3524640`.

No se propone crear un permission code nuevo. `dcim:view` documenta intención y permite un baseline reproducible, pero su asignación no debe presentarse como enforcement efectivo mientras el backend no lo consulte.

## Perfiles propuestos

| Perfil lógico | Nombre exacto de rol | Permission codes exactos | Alcance tenant | Alcance branch | Estado |
| --- | --- | --- | --- | --- | --- |
| `TEST-ADMIN` | `admin` | `{dcim:view}` | un único tenant TEST mediante `user_tenants` | dos branches del mismo tenant mediante `user_branches` | PROPUESTO |
| `TEST-OPERATOR` | `operator` | `{dcim:view}` | un único tenant TEST mediante `user_tenants` | una única branch mediante `user_branches` | PROPUESTO |
| `TEST-MULTI-BRANCH` | `operator` | `{dcim:view}` | un único tenant TEST mediante `user_tenants` | dos branches del mismo tenant mediante `user_branches` | PROPUESTO |

Reglas normativas propuestas:

1. Los roles son no globales (`is_global=false`) y pertenecen exactamente a su tenant TEST.
2. `TEST-MULTI-BRANCH` reutiliza el mismo rol `operator`; no se crea un tercer rol ni recibe permisos adicionales.
3. La única diferencia entre OPERATOR y MULTI-BRANCH es el conjunto explícito de filas `user_branches`.
4. Ningún actor se asocia a más de un tenant.
5. ADMIN recibe ambas branches por asociaciones explícitas. Su nombre exacto conserva la semántica especial observada en rutas que usan `RequireTenantTxScoped`, sin convertirlo en rol global.
6. La selección o el acceso a una branch no incluida en `user_branches` debe evaluarse fail-closed mediante la secuencia completa de selección y acceso protegido.

## Permisos expresamente excluidos

| Permission code | Decisión propuesta | Motivo |
| --- | --- | --- |
| `dcim:asset:create` | EXCLUIDO | la matriz autorizada no crea activos por HTTP |
| `dcim:asset:edit` | EXCLUIDO | la matriz autorizada no edita activos |
| `dcim:asset:delete` | EXCLUIDO | la matriz autorizada no elimina activos |
| `admin:users` | EXCLUIDO | PHASE-002 no administra usuarios; el endpoint observado comprueba nombre `admin`, no este código |
| `admin:roles` | EXCLUIDO | PHASE-002 no administra roles y no se observó como check efectivo |
| `import:inventory:create` | EXCLUIDO | no pertenece a la campaña, no existe en el catálogo staging y su check observado es inefectivo |

No se permiten permisos adicionales por semejanza de nombre, módulo, patrón `LIKE`, pertenencia al catálogo o conveniencia de prueba.

## Matriz mínima propuesta

| Operación | Actor mínimo | Permiso declarativo | Enforcement observado que debe permanecer bajo prueba | Resultado esperado |
| --- | --- | --- | --- | --- |
| Login, identidad y logout | cualquier actor TEST | ninguno adicional | sesión válida/expirada y cookie | solo la cuenta de prueba válida obtiene sesión |
| Listar/seleccionar tenant propio | cualquier actor TEST | ninguno adicional | `user_tenants` | permite únicamente el tenant asociado |
| Listar/seleccionar branch autorizada | cualquier actor TEST | ninguno adicional | `user_branches` al resolver contexto protegido | permite únicamente asociaciones explícitas |
| Leer activos de branch autorizada | los tres perfiles | `dcim:view` | sesión, contexto tenant/branch y filtros explícitos | solo devuelve activos de la branch activa autorizada |
| Leer segunda branch del tenant | TEST-ADMIN y TEST-MULTI-BRANCH | `dcim:view` | segunda asociación `user_branches` y cambio de contexto | permitido tras selección válida; nunca mezcla branches |
| Leer segunda branch del tenant | TEST-OPERATOR | `dcim:view` | ausencia de asociación `user_branches` | denegado/fail-closed en el acceso protegido |
| Cruzar a otro tenant | cualquier actor TEST | ninguno puede concederlo | ausencia de `user_tenants` y filtros contextuales | denegado, sin datos |
| Logs/relationships | ninguno mientras no exista endpoint confirmado | no definido | endpoint no localizado | BLOQUEADO, no ampliar permisos por inferencia |

Un HTTP `2xx` en `select-branch` no demuestra autorización: la prueba debe continuar hasta una ruta protegida y validar el cuerpo redactadamente, conforme al hallazgo P003-A-004.

## Cambios requeridos en el tooling PHASE-002

Estos cambios son requisitos para una futura modificación autorizada del tooling; **no se implementan en Etapa B**:

1. Sustituir el descubrimiento/clonado de una pareja real `admin`/`operator` por un baseline aprobado versionado con el conjunto exacto `{dcim:view}`.
2. Resolver `dcim:view` por igualdad exacta de código y comprobar que corresponde al ID aprobado; cero, múltiples filas o discrepancia de ID deben bloquear.
3. Verificar que el permiso no sea global y que el conjunto ordenado tenga exactamente un elemento y el hash aprobado.
4. Crear seis roles tenant-locales: un `admin` y un `operator` por tenant; asignar exactamente una fila `role_permissions` por rol, para un total fijo de seis.
5. Mantener los actores multi-branch asignados al mismo rol `operator` del tenant.
6. Rechazar cualquier permiso extra en los roles canónicos V1; la idempotencia debe converger al conjunto exacto, no acumular permisos.
7. Registrar en el manifest los seis IDs exactos de `role_permissions` y conservar el rollback/postcheck completo ya definido.
8. Actualizar preflight, prepare, verify, rollback y documentación en una ronda PHASE-002 separada y autorizada.

## Evidencia y criterios previos a Etapa C

Antes de autorizar cualquier escritura deben existir:

- aprobación explícita de esta matriz por el Arquitecto Técnico / Auditor;
- confirmación read-only de código, ID, unicidad y atributo no global de `dcim:view`;
- diff revisado del tooling PHASE-002 adaptado al baseline aprobado;
- validaciones locales de sintaxis y guards;
- estrategia de manifest, checksum, rollback y postcheck por IDs exactos;
- autorización separada para ejecutar escrituras en staging.

La Etapa C no queda autorizada por este documento.

## Riesgos residuales

- El permiso propuesto es declarativo: las rutas GET de activos observadas no lo aplican actualmente.
- El nombre `admin` conserva efectos especiales fuera de la matriz mínima en rutas con `RequireTenantTxScoped`; las credenciales TEST deben utilizarse exclusivamente para la campaña aprobada.
- RLS permanece fuera de alcance y deshabilitado según la evidencia previa; el resultado de CAMPAÑA A no demostrará defensa en profundidad en base de datos.
- Logs y relationships continúan bloqueados mientras no exista un endpoint real confirmado.
- Cambios posteriores en autenticación, handlers, filtros, RBAC o esquema invalidarían la comparabilidad A/B si no se registran como variables adicionales.

## Recomendación de Etapa B

**BLOQUEADO.** La validación dirigida está documentada y el baseline de dos capas queda propuesto, pero la implementación RBAC de staging requiere aprobación explícita del Arquitecto Técnico / Auditor.

El desbloqueo requiere aprobación explícita de la matriz y una autorización posterior, separada, para adaptar PHASE-002. No se autoriza Etapa C, SQL, fixtures, login HTTP ni deploy.
