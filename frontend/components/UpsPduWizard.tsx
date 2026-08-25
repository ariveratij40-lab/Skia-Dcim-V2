import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Zap, Battery, MapPin, DollarSign, Shield } from 'lucide-react';
import { CATALOGOS } from '../data/catalogos';
import {AssetPlacement} from './AssetPlacementSelector';
import AssetPlacementStep, { placementMatchesActiveBranch } from './AssetPlacementStep';

export type DeviceType = 'UPS' | 'PDU';
export type UPSTopology = 'Online' | 'Interactiva' | 'Offline' | 'Modular';
export type PDUType = 'Básica' | 'Monitoreada' | 'Conmutada' | 'ATS';
export type DeviceStatus = 'Operativo' | 'Degradado' | 'Crítico' | 'Mantenimiento' | 'Fuera de servicio';

export interface UpsPduWizardData {
  code: string; name: string; device_type: DeviceType;
  ups_topology?: UPSTopology; kva?: number; kw?: number;
  battery_runtime_min?: number; battery_health_pct?: number;
  battery_last_replace?: string; battery_next_replace?: string;
  input_voltage?: number; output_voltage?: number; load_pct?: number;
  pdu_type?: PDUType; total_outlets?: number; used_outlets?: number;
  amperage?: number; voltage?: number; metered?: boolean;
  building: string; floor: string; room: string;
  rack_name: string; rack_u: string; mdf_idf_name: string;
  status: DeviceStatus; manufacturer: string; model: string;
  serial: string; mgmt_ip: string; responsible: string;
  install_date: string; last_maintenance: string; notes: string;
  tags?: string[];
  placement_id:string;
}

interface Props {
  onClose: () => void;
  onSave: (data: UpsPduWizardData) => void;
  initial?: Partial<UpsPduWizardData>;
}

const STAGES = [
  { id: 1, label: 'Ubicación',   icon: MapPin,     desc: 'Sucursal y ubicación' },
  { id: 2, label: 'Identificación', icon: Zap,     desc: 'Tipo e identificación' },
  { id: 3, label: 'Técnico',     icon: Battery,    desc: 'Capacidad y parámetros' },
  { id: 4, label: 'Financiero',  icon: DollarSign, desc: 'Costos y proveedor' },
  { id: 5, label: 'Resumen',     icon: Shield,     desc: 'Confirmar y guardar' },
];

const DEVICE_TYPES: DeviceType[] = ['UPS', 'PDU'];
const UPS_TOPOLOGIES: UPSTopology[] = ['Online', 'Interactiva', 'Offline', 'Modular'];
const PDU_TYPES: PDUType[] = ['Básica', 'Monitoreada', 'Conmutada', 'ATS'];
const STATUSES: DeviceStatus[] = ['Operativo', 'Degradado', 'Crítico', 'Mantenimiento', 'Fuera de servicio'];
const STATUS_COLORS: Record<DeviceStatus, string> = {
  'Operativo': '#22C55E', 'Degradado': '#F59E0B', 'Crítico': '#EF4444',
  'Mantenimiento': '#3B82F6', 'Fuera de servicio': '#6B7280',
};
const TYPE_COLORS: Record<DeviceType, string> = { 'UPS': '#4361EE', 'PDU': '#7C3AED' };

const EMPTY: UpsPduWizardData = {
  code: '', name: '', device_type: 'UPS',
  ups_topology: 'Online', kva: 0, kw: 0,
  battery_runtime_min: 0, battery_health_pct: 100,
  battery_last_replace: '', battery_next_replace: '',
  input_voltage: 220, output_voltage: 220, load_pct: 0,
  pdu_type: 'Básica', total_outlets: 0, used_outlets: 0,
  amperage: 0, voltage: 220, metered: false,
  building: '', floor: '', room: '',
  rack_name: '', rack_u: '', mdf_idf_name: '',
  status: 'Operativo', manufacturer: '', model: '',
  serial: '', mgmt_ip: '', responsible: '',
  install_date: '', last_maintenance: '', notes: '',
  tags: [], placement_id:'',
};

