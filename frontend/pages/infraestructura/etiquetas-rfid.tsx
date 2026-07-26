import Head from 'next/head';
import { useState, useMemo, useRef } from 'react';
import {
  Tag, Plus, Printer, RefreshCw, Search, Trash2, Edit2,
  Smartphone, QrCode, X, Download, Eye, CheckCircle2,
  AlertTriangle, XCircle, Camera, Wifi, Server, Package,
  Network, Layers, Zap, Shield,
} from 'lucide-react';
import AppLayout from '../../components/AppLayout';
import ModuleEmptyState from '../../components/ModuleEmptyState';

type RfidCategory = 'MDF/IDF' | 'Rack' | 'Patch Panel' | 'Switch' | 'UPS/PDU' | 'Activo' | 'Cámara' | 'Servidor';
type RfidStatus = 'active' | 'inactive' | 'lost';

interface RfidTag {
  id: string;
  code: string;
  category: RfidCategory;
  equipment: string;
  brand_model: string;
  ubicacion: string;
  status: RfidStatus;
  generated: string;
  qr_url: string;
}

const CAT_ICONS: Record<RfidCategory, React.ReactNode> = {
  'MDF/IDF': <Layers size={12}/>,
  'Rack': <Package size={12}/>,
  'Patch Panel': <Layers size={12}/>,
  'Switch': <Network size={12}/>,
  'UPS/PDU': <Zap size={12}/>,
  'Activo': <Shield size={12}/>,
  'Cámara': <Camera size={12}/>,
  'Servidor': <Server size={12}/>,
};

const CAT_COLORS: Record<RfidCategory, string> = {
  'MDF/IDF':     'bg-violet-100 text-violet-700 border-violet-200',
  'Rack':        'bg-blue-100 text-blue-700 border-blue-200',
  'Patch Panel': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Switch':      'bg-teal-100 text-teal-700 border-teal-200',
  'UPS/PDU':     'bg-amber-100 text-amber-700 border-amber-200',
  'Activo':      'bg-slate-100 text-slate-700 border-[#E8EBF4]',
  'Cámara':      'bg-rose-100 text-rose-700 border-rose-200',
  'Servidor':    'bg-indigo-100 text-indigo-700 border-indigo-200',
};

const STATUS_COLORS: Record<RfidStatus, string> = {
  active:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  inactive: 'bg-amber-100 text-amber-700 border-amber-200',
  lost:     'bg-red-100 text-red-700 border-red-200',
};

const MOCK_TAGS: RfidTag[] = [
  { id:'rfid-1', code:'SKIA-MDF-000001', category:'MDF/IDF', equipment:'MDF Torre A', brand_model:'Panduit / FlexFusion', ubicacion:'Torre A Piso 1', status:'active', generated:'2026-05-15', qr_url:'' },
  { id:'rfid-2', code:'SKIA-RCK-000001', category:'Rack', equipment:'Rack Cableado IDF2', brand_model:'Panduit / RP40', ubicacion:'IDF2 Producción', status:'active', generated:'2026-05-15', qr_url:'' },
  { id:'rfid-3', code:'SKIA-PP-000001', category:'Patch Panel', equipment:'PP-IDF2-A001', brand_model:'Panduit / CP24WSBLY', ubicacion:'IDF2 Producción', status:'active', generated:'2026-05-16', qr_url:'' },
  { id:'rfid-4', code:'SKIA-SW-000001', category:'Switch', equipment:'SW-CORE-A001', brand_model:'Cisco / Catalyst 9300', ubicacion:'MDF Torre A', status:'active', generated:'2026-05-16', qr_url:'' },
  { id:'rfid-5', code:'SKIA-UPS-000001', category:'UPS/PDU', equipment:'UPS-MDF-A001', brand_model:'APC / Smart-UPS 3000', ubicacion:'MDF Torre A', status:'inactive', generated:'2026-05-17', qr_url:'' },
];

const ALL_CATS: RfidCategory[] = ['MDF/IDF','Rack','Patch Panel','Switch','UPS/PDU','Activo','Cámara','Servidor'];

function buildQrUrl(code: string): string {
  // URL pública del módulo móvil — se escanea con cualquier lector QR
  return `/rfid/${encodeURIComponent(code)}`;
}

