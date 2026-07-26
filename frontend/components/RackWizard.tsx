import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Server, MapPin, Tag, DollarSign, Shield } from 'lucide-react';
import { CATALOGOS } from '../data/catalogos';
import type { RackRecord, RackType, RackStatus, RackPostes } from '../pages/infraestructura/racks';

export interface RackWizardData extends Omit<RackRecord, 'id'> {}

interface Props {
  onClose: () => void;
  onSave: (data: RackWizardData) => void;
  initial?: Partial<RackRecord>;
}

const STAGES = [
  { id: 1, label: 'Alta rápida',   icon: Server,    desc: 'Datos esenciales' },
  { id: 2, label: 'Físico',        icon: Tag,       desc: 'Dimensiones y tipo' },
  { id: 3, label: 'Ubicación',     icon: MapPin,    desc: 'Localización y plano' },
  { id: 4, label: 'Financiero',    icon: DollarSign,desc: 'Costos y proveedor' },
  { id: 5, label: 'Normativa',     icon: Shield,    desc: 'Auditoría y RFID' },
];

const RACK_TYPES: RackType[] = ['Rack Cableado','Rack Equipo Activo','Rack CCTV','Rack Telefonía','Rack Servidores'];
const RACK_STATUSES: RackStatus[] = ['Operativo','Atención','Crítico','Planeado','Fuera de servicio'];
const RACK_POSTES: RackPostes[] = ['2 Postes','4 Postes','Abierto','Cerrado','Wall-mount','Gabinete','Panzone'];
const STATUS_COLORS: Record<RackStatus, string> = {
  'Operativo': '#22C55E', 'Atención': '#F59E0B', 'Crítico': '#EF4444',
  'Planeado': '#3B82F6', 'Fuera de servicio': '#6B7280',
};

const EMPTY: RackWizardData = {
  code:'', brand:'', model:'', height_u:42, type_posts:'4 Postes',
  rack_type:'Rack Cableado', status:'Operativo', location:'', floor_plan_ref:'',
  photo_url:'', ref_image_url:'', observations:'', org_horizontal:false,
  org_vertical:false, pdu:false, integrator:'', invoice_no:'', cost_usd:0,
  po:'', cost_center:'', rfid_tag:'', install_year:new Date().getFullYear(),
  capacity_u:42, used_u:0,
};

