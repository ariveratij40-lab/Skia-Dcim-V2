import PatchPanelWizard, { PatchPanelWizardData } from '../../components/PatchPanelWizard';
import axios from 'axios';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Plus, Search, ChevronRight, Edit2, Trash2, X, List,
  BarChart2, Award, FileText, Zap, Network, Shield,
  CheckCircle2, AlertTriangle, Clock, XCircle, Download,
  Camera, BookOpen, Wrench, DollarSign, Hash, MapPin,
  Tag, RefreshCw, ChevronDown, Layers, Calendar,
} from 'lucide-react';
import AppLayout from '../../components/AppLayout';
import ModuleEmptyState from '../../components/ModuleEmptyState';

// ── Tipos ──────────────────────────────────────────────────────
export type PPStatus = 'Activo' | 'Inactivo' | 'Baja';
export type PPType   = 'Angulado' | 'Plano' | 'Blindado' | 'Modular' | 'Keystone' | 'Fibra Óptica';

export interface PatchPanel {
  id: string;
  code: string;
  brand: string;
  model: string;
  serial: string;
  type: PPType;
  status: PPStatus;
  location: string;
  floor_plan_ref: string;
  photo_url: string;
  observations: string;
  ports_total: number;
  ports_free: number;
  rfid_tag: string;
  purchase_date: string;
  install_year: number;
  invoice_no: string;
  cost_usd: number;
  supplier: string;
  sla_contract: string;
  cost_center: string;
}

// ── Mock Data ──────────────────────────────────────────────────
const MOCK_PP: PatchPanel[] = [
  { id:'1', code:'PP-IDF2-A0001', brand:'Panduit', model:'CPP48WBLY', serial:'PAN-001', type:'Angulado', status:'Activo', location:'IDF2 Área de Producción', floor_plan_ref:'Plano IDF2 Prod', photo_url:'', observations:'Patch panel 48 puertos Cat6A angulado. Todos los puertos documentados.', ports_total:48, ports_free:12, rfid_tag:'RFID-PP-001', purchase_date:'2024-01-15', install_year:2024, invoice_no:'F-2024-0100', cost_usd:320, supplier:'IAMET', sla_contract:'SLA-2024-001', cost_center:'TI-001' },
  { id:'2', code:'PP-MDF-A0001', brand:'Commscope', model:'1100GS3', serial:'CS-002', type:'Plano', status:'Activo', location:'MDF Principal Torre A', floor_plan_ref:'Plano MDF-A S1', photo_url:'', observations:'Patch panel 24 puertos Cat6 plano. Rack principal.', ports_total:24, ports_free:4, rfid_tag:'RFID-PP-002', purchase_date:'2023-06-10', install_year:2023, invoice_no:'F-2023-0512', cost_usd:185, supplier:'Bajanet', sla_contract:'', cost_center:'TI-001' },
  { id:'3', code:'PP-IDF3-A0001', brand:'Leviton', model:'5G702-U48', serial:'LEV-003', type:'Keystone', status:'Activo', location:'IDF3 Piso 5 Torre A', floor_plan_ref:'Plano A-P5-IDF3', photo_url:'', observations:'Patch panel keystone 48 puertos. Algunos puertos sin etiquetar.', ports_total:48, ports_free:20, rfid_tag:'', purchase_date:'2024-03-20', install_year:2024, invoice_no:'F-2024-0215', cost_usd:290, supplier:'IAMET', sla_contract:'', cost_center:'TI-002' },
  { id:'4', code:'PP-DC-001', brand:'Panduit', model:'NKFP12RSBLY', serial:'PAN-004', type:'Fibra Óptica', status:'Activo', location:'Datacenter Principal', floor_plan_ref:'Plano DC-P1-FO', photo_url:'', observations:'Panel de fibra óptica 12 puertos LC dúplex. Conexiones al backbone.', ports_total:12, ports_free:2, rfid_tag:'RFID-PP-004', purchase_date:'2021-09-01', install_year:2021, invoice_no:'F-2021-0001', cost_usd:650, supplier:'Dell Technologies', sla_contract:'SLA-DC-001', cost_center:'DC-001' },
  { id:'5', code:'PP-IDF2-A0002', brand:'AMP Netconnect', model:'1711000-2', serial:'AMP-005', type:'Blindado', status:'Inactivo', location:'IDF2 Área de Producción', floor_plan_ref:'Plano IDF2 Prod', photo_url:'', observations:'Panel blindado Cat6A. Fuera de servicio por migración a Cat7.', ports_total:24, ports_free:24, rfid_tag:'', purchase_date:'2019-04-12', install_year:2019, invoice_no:'F-2019-0340', cost_usd:420, supplier:'Bajanet', sla_contract:'', cost_center:'TI-001' },
  { id:'6', code:'PP-ALM-N0001', brand:'Belden', model:'AX101188', serial:'BLD-006', type:'Modular', status:'Activo', location:'Almacén Norte', floor_plan_ref:'Plano ALM-N-PB', photo_url:'', observations:'Panel modular 24 puertos. Instalación reciente.', ports_total:24, ports_free:18, rfid_tag:'RFID-PP-006', purchase_date:'2026-01-10', install_year:2026, invoice_no:'F-2026-0010', cost_usd:210, supplier:'IAMET', sla_contract:'', cost_center:'TI-003' },
  { id:'7', code:'PP-MDF-B0001', brand:'Panduit', model:'CPP48WBLY', serial:'PAN-007', type:'Angulado', status:'Baja', location:'MDF Torre B', floor_plan_ref:'', photo_url:'', observations:'Dado de baja por daño físico. Pendiente retiro.', ports_total:48, ports_free:48, rfid_tag:'', purchase_date:'2018-11-05', install_year:2018, invoice_no:'F-2018-0890', cost_usd:280, supplier:'Bajanet', sla_contract:'', cost_center:'TI-002' },
];

// ── Config visual ──────────────────────────────────────────────
const STATUS_CONFIG: Record<PPStatus, { pill:string; dot:string }> = {
  'Activo':   { pill:'bg-emerald-100 text-emerald-700 border border-emerald-200', dot:'bg-emerald-500' },
  'Inactivo': { pill:'bg-amber-100 text-amber-700 border border-amber-200',       dot:'bg-amber-400' },
  'Baja':     { pill:'bg-red-100 text-red-700 border border-red-200',             dot:'bg-red-500' },
};

const TYPE_CONFIG: Record<PPType, { bg:string; color:string }> = {
  'Angulado':      { bg:'bg-blue-50 border-blue-200',    color:'text-blue-700' },
  'Plano':         { bg:'bg-[#F8F9FE] border-[#E8EBF4]',  color:'text-slate-700' },
  'Blindado':      { bg:'bg-violet-50 border-violet-200',color:'text-violet-700' },
  'Modular':       { bg:'bg-teal-50 border-teal-200',    color:'text-teal-700' },
  'Keystone':      { bg:'bg-orange-50 border-orange-200',color:'text-orange-700' },
  'Fibra Óptica':  { bg:'bg-cyan-50 border-cyan-200',    color:'text-cyan-700' },
};

