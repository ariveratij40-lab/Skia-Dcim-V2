# PHASE-002 — Multi-Tenant Isolation Test Fixtures

## Estado y control

- Identificador: `PHASE-002`.
- Estado: `ESPECIFICACIÓN`.
- Entorno permitido: `STAGING` exclusivamente.
- Rama de especificación: `docs/phase-002-isolation-fixtures`.
- Rama base: `main`.
- SHA base de la especificación: `214e84da113cdb46f9309e72d7f5748a3d1ddca3`.
- Evidencia de entrada: PHASE-001, rama `phase/001-execution`, hasta `e9c86ecda98647b8fac54afadce871ec328b8bab`.
- Product Owner: pendiente de registrar.
- Arquitecto Técnico / Auditor: pendiente de registrar.
- Ingeniero de Implementación / Codex: pendiente de registrar.
- Fecha de aprobación: pendiente.
- Commit SHA de cierre aprobado: pendiente.
- Baseline técnico de cierre: pendiente.

El SHA base identifica el código desde el que se redactó esta especificación. El futuro SHA de cierre registrará la implementación y evidencia aprobadas de PHASE-002; ambos valores son distintos.

## Objetivo

Diseñar e implementar, después de una autorización posterior, fixtures controlados, deterministas, idempotentes y completamente reversibles que permitan validar el aislamiento multi-tenant y multi-branch de SKIA en staging.

Los fixtures deben hacer posible comparar la protección de la capa de aplicación con el comportamiento de PostgreSQL antes y después de una futura corrección de RLS, sin alterar usuarios ni datos existentes.

Esta especificación no autoriza todavía crear fixtures, ejecutar SQL, modificar staging ni iniciar campañas de prueba.

## Contexto derivado de PHASE-001

- Staging contiene únicamente datos de prueba y no existe producción operativa.
- Solo se identificaron un tenant, una branch y un actor; son insuficientes para pruebas cruzadas.
- No existe una cuenta de prueba utilizable con credenciales expresamente suministradas.
- La aplicación devolvió `401` en una muestra de endpoints sin sesión.
- El aislamiento autenticado tenant/branch no pudo probarse.
- Existen políticas RLS para tablas auditadas, pero PostgreSQL mostró `relrowsecurity=false`.
- PHASE-001 clasificó el aislamiento como `C — pruebas insuficientes/BLOQUEADAS`.

## Alcance

PHASE-002 comprende:

- diseño y posterior creación autorizada de tenants, branches, actores, roles, accesos, sesiones de prueba e inventario ficticio;
- scripts futuros de preparación, verificación y rollback;
- identificación inequívoca de todos los registros creados;
- pruebas HTTP autenticadas de autorización y manipulación de contexto;
- consultas PostgreSQL de observación para correlacionar actor, tenant, branch, rol runtime y estado RLS;
- dos campañas idénticas: estado actual y estado posterior a una futura fase RLS;
- evidencia redactada y comparación de resultados;
- eliminación completa y verificada de los fixtures.

Toda ejecución sobre staging requiere autorización explícita adicional, respaldo verificable y provisión segura de credenciales.

## Fuera de alcance

- Habilitar, corregir, reescribir o deshabilitar RLS.
- Modificar políticas RLS o privilegios de roles runtime.
- Alterar el esquema o ejecutar migraciones.
- Corregir autenticación, sesiones, autorización o filtros de aplicación.
- Modificar usuarios, tenants, branches, activos o datos existentes.
- Reutilizar cuentas o sesiones existentes.
- Corregir otros hallazgos de PHASE-001.
- Modificar Docker, Nginx, infraestructura o despliegue.
- Crear o desplegar producción.
- Usar datos productivos o nombres que puedan confundirse con datos reales.
- Versionar credenciales, tokens, cookies o secretos.

Un fallo encontrado durante las campañas debe registrarse y remitirse a una fase correctiva; no debe corregirse dentro de PHASE-002.

## Principios de los fixtures

Los scripts futuros deben ser:

