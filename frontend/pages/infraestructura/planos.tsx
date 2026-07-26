import { useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import {
  Upload, FileText, Search, Plus, Trash2, Eye, Download,
  Building2, Layers, Clock, CheckCircle2, AlertTriangle,
  X, ChevronRight, FolderOpen, Tag, Calendar, HardDrive,
  Filter, Grid, List, ArrowLeft,
} from 'lucide-react';
import AppLayout from '../../components/AppLayout';
import ModuleEmptyState from '../../components/ModuleEmptyState';
import dynamic from 'next/dynamic';
import type { Layer } from '../../components/PlanosViewer';

// Dynamic import to avoid SSR issues with pdfjs-dist
const PlanosViewer = dynamic(() => import('../../components/PlanosViewer'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────
type PlanStatus = 'Vigente' | 'En revisión' | 'Obsoleto' | 'Borrador';
type PlanArea   = 'MDF/IDF' | 'Racks' | 'Cableado' | 'CCTV' | 'Voz/Datos' | 'Energía' | 'Planta General' | 'Datacenter';

interface PlanRecord {
  id: string;
  name: string;
  description: string;
  area: PlanArea;
  building: string;
  floor: string;
  scale: string;
  status: PlanStatus;
  version: string;
  uploadedAt: string;
  updatedAt: string;
  fileSize: string;
  pages: number;
  fileUrl: string | null;   // null = demo (no real file)
  tags: string[];
  layers: Layer[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_PLANS: PlanRecord[] = [
  {
    id: '1', name: 'Plano Cableado Estructurado — Torre A',
    description: 'Distribución de cableado Cat6A y fibra óptica pisos 1-10',
    area: 'Cableado', building: 'Torre A', floor: 'Pisos 1-10',
    scale: '1:100', status: 'Vigente', version: 'v3.2',
    uploadedAt: '2024-03-15', updatedAt: '2024-11-20',
    fileSize: '128 MB', pages: 12, fileUrl: null,
    tags: ['Cat6A', 'Fibra', 'Certificado'], layers: [],
  },
  {
    id: '2', name: 'Plano CCTV — Torre B Planta Baja',
    description: 'Montajes y trayectorias de cámaras de videovigilancia',
    area: 'CCTV', building: 'Torre B', floor: 'Planta Baja',
    scale: '1:100', status: 'Vigente', version: 'v2.1',
    uploadedAt: '2023-07-18', updatedAt: '2024-08-05',
    fileSize: '87 MB', pages: 4, fileUrl: null,
    tags: ['CCTV', 'NVR', 'Validado'], layers: [],
  },
  {
    id: '3', name: 'Plano MDF Principal — Sala Técnica',
    description: 'Distribución de racks y equipos activos en MDF',
    area: 'MDF/IDF', building: 'Torre A', floor: 'Piso 1',
    scale: '1:50', status: 'En revisión', version: 'v1.4',
    uploadedAt: '2024-01-10', updatedAt: '2025-01-15',
    fileSize: '210 MB', pages: 6, fileUrl: null,
    tags: ['MDF', 'Racks', 'Revisión'], layers: [],
  },
  {
    id: '4', name: 'Plano Voz y Datos — Producción',
    description: 'Puntos de red y telefonía IP área de producción',
    area: 'Voz/Datos', building: 'Nave Industrial', floor: 'Piso 1',
    scale: '1:200', status: 'Vigente', version: 'v4.0',
    uploadedAt: '2022-05-20', updatedAt: '2024-06-10',
    fileSize: '156 MB', pages: 8, fileUrl: null,
    tags: ['VoIP', 'Cat6', 'Producción'], layers: [],
  },
  {
    id: '5', name: 'Plano Eléctrico UPS — Datacenter',
    description: 'Distribución eléctrica y PDUs en datacenter principal',
    area: 'Energía', building: 'Datacenter', floor: 'Piso 1',
    scale: '1:75', status: 'Vigente', version: 'v2.3',
    uploadedAt: '2021-11-01', updatedAt: '2024-12-01',
    fileSize: '94 MB', pages: 5, fileUrl: null,
    tags: ['UPS', 'PDU', 'Eléctrico'], layers: [],
  },
  {
    id: '6', name: 'Planta General — Complejo Industrial',
    description: 'Vista general de todas las instalaciones del complejo',
    area: 'Planta General', building: 'Complejo', floor: 'General',
    scale: '1:500', status: 'Obsoleto', version: 'v1.0',
    uploadedAt: '2020-03-01', updatedAt: '2021-01-15',
    fileSize: '312 MB', pages: 2, fileUrl: null,
    tags: ['General', 'Complejo'], layers: [],
  },
];

const AREAS: PlanArea[] = ['MDF/IDF','Racks','Cableado','CCTV','Voz/Datos','Energía','Planta General','Datacenter'];

const STATUS_CFG: Record<PlanStatus, { color: string; bg: string; border: string; icon: any }> = {
  'Vigente':     { color: '#31C48D', bg: 'rgba(49,196,141,0.08)',  border: 'rgba(49,196,141,0.2)',  icon: CheckCircle2 },
  'En revisión': { color: '#F6A609', bg: 'rgba(246,166,9,0.08)',   border: 'rgba(246,166,9,0.2)',   icon: AlertTriangle },
  'Obsoleto':    { color: '#9EA3C8', bg: 'rgba(158,163,200,0.08)', border: 'rgba(158,163,200,0.2)', icon: Clock },
  'Borrador':    { color: '#A78BFA', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)', icon: FileText },
};

const AREA_COLORS: Record<PlanArea, string> = {
  'MDF/IDF':       '#4361EE',
  'Racks':         '#374151',
  'Cableado':      '#0F766E',
  'CCTV':          '#DC2626',
  'Voz/Datos':     '#7C3AED',
  'Energía':       '#B45309',
  'Planta General':'#0369A1',
  'Datacenter':    '#1F2937',
};

function formatBytes(str: string) { return str; }

// ─── Upload zone ──────────────────────────────────────────────────────────────
function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') onFile(file);
  }, [onFile]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${drag ? '#4361EE' : 'var(--border, #DDE0EE)'}`,
        borderRadius: 14,
        padding: '32px 24px',
        textAlign: 'center',
        cursor: 'pointer',
        background: drag ? 'rgba(67,97,238,0.04)' : 'var(--surface-2, #F4F5FB)',
        transition: 'all 200ms',
      }}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: drag ? 'rgba(67,97,238,0.12)' : 'rgba(67,97,238,0.06)',
        border: '1px solid rgba(67,97,238,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 14px',
      }}>
        <Upload size={24} color="#4361EE" />
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-1)', marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>
        {drag ? 'Suelta el archivo aquí' : 'Arrastra tu plano PDF aquí'}
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>
        o haz clic para seleccionar · PDF hasta 500 MB · Alta resolución soportada
      </div>
    </div>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────
function PlanCard({ plan, onOpen, onDelete }: {
  plan: PlanRecord;
  onOpen: (p: PlanRecord) => void;
  onDelete: (id: string) => void;
}) {
  const s = STATUS_CFG[plan.status];
  const StatusIcon = s.icon;
  const areaColor = AREA_COLORS[plan.area];

  return (
    <div style={{
      background: 'var(--surface, #fff)',
      border: '1px solid var(--border-light, #E8EBF4)',
      borderRadius: 14,
      overflow: 'hidden',
      transition: 'box-shadow 150ms, transform 150ms',
      cursor: 'pointer',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(67,97,238,0.12)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
    >
      {/* Color band */}
      <div style={{ height: 4, background: areaColor }} />

      {/* Thumbnail placeholder */}
      <div
        onClick={() => onOpen(plan)}
        style={{
          height: 120,
          background: `linear-gradient(135deg, ${areaColor}12, ${areaColor}06)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid var(--border-light)',
          position: 'relative',
        }}>
        <FileText size={40} color={`${areaColor}60`} />
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(255,255,255,0.9)', borderRadius: 6,
          padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700,
          color: areaColor, border: `1px solid ${areaColor}30`,
        }}>
          {plan.version}
        </div>
        <div style={{
          position: 'absolute', bottom: 8, left: 8,
          background: 'rgba(255,255,255,0.9)', borderRadius: 6,
          padding: '2px 8px', fontSize: '0.68rem', fontWeight: 600,
          color: 'var(--text-2)',
        }}>
          {plan.pages} pág.
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-1)', lineHeight: 1.3, flex: 1 }}>
            {plan.name}
          </div>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 20,
            background: s.bg, border: `1px solid ${s.border}`,
            color: s.color, fontSize: '0.68rem', fontWeight: 600, flexShrink: 0,
          }}>
            <StatusIcon size={10} />
            {plan.status}
          </span>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 8, lineHeight: 1.4 }}>
          {plan.description}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', color: 'var(--text-3)' }}>
            <Building2 size={10} /> {plan.building}
          </span>
          <span style={{ color: 'var(--text-3)', fontSize: '0.7rem' }}>·</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{plan.floor}</span>
          <span style={{ color: 'var(--text-3)', fontSize: '0.7rem' }}>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', color: 'var(--text-3)' }}>
            <HardDrive size={10} /> {plan.fileSize}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {plan.tags.map(t => (
            <span key={t} style={{
              padding: '1px 7px', borderRadius: 20,
              background: `${areaColor}10`, color: areaColor,
              border: `1px solid ${areaColor}25`,
              fontSize: '0.65rem', fontWeight: 600,
            }}>{t}</span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => onOpen(plan)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '6px 10px', borderRadius: 8,
              background: '#4361EE', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, fontFamily: 'Inter, sans-serif',
            }}>
            <Eye size={12} /> Abrir
          </button>
          <button
            onClick={() => onDelete(plan.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '6px 10px', borderRadius: 8,
              background: 'rgba(240,82,82,0.08)', color: '#F05252',
              border: '1px solid rgba(240,82,82,0.2)', cursor: 'pointer',
              fontSize: '0.75rem', fontFamily: 'Inter, sans-serif',
            }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload modal ─────────────────────────────────────────────────────────────
function UploadModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (plan: PlanRecord) => void;
}) {
  const [file, setFile]       = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [form, setForm]       = useState({
    name: '', description: '', area: 'Cableado' as PlanArea,
    building: '', floor: '', scale: '1:100', version: 'v1.0',
  });
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);

  const handleFile = (f: File) => {
    setFile(f);
    // Create object URL for large file streaming
    const url = URL.createObjectURL(f);
    setFileUrl(url);
    if (!form.name) setForm(prev => ({ ...prev, name: f.name.replace('.pdf', '') }));
  };

  const handleSubmit = async () => {
    if (!file || !form.name) return;
    setUploading(true);
    // Simulate chunked upload progress for large files
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 80));
      setProgress(i);
    }
    const newPlan: PlanRecord = {
      id: `plan-${Date.now()}`,
      name: form.name,
      description: form.description,
      area: form.area,
      building: form.building,
      floor: form.floor,
      scale: form.scale,
      status: 'Borrador',
      version: form.version,
      uploadedAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      fileSize: file.size > 1024 * 1024
        ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
        : `${(file.size / 1024).toFixed(0)} KB`,
      pages: 1,
      fileUrl: fileUrl,
      tags: [],
      layers: [],
    };
    setUploading(false);
    onAdd(newPlan);
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px',
    border: '1px solid var(--border, #DDE0EE)',
    borderRadius: 8, fontSize: '0.82rem',
    color: 'var(--text-1)', background: 'var(--surface-2)',
    fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border-light)',
        borderRadius: 18, padding: '24px 28px',
        width: '100%', maxWidth: 560,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(67,97,238,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-1)', fontFamily: 'Inter, sans-serif' }}>
              Subir nuevo plano
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>
              Archivos PDF · Hasta 500 MB · Alta resolución
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Upload zone */}
        {!file ? (
          <UploadZone onFile={handleFile} />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px',
            background: 'rgba(67,97,238,0.04)',
            border: '1px solid rgba(67,97,238,0.15)',
            borderRadius: 10, marginBottom: 16,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(67,97,238,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <FileText size={20} color="#4361EE" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif' }}>
                {file.name}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>
                {(file.size / 1024 / 1024).toFixed(1)} MB · PDF
              </div>
            </div>
            <button onClick={() => { setFile(null); setFileUrl(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Form */}
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5, fontFamily: 'Inter, sans-serif' }}>
              Nombre del plano *
            </label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Ej: Plano Cableado Torre A" style={inputStyle} />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5, fontFamily: 'Inter, sans-serif' }}>
              Descripción
            </label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Descripción del contenido del plano..." rows={2}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5, fontFamily: 'Inter, sans-serif' }}>
                Área
              </label>
              <select value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value as PlanArea }))}
                style={{ ...inputStyle, appearance: 'none' }}>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5, fontFamily: 'Inter, sans-serif' }}>
                Escala
              </label>
              <input value={form.scale} onChange={e => setForm(p => ({ ...p, scale: e.target.value }))}
                placeholder="1:100" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5, fontFamily: 'Inter, sans-serif' }}>
                Edificio
              </label>
              <input value={form.building} onChange={e => setForm(p => ({ ...p, building: e.target.value }))}
                placeholder="Torre A" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5, fontFamily: 'Inter, sans-serif' }}>
                Piso / Área
              </label>
              <input value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))}
                placeholder="Piso 3" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5, fontFamily: 'Inter, sans-serif' }}>
              Versión
            </label>
            <input value={form.version} onChange={e => setForm(p => ({ ...p, version: e.target.value }))}
              placeholder="v1.0" style={{ ...inputStyle, maxWidth: 120 }} />
          </div>
        </div>

        {/* Upload progress */}
        {uploading && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', fontFamily: 'Inter, sans-serif' }}>Subiendo plano…</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4361EE', fontFamily: 'Inter, sans-serif' }}>{progress}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#4361EE', borderRadius: 3, transition: 'width 100ms' }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 18px', borderRadius: 9, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text-2)',
            fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || !form.name || uploading}
            style={{
              padding: '8px 20px', borderRadius: 9, border: 'none',
              background: (!file || !form.name || uploading) ? 'rgba(67,97,238,0.4)' : '#4361EE',
              color: '#fff', fontSize: '0.82rem', fontWeight: 600,
              cursor: (!file || !form.name || uploading) ? 'not-allowed' : 'pointer',
              fontFamily: 'Inter, sans-serif',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <Upload size={14} />
            {uploading ? 'Subiendo…' : 'Subir plano'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PlanosPage() {
  const [plans, setPlans]           = useState<PlanRecord[]>([]);
  const [search, setSearch]         = useState('');
  const [filterArea, setFilterArea] = useState<PlanArea | 'Todas'>('Todas');
  const [filterStatus, setFilterStatus] = useState<PlanStatus | 'Todos'>('Todos');
  const [viewMode, setViewMode]     = useState<'grid' | 'list'>('grid');
  const [showUpload, setShowUpload] = useState(false);
  const [openPlan, setOpenPlan]     = useState<PlanRecord | null>(null);

  const filtered = plans.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.building.toLowerCase().includes(search.toLowerCase()) ||
      p.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchArea   = filterArea   === 'Todas'  || p.area   === filterArea;
    const matchStatus = filterStatus === 'Todos'  || p.status === filterStatus;
    return matchSearch && matchArea && matchStatus;
  });

  const byArea = AREAS.reduce((acc, a) => {
    acc[a] = filtered.filter(p => p.area === a);
    return acc;
  }, {} as Record<PlanArea, PlanRecord[]>);

  const handleDelete = (id: string) => {
    setPlans(prev => prev.filter(p => p.id !== id));
    if (openPlan?.id === id) setOpenPlan(null);
  };

  const handleSaveLayers = (planId: string, layers: Layer[]) => {
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, layers } : p));
  };

  // ── Viewer mode ──────────────────────────────────────────────────────────
  if (openPlan) {
    return (
      <AppLayout
        title="Visor de Planos"
        breadcrumb={[
          { label: 'Infraestructura' },
          { label: 'Planos', path: '/infraestructura/planos' },
          { label: openPlan.name },
        ]}
      >
        <Head><title>{openPlan.name} — SKIA Platform</title></Head>
        <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setOpenPlan(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-2)', fontSize: '0.8rem', cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}>
            <ArrowLeft size={14} /> Volver a Planos
          </button>
          <div style={{ height: 16, width: 1, background: 'var(--border-light)' }} />
          <div>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-1)', fontFamily: 'Inter, sans-serif' }}>
              {openPlan.name}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginLeft: 10, fontFamily: 'Inter, sans-serif' }}>
              {openPlan.building} | {openPlan.floor}
            </span>
          </div>
        </div>
        <div style={{ padding: '10px 20px 20px' }}>
          <PlanosViewer
            fileUrl={openPlan.fileUrl}
            fileName={openPlan.name}
            building={openPlan.building}
            floor={openPlan.floor}
            scale={openPlan.scale}
            onSave={layers => handleSaveLayers(openPlan.id, layers)}
          />
        </div>
      </AppLayout>
    );
  }

    // ── List mode ─────────────────────────────────────────────────────────────
  if (plans.length === 0) {
    return (
      <AppLayout title="Planos" breadcrumb={[{ label: 'Infraestructura' }, { label: 'Planos' }]}>
        <Head><title>Planos — SKIA Platform</title></Head>
        <ModuleEmptyState
          icon="FileText"
          title="Sin planos registrados"
          description="Centraliza toda la documentación técnica de tu infraestructura. Sube planos PDF con soporte para capas, anotaciones, escala y versionado por área."
          features={[
            'Planos PDF con capas y anotaciones',
            'Organización por área: MDF/IDF, Racks, CCTV, Cableado',
            'Control de versiones y estado (Vigente, En revisión, Obsoleto)',
            'Visor integrado de alta resolución',
          ]}
          buttonLabel="Subir primer plano"
          onAction={() => setShowUpload(true)}
        />
        {showUpload && <UploadModal onClose={() => setShowUpload(false)} onAdd={p => { setPlans(ps => [...ps, p]); setShowUpload(false); }} />}
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Planos"
      breadcrumb={[{ label: 'Infraestructura' }, { label: 'Planos' }]}
    >
      <Head><title>Planos — SKIA Platform</title></Head>
      <div style={{ padding: '20px 24px', fontFamily: 'Inter, sans-serif' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>
              Planos de Infraestructura
            </h1>
            <p style={{ color: 'var(--text-3)', fontSize: '0.84rem', marginTop: 4 }}>
              Gestión y visualización de planos PDF con capas y anotaciones
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 10,
              background: '#4361EE', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontSize: '0.84rem', fontWeight: 600, fontFamily: 'Inter, sans-serif',
              boxShadow: '0 3px 10px rgba(67,97,238,0.3)',
            }}>
            <Plus size={15} /> Subir Plano
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Planos',  value: plans.length,                                  color: '#4361EE', icon: FileText },
            { label: 'Vigentes',      value: plans.filter(p => p.status === 'Vigente').length,  color: '#31C48D', icon: CheckCircle2 },
            { label: 'En revisión',   value: plans.filter(p => p.status === 'En revisión').length, color: '#F6A609', icon: AlertTriangle },
            { label: 'Áreas',         value: AREAS.length,                                  color: '#8B5CF6', icon: FolderOpen },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} style={{
                background: 'var(--surface)', border: '1px solid var(--border-light)',
                borderRadius: 12, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: '0 1px 4px rgba(67,97,238,0.06)',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: `${s.color}12`, border: `1px solid ${s.color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={16} color={s.color} />
                </div>
                <div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>{s.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '10px 14px',
          background: 'var(--surface)', border: '1px solid var(--border-light)',
          borderRadius: 12, marginBottom: 18,
        }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, edificio, etiqueta..."
              style={{
                width: '100%', padding: '7px 12px 7px 30px',
                border: '1px solid var(--border)', borderRadius: 8,
                fontSize: '0.82rem', color: 'var(--text-1)',
                background: 'var(--surface-2)', fontFamily: 'Inter, sans-serif',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={13} color="var(--text-3)" />
            <select value={filterArea} onChange={e => setFilterArea(e.target.value as any)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: '0.78rem', color: 'var(--text-1)', fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>
              <option value="Todas">Todas las áreas</option>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: '0.78rem', color: 'var(--text-1)', fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>
            <option value="Todos">Todos los estados</option>
            {(['Vigente','En revisión','Obsoleto','Borrador'] as PlanStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
            {(['grid','list'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding: '5px 8px', borderRadius: 7,
                border: viewMode === m ? '1px solid rgba(67,97,238,0.25)' : '1px solid transparent',
                background: viewMode === m ? 'rgba(67,97,238,0.08)' : 'transparent',
                color: viewMode === m ? '#4361EE' : 'var(--text-3)',
                cursor: 'pointer',
              }}>
                {m === 'grid' ? <Grid size={14} /> : <List size={14} />}
              </button>
            ))}
          </div>
        </div>

        {/* Content by area */}
        {filterArea === 'Todas' ? (
          AREAS.filter(a => byArea[a].length > 0).map(area => (
            <div key={area} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 4, height: 20, borderRadius: 2, background: AREA_COLORS[area] }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-1)' }}>{area}</span>
                <span style={{
                  padding: '1px 9px', borderRadius: 20,
                  background: `${AREA_COLORS[area]}10`, color: AREA_COLORS[area],
                  border: `1px solid ${AREA_COLORS[area]}25`,
                  fontSize: '0.72rem', fontWeight: 600,
                }}>{byArea[area].length} plano{byArea[area].length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                {byArea[area].map(p => (
                  <PlanCard key={p.id} plan={p} onOpen={setOpenPlan} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {filtered.map(p => (
              <PlanCard key={p.id} plan={p} onOpen={setOpenPlan} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <FileText size={40} color="var(--text-3)" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>No se encontraron planos</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>Intenta con otros filtros o sube un nuevo plano</div>
          </div>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onAdd={plan => setPlans(prev => [plan, ...prev])}
        />
      )}
    </AppLayout>
  );
}
