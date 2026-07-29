import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../../components/AppLayout';
import axios from 'axios';
import { Plus, Edit2, Trash2, Search, Truck, Globe, Mail, Phone, FileText, CheckCircle, XCircle, RefreshCw, Building2 } from 'lucide-react';

interface Provider {
  id: string;
  provider_type: string;
  legal_name: string;
  trade_name: string;
  tax_id: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  status: string;
  notes: string;
  created_at: string;
}

const EMPTY: Provider = { id:'', provider_type:'integrator', legal_name:'', trade_name:'', tax_id:'', contact_name:'', email:'', phone:'', website:'', status:'active', notes:'', created_at:'' };

const PROVIDER_TYPES = [
  { value: 'integrator', label: 'Integrador' },
  { value: 'distributor', label: 'Distribuidor' },
  { value: 'vendor', label: 'Proveedor' },
  { value: 'contractor', label: 'Contratista' },
  { value: 'consultant', label: 'Consultor' },
];

export default function ProveedoresPage() {
  const [items, setItems] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [form, setForm] = useState<Provider>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/dcim/catalogs/providers');
      setItems(res.data.providers || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setError(''); setShowModal(true); };
  const openEdit = (p: Provider) => { setEditing(p); setForm({ ...p }); setError(''); setShowModal(true); };

  const handleSave = async () => {
    if (!form.legal_name.trim()) { setError('La razón social es obligatoria.'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await axios.put(`/api/dcim/catalogs/providers/${editing.id}`, form);
      } else {
        await axios.post('/api/dcim/catalogs/providers', form);
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
    if (!confirm('¿Desactivar este proveedor?')) return;
    try {
      await axios.delete(`/api/dcim/catalogs/providers/${id}`);
      await load();
    } catch { alert('Error al desactivar.'); }
  };

  const filtered = items.filter(p =>
    (p.legal_name.toLowerCase().includes(search.toLowerCase()) ||
     p.trade_name.toLowerCase().includes(search.toLowerCase()) ||
     p.contact_name.toLowerCase().includes(search.toLowerCase())) &&
    (!filterType || p.provider_type === filterType)
  );

  const typeLabel = (t: string) => PROVIDER_TYPES.find(x => x.value === t)?.label || t;
  const typeBadgeColor: Record<string, string> = {
    integrator: '#dbeafe', distributor: '#fef3c7', vendor: '#d1fae5', contractor: '#ede9fe', consultant: '#fce7f3',
  };
  const typeTextColor: Record<string, string> = {
    integrator: '#1e40af', distributor: '#92400e', vendor: '#065f46', contractor: '#5b21b6', consultant: '#9d174d',
  };

  return (
    <AppLayout title="Proveedores" breadcrumb={[{ label: 'Infraestructura' }, { label: 'Catálogos' }, { label: 'Proveedores' }]}>
      <div style={{ padding: '24px 28px', maxWidth: 1100 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1d2e', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Truck size={22} color="#4361EE" /> Proveedores / Integradores
            </h1>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>
              Catálogo de empresas proveedoras, integradores y contratistas asociados a los activos.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', color:'#374151', cursor:'pointer', fontSize:13 }}>
              <RefreshCw size={14} /> Actualizar
            </button>
            <button onClick={openNew} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8, border:'none', background:'#4361EE', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
              <Plus size={15} /> Nuevo Proveedor
            </button>
          </div>
        </div>

        <div style={{ display:'flex', gap:10, marginBottom:20 }}>
          <div style={{ position:'relative', flex:1, maxWidth:360 }}>
            <Search size={15} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o contacto..."
              style={{ width:'100%', padding:'9px 12px 9px 36px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ padding:'9px 14px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', color:'#374151' }}>
            <option value="">Todos los tipos</option>
            {PROVIDER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>Cargando proveedores...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>
            <Truck size={40} style={{ marginBottom:12, opacity:0.3 }} />
            <p style={{ margin:0, fontWeight:600 }}>Sin proveedores registrados</p>
            <button onClick={openNew} style={{ marginTop:16, padding:'8px 20px', borderRadius:8, border:'none', background:'#4361EE', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
              <Plus size={14} style={{ marginRight:6 }} />Nuevo Proveedor
            </button>
          </div>
        ) : (
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f9fafb', borderBottom:'1px solid #e5e7eb' }}>
                  <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:600, color:'#374151' }}>Empresa</th>
                  <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:600, color:'#374151' }}>Tipo</th>
                  <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:600, color:'#374151' }}>Contacto</th>
                  <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:600, color:'#374151' }}>Email / Tel</th>
                  <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:600, color:'#374151' }}>Estado</th>
                  <th style={{ padding:'10px 16px', textAlign:'center', fontWeight:600, color:'#374151' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none', opacity: p.status === 'inactive' ? 0.55 : 1 }}>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ fontWeight:600, color:'#111827', display:'flex', alignItems:'center', gap:6 }}>
                        <Building2 size={13} color="#9ca3af" />{p.legal_name}
                      </div>
                      {p.trade_name && <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>Nombre comercial: {p.trade_name}</div>}
                      {p.tax_id && <div style={{ fontSize:11, color:'#9ca3af' }}>RFC/Tax ID: {p.tax_id}</div>}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background: typeBadgeColor[p.provider_type] || '#f3f4f6', color: typeTextColor[p.provider_type] || '#374151', borderRadius:12, padding:'2px 10px', fontSize:12, fontWeight:600 }}>
                        {typeLabel(p.provider_type)}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px', color:'#374151' }}>{p.contact_name || <span style={{ color:'#d1d5db' }}>—</span>}</td>
                    <td style={{ padding:'12px 16px' }}>
                      {p.email && <div style={{ display:'flex', alignItems:'center', gap:4, color:'#4361EE', fontSize:12 }}><Mail size={11} />{p.email}</div>}
                      {p.phone && <div style={{ display:'flex', alignItems:'center', gap:4, color:'#374151', fontSize:12 }}><Phone size={11} />{p.phone}</div>}
                      {!p.email && !p.phone && <span style={{ color:'#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      {p.status === 'active'
                        ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#d1fae5', color:'#065f46', borderRadius:12, padding:'2px 10px', fontSize:12, fontWeight:600 }}><CheckCircle size={12} />Activo</span>
                        : <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#fee2e2', color:'#991b1b', borderRadius:12, padding:'2px 10px', fontSize:12, fontWeight:600 }}><XCircle size={12} />Inactivo</span>}
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center' }}>
                      <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                        <button onClick={() => openEdit(p)} style={{ padding:'5px 8px', borderRadius:6, border:'1px solid #e5e7eb', background:'#fff', cursor:'pointer', color:'#374151', display:'flex', alignItems:'center' }}><Edit2 size={13} /></button>
                        {p.status === 'active' && <button onClick={() => handleDeactivate(p.id)} style={{ padding:'5px 8px', borderRadius:6, border:'1px solid #fee2e2', background:'#fff', cursor:'pointer', color:'#dc2626', display:'flex', alignItems:'center' }}><Trash2 size={13} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding:'10px 16px', borderTop:'1px solid #f3f4f6', color:'#9ca3af', fontSize:12 }}>
              {filtered.length} proveedor{filtered.length !== 1 ? 'es' : ''} {search || filterType ? `(filtrado de ${items.length})` : 'en total'}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, width:560, maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,0.2)', maxHeight:'90vh', overflowY:'auto' }}>
            <h2 style={{ margin:'0 0 20px', fontSize:17, fontWeight:700, color:'#111827', display:'flex', alignItems:'center', gap:8 }}>
              <Truck size={18} color="#4361EE" />
              {editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
            </h2>
            {error && <div style={{ background:'#fee2e2', color:'#dc2626', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13 }}>{error}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Tipo de Proveedor</label>
                <select value={form.provider_type} onChange={e => setForm(f => ({ ...f, provider_type: e.target.value }))}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none' }}>
                  {PROVIDER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>RFC / Tax ID</label>
                <input value={form.tax_id} onChange={e => setForm(f => ({ ...f, tax_id: e.target.value }))} placeholder="RFC o identificador fiscal"
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Razón Social <span style={{ color:'#dc2626' }}>*</span></label>
                <input value={form.legal_name} onChange={e => setForm(f => ({ ...f, legal_name: e.target.value }))} placeholder="Nombre legal completo de la empresa"
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${error && !form.legal_name ? '#dc2626' : '#e5e7eb'}`, fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Nombre Comercial</label>
                <input value={form.trade_name} onChange={e => setForm(f => ({ ...f, trade_name: e.target.value }))} placeholder="Nombre comercial o marca (opcional)"
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Nombre de Contacto</label>
                <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Persona de contacto"
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Teléfono</label>
                <div style={{ position:'relative' }}>
                  <Phone size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+52 55 1234 5678"
                    style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Email</label>
                <div style={{ position:'relative' }}>
                  <Mail size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contacto@empresa.com"
                    style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Sitio Web</label>
                <div style={{ position:'relative' }}>
                  <Globe size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                  <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://www.empresa.com"
                    style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Notas</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observaciones adicionales..." rows={2}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box' }} />
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
              <button onClick={() => setShowModal(false)} style={{ padding:'9px 18px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', color:'#374151', cursor:'pointer', fontSize:13 }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'#4361EE', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