const PP_TYPES: PPType[]     = ['Angulado','Plano','Blindado','Modular','Keystone','Fibra Óptica'];
const PP_STATUSES: PPStatus[] = ['Activo','Inactivo','Baja'];

function usagePct(pp: PatchPanel) {
  return pp.ports_total > 0 ? Math.round(((pp.ports_total - pp.ports_free) / pp.ports_total) * 100) : 0;
}

function yearsInUse(pp: PatchPanel) {
  if (!pp.install_year) return '—';
  const diff = new Date().getFullYear() - pp.install_year;
  return diff <= 0 ? 'Nuevo' : `${diff} año${diff !== 1 ? 's' : ''}`;
}

// ── ImageUploader ──────────────────────────────────────────────
function ImageUploader({ label, value, onChange, onClear }: { label:string; value:string; onChange:(u:string)=>void; onClear:()=>void; }) {
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
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
        {value && !busy && <button type="button" onClick={onClear} className="text-[12px] text-red-400 hover:text-red-600 font-semibold flex items-center gap-1"><Trash2 size={9}/> Eliminar</button>}
      </div>
      {err && <p className="text-[12px] text-red-500 mb-1">⚠ {err}</p>}
      {busy ? (
        <div className="flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
          <p className="text-[13px] text-blue-500">Subiendo...</p>
        </div>
      ) : value ? (
        <div className="relative group rounded-xl overflow-hidden border border-[#E8EBF4]">
          <img src={value} alt={label} className="w-full h-28 object-cover"/>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <button type="button" onClick={()=>ref.current?.click()} className="px-3 py-1.5 bg-white/90 rounded-xl text-[13px] font-bold text-slate-700 shadow-sm flex items-center gap-1.5"><Camera size={11}/> Cambiar</button>
          </div>
        </div>
      ) : (
        <div onClick={()=>ref.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)upload(f);}}
          className={`flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed cursor-pointer transition-all ${drag?'border-blue-400 bg-blue-50/60':'border-[#E8EBF4] bg-slate-50/80 hover:border-blue-300 hover:bg-blue-50/30'}`}>
          <Camera size={16} className="text-[#5C6194]"/>
          <p className="text-[13px] font-semibold text-slate-500">{drag?'Suelta aquí':'Clic o arrastra'}</p>
          <p className="text-[12px] text-[#5C6194]">JPG, PNG — máx. 10 MB</p>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)upload(f);}}/>
    </div>
  );
}

// ── Modal Crear/Editar ─────────────────────────────────────────
const EMPTY: Partial<PatchPanel> = {
  code:'', brand:'', model:'', serial:'', type:'Angulado', status:'Activo',
  location:'', floor_plan_ref:'', photo_url:'', observations:'',
  ports_total:24, ports_free:0, rfid_tag:'', purchase_date:'',
  install_year:new Date().getFullYear(), invoice_no:'', cost_usd:0,
  supplier:'', sla_contract:'', cost_center:'',
};

