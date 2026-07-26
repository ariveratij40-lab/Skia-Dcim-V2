-- ============================================================
-- SKIA DCIM Platform
-- Migration 005: DCIM Seed Data
-- ============================================================
-- Datos demo para el módulo DCIM.
-- Todos los IDs son UUIDs válidos.
-- Referencia al tenant ACME Corporation y sucursal Sede Principal - Miami.
-- tenant_id  = 550e8400-e29b-41d4-a716-446655440001 (ACME Corporation)
-- branch_id  = 550e8400-e29b-41d4-a716-446655440201 (Sede Principal - Miami)
-- admin user = 550e8400-e29b-41d4-a716-446655440101
-- ============================================================

-- ==========================================
-- Asset Types
-- ==========================================
INSERT INTO asset_types (id, code, name, description, icon) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'MDF',         'Main Distribution Frame',  'Cuarto de distribución principal',        'Building2'),
  ('a0000000-0000-0000-0000-000000000002', 'IDF',         'Intermediate Distribution Frame', 'Cuarto de distribución intermedio',  'Building'),
  ('a0000000-0000-0000-0000-000000000003', 'RACK',        'Rack de Equipos',          'Rack de montaje para equipos',            'Grid3x3'),
  ('a0000000-0000-0000-0000-000000000004', 'SWITCH',      'Switch de Red',            'Switch de capa 2 o capa 3',               'Network'),
  ('a0000000-0000-0000-0000-000000000005', 'UPS',         'Sistema de Alimentación Ininterrumpida', 'UPS para protección eléctrica', 'Zap'),
  ('a0000000-0000-0000-0000-000000000006', 'PDU',         'Unidad de Distribución de Energía', 'PDU para distribución de energía en rack', 'Plug'),
  ('a0000000-0000-0000-0000-000000000007', 'PATCH_PANEL', 'Patch Panel',              'Panel de parcheo de cableado estructurado', 'LayoutGrid'),
  ('a0000000-0000-0000-0000-000000000008', 'NODE',        'Nodo de Red',              'Dispositivo terminal de red',             'Monitor'),
  ('a0000000-0000-0000-0000-000000000009', 'BACKBONE',    'Enlace Backbone',          'Enlace de backbone entre MDFs/IDFs',      'GitBranch')
ON CONFLICT (code) DO NOTHING;

-- ==========================================
-- Location: Sede Principal - Miami
-- ==========================================
INSERT INTO locations (id, tenant_id, branch_id, name, floor, room, zone, description) VALUES
  ('b0000000-0000-0000-0000-000000000001',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'Cuarto MDF Principal', 'Planta Baja', 'MDF-01', 'Zona Técnica',
   'Cuarto de distribución principal del edificio'),
  ('b0000000-0000-0000-0000-000000000002',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'Cuarto IDF Piso 1', 'Piso 1', 'IDF-01', 'Zona Técnica',
   'Cuarto de distribución intermedio del primer piso'),
  ('b0000000-0000-0000-0000-000000000003',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'Cuarto IDF Piso 2', 'Piso 2', 'IDF-02', 'Zona Técnica',
   'Cuarto de distribución intermedio del segundo piso')
ON CONFLICT DO NOTHING;