- **STAGING-only:** abortar antes de escribir si el entorno no está identificado inequívocamente como staging.
- **Fail-closed:** ante variable ausente, identidad inesperada, base incorrecta, conflicto con datos no marcados como TEST o precondición dudosa, terminar sin cambios.
- **Idempotentes:** ejecuciones repetidas convergen al mismo estado y no duplican registros.
- **Deterministas:** identificadores lógicos, relaciones y cantidades son reproducibles.
- **Atómicos:** preparación y rollback usan transacciones cuando el mecanismo y las dependencias lo permitan.
- **Trazables:** cada registro incluye una marca inequívoca de campaña/fixture en campos existentes apropiados, sin cambiar esquema.
- **Reversibles:** todos los registros creados pueden enumerarse y eliminarse sin afectar datos preexistentes.
- **No destructivos:** nunca actualizan o eliminan registros que no pertenezcan al fixture.

La implementación debe detenerse si el esquema actual no ofrece campos adecuados para identificar fixtures sin ambigüedad. Agregar columnas o cambiar el esquema requeriría otra fase.

## Modelo de fixtures

### Identidad del conjunto

Nombre lógico propuesto: `SKIA-PHASE-002-FIXTURE-V1`.

Cada registro creado debe poder asociarse a este conjunto mediante valores deterministas en campos existentes, por ejemplo nombres/códigos con prefijo `TEST-`. No se autoriza asumir que una coincidencia parcial basta para eliminar datos; el rollback debe usar el inventario exacto capturado durante la creación.

### Tenants

| Alias | Nombre obligatorio | Propósito |
| --- | --- | --- |
| `TENANT-A` | `TEST-TENANT-A` | Control primario y pruebas intra-tenant. |
| `TENANT-B` | `TEST-TENANT-B` | Cruces denegados desde/hacia A. |
| `TENANT-C` | `TEST-TENANT-C` | Control independiente y combinaciones adicionales. |

### Branches

| Tenant | Alias | Nombre/código lógico |
| --- | --- | --- |
| `TEST-TENANT-A` | `A1` | `TEST-BRANCH-A1` |
| `TEST-TENANT-A` | `A2` | `TEST-BRANCH-A2` |
| `TEST-TENANT-B` | `B1` | `TEST-BRANCH-B1` |
| `TEST-TENANT-B` | `B2` | `TEST-BRANCH-B2` |
| `TEST-TENANT-C` | `C1` | `TEST-BRANCH-C1` |
| `TEST-TENANT-C` | `C2` | `TEST-BRANCH-C2` |

Cada branch pertenece exactamente a su tenant y no reutiliza nombres o IDs existentes.

## Actores y permisos

Se propone un mínimo de nueve actores lógicos, sin direcciones de correo ni passwords en el repositorio:

| Actor lógico | Tenant | Branches permitidas | Rol esperado | Uso |
| --- | --- | --- | --- | --- |
| `TEST-A-ADMIN` | A | A1, A2 | ADMIN | Administración dentro de A; nunca B/C. |
| `TEST-A-OP-A1` | A | A1 | OPERATOR | Control de acceso limitado a A1. |
| `TEST-A-MULTI` | A | A1, A2 | Rol multi-branch autorizado | Comparación A1/A2. |
| `TEST-B-ADMIN` | B | B1, B2 | ADMIN | Administración dentro de B; nunca A/C. |
| `TEST-B-OP-B1` | B | B1 | OPERATOR | Control limitado a B1. |
| `TEST-B-MULTI` | B | B1, B2 | Rol multi-branch autorizado | Comparación B1/B2. |
| `TEST-C-ADMIN` | C | C1, C2 | ADMIN | Administración dentro de C; nunca A/B. |
| `TEST-C-OP-C1` | C | C1 | OPERATOR | Control limitado a C1. |
| `TEST-C-MULTI` | C | C1, C2 | Rol multi-branch autorizado | Comparación C1/C2. |

Reglas:

- Los roles deben reutilizar semántica existente; PHASE-002 no crea un modelo RBAC nuevo.
- La implementación debe documentar los permisos efectivos asociados a cada rol antes de probar.
- Ningún actor tiene acceso a más de un tenant.
- Los actores OPERATOR no reciben acceso implícito a la segunda branch.
- Los actores multi-branch solo reciben las dos branches de su propio tenant.
- Si el modelo actual no puede expresar esta matriz, registrar `BLOQUEADO`; no modificar el esquema ni ampliar permisos.

## Inventario ficticio

Cada una de las seis branches debe contener al menos 10 activos, para un mínimo total de 60.

### Nomenclatura

Formato obligatorio:

`TEST-ASSET-{BRANCH}-{NNN}`

Ejemplos:

