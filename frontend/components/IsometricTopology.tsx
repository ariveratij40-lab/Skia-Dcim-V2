import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { X, Activity, Wifi, Server, Layers, Database, Network, Zap, Radio, Package, Globe, Box, Move } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
export type NodeStatus = 'online' | 'warning' | 'critical' | 'offline' | 'planned';
export type NodeKind =
  | 'mdf' | 'idf' | 'rack' | 'patch' | 'switch' | 'backbone'
  | 'node' | 'ups' | 'asset' | 'internet' | 'server' | 'cloud';

export interface TopoNode {
  id: string;
  label: string;
  sublabel?: string;
  kind: NodeKind;
  status: NodeStatus;
  x: number;
  y: number;
  meta?: Record<string, string | number>;
}

export interface TopoEdge {
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'fiber';
}

export interface IsometricTopologyProps {
  nodes: TopoNode[];
  edges: TopoEdge[];
  title?: string;
  height?: number;
}

// ─── Internal position state ──────────────────────────────────────────────────
interface NodePos { x: number; y: number }

// ─── Status palette ──────────────────────────────────────────────────────────
const STATUS: Record<NodeStatus, { fill: string; stroke: string; glow: string; label: string }> = {
  online:   { fill: '#10B981', stroke: '#059669', glow: 'rgba(16,185,129,0.35)',  label: 'En línea'       },
  warning:  { fill: '#F59E0B', stroke: '#D97706', glow: 'rgba(245,158,11,0.35)',  label: 'Atención'       },
  critical: { fill: '#EF4444', stroke: '#DC2626', glow: 'rgba(239,68,68,0.35)',   label: 'Crítico'        },
  offline:  { fill: '#6B7280', stroke: '#4B5563', glow: 'rgba(107,114,128,0.25)', label: 'Fuera de línea' },
  planned:  { fill: '#8B5CF6', stroke: '#7C3AED', glow: 'rgba(139,92,246,0.35)',  label: 'Planeado'       },
};

// ─── Kind config ─────────────────────────────────────────────────────────────
const KIND_CONFIG: Record<NodeKind, {
  bg: string; border: string; iconBg: string; iconColor: string; label: string;
}> = {
  internet: { bg: '#EFF6FF', border: '#BFDBFE', iconBg: '#DBEAFE', iconColor: '#2563EB', label: 'Internet'    },
  mdf:      { bg: '#EEF2FF', border: '#C7D2FE', iconBg: '#E0E7FF', iconColor: '#4361EE', label: 'MDF'         },
  idf:      { bg: '#F0F9FF', border: '#BAE6FD', iconBg: '#E0F2FE', iconColor: '#0284C7', label: 'IDF'         },
  server:   { bg: '#F8FAFC', border: '#CBD5E1', iconBg: '#F1F5F9', iconColor: '#334155', label: 'Servidor'    },
  rack:     { bg: '#F8FAFC', border: '#CBD5E1', iconBg: '#F1F5F9', iconColor: '#475569', label: 'Rack'        },
  switch:   { bg: '#EEF2FF', border: '#C7D2FE', iconBg: '#E0E7FF', iconColor: '#4361EE', label: 'Switch'      },
  patch:    { bg: '#F0FDFA', border: '#99F6E4', iconBg: '#CCFBF1', iconColor: '#0F766E', label: 'Patch Panel' },
  backbone: { bg: '#FAF5FF', border: '#DDD6FE', iconBg: '#EDE9FE', iconColor: '#7C3AED', label: 'Backbone'    },
  node:     { bg: '#F0F9FF', border: '#BAE6FD', iconBg: '#E0F2FE', iconColor: '#0369A1', label: 'Nodo'        },
  ups:      { bg: '#FFFBEB', border: '#FDE68A', iconBg: '#FEF3C7', iconColor: '#B45309', label: 'UPS'         },
  asset:    { bg: '#F0FDF4', border: '#BBF7D0', iconBg: '#DCFCE7', iconColor: '#15803D', label: 'Activo'      },
  cloud:    { bg: '#EFF6FF', border: '#BFDBFE', iconBg: '#DBEAFE', iconColor: '#2563EB', label: 'Nube'        },
};