-- ==========================================
-- Assets Base
-- ==========================================
INSERT INTO assets (id, tenant_id, branch_id, asset_type_id, location_id, internal_code, name, status, install_year, observations, created_by) VALUES

  -- 1 MDF
  ('c0000000-0000-0000-0000-000000000001',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'MDF-001', 'MDF Principal Miami', 'active', 2022,
   'Cuarto de distribución principal. Contiene 2 racks, 2 switches core y 1 UPS.',
   '550e8400-e29b-41d4-a716-446655440101'),

  -- 2 IDF
  ('c0000000-0000-0000-0000-000000000002',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000002',
   'IDF-001', 'IDF Piso 1', 'active', 2022,
   'Cuarto de distribución piso 1. Conectado al MDF por fibra OM4.',
   '550e8400-e29b-41d4-a716-446655440101'),

  ('c0000000-0000-0000-0000-000000000003',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000003',
   'IDF-002', 'IDF Piso 2', 'active', 2022,
   'Cuarto de distribución piso 2. Conectado al MDF por fibra OM4.',
   '550e8400-e29b-41d4-a716-446655440101'),

  -- 2 Racks
  ('c0000000-0000-0000-0000-000000000004',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000003',
   'b0000000-0000-0000-0000-000000000001',
   'RACK-001', 'Rack A1 - MDF Principal', 'active', 2022,
   'Rack principal en MDF. 42U, actualmente 18U ocupados.',
   '550e8400-e29b-41d4-a716-446655440101'),

  ('c0000000-0000-0000-0000-000000000005',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000003',
   'b0000000-0000-0000-0000-000000000001',
   'RACK-002', 'Rack A2 - MDF Principal', 'active', 2022,
   'Rack secundario en MDF. 42U, actualmente 10U ocupados.',
   '550e8400-e29b-41d4-a716-446655440101'),

  -- 2 Switches
  ('c0000000-0000-0000-0000-000000000006',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000004',
   'b0000000-0000-0000-0000-000000000001',
   'SW-001', 'Switch Core 1 - MDF', 'active', 2022,
   'Switch core Cisco Catalyst 9300. 48 puertos GbE + 4 uplinks 10G.',
   '550e8400-e29b-41d4-a716-446655440101'),

  ('c0000000-0000-0000-0000-000000000007',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000004',
   'b0000000-0000-0000-0000-000000000002',
   'SW-002', 'Switch Acceso Piso 1', 'active', 2022,
   'Switch de acceso HP Aruba 2930F. 24 puertos GbE + 4 uplinks SFP.',
   '550e8400-e29b-41d4-a716-446655440101'),

  -- 1 UPS
  ('c0000000-0000-0000-0000-000000000008',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000005',
   'b0000000-0000-0000-0000-000000000001',
   'UPS-001', 'UPS Principal MDF', 'active', 2022,
   'APC Smart-UPS 3000VA. Autonomía estimada 20 minutos a carga completa.',
   '550e8400-e29b-41d4-a716-446655440101'),

  -- 1 Patch Panel
  ('c0000000-0000-0000-0000-000000000009',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000007',
   'b0000000-0000-0000-0000-000000000001',
   'PP-001', 'Patch Panel 24P - Rack A1', 'active', 2022,
   'Patch panel Cat6A 24 puertos. Conectado al switch core 1.',
   '550e8400-e29b-41d4-a716-446655440101'),

  -- 5 Nodos
  ('c0000000-0000-0000-0000-000000000010',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000008',
   'b0000000-0000-0000-0000-000000000002',
   'NODE-001', 'Workstation Recepción', 'active', 2023,
   'PC de recepción. Conectado al switch piso 1, puerto 1.',
   '550e8400-e29b-41d4-a716-446655440101'),

  ('c0000000-0000-0000-0000-000000000011',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000008',
   'b0000000-0000-0000-0000-000000000002',
   'NODE-002', 'Workstation Oficina 101', 'active', 2023,
   'PC oficina 101. Conectado al switch piso 1, puerto 2.',
   '550e8400-e29b-41d4-a716-446655440101'),

  ('c0000000-0000-0000-0000-000000000012',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000008',
   'b0000000-0000-0000-0000-000000000002',
   'NODE-003', 'IP Phone Recepción', 'active', 2023,
   'Teléfono IP Cisco 7941. Conectado al switch piso 1, puerto 3.',
   '550e8400-e29b-41d4-a716-446655440101'),

  ('c0000000-0000-0000-0000-000000000013',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000008',
   'b0000000-0000-0000-0000-000000000003',
   'NODE-004', 'Workstation Oficina 201', 'active', 2023,
   'PC oficina 201. Conectado al IDF piso 2.',
   '550e8400-e29b-41d4-a716-446655440101'),

  ('c0000000-0000-0000-0000-000000000014',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000008',
   'b0000000-0000-0000-0000-000000000003',
   'NODE-005', 'Cámara IP Pasillo 2', 'active', 2023,
   'Cámara IP Hikvision. Conectada al IDF piso 2.',
   '550e8400-e29b-41d4-a716-446655440101'),

  -- 1 Backbone
  ('c0000000-0000-0000-0000-000000000015',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'a0000000-0000-0000-0000-000000000009',
   'b0000000-0000-0000-0000-000000000001',
   'BB-001', 'Backbone MDF → IDF Piso 1', 'active', 2022,
   'Enlace de fibra OM4 multimodo entre MDF y IDF Piso 1. 12 fibras, 45 metros.',
   '550e8400-e29b-41d4-a716-446655440101')

ON CONFLICT (tenant_id, branch_id, internal_code) DO NOTHING;

-- ==========================================
-- Racks (extensión de assets tipo RACK)
-- ==========================================
INSERT INTO racks (id, asset_id, tenant_id, branch_id, total_u, used_u, height_mm, width_mm, depth_mm, power_kw) VALUES
  ('d0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000004',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   42, 18, 2000, 600, 1000, 3.5),
  ('d0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000005',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   42, 10, 2000, 600, 1000, 2.0)
ON CONFLICT DO NOTHING;

-- ==========================================
-- MDF / IDF (extensión)
-- ==========================================
INSERT INTO mdf_idf (id, asset_id, tenant_id, branch_id, type, rack_count, patch_panel_count, switch_count, ups_count) VALUES
  ('e0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'MDF', 2, 1, 2, 1),
  ('e0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000002',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'IDF', 0, 0, 1, 0),
  ('e0000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-000000000003',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'IDF', 0, 0, 0, 0)
ON CONFLICT DO NOTHING;

-- ==========================================
-- Switches (extensión)
-- ==========================================
INSERT INTO switches (id, asset_id, tenant_id, branch_id, rack_id, port_count, uplink_count, management_ip, rack_unit) VALUES
  ('f0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000006',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'd0000000-0000-0000-0000-000000000001',
   48, 4, '10.0.0.1', 1),
  ('f0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000007',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   NULL,
   24, 4, '10.0.0.2', 1)
ON CONFLICT DO NOTHING;

-- ==========================================
-- UPS (extensión)
-- ==========================================
INSERT INTO ups (id, asset_id, tenant_id, branch_id, capacity_kva, battery_runtime_min, management_ip) VALUES
  ('g0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000008',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   3.0, 20, '10.0.0.10')
ON CONFLICT DO NOTHING;

-- ==========================================
-- Patch Panels (extensión)
-- ==========================================
INSERT INTO patch_panels (id, asset_id, tenant_id, branch_id, rack_id, port_count, port_type, rack_unit) VALUES
  ('h0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000009',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'd0000000-0000-0000-0000-000000000001',
   24, 'RJ45', 2)
ON CONFLICT DO NOTHING;

-- ==========================================
-- Backbone Links (extensión)
-- ==========================================
INSERT INTO backbone_links (id, asset_id, tenant_id, branch_id, link_type, origin_id, destination_id, cable_length_m, fiber_count, bandwidth_gbps) VALUES
  ('i0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000015',
   '550e8400-e29b-41d4-a716-446655440001',
   '550e8400-e29b-41d4-a716-446655440201',
   'fiber',
   'c0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000002',
   45.0, 12, 10.0)
ON CONFLICT DO NOTHING;
