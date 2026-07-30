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

  // ── Estado del paso 1: nomenclaturas para sugerencias de código ──────────────
  interface NamingRule {
    id: string; asset_type_code: string; prefix: string;
    separator: string; seq_digits: number; last_seq: number;
    next_code_preview: string;
    custom_segment_1?: string; custom_segment_2?: string;
  }
  const [namingRules, setNamingRules] = useState<NamingRule[]>([]);
  const [codeSuggestions, setCodeSuggestions] = useState<string[]>([]);
  const [showCodeSuggestions, setShowCodeSuggestions] = useState(false);
  // Patrón de nomenclatura para mostrar como etiqueta de referencia
  const [codePattern, setCodePattern] = useState<string | null>(null);
  const [codePatternUrl, setCodePatternUrl] = useState<string>('/infraestructura/catalogs/nomenclaturas');

  // Mapa de tipo MDF/IDF → asset_type_code para buscar la regla
  const TYPE_TO_CODE: Record<MdfIdfType, string> = {
    'MDF': 'MDF', 'IDF': 'IDF', 'Site': 'MDF', 'Sala Técnica': 'IDF',
  };

  const loadNamingRules = async () => {
    try {
      const res = await fetch('/api/dcim/catalogs/naming-rules');
      if (!res.ok) return;
      const data = await res.json();
      setNamingRules(data.rules ?? []);
    } catch { /* silencioso */ }
  };

  // Construir el patrón legible para mostrar como etiqueta (ej: MDF-001, IDF-A-001)
  const buildCodePattern = (type: MdfIdfType, rules: NamingRule[]): string | null => {
    const typeCode = TYPE_TO_CODE[type];
    const rule = rules.find(r => r.asset_type_code === typeCode);
    if (!rule) return null;
    const sep = rule.separator || '-';
    const digits = rule.seq_digits || 3;
    const parts: string[] = [rule.prefix];
    if (rule.custom_segment_1) parts.push(rule.custom_segment_1.toUpperCase());
    if (rule.custom_segment_2) parts.push(rule.custom_segment_2.toUpperCase());
    parts.push('0'.repeat(digits)); // placeholder de secuencia
    return parts.join(sep);
  };

  const buildCodeSuggestions = (type: MdfIdfType, rules: NamingRule[]): string[] => {
    const code = TYPE_TO_CODE[type];
    const rule = rules.find(r => r.asset_type_code === code);
    if (!rule) {
      // Fallback genérico si no hay regla configurada
      const prefix = type === 'MDF' ? 'MDF' : type === 'IDF' ? 'IDF' : type === 'Site' ? 'SITE' : 'ST';
      return Array.from({ length: 5 }, (_, i) =>
        `${prefix}-${String(i + 1).padStart(3, '0')}`);
    }
    const sep = rule.separator || '-';
    const digits = rule.seq_digits || 3;
    // Generar los próximos 5 códigos desde last_seq+1
    return Array.from({ length: 5 }, (_, i) =>
      `${rule.prefix}${sep}${String(rule.last_seq + 1 + i).padStart(digits, '0')}`);
  };

  // ── Estado del paso 3: activos del inventario ──────────────────────────────
  const [assetSummary, setAssetSummary] = useState<AssetSummary | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetsError, setAssetsError] = useState('');

  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ── Estado del paso 2: ubicaciones del catálogo ──────────────────────────────
  interface CatalogLocation {
    id: string; name: string; floor: string; room: string;
    zone: string; description: string; asset_count: number;
  }
  const [locations, setLocations] = useState<CatalogLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [showNewLocationForm, setShowNewLocationForm] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', floor: '', room: '', zone: '', description: '' });

  const loadLocations = async () => {
    setLoadingLocations(true);
    try {
      const res = await fetch('/api/dcim/catalogs/locations');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLocations(data.locations ?? []);
    } catch {
      setLocations([]);
    } finally {
      setLoadingLocations(false);
    }
  };

  const saveNewLocation = async () => {
    if (!newLoc.name.trim()) return;
    setSavingLocation(true);
    try {
      const res = await fetch('/api/dcim/catalogs/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLoc),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      // Recargar lista y seleccionar la nueva
      await loadLocations();
      setSelectedLocationId(created.id);
      // Pre-poblar campos del formulario con los datos de la nueva ubicación
      setForm(f => ({
        ...f,
        building: newLoc.name,
        floor: newLoc.floor,
        zone: newLoc.zone,
      }));
      setShowNewLocationForm(false);
      setNewLoc({ name: '', floor: '', room: '', zone: '', description: '' });
    } catch {
      alert('No se pudo guardar la ubicación. Intenta de nuevo.');
    } finally {
      setSavingLocation(false);
    }
  };

  const selectLocation = (loc: CatalogLocation) => {
    setSelectedLocationId(loc.id);
    setForm(f => ({
      ...f,
      building: loc.name,
      floor: loc.floor,
      zone: loc.zone,
    }));
  };

  const set = (field: keyof MdfIdfWizardData, value: any) =>
    setForm(f => ({ ...f, [field]: value }));

  // Generar sugerencias de nombre basadas en tipo y código
  const buildSuggestions = (type: MdfIdfType, code: string): string[] => {
    const codeUpper = code.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const suffixes = [
      'Principal', 'Secundario', 'Torre A', 'Torre B', 'Edificio Central',
      'Piso 1', 'Piso 2', 'Piso 3', 'Piso 4', 'Piso 5',
      'Ala Norte', 'Ala Sur', 'Ala Este', 'Ala Oeste',
      'Planta Baja', 'Sótano', 'Azotea',
    ];
    const prefixMap: Record<MdfIdfType, string> = {
      'MDF': 'MDF',
      'IDF': 'IDF',
      'Site': 'Site',
      'Sala Técnica': 'Sala Técnica',
    };
    const prefix = prefixMap[type];
    // Sugerencias con sufijos comunes
    const base = suffixes.map(s => `${prefix} ${s}`);
    // Si el código tiene número, agregar sugerencia directa
    if (codeUpper) base.unshift(`${prefix} ${codeUpper}`);
    return base.slice(0, 8);
  };

  // Actualizar sugerencias cuando cambia el tipo o el código
  const handleTypeChange = (v: MdfIdfType) => {
    set('type', v);
    setNameSuggestions(buildSuggestions(v, form.code));
    if (!form.name) setShowSuggestions(true);
  };

  const handleCodeChange = (v: string) => {
    set('code', v);
    setNameSuggestions(buildSuggestions(form.type, v));
    if (!form.name) setShowSuggestions(true);
  };

  const handleNameFocus = () => {
    setNameSuggestions(buildSuggestions(form.type, form.code));
    setShowSuggestions(true);
  };

  const handleNameChange = (v: string) => {
    set('name', v);
    if (v.length > 0) {
      const filtered = buildSuggestions(form.type, form.code)
        .filter(s => s.toLowerCase().includes(v.toLowerCase()));
      setNameSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setNameSuggestions(buildSuggestions(form.type, form.code));
      setShowSuggestions(true);
    }
  };

  const selectSuggestion = (s: string) => {
    set('name', s);
    setShowSuggestions(false);
  };

  // Cargar nomenclaturas al montar el wizard
  useEffect(() => {
    loadNamingRules().then(() => {
      // Generar sugerencias iniciales para el tipo por defecto
    });
  }, []);

  // Actualizar sugerencias y patrón cuando cambia el tipo o se cargan las reglas
  useEffect(() => {
    const suggestions = buildCodeSuggestions(form.type, namingRules);
    setCodeSuggestions(suggestions);
    // Si el campo código está vacío, pre-llenar con el primer código sugerido
    if (!form.code && suggestions.length > 0) {
      setForm(f => ({ ...f, code: suggestions[0] }));
    }
    // Calcular el patrón de referencia (ej: MDF-000)
    const pattern = buildCodePattern(form.type, namingRules);
    setCodePattern(pattern);
    // URL de nomenclaturas con el tipo del activo como parámetro
    const typeCode = TYPE_TO_CODE[form.type];
    setCodePatternUrl(`/infraestructura/catalogs/nomenclaturas?type=${typeCode}`);
  }, [form.type, namingRules]);

  // Cargar ubicaciones cuando se llega al paso 2
  useEffect(() => {
    if (stage === 2) loadLocations();
  }, [stage]);

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
  }) => {
    const currentVal = form[fieldKey] as number;
    const isAtMax = currentVal >= count;
    const isAtMin = currentVal <= 0;
    return (
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
      {/* Ajuste manual con +/- — limitado al inventario real */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            disabled={isAtMin}
            onClick={() => set(fieldKey, Math.max(0, currentVal - 1))}
            style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${isAtMin ? '#F1F5F9' : '#E8EBF4'}`, background: isAtMin ? '#F8FAFF' : '#F8FAFF', cursor: isAtMin ? 'not-allowed' : 'pointer', fontSize: '0.9rem', color: isAtMin ? '#CBD5E1' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isAtMin ? 0.4 : 1 }}>−</button>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isAtMax ? color : '#1E293B', minWidth: 20, textAlign: 'center' }}>
            {currentVal}
          </span>
          <button
            disabled={isAtMax || count === 0}
            onClick={() => { if (!isAtMax && count > 0) set(fieldKey, currentVal + 1); }}
            title={isAtMax ? `Máximo: ${count} registrados en inventario` : count === 0 ? 'Sin activos registrados en inventario' : `Máx. ${count}`}
            style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${(isAtMax || count === 0) ? '#F1F5F9' : '#E8EBF4'}`, background: '#F8FAFF', cursor: (isAtMax || count === 0) ? 'not-allowed' : 'pointer', fontSize: '0.9rem', color: (isAtMax || count === 0) ? '#CBD5E1' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (isAtMax || count === 0) ? 0.4 : 1 }}>+</button>
        </div>
        {count > 0 && (
          <span style={{ fontSize: '0.62rem', color: isAtMax ? '#EF4444' : '#94A3B8', fontWeight: 500 }}>
            {isAtMax ? `Límite alcanzado (${count})` : `máx. ${count}`}
          </span>
        )}
        {count === 0 && (
          <span style={{ fontSize: '0.62rem', color: '#F59E0B', fontWeight: 500 }}>sin stock</span>
        )}
      </div>
    </div>
  );
  };

  const renderStage = () => {
    switch (stage) {
      case 1: return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Campo Código con dropdown de nomenclatura */}
            <div style={{ position: 'relative' }}>
              {lbl('Código', true)}
              <input
                type="text"
                placeholder={codeSuggestions[0] ?? 'MDF-001'}
                value={form.code}
                onChange={e => handleCodeChange(e.target.value)}
                onFocus={() => setShowCodeSuggestions(true)}
                onBlur={() => setTimeout(() => setShowCodeSuggestions(false), 150)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${form.code ? '#4361EE' : '#E8EBF4'}`, fontSize: '0.875rem', outline: 'none', background: '#FAFBFF', color: '#1E293B', transition: 'border-color 150ms', boxSizing: 'border-box' }}
              />
              {/* Dropdown de sugerencias de código */}
              {showCodeSuggestions && codeSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
                  background: '#fff', border: '1.5px solid #E8EBF4', borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(15,23,42,0.12)', marginTop: 4, overflow: 'hidden',
                }}>
                  <div style={{ padding: '5px 12px', borderBottom: '1px solid #F1F5F9', fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: TYPE_COLORS[form.type] }}>■</span> Nomenclatura {form.type}
                  </div>
                  {codeSuggestions.map((s, i) => (
                    <button key={i}
                      onMouseDown={() => { set('code', s); setShowCodeSuggestions(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', textAlign: 'left', padding: '8px 14px',
                        border: 'none', background: i === 0 ? '#F0F4FF' : 'transparent',
                        fontSize: '0.85rem', color: '#1E293B', cursor: 'pointer',
                        borderBottom: i < codeSuggestions.length - 1 ? '1px solid #F8FAFF' : 'none',
                        fontWeight: i === 0 ? 700 : 400,
                        transition: 'background 100ms',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#EEF2FF')}
                      onMouseLeave={e => (e.currentTarget.style.background = i === 0 ? '#F0F4FF' : 'transparent')}
                    >
                      <span style={{ color: i === 0 ? TYPE_COLORS[form.type] : '#1E293B' }}>{s}</span>
                      {i === 0 && <span style={{ fontSize: '0.65rem', background: '#4361EE', color: '#fff', padding: '1px 6px', borderRadius: 6, fontWeight: 600 }}>Siguiente</span>}
                    </button>
                  ))}
                </div>
              )}
              {/* Etiqueta de patrón de nomenclatura + botón de ayuda */}
              {codePattern ? (
                <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Formato configurado:</span>
                  <code style={{
                    background: '#EEF2FF', color: TYPE_COLORS[form.type],
                    padding: '2px 8px', borderRadius: 6, fontWeight: 700,
                    fontSize: '0.75rem', letterSpacing: '0.04em',
                  }}>{codePattern}</code>
                  <a
                    href={codePatternUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontSize: '0.72rem', color: '#4361EE', fontWeight: 600,
                      textDecoration: 'none', padding: '2px 8px',
                      background: '#EEF2FF', borderRadius: 6,
                      border: '1px solid #C7D2FE',
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#E0E7FF')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#EEF2FF')}
                  >
                    📋 Ver regla de nomenclatura →
                  </a>
                </div>
              ) : (
                <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Sin regla configurada para {form.type}.</span>
                  <a
                    href={codePatternUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontSize: '0.72rem', color: '#64748B', fontWeight: 600,
                      textDecoration: 'none', padding: '2px 8px',
                      background: '#F8FAFF', borderRadius: 6,
                      border: '1px solid #E8EBF4',
                    }}
                  >
                    ➕ Configurar nomenclatura
                  </a>
                </div>
              )}
            </div>
            {/* Chips de Tipo con handler propio */}
            <div>{fld('Tipo', (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TYPES.map(opt => {
                  const active = form.type === opt;
                  const color = TYPE_COLORS[opt];
                  return (
                    <button key={opt} onClick={() => handleTypeChange(opt)} style={{
                      padding: '6px 16px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 500,
                      border: `1.5px solid ${active ? color : '#E8EBF4'}`,
                      background: active ? `${color}18` : '#F8FAFF',
                      color: active ? color : '#64748B', cursor: 'pointer', transition: 'all 120ms',
                    }}>{opt}</button>
                  );
                })}
              </div>
            ))}</div>

            {/* Campo Nombre con autocompletado */}
            <div style={{ gridColumn: '1/-1', position: 'relative' }}>
              {lbl('Nombre del cuarto técnico', true)}
              <input
                type="text"
                placeholder={`${form.type} Principal Torre A`}
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                onFocus={handleNameFocus}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${form.name ? '#4361EE' : '#E8EBF4'}`, fontSize: '0.875rem', outline: 'none', background: '#FAFBFF', color: '#1E293B', transition: 'border-color 150ms', boxSizing: 'border-box' }}
                onFocusCapture={e => (e.target as HTMLInputElement).style.borderColor = '#4361EE'}
              />
              {/* Dropdown de sugerencias */}
              {showSuggestions && nameSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: '#fff', border: '1.5px solid #E8EBF4', borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(15,23,42,0.12)', marginTop: 4,
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '6px 12px', borderBottom: '1px solid #F1F5F9', fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Sugerencias — {form.type}
                  </div>
                  {nameSuggestions.map((s, i) => (
                    <button
                      key={i}
                      onMouseDown={() => selectSuggestion(s)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '9px 14px', border: 'none', background: 'transparent',
                        fontSize: '0.85rem', color: '#1E293B', cursor: 'pointer',
                        borderBottom: i < nameSuggestions.length - 1 ? '1px solid #F8FAFF' : 'none',
                        transition: 'background 100ms',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#EEF2FF')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ color: TYPE_COLORS[form.type], fontWeight: 700, marginRight: 6 }}>
                        {form.type}
                      </span>
                      {s.replace(form.type + ' ', '')}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ gridColumn: '1/-1' }}>{fld('Estado', chips(STATUSES, form.status, v => set('status', v as MdfIdfStatus), STATUS_COLORS))}</div>
          </div>
        </div>
      );
      case 2: return (
        <div>
          {/* Encabezado del selector de ubicaciones */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={13} color="#4361EE" />
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>Seleccionar ubicación existente</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={loadLocations} disabled={loadingLocations}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: '1px solid #E8EBF4', background: '#F8FAFF', cursor: 'pointer', fontSize: '0.72rem', color: '#4361EE', fontWeight: 600 }}>
                <RefreshCw size={11} style={{ animation: loadingLocations ? 'spin 1s linear infinite' : 'none' }} />
                {loadingLocations ? 'Cargando...' : 'Actualizar'}
              </button>
              <button onClick={() => setShowNewLocationForm(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 8, border: 'none', background: showNewLocationForm ? '#F1F5F9' : '#4361EE', cursor: 'pointer', fontSize: '0.72rem', color: showNewLocationForm ? '#64748B' : '#fff', fontWeight: 600 }}>
                {showNewLocationForm ? '✕ Cancelar' : '+ Nueva ubicación'}
              </button>
            </div>
          </div>

          {/* Mini-formulario de alta de nueva ubicación */}
          {showNewLocationForm && (
            <div style={{ background: '#F0F4FF', border: '1.5px solid #C7D2FE', borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4361EE', marginBottom: 10 }}>
                📍 Nueva ubicación
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 3 }}>Nombre *</label>
                  <input type="text" placeholder="Edificio Central, Torre A, Planta Baja..."
                    value={newLoc.name} onChange={e => setNewLoc(v => ({ ...v, name: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #C7D2FE', fontSize: '0.85rem', outline: 'none', background: '#fff', color: '#1E293B', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 3 }}>Piso</label>
                  <input type="text" placeholder="Piso 3"
                    value={newLoc.floor} onChange={e => setNewLoc(v => ({ ...v, floor: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #C7D2FE', fontSize: '0.85rem', outline: 'none', background: '#fff', color: '#1E293B', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 3 }}>Zona / Closet</label>
                  <input type="text" placeholder="Closet Telecom"
                    value={newLoc.zone} onChange={e => setNewLoc(v => ({ ...v, zone: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #C7D2FE', fontSize: '0.85rem', outline: 'none', background: '#fff', color: '#1E293B', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 3 }}>Cuarto / Sala</label>
                  <input type="text" placeholder="Sala de Telecomunicaciones"
                    value={newLoc.room} onChange={e => setNewLoc(v => ({ ...v, room: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #C7D2FE', fontSize: '0.85rem', outline: 'none', background: '#fff', color: '#1E293B', boxSizing: 'border-box' }} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 3 }}>Descripción</label>
                  <input type="text" placeholder="Descripción breve..."
                    value={newLoc.description} onChange={e => setNewLoc(v => ({ ...v, description: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #C7D2FE', fontSize: '0.85rem', outline: 'none', background: '#fff', color: '#1E293B', boxSizing: 'border-box' }} />
                </div>
              </div>
              <button onClick={saveNewLocation} disabled={!newLoc.name.trim() || savingLocation}
                style={{ marginTop: 10, padding: '8px 18px', borderRadius: 10, border: 'none', background: !newLoc.name.trim() ? '#CBD5E1' : '#4361EE', color: '#fff', cursor: !newLoc.name.trim() ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                {savingLocation ? 'Guardando...' : '✓ Guardar y seleccionar'}
              </button>
            </div>
          )}

          {/* Lista de ubicaciones existentes */}
          {loadingLocations ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[1,2,3].map(i => <div key={i} style={{ height: 52, borderRadius: 10, background: '#F1F5F9' }} />)}
            </div>
          ) : locations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: '0.82rem' }}>
              <MapPin size={28} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
              No hay ubicaciones registradas aún.
              <br />
              <span style={{ color: '#4361EE', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => setShowNewLocationForm(true)}>Crea la primera ubicación</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
              {locations.map(loc => {
                const isSelected = selectedLocationId === loc.id;
                return (
                  <button key={loc.id} onClick={() => selectLocation(loc)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                      borderRadius: 12, border: `1.5px solid ${isSelected ? '#4361EE' : '#E8EBF4'}`,
                      background: isSelected ? '#EEF2FF' : '#FAFBFF',
                      cursor: 'pointer', textAlign: 'left', transition: 'all 120ms',
                    }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: isSelected ? '#4361EE' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MapPin size={14} color={isSelected ? '#fff' : '#94A3B8'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: isSelected ? '#4361EE' : '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {loc.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 1 }}>
                        {[loc.floor, loc.zone, loc.room].filter(Boolean).join(' • ') || 'Sin detalle'}
                      </div>
                    </div>
                    {loc.asset_count > 0 && (
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: '#F0FDF4', color: '#16A34A', fontWeight: 600, flexShrink: 0 }}>
                        {loc.asset_count} activos
                      </span>
                    )}
                    {isSelected && <Check size={16} color="#4361EE" style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Campos manuales adicionales */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Detalle adicional
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>{fld('Referencia en plano', inp('floor_plan_ref', 'Plano MDF-A S1'))}</div>
              <div>{fld('Dirección completa', inp('address', 'Av. Reforma 123, CDMX'))}</div>
              <div style={{ gridColumn: '1/-1' }}>{fld('Notas / Observaciones', (
                <textarea placeholder="Descripción del cuarto, acceso, condiciones..." value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E8EBF4', fontSize: '0.875rem', background: '#FAFBFF', color: '#1E293B', resize: 'vertical', outline: 'none' }} />
              ))}</div>
            </div>
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
