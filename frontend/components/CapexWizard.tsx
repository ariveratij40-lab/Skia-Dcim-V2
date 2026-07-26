import { useState } from 'react';
import {
  X, ChevronRight, ChevronLeft, Check,
  DollarSign, FileText, Users, Calendar, Package, BarChart2, Plus, Trash2,
} from 'lucide-react';

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface CapexLineItemDraft {
  description: string;
  category: string;
  quantity: number;
  unit: string;
  unit_cost_usd: number;
  supplier: string;
  part_number: string;
  notes: string;
}

export interface CapexWizardData {
  // Identificación
  code: string;
  name: string;
  description: string;
  category: string;
  // Clasificación
  status: string;
  priority: string;
  fiscal_year: number;
  quarter: string;
  // Responsable
  responsible: string;
  responsible_email: string;
  department: string;
  cost_center: string;
  // Financiero
  budget_usd: number;
  currency: string;
  exchange_rate: number;
  po_number: string;
  invoice_number: string;
  integrator: string;
  roi_months: number;
  // Fechas
  start_date: string;
  end_date: string;
  // Justificación
  justification: string;
  observations: string;
  // Partidas
  line_items: CapexLineItemDraft[];
}

const EMPTY_WIZARD: CapexWizardData = {
  code: '',
  name: '',
  description: '',
  category: 'infraestructura',
  status: 'planificado',
  priority: 'media',
  fiscal_year: new Date().getFullYear(),
  quarter: `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`,
  responsible: '',
  responsible_email: '',
  department: '',
  cost_center: '',
  budget_usd: 0,
  currency: 'USD',
  exchange_rate: 1,
  po_number: '',
  invoice_number: '',
  integrator: '',
  roi_months: 0,
  start_date: '',
  end_date: '',
  justification: '',
  observations: '',
  line_items: [],
};

const EMPTY_ITEM: CapexLineItemDraft = {
  description: '',
  category: 'equipo',
  quantity: 1,
  unit: 'pza',
  unit_cost_usd: 0,
  supplier: '',
  part_number: '',
  notes: '',
};

// ── Constantes ────────────────────────────────────────────────────────────────

const CATEGORIES = ['infraestructura', 'seguridad', 'telecomunicaciones', 'servidores', 'software', 'servicios', 'otro'];
const STATUSES   = ['planificado', 'aprobado', 'en_ejecucion', 'completado', 'cancelado', 'en_revision'];
const PRIORITIES = ['critica', 'alta', 'media', 'baja'];
const QUARTERS   = ['Q1', 'Q2', 'Q3', 'Q4'];
const CURRENCIES = ['USD', 'MXN', 'EUR'];
const ITEM_CATS  = ['equipo', 'licencia', 'servicio', 'instalacion', 'cableado', 'consultoria', 'otro'];
const UNITS      = ['pza', 'hr', 'mt', 'km', 'lote', 'mes', 'año'];

const STATUS_LABELS: Record<string, string> = {
  planificado: 'Planificado', aprobado: 'Aprobado', en_ejecucion: 'En Ejecución',
  completado: 'Completado', cancelado: 'Cancelado', en_revision: 'En Revisión',
};
const PRIORITY_LABELS: Record<string, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja',
};

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-slate-300';
const selectCls = 'w-full px-3 py-2 text-xs bg-[#F8F9FE] border border-[#E8EBF4] rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400';

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

// ── Wizard principal ───────────────────────────────────────────────────────────

interface CapexWizardProps {
  onClose: () => void;
  onSave: (data: CapexWizardData) => Promise<void>;
}

const STAGES = [
  { id: 'identificacion', label: 'Identificación', icon: FileText },
  { id: 'clasificacion',  label: 'Clasificación',  icon: BarChart2 },
  { id: 'responsable',    label: 'Responsable',    icon: Users },
  { id: 'financiero',     label: 'Financiero',     icon: DollarSign },
  { id: 'partidas',       label: 'Partidas',       icon: Package },
  { id: 'fechas',         label: 'Fechas',         icon: Calendar },
  { id: 'resumen',        label: 'Resumen',        icon: Check },
];

