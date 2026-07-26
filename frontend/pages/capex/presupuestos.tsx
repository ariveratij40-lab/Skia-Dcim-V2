import { useState, useEffect } from 'react';
import axios from 'axios';
import Head from 'next/head';
import AppLayout from '../../components/AppLayout';
import ModuleEmptyState from '../../components/ModuleEmptyState';
import CapexWizard, { CapexWizardData } from '../../components/CapexWizard';
import {
  DollarSign, TrendingUp, CheckCircle2, AlertTriangle, Clock, XCircle,
  Plus, Search, ChevronRight, BarChart2, RefreshCw, Eye, Edit2,
  Package, Filter, Download, Calendar,
} from 'lucide-react';

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface CapexProject {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  responsible: string;
  department: string;
  cost_center: string;
  budget_usd: number;
  spent_usd: number;
  currency: string;
  fiscal_year: number;
  quarter: string;
  start_date: string;
  end_date: string;
  po_number: string;
  integrator: string;
  roi_months: number;
  observations: string;
  created_at: string;
}

interface CapexStats {
  total_projects: number;
  total_budget_usd: number;
  total_spent_usd: number;
  available_usd: number;
  execution_pct: number;
  planificado: number;
  en_ejecucion: number;
  completado: number;
  cancelado: number;
  current_year: number;
  budget_current_year: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const STATUS_CFG: Record<string, { label: string; pill: string; dot: string; icon: React.ReactNode }> = {
  planificado:  { label: 'Planificado',   pill: 'bg-blue-100 text-blue-700 border border-blue-200',     dot: 'bg-blue-500',    icon: <Clock size={11} /> },
  aprobado:     { label: 'Aprobado',      pill: 'bg-violet-100 text-violet-700 border border-violet-200', dot: 'bg-violet-500', icon: <CheckCircle2 size={11} /> },
  en_ejecucion: { label: 'En Ejecución',  pill: 'bg-amber-100 text-amber-700 border border-amber-200',   dot: 'bg-amber-500',  icon: <TrendingUp size={11} /> },
  completado:   { label: 'Completado',    pill: 'bg-emerald-100 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500', icon: <CheckCircle2 size={11} /> },
  cancelado:    { label: 'Cancelado',     pill: 'bg-red-100 text-red-700 border border-red-200',         dot: 'bg-red-500',    icon: <XCircle size={11} /> },
  en_revision:  { label: 'En Revisión',   pill: 'bg-slate-100 text-slate-600 border border-slate-200',   dot: 'bg-slate-400',  icon: <AlertTriangle size={11} /> },
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  critica: { label: 'Crítica', color: 'text-red-600 font-black' },
  alta:    { label: 'Alta',    color: 'text-orange-600 font-bold' },
  media:   { label: 'Media',   color: 'text-blue-600 font-semibold' },
  baja:    { label: 'Baja',    color: 'text-slate-500' },
};

const CAT_COLORS: Record<string, string> = {
  infraestructura:    'bg-blue-50 text-blue-700 border-blue-200',
  seguridad:          'bg-red-50 text-red-700 border-red-200',
  telecomunicaciones: 'bg-violet-50 text-violet-700 border-violet-200',
  servidores:         'bg-orange-50 text-orange-700 border-orange-200',
  software:           'bg-teal-50 text-teal-700 border-teal-200',
  servicios:          'bg-indigo-50 text-indigo-700 border-indigo-200',
  otro:               'bg-slate-50 text-slate-600 border-slate-200',
};

// ── Componente StatCard ────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string;
  color: string; icon: React.ReactNode;
}) {
  return (
    <div className={`bg-white border border-[#E8EBF4] rounded-2xl p-4 shadow-sm`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      <p className="text-xl font-black text-[#1A1D2E] leading-none mb-1">{value}</p>
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Barra de ejecución ─────────────────────────────────────────────────────────

function ExecutionBar({ budget, spent }: { budget: number; spent: number }) {
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
        <span>{pct.toFixed(0)}% ejecutado</span>
        <span>{fmtUSD(spent)} / {fmtUSD(budget)}</span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function CapexPresupuestos() {
  const [projects, setProjects] = useState<CapexProject[]>([]);
  const [stats, setStats] = useState<CapexStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [selected, setSelected] = useState<CapexProject | null>(null);

  // ── Carga inicial ─────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [projRes, statsRes] = await Promise.all([
        axios.get('/api/capex/projects'),
        axios.get('/api/capex/stats'),
      ]);
      setProjects(Array.isArray(projRes.data) ? projRes.data : []);
      setStats(statsRes.data);
    } catch (e) {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  // ── Guardar proyecto ──────────────────────────────────────────
  async function handleSave(data: CapexWizardData) {
    await axios.post('/api/capex/projects', data);
    await loadData();
  }

  // ── Filtrado ──────────────────────────────────────────────────
  const filtered = projects.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.responsible.toLowerCase().includes(q);
    const matchStatus = !filterStatus || p.status === filterStatus;
    const matchCat    = !filterCat    || p.category === filterCat;
    const matchYear   = !filterYear   || String(p.fiscal_year) === filterYear;
    return matchSearch && matchStatus && matchCat && matchYear;
  });

  const years = Array.from(new Set(projects.map(p => p.fiscal_year))).sort((a, b) => b - a);

  // ── EmptyState ────────────────────────────────────────────────
  if (!loading && projects.length === 0) {
    return (
      <AppLayout title="CAPEX" breadcrumb={[{ label: 'CAPEX' }, { label: 'Presupuestos' }]}>
        <Head><title>CAPEX — SKIA DCIM</title></Head>
        <ModuleEmptyState
          icon={<DollarSign size={32} />}
          title="Sin proyectos CAPEX registrados"
          description="Centraliza la planificación y control de inversiones en infraestructura de red. Registra presupuestos, partidas de costo, responsables y seguimiento de ejecución por proyecto."
          accentColor="emerald"
          features={[
            'Proyectos con presupuesto y partidas de costo',
            'Seguimiento de ejecución presupuestal',
            'Clasificación por categoría y año fiscal',
            'Control de PO, facturas e integradores',
            'ROI estimado por proyecto',
            'Dashboard financiero consolidado',
          ]}
          wizardLabel="Registrar Proyecto CAPEX"
          onOpenWizard={() => setShowWizard(true)}
        />
        {showWizard && <CapexWizard onClose={() => setShowWizard(false)} onSave={handleSave} />}
      </AppLayout>
    );
  }

  // ── Vista principal ───────────────────────────────────────────
  return (
    <AppLayout title="CAPEX" breadcrumb={[{ label: 'CAPEX' }, { label: 'Presupuestos' }]}>
      <Head><title>CAPEX — SKIA DCIM</title></Head>

      {/* Topbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-black text-[#1A1D2E]">Presupuestos CAPEX</h1>
          <p className="text-xs text-slate-400">Control de inversiones en infraestructura de red</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="w-8 h-8 rounded-xl bg-white border border-[#E8EBF4] flex items-center justify-center hover:bg-slate-50 transition-colors">
            <RefreshCw size={13} className="text-slate-500" />
          </button>
          <button className="w-8 h-8 rounded-xl bg-white border border-[#E8EBF4] flex items-center justify-center hover:bg-slate-50 transition-colors">
            <Download size={13} className="text-slate-500" />
          </button>
          <button onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-200 transition-all hover:scale-105 active:scale-95">
            <Plus size={13} /> Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Presupuesto Total"
            value={fmtUSD(stats.total_budget_usd)}
            sub={`${stats.total_projects} proyectos`}
            color="bg-emerald-100"
            icon={<DollarSign size={16} className="text-emerald-600" />}
          />
          <StatCard
            label="Ejecutado"
            value={fmtUSD(stats.total_spent_usd)}
            sub={`${stats.execution_pct.toFixed(1)}% del total`}
            color="bg-amber-100"
            icon={<TrendingUp size={16} className="text-amber-600" />}
          />
          <StatCard
            label="Disponible"
            value={fmtUSD(stats.available_usd)}
            sub="sin ejecutar"
            color="bg-blue-100"
            icon={<BarChart2 size={16} className="text-blue-600" />}
          />
          <StatCard
            label={`Año ${stats.current_year}`}
            value={fmtUSD(stats.budget_current_year)}
            sub={`${stats.en_ejecucion} en ejecución`}
            color="bg-violet-100"
            icon={<Calendar size={16} className="text-violet-600" />}
          />
        </div>
      )}

      {/* Barra de ejecución global */}
      {stats && stats.total_budget_usd > 0 && (
        <div className="bg-white border border-[#E8EBF4] rounded-2xl p-4 mb-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ejecución Presupuestal Global</p>
            <div className="flex gap-3 text-[11px]">
              {[
                { label: 'Planificado', count: stats.planificado, color: 'text-blue-600' },
                { label: 'En Ejecución', count: stats.en_ejecucion, color: 'text-amber-600' },
                { label: 'Completado', count: stats.completado, color: 'text-emerald-600' },
              ].map(s => (
                <span key={s.label} className={`font-bold ${s.color}`}>{s.count} {s.label}</span>
              ))}
            </div>
          </div>
          <ExecutionBar budget={stats.total_budget_usd} spent={stats.total_spent_usd} />
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border border-[#E8EBF4] rounded-2xl p-3 mb-4 shadow-sm">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, código, responsable..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400">
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400">
            <option value="">Todas las categorías</option>
            {['infraestructura','seguridad','telecomunicaciones','servidores','software','servicios','otro'].map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          {years.length > 0 && (
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
              className="px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <option value="">Todos los años</option>
              {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          )}
          {(search || filterStatus || filterCat || filterYear) && (
            <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterCat(''); setFilterYear(''); }}
              className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 rounded-xl transition-colors">
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Tabla de proyectos */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Filter size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin resultados para los filtros aplicados</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E8EBF4] rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F8F9FE] border-b border-[#E8EBF4]">
                {['Proyecto', 'Categoría', 'Estado', 'Prioridad', 'Presupuesto', 'Ejecución', 'Año', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const sc = STATUS_CFG[p.status] || STATUS_CFG.planificado;
                const pc = PRIORITY_CFG[p.priority] || PRIORITY_CFG.media;
                const catCls = CAT_COLORS[p.category] || CAT_COLORS.otro;
                return (
                  <tr key={p.id}
                    className={`border-b border-[#F0F2FA] hover:bg-[#F8F9FE] transition-colors cursor-pointer ${i % 2 === 0 ? '' : 'bg-[#FAFBFF]'}`}
                    onClick={() => setSelected(p)}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#1A1D2E] truncate max-w-[200px]">{p.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{p.code}</p>
                      {p.responsible && <p className="text-[10px] text-slate-400 mt-0.5">{p.responsible}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold border ${catCls}`}>
                        {p.category.charAt(0).toUpperCase() + p.category.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${sc.pill}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] ${pc.color}`}>{pc.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-black text-[#1A1D2E]">{fmtUSD(p.budget_usd)}</p>
                      {p.cost_center && <p className="text-[10px] text-slate-400 font-mono">{p.cost_center}</p>}
                    </td>
                    <td className="px-4 py-3 min-w-[120px]">
                      <ExecutionBar budget={p.budget_usd} spent={p.spent_usd} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-600">{p.fiscal_year}</p>
                      {p.quarter && <p className="text-[10px] text-slate-400">{p.quarter}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); setSelected(p); }}
                        className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-emerald-100 flex items-center justify-center transition-colors">
                        <Eye size={11} className="text-slate-500 hover:text-emerald-600" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer de tabla */}
          <div className="px-4 py-3 border-t border-[#F0F2FA] flex items-center justify-between">
            <p className="text-[11px] text-slate-400">
              {filtered.length} proyecto{filtered.length !== 1 ? 's' : ''} · Total: <strong className="text-emerald-700">{fmtUSD(filtered.reduce((a, p) => a + p.budget_usd, 0))}</strong>
            </p>
            <button onClick={() => setShowWizard(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition-colors">
              <Plus size={11} /> Nuevo
            </button>
          </div>
        </div>
      )}

      {/* Panel de detalle */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-end p-4 bg-black/30 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EBF4] bg-[#F8F9FE] rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <DollarSign size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#1A1D2E] truncate max-w-[220px]">{selected.name}</h3>
                  <p className="text-[11px] text-slate-400 font-mono">{selected.code}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <span className="text-slate-500 text-sm font-bold">×</span>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Estado y prioridad */}
              <div className="flex gap-2">
                {(() => {
                  const sc = STATUS_CFG[selected.status] || STATUS_CFG.planificado;
                  return (
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold ${sc.pill}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} /> {sc.label}
                    </span>
                  );
                })()}
                <span className={`inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold border ${CAT_COLORS[selected.category] || CAT_COLORS.otro}`}>
                  {selected.category.charAt(0).toUpperCase() + selected.category.slice(1)}
                </span>
                <span className={`inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold bg-slate-50 border border-slate-200 ${PRIORITY_CFG[selected.priority]?.color}`}>
                  {PRIORITY_CFG[selected.priority]?.label || selected.priority}
                </span>
              </div>

              {/* Descripción */}
              {selected.description && (
                <p className="text-xs text-slate-600 leading-relaxed bg-[#F8F9FE] rounded-xl p-3 border border-[#E8EBF4]">
                  {selected.description}
                </p>
              )}

              {/* Financiero */}
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">Financiero</p>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] text-emerald-600">Presupuesto</p>
                    <p className="text-2xl font-black text-emerald-700">{fmtUSD(selected.budget_usd)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500">Ejecutado</p>
                    <p className="text-lg font-black text-amber-600">{fmtUSD(selected.spent_usd)}</p>
                  </div>
                </div>
                <ExecutionBar budget={selected.budget_usd} spent={selected.spent_usd} />
                {selected.po_number && (
                  <p className="text-[11px] text-slate-500">PO: <span className="font-mono font-bold">{selected.po_number}</span></p>
                )}
                {selected.roi_months > 0 && (
                  <p className="text-[11px] text-slate-500">ROI estimado: <span className="font-bold text-blue-600">{selected.roi_months} meses</span></p>
                )}
              </div>

              {/* Datos generales */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['Responsable', selected.responsible],
                  ['Departamento', selected.department],
                  ['Centro de Costos', selected.cost_center],
                  ['Integrador', selected.integrator],
                  ['Año Fiscal', `${selected.fiscal_year} ${selected.quarter}`],
                  ['Inicio', selected.start_date || '—'],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl px-3 py-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{k}</p>
                    <p className="font-semibold text-[#1A1D2E] truncate">{v}</p>
                  </div>
                ))}
              </div>

              {/* Observaciones */}
              {selected.observations && (
                <div className="bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Observaciones</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{selected.observations}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Wizard */}
      {showWizard && <CapexWizard onClose={() => setShowWizard(false)} onSave={handleSave} />}
    </AppLayout>
  );
}