function PPModal({ pp, onClose, onSave }: { pp:Partial<PatchPanel>|null; onClose:()=>void; onSave:(p:PatchPanel)=>void; }) {
  const [form, setForm] = useState<Partial<PatchPanel>>(pp ? {...pp} : {...EMPTY});
  const isEdit = !!(pp?.id);
  const set = (k: keyof PatchPanel, v: unknown) => setForm(f=>({...f,[k]:v}));
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code?.trim()) return;
    onSave({ ...EMPTY, ...form, id: form.id||String(Date.now()) } as PatchPanel);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#F0F2FA] border-b border-[#E8EBF4] rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center"><Layers size={16} className="text-white"/></div>
            <div><h2 className="text-sm font-black text-[#1A1D2E]">{isEdit?'Editar Patch Panel':'Nuevo Patch Panel'}</h2><p className="text-[13px] text-[#5C6194]">{isEdit?`Modificando ${pp?.code}`:'Completa los campos'}</p></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X size={14} className="text-slate-500"/></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-6">
          {/* Identificación */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Hash size={10}/> Identificación</h3>
            <div className="grid grid-cols-2 gap-3">
              {[{k:'code',l:'Código *',p:'PP-IDF2-A0001',mono:true},{k:'brand',l:'Marca',p:'Panduit, Commscope...'},{k:'model',l:'Modelo',p:'CPP48WBLY...'},{k:'serial',l:'Serie',p:'SN-001'}].map(({k,l,p,mono})=>(
                <div key={k}><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">{l}</label>
                  <input value={(form[k as keyof PatchPanel] as string)||''} onChange={e=>set(k as keyof PatchPanel,e.target.value)} placeholder={p} required={k==='code'}
                    className={`w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 ${mono?'font-mono':''}`}/></div>
              ))}
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tipo</label>
                <select value={form.type||'Angulado'} onChange={e=>set('type',e.target.value as PPType)} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400">{PP_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Estado</label>
                <select value={form.status||'Activo'} onChange={e=>set('status',e.target.value as PPStatus)} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400">{PP_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
            </div>
          </div>
          {/* Ubicación */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><MapPin size={10}/> Ubicación</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Ubicación</label>
                <input value={form.location||''} onChange={e=>set('location',e.target.value)} placeholder="IDF2 Área de Producción" className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"/></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Ubicación en Plano</label>
                <input value={form.floor_plan_ref||''} onChange={e=>set('floor_plan_ref',e.target.value)} placeholder="Plano IDF2 Prod" className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"/></div>
            </div>
          </div>
          {/* Puertos */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Network size={10}/> Puertos</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total de Puertos</label>
                <input type="number" min={1} value={form.ports_total||24} onChange={e=>set('ports_total',Number(e.target.value))} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"/></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Puertos Libres</label>
                <input type="number" min={0} value={form.ports_free||0} onChange={e=>set('ports_free',Number(e.target.value))} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"/></div>
            </div>
          </div>
          {/* Datos Comerciales */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><DollarSign size={10}/> Datos Comerciales</h3>
            <div className="grid grid-cols-2 gap-3">
              {[{k:'rfid_tag',l:'Etiqueta RFID',p:'RFID-PP-001',mono:true},{k:'invoice_no',l:'No. Factura',p:'F-2024-0001',mono:true},{k:'supplier',l:'Proveedor',p:'IAMET, Bajanet...'},{k:'sla_contract',l:'Contrato SLA',p:'SLA-2024-001'},{k:'cost_center',l:'Centro de Costos',p:'TI-001'}].map(({k,l,p,mono})=>(
                <div key={k}><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">{l}</label>
                  <input value={(form[k as keyof PatchPanel] as string)||''} onChange={e=>set(k as keyof PatchPanel,e.target.value)} placeholder={p}
                    className={`w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 ${mono?'font-mono':''}`}/></div>
              ))}
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Costo (USD)</label>
                <input type="number" min={0} step={0.01} value={form.cost_usd||0} onChange={e=>set('cost_usd',Number(e.target.value))} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"/></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha de Compra</label>
                <input type="date" value={form.purchase_date||''} onChange={e=>set('purchase_date',e.target.value)} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"/></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Año de Instalación</label>
                <input type="number" min={2000} max={2099} value={form.install_year||new Date().getFullYear()} onChange={e=>set('install_year',Number(e.target.value))} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"/></div>
            </div>
          </div>
          {/* Foto */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Camera size={10}/> Foto</h3>
            <ImageUploader label="Foto del Patch Panel" value={form.photo_url||''} onChange={v=>set('photo_url',v)} onClear={()=>set('photo_url','')}/>
          </div>
          {/* Observaciones */}
          <div>
            <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><FileText size={10}/> Observaciones</h3>
            <textarea value={form.observations||''} onChange={e=>set('observations',e.target.value)} rows={3} placeholder="Notas técnicas, pendientes, condiciones especiales..." className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"/>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E8EBF4]">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Cancelar</button>
            <button type="submit" className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 rounded-xl shadow-sm transition-all">{isEdit?'Guardar cambios':'Crear Patch Panel'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tab Resumen ────────────────────────────────────────────────
function TabResumen({ pps }: { pps: PatchPanel[] }) {
  const total = pps.length;
  const totalPorts = pps.reduce((s,p)=>s+p.ports_total,0);
  const freePorts  = pps.reduce((s,p)=>s+p.ports_free,0);
  const usedPorts  = totalPorts - freePorts;
  const usedPct    = totalPorts>0?Math.round((usedPorts/totalPorts)*100):0;
  const totalCost  = pps.reduce((s,p)=>s+(p.cost_usd||0),0);
  const KPI = ({icon,label,value,sub,color}:{icon:React.ReactNode;label:string;value:string|number;sub?:string;color:string}) => (
    <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>{icon}</div>
      <div><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">{label}</p><p className="text-xl font-black text-slate-800 leading-tight">{value}</p>{sub&&<p className="text-[13px] text-[#5C6194] mt-0.5">{sub}</p>}</div>
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI icon={<Layers size={18} className="text-teal-600"/>} label="Total Patch Panels" value={total} sub={`${pps.filter(p=>p.status==='Activo').length} activos`} color="bg-teal-50"/>
        <KPI icon={<Network size={18} className="text-blue-600"/>} label="Puertos Totales" value={totalPorts} sub={`${freePorts} libres`} color="bg-blue-50"/>
        <KPI icon={<BarChart2 size={18} className="text-violet-600"/>} label="Uso Global" value={`${usedPct}%`} sub={`${usedPorts} ocupados`} color="bg-violet-50"/>
        <KPI icon={<DollarSign size={18} className="text-emerald-600"/>} label="Inversión Total" value={`$${totalCost.toLocaleString()}`} sub="USD" color="bg-emerald-50"/>
      </div>
      <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm p-5">
        <h3 className="text-xs font-black text-slate-700 mb-4 flex items-center gap-2"><Network size={14} className="text-teal-500"/> Uso de Puertos Global</h3>
        <div className="flex items-center gap-4 mb-3">
          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${usedPct>=85?'bg-red-500':usedPct>=70?'bg-amber-400':'bg-teal-400'}`} style={{width:`${usedPct}%`}}/>
          </div>
          <span className={`text-sm font-black ${usedPct>=85?'text-red-600':usedPct>=70?'text-amber-600':'text-teal-600'}`}>{usedPct}%</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-slate-50 rounded-xl"><p className="text-lg font-black text-[#1A1D2E]">{totalPorts}</p><p className="text-[12px] text-[#5C6194] uppercase tracking-widest">Total puertos</p></div>
          <div className="p-3 bg-teal-50 rounded-xl"><p className="text-lg font-black text-teal-700">{usedPorts}</p><p className="text-[12px] text-teal-400 uppercase tracking-widest">Ocupados</p></div>
          <div className="p-3 bg-emerald-50 rounded-xl"><p className="text-lg font-black text-emerald-700">{freePorts}</p><p className="text-[12px] text-emerald-400 uppercase tracking-widest">Libres</p></div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm p-5">
          <h3 className="text-xs font-black text-slate-700 mb-4 flex items-center gap-2"><Layers size={14} className="text-blue-500"/> Por Tipo</h3>
          <div className="space-y-2">
            {PP_TYPES.filter(t=>pps.some(p=>p.type===t)).map(t=>{
              const ps=pps.filter(p=>p.type===t);
              const cfg=TYPE_CONFIG[t];
              return (
                <div key={t} className="flex items-center gap-3">
                  <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} w-28 text-center flex-shrink-0`}>{t}</span>
                  <span className="text-[13px] font-bold text-slate-500 w-4 text-right">{ps.length}</span>
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-teal-400 rounded-full" style={{width:`${(ps.length/total)*100}%`}}/></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm p-5">
          <h3 className="text-xs font-black text-slate-700 mb-4 flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500"/> Por Estado</h3>
          <div className="space-y-3">
            {PP_STATUSES.map(s=>{
              const cnt=pps.filter(p=>p.status===s).length;
              const cfg=STATUS_CONFIG[s];
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1 text-[12px] font-bold px-2 py-0.5 rounded-full border ${cfg.pill} w-20 justify-center flex-shrink-0`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>{s}</span>
                  <span className="text-sm font-black text-[#1A1D2E]">{cnt}</span>
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${cfg.dot}`} style={{width:`${total>0?(cnt/total)*100:0}%`}}/></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab Inventario ─────────────────────────────────────────────
function TabInventario({ pps, onEdit, onDelete, highlightCode }: { pps:PatchPanel[]; onEdit:(p:PatchPanel)=>void; onDelete:(id:string)=>void; highlightCode?:string; }) {
  const [search, setSearch] = useState(highlightCode||'');
  const [fType, setFType]   = useState<PPType|'Todos'>('Todos');
  const [fStatus, setFStatus] = useState<PPStatus|'Todos'>('Todos');
  const [expandedId, setExpandedId] = useState<string|null>(null);
  const [highlightedId, setHighlightedId] = useState<string|null>(null);
  const rowRefs = useRef<Record<string,HTMLDivElement|null>>({});
  const didHL = useRef(false);

  useEffect(() => {
    if (!highlightCode || didHL.current) return;
    setSearch(highlightCode);
    const t = setTimeout(() => {
      const match = pps.find(p =>
        p.code === highlightCode || p.code.toLowerCase().includes(highlightCode.toLowerCase())
      );
      if (!match) return;
      setHighlightedId(match.id);
      setExpandedId(match.id);
      didHL.current = true;
      const el = rowRefs.current[match.id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setHighlightedId(null), 2500);
    }, 300);
    return () => clearTimeout(t);
  }, [highlightCode, pps]);

  const filtered = useMemo(()=>pps.filter(p=>{
    const q=search.toLowerCase();
    return (!q||[p.code,p.brand,p.model,p.serial,p.location,p.rfid_tag,p.supplier].some(v=>v.toLowerCase().includes(q)))
      &&(fType==='Todos'||p.type===fType)
      &&(fStatus==='Todos'||p.status===fStatus);
  }),[pps,search,fType,fStatus]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por código, marca, serie, RFID, proveedor..." className="w-full pl-8 pr-3 py-2 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 shadow-sm"/>
        </div>
        <select value={fType} onChange={e=>setFType(e.target.value as PPType|'Todos')} className="px-3 py-2 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 shadow-sm">
          <option value="Todos">Todos los tipos</option>{PP_TYPES.map(t=><option key={t}>{t}</option>)}
        </select>
        <select value={fStatus} onChange={e=>setFStatus(e.target.value as PPStatus|'Todos')} className="px-3 py-2 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 shadow-sm">
          <option value="Todos">Todos los estados</option>{PP_STATUSES.map(s=><option key={s}>{s}</option>)}
        </select>
        <span className="text-[13px] text-[#5C6194] font-medium">{filtered.length} panel{filtered.length!==1?'es':''}</span>
      </div>
      <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr_5rem_1fr_1fr_6rem_5rem] gap-2 px-4 py-2.5 bg-[#F8F9FE] border-b border-[#E8EBF4] text-[12px] font-black text-slate-500 uppercase tracking-widest">
          <span/><span>Código</span><span>Marca / Modelo</span><span>Tipo</span><span>Puertos</span><span>Ubicación</span><span>Tiempo de Uso</span><span>Estado</span><span className="text-right">Acciones</span>
        </div>
        {filtered.length===0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center"><Layers size={20} className="text-[#5C6194]"/></div>
            <p className="text-sm font-bold text-slate-500">No se encontraron patch panels</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(p=>{
              const sc=STATUS_CONFIG[p.status], tc=TYPE_CONFIG[p.type], pct=usagePct(p), isExp=expandedId===p.id;
              const isHL = highlightedId === p.id;
              return (
                <div key={p.id} ref={el=>{ rowRefs.current[p.id]=el as HTMLDivElement|null; }} className={isHL?'skia-highlight-row':''}>
                  <div onClick={()=>setExpandedId(isExp?null:p.id)} className={`grid grid-cols-[1.5rem_1fr_1fr_1fr_5rem_1fr_1fr_6rem_5rem] gap-2 px-4 py-3 items-center cursor-pointer transition-colors ${isExp?'bg-teal-50 border-l-4 border-l-teal-500':'hover:bg-slate-50/80 border-l-4 border-l-transparent'}`}>
                    <span className="text-[#5C6194] transition-transform duration-200" style={{transform:isExp?'rotate(90deg)':'rotate(0deg)'}}><ChevronRight size={14}/></span>
                    <div>
                      <p className="text-xs font-mono font-bold text-teal-700">{p.code}</p>
                      {p.rfid_tag&&<p className="text-[12px] text-indigo-400 flex items-center gap-0.5 mt-0.5"><Tag size={9}/>{p.rfid_tag}</p>}
                    </div>
                    <div><p className="text-xs font-semibold text-slate-800">{p.brand}</p><p className="text-[13px] text-[#5C6194]">{p.model}</p></div>
                    <div><span className={`inline-block text-[12px] font-bold px-2 py-0.5 rounded-full border ${tc.bg} ${tc.color}`}>{p.type}</span></div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct>=85?'bg-red-400':pct>=70?'bg-amber-400':'bg-teal-400'}`} style={{width:`${pct}%`}}/></div>
                        <span className={`text-[12px] font-bold ${pct>=85?'text-red-600':pct>=70?'text-amber-600':'text-teal-600'}`}>{pct}%</span>
                      </div>
                      <p className="text-[12px] text-[#5C6194] mt-0.5">{p.ports_total-p.ports_free}/{p.ports_total}</p>
                    </div>
                    <div><p className="text-xs text-slate-700 font-medium">{p.location||'—'}</p>{p.floor_plan_ref&&<p className="text-[12px] text-[#5C6194] mt-0.5">{p.floor_plan_ref}</p>}</div>
                    <div>
                      <p className="text-xs font-semibold text-[#1A1D2E]">{yearsInUse(p)}</p>
                      {p.install_year&&<p className="text-[12px] text-[#5C6194]">Inst. {p.install_year}</p>}
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold border ${sc.pill}`}><span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}/>{p.status}</span>
                    <div className="flex items-center justify-end gap-1" onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>onEdit(p)} className="w-7 h-7 rounded-lg bg-teal-50 hover:bg-teal-100 flex items-center justify-center transition-colors" title="Editar"><Edit2 size={11} className="text-teal-600"/></button>
                      <button onClick={()=>onDelete(p.id)} className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors" title="Eliminar"><Trash2 size={11} className="text-red-500"/></button>
                    </div>
                  </div>
                  {isExp&&(
                    <div className="bg-gradient-to-br from-teal-50/60 to-cyan-50/40 border-t border-teal-100/60 px-6 py-5">
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                        {[{l:'Código',v:p.code,mono:true},{l:'Marca',v:p.brand},{l:'Modelo',v:p.model},{l:'Serie',v:p.serial||'—',mono:true},{l:'Tipo',v:p.type},{l:'Estado',v:p.status}].map(({l,v,mono})=>(
                          <div key={l}><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">{l}</p><p className={`text-xs font-semibold text-slate-800 mt-0.5 ${mono?'font-mono text-teal-700':''}`}>{v}</p></div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                        {[{l:'Ubicación',v:p.location||'—'},{l:'Ref. en Plano',v:p.floor_plan_ref||'—'},{l:'RFID',v:p.rfid_tag||'—',mono:true},{l:'Proveedor',v:p.supplier||'—'},{l:'No. Factura',v:p.invoice_no||'—',mono:true},{l:'Contrato SLA',v:p.sla_contract||'—'}].map(({l,v,mono})=>(
                          <div key={l}><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">{l}</p><p className={`text-xs font-semibold text-slate-800 mt-0.5 ${mono?'font-mono text-indigo-600':''}`}>{v}</p></div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                        {[{l:'Puertos Total',v:String(p.ports_total)},{l:'Puertos Libres',v:String(p.ports_free)},{l:'Puertos Usados',v:String(p.ports_total-p.ports_free)},{l:'Costo USD',v:p.cost_usd?`$${p.cost_usd.toLocaleString()}`:'—'},{l:'Centro de Costos',v:p.cost_center||'—'},{l:'Fecha de Compra',v:p.purchase_date||'—'}].map(({l,v})=>(
                          <div key={l}><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">{l}</p><p className="text-xs font-semibold text-slate-800 mt-0.5">{v}</p></div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Año de Instalación</p><p className="text-xs font-semibold text-slate-800 mt-0.5">{p.install_year||'—'}</p></div>
                        <div><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Tiempo de Uso</p><p className="text-xs font-semibold text-slate-800 mt-0.5">{yearsInUse(p)}</p></div>
                      </div>
                      {p.observations&&<div className="mb-4"><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Observaciones</p><p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{p.observations}</p></div>}
                      {p.photo_url&&<div className="mb-4"><p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-2">Foto</p><img src={p.photo_url} alt="Foto" className="h-28 rounded-xl border border-[#E8EBF4] object-cover"/></div>}
                      <div className="flex items-center gap-2 pt-3 border-t border-teal-100/60">
                        <button onClick={()=>onEdit(p)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"><Edit2 size={11}/> Editar</button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#F0F2FA] border border-[#E8EBF4] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"><Wrench size={11}/> Mantenimiento</button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#F0F2FA] border border-[#E8EBF4] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"><FileText size={11}/> Ficha Técnica</button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#F0F2FA] border border-[#E8EBF4] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"><Download size={11}/> Exportar</button>
                        <button onClick={()=>onDelete(p.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors ml-auto"><Trash2 size={11}/> Eliminar</button>
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
type CertNorm = 'ANSI/TIA-568.2-D'|'ANSI/TIA-606-C'|'ANSI/TIA-569-D'|'ISO/IEC 11801'|'Evaluación interna SKIA';
interface PCQ { id:string; category:string; question:string; norm_ref:string; criticality:'baja'|'media'|'alta'|'critica'; hint:string; }
interface PCA { question_id:string; answer:CertAnswer; observation:string; evidence_url:string; }
interface PCE { id:string; pp_id:string; pp_code:string; standard:CertNorm; evaluator:string; eval_date:string; answers:PCA[]; overall_pct:number|null; badge:'Certificable'|'Encaminado'|'Crítico'; notes:string; }

const CERT_CATS = ['Instalación física','Etiquetado y documentación','Conectividad y pruebas','Gestión de cables','Seguridad y acceso'];
const CERT_QS: PCQ[] = [
  {id:'if-1',category:'Instalación física',question:'¿El patch panel está correctamente montado y nivelado en el rack?',norm_ref:'TIA-569-D §7.2',criticality:'alta',hint:'El panel debe estar fijado con todos sus tornillos en los orificios de la unidad de rack (U). Un montaje incorrecto genera estrés mecánico en los conectores y puede causar fallas intermitentes. Verificar que no haya espacio entre el panel y los rieles del rack.'},
  {id:'if-2',category:'Instalación física',question:'¿Se respeta el radio de curvatura mínimo en todos los cables de patch?',norm_ref:'TIA-568.2-D §6.3',criticality:'alta',hint:'TIA-568.2-D establece un radio de curvatura mínimo de 4× el diámetro exterior del cable (≈25 mm para Cat6A). Curvaturas menores deforman los pares trenzados, degradan el NEXT y pueden causar fallas en la normativa de canal.'},
  {id:'if-3',category:'Instalación física',question:'¿El patch panel está libre de daños físicos (puertos rotos, clips faltantes)?',norm_ref:'TIA-568.2-D §6.1',criticality:'media',hint:'Los puertos con clips de retención rotos no aseguran correctamente los conectores RJ-45, provocando micro-interrupciones y pérdida de inserción elevada. Los puertos dañados deben reemplazarse o bloquearse con tapones y documentarse.'},
  {id:'if-4',category:'Instalación física',question:'¿Existe organizador de cables (horizontal o vertical) adyacente al patch panel?',norm_ref:'TIA-568.2-D §6.5',criticality:'alta',hint:'TIA-568.2-D recomienda instalar un organizador de 1U por cada 2U de patch panel. Sin organizador, los patch cords cuelgan libremente, generan tensión sobre los puertos y dificultan el mantenimiento. El organizador debe tener anillos o peines para guiar los cables sin forzarlos.'},
  {id:'if-5',category:'Instalación física',question:'¿El patch panel está conectado a tierra (bonding) correctamente?',norm_ref:'TIA-607-C §5.1',criticality:'critica',hint:'TIA-607-C exige que todos los componentes metálicos del rack estén conectados al sistema de puesta a tierra (TMGB/TGB) mediante conductor de cobre desnudo calibre mínimo AWG 6. La falta de tierra puede causar daños por ESD en equipos activos y representa un riesgo eléctrico.'},
  {id:'ed-1',category:'Etiquetado y documentación',question:'¿Todos los puertos del patch panel están etiquetados con identificador único?',norm_ref:'TIA-606-C §5.2',criticality:'alta',hint:'TIA-606-C requiere un identificador único por puerto compuesto por: identificador de espacio (edificio-piso-cuarto), identificador de hardware y número de puerto. Ej: A1-IDF2-PP01-P24. Las etiquetas deben ser visibles sin desconectar los patch cords.'},
  {id:'ed-2',category:'Etiquetado y documentación',question:'¿Existe diagrama de conexiones (port mapping) actualizado?',norm_ref:'TIA-606-C §6.1',criticality:'alta',hint:'El port mapping debe indicar: número de puerto, identificador del cable horizontal, ubicación del outlet en el área de trabajo y equipo activo conectado. Debe actualizarse dentro de las 24 horas posteriores a cualquier cambio (MAC — Moves, Adds, Changes).'},
  {id:'ed-3',category:'Etiquetado y documentación',question:'¿Las etiquetas son legibles y resistentes (no papel adhesivo simple)?',norm_ref:'TIA-606-C §5.3',criticality:'media',hint:'TIA-606-C especifica etiquetas impresas (no manuscritas), resistentes a abrasión y humedad. Se recomienda impresoras con cintas de poliéster o vinilo. Las etiquetas de papel adhesivo se deterioran en 6-12 meses con variaciones de temperatura.'},
  {id:'ed-4',category:'Etiquetado y documentación',question:'¿Existe registro de cambios (moves, adds, changes) actualizado?',norm_ref:'TIA-606-C §4.3',criticality:'media',hint:'El registro de MACs debe incluir: fecha, técnico responsable, descripción del cambio, puertos afectados y motivo. TIA-606-C recomienda mantener historial mínimo de 2 años. Es fundamental para diagnóstico de fallas y auditorías de seguridad.'},
  {id:'ed-5',category:'Etiquetado y documentación',question:'¿Los certificados de prueba de cada enlace están archivados y disponibles?',norm_ref:'TIA-568.2-D §10',criticality:'alta',hint:'Cada enlace permanente debe tener su reporte de normativa con: modelo del equipo de prueba, fecha de calibración, estándar aplicado, resultado PASS/FAIL y valores medidos (NEXT, IL, RL, PS-NEXT, PS-ACRF). Los archivos deben estar en formato .flw o .pdf y respaldados.'},
  {id:'cp-1',category:'Conectividad y pruebas',question:'¿Todos los puertos activos han sido certificados con equipo de prueba?',norm_ref:'TIA-568.2-D §10.1',criticality:'critica',hint:'TIA-568.2-D §10.1 exige normativa 100% de todos los enlaces permanentes con certificador de campo (Fluke DSX, Ideal SignalTEK, etc.) calibrado. La normativa debe realizarse en modo "Permanent Link" con adaptadores específicos para la categoría. Puertos sin certificar no pueden considerarse conformes.'},
  {id:'cp-2',category:'Conectividad y pruebas',question:'¿Los resultados de normativa cumplen con la categoría especificada (Cat6, Cat6A, etc.)?',norm_ref:'TIA-568.2-D §10.2',criticality:'critica',hint:'Verificar que todos los parámetros estén en PASS: Insertion Loss (IL), NEXT, PS-NEXT, ACRF, PS-ACRF, Return Loss (RL) y longitud. Para Cat6A se requieren pruebas hasta 500 MHz. Un solo parámetro en FAIL invalida el enlace para aplicaciones 10GBase-T.'},
  {id:'cp-3',category:'Conectividad y pruebas',question:'¿Los patch cords utilizados son de la misma categoría o superior al cableado permanente?',norm_ref:'TIA-568.2-D §6.4',criticality:'alta',hint:'Usar patch cords de categoría inferior al cableado permanente degrada el rendimiento del canal completo. Un patch cord Cat5e en un sistema Cat6A limita el canal a Cat5e. Los patch cords deben ser de fábrica (no armados en campo) y certificados por el fabricante.'},
  {id:'cp-4',category:'Conectividad y pruebas',question:'¿No existen puertos con falla de continuidad o cruce de pares?',norm_ref:'TIA-568.2-D §10.3',criticality:'critica',hint:'Los cruces de pares (split pairs) no son detectables con un simple verificador de continuidad — requieren certificador de campo. Un split pair en Cat6A puede pasar continuidad pero fallar NEXT por más de 20 dB, haciendo el enlace inutilizable para Gigabit Ethernet.'},
  {id:'cp-5',category:'Conectividad y pruebas',question:'¿La longitud de los patch cords no excede los 5 metros?',norm_ref:'TIA-568.2-D §6.4',criticality:'media',hint:'TIA-568.2-D §6.4 establece que la suma de patch cords en área de trabajo y cuarto de telecomunicaciones no debe exceder 10 metros, con máximo 5 metros por extremo. Patch cords más largos aumentan la pérdida de inserción del canal y pueden causar falla en la normativa de canal de 100 metros.'},
  {id:'gc-1',category:'Gestión de cables',question:'¿Los patch cords están organizados y no generan tensión sobre los puertos?',norm_ref:'TIA-568.2-D §6.5',criticality:'alta',hint:'La tensión mecánica sobre los puertos RJ-45 es causa frecuente de fallas intermitentes. Los patch cords deben tener suficiente holgura (al menos 15 cm de radio libre) y estar guiados por el organizador sin tirones. Verificar que al abrir la puerta del rack no se jalen los cables.'},
  {id:'gc-2',category:'Gestión de cables',question:'¿Los cables de datos y de poder están separados físicamente?',norm_ref:'TIA-569-D §8.2',criticality:'alta',hint:'TIA-569-D §8.2 establece separaciones mínimas: 50 mm para cables sin apantallamiento cerca de circuitos de 120V, 100 mm cerca de circuitos de 208-480V. La interferencia electromagnética (EMI) de cables de poder puede degradar el SNR y causar errores de bit en enlaces de alta velocidad.'},
  {id:'gc-3',category:'Gestión de cables',question:'¿Los puertos no utilizados tienen tapones de protección instalados?',norm_ref:'TIA-568.2-D §6.1',criticality:'baja',hint:'Los tapones de puerto (dust caps) protegen los contactos RJ-45 del polvo y la oxidación, que aumentan la resistencia de contacto con el tiempo. En ambientes industriales o con alta humedad, su ausencia puede causar fallas de conectividad en 12-24 meses.'},
  {id:'gc-4',category:'Gestión de cables',question:'¿Existe velcro o abrazaderas para sujetar los patch cords al organizador?',norm_ref:'TIA-568.2-D §6.5',criticality:'media',hint:'Se recomienda usar velcro (no bridas de plástico) para agrupar los patch cords. Las bridas apretadas pueden comprimir los cables y degradar el NEXT. Los grupos no deben exceder 24 cables. El velcro permite reconfiguración sin herramientas y sin riesgo de daño al cable.'},
  {id:'gc-5',category:'Gestión de cables',question:'¿Los colores de los patch cords siguen un código de colores documentado?',norm_ref:'TIA-606-C §5.4',criticality:'baja',hint:'TIA-606-C §5.4 recomienda: azul=datos, rojo=voz, amarillo=administración de red, verde=conexiones de red, naranja=cableado horizontal genérico. El código debe estar documentado y publicado en el cuarto de telecomunicaciones. Facilita identificación rápida y reduce errores en MACs.'},
  {id:'sa-1',category:'Seguridad y acceso',question:'¿El rack que contiene el patch panel tiene control de acceso?',norm_ref:'TIA-942-C §9.1',criticality:'alta',hint:'TIA-942-C §9.1 requiere que todos los racks en cuartos de telecomunicaciones tengan cerradura con llave o control electrónico. El acceso debe estar restringido al personal autorizado. En instalaciones Tier II o superior se requiere registro electrónico de acceso.'},
  {id:'sa-2',category:'Seguridad y acceso',question:'¿Existe registro de acceso al rack (bitácora o sistema electrónico)?',norm_ref:'TIA-942-C §9.2',criticality:'media',hint:'El registro debe incluir: fecha y hora, nombre del técnico, empresa, motivo del acceso y trabajos realizados. Para instalaciones con requisitos de cumplimiento (PCI-DSS, ISO 27001, HIPAA) el registro electrónico es obligatorio y debe conservarse mínimo 12 meses.'},
  {id:'sa-3',category:'Seguridad y acceso',question:'¿Los puertos no utilizados tienen bloqueo físico (port lock)?',norm_ref:'TIA-942-C §9.3',criticality:'media',hint:'Los port locks impiden la conexión no autorizada de dispositivos a puertos activos. Son especialmente importantes en puertos de switches de acceso. Existen modelos con llave maestra. Su uso es requerido en instalaciones que manejan datos sensibles o están sujetas a auditorías de seguridad.'},
  {id:'sa-4',category:'Seguridad y acceso',question:'¿El patch panel está libre de materiales ajenos (cables sueltos, herramientas)?',norm_ref:'TIA-942-C §6.1',criticality:'baja',hint:'Materiales ajenos en el rack (cables sin etiquetar, herramientas olvidadas, empaques) son indicador de mantenimiento deficiente y pueden causar cortocircuitos, bloquear el flujo de aire o dificultar intervenciones de emergencia. TIA-942-C §6.1 exige cuartos de telecomunicaciones libres de materiales no relacionados con la infraestructura TI.'},
  {id:'sa-5',category:'Seguridad y acceso',question:'¿Existe procedimiento documentado para cambios en el patch panel?',norm_ref:'TIA-606-C §4.3',criticality:'media',hint:'El procedimiento de MACs debe definir: proceso de solicitud y aprobación, ventana de mantenimiento, pasos técnicos, actualización de documentación y pruebas post-cambio. TIA-606-C §4.3 recomienda que ningún cambio se realice sin orden de trabajo aprobada. La ausencia de procedimiento es la principal causa de errores de conectividad y tiempo de inactividad no planificado.'},
];
const CERT_NORMS: CertNorm[] = ['ANSI/TIA-568.2-D','ANSI/TIA-606-C','ANSI/TIA-569-D','ISO/IEC 11801','Evaluación interna SKIA'];
const CAT_ICONS: Record<string,React.ReactNode> = { 'Instalación física':<Layers size={12}/>, 'Etiquetado y documentación':<Tag size={12}/>, 'Conectividad y pruebas':<Network size={12}/>, 'Gestión de cables':<Wrench size={12}/>, 'Seguridad y acceso':<Shield size={12}/> };
const BADGE_COLOR = { 'Certificable':'bg-emerald-100 text-emerald-700 border-emerald-200', 'Encaminado':'bg-amber-100 text-amber-700 border-amber-200', 'Crítico':'bg-red-100 text-red-700 border-red-200' };

function buildAnswers(): PCA[] { return CERT_QS.map(q=>({question_id:q.id,answer:'na',observation:'',evidence_url:''})); }
function calcCert(answers: PCA[]) {
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

function TabNormativa({ pps }: { pps: PatchPanel[] }) {
  const [selId, setSelId] = useState<string|null>(null);
  const [history, setHistory] = useState<PCE[]>([]);
  const [activeEval, setActiveEval] = useState<{answers:PCA[];standard:CertNorm;evaluator:string;eval_date:string;notes:string;}|null>(null);
  const [openCat, setOpenCat] = useState<string|null>(CERT_CATS[0]);
  const [editingId, setEditingId] = useState<string|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingQId, setUploadingQId] = useState<string|null>(null);
  const selPP = pps.find(p=>p.id===selId);
  const ppHistory = history.filter(h=>h.pp_id===selId);
  const results = useMemo(()=>activeEval?calcCert(activeEval.answers):null,[activeEval]);

  function startNew() { setActiveEval({answers:buildAnswers(),standard:'Evaluación interna SKIA',evaluator:'',eval_date:new Date().toISOString().slice(0,10),notes:''}); setOpenCat(CERT_CATS[0]); setEditingId(null); }
  function editEval(rec: PCE) { setActiveEval({answers:rec.answers.map(a=>({...a})),standard:rec.standard,evaluator:rec.evaluator,eval_date:rec.eval_date,notes:rec.notes}); setOpenCat(CERT_CATS[0]); setEditingId(rec.id); }
  function saveEval() {
    if (!activeEval||!selPP) return;
    const res=calcCert(activeEval.answers);
    const rec: PCE = {id:editingId||String(Date.now()),pp_id:selPP.id,pp_code:selPP.code,standard:activeEval.standard,evaluator:activeEval.evaluator,eval_date:activeEval.eval_date,answers:activeEval.answers,overall_pct:res.overall,badge:res.badge,notes:activeEval.notes};
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
      <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm p-4">
        <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-2">Seleccionar Patch Panel a Evaluar</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {pps.map(p=>{
            const sc=STATUS_CONFIG[p.status]; const isSel=selId===p.id; const last=history.filter(h=>h.pp_id===p.id)[0];
            return (
              <button key={p.id} onClick={()=>{setSelId(p.id);setActiveEval(null);}} className={`text-left p-3 rounded-xl border transition-all ${isSel?'border-teal-400 bg-teal-50 shadow-sm':'border-[#E8EBF4] bg-slate-50 hover:border-teal-200 hover:bg-teal-50/30'}`}>
                <p className="text-[13px] font-mono font-bold text-teal-700">{p.code}</p>
                <p className="text-[12px] text-[#5C6194] mt-0.5">{p.type}</p>
                <p className="text-[12px] text-[#5C6194]">{p.location||'—'}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className={`inline-flex items-center gap-0.5 text-[13px] font-bold px-1.5 py-0.5 rounded-full border ${sc.pill}`}><span className={`w-1 h-1 rounded-full ${sc.dot}`}/>{p.status}</span>
                  {last&&<span className={`text-[13px] font-bold px-1.5 py-0.5 rounded-full border ${BADGE_COLOR[last.badge]}`}>{last.overall_pct!==null?`${last.overall_pct}%`:'—'}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {selPP&&!activeEval&&(
        <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#E8EBF4]">
            <div><p className="text-xs font-black text-slate-800">Historial — <span className="font-mono text-teal-700">{selPP.code}</span></p><p className="text-[13px] text-[#5C6194]">{selPP.type} · {selPP.location}</p></div>
            <button onClick={startNew} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors shadow-sm"><Plus size={12}/> Nueva evaluación</button>
          </div>
          {ppHistory.length===0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2"><Award size={28} className="text-[#5C6194]"/><p className="text-sm font-bold text-slate-500">Sin evaluaciones registradas</p></div>
          ) : (
            <div className="divide-y divide-slate-50">
              {ppHistory.map(rec=>(
                <div key={rec.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/80 transition-colors">
                  <div className="flex-1"><p className="text-xs font-bold text-slate-800">{rec.standard}</p><p className="text-[13px] text-[#5C6194]">{rec.eval_date} · {rec.evaluator||'Sin evaluador'}</p></div>
                  <div className="text-right"><p className="text-lg font-black text-[#1A1D2E]">{rec.overall_pct!==null?`${rec.overall_pct}%`:'—'}</p><span className={`text-[12px] font-bold px-2 py-0.5 rounded-full border ${BADGE_COLOR[rec.badge]}`}>{rec.badge}</span></div>
                  <button onClick={()=>editEval(rec)} className="flex items-center gap-1 px-2.5 py-1.5 text-[13px] font-bold bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors border border-teal-200"><Edit2 size={10}/> Editar</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {activeEval&&selPP&&(
        <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8EBF4] bg-gradient-to-r from-teal-50/60 to-cyan-50/40">
            <div><p className="text-xs font-black text-slate-800">{editingId?'Editando':'Nueva'} evaluación — <span className="font-mono text-teal-700">{selPP.code}</span></p><p className="text-[13px] text-[#5C6194]">{selPP.type} · {selPP.location}</p></div>
            <div className="flex items-center gap-2">
              {results&&<div className="text-right mr-2"><p className="text-xl font-black text-slate-800">{results.overall!==null?`${results.overall}%`:'—'}</p><span className={`text-[12px] font-bold px-2 py-0.5 rounded-full border ${BADGE_COLOR[results.badge]}`}>{results.badge}</span></div>}
              <button onClick={()=>setActiveEval(null)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X size={13} className="text-slate-500"/></button>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Norma</label>
                <select value={activeEval.standard} onChange={e=>setActiveEval(ev=>ev?{...ev,standard:e.target.value as CertNorm}:ev)} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400">{CERT_NORMS.map(n=><option key={n}>{n}</option>)}</select></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Evaluador</label>
                <input value={activeEval.evaluator} onChange={e=>setActiveEval(ev=>ev?{...ev,evaluator:e.target.value}:ev)} placeholder="Nombre del evaluador" className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"/></div>
              <div><label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha</label>
                <input type="date" value={activeEval.eval_date} onChange={e=>setActiveEval(ev=>ev?{...ev,eval_date:e.target.value}:ev)} className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"/></div>
            </div>
            {results&&(
              <div className="grid grid-cols-5 gap-2">
                {results.byCategory.map(({cat,pct,compliant,applicable})=>(
                  <div key={cat} onClick={()=>setOpenCat(openCat===cat?null:cat)} className={`p-3 rounded-xl border text-center cursor-pointer transition-all ${openCat===cat?'border-teal-400 bg-teal-50 shadow-sm':'border-[#E8EBF4] bg-slate-50 hover:border-teal-200'}`}>
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
                              <input value={ans.observation} onChange={e=>setActiveEval(ev=>ev?{...ev,answers:ev.answers.map(a=>a.question_id===q.id?{...a,observation:e.target.value}:a)}:ev)} placeholder="Observación..." className="flex-1 px-2 py-1 text-[13px] bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"/>
                              <button type="button" onClick={()=>{setUploadingQId(q.id);fileRef.current?.click();}} className={`flex items-center gap-1 px-2 py-1 text-[12px] font-bold rounded-lg border transition-colors ${ans.evidence_url?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-slate-50 text-slate-500 border-[#E8EBF4] hover:border-teal-300'}`}>
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
              <textarea value={activeEval.notes} onChange={e=>setActiveEval(ev=>ev?{...ev,notes:e.target.value}:ev)} rows={2} placeholder="Observaciones generales..." className="w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"/></div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E8EBF4]">
              <button type="button" onClick={()=>setActiveEval(null)} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Cancelar</button>
              <button type="button" onClick={saveEval} className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 rounded-xl shadow-sm transition-all">{editingId?'Guardar cambios':'Guardar evaluación'}</button>
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
export default function PatchPanelsPage() {
  const router = useRouter();
  const highlightCode = typeof router.query.highlight === 'string' ? decodeURIComponent(router.query.highlight) : undefined;
  const [pps, setPPs] = useState<PatchPanel[]>([]);

  // Cargar patch panels del backend al montar
  useEffect(() => {
    import('axios').then(({ default: axios }) => {
      axios.get('/api/infra/patch-panels')
        .then(res => setPPs(Array.isArray(res.data) ? res.data : []))
        .catch(() => setPPs([]));
    });
  }, []);
  const [activeTab, setActiveTab] = useState<Tab>('inventario');
  const [modal, setModal] = useState<{open:boolean;pp:Partial<PatchPanel>|null}>({open:false,pp:null});
  const [showPPWizard, setShowPPWizard] = useState(false);

  useEffect(() => {
    if (highlightCode) {
      const t = setTimeout(() => {
        const { highlight: _h, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
      }, 3200);
      return () => clearTimeout(t);
    }
  }, [highlightCode]);

  function handleSave(pp: PatchPanel) {
    setPPs(prev=>{ const idx=prev.findIndex(p=>p.id===pp.id); return idx>=0?prev.map(p=>p.id===pp.id?pp:p):[pp,...prev]; });
    setModal({open:false,pp:null});
  }
  function handleDelete(id: string) { if (confirm('¿Eliminar este patch panel del inventario?')) setPPs(prev=>prev.filter(p=>p.id!==id)); }

  const TABS: {id:Tab;label:string;icon:React.ReactNode}[] = [
    {id:'resumen',label:'Resumen',icon:<BarChart2 size={13}/>},
    {id:'inventario',label:'Inventario',icon:<List size={13}/>},
    {id:'normativa',label:'Normativa',icon:<Award size={13}/>},
  ];

  return (
    <AppLayout>
      <Head><title>Patch Panels — SKIA Platform</title></Head>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/20 to-cyan-50/30 p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-200"><Layers size={22} className="text-white"/></div>
            <div><h1 className="text-xl font-black text-slate-800 tracking-tight">Patch Panels</h1><p className="text-sm text-[#5C6194] mt-0.5">Inventario y normativa de patch panels de telecomunicaciones</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-[#F0F2FA] border border-[#E8EBF4] rounded-xl hover:bg-slate-50 shadow-sm transition-colors"><Download size={13}/> Exportar</button>
            <button onClick={()=>setShowPPWizard(true)} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-cyan-600 rounded-xl hover:from-teal-700 hover:to-cyan-700 shadow-sm shadow-teal-200 transition-all"><Plus size={13}/> Nuevo Patch Panel</button>
          </div>
        </div>
        <div className="flex items-center gap-1 mb-6 bg-slate-100/80 backdrop-blur-sm rounded-2xl p-1 border border-[#E8EBF4] shadow-sm w-fit">
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)} className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all ${activeTab===t.id?'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-sm':'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {pps.length === 0 ? (
          <ModuleEmptyState
            icon={<Layers size={36} className="text-teal-600" />}
            title="Sin patch panels registrados"
            description="Los patch panels son el punto central de conexión de tu red estructurada. Registra cada panel con su tipo, puertos y ubicación para tener trazabilidad completa del cableado."
            features={[
              { icon: <Layers size={14}/>, text: 'Inventario con puertos libres y usados' },
              { icon: <Shield size={14}/>, text: 'Evaluación de normativa TIA-568' },
              { icon: <Tag size={14}/>, text: 'Etiquetado y trazabilidad de puertos' },
              { icon: <MapPin size={14}/>, text: 'Referencia a rack y ubicación física' },
            ]}
            wizardLabel="Registrar primer Patch Panel"
            onOpenWizard={() => setShowPPWizard(true)}
            accentColor="teal"
          />
        ) : (
          <>
            {activeTab==='resumen'&&<TabResumen pps={pps}/>}
            {activeTab==='inventario'&&<TabInventario pps={pps} onEdit={p=>setModal({open:true,pp:p})} onDelete={handleDelete} highlightCode={highlightCode}/>}
            {activeTab==='normativa'&&<TabNormativa pps={pps}/>}
          </>
        )}
      </div>
      {modal.open&&<PPModal pp={modal.pp} onClose={()=>setModal({open:false,pp:null})} onSave={handleSave}/>}
      {showPPWizard && (
        <PatchPanelWizard
          onClose={() => setShowPPWizard(false)}
          onSave={(data: PatchPanelWizardData) => {
            const newPP: PatchPanel = {
              id: Date.now().toString(),
              code: data.code,
              brand: data.brand,
              model: data.model,
              serial: data.serial ?? '',
              type: data.type as any,
              status: data.status as any,
              location: data.location,
              floor_plan_ref: data.floor_plan_ref ?? '',
              photo_url: '',
              observations: data.observations ?? '',
              ports_total: data.ports_total ?? 24,
              ports_free: data.ports_free ?? 0,
              rfid_tag: data.rfid_tag ?? '',
              purchase_date: data.purchase_date ?? '',
              install_year: data.install_year ?? new Date().getFullYear(),
              invoice_no: data.invoice_no ?? '',
              cost_usd: data.cost_usd ?? 0,
              supplier: data.supplier ?? '',
              sla_contract: data.sla_contract ?? '',
              cost_center: data.cost_center ?? '',
            };
            // Persistir en el backend
            axios.post('/api/infra/patch-panels', {
              internal_code: data.code,
              brand: data.brand,
              model: data.model,
              serial: data.serial ?? '',
              panel_type: data.type ?? 'Cat6',
              status: data.status === 'Activo' ? 'active' : 'inactive',
              location: data.location,
              ports_total: data.ports_total ?? 24,
              ports_free: data.ports_free ?? 0,
              supplier: data.supplier ?? '',
              cost_center: data.cost_center ?? '',
              observations: data.observations ?? '',
            }).then(resp => {
              setPPs(prev => [{ ...newPP, id: resp.data.id ?? newPP.id }, ...prev]);
            }).catch(() => {
              setPPs(prev => [newPP, ...prev]);
            });
            setShowPPWizard(false);
          }}
        />
      )}
    </AppLayout>
  );
}
