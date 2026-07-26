import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Network, Cpu, MapPin, DollarSign, Shield } from 'lucide-react';
import { CATALOGOS } from '../data/catalogos';

export type SwStatus = 'Activo' | 'Inactivo' | 'Baja';
export type SwTipo = 'Core' | 'Distribución' | 'Acceso' | 'PoE' | 'Industrial' | 'Administrable' | 'No administrable';

export interface SwitchWizardData {
  code: string; brand: string; model: string; serie: string;
  tipo: SwTipo; status: SwStatus;
  ubicacion: string; ubicacion_plano: string;
  puertos: number; puertos_libres: number; puertos_poe: number;
  capacidad_puerto: string; ip: string; firmware: string;
  fecha_compra: string; expiracion_garantia: string;
  no_factura: string; costo_dls: number; proveedor: string;
  contrato_sla: string; rfid: string; anio_instalacion: number;
  centro_costos: string; observaciones: string;
}

interface Props {
  onClose: () => void;
  onSave: (data: SwitchWizardData) => void;
  initial?: Partial<SwitchWizardData>;
}

const STAGES = [
  { id: 1, label: 'Alta rápida', icon: Network,    desc: 'Identificación básica' },
  { id: 2, label: 'Técnico',     icon: Cpu,        desc: 'Puertos y red' },
  { id: 3, label: 'Ubicación',   icon: MapPin,     desc: 'Localización física' },
  { id: 4, label: 'Financiero',  icon: DollarSign, desc: 'Costos y proveedor' },
  { id: 5, label: 'Resumen',     icon: Shield,     desc: 'Confirmar y guardar' },
];

const TIPOS: SwTipo[] = ['Core','Distribución','Acceso','PoE','Industrial','Administrable','No administrable'];
const STATUSES: SwStatus[] = ['Activo','Inactivo','Baja'];
const STATUS_COLORS: Record<SwStatus, string> = { 'Activo': '#22C55E', 'Inactivo': '#F59E0B', 'Baja': '#EF4444' };
const TIPO_COLORS: Record<SwTipo, string> = {
  'Core': '#4361EE', 'Distribución': '#7C3AED', 'Acceso': '#0891B2',
  'PoE': '#059669', 'Industrial': '#D97706', 'Administrable': '#6366F1', 'No administrable': '#6B7280',
};
const PORT_SPEEDS = ['100M','1G','2.5G','5G','10G','25G','40G','100G'];

const EMPTY: SwitchWizardData = {
  code: '', brand: '', model: '', serie: '', tipo: 'Acceso', status: 'Activo',
  ubicacion: '', ubicacion_plano: '', puertos: 24, puertos_libres: 0, puertos_poe: 0,
  capacidad_puerto: '1G', ip: '', firmware: '',
  fecha_compra: '', expiracion_garantia: '',
  no_factura: '', costo_dls: 0, proveedor: '', contrato_sla: '',
  rfid: '', anio_instalacion: new Date().getFullYear(),
  centro_costos: '', observaciones: '',
};

