import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AppLayout from '../components/AppLayout';
import {
  Package, Grid3x3, Building2, AlertCircle, BarChart3,
  Gauge, Shield, Wrench, CheckSquare, Zap,
  Activity, Clock, Users, Plus, ArrowUpRight, Loader2,
  Network, Server, Layers, MapPin, FileText, TrendingUp,
  ChevronRight, Cpu, BookOpen, Sparkles
} from 'lucide-react';

// ---- Tipos ----
interface DashboardStats {
  activosTotal: number;
  activosMesAntes: number;
  ticketsAbiertos: number;
  ticketsCriticos: number;
  mdfIdfTotal: number;
  mdfIdfAtencion: number;
  racksTotal: number;
  switchesTotal: number;
  upsTotal: number;
  usuariosActivos: number;
  usuariosOnline: number;
  slaCumplimiento: number;
}

interface DashboardTicket {
  id: string;
  title: string;
  priority: string;
  status: string;
  time: string;
}

interface DashboardAsset {
  name: string;
  type: string;
  status: string;
  location: string;
}

interface DashboardData {
  stats: DashboardStats;
  recentTickets: DashboardTicket[];
  criticalAssets: DashboardAsset[];
  isEmpty: boolean;
  userName?: string;
}

const EMPTY_STATS: DashboardStats = {
  activosTotal: 0, activosMesAntes: 0,
  ticketsAbiertos: 0, ticketsCriticos: 0,
  mdfIdfTotal: 0, mdfIdfAtencion: 0,
  racksTotal: 0, switchesTotal: 0, upsTotal: 0,
  usuariosActivos: 0, usuariosOnline: 0,
  slaCumplimiento: 100,
};

// Pasos de onboarding
const ONBOARDING_STEPS = [
  {
    step: 1,
    icon: MapPin,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    title: 'Configura tu MDF / IDF',
    desc: 'Define los cuartos de telecomunicaciones y sitios de tu infraestructura de red.',
    href: '/infraestructura/mdf-idf',
    action: 'Ir a MDF/IDF',
  },
  {
    step: 2,
    icon: Server,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    title: 'Registra tus Racks',
    desc: 'Agrega los gabinetes físicos donde se alojan tus equipos de red y servidores.',
    href: '/infraestructura/racks',
    action: 'Ir a Racks',
  },
  {
    step: 3,
    icon: Cpu,
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    title: 'Inventaría tus Activos',
    desc: 'Registra switches, UPS, patch panels, backbone y todos los activos tecnológicos.',
    href: '/infraestructura/activos',
    action: 'Ir a Activos',
  },
  {
    step: 4,
    icon: Layers,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    title: 'Documenta tu Red',
    desc: 'Carga planos, diagramas de topología y documentación técnica de tu infraestructura.',
    href: '/infraestructura/planos',
    action: 'Ir a Planos',
  },
];

// Accesos rápidos del asistente
const QUICK_ACTIONS = [
  { icon: Server,    label: 'Agregar Rack',         sub: 'Gabinete físico',      href: '/infraestructura/racks' },
  { icon: Network,   label: 'Agregar Switch',        sub: 'Equipo de red',        href: '/infraestructura/switches' },
  { icon: Shield,    label: 'Agregar UPS / PDU',     sub: 'Energía regulada',     href: '/infraestructura/ups-pdus' },
  { icon: FileText,  label: 'Ver Documentación',     sub: 'Memoria técnica',      href: '/documentacion' },
  { icon: TrendingUp,label: 'Gestionar CAPEX',       sub: 'Presupuesto de TI',    href: '/capex' },
  { icon: BookOpen,  label: 'Evaluar Normativa',     sub: 'Cumplimiento NOM/TIA', href: '/normativa' },
];

