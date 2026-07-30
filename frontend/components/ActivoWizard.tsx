/**
 * ActivoWizard — Wizard de 5 pasos para crear activos polimórficos (Fase 2 rev.2)
 *
 * Correcciones respecto a rev.1:
 *   - Bug 1: Los enlaces "Dar de alta fabricantes/proveedores" ya NO navegan fuera.
 *     Ahora abren un mini-modal inline (QuickCreateModal) dentro del propio Wizard,
 *     sin perder el estado del formulario. Al guardar, refresca el catálogo y
 *     selecciona automáticamente el nuevo registro.
 *   - Bug 2: El campo Nombre descriptivo ahora valida contra la nomenclatura estándar.
 *     Si el usuario escribe algo que no coincide con el patrón esperado, muestra
 *     un aviso amarillo no bloqueante. El campo sigue siendo editable libremente.
 */

import { useState, useEffect, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Package, Tag, MapPin, DollarSign, Shield, Plus, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { useCatalogs, ASSET_TYPE_UI, OPERATIONAL_STATUS_UI } from '../hooks/useCatalogs';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface TechnicalData {
  total_u?: number;
  height_mm?: number;
  width_mm?: number;
  depth_mm?: number;
  power_kw?: number;
  port_count?: number;
  uplink_count?: number;
  management_ip?: string;
  rack_unit?: number;
  capacity_kva?: number;
  battery_runtime_min?: number;
  mdf_type?: string;
  rack_count?: number;
  patch_panel_count?: number;
  switch_count?: number;
  ups_count?: number;
}

interface WizardForm {
  asset_type_id: string;
  asset_type_code: string;
  name: string;
  status: string;
  serial_number: string;
  manufacturer_id: string;
  model: string;
  location_id: string;
  install_year: string;
  observations: string;
  rfid_tag: string;
  supplier: string;
  invoice_no: string;
  cost_usd: string;
  purchase_date: string;
  warranty_expiry: string;
  cost_center: string;
  responsible: string;
  technical: TechnicalData;
}

interface Props {
  onClose: () => void;
  onSave: (internalCode: string, assetTypeCode?: string) => void;
  initial?: Partial<WizardForm>;
}

// ── Mini-modal de alta rápida (fabricante o proveedor) ───────────────────────

interface QuickCreateField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
  options?: { value: string; label: string }[];
}

interface QuickCreateModalProps {
  title: string;
  fields: QuickCreateField[];
  onSave: (data: Record<string, string>) => Promise<void>;
  onClose: () => void;
}

