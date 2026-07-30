import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../../components/AppLayout';
import axios from 'axios';
import { Tag, Edit2, RefreshCw, Eye, Hash, ChevronRight, CheckCircle, Info, Sliders } from 'lucide-react';

interface NamingRule {
  id: string;
  asset_type_code: string;
  asset_type_name: string;
  prefix: string;
  separator: string;
  include_branch: boolean;
  include_location: boolean;
  seq_digits: number;
  reset_per_location: boolean;
  last_seq: number;
  updated_at: string;
  next_code_preview: string;
  // Campos genéricos de personalización
  custom_segment_1: string;
  custom_segment_2: string;
  custom_segment_1_label: string;
  custom_segment_2_label: string;
}

type FormState = Partial<NamingRule>;

export default function NomenclaturasPage() {
  const [rules, setRules] = useState<NamingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<NamingRule | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/dcim/catalogs/naming-rules');
      setRules(res.data.naming_rules || []);
    } catch { setRules([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (rule: NamingRule) => {
    setEditing(rule);
    setForm({
      prefix: rule.prefix,
      separator: rule.separator,
      seq_digits: rule.seq_digits,
      include_branch: rule.include_branch,
      include_location: rule.include_location,
      reset_per_location: rule.reset_per_location,
      custom_segment_1: rule.custom_segment_1 || '',
      custom_segment_2: rule.custom_segment_2 || '',
      custom_segment_1_label: rule.custom_segment_1_label || 'Segmento 1',
      custom_segment_2_label: rule.custom_segment_2_label || 'Segmento 2',
    });
    setError(''); setSaved(false);
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!form.prefix?.trim()) { setError('El prefijo es obligatorio.'); return; }
    setSaving(true); setError(''); setSaved(false);
    try {
      await axios.put(`/api/dcim/catalogs/naming-rules/${editing.id}`, {
        prefix: form.prefix,
        separator: form.separator,
        seq_digits: form.seq_digits,
        include_branch: form.include_branch,
        include_location: form.include_location,
        reset_per_location: form.reset_per_location,
        custom_segment_1: form.custom_segment_1 || null,
        custom_segment_2: form.custom_segment_2 || null,
        custom_segment_1_label: form.custom_segment_1_label || 'Segmento 1',
        custom_segment_2_label: form.custom_segment_2_label || 'Segmento 2',
      });
      setSaved(true);
      setEditing(null);
      await load();
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Error al guardar.');
    }
    setSaving(false);
  };

  // Preview en tiempo real — incluye los segmentos genéricos
  const previewCode = () => {
    if (!editing) return '';
    const pfx = (form.prefix ?? editing.prefix).toUpperCase();
    const sep = form.separator !== undefined ? form.separator : editing.separator;
    const digits = form.seq_digits ?? editing.seq_digits;
    const nextSeq = editing.last_seq + 1;
    const seg1 = (form.custom_segment_1 ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const seg2 = (form.custom_segment_2 ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const parts = [pfx];
    if (seg1) parts.push(seg1);
    if (seg2) parts.push(seg2);
    parts.push(String(nextSeq).padStart(digits, '0'));
    return parts.join(sep);
  };

  const ASSET_TYPE_ICONS: Record<string, string> = {
    SWITCH: '🔀', RACK: '🗄️', MDF: '🏢', IDF: '📦', UPS: '⚡', PDU: '🔌',
    SERVER: '💻', PATCH_PANEL: '🔗', BACKBONE: '🌐', CCTV: '📷', AC_UNIT: '❄️', NODE: '📡', FIREWALL: '🛡️',
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 7,
    border: '1px solid #e5e7eb', fontSize: 13, outline: 'none',
    boxSizing: 'border-box' as const,
  };

  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 600 as const,
    color: '#374151', marginBottom: 4,
  };

  return (
    <AppLayout title="Nomenclaturas" breadcrumb={[{ label: 'Infraestructura' }, { label: 'Catálogos' }, { label: 'Nomenclaturas' }]}>
      <div style={{ padding: '24px 28px', maxWidth: 1060 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1d2e', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Tag size={22} color="#4361EE" /> Reglas de Nomenclatura
            </h1>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>
              Define el prefijo, separador, segmentos personalizados y dígitos del consecutivo para cada tipo de activo.
            </p>
          </div>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13 }}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>

        {/* Banner informativo */}
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', marginBottom: 24, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Info size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
            <strong>Estructura del código:</strong>{' '}
            <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>
              [PREFIJO][SEP][SEGMENTO 1][SEP][SEGMENTO 2][SEP][CONSECUTIVO]
            </code>
            {' '}— Los <strong>Segmentos Genéricos</strong> son opcionales y permiten agregar clasificadores propios (ciudad, zona, área, proyecto, etc.).
            Ejemplo: <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>SW-CDMX-NORTE-0001</code>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>Cargando reglas...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rules.map(rule => (
              <div key={rule.id} style={{ background: '#fff', borderRadius: 12, border: editing?.id === rule.id ? '2px solid #4361EE' : '1px solid #e5e7eb', overflow: 'hidden', transition: 'border 150ms' }}>

                {/* Cabecera */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: editing?.id === rule.id ? '1px solid #e5e7eb' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 22 }}>{ASSET_TYPE_ICONS[rule.asset_type_code] || '📦'}</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>{rule.asset_type_name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Código: <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>{rule.asset_type_code}</code></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Próximo código</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Eye size={13} color="#9ca3af" />
                        <code style={{ fontSize: 15, fontWeight: 700, color: '#4361EE', background: '#eff6ff', padding: '3px 10px', borderRadius: 6 }}>
                          {editing?.id === rule.id ? previewCode() : rule.next_code_preview}
                        </code>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Último consecutivo</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                        <Hash size={12} color="#9ca3af" />
                        <span style={{ fontWeight: 600, color: '#374151' }}>{rule.last_seq}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => editing?.id === rule.id ? setEditing(null) : openEdit(rule)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: editing?.id === rule.id ? '#f3f4f6' : '#fff', color: '#374151', cursor: 'pointer', fontSize: 13 }}>
                      <Edit2 size={13} /> {editing?.id === rule.id ? 'Cancelar' : 'Editar'}
                    </button>
                  </div>
                </div>

                {/* Editor inline */}
                {editing?.id === rule.id && (
                  <div style={{ padding: '18px 18px 16px', background: '#fafafa' }}>
                    {error && <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>{error}</div>}

                    {/* Fila 1: Prefijo, Separador, Dígitos, Preview */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
                      <div>
                        <label style={labelStyle}>Prefijo <span style={{ color: '#dc2626' }}>*</span></label>
                        <input value={form.prefix ?? ''} onChange={e => setForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                          placeholder="ej. SW, RK, MDF..."
                          style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 }} />
                      </div>
                      <div>
                        <label style={labelStyle}>Separador</label>
                        <input value={form.separator ?? ''} onChange={e => setForm(f => ({ ...f, separator: e.target.value }))}
                          placeholder="ej. - o ." maxLength={3}
                          style={{ ...inputStyle, fontFamily: 'monospace', textAlign: 'center' }} />
                      </div>
                      <div>
                        <label style={labelStyle}>Dígitos del consecutivo</label>
                        <select value={form.seq_digits ?? 4} onChange={e => setForm(f => ({ ...f, seq_digits: parseInt(e.target.value) }))}
                          style={{ ...inputStyle }}>
                          {[2, 3, 4, 5, 6].map(n => (
                            <option key={n} value={n}>{n} dígitos (ej. {String(rule.last_seq + 1).padStart(n, '0')})</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                        <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Vista previa en tiempo real</div>
                          <code style={{ fontSize: 16, fontWeight: 800, color: '#4361EE' }}>{previewCode()}</code>
                        </div>
                      </div>
                    </div>

                    {/* Fila 2: Segmentos genéricos */}
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Sliders size={15} color="#16a34a" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Segmentos Genéricos de Personalización</span>
                        <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>(opcionales — se insertan entre el prefijo y el consecutivo)</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
                        <div>
                          <label style={labelStyle}>
                            {form.custom_segment_1_label || 'Segmento 1'} — Etiqueta
                          </label>
                          <input
                            value={form.custom_segment_1_label ?? 'Segmento 1'}
                            onChange={e => setForm(f => ({ ...f, custom_segment_1_label: e.target.value }))}
                            placeholder="ej. Ciudad, Sitio, Región..."
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>
                            Valor del Segmento 1
                          </label>
                          <input
                            value={form.custom_segment_1 ?? ''}
                            onChange={e => setForm(f => ({ ...f, custom_segment_1: e.target.value.toUpperCase() }))}
                            placeholder="ej. CDMX, MTY, TIJ..."
                            maxLength={30}
                            style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 600 }}
                          />
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>Dejar vacío para no incluirlo</div>
                        </div>
                        <div>
                          <label style={labelStyle}>
                            {form.custom_segment_2_label || 'Segmento 2'} — Etiqueta
                          </label>
                          <input
                            value={form.custom_segment_2_label ?? 'Segmento 2'}
                            onChange={e => setForm(f => ({ ...f, custom_segment_2_label: e.target.value }))}
                            placeholder="ej. Zona, Área, Edificio..."
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>
                            Valor del Segmento 2
                          </label>
                          <input
                            value={form.custom_segment_2 ?? ''}
                            onChange={e => setForm(f => ({ ...f, custom_segment_2: e.target.value.toUpperCase() }))}
                            placeholder="ej. NORTE, PISO2, EDIF-A..."
                            maxLength={30}
                            style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 600 }}
                          />
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>Dejar vacío para no incluirlo</div>
                        </div>
                      </div>
                    </div>

                    {/* Fila 3: Checkboxes */}
                    <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                        <input type="checkbox" checked={form.include_branch ?? false} onChange={e => setForm(f => ({ ...f, include_branch: e.target.checked }))} />
                        Incluir código de sucursal
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                        <input type="checkbox" checked={form.include_location ?? false} onChange={e => setForm(f => ({ ...f, include_location: e.target.checked }))} />
                        Incluir código de ubicación
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                        <input type="checkbox" checked={form.reset_per_location ?? false} onChange={e => setForm(f => ({ ...f, reset_per_location: e.target.checked }))} />
                        Reiniciar consecutivo por ubicación
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditing(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13 }}>
                        Cancelar
                      </button>
                      <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#4361EE', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Guardando...' : <><CheckCircle size={14} /> Guardar Regla</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Resumen cuando no está editando */}
                {editing?.id !== rule.id && (
                  <div style={{ padding: '8px 18px 12px', display: 'flex', gap: 16, fontSize: 12, color: '#6b7280', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ChevronRight size={12} />
                      Formato: <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                        {rule.prefix}
                        {rule.custom_segment_1 ? `${rule.separator}${rule.custom_segment_1.toUpperCase()}` : ''}
                        {rule.custom_segment_2 ? `${rule.separator}${rule.custom_segment_2.toUpperCase()}` : ''}
                        {rule.separator}<span style={{ color: '#9ca3af' }}>{'0'.repeat(rule.seq_digits)}</span>
                      </code>
                    </span>
                    {rule.custom_segment_1 && (
                      <span style={{ background: '#f0fdf4', color: '#15803d', padding: '1px 8px', borderRadius: 12, fontWeight: 600 }}>
                        {rule.custom_segment_1_label || 'Seg.1'}: {rule.custom_segment_1.toUpperCase()}
                      </span>
                    )}
                    {rule.custom_segment_2 && (
                      <span style={{ background: '#f0fdf4', color: '#15803d', padding: '1px 8px', borderRadius: 12, fontWeight: 600 }}>
                        {rule.custom_segment_2_label || 'Seg.2'}: {rule.custom_segment_2.toUpperCase()}
                      </span>
                    )}
                    {rule.include_branch && <span>· Incluye sucursal</span>}
                    {rule.include_location && <span>· Incluye ubicación</span>}
                    {rule.reset_per_location && <span>· Reinicia por ubicación</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {saved && (
          <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#065f46', color: '#fff', borderRadius: 10, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
            <CheckCircle size={16} /> Regla de nomenclatura guardada correctamente
          </div>
        )}
      </div>
    </AppLayout>
  );
}