function kindIcon(kind: NodeKind, size = 18, color?: string) {
  const c = color ?? KIND_CONFIG[kind].iconColor;
  const props = { size, color: c, strokeWidth: 1.8 };
  switch (kind) {
    case 'internet': case 'cloud': return <Globe {...props} />;
    case 'mdf':      return <Database {...props} />;
    case 'idf':      return <Layers {...props} />;
    case 'server':   return <Server {...props} />;
    case 'rack':     return <Box {...props} />;
    case 'switch':   return <Zap {...props} />;
    case 'patch':    return <Network {...props} />;
    case 'backbone': return <Activity {...props} />;
    case 'node':     return <Wifi {...props} />;
    case 'ups':      return <Radio {...props} />;
    default:         return <Package {...props} />;
  }
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const NODE_W = 130;
const NODE_H = 72;
const LEVEL_GAP = 110;
const NODE_GAP = 24;

function buildInitialPositions(nodes: TopoNode[]): Map<string, NodePos> {
  const ys = Array.from(new Set(nodes.map(n => n.y))).sort((a, b) => a - b);
  const byLevel = new Map<number, TopoNode[]>();
  nodes.forEach(n => {
    const lv = ys.indexOf(n.y);
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(n);
  });
  byLevel.forEach(arr => arr.sort((a, b) => a.x - b.x));

  const positions = new Map<string, NodePos>();
  Array.from(byLevel.entries()).forEach(([lv, arr]) => {
    const totalW = arr.length * NODE_W + (arr.length - 1) * NODE_GAP;
    const startX = -totalW / 2 + NODE_W / 2;
    arr.forEach((n, i) => {
      positions.set(n.id, {
        x: startX + i * (NODE_W + NODE_GAP),
        y: lv * (NODE_H + LEVEL_GAP),
      });
    });
  });
  return positions;
}

function getLevelOf(nodes: TopoNode[], id: string): number {
  const ys = Array.from(new Set(nodes.map(n => n.y))).sort((a, b) => a - b);
  const node = nodes.find(n => n.id === id);
  return node ? ys.indexOf(node.y) : 0;
}

// ─── Edge path (bezier) ───────────────────────────────────────────────────────
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + NODE_H / 2 + y2 - NODE_H / 2) / 2;
  return `M ${x1} ${y1 + NODE_H / 2} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2 - NODE_H / 2}`;
}

