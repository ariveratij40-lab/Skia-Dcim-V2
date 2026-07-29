/**
 * useCatalogs — Single Source of Truth del frontend (INV-DCM-0014)
 *
 * Consume /api/dcim/catalogs una sola vez y provee:
 *   - assetTypes: lista de tipos con UUID real de la BD
 *   - manufacturers: fabricantes del tenant
 *   - providers: proveedores del tenant
 *   - operationalStatuses: estados operativos canónicos
 *   - inventoryStatuses: estados de inventario canónicos
 *   - statusLabel: función de traducción status_code → etiqueta en español
 *   - statusConfig: configuración visual (colores) por status_code
 *
 * Uso:
 *   const { assetTypes, statusLabel, loading } = useCatalogs();
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ── Tipos exportados ────────────────────────────────────────────────────────

export interface AssetType {
  id: string;
  code: string;
  name: string;
  description?: string;
  icon?: string;
}

export interface Manufacturer {
  id: string;
  name: string;
  status: string;
}

export interface Provider {
  id: string;
  provider_type: string;
  legal_name: string;
  trade_name: string;
  status: string;
}

export interface CatalogsData {
  assetTypes: AssetType[];
  manufacturers: Manufacturer[];
  providers: Provider[];
  operationalStatuses: string[];
  inventoryStatuses: string[];
}

// ── Diccionario de UI (local, no viene del backend) ─────────────────────────
// Los íconos y colores son responsabilidad del frontend.
// El backend solo provee códigos canónicos.

export const ASSET_TYPE_UI: Record<string, { label: string; icon: string; color: string }> = {
  MDF:         { label: 'MDF',         icon: 'Building2', color: '#3B82F6' },
  IDF:         { label: 'IDF',         icon: 'Building',  color: '#6366F1' },
  RACK:        { label: 'Rack',        icon: 'Grid3X3',   color: '#8B5CF6' },
  SWITCH:      { label: 'Switch',      icon: 'Network',   color: '#06B6D4' },
  BACKBONE:    { label: 'Backbone',    icon: 'GitBranch', color: '#14B8A6' },
  UPS:         { label: 'UPS',         icon: 'Zap',       color: '#F59E0B' },
  PDU:         { label: 'PDU',         icon: 'Plug',      color: '#F97316' },
  PATCH_PANEL: { label: 'Patch Panel', icon: 'LayoutGrid',color: '#F43F5E' },
  NODE:        { label: 'Nodo',        icon: 'Monitor',   color: '#64748B' },
  CCTV:        { label: 'Cámara',      icon: 'Camera',    color: '#EC4899' },
  SERVER:      { label: 'Servidor',    icon: 'Server',    color: '#10B981' },
  FIREWALL:    { label: 'Firewall',    icon: 'Shield',    color: '#EF4444' },
  AC_UNIT:     { label: 'A/C',         icon: 'Wind',      color: '#0EA5E9' },
};

// ── Diccionario de estados operativos (local, no viene del backend) ──────────

export const OPERATIONAL_STATUS_UI: Record<string, {
  label: string;
  pill: string;
  dot: string;
  bar: string;
}> = {
  active:         { label: 'Activo',        pill: 'text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200',  dot: 'bg-emerald-400', bar: 'bg-emerald-400' },
  inactive:       { label: 'Inactivo',      pill: 'text-slate-500 bg-slate-50 ring-1 ring-[#E8EBF4]',        dot: 'bg-slate-400',   bar: 'bg-slate-300' },
  maintenance:    { label: 'Mantenimiento', pill: 'text-amber-700 bg-amber-50 ring-1 ring-amber-200',        dot: 'bg-amber-400',   bar: 'bg-amber-400' },
  decommissioned: { label: 'Dado de baja',  pill: 'text-slate-500 bg-slate-50 ring-1 ring-[#E8EBF4]',        dot: 'bg-slate-300',   bar: 'bg-slate-300' },
  unknown:        { label: 'Desconocido',   pill: 'text-gray-500 bg-gray-50 ring-1 ring-gray-200',           dot: 'bg-gray-400',    bar: 'bg-gray-300' },
  // Alias legacy (el backend ya no los emite, pero pueden existir en datos viejos)
  retired:        { label: 'Retirado',      pill: 'text-red-600 bg-red-50 ring-1 ring-red-200',              dot: 'bg-red-400',     bar: 'bg-red-400' },
  obsolete:       { label: 'Obsoleto',      pill: 'text-orange-700 bg-orange-50 ring-1 ring-orange-200',     dot: 'bg-orange-400',  bar: 'bg-orange-400' },
};

export const INVENTORY_STATUS_UI: Record<string, { label: string }> = {
  planned:   { label: 'Planificado' },
  ordered:   { label: 'Pedido' },
  received:  { label: 'Recibido' },
  inventory: { label: 'En inventario' },
  installed: { label: 'Instalado' },
  retired:   { label: 'Retirado' },
};

// ── Hook ─────────────────────────────────────────────────────────────────────

const EMPTY_CATALOGS: CatalogsData = {
  assetTypes: [],
  manufacturers: [],
  providers: [],
  operationalStatuses: ['active', 'inactive', 'maintenance', 'decommissioned', 'unknown'],
  inventoryStatuses: ['planned', 'ordered', 'received', 'inventory', 'installed', 'retired'],
};

export function useCatalogs() {
  const [catalogs, setCatalogs] = useState<CatalogsData>(EMPTY_CATALOGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/dcim/catalogs');
      const d = res.data;
      setCatalogs({
        assetTypes:          d.asset_types          ?? [],
        manufacturers:       d.manufacturers        ?? [],
        providers:           d.providers            ?? [],
        operationalStatuses: d.operational_statuses ?? EMPTY_CATALOGS.operationalStatuses,
        inventoryStatuses:   d.inventory_statuses   ?? EMPTY_CATALOGS.inventoryStatuses,
      });
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Error cargando catálogos');
      // Mantener los valores por defecto para no bloquear la UI
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Función de traducción: status_code → etiqueta en español
  const statusLabel = (code: string): string =>
    OPERATIONAL_STATUS_UI[code]?.label ?? code;

  // Función de traducción: asset_type_code → label UI
  const typeLabel = (code: string): string =>
    ASSET_TYPE_UI[code]?.label ?? code;

  // Obtener AssetType por código (para el wizard)
  const getAssetTypeByCode = (code: string): AssetType | undefined =>
    catalogs.assetTypes.find(t => t.code === code);

  // Obtener AssetType por UUID (para el modal de edición)
  const getAssetTypeById = (id: string): AssetType | undefined =>
    catalogs.assetTypes.find(t => t.id === id);

  return {
    ...catalogs,
    loading,
    error,
    reload: load,
    statusLabel,
    typeLabel,
    getAssetTypeByCode,
    getAssetTypeById,
  };
}
