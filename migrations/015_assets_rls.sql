-- RLS piloto del dominio assets. Ejecutar después de crear skia_runtime.
BEGIN;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assets_tenant_branch_isolation ON public.assets;
CREATE POLICY assets_tenant_branch_isolation ON public.assets
USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND (branch_id IS NULL OR branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid)
)
WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND (branch_id IS NULL OR branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid)
);
ALTER TABLE public.asset_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asset_logs_tenant_isolation ON public.asset_logs;
CREATE POLICY asset_logs_tenant_isolation ON public.asset_logs
USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE public.asset_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_relationships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asset_relationships_tenant_isolation ON public.asset_relationships;
CREATE POLICY asset_relationships_tenant_isolation ON public.asset_relationships
USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
COMMIT;
