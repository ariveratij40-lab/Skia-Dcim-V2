import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Grid3x3, Tag, MapPin, DollarSign, Shield } from 'lucide-react';
import { CATALOGOS } from '../data/catalogos';
import NomenclatureCodeField from './NomenclatureCodeField';
import AssetPlacementSelector,{AssetPlacement} from './AssetPlacementSelector';

export type PPType = 'Angulado' | 'Plano' | 'Keystone' | 'Fibra Óptica' | 'Blindado' | 'Modular';
export type PPStatus = 'Activo' | 'Inactivo' | 'Baja';

export interface PatchPanelWizardData {
  code: string; name: string; brand: string; model: string; serial: string;
  type: PPType; status: PPStatus;
  location: string; floor_plan_ref: string;
  ports_total: number; ports_free: number;
  rfid_tag: string; photo_url: string; observations: string;
  purchase_date: string; install_year: number;
  invoice_no: string; cost_usd: number; supplier: string;
  sla_contract: string; cost_center: string;
  placement_id:string;
}

interface Props {
  onClose: () => void;
  onSave: (data: PatchPanelWizardData) => void;
  initial?: Partial<PatchPanelWizardData>;
}

const STAGES = [
  { id: 1, label: 'Alta rápida', icon: Grid3x3,   desc: 'Identificación básica' },
  { id: 2, label: 'Técnico',     icon: Tag,        desc: 'Puertos y categoría' },
  { id: 3, label: 'Ubicación',   icon: MapPin,     desc: 'Localización física' },
  { id: 4, label: 'Financiero',  icon: DollarSign, desc: 'Costos y proveedor' },
  { id: 5, label: 'Resumen',     icon: Shield,     desc: 'Confirmar y guardar' },
];

const TYPES: PPType[] = ['Angulado','Plano','Keystone','Fibra Óptica','Blindado','Modular'];
const STATUSES: PPStatus[] = ['Activo','Inactivo','Baja'];
const STATUS_COLORS: Record<PPStatus, string> = { 'Activo': '#22C55E', 'Inactivo': '#F59E0B', 'Baja': '#EF4444' };
const TYPE_COLORS: Record<PPType, string> = {
  'Angulado': '#4361EE', 'Plano': '#7C3AED', 'Keystone': '#0891B2',
  'Fibra Óptica': '#059669', 'Blindado': '#D97706', 'Modular': '#6366F1',
};
const PORT_COUNTS = [12, 24, 48, 96];

const EMPTY: PatchPanelWizardData = {
  code: '', name: '', brand: '', model: '', serial: '', type: 'Angulado', status: 'Activo',
  location: '', floor_plan_ref: '', ports_total: 24, ports_free: 0,
  rfid_tag: '', photo_url: '', observations: '',
  purchase_date: '', install_year: new Date().getFullYear(),
  invoice_no: '', cost_usd: 0, supplier: '', sla_contract: '', cost_center: '', placement_id:'',
};

