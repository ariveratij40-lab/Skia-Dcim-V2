import ActivoWizard, { ActivoWizardData } from '../../components/ActivoWizard';
import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import axios from 'axios';
import {
  Search, Plus, Edit2, Trash2, X,
  Building2, Building, Grid3X3, Network, Zap, Plug,
  LayoutGrid, Monitor, GitBranch, RefreshCw, Filter,
  CheckCircle, AlertCircle, Clock, XCircle, Ban,
  Upload, Download, FileSpreadsheet, ChevronDown,
  ChevronRight, MapPin, Tag, Hash, Calendar, ArrowLeft,
  TrendingUp, Shield,
} from 'lucide-react';
import AppLayout from '../../components/AppLayout';
import ModuleEmptyState from '../../components/ModuleEmptyState';
import { ClearInventoryButton } from '../../components/clear-inventory-button';

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
  // glass card
  gradientFrom: string; gradientTo: string;
  borderColor: string;
  iconRing: string; iconText: string;
  accentBar: string;   // micro-barra de progreso
  trendColor: string;
}

const CATEGORIES: CategoryDef[] = [
  {
    code: 'MDF', label: 'MDF', subtitle: 'Main Distribution Frame',
    icon: <Building2 size={20} strokeWidth={1.8} />,
    gradientFrom: 'from-blue-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-blue-200/70',
    iconRing: 'bg-blue-100 ring-1 ring-blue-200', iconText: 'text-blue-600',
    accentBar: 'bg-blue-400', trendColor: 'text-blue-500',
  },
  {
    code: 'IDF', label: 'IDF', subtitle: 'Intermediate Distribution Frame',
    icon: <Building size={20} strokeWidth={1.8} />,
    gradientFrom: 'from-indigo-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-indigo-200/70',
    iconRing: 'bg-indigo-100 ring-1 ring-indigo-200', iconText: 'text-indigo-600',
    accentBar: 'bg-indigo-400', trendColor: 'text-indigo-500',
  },
  {
    code: 'RACK', label: 'Racks', subtitle: 'Gabinetes y racks',
    icon: <Grid3X3 size={20} strokeWidth={1.8} />,
    gradientFrom: 'from-violet-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-violet-200/70',
    iconRing: 'bg-violet-100 ring-1 ring-violet-200', iconText: 'text-violet-600',
    accentBar: 'bg-violet-400', trendColor: 'text-violet-500',
  },
  {
    code: 'SWITCH', label: 'Switches', subtitle: 'Conmutadores de red',
    icon: <Network size={20} strokeWidth={1.8} />,
    gradientFrom: 'from-cyan-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-cyan-200/70',
    iconRing: 'bg-cyan-100 ring-1 ring-cyan-200', iconText: 'text-cyan-600',
    accentBar: 'bg-cyan-400', trendColor: 'text-cyan-500',
  },
  {
    code: 'BACKBONE', label: 'Backbone', subtitle: 'Cableado troncal',
    icon: <GitBranch size={20} strokeWidth={1.8} />,
    gradientFrom: 'from-teal-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-teal-200/70',
    iconRing: 'bg-teal-100 ring-1 ring-teal-200', iconText: 'text-teal-600',
    accentBar: 'bg-teal-400', trendColor: 'text-teal-500',
  },
  {
    code: 'UPS', label: 'UPS', subtitle: 'Alimentación ininterrumpida',
    icon: <Zap size={20} strokeWidth={1.8} />,
    gradientFrom: 'from-amber-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-amber-200/70',
    iconRing: 'bg-amber-100 ring-1 ring-amber-200', iconText: 'text-amber-600',
    accentBar: 'bg-amber-400', trendColor: 'text-amber-500',
  },
  {
    code: 'PDU', label: 'PDUs', subtitle: 'Distribución de energía',
    icon: <Plug size={20} strokeWidth={1.8} />,
    gradientFrom: 'from-orange-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-orange-200/70',
    iconRing: 'bg-orange-100 ring-1 ring-orange-200', iconText: 'text-orange-600',
    accentBar: 'bg-orange-400', trendColor: 'text-orange-500',
  },
  {
    code: 'PATCH_PANEL', label: 'Patch Panels', subtitle: 'Paneles de conexión',
    icon: <LayoutGrid size={20} strokeWidth={1.8} />,
    gradientFrom: 'from-rose-50/80', gradientTo: 'to-slate-50/60',
    borderColor: 'border-rose-200/70',
    iconRing: 'bg-rose-100 ring-1 ring-rose-200', iconText: 'text-rose-600',
    accentBar: 'bg-rose-400', trendColor: 'text-rose-500',
  },
  {
    code: 'NODE', label: 'Nodos', subtitle: 'Nodos de red y servidores',
    icon: <Monitor size={20} strokeWidth={1.8} />,
    gradientFrom: 'from-slate-50/80', gradientTo: 'to-gray-50/60',
    borderColor: 'border-[#E8EBF4]/70',
    iconRing: 'bg-slate-100 ring-1 ring-[#E8EBF4]', iconText: 'text-slate-600',
    accentBar: 'bg-slate-400', trendColor: 'text-slate-500',
  },
];

