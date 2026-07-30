import ActivoWizard from '../../components/ActivoWizard';
import { useCatalogs, OPERATIONAL_STATUS_UI, ASSET_TYPE_UI } from '../../hooks/useCatalogs';
import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import axios from 'axios';
import {
  Search, Plus, Edit2, Trash2, X,
  Building2, Building, Grid3X3, Network, Zap, Plug,
  LayoutGrid, Monitor, GitBranch, RefreshCw, Filter,
  AlertCircle, CheckCircle, BarChart2, TrendingUp,
  Upload, Download, FileSpreadsheet, ChevronDown, ChevronRight,
  MapPin, Tag, Hash, Calendar,
  Shield, List, Activity,
} from 'lucide-react';
import AppLayout from '../../components/AppLayout';
import ModuleEmptyState from '../../components/ModuleEmptyState';
import { ClearInventoryButton } from '../../components/clear-inventory-button';
import { ImportModal } from '../../components/ImportModal';
import RackBuilder from '../../components/RackBuilder';

// ============================================================
// TIPOS
// ============================================================
interface AssetType { id: string; code: string; name: string; description: string; icon: string; }
interface Location   { id: string; name: string; floor: string; room: string; zone: string; }
interface Asset {
  id: string; tenant_id: string; branch_id: string;
  asset_type_id: string; asset_type_code: string; asset_type_name: string;
  location_id: string | null; location_name: string | null;
  internal_code: string; name: string; serial_number: string | null;
  model: string | null; manufacturer: string | null; status: string;
  rfid_tag: string | null; install_year: number | null;
  observations: string | null; created_at: string; updated_at: string;
}

// ============================================================
// PALETA ENTERPRISE — discreta, sin saturación excesiva
// ============================================================
interface CategoryDef {
  code: string; label: string; subtitle: string;
  icon: React.ReactNode;
  gradientFrom: string; gradientTo: string;
  borderColor: string;
  iconRing: string; iconText: string;
  accentBar: string;
  trendColor: string;
  tabAccent: string;   // color del subrayado del tab activo
}

const CATEGORIES: CategoryDef[] = [
  {
    code: 'MDF', label: 'MDF', subtitle: 'Main Distribution Frame',
    icon: <Building2 size={15} strokeWidth={1.8} />,
    gradientFrom: 'from-blue-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-blue-200/70',
    iconRing: 'bg-blue-100 ring-1 ring-blue-200', iconText: 'text-blue-600',
    accentBar: 'bg-blue-400', trendColor: 'text-blue-500',
    tabAccent: '#3B82F6',
  },
  {
    code: 'IDF', label: 'IDF', subtitle: 'Intermediate Distribution Frame',
    icon: <Building size={15} strokeWidth={1.8} />,
    gradientFrom: 'from-indigo-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-indigo-200/70',
    iconRing: 'bg-indigo-100 ring-1 ring-indigo-200', iconText: 'text-indigo-600',
    accentBar: 'bg-indigo-400', trendColor: 'text-indigo-500',
    tabAccent: '#6366F1',
  },
  {
    code: 'RACK', label: 'Racks', subtitle: 'Gabinetes y racks',
    icon: <Grid3X3 size={15} strokeWidth={1.8} />,
    gradientFrom: 'from-violet-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-violet-200/70',
    iconRing: 'bg-violet-100 ring-1 ring-violet-200', iconText: 'text-violet-600',
    accentBar: 'bg-violet-400', trendColor: 'text-violet-500',
    tabAccent: '#8B5CF6',
  },
  {
    code: 'SWITCH', label: 'Switches', subtitle: 'Conmutadores de red',
    icon: <Network size={15} strokeWidth={1.8} />,
    gradientFrom: 'from-cyan-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-cyan-200/70',
    iconRing: 'bg-cyan-100 ring-1 ring-cyan-200', iconText: 'text-cyan-600',
    accentBar: 'bg-cyan-400', trendColor: 'text-cyan-500',
    tabAccent: '#06B6D4',
  },
  {
    code: 'BACKBONE', label: 'Backbone', subtitle: 'Cableado troncal',
    icon: <GitBranch size={15} strokeWidth={1.8} />,
    gradientFrom: 'from-teal-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-teal-200/70',
    iconRing: 'bg-teal-100 ring-1 ring-teal-200', iconText: 'text-teal-600',
    accentBar: 'bg-teal-400', trendColor: 'text-teal-500',
    tabAccent: '#14B8A6',
  },
  {
    code: 'UPS', label: 'UPS', subtitle: 'Alimentación ininterrumpida',
    icon: <Zap size={15} strokeWidth={1.8} />,
    gradientFrom: 'from-amber-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-amber-200/70',
    iconRing: 'bg-amber-100 ring-1 ring-amber-200', iconText: 'text-amber-600',
    accentBar: 'bg-amber-400', trendColor: 'text-amber-500',
    tabAccent: '#F59E0B',
  },
  {
    code: 'PDU', label: 'PDUs', subtitle: 'Distribución de energía',
    icon: <Plug size={15} strokeWidth={1.8} />,
    gradientFrom: 'from-orange-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-orange-200/70',
    iconRing: 'bg-orange-100 ring-1 ring-orange-200', iconText: 'text-orange-600',
    accentBar: 'bg-orange-400', trendColor: 'text-orange-500',
    tabAccent: '#F97316',
  },
  {
    code: 'PATCH_PANEL', label: 'Patch Panels', subtitle: 'Paneles de conexión',
    icon: <LayoutGrid size={15} strokeWidth={1.8} />,
    gradientFrom: 'from-rose-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-rose-200/70',
    iconRing: 'bg-rose-100 ring-1 ring-rose-200', iconText: 'text-rose-600',
    accentBar: 'bg-rose-400', trendColor: 'text-rose-500',
    tabAccent: '#F43F5E',
  },
  {
    code: 'NODE', label: 'Nodos', subtitle: 'Nodos de red y servidores',
    icon: <Monitor size={15} strokeWidth={1.8} />,
    gradientFrom: 'from-slate-50/80', gradientTo: 'to-gray-50/60',
    borderColor: 'border-[#E8EBF4]/70',
    iconRing: 'bg-slate-100 ring-1 ring-[#E8EBF4]', iconText: 'text-slate-600',
    accentBar: 'bg-slate-400', trendColor: 'text-slate-500',
    tabAccent: '#64748B',
  },
];