export default function UpsPduWizard({ onClose, onSave, initial }: Props) {
  const [stage, setStage] = useState(1);
  const [form, setForm] = useState<UpsPduWizardData>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [nomenclatureAvailable, setNomenclatureAvailable] = useState(false);
  const [placement,setPlacement]=useState<AssetPlacement>();
  const [placementBranchID,setPlacementBranchID]=useState('');

  const set = (field: keyof UpsPduWizardData, value: any) =>
    setForm(f => ({ ...f, [field]: value }));

  const completedStages = (): number[] => {
    const c: number[] = [];
    if (form.placement_id && nomenclatureAvailable) c.push(1);
    if (form.name && form.device_type && form.status) c.push(2);
    if (form.device_type === 'UPS' ? form.kva : form.total_outlets) c.push(3);
    if (form.manufacturer) c.push(4);
    return c;
  };

  const handleSave = async () => {
    if (!form.name || !form.device_type || !nomenclatureAvailable || !form.placement_id || !await placementMatchesActiveBranch(placementBranchID,form.placement_id)) { setStage(1); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 300));
    onSave(form);
    setSaving(false);
  };

  const inp = (field: keyof UpsPduWizardData, placeholder: string, type = 'text') => (
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
        <AssetPlacementStep assetType={form.device_type} placementID={form.placement_id} placement={placement} onBranchChange={setPlacementBranchID} onNomenclatureAvailability={setNomenclatureAvailable} onPlacementChange={(id,p)=>{set('placement_id',id);setPlacement(p);set('mdf_idf_name',p?.name||'');if(p?.type==='WAREHOUSE')set('status','Fuera de servicio')}} />
      );
      case 2: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>{fld('Tipo de dispositivo', chips(DEVICE_TYPES, form.device_type, v => {if(v!==form.device_type){set('device_type',v as DeviceType);setNomenclatureAvailable(false);setStage(1)}}, TYPE_COLORS))}</div>
            <div>{fld('Nombre descriptivo', inp('name', 'UPS Principal MDF'))}</div>
            <div>{fld('Fabricante', (
              <select value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
                <option value="">Seleccionar fabricante</option>
                {['APC','Eaton','Vertiv','Schneider Electric','CyberPower','Tripp Lite','Emerson','Huawei','Delta','Socomec','Legrand','Powerware'].map(m => <option key={m}>{m}</option>)}
              </select>
            ))}</div>
            <div>{fld('Modelo', inp('model', 'Smart-UPS SRT 10kVA'))}</div>
            <div>{fld('No. Serie', inp('serial', 'APC-SRT10-001'))}</div>
            <div>{fld('Responsable', inp('responsible', 'Ing. Carlos Méndez'))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Estado', placement?.type==='WAREHOUSE' ? <div style={{padding:10,background:'#FFF7ED',color:'#9A3412',borderRadius:8,fontWeight:700}}>Fuera de servicio — activo en Almacén</div> : chips(STATUSES, form.status, v => set('status', v as DeviceStatus), STATUS_COLORS))}</div>
          </div>
        </div>
      );
      case 3: return (
        <div style={{ display: 'grid', gap: 14 }}>
          {form.device_type === 'UPS' ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>{fld('Topología UPS', chips(UPS_TOPOLOGIES, form.ups_topology ?? 'Online', v => set('ups_topology', v as UPSTopology)))}</div>
            <div style={{ gridColumn: '1/-1' }} />
            <div>{fld('Capacidad (kVA)', inp('kva', '10', 'number'))}</div>
            <div>{fld('Potencia (kW)', inp('kw', '9', 'number'))}</div>
            <div>{fld('Autonomía (min)', inp('battery_runtime_min', '30', 'number'))}</div>
            <div>{fld('Salud batería (%)', inp('battery_health_pct', '100', 'number'))}</div>
            <div>{fld('Voltaje entrada (V)', inp('input_voltage', '220', 'number'))}</div>
            <div>{fld('Voltaje salida (V)', inp('output_voltage', '220', 'number'))}</div>
            <div>{fld('Carga actual (%)', inp('load_pct', '0', 'number'))}</div>
            <div>{fld('IP de gestión', inp('mgmt_ip', '10.0.0.10'))}</div>
            <div>{fld('Último reemplazo batería', inp('battery_last_replace', '', 'date'))}</div>
            <div>{fld('Próximo reemplazo', inp('battery_next_replace', '', 'date'))}</div>
          </div> : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>{fld('Tipo de PDU', chips(PDU_TYPES, form.pdu_type ?? 'Básica', v => set('pdu_type', v as PDUType)))}</div>
            <div>{fld('Total de salidas', inp('total_outlets', '24', 'number'))}</div>
            <div>{fld('Salidas usadas', inp('used_outlets', '0', 'number'))}</div>
            <div>{fld('Amperaje (A)', inp('amperage', '32', 'number'))}</div>
            <div>{fld('Voltaje (V)', inp('voltage', '220', 'number'))}</div>
            <div>{fld('IP de gestión', inp('mgmt_ip', '10.0.0.20'))}</div>
          </div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>{fld('Edificio', inp('building', 'Torre A'))}</div>
          <div>{fld('Piso', inp('floor', 'Sótano 1'))}</div>
          <div>{fld('Rack', inp('rack_name', 'Rack Principal MDF'))}</div>
          <div>{fld('Unidades de rack (U)', inp('rack_u', '7-10U'))}</div>
          <div>{fld('Fecha de instalación', inp('install_date', '', 'date'))}</div>
          <div>{fld('Último mantenimiento', inp('last_maintenance', '', 'date'))}</div>
          </div>
        </div>
      );
      case 4: return (
        <div>
          <div style={{ gridColumn: '1/-1' }}>{fld('Notas', (
              <textarea placeholder="Observaciones sobre el equipo..." value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B', resize: 'vertical', outline: 'none' }} />
            ))}</div>
          <div style={{ padding: 12, background: '#F0F9FF', borderRadius: 10, border: '1px solid #BAE6FD', fontSize: '0.82rem', color: '#0369A1', marginBottom: 16 }}>
            Los datos financieros se completan desde el módulo de Administración → Integradores.
          </div>
          {fld('Proveedor / Integrador', (
            <select value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
              <option value="">Seleccionar proveedor</option>
              {CATALOGOS.integradores.map(i => <option key={i}>{i}</option>)}
            </select>
          ))}
        </div>
      );
      case 5: return (
        <div>
          <div style={{ background: '#F0F4FF', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4361EE', marginBottom: 12 }}>Resumen del registro</div>
            {[
              ['Código', form.code || '—'],
              ['Tipo', form.device_type || '—'],
              ['Estado', form.status || '—'],
              ['Fabricante / Modelo', [form.manufacturer, form.model].filter(Boolean).join(' ') || '—'],
              form.device_type === 'UPS'
                ? ['Capacidad', form.kva ? `${form.kva} kVA / ${form.kw} kW` : '—']
                : ['Salidas', form.total_outlets ? `${form.total_outlets} salidas` : '—'],
              ['Ubicación', [form.building, form.floor, form.room].filter(Boolean).join(' / ') || '—'],
              ['Responsable', form.responsible || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E8EBF4', fontSize: '0.82rem' }}>
                <span style={{ color: '#64748B' }}>{k}</span>
                <span style={{ color: '#1E293B', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: 12, background: '#FFF7ED', borderRadius: 10, border: '1px solid #FED7AA', fontSize: '0.8rem', color: '#92400E' }}>
            ✓ Puedes completar parámetros de batería, mantenimiento y relaciones después desde el inventario.
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
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1E293B' }}>{initial ? `Editar ${form.device_type}` : `Nuevo ${form.device_type}`}</div>
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
              <button key={s.id} disabled={s.id>1&&!form.placement_id} onClick={() => (s.id===1||form.placement_id)&&setStage(s.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: s.id>1&&!form.placement_id?'not-allowed':'pointer', opacity:s.id>1&&!form.placement_id?0.55:1, background: isActive ? '#EEF2FF' : isDone ? '#F0FDF4' : '#F8FAFF', transition: 'all 150ms' }}>
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
            <button onClick={() => setStage(s => Math.min(STAGES.length, s + 1))} disabled={stage===1&&(!form.placement_id||!nomenclatureAvailable)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 10, border: 'none', background: stage===1&&(!form.placement_id||!nomenclatureAvailable)?'#CBD5E1':'#4361EE', color: '#fff', cursor: stage===1&&(!form.placement_id||!nomenclatureAvailable)?'not-allowed':'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
              Siguiente <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={handleSave} disabled={!form.name || !form.device_type || !form.placement_id || !nomenclatureAvailable || saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 10, border: 'none', background: (!form.name || !form.device_type || !nomenclatureAvailable) ? '#CBD5E1' : '#22C55E', color: '#fff', cursor: (!form.name || !form.device_type || !nomenclatureAvailable) ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
              {saving ? '...' : <><Check size={16} /> Guardar {form.device_type}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
