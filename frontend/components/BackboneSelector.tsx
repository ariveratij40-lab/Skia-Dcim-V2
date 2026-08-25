import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Plus, X, Check, Layers, ChevronDown, AlertCircle } from 'lucide-react';
import axios from 'axios';
import NomenclatureCodeField from './NomenclatureCodeField';

type BackboneMedia = 'Fibra Monomodo'|'Fibra Multimodo OM3'|'Fibra Multimodo OM4'|'UTP Cat6A'|'UTP Cat6'|'DAC'|'SFP+';
type BackboneType = 'Horizontal'|'Vertical'|'Campus'|'Interbuilding';
type BackboneStatus = 'Activo'|'Inactivo'|'Baja';
interface BackboneItem { id:string; code:string; origen:string; destino:string; media:BackboneMedia; tipo:BackboneType; longitud_m:number; fibras_hilos:number; conector_origen:string; conector_destino:string; capacidad_gbps:number; status:BackboneStatus; no_factura:string; costo_dls:number; proveedor:string; fecha_instalacion:string; garantia_hasta:string; rfid:string; etiqueta:string; observaciones:string; centro_costos:string; anio_instalacion:number; }
interface ApiBackbone { id?:string; codigo?:string; idf_origen?:string; idf_destino?:string; tipo_fibra?:string; longitud?:string|number; hilos?:string|number; bandwidth_gbps?:number; status?:string; marca?:string; observaciones?:string; anio_instalacion?:number; }
const fromApi = (row: ApiBackbone): BackboneItem => ({ id:String(row.id??''), code:String(row.codigo??''), origen:String(row.idf_origen??''), destino:String(row.idf_destino??''), media:(row.tipo_fibra??'Fibra Monomodo') as BackboneMedia, tipo:'Vertical', longitud_m:Number(row.longitud??0), fibras_hilos:Number(row.hilos??0), conector_origen:'', conector_destino:'', capacidad_gbps:Number(row.bandwidth_gbps??0), status:row.status==='active'?'Activo':'Inactivo', no_factura:'', costo_dls:0, proveedor:String(row.marca??''), fecha_instalacion:'', garantia_hasta:'', rfid:'', etiqueta:'', observaciones:String(row.observaciones??''), centro_costos:'', anio_instalacion:Number(row.anio_instalacion??0) });