// ─── Node Card ────────────────────────────────────────────────────────────────
const NodeCard = React.memo(function NodeCard({
  node, px, py, selected, dragging,
  onMouseDown, onClick,
}: {
  node: TopoNode;
  px: number; py: number;
  selected: boolean;
  dragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  const cfg = KIND_CONFIG[node.kind];
  const st = STATUS[node.status];
  const hw = NODE_W / 2;
  const hh = NODE_H / 2;

  return (
    <g
      transform={`translate(${px}, ${py})`}
      onMouseDown={onMouseDown}
      onClick={onClick}
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
    >
      {/* Drag shadow */}
      {dragging && (
        <rect
          x={-hw + 4} y={-hh + 8}
          width={NODE_W} height={NODE_H}
          rx={12}
          fill="rgba(0,0,0,0.18)"
          style={{ filter: 'blur(10px)' }}
        />
      )}

      {/* Selection glow */}
      {selected && !dragging && (
        <rect
          x={-hw - 6} y={-hh - 6}
          width={NODE_W + 12} height={NODE_H + 12}
          rx={16} fill={st.glow}
          style={{ filter: 'blur(8px)' }}
        />
      )}

      {/* Card */}
      <rect
        x={-hw} y={-hh}
        width={NODE_W} height={NODE_H}
        rx={12}
        fill={dragging ? '#1E2A3E' : selected ? '#1A1D2E' : cfg.bg}
        stroke={dragging ? '#4361EE' : selected ? st.stroke : cfg.border}
        strokeWidth={dragging ? 2.5 : selected ? 2 : 1.5}
        style={{
          filter: dragging
            ? 'drop-shadow(0 8px 24px rgba(67,97,238,0.4))'
            : selected
            ? 'drop-shadow(0 4px 16px rgba(0,0,0,0.25))'
            : 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))',
          transition: dragging ? 'none' : 'all 0.15s ease',
        }}
      />

      {/* Icon circle */}
      <circle
        cx={-hw + 26} cy={0} r={18}
        fill={dragging || selected ? cfg.iconBg + '30' : cfg.iconBg}
        stroke={dragging || selected ? cfg.iconColor + '60' : cfg.border}
        strokeWidth={1}
      />
      <foreignObject x={-hw + 8} y={-18} width={36} height={36}>
        <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {kindIcon(node.kind, 16, cfg.iconColor)}
        </div>
      </foreignObject>

      {/* Drag handle icon (top-right) */}
      <foreignObject x={hw - 22} y={-hh + 4} width={18} height={18}>
        <div style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.35 }}>
          <Move size={11} color={dragging || selected ? '#94A3B8' : '#64748B'} />
        </div>
      </foreignObject>

      {/* Label */}
      <text
        x={-hw + 52} y={-8}
        fontSize={11} fontWeight={700}
        fill={dragging || selected ? '#F1F5F9' : '#1A1D2E'}
        fontFamily="Inter, sans-serif"
        dominantBaseline="middle"
      >
        {node.label.length > 13 ? node.label.slice(0, 12) + '…' : node.label}
      </text>

      {/* Sublabel */}
      {node.sublabel && (
        <text
          x={-hw + 52} y={8}
          fontSize={9.5} fontWeight={400}
          fill={dragging || selected ? '#94A3B8' : '#64748B'}
          fontFamily="Inter, sans-serif"
          dominantBaseline="middle"
        >
          {node.sublabel.length > 16 ? node.sublabel.slice(0, 15) + '…' : node.sublabel}
        </text>
      )}

      {/* Status dot */}
      <circle cx={hw - 12} cy={-hh + 12} r={5} fill={st.fill} stroke="#fff" strokeWidth={1.5} />

      {/* Connectors */}
      <circle cx={0} cy={hh} r={3} fill={cfg.border} />
      <circle cx={0} cy={-hh} r={3} fill={cfg.border} />
    </g>
  );
});

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function DetailPanel({ node, onClose }: { node: TopoNode; onClose: () => void }) {
  const cfg = KIND_CONFIG[node.kind];
  const st = STATUS[node.status];
  return (
    <div style={{
      position: 'absolute', top: 16, right: 16,
      width: 260, background: '#1A1D2E',
      border: '1px solid #2D3A56', borderRadius: 16,
      boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
      zIndex: 100, overflow: 'hidden', fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #2D3A56', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.iconBg + '20', border: `1px solid ${cfg.iconColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {kindIcon(node.kind, 18, cfg.iconColor)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F1F5F9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</div>
          <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 1 }}>{cfg.label}{node.sublabel ? ` · ${node.sublabel}` : ''}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: 4, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3A56' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: st.fill + '20', border: `1px solid ${st.fill}40` }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.fill, display: 'inline-block' }} />
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: st.fill }}>{st.label}</span>
        </div>
      </div>
      {node.meta && Object.keys(node.meta).length > 0 && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #2D3A56' }}>
          {Object.entries(node.meta).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #1E2A3A' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{k}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#E2E8F0' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: '10px 16px', display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: cfg.iconColor + '20', border: `1px solid ${cfg.iconColor}40`, color: cfg.iconColor, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Ver detalle</button>
        <button style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: '#2D3A56', border: '1px solid #3D4A66', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>Historial</button>
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function Legend() {
  const statuses: NodeStatus[] = ['online', 'warning', 'critical', 'offline', 'planned'];
  return (
    <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(26,29,46,0.85)', backdropFilter: 'blur(8px)', border: '1px solid #2D3A56', borderRadius: 10, padding: '6px 12px', fontFamily: 'Inter, sans-serif' }}>
      {statuses.map(s => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS[s].fill, display: 'inline-block' }} />
          <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{STATUS[s].label}</span>
        </div>
      ))}
    </div>
  );
}

