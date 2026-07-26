import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import AppLayout from '../../components/AppLayout';
import {
  Settings, Network, Radio, Lightbulb, Shield, Key,
  Puzzle, Save, Eye, EyeOff, Plus, Trash2, RefreshCw, Copy,
  CheckCircle, XCircle, AlertTriangle, Moon, Sun, Monitor, Globe,
  Lock, Unlock, Wifi, Server, ExternalLink, Info, Check, X, Loader2
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

/* ─── Tipos ─────────────────────────────────────────── */
type Tab = 'preferencias' | 'integraciones' | 'rfid' | 'branding' | 'seguridad' | 'apikeys' | 'modulos';

interface Integration {
  code: string; name: string; status: 'connected' | 'disconnected' | 'error';
  config: Record<string, string>;
}
interface ApiKey {
  id: string; name: string; keyPrefix: string; permissions: string[];
  active: boolean; lastUsed: string | null; createdAt: string;
}
interface RFIDReader { id: string; code: string; name: string; ip: string; status: string; readerType: string; location: string; }
interface FeatureFlag { id: string; code: string; name: string; description: string; enabled: boolean; }

/* ─── Hook genérico para sección de config ─────────── */
function useConfigSection<T extends object>(section: string, defaults: T) {
  const [data, setData] = useState<T>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API}/api/config/${section}`, { withCredentials: true })
      .then(r => { if (r.data?.data && Object.keys(r.data.data).length > 0) setData({ ...defaults, ...r.data.data }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [section]);

  const save = useCallback(async (payload?: T) => {
    setSaving(true); setError('');
    try {
      await axios.put(`${API}/api/config/${section}`, payload ?? data, { withCredentials: true });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  }, [section, data]);

  return { data, setData, loading, saving, saved, error, save };
}

/* ─── Spinner ────────────────────────────────────────── */
function Spinner() { return <div className="flex items-center justify-center py-12"><Loader2 size={28} className="animate-spin text-blue-500" /></div>; }

/* ─── Botón guardar ──────────────────────────────────── */
function SaveBtn({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={saving}
      className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60 ${saved ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
      {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
      {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar'}
    </button>
  );
}

/* ─── Toggle ─────────────────────────────────────────── */
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className={`w-11 h-6 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-gray-300'} relative flex-shrink-0`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

/* ─── Sección Preferencias ───────────────────────────── */
function SecPreferencias() {
  const { data, setData, loading, saving, saved, error, save } = useConfigSection('preferencias', {
    theme: 'light', lang: 'es-MX', tz: 'America/Mexico_City',
    dateFormat: 'DD/MM/YYYY', currency: 'MXN', density: 'normal',
    autoSave: true, animations: true,
  });

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Monitor size={18} className="text-blue-600" /> Apariencia</h3>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[{ id: 'light', label: 'Claro', icon: <Sun size={20} /> }, { id: 'dark', label: 'Oscuro', icon: <Moon size={20} /> }, { id: 'system', label: 'Sistema', icon: <Monitor size={20} /> }].map(t => (
            <button key={t.id} onClick={() => setData(d => ({ ...d, theme: t.id }))}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${data.theme === t.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              {t.icon}<span className="text-sm font-medium">{t.label}</span>
            </button>
          ))}
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Densidad de interfaz</label>
          <div className="flex gap-2">
            {['compact', 'normal', 'comfortable'].map(d => (
              <button key={d} onClick={() => setData(prev => ({ ...prev, density: d }))}
                className={`px-4 py-1.5 rounded-lg text-sm border transition-all ${data.density === d ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {d === 'compact' ? 'Compacto' : d === 'normal' ? 'Normal' : 'Cómodo'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between py-3 mt-3 border-t border-gray-100">
          <div><p className="text-sm font-medium text-gray-700">Animaciones</p><p className="text-xs text-gray-500">Transiciones y efectos visuales</p></div>
          <Toggle value={data.animations} onChange={v => setData(d => ({ ...d, animations: v }))} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Globe size={18} className="text-green-600" /> Regionalización</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Idioma', key: 'lang', options: [['es-MX','Español (México)'],['es-ES','Español (España)'],['en-US','English (US)'],['pt-BR','Português (Brasil)']] },
            { label: 'Zona horaria', key: 'tz', options: [['America/Mexico_City','Ciudad de México (UTC-6)'],['America/Monterrey','Monterrey (UTC-6)'],['America/Cancun','Cancún (UTC-5)'],['America/Bogota','Bogotá (UTC-5)'],['America/Lima','Lima (UTC-5)'],['America/Santiago','Santiago (UTC-4)'],['America/Buenos_Aires','Buenos Aires (UTC-3)']] },
            { label: 'Formato de fecha', key: 'dateFormat', options: [['DD/MM/YYYY','DD/MM/YYYY'],['MM/DD/YYYY','MM/DD/YYYY'],['YYYY-MM-DD','YYYY-MM-DD (ISO)']] },
            { label: 'Moneda', key: 'currency', options: [['MXN','MXN — Peso mexicano'],['USD','USD — Dólar americano'],['EUR','EUR — Euro'],['COP','COP — Peso colombiano'],['PEN','PEN — Sol peruano']] },
          ].map(f => (
            <div key={f.key}>
              <label className="text-sm font-medium text-gray-700 mb-1 block">{f.label}</label>
              <select value={(data as any)[f.key]} onChange={e => setData(d => ({ ...d, [f.key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Settings size={18} className="text-purple-600" /> Comportamiento</h3>
        <div className="flex items-center justify-between py-2">
          <div><p className="text-sm font-medium text-gray-700">Guardado automático</p><p className="text-xs text-gray-500">Guarda formularios al salir</p></div>
          <Toggle value={data.autoSave} onChange={v => setData(d => ({ ...d, autoSave: v }))} />
        </div>
      </div>

      <div className="flex justify-end"><SaveBtn saving={saving} saved={saved} onClick={() => save()} /></div>
    </div>
  );
}

/* ─── Sección Integraciones ──────────────────────────── */
function SecIntegraciones() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Integration | null>(null);
  const [localConfig, setLocalConfig] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);
  const [saving, setSaving] = useState(false);

  const ICONS: Record<string, string> = { fluke: '🔌', panduit: '📋', active_directory: '🏢', slack: '💬', jira: '🎯', teams: '🟦' };
  const NAMES: Record<string, string> = { fluke: 'Fluke DSX', panduit: 'Panduit', active_directory: 'Active Directory', slack: 'Slack', jira: 'Jira', teams: 'Microsoft Teams' };
  const DESCS: Record<string, string> = {
    fluke: 'Importación automática de resultados de prueba desde certificadores Fluke DSX-8000/5000.',
    panduit: 'Sincronización de certificados Panduit con módulo de Normativa.',
    active_directory: 'Autenticación SSO con Active Directory / LDAP corporativo.',
    slack: 'Envío de alertas y notificaciones al canal de Slack del equipo.',
    jira: 'Sincronización bidireccional de tickets con Jira Service Management.',
    teams: 'Notificaciones en canales de Microsoft Teams.',
  };

  useEffect(() => {
    axios.get(`${API}/api/config/integrations`, { withCredentials: true })
      .then(r => setIntegrations(r.data.integrations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectInteg = (intg: Integration) => {
    setSelected(intg); setLocalConfig({ ...intg.config }); setTestResult(null);
  };

  const saveInteg = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await axios.put(`${API}/api/config/integrations/${selected.code}`,
        { status: selected.status, config: localConfig }, { withCredentials: true });
      setIntegrations(prev => prev.map(i => i.code === selected.code ? { ...i, config: localConfig } : i));
      setSelected(prev => prev ? { ...prev, config: localConfig } : null);
    } catch {}
    setSaving(false);
  };

  const toggleStatus = async () => {
    if (!selected) return;
    const newStatus = selected.status === 'connected' ? 'disconnected' : 'connected';
    await axios.put(`${API}/api/config/integrations/${selected.code}`,
      { status: newStatus, config: localConfig }, { withCredentials: true });
    setIntegrations(prev => prev.map(i => i.code === selected.code ? { ...i, status: newStatus } : i));
    setSelected(prev => prev ? { ...prev, status: newStatus } : null);
  };

  const testConn = () => {
    setTesting(true); setTestResult(null);
    setTimeout(() => { setTesting(false); setTestResult(selected?.status === 'connected' ? 'ok' : 'error'); }, 1800);
  };

  const statusColor = (s: string) => s === 'connected' ? 'text-green-600 bg-green-50 border-green-200' : s === 'error' ? 'text-red-600 bg-red-50 border-red-200' : 'text-gray-500 bg-gray-50 border-gray-200';
  const statusLabel = (s: string) => s === 'connected' ? 'Conectado' : s === 'error' ? 'Error' : 'Desconectado';

  if (loading) return <Spinner />;

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-1 space-y-2">
        {integrations.map(intg => (
          <button key={intg.code} onClick={() => selectInteg(intg)}
            className={`w-full text-left p-3 rounded-xl border transition-all ${selected?.code === intg.code ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{ICONS[intg.code] || '🔧'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{NAMES[intg.code] || intg.name}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor(intg.status)}`}>{statusLabel(intg.status)}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="col-span-2">
        {selected ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{ICONS[selected.code] || '🔧'}</span>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">{NAMES[selected.code] || selected.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor(selected.status)}`}>{statusLabel(selected.status)}</span>
                </div>
              </div>
              <a href="#" className="text-blue-600 text-sm flex items-center gap-1 hover:underline"><ExternalLink size={14} /> Docs</a>
            </div>
            <p className="text-sm text-gray-600">{DESCS[selected.code] || ''}</p>
            <div className="space-y-3">
              {Object.entries(localConfig).map(([k, v]) => (
                <div key={k}>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">{k}</label>
                  <input value={v} onChange={e => setLocalConfig(prev => ({ ...prev, [k]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            {testResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {testResult === 'ok' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {testResult === 'ok' ? 'Conexión exitosa.' : 'Error de conexión — verifica las credenciales.'}
              </div>
            )}
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button onClick={testConn} disabled={testing} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {testing ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
                {testing ? 'Probando…' : 'Probar'}
              </button>
              <button onClick={saveInteg} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
              <button onClick={toggleStatus} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border ${selected.status === 'connected' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                {selected.status === 'connected' ? <><Unlock size={14} /> Desconectar</> : <><Lock size={14} /> Conectar</>}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 h-full flex items-center justify-center min-h-[300px]">
            <div className="text-center text-gray-400"><Network size={40} className="mx-auto mb-3 opacity-40" /><p className="text-sm">Selecciona una integración</p></div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sección RFID ───────────────────────────────────── */
function SecRFID() {
  const { data, setData, loading, saving, saved, save } = useConfigSection('rfid', {
    enabled: false, readerType: 'fixed', frequency: 'uhf',
    autoSync: true, alertOnMove: true, readInterval: '30',
  });
  const [readers, setReaders] = useState<RFIDReader[]>([]);
  const [loadingReaders, setLoadingReaders] = useState(true);
  const [newReader, setNewReader] = useState({ code: '', name: '', ip: '', readerType: 'fixed', location: '' });
  const [addingReader, setAddingReader] = useState(false);

  useEffect(() => {
    axios.get(`${API}/api/config/rfid/readers`, { withCredentials: true })
      .then(r => setReaders(r.data.readers || []))
      .catch(() => {})
      .finally(() => setLoadingReaders(false));
  }, []);

  const addReader = async () => {
    if (!newReader.name || !newReader.code) return;
    try {
      const r = await axios.post(`${API}/api/config/rfid/readers`, newReader, { withCredentials: true });
      setReaders(prev => [...prev, { ...newReader, id: r.data.id, status: 'offline' }]);
      setNewReader({ code: '', name: '', ip: '', readerType: 'fixed', location: '' });
      setAddingReader(false);
    } catch {}
  };

  const deleteReader = async (id: string) => {
    await axios.delete(`${API}/api/config/rfid/readers/${id}`, { withCredentials: true });
    setReaders(prev => prev.filter(r => r.id !== id));
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${data.enabled ? 'bg-green-100' : 'bg-gray-100'}`}>
              <Radio size={20} className={data.enabled ? 'text-green-600' : 'text-gray-400'} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Módulo RFID</h3>
              <p className="text-sm text-gray-500">{data.enabled ? 'Activo' : 'Inactivo'}</p>
            </div>
          </div>
          <Toggle value={data.enabled} onChange={v => setData(d => ({ ...d, enabled: v }))} />
        </div>
      </div>

      {data.enabled && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Wifi size={18} className="text-blue-600" /> Configuración</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Tipo de lector</label>
                {[{ id: 'fixed', label: 'Lector fijo', desc: 'Instalado en rack o puerta' }, { id: 'handheld', label: 'Lector portátil', desc: 'Dispositivo móvil de mano' }, { id: 'both', label: 'Ambos', desc: 'Fijo + portátil' }].map(r => (
                  <label key={r.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer mb-2 transition-all ${data.readerType === r.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <input type="radio" name="reader" value={r.id} checked={data.readerType === r.id} onChange={() => setData(d => ({ ...d, readerType: r.id }))} className="mt-0.5" />
                    <div><p className="text-sm font-medium text-gray-700">{r.label}</p><p className="text-xs text-gray-500">{r.desc}</p></div>
                  </label>
                ))}
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Frecuencia</label>
                  <select value={data.frequency} onChange={e => setData(d => ({ ...d, frequency: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="uhf">UHF — 860-960 MHz</option>
                    <option value="hf">HF — 13.56 MHz (NFC)</option>
                    <option value="lf">LF — 125 kHz</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Intervalo de lectura (seg)</label>
                  <input type="number" value={data.readInterval} onChange={e => setData(d => ({ ...d, readInterval: e.target.value }))} min="5" max="300"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="space-y-2">
                  {[{ label: 'Sincronización automática', key: 'autoSync' }, { label: 'Alerta por movimiento no autorizado', key: 'alertOnMove' }].map(item => (
                    <div key={item.key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <p className="text-sm text-gray-700">{item.label}</p>
                      <Toggle value={(data as any)[item.key]} onChange={v => setData(d => ({ ...d, [item.key]: v }))} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Server size={18} className="text-orange-500" /> Lectores registrados</h3>
              <button onClick={() => setAddingReader(!addingReader)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <Plus size={14} /> Agregar
              </button>
            </div>
            {addingReader && (
              <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-200 grid grid-cols-2 gap-3">
                {[{ key: 'code', ph: 'Código (ej: RDR-004)' }, { key: 'name', ph: 'Nombre' }, { key: 'ip', ph: 'IP (ej: 192.168.1.104)' }, { key: 'location', ph: 'Ubicación' }].map(f => (
                  <input key={f.key} value={(newReader as any)[f.key]} onChange={e => setNewReader(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.ph} className="border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                ))}
                <div className="col-span-2 flex gap-2">
                  <button onClick={addReader} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Guardar lector</button>
                  <button onClick={() => setAddingReader(false)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"><X size={14} /></button>
                </div>
              </div>
            )}
            {loadingReaders ? <Spinner /> : (
              <div className="space-y-2">
                {readers.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No hay lectores registrados</p>}
                {readers.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${r.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} />
                      <div><p className="text-sm font-medium text-gray-700">{r.name}</p><p className="text-xs text-gray-500">{r.code} · {r.ip}</p></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{r.status === 'online' ? 'En línea' : 'Fuera de línea'}</span>
                      <button onClick={() => deleteReader(r.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <div className="flex justify-end"><SaveBtn saving={saving} saved={saved} onClick={() => save()} /></div>
    </div>
  );
}

/* ─── Sección Branding ───────────────────────────────── */
function SecBranding() {
  const { data, setData, loading, saving, saved, save } = useConfigSection('branding', {
    primaryColor: '#2563EB', accentColor: '#7C3AED',
    companyName: 'SKIA DCIM', tagline: 'Gestión de Infraestructura Digital', showLogo: true,
  });

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Lightbulb size={18} className="text-yellow-500" /> Identidad visual</h3>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Nombre del sistema</label>
              <input value={data.companyName} onChange={e => setData(d => ({ ...d, companyName: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Tagline</label>
              <input value={data.tagline} onChange={e => setData(d => ({ ...d, tagline: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[{ label: 'Color primario', key: 'primaryColor' }, { label: 'Color de acento', key: 'accentColor' }].map(f => (
                <div key={f.key}>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">{f.label}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={(data as any)[f.key]} onChange={e => setData(d => ({ ...d, [f.key]: e.target.value }))} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                    <input value={(data as any)[f.key]} onChange={e => setData(d => ({ ...d, [f.key]: e.target.value }))} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Vista previa</label>
            <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <div style={{ background: data.primaryColor }} className="px-4 py-3 flex items-center gap-3">
                <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center text-white font-bold text-sm">S</div>
                <div><p className="text-white font-bold text-sm">{data.companyName || 'SKIA DCIM'}</p><p className="text-white/70 text-xs">{data.tagline}</p></div>
              </div>
              <div className="bg-gray-50 p-4 space-y-2">
                <div className="h-2 rounded-full w-3/4" style={{ background: data.primaryColor, opacity: 0.3 }} />
                <div className="h-2 rounded-full w-1/2" style={{ background: data.primaryColor, opacity: 0.2 }} />
                <div className="mt-3 flex gap-2">
                  <div className="px-3 py-1.5 rounded-lg text-white text-xs font-medium" style={{ background: data.primaryColor }}>Primario</div>
                  <div className="px-3 py-1.5 rounded-lg text-white text-xs font-medium" style={{ background: data.accentColor }}>Acento</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end"><SaveBtn saving={saving} saved={saved} onClick={() => save()} /></div>
    </div>
  );
}

/* ─── Sección Seguridad ──────────────────────────────── */
function SecSeguridad() {
  const { data, setData, loading, saving, saved, save } = useConfigSection('seguridad', {
    mfa: false, sessionTimeout: '480', passwordMinLen: '8',
    requireSpecial: true, requireNumbers: true, maxLoginAttempts: '5', ipWhitelist: '',
  });

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Shield size={18} className="text-red-600" /> Autenticación</h3>
        <div className="flex items-center justify-between py-3 border-b border-gray-100 mb-4">
          <div><p className="text-sm font-medium text-gray-700">Autenticación de dos factores (MFA)</p><p className="text-xs text-gray-500">Requiere código TOTP al iniciar sesión</p></div>
          <Toggle value={data.mfa} onChange={v => setData(d => ({ ...d, mfa: v }))} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Tiempo de sesión (minutos)</label>
            <input type="number" value={data.sessionTimeout} onChange={e => setData(d => ({ ...d, sessionTimeout: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Intentos máximos de login</label>
            <input type="number" value={data.maxLoginAttempts} onChange={e => setData(d => ({ ...d, maxLoginAttempts: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Lock size={18} className="text-orange-500" /> Política de contraseñas</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Longitud mínima</label>
            <input type="number" value={data.passwordMinLen} onChange={e => setData(d => ({ ...d, passwordMinLen: e.target.value }))} min="6" max="32" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-2 pt-1">
            {[{ label: 'Requiere caracteres especiales', key: 'requireSpecial' }, { label: 'Requiere números (0-9)', key: 'requireNumbers' }].map(item => (
              <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(data as any)[item.key]} onChange={e => setData(d => ({ ...d, [item.key]: e.target.checked }))} className="rounded" />
                <span className="text-sm text-gray-700">{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Globe size={18} className="text-blue-600" /> Lista blanca de IPs</h3>
        <textarea value={data.ipWhitelist} onChange={e => setData(d => ({ ...d, ipWhitelist: e.target.value }))} rows={4}
          placeholder={"192.168.1.0/24\n10.0.0.1\n# Una IP o rango CIDR por línea"}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>
      <div className="flex justify-end"><SaveBtn saving={saving} saved={saved} onClick={() => save()} /></div>
    </div>
  );
}

/* ─── Sección API Keys ───────────────────────────────── */
function SecApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [newFullKey, setNewFullKey] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`${API}/api/config/apikeys`, { withCredentials: true })
      .then(r => setKeys(r.data.keys || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const createKey = async () => {
    if (!newName.trim()) return;
    try {
      const r = await axios.post(`${API}/api/config/apikeys`, { name: newName, permissions: ['read:all'] }, { withCredentials: true });
      setNewFullKey(r.data.key);
      setKeys(prev => [{ id: r.data.id, name: newName, keyPrefix: r.data.key.substring(0, 20), permissions: ['read:all'], active: true, lastUsed: null, createdAt: new Date().toISOString().split('T')[0] }, ...prev]);
      setNewName(''); setCreating(false);
    } catch {}
  };

  const deleteKey = async (id: string) => {
    await axios.delete(`${API}/api/config/apikeys/${id}`, { withCredentials: true });
    setKeys(prev => prev.filter(k => k.id !== id));
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopied(key); setTimeout(() => setCopied(null), 2000);
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-amber-800">Las API Keys otorgan acceso programático al sistema. Guárdalas en un lugar seguro — no se mostrarán completas después de la creación.</p>
      </div>
      {newFullKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800 mb-1">API Key creada — cópiala ahora, no se mostrará de nuevo</p>
            <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-green-200 font-mono text-xs">
              <span className="flex-1 break-all">{newFullKey}</span>
              <button onClick={() => copyKey(newFullKey)} className={copied === newFullKey ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'}>
                {copied === newFullKey ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>
          <button onClick={() => setNewFullKey(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Key size={18} className="text-blue-600" /> API Keys activas</h3>
          <button onClick={() => setCreating(!creating)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={14} /> Nueva API Key
          </button>
        </div>
        {creating && (
          <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-200 flex items-center gap-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre descriptivo (ej: App Móvil)"
              className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            <button onClick={createKey} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Crear</button>
            <button onClick={() => setCreating(false)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"><X size={14} /></button>
          </div>
        )}
        <div className="space-y-3">
          {keys.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No hay API Keys creadas</p>}
          {keys.map(k => (
            <div key={k.id} className={`p-4 rounded-xl border ${k.active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-800">{k.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${k.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{k.active ? 'Activa' : 'Inactiva'}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-1.5">
                    <span className="flex-1 truncate">{k.keyPrefix}••••••••••••••••••••</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span>Creada: {k.createdAt}</span>
                    <span>Último uso: {k.lastUsed || 'Nunca'}</span>
                  </div>
                </div>
                <button onClick={() => deleteKey(k.id)} className="text-red-400 hover:text-red-600 p-1 flex-shrink-0"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Sección Módulos ────────────────────────────────── */
function SecModulos() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`${API}/api/admin/feature-flags`, { withCredentials: true })
      .then(r => setFlags(r.data.flags || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (flag: FeatureFlag) => {
    setSaving(flag.code);
    const newVal = !flag.enabled;
    try {
      await axios.put(`${API}/api/admin/feature-flags`, { code: flag.code, enabled: newVal }, { withCredentials: true });
      setFlags(prev => prev.map(f => f.code === flag.code ? { ...f, enabled: newVal } : f));
    } catch {}
    setSaving(null);
  };

  if (loading) return <Spinner />;

  const enabledCount = flags.filter(f => f.enabled).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[{ label: 'Módulos activos', value: enabledCount, color: 'text-green-600', bg: 'bg-green-50' }, { label: 'Módulos inactivos', value: flags.length - enabledCount, color: 'text-gray-500', bg: 'bg-gray-50' }].map(kpi => (
          <div key={kpi.label} className={`${kpi.bg} rounded-xl p-4 border border-gray-200`}>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-sm text-gray-600">{kpi.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Puzzle size={18} className="text-blue-600" /> Módulos del sistema</h3>
        {flags.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No hay módulos configurados en la base de datos</p>}
        <div className="space-y-3">
          {flags.map(mod => (
            <div key={mod.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${mod.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${mod.enabled ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <Puzzle size={16} className={mod.enabled ? 'text-blue-600' : 'text-gray-400'} />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${mod.enabled ? 'text-gray-800' : 'text-gray-400'}`}>{mod.name}</p>
                  <p className="text-xs text-gray-500">{mod.description}</p>
                </div>
              </div>
              {saving === mod.code
                ? <Loader2 size={18} className="animate-spin text-blue-500 flex-shrink-0" />
                : <Toggle value={mod.enabled} onChange={() => toggle(mod)} />
              }
            </div>
          ))}
        </div>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">Los cambios se guardan inmediatamente en la base de datos. Desactivar un módulo oculta su acceso en el menú pero no elimina los datos existentes.</p>
      </div>
    </div>
  );
}

/* ─── Página principal ───────────────────────────────── */
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'preferencias',  label: 'Preferencias',  icon: <Settings size={16} /> },
  { id: 'integraciones', label: 'Integraciones', icon: <Network size={16} /> },
  { id: 'rfid',          label: 'RFID',          icon: <Radio size={16} /> },
  { id: 'branding',      label: 'Branding',      icon: <Lightbulb size={16} /> },
  { id: 'seguridad',     label: 'Seguridad',     icon: <Shield size={16} /> },
  { id: 'apikeys',       label: 'API Keys',      icon: <Key size={16} /> },
  { id: 'modulos',       label: 'Módulos',       icon: <Puzzle size={16} /> },
];

export default function ConfiguracionPage() {
  const [tab, setTab] = useState<Tab>('preferencias');
  return (
    <AppLayout title="Configuración" breadcrumb={[{ label: 'Configuración' }]}>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Configuración del sistema</h1>
          <p className="text-sm text-gray-500 mt-1">Personaliza el comportamiento, apariencia, seguridad e integraciones de SKIA DCIM.</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {tab === 'preferencias'  && <SecPreferencias />}
        {tab === 'integraciones' && <SecIntegraciones />}
        {tab === 'rfid'          && <SecRFID />}
        {tab === 'branding'      && <SecBranding />}
        {tab === 'seguridad'     && <SecSeguridad />}
        {tab === 'apikeys'       && <SecApiKeys />}
        {tab === 'modulos'       && <SecModulos />}
      </div>
    </AppLayout>
  );
}