export default function RackWizard({ onClose, onSave, initial }: Props) {
  const [stage, setStage] = useState(1);
  const [form, setForm] = useState<RackWizardData>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof RackWizardData, value: any) =>
    setForm(f => ({ ...f, [field]: value }));

  const completedStages = (): number[] => {
    const c: number[] = [];
    if (form.code && form.status && form.rack_type) c.push(1);
    if (form.brand && form.height_u) c.push(2);
    if (form.location) c.push(3);
    if (form.integrator) c.push(4);
    return c;
  };

  const handleSave = async () => {
    if (!form.code || !form.rack_type || !form.status) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 300));
    onSave(form);
    setSaving(false);
  };

  const inp = (field: keyof RackWizardData, placeholder: string, type = 'text', required = false) => (
    <input
      type={type}
      placeholder={placeholder}
      value={form[field] as string ?? ''}
      onChange={e => set(field, type === 'number' ? Number(e.target.value) : e.target.value)}
      required={required}
      style={{
        width: '100%', padding: '10px 14px', borderRadius: 10,
        border: '1.5px solid #E8EBF4', fontSize: '0.875rem',
        outline: 'none', background: '#FAFBFF', color: '#1E293B',
        transition: 'border-color 150ms',
      }}
      onFocus={e => e.target.style.borderColor = '#4361EE'}
      onBlur={e => e.target.style.borderColor = '#E8EBF4'}
    />
  );

  const label = (text: string, required = false) => (
    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', marginBottom: 4, display: 'block' }}>
      {text}{required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
    </label>
  );

  const field = (lbl: string, children: React.ReactNode, required = false) => (
    <div style={{ marginBottom: 14 }}>
      {label(lbl, required)}
      {children}
    </div>
  );

  const chipGroup = (options: string[], current: string, onSelect: (v: string) => void, colors?: Record<string, string>) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const active = current === opt;
        const color = colors?.[opt] ?? '#4361EE';
        return (
          <button key={opt} onClick={() => onSelect(opt)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 500,
            border: `1.5px solid ${active ? color : '#E8EBF4'}`,
            background: active ? `${color}18` : '#F8FAFF',
            color: active ? color : '#64748B',
            cursor: 'pointer', transition: 'all 120ms',
          }}>{opt}</button>
        );
      })}
    </div>
  );

  const toggle = (field: keyof RackWizardData, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F8FAFF', borderRadius: 10, border: '1.5px solid #E8EBF4', marginBottom: 10 }}>
      <span style={{ fontSize: '0.875rem', color: '#334155' }}>{label}</span>
      <button onClick={() => set(field, !form[field])} style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: form[field] ? '#4361EE' : '#CBD5E1', transition: 'background 200ms', position: 'relative',
      }}>
        <span style={{
          position: 'absolute', top: 3, left: form[field] ? 22 : 3,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  );

  const renderStage = () => {
    switch (stage) {
      case 1: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              {field('Código del Rack', inp('code', 'RCK-MDF-A0001', 'text', true), true)}
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              {field('Tipo de Rack', chipGroup(RACK_TYPES, form.rack_type, v => set('rack_type', v as RackType)))}
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              {field('Estado', chipGroup(RACK_STATUSES, form.status, v => set('status', v as RackStatus), STATUS_COLORS))}
            </div>
            <div>
              {field('Marca', (
                <select value={form.brand} onChange={e => set('brand', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
                  <option value="">Seleccionar marca</option>
                  {['Panduit','Chatsworth','Tripp Lite','APC','Rittal','Schneider','Belden','Legrand','Hubbell','Siemon','CommScope','Corning','Eaton','Vertiv'].map(m => <option key={m}>{m}</option>)}
                </select>
              ))}
            </div>
            <div>{field('Modelo', inp('model', 'RP40, CPI 45U...'))}</div>
          </div>
        </div>
      );
      case 2: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              {field('Altura (U)', inp('height_u', '42', 'number'))}
            </div>
            <div>
              {field('Capacidad (U)', inp('capacity_u', '42', 'number'))}
            </div>
            <div>
              {field('Unidades usadas (U)', inp('used_u', '0', 'number'))}
            </div>
            <div>
              {field('Año de instalación', inp('install_year', '2024', 'number'))}
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              {field('Tipo de postes', chipGroup(RACK_POSTES, form.type_posts, v => set('type_posts', v as RackPostes)))}
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ marginBottom: 8 }}>{label('Accesorios')}</div>
              {toggle('org_horizontal', 'Organizador horizontal')}
              {toggle('org_vertical', 'Organizador vertical')}
              {toggle('pdu', 'PDU instalada')}
            </div>
          </div>
        </div>
      );
      case 3: return (
        <div>
          {field('Ubicación / Cuarto técnico', inp('location', 'MDF Principal Torre A', 'text', true), true)}
          {field('Referencia en plano', inp('floor_plan_ref', 'Plano MDF-A S1'))}
          {field('Etiqueta RFID', inp('rfid_tag', 'RFID-0001'))}
          {field('Observaciones', (
            <textarea
              placeholder="Notas sobre el rack, estado físico, acceso..."
              value={form.observations}
              onChange={e => set('observations', e.target.value)}
              rows={4}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B', resize: 'vertical', outline: 'none' }}
            />
          ))}
        </div>
      );
      case 4: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              {field('Integrador / Proveedor', (
                <select value={form.integrator} onChange={e => set('integrator', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
                  <option value="">Seleccionar integrador</option>
                  {CATALOGOS.integradores.map(i => <option key={i}>{i}</option>)}
                </select>
              ))}
            </div>
            <div>{field('No. Factura', inp('invoice_no', 'F-2024-0312'))}</div>
            <div>{field('Costo (USD)', inp('cost_usd', '4200', 'number'))}</div>
            <div>{field('Orden de Compra (PO)', inp('po', 'PO-2024-001'))}</div>
            <div>{field('Centro de Costos', inp('cost_center', 'TI-001'))}</div>
          </div>
        </div>
      );
      case 5: return (
        <div>
          <div style={{ background: '#F0F4FF', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4361EE', marginBottom: 12 }}>Resumen del registro</div>
            {[
              ['Código', form.code || '—'],
              ['Tipo', form.rack_type || '—'],
              ['Estado', form.status || '—'],
              ['Marca / Modelo', [form.brand, form.model].filter(Boolean).join(' ') || '—'],
              ['Altura', form.height_u ? `${form.height_u}U` : '—'],
              ['Ubicación', form.location || '—'],
              ['Integrador', form.integrator || '—'],
              ['Costo', form.cost_usd ? `$${form.cost_usd.toLocaleString()} USD` : '—'],
              ['RFID', form.rfid_tag || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E8EBF4', fontSize: '0.82rem' }}>
                <span style={{ color: '#64748B' }}>{k}</span>
                <span style={{ color: '#1E293B', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: 12, background: '#FFF7ED', borderRadius: 10, border: '1px solid #FED7AA', fontSize: '0.8rem', color: '#92400E' }}>
            ✓ Puedes completar fotos, normativa y relaciones después desde el inventario.
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
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1E293B' }}>
              {initial ? 'Editar Rack' : 'Nuevo Rack'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 2 }}>
              Etapa {stage} de {STAGES.length} — {STAGES[stage - 1].desc}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Stage indicators */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: 6 }}>
          {STAGES.map((s, i) => {
            const isActive = stage === s.id;
            const isDone = completed.includes(s.id);
            const Icon = s.icon;
            return (
              <button key={s.id} onClick={() => setStage(s.id)} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: isActive ? '#EEF2FF' : isDone ? '#F0FDF4' : '#F8FAFF',
                transition: 'all 150ms',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isActive ? '#4361EE' : isDone ? '#22C55E' : '#E2E8F0',
                }}>
                  {isDone && !isActive ? <Check size={14} color="#fff" /> : <Icon size={13} color={isActive ? '#fff' : '#94A3B8'} />}
                </div>
                <span style={{ fontSize: '0.65rem', fontWeight: isActive ? 700 : 500, color: isActive ? '#4361EE' : isDone ? '#16A34A' : '#94A3B8', whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {renderStage()}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => setStage(s => Math.max(1, s - 1))}
            disabled={stage === 1}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, border: '1.5px solid #E8EBF4', background: '#F8FAFF', color: stage === 1 ? '#CBD5E1' : '#475569', cursor: stage === 1 ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 500 }}
          >
            <ChevronLeft size={16} /> Anterior
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
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
                disabled={!form.code || !form.rack_type || !form.status || saving}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 10, border: 'none', background: (!form.code || !form.rack_type || !form.status) ? '#CBD5E1' : '#22C55E', color: '#fff', cursor: (!form.code || !form.rack_type || !form.status) ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
              >
                {saving ? '...' : <><Check size={16} /> Guardar Rack</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
