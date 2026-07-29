import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../../components/AppLayout';
import axios from 'axios';
import { Tag, Edit2, RefreshCw, Eye, Hash, ChevronRight, CheckCircle, Info } from 'lucide-react';

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
}

export default function NomenclaturasPage() {
  const [rules, setRules] = useState<NamingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<NamingRule | null>(null);
  const [form, setForm] = useState<Partial<NamingRule>>({});
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
    setForm({ prefix: rule.prefix, separator: rule.separator, seq_digits: rule.seq_digits, include_branch: rule.include_branch, include_location: rule.include_location, reset_per_location: rule.reset_per_location });
    setError(''); setSaved(false);
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!form.prefix?.trim()) { setError('El prefijo es obligatorio.'); return; }
    setSaving(true); setError(''); setSaved(false);
    try {
      await axios.put(`/api/dcim/catalogs/naming-rules/${editing.id}`, form);
      setSaved(true);
      setEditing(null);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Error al guardar.');
    }
    setSaving(false);
  };

  // Preview en tiempo real
  const previewCode = () => {
    if (!editing) return '';
    const pfx = form.prefix || editing.prefix;
    const sep = form.separator !== undefined ? form.separator : editing.separator;
    const digits = form.seq_digits || editing.seq_digits;
    const nextSeq = editing.last_seq + 1;
    return `${pfx}${sep}${String(nextSeq).padStart(digits, '0')}`;
  };

  const ASSET_TYPE_ICONS: Record<string, string> = {
    SWITCH: '🔀', RACK: '🗄️', MDF: '🏢', IDF: '📦', UPS: '⚡', PDU: '🔌',
    SERVER: '💻', PATCH_PANEL: '🔗', BACKBONE: '🌐', CCTV: '📷', AC_UNIT: '❄️', NODE: '📡', FIREWALL: '🛡️',
  };

  return (
    <AppLayout title="Nomenclaturas" breadcrumb={[{ label: 'Infraestructura' }, { label: 'Catálogos' }, { label: 'Nomenclaturas' }]}>
      <div style={{ padding: '24px 28px', maxWidth: 1000 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1d2e', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Tag size={22} color="#4361EE" /> Reglas de Nomenclatura
            </h1>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>
              Define el prefijo, separador y dígitos del consecutivo para cada tipo de activo. El sistema genera el código automáticamente al dar de alta un activo.
            </p>
          </div>
          <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', color:'#374151', cursor:'pointer', fontSize:13 }}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>

        {/* Banner informativo */}
        <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'12px 16px', marginBottom:24, display:'flex', gap:10, alignItems:'flex-start' }}>
          <Info size={16} color="#3b82f6" style={{ flexShrink:0, marginTop:1 }} />
          <div style={{ fontSize:13, color:'#1e40af', lineHeight:1.5 }}>
            <strong>¿Cómo funciona?</strong> Al crear un activo, el sistema consulta la regla de este tipo, incrementa el consecutivo con <code>SELECT ... FOR UPDATE</code> (sin colisiones) y genera el código automáticamente. El campo <em>Próximo Código</em> muestra la vista previa del siguiente activo que se daría de alta.
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>Cargando reglas...</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {rules.map(rule => (
              <div key={rule.id} style={{ background:'#fff', borderRadius:12, border: editing?.id === rule.id ? '2px solid #4361EE' : '1px solid #e5e7eb', overflow:'hidden', transition:'border 150ms' }}>
                {/* Cabecera de la regla */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', borderBottom: editing?.id === rule.id ? '1px solid #e5e7eb' : 'none' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:22 }}>{ASSET_TYPE_ICONS[rule.asset_type_code] || '📦'}</span>
                    <div>
                      <div style={{ fontWeight:700, color:'#111827', fontSize:14 }}>{rule.asset_type_name}</div>
                      <div style={{ fontSize:11, color:'#9ca3af' }}>Código: <code style={{ background:'#f3f4f6', padding:'1px 5px', borderRadius:4 }}>{rule.asset_type_code}</code></div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                    {/* Preview del próximo código */}
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:11, color:'#9ca3af', marginBottom:2 }}>Próximo código</div>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <Eye size={13} color="#9ca3af" />
                        <code style={{ fontSize:15, fontWeight:700, color:'#4361EE', background:'#eff6ff', padding:'3px 10px', borderRadius:6 }}>
                          {editing?.id === rule.id ? previewCode() : rule.next_code_preview}
                        </code>
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:11, color:'#9ca3af', marginBottom:2 }}>Último consecutivo</div>
                      <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'flex-end' }}>
                        <Hash size={12} color="#9ca3af" />
                        <span style={{ fontWeight:600, color:'#374151' }}>{rule.last_seq}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => editing?.id === rule.id ? setEditing(null) : openEdit(rule)}
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'1px solid #e5e7eb', background: editing?.id === rule.id ? '#f3f4f6' : '#fff', color:'#374151', cursor:'pointer', fontSize:13 }}>
                      <Edit2 size={13} /> {editing?.id === rule.id ? 'Cancelar' : 'Editar'}
                    </button>
                  </div>
                </div>

                {/* Editor inline */}
                {editing?.id === rule.id && (
                  <div style={{ padding:'18px 18px 16px', background:'#fafafa' }}>
                    {error && <div style={{ background:'#fee2e2', color:'#dc2626', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:13 }}>{error}</div>}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:14, marginBottom:14 }}>
                      <div>
                        <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Prefijo <span style={{ color:'#dc2626' }}>*</span></label>
                        <input value={form.prefix ?? ''} onChange={e => setForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                          placeholder="ej. SW, RK, MDF..."
                          style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'monospace', fontWeight:700, letterSpacing:1 }} />
                      </div>
                      <div>
                        <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Separador</label>
                        <input value={form.separator ?? ''} onChange={e => setForm(f => ({ ...f, separator: e.target.value }))}
                          placeholder="ej. - o ."
                          maxLength={3}
                          style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'monospace', textAlign:'center' }} />
                      </div>
                      <div>
                        <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Dígitos del consecutivo</label>
                        <select value={form.seq_digits ?? 4} onChange={e => setForm(f => ({ ...f, seq_digits: parseInt(e.target.value) }))}
                          style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #e5e7eb', fontSize:13, outline:'none' }}>
                          {[2,3,4,5,6].map(n => <option key={n} value={n}>{n} dígitos (ej. {String(rule.last_seq+1).padStart(n,'0')})</option>)}
                        </select>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
                        <div style={{ background:'#eff6ff', borderRadius:8, padding:'8px 12px', textAlign:'center' }}>
                          <div style={{ fontSize:11, color:'#6b7280', marginBottom:2 }}>Vista previa</div>
                          <code style={{ fontSize:16, fontWeight:800, color:'#4361EE' }}>{previewCode()}</code>
                        </div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:14, marginBottom:14 }}>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'#374151' }}>
                        <input type="checkbox" checked={form.include_branch ?? false} onChange={e => setForm(f => ({ ...f, include_branch: e.target.checked }))} />
                        Incluir código de sucursal en el nombre
                      </label>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'#374151' }}>
                        <input type="checkbox" checked={form.include_location ?? false} onChange={e => setForm(f => ({ ...f, include_location: e.target.checked }))} />
                        Incluir código de ubicación
                      </label>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'#374151' }}>
                        <input type="checkbox" checked={form.reset_per_location ?? false} onChange={e => setForm(f => ({ ...f, reset_per_location: e.target.checked }))} />
                        Reiniciar consecutivo por ubicación
                      </label>
                    </div>
                    <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                      <button onClick={() => setEditing(null)} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', color:'#374151', cursor:'pointer', fontSize:13 }}>Cancelar</button>
                      <button onClick={handleSave} disabled={saving} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:8, border:'none', background:'#4361EE', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600, opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Guardando...' : <><CheckCircle size={14} /> Guardar Regla</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Resumen cuando no está editando */}
                {editing?.id !== rule.id && (
                  <div style={{ padding:'8px 18px 12px', display:'flex', gap:20, fontSize:12, color:'#6b7280' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <ChevronRight size={12} />
                      Formato: <code style={{ background:'#f3f4f6', padding:'1px 6px', borderRadius:4, fontWeight:600 }}>{rule.prefix}{rule.separator}<span style={{ color:'#9ca3af' }}>{'0'.repeat(rule.seq_digits)}</span></code>
                    </span>
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
          <div style={{ position:'fixed', bottom:24, right:24, background:'#065f46', color:'#fff', borderRadius:10, padding:'12px 20px', display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:600, boxShadow:'0 4px 20px rgba(0,0,0,0.2)' }}>
            <CheckCircle size={16} /> Regla de nomenclatura guardada correctamente
          </div>
        )}
      </div>
    </AppLayout>
  );
}
