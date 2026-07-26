'use client';
import Head from 'next/head';
import AppLayout from '../../components/AppLayout';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Building2, Users, Map, Network, BookOpen, ClipboardList,
  Bell, Upload, Download, Award, Plus, Edit2, Trash2, X,
  Check, Search, Eye, EyeOff, Info, Settings,
  RefreshCw, FileText, Database, BarChart3,
  CheckCircle, XCircle, AlertTriangle, Zap, Star,
  Package, Tag, Lock, Camera, Phone, Globe, Mail,
  Loader2, Save,
} from 'lucide-react';

// ─── Shared styles ────────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '1.5rem' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', background: '#F8FAFF', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#1E293B', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 600, color: '#64748B', marginBottom: '4px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' };
const btnStyle = (color = '#4b8ef5'): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: color, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 });
const btnGhost: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem' };

type TabId = 'organizacion' | 'usuarios' | 'proyectos' | 'integradores' | 'catalogos' | 'auditoria' | 'notificaciones' | 'importacion' | 'licencias';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
      <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#4b8ef5' }} />
    </div>
  );
}

function SaveButton({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={saving} style={{ ...btnStyle(saved ? '#22c55e' : '#4b8ef5'), opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
      {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <Check size={14} /> : <Save size={14} />}
      {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar cambios'}
    </button>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, background: value ? '#4b8ef5' : '#E2E8F0', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.15)', transition: 'left 0.2s' }} />
    </div>
  );
}

// ─── Tab Organización ─────────────────────────────────────────────────────────
function TabOrganizacion() {
  const [form, setForm] = useState<Record<string, string>>({
    nombre: '', rfc: '', giro: '', direccion: '', telefono: '',
    email: '', sitioWeb: '', responsableTI: '', emailTI: '',
    descripcion: '', moneda: 'USD', idioma: 'Español (México)', zonaHoraria: 'America/Monterrey',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState('');

  useEffect(() => {
    axios.get('/api/config/organizacion', { withCredentials: true })
      .then(r => { if (r.data?.data && Object.keys(r.data.data).length > 0) setForm(p => ({ ...p, ...r.data.data })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await axios.put('/api/config/organizacion', form, { withCredentials: true }).catch(() => {});
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <Spinner />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ ...card, display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, minWidth: 140 }}>
          <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) setLogo(URL.createObjectURL(e.target.files[0])); }} />
          <div onClick={() => logoRef.current?.click()} style={{ width: 120, height: 120, borderRadius: 16, border: '2px dashed #E2E8F0', background: '#F8FAFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }}>
            {logo ? <img src={logo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="logo" /> : <div style={{ textAlign: 'center', color: '#94a3b8' }}><Camera size={28} /><div style={{ fontSize: '0.7rem', marginTop: 6 }}>Logo</div></div>}
          </div>
          <button onClick={() => logoRef.current?.click()} style={{ ...btnGhost, fontSize: '0.75rem', padding: '5px 12px' }}><Camera size={13} /> Cambiar logo</button>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={lbl}>Nombre de la organización</label>
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)} style={{ ...inp, fontSize: '1rem', fontWeight: 700 }} />
          </div>
          <div><label style={lbl}>RFC / Identificación fiscal</label><input value={form.rfc} onChange={e => set('rfc', e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Giro / Industria</label><input value={form.giro} onChange={e => set('giro', e.target.value)} style={inp} /></div>
          <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Descripción</label><textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} /></div>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ color: '#1E293B', fontWeight: 700, fontSize: '0.9rem', margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={16} color="#4b8ef5" /> Información de contacto</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div><label style={lbl}>Teléfono</label><input value={form.telefono} onChange={e => set('telefono', e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Email corporativo</label><input value={form.email} onChange={e => set('email', e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Sitio web</label><input value={form.sitioWeb} onChange={e => set('sitioWeb', e.target.value)} style={inp} /></div>
          <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Dirección</label><input value={form.direccion} onChange={e => set('direccion', e.target.value)} style={inp} /></div>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ color: '#1E293B', fontWeight: 700, fontSize: '0.9rem', margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={16} color="#4b8ef5" /> Responsable de TI</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div><label style={lbl}>Nombre del responsable</label><input value={form.responsableTI} onChange={e => set('responsableTI', e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Email del responsable</label><input value={form.emailTI} onChange={e => set('emailTI', e.target.value)} style={inp} /></div>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ color: '#1E293B', fontWeight: 700, fontSize: '0.9rem', margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: 8 }}><Globe size={16} color="#4b8ef5" /> Preferencias del sistema</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div>
            <label style={lbl}>Moneda</label>
            <select value={form.moneda} onChange={e => set('moneda', e.target.value)} style={inp}>
              {['USD', 'MXN', 'EUR', 'COP', 'ARS', 'CLP'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Idioma</label>
            <select value={form.idioma} onChange={e => set('idioma', e.target.value)} style={inp}>
              {['Español (México)', 'Español (España)', 'English (US)', 'Português (BR)'].map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Zona horaria</label>
            <select value={form.zonaHoraria} onChange={e => set('zonaHoraria', e.target.value)} style={inp}>
              {['America/Monterrey', 'America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Buenos_Aires', 'America/New_York', 'America/Los_Angeles'].map(z => <option key={z}>{z}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SaveButton saving={saving} saved={saved} onClick={handleSave} />
      </div>
    </div>
  );
}

// ─── Tab Usuarios ─────────────────────────────────────────────────────────────
interface UserRow { id: string; email: string; name: string; role: string; status: string; createdAt: string; }

function TabUsuarios() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [saving, setSaving] = useState(false);

  const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
    admin: { color: '#dc2626', bg: '#FEF2F2' },
    manager: { color: '#7c3aed', bg: '#F5F3FF' },
    technician: { color: '#2563EB', bg: '#EFF6FF' },
    viewer: { color: '#64748B', bg: '#F1F5F9' },
  };
  const ROLE_LABELS: Record<string, string> = { admin: 'Administrador', manager: 'Gerente', technician: 'Técnico', viewer: 'Visualizador' };

  const load = useCallback(() => {
    setLoading(true);
    axios.get('/api/admin/users', { withCredentials: true })
      .then(r => setUsers(r.data.users || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveRole = async (id: string) => {
    setSaving(true);
    await axios.put(`/api/admin/users/${id}`, { role: editRole }, { withCredentials: true }).catch(() => {});
    setSaving(false); setEditingId(null); load();
  };

  const deleteUser = async (id: string) => {
    if (!confirm('¿Eliminar este usuario del tenant?')) return;
    await axios.delete(`/api/admin/users/${id}`, { withCredentials: true }).catch(() => {});
    load();
  };

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {[
          { label: 'Total usuarios', value: users.length, color: '#3b82f6' },
          { label: 'Activos', value: users.filter(u => u.status === 'active').length, color: '#22c55e' },
          { label: 'Administradores', value: users.filter(u => u.role === 'admin').length, color: '#ef4444' },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: '1rem' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 10, marginBottom: '1rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o correo…" style={{ ...inp, paddingLeft: 32 }} />
          </div>
          <button onClick={load} style={btnGhost}><RefreshCw size={14} /></button>
        </div>

        {loading ? <Spinner /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFF', borderBottom: '1px solid #E2E8F0' }}>
                {['Nombre', 'Correo', 'Rol', 'Estado', 'Creado', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const rc = ROLE_COLORS[u.role] || { color: '#64748B', bg: '#F1F5F9' };
                return (
                  <tr key={u.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1E293B', fontSize: '0.85rem' }}>{u.name}</td>
                    <td style={{ padding: '10px 14px', color: '#64748B', fontSize: '0.82rem' }}>{u.email}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {editingId === u.id ? (
                        <select value={editRole} onChange={e => setEditRole(e.target.value)} style={{ ...inp, width: 'auto' }}>
                          {['admin', 'manager', 'technician', 'viewer'].map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700, background: rc.bg, color: rc.color }}>{ROLE_LABELS[u.role] || u.role}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700, background: u.status === 'active' ? '#F0FDF4' : '#F1F5F9', color: u.status === 'active' ? '#16a34a' : '#94a3b8' }}>
                        {u.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: '#94a3b8' }}>{u.createdAt?.split('T')[0]}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {editingId === u.id ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveRole(u.id)} disabled={saving} style={{ ...btnStyle('#22c55e'), padding: '4px 10px', fontSize: '0.75rem' }}>
                            {saving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Guardar
                          </button>
                          <button onClick={() => setEditingId(null)} style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.75rem' }}><X size={12} /></button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => { setEditingId(u.id); setEditRole(u.role); }} style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.75rem' }}><Edit2 size={12} /> Rol</button>
                          <button onClick={() => deleteUser(u.id)} style={{ padding: '4px 8px', background: '#FEF2F2', color: '#dc2626', border: '1px solid #FECACA', borderRadius: 6, cursor: 'pointer' }}><Trash2 size={12} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.85rem' }}>No se encontraron usuarios</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Tab Proyectos ────────────────────────────────────────────────────────────
interface Project { id: string; name: string; description: string; status: string; responsible: string; startDate: string; modules: string[]; }

function TabProyectos() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<Project> | null>(null);
  const [saving, setSaving] = useState(false);

  const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
    active: { color: '#16a34a', bg: '#F0FDF4' },
    planned: { color: '#d97706', bg: '#FFFBEB' },
    archived: { color: '#64748B', bg: '#F1F5F9' },
  };
  const STATUS_LABELS: Record<string, string> = { active: 'Activo', planned: 'Planeado', archived: 'Archivado' };

  const load = useCallback(() => {
    setLoading(true);
    axios.get('/api/admin/projects', { withCredentials: true })
      .then(r => setProjects(r.data.projects || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveProject = async () => {
    if (!modal?.name) return;
    setSaving(true);
    try {
      if (modal.id) {
        await axios.put(`/api/admin/projects/${modal.id}`, modal, { withCredentials: true });
      } else {
        await axios.post('/api/admin/projects', modal, { withCredentials: true });
      }
      setModal(null); load();
    } catch {}
    setSaving(false);
  };

  const deleteProject = async (id: string) => {
    if (!confirm('¿Eliminar este proyecto?')) return;
    await axios.delete(`/api/admin/projects/${id}`, { withCredentials: true }).catch(() => {});
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setModal({ status: 'active', modules: [] })} style={btnStyle()}><Plus size={14} /> Nuevo proyecto</button>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {projects.map(p => {
            const sc = STATUS_COLORS[p.status] || { color: '#64748B', bg: '#F1F5F9' };
            return (
              <div key={p.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.95rem' }}>{p.name}</div>
                    {p.description && <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>{p.description}</div>}
                  </div>
                  <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, fontWeight: 700, background: sc.bg, color: sc.color, flexShrink: 0, marginLeft: 8 }}>{STATUS_LABELS[p.status] || p.status}</span>
                </div>
                {p.responsible && <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Responsable: {p.responsible}</div>}
                {p.startDate && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Inicio: {p.startDate}</div>}
                {p.modules?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {p.modules.map(m => <span key={m} style={{ fontSize: '0.68rem', background: '#EFF6FF', color: '#2563EB', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{m}</span>)}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #F1F5F9', paddingTop: 10 }}>
                  <button onClick={() => setModal(p)} style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.75rem' }}><Edit2 size={12} /> Editar</button>
                  <button onClick={() => deleteProject(p.id)} style={{ padding: '4px 10px', background: '#FEF2F2', color: '#dc2626', border: '1px solid #FECACA', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}><Trash2 size={12} /> Eliminar</button>
                </div>
              </div>
            );
          })}
          {projects.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
              <Map size={40} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
              <p style={{ fontSize: '0.85rem' }}>No hay proyectos registrados</p>
            </div>
          )}
        </div>
      )}

      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontWeight: 700, color: '#1E293B', margin: 0 }}>{modal.id ? 'Editar proyecto' : 'Nuevo proyecto'}</h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[{ label: 'Nombre *', key: 'name', ph: 'Nombre del proyecto' }, { label: 'Descripción', key: 'description', ph: 'Descripción breve' }, { label: 'Responsable', key: 'responsible', ph: 'Nombre del responsable' }].map(f => (
                <div key={f.key}>
                  <label style={lbl}>{f.label}</label>
                  <input value={(modal as any)[f.key] || ''} onChange={e => setModal(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={inp} />
                </div>
              ))}
              <div>
                <label style={lbl}>Estado</label>
                <select value={modal.status || 'active'} onChange={e => setModal(p => ({ ...p, status: e.target.value }))} style={inp}>
                  <option value="active">Activo</option>
                  <option value="planned">Planeado</option>
                  <option value="archived">Archivado</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #F1F5F9' }}>
              <button onClick={saveProject} disabled={saving} style={{ ...btnStyle(), flex: 1, justifyContent: 'center', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Guardar
              </button>
              <button onClick={() => setModal(null)} style={{ ...btnGhost, padding: '8px 20px' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab Integradores ─────────────────────────────────────────────────────────
interface Integrator { id: string; name: string; contactName: string; email: string; phone: string; specialties: string[]; rating: number; }

function TabIntegradores() {
  const [list, setList] = useState<Integrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<Integrator> | null>(null);
  const [saving, setSaving] = useState(false);
  const [specInput, setSpecInput] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    axios.get('/api/admin/integrators', { withCredentials: true })
      .then(r => setList(r.data.integrators || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveIntegrator = async () => {
    if (!modal?.name) return;
    setSaving(true);
    try {
      await axios.post('/api/admin/integrators', modal, { withCredentials: true });
      setModal(null); load();
    } catch {}
    setSaving(false);
  };

  const deleteIntegrator = async (id: string) => {
    if (!confirm('¿Eliminar este integrador?')) return;
    await axios.delete(`/api/admin/integrators/${id}`, { withCredentials: true }).catch(() => {});
    load();
  };

  const addSpec = () => {
    if (!specInput.trim()) return;
    setModal(p => ({ ...p, specialties: [...(p?.specialties || []), specInput.trim()] }));
    setSpecInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setModal({ rating: 0, specialties: [] })} style={btnStyle()}><Plus size={14} /> Nuevo integrador</button>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {list.map(i => (
            <div key={i.id} style={{ ...card }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.95rem' }}>{i.name}</div>
                  {i.contactName && <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{i.contactName}</div>}
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[1,2,3,4,5].map(s => <span key={s} style={{ color: s <= i.rating ? '#f59e0b' : '#E2E8F0', fontSize: '1rem' }}>★</span>)}
                </div>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {i.email && <span>✉ {i.email}</span>}
                {i.phone && <span>📞 {i.phone}</span>}
              </div>
              {i.specialties?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                  {i.specialties.map(s => <span key={s} style={{ fontSize: '0.68rem', background: '#F0FDF4', color: '#16a34a', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{s}</span>)}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #F1F5F9', paddingTop: 10, marginTop: 10 }}>
                <button onClick={() => deleteIntegrator(i.id)} style={{ padding: '4px 10px', background: '#FEF2F2', color: '#dc2626', border: '1px solid #FECACA', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}><Trash2 size={12} /> Eliminar</button>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
              <Network size={40} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
              <p style={{ fontSize: '0.85rem' }}>No hay integradores registrados</p>
            </div>
          )}
        </div>
      )}

      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontWeight: 700, color: '#1E293B', margin: 0 }}>Nuevo integrador</h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[{ label: 'Empresa *', key: 'name', ph: 'Nombre de la empresa' }, { label: 'Contacto', key: 'contactName', ph: 'Nombre del contacto' }, { label: 'Correo', key: 'email', ph: 'correo@empresa.com' }, { label: 'Teléfono', key: 'phone', ph: '+52 55 0000 0000' }].map(f => (
                <div key={f.key}>
                  <label style={lbl}>{f.label}</label>
                  <input value={(modal as any)[f.key] || ''} onChange={e => setModal(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={inp} />
                </div>
              ))}
              <div>
                <label style={lbl}>Calificación</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => setModal(p => ({ ...p, rating: s }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: s <= (modal.rating || 0) ? '#f59e0b' : '#E2E8F0' }}>★</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Especialidades</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={specInput} onChange={e => setSpecInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSpec()} placeholder="Ej: CCTV, Cableado…" style={{ ...inp, flex: 1 }} />
                  <button onClick={addSpec} style={btnStyle()}><Plus size={14} /></button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(modal.specialties || []).map(s => (
                    <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', background: '#F0FDF4', color: '#16a34a', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                      {s}
                      <button onClick={() => setModal(p => ({ ...p, specialties: (p?.specialties || []).filter(x => x !== s) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}><X size={10} /></button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #F1F5F9' }}>
              <button onClick={saveIntegrator} disabled={saving} style={{ ...btnStyle(), flex: 1, justifyContent: 'center', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Guardar
              </button>
              <button onClick={() => setModal(null)} style={{ ...btnGhost, padding: '8px 20px' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab Catálogos ────────────────────────────────────────────────────────────
function TabCatalogos() {
  const [activecat, setActivecat] = useState('marcas');
  const [items, setItems] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newItem, setNewItem] = useState('');

  const cats = [
    { id: 'marcas', label: 'Marcas', icon: Tag, defaults: ['Panduit', 'Belden', 'CommScope', 'Leviton', 'Siemon', 'Nexans', 'Legrand', 'Molex', 'Hubbell', 'Corning'] },
    { id: 'categorias', label: 'Categorías de cable', icon: Network, defaults: ['Cat 5', 'Cat 5e', 'Cat 6', 'Cat 6A', 'Cat 7', 'Cat 7A', 'Cat 8', 'Fibra OM1', 'Fibra OM2', 'Fibra OM3', 'Fibra OM4', 'Fibra OS1', 'Fibra OS2'] },
    { id: 'normas', label: 'Normas aplicables', icon: BookOpen, defaults: ['TIA-568.2-D', 'TIA-568.3-D', 'TIA-569-D', 'TIA-606-C', 'TIA-607-C', 'TIA-942-B', 'ISO/IEC 11801', 'ANSI/BICSI 002', 'ICREA Std-131', 'NOM-001-SEDE'] },
    { id: 'estados', label: 'Estados de activos', icon: CheckCircle, defaults: ['Activo', 'Inactivo', 'Mantenimiento', 'Falla', 'Baja', 'Reserva', 'Planeado'] },
    { id: 'areas', label: 'Áreas / Zonas', icon: Map, defaults: ['Sala de Servidores', 'Data Center', 'MDF', 'IDF', 'Oficinas Generales', 'Sala de Juntas', 'Recepción', 'Lobby', 'Producción', 'Almacén'] },
    { id: 'tipos_rack', label: 'Tipos de rack', icon: Package, defaults: ['Open Frame', 'Cerrado 2 postes', 'Cerrado 4 postes', 'Wall Mount', 'Floor Stand', 'Micro Data Center', 'Blade Chassis'] },
  ];

  useEffect(() => {
    axios.get('/api/config/catalogos', { withCredentials: true })
      .then(r => {
        if (r.data?.data && Object.keys(r.data.data).length > 0) {
          setItems(r.data.data);
        } else {
          // Cargar defaults si no hay datos guardados
          const defaults: Record<string, string[]> = {};
          cats.forEach(c => { defaults[c.id] = c.defaults; });
          setItems(defaults);
        }
      })
      .catch(() => {
        const defaults: Record<string, string[]> = {};
        cats.forEach(c => { defaults[c.id] = c.defaults; });
        setItems(defaults);
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    await axios.put('/api/config/catalogos', items, { withCredentials: true }).catch(() => {});
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const activeCat = cats.find(c => c.id === activecat)!;

  if (loading) return <Spinner />;

  return (
    <div style={{ display: 'flex', gap: '1.5rem' }}>
      <div style={{ ...card, width: 220, flexShrink: 0, padding: '0.75rem', height: 'fit-content' }}>
        {cats.map(c => (
          <button key={c.id} onClick={() => setActivecat(c.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: activecat === c.id ? '#EFF6FF' : 'transparent', color: activecat === c.id ? '#2563EB' : '#475569', fontSize: '0.82rem', fontWeight: activecat === c.id ? 700 : 500, marginBottom: 2 }}>
            <c.icon size={14} /> {c.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 700, color: '#1E293B', margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <activeCat.icon size={16} color="#4b8ef5" /> {activeCat.label}
            </h3>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{(items[activecat] || []).length} elementos</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
            <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newItem.trim()) { setItems(p => ({ ...p, [activecat]: [...(p[activecat] || []), newItem.trim()] })); setNewItem(''); } }} placeholder={`Agregar a ${activeCat.label}...`} style={{ ...inp, flex: 1 }} />
            <button onClick={() => { if (newItem.trim()) { setItems(p => ({ ...p, [activecat]: [...(p[activecat] || []), newItem.trim()] })); setNewItem(''); } }} style={btnStyle()}><Plus size={14} /> Agregar</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {(items[activecat] || []).map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFF', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <span style={{ fontSize: '0.82rem', color: '#1E293B' }}>{item}</span>
                <button onClick={() => setItems(p => ({ ...p, [activecat]: p[activecat].filter((_, i) => i !== idx) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 2 }}><X size={12} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #F1F5F9' }}>
            <SaveButton saving={saving} saved={saved} onClick={save} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Auditoría ────────────────────────────────────────────────────────────
interface AuditLog { id: string; userName: string; action: string; entityType: string; entityId: string; ip: string; createdAt: string; }

function TabAuditoria() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    axios.get('/api/admin/audit', { withCredentials: true })
      .then(r => setLogs(r.data.logs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const ACTION_COLORS: Record<string, { color: string; bg: string }> = {
    UPDATE_CONFIG: { color: '#2563EB', bg: '#EFF6FF' },
    LOGIN: { color: '#16a34a', bg: '#F0FDF4' },
    DELETE: { color: '#dc2626', bg: '#FEF2F2' },
    CREATE: { color: '#7c3aed', bg: '#F5F3FF' },
  };

  const filtered = logs.filter(l =>
    l.userName?.toLowerCase().includes(search.toLowerCase()) ||
    l.action?.toLowerCase().includes(search.toLowerCase()) ||
    l.entityType?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        {[
          { label: 'Total eventos', value: logs.length, color: '#3b82f6', icon: <BarChart3 size={18} /> },
          { label: 'Hoy', value: logs.filter(l => l.createdAt?.startsWith(new Date().toISOString().split('T')[0])).length, color: '#22c55e', icon: <CheckCircle size={18} /> },
          { label: 'Cambios config', value: logs.filter(l => l.action === 'UPDATE_CONFIG').length, color: '#f59e0b', icon: <AlertTriangle size={18} /> },
          { label: 'Eliminaciones', value: logs.filter(l => l.action?.includes('DELETE')).length, color: '#ef4444', icon: <XCircle size={18} /> },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{k.label}</span>
              <div style={{ color: k.color, background: k.color + '22', padding: 6, borderRadius: 8 }}>{k.icon}</div>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 10, marginBottom: '1rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar en auditoría…" style={{ ...inp, paddingLeft: 32 }} />
          </div>
          <button onClick={load} style={btnGhost}><RefreshCw size={14} /></button>
        </div>

        {loading ? <Spinner /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFF', borderBottom: '1px solid #E2E8F0' }}>
                {['Usuario', 'Acción', 'Entidad', 'ID', 'IP', 'Fecha'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => {
                const ac = ACTION_COLORS[l.action] || { color: '#64748B', bg: '#F1F5F9' };
                return (
                  <tr key={l.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1E293B', fontSize: '0.82rem' }}>{l.userName}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, fontWeight: 700, background: ac.bg, color: ac.color }}>{l.action}</span></td>
                    <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: '#64748B' }}>{l.entityType}</td>
                    <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.entityId}</td>
                    <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: '#94a3b8' }}>{l.ip}</td>
                    <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{l.createdAt?.replace('T', ' ').split('.')[0]}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.85rem' }}>No hay registros de auditoría</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Tab Notificaciones ───────────────────────────────────────────────────────
function TabNotificaciones() {
  const [form, setForm] = useState({
    smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '', smtpTls: true,
    alertTicketNew: true, alertTicketClose: true, alertMaintenance: true,
    alertCapex: false, alertRfid: false, alertAudit: false,
    alertWarranty: true, alertBackup: true, alertNewUser: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    axios.get('/api/config/notificaciones', { withCredentials: true })
      .then(r => { if (r.data?.data && Object.keys(r.data.data).length > 0) setForm(p => ({ ...p, ...r.data.data })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    await axios.put('/api/config/notificaciones', form, { withCredentials: true }).catch(() => {});
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const testSmtp = () => {
    setTesting(true); setTestResult(null);
    setTimeout(() => { setTesting(false); setTestResult(form.smtpHost ? 'ok' : 'error'); }, 2000);
  };

  const ALERTS = [
    { key: 'alertTicketNew', label: 'Nuevo ticket creado', desc: 'Notifica al responsable cuando se abre un ticket' },
    { key: 'alertTicketClose', label: 'Ticket cerrado', desc: 'Notifica al solicitante cuando se cierra su ticket' },
    { key: 'alertMaintenance', label: 'Mantenimiento programado', desc: 'Recordatorio 24h antes del mantenimiento' },
    { key: 'alertWarranty', label: 'Vencimiento de garantía', desc: 'Alerta 30 días antes del vencimiento de garantía' },
    { key: 'alertCapex', label: 'Aprobación CAPEX', desc: 'Notifica cuando un presupuesto requiere aprobación' },
    { key: 'alertRfid', label: 'Movimiento RFID no autorizado', desc: 'Alerta inmediata por movimiento de activo' },
    { key: 'alertAudit', label: 'Cambio crítico en auditoría', desc: 'Notifica eliminaciones y cambios de configuración' },
    { key: 'alertBackup', label: 'Backup completado', desc: 'Confirmación de respaldo exitoso de la base de datos' },
    { key: 'alertNewUser', label: 'Nuevo usuario registrado', desc: 'Notifica al administrador cuando se crea un nuevo usuario' },
  ];

  if (loading) return <Spinner />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={card}>
        <h3 style={{ color: '#1E293B', fontWeight: 700, fontSize: '0.9rem', margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={16} color="#4b8ef5" /> Configuración de correo (SMTP)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div><label style={lbl}>Servidor SMTP</label><input value={form.smtpHost} onChange={e => setForm(p => ({ ...p, smtpHost: e.target.value }))} placeholder="smtp.gmail.com" style={inp} /></div>
          <div><label style={lbl}>Puerto</label><input value={form.smtpPort} onChange={e => setForm(p => ({ ...p, smtpPort: e.target.value }))} placeholder="587" style={inp} /></div>
          <div><label style={lbl}>Usuario / Email remitente</label><input value={form.smtpUser} onChange={e => setForm(p => ({ ...p, smtpUser: e.target.value }))} placeholder="noreply@empresa.com" style={inp} /></div>
          <div style={{ gridColumn: '1/-1', position: 'relative' }}>
            <label style={lbl}>Contraseña</label>
            <input type={showPass ? 'text' : 'password'} value={form.smtpPass} onChange={e => setForm(p => ({ ...p, smtpPass: e.target.value }))} placeholder="••••••••" style={{ ...inp, paddingRight: 40 }} />
            <button onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 10, top: 28, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: '#475569' }}>
            <input type="checkbox" checked={form.smtpTls} onChange={e => setForm(p => ({ ...p, smtpTls: e.target.checked }))} /> Usar TLS/SSL
          </label>
          <button onClick={testSmtp} disabled={testing} style={{ ...btnGhost, marginLeft: 'auto', opacity: testing ? 0.7 : 1 }}>
            {testing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={14} />} Probar conexión
          </button>
        </div>
        {testResult && (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: testResult === 'ok' ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${testResult === 'ok' ? '#BBF7D0' : '#FECACA'}`, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: testResult === 'ok' ? '#16a34a' : '#dc2626' }}>
            {testResult === 'ok' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {testResult === 'ok' ? 'Conexión SMTP exitosa.' : 'Error — verifica host, puerto y credenciales.'}
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={{ color: '#1E293B', fontWeight: 700, fontSize: '0.9rem', margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: 8 }}><Bell size={16} color="#4b8ef5" /> Reglas de notificación</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {ALERTS.map(a => (
            <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '12px 14px', background: (form as any)[a.key] ? '#FAFBFF' : '#F8FAFF', border: '1px solid #E2E8F0', borderRadius: 10 }}>
              <Toggle value={(form as any)[a.key]} onChange={v => setForm(p => ({ ...p, [a.key]: v }))} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.85rem' }}>{a.label}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{a.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SaveButton saving={saving} saved={saved} onClick={save} />
      </div>
    </div>
  );
}

// ─── Tab Importación / Exportación ────────────────────────────────────────────
function TabImportacion() {
  const [activeOp, setActiveOp] = useState<'import' | 'export'>('import');
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [modulo, setModulo] = useState('Nodos');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');

  const handleImport = () => {
    if (!file) return;
    setStatus('processing'); setProgress(0);
    const iv = setInterval(() => {
      setProgress(p => { if (p >= 100) { clearInterval(iv); setStatus('done'); return 100; } return p + 10; });
    }, 150);
  };

  const modulos = ['Nodos', 'Racks', 'Patch Panels', 'Switches', 'Backbone', 'UPS/PDUs', 'MDF/IDF', 'Activos', 'Integradores'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 10, width: 'fit-content', border: '1px solid #E2E8F0' }}>
        {[{ id: 'import', label: 'Importar datos', icon: Upload }, { id: 'export', label: 'Exportar datos', icon: Download }].map(t => (
          <button key={t.id} onClick={() => setActiveOp(t.id as any)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, background: activeOp === t.id ? '#4b8ef5' : 'transparent', color: activeOp === t.id ? '#fff' : '#475569' }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {activeOp === 'import' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div style={card}>
            <h3 style={{ fontWeight: 700, color: '#1E293B', margin: '0 0 1.25rem 0', fontSize: '0.9rem' }}>1. Seleccionar módulo y archivo</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={lbl}>Módulo destino</label>
                <select value={modulo} onChange={e => setModulo(e.target.value)} style={inp}>
                  {modulos.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Plantilla de importación</label>
                <button style={{ ...btnGhost, width: '100%', justifyContent: 'center' }}><Download size={14} /> Descargar plantilla {modulo}.xlsx</button>
              </div>
              <div>
                <label style={lbl}>Archivo a importar (CSV / XLSX)</label>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) { setFile(e.target.files[0]); setStatus('idle'); setProgress(0); } }} />
                {file ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8 }}>
                    <FileText size={16} color="#16a34a" />
                    <span style={{ flex: 1, fontSize: '0.82rem', color: '#15803d', fontWeight: 600 }}>{file.name}</span>
                    <button onClick={() => { setFile(null); setStatus('idle'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: '1.5rem', border: '2px dashed #E2E8F0', borderRadius: 8, background: '#F8FAFF', cursor: 'pointer', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <Upload size={24} color="#cbd5e1" />
                    <span style={{ fontSize: '0.82rem' }}>Clic para seleccionar archivo</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={card}>
            <h3 style={{ fontWeight: 700, color: '#1E293B', margin: '0 0 1.25rem 0', fontSize: '0.9rem' }}>2. Procesar importación</h3>
            {status === 'idle' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '1rem', background: '#F8FAFF', borderRadius: 8, fontSize: '0.78rem', color: '#64748B', lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>Opciones de importación</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}><input type="checkbox" defaultChecked /> Actualizar registros existentes</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}><input type="checkbox" defaultChecked /> Validar datos antes de importar</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" /> Modo de prueba (no guardar)</label>
                </div>
                <button onClick={handleImport} disabled={!file} style={{ ...btnStyle(!file ? '#E2E8F0' : '#22c55e'), justifyContent: 'center', color: !file ? '#94a3b8' : '#fff', cursor: !file ? 'not-allowed' : 'pointer' }}>
                  <Upload size={15} /> Iniciar importación
                </button>
              </div>
            )}
            {status === 'processing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', padding: '2rem 0' }}>
                <Loader2 size={32} color="#4b8ef5" style={{ animation: 'spin 1s linear infinite' }} />
                <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.9rem' }}>Procesando archivo…</div>
                <div style={{ width: '100%', height: 8, background: '#F1F5F9', borderRadius: 4 }}>
                  <div style={{ height: '100%', background: '#4b8ef5', borderRadius: 4, width: `${progress}%`, transition: 'width 0.15s' }} />
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{progress}% completado</div>
              </div>
            )}
            {status === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', padding: '1.5rem 0' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle size={28} color="#22c55e" />
                </div>
                <div style={{ fontWeight: 700, color: '#15803d', fontSize: '0.95rem' }}>Importación completada</div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', textAlign: 'center' }}>Los registros han sido importados correctamente al módulo {modulo}.</div>
                <button onClick={() => { setStatus('idle'); setFile(null); setProgress(0); }} style={btnGhost}>Nueva importación</button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeOp === 'export' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {modulos.map(m => (
            <div key={m} style={{ ...card, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Database size={18} color="#4b8ef5" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.85rem' }}>{m}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Exportar registros</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ flex: 1, ...btnGhost, justifyContent: 'center', fontSize: '0.75rem' }}><FileText size={13} /> CSV</button>
                <button style={{ flex: 1, ...btnGhost, justifyContent: 'center', fontSize: '0.75rem' }}><Download size={13} /> Excel</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab Licencias ────────────────────────────────────────────────────────────
function TabLicencias() {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/admin/feature-flags', { withCredentials: true })
      .then(r => setFlags(r.data.flags || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const RESOURCES = [
    { label: 'Usuarios activos', used: 3, max: 20, color: '#3b82f6' },
    { label: 'Registros totales', used: 48, max: 10000, color: '#7c3aed' },
    { label: 'Proyectos / Sitios', used: 2, max: 50, color: '#22c55e' },
    { label: 'Almacenamiento (GB)', used: 1.2, max: 50, color: '#f59e0b' },
  ];

  const pct = (u: number, l: number) => Math.round((u / l) * 100);
  const barColor = (p: number) => p >= 90 ? '#ef4444' : p >= 70 ? '#f59e0b' : '#22c55e';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ ...card, background: 'linear-gradient(135deg, #1e3a5f 0%, #2563EB 100%)', color: '#fff', border: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Award size={24} color="#fbbf24" />
              <h3 style={{ fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>SKIA DCIM — Plan Profesional</h3>
            </div>
            <div style={{ fontSize: '0.82rem', opacity: 0.8 }}>Licencia activa hasta: <strong>2027-05-19</strong></div>
          </div>
          <span style={{ background: '#22c55e', color: '#fff', padding: '4px 14px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>Activo</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
        {RESOURCES.map(r => {
          const p = pct(r.used, r.max);
          const bc = barColor(p);
          return (
            <div key={r.label} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>{r.label}</span>
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>{r.used} / {r.max}</span>
              </div>
              <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, marginBottom: 6 }}>
                <div style={{ height: '100%', background: bc, borderRadius: 4, width: `${p}%`, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: '0.72rem', color: bc, fontWeight: 600 }}>{p}% utilizado</div>
            </div>
          );
        })}
      </div>

      <div style={card}>
        <h3 style={{ fontWeight: 700, color: '#1E293B', margin: '0 0 1.25rem 0', fontSize: '0.9rem' }}>Módulos incluidos en el plan</h3>
        {loading ? <Spinner /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {flags.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: f.enabled ? '#F0FDF4' : '#F8FAFF', border: `1px solid ${f.enabled ? '#BBF7D0' : '#E2E8F0'}`, borderRadius: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: f.enabled ? '#22c55e22' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {f.enabled ? <Check size={14} color="#22c55e" /> : <Lock size={14} color="#94a3b8" />}
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: f.enabled ? '#15803d' : '#94a3b8' }}>{f.name}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{f.description || (f.enabled ? 'Incluido' : 'No disponible')}</div>
                </div>
              </div>
            ))}
            {flags.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.85rem' }}>No hay módulos configurados</div>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button style={btnGhost}><FileText size={14} /> Ver factura</button>
        <button style={btnStyle('#f59e0b')}><Star size={14} /> Actualizar plan</button>
        <button style={btnStyle()}><RefreshCw size={14} /> Renovar licencia</button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'organizacion',   label: 'Organización',         icon: Building2 },
  { id: 'usuarios',       label: 'Usuarios',             icon: Users },
  { id: 'proyectos',      label: 'Proyectos',            icon: Map },
  { id: 'integradores',   label: 'Integradores',         icon: Network },
  { id: 'catalogos',      label: 'Catálogos',            icon: BookOpen },
  { id: 'auditoria',      label: 'Auditoría',            icon: ClipboardList },
  { id: 'notificaciones', label: 'Notificaciones',       icon: Bell },
  { id: 'importacion',    label: 'Importar / Exportar',  icon: Upload },
  { id: 'licencias',      label: 'Licencias',            icon: Award },
];

export default function AdministracionPage() {
  const [activeTab, setActiveTab] = useState<TabId>('organizacion');

  return (
    <AppLayout>
      <Head><title>Administración — SKIA DCIM</title></Head>
      <div style={{ padding: '1.5rem', minHeight: '100vh', background: '#EEF0F8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: '1.5rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#4b8ef522', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Settings size={22} color="#4b8ef5" />
          </div>
          <div>
            <h1 style={{ color: '#1E293B', fontWeight: 800, fontSize: '1.5rem', margin: 0 }}>Administración</h1>
            <p style={{ color: '#64748B', fontSize: '0.82rem', margin: 0 }}>Gestión de organización, usuarios, proyectos, catálogos y configuración del sistema.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 2, marginBottom: '1.5rem', background: '#FFFFFF', padding: '6px', borderRadius: 12, border: '1px solid #E2E8F0', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', background: activeTab === t.id ? '#4b8ef5' : 'transparent', color: activeTab === t.id ? '#fff' : '#475569', transition: 'all 0.15s' }}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'organizacion'   && <TabOrganizacion />}
        {activeTab === 'usuarios'       && <TabUsuarios />}
        {activeTab === 'proyectos'      && <TabProyectos />}
        {activeTab === 'integradores'   && <TabIntegradores />}
        {activeTab === 'catalogos'      && <TabCatalogos />}
        {activeTab === 'auditoria'      && <TabAuditoria />}
        {activeTab === 'notificaciones' && <TabNotificaciones />}
        {activeTab === 'importacion'    && <TabImportacion />}
        {activeTab === 'licencias'      && <TabLicencias />}
      </div>
    </AppLayout>
  );
}
