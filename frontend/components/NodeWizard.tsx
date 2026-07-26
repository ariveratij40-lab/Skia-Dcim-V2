import React, { useState, useRef } from 'react';
import {
  X, ChevronRight, ChevronLeft, Check,
  MapPin, Cpu, Camera, Link2, ClipboardCheck,
  UploadCloud, Eye, AlertCircle, Info,
} from 'lucide-react';
import {
  MARCAS_CABLE, CATEGORIAS_CABLE, CLASIFICACIONES_CABLE,
  TIPOS_SERVICIO, ESTADOS_ACTIVO, NIVELES_MICE,
  COLORES_CABLE, NORMAS, TIPOS_CERTIFICACION,
  LONGITUDES_PATCHCORD, LONGITUDES_CABLE, AREAS_COMUNES,
  INTEGRADORES, ANIOS_INSTALACION,
} from '@/data/catalogos';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface NodeWizardData {
  id: string;
  // Etapa 1 — Alta rápida
  codigo: string;
  idf: string;
  area: string;
  servicio: string;
  estado: string;
  responsable: string;
  // Etapa 2 — Técnico
  marca: string;
  numParte: string;
  categoria: string;
  clasificacion: string;
  color: string;
  mice: string;
  gama: string;
  longitud: string;
  patchcordInterno: string;
  anioInstalacion: number;
  // Etapa 3 — Fotos y documentos
  foto: string;
  docFluke: string;
  docFlukeUrl: string;
  docPanduit: string;
  docPanduitUrl: string;
  certificadoFluke: boolean;
  // Etapa 4 — Relaciones
  patchpanel: string;
  switchDestino: string;
  verEnPlano: string;
  etiquetaRFID: string;
  integrador: string;
  po: string;
  costo: number;
  centroCostos: string;
  // Etapa 5 — Normativa
  normativa: boolean;
  observaciones: string;
}

interface Props {
  item?: NodeWizardData | null;
  onClose: () => void;
  onSave: (data: NodeWizardData) => void;
}

// ─── Etapas ───────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Alta rápida',   icon: MapPin,          desc: 'Datos esenciales para empezar' },
  { id: 2, label: 'Técnico',       icon: Cpu,             desc: 'Especificaciones del cable' },
  { id: 3, label: 'Documentos',    icon: Camera,          desc: 'Fotos, Fluke y Panduit' },
  { id: 4, label: 'Relaciones',    icon: Link2,           desc: 'Conexiones y trazabilidad' },
  { id: 5, label: 'Normativa',     icon: ClipboardCheck,  desc: 'Certificación y observaciones' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const blank: NodeWizardData = {
  id: '', codigo: '', idf: '', area: '', servicio: 'Datos', estado: 'Activo', responsable: '',
  marca: 'Panduit', numParte: '', categoria: '6', clasificacion: 'CMR', color: 'Azul',
  mice: 'Bajo', gama: '', longitud: '', patchcordInterno: '3 Pies', anioInstalacion: 2025,
  foto: '', docFluke: '', docFlukeUrl: '', docPanduit: '', docPanduitUrl: '', certificadoFluke: false,
  patchpanel: '', switchDestino: '', verEnPlano: '', etiquetaRFID: '', integrador: '', po: '',
  costo: 0, centroCostos: '', normativa: false, observaciones: '',
};

// ─── Shared styles ────────────────────────────────────────────────────────────
const inp = {
  width: '100%', padding: '9px 12px',
  background: '#F8FAFF', border: '1px solid #E2E8F0',
  borderRadius: '8px', color: '#1E293B', fontSize: '0.85rem',
  outline: 'none', boxSizing: 'border-box' as const,
};
const lbl = { fontSize: '0.72rem', fontWeight: 600, color: '#64748B', marginBottom: '4px', display: 'block', textTransform: 'uppercase' as const, letterSpacing: '0.04em' };
const fieldWrap = { display: 'flex', flexDirection: 'column' as const };

function Field({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div style={fieldWrap}>
      <label style={lbl}>{label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}</label>
      {children}
      {hint && <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 3 }}>{hint}</span>}
    </div>
  );
}

function SelectCatalog({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string; descripcion?: string }[];
  placeholder?: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inp}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value} title={o.descripcion}>{o.label}</option>
      ))}
    </select>
  );
}

