-- =============================================================================
-- Migración 013 — DCIM Assets Phase 1 (Expand)
-- Patrón: Expand-Contract — solo se AGREGAN tablas y columnas, nunca se eliminan.
-- Las columnas legacy (manufacturer VARCHAR, model VARCHAR, location_id en racks)
-- se retiran en la Migración 015 (Contract), posterior al backfill.
-- =============================================================================

-- Extensión UUID (puede ya existir)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- BLOQUE 1: Catálogos Maestros
-- =============================================================================

-- Fabricantes
CREATE TABLE IF NOT EXISTS catalogs_manufacturers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  logo_url    VARCHAR(512),
  website     VARCHAR(512),
  country     VARCHAR(100),
  contact     VARCHAR(255),
  status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_catalogs_manufacturers_tenant ON catalogs_manufacturers(tenant_id);

-- Modelos (vinculados a fabricante)
CREATE TABLE IF NOT EXISTS catalogs_models (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  manufacturer_id  UUID NOT NULL REFERENCES catalogs_manufacturers(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  part_number      VARCHAR(100),
  description      TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, manufacturer_id, name)
);
CREATE INDEX IF NOT EXISTS idx_catalogs_models_tenant ON catalogs_models(tenant_id);
CREATE INDEX IF NOT EXISTS idx_catalogs_models_manufacturer ON catalogs_models(manufacturer_id);

-- Proveedores / Integradores
CREATE TABLE IF NOT EXISTS catalogs_providers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_type   VARCHAR(30) NOT NULL CHECK (provider_type IN (
                    'manufacturer','distributor','integrator',
                    'contractor','lessor','maintenance')),
  legal_name      VARCHAR(255) NOT NULL,
  trade_name      VARCHAR(255),
  tax_id          VARCHAR(50),
  contact_name    VARCHAR(255),
  email           VARCHAR(255),
  phone           VARCHAR(50),
  address         TEXT,
  website         VARCHAR(512),
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catalogs_providers_tenant ON catalogs_providers(tenant_id);

-- =============================================================================
-- BLOQUE 2: Jerarquía Física (Edificio → Piso → Zona → Cuarto Técnico)
-- Cada tabla lleva tenant_id denormalizado para validación directa (INV-DCM-0006)
-- sin necesidad de JOINs recursivos costosos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS buildings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  address     TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_buildings_tenant ON buildings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_buildings_branch ON buildings(branch_id);

CREATE TABLE IF NOT EXISTS floors (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  building_id   UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  floor_number  SMALLINT,
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_floors_tenant ON floors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_floors_building ON floors(building_id);

CREATE TABLE IF NOT EXISTS zones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  floor_id    UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zones_tenant ON zones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zones_floor ON zones(floor_id);

CREATE TABLE IF NOT EXISTS technical_rooms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  zone_id     UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  room_type   VARCHAR(10) NOT NULL CHECK (room_type IN ('MDF','IDF','DC','CLOSET','OTHER')),
  status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_technical_rooms_tenant ON technical_rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_technical_rooms_zone ON technical_rooms(zone_id);

-- Conectar racks a la nueva jerarquía (Expand — location_id se retira en 015)
ALTER TABLE racks ADD COLUMN IF NOT EXISTS technical_room_id UUID REFERENCES technical_rooms(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_racks_technical_room ON racks(technical_room_id);

-- =============================================================================
-- BLOQUE 3: Motor de Nomenclaturas
-- =============================================================================

CREATE TABLE IF NOT EXISTS naming_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_type_code VARCHAR(50) NOT NULL,   -- ej: SWITCH, RACK, UPS
  prefix          VARCHAR(20) NOT NULL,   -- ej: SW, RK, UPS
  separator       VARCHAR(5)  NOT NULL DEFAULT '-',
  include_branch  BOOLEAN NOT NULL DEFAULT TRUE,
  include_location BOOLEAN NOT NULL DEFAULT TRUE,
  seq_digits      SMALLINT NOT NULL DEFAULT 4,
  reset_per_location BOOLEAN NOT NULL DEFAULT FALSE,
  last_seq        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, asset_type_code)
);
CREATE INDEX IF NOT EXISTS idx_naming_rules_tenant ON naming_rules(tenant_id);

