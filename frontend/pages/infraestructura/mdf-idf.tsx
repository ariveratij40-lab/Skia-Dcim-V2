import MdfIdfWizard, { MdfIdfWizardData } from '../../components/MdfIdfWizard';
import axios from 'axios';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Plus, Upload, Download, FileSpreadsheet, Search, Filter,
  ChevronDown, ChevronRight, RefreshCw,
  Building2, Building, MapPin, User, Server, Network,
  Zap, Wind, FileText, AlertTriangle, CheckCircle2,
  Clock, XCircle, Edit2, Eye, Layers, Hash,
  BarChart2, TrendingUp, Info, Cpu, Shield,
  CalendarDays, X, LayoutGrid, List, Image as ImageIcon,
  Award, Package, Camera, ZoomIn, Trash2, CheckSquare, BookOpen, Wrench,
} from 'lucide-react';
import AppLayout from '../../components/AppLayout';
import ModuleEmptyState from '../../components/ModuleEmptyState';
import { TabNormativa } from '../../components/MdfCertificacion';
import { SectionLabel, SummaryTypeCard, CertSummaryCard, DESIGN } from '../../components/InfraCard';

// ============================================================
// TIPOS
// ============================================================
export type MdfIdfType = 'MDF' | 'IDF' | 'Site' | 'Sala Técnica';
export type MdfIdfStatus = 'Operativo' | 'Atención' | 'Crítico' | 'Planeado';

export interface MdfIdfRecord {
  id: string;
  code: string;
  name: string;
  type: MdfIdfType;
  building: string;
  floor: string;
  zone: string;
  address: string;
  status: MdfIdfStatus;
  responsible: string;
  responsible_email: string;
  racks_count: number;
  switches_count: number;
  ups_count: number;
  nodes_count: number;
  servers_count: number;
  capacity_u: number;
  used_u: number;
  cooling: string;
  power_kva: number;
  documentation_pct: number;
  certified: boolean;
  floor_plan_ref: string;
  photo_url: string;
  ref_image_url: string;
  notes: string;
  last_updated: string;
  created_at: string;
  tags: string[];
}

// ============================================================
// TIPOS — EVALUACIÓN DE CERTIFICACIÓN
// ============================================================
export type CertAnswer = 'si' | 'no' | 'na';
export type CertCriticality = 'baja' | 'media' | 'alta';
export type CertStandard = 'ANSI/TIA-942-C' | 'ICREA' | 'Evaluación interna SKIA';

export interface CertQuestion {
  id: string;
  category: string;
  text: string;
  answer: CertAnswer;
  criticality: CertCriticality;
  observation: string;
  evidence_url: string;
}

export interface CertEvaluation {
  standard: CertStandard;
  evaluator: string;
  eval_date: string;
  questions: CertQuestion[];
}

// Banco de preguntas por categoría (5 por categoría)
const CERT_QUESTIONS_BANK: Omit<CertQuestion, 'answer' | 'criticality' | 'observation' | 'evidence_url'>[] = [
  // Telecomunicaciones
  { id: 'tel-1', category: 'Telecomunicaciones', text: '¿El cableado estructurado cumple con la norma ANSI/TIA-568 o equivalente?' },
  { id: 'tel-2', category: 'Telecomunicaciones', text: '¿Todos los cables están etiquetados correctamente en ambos extremos?' },
  { id: 'tel-3', category: 'Telecomunicaciones', text: '¿Los patch panels están documentados con plano de conexiones actualizado?' },
  { id: 'tel-4', category: 'Telecomunicaciones', text: '¿Se han realizado pruebas de normativa de canal (Fluke/OTDR) con resultados aprobados?' },
  { id: 'tel-5', category: 'Telecomunicaciones', text: '¿El radio de curvatura del cableado cumple con las especificaciones del fabricante?' },
  // Energía
  { id: 'ene-1', category: 'Energía', text: '¿Existe UPS con autonomía mínima de 15 minutos para todos los equipos críticos?' },
  { id: 'ene-2', category: 'Energía', text: '¿El circuito eléctrico dedicado está protegido con breaker diferencial?' },
  { id: 'ene-3', category: 'Energía', text: '¿Se cuenta con PDU con medición de consumo por toma?' },
  { id: 'ene-4', category: 'Energía', text: '¿El sistema eléctrico cuenta con tierra física certificada (<5 ohms)?' },
  { id: 'ene-5', category: 'Energía', text: '¿Existe plan de mantenimiento preventivo para UPS con registros actualizados?' },
  // Ambiente
  { id: 'amb-1', category: 'Ambiente', text: '¿La temperatura del cuarto se mantiene entre 18°C y 27°C según ASHRAE A1?' },
  { id: 'amb-2', category: 'Ambiente', text: '¿La humedad relativa se mantiene entre 40% y 60%?' },
  { id: 'amb-3', category: 'Ambiente', text: '¿El sistema de climatización tiene redundancia (N+1 o superior)?' },
  { id: 'amb-4', category: 'Ambiente', text: '¿Existe monitoreo de temperatura y humedad con alertas automáticas?' },
  { id: 'amb-5', category: 'Ambiente', text: '¿El cuarto está libre de humedad, goteras o condensación visible?' },
  // Seguridad física
  { id: 'seg-1', category: 'Seguridad física', text: '¿El acceso al cuarto está controlado mediante llave, tarjeta o biométrico?' },
  { id: 'seg-2', category: 'Seguridad física', text: '¿Existe registro de acceso (bitácora física o electrónica) actualizado?' },
  { id: 'seg-3', category: 'Seguridad física', text: '¿El cuarto cuenta con cámara de vigilancia funcional y con grabación?' },
  { id: 'seg-4', category: 'Seguridad física', text: '¿Los racks tienen cerradura individual o están en área de acceso restringido?' },
  { id: 'seg-5', category: 'Seguridad física', text: '¿Existe política documentada de acceso al cuarto técnico?' },
  // Protección contra incendio
  { id: 'inc-1', category: 'Protección contra incendio', text: '¿Existe detector de humo o incendio funcionando dentro del cuarto?' },
  { id: 'inc-2', category: 'Protección contra incendio', text: '¿Se cuenta con extintor de CO2 o agente limpio con fecha de recarga vigente?' },
  { id: 'inc-3', category: 'Protección contra incendio', text: '¿El cuarto está libre de materiales inflamables o almacenamiento no autorizado?' },
  { id: 'inc-4', category: 'Protección contra incendio', text: '¿Los cables están organizados y no representan riesgo de cortocircuito?' },
  { id: 'inc-5', category: 'Protección contra incendio', text: '¿Existe plan de evacuación y se realizan simulacros periódicos?' },
  // Documentación
  { id: 'doc-1', category: 'Documentación', text: '¿Existe plano actualizado de la distribución de racks y equipos?' },
  { id: 'doc-2', category: 'Documentación', text: '¿El inventario de activos está completo y actualizado en el sistema?' },
  { id: 'doc-3', category: 'Documentación', text: '¿Existe diagrama de red lógica y física actualizado?' },
  { id: 'doc-4', category: 'Documentación', text: '¿Se cuenta con procedimientos escritos de mantenimiento y operación?' },
  { id: 'doc-5', category: 'Documentación', text: '¿Los certificados de pruebas y calibraciones están archivados y disponibles?' },
];

const CERT_CATEGORIES = ['Telecomunicaciones', 'Energía', 'Ambiente', 'Seguridad física', 'Protección contra incendio', 'Documentación'];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Telecomunicaciones': <Network size={13} />,
  'Energía': <Zap size={13} />,
  'Ambiente': <Wind size={13} />,
  'Seguridad física': <Shield size={13} />,
  'Protección contra incendio': <AlertTriangle size={13} />,
  'Documentación': <FileText size={13} />,
};

function buildDefaultEval(): CertEvaluation {
  return {
    standard: 'Evaluación interna SKIA',
    evaluator: '',
    eval_date: new Date().toISOString().slice(0, 10),
    questions: CERT_QUESTIONS_BANK.map(q => ({
      ...q, answer: 'na', criticality: 'media', observation: '', evidence_url: '',
    })),
  };
}

function calcCertResults(evaluation: CertEvaluation) {
  const byCategory = CERT_CATEGORIES.map(cat => {
    const qs = evaluation.questions.filter(q => q.category === cat);
    const applicable = qs.filter(q => q.answer !== 'na');
    const compliant = applicable.filter(q => q.answer === 'si');
    const pct = applicable.length > 0 ? Math.round((compliant.length / applicable.length) * 100) : null;
    const critical = qs.filter(q => q.answer === 'no' && q.criticality === 'alta');
    return { cat, pct, compliant: compliant.length, applicable: applicable.length, total: qs.length, critical };
  });
  const applicable = byCategory.filter(c => c.pct !== null);
  const overall = applicable.length > 0
    ? Math.round(applicable.reduce((s, c) => s + (c.pct ?? 0), 0) / applicable.length)
    : null;
  const criticalPending = evaluation.questions.filter(q => q.answer === 'no' && q.criticality === 'alta');
  const badge: 'Certificable' | 'Encaminado' | 'Crítico' =
    overall === null ? 'Encaminado' :
    overall >= 85 ? 'Certificable' :
    overall >= 50 ? 'Encaminado' : 'Crítico';
  const recommendation =
    overall === null ? 'Complete la evaluación para obtener un diagnóstico.' :
    overall >= 85 ? 'La instalación está en condiciones de preparación avanzada. Se recomienda proceder con auditoría formal.' :
    overall >= 50 ? 'Se identificaron áreas de mejora. Atienda los puntos críticos antes de solicitar normativa.' :
    'La instalación presenta deficiencias críticas. Se requiere plan de acción correctiva urgente.';
  return { byCategory, overall, criticalPending, badge, recommendation };
}

