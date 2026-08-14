\set ON_ERROR_STOP on

CREATE ROLE skia_runtime LOGIN NOSUPERUSER NOBYPASSRLS;

CREATE TABLE assets (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  name text NOT NULL
);
CREATE TABLE asset_logs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  notes text
);
CREATE TABLE asset_relationships (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  source_asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  target_asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  notes text
);

GRANT SELECT,INSERT,UPDATE,DELETE ON assets,asset_logs,asset_relationships TO skia_runtime;

ALTER TABLE assets FORCE ROW LEVEL SECURITY;
ALTER TABLE asset_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE asset_relationships FORCE ROW LEVEL SECURITY;

CREATE POLICY assets_tenant_branch_isolation ON assets
USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND (branch_id IS NULL
    OR branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
    OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true')
)
WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND (branch_id IS NULL
    OR branch_id = NULLIF(current_setting('app.branch_id', true), '')::uuid
    OR NULLIF(current_setting('app.branch_scope_all', true), '') = 'true')
);
CREATE POLICY asset_logs_tenant_isolation ON asset_logs
USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY asset_relationships_tenant_isolation ON asset_relationships
USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE assets DISABLE ROW LEVEL SECURITY;
ALTER TABLE asset_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE asset_relationships DISABLE ROW LEVEL SECURITY;

INSERT INTO assets VALUES
 ('10000000-0000-4000-8000-0000000000a1','20000000-0000-4000-8000-00000000000a','30000000-0000-4000-8000-0000000000a1','A1-1'),
 ('10000000-0000-4000-8000-0000000000a2','20000000-0000-4000-8000-00000000000a','30000000-0000-4000-8000-0000000000a1','A1-2'),
 ('10000000-0000-4000-8000-0000000000a3','20000000-0000-4000-8000-00000000000a','30000000-0000-4000-8000-0000000000a2','A2-1'),
 ('10000000-0000-4000-8000-0000000000b1','20000000-0000-4000-8000-00000000000b','30000000-0000-4000-8000-0000000000b1','B1-1');
INSERT INTO asset_logs VALUES
 ('40000000-0000-4000-8000-0000000000a1','20000000-0000-4000-8000-00000000000a','10000000-0000-4000-8000-0000000000a1','A1'),
 ('40000000-0000-4000-8000-0000000000a2','20000000-0000-4000-8000-00000000000a','10000000-0000-4000-8000-0000000000a3','A2'),
 ('40000000-0000-4000-8000-0000000000b1','20000000-0000-4000-8000-00000000000b','10000000-0000-4000-8000-0000000000b1','B1');
INSERT INTO asset_relationships VALUES
 ('50000000-0000-4000-8000-0000000000a1','20000000-0000-4000-8000-00000000000a','10000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a2','same branch'),
 ('50000000-0000-4000-8000-0000000000a2','20000000-0000-4000-8000-00000000000a','10000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a3','cross branch'),
 ('50000000-0000-4000-8000-0000000000a3','20000000-0000-4000-8000-00000000000a','10000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000b1','cross tenant endpoint');
