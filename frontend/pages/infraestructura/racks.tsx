import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import Head from 'next/head';
import RackWizard, { RackWizardData } from '../../components/RackWizard';
import { useRouter } from 'next/router';
import {
  Plus, Search, ChevronRight, Edit2, Trash2, X, List,
  BarChart2, Award, FileText, Zap, Network, Shield,
  CheckCircle2, AlertTriangle, Clock, XCircle, Download,
  Camera, BookOpen, Wrench, DollarSign, Hash, MapPin,
  Server, Tag, Grid3x3, RefreshCw, ChevronDown,
} from 'lucide-react';
import AppLayout from '../../components/AppLayout';
import ModuleEmptyState from '../../components/ModuleEmptyState';

export type RackType =
  | 'Rack Cableado'
  | 'Rack Equipo Activo'
  | 'Rack CCTV'
  | 'Rack Telefonía'
  | 'Rack Servidores';

export type RackStatus = 'Operativo' | 'Atención' | 'Crítico' | 'Planeado' | 'Fuera de servicio';
export type RackPostes = '2 Postes' | '4 Postes' | 'Abierto' | 'Cerrado' | 'Wall-mount' | 'Gabinete' | 'Panzone';

export interface RackRecord {
  id: string;
  code: string;
  brand: string;
  model: string;
  height_u: number;
  type_posts: RackPostes;
  rack_type: RackType;
  status: RackStatus;
  location: string;
  floor_plan_ref: string;
  photo_url: string;
  ref_image_url: string;
  observations: string;
  org_horizontal: boolean;
  org_vertical: boolean;
  pdu: boolean;
  integrator: string;
  invoice_no: string;
  cost_usd: number;
  po: string;
  cost_center: string;
  rfid_tag: string;
  install_year: number;
  capacity_u: number;
  used_u: number;
}

const MOCK_RACKS: RackRecord[] = [
  { id:'1', code:'RCK-IDF2-A0001', brand:'Panduit', model:'RP40', height_u:48, type_posts:'2 Postes', rack_type:'Rack Cableado', status:'Operativo', location:'IDF2 Área de Producción', floor_plan_ref:'Plano IDF2 Prod', photo_url:'', ref_image_url:'', observations:'Sin organizadores, hace falta charolas', org_horizontal:false, org_vertical:false, pdu:false, integrator:'IAMET', invoice_no:'', cost_usd:0, po:'', cost_center:'', rfid_tag:'', install_year:2026, capacity_u:48, used_u:12 },
  { id:'2', code:'RCK-MDF-A0001', brand:'Chatsworth', model:'CPI 45U', height_u:45, type_posts:'4 Postes', rack_type:'Rack Equipo Activo', status:'Operativo', location:'MDF Principal Torre A', floor_plan_ref:'Plano MDF-A S1', photo_url:'', ref_image_url:'', observations:'Rack principal de distribución activa. Switches core.', org_horizontal:true, org_vertical:true, pdu:true, integrator:'Bajanet', invoice_no:'F-2024-0312', cost_usd:4200, po:'PO-2024-001', cost_center:'TI-001', rfid_tag:'RFID-0001', install_year:2024, capacity_u:45, used_u:38 },
  { id:'3', code:'RCK-CCTV-B0001', brand:'Tripp Lite', model:'SR42UB', height_u:42, type_posts:'4 Postes', rack_type:'Rack CCTV', status:'Operativo', location:'Torre B Planta Baja', floor_plan_ref:'Plano TB-PB-SEC', photo_url:'', ref_image_url:'', observations:'NVRs y grabadoras de video vigilancia.', org_horizontal:true, org_vertical:false, pdu:true, integrator:'SecureTech', invoice_no:'F-2023-1105', cost_usd:3100, po:'PO-2023-044', cost_center:'SEG-002', rfid_tag:'RFID-0002', install_year:2023, capacity_u:42, used_u:18 },
  { id:'4', code:'RCK-TEL-A0001', brand:'APC', model:'NetShelter SX 42U', height_u:42, type_posts:'4 Postes', rack_type:'Rack Telefonía', status:'Atención', location:'Sala Técnica Piso 10', floor_plan_ref:'Plano A-P10-TEL', photo_url:'', ref_image_url:'', observations:'Central telefónica IP. Requiere revisión de cableado.', org_horizontal:false, org_vertical:true, pdu:false, integrator:'IAMET', invoice_no:'F-2022-0789', cost_usd:2800, po:'PO-2022-022', cost_center:'TI-003', rfid_tag:'', install_year:2022, capacity_u:42, used_u:30 },
  { id:'5', code:'RCK-SRV-DC001', brand:'Dell', model:'PowerEdge Rack 48U', height_u:48, type_posts:'4 Postes', rack_type:'Rack Servidores', status:'Crítico', location:'Datacenter Principal', floor_plan_ref:'Plano DC-P1-SRV-01', photo_url:'', ref_image_url:'', observations:'Capacidad al 96%. Urgente expansión o migración a nube.', org_horizontal:true, org_vertical:true, pdu:true, integrator:'Dell Technologies', invoice_no:'F-2021-0001', cost_usd:8500, po:'PO-2021-001', cost_center:'DC-001', rfid_tag:'RFID-0005', install_year:2021, capacity_u:48, used_u:46 },
  { id:'6', code:'RCK-IDF3-A0001', brand:'Panduit', model:'XG6', height_u:24, type_posts:'2 Postes', rack_type:'Rack Cableado', status:'Planeado', location:'IDF3 Piso 5 Torre A', floor_plan_ref:'', photo_url:'', ref_image_url:'', observations:'Rack nuevo en instalación. Pendiente cableado.', org_horizontal:false, org_vertical:false, pdu:false, integrator:'Bajanet', invoice_no:'', cost_usd:1200, po:'PO-2026-010', cost_center:'TI-001', rfid_tag:'', install_year:2026, capacity_u:24, used_u:0 },
];

const STATUS_CONFIG: Record<RackStatus, { pill: string; dot: string }> = {
  'Operativo':         { pill:'bg-emerald-100 text-emerald-700 border border-emerald-200', dot:'bg-emerald-500' },
  'Atención':          { pill:'bg-amber-100 text-amber-700 border border-amber-200',       dot:'bg-amber-400' },
  'Crítico':           { pill:'bg-red-100 text-red-700 border border-red-200',             dot:'bg-red-500' },
  'Planeado':          { pill:'bg-blue-100 text-blue-700 border border-blue-200',          dot:'bg-blue-400' },
  'Fuera de servicio': { pill:'bg-slate-100 text-slate-600 border border-[#E8EBF4]',          dot:'bg-gray-400' },
};

const TYPE_CONFIG: Record<RackType, { color: string; bg: string }> = {
  'Rack Cableado':      { color:'text-blue-700',   bg:'bg-blue-50 border-blue-200' },
  'Rack Equipo Activo': { color:'text-violet-700',  bg:'bg-violet-50 border-violet-200' },
  'Rack CCTV':          { color:'text-orange-700',  bg:'bg-orange-50 border-orange-200' },
  'Rack Telefonía':     { color:'text-teal-700',    bg:'bg-teal-50 border-teal-200' },
  'Rack Servidores':    { color:'text-rose-700',    bg:'bg-rose-50 border-rose-200' },
};

const RACK_TYPES: RackType[] = ['Rack Cableado','Rack Equipo Activo','Rack CCTV','Rack Telefonía','Rack Servidores'];
const RACK_STATUSES: RackStatus[] = ['Operativo','Atención','Crítico','Planeado','Fuera de servicio'];
const RACK_POSTES: RackPostes[] = ['2 Postes','4 Postes','Abierto','Cerrado','Wall-mount','Gabinete','Panzone'];

function capPct(r: RackRecord) { return r.capacity_u ? Math.round((r.used_u/r.capacity_u)*100) : 0; }