- `TEST-ASSET-A1-001` a `TEST-ASSET-A1-010`.
- `TEST-ASSET-A2-001` a `TEST-ASSET-A2-010`.
- El mismo patrón aplica a B1, B2, C1 y C2.

Los identificadores adicionales, etiquetas RFID, códigos internos y referencias deben utilizar prefijos `TEST-` deterministas y no colisionar con datos existentes.

### Cobertura de entidades relacionadas

Por cada branch se debe crear, usando únicamente entidades y campos ya existentes:

- al menos 10 registros de activos;
- logs asociados a una selección representativa de activos;
- relaciones entre activos del mismo tenant y branch;
- al menos una relación controlada entre branches del mismo tenant, solo si el modelo actual la admite y la autorización esperada está definida;
- metadata relevante para filtros, búsqueda y resolución de contexto;
- cualquier registro auxiliar estrictamente necesario para que las consultas sigan el flujo real de aplicación.

No se deben crear relaciones cross-tenant válidas. Los intentos cross-tenant pertenecen a solicitudes manipuladas de prueba y deben ser rechazados sin persistir cambios.

## Estrategia de credenciales

- Ninguna credencial se almacena en Git, documentación, fixtures, argumentos visibles de comandos, logs o evidencia.
- Las credenciales son temporales y se generan/entregan fuera del repositorio mediante un canal autorizado.
- Cada secreto se identifica únicamente por actor lógico, nunca por su valor.
- Los passwords deben ser distintos por actor y no reutilizar secretos existentes.
- Cookies, tokens y session IDs se conservan solo durante la campaña en almacenamiento temporal protegido y se eliminan al finalizar.
- La evidencia puede registrar prefijos lógicos o hashes no reversibles si fueran necesarios para correlación, nunca valores completos.
- La expiración o revocación debe formar parte del cierre cuando el mecanismo existente lo permita sin afectar sesiones ajenas.
- Si no existe un mecanismo seguro de provisión, la ejecución queda `BLOQUEADA`; no se recuperan passwords ni se usan credenciales reales.

## Precondiciones de ejecución

Antes de crear datos, el script futuro debe verificar y registrar:

1. Entorno identificado como staging mediante señales independientes aprobadas.
2. Host, base y usuario administrativo esperados, sin imprimir DSN o password.
3. Ausencia total de producción operativa en el destino.
4. SHA de código y versión del fixture autorizados.
5. Estado previo y respaldo verificable de los datos de prueba.
6. Esquema compatible con todas las entidades requeridas.
7. Ausencia de colisiones con nombres/códigos `TEST-*`.
8. Inventario previo de registros existentes que quedarán explícitamente fuera del rollback.
9. Autorización separada para escritura y posterior rollback.

Cualquier fallo de precondición aborta sin cambios.

## Matriz de pruebas

Cada prueba se ejecuta con origen `HTTP STAGING` y, cuando corresponda, correlación de solo lectura `POSTGRES STAGING`. La evidencia debe registrar actor lógico, tenant/branch origen, operación, código HTTP, esperado, observado, estado, riesgo y referencias redactadas.

| ID | Actor principal | Contexto | Operación | Resultado esperado |
| --- | --- | --- | --- | --- |
| ISO-001 | ADMIN A | A / A1 | Login correcto y consulta de sesión | Autenticación exitosa; contexto consistente. |
| ISO-002 | ADMIN A | — | Login incorrecto | Rechazo sin crear sesión válida. |
| ISO-003 | ADMIN A | A | Seleccionar tenant A | Permitido. |
| ISO-004 | ADMIN A | A / A1 | Seleccionar branch A1 | Permitido. |
| ISO-005 | OP A1 | A / A1 | Consultar activos A1 | Permitido; solo activos A1 autorizados. |
| ISO-006 | OP A1 | A / A2 | Solicitar activos A2 | Denegado; sin filtración de existencia/datos. |
| ISO-007 | MULTI A | A / A1 y A2 | Consultar ambas branches autorizadas | Permitido conforme al alcance multi-branch existente. |
| ISO-008 | ADMIN A | B | Seleccionar tenant B | Denegado. |
| ISO-009 | ADMIN A | A / B1 | Manipular `branch_id` hacia B1 | Denegado. |
| ISO-010 | ADMIN A | B / B1 | Manipular `tenant_id` y `branch_id` | Denegado. |
| ISO-011 | ADMIN A | A / A1 | Consultar logs y relaciones de activo A1 | Permitido solo para entidades autorizadas. |
| ISO-012 | ADMIN A | A / A1 | Solicitar relación hacia activo de B1 | Denegado y sin datos relacionados de B. |
| ISO-013 | Actor sin contexto | Sin tenant | Consultar endpoint protegido | Fail-closed. |
| ISO-014 | Actor sin contexto | Sin branch | Consultar endpoint con alcance branch | Fail-closed. |
| ISO-015 | Sesión inválida | — | Consultar endpoint protegido | `401`/rechazo equivalente; sin datos. |
| ISO-016 | Sesión expirada/revocada de fixture | — | Consultar endpoint protegido | Rechazo; sin reutilización. |
| ISO-017 | ADMIN B | B / B1 | Consultar activos propios | Permitido; control simétrico. |
| ISO-018 | ADMIN C | C / C2 | Consultar activos propios | Permitido; control independiente. |
| ISO-019 | ADMIN B | C / C1 | Cruce B → C | Denegado. |
| ISO-020 | ADMIN C | A / A2 | Cruce C → A | Denegado. |
| ISO-021 | OP de cada tenant | Branch autorizada | Logout y reutilización posterior | Logout exitoso; sesión posterior rechazada. |
| ISO-022 | Todos | Contexto propio | Correlación aplicación/DB | Actor, tenant y branch coinciden con evidencia PostgreSQL redactada. |

