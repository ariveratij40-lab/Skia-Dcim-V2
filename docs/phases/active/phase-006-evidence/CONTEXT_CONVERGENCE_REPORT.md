# PHASE-006 — Context Convergence Report

## Etapa C

- Estado: `BLOQUEADA POR LÍMITE ESTRUCTURAL`.
- Código funcional modificado: ninguno.

La migración de accesos directos es técnicamente posible para rutas branch-scoped, pero no puede completarse preservando semántica en la operación tenant-wide `handleClearInventory` sin una decisión de autorización adicional.

Opciones que requieren decisión arquitectónica:

1. exigir rol `admin` además de la credencial administrativa y usar `RequireTenantTxScoped`;
2. retirar o rediseñar la contraseña administrativa global;
3. definir una capacidad específica, auditable y tenant-scoped independiente del nombre de rol;
4. deshabilitar temporalmente la operación durante el cutover.

No se eligió ninguna opción unilateralmente. Tampoco se introdujo un runtime privilegiado, `SET ROLE`, bypass por handler ni alcance global derivado de branch ausente.

Los jobs de importación/background necesitan además un contrato explícito para recibir tenant/branch validados y abrir `BeginTenantTx` sobre el pool runtime. Esta adaptación debe realizarse junto con las pruebas del modelo de ejecución asíncrono, no como sustitución mecánica de `db`.
