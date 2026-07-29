import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../../components/AppLayout';
import axios from 'axios';
import { Plus, Edit2, Trash2, Search, Factory, Globe, MapPin, Phone, FileText, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

interface Manufacturer {
  id: string;
  name: string;
  logo_url: string;
  website: string;
  country: string;
  contact: string;
  status: string;
  notes: string;
  created_at: string;
}

const EMPTY: Manufacturer = { id: '', name: '', logo_url: '', website: '', country: '', contact: '', status: 'active', notes: '', created_at: '' };

export default function FabricantesPage() {
  const [items, setItems] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Manufacturer | null>(null);
  const [form, setForm] = useState<Manufacturer>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/dcim/catalogs/manufacturers');
      setItems(res.data.manufacturers || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setError(''); setShowModal(true); };
  const openEdit = (m: Manufacturer) => { setEditing(m); setForm({ ...m }); setError(''); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre del fabricante es obligatorio.'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await axios.put(`/api/dcim/catalogs/manufacturers/${editing.id}`, form);
      } else {
        await axios.post('/api/dcim/catalogs/manufacturers', form);
      }
      setShowModal(false);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Error al guardar. Intenta de nuevo.');
    }
    setSaving(false);
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('¿Desactivar este fabricante? No se eliminará, solo se marcará como inactivo.')) return;
    try {
      await axios.delete(`/api/dcim/catalogs/manufacturers/${id}`);
      await load();
    } catch { alert('Error al desactivar.'); }
  };

  const filtered = items.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.country.toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (s: string) => s === 'active'
    ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#d1fae5', color:'#065f46', borderRadius:12, padding:'2px 10px', fontSize:12, fontWeight:600 }}><CheckCircle size={12} />Activo</span>
    : <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#fee2e2', color:'#991b1b', borderRadius:12, padding:'2px 10px', fontSize:12, fontWeight:600 }}><XCircle size={12} />Inactivo</span>;

  return (
    <AppLayout title="Fabricantes" breadcrumb={[{ label: 'Infraestructura' }, { label: 'Catálogos' }, { label: 'Fabricantes' }]}>
      <div style={{ padding: '24px 28px', maxWidth: 1100 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1d2e', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Factory size={22} color="#4361EE" /> Fabricantes / Marcas
            </h1>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>
              Catálogo maestro de fabricantes. Los activos referencian este catálogo para garantizar consistencia.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', color:'#374151', cursor:'pointer', fontSize:13 }}>
              <RefreshCw size={14} /> Actualizar
            </button>
            <button onClick={openNew} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8, border:'none', background:'#4361EE', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
              <Plus size={15} /> Nuevo Fabricante
            </button>
          </div>
        </div>

        {/* Buscador */}
        <div style={{ position: 'relative', marginBottom: 20, maxWidth: 380 }}>
          <Search size={15} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o país..."
            style={{ width:'100%', padding:'9px 12px 9px 36px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }}
          />
        </div>

        {/* Tabla */}
        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>Cargando fabricantes...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>
            <Factory size={40} style={{ marginBottom:12, opacity:0.3 }} />
            <p style={{ margin:0, fontWeight:600 }}>Sin fabricantes registrados</p>
            <p style={{ margin:'4px 0 0', fontSize:13 }}>Da de alta el primer fabricante para comenzar.</p>
            <button onClick={openNew} style={{ marginTop:16, padding:'8px 20px', borderRadius:8, border:'none', background:'#4361EE', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
              <Plus size={14} style={{ marginRight:6 }} />Nuevo Fabricante
            </button>
          </div>
        ) : (
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f9fafb', borderBottom:'1px solid #e5e7eb' }}>
                  <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:600, color:'#374151' }}>Fabricante</th>
                  <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:600, color:'#374151' }}>País</th>
                  <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:600, color:'#374151' }}>Contacto</th>
                  <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:600, color:'#374151' }}>Sitio Web</th>
                  <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:600, color:'#374151' }}>Estado</th>
                  <th style={{ padding:'10px 16px', textAlign:'center', fontWeight:600, color:'#374151' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={m.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none', opacity: m.status === 'inactive' ? 0.55 : 1 }}>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ fontWeight:600, color:'#111827' }}>{m.name}</div>
                      {m.notes && <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>{m.notes}</div>}
                    </td>
                    <td style={{ padding:'12px 16px', color:'#374151' }}>
                      {m.country ? <span style={{ display:'flex', alignItems:'center', gap:4 }}><MapPin size={12} color="#9ca3af" />{m.country}</span> : <span style={{ color:'#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding:'12px 16px', color:'#374151' }}>
                      {m.contact ? <span style={{ display:'flex', alignItems:'center', gap:4 }}><Phone size={12} color="#9ca3af" />{m.contact}</span> : <span style={{ color:'#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      {m.website ? <a href={m.website} target="_blank" rel="noreferrer" style={{ color:'#4361EE', display:'flex', alignItems:'center', gap:4 }}><Globe size={12} />{m.website.replace(/^https?:\/\//, '')}</a> : <span style={{ color:'#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding:'12px 16px' }}>{statusBadge(m.status)}</td>
                    <td style={{ padding:'12px 16px', textAlign:'center' }}>
                      <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                        <button onClick={() => openEdit(m)} title="Editar" style={{ padding:'5px 8px', borderRadius:6, border:'1px solid #e5e7eb', background:'#fff', cursor:'pointer', color:'#374151', display:'flex', alignItems:'center' }}>
                          <Edit2 size={13} />
                        </button>
                        {m.status === 'active' && (
                          <button onClick={() => handleDeactivate(m.id)} title="Desactivar" style={{ padding:'5px 8px', borderRadius:6, border:'1px solid #fee2e2', background:'#fff', cursor:'pointer', color:'#dc2626', display:'flex', alignItems:'center' }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding:'10px 16px', borderTop:'1px solid #f3f4f6', color:'#9ca3af', fontSize:12 }}>
              {filtered.length} fabricante{filtered.length !== 1 ? 's' : ''} {search ? `(filtrado de ${items.length})` : 'en total'}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, width:520, maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin:'0 0 20px', fontSize:17, fontWeight:700, color:'#111827', display:'flex', alignItems:'center', gap:8 }}>
              <Factory size={18} color="#4361EE" />
              {editing ? 'Editar Fabricante' : 'Nuevo Fabricante'}
            </h2>

            {error && <div style={{ background:'#fee2e2', color:'#dc2626', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13 }}>{error}</div>}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Nombre / Marca <span style={{ color:'#dc2626' }}>*</span></label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ej. Cisco Systems, Panduit, Commscope..."
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${error && !form.name ? '#dc2626' : '#e5e7eb'}`, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>País de Origen</label>
                <div style={{ position:'relative' }}>
                  <MapPin size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                  <input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    placeholder="ej. Estados Unidos, México..."
                    style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Contacto / Distribuidor</label>
                <div style={{ position:'relative' }}>
                  <Phone size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                  <input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                    placeholder="Nombre o teléfono de contacto"
                    style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Sitio Web</label>
                <div style={{ position:'relative' }}>
                  <Globe size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                  <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                    placeholder="https://www.fabricante.com"
                    style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Notas</label>
                <div style={{ position:'relative' }}>
                  <FileText size={13} style={{ position:'absolute', left:10, top:12, color:'#9ca3af' }} />
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Observaciones adicionales..."
                    rows={2}
                    style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box' }} />
                </div>
              </div>
              {editing && (
                <div>
                  <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Estado</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none' }}>
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:22 }}>
              <button onClick={() => setShowModal(false)} style={{ padding:'9px 18px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', color:'#374151', cursor:'pointer', fontSize:13 }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'#4361EE', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Fabricante'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
