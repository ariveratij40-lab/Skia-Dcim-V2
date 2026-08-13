# PHASE-001 — Staging Baseline & Security Assessment

## Estado y control

- Identificador: `PHASE-001`.
- Estado: `ESPECIFICACIÓN`.
- Entorno autorizado: `STAGING`.
- Rama de especificación: `docs/phase-001-staging-baseline`.
- Rama base: `main`.
- SHA inicial evaluado: `6e4c3ed1fc938075a321067b28e04bf59d9add4b`.
- Product Owner: pendiente de registrar.
- Arquitecto Técnico / Auditor: pendiente de registrar.
- Ingeniero de Implementación / Codex: pendiente de registrar.
- Fecha de aprobación: pendiente.
- Commit SHA de cierre aprobado: pendiente.
- Baseline técnico de cierre: pendiente.

El SHA inicial identifica el estado de entrada que evaluará PHASE-001. Es distinto del futuro commit SHA de cierre aprobado, que registrará los entregables y constituirá el baseline técnico de la fase.

## Objetivo

Establecer un baseline técnico verificable del staging actual de SKIA y determinar si su construcción, configuración, arranque y flujos críticos son reproducibles, funcionales y coherentes con los controles de seguridad, multi-tenancy y RLS existentes.

Esta fase produce evidencia y una clasificación de hallazgos. No autoriza por sí misma cambios correctivos.

## Contexto operativo

- SKIA opera exclusivamente en staging.
- No existe producción operativa.
- Los datos actuales son datos de prueba.
- `skia.mx` es un destino productivo futuro, condicionado a la aprobación de la primera fase funcional de staging.
- Esta fase no autoriza desplegar producción.

## Alcance autorizado

### Inventario y reproducibilidad

- Confirmar versiones, manifiestos y puntos de entrada del backend y frontend.
- Verificar la topología declarada en Docker Compose y su dependencia de la red externa `infra_network`.
- Identificar todas las variables requeridas sin revelar sus valores sensibles.
- Comparar el procedimiento documentado con los archivos realmente existentes.
- Determinar si las imágenes de backend y frontend pueden construirse con el árbol actual.

### Base de datos y migraciones

- Inventariar los SQL de `migrations/`, `backend/migrations/`, `backend/migrations.go` y `ops/`.
- Documentar responsables, orden y momento de ejecución de cada mecanismo.
- Evaluar el efecto de las dos migraciones con prefijo `015` sin renombrarlas ni reescribirlas.
- Verificar de forma no destructiva el rol efectivo usado por el backend y la aplicación de RLS.
- Registrar discrepancias, riesgos de orden, idempotencia y trazabilidad.

### Seguridad, identidad y aislamiento

- Revisar autenticación, sesiones, selección de tenant y selección de sucursal.
- Validar aislamiento entre tenants y alcance por sucursal mediante pruebas autorizadas con datos de prueba.
- Revisar configuración versionada en busca de passwords, tokens, API keys, claves privadas u otros secretos.
- Reportar cualquier secreto únicamente de forma redactada y registrarlo como hallazgo de seguridad.
- Revisar exposición de puertos, cookies, CORS y límites de archivos conforme al comportamiento actual.

### Flujos funcionales críticos

- Health check del backend.
- Carga de la ruta inicial y autenticación del frontend.
- Inicio y cierre de sesión.
- Selección de tenant y sucursal.
- Consulta y operaciones DCIM representativas definidas para la validación.
- Importación controlada de inventario con datos de prueba.
- Persistencia de sesiones y verificación de separación de contexto.
- Revisión de logs generados durante las pruebas sin reproducir secretos.

### Documentación y activos versionados

- Confirmar las diferencias entre `README.md`, `SETUP.md` y el árbol real.
- Evaluar el impacto de la ausencia de `frontend/next.config.js` referenciado por `frontend/Dockerfile`.
- Inventariar archivos `.bak` y backups versionados, indicando necesidad, sensibilidad y política pendiente.
- Relacionar cada hallazgo con `docs/technical-debt/TECHNICAL_DEBT.md` o con un hallazgo de seguridad.

## Fuera de alcance