const LEVEL_LABELS: Record<number, string> = {
  0: 'Internet / WAN', 1: 'Core / Datacenter', 2: 'Distribución',
  3: 'Acceso', 4: 'Endpoints', 5: 'Dispositivos', 6: 'Terminales', 7: 'Periféricos',
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function IsometricTopology({ nodes, edges, title, height = 520 }: IsometricTopologyProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Free positions (overrides initial layout when user drags)
  const [nodePositions, setNodePositions] = useState<Map<string, NodePos>>(() => buildInitialPositions(nodes));

  // Drag state (ref for performance — no re-render during drag)
  const dragState = useRef<{
    nodeId: string;
    startMouseX: number; startMouseY: number;
    startNodeX: number; startNodeY: number;
    moved: boolean;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Pan state
  const panState = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // Reset positions when nodes prop changes
  useEffect(() => {
    setNodePositions(buildInitialPositions(nodes));
  }, [nodes]);

  // ── ViewBox ────────────────────────────────────────────────────────────────
  const { minX, minY, vbW, vbH, levels } = useMemo(() => {
    const allX = Array.from(nodePositions.values()).map(p => p.x);
    const allY = Array.from(nodePositions.values()).map(p => p.y);
    const minX = Math.min(...allX) - NODE_W / 2 - 80;
    const maxX = Math.max(...allX) + NODE_W / 2 + 80;
    const minY = Math.min(...allY) - NODE_H / 2 - 50;
    const maxY = Math.max(...allY) + NODE_H / 2 + 80;
    const levels = Array.from(new Set(nodes.map(n => getLevelOf(nodes, n.id)))).sort((a, b) => a - b);
    return { minX, minY, vbW: maxX - minX, vbH: maxY - minY, levels };
  }, [nodePositions, nodes]);

  // ── SVG coordinate conversion ──────────────────────────────────────────────
  const svgCoords = useCallback((clientX: number, clientY: number): { svgX: number; svgY: number } => {
    const svg = svgRef.current;
    if (!svg) return { svgX: 0, svgY: 0 };
    const rect = svg.getBoundingClientRect();
    // Convert from screen → viewBox coordinates (accounting for pan/zoom transform)
    const svgX = (clientX - rect.left) * (vbW / rect.width) + minX - pan.x / zoom;
    const svgY = (clientY - rect.top) * (vbH / rect.height) + minY - pan.y / zoom;
    return { svgX, svgY };
  }, [vbW, vbH, minX, minY, pan, zoom]);

  // ── Node drag handlers ─────────────────────────────────────────────────────
  const onNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const pos = nodePositions.get(nodeId);
    if (!pos) return;
    const { svgX, svgY } = svgCoords(e.clientX, e.clientY);
    dragState.current = {
      nodeId,
      startMouseX: svgX,
      startMouseY: svgY,
      startNodeX: pos.x,
      startNodeY: pos.y,
      moved: false,
    };
    setDraggingId(nodeId);
  }, [nodePositions, svgCoords]);

  // ── Pan handler ────────────────────────────────────────────────────────────
  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    panState.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  // ── Global mouse move ──────────────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    // Node drag
    if (dragState.current) {
      const { svgX, svgY } = svgCoords(e.clientX, e.clientY);
      const dx = svgX - dragState.current.startMouseX;
      const dy = svgY - dragState.current.startMouseY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        dragState.current.moved = true;
      }
      const newX = dragState.current.startNodeX + dx;
      const newY = dragState.current.startNodeY + dy;
      setNodePositions(prev => {
        const next = new Map(prev);
        next.set(dragState.current!.nodeId, { x: newX, y: newY });
        return next;
      });
      return;
    }
    // Canvas pan
    if (panState.current) {
      setPan({
        x: panState.current.px + (e.clientX - panState.current.mx),
        y: panState.current.py + (e.clientY - panState.current.my),
      });
    }
  }, [svgCoords]);

  const onMouseUp = useCallback(() => {
    dragState.current = null;
    setDraggingId(null);
    panState.current = null;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(3, Math.max(0.3, z - e.deltaY * 0.001)));
  }, []);

  // ── Node click (only if not dragged) ──────────────────────────────────────
  const onNodeClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    // If it was a drag, don't toggle selection
    if (dragState.current?.moved) return;
    setSelected(prev => prev === nodeId ? null : nodeId);
  }, []);

  const selectedNode = selected ? nodes.find(n => n.id === selected) : null;

  // ── Edge style ─────────────────────────────────────────────────────────────
  const edgeStyle = (style?: string) => {
    if (style === 'fiber')  return { stroke: '#6366F1', strokeWidth: 2,   strokeDasharray: undefined, opacity: 0.7  };
    if (style === 'dashed') return { stroke: '#94A3B8', strokeWidth: 1.5, strokeDasharray: '6,4',     opacity: 0.5  };
    return                         { stroke: '#4361EE', strokeWidth: 1.5, strokeDasharray: undefined, opacity: 0.55 };
  };

  // ── Reset layout ───────────────────────────────────────────────────────────
  const resetLayout = useCallback(() => {
    setNodePositions(buildInitialPositions(nodes));
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [nodes]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: 'relative', width: '100%', height, background: '#F4F5FB', borderRadius: 16, overflow: 'hidden', userSelect: 'none' }}
    >
      {/* Toolbar */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 50, display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(26,29,46,0.88)', backdropFilter: 'blur(8px)', border: '1px solid #2D3A56', borderRadius: 10, padding: '5px 10px', fontFamily: 'Inter, sans-serif' }}>
        {title && <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#E2E8F0', marginRight: 6 }}>{title}</span>}
        <button onClick={() => setZoom(z => Math.min(3, +(z + 0.2).toFixed(1)))} style={{ background: '#2D3A56', border: 'none', borderRadius: 6, color: '#94A3B8', width: 26, height: 26, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        <span style={{ fontSize: '0.7rem', color: '#64748B', minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.2).toFixed(1)))} style={{ background: '#2D3A56', border: 'none', borderRadius: 6, color: '#94A3B8', width: 26, height: 26, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <button onClick={resetLayout} style={{ background: '#2D3A56', border: 'none', borderRadius: 6, color: '#94A3B8', padding: '0 8px', height: 26, cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>Reset</button>
        {draggingId && (
          <span style={{ fontSize: '0.68rem', color: '#4361EE', fontWeight: 600, marginLeft: 4 }}>
            ✦ Moviendo…
          </span>
        )}
      </div>

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        width="100%" height="100%"
        viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
        style={{ cursor: draggingId ? 'grabbing' : panState.current ? 'grabbing' : 'grab' }}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#4361EE" opacity="0.6" />
          </marker>
          <marker id="arrow-fiber" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#6366F1" opacity="0.8" />
          </marker>
        </defs>

        {/* Pan/zoom group */}
        <g transform={`translate(${pan.x / zoom}, ${pan.y / zoom}) scale(${zoom})`}>

          {/* Level lanes (background) */}
          {levels.map(lv => {
            const lvNodes = nodes.filter(n => getLevelOf(nodes, n.id) === lv);
            if (!lvNodes.length) return null;
            const lvY = lv * (NODE_H + LEVEL_GAP);
            return (
              <g key={lv}>
                <rect
                  x={minX + 4} y={lvY - NODE_H / 2 - 10}
                  width={vbW - 8} height={NODE_H + 20}
                  rx={14}
                  fill={lv % 2 === 0 ? 'rgba(67,97,238,0.04)' : 'rgba(99,102,241,0.03)'}
                  stroke="rgba(67,97,238,0.08)" strokeWidth={1}
                />
                <text
                  x={minX + 18} y={lvY - NODE_H / 2 + 4}
                  fontSize={9} fontWeight={600} fill="#9EA3C8"
                  fontFamily="Inter, sans-serif" textAnchor="start" dominantBaseline="middle"
                >
                  {LEVEL_LABELS[lv] ?? `Nivel ${lv}`}
                </text>
              </g>
            );
          })}

          {/* Edges — drawn below nodes */}
          {edges.map((edge, i) => {
            const from = nodePositions.get(edge.from);
            const to   = nodePositions.get(edge.to);
            if (!from || !to) return null;
            const es = edgeStyle(edge.style);
            const isHighlighted = selected === edge.from || selected === edge.to;
            const path = edgePath(from.x, from.y, to.x, to.y);
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            return (
              <g key={i}>
                <path
                  d={path} fill="none"
                  stroke={isHighlighted ? '#4361EE' : es.stroke}
                  strokeWidth={isHighlighted ? es.strokeWidth + 1 : es.strokeWidth}
                  strokeDasharray={es.strokeDasharray}
                  opacity={isHighlighted ? 1 : es.opacity}
                  markerEnd={edge.style === 'fiber' ? 'url(#arrow-fiber)' : 'url(#arrow)'}
                  style={{ transition: 'none' }}
                />
                {edge.label && (
                  <g>
                    <rect x={midX - 18} y={midY - 8} width={36} height={14} rx={4} fill="#1A1D2E" opacity={0.85} />
                    <text x={midX} y={midY} fontSize={8} fontWeight={600} fill="#94A3B8" textAnchor="middle" dominantBaseline="middle" fontFamily="Inter, sans-serif">
                      {edge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Nodes — non-dragging first, then dragging on top */}
          {nodes
            .slice()
            .sort((a, b) => (a.id === draggingId ? 1 : b.id === draggingId ? -1 : 0))
            .map(node => {
              const pos = nodePositions.get(node.id);
              if (!pos) return null;
              const isDragging = draggingId === node.id;
              return (
                <NodeCard
                  key={node.id}
                  node={node}
                  px={pos.x}
                  py={pos.y}
                  selected={selected === node.id}
                  dragging={isDragging}
                  onMouseDown={(e) => onNodeMouseDown(e, node.id)}
                  onClick={(e) => onNodeClick(e, node.id)}
                />
              );
            })}
        </g>
      </svg>

      {/* Detail panel */}
      {selectedNode && <DetailPanel node={selectedNode} onClose={() => setSelected(null)} />}

      {/* Legend */}
      <Legend />

      {/* Stats badge */}
      <div style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(26,29,46,0.85)', backdropFilter: 'blur(8px)', border: '1px solid #2D3A56', borderRadius: 10, padding: '5px 12px', fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', color: '#64748B' }}>
        <span style={{ color: '#E2E8F0', fontWeight: 700 }}>{nodes.length}</span> nodos ·{' '}
        <span style={{ color: '#E2E8F0', fontWeight: 700 }}>{edges.length}</span> conexiones
      </div>

      {/* Drag hint */}
      <div style={{ position: 'absolute', top: 12, right: selectedNode ? 292 : 12, background: 'rgba(26,29,46,0.75)', backdropFilter: 'blur(8px)', border: '1px solid #2D3A56', borderRadius: 10, padding: '5px 12px', fontFamily: 'Inter, sans-serif', fontSize: '0.68rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: 5 }}>
        <Move size={11} color="#4361EE" />
        <span>Arrastra nodos para reposicionarlos</span>
      </div>
    </div>
  );
}
