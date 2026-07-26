import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState } from 'react';
import {
  Tag, Network, Package, Layers, Zap, Camera, Server,
  MapPin, Calendar, Wrench, FileText, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, XCircle, Plus, X, Upload,
  Wifi, Shield, Activity, Clock, User,
} from 'lucide-react';

// ── Datos mock por código RFID ──────────────────────────────────────────────
interface ServiceLog {
  id: string; date: string; tech: string; type: string; description: string; status: 'ok'|'warn'|'error';
}
interface DeviceData {
  code: string; category: string; equipment: string; brand: string; model: string;
  serie: string; ubicacion: string; ip?: string; firmware?: string; status: string;
  foto: string; anio_instalacion: number; observaciones: string;
  connections: { label: string; target: string; type: string; color: string }[];
  logs: ServiceLog[];
}

const MOCK_DEVICES: Record<string, DeviceData> = {
  'SKIA-SW-000001': {
    code: 'SKIA-SW-000001', category: 'Switch', equipment: 'SW-CORE-A001',
    brand: 'Cisco', model: 'Catalyst 9300-48P', serie: 'FDO2312G0AB',
    ubicacion: 'MDF Torre A — Rack RCK-MDF-A001 U12', ip: '10.0.0.1', firmware: '17.9.4a',
    status: 'Activo', foto: '', anio_instalacion: 2023,
    observaciones: 'Switch core principal. Conectado a router de borde y distribución.',
    connections: [
      { label: 'Router Borde', target: 'RTR-BORDE-001', type: 'uplink', color: '#0e7490' },
      { label: 'SW-DIST-B001', target: 'SW-DIST-B001', type: 'trunk', color: '#7c3aed' },
      { label: 'SW-DIST-C001', target: 'SW-DIST-C001', type: 'trunk', color: '#7c3aed' },
      { label: 'Firewall', target: 'FW-CORE-001', type: 'mgmt', color: '#dc2626' },
      { label: 'NMS / Zabbix', target: 'SRV-NMS-001', type: 'mgmt', color: '#059669' },
    ],
    logs: [
      { id:'l1', date:'2026-05-10', tech:'Carlos Ruiz', type:'Mantenimiento preventivo', description:'Limpieza de puertos, verificación de temperatura, respaldo de configuración.', status:'ok' },
      { id:'l2', date:'2026-04-02', tech:'Ana López', type:'Actualización firmware', description:'Actualización de IOS-XE 17.6.5 a 17.9.4a. Sin incidencias.', status:'ok' },
      { id:'l3', date:'2026-02-15', tech:'Carlos Ruiz', type:'Incidente', description:'Puerto Gi1/0/12 reportó errores CRC. Se reemplazó patch cord. Resuelto.', status:'warn' },
    ],
  },
  'SKIA-MDF-000001': {
    code: 'SKIA-MDF-000001', category: 'MDF/IDF', equipment: 'MDF Torre A',
    brand: 'Panduit', model: 'FlexFusion', serie: 'PAN-MDF-2023-001',
    ubicacion: 'Torre A — Piso 1 — Cuarto de Telecomunicaciones', ip: undefined, firmware: undefined,
    status: 'Activo', foto: '', anio_instalacion: 2020,
    observaciones: 'MDF principal del edificio. Aloja el core de red y los servicios centrales.',
    connections: [
      { label: 'SW-CORE-A001', target: 'SKIA-SW-000001', type: 'switch', color: '#0e7490' },
      { label: 'UPS-MDF-A001', target: 'SKIA-UPS-000001', type: 'power', color: '#d97706' },
      { label: 'PP-MDF-A001', target: 'SKIA-PP-000001', type: 'cabling', color: '#7c3aed' },
      { label: 'Fibra ISP', target: 'ISP-FIBER-001', type: 'wan', color: '#dc2626' },
    ],
    logs: [
      { id:'l1', date:'2026-05-01', tech:'Ing. Martínez', type:'Inspección', description:'Inspección semestral. Temperatura 22°C, humedad 45%. Todo en orden.', status:'ok' },
      { id:'l2', date:'2025-11-10', tech:'Carlos Ruiz', type:'Mantenimiento', description:'Limpieza general, revisión de PDUs y UPS. Batería UPS al 92%.', status:'ok' },
    ],
  },
  'SKIA-RCK-000001': {
    code: 'SKIA-RCK-000001', category: 'Rack', equipment: 'Rack Cableado IDF2',
    brand: 'Panduit', model: 'RP40', serie: 'PAN-RP40-2026-001',
    ubicacion: 'IDF2 — Área de Producción — U1-U48', ip: undefined, firmware: undefined,
    status: 'Activo', foto: '', anio_instalacion: 2026,
    observaciones: 'Rack de cableado zona producción. 32U ocupadas de 48U.',
    connections: [
      { label: 'PP-IDF2-A001', target: 'SKIA-PP-000001', type: 'cabling', color: '#7c3aed' },
      { label: 'SW-ACC-C001', target: 'SW-ACC-C001', type: 'switch', color: '#0e7490' },
      { label: 'PDU-IDF2-001', target: 'PDU-IDF2-001', type: 'power', color: '#d97706' },
    ],
    logs: [
      { id:'l1', date:'2026-05-15', tech:'Téc. García', type:'Instalación', description:'Instalación inicial del rack. Montaje y cableado completado.', status:'ok' },
    ],
  },
};