La manipulación se limita a parámetros/identificadores de solicitudes HTTP del fixture. No incluye SQL de bypass directo ni escritura cross-tenant.

## Campañas

### Ciclo obligatorio

`PREPARACIÓN FIXTURE V1 → CAMPAÑA A → ROLLBACK COMPLETO → futura fase RLS aprobada → RECREACIÓN EXACTA FIXTURE V1 → CAMPAÑA B → ROLLBACK COMPLETO`

- CAMPAÑA A debe terminar con rollback completo y verificado antes de cerrar su ejecución.
- Los tenants, branches, usuarios, sesiones, credenciales y demás datos TEST no deben permanecer activos mientras se espera la futura fase RLS.
- CAMPAÑA B debe recrear exactamente `SKIA-PHASE-002-FIXTURE-V1`; no reutiliza registros o sesiones dejados por CAMPAÑA A.
- Si la fase RLS aún no está aprobada o CAMPAÑA B no puede ejecutarse, PHASE-002 puede registrar CAMPAÑA B como `BLOQUEADA`. Esto no exime el rollback completo de CAMPAÑA A.
- Cada preparación y cada rollback requieren autorización de ejecución explícita y evidencia propia.

### CAMPAÑA A — Aplicación con RLS en estado actual

- Ejecutar la matriz completa con el estado RLS observado al inicio.
- Registrar nuevamente `relrowsecurity`, `relforcerowsecurity`, políticas y atributos del rol runtime mediante SELECT de catálogo.
- No habilitar ni modificar RLS.
- Clasificar si la aplicación bloquea o permite cruces cuando la BD no aporta la defensa esperada.
- Cualquier cruce permitido es hallazgo crítico y detiene pruebas equivalentes de mayor impacto.

### CAMPAÑA B — Repetición posterior a una futura fase RLS

- Solo puede comenzar después de que una fase separada habilite/corrija RLS y quede aprobada.
- Usar exactamente la misma versión del fixture, actores, datos, matriz, orden y criterios de CAMPAÑA A.
- Verificar y registrar el nuevo estado RLS antes de probar.
- Comparar resultado por ID (`ISO-001` a `ISO-022`) con CAMPAÑA A.
- No adaptar expectativas para ocultar regresiones.

PHASE-002 diseña ambas campañas, pero no autoriza la corrección RLS requerida entre ellas. Si esa fase futura no existe, CAMPAÑA B permanece `BLOQUEADA`.

### Control de variables A/B

Antes de cada campaña se debe registrar:

- SHA exacto de la aplicación evaluada;
- versión exacta y checksum de los scripts/definición de fixture;
- esquema PostgreSQL observado y firma o inventario estructural usado para compararlo;
- estado RLS por tabla, incluidas políticas, `relrowsecurity` y `relforcerowsecurity`;
- rol runtime y atributos de seguridad relevantes;
- versión exacta de la matriz de pruebas utilizada.