export default function CapexWizard({ onClose, onSave }: CapexWizardProps) {
  const [stage, setStage] = useState(0);
  const [form, setForm] = useState<CapexWizardData>({ ...EMPTY_WIZARD });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof CapexWizardData, v: unknown) =>
    setForm(f => ({ ...f, [k]: v }));

  // ── Partidas helpers ──────────────────────────────────────────
  const addItem = () =>
    setForm(f => ({ ...f, line_items: [...f.line_items, { ...EMPTY_ITEM }] }));

  const removeItem = (i: number) =>
    setForm(f => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }));

  const setItem = (i: number, k: keyof CapexLineItemDraft, v: unknown) =>
    setForm(f => ({
      ...f,
      line_items: f.line_items.map((it, idx) => idx === i ? { ...it, [k]: v } : it),
    }));

  const totalPartidas = form.line_items.reduce(
    (acc, it) => acc + (it.quantity || 0) * (it.unit_cost_usd || 0), 0,
  );

  // ── Guardar ───────────────────────────────────────────────────
  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre del proyecto es obligatorio.'); return; }
    if (form.budget_usd <= 0) { setError('El presupuesto debe ser mayor a 0.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  // ── Render por etapa ──────────────────────────────────────────
  function renderStage() {
    switch (stage) {
      // ── 0: Identificación ──────────────────────────────────────
      case 0:
        return (
          <div className="space-y-4">
            <Field label="Código del Proyecto">
              <input value={form.code} onChange={e => set('code', e.target.value)}
                placeholder="CAPEX-2026-001" className={`${inputCls} font-mono`} />
              <p className="text-[11px] text-slate-400 mt-1">Se genera automáticamente si se deja vacío.</p>
            </Field>
            <Field label="Nombre del Proyecto *">
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Renovación infraestructura de red Piso 5" className={inputCls} required />
            </Field>
            <Field label="Descripción">
              <textarea value={form.description} onChange={e => set('description', e.target.value)}
                rows={3} placeholder="Describe el alcance y objetivo del proyecto..."
                className={inputCls} />
            </Field>
            <Field label="Categoría">
              <select value={form.category} onChange={e => set('category', e.target.value)} className={selectCls}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </Field>
          </div>
        );

      // ── 1: Clasificación ───────────────────────────────────────
      case 1:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Estado">
                <select value={form.status} onChange={e => set('status', e.target.value)} className={selectCls}>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </Field>
              <Field label="Prioridad">
                <select value={form.priority} onChange={e => set('priority', e.target.value)} className={selectCls}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              </Field>
              <Field label="Año Fiscal">
                <input type="number" min={2020} max={2099} value={form.fiscal_year}
                  onChange={e => set('fiscal_year', Number(e.target.value))} className={inputCls} />
              </Field>
              <Field label="Trimestre">
                <select value={form.quarter} onChange={e => set('quarter', e.target.value)} className={selectCls}>
                  {QUARTERS.map(q => <option key={q}>{q}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Justificación del Proyecto">
              <textarea value={form.justification} onChange={e => set('justification', e.target.value)}
                rows={4} placeholder="¿Por qué es necesario este proyecto? Impacto en el negocio, riesgos de no ejecutarlo..."
                className={inputCls} />
            </Field>
          </div>
        );

      // ── 2: Responsable ─────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Responsable del Proyecto">
                <input value={form.responsible} onChange={e => set('responsible', e.target.value)}
                  placeholder="Nombre completo" className={inputCls} />
              </Field>
              <Field label="Correo del Responsable">
                <input type="email" value={form.responsible_email} onChange={e => set('responsible_email', e.target.value)}
                  placeholder="responsable@empresa.com" className={inputCls} />
              </Field>
              <Field label="Departamento / Área">
                <input value={form.department} onChange={e => set('department', e.target.value)}
                  placeholder="Tecnología, Infraestructura..." className={inputCls} />
              </Field>
              <Field label="Centro de Costos">
                <input value={form.cost_center} onChange={e => set('cost_center', e.target.value)}
                  placeholder="TI-001, CC-2026..." className={`${inputCls} font-mono`} />
              </Field>
            </div>
            <Field label="Integrador / Proveedor Principal">
              <input value={form.integrator} onChange={e => set('integrator', e.target.value)}
                placeholder="Nombre del integrador o empresa proveedora" className={inputCls} />
            </Field>
          </div>
        );

      // ── 3: Financiero ──────────────────────────────────────────
      case 3:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Presupuesto Total *">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                  <input type="number" min={0} step={0.01} value={form.budget_usd || ''}
                    onChange={e => set('budget_usd', parseFloat(e.target.value) || 0)}
                    placeholder="0.00" className={`${inputCls} pl-6`} />
                </div>
              </Field>
              <Field label="Moneda">
                <select value={form.currency} onChange={e => set('currency', e.target.value)} className={selectCls}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              {form.currency !== 'USD' && (
                <Field label="Tipo de Cambio (a USD)">
                  <input type="number" min={0} step={0.0001} value={form.exchange_rate}
                    onChange={e => set('exchange_rate', parseFloat(e.target.value) || 1)} className={inputCls} />
                </Field>
              )}
              <Field label="Número de PO">
                <input value={form.po_number} onChange={e => set('po_number', e.target.value)}
                  placeholder="PO-2026-001" className={`${inputCls} font-mono`} />
              </Field>
              <Field label="Número de Factura">
                <input value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)}
                  placeholder="F-2026-0001" className={`${inputCls} font-mono`} />
              </Field>
              <Field label="ROI Estimado (meses)">
                <input type="number" min={0} value={form.roi_months || ''}
                  onChange={e => set('roi_months', parseInt(e.target.value) || 0)}
                  placeholder="12" className={inputCls} />
              </Field>
            </div>

            {/* Indicador visual de presupuesto */}
            {form.budget_usd > 0 && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                <p className="text-xs text-emerald-700 font-bold mb-1">Presupuesto ingresado</p>
                <p className="text-2xl font-black text-emerald-700">{fmtUSD(form.budget_usd)}</p>
                {form.currency !== 'USD' && (
                  <p className="text-xs text-emerald-600 mt-1">
                    ≈ {fmtUSD(form.budget_usd / form.exchange_rate)} USD al tipo de cambio {form.exchange_rate}
                  </p>
                )}
              </div>
            )}
          </div>
        );

      // ── 4: Partidas ────────────────────────────────────────────
      case 4:
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">
                Agrega las partidas de costo del proyecto. El total se calculará automáticamente.
              </p>
              <button onClick={addItem}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all">
                <Plus size={12} /> Agregar partida
              </button>
            </div>

            {form.line_items.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed border-[#E8EBF4] rounded-2xl">
                <Package size={28} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-slate-400">Sin partidas aún. Haz clic en "Agregar partida".</p>
              </div>
            )}

            {form.line_items.map((it, i) => (
              <div key={i} className="bg-[#F8F9FE] border border-[#E8EBF4] rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Partida {i + 1}</span>
                  <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <input value={it.description} onChange={e => setItem(i, 'description', e.target.value)}
                      placeholder="Descripción del ítem *" className={inputCls} />
                  </div>
                  <select value={it.category} onChange={e => setItem(i, 'category', e.target.value)} className={selectCls}>
                    {ITEM_CATS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                  <input value={it.supplier} onChange={e => setItem(i, 'supplier', e.target.value)}
                    placeholder="Proveedor" className={inputCls} />
                  <input value={it.part_number} onChange={e => setItem(i, 'part_number', e.target.value)}
                    placeholder="Número de parte" className={`${inputCls} font-mono`} />
                  <select value={it.unit} onChange={e => setItem(i, 'unit', e.target.value)} className={selectCls}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                  <div className="relative">
                    <input type="number" min={1} step={1} value={it.quantity}
                      onChange={e => setItem(i, 'quantity', parseFloat(e.target.value) || 1)}
                      placeholder="Cantidad" className={inputCls} />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                    <input type="number" min={0} step={0.01} value={it.unit_cost_usd || ''}
                      onChange={e => setItem(i, 'unit_cost_usd', parseFloat(e.target.value) || 0)}
                      placeholder="Costo unitario" className={`${inputCls} pl-6`} />
                  </div>
                </div>
                {it.quantity > 0 && it.unit_cost_usd > 0 && (
                  <div className="flex justify-end">
                    <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100">
                      Subtotal: {fmtUSD(it.quantity * it.unit_cost_usd)}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {form.line_items.length > 0 && (
              <div className="flex justify-between items-center bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 mt-2">
                <span className="text-xs font-bold text-emerald-700">Total partidas</span>
                <span className="text-lg font-black text-emerald-700">{fmtUSD(totalPartidas)}</span>
              </div>
            )}
          </div>
        );

      // ── 5: Fechas ──────────────────────────────────────────────
      case 5:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Fecha de Inicio">
                <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Fecha de Término">
                <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Observaciones Generales">
              <textarea value={form.observations} onChange={e => set('observations', e.target.value)}
                rows={5} placeholder="Notas adicionales, restricciones, dependencias..."
                className={inputCls} />
            </Field>
          </div>
        );

      // ── 6: Resumen ─────────────────────────────────────────────
      case 6:
        return (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <DollarSign size={18} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-black text-[#1A1D2E]">{form.name || '(sin nombre)'}</p>
                  <p className="text-xs text-slate-500">{form.code || 'Código auto-generado'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ['Categoría', form.category],
                  ['Estado', STATUS_LABELS[form.status] || form.status],
                  ['Prioridad', PRIORITY_LABELS[form.priority] || form.priority],
                  ['Año Fiscal', `${form.fiscal_year} ${form.quarter}`],
                  ['Responsable', form.responsible || '—'],
                  ['Centro de Costos', form.cost_center || '—'],
                  ['Integrador', form.integrator || '—'],
                  ['PO', form.po_number || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white/70 rounded-xl px-3 py-2 border border-white/80">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{k}</p>
                    <p className="font-semibold text-[#1A1D2E] truncate">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Resumen financiero */}
            <div className="bg-white border border-[#E8EBF4] rounded-2xl p-4 space-y-2">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">Resumen Financiero</p>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Presupuesto total</span>
                <span className="font-black text-[#1A1D2E]">{fmtUSD(form.budget_usd)}</span>
              </div>
              {form.line_items.length > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Total partidas ({form.line_items.length})</span>
                  <span className="font-black text-emerald-700">{fmtUSD(totalPartidas)}</span>
                </div>
              )}
              {form.budget_usd > 0 && totalPartidas > 0 && (
                <div className="flex justify-between text-xs border-t border-[#E8EBF4] pt-2 mt-2">
                  <span className="text-slate-500">Diferencia</span>
                  <span className={`font-black ${form.budget_usd - totalPartidas >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {fmtUSD(form.budget_usd - totalPartidas)}
                  </span>
                </div>
              )}
              {form.roi_months > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">ROI estimado</span>
                  <span className="font-bold text-blue-600">{form.roi_months} meses</span>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600 font-semibold">
                {error}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  }

  const isLast = stage === STAGES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EBF4] bg-[#F8F9FE] rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <DollarSign size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-[#1A1D2E]">Nuevo Proyecto CAPEX</h2>
              <p className="text-[11px] text-slate-400">Paso {stage + 1} de {STAGES.length} — {STAGES[stage].label}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <X size={14} className="text-slate-500" />
          </button>
        </div>

        {/* Stage pills */}
        <div className="flex gap-1.5 px-6 pt-4 pb-2 overflow-x-auto scrollbar-none">
          {STAGES.map((s, i) => {
            const Icon = s.icon;
            const done = i < stage;
            const active = i === stage;
            return (
              <button key={s.id} onClick={() => i <= stage && setStage(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all border
                  ${active ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200'
                  : done  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-pointer hover:bg-emerald-100'
                  : 'bg-[#F8F9FE] text-slate-400 border-[#E8EBF4] cursor-default'}`}>
                {done ? <Check size={10} /> : <Icon size={10} />}
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {renderStage()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E8EBF4] bg-[#F8F9FE] rounded-b-3xl">
          <button onClick={() => setStage(s => Math.max(0, s - 1))}
            disabled={stage === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronLeft size={14} /> Anterior
          </button>

          <div className="flex gap-1">
            {STAGES.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === stage ? 'bg-emerald-600 w-4' : i < stage ? 'bg-emerald-300' : 'bg-slate-200'}`} />
            ))}
          </div>

          {isLast ? (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-black rounded-xl shadow-sm shadow-emerald-200 transition-all hover:scale-105 active:scale-95">
              {saving ? (
                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando...</>
              ) : (
                <><Check size={13} /> Guardar Proyecto</>
              )}
            </button>
          ) : (
            <button onClick={() => setStage(s => Math.min(STAGES.length - 1, s + 1))}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-200 transition-all hover:scale-105 active:scale-95">
              Siguiente <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