const DEFAULT_DEVICE: DeviceData = {
  code: '', category: 'Activo', equipment: 'Dispositivo no encontrado',
  brand: '—', model: '—', serie: '—', ubicacion: '—', status: 'Desconocido',
  foto: '', anio_instalacion: 0, observaciones: 'Este código RFID no está registrado en el sistema.',
  connections: [], logs: [],
};

const CAT_COLORS: Record<string,string> = {
  'MDF/IDF':'bg-violet-100 text-violet-700','Rack':'bg-blue-100 text-blue-700',
  'Patch Panel':'bg-cyan-100 text-cyan-700','Switch':'bg-teal-100 text-teal-700',
  'UPS/PDU':'bg-amber-100 text-amber-700','Activo':'bg-slate-100 text-slate-700',
  'Cámara':'bg-rose-100 text-rose-700','Servidor':'bg-indigo-100 text-indigo-700',
};

const CONN_TYPE_LABELS: Record<string,string> = {
  uplink:'Uplink', trunk:'Trunk', mgmt:'Gestión', switch:'Switch', power:'Energía',
  cabling:'Cableado', wan:'WAN/ISP',
};

function TopologyDiagram({ device }: { device: DeviceData }) {
  return (
    <div className="relative bg-slate-900 rounded-2xl p-6 overflow-x-auto">
      <div className="flex flex-col items-center gap-4 min-w-64">
        {/* Nodo central */}
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 border-2 border-cyan-400">
            <Network size={24} className="text-white"/>
          </div>
          <div className="mt-2 text-center">
            <div className="text-xs font-bold text-white">{device.equipment}</div>
            <div className="text-[10px] text-slate-400 font-mono">{device.code}</div>
            {device.ip && <div className="text-[10px] text-cyan-400 font-mono">{device.ip}</div>}
          </div>
        </div>

        {/* Línea central */}
        {device.connections.length > 0 && <div className="w-0.5 h-6 bg-slate-600"/>}

        {/* Conexiones */}
        {device.connections.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3">
            {device.connections.map((conn, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-0.5 h-4 bg-slate-600"/>
                <div className="bg-slate-800 border rounded-xl px-3 py-2 text-center min-w-24" style={{ borderColor: conn.color + '60' }}>
                  <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: conn.color }}>{CONN_TYPE_LABELS[conn.type]||conn.type}</div>
                  <div className="text-[10px] font-semibold text-white">{conn.label}</div>
                  <div className="text-[9px] text-slate-400 font-mono">{conn.target}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {device.connections.length === 0 && (
          <div className="text-xs text-slate-500 text-center py-2">Sin conexiones registradas</div>
        )}
      </div>
    </div>
  );
}

function NewLogModal({ onClose, onSave }: { onClose:()=>void; onSave:(l:ServiceLog)=>void }) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), tech:'', type:'Mantenimiento preventivo', description:'', status:'ok' as 'ok'|'warn'|'error' });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">Nueva entrada en bitácora</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16}/></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"/></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Técnico</label><input value={form.tech} onChange={e=>setForm(f=>({...f,tech:e.target.value}))} className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg" placeholder="Nombre del técnico"/></div>
        </div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Tipo de servicio</label>
          <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg">
            {['Mantenimiento preventivo','Mantenimiento correctivo','Actualización firmware','Incidente','Inspección','Instalación','Baja'].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Descripción</label><textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={3} className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg" placeholder="Describe el trabajo realizado..."/></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Resultado</label>
          <div className="flex gap-2">
            {(['ok','warn','error'] as const).map(s=>(
              <button key={s} onClick={()=>setForm(f=>({...f,status:s}))} className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${form.status===s?(s==='ok'?'bg-emerald-500 text-white border-emerald-500':s==='warn'?'bg-amber-500 text-white border-amber-500':'bg-red-500 text-white border-red-500'):'bg-white text-slate-500 border-slate-200'}`}>
                {s==='ok'?'✓ OK':s==='warn'?'⚠ Advertencia':'✗ Error'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl">Cancelar</button>
          <button onClick={()=>{if(!form.tech||!form.description)return;onSave({id:`l${Date.now()}`,date:form.date,tech:form.tech,type:form.type,description:form.description,status:form.status});onClose();}} className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl">Guardar</button>
        </div>
      </div>
    </div>
  );
}

export default function RfidMobilePage() {
  const router = useRouter();
  const { code } = router.query;
  const deviceCode = typeof code === 'string' ? decodeURIComponent(code) : '';
  const baseDevice = MOCK_DEVICES[deviceCode] ?? { ...DEFAULT_DEVICE, code: deviceCode };
  const [device, setDevice] = useState<DeviceData>(baseDevice);
  const [activeTab, setActiveTab] = useState<'inventario'|'topologia'|'bitacora'>('inventario');
  const [newLogOpen, setNewLogOpen] = useState(false);

  const handleAddLog = (log: ServiceLog) => setDevice(d => ({ ...d, logs: [log, ...d.logs] }));

  const statusColor = device.status === 'Activo' ? 'bg-emerald-100 text-emerald-700' : device.status === 'Inactivo' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';

  return (
    <>
      <Head><title>{device.equipment} — SKIA RFID</title></Head>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Header móvil */}
        <div className="bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <Tag size={14} className="text-white"/>
              </div>
              <div>
                <div className="text-xs font-bold text-white leading-tight">SKIA DCIM</div>
                <div className="text-[10px] text-slate-400">Módulo Móvil RFID</div>
              </div>
            </div>
            <div className="font-mono text-[10px] text-cyan-400 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700">{deviceCode||'—'}</div>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
          {/* Card principal */}
          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              {device.foto ? (
                <img src={device.foto} alt={device.equipment} className="w-16 h-16 rounded-xl object-cover border border-slate-600"/>
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-700 flex items-center justify-center border border-slate-600">
                  <Camera size={20} className="text-slate-400"/>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CAT_COLORS[device.category]||'bg-slate-100 text-slate-700'}`}>{device.category}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>{device.status}</span>
                </div>
                <h1 className="text-base font-bold text-white leading-tight">{device.equipment}</h1>
                <p className="text-xs text-slate-400 mt-0.5">{device.brand} {device.model}</p>
                <div className="flex items-center gap-1 mt-1"><MapPin size={10} className="text-slate-500"/><span className="text-[10px] text-slate-400">{device.ubicacion}</span></div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-800/60 rounded-xl p-1 border border-slate-700/50">
            {([['inventario','Inventario'],['topologia','Topología'],['bitacora','Bitácora']] as const).map(([tab,label])=>(
              <button key={tab} onClick={()=>setActiveTab(tab)} className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab===tab?'bg-cyan-600 text-white shadow-md':'text-slate-400 hover:text-slate-200'}`}>{label}</button>
            ))}
          </div>

          {/* TAB: Inventario */}
          {activeTab==='inventario' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[['Marca',device.brand],['Modelo',device.model],['Serie',device.serie],['Año Inst.',String(device.anio_instalacion)],['IP Gestión',device.ip||'—'],['Firmware',device.firmware||'—']].map(([k,v])=>(
                  <div key={k} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">{k}</div>
                    <div className="text-xs font-semibold text-white truncate">{v}</div>
                  </div>
                ))}
              </div>
              {device.observaciones && (
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3">
                  <div className="text-[9px] text-amber-400 uppercase tracking-wider mb-1">Observaciones</div>
                  <p className="text-xs text-amber-200">{device.observaciones}</p>
                </div>
              )}
              {device.foto && (
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">Foto del equipo</div>
                  <img src={device.foto} alt={device.equipment} className="w-full rounded-xl object-cover max-h-48"/>
                </div>
              )}
            </div>
          )}

          {/* TAB: Topología */}
          {activeTab==='topologia' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400 text-center">Diagrama de conexiones del dispositivo</div>
              <TopologyDiagram device={device}/>
              <div className="space-y-2">
                {device.connections.map((conn,i)=>(
                  <div key={i} className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:conn.color}}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white">{conn.label}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{conn.target}</div>
                    </div>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{CONN_TYPE_LABELS[conn.type]||conn.type}</span>
                  </div>
                ))}
                {device.connections.length===0&&<div className="text-center text-slate-500 text-xs py-6">Sin conexiones registradas</div>}
              </div>
            </div>
          )}

          {/* TAB: Bitácora */}
          {activeTab==='bitacora' && (
            <div className="space-y-3">
              <button onClick={()=>setNewLogOpen(true)} className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl hover:opacity-90 shadow-lg shadow-cyan-900/30">
                <Plus size={14}/>Nueva entrada
              </button>
              {device.logs.length===0&&<div className="text-center text-slate-500 text-xs py-8">Sin entradas en la bitácora</div>}
              {device.logs.map(log=>(
                <div key={log.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${log.status==='ok'?'bg-emerald-400':log.status==='warn'?'bg-amber-400':'bg-red-400'}`}/>
                      <span className="text-xs font-bold text-white">{log.type}</span>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${log.status==='ok'?'bg-emerald-900/50 text-emerald-400':log.status==='warn'?'bg-amber-900/50 text-amber-400':'bg-red-900/50 text-red-400'}`}>
                      {log.status==='ok'?'OK':log.status==='warn'?'Advertencia':'Error'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{log.description}</p>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><Calendar size={9}/>{log.date}</span>
                    <span className="flex items-center gap-1"><User size={9}/>{log.tech}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pb-8 text-center text-[10px] text-slate-600">SKIA DCIM — Sistema de Gestión de Infraestructura Física</div>
        </div>
      </div>
      {newLogOpen && <NewLogModal onClose={()=>setNewLogOpen(false)} onSave={handleAddLog}/>}
    </>
  );
}
