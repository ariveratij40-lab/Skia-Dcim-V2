import { useEffect, useRef } from 'react';
import { Check, Lock, RefreshCw, X, Building2, MapPin, Database, Grid3x3 } from 'lucide-react';
import type { InfrastructureReadiness, InfrastructureReadinessStep, ReadinessActionTarget } from '../hooks/useInfrastructureReadiness';

interface Props {
  data: InfrastructureReadiness | null;
  loading: boolean;
  error: string | null;
  darkMode: boolean;
  onClose: () => void;
  onRetry: () => void;
  onAction: (target: ReadinessActionTarget) => void;
}

const LABELS: Record<InfrastructureReadinessStep['key'], string> = {
  branch: 'Sucursal', site: 'Sitio', internal_area: 'Área interna', mdf_idf: 'MDF / IDF', rack: 'Rack',
};
const ICONS = { branch: Building2, site: Building2, internal_area: MapPin, mdf_idf: Database, rack: Grid3x3 };

export default function InfrastructureReadinessWizard({ data, loading, error, darkMode, onClose, onRetry, onAction }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);
  const surface = darkMode ? '#252840' : '#FFFFFF';
  const text = darkMode ? '#E8EAF6' : '#1A1D2E';
  const muted = darkMode ? '#9EA3C8' : '#5C6194';
  const border = darkMode ? '#3D4270' : '#E8EBF4';
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="readiness-title" aria-describedby="readiness-description" tabIndex={-1} style={{ position:'fixed', inset:0, zIndex:90, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(15,23,42,.48)', backdropFilter:'blur(4px)' }}>
      <section style={{ width:'min(620px,100%)', maxHeight:'90vh', overflowY:'auto', borderRadius:18, border:`1px solid ${border}`, background:surface, color:text, boxShadow:'0 24px 70px rgba(15,23,42,.3)' }}>
        <header style={{ display:'flex', justifyContent:'space-between', gap:16, padding:'20px 22px 14px', borderBottom:`1px solid ${border}` }}>
          <div><h2 id="readiness-title" style={{ margin:0, fontSize:20 }}>Configure su infraestructura</h2><p id="readiness-description" style={{ margin:'6px 0 0', color:muted, fontSize:13 }}>SKIA necesita conocer la estructura física antes de registrar equipos.</p></div>
          <button ref={closeButtonRef} aria-label="Cerrar" onClick={onClose} style={{ border:0, background:'transparent', color:muted, cursor:'pointer', height:32 }}><X size={18}/></button>
        </header>
        <div style={{ padding:22 }}>
          {loading && !data ? <div style={{ display:'flex', alignItems:'center', gap:8, color:muted }}><RefreshCw size={16} className="animate-spin"/> Consultando configuración…</div> : error && !data ? <div style={{ padding:14, borderRadius:10, background:darkMode?'#3b2530':'#FEF2F2', color:darkMode?'#FCA5A5':'#B91C1C' }}>{error}<button onClick={onRetry} style={{ marginLeft:12 }}>Reintentar</button></div> : data && <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'end', gap:12, marginBottom:14 }}><div><div style={{ color:muted, fontSize:11, textTransform:'uppercase', fontWeight:700 }}>Sucursal activa</div><div style={{ marginTop:3, fontWeight:800 }}>{data.branch.name} <span style={{ color:muted, fontWeight:600 }}>· {data.branch.code}</span></div></div><strong style={{ color:'#4361EE' }}>{data.progress.required_complete} / {data.progress.required_total}</strong></div>
            <div aria-label={`Progreso ${data.progress.percent}%`} style={{ height:8, borderRadius:99, background:darkMode?'#2D3154':'#EEF0F8', overflow:'hidden', marginBottom:18 }}><div style={{ width:`${data.progress.percent}%`, height:'100%', background:'#4361EE', transition:'width .2s' }}/></div>
            <div style={{ display:'grid', gap:9 }}>{data.steps.map(step => { const Icon=ICONS[step.key]; const complete=step.status==='complete'; const blocked=step.status==='blocked'; const actionLabel=step.action?.target==='rack_create'?'Ir a Racks':complete?'Agregar':'Crear'; return <div key={step.key} style={{ display:'grid', gridTemplateColumns:'32px 1fr auto', gap:10, alignItems:'center', padding:12, border:`1px solid ${border}`, borderRadius:12, opacity:blocked ? 0.78 : 1 }}><div style={{ width:32,height:32,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',background:complete?'#ECFDF5':blocked?(darkMode?'#2D3154':'#F1F5F9'):'#EEF2FF',color:complete?'#059669':blocked?muted:'#4361EE' }}>{complete?<Check size={16}/>:blocked?<Lock size={14}/>:<Icon size={15}/>}</div><div><div style={{ display:'flex',alignItems:'center',gap:7,fontWeight:750,fontSize:14 }}>{LABELS[step.key]} {step.count>0&&<span style={{ color:muted,fontSize:11,fontWeight:600 }}>{step.count} registrado{step.count===1?'':'s'}</span>}{!step.required&&<span style={{ color:muted,fontSize:10 }}>OPCIONAL</span>}</div><div style={{ color:muted,fontSize:12,marginTop:3 }}>{step.message}</div>{Boolean(step.unresolved_count)&&<div style={{ color:'#D97706',fontSize:11,marginTop:3 }}>{step.unresolved_count} Rack legacy no cuenta por relación incompleta.</div>}</div>{step.action&&!blocked&&<button onClick={()=>onAction(step.action!.target)} style={{ border:0,borderRadius:9,padding:'8px 10px',background:complete?'transparent':'#4361EE',color:complete?'#4361EE':'#fff',cursor:'pointer',fontSize:11,fontWeight:700 }}>{actionLabel}</button>}</div>})}</div>
            <div style={{ marginTop:16, padding:12, borderRadius:10, background:darkMode?'#202A46':'#EFF6FF', color:darkMode?'#BFDBFE':'#1E40AF', fontSize:12 }}><strong>SKIA genera el código automáticamente.</strong><br/>Vista previa conceptual: MDF-TJ-PARQUE-PROD-###. La vista previa es orientativa; el consecutivo definitivo se reserva al guardar.</div>
          </>}
        </div>
      </section>
    </div>
  );
}