// ── ImageUploader ──────────────────────────────────────────────
interface IUProps { label:string; sublabel?:string; value:string; onChange:(u:string)=>void; onClear:()=>void; accent?:string; icon?:React.ReactNode; }
function ImageUploader({ label, sublabel, value, onChange, onClear, accent='text-blue-500', icon }: IUProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const upload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setErr('Solo imágenes'); return; }
    if (file.size > 10*1024*1024) { setErr('Máx 10 MB'); return; }
    setErr(''); setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/upload', { method:'POST', body:fd });
      if (!res.ok) throw new Error('Error al subir');
      const d = await res.json() as { url:string }; onChange(d.url);
    } catch(e:unknown) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }, [onChange]);
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">{icon && <span className={accent}>{icon}</span>}<span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">{label}</span></div>
        {value && !busy && <button type="button" onClick={onClear} className="flex items-center gap-1 text-[12px] text-red-400 hover:text-red-600 font-semibold"><Trash2 size={10}/> Eliminar</button>}
      </div>
      {sublabel && <p className="text-[12px] text-[#5C6194] mb-2">{sublabel}</p>}
      {err && <p className="text-[12px] text-red-500 mb-1.5">⚠ {err}</p>}
      {busy ? (
        <div className="flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
          <p className="text-[13px] text-blue-500">Subiendo...</p>
        </div>
      ) : value ? (
        <div className="relative group rounded-xl overflow-hidden border border-[#E8EBF4] bg-slate-50">
          <img src={value} alt={label} className="w-full h-32 object-cover"/>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <button type="button" onClick={()=>ref.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 rounded-xl text-[13px] font-bold text-slate-700 shadow-sm"><Camera size={11}/> Cambiar</button>
          </div>
        </div>
      ) : (
        <div onClick={()=>ref.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)upload(f);}}
          className={`flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed cursor-pointer transition-all ${drag?'border-blue-400 bg-blue-50/60':'border-[#E8EBF4] bg-slate-50/80 hover:border-blue-300 hover:bg-blue-50/30'}`}>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-[#F0F2FA] border border-[#E8EBF4] ${accent}`}>{icon??<Camera size={14}/>}</div>
          <p className="text-[13px] font-semibold text-slate-500">{drag?'Suelta aquí':'Clic o arrastra'}</p>
          <p className="text-[12px] text-[#5C6194]">JPG, PNG, WEBP — máx. 10 MB</p>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)upload(f);}}/>
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────
const EMPTY: Partial<RackRecord> = { code:'', brand:'', model:'', height_u:42, type_posts:'4 Postes', rack_type:'Rack Cableado', status:'Operativo', location:'', floor_plan_ref:'', photo_url:'', ref_image_url:'', observations:'', org_horizontal:false, org_vertical:false, pdu:false, integrator:'', invoice_no:'', cost_usd:0, po:'', cost_center:'', rfid_tag:'', install_year:new Date().getFullYear(), capacity_u:42, used_u:0 };

