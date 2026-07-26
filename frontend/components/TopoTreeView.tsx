import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Monitor, Wifi, Server, Printer, Camera, Phone, Network,
  Layers, Globe, HardDrive, ChevronDown, ChevronRight,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
export type NodeType = 'switch' | 'patch_panel' | 'pc' | 'ap' | 'camera' | 'server' | 'phone' | 'printer' | 'idf' | 'mdf' | 'internet';
export type MediaType = 'UTP' | 'Fibra Óptica' | 'DAC' | 'SFP+';

export interface TopoNode {
  id: string;
  label: string;
  type: NodeType;
  ip?: string;
  media?: MediaType;
  speed?: string;
  children?: TopoNode[];
}

// ── Config ────────────────────────────────────────────────────────────────────
const NODE_ICONS: Record<NodeType, React.ReactNode> = {
  mdf:         <Network size={16}/>,
  idf:         <Layers size={16}/>,
  switch:      <Network size={16}/>,
  patch_panel: <HardDrive size={16}/>,
  pc:          <Monitor size={14}/>,
  ap:          <Wifi size={14}/>,
  camera:      <Camera size={14}/>,
  server:      <Server size={14}/>,
  phone:       <Phone size={14}/>,
  printer:     <Printer size={14}/>,
  internet:    <Globe size={14}/>,
};

// Glass gradient per node type
const NODE_GLASS: Record<NodeType, { bg: string; border: string; text: string; glow: string }> = {
  mdf:         { bg: 'bg-violet-600/80', border: 'border-violet-400/60', text: 'text-white', glow: 'shadow-violet-500/40' },
  idf:         { bg: 'bg-blue-600/80',   border: 'border-blue-400/60',   text: 'text-white', glow: 'shadow-blue-500/40' },
  switch:      { bg: 'bg-teal-600/80',   border: 'border-teal-400/60',   text: 'text-white', glow: 'shadow-teal-500/40' },
  patch_panel: { bg: 'bg-slate-600/80',  border: 'border-slate-400/60',  text: 'text-white', glow: 'shadow-slate-500/30' },
  pc:          { bg: 'bg-slate-100/80',      border: 'border-[#E8EBF4]/80',  text: 'text-slate-700', glow: 'shadow-slate-200/50' },
  ap:          { bg: 'bg-amber-50/80',   border: 'border-amber-200/80',  text: 'text-amber-800', glow: 'shadow-amber-200/50' },
  camera:      { bg: 'bg-rose-50/80',    border: 'border-rose-200/80',   text: 'text-rose-800', glow: 'shadow-rose-200/50' },
  server:      { bg: 'bg-indigo-50/80',  border: 'border-indigo-200/80', text: 'text-indigo-800', glow: 'shadow-indigo-200/50' },
  phone:       { bg: 'bg-green-50/80',   border: 'border-green-200/80',  text: 'text-green-800', glow: 'shadow-green-200/50' },
  printer:     { bg: 'bg-slate-50/80',   border: 'border-[#E8EBF4]/80',  text: 'text-slate-700', glow: 'shadow-slate-200/50' },
  internet:    { bg: 'bg-sky-50/80',     border: 'border-sky-200/80',    text: 'text-sky-800', glow: 'shadow-sky-200/50' },
};

// Zone (group) colors for IDF clusters
const ZONE_COLORS = [
  { bg: 'bg-blue-500/10',   border: 'border-blue-400/30',   label: 'text-blue-700' },
  { bg: 'bg-emerald-500/10',border: 'border-emerald-400/30',label: 'text-emerald-700' },
  { bg: 'bg-amber-500/10',  border: 'border-amber-400/30',  label: 'text-amber-700' },
  { bg: 'bg-rose-500/10',   border: 'border-rose-400/30',   label: 'text-rose-700' },
  { bg: 'bg-violet-500/10', border: 'border-violet-400/30', label: 'text-violet-700' },
];

const MEDIA_STYLE: Record<MediaType, { line: string; badge: string; dash: string }> = {
  'Fibra Óptica': { line: '#a78bfa', badge: 'bg-violet-100 text-violet-700 border-violet-300', dash: '0' },
  'UTP':          { line: '#22d3ee', badge: 'bg-cyan-100 text-cyan-700 border-cyan-300',       dash: '0' },
  'DAC':          { line: '#fbbf24', badge: 'bg-amber-100 text-amber-700 border-amber-300',    dash: '4 2' },
  'SFP+':         { line: '#60a5fa', badge: 'bg-blue-100 text-blue-700 border-blue-300',       dash: '6 3' },
};