- Corregir código, Docker, Nginx, migraciones o configuración operativa.
- Reescribir, renombrar o ejecutar manualmente migraciones existentes.
- Cambiar arquitectura, modelo de datos, multi-tenancy, RLS, autenticación o autorización.
- Eliminar o rotar secretos detectados.
- Eliminar archivos `.bak`, backups o datos.
- Incorporar funcionalidad nueva.
- Usar datos productivos.
- Crear o desplegar un entorno productivo.
- Hacer merge, push o deploy sin autorización explícita.

Los hallazgos que requieran corrección deben convertirse en fases correctivas separadas con alcance y aprobación propios.

## Requisitos previos

- Leer `AGENTS.md`, `ARCHITECTURE.md` y `docs/governance/DEVELOPMENT_RULES.md`.
- Confirmar rama y commit de inicio.
- Confirmar que el árbol de trabajo está limpio antes de las pruebas.
- Disponer de autorización para ejecutar el entorno de staging y las pruebas que escriban datos de prueba.
- Definir fixtures o cuentas de prueba por tenant y sucursal sin incluir credenciales en el repositorio.
- Contar con un respaldo verificable antes de cualquier validación que pueda modificar datos.

## Acceso al VPS

La disponibilidad del repositorio local para Codex no implica autorización ni acceso automático al VPS de staging.

Cualquier prueba u operación que requiera SSH, Docker del VPS, PostgreSQL staging, Redis staging, logs del servidor, archivos del servidor, reinicio de servicios o cambios sobre staging real debe clasificarse como `BLOQUEADA` hasta disponer de un mecanismo de acceso expresamente autorizado.

No se deben buscar, copiar, revelar ni reutilizar claves privadas o credenciales para intentar obtener acceso. La autorización de la fase no sustituye la autorización específica ni la provisión segura del mecanismo de acceso.

## Plan de validación

### 1. Inspección estática

- Revisar manifiestos, configuración, dependencias, migraciones y rutas críticas.
- Construir una matriz entre documentación y archivos existentes.
- Ejecutar búsqueda de secretos con salida redactada.
- Registrar hallazgos sin modificar los archivos evaluados.

### 2. Construcción

- Ejecutar el build reproducible del backend.
- Ejecutar las pruebas Go aplicables.
- Ejecutar el build reproducible del frontend.
- Registrar comandos, versiones, duración y salida final.

No instalar dependencias ni alterar imágenes fuera de una ejecución expresamente autorizada para esta fase.

### 3. Arranque controlado

- Validar la configuración efectiva de Compose antes de iniciar servicios.
- Confirmar disponibilidad de la red y dependencias requeridas.
- Arrancar únicamente staging con datos de prueba y secretos suministrados fuera del repositorio.
- Registrar estado y health checks de cada servicio.

### 4. Pruebas funcionales y de aislamiento

- Ejecutar los flujos críticos definidos en el alcance.
- Verificar respuestas autorizadas y denegadas entre tenants y sucursales.
- Confirmar el rol efectivo de PostgreSQL y el comportamiento de RLS.
- Registrar evidencia suficiente sin exponer secretos ni datos sensibles completos.

### 5. Auditoría técnica

- Consolidar resultados, fallos, riesgos y pendientes.
- Clasificar cada resultado como `APROBADO`, `FALLIDO`, `BLOQUEADO` o `NO EJECUTADO`.
- Someter la evidencia al Arquitecto Técnico / Auditor.
- No declarar aprobada la fase solamente porque el sistema compile o pase pruebas.

### Origen de evidencia

Cada prueba debe registrar su origen de ejecución usando, cuando corresponda, una de estas etiquetas:

- `LOCAL`.
- `CONTAINER LOCAL`.
- `STAGING VPS`.
- `POSTGRES STAGING`.
- `HTTP STAGING`.

Una prueba ejecutada en local o en un contenedor local no constituye evidencia automática del comportamiento del VPS. Los resultados de orígenes diferentes deben conservarse separados y no extrapolarse sin validación específica.

## Criterios de aceptación

PHASE-001 evalúa y documenta el estado del sistema; no es una fase correctiva. Puede completarse correctamente aunque una prueba técnica resulte `FALLIDA`, siempre que la prueba se haya ejecutado correctamente, exista evidencia suficiente, el fallo esté documentado y no se haya ocultado ni corregido fuera de alcance.

Se distinguen expresamente dos conclusiones independientes:

