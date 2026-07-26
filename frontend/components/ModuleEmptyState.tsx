import { ReactNode } from 'react';
import {
  Plus, Server, Network, Layers, Zap, Package, Tag,
  FileText, Database, Grid3x3, Radio, Shield, Cpu,
} from 'lucide-react';

// Feature puede ser string simple o { icon, text }
type Feature = string | { icon: ReactNode; text: string };

interface ModuleEmptyStateProps {
  // icon puede ser string (nombre de ícono) o ReactNode
  icon?: string | ReactNode;
  title: string;
  description: string;
  features?: Feature[];
  // Soporte para ambas variantes de props del botón
  wizardLabel?: string;
  onOpenWizard?: () => void;
  buttonLabel?: string;
  onAction?: () => void;
  accentColor?: string;
}

const ICON_MAP: Record<string, ReactNode> = {
  Server:   <Server size={32} />,
  Network:  <Network size={32} />,
  Layers:   <Layers size={32} />,
  Zap:      <Zap size={32} />,
  Package:  <Package size={32} />,
  Tag:      <Tag size={32} />,
  FileText: <FileText size={32} />,
  Database: <Database size={32} />,
  Grid3x3:  <Grid3x3 size={32} />,
  Radio:    <Radio size={32} />,
  Shield:   <Shield size={32} />,
  Cpu:      <Cpu size={32} />,
};

const ACCENT: Record<string, { bg: string; border: string; btn: string; iconBg: string }> = {
  blue:    { bg: 'from-blue-50 to-indigo-50',    border: 'border-blue-100',    btn: 'bg-blue-600 hover:bg-blue-700 shadow-blue-200',    iconBg: 'bg-blue-100' },
  teal:    { bg: 'from-teal-50 to-cyan-50',      border: 'border-teal-100',    btn: 'bg-teal-600 hover:bg-teal-700 shadow-teal-200',    iconBg: 'bg-teal-100' },
  violet:  { bg: 'from-violet-50 to-purple-50',  border: 'border-violet-100',  btn: 'bg-violet-600 hover:bg-violet-700 shadow-violet-200', iconBg: 'bg-violet-100' },
  cyan:    { bg: 'from-cyan-50 to-sky-50',       border: 'border-cyan-100',    btn: 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-200',    iconBg: 'bg-cyan-100' },
  amber:   { bg: 'from-amber-50 to-orange-50',   border: 'border-amber-100',   btn: 'bg-amber-600 hover:bg-amber-700 shadow-amber-200',  iconBg: 'bg-amber-100' },
  indigo:  { bg: 'from-indigo-50 to-blue-50',    border: 'border-indigo-100',  btn: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200', iconBg: 'bg-indigo-100' },
  emerald: { bg: 'from-emerald-50 to-green-50',  border: 'border-emerald-100', btn: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200', iconBg: 'bg-emerald-100' },
  rose:    { bg: 'from-rose-50 to-pink-50',      border: 'border-rose-100',    btn: 'bg-rose-600 hover:bg-rose-700 shadow-rose-200',    iconBg: 'bg-rose-100' },
};

export default function ModuleEmptyState({
  icon,
  title,
  description,
  features = [],
  wizardLabel,
  onOpenWizard,
  buttonLabel,
  onAction,
  accentColor = 'blue',
}: ModuleEmptyStateProps) {
  const C = ACCENT[accentColor] ?? ACCENT.blue;

  // Resolver ícono: string → componente, ReactNode → usar directo
  const resolvedIcon: ReactNode =
    typeof icon === 'string'
      ? (ICON_MAP[icon] ?? <Server size={32} />)
      : (icon ?? <Server size={32} />);

  // Resolver label y handler del botón (soportar ambas variantes)
  const label = wizardLabel ?? buttonLabel ?? 'Registrar';
  const handler = onOpenWizard ?? onAction ?? (() => {});

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className={`w-full max-w-xl bg-gradient-to-br ${C.bg} border ${C.border} rounded-3xl p-10 text-center shadow-sm`}>

        {/* Ícono central */}
        <div className={`w-20 h-20 ${C.iconBg} rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner`}>
          <div className="opacity-80 scale-125">
            {resolvedIcon}
          </div>
        </div>

        {/* Título */}
        <h2 className="text-xl font-black text-[#1A1D2E] mb-3 leading-tight">{title}</h2>

        {/* Descripción */}
        <p className="text-sm text-[#5C6194] leading-relaxed mb-6 max-w-sm mx-auto">
          {description}
        </p>

        {/* Features */}
        {features.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-8 text-left">
            {features.map((f, i) => {
              const isString = typeof f === 'string';
              return (
                <div key={i} className="flex items-start gap-2.5 bg-white/70 rounded-xl px-3 py-2.5 border border-white/80">
                  <div className={`w-5 h-5 ${C.iconBg} rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    {isString
                      ? <div className="w-2 h-2 rounded-full bg-current opacity-60" />
                      : <div className="scale-75 opacity-70">{(f as { icon: ReactNode; text: string }).icon}</div>
                    }
                  </div>
                  <span className="text-xs text-[#5C6194] font-medium leading-snug">
                    {isString ? f : (f as { icon: ReactNode; text: string }).text}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Botón */}
        <button
          onClick={handler}
          className={`inline-flex items-center gap-2 ${C.btn} text-white text-sm font-bold px-6 py-3 rounded-2xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95`}
        >
          <Plus size={16} />
          {label}
        </button>

        {/* Hint */}
        <p className="text-xs text-[#9EA3C8] mt-4">
          El asistente de captura te guía paso a paso en menos de 2 minutos.
        </p>
      </div>
    </div>
  );
}