-- =============================================================================
-- BLOQUE 4: Relaciones entre Activos (Grafo Dirigido)
-- La prevención de ciclos (DAG) se valida en la capa de aplicación (Go).
-- Deuda técnica aceptada: inserciones directas en BD sin pasar por RelationshipService
-- pueden crear ciclos. Se documenta en INV-DCM-0013 como riesgo conocido.
-- =============================================================================

CREATE TABLE IF NOT EXISTS asset_relationships (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  target_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  relationship_type VARCHAR(30) NOT NULL CHECK (relationship_type IN (
                    'power','uplink','patching','containment','redundancy','depends_on')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_asset_id, target_asset_id, relationship_type)
);
CREATE INDEX IF NOT EXISTS idx_asset_relationships_tenant ON asset_relationships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_relationships_source ON asset_relationships(source_asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_relationships_target ON asset_relationships(target_asset_id);

-- =============================================================================
-- BLOQUE 5: Trazabilidad RFID / Logs de Activos
-- =============================================================================

CREATE TABLE IF NOT EXISTS asset_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id    UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  event_type  VARCHAR(30) NOT NULL CHECK (event_type IN (
                'rfid_scan','location_change','status_change',
                'maintenance','inspection','created','updated')),
  old_value   TEXT,
  new_value   TEXT,
  notes       TEXT,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata    JSONB
);
CREATE INDEX IF NOT EXISTS idx_asset_logs_tenant ON asset_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_logs_asset ON asset_logs(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_logs_performed_at ON asset_logs(performed_at DESC);

-- =============================================================================
-- BLOQUE 6: Columnas Expand en tabla assets
-- Expand: se agregan columnas nuevas. Las viejas (manufacturer VARCHAR, model VARCHAR)
-- se retiran en Migración 015 (Contract) tras el backfill.
-- =============================================================================

-- Columnas de catálogos normalizados (reemplazan a manufacturer/model VARCHAR)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS manufacturer_id UUID REFERENCES catalogs_manufacturers(id) ON DELETE SET NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS model_id        UUID REFERENCES catalogs_models(id)         ON DELETE SET NULL;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS provider_id     UUID REFERENCES catalogs_providers(id)      ON DELETE SET NULL;

-- Columnas financieras
ALTER TABLE assets ADD COLUMN IF NOT EXISTS purchase_date    DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS warranty_expiry  DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS cost_usd         NUMERIC(12,2);

-- Estado de inventario contable (separado del estado operativo 'status')
-- status = estado operativo (active, inactive, maintenance, decommissioned, unknown)
-- inventory_status = estado contable/ciclo de vida del activo
ALTER TABLE assets ADD COLUMN IF NOT EXISTS inventory_status VARCHAR(30)
  CHECK (inventory_status IS NULL OR inventory_status IN (
    'planned','ordered','received','inventory','installed','retired'));

-- Identificadores adicionales
ALTER TABLE assets ADD COLUMN IF NOT EXISTS qr_code VARCHAR(255);

-- Índices para las nuevas columnas de FK
CREATE INDEX IF NOT EXISTS idx_assets_manufacturer_id ON assets(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_assets_model_id        ON assets(model_id);
CREATE INDEX IF NOT EXISTS idx_assets_provider_id     ON assets(provider_id);

-- Constraint UNIQUE en internal_code (corrige F-AST-03: el índice simple no era UNIQUE)
-- Se usa DO $$ para no fallar si ya existe
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'uq_assets_tenant_branch_code'
    AND table_name = 'assets'
  ) THEN
    ALTER TABLE assets
      ADD CONSTRAINT uq_assets_tenant_branch_code
        UNIQUE (tenant_id, branch_id, internal_code);
  END IF;
END $$;
