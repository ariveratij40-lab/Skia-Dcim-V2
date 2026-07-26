import { useState, useRef, useEffect } from 'react';
import { Network, Layers, HardDrive, Zap, CheckCircle, XCircle, GitBranch, List, Eye } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BBTopoItem {
  id: string;
  codigo: string;
  marca: string;
  tipo_fibra: string;
  idf_origen: string;
  idf_destino: string;
  panel_mdf: string;
  panel_idf: string;
  jumper: string;
  switch_ref: string;
  hilos: string;
  longitud: string;
  normativa: boolean;
  status: string;
}

// ── Fiber color mapping ────────────────────────────────────────────────────────
const FIBER_COLORS: Record<string, { line: string; badge: string; glow: string }> = {
  'OM4': { line: '#a855f7', badge: 'bg-purple-500/80 text-white', glow: 'shadow-purple-500/50' },
  'OM3': { line: '#06b6d4', badge: 'bg-cyan-500/80 text-white', glow: 'shadow-cyan-500/50' },
  'OM2': { line: '#f59e0b', badge: 'bg-amber-500/80 text-white', glow: 'shadow-amber-500/50' },
  'OS1': { line: '#f97316', badge: 'bg-orange-500/80 text-white', glow: 'shadow-orange-500/50' },
  'OS2': { line: '#eab308', badge: 'bg-yellow-500/80 text-white', glow: 'shadow-yellow-500/50' },
  'UTP Cat6': { line: '#22c55e', badge: 'bg-green-500/80 text-white', glow: 'shadow-green-500/50' },
  'UTP Cat6A': { line: '#10b981', badge: 'bg-emerald-500/80 text-white', glow: 'shadow-emerald-500/50' },
};
const getFiberColor = (t: string) => FIBER_COLORS[t] || { line: '#94a3b8', badge: 'bg-slate-500/80 text-white', glow: 'shadow-slate-500/30' };

// ── Layout constants ───────────────────────────────────────────────────────────
const MDF_X = 400;
const MDF_Y = 80;
const NODE_W = 160;
const NODE_H = 72;
const IDF_START_X = 80;
const IDF_Y = 280;
const IDF_GAP = 200;

