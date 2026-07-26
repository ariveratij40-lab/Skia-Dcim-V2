/**
 * InfraCard.tsx — Componentes reutilizables para módulos de infraestructura
 * Diseño basado en la imagen de referencia: fondo #EEF0F8, cards blancas,
 * texto oscuro, stats con separadores, números en azul, badges de estado.
 */
import React from 'react';

// ─── Tokens de diseño ────────────────────────────────────────────────────────
export const DESIGN = {
  // Colores base
  pageBg:       '#EEF0F8',
  cardBg:       '#FFFFFF',
  cardBorder:   '#E8EBF4',
  cardShadow:   '0 1px 3px rgba(67,97,238,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  cardRadius:   '16px',

  // Texto
  textPrimary:  '#1A1D2E',   // títulos, valores grandes
  textSecondary:'#5C6194',   // subtítulos, labels
  textMuted:    '#9CA3C8',   // texto muy secundario

  // Acento azul (igual al logo SKIA)
  blue:         '#4361EE',
  blueLight:    '#EEF1FD',
  blueBorder:   '#C7D2FB',

  // Separadores
  divider:      '#F0F2FA',

  // Badges de estado
  statusOperativo: { bg: '#ECFDF5', text: '#059669', dot: '#10B981' },
  statusAtencion:  { bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B' },
  statusCritico:   { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444' },
  statusPlaneado:  { bg: '#F8FAFC', text: '#64748B', dot: '#5C6194' },
  statusEnProgreso:{ bg: '#EFF6FF', text: '#2563EB', dot: '#3B82F6' },
  statusPendiente: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444' },
  statusCompleto:  { bg: '#ECFDF5', text: '#059669', dot: '#10B981' },
};

// ─── SectionLabel ─────────────────────────────────────────────────────────────
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '11px', fontWeight: 700, color: DESIGN.textSecondary,
      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
      {children}
    </p>
  );
}

