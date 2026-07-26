import { useState, useMemo } from 'react';
import {
  X, Edit2, Save, ChevronDown, ChevronUp, Monitor, Wifi,
  Server, Printer, Camera, Cpu, HardDrive, Phone,
  Network, Layers, ArrowRight, Info, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import BackboneSelector from './BackboneSelector';
import TopoTreeView from './TopoTreeView';

// ── Types ────────────────────────────────────────────────────────────────────
export interface SWItem {
  id: string; code: string; brand: string; model: string; serie: string;
  tipo: string; ubicacion: string; ubicacion_plano: string; foto: string;
  observaciones: string; puertos: number; puertos_libres: number;
  puertos_poe: number; capacidad_puerto: string; ip: string;
  fecha_compra: string; expiracion_garantia: string; tiempo_uso: string;
  status: string; no_factura: string; costo_dls: number; proveedor: string;
  firmware: string; contrato_sla: string; rfid: string;
  anio_instalacion: number; centro_costos: string;
}

type PortStatus = 'connected' | 'free' | 'poe' | 'uplink' | 'error' | 'disabled';
type MediaType = 'UTP' | 'Fibra Óptica' | 'DAC' | 'SFP+';
type NodeType = 'switch' | 'patch_panel' | 'pc' | 'ap' | 'camera' | 'server' | 'phone' | 'printer' | 'idf' | 'mdf' | 'internet';

type PatchcordCategory = 'Cat5e' | 'Cat6' | 'Cat6A' | 'Cat7' | 'Cat8' | 'Fibra OM3' | 'Fibra OM4' | 'Fibra OS2';
type PatchcordType = 'Normal' | 'Diámetro reducido';
type PatchcordColor = 'Azul' | 'Rojo' | 'Verde' | 'Amarillo' | 'Naranja' | 'Gris' | 'Blanco' | 'Negro' | 'Morado' | 'Café';

interface PortInfo {
  port_num: number;
  status: PortStatus;
  device: string;
  vlan: string;
  ip: string;
  port_pp: string;
  backbone: string;
  pc_longitud: string;
  pc_color: PatchcordColor | '';
  pc_categoria: PatchcordCategory | '';
  pc_tipo: PatchcordType | '';
  notes: string;
}

interface TopoNode {
  id: string; label: string; type: NodeType; ip?: string; media?: MediaType;
  children?: TopoNode[];
}

// ── Port status config ────────────────────────────────────────────────────────
const PORT_COLORS: Record<PortStatus, string> = {
  connected: 'bg-emerald-500',
  free:      'bg-slate-200',
  poe:       'bg-amber-400',
  uplink:    'bg-blue-500',
  error:     'bg-red-500',
  disabled:  'bg-[#F0F2FA] border border-[#E8EBF4]',
};

const PORT_LABELS: Record<PortStatus, string> = {
  connected: 'Conectado', free: 'Libre', poe: 'PoE activo',
  uplink: 'Uplink', error: 'Error', disabled: 'Deshabilitado',
};

// ── Device icons ──────────────────────────────────────────────────────────────
const DEVICE_ICONS: Record<NodeType, React.ReactNode> = {
  switch:      <Network size={18}/>,
  patch_panel: <Layers size={18}/>,
  pc:          <Monitor size={18}/>,
  ap:          <Wifi size={18}/>,
  camera:      <Camera size={18}/>,
  server:      <Server size={18}/>,
  phone:       <Phone size={18}/>,
  printer:     <Printer size={18}/>,
  idf:         <Cpu size={18}/>,
  mdf:         <HardDrive size={18}/>,
  internet:    <Network size={18}/>,
};

const DEVICE_TYPES: NodeType[] = ['pc','ap','camera','server','phone','printer','switch','patch_panel','idf','mdf'];

// ── Generate mock port data ───────────────────────────────────────────────────
function genPorts(sw: SWItem): PortInfo[] {
  const total = Math.min(sw.puertos, 48);
  const free = sw.puertos_libres;
  const poe = sw.puertos_poe;
  const used = total - free;
  const devices = ['PC-PROD-001','PC-PROD-002','AP-PISO2-001','CAM-INT-003','SRV-APP-001','IP-PHONE-012','PC-OF-007','AP-LOBBY-001','PC-CONT-003','SRV-DB-001','CAM-EXT-001','PC-GER-001','PC-PROD-003','AP-PISO3-001','CAM-INT-004','PC-OF-008'];
  const vlans = ['10','20','30','40','50','100','200'];
  const ips = ['192.168.10.','192.168.20.','10.0.1.','10.0.2.'];
  const pps = ['PP-MDF-A001','PP-IDF2-A001','PP-IDF3-A001'];

  return Array.from({ length: total }, (_, i) => {
    const num = i + 1;
    const isUplink = num > total - 4; // últimos 4 puertos = uplinks/SFP
    const isUsed = num <= used && !isUplink;
    const isPoe = isUsed && num <= poe;
    let status: PortStatus = isUplink ? 'uplink' : isUsed ? (isPoe ? 'poe' : 'connected') : 'free';
    if (isUsed && num % 17 === 0) status = 'error';
    const dev = isUsed ? devices[i % devices.length] : '';
    const vlan = isUsed ? vlans[i % vlans.length] : '';
    const ip = isUsed ? `${ips[i % ips.length]}${10 + (i % 240)}` : '';
    const pp = isUsed ? `${pps[i % pps.length]} P${(i % 24) + 1}` : '';
    const bb = isUplink ? `BB-${sw.ubicacion.replace(/\s/g,'-').slice(0,8)}-UPL${num}` : '';
    const colors: PatchcordColor[] = ['Azul','Rojo','Verde','Amarillo','Naranja','Gris','Blanco','Negro'];
    const cats: PatchcordCategory[] = ['Cat6','Cat6A','Cat6','Cat6A','Cat6A','Cat6','Cat6A','Cat6'];
    const tipos: PatchcordType[] = ['Normal','Normal','Diámetro reducido','Normal','Normal','Diámetro reducido','Normal','Normal'];
    const lengths = ['1m','1.5m','2m','3m','0.5m','1m','2m','3m'];
    return {
      port_num: num, status, device: dev, vlan, ip, port_pp: pp, backbone: bb, notes: '',
      pc_longitud: isUsed || isUplink ? lengths[i % lengths.length] : '',
      pc_color: isUsed || isUplink ? colors[i % colors.length] : '',
      pc_categoria: isUsed || isUplink ? cats[i % cats.length] : '',
      pc_tipo: isUsed || isUplink ? tipos[i % tipos.length] : '',
    };
  });
}

// ── Generate mock topology ────────────────────────────────────────────────────
function genTopology(sw: SWItem): TopoNode {
  const isMdf = sw.ubicacion.toLowerCase().includes('mdf');
  return {
    id: 'core',
    label: isMdf ? 'MDF Torre A' : 'MDF Torre A',
    type: 'mdf',
    ip: '10.0.0.1',
    children: [
      {
        id: 'backbone',
        label: isMdf ? sw.code : `IDF — ${sw.ubicacion}`,
        type: isMdf ? 'switch' : 'idf',
        ip: sw.ip,
        media: 'Fibra Óptica',
        children: [
          {
            id: 'pp1',
            label: `PP-${sw.ubicacion.replace(/\s/g,'-').slice(0,6)}-001`,
            type: 'patch_panel',
            media: 'UTP',
            children: [
              { id: 'd1', label: 'PC-PROD-001', type: 'pc', ip: '192.168.10.11' },
              { id: 'd2', label: 'PC-PROD-002', type: 'pc', ip: '192.168.10.12' },
              { id: 'd3', label: 'AP-PISO2-001', type: 'ap', ip: '192.168.20.5' },
              { id: 'd4', label: 'CAM-INT-003', type: 'camera', ip: '192.168.30.3' },
            ],
          },
          {
            id: 'pp2',
            label: `PP-${sw.ubicacion.replace(/\s/g,'-').slice(0,6)}-002`,
            type: 'patch_panel',
            media: 'UTP',
            children: [
              { id: 'd5', label: 'SRV-APP-001', type: 'server', ip: '10.0.1.100' },
              { id: 'd6', label: 'IP-PHONE-012', type: 'phone', ip: '192.168.40.12' },
              { id: 'd7', label: 'PC-OF-007', type: 'pc', ip: '192.168.10.17' },
            ],
          },
        ],
      },
    ],
  };
}

// ── Port Front Panel ──────────────────────────────────────────────────────────
function PortFrontPanel({ ports, onSelect, selectedPort }: {
  ports: PortInfo[]; onSelect: (p: PortInfo) => void; selectedPort: PortInfo | null;
}) {
  const rows = Math.ceil(ports.length / 12);
  const portGroups: PortInfo[][] = [];
  for (let r = 0; r < rows; r++) {
    portGroups.push(ports.slice(r * 12, (r + 1) * 12));
  }

  return (
    <div className="bg-slate-50 rounded-2xl p-4 shadow-2xl border border-[#E8EBF4]">
      {/* Switch chassis */}
      <div className="bg-slate-50 rounded-xl p-3 border border-[#E8EBF4]">
        {/* Status LEDs */}
        <div className="flex items-center gap-2 mb-3 px-1">
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50 animate-pulse"/>
          <div className="w-2 h-2 rounded-full bg-amber-400 shadow-lg shadow-amber-500/50"/>
          <div className="w-2 h-2 rounded-full bg-blue-400 shadow-lg shadow-blue-500/50"/>
          <span className="text-[13px] text-slate-500 ml-1 font-mono">SYS · ACT · PoE</span>
        </div>

        {/* Port rows */}
        <div className="space-y-2">
          {portGroups.map((group, gi) => (
            <div key={gi} className="flex items-center gap-1 flex-wrap">
              {group.map(p => (
                <button
                  key={p.port_num}
                  onClick={() => onSelect(p)}
                  title={`Puerto ${p.port_num}${p.device ? ` — ${p.device}` : ' — Libre'}`}
                  className={`relative w-7 h-7 rounded-sm transition-all hover:scale-110 hover:z-10 ${PORT_COLORS[p.status]} ${selectedPort?.port_num === p.port_num ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-110' : ''}`}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-white/80">{p.port_num}</span>
                  {/* Port hole */}
                  <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-1.5 bg-black/40 rounded-sm"/>
                  {/* LED indicator */}
                  <div className={`absolute top-0.5 right-0.5 w-1 h-1 rounded-full ${p.status === 'connected' || p.status === 'poe' || p.status === 'uplink' ? 'bg-emerald-300 animate-pulse' : p.status === 'error' ? 'bg-red-300 animate-pulse' : 'bg-slate-600'}`}/>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 pt-2 border-t border-[#E8EBF4]">
          {(Object.entries(PORT_LABELS) as [PortStatus, string][]).map(([s, label]) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded-sm ${PORT_COLORS[s]}`}/>
              <span className="text-[13px] text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Port Card Editor ──────────────────────────────────────────────────────────
function PortCard({ port, onSave, onClose }: {
  port: PortInfo; onSave: (p: PortInfo) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<PortInfo>({ ...port });
  const setF = (k: keyof PortInfo, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded-sm ${PORT_COLORS[form.status as PortStatus]}`}/>
          <span className="text-sm font-bold">Puerto {port.port_num}</span>
          <span className={`text-[13px] font-bold px-2 py-0.5 rounded-full ${
            form.status === 'connected' ? 'bg-emerald-500/30 text-emerald-300' :
            form.status === 'poe' ? 'bg-amber-500/30 text-amber-300' :
            form.status === 'uplink' ? 'bg-blue-500/30 text-blue-300' :
            form.status === 'error' ? 'bg-red-500/30 text-red-300' :
            'bg-slate-500/30 text-[#5C6194]'
          }`}>{PORT_LABELS[form.status as PortStatus]}</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-100/10 rounded-lg"><X size={14}/></button>
      </div>

      <div className="p-4 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1"># Puerto</label>
          <input value={form.port_num} readOnly className="w-full px-3 py-1.5 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg text-slate-500 font-mono"/>
        </div>
        <div className="col-span-2">
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Dispositivo conectado</label>
          <input value={form.device} onChange={e => setF('device', e.target.value)} placeholder="Ej. PC-PROD-001" className="w-full px-3 py-1.5 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1"># VLAN</label>
          <input value={form.vlan} onChange={e => setF('vlan', e.target.value)} placeholder="Ej. 10" className="w-full px-3 py-1.5 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1">IP</label>
          <input value={form.ip} onChange={e => setF('ip', e.target.value)} placeholder="Ej. 192.168.10.5" className="w-full px-3 py-1.5 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300 font-mono"/>
        </div>
        <div className="col-span-2">
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</label>
          <select value={form.status} onChange={e => setF('status', e.target.value)} className="w-full px-3 py-1.5 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">
            {(Object.entries(PORT_LABELS) as [PortStatus, string][]).map(([s, l]) => (
              <option key={s} value={s}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Puerto Patch Panel</label>
          <input value={form.port_pp} onChange={e => setF('port_pp', e.target.value)} placeholder="Ej. PP-IDF2-A001 P12" className="w-full px-3 py-1.5 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300 font-mono text-xs"/>
        </div>
        <div className="col-span-2">
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Backbone</label>
          <BackboneSelector
            value={form.backbone}
            onChange={v => setF('backbone', v)}
          />
        </div>
        {/* ── Patch Cord section ─────────────────────────────────────── */}
        <div className="col-span-2">
          <div className="flex items-center gap-2 py-1 border-t border-[#E8EBF4] mt-1">
            <div className="flex-1 h-px bg-slate-100"/>
            <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider px-2">Patch Cord</span>
            <div className="flex-1 h-px bg-slate-100"/>
          </div>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Longitud</label>
          <select value={form.pc_longitud} onChange={e => setF('pc_longitud', e.target.value)} className="w-full px-3 py-1.5 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">
            <option value="">— Sin asignar —</option>
            {['0.5m','1m','1.5m','2m','3m','5m','7m','10m'].map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Color</label>
          <div className="flex items-center gap-2">
            <select value={form.pc_color} onChange={e => setF('pc_color', e.target.value as PatchcordColor)} className="flex-1 px-3 py-1.5 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">
              <option value="">— Sin asignar —</option>
              {(['Azul','Rojo','Verde','Amarillo','Naranja','Gris','Blanco','Negro','Morado','Café'] as PatchcordColor[]).map(c => <option key={c}>{c}</option>)}
            </select>
            {form.pc_color && (
              <div className="w-6 h-6 rounded-lg border border-[#E8EBF4] flex-shrink-0" style={{ backgroundColor: {
                Azul:'#3b82f6', Rojo:'#ef4444', Verde:'#22c55e', Amarillo:'#eab308',
                Naranja:'#f97316', Gris:'#6b7280', Blanco:'#f1f5f9', Negro:'#1e293b',
                Morado:'#a855f7', Café:'#92400e',
              }[form.pc_color] ?? '#94a3b8' }}/>
            )}
          </div>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Categoría</label>
          <select value={form.pc_categoria} onChange={e => setF('pc_categoria', e.target.value as PatchcordCategory)} className="w-full px-3 py-1.5 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">
            <option value="">— Sin asignar —</option>
            {(['Cat5e','Cat6','Cat6A','Cat7','Cat8','Fibra OM3','Fibra OM4','Fibra OS2'] as PatchcordCategory[]).map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Tipo</label>
          <select value={form.pc_tipo} onChange={e => setF('pc_tipo', e.target.value as PatchcordType)} className="w-full px-3 py-1.5 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">
            <option value="">— Sin asignar —</option>
            <option value="Normal">Normal</option>
            <option value="Diámetro reducido">Diámetro reducido</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Notas</label>
          <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2} placeholder="Observaciones del puerto..." className="w-full px-3 py-1.5 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300 resize-none"/>
        </div>
      </div>

      <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#E8EBF4]">
        <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
        <button onClick={() => onSave(form)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg hover:opacity-90 shadow-md shadow-cyan-200">
          <Save size={11}/>Guardar puerto
        </button>
      </div>
    </div>
  );
}

// ── Topology Node ─────────────────────────────────────────────────────────────
function TopoNodeCard({ node, depth = 0 }: { node: TopoNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = (node.children?.length ?? 0) > 0;

  const bgColors: Record<NodeType, string> = {
    mdf:         'bg-gradient-to-br from-violet-600 to-purple-700 text-white',
    idf:         'bg-gradient-to-br from-blue-600 to-cyan-700 text-white',
    switch:      'bg-gradient-to-br from-teal-600 to-emerald-700 text-white',
    patch_panel: 'bg-gradient-to-br from-slate-600 to-slate-700 text-white',
    pc:          'bg-[#F0F2FA] border border-[#E8EBF4] text-slate-700',
    ap:          'bg-[#F0F2FA] border border-amber-200 text-amber-700',
    camera:      'bg-[#F0F2FA] border border-rose-200 text-rose-700',
    server:      'bg-[#F0F2FA] border border-indigo-200 text-indigo-700',
    phone:       'bg-[#F0F2FA] border border-green-200 text-green-700',
    printer:     'bg-[#F0F2FA] border border-[#E8EBF4] text-slate-600',
    internet:    'bg-[#F0F2FA] border border-blue-200 text-blue-700',
  };

  const mediaColors: Record<MediaType, string> = {
    'Fibra Óptica': 'text-violet-600 bg-violet-50 border-violet-200',
    'UTP':          'text-cyan-600 bg-cyan-50 border-cyan-200',
    'DAC':          'text-amber-600 bg-amber-50 border-amber-200',
    'SFP+':         'text-blue-600 bg-blue-50 border-blue-200',
  };

  return (
    <div className={`${depth > 0 ? 'ml-6 border-l-2 border-dashed border-[#E8EBF4] pl-4' : ''}`}>
      {/* Connection line with media type */}
      {depth > 0 && node.media && (
        <div className="flex items-center gap-1.5 mb-1 -ml-4">
          <div className="w-4 h-0.5 bg-slate-200"/>
          <span className={`text-[13px] font-bold px-1.5 py-0.5 rounded border ${mediaColors[node.media]}`}>{node.media}</span>
          <ArrowRight size={10} className="text-[#5C6194]"/>
        </div>
      )}

      <div className={`rounded-xl p-3 shadow-sm mb-2 ${bgColors[node.type]}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0">{DEVICE_ICONS[node.type]}</div>
            <div>
              <div className="text-xs font-bold leading-tight">{node.label}</div>
              {node.ip && <div className="text-[13px] opacity-70 font-mono">{node.ip}</div>}
            </div>
          </div>
          {hasChildren && (
            <button onClick={() => setOpen(o => !o)} className="p-1 rounded-lg hover:bg-slate-100/10 flex-shrink-0">
              {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
            </button>
          )}
        </div>
      </div>

      {hasChildren && open && (
        <div className="space-y-1">
          {node.children!.map(child => (
            <TopoNodeCard key={child.id} node={child} depth={depth + 1}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Port List ─────────────────────────────────────────────────────────────────
function PortList({ ports, onEdit }: { ports: PortInfo[]; onEdit: (p: PortInfo) => void }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<PortStatus | ''>('');

  const filtered = useMemo(() => ports.filter(p => {
    const q = search.toLowerCase();
    return (!q || String(p.port_num).includes(q) || p.device.toLowerCase().includes(q) || p.ip.includes(q) || p.vlan.includes(q))
      && (!filterStatus || p.status === filterStatus);
  }), [ports, search, filterStatus]);

  const statusCounts = useMemo(() => {
    const m: Partial<Record<PortStatus, number>> = {};
    ports.forEach(p => { m[p.status] = (m[p.status] ?? 0) + 1; });
    return m;
  }, [ports]);

  return (
    <div className="space-y-3">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(PORT_LABELS) as [PortStatus, string][]).map(([s, l]) => (
          statusCounts[s] ? (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-bold rounded-xl border transition-all ${filterStatus === s ? PORT_COLORS[s] + ' text-white border-current' : 'bg-[#F0F2FA] border-[#E8EBF4] text-slate-600 hover:border-[#E8EBF4]'}`}>
              <div className={`w-2 h-2 rounded-sm ${PORT_COLORS[s]}`}/>
              {l} ({statusCounts[s]})
            </button>
          ) : null
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Network size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por puerto, dispositivo, IP, VLAN..."
          className="w-full pl-8 pr-3 py-2 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
      </div>

      {/* Table */}
      <div className="bg-slate-100 rounded-xl border border-[#E8EBF4] overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E8EBF4] bg-slate-50">
              <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider w-12">Puerto</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">Dispositivo</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">VLAN</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">IP</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">Patch Panel</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider">Backbone</th>
              <th className="px-3 py-2 w-10"/>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.port_num} className="border-b border-slate-50 hover:bg-cyan-50/20 transition-colors">
                <td className="px-3 py-2 font-mono font-bold text-slate-700">{p.port_num}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-sm flex-shrink-0 ${PORT_COLORS[p.status]}`}/>
                    <span className="text-[12px] font-medium text-slate-600">{PORT_LABELS[p.status]}</span>
                  </div>
                </td>
                <td className="px-3 py-2 font-medium text-slate-700">{p.device || <span className="text-[#5C6194]">—</span>}</td>
                <td className="px-3 py-2 font-mono text-cyan-700">{p.vlan || <span className="text-[#5C6194]">—</span>}</td>
                <td className="px-3 py-2 font-mono text-slate-600">{p.ip || <span className="text-[#5C6194]">—</span>}</td>
                <td className="px-3 py-2 font-mono text-[12px] text-[#5C6194]">{p.port_pp || <span className="text-[#5C6194]">—</span>}</td>
                <td className="px-3 py-2 font-mono text-[12px] text-[#5C6194]">{p.backbone || <span className="text-[#5C6194]">—</span>}</td>
                <td className="px-3 py-2">
                  <button onClick={() => onEdit(p)} className="p-1 text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors">
                    <Edit2 size={11}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-slate-500 text-xs">Sin puertos que coincidan con el filtro.</div>
        )}
      </div>
    </div>
  );
}

// ── Main SwitchAdmin component ────────────────────────────────────────────────
export default function SwitchAdmin({ sw, onClose }: { sw: SWItem; onClose: () => void }) {
  const [ports, setPorts] = useState<PortInfo[]>(() => genPorts(sw));
  const [selectedPort, setSelectedPort] = useState<PortInfo | null>(null);
  const [editingPort, setEditingPort] = useState<PortInfo | null>(null);
  const [activeSection, setActiveSection] = useState<'panel' | 'list' | 'topo'>('panel');
  const [topoView, setTopoView] = useState<'tree' | 'list'>('tree');
  const topology = useMemo(() => genTopology(sw), [sw]);

  const handleSavePort = (updated: PortInfo) => {
    setPorts(ps => ps.map(p => p.port_num === updated.port_num ? updated : p));
    setEditingPort(null);
    setSelectedPort(updated);
  };

  const connected = ports.filter(p => p.status === 'connected' || p.status === 'poe' || p.status === 'uplink').length;
  const free = ports.filter(p => p.status === 'free').length;
  const errors = ports.filter(p => p.status === 'error').length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto p-4">
      <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700 rounded-t-2xl text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100/10 flex items-center justify-center"><Network size={20}/></div>
            <div>
              <h2 className="text-base font-bold">{sw.code} — {sw.brand} {sw.model}</h2>
              <p className="text-xs text-[#5C6194]">{sw.ubicacion} · IP: {sw.ip || 'N/A'} · {sw.puertos} puertos · Firmware {sw.firmware}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100/10 rounded-xl transition-colors"><X size={18}/></button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-[#E8EBF4] bg-slate-100">
          {[
            { label: 'Total puertos', val: ports.length, color: 'text-slate-700', icon: <Network size={14}/> },
            { label: 'En uso', val: connected, color: 'text-emerald-600', icon: <CheckCircle2 size={14}/> },
            { label: 'Libres', val: free, color: 'text-slate-500', icon: <Info size={14}/> },
            { label: 'Con error', val: errors, color: 'text-red-600', icon: <AlertTriangle size={14}/> },
          ].map(k => (
            <div key={k.label} className="text-center">
              <div className={`flex items-center justify-center gap-1 text-xl font-bold ${k.color}`}>{k.icon}{k.val}</div>
              <div className="text-[12px] text-[#5C6194] mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Section tabs */}
        <div className="flex items-center gap-1 px-6 py-3 bg-[#F0F2FA] border-b border-[#E8EBF4]">
          {([['panel','Panel Frontal'],['list','Inventario de Puertos'],['topo','Topología']] as const).map(([s, l]) => (
            <button key={s} onClick={() => setActiveSection(s)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeSection === s ? 'bg-slate-50 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* ── Panel Frontal ─────────────────────────────────────────── */}
          {activeSection === 'panel' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Info size={13} className="text-slate-500"/>
                <p className="text-xs text-[#5C6194]">Haz clic en cualquier puerto para ver su ficha. Los puertos resaltados están seleccionados.</p>
              </div>
              <PortFrontPanel ports={ports} onSelect={p => { setSelectedPort(p); setEditingPort(null); }} selectedPort={selectedPort}/>

              {/* Port detail / editor */}
              {selectedPort && !editingPort && (
                <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-sm ${PORT_COLORS[selectedPort.status]}`}/>
                      <span className="text-sm font-bold">Puerto {selectedPort.port_num}</span>
                      <span className="text-[13px] font-bold px-2 py-0.5 rounded-full bg-slate-100/10">{PORT_LABELS[selectedPort.status]}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingPort(selectedPort)} className="flex items-center gap-1 px-2.5 py-1 text-[12px] font-bold bg-cyan-500 hover:bg-cyan-400 rounded-lg transition-colors">
                        <Edit2 size={10}/>Editar
                      </button>
                      <button onClick={() => setSelectedPort(null)} className="p-1 hover:bg-slate-100/10 rounded-lg"><X size={13}/></button>
                    </div>
                  </div>
                  <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      ['Dispositivo', selectedPort.device || '—'],
                      ['VLAN', selectedPort.vlan || '—'],
                      ['IP', selectedPort.ip || '—'],
                      ['Status', PORT_LABELS[selectedPort.status]],
                      ['Patch Panel', selectedPort.port_pp || '—'],
                      ['Backbone', selectedPort.backbone || '—'],
                      ['Notas', selectedPort.notes || '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-slate-50 rounded-xl p-3 border border-[#E8EBF4]">
                        <div className="text-[13px] text-slate-500 uppercase tracking-wider mb-0.5">{k}</div>
                        <div className="text-xs font-semibold text-[#1A1D2E] font-mono truncate">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {editingPort && (
                <PortCard port={editingPort} onSave={handleSavePort} onClose={() => setEditingPort(null)}/>
              )}
            </div>
          )}

          {/* ── Port List ─────────────────────────────────────────────── */}
          {activeSection === 'list' && (
            <PortList
              ports={ports}
              onEdit={p => { setEditingPort(p); setActiveSection('panel'); setSelectedPort(p); }}
            />
          )}

          {/* ── Topology ──────────────────────────────────────────────── */}
          {activeSection === 'topo' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info size={13} className="text-slate-500"/>
                  <p className="text-xs text-[#5C6194]">Topología de interconexión desde MDF hasta dispositivos finales.</p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                  <button onClick={() => setTopoView('tree')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${topoView === 'tree' ? 'bg-slate-100 text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    <Network size={11}/>Vista Árbol
                  </button>
                  <button onClick={() => setTopoView('list')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${topoView === 'list' ? 'bg-slate-100 text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    <Layers size={11}/>Vista Lista
                  </button>
                </div>
              </div>

              {/* ── Tree view (glassmorfismo) */}
              {topoView === 'tree' && (
                <TopoTreeView topology={topology} ports={ports}/>
              )}

              {/* ── List view (original) */}
              {topoView === 'list' && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {(['Fibra Óptica','UTP','DAC','SFP+'] as MediaType[]).map(m => (
                      <div key={m} className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-bold rounded-xl border ${
                        m === 'Fibra Óptica' ? 'text-violet-600 bg-violet-50 border-violet-200' :
                        m === 'UTP' ? 'text-cyan-600 bg-cyan-50 border-cyan-200' :
                        m === 'DAC' ? 'text-amber-600 bg-amber-50 border-amber-200' :
                        'text-blue-600 bg-blue-50 border-blue-200'
                      }`}>
                        <div className={`w-2 h-0.5 ${m === 'Fibra Óptica' ? 'bg-violet-400' : m === 'UTP' ? 'bg-cyan-400' : m === 'DAC' ? 'bg-amber-400' : 'bg-blue-400'}`}/>
                        {m}
                      </div>
                    ))}
                  </div>
                  <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] p-5 overflow-x-auto">
                    <TopoNodeCard node={topology} depth={0}/>
                  </div>
                </>
              )}

              {/* Uplink summary */}
              <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] p-4">
                <h4 className="text-xs font-bold text-[#1A1D2E] mb-3 flex items-center gap-2"><ArrowRight size={12} className="text-cyan-500"/>Puertos Uplink / Backbone</h4>
                <div className="space-y-2">
                  {ports.filter(p => p.status === 'uplink').map(p => (
                    <div key={p.port_num} className="flex items-center gap-3 px-3 py-2 bg-blue-50 rounded-xl border border-blue-100">
                      <div className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center text-white text-[13px] font-bold">{p.port_num}</div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-[#1A1D2E]">{p.device || 'Uplink'}</div>
                        <div className="text-[12px] text-[#5C6194] font-mono">{p.backbone || 'Sin backbone asignado'}</div>
                      </div>
                      <span className="text-[13px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">Fibra Óptica</span>
                    </div>
                  ))}
                  {ports.filter(p => p.status === 'uplink').length === 0 && (
                    <p className="text-xs text-[#5C6194] text-center py-4">No hay puertos uplink configurados.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
