import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Building2, Server, MapPin, Users, Shield, RefreshCw, AlertCircle, Package } from 'lucide-react';
import { CATALOGOS } from '../data/catalogos';

export type MdfIdfType = 'MDF' | 'IDF' | 'Site' | 'Sala Técnica';
export type MdfIdfStatus = 'Operativo' | 'Atención' | 'Crítico' | 'Planeado' | 'Fuera de servicio';

export interface MdfIdfWizardData {
  code: string; name: string; type: MdfIdfType; status: MdfIdfStatus;
  building: string; floor: string; zone: string; address: string;
  responsible: string; responsible_email: string;
  racks_count: number; switches_count: number; ups_count: number;
  nodes_count: number; servers_count: number;
  capacity_u: number; used_u: number;
  cooling: string; power_kva: number;
  floor_plan_ref: string; photo_url: string; notes: string; tags: string[];
}

interface AssetSummary {
  RACK: number; SWITCH: number; UPS: number; NODE: number;
  PDU: number; PATCH_PANEL: number; BACKBONE: number;
  total: number;
}

interface Props {
  onClose: () => void;
  onSave: (data: MdfIdfWizardData) => void;
  initial?: Partial<MdfIdfWizardData>;
}

const STAGES = [
  { id: 1, label: 'Alta rápida', icon: Building2, desc: 'Identificación básica' },
  { id: 2, label: 'Ubicación',   icon: MapPin,    desc: 'Localización física' },
  { id: 3, label: 'Capacidad',   icon: Server,    desc: 'Equipamiento y U' },
  { id: 4, label: 'Responsable', icon: Users,     desc: 'Contacto y gestión' },
  { id: 5, label: 'Resumen',     icon: Shield,    desc: 'Confirmar y guardar' },
];

const TYPES: MdfIdfType[] = ['MDF', 'IDF', 'Site', 'Sala Técnica'];
const STATUSES: MdfIdfStatus[] = ['Operativo', 'Atención', 'Crítico', 'Planeado', 'Fuera de servicio'];
const STATUS_COLORS: Record<MdfIdfStatus, string> = {
  'Operativo': '#22C55E', 'Atención': '#F59E0B', 'Crítico': '#EF4444',
  'Planeado': '#3B82F6', 'Fuera de servicio': '#6B7280',
};
const TYPE_COLORS: Record<MdfIdfType, string> = {
  'MDF': '#4361EE', 'IDF': '#7C3AED', 'Site': '#0891B2', 'Sala Técnica': '#059669',
};

const EMPTY: MdfIdfWizardData = {
  code: '', name: '', type: 'IDF', status: 'Operativo',
  building: '', floor: '', zone: '', address: '',
  responsible: '', responsible_email: '',
  racks_count: 0, switches_count: 0, ups_count: 0, nodes_count: 0, servers_count: 0,
  capacity_u: 42, used_u: 0, cooling: '', power_kva: 0,
  floor_plan_ref: '', photo_url: '', notes: '', tags: [],
};