// ============================================================
// MOCK DATA
// ============================================================
const MOCK_DATA: MdfIdfRecord[] = [
  {
    id: '1', code: 'MDF-001', name: 'MDF Principal — Torre A',
    type: 'MDF', building: 'Torre A', floor: 'Sótano 1', zone: 'Cuarto de Telecomunicaciones',
    address: 'Av. Reforma 123, CDMX', status: 'Operativo',
    responsible: 'Ing. Carlos Méndez', responsible_email: 'cmendez@empresa.com',
    racks_count: 8, switches_count: 12, ups_count: 2, nodes_count: 4, servers_count: 6,
    capacity_u: 168, used_u: 134,
    cooling: 'Aire acondicionado de precisión 5 Ton', power_kva: 30,
    documentation_pct: 92, certified: true,
    floor_plan_ref: 'Plano-A-S1-TK-01', photo_url: '', ref_image_url: '',
    notes: 'Cuarto principal de distribución. Revisión mensual programada.',
    last_updated: '2026-05-10', created_at: '2022-03-15', tags: ['crítico', 'revisado'],
  },
  {
    id: '2', code: 'IDF-001', name: 'IDF Piso 3 — Torre A',
    type: 'IDF', building: 'Torre A', floor: 'Piso 3', zone: 'Closet Telecomunicaciones',
    address: 'Av. Reforma 123, CDMX', status: 'Operativo',
    responsible: 'Ing. Laura Soto', responsible_email: 'lsoto@empresa.com',
    racks_count: 2, switches_count: 4, ups_count: 1, nodes_count: 2, servers_count: 0,
    capacity_u: 42, used_u: 28,
    cooling: 'Ventilación forzada', power_kva: 5,
    documentation_pct: 78, certified: true,
    floor_plan_ref: 'Plano-A-P3-TK-01', photo_url: '', ref_image_url: '',
    notes: 'Distribución de planta 3. Cableado estructurado Cat6A.',
    last_updated: '2026-04-22', created_at: '2022-06-01', tags: ['cat6a'],
  },
  {
    id: '3', code: 'IDF-002', name: 'IDF Piso 7 — Torre A',
    type: 'IDF', building: 'Torre A', floor: 'Piso 7', zone: 'Closet Telecomunicaciones',
    address: 'Av. Reforma 123, CDMX', status: 'Atención',
    responsible: 'Ing. Laura Soto', responsible_email: 'lsoto@empresa.com',
    racks_count: 2, switches_count: 3, ups_count: 1, nodes_count: 1, servers_count: 0,
    capacity_u: 42, used_u: 40,
    cooling: 'Ventilación forzada', power_kva: 4,
    documentation_pct: 55, certified: false,
    floor_plan_ref: 'Plano-A-P7-TK-01', photo_url: '', ref_image_url: '',
    notes: 'Capacidad casi al límite. Requiere expansión en Q3.',
    last_updated: '2026-05-01', created_at: '2022-06-01', tags: ['capacidad-limitada'],
  },
  {
    id: '4', code: 'MDF-002', name: 'MDF Torre B',
    type: 'MDF', building: 'Torre B', floor: 'Planta Baja', zone: 'Cuarto de Telecomunicaciones',
    address: 'Av. Reforma 456, CDMX', status: 'Operativo',
    responsible: 'Ing. Roberto Vega', responsible_email: 'rvega@empresa.com',
    racks_count: 5, switches_count: 8, ups_count: 2, nodes_count: 3, servers_count: 4,
    capacity_u: 105, used_u: 72,
    cooling: 'Mini-split 2 Ton', power_kva: 20,
    documentation_pct: 85, certified: false,
    floor_plan_ref: 'Plano-B-PB-TK-01', photo_url: '', ref_image_url: '',
    notes: 'Edificio B. Fibra óptica al MDF-001.',
    last_updated: '2026-05-05', created_at: '2023-01-10', tags: ['fibra'],
  },
  {
    id: '5', code: 'SITE-001', name: 'Site Datacenter Principal',
    type: 'Site', building: 'Edificio Central', floor: 'Piso 1', zone: 'Datacenter',
    address: 'Calle Insurgentes 789, CDMX', status: 'Crítico',
    responsible: 'Ing. Ana Torres', responsible_email: 'atorres@empresa.com',
    racks_count: 24, switches_count: 36, ups_count: 6, nodes_count: 12, servers_count: 40,
    capacity_u: 504, used_u: 480,
    cooling: 'CRAC 10 Ton + Redundancia', power_kva: 120,
    documentation_pct: 98, certified: true,
    floor_plan_ref: 'Plano-EC-P1-DC-01', photo_url: '', ref_image_url: '',
    notes: 'Site principal. Tier III. Monitoreo 24/7.',
    last_updated: '2026-05-15', created_at: '2020-01-01', tags: ['tier3', 'crítico', '24/7'],
  },
  {
    id: '6', code: 'IDF-003', name: 'IDF Almacén Norte',
    type: 'IDF', building: 'Almacén Norte', floor: 'Planta Baja', zone: 'Oficina Técnica',
    address: 'Blvd. Norte 321, CDMX', status: 'Planeado',
    responsible: 'Sin asignar', responsible_email: '',
    racks_count: 0, switches_count: 0, ups_count: 0, nodes_count: 0, servers_count: 0,
    capacity_u: 21, used_u: 0,
    cooling: 'Por definir', power_kva: 0,
    documentation_pct: 10, certified: false,
    floor_plan_ref: '', photo_url: '', ref_image_url: '',
    notes: 'Nuevo IDF en construcción. Entrega estimada Q2 2026.',
    last_updated: '2026-03-01', created_at: '2026-03-01', tags: ['nuevo', 'planeado'],
  },
  {
    id: '7', code: 'SALA-001', name: 'Sala Técnica Piso 10',
    type: 'Sala Técnica', building: 'Torre A', floor: 'Piso 10', zone: 'Sala de Servidores',
    address: 'Av. Reforma 123, CDMX', status: 'Operativo',
    responsible: 'Ing. Carlos Méndez', responsible_email: 'cmendez@empresa.com',
    racks_count: 4, switches_count: 6, ups_count: 1, nodes_count: 2, servers_count: 8,
    capacity_u: 84, used_u: 51,
    cooling: 'Mini-split 1.5 Ton', power_kva: 15,
    documentation_pct: 70, certified: false,
    floor_plan_ref: 'Plano-A-P10-SV-01', photo_url: '', ref_image_url: '',
    notes: 'Servidores de aplicaciones corporativas.',
    last_updated: '2026-04-30', created_at: '2021-09-20', tags: ['servidores'],
  },
  {
    id: '8', code: 'IDF-004', name: 'IDF Piso 5 — Torre B',
    type: 'IDF', building: 'Torre B', floor: 'Piso 5', zone: 'Closet Telecomunicaciones',
    address: 'Av. Reforma 456, CDMX', status: 'Atención',
    responsible: 'Ing. Roberto Vega', responsible_email: 'rvega@empresa.com',
    racks_count: 1, switches_count: 2, ups_count: 0, nodes_count: 1, servers_count: 0,
    capacity_u: 21, used_u: 18,
    cooling: 'Sin climatización activa', power_kva: 2,
    documentation_pct: 30, certified: false,
    floor_plan_ref: '', photo_url: '', ref_image_url: '',
    notes: 'Sin UPS. Temperatura elevada en verano.',
    last_updated: '2026-02-14', created_at: '2023-03-01', tags: ['sin-ups', 'temperatura'],
  },
  {
    id: '9', code: 'IDF-005', name: 'IDF Piso 12 — Torre A',
    type: 'IDF', building: 'Torre A', floor: 'Piso 12', zone: 'Closet Telecomunicaciones',
    address: 'Av. Reforma 123, CDMX', status: 'Operativo',
    responsible: 'Ing. Laura Soto', responsible_email: 'lsoto@empresa.com',
    racks_count: 2, switches_count: 3, ups_count: 1, nodes_count: 2, servers_count: 0,
    capacity_u: 42, used_u: 22,
    cooling: 'Ventilación forzada', power_kva: 4,
    documentation_pct: 88, certified: true,
    floor_plan_ref: 'Plano-A-P12-TK-01', photo_url: '', ref_image_url: '',
    notes: 'IDF de piso 12. Bien documentado.',
    last_updated: '2026-05-08', created_at: '2022-08-15', tags: ['cat6a'],
  },
  {
    id: '10', code: 'IDF-006', name: 'IDF Piso 2 — Torre B',
    type: 'IDF', building: 'Torre B', floor: 'Piso 2', zone: 'Closet Telecomunicaciones',
    address: 'Av. Reforma 456, CDMX', status: 'Operativo',
    responsible: 'Ing. Roberto Vega', responsible_email: 'rvega@empresa.com',
    racks_count: 2, switches_count: 4, ups_count: 1, nodes_count: 2, servers_count: 0,
    capacity_u: 42, used_u: 30,
    cooling: 'Ventilación forzada', power_kva: 5,
    documentation_pct: 65, certified: false,
    floor_plan_ref: 'Plano-B-P2-TK-01', photo_url: '', ref_image_url: '',
    notes: 'IDF piso 2 Torre B.',
    last_updated: '2026-04-10', created_at: '2023-02-01', tags: [],
  },
];