// ── Mini form to create a new backbone inline ─────────────────────────────────
function NewBackboneForm({ onSave, onCancel }: {
  onSave: (bb: BackboneItem) => void;
  onCancel: () => void;
}) {
  const blank: BackboneItem = {
    id: '', code: '', origen: '', destino: '',
    media: 'Fibra Monomodo', tipo: 'Vertical',
    longitud_m: 0, fibras_hilos: 12,
    conector_origen: 'LC/APC', conector_destino: 'LC/APC',
    capacidad_gbps: 10, status: 'Activo',
    no_factura: '', costo_dls: 0, proveedor: '',
    fecha_instalacion: new Date().toISOString().slice(0, 10),
    garantia_hasta: '', rfid: '', etiqueta: '',
    observaciones: '', centro_costos: '',
    anio_instalacion: new Date().getFullYear(),
  };
  const [form, setForm] = useState<BackboneItem>(blank);
  const [nomenclatureAvailable, setNomenclatureAvailable] = useState(false);
  const set = (k: keyof BackboneItem, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!nomenclatureAvailable || !form.origen || !form.destino) return;
    const bb: BackboneItem = { ...form, id: `bb-${Date.now()}` };
    axios.post('/api/infra/backbone', { internal_code:'', name:`Backbone ${bb.origen} – ${bb.destino}`, manufacturer:bb.proveedor, link_type:bb.media, origin_id:bb.origen, destination_id:bb.destino, fiber_count:bb.fibras_hilos, cable_length_m:bb.longitud_m, bandwidth_gbps:bb.capacidad_gbps, status:bb.status==='Activo'?'active':'inactive', observations:bb.observaciones, install_year:bb.anio_instalacion })
      .then(res => onSave({...bb,id:String(res.data?.id??bb.id),code:String(res.data?.internal_code??bb.code)}));
  };

  return (
    <div className="border-t border-[#E8EBF4] bg-slate-50 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Plus size={12} className="text-cyan-600"/>
        <span className="text-xs font-bold text-[#1A1D2E]">Nuevo Backbone</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2"><NomenclatureCodeField assetType="BACKBONE" onAvailability={setNomenclatureAvailable}/></div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Origen *</label>
          <input value={form.origen} onChange={e => set('origen', e.target.value)}
            placeholder="Ej. MDF Torre A"
            className="w-full px-2.5 py-1.5 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Destino *</label>
          <input value={form.destino} onChange={e => set('destino', e.target.value)}
            placeholder="Ej. IDF2 Producción"
            className="w-full px-2.5 py-1.5 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Tipo de Medio</label>
          <select value={form.media} onChange={e => set('media', e.target.value as BackboneMedia)}
            className="w-full px-2.5 py-1.5 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">
            {(['Fibra Monomodo','Fibra Multimodo OM3','Fibra Multimodo OM4','UTP Cat6A','UTP Cat6','DAC','SFP+'] as BackboneMedia[]).map(m => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Tipo</label>
          <select value={form.tipo} onChange={e => set('tipo', e.target.value as BackboneType)}
            className="w-full px-2.5 py-1.5 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">
            {(['Horizontal','Vertical','Campus','Interbuilding'] as BackboneType[]).map(t => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Longitud (m)</label>
          <input type="number" value={form.longitud_m} onChange={e => set('longitud_m', Number(e.target.value))}
            className="w-full px-2.5 py-1.5 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Fibras / Hilos</label>
          <input type="number" value={form.fibras_hilos} onChange={e => set('fibras_hilos', Number(e.target.value))}
            className="w-full px-2.5 py-1.5 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Capacidad (Gbps)</label>
          <input type="number" value={form.capacidad_gbps} onChange={e => set('capacidad_gbps', Number(e.target.value))}
            className="w-full px-2.5 py-1.5 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Proveedor</label>
          <input value={form.proveedor} onChange={e => set('proveedor', e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
        </div>
        <div className="col-span-2">
          <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Observaciones</label>
          <input value={form.observaciones} onChange={e => set('observaciones', e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
        </div>
      </div>

      {(!nomenclatureAvailable || !form.origen || !form.destino) && (
        <div className="flex items-center gap-1.5 text-[12px] text-amber-600">
          <AlertCircle size={10}/>Nomenclatura activa, Origen y Destino son obligatorios
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-200 rounded-lg">Cancelar</button>
        <button onClick={handleSave} disabled={!nomenclatureAvailable || !form.origen || !form.destino}
          className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-bold text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
          <Check size={10}/>Crear y seleccionar
        </button>
      </div>
    </div>
  );
}

// ── Media badge colors ────────────────────────────────────────────────────────
const MEDIA_COLORS: Record<BackboneMedia, string> = {
  'Fibra Monomodo':       'bg-violet-100 text-violet-700 border-violet-200',
  'Fibra Multimodo OM3':  'bg-blue-100 text-blue-700 border-blue-200',
  'Fibra Multimodo OM4':  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'UTP Cat6A':            'bg-cyan-100 text-cyan-700 border-cyan-200',
  'UTP Cat6':             'bg-teal-100 text-teal-700 border-teal-200',
  'DAC':                  'bg-amber-100 text-amber-700 border-amber-200',
  'SFP+':                 'bg-slate-100 text-slate-700 border-[#E8EBF4]',
};

// ── Main BackboneSelector ─────────────────────────────────────────────────────
interface BackboneSelectorProps {
  value: string;           // current backbone code string
  onChange: (code: string) => void;
}

export default function BackboneSelector({ value, onChange }: BackboneSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [backbones, setBackbones] = useState<BackboneItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { axios.get<ApiBackbone[]>('/api/infra/backbone').then(res => setBackbones(Array.isArray(res.data)?res.data.map(fromApi):[])).catch(()=>setBackbones([])); }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowNew(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return backbones.filter(b =>
      !q ||
      b.code.toLowerCase().includes(q) ||
      b.origen.toLowerCase().includes(q) ||
      b.destino.toLowerCase().includes(q) ||
      b.media.toLowerCase().includes(q)
    );
  }, [backbones, search]);

  const selected = backbones.find(b => b.code === value);

  const handleSelect = (bb: BackboneItem) => {
    onChange(bb.code);
    setOpen(false);
    setSearch('');
    setShowNew(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const handleNewSaved = (bb: BackboneItem) => {
    setBackbones(current => [bb, ...current]);
    handleSelect(bb);
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setShowNew(false); }}
        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs rounded-lg border transition-all ${
          open ? 'border-cyan-400 ring-2 ring-cyan-100 bg-slate-100' : 'bg-[#F8F9FE] border-[#E8EBF4] hover:border-[#E8EBF4]'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Layers size={11} className="text-slate-500 flex-shrink-0"/>
          {selected ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono font-semibold text-slate-700 truncate">{selected.code}</span>
              <span className={`flex-shrink-0 text-[13px] font-bold px-1.5 py-0.5 rounded border ${MEDIA_COLORS[selected.media]}`}>{selected.media}</span>
            </div>
          ) : (
            <span className="text-slate-500">{value || 'Seleccionar backbone...'}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {value && (
            <span onClick={handleClear} className="p-0.5 hover:bg-slate-200 rounded cursor-pointer">
              <X size={10} className="text-slate-500"/>
            </span>
          )}
          <ChevronDown size={11} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}/>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-100 rounded-xl border border-[#E8EBF4] shadow-2xl overflow-hidden max-h-80 flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-[#E8EBF4]">
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"/>
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por código, origen, destino..."
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && !showNew && (
              <div className="px-3 py-4 text-center text-xs text-[#5C6194]">
                No se encontraron backbones.
              </div>
            )}
            {filtered.map(bb => (
              <button
                key={bb.id}
                onClick={() => handleSelect(bb)}
                className={`w-full text-left px-3 py-2.5 hover:bg-cyan-50 transition-colors border-b border-slate-50 last:border-0 ${bb.code === value ? 'bg-cyan-50' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#1A1D2E] truncate">{bb.code}</span>
                      {bb.code === value && <Check size={10} className="text-cyan-600 flex-shrink-0"/>}
                    </div>
                    <div className="text-[12px] text-[#5C6194] truncate mt-0.5">
                      {bb.origen} → {bb.destino} · {bb.longitud_m}m · {bb.fibras_hilos} fibras
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-[13px] font-bold px-1.5 py-0.5 rounded border ${MEDIA_COLORS[bb.media]}`}>{bb.media}</span>
                    <span className={`text-[13px] font-bold px-1.5 py-0.5 rounded border ${
                      bb.status === 'Activo' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                      bb.status === 'Inactivo' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                      'bg-red-100 text-red-700 border-red-200'
                    }`}>{bb.status}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* New backbone */}
          {!showNew ? (
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 border-t border-[#E8EBF4] transition-colors"
            >
              <Plus size={12}/>Dar de alta nuevo backbone
            </button>
          ) : (
            <NewBackboneForm
              onSave={handleNewSaved}
              onCancel={() => setShowNew(false)}
            />
          )}
        </div>
      )}

      {/* Selected detail card */}
      {selected && !open && (
        <div className="mt-1.5 px-3 py-2 bg-violet-50 border border-violet-100 rounded-xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-violet-600 font-semibold">{selected.origen}</span>
            <span className="text-[12px] text-violet-400">→</span>
            <span className="text-[12px] text-violet-600 font-semibold">{selected.destino}</span>
            <span className={`text-[13px] font-bold px-1.5 py-0.5 rounded border ${MEDIA_COLORS[selected.media]}`}>{selected.media}</span>
            <span className="text-[12px] text-violet-500">{selected.longitud_m}m · {selected.fibras_hilos} fibras · {selected.capacidad_gbps}Gbps</span>
          </div>
        </div>
      )}
    </div>
  );
}
