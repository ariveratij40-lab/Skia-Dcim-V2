-- ============================================================
-- MIGRACIÓN: 009_add_unique_branches_constraint.sql
-- DESCRIPCIÓN: Agregar restricción UNIQUE(id, tenant_id) en branches
-- VERSIÓN: 1.0
-- FECHA: 2026-07-24
-- ============================================================

BEGIN;

-- PASO 1: Crear restricción UNIQUE(id, tenant_id)
-- Esta restricción es CRÍTICA para permitir FK compuesta desde inventory_imports
ALTER TABLE branches
ADD CONSTRAINT uq_branches_id_tenant UNIQUE (id, tenant_id);

COMMIT;

-- ============================================================
-- FIN DE MIGRACIÓN
-- ============================================================