export default function MdfIdfWizard({ onClose, onSave, initial }: Props) {
  const [stage, setStage] = useState(1);
  const [form, setForm] = useState<MdfIdfWizardData>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);

  // ── Estado del paso 3: activos del inventario ──────────────────────────────
  const [assetSummary, setAssetSummary] = useState<AssetSummary | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetsError, setAssetsError] = useState('');

  const set = (field: keyof MdfIdfWizardData, value: any) =>
    setForm(f => ({ ...f, [field]: value }));

  // Cargar activos cuando se llega al paso 3
  useEffect(() => {
    if (stage === 3) loadAssetSummary();
  }, [stage]);

  const loadAssetSummary = async () => {
    setLoadingAssets(true);
    setAssetsError('');
    try {
      const res = await fetch('/api/dcim/assets');
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      const assets: any[] = data.assets ?? [];

      // Contar por tipo de activo
      const counts: AssetSummary = {
        RACK: 0, SWITCH: 0, UPS: 0, NODE: 0,
        PDU: 0, PATCH_PANEL: 0, BACKBONE: 0, total: assets.length,
      };
      for (const a of assets) {
        const code = (a.asset_type_code ?? '').toUpperCase();
        if (code in counts) (counts as any)[code]++;
      }

      setAssetSummary(counts);

      // Pre-poblar los campos del formulario con los conteos reales
      setForm(f => ({
        ...f,
        racks_count:    counts.RACK,
        switches_count: counts.SWITCH,
        ups_count:      counts.UPS,
        nodes_count:    counts.NODE + counts.PDU + counts.PATCH_PANEL,
        servers_count:  0, // los servidores no tienen tipo propio aún
      }));
    } catch (err: any) {
      setAssetsError(err.message ?? 'No se pudo cargar el inventario');
    } finally {
      setLoadingAssets(false);
    }
  };

  const completedStages = (): number[] => {
    const c: number[] = [];
    if (form.code && form.name && form.type && form.status) c.push(1);
    if (form.building) c.push(2);
    if (form.capacity_u) c.push(3);
    if (form.responsible) c.push(4);
    return c;
  };

  const handleSave = async () => {
    if (!form.code || !form.name || !form.type) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 300));
    onSave(form);
    setSaving(false);
  };

  const inp = (field: keyof MdfIdfWizardData, placeholder: string, type = 'text') => (
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
            padding: '6px 16px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 500,
            border: `1.5px solid ${active ? color : '#E8EBF4'}`,
            background: active ? `${color}18` : '#F8FAFF',
            color: active ? color : '#64748B', cursor: 'pointer', transition: 'all 120ms',
          }}>{opt}</button>
        );
      })}
    </div>
  );

  // ── Tarjeta de activo con conteo real ──────────────────────────────────────
  const AssetCountCard = ({
    label, count, icon, color, fieldKey,
  }: {
    label: string; count: number; icon: string; color: string;
    fieldKey: keyof MdfIdfWizardData;
  }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 12,
      border: `1.5px solid ${color}30`,
      background: `${color}08`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${color}18`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: color }}>
          {count}
          <span style={{ fontSize: '0.7rem', fontWeight: 500, color: '#94A3B8', marginLeft: 4 }}>
            registrados
          </span>
        </div>
      </div>
      {/* Ajuste manual con +/- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <button
          onClick={() => set(fieldKey, Math.max(0, (form[fieldKey] as number) - 1))}
          style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #E8EBF4', background: '#F8FAFF', cursor: 'pointer', fontSize: '0.9rem', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1E293B', minWidth: 20, textAlign: 'center' }}>
          {form[fieldKey] as number}
        </span>
        <button
          onClick={() => set(fieldKey, (form[fieldKey] as number) + 1)}
          style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #E8EBF4', background: '#F8FAFF', cursor: 'pointer', fontSize: '0.9rem', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>
    </div>
  );

  const renderStage = () => {
    switch (stage) {
      case 1: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>{fld('Código', inp('code', 'MDF-001', 'text'), true)}</div>
            <div>{fld('Tipo', chips(TYPES, form.type, v => set('type', v as MdfIdfType), TYPE_COLORS))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Nombre del cuarto técnico', inp('name', 'MDF Principal Torre A'), true)}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Estado', chips(STATUSES, form.status, v => set('status', v as MdfIdfStatus), STATUS_COLORS))}</div>
          </div>
        </div>
      );
      case 2: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>{fld('Edificio', inp('building', 'Torre A'))}</div>
            <div>{fld('Piso', inp('floor', 'Piso 3'))}</div>
            <div>{fld('Zona / Closet', inp('zone', 'Closet Telecomunicaciones'))}</div>
            <div>{fld('Referencia en plano', inp('floor_plan_ref', 'Plano MDF-A S1'))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Dirección completa', inp('address', 'Av. Reforma 123, CDMX'))}</div>
            <div style={{ gridColumn: '1/-1' }}>{fld('Notas / Observaciones', (
              <textarea placeholder="Descripción del cuarto, acceso, condiciones..." value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B', resize: 'vertical', outline: 'none' }} />
            ))}</div>
          </div>
        </div>
      );
      case 3: return (
        <div>
          {/* Capacidad física — campos editables */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
            <div>{fld('Capacidad total (U)', inp('capacity_u', '42', 'number'))}</div>
            <div>{fld('Unidades usadas (U)', inp('used_u', '0', 'number'))}</div>
            <div>{fld('Potencia (kVA)', inp('power_kva', '0', 'number'))}</div>
            <div>{fld('Sistema de enfriamiento', (
              <select value={form.cooling} onChange={e => set('cooling', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
                <option value="">Sin especificar</option>
                {['Aire acondicionado dedicado','Aire acondicionado de precisión','Ventilación natural','Ventilación forzada','Enfriamiento líquido','Sin enfriamiento'].map(c => <option key={c}>{c}</option>)}
              </select>
            ))}</div>
          </div>

          {/* Equipos del inventario — jalados automáticamente */}
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Package size={13} color="#4361EE" />
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                Equipos registrados en el inventario
              </span>
            </div>
            <button
              onClick={loadAssetSummary}
              disabled={loadingAssets}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: '1px solid #E8EBF4', background: '#F8FAFF', cursor: loadingAssets ? 'wait' : 'pointer', fontSize: '0.72rem', color: '#4361EE', fontWeight: 600 }}>
              <RefreshCw size={11} style={{ animation: loadingAssets ? 'spin 1s linear infinite' : 'none' }} />
              {loadingAssets ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>

          {assetsError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 10, marginBottom: 10, fontSize: '0.78rem', color: '#BE123C' }}>
              <AlertCircle size={13} />
              {assetsError} — los conteos se pueden ajustar manualmente.
            </div>
          )}

          {loadingAssets ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{ height: 58, borderRadius: 12, background: '#F1F5F9', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <AssetCountCard label="Racks"         count={assetSummary?.RACK ?? 0}    icon="🗄️" color="#6366F1" fieldKey="racks_count" />
              <AssetCountCard label="Switches"      count={assetSummary?.SWITCH ?? 0}  icon="🔀" color="#0891B2" fieldKey="switches_count" />
              <AssetCountCard label="UPS"           count={assetSummary?.UPS ?? 0}     icon="⚡" color="#F59E0B" fieldKey="ups_count" />
              <AssetCountCard label="Nodos / Puntos" count={assetSummary ? assetSummary.NODE + assetSummary.PDU + assetSummary.PATCH_PANEL : 0} icon="🖥️" color="#059669" fieldKey="nodes_count" />
              <AssetCountCard label="Servidores"    count={assetSummary?.NODE ?? 0}    icon="💾" color="#7C3AED" fieldKey="servers_count" />
            </div>
          )}

          {assetSummary && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#EEF2FF', borderRadius: 10, fontSize: '0.75rem', color: '#4361EE', fontWeight: 600 }}>
              📦 Total de activos en el inventario: <strong>{assetSummary.total}</strong>
              <span style={{ fontWeight: 400, color: '#6366F1', marginLeft: 6 }}>
                — Puedes ajustar los conteos con +/− si este MDF/IDF solo alberga un subconjunto.
              </span>
            </div>
          )}
        </div>
      );
      case 4: return (
        <div>
          {fld('Responsable técnico', inp('responsible', 'Ing. Carlos Méndez'))}
          {fld('Correo del responsable', inp('responsible_email', 'carlos@empresa.com', 'email'))}
          {fld('Integrador / Proveedor', (
            <select value={form.tags[0] ?? ''} onChange={e => set('tags', e.target.value ? [e.target.value] : [])} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B' }}>
              <option value="">Seleccionar integrador</option>
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
              ['Tipo', form.type || '—'],
              ['Nombre', form.name || '—'],
              ['Estado', form.status || '—'],
              ['Edificio / Piso', [form.building, form.floor].filter(Boolean).join(' / ') || '—'],
              ['Zona', form.zone || '—'],
              ['Capacidad', form.capacity_u ? `${form.capacity_u}U` : '—'],
              ['Responsable', form.responsible || '—'],
              ['Racks / Switches', `${form.racks_count} / ${form.switches_count}`],
              ['UPS / Nodos', `${form.ups_count} / ${form.nodes_count}`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E8EBF4', fontSize: '0.82rem' }}>
                <span style={{ color: '#64748B' }}>{k}</span>
                <span style={{ color: '#1E293B', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: 12, background: '#FFF7ED', borderRadius: 10, border: '1px solid #FED7AA', fontSize: '0.8rem', color: '#92400E' }}>
            ✓ Puedes agregar fotos, normativa y relaciones después desde el inventario.
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
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1E293B' }}>{initial ? 'Editar MDF/IDF' : 'Nuevo MDF / IDF'}</div>
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
            <button onClick={handleSave} disabled={!form.code || !form.name || saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', borderRadius: 10, border: 'none', background: (!form.code || !form.name) ? '#CBD5E1' : '#22C55E', color: '#fff', cursor: (!form.code || !form.name) ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
              {saving ? '...' : <><Check size={16} /> Guardar MDF/IDF</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
