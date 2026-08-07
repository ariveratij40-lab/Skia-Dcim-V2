-- 016_assets_branch_scope_all.sql
--
-- Extiende la política RLS de `assets` (definida en 015_assets_rls.sql) para
-- soportar un alcance explícito "todas las sucursales del tenant", y agrega
-- una función de integridad para la guardia de borrado de ubicaciones que
-- debe ver todas las sucursales sin importar el rol de quien la invoca.
--
-- Contexto (informe de auditoría, C-6, ronda 2026-08-07): la política real
-- de `assets` es tenant+sucursal (`branch_id IS NULL OR branch_id =
-- app.branch_id`), no solo tenant. Migrar HandleRFID/dashboard/borrado de
-- ubicaciones a RequireTenantTx sin más habría acotado indebidamente
-- (RFID/dashboard) o debilitado una guardia de integridad (borrado de
-- ubicaciones) que antes cruzaban sucursales a propósito.
--
-- Diseño acordado con el usuario:
--   * Nunca interpretar la AUSENCIA de app.branch_id como alcance global
--     (eso convertiría cualquier bug de "me olvidé de setear el contexto"
--     de fail-closed a fail-open -- justo lo que C-6 existe para evitar).
--   * El alcance global se representa con una variable de sesión EXPLÍCITA,
--     separada: app.branch_scope_all = 'true'. Solo el middleware la activa,
--     y solo después de verificar el rol del usuario contra la base — nunca
--     por omisión, nunca a pedido del cliente.
--   * Es transaccional (SET LOCAL / set_config(..., true)): se reinicia en
--     cada transacción porque BeginTenantTx abre una transacción nueva por
--     request; no hay forma de que "se quede pegada" entre requests.
--   * El borrado de ubicaciones NO depende de la visibilidad del usuario
--     que pide el borrado -- es una regla de integridad del tenant completo,
--     siempre, para cualquier rol. Se implementa como función
--     SECURITY DEFINER de propósito único (solo cuenta, no expone filas),
--     ejecutada con los privilegios de su dueño (que sí puede evadir RLS),
--     y con EXECUTE otorgado únicamente a skia_runtime -- así el rol de
--     runtime de la API sigue sin poder evadir RLS en general, pero esta
--     operación puntual y auditable sí lo hace.
--
-- Este archivo es aditivo y re-ejecutable (CREATE OR REPLACE / DROP...IF
-- EXISTS + CREATE): no modifica datos, solo la política y agrega una
-- función. Requiere que 015_assets_rls.sql (o el estado equivalente que
-- ya existe en staging, confirmado por pg_policies) se haya aplicado antes.
--
-- CÓMO EJECUTAR: manualmente, vía `psql -U skia_user` (o el rol equivalente
-- con BYPASSRLS), exactamente igual que ops/2026-08-05_*.sql -- NUNCA a
-- través del runner de migraciones embebido en la app
-- (runMigrations, backend/migrations.go). Esa ruta usa la conexión de
-- skia_runtime, que no tiene BYPASSRLS: si esta función se creara desde
-- ahí, quedaría con skia_runtime como dueña y SECURITY DEFINER no
-- lograría nada (ejecutaría con los mismos privilegios limitados de
-- siempre). El dueño de la función es quien la CREA -- correr esto como
-- skia_user (como en el resto de esta sesión de staging) ya deja la
-- función con el dueño correcto sin pasos adicionales.

BEGIN;

-- ============================================================
-- 1. Política de `assets` ampliada con el escape explícito de alcance.
-- ============================================================
DROP POLICY IF EXISTS assets_tenant_branch_isolation ON assets;

CREATE POLICY assets_tenant_branch_isolation ON assets
USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (
        branch_id IS NULL
        OR branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
        OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'
    )
)
WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND (
        branch_id IS NULL
        OR branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
        OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true'
    )
);

-- ============================================================
-- 2. Función de integridad para el borrado de ubicaciones.
--
-- Cuenta activos de TODAS las sucursales del tenant en una ubicación dada,
-- sin importar el contexto de sesión de quien la invoca (SECURITY DEFINER:
-- corre con los privilegios de su dueño, no de quien la llama). Devuelve
-- solo un conteo -- nunca expone las filas en sí, para minimizar lo que
-- esta vía de bypass puede filtrar si алгun día se usa mal.
--
-- IMPORTANTE: el dueño efectivo de esta función será quien ejecute este
-- script (ver "CÓMO EJECUTAR" arriba). Debe ser un rol con BYPASSRLS
-- (hoy, `skia_user` en staging, confirmado `rolbypassrls=true` el
-- 2026-08-07) -- de lo contrario SECURITY DEFINER no cumple su propósito.
-- ============================================================
CREATE OR REPLACE FUNCTION assets_count_in_location_all_branches(
    p_location_id uuid,
    p_tenant_id uuid
) RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
    SELECT COUNT(*)
    FROM assets
    WHERE location_id = p_location_id
      AND tenant_id = p_tenant_id;
$func$;

-- Nadie evada RLS a través de esta función salvo skia_runtime (el único
-- rol que debería invocarla desde el backend), y solo para esta operación
-- puntual -- no se otorga EXECUTE a PUBLIC.
REVOKE ALL ON FUNCTION assets_count_in_location_all_branches(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assets_count_in_location_all_branches(uuid, uuid) TO skia_runtime;

COMMIT;

-- Verificación posterior recomendada (fuera de la transacción, de solo
-- lectura):
--
-- SELECT p.proname, r.rolname AS owner, r.rolbypassrls
-- FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
-- WHERE p.proname = 'assets_count_in_location_all_branches';
-- -- se espera owner=skia_user, rolbypassrls=true