// ─── InfoCard (card blanca base) ──────────────────────────────────────────────
interface InfoCardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
  hover?: boolean;
}
export function InfoCard({ children, style, onClick, hover }: InfoCardProps) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      style={{
        background: DESIGN.cardBg,
        border: `1px solid ${DESIGN.cardBorder}`,
        borderRadius: DESIGN.cardRadius,
        boxShadow: hovered
          ? '0 4px 12px rgba(67,97,238,0.10), 0 2px 4px rgba(0,0,0,0.06)'
          : DESIGN.cardShadow,
        overflow: 'hidden',
        transition: 'box-shadow 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-1px)' : 'none',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── TypeBadge (ícono + tipo en la cabecera de la ficha) ──────────────────────
interface TypeBadgeProps {
  icon: React.ReactNode;
  color: string;  // hex del color del tipo
}
export function TypeBadge({ icon, color }: TypeBadgeProps) {
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 12,
      background: color + '18',
      border: `1px solid ${color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: color, flexShrink: 0,
    }}>
      {icon}
    </div>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}
const STATUS_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  'Operativo':    DESIGN.statusOperativo,
  'Atención':     DESIGN.statusAtencion,
  'Crítico':      DESIGN.statusCritico,
  'Planeado':     DESIGN.statusPlaneado,
  'En progreso':  DESIGN.statusEnProgreso,
  'Pendiente':    DESIGN.statusPendiente,
  'Completo':     DESIGN.statusCompleto,
  'Activo':       DESIGN.statusOperativo,
  'Inactivo':     DESIGN.statusPlaneado,
  'Mantenimiento':DESIGN.statusAtencion,
  'Falla':        DESIGN.statusCritico,
  'Reservado':    DESIGN.statusPlaneado,
};
export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const s = STATUS_MAP[status] || DESIGN.statusPlaneado;
  const fs = size === 'sm' ? '11px' : '12px';
  const px = size === 'sm' ? '8px' : '10px';
  const py = size === 'sm' ? '3px' : '4px';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: `${py} ${px}`, borderRadius: 20,
      background: s.bg, color: s.text,
      fontSize: fs, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

// ─── StatRow (fila de estadística con separador) ──────────────────────────────
interface StatRowProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  iconColor?: string;
  last?: boolean;
}
export function StatRow({ icon, label, value, iconColor = DESIGN.blue, last }: StatRowProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0',
      borderBottom: last ? 'none' : `1px solid ${DESIGN.divider}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: iconColor, display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span style={{ fontSize: '13px', color: DESIGN.textSecondary, fontWeight: 500 }}>{label}</span>
      </div>
      <span style={{ fontSize: '14px', fontWeight: 700, color: DESIGN.textPrimary }}>{value}</span>
    </div>
  );
}

// ─── BigNumber (número grande tipo KPI) ───────────────────────────────────────
interface BigNumberProps {
  value: number | string;
  label?: string;
  color?: string;
  size?: 'lg' | 'xl' | '2xl';
}
export function BigNumber({ value, label, color = DESIGN.blue, size = 'xl' }: BigNumberProps) {
  const fs = size === 'lg' ? '32px' : size === 'xl' ? '42px' : '56px';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={{ fontSize: fs, fontWeight: 900, color, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {value}
      </span>
      {label && (
        <span style={{ fontSize: '11px', color: DESIGN.textMuted, marginTop: 2 }}>{label}</span>
      )}
    </div>
  );
}

// ─── ProgressBar ──────────────────────────────────────────────────────────────
interface ProgressBarProps {
  pct: number;
  color?: string;
  height?: number;
  label?: string;
  showPct?: boolean;
}
export function ProgressBar({ pct, color = DESIGN.blue, height = 6, label, showPct }: ProgressBarProps) {
  return (
    <div>
      {(label || showPct) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          {label && <span style={{ fontSize: '10px', fontWeight: 700, color: DESIGN.textSecondary,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>}
          {showPct && <span style={{ fontSize: '11px', fontWeight: 700, color }}>{pct}%</span>}
        </div>
      )}
      <div style={{ height, background: '#EEF0F8', borderRadius: height, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.min(pct, 100)}%`,
          background: color, borderRadius: height,
          transition: 'width 0.7s ease',
        }} />
      </div>
    </div>
  );
}

// ─── SummaryTypeCard (ficha grande de tipo MDF/IDF/Rack/etc.) ─────────────────
interface SummaryTypeCardProps {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  subtitle: string;
  count: number;
  countLabel?: string;
  stats: Array<{ icon: React.ReactNode; label: string; value: number; iconColor?: string }>;
  borderColor?: string;
}
export function SummaryTypeCard({
  icon, iconColor, title, subtitle, count, countLabel = 'registros', stats, borderColor
}: SummaryTypeCardProps) {
  return (
    <InfoCard style={{ borderLeft: borderColor ? `3px solid ${borderColor}` : undefined }}>
      <div style={{ padding: '20px 20px 0 20px' }}>
        {/* Cabecera */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TypeBadge icon={icon} color={iconColor} />
            <div>
              <p style={{ fontSize: '16px', fontWeight: 800, color: DESIGN.textPrimary, margin: 0 }}>{title}</p>
              <p style={{ fontSize: '11px', color: DESIGN.textSecondary, margin: 0 }}>{subtitle}</p>
            </div>
          </div>
          <BigNumber value={count} label={countLabel} color={iconColor} size="xl" />
        </div>
      </div>
      {/* Stats */}
      <div style={{ padding: '0 20px 4px 20px' }}>
        {stats.map((s, i) => (
          <StatRow
            key={s.label}
            icon={s.icon}
            label={s.label}
            value={s.value}
            iconColor={s.iconColor || iconColor}
            last={i === stats.length - 1}
          />
        ))}
      </div>
    </InfoCard>
  );
}

// ─── CertSummaryCard (ficha de normativa) ─────────────────────────────────
interface CertSummaryCardProps {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  certified: number;
  total: number;
  barColor?: string;
}
export function CertSummaryCard({ icon, iconColor, label, certified, total, barColor }: CertSummaryCardProps) {
  const pct = total > 0 ? Math.round((certified / total) * 100) : 0;
  const statusLabel = pct === 100 ? 'Completo' : pct >= 50 ? 'En progreso' : 'Pendiente';
  const bc = barColor || iconColor;

  return (
    <InfoCard>
      <div style={{ padding: 20 }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <TypeBadge icon={icon} color={iconColor} />
          <StatusBadge status={statusLabel} />
        </div>
        {/* Fracción */}
        <div style={{ marginBottom: 4 }}>
          <span style={{ fontSize: '40px', fontWeight: 900, color: DESIGN.textPrimary, lineHeight: 1 }}>
            {certified}
          </span>
          <span style={{ fontSize: '18px', fontWeight: 600, color: DESIGN.textMuted }}> / {total}</span>
        </div>
        <p style={{ fontSize: '13px', fontWeight: 700, color: DESIGN.textPrimary, margin: '4px 0 2px' }}>{label}</p>
        <p style={{ fontSize: '11px', color: DESIGN.textSecondary, margin: '0 0 16px' }}>
          Certificados de {total} registrados
        </p>
        {/* Barra */}
        <ProgressBar pct={pct} color={bc} height={6} label="normativa" showPct />
      </div>
    </InfoCard>
  );
}

// ─── KpiCard (tarjeta KPI pequeña) ────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  value: number | string;
  subtitle?: string;
  pct?: number;
  pctColor?: string;
  onClick?: () => void;
}
export function KpiCard({ icon, iconColor, label, value, subtitle, pct, pctColor, onClick }: KpiCardProps) {
  return (
    <InfoCard hover={!!onClick} onClick={onClick}>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <TypeBadge icon={icon} color={iconColor} />
          {onClick && (
            <span style={{ fontSize: '11px', color: DESIGN.blue, fontWeight: 600 }}>Ver →</span>
          )}
        </div>
        <div style={{ fontSize: '36px', fontWeight: 900, color: DESIGN.textPrimary, lineHeight: 1, marginBottom: 4 }}>
          {value}
        </div>
        <p style={{ fontSize: '13px', fontWeight: 600, color: DESIGN.textPrimary, margin: '0 0 2px' }}>{label}</p>
        {subtitle && <p style={{ fontSize: '11px', color: DESIGN.textSecondary, margin: 0 }}>{subtitle}</p>}
        {pct !== undefined && (
          <div style={{ marginTop: 12 }}>
            <ProgressBar pct={pct} color={pctColor || iconColor} height={4} showPct />
          </div>
        )}
      </div>
    </InfoCard>
  );
}

// ─── PageHeader (cabecera de página con título y descripción) ─────────────────
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: DESIGN.textPrimary, margin: 0, lineHeight: 1.2 }}>
          {title}
        </h1>
        {description && (
          <p style={{ fontSize: '13px', color: DESIGN.textSecondary, margin: '6px 0 0' }}>{description}</p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

// ─── TabBar (pestañas de módulo) ──────────────────────────────────────────────
interface TabBarProps {
  tabs: Array<{ id: string; label: string; icon?: React.ReactNode }>;
  active: string;
  onChange: (id: string) => void;
}
export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' }}>
      {tabs.map(tab => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: isActive ? DESIGN.blue : 'transparent',
              color: isActive ? '#fff' : DESIGN.textSecondary,
              fontSize: '13px', fontWeight: isActive ? 700 : 500,
              cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: isActive ? '0 2px 8px rgba(67,97,238,0.25)' : 'none',
            }}
          >
            {tab.icon && <span style={{ display: 'flex', alignItems: 'center', opacity: 0.85 }}>{tab.icon}</span>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── SearchBar ────────────────────────────────────────────────────────────────
interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}
export function SearchBar({ value, onChange, placeholder = 'Buscar...' }: SearchBarProps) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <svg style={{ position: 'absolute', left: 10, color: DESIGN.textMuted, pointerEvents: 'none' }}
        width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
      </svg>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
          border: `1px solid ${DESIGN.cardBorder}`, borderRadius: 8,
          background: DESIGN.cardBg, color: DESIGN.textPrimary,
          fontSize: '13px', outline: 'none', width: 220,
          transition: 'border-color 0.15s',
        }}
        onFocus={e => (e.target.style.borderColor = DESIGN.blue)}
        onBlur={e => (e.target.style.borderColor = DESIGN.cardBorder)}
      />
    </div>
  );
}

// ─── ActionButton ─────────────────────────────────────────────────────────────
interface ActionButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
  disabled?: boolean;
}
export function ActionButton({ children, onClick, variant = 'secondary', icon, size = 'md', disabled }: ActionButtonProps) {
  const [hovered, setHovered] = React.useState(false);
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: hovered ? '#3451D1' : DESIGN.blue,
      color: '#fff', border: 'none',
      boxShadow: hovered ? '0 4px 12px rgba(67,97,238,0.35)' : '0 2px 6px rgba(67,97,238,0.2)',
    },
    secondary: {
      background: hovered ? DESIGN.blueLight : DESIGN.cardBg,
      color: DESIGN.blue, border: `1px solid ${DESIGN.blueBorder}`,
    },
    ghost: {
      background: hovered ? DESIGN.divider : 'transparent',
      color: DESIGN.textSecondary, border: `1px solid ${DESIGN.cardBorder}`,
    },
    danger: {
      background: hovered ? '#FEE2E2' : DESIGN.cardBg,
      color: '#DC2626', border: '1px solid #FECACA',
    },
  };
  const pad = size === 'sm' ? '6px 12px' : '8px 16px';
  const fs = size === 'sm' ? '12px' : '13px';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: pad, borderRadius: 8, fontSize: fs, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
        ...styles[variant],
      }}
    >
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </button>
  );
}

// ─── DataTable (tabla de datos enterprise) ────────────────────────────────────
interface Column<T> {
  key: string;
  header: string;
  width?: string | number;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
}
interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}
export function DataTable<T extends { id: string }>({ columns, data, onRowClick, emptyMessage }: DataTableProps<T>) {
  const [hoveredRow, setHoveredRow] = React.useState<string | null>(null);
  return (
    <InfoCard>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8F9FE', borderBottom: `1px solid ${DESIGN.cardBorder}` }}>
              {columns.map(col => (
                <th key={col.key} style={{
                  padding: '11px 16px', textAlign: col.align || 'left',
                  fontSize: '11px', fontWeight: 700, color: DESIGN.textSecondary,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  width: col.width, whiteSpace: 'nowrap',
                }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{
                  padding: '40px 16px', textAlign: 'center',
                  color: DESIGN.textMuted, fontSize: '13px',
                }}>
                  {emptyMessage || 'Sin registros'}
                </td>
              </tr>
            ) : data.map((row, i) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                onMouseEnter={() => setHoveredRow(row.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  background: hoveredRow === row.id ? '#F8F9FE' : i % 2 === 0 ? '#FFFFFF' : '#FAFBFF',
                  borderBottom: `1px solid ${DESIGN.divider}`,
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
              >
                {columns.map(col => (
                  <td key={col.key} style={{
                    padding: '12px 16px', fontSize: '13px',
                    color: DESIGN.textPrimary, textAlign: col.align || 'left',
                    verticalAlign: 'middle',
                  }}>
                    {col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as React.ReactNode}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </InfoCard>
  );
}
