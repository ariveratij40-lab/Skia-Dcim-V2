import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../../components/AppLayout';
import axios from 'axios';
import { Plus, Edit2, Trash2, Search, MapPin, Layers, Home, Grid, FileText, RefreshCw, Package } from 'lucide-react';

interface Location {
  id: string;
  name: string;
  floor: string;
  room: string;
  zone: string;
  description: string;
  created_at: string;
  asset_count: number;
}

const EMPTY: Location = { id:'', name:'', floor:'', room:'', zone:'', description:'', created_at:'', asset_count:0 };

export default function UbicacionesPage() {
  const [items, setItems] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState<Location>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/dcim/catalogs/locations');
      setItems(res.data.locations || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setError(''); setShowModal(true); };
  const openEdit = (l: Location) => { setEditing(l); setForm({ ...l }); setError(''); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre de la ubicación es obligatorio.'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await axios.put(`/api/dcim/catalogs/locations/${editing.id}`, form);
      } else {
        await axios.post('/api/dcim/catalogs/locations', form);
      }
      setShowModal(false);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Error al guardar.');
    }
    setSaving(false);
  };

  const handleDelete = async (loc: Location) => {
    if (loc.asset_count > 0) {
      alert(`No se puede eliminar: esta ubicación tiene ${loc.asset_count} activo(s) asignado(s). Reasigna los activos primero.`);
      return;
    }
    if (!confirm(`¿Eliminar la ubicación "${loc.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await axios.delete(`/api/dcim/catalogs/locations/${loc.id}`);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg || 'Error al eliminar.');
    }
  };

  const filtered = items.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.floor.toLowerCase().includes(search.toLowerCase()) ||
    l.room.toLowerCase().includes(search.toLowerCase()) ||
    l.zone.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout title="Ubicaciones" breadcrumb={[{ label: 'Infraestructura' }, { label: 'Catálogos' }, { label: 'Ubicaciones' }]}>
      <div style={{ padding: '24px 28px', maxWidth: 1100 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1d2e', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <MapPin size={22} color="#4361EE" /> Ubicaciones / Cuartos Técnicos
            </h1>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>
              Catálogo de ubicaciones físicas. Los activos deben referenciar una ubicación previamente registrada aquí.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', color:'#374151', cursor:'pointer', fontSize:13 }}>
              <RefreshCw size={14} /> Actualizar
            </button>
            <button onClick={openNew} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8, border:'none', background:'#4361EE', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
              <Plus size={15} /> Nueva Ubicación
            </button>
          </div>
        </div>

        <div style={{ position:'relative', marginBottom:20, maxWidth:380 }}>
          <Search size={15} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, piso, cuarto o zona..."
            style={{ width:'100%', padding:'9px 12px 9px 36px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>Cargando ubicaciones...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, color:'#9ca3af' }}>
            <MapPin size={40} style={{ marginBottom:12, opacity:0.3 }} />
            <p style={{ margin:0, fontWeight:600 }}>Sin ubicaciones registradas</p>
            <p style={{ margin:'4px 0 0', fontSize:13 }}>Las ubicaciones deben darse de alta antes de asignarlas a activos.</p>
            <button onClick={openNew} style={{ marginTop:16, padding:'8px 20px', borderRadius:8, border:'none', background:'#4361EE', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
              <Plus size={14} style={{ marginRight:6 }} />Nueva Ubicación
            </button>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:14 }}>
            {filtered.map(l => (
              <div key={l.id} style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', padding:18, position:'relative' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:36, height:36, borderRadius:8, background:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <MapPin size={16} color="#4361EE" />
                    </div>
                    <div>
                      <div style={{ fontWeight:700, color:'#111827', fontSize:14 }}>{l.name}</div>
                      <div style={{ fontSize:11, color:'#9ca3af' }}>
                        {[l.floor && `Piso: ${l.floor}`, l.room && `Cuarto: ${l.room}`, l.zone && `Zona: ${l.zone}`].filter(Boolean).join(' · ') || 'Sin detalles de ubicación'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:4 }}>
                    <button onClick={() => openEdit(l)} style={{ padding:'4px 7px', borderRadius:6, border:'1px solid #e5e7eb', background:'#fff', cursor:'pointer', color:'#374151', display:'flex', alignItems:'center' }}><Edit2 size={12} /></button>
                    <button onClick={() => handleDelete(l)} style={{ padding:'4px 7px', borderRadius:6, border:`1px solid ${l.asset_count > 0 ? '#e5e7eb' : '#fee2e2'}`, background:'#fff', cursor: l.asset_count > 0 ? 'not-allowed' : 'pointer', color: l.asset_count > 0 ? '#d1d5db' : '#dc2626', display:'flex', alignItems:'center' }} title={l.asset_count > 0 ? `${l.asset_count} activos asignados` : 'Eliminar ubicación'}><Trash2 size={12} /></button>
                  </div>
                </div>
                {l.description && <p style={{ fontSize:12, color:'#6b7280', margin:'0 0 10px', lineHeight:1.4 }}>{l.description}</p>}
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', background:'#f9fafb', borderRadius:8, fontSize:12, color:'#374151' }}>
                  <Package size={12} color="#9ca3af" />
                  <span><strong>{l.asset_count}</strong> activo{l.asset_count !== 1 ? 's' : ''} asignado{l.asset_count !== 1 ? 's' : ''}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div style={{ marginTop:16, color:'#9ca3af', fontSize:12 }}>
            {filtered.length} ubicación{filtered.length !== 1 ? 'es' : ''} {search ? `(filtrado de ${items.length})` : 'en total'}
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, width:500, maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin:'0 0 20px', fontSize:17, fontWeight:700, color:'#111827', display:'flex', alignItems:'center', gap:8 }}>
              <MapPin size={18} color="#4361EE" />
              {editing ? 'Editar Ubicación' : 'Nueva Ubicación'}
            </h2>
            {error && <div style={{ background:'#fee2e2', color:'#dc2626', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13 }}>{error}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Nombre de la Ubicación <span style={{ color:'#dc2626' }}>*</span></label>
                <div style={{ position:'relative' }}>
                  <MapPin size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ej. Cuarto Técnico Principal, MDF Edificio A..."
                    style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:8, border:`1px solid ${error && !form.name ? '#dc2626' : '#e5e7eb'}`, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Piso / Nivel</label>
                <div style={{ position:'relative' }}>
                  <Layers size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                  <input value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} placeholder="ej. Planta Baja, Piso 3..."
                    style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Cuarto / Sala</label>
                <div style={{ position:'relative' }}>
                  <Home size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                  <input value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} placeholder="ej. Sala de Servidores, CT-01..."
                    style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Zona / Área</label>
                <div style={{ position:'relative' }}>
                  <Grid size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
                  <input value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} placeholder="ej. Zona Norte, Área de Producción..."
                    style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Descripción</label>
                <div style={{ position:'relative' }}>
                  <FileText size={13} style={{ position:'absolute', left:10, top:12, color:'#9ca3af' }} />
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción detallada de la ubicación..." rows={2}
                    style={{ width:'100%', padding:'9px 12px 9px 30px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box' }} />
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:22 }}>
              <button onClick={() => setShowModal(false)} style={{ padding:'9px 18px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', color:'#374151', cursor:'pointer', fontSize:13 }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'#4361EE', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Ubicación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
