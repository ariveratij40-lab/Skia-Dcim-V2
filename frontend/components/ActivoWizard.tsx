import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Package, Tag, MapPin, DollarSign, Shield } from 'lucide-react';
import { CATALOGOS } from '../data/catalogos';

export type AssetStatus = 'Activo' | 'Inactivo' | 'En mantenimiento' | 'Baja' | 'En bodega';

export interface ActivoWizardData {
  internal_code: string; name: string;
  asset_type_code: string; asset_type_name: string;
  status: AssetStatus;
  serial_number: string; model: string; manufacturer: string;
  location_name: string; floor: string; room: string; zone: string;
  rfid_tag: string; install_year: number;
  observations: string; photo_url: string;
  supplier: string; invoice_no: string; cost_usd: number;
  purchase_date: string; warranty_expiry: string;
  cost_center: string; responsible: string;
}

interface Props {
  onClose: () => void;
  onSave: (data: ActivoWizardData) => void;
  initial?: Partial<ActivoWizardData>;
}

const STAGES = [
  { id: 1, label: 'Alta rápida', icon: Package,    desc: 'Identificación básica' },
  { id: 2, label: 'Técnico',     icon: Tag,        desc: 'Modelo y serie' },
  { id: 3, label: 'Ubicación',   icon: MapPin,     desc: 'Localización física' },
  { id: 4, label: 'Financiero',  icon: DollarSign, desc: 'Costos y garantía' },
  { id: 5, label: 'Resumen',     icon: Shield,     desc: 'Confirmar y guardar' },
];

const ASSET_TYPES = [
  { code: 'MDF',       label: 'MDF' },
  { code: 'IDF',       label: 'IDF' },
  { code: 'RACK',      label: 'Rack' },
  { code: 'SWITCH',    label: 'Switch' },
  { code: 'BACKBONE',  label: 'Backbone' },
  { code: 'UPS',       label: 'UPS' },
  { code: 'PDU',       label: 'PDU' },
  { code: 'PATCH',     label: 'Patch Panel' },
  { code: 'NODO',      label: 'Nodo' },
  { code: 'CAMARA',    label: 'Cámara' },
  { code: 'AP',        label: 'AP WiFi' },
  { code: 'SERVIDOR',  label: 'Servidor' },
  { code: 'OTRO',      label: 'Otro' },
];

const STATUSES: AssetStatus[] = ['Activo', 'Inactivo', 'En mantenimiento', 'Baja', 'En bodega'];
const STATUS_COLORS: Record<AssetStatus, string> = {
  'Activo': '#22C55E', 'Inactivo': '#F59E0B', 'En mantenimiento': '#3B82F6',
  'Baja': '#EF4444', 'En bodega': '#6B7280',
};

const EMPTY: ActivoWizardData = {
  internal_code: '', name: '', asset_type_code: 'OTRO', asset_type_name: 'Otro',
  status: 'Activo', serial_number: '', model: '', manufacturer: '',
  location_name: '', floor: '', room: '', zone: '',
  rfid_tag: '', install_year: new Date().getFullYear(),
  observations: '', photo_url: '',
  supplier: '', invoice_no: '', cost_usd: 0,
  purchase_date: '', warranty_expiry: '',
  cost_center: '', responsible: '',
};