export default function PatchPanelWizard({ onClose, onSave, initial }: Props) {
  const [stage, setStage] = useState(1);
  const [form, setForm] = useState<PatchPanelWizardData>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [nomenclatureAvailable, setNomenclatureAvailable] = useState(false);
  const [placement,setPlacement]=useState<AssetPlacement>();

  const set = (field: keyof PatchPanelWizardData, value: any) =>
    setForm(f => ({ ...f, [field]: value }));

  const completedStages = (): number[] => {
    const c: number[] = [];
    if (form.name && form.type && form.status && nomenclatureAvailable) c.push(1);
    if (form.ports_total) c.push(2);
    if (form.placement_id) c.push(3);
    if (form.supplier) c.push(4);
    return c;
  };

  const handleSave = async () => {
    if (!form.name || !form.type || !nomenclatureAvailable || !form.placement_id) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 300));
    onSave(form);
    setSaving(false);
  };

  const inp = (field: keyof PatchPanelWizardData, placeholder: string, type = 'text') => (
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

  const chips = (options: (string | number)[], current: string | number, onSelect: (v: any) => void, colors?: Record<string, string>) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const active = current === opt;
        const color = colors?.[String(opt)] ?? '#4361EE';
        return (
          <button key={String(opt)} onClick={() => onSelect(opt)} style={{
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
            <div>{fld('Código técnico', <NomenclatureCodeField assetType="PATCH_PANEL" placementCode={placement?.canonical_code} onAvailability={setNomenclatureAvailable} />)}</div>
            <div>{fld('Nombre descriptivo', inp('name', 'Panel de parcheo principal'), true)}</div>
            <div>{fld('No. Serie', inp('serial', 'PAN-001'))}</div>
            <div>{fld('Marca', (
              <select value={form.brand} onChange={e => set('brand', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
                <option value="">Seleccionar marca</option>
                {['Panduit','Commscope','Leviton','Belden','Siemon','AMP Netconnect','Hubbell','Ortronics','Molex','Corning','Legrand','Hellermann Tyton'].map(m => <option key={m}>{m}</option>)}
              </select>
            ))}</div>
            <div>{fld('Modelo', inp('model', 'CPP48WBLY'))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Tipo', chips(TYPES, form.type, v => set('type', v as PPType), TYPE_COLORS))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Estado', chips(STATUSES, form.status, v => set('status', v as PPStatus), STATUS_COLORS))}</div>
          </div>
        </div>
      );
      case 2: return (
        <div>
          {fld('Puertos totales', chips(PORT_COUNTS, form.ports_total, v => set('ports_total', v)))}
          <div style={{ height: 14 }} />
          {fld('Puertos libres', inp('ports_free', '0', 'number'))}
          {fld('Año de instalación', inp('install_year', '2024', 'number'))}
          {fld('Fecha de compra', inp('purchase_date', '', 'date'))}
        </div>
      );
      case 3: return (
        <div>
          <AssetPlacementSelector assetType="PATCH_PANEL" value={form.placement_id} onChange={(id,p)=>{set('placement_id',id);setPlacement(p);set('location',p?.name||'')}} />
          {fld('Referencia en plano', inp('floor_plan_ref', 'Plano IDF2 Prod'))}
          {fld('Etiqueta RFID', inp('rfid_tag', 'RFID-PP-001'))}
          {fld('Observaciones', (
            <textarea placeholder="Notas sobre el patch panel, estado de puertos..." value={form.observations} onChange={e => set('observations', e.target.value)} rows={3}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B', resize: 'vertical', outline: 'none' }} />
          ))}
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
            <div>{fld('No. Factura', inp('invoice_no', 'F-2024-0100'))}</div>
            <div>{fld('Costo (USD)', inp('cost_usd', '320', 'number'))}</div>
            <div>{fld('Contrato SLA', inp('sla_contract', 'SLA-2024-001'))}</div>
            <div>{fld('Centro de Costos', inp('cost_center', 'TI-001'))}</div>
          </div>
        </div>
      );
      case 5: return (
        <div>
          <div style={{ background: '#F0F4FF', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4361EE', marginBottom: 12 }}>Resumen del registro</div>
            {[
              ['Código', form.code || '—'],
              ['Tipo', form.type || '—'],
              ['Estado', form.status || '—'],
              ['Marca / Modelo', [form.brand, form.model].filter(Boolean).join(' ') || '—'],
              ['Puertos', form.ports_total ? `${form.ports_total} total / ${form.ports_free} libres` : '—'],
              ['Ubicación', form.location || '—'],
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
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1E293B' }}>{initial ? 'Editar Patch Panel' : 'Nuevo Patch Panel'}</div>
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
            <button onClick={handleSave} disabled={!form.name || !form.type || !nomenclatureAvailable || saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 10, border: 'none', background: (!form.name || !form.type || !nomenclatureAvailable) ? '#CBD5E1' : '#22C55E', color: '#fff', cursor: (!form.name || !form.type || !nomenclatureAvailable) ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
              {saving ? '...' : <><Check size={16} /> Guardar Patch Panel</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
