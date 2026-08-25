import { useState, useEffect, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Cable, Tag, MapPin, DollarSign, Shield, AlertCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import NomenclatureCodeField from './NomenclatureCodeField';

export type FiberType = 'OM2' | 'OM3' | 'OM4' | 'OS1' | 'OS2' | 'UTP Cat6' | 'UTP Cat6A';
export type JumperLen = '3 Pies' | '7 Pies' | '10 Pies' | '15 Pies' | '20 Pies' | 'Otro';
export type BBStatus = 'Activo' | 'Inactivo' | 'Baja' | 'En mantenimiento';

export interface BackboneWizardData {
  codigo: string; name: string; marca: string; tipo_fibra: FiberType;
  idf_origen: string; idf_destino: string;
  panel_mdf: string; panel_idf: string;
  jumper: JumperLen; switch_ref: string;
  hilos: string; longitud: string;
  ver_plano: boolean; normativa: boolean;
  certificado_fluke: string; integrador: string;
  po: string; costo_dls: number; centro_costos: string;
  rfid: string; anio_instalacion: number;
  status: BBStatus; observaciones: string; foto: string;
}

interface Props {
  onClose: () => void;
  onSave: (data: BackboneWizardData) => void;
  initial?: Partial<BackboneWizardData>;
}

const STAGES = [
  { id: 1, label: 'Alta rápida', icon: Cable,      desc: 'Identificación básica' },
  { id: 2, label: 'Técnico',     icon: Tag,        desc: 'Fibra y conectores' },
  { id: 3, label: 'Trayecto',    icon: MapPin,     desc: 'Origen y destino' },
  { id: 4, label: 'Financiero',  icon: DollarSign, desc: 'Costos y proveedor' },
  { id: 5, label: 'Resumen',     icon: Shield,     desc: 'Confirmar y guardar' },
];

const FIBER_TYPES: FiberType[] = ['OM2','OM3','OM4','OS1','OS2','UTP Cat6','UTP Cat6A'];
const JUMPER_LENS: JumperLen[] = ['3 Pies','7 Pies','10 Pies','15 Pies','20 Pies','Otro'];
const BB_STATUSES: BBStatus[] = ['Activo','Inactivo','Baja','En mantenimiento'];
const STATUS_COLORS: Record<BBStatus, string> = {
  'Activo': '#22C55E', 'Inactivo': '#F59E0B', 'Baja': '#EF4444', 'En mantenimiento': '#3B82F6',
};
const FIBER_COLORS: Record<FiberType, string> = {
  'OM2': '#F59E0B', 'OM3': '#3B82F6', 'OM4': '#7C3AED', 'OS1': '#EF4444',
  'OS2': '#EC4899', 'UTP Cat6': '#22C55E', 'UTP Cat6A': '#0891B2',
};
const HILOS = ['2 hilos','4 hilos','6 hilos','8 hilos','12 hilos','24 hilos','48 hilos'];

const EMPTY: BackboneWizardData = {
  codigo: '', name: '', marca: '', tipo_fibra: 'OM4',
  idf_origen: '', idf_destino: '',
  panel_mdf: '', panel_idf: '',
  jumper: '7 Pies', switch_ref: '',
  hilos: '12 hilos', longitud: '',
  ver_plano: false, normativa: false,
  certificado_fluke: '', integrador: '',
  po: '', costo_dls: 0, centro_costos: '',
  rfid: '', anio_instalacion: new Date().getFullYear(),
  status: 'Activo', observaciones: '', foto: '',
};

export default function BackboneWizard({ onClose, onSave, initial }: Props) {
  const [stage, setStage] = useState(1);
  const [form, setForm] = useState<BackboneWizardData>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [nomenclatureAvailable, setNomenclatureAvailable] = useState(false);

  // ── Catálogo de fabricantes ──────────────────────────────────────────────
  const [manufacturers, setManufacturers] = useState<{ id: string; name: string }[]>([]);
  const [showNewMfModal, setShowNewMfModal] = useState(false);
  const [newMfName, setNewMfName] = useState('');
  const [newMfSaving, setNewMfSaving] = useState(false);
  const [newMfError, setNewMfError] = useState('');

  const handleCreateManufacturer = async () => {
    const name = newMfName.trim();
    if (!name) { setNewMfError('El nombre es obligatorio.'); return; }
    setNewMfSaving(true);
    setNewMfError('');
    try {
      const res = await axios.post('/api/dcim/catalogs/manufacturers', { name });
      const created = { id: res.data?.id ?? name, name };
      setManufacturers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      set('marca', name);
      setShowNewMfModal(false);
      setNewMfName('');
    } catch (e: any) {
      setNewMfError(e?.response?.data?.error ?? 'Error al guardar el fabricante.');
    } finally {
      setNewMfSaving(false);
    }
  };

  // ── Validación de código ─────────────────────────────────────────────────
  const [codeChecking, setCodeChecking] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [codeSuggestion, setCodeSuggestion] = useState('');
  const [codeAvailable, setCodeAvailable] = useState<boolean | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (field: keyof BackboneWizardData, value: any) =>
    setForm(f => ({ ...f, [field]: value }));

  // Cargar fabricantes y sugerencia de código al montar
  useEffect(() => {
    // Fabricantes del catálogo
    axios.get('/api/dcim/catalogs/manufacturers')
      .then(res => {
        const list = res.data?.manufacturers ?? [];
        setManufacturers(list);
      })
      .catch(() => setManufacturers([]));

  }, []);

  // Validar código en tiempo real con debounce 600ms
  const handleCodeChange = (value: string) => {
    set('codigo', value);
    setCodeError('');
    setCodeAvailable(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setCodeChecking(false); return; }
    setCodeChecking(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(`/api/infra/backbone/check?code=${encodeURIComponent(value)}`);
        setCodeAvailable(res.data.code_available);
        setCodeError(res.data.code_error ?? '');
        setCodeSuggestion(res.data.suggestion ?? '');
      } catch {
        setCodeAvailable(null);
      } finally {
        setCodeChecking(false);
      }
    }, 600);
  };

  const completedStages = (): number[] => {
    const c: number[] = [];
    if (form.name && form.tipo_fibra && form.status && nomenclatureAvailable) c.push(1);
    if (form.hilos && form.longitud) c.push(2);
    if (form.idf_origen && form.idf_destino) c.push(3);
    if (form.integrador) c.push(4);
    return c;
  };

  const handleSave = async () => {
    if (!form.name || !form.tipo_fibra || !nomenclatureAvailable) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 300));
    onSave(form);
    setSaving(false);
  };

  const inp = (field: keyof BackboneWizardData, placeholder: string, type = 'text') => (
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

  const tog = (field: keyof BackboneWizardData, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F8FAFF', borderRadius: 10, border: '1.5px solid #E8EBF4', marginBottom: 10 }}>
      <span style={{ fontSize: '0.875rem', color: '#334155' }}>{label}</span>
      <button onClick={() => set(field, !form[field])} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: form[field] ? '#4361EE' : '#CBD5E1', transition: 'background 200ms', position: 'relative' }}>
        <span style={{ position: 'absolute', top: 3, left: form[field] ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </button>
    </div>
  );

  const renderStage = () => {
    switch (stage) {
      case 1: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* ── Campo Código con validación de unicidad ── */}
            <div style={{ gridColumn: '1/-1', marginBottom: 14 }}>
              {lbl('Código técnico', true)}
              <NomenclatureCodeField assetType="BACKBONE" onAvailability={setNomenclatureAvailable} />
              {/* Error de duplicado */}
              {codeError && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: '0.75rem', color: '#DC2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={12} />
                  {codeError}
                  {codeSuggestion && codeSuggestion !== form.codigo && (
                    <button
                      onClick={() => { handleCodeChange(codeSuggestion); }}
                      style={{ marginLeft: 'auto', padding: '2px 8px', background: '#4361EE', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                      Usar {codeSuggestion}
                    </button>
                  )}
                </div>
              )}
              {/* Sugerencia de siguiente disponible (sin error) */}
              {!codeError && codeSuggestion && codeSuggestion !== form.codigo && (
                <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Siguiente disponible:</span>
                  <button
                    onClick={() => handleCodeChange(codeSuggestion)}
                    style={{ padding: '2px 8px', background: '#EEF2FF', color: '#4361EE', border: '1px solid #C7D2FE', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                    {codeSuggestion}
                  </button>
                </div>
              )}
            </div>

            <div style={{ gridColumn: '1/-1' }}>{fld('Nombre descriptivo', inp('name', 'Backbone principal MDF-IDF'), true)}</div>

            <div style={{ gridColumn: '1/-1' }}>{fld('Tipo de fibra / cable', chips(FIBER_TYPES, form.tipo_fibra, v => set('tipo_fibra', v as FiberType), FIBER_COLORS))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Estado', chips(BB_STATUSES, form.status, v => set('status', v as BBStatus), STATUS_COLORS))}</div>

            {/* ── Campo Marca desde catálogo de Fabricantes ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                {lbl('Marca / Fabricante')}
                <button
                  onClick={() => { setShowNewMfModal(true); setNewMfName(''); setNewMfError(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', background: '#EEF2FF', color: '#4361EE', border: '1px solid #C7D2FE', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  + Nuevo
                </button>
              </div>
              <select
                value={form.marca}
                onChange={e => set('marca', e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: form.marca ? '#1E293B' : '#94A3B8', outline: 'none' }}
              >
                <option value="">Seleccionar fabricante...</option>
                {manufacturers.length > 0
                  ? manufacturers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)
                  : ['Panduit','Corning','Belden','CommScope','Draka','OFS','Sumitomo','Nexans','Prysmian'].map(m => <option key={m} value={m}>{m}</option>)
                }
              </select>

              {/* ── Mini-modal inline: Nuevo Fabricante ── */}
              {showNewMfModal && (
                <div style={{ marginTop: 10, padding: 14, background: '#F8FAFF', borderRadius: 12, border: '1.5px solid #C7D2FE', boxShadow: '0 4px 16px rgba(67,97,238,0.10)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4361EE' }}>Nuevo Fabricante</span>
                    <button onClick={() => setShowNewMfModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 2 }}>
                      <X size={14} />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Ej: Panduit, Corning, Belden..."
                    value={newMfName}
                    onChange={e => { setNewMfName(e.target.value); setNewMfError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateManufacturer(); if (e.key === 'Escape') setShowNewMfModal(false); }}
                    autoFocus
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${newMfError ? '#EF4444' : '#C7D2FE'}`, fontSize: '0.85rem', background: '#fff', color: '#1E293B', outline: 'none', marginBottom: 8 }}
                  />
                  {newMfError && (
                    <div style={{ fontSize: '0.72rem', color: '#EF4444', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertCircle size={11} /> {newMfError}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setShowNewMfModal(false)}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #E8EBF4', background: '#fff', color: '#64748B', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer' }}
                    >Cancelar</button>
                    <button
                      onClick={handleCreateManufacturer}
                      disabled={newMfSaving || !newMfName.trim()}
                      style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: newMfSaving || !newMfName.trim() ? '#CBD5E1' : '#4361EE', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: newMfSaving || !newMfName.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      {newMfSaving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
                      {newMfSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>{fld('Año de instalación', inp('anio_instalacion', '2024', 'number'))}</div>
          </div>
        </div>
      );
      case 2: return (
        <div>
          {fld('Hilos / Fibras', chips(HILOS, form.hilos, v => set('hilos', v)))}
          <div style={{ height: 14 }} />
          {fld('Longitud (metros)', inp('longitud', '350 mts'))}
          {fld('Jumper de conexión', chips(JUMPER_LENS, form.jumper, v => set('jumper', v as JumperLen)))}
          <div style={{ height: 14 }} />
          {fld('Switch de referencia', inp('switch_ref', 'SW-MDF-0001'))}
          {fld('Certificado Fluke', inp('certificado_fluke', 'FLK-2024-001'))}
          <div style={{ marginTop: 8 }}>
            {tog('ver_plano', 'Visible en plano')}
            {tog('normativa', 'Normativa aprobada')}
          </div>
        </div>
      );
      case 3: return (
        <div>
          {fld('IDF / Punto de origen', inp('idf_origen', 'MDF-E1-A'), true)}
          {fld('IDF / Punto de destino', inp('idf_destino', 'IDF1-P1-E1'), true)}
          {fld('Panel MDF (origen)', inp('panel_mdf', 'PDF0001-MDF-E1-A'))}
          {fld('Panel IDF (destino)', inp('panel_idf', 'PDF0001-IDF1-E1'))}
          {fld('Etiqueta RFID', inp('rfid', 'RFID-BB-0001'))}
          {fld('Observaciones', (
            <textarea placeholder="Notas sobre el trayecto, conduit, acceso..." value={form.observaciones} onChange={e => set('observaciones', e.target.value)} rows={3}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B', resize: 'vertical', outline: 'none' }} />
          ))}
        </div>
      );
      case 4: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>{fld('Integrador / Proveedor', (
              <select value={form.integrador} onChange={e => set('integrador', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
                <option value="">Seleccionar integrador</option>
                {/* Cargado dinámicamente desde el catálogo de proveedores */}
              </select>
            ))}</div>
            <div>{fld('Orden de Compra (PO)', inp('po', 'PO-2024-001'))}</div>
            <div>{fld('Costo (USD)', inp('costo_dls', '1200', 'number'))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Centro de Costos', inp('centro_costos', 'CC-TI-001'))}</div>
          </div>
        </div>
      );
      case 5: return (
        <div>
          <div style={{ background: '#F0F4FF', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4361EE', marginBottom: 12 }}>Resumen del registro</div>
            {[
              ['Código', form.codigo || '—'],
              ['Tipo de fibra', form.tipo_fibra || '—'],
              ['Estado', form.status || '—'],
              ['Marca', form.marca || '—'],
              ['Hilos / Longitud', `${form.hilos} / ${form.longitud || '—'}`],
              ['Origen → Destino', form.idf_origen && form.idf_destino ? `${form.idf_origen} → ${form.idf_destino}` : '—'],
              ['Integrador', form.integrador || '—'],
              ['Costo', form.costo_dls ? `$${form.costo_dls.toLocaleString()} USD` : '—'],
              ['Normativa', form.normativa ? '✓ Aprobada' : '✗ Pendiente'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E8EBF4', fontSize: '0.82rem' }}>
                <span style={{ color: '#64748B' }}>{k}</span>
                <span style={{ color: '#1E293B', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          {codeAvailable === false && (
            <div style={{ padding: 10, background: '#FEF2F2', borderRadius: 10, border: '1px solid #FECACA', fontSize: '0.8rem', color: '#DC2626', marginBottom: 12 }}>
              ⚠ El código ingresado ya existe. Regresa a la Etapa 1 y usa el código sugerido.
            </div>
          )}
          <div style={{ padding: 12, background: '#FFF7ED', borderRadius: 10, border: '1px solid #FED7AA', fontSize: '0.8rem', color: '#92400E' }}>
            ✓ Puedes completar fotos, normativa y relaciones después desde el inventario.
          </div>
        </div>
      );
      default: return null;
    }
  };

  const completed = completedStages();
  const canSave = !!form.name && !!form.tipo_fibra && nomenclatureAvailable;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(15,23,42,0.18)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1E293B' }}>{initial ? 'Editar Backbone' : 'Nuevo Backbone'}</div>
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
            <button
              onClick={() => {
                // En etapa 1, bloquear si código no disponible
                if (stage === 1 && codeAvailable === false) return;
                setStage(s => Math.min(STAGES.length, s + 1));
              }}
              disabled={stage === 1 && codeAvailable === false}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 10, border: 'none', background: (stage === 1 && codeAvailable === false) ? '#CBD5E1' : '#4361EE', color: '#fff', cursor: (stage === 1 && codeAvailable === false) ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
              Siguiente <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={handleSave} disabled={!canSave || saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 10, border: 'none', background: !canSave ? '#CBD5E1' : '#22C55E', color: '#fff', cursor: !canSave ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
              {saving ? '...' : <><Check size={16} /> Guardar Backbone</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