function ChipSelector({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string; color?: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {options.map(o => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: '5px 12px', borderRadius: '20px', cursor: 'pointer',
              fontSize: '0.78rem', fontWeight: active ? 700 : 500,
              border: `1.5px solid ${active ? (o.color || '#4b8ef5') : '#E2E8F0'}`,
              background: active ? (o.color ? o.color + '22' : '#EFF6FF') : '#F8FAFF',
              color: active ? (o.color || '#4b8ef5') : '#64748B',
              transition: 'all 0.12s',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Step 1: Alta rápida ──────────────────────────────────────────────────────
function Step1({ form, set }: { form: NodeWizardData; set: (k: keyof NodeWizardData, v: any) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Info size={16} color="#2563EB" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: '0.78rem', color: '#1e40af', margin: 0, lineHeight: 1.5 }}>
          Solo necesitas <strong>5 campos</strong> para crear el nodo. Puedes completar los detalles técnicos, fotos y relaciones después.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Field label="Código del nodo" required hint="Ej: NOD-IDF1-0001">
          <input value={form.codigo} onChange={e => set('codigo', e.target.value)} style={inp} placeholder="NOD-IDF1-0001" />
        </Field>
        <Field label="IDF / MDF de origen" required hint="Cuarto técnico donde termina el cable">
          <input value={form.idf} onChange={e => set('idf', e.target.value)} style={inp} placeholder="IDF1-P1-E2" />
        </Field>
      </div>

      <Field label="Área / Zona de trabajo" required hint="Dónde está físicamente el nodo">
        <SelectCatalog
          value={form.area}
          onChange={v => set('area', v)}
          options={AREAS_COMUNES.map(a => ({ value: a, label: a }))}
          placeholder="— Seleccionar área —"
        />
      </Field>

      <Field label="Tipo de servicio">
        <ChipSelector
          value={form.servicio}
          onChange={v => set('servicio', v)}
          options={TIPOS_SERVICIO.map(s => ({ value: s.value, label: s.label, color: s.color }))}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Field label="Estado">
          <ChipSelector
            value={form.estado}
            onChange={v => set('estado', v)}
            options={ESTADOS_ACTIVO.map(e => ({ value: e.value, label: e.label, color: e.color }))}
          />
        </Field>
        <Field label="Responsable técnico">
          <input value={form.responsable} onChange={e => set('responsable', e.target.value)} style={inp} placeholder="Ing. García" />
        </Field>
      </div>
    </div>
  );
}

// ─── Step 2: Técnico ──────────────────────────────────────────────────────────
function Step2({ form, set }: { form: NodeWizardData; set: (k: keyof NodeWizardData, v: any) => void }) {
  const catInfo = CATEGORIAS_CABLE.find(c => c.value === form.categoria);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Field label="Marca">
          <SelectCatalog value={form.marca} onChange={v => set('marca', v)} options={MARCAS_CABLE.map(m => ({ value: m, label: m }))} />
        </Field>
        <Field label="Número de parte">
          <input value={form.numParte} onChange={e => set('numParte', e.target.value)} style={inp} placeholder="PUR6C04BU-F" />
        </Field>
      </div>

      <Field label="Categoría de cable">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {CATEGORIAS_CABLE.map(c => {
            const active = form.categoria === c.value;
            return (
              <button key={c.value} type="button" onClick={() => set('categoria', c.value)} style={{
                padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
                fontSize: '0.78rem', fontWeight: active ? 700 : 500,
                border: `1.5px solid ${active ? '#4b8ef5' : '#E2E8F0'}`,
                background: active ? '#EFF6FF' : '#F8FAFF',
                color: active ? '#2563EB' : '#64748B',
              }}>
                {c.label}
              </button>
            );
          })}
        </div>
        {catInfo && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '8px', fontSize: '0.75rem', color: '#0369a1', display: 'flex', gap: 16 }}>
            <span>📋 {catInfo.norm}</span>
            <span>📡 {catInfo.maxFreq}</span>
            <span>⚡ {catInfo.maxVelocidad}</span>
          </div>
        )}
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Field label="Clasificación de cable">
          <SelectCatalog
            value={form.clasificacion}
            onChange={v => set('clasificacion', v)}
            options={CLASIFICACIONES_CABLE.map(c => ({ value: c.value, label: c.label, descripcion: c.descripcion }))}
          />
        </Field>
        <Field label="Color del cable">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {COLORES_CABLE.map(c => {
              const active = form.color === c.value;
              return (
                <button key={c.value} type="button" onClick={() => set('color', c.value)} title={c.uso} style={{
                  width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
                  background: c.hex, border: active ? '3px solid #1e293b' : '2px solid #E2E8F0',
                  boxShadow: active ? '0 0 0 2px #4b8ef5' : 'none',
                  transition: 'all 0.12s',
                }} />
              );
            })}
            <span style={{ fontSize: '0.78rem', color: '#64748B', alignSelf: 'center', marginLeft: 4 }}>
              {COLORES_CABLE.find(c => c.value === form.color)?.label}
            </span>
          </div>
        </Field>
      </div>

      <Field label="Nivel MICE (Entorno)">
        <ChipSelector
          value={form.mice}
          onChange={v => set('mice', v)}
          options={NIVELES_MICE.map(m => ({ value: m.value, label: m.label, color: m.color }))}
        />
        {form.mice && (
          <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 4 }}>
            {NIVELES_MICE.find(m => m.value === form.mice)?.descripcion}
          </span>
        )}
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <Field label="Longitud del cable">
          <SelectCatalog value={form.longitud} onChange={v => set('longitud', v)} options={LONGITUDES_CABLE.map(l => ({ value: l, label: l }))} placeholder="— Seleccionar —" />
        </Field>
        <Field label="Patchcord interno">
          <SelectCatalog value={form.patchcordInterno} onChange={v => set('patchcordInterno', v)} options={LONGITUDES_PATCHCORD.map(l => ({ value: l, label: l }))} />
        </Field>
        <Field label="Año de instalación">
          <SelectCatalog value={String(form.anioInstalacion)} onChange={v => set('anioInstalacion', parseInt(v))} options={ANIOS_INSTALACION.map(a => ({ value: String(a), label: String(a) }))} />
        </Field>
      </div>
    </div>
  );
}