// ── SVG Backbone Topology ─────────────────────────────────────────────────────
function BackboneTopoSVG({ items, onSelect }: { items: BBTopoItem[]; onSelect: (item: BBTopoItem) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Build unique IDFs
  const idfs = Array.from(new Set([
    ...items.map(i => i.idf_origen),
    ...items.map(i => i.idf_destino),
  ])).filter(n => n !== 'MDF' && !n.startsWith('MDF'));

  const mdfNodes = Array.from(new Set(items.map(i => i.idf_origen).filter(n => n.startsWith('MDF'))));
  const allMdfs = mdfNodes.length > 0 ? mdfNodes : ['MDF'];

  // Position IDFs
  const idfPositions: Record<string, { x: number; y: number }> = {};
  idfs.forEach((idf, idx) => {
    idfPositions[idf] = { x: IDF_START_X + idx * IDF_GAP, y: IDF_Y };
  });

  // Position MDFs
  const mdfPositions: Record<string, { x: number; y: number }> = {};
  allMdfs.forEach((mdf, idx) => {
    mdfPositions[mdf] = { x: MDF_X + idx * 220, y: MDF_Y };
  });

  const svgW = Math.max(900, IDF_START_X + idfs.length * IDF_GAP + 100);
  const svgH = 520;

  // Build switch nodes per IDF
  const switchesByIDF: Record<string, string[]> = {};
  items.forEach(item => {
    const dest = item.idf_destino;
    if (!switchesByIDF[dest]) switchesByIDF[dest] = [];
    if (item.switch_ref && !switchesByIDF[dest].includes(item.switch_ref)) {
      switchesByIDF[dest].push(item.switch_ref);
    }
  });

  return (
    <div className="relative w-full overflow-x-auto">
      <svg ref={svgRef} width={svgW} height={svgH} className="min-w-full">
        {/* Background grid */}
        <defs>
          <pattern id="bbgrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="1"/>
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <rect width={svgW} height={svgH} fill="url(#bbgrid)"/>

        {/* Draw backbone links */}
        {items.map(item => {
          const isMdfOrigin = item.idf_origen.startsWith('MDF') || item.idf_origen === 'MDF';
          const originPos = isMdfOrigin
            ? (mdfPositions[item.idf_origen] || { x: MDF_X, y: MDF_Y })
            : (idfPositions[item.idf_origen] || { x: MDF_X, y: MDF_Y });
          const destPos = idfPositions[item.idf_destino] || { x: IDF_START_X, y: IDF_Y };

          const x1 = originPos.x + NODE_W / 2;
          const y1 = originPos.y + NODE_H;
          const x2 = destPos.x + NODE_W / 2;
          const y2 = destPos.y;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const fc = getFiberColor(item.tipo_fibra);

          return (
            <g key={item.id} onClick={() => onSelect(item)} className="cursor-pointer" style={{ filter: 'url(#glow)' }}>
              {/* Glow line */}
              <path
                d={`M ${x1} ${y1} C ${x1} ${y1 + 60} ${x2} ${y2 - 60} ${x2} ${y2}`}
                fill="none"
                stroke={fc.line}
                strokeWidth="6"
                strokeOpacity="0.25"
              />
              {/* Main line */}
              <path
                d={`M ${x1} ${y1} C ${x1} ${y1 + 60} ${x2} ${y2 - 60} ${x2} ${y2}`}
                fill="none"
                stroke={fc.line}
                strokeWidth="2.5"
                strokeDasharray={item.status !== 'Activo' ? '6,4' : undefined}
              />
              {/* Mid badge */}
              <foreignObject x={mx - 52} y={my - 18} width={104} height={36}>
                <div className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-bold backdrop-blur-sm ${fc.badge} shadow-lg`}>
                  <span>{item.tipo_fibra}</span>
                  <span className="opacity-80 font-normal">{item.hilos} · {item.longitud}</span>
                </div>
              </foreignObject>
              {/* Cert badge */}
              <foreignObject x={mx + 56} y={my - 10} width={22} height={22}>
                {item.normativa
                  ? <CheckCircle size={18} color="#22c55e" fill="white"/>
                  : <XCircle size={18} color="#ef4444" fill="white"/>
                }
              </foreignObject>
            </g>
          );
        })}

        {/* MDF nodes */}
        {Object.entries(mdfPositions).map(([mdf, pos]) => (
          <foreignObject key={mdf} x={pos.x} y={pos.y} width={NODE_W} height={NODE_H}>
            <div className="w-full h-full bg-violet-700/85 backdrop-blur-md border-2 border-violet-400/60 rounded-2xl shadow-xl shadow-violet-500/40 flex flex-col items-center justify-center gap-1 px-2">
              <div className="flex items-center gap-1.5">
                <Network size={14} className="text-violet-200"/>
                <span className="text-white text-xs font-bold tracking-wide">MDF</span>
              </div>
              <span className="text-violet-200 text-xs font-semibold truncate w-full text-center">{mdf}</span>
              <span className="text-violet-300 text-[12px]">Nodo raíz</span>
            </div>
          </foreignObject>
        ))}

        {/* IDF nodes */}
        {idfs.map(idf => {
          const pos = idfPositions[idf];
          const count = items.filter(i => i.idf_destino === idf).length;
          return (
            <foreignObject key={idf} x={pos.x} y={pos.y} width={NODE_W} height={NODE_H}>
              <div className="w-full h-full bg-blue-600/80 backdrop-blur-md border-2 border-blue-400/60 rounded-2xl shadow-xl shadow-blue-500/40 flex flex-col items-center justify-center gap-1 px-2">
                <div className="flex items-center gap-1.5">
                  <Layers size={14} className="text-blue-200"/>
                  <span className="text-white text-xs font-bold tracking-wide">IDF</span>
                </div>
                <span className="text-blue-100 text-xs font-semibold truncate w-full text-center">{idf}</span>
                <span className="text-blue-300 text-[12px]">{count} backbone{count !== 1 ? 's' : ''}</span>
              </div>
            </foreignObject>
          );
        })}

        {/* Switch nodes */}
        {Object.entries(switchesByIDF).map(([idf, switches]) => {
          const idfPos = idfPositions[idf];
          if (!idfPos) return null;
          return switches.map((sw, si) => {
            const swX = idfPos.x + (si - (switches.length - 1) / 2) * 120;
            const swY = IDF_Y + NODE_H + 80;
            const x1 = idfPos.x + NODE_W / 2;
            const y1 = idfPos.y + NODE_H;
            return (
              <g key={`${idf}-${sw}`}>
                <line x1={x1} y1={y1} x2={swX + 70} y2={swY} stroke="rgba(148,163,184,0.5)" strokeWidth="1.5" strokeDasharray="4,3"/>
                <foreignObject x={swX} y={swY} width={140} height={56}>
                  <div className="w-full h-full bg-teal-600/75 backdrop-blur-md border border-teal-400/50 rounded-xl shadow-lg flex flex-col items-center justify-center gap-0.5 px-2">
                    <div className="flex items-center gap-1">
                      <Network size={12} className="text-teal-200"/>
                      <span className="text-white text-[13px] font-bold">Switch</span>
                    </div>
                    <span className="text-teal-100 text-[12px] truncate w-full text-center">{sw}</span>
                  </div>
                </foreignObject>
              </g>
            );
          });
        })}

        {/* Panel nodes per IDF */}
        {idfs.map(idf => {
          const pos = idfPositions[idf];
          const panels = Array.from(new Set(items.filter(i => i.idf_destino === idf).map(i => i.panel_idf).filter(Boolean)));
          return panels.map((panel, pi) => {
            const px = pos.x + (pi - (panels.length - 1) / 2) * 130;
            const py = IDF_Y + NODE_H + 80 + 100;
            const x1 = pos.x + NODE_W / 2;
            const y1 = pos.y + NODE_H;
            return (
              <g key={`${idf}-panel-${pi}`}>
                <line x1={x1} y1={y1 + 80} x2={px + 65} y2={py} stroke="rgba(100,116,139,0.4)" strokeWidth="1" strokeDasharray="3,3"/>
                <foreignObject x={px} y={py} width={130} height={48}>
                  <div className="w-full h-full bg-slate-600/70 backdrop-blur-md border border-slate-400/40 rounded-xl shadow flex flex-col items-center justify-center gap-0.5 px-2">
                    <div className="flex items-center gap-1">
                      <HardDrive size={11} className="text-[#5C6194]"/>
                      <span className="text-white text-[12px] font-bold">Panel IDF</span>
                    </div>
                    <span className="text-[#5C6194] text-[13px] truncate w-full text-center">{panel}</span>
                  </div>
                </foreignObject>
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────
function BackboneTopoList({ items, onSelect }: { items: BBTopoItem[]; onSelect: (item: BBTopoItem) => void }) {
  // Group by origin
  const groups: Record<string, BBTopoItem[]> = {};
  items.forEach(item => {
    if (!groups[item.idf_origen]) groups[item.idf_origen] = [];
    groups[item.idf_origen].push(item);
  });

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([origin, links]) => (
        <div key={origin} className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/80 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 bg-violet-50/80 border-b border-violet-100">
            <Network size={14} className="text-violet-600"/>
            <span className="text-sm font-bold text-violet-800">{origin}</span>
            <span className="ml-auto text-xs text-violet-500">{links.length} enlace{links.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-[#F0F2FA]">
            {links.map(item => {
              const fc = getFiberColor(item.tipo_fibra);
              return (
                <div key={item.id} onClick={() => onSelect(item)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fc.line }}/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{item.codigo}</span>
                      <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-md ${fc.badge}`}>{item.tipo_fibra}</span>
                      {item.normativa
                        ? <CheckCircle size={12} className="text-emerald-500"/>
                        : <XCircle size={12} className="text-red-400"/>
                      }
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-[#5C6194]">
                      <span className="flex items-center gap-1">
                        <Layers size={10}/>
                        {item.idf_origen} → {item.idf_destino}
                      </span>
                      <span>{item.hilos}</span>
                      <span>{item.longitud}</span>
                      <span className="text-slate-500">{item.jumper}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-semibold text-[#1A1D2E]">{item.switch_ref}</div>
                    <div className={`text-[12px] mt-0.5 ${item.status === 'Activo' ? 'text-emerald-600' : 'text-slate-500'}`}>{item.status}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function BackboneDetail({ item, onClose }: { item: BBTopoItem; onClose: () => void }) {
  const fc = getFiberColor(item.tipo_fibra);
  return (
    <div className="bg-slate-50/95 backdrop-blur-xl border border-[#E8EBF4]/60 rounded-2xl p-5 shadow-2xl text-white">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GitBranch size={16} className="text-violet-400"/>
            <span className="font-bold text-base">{item.codigo}</span>
            <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-md ${fc.badge}`}>{item.tipo_fibra}</span>
          </div>
          <div className="text-slate-500 text-xs">{item.marca}</div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {[
          ['IDF Origen', item.idf_origen],
          ['IDF Destino', item.idf_destino],
          ['Panel MDF', item.panel_mdf],
          ['Panel IDF', item.panel_idf],
          ['Jumper', item.jumper],
          ['Switch', item.switch_ref],
          ['Hilos', item.hilos],
          ['Longitud', item.longitud],
          ['Estado', item.status],
          ['Normativa', item.normativa ? '✓ Certificado' : '✗ Sin certificar'],
        ].map(([label, value]) => (
          <div key={label} className="bg-slate-100/5 rounded-xl p-2.5">
            <div className="text-slate-500 mb-0.5">{label}</div>
            <div className="font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>
      {/* Fiber type indicator */}
      <div className="mt-4 flex items-center gap-2 bg-slate-100/5 rounded-xl p-3">
        <Zap size={14} style={{ color: fc.line }}/>
        <div>
          <div className="text-xs text-[#5C6194]">Tipo de medio</div>
          <div className="text-sm font-bold" style={{ color: fc.line }}>{item.tipo_fibra}</div>
        </div>
        <div className="ml-auto">
          {item.normativa
            ? <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold"><CheckCircle size={12}/>Certificado Fluke</div>
            : <div className="flex items-center gap-1 text-red-400 text-xs font-semibold"><XCircle size={12}/>Sin certificar</div>
          }
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
interface BackboneTopoViewProps {
  items: BBTopoItem[];
}

export default function BackboneTopoView({ items }: BackboneTopoViewProps) {
  const [view, setView] = useState<'tree' | 'list'>('tree');
  const [selected, setSelected] = useState<BBTopoItem | null>(null);

  return (
    <div className="space-y-4">
      {/* Header + toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <GitBranch size={14} className="text-violet-600"/>
            Topología de Backbone
          </h3>
          <p className="text-xs text-[#5C6194] mt-0.5">
            {items.length} enlaces · {Array.from(new Set(items.map(i => i.idf_destino))).length} IDFs conectados
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <button onClick={() => setView('tree')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'tree' ? 'bg-slate-100 text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Eye size={12}/>Vista Árbol
          </button>
          <button onClick={() => setView('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'list' ? 'bg-slate-100 text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <List size={12}/>Vista Lista
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(FIBER_COLORS).map(([type, colors]) => (
          <div key={type} className="flex items-center gap-1.5 bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg px-2 py-1">
            <div className="w-3 h-1.5 rounded-full" style={{ background: colors.line }}/>
            <span className="text-xs text-slate-600 font-medium">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg px-2 py-1">
          <CheckCircle size={12} className="text-emerald-500"/>
          <span className="text-xs text-slate-600">Certificado</span>
        </div>
        <div className="flex items-center gap-1.5 bg-[#F0F2FA] border border-[#E8EBF4] rounded-lg px-2 py-1">
          <XCircle size={12} className="text-red-400"/>
          <span className="text-xs text-slate-600">Sin certificar</span>
        </div>
      </div>

      <div className={`grid gap-4 ${selected ? 'grid-cols-[1fr_320px]' : 'grid-cols-1'}`}>
        {/* Main view */}
        <div className="bg-slate-950/90 backdrop-blur-md rounded-2xl border border-[#E8EBF4]/60 p-4 shadow-2xl overflow-hidden">
          {view === 'tree'
            ? <BackboneTopoSVG items={items} onSelect={setSelected}/>
            : <BackboneTopoList items={items} onSelect={setSelected}/>
          }
        </div>

        {/* Detail panel */}
        {selected && (
          <BackboneDetail item={selected} onClose={() => setSelected(null)}/>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total backbones', value: items.length, color: 'text-violet-600' },
          { label: 'Certificados', value: items.filter(i => i.normativa).length, color: 'text-emerald-600' },
          { label: 'IDFs conectados', value: Array.from(new Set(items.map(i => i.idf_destino))).length, color: 'text-blue-600' },
          { label: 'Tipos de fibra', value: Array.from(new Set(items.map(i => i.tipo_fibra))).length, color: 'text-amber-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-[#F0F2FA] border border-[#E8EBF4] rounded-xl p-3 text-center shadow-sm">
            <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-[#5C6194] mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