// ============================================================
// ESTADOS — colores discretos enterprise
// ============================================================
const STATUS_CONFIG: Record<string, { label: string; pill: string; dot: string; bar: string }> = {
  active:         { label: 'Activo',        pill: 'text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200',  dot: 'bg-emerald-400', bar: 'bg-emerald-400' },
  inactive:       { label: 'Inactivo',      pill: 'text-slate-500 bg-slate-50 ring-1 ring-[#E8EBF4]',        dot: 'bg-slate-400',   bar: 'bg-slate-300' },
  maintenance:    { label: 'Mantenimiento', pill: 'text-amber-700 bg-amber-50 ring-1 ring-amber-200',        dot: 'bg-amber-400',   bar: 'bg-amber-400' },
  retired:        { label: 'Retirado',      pill: 'text-red-600 bg-red-50 ring-1 ring-red-200',              dot: 'bg-red-400',     bar: 'bg-red-400' },
  obsolete:       { label: 'Obsoleto',      pill: 'text-orange-700 bg-orange-50 ring-1 ring-orange-200',     dot: 'bg-orange-400',  bar: 'bg-orange-400' },
  decommissioned: { label: 'Dado de baja',  pill: 'text-slate-500 bg-slate-50 ring-1 ring-[#E8EBF4]',        dot: 'bg-slate-300',   bar: 'bg-slate-300' },
};

const ICON_SMALL: Record<string, React.ReactNode> = {
  MDF: <Building2 size={12} />, IDF: <Building size={12} />, RACK: <Grid3X3 size={12} />,
  SWITCH: <Network size={12} />, UPS: <Zap size={12} />, PDU: <Plug size={12} />,
  PATCH_PANEL: <LayoutGrid size={12} />, NODE: <Monitor size={12} />, BACKBONE: <GitBranch size={12} />,
};

// ============================================================
// TARJETA DE CONTEO — estilo enterprise glass
// ============================================================
interface CountCardProps {
  cat: CategoryDef;
  count: number;
  total: number;
  loading: boolean;
  onClick: () => void;
}

