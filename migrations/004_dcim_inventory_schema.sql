-- ============================================================
-- SKIA DCIM Platform
-- Migration 004: DCIM Inventory Schema
-- ============================================================
-- IMPORTANTE: Esta migración NO modifica tablas existentes.
-- Solo agrega nuevas tablas para el módulo DCIM.
-- ============================================================

-- ==========================================
-- Asset Types (catálogo de tipos de activo)
-- ==========================================
CREATE TABLE IF NOT EXISTS asset_types (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(50)  UNIQUE NOT NULL,  -- ej: MDF, IDF, RACK, SWITCH, UPS, PDU, PATCH_PANEL, NODE, BACKBONE
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  icon        VARCHAR(100),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- Locations (ubicaciones físicas dentro de una sucursal)
-- ==========================================
CREATE TABLE IF NOT EXISTS locations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  floor       VARCHAR(50),
  room        VARCHAR(100),
  zone        VARCHAR(100),
  description TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- Assets (activos DCIM principales)
-- ==========================================
CREATE TABLE IF NOT EXISTS assets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  asset_type_id   UUID NOT NULL REFERENCES asset_types(id),
  location_id     UUID REFERENCES locations(id) ON DELETE SET NULL,

  -- Identificación
  internal_code   VARCHAR(100) NOT NULL,   -- código interno único por tenant+branch
  name            VARCHAR(255) NOT NULL,
  serial_number   VARCHAR(255),
  model           VARCHAR(255),
  manufacturer    VARCHAR(255),

  -- Estado y clasificación
  status          VARCHAR(50) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive','maintenance','decommissioned','unknown')),

  -- RFID
  rfid_tag        VARCHAR(255),

  -- Metadatos
  install_year    SMALLINT,
  observations    TEXT,
  specs           JSONB,                   -- especificaciones técnicas flexibles

  -- Auditoría
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Unicidad: código interno único por tenant + branch
  UNIQUE(tenant_id, branch_id, internal_code)
);

-- ==========================================
-- Racks (extiende assets de tipo RACK)
-- ==========================================
CREATE TABLE IF NOT EXISTS racks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id    UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  total_u     SMALLINT NOT NULL DEFAULT 42,
  used_u      SMALLINT NOT NULL DEFAULT 0,
  height_mm   INT,
  width_mm    INT,
  depth_mm    INT,
  power_kw    NUMERIC(6,2),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- MDF / IDF (extiende assets de tipo MDF o IDF)
-- ==========================================
CREATE TABLE IF NOT EXISTS mdf_idf (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  type            VARCHAR(10) NOT NULL CHECK (type IN ('MDF','IDF')),
  rack_count      SMALLINT DEFAULT 0,
  patch_panel_count SMALLINT DEFAULT 0,
  switch_count    SMALLINT DEFAULT 0,
  ups_count       SMALLINT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- Patch Panels (extiende assets de tipo PATCH_PANEL)
-- ==========================================
CREATE TABLE IF NOT EXISTS patch_panels (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id    UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  rack_id     UUID REFERENCES racks(id) ON DELETE SET NULL,
  port_count  SMALLINT NOT NULL DEFAULT 24,
  port_type   VARCHAR(50) DEFAULT 'RJ45',  -- RJ45, LC, SC, etc.
  rack_unit   SMALLINT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- Switches (extiende assets de tipo SWITCH)
-- ==========================================
CREATE TABLE IF NOT EXISTS switches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  rack_id         UUID REFERENCES racks(id) ON DELETE SET NULL,
  port_count      SMALLINT NOT NULL DEFAULT 24,
  uplink_count    SMALLINT DEFAULT 2,
  management_ip   VARCHAR(45),
  vlan_config     JSONB,
  rack_unit       SMALLINT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- UPS (extiende assets de tipo UPS)
-- ==========================================
CREATE TABLE IF NOT EXISTS ups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  capacity_kva    NUMERIC(6,2),
  battery_runtime_min SMALLINT,
  management_ip   VARCHAR(45),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- PDUs (extiende assets de tipo PDU)
-- ==========================================
CREATE TABLE IF NOT EXISTS pdus (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  rack_id         UUID REFERENCES racks(id) ON DELETE SET NULL,
  outlet_count    SMALLINT DEFAULT 8,
  amperage        NUMERIC(5,2),
  management_ip   VARCHAR(45),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- Nodes (nodos de red / equipos terminales)
-- ==========================================
CREATE TABLE IF NOT EXISTS nodes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  node_type       VARCHAR(50) DEFAULT 'endpoint',  -- endpoint, server, ap, camera, phone
  ip_address      VARCHAR(45),
  mac_address     VARCHAR(17),
  connected_switch_id UUID REFERENCES switches(id) ON DELETE SET NULL,
  switch_port     VARCHAR(20),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- Backbone Links (enlaces de backbone entre MDFs/IDFs)
-- ==========================================
CREATE TABLE IF NOT EXISTS backbone_links (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  link_type       VARCHAR(50) DEFAULT 'fiber',  -- fiber, copper, wireless
  origin_id       UUID REFERENCES assets(id) ON DELETE SET NULL,   -- MDF/IDF origen
  destination_id  UUID REFERENCES assets(id) ON DELETE SET NULL,   -- MDF/IDF destino
  cable_length_m  NUMERIC(8,2),
  fiber_count     SMALLINT,
  bandwidth_gbps  NUMERIC(6,2),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- Índices para performance
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_assets_tenant_id       ON assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_assets_branch_id       ON assets(branch_id);
CREATE INDEX IF NOT EXISTS idx_assets_tenant_branch   ON assets(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_assets_type_id         ON assets(asset_type_id);
CREATE INDEX IF NOT EXISTS idx_assets_status          ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_internal_code   ON assets(internal_code);
CREATE INDEX IF NOT EXISTS idx_assets_rfid            ON assets(rfid_tag) WHERE rfid_tag IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_tenant_branch ON locations(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_racks_tenant_branch     ON racks(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_switches_tenant_branch  ON switches(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_nodes_tenant_branch     ON nodes(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_backbone_tenant_branch  ON backbone_links(tenant_id, branch_id);

-- ==========================================
-- Trigger: updated_at automático para assets
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_assets_updated_at') THEN
    CREATE TRIGGER update_assets_updated_at
      BEFORE UPDATE ON assets
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_locations_updated_at') THEN
    CREATE TRIGGER update_locations_updated_at
      BEFORE UPDATE ON locations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;