function RackModal({ rack, onClose, onSave }: { rack: Partial<RackRecord>|null; onClose:()=>void; onSave:(r:RackRecord)=>void; }) {
  const [form, setForm] = useState<Partial<RackRecord>>(rack ? {...rack} : {...EMPTY});
  const isEdit = !!(rack?.id);
  const set = (k: keyof RackRecord, v: unknown) => setForm(f=>({...f,[k]:v}));
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code?.trim()) return;
    onSave({ ...EMPTY, ...form, id: form.id||String(Date.now()) } as RackRecord);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#F0F2FA] border-b border-[#E8EBF4] rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center"><Grid3x3 size={16} className="text-white"/></div>
            <div><h2 className="text-sm font-black text-[#1A1D2E]">{isEdit?'Editar Rack':'Nuevo Rack'}</h2><p className="text-[13px] text-[#5C6194]">{isEdit?`Modificando ${rack?.code}`:'Completa los campos'}</p></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X size={14} className="text-slate-500"/></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-6">
          {/* Identificación */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Hash size={10}/> Identificación</h3>
            <div className="grid grid-cols-2 gap-3">
              {[{k:'code',l:'Código *',p:'RCK-IDF2-A0001',mono:true},{k:'brand',l:'Marca',p:'Panduit, APC...'},{k:'model',l:'Modelo',p:'RP40, SR42UB...'}].map(({k,l,p,mono})=>(
                <div key={k}><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">{l}</label>
                <input value={(form[k as keyof RackRecord] as string)||''} onChange={e=>set(k as keyof RackRecord,e.target.value)} placeholder={p} required={k==='code'}
                  className={`w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 ${mono?'font-mono':''}`}/></div>
              ))}
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Altura (U)</label>
                <input type="number" min={1} max={60} value={form.height_u||42} onChange={e=>set('height_u',Number(e.target.value))} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tipo (Postes)</label>
                <select value={form.type_posts||'4 Postes'} onChange={e=>set('type_posts',e.target.value as RackPostes)} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">{RACK_POSTES.map(p=><option key={p}>{p}</option>)}</select></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Función del Rack</label>
                <select value={form.rack_type||'Rack Cableado'} onChange={e=>set('rack_type',e.target.value as RackType)} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">{RACK_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Estado</label>
                <select value={form.status||'Operativo'} onChange={e=>set('status',e.target.value as RackStatus)} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">{RACK_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Año de Instalación</label>
                <input type="number" min={2000} max={2099} value={form.install_year||2026} onChange={e=>set('install_year',Number(e.target.value))} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
            </div>
          </div>
          {/* Ubicación */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><MapPin size={10}/> Ubicación</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Ubicación</label>
                <input value={form.location||''} onChange={e=>set('location',e.target.value)} placeholder="IDF2 Área de Producción" className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Ubicación en Plano</label>
                <input value={form.floor_plan_ref||''} onChange={e=>set('floor_plan_ref',e.target.value)} placeholder="Plano IDF2 Prod" className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
            </div>
          </div>
          {/* Capacidad */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><BarChart2 size={10}/> Capacidad</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Unidades Totales (U)</label>
                <input type="number" min={1} value={form.capacity_u||42} onChange={e=>set('capacity_u',Number(e.target.value))} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Unidades Ocupadas (U)</label>
                <input type="number" min={0} value={form.used_u||0} onChange={e=>set('used_u',Number(e.target.value))} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
            </div>
          </div>
          {/* Accesorios */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Wrench size={10}/> Accesorios</h3>
            <div className="grid grid-cols-3 gap-3">
              {[{k:'org_horizontal',l:'Organizadores Horizontales'},{k:'org_vertical',l:'Organizadores Verticales'},{k:'pdu',l:'PDU'}].map(({k,l})=>(
                <label key={k} className="flex items-center gap-2 p-3 rounded-xl border border-[#E8EBF4] bg-slate-50 cursor-pointer hover:bg-blue-50/40 transition-colors">
                  <input type="checkbox" checked={!!(form[k as keyof RackRecord])} onChange={e=>set(k as keyof RackRecord,e.target.checked)} className="w-4 h-4 rounded accent-blue-600"/>
                  <span className="text-xs font-semibold text-[#1A1D2E]">{l}</span>
                </label>
              ))}
            </div>
          </div>
          {/* Datos Comerciales */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><DollarSign size={10}/> Datos Comerciales</h3>
            <div className="grid grid-cols-2 gap-3">
              {[{k:'integrator',l:'Integrador',p:'IAMET, Bajanet...'},{k:'invoice_no',l:'No. Factura',p:'F-2024-0001'},{k:'po',l:'PO',p:'PO-2024-001'},{k:'cost_center',l:'Centro de Costos',p:'TI-001'},{k:'rfid_tag',l:'Etiqueta RFID',p:'RFID-0001'}].map(({k,l,p})=>(
                <div key={k}><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">{l}</label>
                  <input value={(form[k as keyof RackRecord] as string)||''} onChange={e=>set(k as keyof RackRecord,e.target.value)} placeholder={p} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
              ))}
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Costo (USD)</label>
                <input type="number" min={0} step={0.01} value={form.cost_usd||0} onChange={e=>set('cost_usd',Number(e.target.value))} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
            </div>
          </div>
          {/* Imágenes */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Camera size={10}/> Imágenes</h3>
            <div className="grid grid-cols-2 gap-4">
              <ImageUploader label="Foto del Rack" sublabel="Fotografía real del rack instalado" value={form.photo_url||''} onChange={v=>set('photo_url',v)} onClear={()=>set('photo_url','')} accent="text-blue-500" icon={<Camera size={14}/>}/>
              <ImageUploader label="Imagen de Referencia" sublabel="Norma Panduit, plano o referencia" value={form.ref_image_url||''} onChange={v=>set('ref_image_url',v)} onClear={()=>set('ref_image_url','')} accent="text-violet-500" icon={<BookOpen size={14}/>}/>
            </div>
          </div>
          {/* Observaciones */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><FileText size={10}/> Observaciones</h3>
            <textarea value={form.observations||''} onChange={e=>set('observations',e.target.value)} rows={3} placeholder="Notas técnicas, pendientes, condiciones especiales..." className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"/>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E8EBF4]">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Cancelar</button>
            <button type="submit" className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-sm transition-all">{isEdit?'Guardar cambios':'Crear Rack'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tab Resumen ────────────────────────────────────────────────
function TabResumen({ racks }: { racks: RackRecord[] }) {
  const total = racks.length;
  const totalU = racks.reduce((s,r)=>s+r.capacity_u,0);
  const usedU = racks.reduce((s,r)=>s+r.used_u,0);
  const capGlobal = totalU>0?Math.round((usedU/totalU)*100):0;
  const totalCost = racks.reduce((s,r)=>s+(r.cost_usd||0),0);
  const KPI = ({icon,label,value,sub,color}:{icon:React.ReactNode;label:string;value:string|number;sub?:string;color:string}) => (
    <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>{icon}</div>
      <div><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">{label}</p><p className="text-xl font-black text-slate-800 leading-tight">{value}</p>{sub&&<p className="text-[13px] text-[#5C6194] mt-0.5">{sub}</p>}</div>
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI icon={<Grid3x3 size={18} className="text-blue-600"/>} label="Total Racks" value={total} sub={`${racks.filter(r=>r.status==='Operativo').length} operativos`} color="bg-blue-50"/>
        <KPI icon={<AlertTriangle size={18} className="text-amber-500"/>} label="En Atención" value={racks.filter(r=>r.status==='Atención').length} sub={`${racks.filter(r=>r.status==='Crítico').length} críticos`} color="bg-amber-50"/>
        <KPI icon={<BarChart2 size={18} className="text-violet-600"/>} label="Ocupación Global" value={`${capGlobal}%`} sub={`${usedU}U / ${totalU}U`} color="bg-violet-50"/>
        <KPI icon={<DollarSign size={18} className="text-emerald-600"/>} label="Inversión Total" value={`$${totalCost.toLocaleString()}`} sub="USD" color="bg-emerald-50"/>
      </div>
      <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm p-5">
        <h3 className="text-xs font-black text-slate-700 mb-4 flex items-center gap-2"><BarChart2 size={14} className="text-blue-500"/> Capacidad Global</h3>
        <div className="flex items-center gap-4 mb-3">
          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${capGlobal>=85?'bg-red-500':capGlobal>=70?'bg-amber-400':'bg-emerald-400'}`} style={{width:`${capGlobal}%`}}/>
          </div>
          <span className={`text-sm font-black ${capGlobal>=85?'text-red-600':capGlobal>=70?'text-amber-600':'text-emerald-600'}`}>{capGlobal}%</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-slate-50 rounded-xl"><p className="text-lg font-black text-[#1A1D2E]">{totalU}U</p><p className="text-[12px] text-[#5C6194] uppercase tracking-widest">Capacidad total</p></div>
          <div className="p-3 bg-blue-50 rounded-xl"><p className="text-lg font-black text-blue-700">{usedU}U</p><p className="text-[12px] text-blue-400 uppercase tracking-widest">Ocupadas</p></div>
          <div className="p-3 bg-emerald-50 rounded-xl"><p className="text-lg font-black text-emerald-700">{totalU-usedU}U</p><p className="text-[12px] text-emerald-400 uppercase tracking-widest">Disponibles</p></div>
        </div>
      </div>
      <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm p-5">
        <h3 className="text-xs font-black text-slate-700 mb-4 flex items-center gap-2"><Server size={14} className="text-violet-500"/> Por Tipo de Rack</h3>
        <div className="space-y-3">
          {RACK_TYPES.filter(t=>racks.some(r=>r.rack_type===t)).map(t=>{
            const rs=racks.filter(r=>r.rack_type===t);
            const u=rs.reduce((s,r)=>s+r.used_u,0), tot=rs.reduce((s,r)=>s+r.capacity_u,0);
            const pct=tot>0?Math.round((u/tot)*100):0;
            const cfg=TYPE_CONFIG[t];
            return (
              <div key={t} className="flex items-center gap-3">
                <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} w-36 text-center flex-shrink-0`}>{t}</span>
                <span className="text-[13px] font-bold text-slate-500 w-6 text-right">{rs.length}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct>=85?'bg-red-400':pct>=70?'bg-amber-400':'bg-blue-400'}`} style={{width:`${pct}%`}}/></div>
                <span className="text-[13px] text-[#5C6194] w-16 text-right">{u}U/{tot}U</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Tab Inventario ─────────────────────────────────────────────
function TabInventario({ racks, onEdit, onDelete, highlightCode }: { racks:RackRecord[]; onEdit:(r:RackRecord)=>void; onDelete:(id:string)=>void; highlightCode?:string; }) {
  const [search, setSearch] = useState(highlightCode||'');
  const [fType, setFType] = useState<RackType|'Todos'>('Todos');
  const [fStatus, setFStatus] = useState<RackStatus|'Todos'>('Todos');
  const [expandedId, setExpandedId] = useState<string|null>(null);
  const [highlightedId, setHighlightedId] = useState<string|null>(null);
  const rowRefs = useRef<Record<string,HTMLDivElement|null>>({});
  const didHighlight = useRef(false);

  // Scroll + highlight cuando llega highlightCode
  useEffect(() => {
    if (!highlightCode || didHighlight.current) return;
    setSearch(highlightCode);
    const timer = setTimeout(() => {
      const match = racks.find(r =>
        r.code === highlightCode ||
        r.code.toLowerCase().includes(highlightCode.toLowerCase())
      );
      if (!match) return;
      setHighlightedId(match.id);
      setExpandedId(match.id);
      didHighlight.current = true;
      const el = rowRefs.current[match.id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightedId(null), 2500);
    }, 300);
    return () => clearTimeout(timer);
  }, [highlightCode, racks]);

  const filtered = useMemo(()=>racks.filter(r=>{
    const q=search.toLowerCase();
    return (!q||[r.code,r.brand,r.model,r.location,r.integrator,r.rfid_tag].some(v=>v.toLowerCase().includes(q)))
      &&(fType==='Todos'||r.rack_type===fType)
      &&(fStatus==='Todos'||r.status===fStatus);
  }),[racks,search,fType,fStatus]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por código, marca, ubicación, RFID..." className="w-full pl-8 pr-3 py-2 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"/>
        </div>
        <select value={fType} onChange={e=>setFType(e.target.value as RackType|'Todos')} className="px-3 py-2 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm">
          <option value="Todos">Todos los tipos</option>{RACK_TYPES.map(t=><option key={t}>{t}</option>)}
        </select>
        <select value={fStatus} onChange={e=>setFStatus(e.target.value as RackStatus|'Todos')} className="px-3 py-2 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm">
          <option value="Todos">Todos los estados</option>{RACK_STATUSES.map(s=><option key={s}>{s}</option>)}
        </select>
        <span className="text-[13px] text-[#5C6194] font-medium">{filtered.length} rack{filtered.length!==1?'s':''}</span>
      </div>
      <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr_5rem_1fr_1fr_6rem_5rem] gap-2 px-4 py-2.5 bg-[#F8F9FE] border-b border-[#E8EBF4] text-[12px] font-black text-slate-500 uppercase tracking-widest">
          <span/><span>Código</span><span>Marca / Modelo</span><span>Función</span><span>Tipo</span><span>Ubicación</span><span>Capacidad</span><span>Estado</span><span className="text-right">Acciones</span>
        </div>
        {filtered.length===0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center"><Grid3x3 size={20} className="text-[#5C6194]"/></div>
            <p className="text-sm font-bold text-slate-500">No se encontraron racks</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(r=>{
              const sc=STATUS_CONFIG[r.status]||{ pill:'bg-slate-100 text-slate-600 border border-[#E8EBF4]', dot:'bg-gray-400' }, tc=TYPE_CONFIG[r.rack_type as RackType]||{ color:'text-blue-700', bg:'bg-blue-50 border-blue-200' }, pct=capPct(r), isExp=expandedId===r.id;
              const isHL = highlightedId === r.id;
              return (
                <div key={r.id} ref={el=>{ rowRefs.current[r.id]=el as HTMLDivElement|null; }} className={isHL?'skia-highlight-row':''}>
                  <div onClick={()=>setExpandedId(isExp?null:r.id)} className={`grid grid-cols-[1.5rem_1fr_1fr_1fr_5rem_1fr_1fr_6rem_5rem] gap-2 px-4 py-3 items-center cursor-pointer transition-colors ${isExp?'bg-blue-50 border-l-4 border-l-blue-500':'hover:bg-slate-50/80 border-l-4 border-l-transparent'}`}>
                    <span className="text-[#5C6194] transition-transform duration-200" style={{transform:isExp?'rotate(90deg)':'rotate(0deg)'}}><ChevronRight size={14}/></span>
                    <div>
                      <p className="text-xs font-mono font-bold text-blue-700">{r.code}</p>
                      {r.rfid_tag&&<p className="text-[12px] text-indigo-400 flex items-center gap-0.5 mt-0.5"><Tag size={9}/>{r.rfid_tag}</p>}
                    </div>
                    <div><p className="text-xs font-semibold text-slate-800">{r.brand}</p><p className="text-[13px] text-[#5C6194]">{r.model}</p></div>
                    <div>
                      <span className={`inline-block text-[12px] font-bold px-2 py-0.5 rounded-full border ${tc.bg} ${tc.color}`}>{r.rack_type}</span>
                      <p className="text-[12px] text-[#5C6194] mt-0.5">{r.height_u}U</p>
                    </div>
                    <div><span className="inline-block text-[12px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-[#E8EBF4]">{r.type_posts}</span></div>
                    <div><p className="text-xs text-slate-700 font-medium">{r.location||'—'}</p>{r.floor_plan_ref&&<p className="text-[12px] text-[#5C6194] mt-0.5">{r.floor_plan_ref}</p>}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct>=85?'bg-red-400':pct>=70?'bg-amber-400':'bg-emerald-400'}`} style={{width:`${pct}%`}}/></div>
                        <span className={`text-[12px] font-bold ${pct>=85?'text-red-600':pct>=70?'text-amber-600':'text-emerald-600'}`}>{pct}%</span>
                      </div>
                      <p className="text-[12px] text-[#5C6194] mt-0.5">{r.used_u}U / {r.capacity_u}U</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold border ${sc.pill}`}><span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}/>{r.status}</span>
                    <div className="flex items-center justify-end gap-1" onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>onEdit(r)} className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors" title="Editar"><Edit2 size={11} className="text-blue-600"/></button>
                      <button onClick={()=>onDelete(r.id)} className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors" title="Eliminar"><Trash2 size={11} className="text-red-500"/></button>
                    </div>
                  </div>
                  {isExp&&(
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50/70 border-t-2 border-t-blue-300 border-l-4 border-l-blue-500 px-6 py-5">
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                        {[{l:'Código',v:r.code,mono:true},{l:'Marca',v:r.brand},{l:'Modelo',v:r.model},{l:'Altura',v:`${r.height_u}U`},{l:'Tipo postes',v:r.type_posts},{l:'Año instal.',v:r.install_year||'—'}].map(({l,v,mono})=>(
                          <div key={l}><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">{l}</p><p className={`text-xs font-semibold text-slate-800 mt-0.5 ${mono?'font-mono text-blue-700':''}`}>{v}</p></div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                        {[{l:'Ubicación',v:r.location||'—'},{l:'Ref. en Plano',v:r.floor_plan_ref||'—'},{l:'RFID',v:r.rfid_tag||'—',mono:true},{l:'Integrador',v:r.integrator||'—'},{l:'No. Factura',v:r.invoice_no||'—',mono:true},{l:'PO',v:r.po||'—',mono:true}].map(({l,v,mono})=>(
                          <div key={l}><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">{l}</p><p className={`text-xs font-semibold text-slate-800 mt-0.5 ${mono?'font-mono text-indigo-600':''}`}>{v}</p></div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                        <div><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Costo USD</p><p className="text-xs font-bold text-emerald-700 mt-0.5">{r.cost_usd?`$${r.cost_usd.toLocaleString()}`:'—'}</p></div>
                        <div><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Centro de Costos</p><p className="text-xs text-slate-700 mt-0.5">{r.cost_center||'—'}</p></div>
                        <div className="col-span-2">
                          <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Accesorios</p>
                          <div className="flex flex-wrap gap-2">
                            {[{l:'Org. Horizontal',v:r.org_horizontal},{l:'Org. Vertical',v:r.org_vertical},{l:'PDU',v:r.pdu}].map(({l,v})=>(
                              <span key={l} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold border ${v?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-slate-100 text-slate-500 border-[#E8EBF4]'}`}>
                                {v?<CheckCircle2 size={9}/>:<XCircle size={9}/>} {l}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      {r.observations&&<div className="mb-4"><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Observaciones</p><p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{r.observations}</p></div>}
                      {(r.photo_url||r.ref_image_url)&&(
                        <div className="mb-4">
                          <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-2">Imágenes</p>
                          <div className="flex gap-3">
                            {r.photo_url&&<div className="flex-1 max-w-xs"><p className="text-[12px] text-[#5C6194] mb-1">Foto del rack</p><img src={r.photo_url} alt="Foto" className="w-full h-28 object-cover rounded-xl border border-[#E8EBF4]"/></div>}
                            {r.ref_image_url&&<div className="flex-1 max-w-xs"><p className="text-[12px] text-[#5C6194] mb-1">Imagen de referencia</p><img src={r.ref_image_url} alt="Ref" className="w-full h-28 object-cover rounded-xl border border-[#E8EBF4]"/></div>}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-3 border-t-2 border-t-blue-200">
                        <button onClick={()=>onEdit(r)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"><Edit2 size={11}/> Editar</button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#F0F2FA] border border-[#E8EBF4] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"><Wrench size={11}/> Mantenimiento</button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#F0F2FA] border border-[#E8EBF4] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"><FileText size={11}/> Ficha Técnica</button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#F0F2FA] border border-[#E8EBF4] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"><Download size={11}/> Exportar</button>
                        <button onClick={()=>onDelete(r.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors ml-auto"><Trash2 size={11}/> Eliminar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab Normativa ──────────────────────────────────────────
type CertAnswer = 'cumple'|'no_cumple'|'na';
type CertCrit = 'baja'|'media'|'alta'|'critica';
type CertNorm = 'ANSI/TIA-942-C'|'ANSI/TIA-606'|'ANSI/TIA-568'|'ANSI/TIA-569'|'ISO/IEC 11801'|'Evaluación interna SKIA';
interface RCQ { id:string; category:string; question:string; norm_ref:string; criticality:CertCrit; hint:string; }
interface RCA { question_id:string; answer:CertAnswer; observation:string; evidence_url:string; }
interface RCE { id:string; rack_id:string; rack_code:string; standard:CertNorm; evaluator:string; eval_date:string; answers:RCA[]; overall_pct:number|null; badge:'Certificable'|'Encaminado'|'Crítico'; notes:string; }

const CERT_CATS = ['Estructura física','Cableado y organización','Energía y PDU','Seguridad y acceso','Documentación'];
const CERT_QS: RCQ[] = [
  {id:'ef-1',category:'Estructura física',question:'¿El rack está nivelado y anclado correctamente al piso o pared?',norm_ref:'TIA-569-D §7.2',criticality:'alta',hint:'TIA-569-D §7.2 exige que los racks de piso estén anclados con pernos de expansión al concreto o a la estructura metálica del edificio. Un rack sin anclar puede volcarse ante vibraciones, sismos o al abrir puertas pesadas. Verificar con nivel de burbuja que la desviación no supere 2 mm/m. Los racks de pared requieren soporte en al menos 2 montantes estructurales.'},
  {id:'ef-2',category:'Estructura física',question:'¿La altura del rack es adecuada para los equipos instalados y el espacio disponible?',norm_ref:'TIA-569-D §7.1',criticality:'media',hint:'TIA-569-D §7.1 recomienda que la altura del rack no supere el 80% de la altura libre del cuarto para facilitar el mantenimiento. Racks de 45U o más en cuartos con altura menor a 3 m pueden dificultar el acceso a los equipos superiores. Considerar la altura de los equipos más altos que se instalarán (switches de alta densidad, servidores blade).'},
  {id:'ef-3',category:'Estructura física',question:'¿Las puertas y paneles laterales cierran correctamente y tienen llave funcional?',norm_ref:'TIA-942-C §6.4',criticality:'media',hint:'TIA-942-C §6.4 requiere que todos los racks cerrados tengan mecanismo de cierre funcional. Las puertas perforadas deben tener al menos 60% de área abierta para no restringir el flujo de aire. Verificar que los sellos de las puertas no estén deteriorados y que las bisagras permitan apertura de al menos 120° para acceso completo a los equipos.'},
  {id:'ef-4',category:'Estructura física',question:'¿Existe espacio libre mínimo de 1 m al frente y 0.6 m en la parte trasera del rack?',norm_ref:'TIA-569-D §7.3',criticality:'alta',hint:'TIA-569-D §7.3 establece pasillos mínimos de 1.0 m al frente (pasillo frío) y 0.6 m en la parte trasera (pasillo caliente) para mantenimiento seguro. En centros de datos con más de 4 racks en fila, se recomienda el modelo pasillo frío/caliente con separación física para optimizar el enfriamiento y reducir el consumo de HVAC hasta un 30%.'},
  {id:'ef-5',category:'Estructura física',question:'¿El rack cuenta con puesta a tierra (bonding) correctamente conectada?',norm_ref:'TIA-607-C §5.1',criticality:'critica',hint:'TIA-607-C §5.1 exige que la estructura metálica del rack esté conectada al sistema de puesta a tierra del edificio (TMGB/TGB) mediante conductor de cobre desnudo calibre mínimo AWG 6. La resistencia de tierra debe ser menor a 1 ohm. La falta de tierra es la principal causa de daños por ESD en equipos electrónicos y puede provocar choques eléctricos al personal.'},
  {id:'co-1',category:'Cableado y organización',question:'¿Los cables están organizados con organizadores horizontales y/o verticales?',norm_ref:'TIA-568.2-D §6.5',criticality:'alta',hint:'TIA-568.2-D recomienda instalar organizadores horizontales de 1U entre cada 2U de patch panel, y organizadores verticales en los laterales del rack para gestionar los patch cords que van de un nivel a otro. Sin organizadores, los cables cuelgan libremente, generan tensión sobre los puertos, bloquean el flujo de aire y dificultan enormemente el mantenimiento y la identificación de cables.'},
  {id:'co-2',category:'Cableado y organización',question:'¿Todos los cables están etiquetados en ambos extremos con identificador único?',norm_ref:'TIA-606-C §5.2',criticality:'alta',hint:'TIA-606-C §5.2 exige etiquetado en ambos extremos de cada cable con el mismo identificador único. El formato recomendado incluye: identificador de origen (rack-panel-puerto) e identificador de destino. Las etiquetas deben ser de tipo wrap-around (envolventes) para cables, impresas con impresora de etiquetas, y resistentes a la abrasión. Un cable sin etiquetar en ambos extremos se considera no conforme.'},
  {id:'co-3',category:'Cableado y organización',question:'¿Se respeta el radio de curvatura mínimo en todos los cables?',norm_ref:'TIA-568.2-D §6.3',criticality:'media',hint:'TIA-568.2-D establece radio de curvatura mínimo de 4× el diámetro exterior del cable (aprox. 25 mm para Cat6A, 38 mm para cables de fibra óptica). Las curvaturas excesivas deforman los pares trenzados y aumentan la diafonfa (NEXT), pudiendo causar fallas en la normativa. Los puntos críticos son la entrada al rack, los organizadores y las curvas en la bandeja portacables.'},
  {id:'co-4',category:'Cableado y organización',question:'¿Los patch panels están documentados con plano de conexiones actualizado?',norm_ref:'TIA-606-C §6.1',criticality:'alta',hint:'TIA-606-C §6.1 requiere un plano de conexiones (port mapping) que muestre: número de puerto del patch panel, identificador del cable horizontal, ubicación del outlet en el área de trabajo y equipo activo conectado. El plano debe actualizarse dentro de las 24 horas posteriores a cualquier cambio. Un plano desactualizado es la principal causa de tiempo de inactividad durante intervenciones de emergencia.'},
  {id:'co-5',category:'Cableado y organización',question:'¿Los cables de poder están separados de los cables de datos para evitar interferencias?',norm_ref:'TIA-569-D §8.2',criticality:'media',hint:'TIA-569-D §8.2 establece separaciones mínimas: 50 mm para cables UTP sin apantallamiento cerca de circuitos de 120V, 100 mm cerca de circuitos de 208-480V. Los cables de poder de alta corriente (PDU, UPS) generan campos electromagnéticos que pueden inducir ruido en los cables de datos y degradar el SNR, causando errores de bit en enlaces de alta velocidad (10G, 25G).'},
  {id:'ep-1',category:'Energía y PDU',question:'¿El rack cuenta con PDU con medición de consumo por toma?',norm_ref:'TIA-942-C §8.3',criticality:'media',hint:'TIA-942-C §8.3 recomienda PDUs inteligentes con medición por toma (outlet-level metering) para monitoreo en tiempo real del consumo de cada equipo. Esto permite detectar equipos con consumo anormal, planificar la capacidad eléctrica del rack y evitar sobrecargas. Las PDUs con comunicación SNMP o Modbus permiten integración con sistemas DCIM para alertas automáticas.'},
  {id:'ep-2',category:'Energía y PDU',question:'¿La PDU está conectada a un circuito eléctrico dedicado con breaker diferencial?',norm_ref:'NOM-001-SEDE §100',criticality:'alta',hint:'NOM-001-SEDE §100 exige que cada circuito eléctrico tenga protección contra sobrecorriente (breaker) dimensionada al 125% de la carga continua. Los circuitos para equipos de cómputo deben ser dedicados (no compartidos con cargas de iluminación o HVAC) para evitar variaciones de voltaje. El breaker diferencial (GFCI) es obligatorio en cuartos con riesgo de humedad.'},
  {id:'ep-3',category:'Energía y PDU',question:'¿El consumo actual del rack no supera el 80% de la capacidad del circuito?',norm_ref:'TIA-942-C §8.1',criticality:'alta',hint:'TIA-942-C §8.1 establece que la carga operativa no debe superar el 80% de la capacidad nominal del circuito para mantener un margen de seguridad ante picos de demanda. Por ejemplo, un circuito de 20A a 120V tiene capacidad de 2,400 VA; la carga máxima recomendada es 1,920 VA. Superar el 80% aumenta el riesgo de disparo del breaker y degradación de los conductores por calor.'},
  {id:'ep-4',category:'Energía y PDU',question:'¿Los equipos críticos en el rack están conectados a UPS?',norm_ref:'TIA-942-C §8.2',criticality:'critica',hint:'TIA-942-C §8.2 requiere protección UPS para todos los equipos activos de red (switches, routers, firewalls) y servidores. El UPS debe proporcionar al menos 10 minutos de autonomía a plena carga para permitir un apagado controlado. Verificar que la batería del UPS esté en buen estado (prueba de descarga) y que la capacidad en VA sea suficiente para la carga actual del rack más un 20% de margen.'},
  {id:'ep-5',category:'Energía y PDU',question:'¿Los cables de poder tienen el calibre adecuado para la carga instalada?',norm_ref:'NOM-001-SEDE §310',criticality:'alta',hint:'NOM-001-SEDE §310 establece la tabla de capacidades de corriente por calibre de conductor. Para cargas de hasta 15A usar AWG 14; para 20A usar AWG 12; para 30A usar AWG 10. Cables subdimensionados se calientan, degradan su aislamiento y pueden causar incendios. Verificar que los cables de la PDU al tablero eléctrico tengan el calibre correcto para la carga total del rack.'},
  {id:'sa-1',category:'Seguridad y acceso',question:'¿El rack tiene cerradura individual o está en área de acceso restringido?',norm_ref:'TIA-942-C §9.1',criticality:'alta',hint:'TIA-942-C §9.1 requiere que los racks con equipos activos o patch panels tengan control de acceso físico. Las opciones aceptables son: cerradura con llave individual, cerradura electrónica con tarjeta/PIN, o ubicación en cuarto de telecomunicaciones con acceso restringido. En instalaciones Tier II o superior se requiere registro electrónico de cada acceso.'},
  {id:'sa-2',category:'Seguridad y acceso',question:'¿Existe registro de acceso al rack (bitácora o sistema electrónico)?',norm_ref:'TIA-942-C §9.2',criticality:'media',hint:'El registro debe incluir: fecha y hora, nombre del técnico, empresa, motivo del acceso y trabajos realizados. Para instalaciones con requisitos de cumplimiento (PCI-DSS, ISO 27001, HIPAA) el registro electrónico es obligatorio y debe conservarse mínimo 12 meses. La bitácora física debe estar protegida de alteraciones y ubicada fuera del rack.'},
  {id:'sa-3',category:'Seguridad y acceso',question:'¿Los equipos en el rack tienen tornillos de seguridad o están asegurados al rack?',norm_ref:'TIA-942-C §6.4',criticality:'media',hint:'TIA-942-C §6.4 recomienda que los equipos de alto valor (switches core, servidores, firewalls) estén asegurados con tornillos de seguridad (tipo Torx o con pin central) que requieran herramienta especial para retirarlos. Esto previene el robo de equipos en instalaciones con acceso de múltiples personas. Los equipos en racks abiertos son especialmente vulnerables.'},
  {id:'sa-4',category:'Seguridad y acceso',question:'¿El rack está libre de materiales no relacionados (papelaría, herramientas, etc.)?',norm_ref:'TIA-942-C §6.1',criticality:'baja',hint:'TIA-942-C §6.1 exige que los racks y cuartos de telecomunicaciones estén libres de materiales no relacionados con la infraestructura TI. Materiales ajenos (cajas, herramientas olvidadas, cables sin etiquetar) pueden bloquear el flujo de aire, causar cortocircuitos y dificultar intervenciones de emergencia. Es un indicador clave de la madurez del proceso de mantenimiento.'},
  {id:'sa-5',category:'Seguridad y acceso',question:'¿Existe política documentada de acceso y mantenimiento del rack?',norm_ref:'TIA-942-C §9.3',criticality:'media',hint:'TIA-942-C §9.3 recomienda una política formal que defina: quién puede acceder al rack, bajo qué condiciones, qué trabajos requieren ventana de mantenimiento, cómo se documenta cada intervención y cuál es el proceso de escalamiento ante incidentes. La política debe estar aprobada por la dirección de TI y revisarse anualmente.'},
  {id:'dc-1',category:'Documentación',question:'¿Existe inventario actualizado de todos los equipos instalados en el rack?',norm_ref:'TIA-606-C §4.1',criticality:'alta',hint:'TIA-606-C §4.1 requiere un inventario que incluya para cada equipo: identificador único, marca, modelo, número de serie, posición en el rack (unidad U), fecha de instalación y estado operativo. El inventario debe actualizarse dentro de las 24 horas posteriores a cualquier cambio. Un inventario desactualizado es la principal causa de errores en planificación de capacidad y en respuesta a incidentes.'},
  {id:'dc-2',category:'Documentación',question:'¿El rack tiene diagrama de ocupación de unidades (U map) actualizado?',norm_ref:'TIA-606-C §4.2',criticality:'alta',hint:'El U map es un diagrama visual que muestra qué equipo ocupa cada unidad de rack (U), incluyendo los espacios vacíos, los blanks instalados y los equipos en proceso de instalación. TIA-606-C §4.2 recomienda mantenerlo en formato digital (Visio, AutoCAD, DCIM) y en formato impreso plastificado en la puerta del rack. Permite planificar la instalación de nuevos equipos sin necesidad de abrir el rack.'},
  {id:'dc-3',category:'Documentación',question:'¿Existe plano de conexiones de patch panel actualizado?',norm_ref:'TIA-606-C §6.1',criticality:'alta',hint:'El plano de conexiones debe mostrar: número de puerto del patch panel, identificador del cable horizontal, ubicación del outlet en el área de trabajo y equipo activo conectado. TIA-606-C §6.1 recomienda que el plano esté disponible en formato digital y se actualice dentro de las 24 horas posteriores a cualquier cambio. Un plano desactualizado puede causar interrupciones de servicio durante trabajos de mantenimiento.'},
  {id:'dc-4',category:'Documentación',question:'¿Los certificados de prueba de cableado están disponibles y archivados?',norm_ref:'TIA-568.2-D §10',criticality:'media',hint:'Cada enlace permanente debe tener su reporte de normativa con: modelo del equipo de prueba, fecha de calibración, estándar aplicado, resultado PASS/FAIL y valores medidos (NEXT, IL, RL, PS-NEXT, PS-ACRF). Los archivos deben estar en formato .flw o .pdf, vinculados al inventario del rack y respaldados en sistema documental. Son requeridos en auditorías de garantía del fabricante.'},
  {id:'dc-5',category:'Documentación',question:'¿Existe procedimiento escrito de mantenimiento preventivo del rack?',norm_ref:'TIA-942-C §11.1',criticality:'media',hint:'TIA-942-C §11.1 recomienda un plan de mantenimiento preventivo semestral que incluya: limpieza de filtros de polvo, verificación de tornillos de montaje, prueba de baterías de UPS, verificación de temperaturas internas, revisión de etiquetas y actualización de documentación. El procedimiento debe incluir una lista de verificación (checklist) y registrarse en el sistema de mantenimiento.'},
];
const CERT_NORMS: CertNorm[] = ['ANSI/TIA-942-C','ANSI/TIA-606','ANSI/TIA-568','ANSI/TIA-569','ISO/IEC 11801','Evaluación interna SKIA'];
const CAT_ICONS: Record<string,React.ReactNode> = { 'Estructura física':<Server size={12}/>, 'Cableado y organización':<Network size={12}/>, 'Energía y PDU':<Zap size={12}/>, 'Seguridad y acceso':<Shield size={12}/>, 'Documentación':<FileText size={12}/> };
const BADGE_COLOR = { 'Certificable':'bg-emerald-100 text-emerald-700 border-emerald-200', 'Encaminado':'bg-amber-100 text-amber-700 border-amber-200', 'Crítico':'bg-red-100 text-red-700 border-red-200' };

function buildAnswers(): RCA[] { return CERT_QS.map(q=>({question_id:q.id,answer:'na',observation:'',evidence_url:''})); }
function calcCert(answers: RCA[]) {
  const byCategory = CERT_CATS.map(cat=>{
    const qs=CERT_QS.filter(q=>q.category===cat);
    const applicable=qs.filter(q=>answers.find(a=>a.question_id===q.id)?.answer!=='na');
    const compliant=applicable.filter(q=>answers.find(a=>a.question_id===q.id)?.answer==='cumple');
    const pct=applicable.length>0?Math.round((compliant.length/applicable.length)*100):null;
    return {cat,pct,compliant:compliant.length,applicable:applicable.length,total:qs.length};
  });
  const ac=byCategory.filter(c=>c.pct!==null);
  const overall=ac.length>0?Math.round(ac.reduce((s,c)=>s+(c.pct??0),0)/ac.length):null;
  const badge: 'Certificable'|'Encaminado'|'Crítico' = overall===null?'Encaminado':overall>=85?'Certificable':overall>=50?'Encaminado':'Crítico';
  return {byCategory,overall,badge};
}

function TabNormativa({ racks }: { racks: RackRecord[] }) {
  const [selId, setSelId] = useState<string|null>(null);
  const [history, setHistory] = useState<RCE[]>([]);
  const [activeEval, setActiveEval] = useState<{answers:RCA[];standard:CertNorm;evaluator:string;eval_date:string;notes:string;}|null>(null);
  const [openCat, setOpenCat] = useState<string|null>(CERT_CATS[0]);
  const [editingId, setEditingId] = useState<string|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingQId, setUploadingQId] = useState<string|null>(null);
  const selRack = racks.find(r=>r.id===selId);
  const rackHistory = history.filter(h=>h.rack_id===selId);
  const results = useMemo(()=>activeEval?calcCert(activeEval.answers):null,[activeEval]);

  function startNew() { setActiveEval({answers:buildAnswers(),standard:'Evaluación interna SKIA',evaluator:'',eval_date:new Date().toISOString().slice(0,10),notes:''}); setOpenCat(CERT_CATS[0]); setEditingId(null); }
  function editEval(rec: RCE) { setActiveEval({answers:rec.answers.map(a=>({...a})),standard:rec.standard,evaluator:rec.evaluator,eval_date:rec.eval_date,notes:rec.notes}); setOpenCat(CERT_CATS[0]); setEditingId(rec.id); }
  function saveEval() {
    if (!activeEval||!selRack) return;
    const res=calcCert(activeEval.answers);
    const rec: RCE = {id:editingId||String(Date.now()),rack_id:selRack.id,rack_code:selRack.code,standard:activeEval.standard,evaluator:activeEval.evaluator,eval_date:activeEval.eval_date,answers:activeEval.answers,overall_pct:res.overall,badge:res.badge,notes:activeEval.notes};
    if (editingId) setHistory(h=>h.map(r=>r.id===editingId?rec:r));
    else setHistory(h=>[rec,...h]);
    setActiveEval(null); setEditingId(null);
  }
  async function uploadEvidence(qId: string, file: File) {
    setUploadingQId(qId);
    try {
      const fd=new FormData(); fd.append('file',file);
      const res=await fetch('/api/upload',{method:'POST',body:fd});
      if (!res.ok) throw new Error('Error');
      const d=await res.json() as {url:string};
      setActiveEval(ev=>ev?{...ev,answers:ev.answers.map(a=>a.question_id===qId?{...a,evidence_url:d.url}:a)}:ev);
    } finally { setUploadingQId(null); }
  }

  return (
    <div className="space-y-4">
      {/* Selector */}
      <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm p-4">
        <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-2">Seleccionar Rack a Evaluar</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {racks.map(r=>{
            const sc=STATUS_CONFIG[r.status]||{ pill:'bg-slate-100 text-slate-600 border border-[#E8EBF4]', dot:'bg-gray-400' }; const isSel=selId===r.id; const last=history.filter(h=>h.rack_id===r.id)[0];
            return (
              <button key={r.id} onClick={()=>{setSelId(r.id);setActiveEval(null);}} className={`text-left p-3 rounded-xl border transition-all ${isSel?'border-blue-400 bg-blue-50 shadow-sm':'border-[#E8EBF4] bg-slate-50 hover:border-blue-200 hover:bg-blue-50/30'}`}>
                <p className="text-[13px] font-mono font-bold text-blue-700">{r.code}</p>
                <p className="text-[12px] text-[#5C6194] mt-0.5">{r.rack_type}</p>
                <p className="text-[12px] text-[#5C6194]">{r.location||'—'}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className={`inline-flex items-center gap-0.5 text-[13px] font-bold px-1.5 py-0.5 rounded-full border ${sc.pill}`}><span className={`w-1 h-1 rounded-full ${sc.dot}`}/>{r.status}</span>
                  {last&&<span className={`text-[13px] font-bold px-1.5 py-0.5 rounded-full border ${BADGE_COLOR[last.badge]}`}>{last.overall_pct!==null?`${last.overall_pct}%`:'—'}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selRack&&!activeEval&&(
        <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#E8EBF4]">
            <div><p className="text-xs font-black text-slate-800">Historial — <span className="font-mono text-blue-700">{selRack.code}</span></p><p className="text-[13px] text-[#5C6194]">{selRack.rack_type} · {selRack.location}</p></div>
            <button onClick={startNew} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm"><Plus size={12}/> Nueva evaluación</button>
          </div>
          {rackHistory.length===0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2"><Award size={28} className="text-[#5C6194]"/><p className="text-sm font-bold text-slate-500">Sin evaluaciones registradas</p><p className="text-xs text-[#5C6194]">Haz clic en &quot;Nueva evaluación&quot; para comenzar</p></div>
          ) : (
            <div className="divide-y divide-slate-50">
              {rackHistory.map(rec=>(
                <div key={rec.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/80 transition-colors">
                  <div className="flex-1"><p className="text-xs font-bold text-slate-800">{rec.standard}</p><p className="text-[13px] text-[#5C6194]">{rec.eval_date} · {rec.evaluator||'Sin evaluador'}</p></div>
                  <div className="text-right"><p className="text-lg font-black text-[#1A1D2E]">{rec.overall_pct!==null?`${rec.overall_pct}%`:'—'}</p><span className={`text-[12px] font-bold px-2 py-0.5 rounded-full border ${BADGE_COLOR[rec.badge]}`}>{rec.badge}</span></div>
                  <button onClick={()=>editEval(rec)} className="flex items-center gap-1 px-2.5 py-1.5 text-[13px] font-bold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"><Edit2 size={10}/> Editar</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeEval&&selRack&&(
        <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8EBF4] bg-gradient-to-r from-blue-50/60 to-indigo-50/40">
            <div><p className="text-xs font-black text-slate-800">{editingId?'Editando':'Nueva'} evaluación — <span className="font-mono text-blue-700">{selRack.code}</span></p><p className="text-[13px] text-[#5C6194]">{selRack.rack_type} · {selRack.location}</p></div>
            <div className="flex items-center gap-2">
              {results&&<div className="text-right mr-2"><p className="text-xl font-black text-slate-800">{results.overall!==null?`${results.overall}%`:'—'}</p><span className={`text-[12px] font-bold px-2 py-0.5 rounded-full border ${BADGE_COLOR[results.badge]}`}>{results.badge}</span></div>}
              <button onClick={()=>setActiveEval(null)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X size={13} className="text-slate-500"/></button>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Norma</label>
                <select value={activeEval.standard} onChange={e=>setActiveEval(ev=>ev?{...ev,standard:e.target.value as CertNorm}:ev)} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">{CERT_NORMS.map(n=><option key={n}>{n}</option>)}</select></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Evaluador</label>
                <input value={activeEval.evaluator} onChange={e=>setActiveEval(ev=>ev?{...ev,evaluator:e.target.value}:ev)} placeholder="Nombre del evaluador" className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha</label>
                <input type="date" value={activeEval.eval_date} onChange={e=>setActiveEval(ev=>ev?{...ev,eval_date:e.target.value}:ev)} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"/></div>
            </div>
            {results&&(
              <div className="grid grid-cols-5 gap-2">
                {results.byCategory.map(({cat,pct,compliant,applicable})=>(
                  <div key={cat} onClick={()=>setOpenCat(openCat===cat?null:cat)} className={`p-3 rounded-xl border text-center cursor-pointer transition-all ${openCat===cat?'border-blue-400 bg-blue-50 shadow-sm':'border-[#E8EBF4] bg-slate-50 hover:border-blue-200'}`}>
                    <div className="flex justify-center mb-1 text-slate-500">{CAT_ICONS[cat]}</div>
                    <p className="text-[13px] font-bold text-slate-500 leading-tight">{cat}</p>
                    <p className={`text-base font-black mt-1 ${pct===null?'text-slate-500':pct>=85?'text-emerald-600':pct>=50?'text-amber-600':'text-red-600'}`}>{pct!==null?`${pct}%`:'—'}</p>
                    <p className="text-[13px] text-slate-500">{compliant}/{applicable}</p>
                  </div>
                ))}
              </div>
            )}
            {CERT_CATS.map(cat=>{
              const qs=CERT_QS.filter(q=>q.category===cat); const isOpen=openCat===cat;
              return (
                <div key={cat} className="border border-[#E8EBF4] rounded-xl overflow-hidden">
                  <button type="button" onClick={()=>setOpenCat(isOpen?null:cat)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-2"><span className="text-slate-500">{CAT_ICONS[cat]}</span><span className="text-xs font-bold text-[#1A1D2E]">{cat}</span><span className="text-[12px] text-[#5C6194]">({qs.length} preguntas)</span></div>
                    {isOpen?<ChevronDown size={14} className="text-slate-500"/>:<ChevronRight size={14} className="text-slate-500"/>}
                  </button>
                  {isOpen&&(
                    <div className="divide-y divide-slate-50">
                      {qs.map(q=>{
                        const ans=activeEval.answers.find(a=>a.question_id===q.id)!;
                        return (
                          <div key={q.id} className="px-4 py-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <span className={`flex-shrink-0 text-[13px] font-bold px-1.5 py-0.5 rounded border mt-0.5 ${q.criticality==='critica'?'bg-red-100 text-red-700 border-red-200':q.criticality==='alta'?'bg-orange-100 text-orange-700 border-orange-200':q.criticality==='media'?'bg-amber-100 text-amber-700 border-amber-200':'bg-slate-100 text-slate-500 border-[#E8EBF4]'}`}>{q.criticality.toUpperCase()}</span>
                              <div className="flex-1">
                                <p className="text-xs text-slate-700">{q.question}</p>
                                <div className="mt-1.5 flex items-start gap-1.5 bg-blue-50/60 border border-blue-100 rounded-lg px-2.5 py-1.5">
                                  <BookOpen size={10} className="text-blue-400 flex-shrink-0 mt-0.5"/>
                                  <p className="text-[12px] text-blue-700 leading-relaxed">{q.hint}</p>
                                </div>
                              </div>
                              <span className="text-[13px] text-slate-500 font-mono flex-shrink-0">{q.norm_ref}</span>
                            </div>
                            <div className="flex items-center gap-2 ml-8">
                              {(['cumple','no_cumple','na'] as CertAnswer[]).map(opt=>(
                                <button key={opt} type="button" onClick={()=>setActiveEval(ev=>ev?{...ev,answers:ev.answers.map(a=>a.question_id===q.id?{...a,answer:opt}:a)}:ev)}
                                  className={`px-3 py-1 text-[12px] font-bold rounded-lg border transition-all ${ans.answer===opt?(opt==='cumple'?'bg-emerald-500 text-white border-emerald-500':opt==='no_cumple'?'bg-red-500 text-white border-red-500':'bg-gray-400 text-white border-gray-400'):'bg-slate-100 text-slate-500 border-[#E8EBF4] hover:border-gray-300'}`}>
                                  {opt==='cumple'?'Cumple':opt==='no_cumple'?'No cumple':'N/A'}
                                </button>
                              ))}
                              <input value={ans.observation} onChange={e=>setActiveEval(ev=>ev?{...ev,answers:ev.answers.map(a=>a.question_id===q.id?{...a,observation:e.target.value}:a)}:ev)} placeholder="Observación..." className="flex-1 px-2 py-1 text-[13px] bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"/>
                              <button type="button" onClick={()=>{setUploadingQId(q.id);fileRef.current?.click();}} className={`flex items-center gap-1 px-2 py-1 text-[12px] font-bold rounded-lg border transition-colors ${ans.evidence_url?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-slate-50 text-slate-500 border-[#E8EBF4] hover:border-blue-300'}`}>
                                {uploadingQId===q.id?<RefreshCw size={9} className="animate-spin"/>:<Camera size={9}/>}{ans.evidence_url?'Ver':'Evidencia'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Notas generales</label>
              <textarea value={activeEval.notes} onChange={e=>setActiveEval(ev=>ev?{...ev,notes:e.target.value}:ev)} rows={2} placeholder="Observaciones generales..." className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"/></div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E8EBF4]">
              <button type="button" onClick={()=>setActiveEval(null)} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Cancelar</button>
              <button type="button" onClick={saveEval} className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-sm transition-all">{editingId?'Guardar cambios':'Guardar evaluación'}</button>
            </div>
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f&&uploadingQId)uploadEvidence(uploadingQId,f);}}/>
    </div>
  );
}

// ── Página Principal ───────────────────────────────────────────
type Tab = 'resumen'|'inventario'|'normativa';
export default function RacksPage() {
  const router = useRouter();
  const highlightCode = typeof router.query.highlight === 'string' ? decodeURIComponent(router.query.highlight) : undefined;
  const [racks, setRacks] = useState<RackRecord[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('inventario');

  // Cargar racks del backend al montar
  useEffect(() => {
    axios.get('/api/infra/racks')
      .then(res => setRacks(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRacks([]));
  }, []);
  const [modal, setModal] = useState<{open:boolean;rack:Partial<RackRecord>|null}>({open:false,rack:null});
  const [showWizard, setShowWizard] = useState(false);
  const [wizardInitial, setWizardInitial] = useState<Partial<RackWizardData> | undefined>(undefined);

  // Limpiar query param después de procesar
  useEffect(() => {
    if (highlightCode) {
      const t = setTimeout(() => {
        const { highlight: _h, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
      }, 3200);
      return () => clearTimeout(t);
    }
  }, [highlightCode]);

  function handleSave(rack: RackRecord) {
    setRacks(prev=>{ const idx=prev.findIndex(r=>r.id===rack.id); return idx>=0?prev.map(r=>r.id===rack.id?rack:r):[rack,...prev]; });
    setModal({open:false,rack:null});
  }
  function handleDelete(id: string) { if (confirm('¿Eliminar este rack del inventario?')) setRacks(prev=>prev.filter(r=>r.id!==id)); }

  const TABS: {id:Tab;label:string;icon:React.ReactNode}[] = [
    {id:'resumen',label:'Resumen',icon:<BarChart2 size={13}/>},
    {id:'inventario',label:'Inventario',icon:<List size={13}/>},
    {id:'normativa',label:'Normativa',icon:<Award size={13}/>},
  ];

  return (
    <AppLayout>
      <Head><title>Racks — SKIA Platform</title></Head>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30 p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200"><Grid3x3 size={22} className="text-white"/></div>
            <div><h1 className="text-xl font-black text-slate-800 tracking-tight">Racks</h1><p className="text-sm text-[#5C6194] mt-0.5">Inventario y normativa de racks de telecomunicaciones</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-[#F0F2FA] border border-[#E8EBF4] rounded-xl hover:bg-slate-50 shadow-sm transition-colors"><Download size={13}/> Exportar</button>
            <button onClick={()=>{ setWizardInitial(undefined); setShowWizard(true); }} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl hover:from-blue-700 hover:to-indigo-700 shadow-sm shadow-blue-200 transition-all"><Plus size={13}/> Nuevo Rack</button>
          </div>
        </div>
        <div className="flex items-center gap-1 mb-6 bg-slate-100/80 backdrop-blur-sm rounded-2xl p-1 border border-[#E8EBF4] shadow-sm w-fit">
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)} className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all ${activeTab===t.id?'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm':'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {racks.length === 0 ? (
          <ModuleEmptyState
            icon={<Grid3x3 size={36} className="text-blue-600" />}
            title="Sin racks registrados"
            description="Los racks son el corazón de tu infraestructura de red. Registra cada rack con su ubicación, capacidad, tipo y estado para tener visibilidad total de tu espacio físico."
            features={[
              { icon: <Grid3x3 size={14}/>, text: 'Inventario con código único por rack' },
              { icon: <Shield size={14}/>, text: 'Evaluación de normativa TIA-606-C' },
              { icon: <BarChart2 size={14}/>, text: 'Control de capacidad (U libres/usadas)' },
              { icon: <MapPin size={14}/>, text: 'Referencia a planos y ubicación física' },
            ]}
            wizardLabel="Registrar primer Rack"
            onOpenWizard={() => { setWizardInitial(undefined); setShowWizard(true); }}
            accentColor="blue"
          />
        ) : (
          <>
            {activeTab==='resumen'&&<TabResumen racks={racks}/>}
            {activeTab==='inventario'&&<TabInventario racks={racks} onEdit={r=>setModal({open:true,rack:r})} onDelete={handleDelete} highlightCode={highlightCode}/>}
            {activeTab==='normativa'&&<TabNormativa racks={racks}/>}
          </>
        )}
      </div>
      {modal.open&&<RackModal rack={modal.rack} onClose={()=>setModal({open:false,rack:null})} onSave={handleSave}/> }
      {showWizard && (
        <RackWizard
          initial={wizardInitial}
          onClose={() => setShowWizard(false)}
          onSave={(data: RackWizardData) => {
            const newRack: RackRecord = {
              id: Date.now().toString(),
              code: data.code,
              brand: data.brand,
              model: data.model,
              height_u: data.height_u,
              type_posts: data.type_posts as any,
              rack_type: data.rack_type as any,
              status: data.status as any,
              location: data.location,
              floor_plan_ref: data.floor_plan_ref ?? '',
              photo_url: data.photo_url ?? '',
              ref_image_url: '',
              observations: data.observations ?? '',
              org_horizontal: data.org_horizontal ?? false,
              org_vertical: data.org_vertical ?? false,
              pdu: data.pdu ?? false,
              integrator: data.integrator ?? '',
              invoice_no: data.invoice_no ?? '',
              cost_usd: data.cost_usd ?? 0,
              po: data.po ?? '',
              cost_center: data.cost_center ?? '',
              rfid_tag: data.rfid_tag ?? '',
              install_year: data.install_year ?? new Date().getFullYear(),
              capacity_u: data.height_u,
              used_u: 0,
            };
            // Persistir en el backend
            axios.post('/api/infra/racks', {
              internal_code: '',
              name: data.name,
              location: data.location,
              total_u: data.height_u,
              status: data.status === 'Operativo' ? 'active' : data.status === 'Atención' ? 'maintenance' : 'inactive',
              manufacturer: data.brand,
              model: data.model,
              observations: data.observations ?? '',
            }).then(resp => {
              const saved = resp.data;
              setRacks(prev => [{ ...newRack, id: saved.id ?? newRack.id, code: saved.internal_code ?? newRack.code }, ...prev]);
            }).catch(() => undefined);
            setShowWizard(false);
          }}
        />
      )}
    </AppLayout>
  );
}