El comparativo A/B debe enumerar cualquier diferencia adicional entre campañas, incluso si no era el objetivo del cambio. Si además de RLS cambian autenticación, autorización, RBAC, handlers, filtros tenant/branch, esquema, dependencias, configuración o cualquier componente relevante, se debe registrar expresamente que la comparación **no constituye una prueba aislada del efecto de RLS**.

No se permite atribuir causalidad exclusiva a RLS cuando existan variables adicionales sin controlar.

## Criterios de aceptación

### Diseño e implementación de fixtures

- Existen exactamente los tres tenants y seis branches especificados, sin colisiones con datos previos.
- Existen actores segregados ADMIN, OPERATOR y multi-branch por tenant conforme a la matriz.
- Cada branch tiene al menos 10 activos inequívocamente TEST.
- Logs, relationships y metadata cubren las rutas necesarias.
- Los scripts son idempotentes, deterministas, transaccionales cuando aplica y fail-closed fuera de staging.
- Las credenciales nunca se versionan ni aparecen completas en evidencia.
- Todos los registros creados están inventariados de forma exacta.

### Campañas

- CAMPAÑA A ejecuta todos los casos posibles y documenta claramente cualquier `BLOQUEADO`.
- CAMPAÑA A termina con rollback completo y verificado; no deja fixtures activos a la espera de CAMPAÑA B.
- CAMPAÑA B repite la misma matriz solo tras aprobación de la fase RLS.
- CAMPAÑA B recrea exactamente FIXTURE V1 y termina con un segundo rollback completo y verificado.
- Cada prueba registra origen, actor, contexto, HTTP, esperado, observado, estado y riesgo.
- Un fallo no se oculta ni se corrige dentro de PHASE-002.
- La comparación A/B identifica la contribución de la capa aplicación y de RLS sin declarar seguro el sistema solo porque una capa bloquee.
- El comparativo registra todas las variables de control y advierte cuando cambios adicionales impiden aislar el efecto de RLS.

### Rollback

- El rollback elimina únicamente registros inventariados del fixture.
- No quedan sesiones, usuarios, accesos, activos, logs, relaciones o metadata TEST de esta fase.
- Los conteos/hashes de datos preexistentes verificados permanecen sin cambios.
- La verificación posterior queda registrada.

PHASE-002 puede ejecutarse correctamente aunque revele fallos, siempre que haya evidencia suficiente, no se oculten resultados y el rollback concluya correctamente. Esto no equivale a aprobar técnicamente SKIA.

## Evidencia requerida

- Rama y SHA de ejecución.
- Host/entorno identificados de forma redactada.
- Versión/hash de scripts de preparación, prueba y rollback.
- Resultado de precondiciones y respaldo.
- Checksum y resumen no sensible del manifest exacto de creación/rollback; el manifest temporal completo permanece fuera del repositorio.
- Conteos por tenant, branch y entidad antes/después.
- Mapa lógico de actores, roles y accesos sin credenciales.
- Resultado completo de `ISO-001` a `ISO-022` por campaña.
- Códigos HTTP y evidencia redactada de respuestas.
- Estado RLS y rol efectivo observado por campaña.
- Resultado de idempotencia: segunda preparación sin duplicados.
- Resultado del rollback y segunda ejecución del rollback sin daños.
- Fallos, bloqueos, riesgos y fases correctivas propuestas.

## Seguridad

- No mostrar passwords, tokens, cookies, session IDs, DSN ni secretos completos.
- No registrar correos reales; usar actores lógicos.
- No conceder privilegios fuera de la matriz.
- No reutilizar usuarios o sesiones existentes.
- No crear accesos cross-tenant válidos.
- No ejecutar bypass SQL ni cambiar roles para simular la aplicación.
- Usar el rol administrativo solo para preparación/rollback autorizados; las pruebas funcionales deben transitar por la aplicación y su rol runtime.
- Consultas PostgreSQL de correlación deben ser de solo lectura.
- Los archivos temporales con sesiones/credenciales deben estar fuera del repositorio, con permisos restrictivos y eliminación verificada.
- Detener la campaña si se detecta un entorno no autorizado, datos no TEST afectados, filtración de secretos o impacto sobre usuarios existentes.

## Estrategia de rollback

### Inventario previo

Antes de crear datos se debe capturar:

- IDs exactos y conteos de tenants/branches/usuarios/datos existentes;
- dependencias FK relevantes;
- tablas y rutas que recibirán datos TEST;
- estado de sesiones del fixture;
- firma verificable de los registros preexistentes que no deben cambiar.