// Módulos de la plataforma
const PLATFORM_MODULES = [
  { icon: Package,    label: 'Activos',         desc: 'Inventario DCIM completo' },
  { icon: Building2,  label: 'MDF / IDF',       desc: 'Cuartos de telecomunicaciones' },
  { icon: Grid3x3,    label: 'Racks',           desc: 'Gabinetes y equipamiento' },
  { icon: Network,    label: 'Switches',        desc: 'Equipos de red activos' },
  { icon: Layers,     label: 'Planos',          desc: 'Documentación técnica' },
  { icon: TrendingUp, label: 'CAPEX',           desc: 'Presupuesto e inversión' },
  { icon: CheckSquare,label: 'Tickets',         desc: 'Incidencias y mantenimiento' },
  { icon: Sparkles,   label: 'SKIA AI',         desc: 'Asistente inteligente' },
];

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [aiInput, setAiInput] = useState('');
  
  const handleAIPrompt = async (prompt: string) => {
    if (!prompt.trim()) return;
    
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: 'groq'
        })
      });
      
      if (!response.ok) {
        console.error('Error en AI chat:', response.status);
        return;
      }
      
      const data = await response.json();
      console.log('Respuesta del AI:', data.content);
      // TODO: Mostrar la respuesta en un modal o panel
    } catch (error) {
      console.error('Error enviando prompt:', error);
    }
  };

  useEffect(() => {
    fetch('/api/dashboard/stats', { credentials: 'include' })
      .then(r => {
        // Si el servidor responde 401/403, redirigir al login
        if (r.status === 401 || r.status === 403) {
          router.push('/login');
          return null;
        }
        if (!r.ok) {
          // Cualquier otro error: mostrar onboarding vacío en lugar de error
          return { stats: EMPTY_STATS, recentTickets: [], criticalAssets: [], isEmpty: true, userName: '' };
        }
        return r.json();
      })
      .then((d: DashboardData | null) => {
        if (d) setData(d);
        setLoading(false);
      })
      .catch(() => {
        // Error de red: mostrar onboarding vacío, no redirigir
        setData({ stats: EMPTY_STATS, recentTickets: [], criticalAssets: [], isEmpty: true, userName: '' });
        setLoading(false);
      });
  }, [router]);

  // Rotar pasos del onboarding cada 3.5 segundos
  useEffect(() => {
    if (!data?.isEmpty) return;
    const interval = setInterval(() => {
      setActiveStep(prev => (prev + 1) % ONBOARDING_STEPS.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [data?.isEmpty]);

  const stats = data?.stats ?? EMPTY_STATS;
  const isEmpty = data?.isEmpty ?? false;
  const userName = data?.userName ?? '';

  const statusColor = (s: string) => {
    const sl = s?.toLowerCase() ?? '';
    if (sl === 'crítico' || sl === 'critica' || sl === 'crítica') return 'bg-red-100 text-red-700';
    if (sl === 'atención' || sl === 'atencion' || sl === 'alta') return 'bg-amber-100 text-amber-700';
    if (sl === 'en proceso' || sl === 'en_proceso') return 'bg-blue-100 text-blue-700';
    if (sl === 'programado') return 'bg-slate-100 text-[#5C6194]';
    if (sl === 'media') return 'bg-orange-100 text-orange-700';
    if (sl === 'baja') return 'bg-green-100 text-green-700';
    return 'bg-slate-100 text-[#8B92B8]';
  };

  const kpiCards = [
    {
      label: 'Activos monitoreados',
      value: stats.activosTotal.toLocaleString(),
      sub: stats.activosMesAntes > 0 ? `+${stats.activosMesAntes} este mes` : 'Sin activos aún',
      icon: Package,
      color: 'text-blue-600',
      bg: 'bg-blue-50/80',
      border: 'border-blue-100',
      trend: stats.activosMesAntes > 0 ? 'up' : 'neutral',
    },
    {
      label: 'Incidencias abiertas',
      value: stats.ticketsAbiertos.toString(),
      sub: stats.ticketsCriticos > 0 ? `${stats.ticketsCriticos} críticas` : 'Sin incidencias críticas',
      icon: AlertCircle,
      color: stats.ticketsCriticos > 0 ? 'text-orange-500' : 'text-slate-400',
      bg: stats.ticketsCriticos > 0 ? 'bg-orange-50/80' : 'bg-slate-50/80',
      border: stats.ticketsCriticos > 0 ? 'border-orange-100' : 'border-slate-100',
      trend: stats.ticketsCriticos > 0 ? 'down' : 'neutral',
    },
    {
      label: 'Cumplimiento SLA',
      value: `${stats.slaCumplimiento}%`,
      sub: stats.slaCumplimiento >= 90 ? 'Excelente rendimiento' : 'Requiere atención',
      icon: Gauge,
      color: stats.slaCumplimiento >= 90 ? 'text-emerald-600' : 'text-amber-500',
      bg: stats.slaCumplimiento >= 90 ? 'bg-emerald-50/80' : 'bg-amber-50/80',
      border: stats.slaCumplimiento >= 90 ? 'border-emerald-100' : 'border-amber-100',
      trend: stats.slaCumplimiento >= 90 ? 'up' : 'down',
    },
    {
      label: 'MDF / IDF activos',
      value: stats.mdfIdfTotal.toString(),
      sub: stats.mdfIdfAtencion > 0 ? `${stats.mdfIdfAtencion} en atención` : 'Todos operativos',
      icon: Building2,
      color: 'text-violet-600',
      bg: 'bg-violet-50/80',
      border: 'border-violet-100',
      trend: 'neutral' as const,
    },
    {
      label: 'Tickets abiertos',
      value: stats.ticketsAbiertos.toString(),
      sub: 'Sin tickets vencidos',
      icon: CheckSquare,
      color: stats.ticketsAbiertos > 0 ? 'text-rose-500' : 'text-slate-400',
      bg: stats.ticketsAbiertos > 0 ? 'bg-rose-50/80' : 'bg-slate-50/80',
      border: stats.ticketsAbiertos > 0 ? 'border-rose-100' : 'border-slate-100',
      trend: stats.ticketsAbiertos > 5 ? 'down' : 'neutral',
    },
    {
      label: 'Usuarios activos',
      value: stats.usuariosActivos.toString(),
      sub: stats.usuariosOnline > 0 ? `${stats.usuariosOnline} en línea ahora` : 'Sin sesiones activas',
      icon: Users,
      color: 'text-teal-600',
      bg: 'bg-teal-50/80',
      border: 'border-teal-100',
      trend: 'neutral' as const,
    },
  ];

  if (loading) {
    return (
      <AppLayout breadcrumb={[{ label: 'Dashboard' }]}>
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="animate-spin text-[#8B92B8]" />
        </div>
      </AppLayout>
    );
  }

  // ---- VISTA ONBOARDING para tenants nuevos ----
  // ELIMINADA: Pantalla de bienvenida removida por solicitud del usuario

  // ---- VISTA NORMAL con datos ----
  return (
    <AppLayout breadcrumb={[{ label: 'Dashboard' }]}>
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#1A1D2E] tracking-tight">Dashboard</h1>
        <p className="text-sm text-[#8B92B8] mt-0.5">Visión general de la infraestructura física y tecnológica.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        {kpiCards.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className={`relative bg-white/80 border ${s.border} rounded-2xl shadow-sm backdrop-blur-sm p-4 flex flex-col gap-2 overflow-hidden`}
            >
              <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center`}>
                <Icon size={15} className={s.color} />
              </div>
              {s.trend === 'up' && (
                <ArrowUpRight size={12} className="absolute top-3 right-3 text-emerald-500" />
              )}
              <div className={`text-2xl font-black ${s.color} leading-none`}>{s.value}</div>
              <div className="text-[12px] font-bold text-[#8B92B8] leading-tight">{s.label}</div>
              <div className="text-[12px] text-[#5A6A90] mt-0.5">{s.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Fila principal: Tickets recientes + Activos críticos */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        {/* Tickets recientes */}
        <div className="bg-white/80 border border-[#E8EBF4] rounded-2xl shadow-sm backdrop-blur-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8EBF4]">
            <div className="flex items-center gap-2">
              <CheckSquare size={14} className="text-blue-500" />
              <span className="text-xs font-black text-[#5C6194] uppercase tracking-widest">Tickets recientes</span>
            </div>
            <span className="text-[12px] text-blue-500 font-bold cursor-pointer hover:underline">Ver todos →</span>
          </div>
          {(data?.recentTickets ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-[#8B92B8]">
              <CheckSquare size={28} className="mb-2 opacity-30" />
              <p className="text-xs font-semibold">Sin tickets registrados</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {(data?.recentTickets ?? []).map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#EEF0F8] transition-colors">
                  <span className="text-[12px] font-black text-[#5A6A90] font-mono w-14 flex-shrink-0">{t.id}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#5C6194] truncate">{t.title}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${statusColor(t.priority)}`}>{t.priority}</span>
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${statusColor(t.status)}`}>{t.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[12px] text-[#5A6A90] flex-shrink-0">
                    <Clock size={10} />
                    {t.time}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activos críticos */}
        <div className="bg-white/80 border border-[#E8EBF4] rounded-2xl shadow-sm backdrop-blur-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E8EBF4]">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-rose-500" />
              <span className="text-xs font-black text-[#5C6194] uppercase tracking-widest">Activos críticos</span>
            </div>
            <span className="text-[12px] text-blue-500 font-bold cursor-pointer hover:underline">Ver todos →</span>
          </div>
          {(data?.criticalAssets ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-[#8B92B8]">
              <Activity size={28} className="mb-2 opacity-30" />
              <p className="text-xs font-semibold">Sin activos en estado crítico</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {(data?.criticalAssets ?? []).map((a, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-[#EEF0F8] transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                    <Zap size={12} className="text-[#8B92B8]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#5C6194] truncate">{a.name}</div>
                    <div className="text-[12px] text-[#5A6A90]">{a.type} · {a.location}</div>
                  </div>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusColor(a.status)}`}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fila inferior: Estado de módulos */}
      <div className="bg-white/80 border border-[#E8EBF4] rounded-2xl shadow-sm backdrop-blur-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#E8EBF4]">
          <BarChart3 size={14} className="text-violet-500" />
          <span className="text-xs font-black text-[#5C6194] uppercase tracking-widest">Estado de módulos</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-0 divide-x divide-slate-100">
          {[
            { label: 'Activos',        value: stats.activosTotal,    icon: Package,      color: 'text-blue-500' },
            { label: 'MDF / IDF',      value: stats.mdfIdfTotal,     icon: Building2,    color: 'text-indigo-500' },
            { label: 'Racks',          value: stats.racksTotal,      icon: Grid3x3,      color: 'text-violet-500' },
            { label: 'Switches',       value: stats.switchesTotal,   icon: Zap,          color: 'text-cyan-500' },
            { label: 'UPS',            value: stats.upsTotal,        icon: Shield,       color: 'text-amber-500' },
            { label: 'Tickets',        value: stats.ticketsAbiertos, icon: CheckSquare,  color: 'text-rose-500' },
            { label: 'Mantenimientos', value: 0,                     icon: Wrench,       color: 'text-teal-500' },
            { label: 'Usuarios',       value: stats.usuariosActivos, icon: Users,        color: 'text-[#8B92B8]' },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="flex flex-col items-center justify-center py-4 gap-1 hover:bg-[#EEF0F8] transition-colors">
                <Icon size={16} className={m.color} />
                <div className={`text-lg font-black ${m.color}`}>{m.value.toLocaleString()}</div>
                <div className="text-[11px] text-[#8B92B8] font-semibold text-center leading-tight">{m.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