- **PHASE-001 ejecutada y auditada correctamente:** el proceso de evaluación cumplió esta especificación y registró evidencia, resultados y pendientes con trazabilidad.
- **SKIA técnicamente aprobado para avanzar:** la auditoría técnica y el Product Owner determinaron que los resultados permiten continuar al siguiente hito.

Un build, prueba funcional, control de RLS o control de seguridad fallido debe producir un hallazgo y, cuando corresponda, una fase correctiva. Ese fallo no invalida necesariamente la correcta ejecución y auditoría de PHASE-001, pero puede impedir que SKIA sea aprobado técnicamente para avanzar.

- El inventario de componentes, servicios, configuración y mecanismos de migración está completo y coincide con el repositorio.
- Los builds de backend y frontend tienen resultados reproducibles y documentados.
- Las pruebas Go aplicables tienen resultados visibles.
- El staging puede arrancar de forma controlada o sus bloqueantes están identificados con evidencia.
- Los flujos críticos tienen resultado registrado.
- El aislamiento multi-tenant, de sucursal y RLS fue verificado o quedó marcado explícitamente como fallido, bloqueado o no ejecutado.
- Los secretos detectados están redactados y registrados como hallazgos de seguridad.
- No se ocultaron fallos ni pruebas omitidas.
- Cada hallazgo correctivo tiene prioridad, riesgo y recomendación de fase posterior, sin implementación fuera de alcance.
- La auditoría técnica y la aprobación final están registradas antes de establecer el baseline.

## Evidencia mínima requerida

- Rama y SHA evaluados.
- Versiones de herramientas utilizadas.
- Comandos de validación ejecutados.
- Resultado de cada build y prueba.
- Origen de ejecución de cada prueba.
- Estado de servicios y health checks.
- Matriz de flujos funcionales y aislamiento.
- Inventario de migraciones y explicación del orden observado.
- Hallazgos de seguridad redactados.
- Riesgos, bloqueantes y pendientes conocidos.

La evidencia no debe contener passwords, tokens, API keys, claves privadas ni secretos completos.

## Estrategia de rollback

La inspección estática y los builds aislados no requieren rollback de datos. Para las validaciones ejecutadas sobre staging:

- capturar el SHA, configuración efectiva redactada y estado previo de servicios;
- realizar un respaldo verificable de los datos de prueba antes de pruebas con escritura;
- etiquetar los registros de prueba para poder identificarlos;
- revertir únicamente los datos de prueba creados por la validación mediante un procedimiento previamente aprobado;
- restaurar el estado anterior de servicios si el arranque controlado altera su disponibilidad;
- detener la ejecución ante cambios inesperados de esquema, RLS, autenticación o infraestructura.

Esta estrategia no autoriza ejecutar restauraciones, eliminar datos, modificar migraciones, rotar secretos ni realizar otras acciones destructivas. Esas acciones requieren autorización explícita.

## Riesgos

- La convivencia de varios mecanismos de migración puede producir diferencias entre una base nueva y una existente.
- La ausencia del archivo que el Dockerfile del frontend intenta copiar puede impedir su build.
- La configuración sensible versionada puede requerir contención y rotación en una fase independiente.
- Las diferencias entre documentación y árbol actual pueden impedir una reproducción fiable.
- Las pruebas de aislamiento pueden producir falsos positivos si no se diseñan tenants y sucursales de control separados.

## Entregables

- Informe de baseline de staging.
- Matriz de pruebas y resultados.
- Inventario y flujo de migraciones.
- Informe redactado de hallazgos de seguridad.
- Actualización autorizada del registro de deuda técnica.
- Propuesta priorizada de fases correctivas.
- Registro de cierre y baseline técnico si la fase resulta aprobada.

## Registro de cierre

Debe completarse al finalizar la fase:

- Identificador de fase: `PHASE-001`.
- Rama utilizada: pendiente.
- Commit SHA de cierre aprobado: pendiente.
- Fecha de aprobación: pendiente.
- Alcance implementado: pendiente.
- Pruebas ejecutadas: pendiente.
- Resultados: pendiente.
- Pendientes conocidos: pendiente.

El commit SHA de cierre aprobado será el baseline técnico de esta fase después de la auditoría técnica y la aprobación del Product Owner; no sustituye ni altera el SHA inicial evaluado registrado en “Estado y control”.