// ── Glass Node Card ───────────────────────────────────────────────────────────
interface NodeCardProps {
  node: TopoNode;
  x: number;
  y: number;
  selected: boolean;
  onClick: () => void;
}

function NodeCard({ node, x, y, selected, onClick }: NodeCardProps) {
  const g = NODE_GLASS[node.type];
  const isLeaf = !node.children || node.children.length === 0;
  const W = isLeaf ? 110 : 130;
  const H = isLeaf ? 56 : 64;

  return (
    <foreignObject x={x - W / 2} y={y - H / 2} width={W} height={H} style={{ overflow: 'visible' }}>
      <div
        onClick={onClick}
        className={`
          cursor-pointer select-none
          backdrop-blur-md ${g.bg} ${g.text}
          border ${selected ? 'border-white ring-2 ring-white/60' : g.border}
          rounded-2xl shadow-lg ${g.glow}
          flex flex-col items-center justify-center gap-0.5
          px-2 py-1.5 transition-all duration-200
          hover:scale-105 hover:shadow-xl
        `}
        style={{ width: W, height: H }}
      >
        <div className="opacity-90">{NODE_ICONS[node.type]}</div>
        <div className="text-[12px] font-bold leading-tight text-center truncate w-full px-1">{node.label}</div>
        {node.ip && <div className="text-[12px] opacity-60 font-mono">{node.ip}</div>}
        {node.speed && <div className="text-[12px] font-bold opacity-80">{node.speed}</div>}
      </div>
    </foreignObject>
  );
}

// ── Layout engine ─────────────────────────────────────────────────────────────
interface LayoutNode {
  node: TopoNode;
  x: number;
  y: number;
  parentId?: string;
  media?: MediaType;
  speed?: string;
}

const NODE_W = 140;
const NODE_H = 80;
const H_GAP = 24;
const V_GAP = 60;

function layoutTree(root: TopoNode): LayoutNode[] {
  const result: LayoutNode[] = [];

  function place(node: TopoNode, depth: number, slot: number, totalSlots: number, parentId?: string): number {
    const children = node.children ?? [];
    let childSlotStart = slot;
    let totalChildSlots = 0;

    // First pass: count total child slots
    if (children.length > 0) {
      totalChildSlots = children.reduce((acc, _) => acc + 1, 0);
    }

    // Place children first to get their x positions
    const childXs: number[] = [];
    let currentSlot = slot;
    for (const child of children) {
      const childSlots = place(child, depth + 1, currentSlot, 1, node.id);
      childXs.push(currentSlot);
      currentSlot += childSlots;
    }

    // Center this node over its children
    const mySlot = children.length > 0
      ? (childSlotStart + currentSlot - 1) / 2
      : slot;

    const x = mySlot * (NODE_W + H_GAP) + (NODE_W + H_GAP) / 2;
    const y = depth * (NODE_H + V_GAP) + NODE_H / 2 + 40;

    result.push({ node, x, y, parentId, media: node.media, speed: node.speed });

    return children.length > 0 ? currentSlot - slot : 1;
  }

  place(root, 0, 0, 1);
  return result;
}

// ── Zone grouping (IDF clusters) ──────────────────────────────────────────────
function getZoneBounds(nodes: LayoutNode[], parentId: string, allNodes: LayoutNode[]) {
  const children = nodes.filter(n => n.parentId === parentId);
  if (children.length === 0) return null;

  // Get all descendants
  const descendants: LayoutNode[] = [];
  const queue = [...children];
  while (queue.length > 0) {
    const n = queue.shift()!;
    descendants.push(n);
    const kids = nodes.filter(k => k.parentId === n.node.id);
    queue.push(...kids);
  }

  if (descendants.length === 0) return null;

  const xs = descendants.map(n => n.x);
  const ys = descendants.map(n => n.y);
  const pad = 28;
  return {
    x: Math.min(...xs) - NODE_W / 2 - pad,
    y: Math.min(...ys) - NODE_H / 2 - pad,
    w: Math.max(...xs) - Math.min(...xs) + NODE_W + pad * 2,
    h: Math.max(...ys) - Math.min(...ys) + NODE_H + pad * 2,
  };
}