function CountCard({ cat, count, total, loading, onClick }: CountCardProps) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className={`
        group relative w-full text-left rounded-2xl border
        ${cat.borderColor}
        bg-gradient-to-br ${cat.gradientFrom} ${cat.gradientTo}
        backdrop-blur-sm
        shadow-sm hover:shadow-md
        transition-all duration-200
        hover:-translate-y-0.5
        overflow-hidden
      `}
    >
      {/* Brillo sutil en hover */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-100/20 pointer-events-none" />

      <div className="relative p-5">
        {/* Fila superior: ícono + flecha */}
        <div className="flex items-start justify-between mb-4">
          <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${cat.iconRing} ${cat.iconText}`}>
            {cat.icon}
          </div>
          <ChevronRight
            size={14}
            className={`${cat.iconText} opacity-0 group-hover:opacity-70 transition-opacity mt-0.5`}
          />
        </div>

        {/* Número grande */}
        <div className="mb-0.5">
          {loading ? (
            <div className="h-9 w-10 bg-slate-100/80 rounded-lg animate-pulse" />
          ) : (
            <span className="text-4xl font-black text-[#1A1D2E] leading-none tracking-tight tabular-nums">
              {count}
            </span>
          )}
        </div>

        {/* Nombre + subtítulo */}
        <p className="text-sm font-bold text-[#1A1D2E] mt-1">{cat.label}</p>
        <p className="text-[13px] text-[#5C6194] leading-tight mt-0.5 truncate">{cat.subtitle}</p>

        {/* Micro-barra de progreso */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] text-[#5C6194] font-medium uppercase tracking-wider">
              del total
            </span>
            <span className={`text-[12px] font-bold ${cat.trendColor}`}>
              {loading ? '—' : `${pct}%`}
            </span>
          </div>
          <div className="h-1 w-full bg-slate-100/80 rounded-full overflow-hidden">
            {!loading && (
              <div
                className={`h-full rounded-full ${cat.accentBar} transition-all duration-700`}
                style={{ width: `${pct}%` }}
              />
            )}
          </div>
        </div>
      </div>
    </button>
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
}

function AssetCard({ asset, onEdit, onDelete }: AssetCardProps) {
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
      {/* Brillo hover */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-100/25 pointer-events-none" />

      <div className="relative p-4">
        {/* Cabecera */}
        <div className="flex items-start justify-between mb-3">
          <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${cat?.iconRing ?? 'bg-slate-100'} ${cat?.iconText ?? 'text-slate-500'} flex-shrink-0`}>
            {cat?.icon ?? <Monitor size={18} strokeWidth={1.8} />}
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-semibold ${statusCfg.pill}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </div>

        {/* Nombre */}
        <p className="font-bold text-slate-800 text-sm leading-tight line-clamp-2 mb-0.5">{asset.name}</p>
        <p className="text-[13px] font-mono text-blue-500 font-semibold">{asset.internal_code}</p>

        {/* Metadatos */}
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

        {/* Pie: tipo + acciones */}
        <div className="mt-3 pt-3 border-t border-white/60 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-semibold ${cat?.iconRing ?? 'bg-slate-100'} ${cat?.iconText ?? 'text-slate-500'}`}>
            {ICON_SMALL[asset.asset_type_code]}
            {asset.asset_type_name}
          </span>
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
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL CREAR / EDITAR
// ============================================================
interface AssetModalProps {
  asset: Asset | null; assetTypes: AssetType[]; locations: Location[];
  onClose: () => void; onSave: () => void;
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
      if (isEdit) await axios.put(`/api/dcim/assets/${asset.id}`, payload);
      else await axios.post('/api/dcim/assets', payload);
      onSave();
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Error al guardar el activo');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-slate-100/95 backdrop-blur rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto border border-[#E8EBF4]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EBF4]">
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">
              {isEdit ? 'Editar Activo' : 'Nuevo Activo'}
            </h2>
            <p className="text-[13px] text-[#5C6194] mt-0.5">
              {isEdit ? 'Modifica los datos del activo' : 'Registra un nuevo activo en el inventario'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
              <AlertCircle size={14} /> {formError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Tipo de Activo *', span: 1, el: (
                <select required value={form.asset_type_id} onChange={e => setForm(f => ({ ...f, asset_type_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-100">
                  <option value="">Seleccionar tipo...</option>
                  {assetTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )},
              { label: 'Código Interno *', span: 1, el: (
                <input required type="text" placeholder="Ej: SW-001" value={form.internal_code}
                  onChange={e => setForm(f => ({ ...f, internal_code: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none" />
              )},
              { label: 'Nombre *', span: 2, el: (
                <input required type="text" placeholder="Ej: Switch Core MDF Principal" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none" />
              )},
              { label: 'Ubicación', span: 1, el: (
                <select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-100">
                  <option value="">Sin ubicación</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )},
              { label: 'Estado', span: 1, el: (
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-100">
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="maintenance">Mantenimiento</option>
                  <option value="retired">Retirado</option>
                  <option value="obsolete">Obsoleto</option>
                  <option value="decommissioned">Dado de baja</option>
                </select>
              )},
              { label: 'Fabricante', span: 1, el: (
                <input type="text" placeholder="Ej: Cisco" value={form.manufacturer}
                  onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none" />
              )},
              { label: 'Modelo', span: 1, el: (
                <input type="text" placeholder="Ej: Catalyst 9300" value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none" />
              )},
              { label: 'Número de Serie', span: 1, el: (
                <input type="text" placeholder="Ej: FCW2345G001" value={form.serial_number}
                  onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none" />
              )},
              { label: 'Año de Instalación', span: 1, el: (
                <input type="number" min="2000" max="2099" placeholder="Ej: 2023" value={form.install_year}
                  onChange={e => setForm(f => ({ ...f, install_year: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none" />
              )},
              { label: 'RFID Tag', span: 2, el: (
                <input type="text" placeholder="Ej: RFID-A1B2C3D4" value={form.rfid_tag}
                  onChange={e => setForm(f => ({ ...f, rfid_tag: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none" />
              )},
              { label: 'Observaciones', span: 2, el: (
                <textarea rows={3} placeholder="Notas técnicas, estado físico..." value={form.observations}
                  onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
                  className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none resize-none" />
              )},
            ].map(({ label, span, el }, i) => (
              <div key={i} className={span === 2 ? 'col-span-2' : ''}>
                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</label>
                {el}
              </div>
            ))}
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
  const [assets, setAssets]           = useState<Asset[]>([]);
  const [highlightedId, setHighlightedId] = useState<string|null>(null);
  const assetCardRefs = useRef<Record<string,HTMLDivElement|null>>({});
  const didHLAsset = useRef(false);
  const [assetTypes, setAssetTypes]   = useState<AssetType[]>([]);
  const [locations, setLocations]     = useState<Location[]>([]);
  const [counts, setCounts]           = useState<Record<string, number>>({});
  const [totalAssets, setTotalAssets] = useState(0);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [apiError, setApiError]       = useState('');
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]   = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showModal, setShowModal]     = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [showActivoWizard, setShowActivoWizard] = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

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

  // Conteos
  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const res = await axios.get('/api/dcim/assets');
      const all: Asset[] = res.data.assets ?? [];
      setTotalAssets(all.length);
      const c: Record<string, number> = {};
      CATEGORIES.forEach(cat => { c[cat.code] = all.filter(a => a.asset_type_code === cat.code).length; });
      setCounts(c);
    } catch (err: any) {
      if (err.response?.status === 401) { router.push('/login'); return; }
      const c: Record<string, number> = {};
      CATEGORIES.forEach(cat => { c[cat.code] = 0; });
      setCounts(c); setTotalAssets(0);
    } finally { setLoadingCounts(false); }
  }, [router]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  // Activos filtrados
  const loadAssets = useCallback(async () => {
    setLoadingAssets(true); setApiError('');
    try {
      const p = new URLSearchParams();
      if (search)         p.set('search', search);
      if (statusFilter)   p.set('status', statusFilter);
      if (typeFilter)     p.set('type', typeFilter);
      if (activeCategory) p.set('type', activeCategory);
      const res = await axios.get(`/api/dcim/assets?${p.toString()}`);
      setAssets(res.data.assets ?? []);
    } catch (err: any) {
      if (err.response?.status === 401) { router.push('/login'); return; }
      setApiError('No se pudo conectar con el servidor.');
    } finally { setLoadingAssets(false); }
  }, [search, statusFilter, typeFilter, activeCategory, router]);

  const isFilterActive = !!(search || statusFilter || typeFilter || activeCategory);
  useEffect(() => { if (isFilterActive) loadAssets(); }, [isFilterActive, loadAssets]);

  // Scroll + highlight desde búsqueda global
  useEffect(() => {
    if (!highlightCode || didHLAsset.current) return;
    setSearch(highlightCode);
    const t = setTimeout(() => {
      const match = assets.find(a =>
        a.internal_code === highlightCode || a.internal_code.toLowerCase().includes(highlightCode.toLowerCase()) ||
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

  // Exportar CSV
  const handleExportCSV = () => {
    const src = isFilterActive ? assets : [];
    if (!src.length) { alert('Aplica un filtro primero para exportar.'); return; }
    const hdr = ['Código','Nombre','Tipo','Ubicación','Fabricante','Modelo','Serie','Estado','RFID','Año'];
    const rows = src.map(a => [a.internal_code, a.name, a.asset_type_name, a.location_name??'', a.manufacturer??'', a.model??'', a.serial_number??'', STATUS_CONFIG[a.status]?.label??a.status, a.rfid_tag??'', a.install_year??'']);
    const csv = [hdr,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`skia_activos_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url); setExportMenuOpen(false);
  };

  // Exportar Excel
  const handleExportExcel = () => {
    const src = isFilterActive ? assets : [];
    if (!src.length) { alert('Aplica un filtro primero para exportar.'); return; }
    const hdr = ['Código','Nombre','Tipo','Ubicación','Fabricante','Modelo','Serie','Estado','RFID','Año'];
    const rows = src.map(a => [a.internal_code, a.name, a.asset_type_name, a.location_name??'', a.manufacturer??'', a.model??'', a.serial_number??'', STATUS_CONFIG[a.status]?.label??a.status, a.rfid_tag??'', a.install_year??'']);
    const tsv = [hdr,...rows].map(r=>r.join('\t')).join('\n');
    const blob = new Blob([tsv],{type:'application/vnd.ms-excel;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`skia_activos_${new Date().toISOString().slice(0,10)}.xls`; a.click();
    URL.revokeObjectURL(url); setExportMenuOpen(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/dcim/assets/${id}`);
      setDeletingId(null); loadCounts(); if (isFilterActive) loadAssets();
    } catch (err: any) { alert(err.response?.data?.error ?? 'Error al eliminar'); }
  };

  const clearFilters = () => { setSearch(''); setStatusFilter(''); setTypeFilter(''); setActiveCategory(null); };
  const activeCat = CATEGORIES.find(c => c.code === activeCategory);

  return (
    <div className="p-6 min-h-screen" style={{ background: '#EEF0F8' }}>

      {/* ── ENCABEZADO ── */}
      <div className="mb-6">
        <div className="mb-4">
          <h1 className="text-2xl font-black text-[#1A1D2E] tracking-tight">Inventario de Activos</h1>
          <p className="text-sm text-[#5C6194] mt-1 font-medium">
            Gestión visual y operativa de infraestructura física y tecnológica.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Importar */}
          <button className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100/80 border border-[#E8EBF4] rounded-xl hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm backdrop-blur-sm">
            <Upload size={13} /> Importar Inventario
          </button>

          {/* Vaciar Inventario */}
          <ClearInventoryButton />

          {/* Exportar */}
          <div className="relative" ref={exportRef}>
            <button onClick={() => setExportMenuOpen(p => !p)}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100/80 border border-[#E8EBF4] rounded-xl hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm backdrop-blur-sm">
              <Download size={13} /> Exportar
              <ChevronDown size={11} className={`transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {exportMenuOpen && (
              <div className="absolute left-0 top-full mt-1 z-30 bg-slate-100/95 backdrop-blur border border-[#E8EBF4] rounded-xl shadow-xl min-w-[160px] overflow-hidden">
                <button onClick={handleExportCSV} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors font-semibold">
                  <Download size={12} /> Exportar CSV
                </button>
                <button onClick={handleExportExcel} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors font-semibold border-t border-[#E8EBF4]">
                  <FileSpreadsheet size={12} /> Exportar Excel
                </button>
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          {/* Búsqueda */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="Buscar por nombre, código, serie..."
              value={search}
              onChange={e => { setSearch(e.target.value); if (activeCategory) setActiveCategory(null); }}
              className="w-full pl-8 pr-4 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-100/80 backdrop-blur-sm shadow-sm" />
          </div>

          {/* Categoría */}
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setActiveCategory(null); }}
            className="px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-100/80 backdrop-blur-sm shadow-sm font-medium text-slate-600">
            <option value="">Todas las categorías</option>
            {assetTypes.map(t => <option key={t.id} value={t.code}>{t.name}</option>)}
          </select>

          {/* Estado */}
          <div className="relative">
            <Filter size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="pl-7 pr-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-100/80 backdrop-blur-sm appearance-none shadow-sm font-medium text-slate-600">
              <option value="">Todos los estados</option>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
              <option value="maintenance">Mantenimiento</option>
              <option value="obsolete">Obsoleto</option>
              <option value="decommissioned">Dado de baja</option>
            </select>
          </div>

          {/* Recargar */}
          <button onClick={() => { loadCounts(); if (isFilterActive) loadAssets(); }}
            className="p-2 border border-[#E8EBF4] rounded-xl hover:bg-slate-100 bg-slate-100/80 backdrop-blur-sm shadow-sm transition-all" title="Recargar">
            <RefreshCw size={13} className="text-slate-500" />
          </button>

          {/* Nuevo Activo */}
          <button onClick={() => setShowActivoWizard(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm ml-auto">
            <Plus size={13} /> Nuevo Activo
          </button>
        </div>
      </div>

      {/* ── EMPTY STATE ── */}
      {!isFilterActive && !loadingCounts && totalAssets === 0 && (
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
      {/* ── VISTA POR DEFECTO: FICHAS DE CONTEO ── */}
      {!isFilterActive && (loadingCounts || totalAssets > 0) && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">
              Resumen por categoría — haz clic para explorar
            </p>
            <div className="flex items-center gap-1.5 text-[13px] text-[#5C6194] font-medium">
              <TrendingUp size={12} className="text-blue-400" />
              {loadingCounts ? '...' : `${totalAssets} activos registrados`}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {CATEGORIES.map(cat => (
              <CountCard
                key={cat.code}
                cat={cat}
                count={counts[cat.code] ?? 0}
                total={totalAssets}
                loading={loadingCounts}
                onClick={() => setActiveCategory(cat.code)}
              />
            ))}
          </div>
        </>
      )}

      {/* ── VISTA DE RESULTADOS: FICHAS DE ACTIVOS ── */}
      {isFilterActive && (
        <div>
          {/* Barra de contexto */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={clearFilters}
                className="inline-flex items-center gap-1.5 text-xs text-[#5C6194] hover:text-blue-600 transition-colors font-bold">
                <ArrowLeft size={13} /> Volver al resumen
              </button>
              <span className="text-[#5C6194]">/</span>
              <span className="text-xs font-bold text-slate-600">
                {activeCat?.label ?? 'Búsqueda'} — {loadingAssets ? '...' : `${assets.length} resultado${assets.length !== 1 ? 's' : ''}`}
              </span>
            </div>
            {activeCat && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-bold border ${activeCat.borderColor} ${activeCat.iconText} bg-slate-100/80`}>
                {activeCat.icon} {activeCat.label}
              </span>
            )}
          </div>

          {/* Error */}
          {apiError && (
            <div className="flex items-center gap-2 px-4 py-3 mb-4 bg-red-50/80 border border-red-200 rounded-xl text-red-600 text-xs font-medium backdrop-blur-sm">
              <AlertCircle size={13} /> {apiError}
            </div>
          )}

          {/* Grid de fichas */}
          {loadingAssets ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bg-slate-100/80 rounded-2xl border border-[#E8EBF4] p-4 animate-pulse">
                  <div className="flex justify-between mb-3">
                    <div className="w-9 h-9 bg-slate-200 rounded-xl" />
                    <div className="w-16 h-5 bg-slate-200 rounded-full" />
                  </div>
                  <div className="h-3.5 bg-slate-200 rounded mb-1.5" />
                  <div className="h-2.5 bg-slate-100 rounded w-2/3 mb-3" />
                  <div className="h-2 bg-slate-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                <Monitor size={24} className="opacity-40" />
              </div>
              <p className="font-bold text-sm text-[#5C6194]">Sin resultados</p>
              <p className="text-xs mt-1 text-slate-500">Prueba con otros filtros o crea un nuevo activo</p>
              <button onClick={clearFilters} className="mt-4 text-xs text-blue-500 hover:underline font-semibold">
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {assets.map(asset => (
                <div key={asset.id} ref={el=>{ assetCardRefs.current[asset.id]=el as HTMLDivElement|null; }} className={highlightedId===asset.id?'skia-highlight-row rounded-2xl':''} style={highlightedId===asset.id?{borderRadius:'16px'}:{}}>
                  <AssetCard
                    asset={asset}
                    totalInCategory={assets.length}
                    onEdit={a => { setEditingAsset(a); setShowModal(true); }}
                    onDelete={id => setDeletingId(id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL CREAR/EDITAR ── */}
      {showModal && (
        <AssetModal
          asset={editingAsset} assetTypes={assetTypes} locations={locations}
          onClose={() => { setShowModal(false); setEditingAsset(null); }}
          onSave={() => { setShowModal(false); setEditingAsset(null); loadCounts(); if (isFilterActive) loadAssets(); }}
        />
      )}
      {showActivoWizard && (
        <ActivoWizard
          onClose={() => setShowActivoWizard(false)}
          onSave={(_data: ActivoWizardData) => {
            setShowActivoWizard(false);
            loadCounts();
            if (isFilterActive) loadAssets();
          }}
        />
      )}

      {/* ── MODAL CONFIRMAR BORRADO ── */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-slate-100/95 backdrop-blur rounded-2xl shadow-2xl p-6 max-w-sm mx-4 border border-[#E8EBF4]">
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