function QrSvg({ value, size = 120 }: { value: string; size?: number }) {
  // QR simple generado con módulos SVG — suficiente para demo/impresión
  // En producción usar librería qrcode.react
  const encoded = encodeURIComponent(value);
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&format=svg&margin=4`}
      alt={value}
      width={size}
      height={size}
      className="rounded"
    />
  );
}

function LabelDesigner({ tag, onClose }: { tag: RfidTag; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [labelSize, setLabelSize] = useState<'small'|'medium'|'large'>('medium');
  const [showLogo, setShowLogo] = useState(true);
  const [showQr, setShowQr] = useState(true);
  const [showCode, setShowCode] = useState(true);
  const [showEquip, setShowEquip] = useState(true);
  const [showUbic, setShowUbic] = useState(true);
  const [showCat, setShowCat] = useState(true);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [accentColor, setAccentColor] = useState('#0e7490');

  const sizeMap = { small: { w:200, h:80, qr:48 }, medium: { w:280, h:110, qr:72 }, large: { w:380, h:140, qr:96 } };
  const dims = sizeMap[labelSize];

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank', 'width=600,height=400');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Etiqueta RFID — ${tag.code}</title>
      <style>body{margin:0;padding:20px;font-family:Arial,sans-serif;background:#fff;}
      @media print{body{padding:0;}@page{margin:5mm;}}</style></head>
      <body>${content.innerHTML}<script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
    win.document.close();
  };

  const qrValue = typeof window !== 'undefined' ? `${window.location.origin}/rfid/${tag.code}` : `/rfid/${tag.code}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EBF4]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"><Tag size={14} className="text-white"/></div>
            <h2 className="text-base font-bold text-[#1A1D2E]">Diseñador de Etiqueta RFID</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16}/></button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Controles */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#1A1D2E]">Configuración</h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tamaño de etiqueta</label>
              <div className="flex gap-2">
                {(['small','medium','large'] as const).map(s => (
                  <button key={s} onClick={() => setLabelSize(s)} className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${labelSize===s?'bg-cyan-600 text-white border-cyan-600':'bg-slate-100 text-slate-600 border-[#E8EBF4] hover:border-cyan-300'}`}>
                    {s==='small'?'Pequeña':s==='medium'?'Mediana':'Grande'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[['showLogo','Logo SKIA',showLogo,setShowLogo],['showQr','Código QR',showQr,setShowQr],['showCode','Código RFID',showCode,setShowCode],['showEquip','Equipo',showEquip,setShowEquip],['showUbic','Ubicación',showUbic,setShowUbic],['showCat','Categoría',showCat,setShowCat]].map(([key,label,val,setter]) => (
                <label key={key as string} className="flex items-center gap-2 cursor-pointer">
                  <div onClick={() => (setter as (v:boolean)=>void)(!(val as boolean))} className={`w-9 h-5 rounded-full transition-colors relative ${val?'bg-cyan-500':'bg-slate-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-slate-100 shadow transition-transform ${val?'translate-x-4':'translate-x-0.5'}`}/>
                  </div>
                  <span className="text-xs text-slate-600">{label as string}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Fondo</label><input type="color" value={bgColor} onChange={e=>setBgColor(e.target.value)} className="w-full h-9 rounded-lg border border-[#E8EBF4] cursor-pointer"/></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Acento</label><input type="color" value={accentColor} onChange={e=>setAccentColor(e.target.value)} className="w-full h-9 rounded-lg border border-[#E8EBF4] cursor-pointer"/></div>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#1A1D2E]">Vista previa</h3>
            <div className="flex items-center justify-center bg-slate-50 rounded-xl p-6 border border-[#E8EBF4] min-h-40">
              <div ref={printRef}>
                <div style={{ width: dims.w, height: dims.h, background: bgColor, border: `2px solid ${accentColor}`, borderRadius: 8, padding: 8, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
                  {showQr && <QrSvg value={qrValue} size={dims.qr}/>}
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    {showCat && <div style={{ fontSize: 9, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>{tag.category}</div>}
                    {showEquip && <div style={{ fontSize: labelSize==='small'?10:12, fontWeight: 700, color: '#1e293b', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag.equipment}</div>}
                    {showCode && <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#475569', marginBottom: 2 }}>{tag.code}</div>}
                    {showUbic && <div style={{ fontSize: 9, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag.ubicacion}</div>}
                    {showLogo && <div style={{ fontSize: 8, fontWeight: 700, color: accentColor, marginTop: 4 }}>SKIA DCIM</div>}
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[12px] text-[#5C6194] text-center">El QR lleva al Módulo Móvil con inventario, topología y bitácora</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#E8EBF4]">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl hover:opacity-90 shadow-lg shadow-cyan-200">
            <Printer size={14}/>Imprimir etiqueta
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Inventario mock por categoría para vinculación en modal ─────────────────
interface InvDevice { id:string; code:string; brand:string; model:string; ubicacion:string; serie?:string; ip?:string; }
const INVENTORY_BY_CAT: Record<string, InvDevice[]> = {
  'MDF/IDF': [
    { id:'mdf-1', code:'MDF-TORRE-A001', brand:'Panduit', model:'FlexFusion', ubicacion:'Torre A Piso 1' },
    { id:'mdf-2', code:'IDF2-PROD-001',  brand:'Panduit', model:'FlexFusion', ubicacion:'IDF2 Producción' },
    { id:'mdf-3', code:'IDF3-OF-001',    brand:'Panduit', model:'FlexFusion', ubicacion:'IDF3 Oficinas' },
  ],
  'Rack': [
    { id:'rck-1', code:'RCK-MDF-A0001', brand:'Panduit', model:'RP40 48U', ubicacion:'MDF Torre A' },
    { id:'rck-2', code:'RCK-IDF2-A0001',brand:'Panduit', model:'RP40 48U', ubicacion:'IDF2 Producción' },
    { id:'rck-3', code:'RCK-IDF3-A0001',brand:'APC',     model:'NetShelter SX 42U', ubicacion:'IDF3 Oficinas' },
  ],
  'Patch Panel': [
    { id:'pp-1', code:'PP-MDF-A001',  brand:'Panduit', model:'CP24WSBLY 24P Cat6A', ubicacion:'MDF Torre A' },
    { id:'pp-2', code:'PP-IDF2-A001', brand:'Panduit', model:'CP24WSBLY 24P Cat6A', ubicacion:'IDF2 Producción' },
    { id:'pp-3', code:'PP-IDF3-A001', brand:'Leviton', model:'5G110-U24 24P Cat6',  ubicacion:'IDF3 Oficinas' },
  ],
  'Switch': [
    { id:'sw-1', code:'SW-CORE-A001',  brand:'Cisco',   model:'Catalyst 9300-48P', ubicacion:'MDF Torre A',    ip:'10.0.0.1' },
    { id:'sw-2', code:'SW-DIST-B001',  brand:'Cisco',   model:'Catalyst 9200-24T', ubicacion:'IDF2 Producción',ip:'10.0.1.1' },
    { id:'sw-3', code:'SW-ACC-C001',   brand:'HP',      model:'Aruba 2530-48G',    ubicacion:'IDF3 Oficinas',  ip:'10.0.2.1' },
    { id:'sw-4', code:'SW-POE-D001',   brand:'Ubiquiti',model:'UniFi USW-Pro-48',  ubicacion:'IDF1 Almacén',   ip:'192.168.1.10' },
  ],
  'UPS/PDU': [
    { id:'ups-1', code:'UPS-MDF-A001',  brand:'APC',    model:'Smart-UPS 3000VA', ubicacion:'MDF Torre A' },
    { id:'ups-2', code:'PDU-IDF2-001',  brand:'Raritan',model:'PX3-5190CR',       ubicacion:'IDF2 Producción' },
    { id:'ups-3', code:'UPS-IDF3-001',  brand:'Eaton',  model:'5PX 1500VA',       ubicacion:'IDF3 Oficinas' },
  ],
  'Activo': [
    { id:'act-1', code:'ACT-SRV-001', brand:'Dell',  model:'PowerEdge R750', ubicacion:'MDF Torre A' },
    { id:'act-2', code:'ACT-SRV-002', brand:'HP',    model:'ProLiant DL380', ubicacion:'MDF Torre A' },
    { id:'act-3', code:'ACT-FW-001',  brand:'Cisco', model:'Firepower 2140', ubicacion:'MDF Torre A' },
  ],
  'Cámara': [
    { id:'cam-1', code:'CAM-EXT-001', brand:'Axis',   model:'P3245-V', ubicacion:'Entrada Principal' },
    { id:'cam-2', code:'CAM-INT-001', brand:'Hikvision',model:'DS-2CD2143G2', ubicacion:'Lobby' },
    { id:'cam-3', code:'CAM-PTZ-001', brand:'Axis',   model:'Q6135-LE', ubicacion:'Estacionamiento' },
  ],
  'Servidor': [
    { id:'srv-1', code:'SRV-APP-001', brand:'Dell',  model:'PowerEdge R750xs', ubicacion:'MDF Torre A' },
    { id:'srv-2', code:'SRV-DB-001',  brand:'HP',    model:'ProLiant DL360',   ubicacion:'MDF Torre A' },
    { id:'srv-3', code:'SRV-NMS-001', brand:'Supermicro',model:'SuperServer 6029P', ubicacion:'MDF Torre A' },
  ],
};
function NewTagModal({ onClose, onSave }: { onClose:()=>void; onSave:(t:RfidTag)=>void }) {
  const [category, setCategory] = useState<RfidCategory>('Switch');
  const [devSearch, setDevSearch] = useState('');
  const [selectedDev, setSelectedDev] = useState<InvDevice|null>(null);
  const [form, setForm] = useState({ equipment:'', brand_model:'', ubicacion:'', status:'active' as RfidStatus });
  const setF = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const devices = INVENTORY_BY_CAT[category] ?? [];
  const filteredDevs = devices.filter(d => {
    const q = devSearch.toLowerCase();
    return !q || d.code.toLowerCase().includes(q) || d.brand.toLowerCase().includes(q) || d.model.toLowerCase().includes(q) || d.ubicacion.toLowerCase().includes(q);
  });

  const handleSelectDev = (dev: InvDevice) => {
    setSelectedDev(dev);
    setForm({ equipment: dev.code, brand_model: `${dev.brand} / ${dev.model}`, ubicacion: dev.ubicacion, status: 'active' });
  };

  const handleCatChange = (cat: RfidCategory) => {
    setCategory(cat);
    setSelectedDev(null);
    setDevSearch('');
    setForm({ equipment:'', brand_model:'', ubicacion:'', status:'active' });
  };

  const handleSave = () => {
    if (!form.equipment || !form.ubicacion) return;
    const prefix = category.replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase();
    const code = `SKIA-${prefix}-${String(Date.now()).slice(-6)}`;
    onSave({ id:`rfid-${Date.now()}`, code, category, equipment: form.equipment, brand_model: form.brand_model, ubicacion: form.ubicacion, status: form.status, generated: new Date().toISOString().slice(0,10), qr_url: buildQrUrl(code) });
  };

  const hasInventory = (INVENTORY_BY_CAT[category]?.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EBF4]">
          <h2 className="text-base font-bold text-[#1A1D2E]">Nueva Etiqueta RFID</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16}/></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Paso 1: Categoría */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">1. Categoría de dispositivo</label>
            <div className="flex flex-wrap gap-2">
              {ALL_CATS.map(cat => (
                <button key={cat} type="button" onClick={() => handleCatChange(cat as RfidCategory)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${category===cat ? CAT_COLORS[cat as RfidCategory]+' border-current shadow-sm' : 'bg-slate-50 text-slate-500 border-[#E8EBF4] hover:border-[#E8EBF4]'}`}>
                  {CAT_ICONS[cat as RfidCategory]}{cat}
                </button>
              ))}
            </div>
          </div>

          {/* Paso 2: Seleccionar dispositivo del inventario */}
          {hasInventory && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">
                2. Seleccionar desde inventario
                <span className="ml-2 text-[12px] font-normal text-slate-500 normal-case">(haz clic para autollenar)</span>
              </label>
              <div className="border border-[#E8EBF4] rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-[#E8EBF4] bg-slate-50">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"/>
                    <input value={devSearch} onChange={e=>setDevSearch(e.target.value)}
                      placeholder={`Buscar en ${category}...`}
                      className="w-full pl-7 pr-3 py-1.5 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-300"/>
                  </div>
                </div>
                <div className="max-h-44 overflow-y-auto divide-y divide-slate-50">
                  {filteredDevs.length === 0
                    ? <div className="px-4 py-3 text-xs text-[#5C6194] text-center">Sin dispositivos encontrados</div>
                    : filteredDevs.map(dev => (
                      <button key={dev.id} type="button" onClick={() => handleSelectDev(dev)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-cyan-50 transition-colors ${selectedDev?.id===dev.id?'bg-cyan-50 border-l-2 border-cyan-500':''}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-cyan-700">{dev.code}</span>
                            {selectedDev?.id===dev.id && <CheckCircle2 size={12} className="text-cyan-500 flex-shrink-0"/>}
                          </div>
                          <div className="text-[12px] text-[#5C6194] mt-0.5">{dev.brand} {dev.model} · {dev.ubicacion}</div>
                        </div>
                        {dev.ip && <span className="text-[13px] font-mono text-slate-500 flex-shrink-0">{dev.ip}</span>}
                      </button>
                    ))
                  }
                </div>
              </div>
            </div>
          )}

          {/* Paso 3: Campos autollenados / editables */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">
              {hasInventory ? '3. Confirmar datos' : '2. Datos del dispositivo'}
              {selectedDev && <span className="ml-2 text-[12px] font-normal text-emerald-600 normal-case">✓ Autollenado desde inventario</span>}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Equipo / Código</label>
                <input value={form.equipment} onChange={e=>setF('equipment',e.target.value)}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300 ${selectedDev?'bg-cyan-50 border-cyan-200':'bg-[#F8F9FE] border-[#E8EBF4]'}`}
                  placeholder="Ej. SW-CORE-A001"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Marca / Modelo</label>
                <input value={form.brand_model} onChange={e=>setF('brand_model',e.target.value)}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300 ${selectedDev?'bg-cyan-50 border-cyan-200':'bg-[#F8F9FE] border-[#E8EBF4]'}`}
                  placeholder="Ej. Cisco / Catalyst 9300"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Ubicación</label>
                <input value={form.ubicacion} onChange={e=>setF('ubicacion',e.target.value)}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300 ${selectedDev?'bg-cyan-50 border-cyan-200':'bg-[#F8F9FE] border-[#E8EBF4]'}`}
                  placeholder="Ej. MDF Torre A"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
                <select value={form.status} onChange={e=>setF('status',e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="lost">Perdido</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#E8EBF4]">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={handleSave} disabled={!form.equipment||!form.ubicacion}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl hover:opacity-90 shadow-md shadow-cyan-200 disabled:opacity-40 disabled:cursor-not-allowed">
            <Tag size={13}/>Generar etiqueta
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EtiquetasRfidPage() {
  const [tags, setTags] = useState<RfidTag[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [designerTag, setDesignerTag] = useState<RfidTag|null>(null);
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [mobileQr, setMobileQr] = useState<RfidTag|null>(null);

  const filtered = useMemo(() => tags.filter(t => {
    const q = search.toLowerCase();
    return (!q || t.code.toLowerCase().includes(q) || t.equipment.toLowerCase().includes(q) || t.brand_model.toLowerCase().includes(q))
      && (!filterCat || t.category === filterCat);
  }), [tags, search, filterCat]);

  const catCounts = useMemo(() => {
    const m: Record<string,number> = {};
    tags.forEach(t => { m[t.category] = (m[t.category]||0)+1; });
    return m;
  }, [tags]);

  const handleDelete = (id: string) => setTags(ts => ts.filter(t => t.id !== id));
  const handleSaveNew = (t: RfidTag) => { setTags(ts => [...ts, t]); setNewTagOpen(false); };

    const mobileUrl = mobileQr ? (typeof window !== 'undefined' ? `${window.location.origin}/rfid/${mobileQr.code}` : `/rfid/${mobileQr.code}`) : '';

  if (tags.length === 0) {
    return (
      <AppLayout>
        <Head><title>Etiquetas RFID — SKIA DCIM</title></Head>
        <ModuleEmptyState
          icon="Tag"
          title="Sin etiquetas RFID registradas"
          description="Genera y gestiona etiquetas RFID/QR para cada equipo de tu infraestructura. Vincula físicamente cada activo con su información digital para lectura instantánea en campo."
          features={[
            'Etiquetas QR imprimibles con diseñador integrado',
            'Vinculación con inventario: MDF/IDF, Racks, Switches, UPS',
            'Lectura móvil con cámara — sin hardware especial',
            'Seguimiento de estado: activo, inactivo, extraviado',
          ]}
          buttonLabel="Generar primera etiqueta"
          onAction={() => setNewTagOpen(true)}
        />
        {newTagOpen && <NewTagModal onClose={() => setNewTagOpen(false)} onSave={handleSaveNew} />}
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Head><title>Etiquetas RFID — SKIA DCIM</title></Head>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-200"><Tag size={16} className="text-white"/></div>
            <h1 className="text-xl font-bold text-[#1A1D2E]">Gestión de Etiquetas RFID</h1>
          </div>
          <p className="text-sm text-[#5C6194] ml-10">{tags.length} tags asignados en el inventario</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setNewTagOpen(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl hover:opacity-90 shadow-lg shadow-cyan-200"><Plus size={15}/>Nueva etiqueta</button>
        </div>
      </div>

      {/* KPIs por categoría */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-6">
        {ALL_CATS.map(cat => (
          <div key={cat} className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-xl p-3 text-center hover:shadow-md transition-shadow cursor-pointer" onClick={() => setFilterCat(filterCat===cat?'':cat)}>
            <div className={`inline-flex items-center gap-1 text-[12px] font-bold px-2 py-0.5 rounded-full border mb-1 ${CAT_COLORS[cat]}`}>{CAT_ICONS[cat]}{cat}</div>
            <div className="text-lg font-bold text-slate-800">{catCounts[cat]||0}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por tag, equipo, serie..." className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100/80 border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
        </div>
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} className="px-3 py-2 text-sm bg-slate-100/80 border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">
          <option value="">Todas</option>
          {ALL_CATS.map(c=><option key={c}>{c}</option>)}
        </select>
        <button onClick={()=>{setSearch('');setFilterCat('');}} className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#5C6194] bg-slate-100/80 border border-[#E8EBF4] rounded-lg hover:bg-slate-50"><RefreshCw size={14}/>Actualizar</button>
      </div>

      {/* Tabla */}
      <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E8EBF4] bg-slate-50/80">
              <th className="w-8 px-4 py-3"><input type="checkbox" className="rounded"/></th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tag RFID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoría</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Equipo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Marca / Modelo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ubicación</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Generado</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500 text-sm">No se encontraron etiquetas RFID.</td></tr>
            ) : filtered.map(tag => (
              <tr key={tag.id} className="border-b border-[#E8EBF4] hover:bg-cyan-50/20 transition-colors">
                <td className="px-4 py-3"><input type="checkbox" className="rounded"/></td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-lg border border-cyan-100">{tag.code}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 text-[12px] font-bold px-2 py-0.5 rounded-full border ${CAT_COLORS[tag.category]}`}>{CAT_ICONS[tag.category]}{tag.category}</span>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-slate-700">{tag.equipment}</td>
                <td className="px-4 py-3 text-xs text-[#5C6194]">{tag.brand_model||'—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{tag.ubicacion}</td>
                <td className="px-4 py-3">
                  <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[tag.status]}`}>
                    {tag.status==='active'?'Activo':tag.status==='inactive'?'Inactivo':'Perdido'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[#5C6194]">{tag.generated}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setDesignerTag(tag)} title="Diseñar e imprimir" className="p-1.5 text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"><Printer size={13}/></button>
                    <button onClick={() => setMobileQr(tag)} title="Módulo Móvil" className="p-1.5 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"><Smartphone size={13}/></button>
                    <button title="Ver QR" onClick={() => setDesignerTag(tag)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><QrCode size={13}/></button>
                    <button onClick={() => handleDelete(tag.id)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal diseñador */}
      {designerTag && <LabelDesigner tag={designerTag} onClose={() => setDesignerTag(null)}/>}

      {/* Modal nueva etiqueta */}
      {newTagOpen && <NewTagModal onClose={() => setNewTagOpen(false)} onSave={handleSaveNew}/>}

      {/* Modal Módulo Móvil — QR para escanear */}
      {mobileQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EBF4]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center"><Smartphone size={14} className="text-white"/></div>
                <h2 className="text-base font-bold text-[#1A1D2E]">Módulo Móvil</h2>
              </div>
              <button onClick={() => setMobileQr(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16}/></button>
            </div>
            <div className="p-6 text-center space-y-4">
              <p className="text-sm text-slate-600">Escanea este QR con tu móvil para ver la ficha completa del equipo:</p>
              <div className="flex justify-center">
                <QrSvg value={mobileUrl} size={180}/>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-[#E8EBF4]">
                <div className="text-xs font-bold text-[#1A1D2E] mb-1">{mobileQr.equipment}</div>
                <div className="font-mono text-[12px] text-cyan-700">{mobileQr.code}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-[#5C6194]">
                <div className="flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-500"/>Topología de conexión</div>
                <div className="flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-500"/>Ficha de inventario</div>
                <div className="flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-500"/>Foto del equipo</div>
                <div className="flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-500"/>Bitácora de servicio</div>
              </div>
              <a href={`/rfid/${mobileQr.code}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-2 text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl hover:opacity-90 shadow-md shadow-violet-200">
                <Eye size={14}/>Abrir en este dispositivo
              </a>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
