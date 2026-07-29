-- =============================================================================
-- Migración 014 — DCIM Assets Phase 1 (Seed)
-- Pobla asset_types con los 13 tipos canónicos del dominio DCIM.
-- Estos IDs son fijos (no dependen de ningún tenant) — son datos de referencia
-- globales del sistema, no datos de cliente.
-- =============================================================================

-- =============================================================================
-- BLOQUE 1: 13 Asset Types canónicos
-- Los 9 originales de la migración 005 + 4 nuevos para CCTV, AC, FIREWALL, SERVER
-- Se usan ON CONFLICT (code) DO UPDATE para ser idempotente.
-- =============================================================================

INSERT INTO asset_types (id, code, name, description, icon) VALUES
  -- Tipos originales (migración 005, IDs fijos preservados)
  ('a0000000-0000-0000-0000-000000000001', 'MDF',         'Main Distribution Frame',
   'Cuarto de distribución principal de cableado estructurado', 'Building2'),
  ('a0000000-0000-0000-0000-000000000002', 'IDF',         'Intermediate Distribution Frame',
   'Cuarto de distribución intermedio de cableado estructurado', 'Building'),
  ('a0000000-0000-0000-0000-000000000003', 'RACK',        'Rack de Equipos',
   'Rack de montaje para equipos de red y telecomunicaciones', 'Grid3x3'),
  ('a0000000-0000-0000-0000-000000000004', 'SWITCH',      'Switch de Red',
   'Switch de capa 2 o capa 3 para conmutación de red', 'Network'),
  ('a0000000-0000-0000-0000-000000000005', 'UPS',         'Sistema de Alimentación Ininterrumpida',
   'UPS para protección eléctrica de equipos críticos', 'Zap'),
  ('a0000000-0000-0000-0000-000000000006', 'PDU',         'Unidad de Distribución de Energía',
   'PDU para distribución de energía dentro de rack', 'Plug'),
  ('a0000000-0000-0000-0000-000000000007', 'PATCH_PANEL', 'Patch Panel',
   'Panel de parcheo de cableado estructurado', 'LayoutGrid'),
  ('a0000000-0000-0000-0000-000000000008', 'NODE',        'Nodo de Red',
   'Dispositivo terminal de red (PC, impresora, teléfono IP, etc.)', 'Monitor'),
  ('a0000000-0000-0000-0000-000000000009', 'BACKBONE',    'Enlace Backbone',
   'Enlace de backbone entre MDFs e IDFs (fibra óptica o cobre)', 'GitBranch'),
  -- Tipos nuevos (Fase 1)
  ('a0000000-0000-0000-0000-000000000010', 'FIREWALL',    'Firewall',
   'Dispositivo de seguridad perimetral de red', 'Shield'),
  ('a0000000-0000-0000-0000-000000000011', 'SERVER',      'Servidor',
   'Servidor físico de cómputo o almacenamiento', 'Server'),
  ('a0000000-0000-0000-0000-000000000012', 'CCTV',        'Cámara CCTV',
   'Cámara de videovigilancia analógica o IP', 'Camera'),
  ('a0000000-0000-0000-0000-000000000013', 'AC_UNIT',     'Unidad de Aire Acondicionado',
   'Unidad de climatización para cuartos técnicos y data centers', 'Wind')
ON CONFLICT (code) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  updated_at  = NOW();

-- =============================================================================
-- BLOQUE 2: Reglas de nomenclatura por defecto (globales, sin tenant_id)
-- Se crean como plantillas globales (tenant_id = NULL no es posible por FK).
-- En su lugar, se insertan por cada tenant existente usando un DO $$ loop.
-- La regla se aplica: [PREFIX][SEP][BRANCH_CODE][SEP][SEQ_PADDED]
-- Ejemplo: SW-TIJ-0001, RK-MTY-0003, UPS-GDL-0002
-- =============================================================================

-- Insertar reglas de nomenclatura para todos los tenants existentes
-- ON CONFLICT DO NOTHING para ser idempotente
DO $$
DECLARE
  t_id UUID;
BEGIN
  FOR t_id IN SELECT id FROM tenants LOOP
    INSERT INTO naming_rules
      (tenant_id, asset_type_code, prefix, separator, include_branch, include_location, seq_digits, reset_per_location, last_seq)
    VALUES
      (t_id, 'MDF',         'MDF',  '-', TRUE, FALSE, 4, FALSE, 0),
      (t_id, 'IDF',         'IDF',  '-', TRUE, FALSE, 4, FALSE, 0),
      (t_id, 'RACK',        'RK',   '-', TRUE, FALSE, 4, FALSE, 0),
      (t_id, 'SWITCH',      'SW',   '-', TRUE, FALSE, 4, FALSE, 0),
      (t_id, 'UPS',         'UPS',  '-', TRUE, FALSE, 4, FALSE, 0),
      (t_id, 'PDU',         'PDU',  '-', TRUE, FALSE, 4, FALSE, 0),
      (t_id, 'PATCH_PANEL', 'PP',   '-', TRUE, FALSE, 4, FALSE, 0),
      (t_id, 'NODE',        'ND',   '-', TRUE, FALSE, 4, FALSE, 0),
      (t_id, 'BACKBONE',    'BB',   '-', TRUE, FALSE, 4, FALSE, 0),
      (t_id, 'FIREWALL',    'FW',   '-', TRUE, FALSE, 4, FALSE, 0),
      (t_id, 'SERVER',      'SRV',  '-', TRUE, FALSE, 4, FALSE, 0),
      (t_id, 'CCTV',        'CAM',  '-', TRUE, FALSE, 4, FALSE, 0),
      (t_id, 'AC_UNIT',     'AC',   '-', TRUE, FALSE, 4, FALSE, 0)
    ON CONFLICT (tenant_id, asset_type_code) DO NOTHING;
  END LOOP;
END $$;
