-- ============================================================
-- Migración 015: Campos genéricos de personalización en naming_rules
-- Permite al cliente agregar hasta 2 segmentos libres en el
-- código generado automáticamente para cada tipo de activo.
--
-- Ejemplo de código resultante con ambos segmentos activos:
--   SW-CDMX-NORTE-0001
--   ^   ^     ^    ^
--   |   |     |    +-- Consecutivo (seq_digits)
--   |   |     +------- custom_segment_2 (ej. zona/área)
--   |   +------------- custom_segment_1 (ej. ciudad/sitio)
--   +----------------- prefix
-- ============================================================

-- Agregar los dos campos genéricos
ALTER TABLE naming_rules
  ADD COLUMN IF NOT EXISTS custom_segment_1       VARCHAR(30)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_segment_2       VARCHAR(30)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_segment_1_label VARCHAR(50)  DEFAULT 'Segmento 1',
  ADD COLUMN IF NOT EXISTS custom_segment_2_label VARCHAR(50)  DEFAULT 'Segmento 2';

-- Comentarios descriptivos
COMMENT ON COLUMN naming_rules.custom_segment_1 IS
  'Segmento libre 1 que se inserta entre el prefijo y el consecutivo. Ej: ciudad, sitio, región.';
COMMENT ON COLUMN naming_rules.custom_segment_2 IS
  'Segmento libre 2 que se inserta entre custom_segment_1 y el consecutivo. Ej: zona, área, edificio.';
COMMENT ON COLUMN naming_rules.custom_segment_1_label IS
  'Etiqueta descriptiva para el segmento 1 (mostrada en el formulario del cliente).';
COMMENT ON COLUMN naming_rules.custom_segment_2_label IS
  'Etiqueta descriptiva para el segmento 2 (mostrada en el formulario del cliente).';