export default function SwitchWizard({ onClose, onSave, initial }: Props) {
  const [stage, setStage] = useState(1);
  const [form, setForm] = useState<SwitchWizardData>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof SwitchWizardData, value: any) =>
    setForm(f => ({ ...f, [field]: value }));

  const completedStages = (): number[] => {
    const c: number[] = [];
    if (form.code && form.tipo && form.status) c.push(1);
    if (form.puertos) c.push(2);
    if (form.ubicacion) c.push(3);
    if (form.proveedor) c.push(4);
    return c;
  };

  const handleSave = async () => {
    if (!form.code || !form.tipo) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 300));
    onSave(form);
    setSaving(false);
  };

  const inp = (field: keyof SwitchWizardData, placeholder: string, type = 'text') => (
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
            <div>{fld('Código', inp('code', 'SW-CORE-A001'), true)}</div>
            <div>{fld('No. Serie', inp('serie', 'CAT2024X001'))}</div>
            <div>{fld('Marca', (
              <select value={form.brand} onChange={e => set('brand', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
                <option value="">Seleccionar marca</option>
                {['Cisco','HP/Aruba','Juniper','Ubiquiti','Extreme','Dell','Huawei','Brocade','Netgear','TP-Link','D-Link','Siemens','Moxa','Hirschmann'].map(m => <option key={m}>{m}</option>)}
              </select>
            ))}</div>
            <div>{fld('Modelo', inp('model', 'Catalyst 9300-48P'))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Tipo', chips(TIPOS, form.tipo, v => set('tipo', v as SwTipo), TIPO_COLORS))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Estado', chips(STATUSES, form.status, v => set('status', v as SwStatus), STATUS_COLORS))}</div>
          </div>
        </div>
      );
      case 2: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>{fld('Total de puertos', inp('puertos', '24', 'number'))}</div>
            <div>{fld('Puertos libres', inp('puertos_libres', '0', 'number'))}</div>
            <div>{fld('Puertos PoE', inp('puertos_poe', '0', 'number'))}</div>
            <div>{fld('Velocidad de puerto', chips(PORT_SPEEDS, form.capacidad_puerto, v => set('capacidad_puerto', v)))}</div>
            <div>{fld('IP de gestión', inp('ip', '192.168.1.1'))}</div>
            <div>{fld('Firmware', inp('firmware', '17.9.4'))}</div>
            <div>{fld('Año de instalación', inp('anio_instalacion', '2024', 'number'))}</div>
            <div>{fld('Fecha de compra', inp('fecha_compra', '', 'date'))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Vencimiento de garantía', inp('expiracion_garantia', '', 'date'))}</div>
          </div>
        </div>
      );
      case 3: return (
        <div>
          {fld('Ubicación / Cuarto técnico', inp('ubicacion', 'MDF Principal Torre A'), true)}
          {fld('Referencia en plano', inp('ubicacion_plano', 'Plano MDF-A S1'))}
          {fld('Etiqueta RFID', inp('rfid', 'RFID-SW-001'))}
          {fld('Observaciones', (
            <textarea placeholder="Notas sobre el switch, configuración especial..." value={form.observaciones} onChange={e => set('observaciones', e.target.value)} rows={3}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B', resize: 'vertical', outline: 'none' }} />
          ))}
        </div>
      );
      case 4: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>{fld('Proveedor / Integrador', (
              <select value={form.proveedor} onChange={e => set('proveedor', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
                <option value="">Seleccionar proveedor</option>
                {CATALOGOS.integradores.map(i => <option key={i}>{i}</option>)}
              </select>
            ))}</div>
            <div>{fld('No. Factura', inp('no_factura', 'F-2024-0312'))}</div>
            <div>{fld('Costo (USD)', inp('costo_dls', '4200', 'number'))}</div>
            <div>{fld('Contrato SLA', inp('contrato_sla', 'SLA-GOLD-001'))}</div>
            <div>{fld('Centro de Costos', inp('centro_costos', 'TI-001'))}</div>
          </div>
        </div>
      );
      case 5: return (
        <div>
          <div style={{ background: '#F0F4FF', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4361EE', marginBottom: 12 }}>Resumen del registro</div>
            {[
              ['Código', form.code || '—'],
              ['Tipo', form.tipo || '—'],
              ['Estado', form.status || '—'],
              ['Marca / Modelo', [form.brand, form.model].filter(Boolean).join(' ') || '—'],
              ['Puertos', form.puertos ? `${form.puertos} (${form.capacidad_puerto})` : '—'],
              ['IP de gestión', form.ip || '—'],
              ['Ubicación', form.ubicacion || '—'],
              ['Proveedor', form.proveedor || '—'],
              ['Costo', form.costo_dls ? `$${form.costo_dls.toLocaleString()} USD` : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E8EBF4', fontSize: '0.82rem' }}>
                <span style={{ color: '#64748B' }}>{k}</span>
                <span style={{ color: '#1E293B', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: 12, background: '#FFF7ED', borderRadius: 10, border: '1px solid #FED7AA', fontSize: '0.8rem', color: '#92400E' }}>
            ✓ Puedes completar normativa, fotos y relaciones después desde el inventario.
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
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1E293B' }}>{initial ? 'Editar Switch' : 'Nuevo Switch'}</div>
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
            <button onClick={handleSave} disabled={!form.code || !form.tipo || saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 10, border: 'none', background: (!form.code || !form.tipo) ? '#CBD5E1' : '#22C55E', color: '#fff', cursor: (!form.code || !form.tipo) ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
              {saving ? '...' : <><Check size={16} /> Guardar Switch</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
