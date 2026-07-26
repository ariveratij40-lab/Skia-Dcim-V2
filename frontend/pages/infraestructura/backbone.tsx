import BackboneWizard, { BackboneWizardData } from '../../components/BackboneWizard';
import axios from 'axios';
import Head from 'next/head';
import AppLayout from '../../components/AppLayout';
import ModuleEmptyState from '../../components/ModuleEmptyState';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import BackboneTopoView from '../../components/BackboneTopoView';
import {
  Network, Plus, Search, Filter, Download, ChevronDown, ChevronRight,
  Edit2, Trash2, X, CheckCircle, XCircle, Minus, BookOpen,
  BarChart2, List, Tag, FileText, AlertTriangle, Info, Cable,
  MapPin, Layers, ArrowRight, Zap, Package
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type FiberType = 'OM2' | 'OM3' | 'OM4' | 'OS1' | 'OS2' | 'UTP Cat6' | 'UTP Cat6A';
type JumperLen = '3 Pies' | '7 Pies' | '10 Pies' | '15 Pies' | '20 Pies' | 'Otro';
type BBStatus = 'Activo' | 'Inactivo' | 'Baja' | 'En mantenimiento';

interface BBItem {
  id: string;
  codigo: string;
  marca: string;
  tipo_fibra: FiberType;
  idf_origen: string;
  idf_destino: string;
  panel_mdf: string;
  panel_idf: string;
  jumper: JumperLen;
  switch_ref: string;
  hilos: string;
  longitud: string;
  ver_plano: boolean;
  normativa: boolean;
  certificado_fluke: string;
  integrador: string;
  po: string;
  costo_dls: number;
  centro_costos: string;
  rfid: string;
  anio_instalacion: number;
  status: BBStatus;
  observaciones: string;
  foto: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK: BBItem[] = [
  { id:'bb1', codigo:'MDF-IDF2-BB0001', marca:'Panduit', tipo_fibra:'OM4', idf_origen:'MDF-E1-A', idf_destino:'IDF1-P1-E2', panel_mdf:'PDF0002-MDF-E1-A', panel_idf:'PDF0002-IDF-E1-A', jumper:'7 Pies', switch_ref:'SW-MDF-0001', hilos:'6 hilos', longitud:'350 mts', ver_plano:true, normativa:true, certificado_fluke:'FLK-2024-001', integrador:'Foundation Corp', po:'PO-2024-001', costo_dls:1200, centro_costos:'CC-TI-001', rfid:'RFID-BB-0001', anio_instalacion:2024, status:'Activo', observaciones:'Backbone principal MDF a IDF1', foto:'' },
  { id:'bb2', codigo:'MDF-IDF2-BB0002', marca:'Panduit', tipo_fibra:'OM4', idf_origen:'MDF-E1-A', idf_destino:'IDF2-P2-E1', panel_mdf:'PDF0003-MDF-E1-A', panel_idf:'PDF0003-IDF2-E1', jumper:'7 Pies', switch_ref:'SW-MDF-0001', hilos:'12 hilos', longitud:'420 mts', ver_plano:true, normativa:true, certificado_fluke:'FLK-2024-002', integrador:'Foundation Corp', po:'PO-2024-001', costo_dls:1450, centro_costos:'CC-TI-001', rfid:'RFID-BB-0002', anio_instalacion:2024, status:'Activo', observaciones:'Backbone MDF a IDF2', foto:'' },
  { id:'bb3', codigo:'MDF-IDF2-BB0003', marca:'Cablemas', tipo_fibra:'OM3', idf_origen:'MDF-E1-B', idf_destino:'IDF3-P1-E1', panel_mdf:'PDF0004-MDF-E1-B', panel_idf:'PDF0004-IDF3-E1', jumper:'3 Pies', switch_ref:'SW-MDF-0002', hilos:'6 hilos', longitud:'280 mts', ver_plano:false, normativa:true, certificado_fluke:'FLK-2024-003', integrador:'Cablemas', po:'PO-2024-002', costo_dls:980, centro_costos:'CC-TI-002', rfid:'RFID-BB-0003', anio_instalacion:2024, status:'Activo', observaciones:'', foto:'' },
  { id:'bb4', codigo:'MDF-IDF2-BB0004', marca:'Panduit', tipo_fibra:'OM4', idf_origen:'MDF-E1-A', idf_destino:'IDF1-P1-E2', panel_mdf:'PDF0002-MDF-E1-A', panel_idf:'PDF0002-IDF-E1-A', jumper:'7 Pies', switch_ref:'SW-MDF-0001', hilos:'6 hilos', longitud:'350 mts', ver_plano:true, normativa:true, certificado_fluke:'', integrador:'Foundation Corp', po:'', costo_dls:1200, centro_costos:'', rfid:'RFID-BB-0005', anio_instalacion:2026, status:'Activo', observaciones:'', foto:'' },
  { id:'bb5', codigo:'MDF-IDF2-BB0005', marca:'Cablemas', tipo_fibra:'OM2', idf_origen:'MDF-E2-A', idf_destino:'IDF4-P1-E1', panel_mdf:'PDF0005-MDF-E2-A', panel_idf:'PDF0005-IDF4-E1', jumper:'20 Pies', switch_ref:'SW-MDF-0003', hilos:'4 hilos', longitud:'510 mts', ver_plano:false, normativa:false, certificado_fluke:'', integrador:'Cablemas', po:'PO-2024-003', costo_dls:750, centro_costos:'CC-TI-003', rfid:'RFID-BB-0005', anio_instalacion:2023, status:'En mantenimiento', observaciones:'Requiere re-normativa', foto:'' },
  { id:'bb6', codigo:'MDF-IDF2-BB0006', marca:'Panduit', tipo_fibra:'OS2', idf_origen:'MDF-E1-A', idf_destino:'EDIF-B-IDF1', panel_mdf:'PDF0006-MDF-E1-A', panel_idf:'PDF0006-EDIF-B', jumper:'7 Pies', switch_ref:'SW-CORE-0001', hilos:'24 hilos', longitud:'1200 mts', ver_plano:true, normativa:true, certificado_fluke:'FLK-2024-006', integrador:'Foundation Corp', po:'PO-2024-004', costo_dls:4500, centro_costos:'CC-TI-001', rfid:'RFID-BB-0006', anio_instalacion:2024, status:'Activo', observaciones:'Enlace inter-edificio', foto:'' },
];

// ─── Certification questions ───────────────────────────────────────────────────
interface BCQ { id:number; cat:string; norm:string; question:string; criticality:'Alta'|'Media'|'Baja'; hint:string; }
const CERT_QS: BCQ[] = [
  // Instalación física
  { id:1, cat:'Instalación física', norm:'TIA-568.3-D §6.4', question:'¿El backbone está instalado en canaleta o bandeja portacables certificada?', criticality:'Alta', hint:'TIA-568.3-D §6.4 exige soporte continuo cada 1.5 m máximo. Las bandejas deben ser metálicas para backbone de fibra y estar bondeadas a tierra.' },
  { id:2, cat:'Instalación física', norm:'TIA-569-D §9.3', question:'¿El radio de curvatura mínimo se respeta en todo el trayecto?', criticality:'Alta', hint:'Radio mínimo: 10× el diámetro del cable bajo tensión, 20× sin tensión. Para OM4 de 6 hilos típicamente ≥30 mm. Curvaturas excesivas causan pérdida de inserción permanente.' },
  { id:3, cat:'Instalación física', norm:'TIA-569-D §9.5', question:'¿Los conectores están correctamente asentados y sin contaminación?', criticality:'Alta', hint:'Inspeccionar con microscopio de fibra (400×) según IEC 61300-3-35. Clasificación: Grado A (limpio), B (limpio con defecto menor), C/D (requiere limpieza). Usar limpiadores de un solo uso.' },
  { id:4, cat:'Instalación física', norm:'TIA-942-B §6.7', question:'¿El backbone está protegido contra daño físico en áreas de tráfico?', criticality:'Media', hint:'En áreas de tráfico (pasillos de carga, salas de máquinas) el backbone debe estar en conduit metálico EMT o IMC. En cuartos técnicos, bandeja o canaleta es suficiente.' },
  { id:5, cat:'Instalación física', norm:'TIA-607-C §4.3', question:'¿El backbone tiene bonding/grounding adecuado en ambos extremos?', criticality:'Alta', hint:'Cada extremo debe conectarse al TMGB/TGB con conductor AWG 6 mínimo. Resistencia máxima: 1 ohm. Verificar con megóhmetro. Crítico para protección contra descargas y EMI.' },
  // Normativa y pruebas
  { id:6, cat:'Normativa y pruebas', norm:'TIA-568.3-D §6.5', question:'¿Todos los hilos tienen normativa Fluke o equivalente con PASS?', criticality:'Alta', hint:'Normativa con Fluke DSX-8000 o Versiv en modo "Multimode Fiber Link" o "Singlemode Fiber Link". Parámetros: Pérdida de inserción (IL), Pérdida de retorno (RL), Longitud. Guardar archivos .flw y .pdf.' },
  { id:7, cat:'Normativa y pruebas', norm:'TIA-568.3-D Tabla 5', question:'¿La pérdida de inserción está dentro del límite para el tipo de fibra?', criticality:'Alta', hint:'Límites TIA-568.3-D: OM4 ≤3.5 dB/km @850nm, OM3 ≤3.5 dB/km, OS2 ≤0.4 dB/km @1310nm. Incluir pérdida de conectores (0.75 dB/conector máx) y empalmes (0.3 dB/empalme máx).' },
  { id:8, cat:'Normativa y pruebas', norm:'TIA-568.3-D §6.6', question:'¿La longitud certificada coincide con la documentada en el inventario?', criticality:'Media', hint:'Tolerancia aceptable: ±5% de la longitud medida por OTDR. Diferencias mayores indican error en documentación o cable adicional no registrado. Actualizar el inventario si hay discrepancia.' },
  { id:9, cat:'Normativa y pruebas', norm:'IEC 61280-4-2', question:'¿Se realizó prueba OTDR para detectar eventos de pérdida?', criticality:'Media', hint:'OTDR detecta: roturas, micro-curvaturas, empalmes deficientes, conectores sucios. Eventos >0.5 dB son inaceptables. Guardar traza OTDR (.sor) junto con certificado Fluke.' },
  { id:10, cat:'Normativa y pruebas', norm:'TIA-568.3-D §6.7', question:'¿Los jumpers de conexión son del mismo tipo de fibra que el backbone?', criticality:'Alta', hint:'Mezclar OM3 con OM4 reduce el canal al estándar inferior. Mezclar monomodo con multimodo es un error crítico. Verificar color del conector: OM4=violeta, OM3=aqua, OS2=amarillo.' },
  // Documentación
  { id:11, cat:'Documentación', norm:'TIA-606-C §6.3', question:'¿El backbone tiene identificador único según nomenclatura TIA-606-C?', criticality:'Alta', hint:'Formato recomendado: {Edificio}-{Piso origen}-{Cuarto origen}-{Piso destino}-{Cuarto destino}-{Número secuencial}. Ejemplo: A-01-MDF-02-IDF2-001. Etiqueta en ambos extremos.' },
  { id:12, cat:'Documentación', norm:'TIA-606-C §7.2', question:'¿El port mapping está actualizado en el sistema de documentación?', criticality:'Alta', hint:'El port mapping debe actualizarse dentro de las 24 horas de cualquier cambio. Incluir: hilo #, conector origen, conector destino, longitud, estado, fecha de última normativa.' },
  { id:13, cat:'Documentación', norm:'TIA-942-B §9.4', question:'¿Los certificados Fluke están archivados en formato digital y físico?', criticality:'Media', hint:'Archivos .flw (Fluke LinkWare) y .pdf deben estar en el servidor de documentación y en carpeta física en el cuarto técnico. Retención mínima: vida útil del cable (20-25 años).' },
  { id:14, cat:'Documentación', norm:'TIA-606-C §8.1', question:'¿El backbone aparece en el plano de cableado actualizado?', criticality:'Media', hint:'El plano debe mostrar: trayecto físico, tipo de cable, número de hilos, longitud, paneles de distribución en ambos extremos. Formato recomendado: AutoCAD .dwg o Visio .vsdx.' },
  { id:15, cat:'Documentación', norm:'TIA-606-C §9.2', question:'¿Existe registro de mantenimiento con historial de incidencias?', criticality:'Baja', hint:'El registro debe incluir: fecha, técnico, tipo de intervención (limpieza, re-normativa, reparación), resultado y próxima revisión programada. Retención mínima: 5 años.' },
  // Gestión de fibras
  { id:16, cat:'Gestión de fibras', norm:'TIA-568.3-D §5.2', question:'¿Los hilos no utilizados tienen dust caps instalados?', criticality:'Media', hint:'Dust caps protegen el ferrule de contaminación. Sin protección, una partícula de 1 μm puede causar pérdida de 0.5 dB. Usar caps de color según tipo de fibra para identificación rápida.' },
  { id:17, cat:'Gestión de fibras', norm:'TIA-569-D §9.6', question:'¿El exceso de cable está correctamente enrollado y asegurado?', criticality:'Baja', hint:'Enrollar en bobinas de diámetro ≥300 mm. Usar velcro (nunca bridas de plástico que aprieten). Almacenar en bandeja de gestión de excedentes. Mínimo 3 m de reserva en cada extremo.' },
  { id:18, cat:'Gestión de fibras', norm:'TIA-568.3-D §6.3', question:'¿Los empalmes (splices) están protegidos en cassette o caja de empalme?', criticality:'Alta', hint:'Cassettes de empalme deben estar en el panel de distribución o en caja de empalme certificada. Cada empalme de fusión debe tener manga termoretráctil. Pérdida máxima por empalme: 0.3 dB.' },
  { id:19, cat:'Gestión de fibras', norm:'TIA-942-B §6.8', question:'¿El backbone está separado físicamente del cableado de cobre?', criticality:'Media', hint:'Separación mínima 50 mm de cables de energía. En la misma bandeja con cobre UTP: separación con divisor metálico. La fibra no sufre EMI pero el cobre sí puede inducir interferencia en equipos adyacentes.' },
  { id:20, cat:'Gestión de fibras', norm:'TIA-568.3-D §4.4', question:'¿El tipo de fibra instalado es el correcto para la distancia y velocidad requerida?', criticality:'Alta', hint:'OM4: hasta 400m @10G, 150m @40G/100G. OM3: hasta 300m @10G, 100m @40G. OS2: hasta 10km @10G. Verificar que el tipo instalado soporta la velocidad actual y la planificada a 5 años.' },
  // Seguridad y acceso
  { id:21, cat:'Seguridad y acceso', norm:'TIA-942-B §10.2', question:'¿El acceso al backbone está restringido a personal autorizado?', criticality:'Alta', hint:'Control de acceso Tier II mínimo: tarjeta + PIN. Registro de accesos por 12 meses (PCI-DSS req. 9.1.3). El backbone es infraestructura crítica — un corte puede afectar toda la red.' },
  { id:22, cat:'Seguridad y acceso', norm:'ISO 27001 A.11.2', question:'¿Existe procedimiento documentado para intervenciones en el backbone?', criticality:'Alta', hint:'El procedimiento debe incluir: ventana de mantenimiento, notificación a usuarios afectados, checklist pre/post intervención, pruebas de normativa post-trabajo y registro en bitácora.' },
  { id:23, cat:'Seguridad y acceso', norm:'TIA-942-B §10.4', question:'¿El backbone está identificado con etiquetas de advertencia en puntos de acceso?', criticality:'Media', hint:'Etiquetas: "FIBRA ÓPTICA — No doblar" + símbolo de radiación láser (IEC 60825-1) en equipos activos. Color naranja para fibra multimodo, amarillo para monomodo según ANSI/TIA-606-C.' },
  { id:24, cat:'Seguridad y acceso', norm:'TIA-942-B §10.5', question:'¿Se realizan inspecciones periódicas de integridad física del backbone?', criticality:'Media', hint:'Inspección semestral recomendada: verificar conectores, radio de curvatura, sujeción de bandejas, estado de dust caps. Inspección anual con OTDR. Documentar en bitácora de mantenimiento.' },
  { id:25, cat:'Seguridad y acceso', norm:'TIA-942-B §10.6', question:'¿El backbone tiene protección contra interferencia electromagnética (EMI)?', criticality:'Baja', hint:'La fibra óptica es inmune a EMI, pero los conectores y equipos activos no. Verificar que los patch panels de fibra estén en gabinetes metálicos bondeados. Evitar proximidad a transformadores y motores.' },
];

// ─── Certification component ──────────────────────────────────────────────────
type CertAnswer = 'cumple' | 'no_cumple' | 'na' | null;
interface CertEval { id:string; date:string; evaluator:string; standard:string; score:number; answers: Record<number,CertAnswer>; notes: Record<number,string>; }

function BBNormativa({ items }: { items: BBItem[] }) {
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id ?? '');
  const [evals, setEvals] = useState<CertEval[]>([
    { id:'e1', date:'2024-03-15', evaluator:'Ing. García', standard:'TIA-568.3-D / TIA-942-B', score:88,
      answers: Object.fromEntries(CERT_QS.map(q=>[q.id, q.id<=22?'cumple':q.id===23?'no_cumple':'na'])) as Record<number,CertAnswer>,
      notes:{} },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [editingEval, setEditingEval] = useState<CertEval|null>(null);
  const [formAnswers, setFormAnswers] = useState<Record<number,CertAnswer>>({});
  const [formNotes, setFormNotes] = useState<Record<number,string>>({});
  const [formStd, setFormStd] = useState('TIA-568.3-D / TIA-942-B');
  const [formEval, setFormEval] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);

  const cats = Array.from(new Set(CERT_QS.map(q=>q.cat)));
  const selectedBB = items.find(i=>i.id===selectedId);

  const calcScore = (ans: Record<number,CertAnswer>) => {
    const applicable = CERT_QS.filter(q=>ans[q.id]!=='na' && ans[q.id]!==null);
    if (!applicable.length) return 0;
    const pass = applicable.filter(q=>ans[q.id]==='cumple').length;
    return Math.round((pass/applicable.length)*100);
  };

  const openNew = () => {
    setFormAnswers(Object.fromEntries(CERT_QS.map(q=>[q.id,null])) as Record<number,CertAnswer>);
    setFormNotes({});
    setFormStd('TIA-568.3-D / TIA-942-B');
    setFormEval('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setEditingEval(null);
    setShowForm(true);
  };

  const openEdit = (ev: CertEval) => {
    setFormAnswers({...ev.answers});
    setFormNotes({...ev.notes});
    setFormStd(ev.standard);
    setFormEval(ev.evaluator);
    setFormDate(ev.date);
    setEditingEval(ev);
    setShowForm(true);
  };

  const handleSave = () => {
    const score = calcScore(formAnswers);
    if (editingEval) {
      setEvals(es=>es.map(e=>e.id===editingEval.id?{...e,answers:formAnswers,notes:formNotes,standard:formStd,evaluator:formEval,date:formDate,score}:e));
    } else {
      setEvals(es=>[{id:`e${Date.now()}`,date:formDate,evaluator:formEval,standard:formStd,score,answers:formAnswers,notes:formNotes},...es]);
    }
    setShowForm(false);
  };

  const scoreColor = (s:number) => s>=90?'text-emerald-600 bg-emerald-50 border-emerald-200':s>=70?'text-amber-600 bg-amber-50 border-amber-200':'text-red-600 bg-red-50 border-red-200';
  const critColor = (c:string) => c==='Alta'?'text-red-600 bg-red-50':c==='Media'?'text-amber-600 bg-amber-50':'text-blue-600 bg-blue-50';

  if (showForm) {
    const liveScore = calcScore(formAnswers);
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={()=>setShowForm(false)} className="flex items-center gap-2 text-sm text-[#5C6194] hover:text-slate-700">
            <ChevronRight size={14} className="rotate-180"/>Volver al historial
          </button>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-sm ${scoreColor(liveScore)}`}>
            <BarChart2 size={14}/>{liveScore}% en tiempo real
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Estándar de referencia</label>
            <select value={formStd} onChange={e=>setFormStd(e.target.value)} className="w-full border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm">
              {['TIA-568.3-D / TIA-942-B','TIA-568.3-D','TIA-942-B','ISO/IEC 11801','ANSI/BICSI 002'].map(s=><option key={s}>{s}</option>)}
            </select></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Responsable</label>
            <input value={formEval} onChange={e=>setFormEval(e.target.value)} className="w-full border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm" placeholder="Nombre del evaluador"/></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Fecha</label>
            <input type="date" value={formDate} onChange={e=>setFormDate(e.target.value)} className="w-full border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm"/></div>
        </div>
        {cats.map(cat=>(
          <div key={cat} className="bg-slate-100 rounded-2xl border border-[#E8EBF4] overflow-hidden">
            <div className="px-5 py-3 bg-gradient-to-r from-violet-50 to-blue-50 border-b border-[#E8EBF4]">
              <h4 className="text-sm font-bold text-slate-800">{cat}</h4>
            </div>
            <div className="divide-y divide-[#F0F2FA]">
              {CERT_QS.filter(q=>q.cat===cat).map(q=>(
                <div key={q.id} className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">{q.id}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${critColor(q.criticality)}`}>{q.criticality}</span>
                        <span className="text-[12px] text-[#5C6194] font-mono">{q.norm}</span>
                      </div>
                      <p className="text-sm text-slate-700 font-medium">{q.question}</p>
                    </div>
                  </div>
                  {/* Hint */}
                  <div className="ml-9 flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                    <BookOpen size={12} className="text-blue-500 flex-shrink-0 mt-0.5"/>
                    <p className="text-[13px] text-blue-700 leading-relaxed">{q.hint}</p>
                  </div>
                  {/* Answer buttons */}
                  <div className="ml-9 flex items-center gap-2">
                    {(['cumple','no_cumple','na'] as CertAnswer[]).map(a=>(
                      <button key={a!} onClick={()=>setFormAnswers(prev=>({...prev,[q.id]:a}))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          formAnswers[q.id]===a
                            ? a==='cumple'?'bg-emerald-500 text-white border-emerald-500'
                              : a==='no_cumple'?'bg-red-500 text-white border-red-500'
                              : 'bg-slate-400 text-white border-slate-400'
                            : 'bg-slate-100 text-slate-500 border-[#E8EBF4] hover:border-slate-400'
                        }`}>
                        {a==='cumple'?<><CheckCircle size={11}/>Cumple</>:a==='no_cumple'?<><XCircle size={11}/>No cumple</>:<><Minus size={11}/>N/A</>}
                      </button>
                    ))}
                    <input value={formNotes[q.id]||''} onChange={e=>setFormNotes(prev=>({...prev,[q.id]:e.target.value}))}
                      className="flex-1 border border-[#E8EBF4] rounded-xl px-3 py-1.5 text-xs" placeholder="Nota opcional..."/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={()=>setShowForm(false)} className="px-5 py-2 rounded-xl border border-[#E8EBF4] text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleSave} className="px-6 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700">
            {editingEval?'Guardar cambios':'Guardar evaluación'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Backbone a evaluar</label>
          <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} className="w-full border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm">
            {items.map(i=><option key={i.id} value={i.id}>{i.codigo} — {i.idf_origen} → {i.idf_destino}</option>)}
          </select>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 mt-4">
          <Plus size={14}/>Nueva evaluación
        </button>
      </div>
      {selectedBB && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div><span className="text-slate-500">Código:</span> <span className="font-semibold text-slate-800">{selectedBB.codigo}</span></div>
          <div><span className="text-slate-500">Tipo fibra:</span> <span className="font-semibold text-slate-800">{selectedBB.tipo_fibra}</span></div>
          <div><span className="text-slate-500">Ruta:</span> <span className="font-semibold text-slate-800">{selectedBB.idf_origen} → {selectedBB.idf_destino}</span></div>
          <div><span className="text-slate-500">Longitud:</span> <span className="font-semibold text-slate-800">{selectedBB.longitud}</span></div>
        </div>
      )}
      {evals.length === 0 && <div className="text-center py-12 text-slate-500 text-sm">No hay evaluaciones registradas para este backbone.</div>}
      {evals.map(ev=>(
        <div key={ev.id} className="bg-slate-100 rounded-2xl border border-[#E8EBF4] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-bold text-slate-800">{ev.date} — {ev.evaluator}</div>
              <div className="text-xs text-[#5C6194]">{ev.standard}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-xl border text-sm font-bold ${scoreColor(ev.score)}`}>{ev.score}%</span>
              <button onClick={()=>openEdit(ev)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E8EBF4] text-xs text-slate-600 hover:bg-slate-50">
                <Edit2 size={11}/>Editar
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {(['cumple','no_cumple','na'] as const).map(a=>{
              const count = CERT_QS.filter(q=>ev.answers[q.id]===a).length;
              return <div key={a} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${a==='cumple'?'bg-emerald-50 text-emerald-700':a==='no_cumple'?'bg-red-50 text-red-700':'bg-slate-50 text-slate-600'}`}>
                {a==='cumple'?<CheckCircle size={12}/>:a==='no_cumple'?<XCircle size={12}/>:<Minus size={12}/>}
                <span className="font-semibold">{count}</span>
                <span>{a==='cumple'?'Cumple':a==='no_cumple'?'No cumple':'N/A'}</span>
              </div>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Row component ─────────────────────────────────────────────────────────────
function BBRow({ item, onEdit, onDelete }: { item:BBItem; onEdit:(i:BBItem)=>void; onDelete:(id:string)=>void }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = (s:BBStatus) => s==='Activo'?'text-emerald-700 bg-emerald-50 border-emerald-200':s==='Inactivo'?'text-slate-600 bg-[#F0F2FA] border-[#E8EBF4]':s==='Baja'?'text-red-600 bg-red-50 border-red-200':'text-amber-600 bg-amber-50 border-amber-200';
  const fiberColor = (f:FiberType) => f==='OM4'?'bg-violet-100 text-violet-700':f==='OM3'?'bg-cyan-100 text-cyan-700':f==='OM2'?'bg-blue-100 text-blue-700':f.startsWith('OS')?'bg-yellow-100 text-yellow-700':'bg-slate-100 text-slate-700';

  return (
    <>
      <div
        className={`grid items-center gap-2 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors border-b border-[#E8EBF4] text-sm ${expanded?'bg-violet-50 border-l-4 border-l-violet-500':'border-l-4 border-l-transparent'}`}
        style={{gridTemplateColumns:'1.5rem 1fr 1fr 1fr 1fr 1fr 1fr 5rem'}}
        onClick={()=>setExpanded(e=>!e)}
      >
        <span className="text-slate-500">{expanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</span>
        <span className="font-mono text-xs font-semibold text-violet-700">{item.codigo}</span>
        <span className="text-slate-700 font-medium">{item.marca}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold w-fit ${fiberColor(item.tipo_fibra)}`}>{item.tipo_fibra}</span>
        <span className="text-slate-600 text-xs">{item.idf_origen} → {item.idf_destino}</span>
        <span className="text-slate-600 text-xs">{item.hilos} / {item.longitud}</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border w-fit ${statusColor(item.status)}`}>{item.status}</span>
        <div className="flex gap-1" onClick={e=>e.stopPropagation()}>
          <button onClick={()=>onEdit(item)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-500 hover:text-blue-600"><Edit2 size={13}/></button>
          <button onClick={()=>onDelete(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600"><Trash2 size={13}/></button>
        </div>
      </div>
      {expanded && (
        <div className="border-b border-[#E8EBF4] bg-gradient-to-r from-violet-50 to-indigo-50/70 border-t-2 border-t-violet-300 border-l-4 border-l-violet-500 px-6 py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
            <div><span className="text-slate-500 block mb-0.5">Panel MDF</span><span className="font-semibold text-slate-800">{item.panel_mdf||'—'}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Panel IDF</span><span className="font-semibold text-slate-800">{item.panel_idf||'—'}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Jumper</span><span className="font-semibold text-slate-800">{item.jumper}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Switch ref.</span><span className="font-semibold text-slate-800">{item.switch_ref||'—'}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Hilos</span><span className="font-semibold text-slate-800">{item.hilos}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Longitud</span><span className="font-semibold text-slate-800">{item.longitud}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Normativa</span><span className={`font-semibold ${item.normativa?'text-emerald-600':'text-red-500'}`}>{item.normativa?'Sí':'No'}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Cert. Fluke</span><span className="font-semibold text-slate-800">{item.certificado_fluke||'—'}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Integrador</span><span className="font-semibold text-slate-800">{item.integrador||'—'}</span></div>
            <div><span className="text-slate-500 block mb-0.5">PO</span><span className="font-semibold text-slate-800">{item.po||'—'}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Costo</span><span className="font-semibold text-slate-800">{item.costo_dls?`$${item.costo_dls.toLocaleString()} USD`:'—'}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Centro de Costos</span><span className="font-semibold text-slate-800">{item.centro_costos||'—'}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Etiqueta RFID</span><span className="font-mono text-xs font-semibold text-violet-700">{item.rfid||'—'}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Año instalación</span><span className="font-semibold text-slate-800">{item.anio_instalacion}</span></div>
            <div><span className="text-slate-500 block mb-0.5">Ver en plano</span><span className={`font-semibold ${item.ver_plano?'text-blue-600':'text-slate-500'}`}>{item.ver_plano?'Sí':'No'}</span></div>
          </div>
          {item.observaciones && <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 mb-4"><AlertTriangle size={11} className="inline mr-1"/>{item.observaciones}</div>}
          <div className="flex gap-2">
            <button onClick={()=>onEdit(item)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700"><Edit2 size={11}/>Editar</button>
            <button onClick={()=>onDelete(item.id)} className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-50"><Trash2 size={11}/>Eliminar</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function BBModal({ item, onClose, onSave }: { item:Partial<BBItem>|null; onClose:()=>void; onSave:(i:BBItem)=>void }) {
  const [form, setForm] = useState<Partial<BBItem>>(item ?? {
    codigo:'', marca:'Panduit', tipo_fibra:'OM4', idf_origen:'', idf_destino:'',
    panel_mdf:'', panel_idf:'', jumper:'7 Pies', switch_ref:'', hilos:'6 hilos',
    longitud:'', ver_plano:false, normativa:false, certificado_fluke:'',
    integrador:'', po:'', costo_dls:0, centro_costos:'', rfid:'', anio_instalacion:new Date().getFullYear(),
    status:'Activo', observaciones:'', foto:'',
  });
  const set = (k:keyof BBItem, v:unknown) => setForm(f=>({...f,[k]:v}));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EBF4]">
          <h3 className="text-base font-bold text-[#1A1D2E]">{item?.id?'Editar Backbone':'Nuevo Backbone'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X size={16}/></button>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {([
            ['codigo','Código','text'],['marca','Marca','text'],
          ] as [keyof BBItem,string,string][]).map(([k,l,t])=>(
            <div key={k}><label className="block text-xs font-semibold text-slate-600 mb-1">{l}</label>
              <input type={t} value={(form[k]??'') as string} onChange={e=>set(k,e.target.value)} className="w-full border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm"/></div>
          ))}
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Fibra</label>
            <select value={form.tipo_fibra} onChange={e=>set('tipo_fibra',e.target.value)} className="w-full border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm">
              {(['OM2','OM3','OM4','OS1','OS2','UTP Cat6','UTP Cat6A'] as FiberType[]).map(f=><option key={f}>{f}</option>)}
            </select></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
            <select value={form.status} onChange={e=>set('status',e.target.value)} className="w-full border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm">
              {(['Activo','Inactivo','Baja','En mantenimiento'] as BBStatus[]).map(s=><option key={s}>{s}</option>)}
            </select></div>
          {([
            ['idf_origen','IDF Origen'],['idf_destino','IDF Destino'],
            ['panel_mdf','Panel Distribución MDF'],['panel_idf','Panel Distribución IDF'],
            ['switch_ref','Switch'],['hilos','Hilos'],['longitud','Longitud'],
            ['integrador','Integrador'],['po','PO'],['certificado_fluke','Certificado Fluke'],
            ['rfid','Etiqueta RFID'],['centro_costos','Centro de Costos'],
          ] as [keyof BBItem,string][]).map(([k,l])=>(
            <div key={k}><label className="block text-xs font-semibold text-slate-600 mb-1">{l}</label>
              <input value={(form[k]??'') as string} onChange={e=>set(k,e.target.value)} className="w-full border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm"/></div>
          ))}
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Jumper</label>
            <select value={form.jumper} onChange={e=>set('jumper',e.target.value)} className="w-full border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm">
              {(['3 Pies','7 Pies','10 Pies','15 Pies','20 Pies','Otro'] as JumperLen[]).map(j=><option key={j}>{j}</option>)}
            </select></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Costo (USD)</label>
            <input type="number" value={form.costo_dls??0} onChange={e=>set('costo_dls',Number(e.target.value))} className="w-full border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm"/></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Año de instalación</label>
            <input type="number" value={form.anio_instalacion??2024} onChange={e=>set('anio_instalacion',Number(e.target.value))} className="w-full border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm"/></div>
          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!form.normativa} onChange={e=>set('normativa',e.target.checked)} className="rounded"/>
              <span className="text-slate-700 font-medium">Certificado</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!form.ver_plano} onChange={e=>set('ver_plano',e.target.checked)} className="rounded"/>
              <span className="text-slate-700 font-medium">Ver en plano</span>
            </label>
          </div>
          <div className="md:col-span-2"><label className="block text-xs font-semibold text-slate-600 mb-1">Observaciones</label>
            <textarea value={form.observaciones??''} onChange={e=>set('observaciones',e.target.value)} rows={2} className="w-full border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm resize-none"/></div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#E8EBF4]">
          <button onClick={onClose} className="px-5 py-2 rounded-xl border border-[#E8EBF4] text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={()=>onSave({...form,id:form.id??`bb${Date.now()}`} as BBItem)} className="px-6 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700">Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function BackbonePage() {
  const router = useRouter();
  const highlightCode = typeof router.query.highlight === 'string' ? decodeURIComponent(router.query.highlight) : undefined;
  const [items, setItems] = useState<BBItem[]>([]);

  // Cargar backbone del backend al montar
  useEffect(() => {
    import('axios').then(({ default: axios }) => {
      axios.get('/api/infra/backbone')
        .then(res => setItems(Array.isArray(res.data) ? res.data : []))
        .catch(() => setItems([]));
    });
  }, []);
  const [activeTab, setActiveTab] = useState<'resumen'|'inventario'|'normativa'|'topologia'>('inventario');
  const [search, setSearch] = useState(highlightCode||'');
  const [highlightedId, setHighlightedId] = useState<string|null>(null);
  const bbRowRefs = useRef<Record<string,HTMLDivElement|null>>({});
  const didHLBB = useRef(false);
  const [filterFiber, setFilterFiber] = useState('Todos');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [modal, setModal] = useState<Partial<BBItem>|null|false>(false);
  const [showBBWizard, setShowBBWizard] = useState(false);

  const filtered = useMemo(()=>items.filter(i=>{
    const q = search.toLowerCase();
    const matchQ = !q || i.codigo.toLowerCase().includes(q)||i.marca.toLowerCase().includes(q)||i.idf_origen.toLowerCase().includes(q)||i.idf_destino.toLowerCase().includes(q)||i.integrador.toLowerCase().includes(q);
    const matchF = filterFiber==='Todos'||i.tipo_fibra===filterFiber;
    const matchS = filterStatus==='Todos'||i.status===filterStatus;
    return matchQ&&matchF&&matchS;
  }),[items,search,filterFiber,filterStatus]);

  // Scroll + highlight desde búsqueda global
  useEffect(() => {
    if (!highlightCode || didHLBB.current) return;
    setSearch(highlightCode);
    const t = setTimeout(() => {
      const match = items.find(i =>
        i.codigo === highlightCode || i.codigo.toLowerCase().includes(highlightCode.toLowerCase())
      );
      if (!match) return;
      setHighlightedId(match.id);
      didHLBB.current = true;
      const el = bbRowRefs.current[match.id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        setHighlightedId(null);
        const { highlight: _h, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
      }, 2500);
    }, 300);
    return () => clearTimeout(t);
  }, [highlightCode, items]);

  const totalHilos = items.reduce((a,i)=>a+parseInt(i.hilos)||0,0);
  const totalLong = items.reduce((a,i)=>a+parseFloat(i.longitud)||0,0);
  const certCount = items.filter(i=>i.normativa).length;
  const totalCost = items.reduce((a,i)=>a+(i.costo_dls||0),0);

  const fiberTypes = Array.from(new Set(items.map(i=>i.tipo_fibra)));
  const fiberGroups = fiberTypes.map(f=>({ type:f, count:items.filter(i=>i.tipo_fibra===f).length }));

  const handleSave = (i:BBItem) => {
    setItems(prev=>prev.find(p=>p.id===i.id)?prev.map(p=>p.id===i.id?i:p):[...prev,i]);
    setModal(false);
  };

  const fiberColor = (f:string) => f==='OM4'?'bg-violet-500':f==='OM3'?'bg-cyan-500':f==='OM2'?'bg-blue-500':f.startsWith('OS')?'bg-yellow-500':'bg-slate-400';

  return (
    <AppLayout>
      <Head><title>Backbone | SKIA DCIM</title></Head>
      {modal!==false && <BBModal item={modal||null} onClose={()=>setModal(false)} onSave={handleSave}/>}
      {showBBWizard && (
        <BackboneWizard
          onClose={() => setShowBBWizard(false)}
          onSave={(data: BackboneWizardData) => {
            const newBB: BBItem = {
              id: Date.now().toString(),
              codigo: data.codigo,
              marca: data.marca ?? '',
              tipo_fibra: data.tipo_fibra as any,
              hilos: data.hilos ?? '',
              longitud: data.longitud ?? '',
              idf_origen: data.idf_origen,
              idf_destino: data.idf_destino,
              panel_mdf: data.panel_mdf ?? '',
              panel_idf: data.panel_idf ?? '',
              jumper: (data.jumper ?? '7 Pies') as any,
              switch_ref: data.switch_ref ?? '',
              ver_plano: data.ver_plano ?? false,
              status: data.status as any,
              normativa: data.normativa ?? false,
              certificado_fluke: data.certificado_fluke ?? '',
              integrador: data.integrador ?? '',
              po: data.po ?? '',
              costo_dls: data.costo_dls ?? 0,
              centro_costos: data.centro_costos ?? '',
              rfid: data.rfid ?? '',
              anio_instalacion: data.anio_instalacion ?? new Date().getFullYear(),
              observaciones: data.observaciones ?? '',
              foto: '',
            };
            // Persistir en el backend
            axios.post('/api/infra/backbone', {
              internal_code: data.codigo,
              fiber_type: data.tipo_fibra ?? 'OM4',
              strands: data.hilos ?? '',
              length_m: parseFloat(data.longitud ?? '0') || 0,
              origin_mdf_idf: data.idf_origen,
              dest_mdf_idf: data.idf_destino,
              status: data.status === 'Activo' ? 'active' : 'inactive',
              brand: data.marca ?? '',
              installer: data.integrador ?? '',
              cost_usd: data.costo_dls ?? 0,
              cost_center: data.centro_costos ?? '',
              observations: data.observaciones ?? '',
            }).then(resp => {
              setItems(prev => [{ ...newBB, id: resp.data.id ?? newBB.id }, ...prev]);
            }).catch(() => {
              setItems(prev => [newBB, ...prev]);
            });
            setShowBBWizard(false);
          }}
        />
      )}

      <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg">
              <Cable size={20} className="text-white"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Backbone</h1>
              <p className="text-sm text-[#5C6194]">Gestión de cableado backbone de fibra óptica y cobre</p>
            </div>
          </div>
          <button onClick={()=>setShowBBWizard(true)} className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 shadow-lg shadow-violet-200">
            <Plus size={16}/>Nuevo Backbone
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
          {([['resumen','Resumen'],['inventario','Inventario'],['normativa','Normativa'],['topologia','Topología']] as const).map(([k,l])=>(
            <button key={k} onClick={()=>setActiveTab(k)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab===k?'bg-slate-100 text-violet-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{l}</button>
          ))}
        </div>

        {/* ── EMPTY STATE ── */}
        {items.length === 0 && (
          <ModuleEmptyState
            icon={<Cable size={36} className="text-violet-600" />}
            title="Sin backbones registrados"
            description="El backbone es la columna vertebral de tu red. Registra cada enlace de fibra óptica o cobre con su ruta, hilos, longitud y estado para tener visibilidad total de la conectividad entre edificios y pisos."
            features={[
              { icon: <Cable size={14}/>, text: 'Inventario de enlaces de fibra óptica y cobre' },
              { icon: <Layers size={14}/>, text: 'Control de hilos y capacidad por enlace' },
              { icon: <AlertTriangle size={14}/>, text: 'Evaluación de normativa TIA-568-C' },
              { icon: <MapPin size={14}/>, text: 'Topología visual de la red' },
            ]}
            wizardLabel="Registrar primer Backbone"
            onOpenWizard={() => setShowBBWizard(true)}
            accentColor="violet"
          />
        )}
        {/* ── RESUMEN ── */}
        {items.length > 0 && activeTab==='resumen' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label:'Total Backbones', value:items.length, sub:'registrados', icon:<Cable size={20}/>, color:'from-violet-500 to-purple-600' },
                { label:'Hilos totales', value:totalHilos, sub:'en toda la red', icon:<Layers size={20}/>, color:'from-blue-500 to-cyan-600' },
                { label:'Longitud total', value:`${totalLong.toFixed(0)} m`, sub:'de fibra instalada', icon:<ArrowRight size={20}/>, color:'from-emerald-500 to-teal-600' },
                { label:'Inversión total', value:`$${totalCost.toLocaleString()}`, sub:'USD en backbone', icon:<Package size={20}/>, color:'from-amber-500 to-orange-600' },
              ].map((k,i)=>(
                <div key={i} className="bg-slate-100 rounded-2xl border border-[#E8EBF4] p-5 shadow-sm">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${k.color} flex items-center justify-center text-white mb-3`}>{k.icon}</div>
                  <div className="text-2xl font-bold text-slate-800">{k.value}</div>
                  <div className="text-sm font-semibold text-slate-700">{k.label}</div>
                  <div className="text-xs text-[#5C6194]">{k.sub}</div>
                </div>
              ))}
            </div>
            {/* Normativa */}
            <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2"><CheckCircle size={14} className="text-emerald-500"/>Estado de normativa</h3>
              <div className="flex items-center gap-4 mb-2">
                <span className="text-2xl font-bold text-emerald-600">{certCount}</span>
                <span className="text-sm text-[#5C6194]">de {items.length} backbones certificados</span>
                <span className="ml-auto text-sm font-bold text-[#1A1D2E]">{Math.round((certCount/items.length)*100)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3">
                <div className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-3 rounded-full transition-all" style={{width:`${Math.round((certCount/items.length)*100)}%`}}/>
              </div>
            </div>
            {/* Por tipo de fibra */}
            <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2"><BarChart2 size={14} className="text-violet-500"/>Distribución por tipo de fibra</h3>
              <div className="space-y-3">
                {fiberGroups.map(g=>(
                  <div key={g.type} className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-600 w-20">{g.type}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2">
                      <div className={`${fiberColor(g.type)} h-2 rounded-full`} style={{width:`${(g.count/items.length)*100}%`}}/>
                    </div>
                    <span className="text-xs font-bold text-[#1A1D2E] w-8 text-right">{g.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── INVENTARIO ── */}
        {items.length > 0 && activeTab==='inventario' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-[#F0F2FA] border border-[#E8EBF4] rounded-xl px-3 py-2 flex-1 min-w-48">
                <Search size={14} className="text-slate-500"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por código, marca, IDF, integrador..." className="flex-1 text-sm outline-none bg-transparent"/>
              </div>
              <select value={filterFiber} onChange={e=>setFilterFiber(e.target.value)} className="border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm bg-slate-100">
                <option>Todos</option>
                {(['OM2','OM3','OM4','OS1','OS2','UTP Cat6','UTP Cat6A']).map(f=><option key={f}>{f}</option>)}
              </select>
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="border border-[#E8EBF4] rounded-xl px-3 py-2 text-sm bg-slate-100">
                <option>Todos</option>
                {(['Activo','Inactivo','Baja','En mantenimiento']).map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="bg-slate-100 rounded-2xl border border-[#E8EBF4] overflow-hidden shadow-sm">
              {/* Header */}
              <div className="grid px-4 py-3 bg-[#F8F9FE] border-b border-[#E8EBF4] text-xs font-bold text-slate-500 uppercase tracking-wide"
                style={{gridTemplateColumns:'1.5rem 1fr 1fr 1fr 1fr 1fr 1fr 5rem'}}>
                <span/>
                <span>Código</span><span>Marca</span><span>Tipo Fibra</span>
                <span>Ruta</span><span>Hilos / Long.</span><span>Estado</span><span>Acciones</span>
              </div>
              {filtered.length===0 && <div className="text-center py-12 text-slate-500 text-sm">No se encontraron backbones.</div>}
              {filtered.map(i=>(
                <div key={i.id} ref={el=>{ bbRowRefs.current[i.id]=el as HTMLDivElement|null; }} className={highlightedId===i.id?'skia-highlight-row':''}>
                  <BBRow item={i} onEdit={i=>setModal(i)} onDelete={id=>setItems(prev=>prev.filter(p=>p.id!==id))}/>
                </div>
              ))}
            </div>
            <div className="text-xs text-[#5C6194] text-right">{filtered.length} de {items.length} registros</div>
          </div>
        )}

        {/* ── CERTIFICACIÓN ── */}
        {items.length > 0 && activeTab==='normativa' && <BBNormativa items={items}/>}
        {/* ── TOPOLOGÍA ── */}
        {items.length > 0 && activeTab==='topologia' && <BackboneTopoView items={items}/>}
      </div>
    </AppLayout>
  );
}