// ============================================================
// CONFIGURACIÓN VISUAL POR TIPO
// ============================================================
const TYPE_CONFIG: Record<MdfIdfType, {
  icon: React.ReactNode; pill: string; border: string; grad: string;
  iconRing: string; iconText: string; bar: string;
}> = {
  MDF:          { icon: <Building2 size={18} strokeWidth={1.8} />, pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', border: 'border-blue-200/70', grad: 'from-blue-50/80 to-slate-50/60', iconRing: 'bg-blue-100 ring-1 ring-blue-200', iconText: 'text-blue-600', bar: 'bg-blue-400' },
  IDF:          { icon: <Building size={18} strokeWidth={1.8} />, pill: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200', border: 'border-indigo-200/70', grad: 'from-indigo-50/80 to-slate-50/60', iconRing: 'bg-indigo-100 ring-1 ring-indigo-200', iconText: 'text-indigo-600', bar: 'bg-indigo-400' },
  Site:         { icon: <Cpu size={18} strokeWidth={1.8} />, pill: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200', border: 'border-violet-200/70', grad: 'from-violet-50/80 to-slate-50/60', iconRing: 'bg-violet-100 ring-1 ring-violet-200', iconText: 'text-violet-600', bar: 'bg-violet-400' },
  'Sala Técnica': { icon: <Server size={18} strokeWidth={1.8} />, pill: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200', border: 'border-teal-200/70', grad: 'from-teal-50/80 to-slate-50/60', iconRing: 'bg-teal-100 ring-1 ring-teal-200', iconText: 'text-teal-600', bar: 'bg-teal-400' },
};

// ============================================================
// CONFIGURACIÓN VISUAL POR ESTADO
// ============================================================
const STATUS_CONFIG: Record<MdfIdfStatus, { pill: string; dot: string; icon: React.ReactNode; bar: string }> = {
  Operativo: { pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-400', icon: <CheckCircle2 size={11} />, bar: 'bg-emerald-400' },
  Atención:  { pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       dot: 'bg-amber-400',   icon: <AlertTriangle size={11} />, bar: 'bg-amber-400' },
  Crítico:   { pill: 'bg-red-50 text-red-700 ring-1 ring-red-200',             dot: 'bg-red-500',     icon: <XCircle size={11} />,       bar: 'bg-red-400' },
  Planeado:  { pill: 'bg-slate-50 text-slate-500 ring-1 ring-[#E8EBF4]',       dot: 'bg-slate-300',   icon: <Clock size={11} />,         bar: 'bg-slate-300' },
};

// ============================================================
// COMPONENTE EVALUACIÓN DE CERTIFICACIÓN
// ============================================================
interface CertEvalSectionProps {
  evaluation: CertEvaluation;
  onChange: (ev: CertEvaluation) => void;
}

function CertEvalSection({ evaluation, onChange }: CertEvalSectionProps) {
  const [openCat, setOpenCat] = useState<string | null>(CERT_CATEGORIES[0]);
  const [evidenceInputRef] = useState(() => typeof window !== 'undefined' ? document.createElement('input') : null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const results = useMemo(() => calcCertResults(evaluation), [evaluation]);

  const setQ = (id: string, patch: Partial<CertQuestion>) => {
    onChange({
      ...evaluation,
      questions: evaluation.questions.map(q => q.id === id ? { ...q, ...patch } : q),
    });
  };

  const handleEvidenceFile = (id: string, file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => { if (e.target?.result) setQ(id, { evidence_url: e.target.result as string }); };
    reader.readAsDataURL(file);
  };

  const answerBtn = (q: CertQuestion, val: CertAnswer, label: string, color: string) => (
    <button type="button"
      onClick={() => setQ(q.id, { answer: val })}
      className={`px-2.5 py-1 rounded-lg text-[13px] font-bold border transition-all ${
        q.answer === val ? color : 'bg-[#F0F2FA] border-[#E8EBF4] text-slate-500 hover:border-[#E8EBF4]'
      }`}>
      {label}
    </button>
  );

  const critBtn = (q: CertQuestion, val: CertCriticality, label: string, color: string) => (
    <button type="button"
      onClick={() => setQ(q.id, { criticality: val })}
      className={`px-2 py-0.5 rounded-md text-[12px] font-bold border transition-all ${
        q.criticality === val ? color : 'bg-[#F0F2FA] border-[#E8EBF4] text-slate-500'
      }`}>
      {label}
    </button>
  );

  const overallColor = results.overall === null ? 'text-slate-500' :
    results.overall >= 85 ? 'text-emerald-600' : results.overall >= 50 ? 'text-amber-600' : 'text-red-600';
  const overallBg = results.overall === null ? 'from-slate-50 to-white' :
    results.overall >= 85 ? 'from-emerald-50 to-white' : results.overall >= 50 ? 'from-amber-50 to-white' : 'from-red-50 to-white';
  const overallBar = results.overall === null ? 'bg-slate-300' :
    results.overall >= 85 ? 'bg-emerald-400' : results.overall >= 50 ? 'bg-amber-400' : 'bg-red-400';
  const badgeStyle = results.badge === 'Certificable'
    ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
    : results.badge === 'Encaminado'
    ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
    : 'bg-red-100 text-red-700 ring-1 ring-red-300';

  return (
    <div className="col-span-2 mt-2">
      {/* Separador de sección */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
            <CheckSquare size={15} className="text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-black text-[#1A1D2E]">Evaluación de Normativa</h3>
            <p className="text-[12px] text-[#5C6194]">Evaluación interna de preparación para normativa</p>
          </div>
        </div>
        <div className="ml-auto">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-bold ${badgeStyle}`}>
            {results.badge === 'Certificable' ? <CheckCircle2 size={11} /> : results.badge === 'Encaminado' ? <Clock size={11} /> : <XCircle size={11} />}
            {results.badge}
          </span>
        </div>
      </div>

      {/* Configuración de la evaluación */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Estándar</label>
          <select
            className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-indigo-400 focus:outline-none bg-slate-100"
            value={evaluation.standard}
            onChange={e => onChange({ ...evaluation, standard: e.target.value as CertStandard })}>
            <option>Evaluación interna SKIA</option>
            <option>ANSI/TIA-942-C</option>
            <option>ICREA</option>
          </select>
        </div>
        <div>
          <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Responsable de evaluación</label>
          <input
            className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-indigo-400 focus:outline-none bg-slate-100"
            value={evaluation.evaluator}
            onChange={e => onChange({ ...evaluation, evaluator: e.target.value })}
            placeholder="Nombre del evaluador" />
        </div>
        <div>
          <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha de evaluación</label>
          <input type="date"
            className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-indigo-400 focus:outline-none bg-slate-100"
            value={evaluation.eval_date}
            onChange={e => onChange({ ...evaluation, eval_date: e.target.value })} />
        </div>
      </div>

      {/* Ficha de resultado general */}
      <div className={`bg-gradient-to-br ${overallBg} border border-[#E8EBF4]/80 rounded-2xl p-4 mb-4`}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Resultado general</p>
            <p className="text-[13px] text-[#5C6194] mt-0.5">{evaluation.standard}</p>
          </div>
          <div className="text-right">
            <span className={`text-3xl font-black ${overallColor}`}>
              {results.overall !== null ? `${results.overall}%` : '—'}
            </span>
            {results.overall !== null && (
              <p className={`text-[12px] font-bold mt-0.5 ${overallColor}`}>{results.badge}</p>
            )}
          </div>
        </div>
        {results.overall !== null && (
          <div className="mb-3">
            <div className="h-2 w-full bg-slate-100/80 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${overallBar}`}
                style={{ width: `${results.overall}%` }} />
            </div>
          </div>
        )}
        {/* Porcentajes por categoría */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {results.byCategory.map(c => (
            <div key={c.cat} className="bg-slate-100/80 rounded-xl p-2 border border-white/80">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-slate-500">{CATEGORY_ICONS[c.cat]}</span>
                <span className="text-[13px] font-bold text-slate-500 truncate">{c.cat}</span>
              </div>
              <div className="flex items-end justify-between">
                <span className={`text-base font-black ${
                  c.pct === null ? 'text-[#5C6194]' :
                  c.pct >= 85 ? 'text-emerald-600' : c.pct >= 50 ? 'text-amber-600' : 'text-red-600'
                }`}>{c.pct !== null ? `${c.pct}%` : 'N/A'}</span>
                <span className="text-[13px] text-slate-500">{c.compliant}/{c.applicable}</span>
              </div>
              <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden mt-1">
                <div className={`h-full rounded-full ${
                  c.pct === null ? 'bg-slate-200' :
                  c.pct >= 85 ? 'bg-emerald-400' : c.pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
                }`} style={{ width: `${c.pct ?? 0}%` }} />
              </div>
            </div>
          ))}
        </div>
        {/* Preguntas críticas pendientes */}
        {results.criticalPending.length > 0 && (
          <div className="bg-red-50/80 border border-red-200/60 rounded-xl p-2.5">
            <p className="text-[12px] font-bold text-red-600 mb-1.5 flex items-center gap-1">
              <AlertTriangle size={10} /> {results.criticalPending.length} pregunta(s) crítica(s) pendiente(s)
            </p>
            {results.criticalPending.map(q => (
              <p key={q.id} className="text-[12px] text-red-500 leading-relaxed mb-0.5">• {q.text}</p>
            ))}
          </div>
        )}
        {/* Recomendación automática */}
        <div className="mt-2.5 bg-slate-100/80 rounded-xl p-2.5 border border-[#E8EBF4]">
          <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1">Recomendación</p>
          <p className="text-[13px] text-slate-600 leading-relaxed">{results.recommendation}</p>
        </div>
      </div>

      {/* Preguntas por categoría (acordeon) */}
      <div className="space-y-2">
        {CERT_CATEGORIES.map(cat => {
          const catQs = evaluation.questions.filter(q => q.category === cat);
          const catResult = results.byCategory.find(c => c.cat === cat);
          const isOpen = openCat === cat;
          return (
            <div key={cat} className="border border-[#E8EBF4]/80 rounded-2xl overflow-hidden">
              <button type="button"
                onClick={() => setOpenCat(isOpen ? null : cat)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-100/80 hover:bg-slate-50/80 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{CATEGORY_ICONS[cat]}</span>
                  <span className="text-xs font-bold text-[#1A1D2E]">{cat}</span>
                  <span className="text-[12px] text-[#5C6194]">{catResult?.applicable}/{catResult?.total} aplicables</span>
                </div>
                <div className="flex items-center gap-2">
                  {catResult?.pct !== null && catResult?.pct !== undefined && (
                    <span className={`text-xs font-black ${
                      catResult.pct >= 85 ? 'text-emerald-600' : catResult.pct >= 50 ? 'text-amber-600' : 'text-red-600'
                    }`}>{catResult.pct}%</span>
                  )}
                  {catResult?.critical.length ? (
                    <span className="flex items-center gap-0.5 text-[12px] text-red-500 font-bold">
                      <AlertTriangle size={9} /> {catResult.critical.length}
                    </span>
                  ) : null}
                  <ChevronDown size={13} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {isOpen && (
                <div className="bg-slate-50/80 border-t border-[#E8EBF4] divide-y divide-[#F0F2FA]">
                  {catQs.map((q, qi) => (
                    <div key={q.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="text-[12px] font-black text-[#5C6194] mt-0.5 min-w-[18px]">{qi + 1}.</span>
                        <div className="flex-1">
                          <p className="text-[12px] text-slate-700 font-medium leading-snug mb-2">{q.text}</p>
                          {/* Respuesta */}
                          <div className="flex items-center gap-1.5 mb-2">
                            {answerBtn(q, 'si', '✓ Sí cumple', 'bg-emerald-50 border-emerald-300 text-emerald-700')}
                            {answerBtn(q, 'no', '✕ No cumple', 'bg-red-50 border-red-300 text-red-700')}
                            {answerBtn(q, 'na', 'N/A', 'bg-[#F0F2FA] border-[#E8EBF4] text-slate-600')}
                          </div>
                          {/* Criticidad */}
                          <div className="flex items-center gap-1 mb-2">
                            <span className="text-[13px] text-slate-500 font-bold uppercase tracking-wider mr-1">Criticidad:</span>
                            {critBtn(q, 'baja', 'Baja', 'bg-blue-50 border-blue-300 text-blue-700')}
                            {critBtn(q, 'media', 'Media', 'bg-amber-50 border-amber-300 text-amber-700')}
                            {critBtn(q, 'alta', 'Alta', 'bg-red-50 border-red-300 text-red-700')}
                          </div>
                          {/* Observación */}
                          <textarea
                            rows={2}
                            placeholder="Observaciones (opcional)"
                            value={q.observation}
                            onChange={e => setQ(q.id, { observation: e.target.value })}
                            className="w-full px-2.5 py-1.5 border border-[#E8EBF4] rounded-xl text-[13px] text-slate-600 resize-none focus:border-indigo-400 focus:outline-none bg-slate-100 mb-1.5" />
                          {/* Evidencia */}
                          <div className="flex items-center gap-2">
                            {q.evidence_url ? (
                              <div className="flex items-center gap-1.5">
                                <img src={q.evidence_url} alt="Evidencia" className="h-8 w-12 object-cover rounded-lg border border-[#E8EBF4]" />
                                <button type="button" onClick={() => setQ(q.id, { evidence_url: '' })}
                                  className="text-[12px] text-red-400 hover:text-red-600 font-semibold">
                                  Eliminar
                                </button>
                              </div>
                            ) : (
                              <>
                                <input
                                  ref={q.id === uploadingId ? fileInputRef : undefined}
                                  type="file" accept="image/*" className="hidden"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) handleEvidenceFile(q.id, f); setUploadingId(null); }}
                                />
                                <button type="button"
                                  onClick={() => { setUploadingId(q.id); setTimeout(() => fileInputRef.current?.click(), 50); }}
                                  className="flex items-center gap-1 text-[12px] text-indigo-500 hover:text-indigo-700 font-semibold border border-indigo-200 rounded-lg px-2 py-1 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                                  <Camera size={10} /> Adjuntar evidencia
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTE IMAGE UPLOADER — sube al backend /api/upload
// ============================================================
interface ImageUploaderProps {
  label: string;
  sublabel?: string;
  value: string;            // URL pública devuelta por el backend
  onChange: (url: string) => void;
  onClear: () => void;
  accent?: string;
  icon?: React.ReactNode;
}

function ImageUploader({ label, sublabel, value, onChange, onClear, accent = 'text-blue-500', icon }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setUploadError('Solo se aceptan imágenes (JPG, PNG, WEBP).'); return; }
    if (file.size > 10 * 1024 * 1024) { setUploadError('La imagen supera el límite de 10 MB.'); return; }
    setUploadError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json() as { url: string };
      onChange(data.url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al subir imagen';
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {icon && <span className={accent}>{icon}</span>}
          <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
        </div>
        {value && !uploading && (
          <button type="button" onClick={onClear}
            className="flex items-center gap-1 text-[12px] text-red-400 hover:text-red-600 font-semibold transition-colors">
            <Trash2 size={10} /> Eliminar
          </button>
        )}
      </div>
      {sublabel && <p className="text-[12px] text-[#5C6194] mb-2 leading-tight">{sublabel}</p>}
      {uploadError && (
        <p className="text-[12px] text-red-500 mb-1.5 flex items-center gap-1">
          <span>⚠</span> {uploadError}
        </p>
      )}
      {uploading ? (
        <div className="flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
          <p className="text-[13px] text-blue-500 font-medium">Subiendo imagen...</p>
        </div>
      ) : value ? (
        <div className="relative group rounded-xl overflow-hidden border border-[#E8EBF4] bg-slate-50">
          <img src={value} alt={label} className="w-full h-36 object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button type="button" onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 rounded-xl text-[13px] font-bold text-slate-700 shadow-sm hover:bg-slate-100 transition-colors">
              <Camera size={11} /> Cambiar
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed cursor-pointer transition-all
            ${dragOver ? 'border-blue-400 bg-blue-50/60' : 'border-[#E8EBF4] bg-slate-50/80 hover:border-blue-300 hover:bg-blue-50/30'}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-[#F0F2FA] border border-[#E8EBF4] ${accent}`}>
            {icon ?? <Camera size={16} />}
          </div>
          <p className="text-[13px] font-semibold text-slate-500">
            {dragOver ? 'Suelta la imagen aquí' : 'Haz clic o arrastra una imagen'}
          </p>
          <p className="text-[12px] text-[#5C6194]">JPG, PNG, WEBP — máx. 10 MB</p>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
    </div>
  );
}

// ============================================================
// MODAL VISOR DE IMAGEN (lightbox)
// ============================================================
interface ImageViewerProps {
  src: string;
  title: string;
  onClose: () => void;
}

function ImageViewer({ src, title, onClose }: ImageViewerProps) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-4xl max-h-[90vh] mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-white text-sm font-bold">{title}</p>
          <button onClick={onClose} className="p-1.5 rounded-xl bg-slate-100/10 hover:bg-slate-100/20 transition-colors">
            <X size={16} className="text-white" />
          </button>
        </div>
        <img src={src} alt={title} className="max-w-full max-h-[80vh] rounded-2xl object-contain shadow-2xl" />
      </div>
    </div>
  );
}

// ============================================================
// FICHA RESUMEN GENÉRICA (enterprise glass)
// ============================================================
interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  subtitle?: string;
  color: string;
  border: string;
  grad: string;
  iconRing: string;
  iconText: string;
  bar?: string;
  pct?: number;
  pctLabel?: string;
  onClick?: () => void;
  large?: boolean;
}

function SummaryCard({ icon, label, value, subtitle, color, border, grad, iconRing, iconText, bar, pct, pctLabel, onClick, large }: SummaryCardProps) {
  return (
    <button onClick={onClick}
      className={`group relative w-full text-left rounded-2xl border border-[#E8EBF4] bg-white shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 overflow-hidden`}>
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-100/20 pointer-events-none" />
      <div className="relative p-5">
        <div className="flex items-start justify-between mb-4">
          <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${iconRing} ${iconText}`}>{icon}</div>
          {onClick && <ChevronRight size={13} className={`${iconText} opacity-0 group-hover:opacity-60 transition-opacity mt-0.5`} />}
        </div>
        <div className={`${large ? 'text-5xl' : 'text-4xl'} font-black text-slate-800 leading-none tracking-tight tabular-nums mb-0.5`}>{value}</div>
        <p className="text-sm font-bold text-[#1A1D2E] mt-1">{label}</p>
        {subtitle && <p className="text-[13px] text-[#5C6194] leading-tight mt-0.5 truncate">{subtitle}</p>}
        {pct !== undefined && bar && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] text-[#5C6194] font-medium uppercase tracking-wider">{pctLabel ?? 'del total'}</span>
              <span className={`text-[12px] font-bold ${color}`}>{pct}%</span>
            </div>
            <div className="h-1 w-full bg-slate-100/80 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

// ============================================================
// FICHA DE CERTIFICACIÓN (con fracción visual)
// ============================================================
interface CertCardProps {
  label: string;
  certified: number;
  total: number;
  color: string;
  border: string;
  grad: string;
  iconRing: string;
  iconText: string;
  bar: string;
}

function CertCard({ label, certified, total, color, border, grad, iconRing, iconText, bar }: CertCardProps) {
  const pct = total > 0 ? Math.round((certified / total) * 100) : 0;
  return (
    <div className={`relative rounded-2xl border border-[#E8EBF4] bg-white shadow-sm overflow-hidden`}>
      <div className="relative p-5">
        <div className="flex items-start justify-between mb-4">
          <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${iconRing} ${iconText}`}>
            <Award size={18} strokeWidth={1.8} />
          </div>
          <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${pct === 100 ? 'bg-emerald-100 text-emerald-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
            {pct === 100 ? '✓ Completo' : pct >= 50 ? 'En progreso' : 'Pendiente'}
          </span>
        </div>
        <div className="text-4xl font-black text-[#1A1D2E] leading-none tracking-tight tabular-nums mb-0.5">
          {certified}<span className="text-xl font-bold text-slate-500"> / {total}</span>
        </div>
        <p className="text-sm font-bold text-[#1A1D2E] mt-1">{label}</p>
        <p className="text-[13px] text-[#5C6194] mt-0.5">Certificados de {total} registrados</p>
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] text-[#5C6194] font-medium uppercase tracking-wider">normativa</span>
            <span className={`text-[12px] font-bold ${color}`}>{pct}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100/80 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CARD DE MDF/IDF (inventario)
// ============================================================
interface MdfCardProps {
  record: MdfIdfRecord;
  onView: (r: MdfIdfRecord) => void;
  onEdit: (r: MdfIdfRecord) => void;
}

function MdfCard({ record, onView, onEdit }: MdfCardProps) {
  const tc = TYPE_CONFIG[record.type];
  const sc = STATUS_CONFIG[record.status];
  const capacityPct = record.capacity_u > 0 ? Math.round((record.used_u / record.capacity_u) * 100) : 0;
  const capacityColor = capacityPct >= 90 ? 'bg-red-400' : capacityPct >= 70 ? 'bg-amber-400' : 'bg-emerald-400';
  const capacityText = capacityPct >= 90 ? 'text-red-600' : capacityPct >= 70 ? 'text-amber-600' : 'text-emerald-600';
  const [viewer, setViewer] = useState<{ src: string; title: string } | null>(null);
  const certBadge = (record as any)._cert_badge as string | undefined;
  const certOverall = (record as any)._cert_overall as number | null | undefined;

  return (
    <div className={`group relative rounded-2xl border border-[#E8EBF4] bg-white shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 overflow-hidden`}>
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-100/20 pointer-events-none" />
      <div className="relative p-4">

        {/* Cabecera */}
        <div className="flex items-start justify-between mb-3">
          <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${tc.iconRing} ${tc.iconText} flex-shrink-0`}>
            {tc.icon}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] font-semibold ${sc.pill}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
              {record.status}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-bold ${tc.pill}`}>
              {record.type}
            </span>
            {certBadge && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-bold ${
                certBadge === 'Certificable' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
                certBadge === 'Encaminado' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' :
                'bg-red-50 text-red-700 ring-1 ring-red-200'
              }`}>
                {certBadge === 'Certificable' ? <CheckCircle2 size={9} /> : certBadge === 'Encaminado' ? <Clock size={9} /> : <XCircle size={9} />}
                {certBadge}{certOverall !== null && certOverall !== undefined ? ` ${certOverall}%` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Nombre y código */}
        <p className="font-black text-slate-800 text-sm leading-tight line-clamp-2 mb-0.5">{record.name}</p>
        <p className="text-[13px] font-mono text-blue-500 font-semibold">{record.code}</p>

        {/* Ubicación */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[13px] text-[#5C6194]">
            <Building2 size={10} className="flex-shrink-0 text-slate-500" />
            <span className="truncate font-medium">{record.building}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-[#5C6194]">
            <MapPin size={10} className="flex-shrink-0 text-slate-500" />
            <span className="truncate">{record.floor} · {record.zone}</span>
          </div>
          {record.floor_plan_ref && (
            <div className="flex items-center gap-1.5 text-[13px] text-[#5C6194]">
              <Hash size={10} className="flex-shrink-0 text-slate-500" />
              <span className="truncate font-mono text-[12px]">{record.floor_plan_ref}</span>
            </div>
          )}
          {record.responsible !== 'Sin asignar' && (
            <div className="flex items-center gap-1.5 text-[13px] text-[#5C6194]">
              <User size={10} className="flex-shrink-0 text-slate-500" />
              <span className="truncate">{record.responsible}</span>
            </div>
          )}
        </div>

        {/* Contadores */}
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[
            { icon: <Layers size={9} />, val: record.racks_count, label: 'Racks' },
            { icon: <Network size={9} />, val: record.switches_count, label: 'Switches' },
            { icon: <Zap size={9} />, val: record.ups_count, label: 'UPS' },
          ].map(({ icon, val, label }) => (
            <div key={label} className="flex flex-col items-center py-1.5 bg-slate-100/80 rounded-xl border border-white/80">
              <span className="text-slate-500 mb-0.5">{icon}</span>
              <span className="text-sm font-black text-slate-700 leading-none">{val}</span>
              <span className="text-[13px] text-slate-500 mt-0.5">{label}</span>
            </div>
          ))}
        </div>

        {/* Imágenes: foto real + referencia normativa */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {/* Foto real */}
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Camera size={8} /> Foto real
            </span>
            {record.photo_url ? (
              <button type="button" onClick={() => setViewer({ src: record.photo_url, title: `Foto — ${record.name}` })}
                className="relative group/img h-16 rounded-xl overflow-hidden border border-[#E8EBF4]">
                <img src={record.photo_url} alt="Foto" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                  <ZoomIn size={14} className="text-white" />
                </div>
              </button>
            ) : (
              <div className="h-16 rounded-xl bg-slate-100/40 border border-dashed border-[#E8EBF4] flex items-center justify-center text-[#5C6194]">
                <Camera size={14} />
              </div>
            )}
          </div>
          {/* Imagen de referencia normativa */}
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <BookOpen size={8} /> Referencia
            </span>
            {record.ref_image_url ? (
              <button type="button" onClick={() => setViewer({ src: record.ref_image_url, title: `Referencia normativa — ${record.name}` })}
                className="relative group/img h-16 rounded-xl overflow-hidden border border-[#E8EBF4]">
                <img src={record.ref_image_url} alt="Referencia" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                  <ZoomIn size={14} className="text-white" />
                </div>
              </button>
            ) : (
              <div className="h-16 rounded-xl bg-slate-100/40 border border-dashed border-[#E8EBF4] flex items-center justify-center text-[#5C6194]">
                <BookOpen size={14} />
              </div>
            )}
          </div>
        </div>
        {/* Lightbox */}
        {viewer && <ImageViewer src={viewer.src} title={viewer.title} onClose={() => setViewer(null)} />}

        {/* Capacidad */}
        {record.capacity_u > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] text-[#5C6194] font-medium uppercase tracking-wider">Capacidad U</span>
              <span className={`text-[12px] font-bold ${capacityText}`}>{capacityPct}% ({record.used_u}/{record.capacity_u}U)</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100/80 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${capacityColor} transition-all duration-700`} style={{ width: `${capacityPct}%` }} />
            </div>
          </div>
        )}

        {/* Certificado */}
        {record.certified && (
          <div className="mt-2 flex items-center gap-1.5">
            <Award size={10} className="text-emerald-500" />
            <span className="text-[12px] text-emerald-600 font-bold">Certificado</span>
          </div>
        )}

        {/* Tags */}
        {record.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {record.tags.slice(0, 3).map(t => (
              <span key={t} className="px-1.5 py-0.5 bg-slate-100/80 border border-[#E8EBF4]/80 rounded-md text-[13px] text-slate-500 font-medium">{t}</span>
            ))}
          </div>
        )}

        {/* Pie */}
        <div className="mt-3 pt-3 border-t border-white/60 flex items-center justify-between">
          <span className="text-[12px] text-[#5C6194] flex items-center gap-1">
            <CalendarDays size={9} /> {record.last_updated}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onView(record)}
              className="p-1.5 rounded-lg hover:bg-blue-100/80 text-blue-500 transition-colors" title="Ver detalle">
              <Eye size={12} />
            </button>
            <button onClick={() => onEdit(record)}
              className="p-1.5 rounded-lg hover:bg-slate-100/80 text-slate-500 transition-colors" title="Editar">
              <Edit2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PANEL DE DETALLE
// ============================================================
interface DetailPanelProps {
  record: MdfIdfRecord;
  onClose: () => void;
  onEdit: (r: MdfIdfRecord) => void;
}

function DetailPanel({ record, onClose, onEdit }: DetailPanelProps) {
  const tc = TYPE_CONFIG[record.type];
  const sc = STATUS_CONFIG[record.status];
  const capacityPct = record.capacity_u > 0 ? Math.round((record.used_u / record.capacity_u) * 100) : 0;
  const [localPhoto, setLocalPhoto] = useState(record.photo_url);
  const [localRef, setLocalRef] = useState(record.ref_image_url);
  const [viewer, setViewer] = useState<{ src: string; title: string } | null>(null);

  const Section = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <div className="bg-slate-100/80 backdrop-blur-sm rounded-2xl border border-[#E8EBF4]/70 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={`${tc.iconText}`}>{icon}</span>
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">{title}</h3>
      </div>
      {children}
    </div>
  );

  const Row = ({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) => (
    <div className="flex items-start justify-between py-1.5 border-b border-[#E8EBF4]/80 last:border-0">
      <span className="text-[13px] text-[#5C6194] font-medium min-w-[120px]">{label}</span>
      <span className={`text-[13px] text-slate-700 font-semibold text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-slate-100/95 backdrop-blur shadow-2xl overflow-y-auto border-l border-[#E8EBF4] flex flex-col">
        <div className={`bg-gradient-to-br ${tc.grad} border-b border-[#E8EBF4]/70 p-5 flex-shrink-0`}>
          <div className="flex items-start justify-between mb-3">
            <div className={`flex items-center justify-center w-12 h-12 rounded-2xl ${tc.iconRing} ${tc.iconText}`}>{tc.icon}</div>
            <div className="flex items-center gap-2">
              <button onClick={() => onEdit(record)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/80 border border-[#E8EBF4] rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors">
                <Edit2 size={11} /> Editar
              </button>
              <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100/80 transition-colors">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
          </div>
          <h2 className="text-lg font-black text-[#1A1D2E] leading-tight">{record.name}</h2>
          <p className="text-[13px] font-mono text-blue-500 font-bold mt-0.5">{record.code}</p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-semibold ${sc.pill}`}>
              {sc.icon} {record.status}
            </span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-bold ${tc.pill}`}>
              {record.type}
            </span>
            {record.certified && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-bold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                <Award size={10} /> Certificado
              </span>
            )}
            {record.tags.map(t => (
              <span key={t} className="px-2 py-0.5 bg-slate-100/80 border border-[#E8EBF4]/80 rounded-full text-[12px] text-[#5C6194] font-medium">{t}</span>
            ))}
          </div>
        </div>

        <div className="flex-1 p-5 space-y-3 bg-white">
          <Section title="Información General" icon={<Info size={14} />}>
            <Row label="Código" value={record.code} mono />
            <Row label="Tipo" value={record.type} />
            <Row label="Estado" value={record.status} />
            <Row label="Ref. en plano" value={record.floor_plan_ref || '—'} mono />
            <Row label="Creado" value={record.created_at} />
            <Row label="Última actualización" value={record.last_updated} />
          </Section>

          <Section title="Ubicación Física" icon={<MapPin size={14} />}>
            <Row label="Edificio" value={record.building} />
            <Row label="Piso" value={record.floor} />
            <Row label="Zona" value={record.zone} />
            <Row label="Dirección" value={record.address} />
          </Section>

          <Section title="Responsable Técnico" icon={<User size={14} />}>
            <Row label="Nombre" value={record.responsible} />
            <Row label="Email" value={record.responsible_email || '—'} mono />
          </Section>

          <Section title="Equipos Asociados" icon={<Layers size={14} />}>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[
                { icon: <Layers size={14} />, val: record.racks_count, label: 'Racks' },
                { icon: <Network size={14} />, val: record.switches_count, label: 'Switches' },
                { icon: <Zap size={14} />, val: record.ups_count, label: 'UPS' },
                { icon: <Hash size={14} />, val: record.nodes_count, label: 'Nodos' },
                { icon: <Server size={14} />, val: record.servers_count, label: 'Servidores' },
              ].map(({ icon, val, label }) => (
                <div key={label} className="flex flex-col items-center py-3 bg-slate-100/80 rounded-xl border border-[#E8EBF4]">
                  <span className={`${tc.iconText} mb-1`}>{icon}</span>
                  <span className="text-xl font-black text-slate-800">{val}</span>
                  <span className="text-[12px] text-[#5C6194] mt-0.5">{label}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Capacidad de Rack" icon={<BarChart2 size={14} />}>
            <Row label="Capacidad total" value={`${record.capacity_u} U`} />
            <Row label="Unidades usadas" value={`${record.used_u} U`} />
            <Row label="Unidades libres" value={`${record.capacity_u - record.used_u} U`} />
            <div className="mt-2">
              <div className="flex justify-between text-[12px] text-[#5C6194] mb-1">
                <span>Ocupación</span><span className="font-bold">{capacityPct}%</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${capacityPct >= 90 ? 'bg-red-400' : capacityPct >= 70 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  style={{ width: `${capacityPct}%` }} />
              </div>
            </div>
          </Section>

          <Section title="UPS / Energía" icon={<Zap size={14} />}>
            <Row label="Potencia instalada" value={record.power_kva > 0 ? `${record.power_kva} kVA` : 'Sin datos'} />
            <Row label="UPS instalados" value={record.ups_count} />
          </Section>

          <Section title="Climatización" icon={<Wind size={14} />}>
            <Row label="Sistema" value={record.cooling || 'Sin datos'} />
          </Section>

          <Section title="Estado de Documentación" icon={<FileText size={14} />}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-[#5C6194]">Completitud</span>
              <span className={`text-sm font-black ${record.documentation_pct >= 80 ? 'text-emerald-600' : record.documentation_pct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                {record.documentation_pct}%
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${record.documentation_pct >= 80 ? 'bg-emerald-400' : record.documentation_pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                style={{ width: `${record.documentation_pct}%` }} />
            </div>
          </Section>

          {/* Imágenes */}
          <Section title="Fotografía Real" icon={<Camera size={14} />}>
            <div className="space-y-2">
              {localPhoto ? (
                <div className="relative group/img rounded-xl overflow-hidden border border-[#E8EBF4]">
                  <img src={localPhoto} alt="Foto real" className="w-full h-48 object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover/img:opacity-100">
                    <button type="button" onClick={() => setViewer({ src: localPhoto, title: `Foto real — ${record.name}` })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 rounded-xl text-[13px] font-bold text-slate-700 shadow-sm hover:bg-slate-100">
                      <ZoomIn size={11} /> Ampliar
                    </button>
                    <button type="button" onClick={() => setLocalPhoto('')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/90 rounded-xl text-[13px] font-bold text-white shadow-sm hover:bg-red-600">
                      <Trash2 size={11} /> Eliminar
                    </button>
                  </div>
                </div>
              ) : (
                <ImageUploader
                  label="Subir fotografía real"
                  sublabel="Foto actual del cuarto técnico o sala de telecomunicaciones"
                  value={localPhoto}
                  onChange={url => { setLocalPhoto(url); record.photo_url = url; }}
                  onClear={() => { setLocalPhoto(''); record.photo_url = ''; }}
                  accent={tc.iconText}
                  icon={<Camera size={14} />}
                />
              )}
              {!localPhoto && <p className="text-[12px] text-[#5C6194] text-center">JPG, PNG, WEBP — máx. 10 MB</p>}
            </div>
          </Section>

          <Section title="Imagen de Referencia Normativa" icon={<BookOpen size={14} />}>
            <div className="space-y-2">
              <p className="text-[13px] text-[#5C6194] leading-relaxed">
                Imagen que muestra cómo debe verse el cuarto según la norma (ANSI/TIA-568, ISO 11801, etc.).
                Sirve como guía visual para auditoría y normativa.
              </p>
              {localRef ? (
                <div className="relative group/img rounded-xl overflow-hidden border border-[#E8EBF4]">
                  <img src={localRef} alt="Referencia normativa" className="w-full h-48 object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover/img:opacity-100">
                    <button type="button" onClick={() => setViewer({ src: localRef, title: `Referencia normativa — ${record.name}` })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 rounded-xl text-[13px] font-bold text-slate-700 shadow-sm hover:bg-slate-100">
                      <ZoomIn size={11} /> Ampliar
                    </button>
                    <button type="button" onClick={() => setLocalRef('')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/90 rounded-xl text-[13px] font-bold text-white shadow-sm hover:bg-red-600">
                      <Trash2 size={11} /> Eliminar
                    </button>
                  </div>
                </div>
              ) : (
                <ImageUploader
                  label="Subir imagen de referencia"
                  sublabel="Imagen normativa de cómo debe verse este tipo de instalación"
                  value={localRef}
                  onChange={url => { setLocalRef(url); record.ref_image_url = url; }}
                  onClear={() => { setLocalRef(''); record.ref_image_url = ''; }}
                  accent="text-violet-500"
                  icon={<BookOpen size={14} />}
                />
              )}
            </div>
          </Section>

          {/* Lightbox */}
          {viewer && <ImageViewer src={viewer.src} title={viewer.title} onClose={() => setViewer(null)} />}

          {record.notes && (
            <Section title="Notas Técnicas" icon={<FileText size={14} />}>
              <p className="text-[12px] text-slate-600 leading-relaxed">{record.notes}</p>
            </Section>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => onEdit(record)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
              <Edit2 size={12} /> Editar
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-[#F0F2FA] border border-[#E8EBF4] text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors">
              <Layers size={12} /> Agregar Rack
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-[#F0F2FA] border border-[#E8EBF4] text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors">
              <Eye size={12} /> Ver Activos Asociados
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL CREAR / EDITAR
// ============================================================
interface MdfModalProps {
  record: MdfIdfRecord | null;
  onClose: () => void;
  onSave: (r: MdfIdfRecord) => void;
}

function MdfModal({ record, onClose, onSave }: MdfModalProps) {
  const isEdit = !!record;
  const [evaluation, setEvaluation] = useState<CertEvaluation>(
    (record as any)?._evaluation ?? buildDefaultEval()
  );
  const [form, setForm] = useState<Partial<MdfIdfRecord>>(record ?? {
    code: '', name: '', type: 'IDF', building: '', floor: '', zone: '',
    address: '', status: 'Operativo', responsible: '', responsible_email: '',
    racks_count: 0, switches_count: 0, ups_count: 0, nodes_count: 0, servers_count: 0,
    capacity_u: 42, used_u: 0, cooling: '', power_kva: 0,
    documentation_pct: 0, certified: false,
    floor_plan_ref: '', photo_url: '', ref_image_url: '',
    notes: '', tags: [],
  });

  const handleSave = () => {
    if (!form.name || !form.code || !form.type) return;
    const now = new Date().toISOString().slice(0, 10);
    const certResults = calcCertResults(evaluation);
    onSave({
      ...form,
      id: record?.id ?? Date.now().toString(),
      created_at: record?.created_at ?? now,
      last_updated: now,
      tags: form.tags ?? [],
      _evaluation: evaluation,
      _cert_badge: certResults.badge,
      _cert_overall: certResults.overall,
    } as MdfIdfRecord & { _evaluation: CertEvaluation; _cert_badge: string; _cert_overall: number | null });
  };

  const F = ({ label, children, span = 1 }: { label: string; children: React.ReactNode; span?: number }) => (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</label>
      {children}
    </div>
  );
  const inp = "w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-100";
  const sel = "w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-slate-100/95 backdrop-blur rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto border border-[#E8EBF4]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EBF4]">
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">
              {isEdit ? 'Editar MDF / IDF' : 'Nuevo MDF / IDF'}
            </h2>
            <p className="text-[13px] text-[#5C6194] mt-0.5">
              {isEdit ? 'Modifica los datos del cuarto técnico' : 'Registra un nuevo cuarto de telecomunicaciones'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-3">
            <F label="Código *"><input className={inp} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="Ej: MDF-001" /></F>
            <F label="Tipo *">
              <select className={sel} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as MdfIdfType }))}>
                <option>MDF</option><option>IDF</option><option>Site</option><option>Sala Técnica</option>
              </select>
            </F>
            <F label="Nombre *" span={2}><input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: MDF Principal Torre A" /></F>
            <F label="Estado">
              <select className={sel} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as MdfIdfStatus }))}>
                <option>Operativo</option><option>Atención</option><option>Crítico</option><option>Planeado</option>
              </select>
            </F>
            <F label="Edificio"><input className={inp} value={form.building} onChange={e => setForm(f => ({ ...f, building: e.target.value }))} placeholder="Ej: Torre A" /></F>
            <F label="Piso"><input className={inp} value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} placeholder="Ej: Piso 3" /></F>
            <F label="Zona"><input className={inp} value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} placeholder="Ej: Closet Telecomunicaciones" /></F>
            <F label="Dirección" span={2}><input className={inp} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></F>
            <F label="Responsable"><input className={inp} value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} /></F>
            <F label="Email responsable"><input className={inp} value={form.responsible_email} onChange={e => setForm(f => ({ ...f, responsible_email: e.target.value }))} /></F>
            <F label="Ref. en plano"><input className={inp} value={form.floor_plan_ref} onChange={e => setForm(f => ({ ...f, floor_plan_ref: e.target.value }))} placeholder="Ej: Plano-A-P3-TK-01" /></F>
            <F label="Racks"><input type="number" className={inp} value={form.racks_count} onChange={e => setForm(f => ({ ...f, racks_count: +e.target.value }))} /></F>
            <F label="Switches"><input type="number" className={inp} value={form.switches_count} onChange={e => setForm(f => ({ ...f, switches_count: +e.target.value }))} /></F>
            <F label="UPS"><input type="number" className={inp} value={form.ups_count} onChange={e => setForm(f => ({ ...f, ups_count: +e.target.value }))} /></F>
            <F label="Nodos"><input type="number" className={inp} value={form.nodes_count} onChange={e => setForm(f => ({ ...f, nodes_count: +e.target.value }))} /></F>
            <F label="Servidores"><input type="number" className={inp} value={form.servers_count} onChange={e => setForm(f => ({ ...f, servers_count: +e.target.value }))} /></F>
            <F label="Capacidad U"><input type="number" className={inp} value={form.capacity_u} onChange={e => setForm(f => ({ ...f, capacity_u: +e.target.value }))} /></F>
            <F label="Usadas U"><input type="number" className={inp} value={form.used_u} onChange={e => setForm(f => ({ ...f, used_u: +e.target.value }))} /></F>
            <F label="Potencia kVA"><input type="number" className={inp} value={form.power_kva} onChange={e => setForm(f => ({ ...f, power_kva: +e.target.value }))} /></F>
            <F label="Documentación %"><input type="number" min={0} max={100} className={inp} value={form.documentation_pct} onChange={e => setForm(f => ({ ...f, documentation_pct: +e.target.value }))} /></F>
            <F label="Climatización" span={2}><input className={inp} value={form.cooling} onChange={e => setForm(f => ({ ...f, cooling: e.target.value }))} /></F>
            <F label="Notas" span={2}><textarea className={`${inp} resize-none`} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></F>

            {/* Imágenes */}
            <F label="Fotografía Real" span={2}>
              <ImageUploader
                label="Fotografía real del cuarto técnico"
                sublabel="Sube una foto actual de la instalación"
                value={form.photo_url ?? ''}
                onChange={url => setForm(f => ({ ...f, photo_url: url }))}
                onClear={() => setForm(f => ({ ...f, photo_url: '' }))}
                accent="text-blue-500"
                icon={<Camera size={14} />}
              />
            </F>
            <F label="Imagen de Referencia Normativa" span={2}>
              <ImageUploader
                label="Imagen de referencia (norma)"
                sublabel="Cómo debe verse según ANSI/TIA-568, ISO 11801 u otra norma aplicable"
                value={form.ref_image_url ?? ''}
                onChange={url => setForm(f => ({ ...f, ref_image_url: url }))}
                onClear={() => setForm(f => ({ ...f, ref_image_url: '' }))}
                accent="text-violet-500"
                icon={<BookOpen size={14} />}
              />
            </F>

          </div>
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[#E8EBF4]">
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 bg-[#F0F2FA] border border-[#E8EBF4] rounded-xl hover:bg-slate-50 transition-colors">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
              {isEdit ? 'Guardar cambios' : 'Crear registro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PESTAÑA RESUMEN
// ============================================================
function TabResumen({ data, onTabChange }: { data: MdfIdfRecord[]; onTabChange: (tab: 'inventario') => void }) {
  const mdfList = data.filter(r => r.type === 'MDF');
  const idfList = data.filter(r => r.type === 'IDF');

  const mdfStats = useMemo(() => ({
    total: mdfList.length,
    racks: mdfList.reduce((s, r) => s + r.racks_count, 0),
    nodes: mdfList.reduce((s, r) => s + r.nodes_count, 0),
    servers: mdfList.reduce((s, r) => s + r.servers_count, 0),
    ups: mdfList.reduce((s, r) => s + r.ups_count, 0),
    certified: mdfList.filter(r => r.certified).length,
  }), [mdfList]);

  const idfStats = useMemo(() => ({
    total: idfList.length,
    racks: idfList.reduce((s, r) => s + r.racks_count, 0),
    nodes: idfList.reduce((s, r) => s + r.nodes_count, 0),
    servers: idfList.reduce((s, r) => s + r.servers_count, 0),
    ups: idfList.reduce((s, r) => s + r.ups_count, 0),
    certified: idfList.filter(r => r.certified).length,
  }), [idfList]);



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Fila 1: Ficha MDF + Ficha IDF */}
      <div>
        <SectionLabel>Totales por tipo</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          <SummaryTypeCard
            icon={<Building2 size={20} strokeWidth={1.8} />}
            iconColor="#4361EE"
            title="MDF"
            subtitle="Main Distribution Frame"
            count={mdfStats.total}
            borderColor="#4361EE"
            stats={[
              { icon: <Layers size={13} />, label: 'Racks totales', value: mdfStats.racks, iconColor: '#4361EE' },
              { icon: <Hash size={13} />, label: 'Nodos', value: mdfStats.nodes, iconColor: '#6366F1' },
              { icon: <Server size={13} />, label: 'Servidores', value: mdfStats.servers, iconColor: '#8B5CF6' },
              { icon: <Zap size={13} />, label: 'UPS', value: mdfStats.ups, iconColor: '#F59E0B' },
            ]}
          />
          <SummaryTypeCard
            icon={<Building size={20} strokeWidth={1.8} />}
            iconColor="#6366F1"
            title="IDF"
            subtitle="Intermediate Distribution Frame"
            count={idfStats.total}
            borderColor="#6366F1"
            stats={[
              { icon: <Layers size={13} />, label: 'Racks totales', value: idfStats.racks, iconColor: '#6366F1' },
              { icon: <Hash size={13} />, label: 'Nodos', value: idfStats.nodes, iconColor: '#8B5CF6' },
              { icon: <Server size={13} />, label: 'Servidores', value: idfStats.servers, iconColor: '#14B8A6' },
              { icon: <Zap size={13} />, label: 'UPS', value: idfStats.ups, iconColor: '#F59E0B' },
            ]}
          />
        </div>
      </div>



      {/* Fila 2: Normativa MDF + Normativa IDF */}
      <div>
        <SectionLabel>Estado de normativa</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <CertSummaryCard
            icon={<Award size={18} strokeWidth={1.8} />}
            iconColor="#4361EE"
            label="MDF Normativa"
            certified={data.filter(r => r.type === 'MDF' && r.certified).length}
            total={data.filter(r => r.type === 'MDF').length}
            barColor="#4361EE"
          />
          <CertSummaryCard
            icon={<Award size={18} strokeWidth={1.8} />}
            iconColor="#6366F1"
            label="IDF Normativa"
            certified={data.filter(r => r.type === 'IDF' && r.certified).length}
            total={data.filter(r => r.type === 'IDF').length}
            barColor="#6366F1"
          />
        </div>
      </div>

      {/* CTA al inventario */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => onTabChange('inventario')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 20px', background: DESIGN.blue, color: '#fff',
            border: 'none', borderRadius: 10, fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(67,97,238,0.25)',
          }}>
          <Package size={13} /> Ver inventario completo
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// VISTA LISTA EXPANDIBLE
// ============================================================
function ExpandableListView({
  records,
  onEdit,
  onView,
  highlightedId,
  rowRefs,
}: {
  records: MdfIdfRecord[];
  onEdit: (r: MdfIdfRecord) => void;
  onView: (r: MdfIdfRecord) => void;
  highlightedId?: string|null;
  rowRefs?: React.MutableRefObject<Record<string,HTMLDivElement|null>>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) => setExpandedId(prev => (prev === id ? null : id));

  return (
    <div className="bg-slate-100/80 backdrop-blur-sm rounded-2xl border border-[#E8EBF4]/70 shadow-sm overflow-hidden">
      {/* Encabezado de columnas */}
      <div className="grid grid-cols-[32px_56px_2fr_1fr_1.2fr_1fr_60px_60px_60px_100px_90px] gap-2 px-4 py-2.5 bg-slate-50/90 border-b border-[#E8EBF4]">
        <span />
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">IMG</span>
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Nombre</span>
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Tipo</span>
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Ubicación</span>
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Responsable</span>
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest text-center">Racks</span>
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest text-center">SW</span>
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest text-center">UPS</span>
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Capacidad U</span>
        <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest text-right">Estado</span>
      </div>

      {records.map((r, i) => {
        const tc = TYPE_CONFIG[r.type];
        const sc = STATUS_CONFIG[r.status];
        const capPct = r.capacity_u > 0 ? Math.round((r.used_u / r.capacity_u) * 100) : 0;
        const capColor = capPct >= 90 ? 'bg-red-400' : capPct >= 70 ? 'bg-amber-400' : 'bg-emerald-400';
        const capText = capPct >= 90 ? 'text-red-600' : capPct >= 70 ? 'text-amber-600' : 'text-emerald-600';
        const isExpanded = expandedId === r.id;
        const isHL = highlightedId === r.id;

        return (
          <div key={r.id} ref={el=>{ if(rowRefs) rowRefs.current[r.id]=el as HTMLDivElement|null; }} className={`${i < records.length - 1 ? 'border-b border-[#E8EBF4]' : ''}${isHL?' skia-highlight-row':''}`}>
            {/* Fila colapsada */}
            <div
              className={`group grid grid-cols-[32px_56px_2fr_1fr_1.2fr_1fr_60px_60px_60px_100px_90px] gap-2 px-4 py-3 items-center cursor-pointer transition-colors ${
                isExpanded ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-slate-50/80 border-l-4 border-l-transparent'
              }`}
              onClick={() => toggle(r.id)}
            >
              {/* Flecha expandir */}
              <div className={`flex items-center justify-center w-6 h-6 rounded-lg transition-all duration-200 ${
                isExpanded ? 'bg-blue-100 text-blue-600 font-bold' : 'text-[#5C6194] group-hover:text-slate-500'
              }`}>
                <ChevronDown size={13} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>

              {/* Miniatura foto */}
              <div className="w-12 h-10 rounded-lg overflow-hidden bg-[#F0F2FA] border border-[#E8EBF4] flex items-center justify-center flex-shrink-0">
                {r.photo_url ? (
                  <img src={r.photo_url} alt={r.name} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={14} className="text-[#5C6194]" />
                )}
              </div>

              {/* Nombre + código */}
              <div className="min-w-0">
                <p className="text-xs font-bold text-blue-600 truncate hover:underline">{r.name}</p>
                <p className="text-[12px] text-[#5C6194] font-mono">{r.code}</p>
              </div>

              {/* Tipo */}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-bold ${tc.pill} w-fit`}>{r.type}</span>

              {/* Ubicación */}
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-700 truncate">{r.building}</p>
                <p className="text-[12px] text-[#5C6194] truncate">{r.floor} · {r.zone}</p>
              </div>

              {/* Responsable */}
              <p className="text-[13px] text-slate-600 truncate">{r.responsible !== 'Sin asignar' ? r.responsible : '—'}</p>

              {/* Racks */}
              <p className="text-sm font-black text-slate-700 text-center">{r.racks_count}</p>
              {/* SW */}
              <p className="text-sm font-black text-slate-700 text-center">{r.switches_count}</p>
              {/* UPS */}
              <p className="text-sm font-black text-slate-700 text-center">{r.ups_count}</p>

              {/* Capacidad */}
              <div>
                <div className="flex justify-between text-[12px] mb-0.5">
                  <span className="text-slate-500">{r.used_u}/{r.capacity_u}U</span>
                  <span className={`font-bold ${capText}`}>{capPct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${capColor}`} style={{ width: `${capPct}%` }} />
                </div>
              </div>

              {/* Estado */}
              <div className="flex justify-end">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold ${sc.pill}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{r.status}
                </span>
              </div>
            </div>

            {/* Fila expandida — detalle completo */}
            {isExpanded && (
              <div className="bg-blue-50/30 border-t-2 border-t-blue-200 px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
                  {/* Columna izquierda: fotos */}
                  <div className="flex flex-col gap-3">
                    {/* Foto real */}
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <Camera size={10} /> Foto real
                      </p>
                      <div className="w-full h-32 rounded-xl overflow-hidden bg-[#F0F2FA] border border-[#E8EBF4] flex items-center justify-center">
                        {r.photo_url ? (
                          <img src={r.photo_url} alt={r.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-[#5C6194]">
                            <Camera size={20} />
                            <span className="text-[12px]">Sin foto</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Imagen referencia */}
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <BookOpen size={10} /> Referencia normativa
                      </p>
                      <div className="w-full h-28 rounded-xl overflow-hidden bg-[#F0F2FA] border border-[#E8EBF4] flex items-center justify-center">
                        {r.ref_image_url ? (
                          <img src={r.ref_image_url} alt="Referencia" className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-[#5C6194]">
                            <BookOpen size={18} />
                            <span className="text-[12px]">Sin imagen</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Columna derecha: campos detalle */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                    {/* ID / Serie */}
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">ID / Código</p>
                      <p className="text-xs font-mono text-blue-600 mt-0.5">{r.code}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Tipo</p>
                      <p className="text-xs font-semibold text-[#1A1D2E] mt-0.5">{r.type}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Estado</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold mt-0.5 ${sc.pill}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{r.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Edificio</p>
                      <p className="text-xs font-semibold text-[#1A1D2E] mt-0.5">{r.building}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Piso / Zona</p>
                      <p className="text-xs text-slate-600 mt-0.5">{r.floor} · {r.zone}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Ref. en Plano</p>
                      <p className="text-xs font-mono text-slate-600 mt-0.5">{r.floor_plan_ref || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Responsable</p>
                      <p className="text-xs text-slate-700 mt-0.5">{r.responsible}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Contacto</p>
                      <p className="text-xs text-slate-600 mt-0.5">{r.responsible || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Capacidad</p>
                      <p className="text-xs text-slate-700 mt-0.5">{r.used_u}U / {r.capacity_u}U ({capPct}%)</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Racks</p>
                      <p className="text-xs font-black text-slate-800 mt-0.5">{r.racks_count}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Switches</p>
                      <p className="text-xs font-black text-slate-800 mt-0.5">{r.switches_count}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">UPS</p>
                      <p className="text-xs font-black text-slate-800 mt-0.5">{r.ups_count}</p>
                    </div>
                    {r.notes && (
                      <div className="col-span-3">
                        <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Notas técnicas</p>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{r.notes}</p>
                      </div>
                    )}
                    {/* Documentación */}
                    <div className="col-span-3">
                      <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Documentación</p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${r.documentation_pct >= 80 ? 'bg-emerald-400' : r.documentation_pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${r.documentation_pct}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${r.documentation_pct >= 80 ? 'text-emerald-600' : r.documentation_pct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                          {r.documentation_pct}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Botones de acción */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t-2 border-t-blue-200">
                  <button
                    onClick={e => { e.stopPropagation(); onEdit(r); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Edit2 size={11} /> Editar
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onView(r); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#F0F2FA] border border-[#E8EBF4] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <Eye size={11} /> Ver detalle completo
                  </button>
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#F0F2FA] border border-[#E8EBF4] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <Wrench size={11} /> Mantenimiento
                  </button>
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#F0F2FA] border border-[#E8EBF4] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <FileText size={11} /> Ficha Técnica
                  </button>
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#F0F2FA] border border-[#E8EBF4] text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <ImageIcon size={11} /> Imagen
                  </button>
                  <button
                    onClick={e => e.stopPropagation()}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#F0F2FA] border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={11} /> Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// PESTAÑA INVENTARIO
// ============================================================
function TabInventario({ data, setData, highlightCode }: { data: MdfIdfRecord[]; setData: React.Dispatch<React.SetStateAction<MdfIdfRecord[]>>; highlightCode?: string; }) {
  const [search, setSearch] = useState(highlightCode||'');
  const [highlightedId, setHighlightedId] = useState<string|null>(null);
  const mdfRowRefs = useRef<Record<string,HTMLDivElement|null>>({});
  const didHLMdf = useRef(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [viewRecord, setViewRecord] = useState<MdfIdfRecord | null>(null);
  const [editRecord, setEditRecord] = useState<MdfIdfRecord | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showMdfWizard, setShowMdfWizard] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('list');
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = useMemo(() => {
    return data.filter(r => {
      const q = search.toLowerCase();
      const matchSearch = !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
        || r.building.toLowerCase().includes(q) || r.responsible.toLowerCase().includes(q)
        || r.zone.toLowerCase().includes(q) || r.floor_plan_ref.toLowerCase().includes(q);
      const matchType = !typeFilter || r.type === typeFilter;
      const matchStatus = !statusFilter || r.status === statusFilter;
      const matchBuilding = !buildingFilter || r.building === buildingFilter;
      return matchSearch && matchType && matchStatus && matchBuilding;
    });
  }, [data, search, typeFilter, statusFilter, buildingFilter]);

  // Scroll + highlight desde búsqueda global
  const router = useRouter();
  useEffect(() => {
    if (!highlightCode || didHLMdf.current) return;
    setSearch(highlightCode);
    const t = setTimeout(() => {
      const match = data.find(r =>
        r.code === highlightCode || r.code.toLowerCase().includes(highlightCode.toLowerCase()) ||
        r.name.toLowerCase().includes(highlightCode.toLowerCase())
      );
      if (!match) return;
      setHighlightedId(match.id);
      didHLMdf.current = true;
      const el = mdfRowRefs.current[match.id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        setHighlightedId(null);
        const { highlight: _h, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
      }, 2500);
    }, 300);
    return () => clearTimeout(t);
  }, [highlightCode, data]);

  const buildings = useMemo(() => Array.from(new Set(data.map(r => r.building))).sort(), [data]);
  const clearFilters = () => { setSearch(''); setTypeFilter(''); setStatusFilter(''); setBuildingFilter(''); };
  const hasFilters = !!(search || typeFilter || statusFilter || buildingFilter);

  const handleSave = (r: MdfIdfRecord) => {
    setData(prev => {
      const idx = prev.findIndex(x => x.id === r.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = r; return n; }
      return [...prev, r];
    });
    setShowModal(false); setEditRecord(null);
  };

  const handleExportCSV = () => {
    const hdr = ['Código','Nombre','Tipo','Edificio','Piso','Zona','Ref. Plano','Estado','Responsable','Racks','Switches','UPS','Nodos','Servidores','Capacidad U','Usadas U','Potencia kVA','Documentación %','Certificado'];
    const rows = filtered.map(r => [r.code, r.name, r.type, r.building, r.floor, r.zone, r.floor_plan_ref, r.status, r.responsible, r.racks_count, r.switches_count, r.ups_count, r.nodes_count, r.servers_count, r.capacity_u, r.used_u, r.power_kva, r.documentation_pct, r.certified ? 'Sí' : 'No']);
    const csv = [hdr, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `skia_mdf_idf_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url); setExportOpen(false);
  };

  const handleExportExcel = () => {
    const hdr = ['Código','Nombre','Tipo','Edificio','Piso','Zona','Ref. Plano','Estado','Responsable','Racks','Switches','UPS','Nodos','Servidores','Capacidad U','Usadas U','Potencia kVA','Documentación %','Certificado'];
    const rows = filtered.map(r => [r.code, r.name, r.type, r.building, r.floor, r.zone, r.floor_plan_ref, r.status, r.responsible, r.racks_count, r.switches_count, r.ups_count, r.nodes_count, r.servers_count, r.capacity_u, r.used_u, r.power_kva, r.documentation_pct, r.certified ? 'Sí' : 'No']);
    const tsv = [hdr, ...rows].map(row => row.join('\t')).join('\n');
    const blob = new Blob([tsv], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `skia_mdf_idf_${new Date().toISOString().slice(0, 10)}.xls`; a.click();
    URL.revokeObjectURL(url); setExportOpen(false);
  };

  return (
    <div>
      {/* Barra de herramientas — fila 1: acciones + búsqueda + filtros */}
      <div className="flex items-center gap-2 mb-2 flex-nowrap overflow-x-auto">
        <button className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100/80 border border-[#E8EBF4] rounded-xl hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm backdrop-blur-sm whitespace-nowrap flex-shrink-0">
          <Upload size={13} /> Importar
        </button>
        <div className="relative flex-shrink-0" ref={exportRef}>
          <button onClick={() => setExportOpen(p => !p)}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100/80 border border-[#E8EBF4] rounded-xl hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm backdrop-blur-sm">
            <Download size={13} /> Exportar
            <ChevronDown size={11} className={`transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
          </button>
          {exportOpen && (
            <div className="absolute left-0 top-full mt-1 z-30 bg-slate-100/95 backdrop-blur border border-[#E8EBF4] rounded-xl shadow-xl min-w-[160px] overflow-hidden">
              <button onClick={handleExportCSV} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors font-semibold">
                <Download size={12} /> Exportar CSV
              </button>
              <button onClick={handleExportExcel} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors font-semibold border-t border-[#E8EBF4]">
                <FileSpreadsheet size={12} /> Exportar Excel
              </button>
            </div>
          )}
        </div>
        <div className="h-5 w-px bg-slate-200 mx-1 flex-shrink-0" />
        {/* Búsqueda */}
        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" placeholder="Buscar por nombre, código, edificio, ref. plano..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-100/80 backdrop-blur-sm shadow-sm" />
        </div>
        {/* Tipo */}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-100/80 backdrop-blur-sm shadow-sm font-medium text-slate-600 flex-shrink-0">
          <option value="">Todos los tipos</option>
          <option>MDF</option><option>IDF</option><option>Site</option><option>Sala Técnica</option>
        </select>
        {/* Estado */}
        <div className="relative flex-shrink-0">
          <Filter size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="pl-7 pr-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-100/80 backdrop-blur-sm appearance-none shadow-sm font-medium text-slate-600">
            <option value="">Todos los estados</option>
            <option>Operativo</option><option>Atención</option><option>Crítico</option><option>Planeado</option>
          </select>
        </div>
        {/* Edificio */}
        <select value={buildingFilter} onChange={e => setBuildingFilter(e.target.value)}
          className="px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-blue-400 focus:outline-none bg-slate-100/80 backdrop-blur-sm shadow-sm font-medium text-slate-600 flex-shrink-0">
          <option value="">Todos los edificios</option>
          {buildings.map(b => <option key={b}>{b}</option>)}
        </select>
        {/* Limpiar */}
        <button onClick={clearFilters}
          className="p-2 border border-[#E8EBF4] rounded-xl hover:bg-slate-100 bg-slate-100/80 backdrop-blur-sm shadow-sm transition-all flex-shrink-0" title="Limpiar filtros">
          <RefreshCw size={13} className="text-slate-500" />
        </button>
      </div>
      {/* Barra de herramientas — fila 2: toggle vista + botón nuevo */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <div className="inline-flex items-center bg-slate-100/80 border border-[#E8EBF4] rounded-xl overflow-hidden shadow-sm backdrop-blur-sm">
          <button onClick={() => setViewMode('cards')} title="Vista fichas"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors ${viewMode === 'cards' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            <LayoutGrid size={13} /><span>Fichas</span>
          </button>
          <button onClick={() => setViewMode('list')} title="Vista lista"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            <List size={13} /><span>Lista</span>
          </button>
        </div>
        <button onClick={() => setShowMdfWizard(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap">
          <Plus size={13} /> Nuevo MDF / IDF
        </button>
      </div>

      {/* Contador */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">
          {hasFilters ? `Resultados — ${filtered.length} registro${filtered.length !== 1 ? 's' : ''}` : `Total — ${data.length} registros`}
        </p>
        {hasFilters && (
          <button onClick={clearFilters} className="text-[13px] text-blue-500 hover:underline font-semibold flex items-center gap-1">
            <X size={11} /> Limpiar filtros
          </button>
        )}
      </div>

      {/* Contenido */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
            <Building2 size={24} className="opacity-40" />
          </div>
          <p className="font-bold text-sm text-[#5C6194]">Sin resultados</p>
          <p className="text-xs mt-1 text-slate-500">Prueba con otros filtros o crea un nuevo cuarto técnico</p>
          <button onClick={clearFilters} className="mt-4 text-xs text-blue-500 hover:underline font-semibold">Limpiar filtros</button>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(r => (
            <div key={r.id} ref={el=>{ mdfRowRefs.current[r.id]=el as HTMLDivElement|null; }} className={highlightedId===r.id?'skia-highlight-row rounded-2xl':''} style={highlightedId===r.id?{borderRadius:'16px'}:{}}>
              <MdfCard record={r}
                onView={setViewRecord}
                onEdit={r => { setEditRecord(r); setShowModal(true); }} />
            </div>
          ))}
        </div>
      ) : (
        /* Vista lista expandible estilo referencia */
        <ExpandableListView
          records={filtered}
          onEdit={r => { setEditRecord(r); setShowModal(true); }}
          onView={setViewRecord}
          highlightedId={highlightedId}
          rowRefs={mdfRowRefs}
        />
      )}

      {/* Panel detalle */}
      {viewRecord && (
        <DetailPanel record={viewRecord} onClose={() => setViewRecord(null)}
          onEdit={r => { setViewRecord(null); setEditRecord(r); setShowModal(true); }} />
      )}

      {/* Modal */}
      {showModal && (
        <MdfModal record={editRecord} onClose={() => { setShowModal(false); setEditRecord(null); }} onSave={handleSave} />
      )}
      {showMdfWizard && (
        <MdfIdfWizard
          onClose={() => setShowMdfWizard(false)}
          onSave={(data: MdfIdfWizardData) => {
            const now = new Date().toISOString();
            const newRecord: MdfIdfRecord = {
              id: Date.now().toString(),
              code: data.code,
              name: data.name,
              type: data.type as any,
              status: data.status as any,
              building: data.building,
              floor: data.floor,
              zone: data.zone ?? '',
              address: data.address ?? '',
              responsible: data.responsible ?? '',
              responsible_email: data.responsible_email ?? '',
              racks_count: data.racks_count ?? 0,
              switches_count: data.switches_count ?? 0,
              ups_count: data.ups_count ?? 0,
              nodes_count: data.nodes_count ?? 0,
              servers_count: data.servers_count ?? 0,
              capacity_u: data.capacity_u ?? 0,
              used_u: data.used_u ?? 0,
              cooling: data.cooling ?? '',
              power_kva: data.power_kva ?? 0,
              documentation_pct: 0,
              certified: false,
              floor_plan_ref: data.floor_plan_ref ?? '',
              photo_url: data.photo_url ?? '',
              ref_image_url: '',
              notes: data.notes ?? '',
              last_updated: now,
              created_at: now,
              tags: data.tags ?? [],
            };
            handleSave(newRecord);
            setShowMdfWizard(false);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// CONTENIDO PRINCIPAL CON PESTAÑAS
// ============================================================
function MdfIdfContent() {
  const router = useRouter();
  const highlightCode = typeof router.query.highlight === 'string' ? decodeURIComponent(router.query.highlight) : undefined;
  const [data, setData] = useState<MdfIdfRecord[]>([]);

  // Cargar MDF/IDF del backend al montar
  useEffect(() => {
    import('axios').then(({ default: axios }) => {
      axios.get('/api/infra/mdf-idf')
        .then(res => setData(Array.isArray(res.data) ? res.data : []))
        .catch(() => setData([]));
    });
  }, []);
  const [activeTab, setActiveTab] = useState<'resumen' | 'inventario' | 'normativa'>(highlightCode ? 'inventario' : 'resumen');
  const [showMdfWizard, setShowMdfWizard] = useState(false);

  const tabs: { id: 'resumen' | 'inventario' | 'normativa'; label: string; icon: React.ReactNode }[] = [
    { id: 'resumen', label: 'Resumen', icon: <BarChart2 size={14} /> },
    { id: 'inventario', label: 'Inventario', icon: <Package size={14} /> },
    { id: 'normativa', label: 'Normativa', icon: <Award size={14} /> },
  ];

  return (
    <div className="p-6 min-h-screen" style={{ background: '#EEF0F8' }}>

      {/* Encabezado */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#1A1D2E] tracking-tight">MDF / IDF</h1>
          <p className="text-sm text-[#5C6194] mt-1 font-medium">
            Gestión de cuartos técnicos, salas de telecomunicaciones y puntos de distribución.
          </p>
        </div>
        <button onClick={() => setShowMdfWizard(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap">
          <Plus size={13} /> Nuevo MDF / IDF
        </button>
      </div>

      {/* Pestañas */}
      <div className="flex items-center gap-1 mb-6 bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl p-1 w-fit shadow-sm">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700'
            }`}>
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenido de la pestaña activa */}
      {data.length === 0 ? (
        <ModuleEmptyState
          icon={<Building2 size={36} className="text-blue-600" />}
          title="Sin MDF / IDF registrados"
          description="Los cuartos técnicos MDF e IDF son el corazón de tu red estructurada. Registra cada sala con su equipamiento, capacidad y normativa para tener visibilidad total de tu infraestructura física."
          features={[
            { icon: <Building2 size={14}/>, text: 'Inventario de cuartos técnicos y salas' },
            { icon: <Wind size={14}/>, text: 'Control de temperatura y enfriamiento' },
            { icon: <Shield size={14}/>, text: 'Evaluación de normativa TIA-942' },
            { icon: <Zap size={14}/>, text: 'Capacidad eléctrica y UPS por sala' },
          ]}
          wizardLabel="Registrar primer MDF / IDF"
          onOpenWizard={() => setShowMdfWizard(true)}
          accentColor="blue"
        />
      ) : (
        <>
          {activeTab === 'resumen' && <TabResumen data={data} onTabChange={setActiveTab} />}
          {activeTab === 'inventario' && <TabInventario data={data} setData={setData} highlightCode={highlightCode} />}
          {activeTab === 'normativa' && <TabNormativa sites={data} />}
                </>
      )}
      {showMdfWizard && (
        <MdfIdfWizard
          onClose={() => setShowMdfWizard(false)}
          onSave={(d: MdfIdfWizardData) => {
            const newRecord: MdfIdfRecord = {
              id: String(Date.now()),
              code: d.code, name: d.name, type: (d.type as MdfIdfType) || 'IDF',
              building: d.building, floor: d.floor, zone: d.zone || '',
              address: d.address || '', status: 'Operativo',
              responsible: d.responsible || '', responsible_email: d.responsible_email || '',
              racks_count: 0, switches_count: 0, ups_count: 0, nodes_count: 0, servers_count: 0,
              capacity_u: Number(d.capacity_u) || 0, used_u: 0,
              cooling: d.cooling || '', power_kva: Number(d.power_kva) || 0,
              documentation_pct: 0, certified: false,
              floor_plan_ref: d.floor_plan_ref || '', photo_url: d.photo_url || '',
              ref_image_url: '', notes: d.notes || '',
              last_updated: new Date().toISOString().slice(0, 10),
              created_at: new Date().toISOString().slice(0, 10),
              tags: d.tags || [],
            };
            import('axios').then(({ default: axios }) => {
              axios.post('/api/infra/mdf-idf', {
                internal_code: d.code,
                name: d.name,
                site_type: d.type ?? 'IDF',
                status: 'active',
                building: d.building,
                floor: d.floor,
                zone: d.zone ?? '',
                address: d.address ?? '',
                responsible: d.responsible ?? '',
                responsible_email: d.responsible_email ?? '',
                capacity_u: d.capacity_u ?? 0,
                cooling: d.cooling ?? '',
                power_kva: d.power_kva ?? 0,
                notes: d.notes ?? '',
              }).then(resp => {
                setData(prev => [{ ...newRecord, id: resp.data.id ?? newRecord.id }, ...prev]);
              }).catch(() => {
                setData(prev => [newRecord, ...prev]);
              });
            });
            setShowMdfWizard(false);
          }}
        />
      )}
    </div>
  );
}
// ============================================================
// PÁGINA CON APPLAYOUT
// ============================================================
export default function MdfIdfPage() {
  return (
    <>
      <Head><title>MDF / IDF — SKIA DCIM Platform</title></Head>
      <AppLayout breadcrumb={[{ label: 'Infraestructura', path: '/dashboard' }, { label: 'MDF / IDF' }]}>
        <MdfIdfContent />
      </AppLayout>
    </>
  );
}