export default function ActivoWizard({ onClose, onSave, initial }: Props) {
  const [stage, setStage] = useState(1);
  const [form, setForm] = useState<ActivoWizardData>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof ActivoWizardData, value: any) =>
    setForm(f => ({ ...f, [field]: value }));

  const completedStages = (): number[] => {
    const c: number[] = [];
    if (form.internal_code && form.asset_type_code && form.status) c.push(1);
    if (form.manufacturer || form.model) c.push(2);
    if (form.location_name) c.push(3);
    if (form.supplier) c.push(4);
    return c;
  };

  const handleSave = async () => {
    if (!form.internal_code || !form.asset_type_code) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 300));
    onSave(form);
    setSaving(false);
  };

  const inp = (field: keyof ActivoWizardData, placeholder: string, type = 'text') => (
    <input type={type} placeholder={placeholder}
      value={form[field] as string ?? ''}
      onChange={e => set(field, type === 'number' ? Number(e.target.value) : e.target.value)}
      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', outline: 'none', background: '#FAFBFF', color: '#1E293B', transition: 'border-color 150ms' }}
      onFocus={e => e.target.style.borderColor = '#4361EE'}
      onBlur={e => e.target.style.borderColor = '#E8EBF4'}
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

  const chips = (options: string[], current: string, onSelect: (v: string) => void, colors?: Record<string, string>) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const active = current === opt;
        const color = colors?.[opt] ?? '#4361EE';
        return (
          <button key={opt} onClick={() => onSelect(opt)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 500,
            border: `1.5px solid ${active ? color : '#E8EBF4'}`,
            background: active ? `${color}18` : '#F8FAFF',
            color: active ? color : '#64748B', cursor: 'pointer', transition: 'all 120ms',
          }}>{opt}</button>
        );
      })}
    </div>
  );

  const renderStage = () => {
    switch (stage) {
      case 1: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>{fld('Código interno', inp('internal_code', 'ACT-001'), true)}</div>
            <div>{fld('Nombre descriptivo', inp('name', 'Switch Acceso Piso 3'))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Tipo de activo', (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ASSET_TYPES.map(t => {
                  const active = form.asset_type_code === t.code;
                  return (
                    <button key={t.code} onClick={() => { set('asset_type_code', t.code); set('asset_type_name', t.label); }} style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 500,
                      border: `1.5px solid ${active ? '#4361EE' : '#E8EBF4'}`,
                      background: active ? '#EEF2FF' : '#F8FAFF',
                      color: active ? '#4361EE' : '#64748B', cursor: 'pointer', transition: 'all 120ms',
                    }}>{t.label}</button>
                  );
                })}
              </div>
            ), true)}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Estado', chips(STATUSES, form.status, v => set('status', v as AssetStatus), STATUS_COLORS))}</div>
            <div>{fld('Responsable', inp('responsible', 'Ing. Carlos Méndez'))}</div>
            <div>{fld('Año de instalación', inp('install_year', '2024', 'number'))}</div>
          </div>
        </div>
      );
      case 2: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>{fld('Fabricante / Marca', (
              <select value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
                <option value="">Seleccionar fabricante</option>
                {CATALOGOS.marcas.map(m => <option key={m}>{m}</option>)}
              </select>
            ))}</div>
            <div>{fld('Modelo', inp('model', 'Catalyst 9300'))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('No. de serie', inp('serial_number', 'SN-2024-001'))}</div>
            <div>{fld('Etiqueta RFID', inp('rfid_tag', 'RFID-ACT-001'))}</div>
            <div>{fld('Fecha de compra', inp('purchase_date', '', 'date'))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Observaciones', (
              <textarea placeholder="Notas sobre el activo, condición, historial..." value={form.observations} onChange={e => set('observations', e.target.value)} rows={3}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B', resize: 'vertical', outline: 'none' }} />
            ))}</div>
          </div>
        </div>
      );
      case 3: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>{fld('Ubicación / Cuarto técnico', inp('location_name', 'IDF2 Área de Producción'), true)}</div>
            <div>{fld('Piso', inp('floor', 'Piso 3'))}</div>
            <div>{fld('Sala / Cuarto', inp('room', 'Cuarto de telecomunicaciones'))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Zona / Área', (
              <select value={form.zone} onChange={e => set('zone', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
                <option value="">Seleccionar área</option>
                {CATALOGOS.areas.map(a => <option key={a}>{a}</option>)}
              </select>
            ))}</div>
          </div>
        </div>
      );
      case 4: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>{fld('Proveedor / Integrador', (
              <select value={form.supplier} onChange={e => set('supplier', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
                <option value="">Seleccionar proveedor</option>
                {CATALOGOS.integradores.map(i => <option key={i}>{i}</option>)}
              </select>
            ))}</div>
            <div>{fld('No. Factura', inp('invoice_no', 'F-2024-0312'))}</div>
            <div>{fld('Costo (USD)', inp('cost_usd', '4200', 'number'))}</div>
            <div>{fld('Vencimiento garantía', inp('warranty_expiry', '', 'date'))}</div>
            <div>{fld('Centro de Costos', inp('cost_center', 'TI-001'))}</div>
          </div>
        </div>
      );
      case 5: return (
        <div>
          <div style={{ background: '#F0F4FF', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4361EE', marginBottom: 12 }}>Resumen del registro</div>
            {[
              ['Código', form.internal_code || '—'],
              ['Nombre', form.name || '—'],
              ['Tipo', form.asset_type_name || '—'],
              ['Estado', form.status || '—'],
              ['Fabricante / Modelo', [form.manufacturer, form.model].filter(Boolean).join(' ') || '—'],
              ['No. Serie', form.serial_number || '—'],
              ['Ubicación', form.location_name || '—'],
              ['Proveedor', form.supplier || '—'],
              ['Costo', form.cost_usd ? `$${form.cost_usd.toLocaleString()} USD` : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E8EBF4', fontSize: '0.82rem' }}>
                <span style={{ color: '#64748B' }}>{k}</span>
                <span style={{ color: '#1E293B', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: 12, background: '#FFF7ED', borderRadius: 10, border: '1px solid #FED7AA', fontSize: '0.8rem', color: '#92400E' }}>
            ✓ Puedes completar fotos, documentos y relaciones después desde el inventario.
          </div>
        </div>
      );
      default: return null;
    }
  };

  const completed = completedStages();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(15,23,42,0.18)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1E293B' }}>{initial ? 'Editar Activo' : 'Nuevo Activo'}</div>
            <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 2 }}>Etapa {stage} de {STAGES.length} — {STAGES[stage - 1].desc}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}><X size={20} /></button>
        </div>

        <div style={{ padding: '14px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: 6 }}>
          {STAGES.map(s => {
            const isActive = stage === s.id;
            const isDone = completed.includes(s.id);
            const Icon = s.icon;
            return (
              <button key={s.id} onClick={() => setStage(s.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', background: isActive ? '#EEF2FF' : isDone ? '#F0FDF4' : '#F8FAFF', transition: 'all 150ms' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isActive ? '#4361EE' : isDone ? '#22C55E' : '#E2E8F0' }}>
                  {isDone && !isActive ? <Check size={14} color="#fff" /> : <Icon size={13} color={isActive ? '#fff' : '#94A3B8'} />}
                </div>
                <span style={{ fontSize: '0.65rem', fontWeight: isActive ? 700 : 500, color: isActive ? '#4361EE' : isDone ? '#16A34A' : '#94A3B8', whiteSpace: 'nowrap' }}>{s.label}</span>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>{renderStage()}</div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => setStage(s => Math.max(1, s - 1))} disabled={stage === 1}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, border: '1.5px solid #E8EBF4', background: '#F8FAFF', color: stage === 1 ? '#CBD5E1' : '#475569', cursor: stage === 1 ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
            <ChevronLeft size={16} /> Anterior
          </button>
          {stage < STAGES.length ? (
            <button onClick={() => setStage(s => Math.min(STAGES.length, s + 1))}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 10, border: 'none', background: '#4361EE', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
              Siguiente <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={handleSave} disabled={!form.internal_code || !form.asset_type_code || saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 10, border: 'none', background: (!form.internal_code || !form.asset_type_code) ? '#CBD5E1' : '#22C55E', color: '#fff', cursor: (!form.internal_code || !form.asset_type_code) ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
              {saving ? '...' : <><Check size={16} /> Guardar Activo</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