// ── Main TopoTreeView ─────────────────────────────────────────────────────────
interface TopoTreeViewProps {
  topology: TopoNode;
  ports: { port_num: number; status: string; device: string; backbone: string; ip: string }[];
}

export default function TopoTreeView({ topology, ports }: TopoTreeViewProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ node: TopoNode; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const layout = layoutTree(topology);

  // SVG canvas size
  const xs = layout.map(n => n.x);
  const ys = layout.map(n => n.y);
  const svgW = Math.max(...xs) + NODE_W / 2 + 60;
  const svgH = Math.max(...ys) + NODE_H / 2 + 60;

  // Build edges
  const edges: { from: LayoutNode; to: LayoutNode }[] = [];
  for (const ln of layout) {
    if (ln.parentId) {
      const parent = layout.find(p => p.node.id === ln.parentId);
      if (parent) edges.push({ from: parent, to: ln });
    }
  }

  // IDF zone groups (children of root that are idf/switch type)
  const rootChildren = layout.filter(n => n.parentId === topology.id && (n.node.type === 'idf' || n.node.type === 'switch' || n.node.type === 'patch_panel'));

  return (
    <div className="relative w-full overflow-x-auto">
      {/* Background glass panel */}
      <div className="relative rounded-2xl overflow-hidden border border-white/20 shadow-2xl"
        style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(30,41,59,0.95) 50%, rgba(15,23,42,0.92) 100%)' }}>

        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)', backgroundSize: '28px 28px' }}/>

        {/* Legend */}
        <div className="relative z-10 flex flex-wrap items-center gap-3 px-5 pt-4 pb-2">
          <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest mr-2">Tipo de medio</span>
          {(Object.entries(MEDIA_STYLE) as [MediaType, typeof MEDIA_STYLE[MediaType]][]).map(([m, s]) => (
            <div key={m} className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[13px] font-bold ${s.badge}`}>
              <svg width="16" height="6">
                <line x1="0" y1="3" x2="16" y2="3" stroke={s.line} strokeWidth="2" strokeDasharray={s.dash}/>
              </svg>
              {m}
            </div>
          ))}
        </div>

        {/* SVG canvas */}
        <svg
          ref={svgRef}
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="block mx-auto"
          style={{ minWidth: Math.min(svgW, 900) }}
        >
          <defs>
            {/* Glow filter */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            {/* Arrowhead markers */}
            {(Object.entries(MEDIA_STYLE) as [MediaType, typeof MEDIA_STYLE[MediaType]][]).map(([m, s]) => (
              <marker key={m} id={`arrow-${m.replace(/[^a-z]/gi,'')}`}
                markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill={s.line} opacity="0.8"/>
              </marker>
            ))}
          </defs>

          {/* Zone backgrounds for IDF groups */}
          {rootChildren.map((rc, zi) => {
            const bounds = getZoneBounds(layout, rc.node.id, layout);
            if (!bounds) return null;
            const zc = ZONE_COLORS[zi % ZONE_COLORS.length];
            return (
              <g key={`zone-${rc.node.id}`}>
                <rect
                  x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h}
                  rx="20" ry="20"
                  fill={`rgba(${zi === 0 ? '59,130,246' : zi === 1 ? '16,185,129' : zi === 2 ? '245,158,11' : '239,68,68'},0.08)`}
                  stroke={`rgba(${zi === 0 ? '59,130,246' : zi === 1 ? '16,185,129' : zi === 2 ? '245,158,11' : '239,68,68'},0.25)`}
                  strokeWidth="1.5"
                  strokeDasharray="6 3"
                />
                <text
                  x={bounds.x + 14} y={bounds.y + 18}
                  fontSize="9" fontWeight="700" letterSpacing="0.08em"
                  fill={`rgba(${zi === 0 ? '96,165,250' : zi === 1 ? '52,211,153' : zi === 2 ? '251,191,36' : '252,165,165'},0.9)`}
                  style={{ textTransform: 'uppercase' }}
                >
                  {rc.node.label}
                </text>
              </g>
            );
          })}

          {/* Edges */}
          {edges.map(({ from, to }) => {
            const media = to.media ?? 'UTP';
            const style = MEDIA_STYLE[media];
            const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
            const markerId = `arrow-${media.replace(/[^a-z]/gi, '')}`;

            // Curved bezier path
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const cx1 = from.x + dx * 0.1;
            const cy1 = from.y + dy * 0.6;
            const cx2 = to.x - dx * 0.1;
            const cy2 = to.y - dy * 0.4;

            return (
              <g key={`edge-${from.node.id}-${to.node.id}`}>
                {/* Glow line */}
                <path
                  d={`M ${from.x} ${from.y + NODE_H / 2 - 8} C ${cx1} ${cy1} ${cx2} ${cy2} ${to.x} ${to.y - NODE_H / 2 + 8}`}
                  fill="none"
                  stroke={style.line}
                  strokeWidth="4"
                  strokeOpacity="0.15"
                  filter="url(#glow)"
                />
                {/* Main line */}
                <path
                  d={`M ${from.x} ${from.y + NODE_H / 2 - 8} C ${cx1} ${cy1} ${cx2} ${cy2} ${to.x} ${to.y - NODE_H / 2 + 8}`}
                  fill="none"
                  stroke={style.line}
                  strokeWidth="1.8"
                  strokeOpacity="0.85"
                  strokeDasharray={style.dash}
                  markerEnd={`url(#${markerId})`}
                />
                {/* Speed label on edge */}
                {to.speed && (
                  <g>
                    <rect x={mid.x - 18} y={mid.y - 8} width="36" height="14" rx="4"
                      fill="rgba(15,23,42,0.85)" stroke={style.line} strokeWidth="0.8" strokeOpacity="0.6"/>
                    <text x={mid.x} y={mid.y + 3.5} textAnchor="middle"
                      fontSize="8" fontWeight="700" fill={style.line} opacity="0.95">
                      {to.speed}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {layout.map(ln => (
            <NodeCard
              key={ln.node.id}
              node={ln.node}
              x={ln.x}
              y={ln.y}
              selected={selected === ln.node.id}
              onClick={() => {
                setSelected(s => s === ln.node.id ? null : ln.node.id);
                setTooltip(t => t?.node.id === ln.node.id ? null : { node: ln.node, x: ln.x, y: ln.y });
              }}
            />
          ))}
        </svg>

        {/* Tooltip / detail card */}
        {tooltip && (
          <div className="absolute z-20 bottom-4 right-4 max-w-xs w-72">
            <div className="backdrop-blur-xl bg-slate-50/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="text-[#5C6194]">{NODE_ICONS[tooltip.node.type]}</div>
                  <span className="text-sm font-bold text-white">{tooltip.node.label}</span>
                </div>
                <button onClick={() => { setTooltip(null); setSelected(null); }}
                  className="text-slate-500 hover:text-white transition-colors text-xs">✕</button>
              </div>
              <div className="px-4 py-3 space-y-1.5">
                {tooltip.node.ip && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#5C6194] uppercase tracking-wider">IP</span>
                    <span className="text-[13px] font-mono text-cyan-300">{tooltip.node.ip}</span>
                  </div>
                )}
                {tooltip.node.media && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#5C6194] uppercase tracking-wider">Medio</span>
                    <span className={`text-[12px] font-bold px-2 py-0.5 rounded border ${MEDIA_STYLE[tooltip.node.media].badge}`}>{tooltip.node.media}</span>
                  </div>
                )}
                {tooltip.node.speed && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#5C6194] uppercase tracking-wider">Velocidad</span>
                    <span className="text-[13px] font-bold text-emerald-400">{tooltip.node.speed}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#5C6194] uppercase tracking-wider">Tipo</span>
                  <span className="text-[12px] text-[#5C6194] capitalize">{tooltip.node.type.replace('_', ' ')}</span>
                </div>
                {tooltip.node.children && tooltip.node.children.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#5C6194] uppercase tracking-wider">Conexiones</span>
                    <span className="text-[12px] text-[#5C6194]">{tooltip.node.children.length} dispositivos</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bottom padding */}
        <div className="h-4"/>
      </div>
    </div>
  );
}
