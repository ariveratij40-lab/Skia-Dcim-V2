# Sidebar por dominios

## Auditoría

`AppLayout` era la autoridad visual del sidebar mediante una lista estática. El
endpoint `/api/navigation/sidebar` no se consume en el frontend y actualmente
expone rutas históricas en inglés, por lo que no es un contrato apto para esta
reorganización. `/api/auth/me` devuelve identidad y contexto tenant/branch, pero
no privilegios de módulo ni una autoridad global de plataforma.

El Dashboard general es transversal: resume activos, infraestructura MDF/IDF,
tickets, incidentes, SLA, usuarios y onboarding. La ruta
`/infraestructura/activos` conserva su responsabilidad de inventario: métricas
por tipo y estado, filtros, tabla, alta, edición, importación y exportación. No
son páginas duplicadas y ninguna de las dos cambia en esta fase.

## Arquitectura operativa

- Dashboard: `/dashboard`.
- Infraestructura: MDF/IDF, racks, patch panels, backbone, nodos, topología,
  planos y ubicaciones.
- Equipos: switches y UPS/PDU.
- Inventario: resumen de activos, importación y RFID.
- Gestión: fabricantes, proveedores y nomenclaturas.
- CAPEX: presupuestos.
- Administración: administración general y configuración.
- Operaciones, Monitoreo y Documentación: dominios reservados sin enlaces hasta
  que existan páginas operativas.

Solo un grupo puede permanecer expandido. La ruta activa abre automáticamente
su grupo y cambiar de grupo cierra el anterior. Los controles de sidebar
compacto, tema claro/oscuro, Nuevo Ticket, Ayuda, cierre de sesión y el asistente
de la barra superior se conservan.

## Decisiones de rutas

No se crean enlaces para “Resumen Infraestructura” ni “Resumen Equipos” porque
no existen páginas dedicadas. “Dashboard Importación” también se difiere: la
ruta histórica `/infraestructura/import-dashboard` no tiene página Next en esta
base. Los tipos futuros de equipo se documentarán cuando cuenten con una ruta
real. El rótulo histórico “Normativaes” se corrige a “Normativas”, pero no se
publica como enlace mientras el dominio Documentación carezca de página.

## Seguridad y CRM SKIA

El sidebar sigue siendo navegación, no autoridad de autorización. Esta fase no
altera roles, permisos, endpoints ni validaciones de backend.

`CRM SKIA` queda **BLOCKED_PENDING_PLATFORM_AUTHORITY** y no se muestra. Ni
`/api/auth/me` ni el contrato de navegación entregan una señal inequívoca de
administrador global de plataforma. Mostrarlo por nombre de rol o por una
suposición del frontend sería una escalación de visibilidad no demostrable.

Queda como deuda separada definir un contrato backend de permisos por módulo y
una autoridad explícita de plataforma; entonces el frontend podrá filtrar
visibilidad sin inventar reglas de negocio.