function QuickCreateModal({ title, fields, onSave, onClose }: QuickCreateModalProps) {
  const [data, setData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(data);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setError(axErr.response?.data?.error ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const requiredFilled = fields.filter(f => f.required).every(f => (data[f.key] ?? '').trim() !== '');

  return (
    /* Overlay sobre el Wizard — z-index mayor */
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(15,23,42,0.22)', padding: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Campos */}
        {fields.map((f, i) => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', marginBottom: 4, display: 'block' }}>
              {f.label}{f.required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
            </label>
            {f.options ? (
              <select
                value={data[f.key] ?? ''}
                onChange={e => setData(d => ({ ...d, [f.key]: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E8EBF4', fontSize: '0.85rem', background: '#FAFBFF', color: '#1E293B' }}
              >
                <option value="">Seleccionar...</option>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                ref={i === 0 ? firstRef : undefined}
                type={f.type ?? 'text'}
                placeholder={f.placeholder}
                value={data[f.key] ?? ''}
                onChange={e => setData(d => ({ ...d, [f.key]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && requiredFilled) handleSubmit(); }}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #E8EBF4', fontSize: '0.85rem', background: '#FAFBFF', color: '#1E293B', boxSizing: 'border-box', outline: 'none' }}
                onFocus={e => (e.target.style.borderColor = '#4361EE')}
                onBlur={e => (e.target.style.borderColor = '#E8EBF4')}
              />
            )}
          </div>
        ))}

        {error && (
          <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: '0.78rem', color: '#DC2626', marginBottom: 12 }}>
            ⚠ {error}
          </div>
        )}

        {/* Botones */}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1.5px solid #E8EBF4', background: '#F8FAFF', color: '#64748B', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!requiredFilled || saving}
            style={{ flex: 2, padding: '9px 0', borderRadius: 9, border: 'none', background: requiredFilled && !saving ? '#4361EE' : '#CBD5E1', color: '#fff', fontSize: '0.85rem', cursor: requiredFilled && !saving ? 'pointer' : 'not-allowed', fontWeight: 600 }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Constantes ───────────────────────────────────────────────────────────────

const STAGES = [
  { id: 1, label: 'Alta rápida', icon: Package,    desc: 'Tipo y estado' },
  { id: 2, label: 'Técnico',     icon: Tag,        desc: 'Especificaciones' },
  { id: 3, label: 'Ubicación',   icon: MapPin,     desc: 'Localización física' },
  { id: 4, label: 'Financiero',  icon: DollarSign, desc: 'Costos y garantía' },
  { id: 5, label: 'Resumen',     icon: Shield,     desc: 'Confirmar y guardar' },
];

const EMPTY: WizardForm = {
  asset_type_id: '', asset_type_code: '',
  name: '', status: 'active',
  serial_number: '', manufacturer_id: '', model: '',
  location_id: '', install_year: String(new Date().getFullYear()),
  observations: '', rfid_tag: '',
  supplier: '', invoice_no: '', cost_usd: '',
  purchase_date: '', warranty_expiry: '',
  cost_center: '', responsible: '',
  technical: {},
};

const PROVIDER_TYPES = [
  { value: 'integrator',   label: 'Integrador' },
  { value: 'distributor',  label: 'Distribuidor' },
  { value: 'contractor',   label: 'Contratista' },
  { value: 'consultant',   label: 'Consultor' },
  { value: 'manufacturer', label: 'Fabricante directo' },
  { value: 'other',        label: 'Otro' },
];

// ── Componente principal ─────────────────────────────────────────────────────

export default function ActivoWizard({ onClose, onSave, initial }: Props) {
  const { assetTypes, manufacturers, providers, loading: catalogsLoading, reload: reloadCatalogs } = useCatalogs();
  const [stage, setStage] = useState(1);
  const [form, setForm] = useState<WizardForm>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Estado para modelos dinámicos ─────────────────────────────────────────
  const [models, setModels] = useState<{ id: string; name: string; part_number: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [newModelPN, setNewModelPN] = useState('');
  const [addingModel, setAddingModel] = useState(false);

  // ── Estado para nomenclatura de ejemplo ──────────────────────────────────
  const [namingExample, setNamingExample] = useState<string | null>(null);
  const [namingPattern, setNamingPattern] = useState<RegExp | null>(null);
  const [nameWarning, setNameWarning] = useState(false);

  // ── Estado para mini-modales de alta rápida ───────────────────────────────
  type QuickCreateType = 'manufacturer' | 'provider' | null;
  const [quickCreate, setQuickCreate] = useState<QuickCreateType>(null);

  const set = (field: keyof WizardForm, value: unknown) =>
    setForm(f => ({ ...f, [field]: value }));

  const setTech = (k: keyof TechnicalData, v: unknown) =>
    setForm(f => ({ ...f, technical: { ...f.technical, [k]: v } }));

  // Cargar modelos cuando cambia el fabricante
  useEffect(() => {
    if (!form.manufacturer_id) { setModels([]); setShowAddModel(false); return; }
    setModelsLoading(true);
    axios.get(`/api/dcim/catalogs/models?manufacturer_id=${form.manufacturer_id}`)
      .then(r => setModels(r.data?.models ?? []))
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
  }, [form.manufacturer_id]);

  // Cargar ejemplo de nomenclatura cuando cambia el tipo de activo
  useEffect(() => {
    if (!form.asset_type_code) { setNamingExample(null); setNamingPattern(null); return; }
    axios.get('/api/dcim/catalogs/naming-rules')
      .then(r => {
        const rules: {
          asset_type_code: string;
          prefix: string;
          separator: string;
          sequential_digits: number;
          custom_segment_1?: string;
          custom_segment_2?: string;
        }[] = r.data?.naming_rules ?? [];
        const rule = rules.find(nr => nr.asset_type_code === form.asset_type_code);
        if (!rule) { setNamingExample(null); setNamingPattern(null); return; }
        const sep = rule.separator || '-';
        const escapedSep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = [rule.prefix];
        if (rule.custom_segment_1) parts.push(rule.custom_segment_1);
        if (rule.custom_segment_2) parts.push(rule.custom_segment_2);
        const digits = rule.sequential_digits || 4;
        parts.push('0001'.padStart(digits, '0'));
        setNamingExample(parts.join(sep));
        // Construir patrón de validación: PREFIX[-SEG1][-SEG2]-NNNN
        const patternParts = [rule.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')];
        if (rule.custom_segment_1) patternParts.push(rule.custom_segment_1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (rule.custom_segment_2) patternParts.push(rule.custom_segment_2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        patternParts.push(`\\d{${digits}}`);
        setNamingPattern(new RegExp(`^${patternParts.join(escapedSep)}`, 'i'));
      })
      .catch(() => { setNamingExample(null); setNamingPattern(null); });
  }, [form.asset_type_code]);

  // Validar nombre contra patrón de nomenclatura
  useEffect(() => {
    if (!namingPattern || !form.name) { setNameWarning(false); return; }
    setNameWarning(!namingPattern.test(form.name));
  }, [form.name, namingPattern]);

  // Alta inline de modelo
  const handleAddModel = async () => {
    if (!newModelName.trim() || !form.manufacturer_id) return;
    setAddingModel(true);
    try {
      const res = await axios.post('/api/dcim/catalogs/models', {
        manufacturer_id: form.manufacturer_id,
        name: newModelName.trim(),
        part_number: newModelPN.trim(),
      });
      const created = { id: res.data.id, name: newModelName.trim(), part_number: newModelPN.trim() };
      setModels(prev => [...prev, created]);
      set('model', created.name);
      setNewModelName('');
      setNewModelPN('');
      setShowAddModel(false);
    } catch { /* silencioso */ }
    finally { setAddingModel(false); }
  };

  // Alta rápida de fabricante (desde mini-modal inline)
  const handleQuickCreateManufacturer = async (data: Record<string, string>) => {
    const res = await axios.post('/api/dcim/catalogs/manufacturers', {
      name: data.name,
      country: data.country || null,
      contact: data.contact || null,
      website: data.website || null,
    });
    const newId: string = res.data.id;
    await reloadCatalogs();
    set('manufacturer_id', newId);
    set('model', '');
    setQuickCreate(null);
  };

  // Alta rápida de proveedor (desde mini-modal inline)
  const handleQuickCreateProvider = async (data: Record<string, string>) => {
    const res = await axios.post('/api/dcim/catalogs/providers', {
      provider_type: data.provider_type || 'integrator',
      legal_name: data.legal_name,
      trade_name: data.trade_name || null,
      contact_name: data.contact_name || null,
      email: data.email || null,
      phone: data.phone || null,
    });
    const newId: string = res.data.id;
    await reloadCatalogs();
    set('supplier', newId);
    setQuickCreate(null);
  };

  // Etapas completadas
  const completedStages = (): number[] => {
    const c: number[] = [];
    if (form.asset_type_id && form.name && form.status) c.push(1);
    if (form.manufacturer_id || form.model) c.push(2);
    if (form.location_id) c.push(3);
    if (form.supplier) c.push(4);
    return c;
  };

  // ── Paso 2: Especificaciones técnicas dinámicas por tipo ──────────────────

  const renderTechnicalFields = () => {
    const code = form.asset_type_code;

    const numInp = (label: string, k: keyof TechnicalData, placeholder = '') => (
      <div key={k} style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', marginBottom: 4, display: 'block' }}>{label}</label>
        <input
          type="number"
          placeholder={placeholder}
          value={(form.technical[k] as number | undefined) ?? ''}
          onChange={e => setTech(k, e.target.value ? Number(e.target.value) : undefined)}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', outline: 'none', background: '#FAFBFF', color: '#1E293B' }}
        />
      </div>
    );

    const txtInp = (label: string, k: keyof TechnicalData, placeholder = '') => (
      <div key={k} style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', marginBottom: 4, display: 'block' }}>{label}</label>
        <input
          type="text"
          placeholder={placeholder}
          value={(form.technical[k] as string | undefined) ?? ''}
          onChange={e => setTech(k, e.target.value || undefined)}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', outline: 'none', background: '#FAFBFF', color: '#1E293B' }}
        />
      </div>
    );

    switch (code) {
      case 'RACK':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {numInp('Unidades totales (U) *', 'total_u', '42')}
            {numInp('Potencia máx (kW)', 'power_kw', '5.0')}
            {numInp('Alto (mm)', 'height_mm', '2000')}
            {numInp('Ancho (mm)', 'width_mm', '600')}
            {numInp('Profundidad (mm)', 'depth_mm', '1000')}
          </div>
        );
      case 'SWITCH':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {numInp('Puertos *', 'port_count', '24')}
            {numInp('Uplinks', 'uplink_count', '2')}
            {txtInp('IP de gestión', 'management_ip', '192.168.1.1')}
            {numInp('Unidad en rack (U)', 'rack_unit', '1')}
          </div>
        );
      case 'UPS':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {numInp('Capacidad (kVA)', 'capacity_kva', '3.0')}
            {numInp('Autonomía batería (min)', 'battery_runtime_min', '30')}
          </div>
        );
      case 'MDF':
      case 'IDF':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', marginBottom: 4, display: 'block' }}>Tipo</label>
              <select
                value={form.technical.mdf_type ?? code}
                onChange={e => setTech('mdf_type', e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}
              >
                <option value="MDF">MDF</option>
                <option value="IDF">IDF</option>
              </select>
            </div>
            {numInp('Racks', 'rack_count', '2')}
            {numInp('Patch Panels', 'patch_panel_count', '4')}
            {numInp('Switches', 'switch_count', '2')}
            {numInp('UPS', 'ups_count', '1')}
          </div>
        );
      default:
        return (
          <p style={{ fontSize: '0.85rem', color: '#94A3B8', fontStyle: 'italic' }}>
            No hay especificaciones técnicas adicionales para este tipo de activo.
          </p>
        );
    }
  };

  // ── handleSave ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.asset_type_id || !form.name) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        asset_type_id:   form.asset_type_id,
        name:            form.name,
        status:          form.status,
        serial_number:   form.serial_number || null,
        manufacturer_id: form.manufacturer_id || null,
        model:           form.model || null,
        location_id:     form.location_id || null,
        install_year:    form.install_year ? parseInt(form.install_year) : null,
        observations:    form.observations || null,
        rfid_tag:        form.rfid_tag || null,
        cost_usd:        form.cost_usd ? parseFloat(form.cost_usd) : null,
        purchase_date:   form.purchase_date || null,
        warranty_expiry: form.warranty_expiry || null,
        technical:       form.technical,
      };
      const res = await axios.post('/api/dcim/assets', payload);
      const internalCode: string = res.data?.internal_code ?? '';
      onSave(internalCode, form.asset_type_code);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setSaveError(axErr.response?.data?.error ?? 'Error al guardar el activo');
    } finally {
      setSaving(false);
    }
  };

  // ── Helpers de render ─────────────────────────────────────────────────────

  const inp = (field: keyof WizardForm, placeholder: string, type = 'text') => (
    <input
      type={type}
      placeholder={placeholder}
      value={(form[field] as string) ?? ''}
      onChange={e => set(field, e.target.value)}
      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', outline: 'none', background: '#FAFBFF', color: '#1E293B', transition: 'border-color 150ms' }}
      onFocus={e => (e.target.style.borderColor = '#4361EE')}
      onBlur={e => (e.target.style.borderColor = '#E8EBF4')}
    />
  );

  const lbl = (text: string, req = false) => (
    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', marginBottom: 4, display: 'block' }}>
      {text}{req && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
    </label>
  );

  const fld = (label: string, children: React.ReactNode, req = false) => (
    <div style={{ marginBottom: 14 }}>{lbl(label, req)}{children}</div>
  );

  // Botón de alta rápida inline (no navega, abre mini-modal)
  const quickAddBtn = (type: QuickCreateType, label: string) => (
    <button
      type="button"
      onClick={() => setQuickCreate(type)}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '0 10px', borderRadius: 9, height: 40,
        border: '1.5px solid #4361EE', background: '#EEF2FF',
        color: '#4361EE', fontSize: '0.78rem', fontWeight: 700,
        cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      <Plus size={13} /> Nuevo
    </button>
  );

  const selectedType = assetTypes.find(t => t.id === form.asset_type_id);
  const typeUI = selectedType ? ASSET_TYPE_UI[selectedType.code] : null;
  const completed = completedStages();

  // ── Render por etapa ──────────────────────────────────────────────────────

  const renderStage = () => {
    switch (stage) {
      // Etapa 1: Tipo + Identidad básica
      case 1: return (
        <div>
          {catalogsLoading ? (
            <p style={{ fontSize: '0.85rem', color: '#94A3B8', fontStyle: 'italic' }}>Cargando catálogos...</p>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                {lbl('Tipo de activo', true)}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {assetTypes.map(t => {
                    const ui = ASSET_TYPE_UI[t.code];
                    const active = form.asset_type_id === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setForm(f => ({ ...f, asset_type_id: t.id, asset_type_code: t.code }))}
                        style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 500,
                          border: `1.5px solid ${active ? '#4361EE' : '#E8EBF4'}`,
                          background: active ? '#EEF2FF' : '#F8FAFF',
                          color: active ? '#4361EE' : '#64748B', cursor: 'pointer', transition: 'all 120ms',
                        }}
                      >
                        {ui?.label ?? t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Nombre descriptivo con validación de nomenclatura */}
                <div style={{ gridColumn: '1/-1', marginBottom: 14 }}>
                  {lbl('Nombre descriptivo', true)}
                  <input
                    type="text"
                    placeholder={namingExample
                      ? `Ej. ${namingExample} — Switch Core MDF Principal`
                      : 'Switch Core MDF Principal'}
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10,
                      border: `1.5px solid ${nameWarning && form.name ? '#F59E0B' : '#E8EBF4'}`,
                      fontSize: '0.875rem', outline: 'none', background: '#FAFBFF',
                      color: '#1E293B', transition: 'border-color 150ms', boxSizing: 'border-box',
                    }}
                    onFocus={e => (e.target.style.borderColor = nameWarning && form.name ? '#F59E0B' : '#4361EE')}
                    onBlur={e => (e.target.style.borderColor = nameWarning && form.name ? '#F59E0B' : '#E8EBF4')}
                  />

                  {/* Ejemplo de nomenclatura */}
                  {namingExample && (
                    <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#64748B', flexWrap: 'wrap' }}>
                      <span>Nomenclatura estándar:</span>
                      <code style={{ background: '#EEF2FF', color: '#4361EE', padding: '2px 8px', borderRadius: 6, fontWeight: 700, letterSpacing: '0.03em' }}>
                        {namingExample}
                      </code>
                      <a
                        href="/infraestructura/catalogs/nomenclaturas"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#4361EE', textDecoration: 'underline', marginLeft: 2 }}
                      >
                        Editar regla →
                      </a>
                    </div>
                  )}

                  {/* Aviso de nomenclatura no estándar */}
                  {nameWarning && form.name && (
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 6, padding: '7px 10px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: '0.75rem', color: '#92400E' }}>
                      <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>
                        El nombre no sigue la nomenclatura estándar{namingExample ? ` (${namingExample})` : ''}. Puedes continuar, pero se recomienda usar el formato definido para mantener la consistencia del inventario.
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  {lbl('Estado', true)}
                  <select
                    value={form.status}
                    onChange={e => set('status', e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}
                  >
                    {Object.entries(OPERATIONAL_STATUS_UI).slice(0, 5).map(([code, cfg]) => (
                      <option key={code} value={code}>{cfg.label}</option>
                    ))}
                  </select>
                </div>
                <div>{fld('Responsable', inp('responsible', 'Ing. Carlos Méndez'))}</div>
                <div>{fld('Año de instalación', inp('install_year', String(new Date().getFullYear()), 'number'))}</div>
              </div>
            </>
          )}
        </div>
      );

      // Etapa 2: Especificaciones técnicas (dinámico) + fabricante/modelo
      case 2: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Fabricante — select + botón inline (NO navega fuera) */}
            <div>
              {lbl('Fabricante')}
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  value={form.manufacturer_id}
                  onChange={e => { set('manufacturer_id', e.target.value); set('model', ''); }}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}
                >
                  <option value="">Sin fabricante</option>
                  {manufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                {quickAddBtn('manufacturer', 'Dar de alta fabricante')}
              </div>
              {manufacturers.length === 0 && (
                <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#94A3B8' }}>
                  No hay fabricantes registrados — haz clic en <strong>+ Nuevo</strong>
                </div>
              )}
            </div>

            {/* Modelo — select dinámico con alta inline */}
            <div>
              {lbl('Modelo')}
              {!showAddModel ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    value={form.model}
                    onChange={e => set('model', e.target.value)}
                    disabled={!form.manufacturer_id || modelsLoading}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 10,
                      border: '1.5px solid #E8EBF4', fontSize: '0.875rem',
                      background: '#FAFBFF',
                      color: form.model ? '#1E293B' : '#94A3B8',
                      opacity: (!form.manufacturer_id || modelsLoading) ? 0.6 : 1,
                    }}
                  >
                    <option value="">
                      {!form.manufacturer_id
                        ? 'Selecciona fabricante primero'
                        : modelsLoading
                          ? 'Cargando...'
                          : models.length === 0
                            ? 'Sin modelos — agrega uno'
                            : 'Seleccionar modelo'}
                    </option>
                    {models.map(m => (
                      <option key={m.id} value={m.name}>
                        {m.name}{m.part_number ? ` (${m.part_number})` : ''}
                      </option>
                    ))}
                  </select>
                  {form.manufacturer_id && (
                    <button
                      onClick={() => setShowAddModel(true)}
                      title="Agregar nuevo modelo"
                      style={{ padding: '0 12px', borderRadius: 10, border: '1.5px solid #4361EE', background: '#EEF2FF', color: '#4361EE', fontSize: '1.2rem', cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}
                    >+</button>
                  )}
                </div>
              ) : (
                <div style={{ border: '1.5px solid #4361EE', borderRadius: 10, padding: 12, background: '#F8FAFF' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4361EE', marginBottom: 8 }}>
                    Nuevo modelo para {manufacturers.find(m => m.id === form.manufacturer_id)?.name}
                  </div>
                  <input
                    type="text"
                    placeholder="Nombre del modelo *"
                    value={newModelName}
                    onChange={e => setNewModelName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E8EBF4', fontSize: '0.85rem', marginBottom: 6, boxSizing: 'border-box' }}
                  />
                  <input
                    type="text"
                    placeholder="Part number (opcional)"
                    value={newModelPN}
                    onChange={e => setNewModelPN(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E8EBF4', fontSize: '0.85rem', marginBottom: 8, boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={handleAddModel}
                      disabled={!newModelName.trim() || addingModel}
                      style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: newModelName.trim() ? '#4361EE' : '#CBD5E1', color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: newModelName.trim() ? 'pointer' : 'not-allowed' }}
                    >{addingModel ? 'Guardando...' : 'Guardar modelo'}</button>
                    <button
                      onClick={() => { setShowAddModel(false); setNewModelName(''); setNewModelPN(''); }}
                      style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #E8EBF4', background: '#fff', color: '#64748B', fontSize: '0.82rem', cursor: 'pointer' }}
                    >Cancelar</button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ gridColumn: '1/-1' }}>{fld('No. de serie', inp('serial_number', 'FDO2312G0AB'))}</div>
          </div>
          {selectedType && (
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', marginBottom: 10 }}>
                Especificaciones técnicas — {typeUI?.label ?? selectedType.name}
              </div>
              {renderTechnicalFields()}
            </div>
          )}
        </div>
      );

      // Etapa 3: Ubicación y etiqueta RFID
      case 3: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>{fld('Etiqueta RFID / QR', inp('rfid_tag', 'SKIA-SW-000001'))}</div>
            <div style={{ gridColumn: '1/-1' }}>
              {fld('Observaciones', (
                <textarea
                  placeholder="Notas sobre el activo, condición, historial..."
                  value={form.observations}
                  onChange={e => set('observations', e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B', resize: 'vertical', outline: 'none' }}
                />
              ))}
            </div>
          </div>
        </div>
      );

      // Etapa 4: Datos financieros
      case 4: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Proveedor — select + botón inline (NO navega fuera) */}
            <div style={{ gridColumn: '1/-1' }}>
              {lbl('Proveedor / Integrador')}
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  value={form.supplier}
                  onChange={e => set('supplier', e.target.value)}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}
                >
                  <option value="">Seleccionar proveedor</option>
                  {providers.map((p: { id: string; legal_name: string; trade_name?: string }) => (
                    <option key={p.id} value={p.id}>{p.trade_name || p.legal_name}</option>
                  ))}
                </select>
                {quickAddBtn('provider', 'Dar de alta proveedor')}
              </div>
              {providers.length === 0 && (
                <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#94A3B8' }}>
                  No hay proveedores registrados — haz clic en <strong>+ Nuevo</strong>
                </div>
              )}
            </div>
            <div>{fld('No. Factura', inp('invoice_no', 'F-2024-0312'))}</div>
            <div>{fld('Costo (USD)', inp('cost_usd', '4200', 'number'))}</div>
            <div>{fld('Fecha de compra', inp('purchase_date', '', 'date'))}</div>
            <div>{fld('Vencimiento garantía', inp('warranty_expiry', '', 'date'))}</div>
            <div>{fld('Centro de Costos', inp('cost_center', 'TI-001'))}</div>
          </div>
        </div>
      );

      // Etapa 5: Resumen y confirmación
      case 5: return (
        <div>
          <div style={{ background: '#F0F4FF', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4361EE', marginBottom: 12 }}>
              Resumen del registro
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: 10, fontStyle: 'italic' }}>
              El código interno será generado automáticamente por el sistema.
            </div>
            {[
              ['Tipo', typeUI?.label ?? selectedType?.name ?? '—'],
              ['Nombre', form.name || '—'],
              ['Estado', OPERATIONAL_STATUS_UI[form.status]?.label ?? form.status],
              ['Fabricante / Modelo', [
                manufacturers.find(m => m.id === form.manufacturer_id)?.name,
                form.model
              ].filter(Boolean).join(' — ') || '—'],
              ['No. Serie', form.serial_number || '—'],
              ['Etiqueta RFID', form.rfid_tag || '—'],
              ['Proveedor', providers.find((p: { id: string; legal_name: string; trade_name?: string }) => p.id === form.supplier)?.trade_name
                || providers.find((p: { id: string; legal_name: string; trade_name?: string }) => p.id === form.supplier)?.legal_name
                || form.supplier || '—'],
              ['Costo', form.cost_usd ? `$${parseFloat(form.cost_usd).toLocaleString()} USD` : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E8EBF4', fontSize: '0.82rem' }}>
                <span style={{ color: '#64748B' }}>{k}</span>
                <span style={{ color: '#1E293B', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          {saveError && (
            <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: '0.82rem', color: '#DC2626', marginBottom: 12 }}>
              ⚠ {saveError}
            </div>
          )}
          <div style={{ padding: 12, background: '#FFF7ED', borderRadius: 10, border: '1px solid #FED7AA', fontSize: '0.8rem', color: '#92400E' }}>
            ✓ Puedes completar fotos, documentos y relaciones después desde el inventario.
          </div>
        </div>
      );
      default: return null;
    }
  };

  // ── Layout principal ──────────────────────────────────────────────────────

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(15,23,42,0.18)' }}>

          {/* Header */}
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1E293B' }}>Nuevo Activo</div>
              <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 2 }}>
                Etapa {stage} de {STAGES.length} — {STAGES[stage - 1].desc}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          {/* Indicador de etapas */}
          <div style={{ padding: '14px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: 6 }}>
            {STAGES.map(s => {
              const isActive = stage === s.id;
              const isDone = completed.includes(s.id);
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setStage(s.id)}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', background: isActive ? '#EEF2FF' : isDone ? '#F0FDF4' : '#F8FAFF', transition: 'all 150ms' }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isActive ? '#4361EE' : isDone ? '#22C55E' : '#E2E8F0' }}>
                    {isDone && !isActive ? <Check size={14} color="#fff" /> : <Icon size={13} color={isActive ? '#fff' : '#94A3B8'} />}
                  </div>
                  <span style={{ fontSize: '0.65rem', fontWeight: isActive ? 700 : 500, color: isActive ? '#4361EE' : isDone ? '#16A34A' : '#94A3B8', whiteSpace: 'nowrap' }}>
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Contenido */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {renderStage()}
          </div>

          {/* Footer de navegación */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => setStage(s => Math.max(1, s - 1))}
              disabled={stage === 1}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, border: '1.5px solid #E8EBF4', background: '#F8FAFF', color: stage === 1 ? '#CBD5E1' : '#475569', cursor: stage === 1 ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 500 }}
            >
              <ChevronLeft size={16} /> Anterior
            </button>

            {stage < STAGES.length ? (
              <button
                onClick={() => setStage(s => Math.min(STAGES.length, s + 1))}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 10, border: 'none', background: '#4361EE', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
              >
                Siguiente <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving || !form.asset_type_id || !form.name}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 10, border: 'none', background: (!form.asset_type_id || !form.name) ? '#CBD5E1' : '#22C55E', color: '#fff', cursor: (!form.asset_type_id || !form.name) ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
              >
                {saving ? '⏳ Guardando...' : '✓ Guardar Activo'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mini-modal de alta rápida de fabricante */}
      {quickCreate === 'manufacturer' && (
        <QuickCreateModal
          title="Nuevo Fabricante / Marca"
          fields={[
            { key: 'name',    label: 'Nombre *',  placeholder: 'Cisco Systems',  required: true },
            { key: 'country', label: 'País',       placeholder: 'EE.UU.' },
            { key: 'contact', label: 'Contacto',   placeholder: 'soporte@cisco.com' },
            { key: 'website', label: 'Sitio web',  placeholder: 'https://cisco.com', type: 'url' },
          ]}
          onSave={handleQuickCreateManufacturer}
          onClose={() => setQuickCreate(null)}
        />
      )}

      {/* Mini-modal de alta rápida de proveedor */}
      {quickCreate === 'provider' && (
        <QuickCreateModal
          title="Nuevo Proveedor / Integrador"
          fields={[
            { key: 'provider_type', label: 'Tipo *', required: true, options: PROVIDER_TYPES },
            { key: 'legal_name',    label: 'Razón social *', placeholder: 'Redes y Sistemas S.A. de C.V.', required: true },
            { key: 'trade_name',    label: 'Nombre comercial', placeholder: 'RedSys' },
            { key: 'contact_name',  label: 'Contacto', placeholder: 'Ing. Juan Pérez' },
            { key: 'email',         label: 'Correo', placeholder: 'ventas@redsys.mx', type: 'email' },
            { key: 'phone',         label: 'Teléfono', placeholder: '+52 55 1234 5678', type: 'tel' },
          ]}
          onSave={handleQuickCreateProvider}
          onClose={() => setQuickCreate(null)}
        />
      )}
    </>
  );
}