// ============================================================
// ESTADOS — colores discretos enterprise
// ============================================================
const STATUS_CONFIG = OPERATIONAL_STATUS_UI;

const ICON_SMALL: Record<string, React.ReactNode> = {
  MDF: <Building2 size={12} />, IDF: <Building size={12} />, RACK: <Grid3X3 size={12} />,
  SWITCH: <Network size={12} />, UPS: <Zap size={12} />, PDU: <Plug size={12} />,
  PATCH_PANEL: <LayoutGrid size={12} />, NODE: <Monitor size={12} />, BACKBONE: <GitBranch size={12} />,
};

// ============================================================
// DASHBOARD TAB — resumen por categoría
// ============================================================
interface DashboardTabProps {
  allAssets: Asset[];
  totalAssets: number;
  counts: Record<string, number>;
  loadingAssets: boolean;
  onTabChange: (tab: string) => void;
  onNewAsset: () => void;
}

function DashboardTab({ allAssets, totalAssets, counts, loadingAssets, onTabChange, onNewAsset }: DashboardTabProps) {
  // KPIs globales
  const activeCount    = allAssets.filter(a => a.status === 'active').length;
  const maintCount     = allAssets.filter(a => a.status === 'maintenance').length;
  const inactiveCount  = allAssets.filter(a => a.status === 'inactive').length;
  const obsoleteCount  = allAssets.filter(a => a.status === 'obsolete' || a.status === 'decommissioned').length;
  const activePercent  = totalAssets > 0 ? Math.round((activeCount / totalAssets) * 100) : 0;

  // Distribución por estado para barra global
  const statusBars = [
    { label: 'Activo',       count: activeCount,   color: 'bg-emerald-400', pct: totalAssets > 0 ? (activeCount/totalAssets)*100 : 0 },
    { label: 'Mantenimiento', count: maintCount,   color: 'bg-amber-400',   pct: totalAssets > 0 ? (maintCount/totalAssets)*100 : 0 },
    { label: 'Inactivo',     count: inactiveCount, color: 'bg-slate-300',   pct: totalAssets > 0 ? (inactiveCount/totalAssets)*100 : 0 },
    { label: 'Obsoleto/Baja', count: obsoleteCount, color: 'bg-red-300',   pct: totalAssets > 0 ? (obsoleteCount/totalAssets)*100 : 0 },
  ];

  if (loadingAssets) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#E8EBF4] p-4 animate-pulse">
            <div className="flex justify-between mb-3">
              <div className="w-9 h-9 bg-slate-200 rounded-xl" />
              <div className="w-12 h-5 bg-slate-200 rounded-full" />
            </div>
            <div className="h-7 bg-slate-200 rounded mb-1" />
            <div className="h-2.5 bg-slate-100 rounded w-2/3 mb-3" />
            <div className="h-1.5 bg-slate-200 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (totalAssets === 0) return null;

  return (
    <div className="space-y-6">

      {/* ── KPIs GLOBALES ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Activos',    value: totalAssets,    sub: 'registrados',          icon: <LayoutGrid size={18} />, color: 'from-blue-500 to-indigo-600' },
          { label: 'Operativos',       value: activeCount,    sub: `${activePercent}% del total`, icon: <CheckCircle size={18} />, color: 'from-emerald-500 to-teal-600' },
          { label: 'En Mantenimiento', value: maintCount,     sub: 'requieren atención',   icon: <Activity size={18} />,    color: 'from-amber-500 to-orange-500' },
          { label: 'Inactivos / Baja', value: inactiveCount + obsoleteCount, sub: 'fuera de operación', icon: <AlertCircle size={18} />, color: 'from-rose-400 to-red-500' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#E8EBF4] p-4 shadow-sm">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.color} flex items-center justify-center text-white mb-3`}>
              {kpi.icon}
            </div>
            <div className="text-2xl font-black text-[#1A1D2E]">{kpi.value}</div>
            <div className="text-xs font-bold text-slate-700 mt-0.5">{kpi.label}</div>
            <div className="text-[11px] text-[#5C6194] mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ── BARRA DE DISTRIBUCIÓN GLOBAL ───────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[#E8EBF4] p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[#1A1D2E] flex items-center gap-2">
            <BarChart2 size={14} className="text-blue-500" /> Distribución por estado operacional
          </h3>
          <span className="text-[11px] text-[#5C6194] font-medium">{totalAssets} activos totales</span>
        </div>
        {/* Barra segmentada */}
        <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
          {statusBars.filter(b => b.pct > 0).map((b, i) => (
            <div key={i} className={`${b.color} h-full transition-all`} style={{ width: `${b.pct}%` }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          {statusBars.map((b, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${b.color} flex-shrink-0`} />
              <span className="text-[12px] text-[#5C6194] font-medium">{b.label}</span>
              <span className="text-[12px] font-bold text-[#1A1D2E]">{b.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── CARDS POR CATEGORÍA ────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-bold text-[#1A1D2E] mb-3 flex items-center gap-2">
          <TrendingUp size={14} className="text-indigo-500" /> Inventario por tipo de activo
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {CATEGORIES.map(cat => {
            const total   = counts[cat.code] ?? 0;
            const active  = allAssets.filter(a => a.asset_type_code === cat.code && a.status === 'active').length;
            const maint   = allAssets.filter(a => a.asset_type_code === cat.code && a.status === 'maintenance').length;
            const inactive = allAssets.filter(a => a.asset_type_code === cat.code && (a.status === 'inactive' || a.status === 'obsolete' || a.status === 'decommissioned')).length;
            const activePct = total > 0 ? Math.round((active / total) * 100) : 0;

            return (
              <button
                key={cat.code}
                onClick={() => onTabChange(cat.code)}
                className={`
                  group text-left rounded-2xl border ${cat.borderColor}
                  bg-gradient-to-br ${cat.gradientFrom} ${cat.gradientTo}
                  p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5
                  focus:outline-none
                `}
              >
                {/* Icono + contador */}
                <div className="flex items-start justify-between mb-3">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${cat.iconRing} ${cat.iconText}`}>
                    {cat.icon}
                  </div>
                  <span className="text-2xl font-black text-[#1A1D2E]">{total}</span>
                </div>

                {/* Nombre */}
                <p className="font-bold text-sm text-[#1A1D2E] leading-tight">{cat.label}</p>
                <p className="text-[11px] text-[#5C6194] mt-0.5 leading-tight">{cat.subtitle}</p>

                {/* Barra de activos operativos */}
                <div className="mt-3">
                  <div className="w-full bg-white/60 rounded-full h-1.5">
                    <div
                      className={`${cat.accentBar} h-1.5 rounded-full transition-all`}
                      style={{ width: `${activePct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-[#5C6194]">
                      {total === 0 ? 'Sin activos' : `${active} operativo${active !== 1 ? 's' : ''}`}
                    </span>
                    {total > 0 && (
                      <span className={`text-[11px] font-bold ${cat.trendColor}`}>{activePct}%</span>
                    )}
                  </div>
                </div>

                {/* Mini badges de estado */}
                {total > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/50">
                    {maint > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700">
                        <Activity size={8} /> {maint}
                      </span>
                    )}
                    {inactive > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500">
                        {inactive} inactivo{inactive !== 1 ? 's' : ''}
                      </span>
                    )}
                    {total > 0 && maint === 0 && inactive === 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-600">
                        <CheckCircle size={8} /> Todo operativo
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-[#5C6194] group-hover:text-blue-500 transition-colors flex items-center gap-0.5 font-semibold">
                      Ver <ChevronRight size={9} />
                    </span>
                  </div>
                )}

                {/* CTA cuando no hay activos */}
                {total === 0 && (
                  <div className="mt-2 pt-2 border-t border-white/50">
                    <span className="text-[10px] text-[#5C6194] group-hover:text-blue-500 transition-colors font-semibold">
                      + Registrar primero
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TARJETA DE ACTIVO INDIVIDUAL — estilo enterprise glass
// ============================================================
interface AssetCardProps {
  asset: Asset;
  totalInCategory: number;
  onEdit: (a: Asset) => void;
  onDelete: (id: string) => void;
  onRackBuilder?: (a: Asset) => void;
}

function AssetCard({ asset, onEdit, onDelete, onRackBuilder }: AssetCardProps) {
  const statusCfg = STATUS_CONFIG[asset.status] ?? STATUS_CONFIG.inactive;
  const cat = CATEGORIES.find(c => c.code === asset.asset_type_code);

  return (
    <div
      className={`
        group relative rounded-2xl border ${cat?.borderColor ?? 'border-[#E8EBF4]/70'}
        bg-gradient-to-br ${cat?.gradientFrom ?? 'from-slate-50/80'} ${cat?.gradientTo ?? 'to-gray-50/60'}
        backdrop-blur-sm shadow-sm hover:shadow-md
        transition-all duration-200 hover:-translate-y-0.5
        overflow-hidden
      `}
    >
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-100/25 pointer-events-none" />
      <div className="relative p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${cat?.iconRing ?? 'bg-slate-100'} ${cat?.iconText ?? 'text-slate-500'} flex-shrink-0`}>
            {cat?.icon ?? <Monitor size={18} strokeWidth={1.8} />}
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-semibold ${statusCfg.pill}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </div>
        <p className="font-bold text-slate-800 text-sm leading-tight line-clamp-2 mb-0.5">{asset.name}</p>
        <p className="text-[13px] font-mono text-blue-500 font-semibold">{asset.internal_code}</p>
        <div className="mt-3 space-y-1.5">
          {(asset.manufacturer || asset.model) && (
            <div className="flex items-center gap-1.5 text-[13px] text-[#5C6194]">
              <Tag size={10} className="flex-shrink-0 text-slate-500" />
              <span className="truncate">{[asset.manufacturer, asset.model].filter(Boolean).join(' · ')}</span>
            </div>
          )}
          {asset.location_name && (
            <div className="flex items-center gap-1.5 text-[13px] text-[#5C6194]">
              <MapPin size={10} className="flex-shrink-0 text-slate-500" />
              <span className="truncate">{asset.location_name}</span>
            </div>
          )}
          {asset.serial_number && (
            <div className="flex items-center gap-1.5 text-[13px] text-[#5C6194]">
              <Hash size={10} className="flex-shrink-0 text-slate-500" />
              <span className="truncate font-mono">{asset.serial_number}</span>
            </div>
          )}
          {asset.install_year && (
            <div className="flex items-center gap-1.5 text-[13px] text-[#5C6194]">
              <Calendar size={10} className="flex-shrink-0 text-slate-500" />
              <span>{asset.install_year}</span>
            </div>
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-white/60 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-semibold ${cat?.iconRing ?? 'bg-slate-100'} ${cat?.iconText ?? 'text-slate-500'}`}>
            {ICON_SMALL[asset.asset_type_code]}
            {asset.asset_type_name}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onRackBuilder && ['RACK','MDF','IDF','MDF_IDF'].includes(asset.asset_type_code) && (
              <button onClick={() => onRackBuilder(asset)}
                className="p-1.5 rounded-lg hover:bg-violet-100/80 text-violet-500 transition-colors" title="Rack Builder">
                <LayoutGrid size={12} />
              </button>
            )}
            <button onClick={() => onEdit(asset)}
              className="p-1.5 rounded-lg hover:bg-blue-100/80 text-blue-500 transition-colors" title="Editar">
              <Edit2 size={12} />
            </button>
            <button onClick={() => onDelete(asset.id)}
              className="p-1.5 rounded-lg hover:bg-red-100/80 text-red-400 transition-colors" title="Eliminar">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FILA DE ACTIVO — vista lista
// ============================================================
function AssetRow({ asset, onEdit, onDelete }: AssetCardProps) {
  const statusCfg = STATUS_CONFIG[asset.status] ?? STATUS_CONFIG.inactive;
  const cat = CATEGORIES.find(c => c.code === asset.asset_type_code);

  return (
    <tr className="group border-b border-[#E8EBF4]/60 hover:bg-blue-50/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-xl ${cat?.iconRing ?? 'bg-slate-100'} ${cat?.iconText ?? 'text-slate-500'} flex-shrink-0`}>
            {cat?.icon ?? <Monitor size={14} strokeWidth={1.8} />}
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm leading-tight">{asset.name}</p>
            <p className="text-[12px] font-mono text-blue-500 font-semibold">{asset.internal_code}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-[13px] text-[#5C6194]">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-semibold ${cat?.iconRing ?? 'bg-slate-100'} ${cat?.iconText ?? 'text-slate-500'}`}>
          {ICON_SMALL[asset.asset_type_code]}
          {asset.asset_type_name}
        </span>
      </td>
      <td className="px-4 py-3 text-[13px] text-[#5C6194]">
        {[asset.manufacturer, asset.model].filter(Boolean).join(' · ') || '—'}
      </td>
      <td className="px-4 py-3 text-[13px] text-[#5C6194]">
        {asset.location_name ?? '—'}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-semibold ${statusCfg.pill}`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
          {statusCfg.label}
        </span>
      </td>
      <td className="px-4 py-3 text-[13px] text-[#5C6194] font-mono">
        {asset.serial_number ?? '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(asset)}
            className="p-1.5 rounded-lg hover:bg-blue-100/80 text-blue-500 transition-colors" title="Editar">
            <Edit2 size={12} />
          </button>
          <button onClick={() => onDelete(asset.id)}
            className="p-1.5 rounded-lg hover:bg-red-100/80 text-red-400 transition-colors" title="Eliminar">
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ============================================================
// MODAL CREAR / EDITAR
// ============================================================
interface AssetModalProps {
  asset: Asset | null; assetTypes: AssetType[]; locations: Location[];
  onClose: () => void; onSave: (assetTypeCode?: string) => void;
}

function AssetModal({ asset, assetTypes, locations, onClose, onSave }: AssetModalProps) {
  const isEdit = !!asset;
  const [form, setForm] = useState({
    asset_type_id: asset?.asset_type_id ?? '', location_id: asset?.location_id ?? '',
    internal_code: asset?.internal_code ?? '', name: asset?.name ?? '',
    serial_number: asset?.serial_number ?? '', model: asset?.model ?? '',
    manufacturer: asset?.manufacturer ?? '', status: asset?.status ?? 'active',
    rfid_tag: asset?.rfid_tag ?? '', install_year: asset?.install_year?.toString() ?? '',
    observations: asset?.observations ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true);
    try {
      const payload = {
        asset_type_id: form.asset_type_id, location_id: form.location_id || null,
        internal_code: form.internal_code, name: form.name,
        serial_number: form.serial_number || null, model: form.model || null,
        manufacturer: form.manufacturer || null, status: form.status,
        rfid_tag: form.rfid_tag || null,
        install_year: form.install_year ? parseInt(form.install_year) : null,
        observations: form.observations || null,
      };
      if (isEdit) {
        await axios.put(`/api/dcim/assets/${asset!.id}`, payload);
      } else {
        await axios.post('/api/dcim/assets', payload);
      }
      const selectedType = assetTypes.find(t => t.id === form.asset_type_id);
      onSave(selectedType?.code);
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  const field = (label: string, key: keyof typeof form, type = 'text', opts?: { required?: boolean }) => (
    <div>
      <label className="block text-[12px] font-bold text-slate-600 mb-1">{label}{opts?.required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type} value={form[key] as string}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        required={opts?.required}
        className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-50 transition-colors" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-slate-100/95 backdrop-blur rounded-2xl shadow-2xl w-full max-w-2xl border border-[#E8EBF4] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EBF4]">
          <h2 className="font-black text-slate-800 text-base">{isEdit ? 'Editar Activo' : 'Nuevo Activo'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs">
              <AlertCircle size={13} /> {formError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-bold text-slate-600 mb-1">Tipo de Activo <span className="text-red-400">*</span></label>
              <select value={form.asset_type_id} onChange={e => setForm(p => ({ ...p, asset_type_id: e.target.value }))} required
                className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-50">
                <option value="">Seleccionar tipo...</option>
                {assetTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-slate-600 mb-1">Ubicación</label>
              <select value={form.location_id} onChange={e => setForm(p => ({ ...p, location_id: e.target.value }))}
                className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-50">
                <option value="">Sin ubicación</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.room ? ` — ${l.room}` : ''}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('Código Interno', 'internal_code', 'text', { required: true })}
            {field('Nombre Descriptivo', 'name', 'text', { required: true })}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('Fabricante', 'manufacturer')}
            {field('Modelo', 'model')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('No. de Serie', 'serial_number')}
            {field('Etiqueta RFID', 'rfid_tag')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-bold text-slate-600 mb-1">Estado</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-50">
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="maintenance">Mantenimiento</option>
                <option value="obsolete">Obsoleto</option>
                <option value="decommissioned">Dado de baja</option>
              </select>
            </div>
            {field('Año de Instalación', 'install_year', 'number')}
          </div>
          <div>
            <label className="block text-[12px] font-bold text-slate-600 mb-1">Observaciones</label>
            <textarea value={form.observations} onChange={e => setForm(p => ({ ...p, observations: e.target.value }))} rows={3}
              className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-50 resize-none" />
          </div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E8EBF4]">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-500 border border-[#E8EBF4] rounded-xl hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Activo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// CONTENIDO PRINCIPAL
// ============================================================
function AssetsContent() {
  const router = useRouter();
  const highlightCode = typeof router.query.highlight === 'string' ? decodeURIComponent(router.query.highlight) : undefined;

  // Estado de datos
  const [allAssets, setAllAssets]       = useState<Asset[]>([]);
  const [assets, setAssets]             = useState<Asset[]>([]);
  const [highlightedId, setHighlightedId] = useState<string|null>(null);
  const assetCardRefs = useRef<Record<string,HTMLDivElement|null>>({});
  const didHLAsset = useRef(false);
  const [assetTypes, setAssetTypes]     = useState<AssetType[]>([]);
  const [locations, setLocations]       = useState<Location[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [apiError, setApiError]         = useState('');

  // Estado de UI
  const [activeTab, setActiveTab]       = useState<string>('dashboard');  // 'dashboard' | código de categoría
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode]         = useState<'cards' | 'list'>('cards');
  const [showModal, setShowModal]       = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [showActivoWizard, setShowActivoWizard] = useState(false);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRackBuilder, setShowRackBuilder] = useState(false);
  const [rackBuilderAsset, setRackBuilderAsset] = useState<Asset | null>(null);
  const [rackBuilderRackId, setRackBuilderRackId] = useState<string>('');
  const exportRef = useRef<HTMLDivElement>(null);

  // Abrir Rack Builder: busca el rack_id real del activo
  const openRackBuilder = useCallback(async (asset: Asset) => {
    // Si es un RACK, buscar su rack_id real en /api/infra/racks
    try {
      const res = await axios.get('/api/infra/racks');
      const racks: Array<{id: string; code: string; height_u: number}> = res.data ?? [];
      // Buscar el rack cuyo asset_id coincide con el activo (por código)
      const match = racks.find((r: any) => r.code === asset.internal_code || r.id === asset.id);
      if (match) {
        setRackBuilderRackId(match.id);
        setRackBuilderAsset(asset);
        setShowRackBuilder(true);
        return;
      }
    } catch {}
    // Fallback: usar el asset.id directamente
    setRackBuilderRackId(asset.id);
    setRackBuilderAsset(asset);
    setShowRackBuilder(true);
  }, []);

  // Cerrar dropdown exportar
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Catálogos
  useEffect(() => {
    const load = async () => {
      try {
        const [t, l] = await Promise.all([axios.get('/api/dcim/asset-types'), axios.get('/api/dcim/locations')]);
        setAssetTypes(t.data.asset_types ?? []);
        setLocations(l.data.locations ?? []);
      } catch {}
    };
    load();
  }, []);

  // Cargar todos los activos
  const loadAssets = useCallback(async () => {
    setLoadingAssets(true); setApiError('');
    try {
      const res = await axios.get('/api/dcim/assets');
      setAllAssets(res.data.assets ?? []);
    } catch (err: any) {
      if (err.response?.status === 401) { router.push('/login'); return; }
      setApiError('No se pudo conectar con el servidor.');
    } finally { setLoadingAssets(false); }
  }, [router]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  // Filtrar activos según tab activo + búsqueda + estado
  useEffect(() => {
    let filtered = [...allAssets];

    // Filtro por tab (tipo de activo)
    if (activeTab !== 'general') {
      filtered = filtered.filter(a => a.asset_type_code === activeTab);
    }

    // Filtro por búsqueda
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.internal_code.toLowerCase().includes(q) ||
        (a.serial_number ?? '').toLowerCase().includes(q) ||
        (a.manufacturer ?? '').toLowerCase().includes(q) ||
        (a.model ?? '').toLowerCase().includes(q)
      );
    }

    // Filtro por estado
    if (statusFilter) {
      filtered = filtered.filter(a => a.status === statusFilter);
    }

    setAssets(filtered);
  }, [allAssets, activeTab, search, statusFilter]);

  // Scroll + highlight desde búsqueda global
  useEffect(() => {
    if (!highlightCode || didHLAsset.current) return;
    setSearch(highlightCode);
    const t = setTimeout(() => {
      const match = assets.find(a =>
        a.internal_code === highlightCode ||
        a.internal_code.toLowerCase().includes(highlightCode.toLowerCase()) ||
        a.name.toLowerCase().includes(highlightCode.toLowerCase())
      );
      if (!match) return;
      setHighlightedId(match.id);
      didHLAsset.current = true;
      const el = assetCardRefs.current[match.id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        setHighlightedId(null);
        const { highlight: _h, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
      }, 2500);
    }, 600);
    return () => clearTimeout(t);
  }, [highlightCode, assets]);

  // Conteos por categoría
  const counts: Record<string, number> = {};
  CATEGORIES.forEach(cat => {
    counts[cat.code] = allAssets.filter(a => a.asset_type_code === cat.code).length;
  });
  const totalAssets = allAssets.length;

  // Exportar CSV
  const getExportData = () => {
    // Si estamos en Dashboard, exportar todos los activos; si no, los del tab activo
    return activeTab === 'dashboard' ? allAssets : assets;
  };

  const getExportFilename = (ext: string) => {
    const tabSuffix = activeTab === 'dashboard' ? 'todos' : activeTab.toLowerCase();
    return `skia_activos_${tabSuffix}_${new Date().toISOString().slice(0,10)}.${ext}`;
  };

  const handleExportCSV = () => {
    const data = getExportData();
    if (!data.length) { alert('No hay activos para exportar en la vista actual.'); return; }
    const hdr = ['Código','Nombre','Tipo','Ubicación','Fabricante','Modelo','Serie','Estado','RFID','Año','Observaciones'];
    const rows = data.map(a => [
      a.internal_code, a.name, a.asset_type_name,
      a.location_name??'', a.manufacturer??'', a.model??'',
      a.serial_number??'', STATUS_CONFIG[a.status]?.label??a.status,
      a.rfid_tag??'', a.install_year??'', a.observations??''
    ]);
    const csv = [hdr,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=getExportFilename('csv'); a.click();
    URL.revokeObjectURL(url); setExportMenuOpen(false);
  };

  const handleExportExcel = () => {
    const data = getExportData();
    if (!data.length) { alert('No hay activos para exportar en la vista actual.'); return; }
    const hdr = ['Código','Nombre','Tipo','Ubicación','Fabricante','Modelo','Serie','Estado','RFID','Año','Observaciones'];
    const rows = data.map(a => [
      a.internal_code, a.name, a.asset_type_name,
      a.location_name??'', a.manufacturer??'', a.model??'',
      a.serial_number??'', STATUS_CONFIG[a.status]?.label??a.status,
      a.rfid_tag??'', a.install_year??'', a.observations??''
    ]);
    const tsv = [hdr,...rows].map(r=>r.join('\t')).join('\n');
    const blob = new Blob([tsv],{type:'application/vnd.ms-excel;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=getExportFilename('xls'); a.click();
    URL.revokeObjectURL(url); setExportMenuOpen(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/dcim/assets/${id}`);
      setDeletingId(null); loadAssets();
    } catch (err: any) { alert(err.response?.data?.error ?? 'Error al eliminar'); }
  };

  const clearFilters = () => { setSearch(''); setStatusFilter(''); };
  const hasFilters = !!(search || statusFilter);

  const activeCat = CATEGORIES.find(c => c.code === activeTab);
  const tabLabel = activeTab === 'dashboard' ? 'Dashboard' : (activeCat?.label ?? activeTab);

  // ── TABS ──────────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={14} />, count: totalAssets, accent: '#4361EE' },
    ...CATEGORIES.map(cat => ({
      id: cat.code,
      label: cat.label,
      icon: cat.icon,
      count: counts[cat.code] ?? 0,
      accent: cat.tabAccent,
    })),
  ];

  return (
    <div className="min-h-screen" style={{ background: '#EEF0F8' }}>

      {/* ── HEADER FIJO ──────────────────────────────────────────────────────── */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-[#E8EBF4] sticky top-0 z-20">
        {/* Título + acciones */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#E8EBF4]/60">
          <div>
            <h1 className="text-xl font-black text-[#1A1D2E] tracking-tight">Inventario de Activos</h1>
            <p className="text-[12px] text-[#5C6194] font-medium">
              Gestión visual y operativa de infraestructura física y tecnológica.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Importar */}
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100/80 border border-[#E8EBF4] rounded-xl hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm">
              <Upload size={12} /> Importar
            </button>

            {/* Vaciar */}
            <ClearInventoryButton />

            {/* Exportar */}
            <div className="relative" ref={exportRef}>
              <button onClick={() => setExportMenuOpen(p => !p)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100/80 border border-[#E8EBF4] rounded-xl hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm">
                <Download size={12} /> Exportar
                <ChevronDown size={10} className={`transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {exportMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-white backdrop-blur border border-[#E8EBF4] rounded-xl shadow-xl min-w-[160px] overflow-hidden">
                  <button onClick={handleExportCSV} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors font-semibold">
                    <Download size={12} /> Exportar CSV
                  </button>
                  <button onClick={handleExportExcel} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors font-semibold border-t border-[#E8EBF4]">
                    <FileSpreadsheet size={12} /> Exportar Excel
                  </button>
                </div>
              )}
            </div>

            {/* Nuevo Activo */}
            <button onClick={() => setShowActivoWizard(true)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#4361EE] text-white text-xs font-bold rounded-xl hover:bg-[#3451D1] transition-colors shadow-sm">
              <Plus size={13} /> Nuevo Activo
            </button>
          </div>
        </div>

        {/* ── BARRA DE TABS ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-0 px-4 overflow-x-auto scrollbar-hide">
          {tabs.map(tab => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  relative flex items-center gap-1.5 px-4 py-3 text-[13px] font-semibold
                  whitespace-nowrap transition-all duration-150 flex-shrink-0
                  ${isActive
                    ? 'text-[#1A1D2E]'
                    : 'text-[#5C6194] hover:text-[#1A1D2E] hover:bg-slate-50/60'
                  }
                `}
                style={{ borderBottom: isActive ? `2.5px solid ${tab.accent}` : '2.5px solid transparent' }}
              >
                <span className={isActive ? 'opacity-100' : 'opacity-60'} style={isActive ? { color: tab.accent } : {}}>
                  {tab.icon}
                </span>
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="ml-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold"
                    style={isActive
                      ? { background: tab.accent + '20', color: tab.accent }
                      : { background: '#E8EBF4', color: '#5C6194' }
                    }
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

        {/* ── CONTENIDO DEL TAB ────────────────────────────────────────────────── */}
      <div className="p-6">

        {/* ── TAB DASHBOARD ──────────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <DashboardTab
            allAssets={allAssets}
            totalAssets={totalAssets}
            counts={counts}
            loadingAssets={loadingAssets}
            onTabChange={setActiveTab}
            onNewAsset={() => setShowActivoWizard(true)}
          />
        )}

        {/* ── TABS DE TIPO (inventario filtrado) ─────────────────────────────── */}
        {activeTab !== 'dashboard' && (
        <>
        {/* Sub-header con título del tab + contador + controles */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-black text-[#1A1D2E]">
              {tabLabel}
            </h2>
            <p className="text-[12px] text-[#5C6194] font-medium mt-0.5">
              {loadingAssets ? 'Cargando...' : `${assets.length} ${assets.length === 1 ? 'activo registrado' : 'activos registrados'}`}
              {activeCat && <span className="ml-1 text-[#5C6194]">— {activeCat.subtitle}</span>}
            </p>
          </div>

          {/* Controles de vista */}
          <div className="flex items-center gap-2">
            {/* Toggle Lista / Tarjetas */}
            <div className="flex items-center bg-slate-100/80 border border-[#E8EBF4] rounded-xl p-0.5 gap-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'list'
                    ? 'bg-white shadow-sm text-[#4361EE] border border-[#E8EBF4]'
                    : 'text-[#5C6194] hover:text-slate-700'
                }`}
              >
                <List size={13} /> Lista
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'cards'
                    ? 'bg-white shadow-sm text-[#4361EE] border border-[#E8EBF4]'
                    : 'text-[#5C6194] hover:text-slate-700'
                }`}
              >
                <LayoutGrid size={13} /> Tarjetas
              </button>
            </div>
          </div>
        </div>

        {/* ── BARRA DE BÚSQUEDA + FILTROS ──────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-5">
          {/* Búsqueda prominente */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Buscar en ${tabLabel.toLowerCase()} por nombre, código, serie, fabricante...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-[#E8EBF4] rounded-xl text-sm focus:border-[#4361EE] focus:outline-none bg-white shadow-sm transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filtro estado */}
          <div className="relative">
            <Filter size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="pl-7 pr-8 py-2.5 border border-[#E8EBF4] rounded-xl text-sm focus:border-[#4361EE] focus:outline-none bg-white shadow-sm appearance-none font-medium text-slate-600"
            >
              <option value="">Todos los estados</option>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
              <option value="maintenance">Mantenimiento</option>
              <option value="obsolete">Obsoleto</option>
              <option value="decommissioned">Dado de baja</option>
            </select>
          </div>

          {/* Recargar */}
          <button
            onClick={loadAssets}
            className="p-2.5 border border-[#E8EBF4] rounded-xl hover:bg-slate-50 bg-white shadow-sm transition-all"
            title="Actualizar"
          >
            <RefreshCw size={14} className="text-slate-500" />
          </button>

          {/* Limpiar filtros */}
          {hasFilters && (
            <button onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-slate-500 border border-[#E8EBF4] rounded-xl hover:bg-slate-50 bg-white shadow-sm transition-all">
              <X size={11} /> Limpiar
            </button>
          )}
        </div>

        {/* ── ERROR ────────────────────────────────────────────────────────── */}
        {apiError && activeTab !== 'dashboard' && (
          <div className="flex items-center gap-2 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-medium">
            <AlertCircle size={13} /> {apiError}
          </div>
        )}

        {/* ── EMPTY STATE ──────────────────────────────────────────────────── */}
        {!loadingAssets && totalAssets === 0 && activeTab !== 'dashboard' && (
          <ModuleEmptyState
            icon={<Monitor size={36} className="text-blue-600" />}
            title="Sin activos registrados"
            description="Los activos son el corazón de tu inventario DCIM. Registra cada equipo — servidores, switches, cámaras, puntos de acceso y más — con su ubicación, estado y memoria técnica completa."
            features={[
              { icon: <Monitor size={14}/>, text: 'Inventario por tipo: servidores, redes, seguridad' },
              { icon: <MapPin size={14}/>, text: 'Ubicación física y referencia en plano' },
              { icon: <Tag size={14}/>, text: 'Etiquetado RFID y código único' },
              { icon: <Shield size={14}/>, text: 'Memoria técnica y documentación adjunta' },
            ]}
            wizardLabel="Registrar primer Activo"
            onOpenWizard={() => setShowActivoWizard(true)}
            accentColor="blue"
          />
        )}

        {/* ── LOADING ──────────────────────────────────────────────────────── */}
        {loadingAssets && activeTab !== 'dashboard' && (
          <div className={viewMode === 'cards'
            ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
            : 'space-y-2'
          }>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#E8EBF4] p-4 animate-pulse">
                <div className="flex justify-between mb-3">
                  <div className="w-9 h-9 bg-slate-200 rounded-xl" />
                  <div className="w-16 h-5 bg-slate-200 rounded-full" />
                </div>
                <div className="h-3.5 bg-slate-200 rounded mb-1.5" />
                <div className="h-2.5 bg-slate-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* ── VISTA TARJETAS ───────────────────────────────────────────────── */}
        {!loadingAssets && totalAssets > 0 && viewMode === 'cards' && activeTab !== 'dashboard' && (
          <>
            {assets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                  <Monitor size={24} className="opacity-40" />
                </div>
                <p className="font-bold text-sm text-[#5C6194]">Sin resultados</p>
                <p className="text-xs mt-1 text-slate-500">Prueba con otros filtros</p>
                {hasFilters && (
                  <button onClick={clearFilters} className="mt-4 text-xs text-blue-500 hover:underline font-semibold">
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {assets.map(asset => (
                  <div
                    key={asset.id}
                    ref={el => { assetCardRefs.current[asset.id] = el as HTMLDivElement | null; }}
                    className={highlightedId === asset.id ? 'skia-highlight-row rounded-2xl' : ''}
                  >
                    <AssetCard
                      asset={asset}
                      totalInCategory={assets.length}
                      onEdit={a => { setEditingAsset(a); setShowModal(true); }}
                      onDelete={id => setDeletingId(id)}
                      onRackBuilder={openRackBuilder}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── VISTA LISTA ──────────────────────────────────────────────────── */}
        {!loadingAssets && totalAssets > 0 && viewMode === 'list' && activeTab !== 'dashboard' && (
          <>
            {assets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                  <Monitor size={24} className="opacity-40" />
                </div>
                <p className="font-bold text-sm text-[#5C6194]">Sin resultados</p>
                <p className="text-xs mt-1 text-slate-500">Prueba con otros filtros</p>
                {hasFilters && (
                  <button onClick={clearFilters} className="mt-4 text-xs text-blue-500 hover:underline font-semibold">
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#E8EBF4] shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E8EBF4] bg-slate-50/60">
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-[#5C6194] uppercase tracking-wider">Activo</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-[#5C6194] uppercase tracking-wider">Tipo</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-[#5C6194] uppercase tracking-wider">Fabricante / Modelo</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-[#5C6194] uppercase tracking-wider">Ubicación</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-[#5C6194] uppercase tracking-wider">Estado</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-[#5C6194] uppercase tracking-wider">Serie</th>
                      <th className="px-4 py-3 text-left text-[11px] font-bold text-[#5C6194] uppercase tracking-wider w-16">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map(asset => (
                      <AssetRow
                        key={asset.id}
                        asset={asset}
                        totalInCategory={assets.length}
                        onEdit={a => { setEditingAsset(a); setShowModal(true); }}
                        onDelete={id => setDeletingId(id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        </>
        )}
      </div>
      {/* ── MODAL CREAR/EDITAR ─────────────────────────────────────────────── */}
      {showModal && (
        <AssetModal
          asset={editingAsset} assetTypes={assetTypes} locations={locations}
          onClose={() => { setShowModal(false); setEditingAsset(null); }}
          onSave={(assetTypeCode?: string) => {
            setShowModal(false); setEditingAsset(null);
            loadAssets();
            if (assetTypeCode && !editingAsset) {
              setActiveTab(assetTypeCode);
            }
          }}
        />
      )}

      {showActivoWizard && (
        <ActivoWizard
          onClose={() => setShowActivoWizard(false)}
          onSave={(internalCode: string, assetTypeCode?: string) => {
            setShowActivoWizard(false);
            loadAssets();
            if (assetTypeCode) {
              setActiveTab(assetTypeCode);
            } else if (internalCode) {
              setSearch(internalCode);
            }
          }}
        />
      )}

      {/* ── MODAL CONFIRMAR BORRADO ────────────────────────────────────────── */}
      {/* ── MODAL IMPORTAR ────────────────────────────────────────────────── */}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { loadAssets(); }}
        />
      )}

      {/* ── RACK BUILDER ────────────────────────────────────────────────── */}
      {showRackBuilder && rackBuilderAsset && (
        <RackBuilder
          rackId={rackBuilderRackId}
          rackCode={rackBuilderAsset.internal_code}
          totalU={42}
          mdfIdfId={rackBuilderAsset.id}
          onClose={() => { setShowRackBuilder(false); setRackBuilderAsset(null); }}
          onSaved={() => { setShowRackBuilder(false); setRackBuilderAsset(null); loadAssets(); }}
        />
      )}

      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white backdrop-blur rounded-2xl shadow-2xl p-6 max-w-sm mx-4 border border-[#E8EBF4]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-red-50 rounded-xl border border-red-100">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Eliminar Activo</p>
                <p className="text-[13px] text-[#5C6194]">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <p className="text-xs text-[#5C6194] mb-5">¿Confirmas que deseas eliminar este activo del inventario?</p>
            <div className="flex gap-2">
              <button onClick={() => setDeletingId(null)}
                className="flex-1 px-4 py-2 text-xs font-bold text-slate-500 border border-[#E8EBF4] rounded-xl hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={() => handleDelete(deletingId)}
                className="flex-1 px-4 py-2 text-xs font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PÁGINA CON APPLAYOUT
// ============================================================
export default function AssetsPage() {
  return (
    <>
      <Head><title>Activos — SKIA DCIM Platform</title></Head>
      <AppLayout breadcrumb={[{ label: 'Infraestructura', path: '/dashboard' }, { label: 'Activos' }]}>
        <AssetsContent />
      </AppLayout>
    </>
  );
}