### Registro de creación

El proceso de preparación debe generar y conservar temporalmente, fuera del repositorio y fuera de la propia base auditada, un manifest protegido de todos los registros creados. Por cada registro debe incluir como mínimo:

- tabla;
- ID exacto;
- alias lógico determinista;
- relación con `SKIA-PHASE-002-FIXTURE-V1` y la campaña correspondiente.

El manifest no debe contener passwords, tokens, cookies, session IDs completos ni otros secretos. Se debe calcular un checksum criptográfico del archivo una vez completada la preparación y volver a verificarlo antes del rollback.

El manifest completo se conserva únicamente hasta finalizar y verificar el rollback de su campaña. En evidencia versionada solo se incorpora, cuando corresponda, su checksum, conteos por tabla y un resumen no sensible. El rollback no puede depender de que el manifest sobreviva dentro de la base auditada.

### Orden seguro de eliminación

El orden definitivo debe derivarse de las FK observadas antes de implementar. Como mínimo se debe considerar, de hojas a raíces:

1. sesiones, tokens y artefactos de autenticación exclusivos del fixture;
2. logs, auditoría, metadata y registros auxiliares creados por pruebas;
3. relationships entre activos;
4. activos e inventario dependiente;
5. asignaciones de permisos, roles, user-branch y user-tenant del fixture;
6. usuarios de prueba;
7. branches TEST;
8. tenants TEST.

No se usarán búsquedas por prefijo como mecanismo de selección para rollback. Cada DELETE futuro debe restringirse a los IDs exactos del manifest externo y ejecutarse dentro de una transacción cuando sea viable.

### Verificación posterior

- Cero registros del manifest permanecen.
- El checksum del manifest coincide antes de usarlo para rollback.
- No existen sesiones activas de actores TEST.
- Los conteos y firmas de registros preexistentes coinciden con el inventario previo.
- Los health checks básicos siguen respondiendo.
- Una segunda ejecución del rollback no elimina ni modifica datos.

Si una dependencia impide rollback completo, detenerse, registrar `FALLIDO` y solicitar autorización; no ampliar eliminaciones.

## Riesgos

- RLS deshabilitado puede permitir exposición si falla un control de aplicación.
- Una asignación errónea de actor puede crear acceso cross-tenant real durante la prueba.
- Un rollback basado solo en nombres podría afectar datos ajenos.
- Diferencias entre esquema canónico y staging pueden romper idempotencia o rollback.
- Sesiones/cookies temporales pueden filtrarse en logs o archivos.
- Las campañas A/B pueden dejar de ser comparables si cambia código, fixture o datos entre ejecuciones.
- Los logs/auditoría generados automáticamente pueden crear dependencias no previstas.
- La ausencia de producción operativa no elimina la necesidad de respaldo y rollback.

## Entregables

- Diseño final de fixture y mapa de entidades.
- Script idempotente de preparación, sujeto a aprobación separada.
- Script de verificación de precondiciones y entorno.
- Runner de matriz HTTP con evidencia redactada.
- Consultas read-only de correlación PostgreSQL.
- Script de rollback idempotente.
- Manifest de registros creados sin secretos.
- Checksum y resumen no sensible versionable del manifest; el manifest completo permanece temporal y externo.
- Evidencia de CAMPAÑA A.
- Evidencia de CAMPAÑA B o estado `BLOQUEADO` documentado.
- Comparativo A/B.
- Informe de rollback y verificación posterior.
- Registro de hallazgos y fases correctivas sugeridas.

## Registro de cierre

Debe completarse al finalizar:

- Identificador de fase: `PHASE-002`.
- Rama utilizada: pendiente.
- Commit SHA de cierre aprobado: pendiente.
- Fecha de aprobación: pendiente.
- Alcance implementado: pendiente.
- Versión del fixture: pendiente.
- CAMPAÑA A: pendiente.
- CAMPAÑA B: pendiente o `BLOQUEADA` con motivo.
- Pruebas ejecutadas: pendiente.
- Resultados: pendiente.
- Resultado de rollback: pendiente.
- Pendientes conocidos: pendiente.
- Fases correctivas sugeridas: pendiente.

El SHA de cierre aprobado será el baseline técnico de PHASE-002 después de auditoría técnica y aprobación del Product Owner. No constituye aprobación automática de seguridad ni autorización de despliegue.