// ─── Step 3: Documentos ───────────────────────────────────────────────────────
function Step3({ form, set }: { form: NodeWizardData; set: (k: keyof NodeWizardData, v: any) => void }) {
  const fotoRef = useRef<HTMLInputElement>(null);
  const flukeRef = useRef<HTMLInputElement>(null);
  const panduitRef = useRef<HTMLInputElement>(null);
  const [showFluke, setShowFluke] = useState(false);
  const [showPanduit, setShowPanduit] = useState(false);

  const handleFoto = (file: File) => {
    const url = URL.createObjectURL(file);
    set('foto', url);
  };
  const handleFluke = (file: File) => {
    const url = URL.createObjectURL(file);
    set('docFluke', file.name);
    set('docFlukeUrl', url);
    set('certificadoFluke', true);
  };
  const handlePanduit = (file: File) => {
    const url = URL.createObjectURL(file);
    set('docPanduit', file.name);
    set('docPanduitUrl', url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Foto */}
      <div>
        <label style={lbl}>Foto del nodo</label>
        <input ref={fotoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFoto(e.target.files[0]); }} />
        {form.foto ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img src={form.foto} alt="Nodo" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, border: '1px solid #E2E8F0' }} />
            <button onClick={() => set('foto', '')} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={12} />
            </button>
          </div>
        ) : (
          <button onClick={() => fotoRef.current?.click()} style={{ width: '100%', padding: '2rem', border: '2px dashed #E2E8F0', borderRadius: 10, background: '#F8FAFF', cursor: 'pointer', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Camera size={28} color="#cbd5e1" />
            <span style={{ fontSize: '0.82rem' }}>Clic para subir foto del nodo</span>
            <span style={{ fontSize: '0.72rem' }}>JPG, PNG, WEBP — máx. 5 MB</span>
          </button>
        )}
      </div>

      {/* Prueba Fluke */}
      <div>
        <label style={lbl}>Prueba Fluke (PDF)</label>
        <input ref={flukeRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFluke(e.target.files[0]); }} />
        {form.docFluke ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8 }}>
            <Check size={16} color="#16a34a" />
            <span style={{ flex: 1, fontSize: '0.82rem', color: '#15803d', fontWeight: 600 }}>{form.docFluke}</span>
            <button onClick={() => setShowFluke(true)} style={{ padding: '4px 10px', background: '#dcfce7', border: '1px solid #BBF7D0', borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Eye size={12} /> Ver
            </button>
            <button onClick={() => flukeRef.current?.click()} style={{ padding: '4px 10px', background: '#dcfce7', border: '1px solid #BBF7D0', borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: 4 }}>
              <UploadCloud size={12} /> Reemplazar
            </button>
          </div>
        ) : (
          <button onClick={() => flukeRef.current?.click()} style={{ width: '100%', padding: '1rem', border: '2px dashed #FED7AA', borderRadius: 8, background: '#FFF7ED', cursor: 'pointer', color: '#ea580c', display: 'flex', alignItems: 'center', gap: 10 }}>
            <UploadCloud size={20} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Subir Prueba Fluke</div>
              <div style={{ fontSize: '0.72rem', color: '#f97316' }}>Archivo PDF del certificador DSX/Versiv</div>
            </div>
          </button>
        )}
      </div>

      {/* Certificado Panduit */}
      <div>
        <label style={lbl}>Certificado Panduit (PDF)</label>
        <input ref={panduitRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handlePanduit(e.target.files[0]); }} />
        {form.docPanduit ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
            <Check size={16} color="#2563EB" />
            <span style={{ flex: 1, fontSize: '0.82rem', color: '#1d4ed8', fontWeight: 600 }}>{form.docPanduit}</span>
            <button onClick={() => setShowPanduit(true)} style={{ padding: '4px 10px', background: '#DBEAFE', border: '1px solid #BFDBFE', borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Eye size={12} /> Ver
            </button>
            <button onClick={() => panduitRef.current?.click()} style={{ padding: '4px 10px', background: '#DBEAFE', border: '1px solid #BFDBFE', borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 4 }}>
              <UploadCloud size={12} /> Reemplazar
            </button>
          </div>
        ) : (
          <button onClick={() => panduitRef.current?.click()} style={{ width: '100%', padding: '1rem', border: '2px dashed #BFDBFE', borderRadius: 8, background: '#EFF6FF', cursor: 'pointer', color: '#2563EB', display: 'flex', alignItems: 'center', gap: 10 }}>
            <UploadCloud size={20} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Subir Certificado Panduit</div>
              <div style={{ fontSize: '0.72rem', color: '#3b82f6' }}>Archivo PDF de certificación Panduit</div>
            </div>
          </button>
        )}
      </div>

      {/* PDF viewers */}
      {showFluke && form.docFlukeUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowFluke(false)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '90vw', maxWidth: 900, height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Prueba Fluke — {form.codigo}</span>
              <button onClick={() => setShowFluke(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <iframe src={form.docFlukeUrl} style={{ flex: 1, border: 'none' }} />
          </div>
        </div>
      )}
      {showPanduit && form.docPanduitUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPanduit(false)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '90vw', maxWidth: 900, height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Certificado Panduit — {form.codigo}</span>
              <button onClick={() => setShowPanduit(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <iframe src={form.docPanduitUrl} style={{ flex: 1, border: 'none' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Relaciones ───────────────────────────────────────────────────────
function Step4({ form, set }: { form: NodeWizardData; set: (k: keyof NodeWizardData, v: any) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Field label="Patch Panel" hint="Ej: IDF1-RA-PP3-P12">
          <input value={form.patchpanel} onChange={e => set('patchpanel', e.target.value)} style={inp} placeholder="IDF1-RA-PP3-P12" />
        </Field>
        <Field label="Switch destino" hint="Ej: IDF1-RB-SW2-P12">
          <input value={form.switchDestino} onChange={e => set('switchDestino', e.target.value)} style={inp} placeholder="IDF1-RB-SW2-P12" />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Field label="Ver en plano" hint="Referencia al plano donde aparece">
          <input value={form.verEnPlano} onChange={e => set('verEnPlano', e.target.value)} style={inp} placeholder="Plano-IDF1-P1" />
        </Field>
        <Field label="Etiqueta RFID">
          <input value={form.etiquetaRFID} onChange={e => set('etiquetaRFID', e.target.value)} style={inp} placeholder="RFID-NOD-0001" />
        </Field>
      </div>

      <div style={{ height: '1px', background: '#F1F5F9' }} />
      <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0, fontWeight: 600 }}>Datos de proyecto y costo</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Field label="Integrador / Contratista">
          <SelectCatalog value={form.integrador} onChange={v => set('integrador', v)} options={INTEGRADORES.map(i => ({ value: i, label: i }))} placeholder="— Seleccionar —" />
        </Field>
        <Field label="Orden de compra (PO)">
          <input value={form.po} onChange={e => set('po', e.target.value)} style={inp} placeholder="PO-2025-001" />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Field label="Costo en USD">
          <input type="number" value={form.costo || ''} onChange={e => set('costo', parseFloat(e.target.value) || 0)} style={inp} placeholder="0.00" />
        </Field>
        <Field label="Centro de costos">
          <input value={form.centroCostos} onChange={e => set('centroCostos', e.target.value)} style={inp} placeholder="CC-TI-001" />
        </Field>
      </div>
    </div>
  );
}

// ─── Step 5: Normativa ────────────────────────────────────────────────────────
function Step5({ form, set }: { form: NodeWizardData; set: (k: keyof NodeWizardData, v: any) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Normativa */}
        <button
          type="button"
          onClick={() => set('normativa', !form.normativa)}
          style={{
            padding: '1.25rem', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
            border: `2px solid ${form.normativa ? '#22c55e' : '#E2E8F0'}`,
            background: form.normativa ? '#F0FDF4' : '#F8FAFF',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: form.normativa ? '#22c55e' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {form.normativa && <Check size={14} color="#fff" />}
            </div>
            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: form.normativa ? '#15803d' : '#475569' }}>Normativa aprobada</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>El nodo cumple con los estándares TIA/ISO aplicables.</p>
        </button>

        {/* Certificado Fluke */}
        <button
          type="button"
          onClick={() => set('certificadoFluke', !form.certificadoFluke)}
          style={{
            padding: '1.25rem', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
            border: `2px solid ${form.certificadoFluke ? '#f59e0b' : '#E2E8F0'}`,
            background: form.certificadoFluke ? '#FFFBEB' : '#F8FAFF',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: form.certificadoFluke ? '#f59e0b' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {form.certificadoFluke && <Check size={14} color="#fff" />}
            </div>
            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: form.certificadoFluke ? '#b45309' : '#475569' }}>Certificado Fluke</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>Prueba realizada con certificador Fluke DSX o Versiv.</p>
        </button>
      </div>

      {/* Norma de referencia */}
      <Field label="Norma de referencia aplicada">
        <SelectCatalog
          value={form.observaciones.startsWith('NORMA:') ? form.observaciones.split('|')[0].replace('NORMA:', '') : ''}
          onChange={v => set('observaciones', `NORMA:${v}|${form.observaciones.includes('|') ? form.observaciones.split('|').slice(1).join('|') : ''}`)}
          options={NORMAS.map(n => ({ value: n.value, label: n.label, descripcion: n.descripcion }))}
          placeholder="— Seleccionar norma —"
        />
      </Field>

      {/* Tipo de certificador */}
      <Field label="Equipo de certificación utilizado">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {TIPOS_CERTIFICACION.map(c => {
            const val = form.observaciones.includes(`CERT:${c.value}`);
            return (
              <button key={c.value} type="button" title={c.descripcion} onClick={() => {
                const base = form.observaciones.replace(/CERT:[^|]*/g, '');
                set('observaciones', `${base}CERT:${c.value}`);
              }} style={{
                padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: val ? 700 : 500,
                border: `1.5px solid ${val ? '#4b8ef5' : '#E2E8F0'}`,
                background: val ? '#EFF6FF' : '#F8FAFF',
                color: val ? '#2563EB' : '#64748B',
              }}>
                {c.label}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Observaciones */}
      <Field label="Observaciones generales">
        <textarea
          value={form.observaciones.replace(/NORMA:[^|]*\|?/g, '').replace(/CERT:[^|]*/g, '')}
          onChange={e => {
            const norma = form.observaciones.match(/NORMA:[^|]*/)?.[0] ?? '';
            const cert = form.observaciones.match(/CERT:[^|]*/)?.[0] ?? '';
            set('observaciones', `${norma ? norma + '|' : ''}${cert ? cert + '|' : ''}${e.target.value}`);
          }}
          rows={3}
          style={{ ...inp, resize: 'vertical' }}
          placeholder="Notas adicionales sobre el nodo, condiciones especiales, pendientes..."
        />
      </Field>

      {/* Resumen de completitud */}
      <div style={{ background: '#F8FAFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px' }}>
        <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', margin: '0 0 10px 0' }}>Resumen de completitud del nodo</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { label: 'Código', ok: !!form.codigo },
            { label: 'IDF/MDF', ok: !!form.idf },
            { label: 'Área', ok: !!form.area },
            { label: 'Marca', ok: !!form.marca },
            { label: 'Categoría', ok: !!form.categoria },
            { label: 'Patch Panel', ok: !!form.patchpanel },
            { label: 'Switch', ok: !!form.switchDestino },
            { label: 'Prueba Fluke', ok: !!form.docFluke },
            { label: 'Cert. Panduit', ok: !!form.docPanduit },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: f.ok ? '#22c55e' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {f.ok ? <Check size={10} color="#fff" /> : <span style={{ fontSize: 10, color: '#94a3b8' }}>·</span>}
              </div>
              <span style={{ fontSize: '0.72rem', color: f.ok ? '#15803d' : '#94a3b8' }}>{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────
export default function NodeWizard({ item, onClose, onSave }: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<NodeWizardData>(item ?? blank);
  const set = (k: keyof NodeWizardData, v: any) => setForm(f => ({ ...f, [k]: v }));

  const canNext = () => {
    if (step === 1) return !!form.codigo && !!form.idf && !!form.area;
    return true;
  };

  const handleSave = () => {
    if (!form.codigo || !form.idf || !form.area) { setStep(1); return; }
    onSave({ ...form, id: form.id || `n${Date.now()}` });
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, width: 'min(700px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.2)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: '#1E293B', fontWeight: 700, fontSize: '1rem', margin: 0 }}>
              {item ? 'Editar Nodo' : 'Nuevo Nodo'} — {STEPS[step - 1].label}
            </h3>
            <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '2px 0 0 0' }}>{STEPS[step - 1].desc}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Step indicators */}
        <div style={{ padding: '1rem 1.5rem 0', background: '#FAFBFF' }}>
          <div style={{ display: 'flex', gap: 0, marginBottom: '0.75rem' }}>
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = step > s.id;
              const active = step === s.id;
              return (
                <React.Fragment key={s.id}>
                  <button
                    type="button"
                    onClick={() => (done || active) && setStep(s.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '6px 12px', background: 'none', border: 'none', cursor: done ? 'pointer' : 'default',
                      flex: 1,
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: done ? '#22c55e' : active ? '#4b8ef5' : '#F1F5F9',
                      border: `2px solid ${done ? '#22c55e' : active ? '#4b8ef5' : '#E2E8F0'}`,
                      transition: 'all 0.2s',
                    }}>
                      {done ? <Check size={14} color="#fff" /> : <Icon size={14} color={active ? '#fff' : '#94a3b8'} />}
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: active ? 700 : 500, color: active ? '#4b8ef5' : done ? '#22c55e' : '#94a3b8', whiteSpace: 'nowrap' }}>
                      {s.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div style={{ flex: 0, display: 'flex', alignItems: 'center', paddingBottom: 18 }}>
                      <div style={{ width: 20, height: 2, background: step > s.id ? '#22c55e' : '#E2E8F0', transition: 'background 0.3s' }} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
          {/* Progress bar */}
          <div style={{ height: 3, background: '#F1F5F9', borderRadius: 2, marginBottom: 0 }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg, #4b8ef5, #22c55e)', borderRadius: 2, width: `${progress}%`, transition: 'width 0.3s ease' }} />
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {step === 1 && <Step1 form={form} set={set} />}
          {step === 2 && <Step2 form={form} set={set} />}
          {step === 3 && <Step3 form={form} set={set} />}
          {step === 4 && <Step4 form={form} set={set} />}
          {step === 5 && <Step5 form={form} set={set} />}
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFBFF' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                <ChevronLeft size={16} /> Anterior
              </button>
            )}
            <button onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', color: '#94a3b8', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem' }}>
              Cancelar
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Paso {step} de {STEPS.length}</span>
            {step < STEPS.length ? (
              <button
                onClick={() => canNext() && setStep(s => s + 1)}
                disabled={!canNext()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px',
                  background: canNext() ? '#4b8ef5' : '#E2E8F0',
                  color: canNext() ? '#fff' : '#94a3b8',
                  border: 'none', borderRadius: 8, cursor: canNext() ? 'pointer' : 'not-allowed',
                  fontSize: '0.85rem', fontWeight: 600,
                }}
              >
                Siguiente <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleSave}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 24px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}
              >
                <Check size={16} /> {item ? 'Guardar cambios' : 'Crear nodo'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
