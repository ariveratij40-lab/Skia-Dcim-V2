/**
 * ActivoWizard — Wizard de 5 pasos para crear activos polimórficos (Fase 2)
 *
 * Cambios respecto a la versión legacy:
 *   - Consume /api/dcim/catalogs vía useCatalogs (INV-DCM-0014)
 *   - El Paso 2 (Técnico) es dinámico según el asset_type seleccionado
 *   - El internal_code es generado por el backend (INV-DCM-0015); no se pide al usuario
 *   - handleSave hace POST real a /api/dcim/assets con payload polimórfico
 *   - Los estados se envían en inglés (active, inactive...) — corrige F-AST-04
 */

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Package, Tag, MapPin, DollarSign, Shield } from 'lucide-react';
import axios from 'axios';
import { useCatalogs, ASSET_TYPE_UI, OPERATIONAL_STATUS_UI } from '../hooks/useCatalogs';
import { CATALOGOS } from '../data/catalogos';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface TechnicalData {
  // RACK
  total_u?: number;
  height_mm?: number;
  width_mm?: number;
  depth_mm?: number;
  power_kw?: number;
  // SWITCH
  port_count?: number;
  uplink_count?: number;
  management_ip?: string;
  rack_unit?: number;
  // UPS
  capacity_kva?: number;
  battery_runtime_min?: number;
  // MDF/IDF
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

// ── Componente ───────────────────────────────────────────────────────────────

export default function ActivoWizard({ onClose, onSave, initial }: Props) {
  const { assetTypes, manufacturers, loading: catalogsLoading } = useCatalogs();
  const [stage, setStage] = useState(1);
  const [form, setForm] = useState<WizardForm>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = (field: keyof WizardForm, value: unknown) =>
    setForm(f => ({ ...f, [field]: value }));

  const setTech = (k: keyof TechnicalData, v: unknown) =>
    setForm(f => ({ ...f, technical: { ...f.technical, [k]: v } }));

  // Etapas completadas (para el indicador visual)
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

  // ── handleSave — POST real al backend (INV-DCM-0013, INV-DCM-0015) ────────

  const handleSave = async () => {
    if (!form.asset_type_id || !form.name) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        asset_type_id:   form.asset_type_id,
        name:            form.name,
        status:          form.status,                                        // inglés canónico (corrige F-AST-04)
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
        technical:       form.technical,                                     // tabla satélite (INV-DCM-0013)
      };
      const res = await axios.post('/api/dcim/assets', payload);
      const internalCode: string = res.data?.internal_code ?? '';
      onSave(internalCode, form.asset_type_code);  // devuelve código + tipo para activar filtro (fix F-AST-BUG-01)
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
                <div style={{ gridColumn: '1/-1' }}>{fld('Nombre descriptivo', inp('name', 'Switch Core MDF Principal'), true)}</div>
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
            <div>
              {lbl('Fabricante')}
              <select
                value={form.manufacturer_id}
                onChange={e => set('manufacturer_id', e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}
              >
                <option value="">Sin fabricante</option>
                {manufacturers.length > 0
                  ? manufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
                  : CATALOGOS.marcasActivos.map(m => <option key={m} value={m}>{m}</option>)
                }
              </select>
            </div>
            <div>{fld('Modelo', inp('model', 'Catalyst 9300-48P'))}</div>
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
            <div style={{ gridColumn: '1/-1' }}>
              {lbl('Proveedor / Integrador')}
              <select
                value={form.supplier}
                onChange={e => set('supplier', e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}
              >
                <option value="">Seleccionar proveedor</option>
                {CATALOGOS.integradores.map((i: string) => <option key={i}>{i}</option>)}
              </select>
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
              ].filter(Boolean).join(' ') || '—'],
              ['No. Serie', form.serial_number || '—'],
              ['Etiqueta RFID', form.rfid_tag || '—'],
              ['Proveedor', form.supplier || '—'],
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
  );
}
