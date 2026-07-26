'use client';
import React, {
  useState, useRef, useEffect, useCallback, MouseEvent as RMouseEvent,
} from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2, Layers, Eye, EyeOff,
  MapPin, Minus, Type, Ruler, Trash2, Download, Printer,
  Save, X, ChevronDown, Move, RotateCcw, ChevronLeft, ChevronRight,
  FileDown, Share2, Mail, Scissors, Crosshair,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
export type AnnotationType = 'marker' | 'line' | 'text' | 'measure' | 'rect' | 'arrow';
export type LayerColor = '#EF4444' | '#3B82F6' | '#F59E0B' | '#8B5CF6' | '#10B981' | '#F97316' | '#1D1D1F' | '#06B6D4' | '#4361EE';

export type InfraElementType =
  | 'camara' | 'lector' | 'controladora' | 'puerta' | 'sensor'
  | 'bocina' | 'idf_mdf' | 'escalerilla' | 'conexion' | 'cable_utp'
  | 'marcador_infra' | 'nodo_utp' | 'trayecto_utp' | 'ap_wifi'
  | 'rack' | 'servidor' | 'patch_panel' | 'switch_net' | 'ups'
  | 'area_zona';

export interface Layer {
  id: string;
  name: string;
  color: LayerColor;
  visible: boolean;
  locked: boolean;
  annotations: Annotation[];
}

export interface Annotation {
  id: string;
  layerId: string;
  type: AnnotationType;
  color: LayerColor;
  points: { x: number; y: number }[];
  text?: string;
  fontSize?: number;
  strokeWidth?: number;
}

export interface InfraElement {
  id: string;
  type: InfraElementType;
  layerId: string;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  label: string;
  color: string;
  // Cámara: rotación en grados (0 = apunta a la derecha) y ángulo de cobertura
  rotation?: number;      // 0-359 grados
  coverageAngle?: number; // 30-180 grados (default 90)
  coverageDist?: number;  // distancia del cono en unidades SVG
}

// Área nombrada sobre el plano
export interface PlanArea {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface PlanosViewerProps {
  fileUrl: string | null;
  fileName?: string;
  building?: string;
  floor?: string;
  scale?: string;
  onSave?: (layers: Layer[]) => void;
}

// ─── Default layers ───────────────────────────────────────────────────────────
const DEFAULT_LAYERS: Layer[] = [
  { id: 'general',  name: 'General',        color: '#F59E0B', visible: true,  locked: false, annotations: [] },
  { id: 'cctv',     name: 'CCTV',           color: '#EF4444', visible: true,  locked: false, annotations: [] },
  { id: 'acceso',   name: 'Control Acceso', color: '#06B6D4', visible: true,  locked: false, annotations: [] },
  { id: 'voz',      name: 'Voz/Datos',      color: '#4361EE', visible: true,  locked: false, annotations: [] },
  { id: 'cableado', name: 'Cableado',       color: '#3B82F6', visible: true,  locked: false, annotations: [] },
  { id: 'energia',  name: 'Energía',        color: '#10B981', visible: true,  locked: false, annotations: [] },
  { id: 'voceo',    name: 'Voceo',          color: '#8B5CF6', visible: true,  locked: false, annotations: [] },
  { id: 'notas',    name: 'Notas',          color: '#1D1D1F', visible: true,  locked: false, annotations: [] },
];

const TOOL_COLORS: LayerColor[] = ['#EF4444','#3B82F6','#F59E0B','#8B5CF6','#10B981','#F97316','#1D1D1F'];

const AREA_COLORS = ['#4361EE','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316'];

interface InfraTool {
  id: InfraElementType;
  label: string;
  icon: string;
  layerId: string;
  color: string;
  description: string;
  isLine?: boolean;
}

const INFRA_CATEGORIES: { id: string; label: string; tools: InfraTool[] }[] = [
  {
    id: 'cctv', label: 'CCTV',
    tools: [
      { id: 'camara',      label: 'Cámara',      icon: '📷', layerId: 'cctv',     color: '#EF4444', description: 'Cámara de vigilancia' },
      { id: 'sensor',      label: 'Sensor',      icon: '⚡', layerId: 'cctv',     color: '#F59E0B', description: 'Sensor de movimiento' },
      { id: 'bocina',      label: 'Bocina',      icon: '🔊', layerId: 'voceo',    color: '#8B5CF6', description: 'Bocina / altavoz' },
    ],
  },
  {
    id: 'acceso', label: 'CONTROL ACCESO',
    tools: [
      { id: 'lector',      label: 'Lector',      icon: '🔖', layerId: 'acceso',   color: '#06B6D4', description: 'Lector de tarjeta' },
      { id: 'controladora',label: 'Controladora',icon: '⚙',  layerId: 'acceso',   color: '#0EA5E9', description: 'Controladora de acceso' },
      { id: 'puerta',      label: 'Puerta',      icon: '🚪', layerId: 'acceso',   color: '#64748B', description: 'Puerta controlada' },
      { id: 'escalerilla', label: 'Escalerilla', icon: '▤',  layerId: 'cableado', color: '#78716C', description: 'Escalerilla portacables', isLine: true },
    ],
  },
  {
    id: 'infra', label: 'INFRAESTRUCTURA',
    tools: [
      { id: 'idf_mdf',     label: 'IDF/MDF',     icon: '🖥', layerId: 'voz',      color: '#4361EE', description: 'Cuarto de telecomunicaciones' },
      { id: 'rack',        label: 'Rack',         icon: '📦', layerId: 'voz',      color: '#6366F1', description: 'Rack de equipos' },
      { id: 'servidor',    label: 'Servidor',     icon: '🖧', layerId: 'voz',      color: '#8B5CF6', description: 'Servidor' },
      { id: 'patch_panel', label: 'Patch Panel',  icon: '⊞',  layerId: 'cableado', color: '#14B8A6', description: 'Patch panel' },
      { id: 'switch_net',  label: 'Switch',       icon: '⇄',  layerId: 'voz',      color: '#0EA5E9', description: 'Switch de red' },
      { id: 'ups',         label: 'UPS',          icon: '🔋', layerId: 'energia',  color: '#F59E0B', description: 'UPS / alimentación' },
      { id: 'ap_wifi',     label: 'AP WiFi',      icon: '📡', layerId: 'voz',      color: '#10B981', description: 'Punto de acceso WiFi' },
    ],
  },
  {
    id: 'cableado', label: 'CABLEADO',
    tools: [
      { id: 'conexion',    label: 'Conexión',     icon: '⟷', layerId: 'cableado', color: '#64748B', description: 'Línea de conexión', isLine: true },
      { id: 'cable_utp',   label: 'Cable UTP',    icon: '━',  layerId: 'cableado', color: '#3B82F6', description: 'Cable UTP', isLine: true },
      { id: 'nodo_utp',    label: 'Nodo UTP',     icon: '●',  layerId: 'cableado', color: '#2563EB', description: 'Punto de red / nodo UTP' },
      { id: 'trayecto_utp',label: 'Trayecto UTP', icon: '▬',  layerId: 'cableado', color: '#1D4ED8', description: 'Trayecto de cableado', isLine: true },
    ],
  },
  {
    id: 'anotaciones', label: 'ANOTACIONES',
    tools: [
      { id: 'marcador_infra',label: 'Marcador',   icon: '📍', layerId: 'notas',    color: '#EF4444', description: 'Marcador de punto' },
      { id: 'area_zona',   label: 'Área/Zona',    icon: '⬜', layerId: 'notas',    color: '#7C3AED', description: 'Marcar área', isLine: true },
    ],
  },
];

// ─── SVG symbol for each infra element ───────────────────────────────────────
function InfraSymbol({ type, color, size = 22 }: { type: InfraElementType; color: string; size?: number }) {
  const s = size;
  const sw = 1.5;
  switch (type) {
    case 'camara':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x={2} y={7} width={14} height={10} rx={2} stroke={color} strokeWidth={sw} fill={color+'20'} />
        <polygon points="16,9 22,6 22,18 16,15" stroke={color} strokeWidth={sw} fill={color+'30'} />
        <circle cx={9} cy={12} r={2.5} stroke={color} strokeWidth={sw} fill={color+'40'} />
      </svg>;
    case 'lector':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x={4} y={3} width={16} height={18} rx={2} stroke={color} strokeWidth={sw} fill={color+'20'} />
        <rect x={7} y={8} width={10} height={3} rx={1} fill={color} />
        <circle cx={12} cy={16} r={2} stroke={color} strokeWidth={sw} fill={color+'30'} />
      </svg>;
    case 'controladora':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x={3} y={5} width={18} height={14} rx={2} stroke={color} strokeWidth={sw} fill={color+'20'} />
        <circle cx={8} cy={12} r={2} fill={color} />
        <circle cx={16} cy={12} r={2} fill={color} />
        <line x1={10} y1={12} x2={14} y2={12} stroke={color} strokeWidth={sw} />
      </svg>;
    case 'puerta':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x={3} y={2} width={12} height={20} rx={1} stroke={color} strokeWidth={sw} fill={color+'15'} />
        <path d="M15 2 Q21 8 21 12 Q21 16 15 22" stroke={color} strokeWidth={sw} fill="none" strokeDasharray="2,2" />
        <circle cx={14} cy={12} r={1.5} fill={color} />
      </svg>;
    case 'sensor':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <polygon points="12,2 22,20 2,20" stroke={color} strokeWidth={sw} fill={color+'20'} />
        <line x1={12} y1={8} x2={12} y2={14} stroke={color} strokeWidth={sw} />
        <circle cx={12} cy={17} r={1.5} fill={color} />
      </svg>;
    case 'bocina':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <polygon points="3,9 3,15 8,15 14,20 14,4 8,9" stroke={color} strokeWidth={sw} fill={color+'20'} />
        <path d="M17 9 Q20 12 17 15" stroke={color} strokeWidth={sw} fill="none" />
        <path d="M19 6 Q24 12 19 18" stroke={color} strokeWidth={sw} fill="none" />
      </svg>;
    case 'idf_mdf':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x={2} y={3} width={20} height={18} rx={2} stroke={color} strokeWidth={sw} fill={color+'15'} />
        <rect x={5} y={6} width={14} height={3} rx={1} fill={color+'40'} />
        <rect x={5} y={11} width={14} height={3} rx={1} fill={color+'40'} />
        <rect x={5} y={16} width={14} height={2} rx={1} fill={color+'40'} />
        <circle cx={18} cy={7.5} r={1} fill={color} />
        <circle cx={18} cy={12.5} r={1} fill={color} />
      </svg>;
    case 'rack':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x={4} y={2} width={16} height={20} rx={1} stroke={color} strokeWidth={sw} fill={color+'10'} />
        {[5,8,11,14,17].map(y => <rect key={y} x={6} y={y} width={12} height={2} rx={0.5} fill={color+'50'} />)}
      </svg>;
    case 'servidor':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x={2} y={4} width={20} height={7} rx={1} stroke={color} strokeWidth={sw} fill={color+'20'} />
        <rect x={2} y={13} width={20} height={7} rx={1} stroke={color} strokeWidth={sw} fill={color+'20'} />
        <circle cx={19} cy={7.5} r={1.5} fill={color} />
        <circle cx={19} cy={16.5} r={1.5} fill={color} />
      </svg>;
    case 'patch_panel':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x={2} y={8} width={20} height={8} rx={1} stroke={color} strokeWidth={sw} fill={color+'15'} />
        {[4,7,10,13,16,19].map(x => <circle key={x} cx={x} cy={12} r={1.5} fill={color} />)}
      </svg>;
    case 'switch_net':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x={2} y={8} width={20} height={8} rx={1} stroke={color} strokeWidth={sw} fill={color+'15'} />
        {[5,8,11,14,17,20].map(x => <rect key={x} x={x-1.5} y={10} width={3} height={4} rx={0.5} fill={color+'60'} />)}
      </svg>;
    case 'ups':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x={3} y={4} width={18} height={16} rx={2} stroke={color} strokeWidth={sw} fill={color+'15'} />
        <path d="M13 8 L10 13 H13 L11 18" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </svg>;
    case 'ap_wifi':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <circle cx={12} cy={14} r={3} stroke={color} strokeWidth={sw} fill={color+'25'} />
        <path d="M6 10 Q12 4 18 10" stroke={color} strokeWidth={sw} fill="none" />
        <path d="M3 7 Q12 -1 21 7" stroke={color} strokeWidth={sw} fill="none" />
        <line x1={12} y1={17} x2={12} y2={22} stroke={color} strokeWidth={sw} />
      </svg>;
    case 'escalerilla':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <line x1={2} y1={8} x2={22} y2={8} stroke={color} strokeWidth={2} />
        <line x1={2} y1={16} x2={22} y2={16} stroke={color} strokeWidth={2} />
        {[5,9,13,17,21].map(x => <line key={x} x1={x} y1={8} x2={x} y2={16} stroke={color} strokeWidth={1.5} />)}
      </svg>;
    case 'conexion':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <line x1={3} y1={12} x2={21} y2={12} stroke={color} strokeWidth={2} strokeDasharray="4,2" />
        <circle cx={3} cy={12} r={2} fill={color} />
        <circle cx={21} cy={12} r={2} fill={color} />
      </svg>;
    case 'cable_utp':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <line x1={2} y1={12} x2={22} y2={12} stroke={color} strokeWidth={3} />
        <line x1={2} y1={9} x2={22} y2={9} stroke={color} strokeWidth={1} strokeOpacity={0.4} />
        <line x1={2} y1={15} x2={22} y2={15} stroke={color} strokeWidth={1} strokeOpacity={0.4} />
      </svg>;
    case 'nodo_utp':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <circle cx={12} cy={12} r={7} stroke={color} strokeWidth={sw} fill={color+'20'} />
        <circle cx={12} cy={12} r={3} fill={color} />
      </svg>;
    case 'trayecto_utp':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x={2} y={9} width={20} height={6} rx={1} stroke={color} strokeWidth={sw} fill={color+'20'} />
        {[6,10,14,18].map(x => <line key={x} x1={x} y1={9} x2={x} y2={15} stroke={color} strokeWidth={1} />)}
      </svg>;
    case 'marcador_infra':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M12 2 C8 2 5 5 5 9 C5 14 12 22 12 22 C12 22 19 14 19 9 C19 5 16 2 12 2Z" stroke={color} strokeWidth={sw} fill={color+'30'} />
        <circle cx={12} cy={9} r={3} stroke={color} strokeWidth={sw} fill={color} />
      </svg>;
    case 'area_zona':
      return <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x={3} y={3} width={18} height={18} rx={2} stroke={color} strokeWidth={sw} fill={color+'15'} strokeDasharray="4,2" />
      </svg>;
    default:
      return <div style={{ width: s, height: s, background: color, borderRadius: 4 }} />;
  }
}

// ─── Annotation SVG renderer ──────────────────────────────────────────────────
function AnnotationLayer({
  annotations, visible, scale,
}: { annotations: Annotation[]; visible: boolean; scale: number }) {
  if (!visible) return null;
  return (
    <>
      {annotations.map(ann => {
        if (!ann.points.length) return null;
        const sw = (ann.strokeWidth ?? 2) / scale;
        if (ann.type === 'marker') {
          const p = ann.points[0];
          return (
            <g key={ann.id}>
              <circle cx={p.x} cy={p.y} r={8/scale} fill={ann.color} opacity={0.85} />
              <circle cx={p.x} cy={p.y} r={4/scale} fill="#fff" opacity={0.9} />
            </g>
          );
        }
        if (ann.type === 'text' && ann.text) {
          const p = ann.points[0];
          return (
            <text key={ann.id} x={p.x} y={p.y}
              fontSize={(ann.fontSize ?? 14) / scale}
              fill={ann.color} fontWeight="600"
              style={{ fontFamily: 'Inter, sans-serif', paintOrder: 'stroke', stroke: 'white', strokeWidth: 2/scale }}>
              {ann.text}
            </text>
          );
        }
        if (ann.points.length >= 2) {
          const [p1, p2] = ann.points;
          if (ann.type === 'line' || ann.type === 'arrow') {
            return (
              <g key={ann.id}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke={ann.color} strokeWidth={sw} strokeLinecap="round" />
                {ann.type === 'arrow' && (
                  <polygon
                    points={`${p2.x},${p2.y} ${p2.x-8/scale},${p2.y-4/scale} ${p2.x-8/scale},${p2.y+4/scale}`}
                    fill={ann.color} />
                )}
              </g>
            );
          }
          if (ann.type === 'measure') {
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const dist = Math.sqrt(dx*dx + dy*dy).toFixed(1);
            const mx = (p1.x+p2.x)/2, my = (p1.y+p2.y)/2;
            return (
              <g key={ann.id}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke={ann.color} strokeWidth={sw} strokeDasharray={`${4/scale},${2/scale}`} />
                <circle cx={p1.x} cy={p1.y} r={3/scale} fill={ann.color} />
                <circle cx={p2.x} cy={p2.y} r={3/scale} fill={ann.color} />
                <text x={mx} y={my - 4/scale} textAnchor="middle"
                  fontSize={10/scale} fill={ann.color} fontWeight="700"
                  style={{ fontFamily: 'Inter, sans-serif', paintOrder: 'stroke', stroke: 'white', strokeWidth: 2/scale }}>
                  {dist}u
                </text>
              </g>
            );
          }
          if (ann.type === 'rect') {
            const x = Math.min(p1.x,p2.x), y = Math.min(p1.y,p2.y);
            const w = Math.abs(p2.x-p1.x), h = Math.abs(p2.y-p1.y);
            return <rect key={ann.id} x={x} y={y} width={w} height={h}
              stroke={ann.color} strokeWidth={sw} fill={ann.color+'18'} rx={2/scale} />;
          }
        }
        return null;
      })}
    </>
  );
}

// ─── Camera coverage cone renderer ───────────────────────────────────────────
function CameraElement({
  el, scale, isSelected, onSelect,
}: { el: InfraElement; scale: number; isSelected: boolean; onSelect: (id: string) => void }) {
  const sz = 28 / scale;
  const rotation = el.rotation ?? 0;
  const coverageAngle = el.coverageAngle ?? 90;
  const coverageDist = el.coverageDist ?? 80 / scale;

  // Compute cone path: starts at camera center, fans out
  const halfAngle = (coverageAngle / 2) * (Math.PI / 180);
  const rotRad = rotation * (Math.PI / 180);
  const cx = el.x, cy = el.y;

  // Two edge points of the cone
  const ax = cx + coverageDist * Math.cos(rotRad - halfAngle);
  const ay = cy + coverageDist * Math.sin(rotRad - halfAngle);
  const bx = cx + coverageDist * Math.cos(rotRad + halfAngle);
  const by = cy + coverageDist * Math.sin(rotRad + halfAngle);

  const largeArc = coverageAngle > 180 ? 1 : 0;
  const conePath = `M ${cx} ${cy} L ${ax} ${ay} A ${coverageDist} ${coverageDist} 0 ${largeArc} 1 ${bx} ${by} Z`;

  const fontSize = 9 / scale;

  return (
    <g key={el.id} onClick={() => onSelect(el.id)} style={{ cursor: 'pointer' }}>
      {/* Coverage cone */}
      <path d={conePath}
        fill={el.color + '25'}
        stroke={el.color + '60'}
        strokeWidth={0.8 / scale}
        strokeDasharray={`${3/scale},${2/scale}`}
      />
      {/* Camera body centered at el.x, el.y, rotated */}
      <g transform={`translate(${cx}, ${cy}) rotate(${rotation})`}>
        {/* Body */}
        <rect x={-sz*0.45} y={-sz*0.28} width={sz*0.7} height={sz*0.56}
          rx={sz*0.1} fill={el.color} stroke="#fff" strokeWidth={0.8/scale} />
        {/* Lens */}
        <circle cx={sz*0.28} cy={0} r={sz*0.2}
          fill="#1A1D2E" stroke={el.color} strokeWidth={0.8/scale} />
        <circle cx={sz*0.28} cy={0} r={sz*0.1} fill="#fff" opacity={0.6} />
        {/* Mount */}
        <rect x={-sz*0.15} y={sz*0.28} width={sz*0.3} height={sz*0.18}
          rx={sz*0.05} fill={el.color} opacity={0.7} />
        {/* Direction indicator */}
        <line x1={sz*0.45} y1={0} x2={sz*0.6} y2={0}
          stroke={el.color} strokeWidth={1/scale} opacity={0.8} />
      </g>
      {/* Selection ring */}
      {isSelected && (
        <circle cx={cx} cy={cy} r={sz*0.7}
          fill="none" stroke={el.color}
          strokeWidth={1.5/scale} strokeDasharray={`${3/scale},${2/scale}`}
          opacity={0.8} />
      )}
      {/* Label */}
      {el.label && (
        <text x={cx} y={cy + sz*0.75 + fontSize}
          fontSize={fontSize} fill={el.color} textAnchor="middle" fontWeight="700"
          style={{ fontFamily: 'Inter, sans-serif', paintOrder: 'stroke', stroke: 'white', strokeWidth: 2/scale }}>
          {el.label}
        </text>
      )}
    </g>
  );
}

// ─── Escalerilla (cable tray) renderer ───────────────────────────────────────
function EscalerillaElement({
  el, scale, isSelected, onSelect,
}: { el: InfraElement; scale: number; isSelected: boolean; onSelect: (id: string) => void }) {
  if (el.x2 === undefined || el.y2 === undefined) return null;
  const color = '#22C55E'; // verde fijo
  const sw = 2.5 / scale;
  const halfW = 5 / scale; // semi-ancho de la escalerilla

  const dx = el.x2 - el.x;
  const dy = el.y2 - el.y;
  const len = Math.sqrt(dx*dx + dy*dy);
  if (len < 1) return null;

  // Unit vector along the escalerilla
  const ux = dx / len, uy = dy / len;
  // Perpendicular
  const px = -uy, py = ux;

  // The two rails
  const r1x1 = el.x  + px*halfW, r1y1 = el.y  + py*halfW;
  const r1x2 = el.x2 + px*halfW, r1y2 = el.y2 + py*halfW;
  const r2x1 = el.x  - px*halfW, r2y1 = el.y  - py*halfW;
  const r2x2 = el.x2 - px*halfW, r2y2 = el.y2 - py*halfW;

  // Rungs (cross bars) evenly spaced
  const rungSpacing = 12 / scale;
  const numRungs = Math.max(2, Math.floor(len / rungSpacing));
  const rungs: React.ReactElement[] = [];
  for (let i = 0; i <= numRungs; i++) {
    const t = i / numRungs;
    const rx = el.x + dx * t;
    const ry = el.y + dy * t;
    rungs.push(
      <line key={i}
        x1={rx + px*halfW} y1={ry + py*halfW}
        x2={rx - px*halfW} y2={ry - py*halfW}
        stroke={color} strokeWidth={sw*0.7} strokeLinecap="round" />
    );
  }

  return (
    <g key={el.id} onClick={() => onSelect(el.id)} style={{ cursor: 'pointer' }}>
      {/* Invisible wider hit area */}
      <line x1={el.x} y1={el.y} x2={el.x2} y2={el.y2}
        stroke="transparent" strokeWidth={16/scale} />
      {/* Rail 1 */}
      <line x1={r1x1} y1={r1y1} x2={r1x2} y2={r1y2}
        stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {/* Rail 2 */}
      <line x1={r2x1} y1={r2y1} x2={r2x2} y2={r2y2}
        stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {/* Rungs */}
      {rungs}
      {/* Selection highlight */}
      {isSelected && <>
        <circle cx={el.x} cy={el.y} r={5/scale} fill={color} opacity={0.8} />
        <circle cx={el.x2} cy={el.y2} r={5/scale} fill={color} opacity={0.8} />
      </>}
    </g>
  );
}

// ─── InfraElement SVG renderer ────────────────────────────────────────────────
function InfraElementsLayer({
  elements, visible, scale, selectedId, onSelect,
}: {
  elements: InfraElement[];
  visible: (id: string) => boolean;
  scale: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {elements.map(el => {
        if (!visible(el.layerId)) return null;
        const sz = 26 / scale;
        const fontSize = 9 / scale;
        const isSelected = selectedId === el.id;

        // ── Cámara con rotación y cono de cobertura ───────────────────────
        if (el.type === 'camara') {
          return <CameraElement key={el.id} el={el} scale={scale} isSelected={isSelected} onSelect={onSelect} />;
        }

        // ── Escalerilla verde con forma de escalera ───────────────────────
        if (el.type === 'escalerilla') {
          return <EscalerillaElement key={el.id} el={el} scale={scale} isSelected={isSelected} onSelect={onSelect} />;
        }

        if (el.x2 !== undefined && el.y2 !== undefined) {
          const isArea = el.type === 'area_zona';
          if (isArea) {
            const x = Math.min(el.x, el.x2), y = Math.min(el.y, el.y2);
            const w = Math.abs(el.x2 - el.x), h = Math.abs(el.y2 - el.y);
            return (
              <g key={el.id} onClick={() => onSelect(el.id)} style={{ cursor: 'pointer' }}>
                <rect x={x} y={y} width={w} height={h} rx={4/scale}
                  stroke={el.color} strokeWidth={1.5/scale}
                  fill={el.color+'18'} strokeDasharray={`${4/scale},${2/scale}`} />
                {isSelected && <rect x={x-2/scale} y={y-2/scale} width={w+4/scale} height={h+4/scale}
                  rx={6/scale} fill="none" stroke="#4361EE" strokeWidth={1.5/scale} />}
                {el.label && <text x={x+w/2} y={y+h/2} textAnchor="middle" fontSize={fontSize*1.2}
                  fill={el.color} fontWeight="700" style={{ fontFamily: 'Inter, sans-serif' }}>{el.label}</text>}
              </g>
            );
          }
          return (
            <g key={el.id} onClick={() => onSelect(el.id)} style={{ cursor: 'pointer' }}>
              <line x1={el.x} y1={el.y} x2={el.x2} y2={el.y2}
                stroke={el.color} strokeWidth={2.5/scale} />
              {isSelected && <>
                <circle cx={el.x} cy={el.y} r={4/scale} fill={el.color} />
                <circle cx={el.x2} cy={el.y2} r={4/scale} fill={el.color} />
              </>}
            </g>
          );
        }

        return (
          <g key={el.id}
            transform={`translate(${el.x - sz/2}, ${el.y - sz/2})`}
            onClick={() => onSelect(el.id)}
            style={{ cursor: 'pointer' }}>
            {isSelected && (
              <rect x={-4/scale} y={-4/scale} width={sz+8/scale} height={sz+8/scale}
                rx={6/scale} fill={el.color+'20'}
                stroke={el.color} strokeWidth={1.5/scale} strokeDasharray={`${3/scale},${2/scale}`} />
            )}
            <foreignObject x={0} y={0} width={sz} height={sz}>
              <div style={{ width: sz, height: sz, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <InfraSymbol type={el.type} color={el.color} size={sz} />
              </div>
            </foreignObject>
            {el.label && (
              <text x={sz/2} y={sz + fontSize + 2/scale}
                fontSize={fontSize} fill={el.color} textAnchor="middle" fontWeight="700"
                style={{ fontFamily: 'Inter, sans-serif', paintOrder: 'stroke', stroke: 'white', strokeWidth: 2/scale }}>
                {el.label}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

// ─── Plan Areas SVG renderer ──────────────────────────────────────────────────
function PlanAreasLayer({
  areas, scale, selectedId, onSelect,
}: {
  areas: PlanArea[];
  scale: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {areas.map(area => {
        const isSelected = selectedId === area.id;
        return (
          <g key={area.id} onClick={() => onSelect(area.id)} style={{ cursor: 'pointer' }}>
            <rect
              x={area.x} y={area.y} width={area.w} height={area.h}
              rx={6/scale}
              stroke={area.color}
              strokeWidth={isSelected ? 2.5/scale : 1.5/scale}
              fill={area.color + '12'}
              strokeDasharray={`${8/scale},${4/scale}`}
            />
            {isSelected && (
              <rect
                x={area.x - 3/scale} y={area.y - 3/scale}
                width={area.w + 6/scale} height={area.h + 6/scale}
                rx={8/scale} fill="none"
                stroke={area.color} strokeWidth={1/scale} opacity={0.4}
              />
            )}
            {/* Label badge */}
            <rect
              x={area.x + 4/scale} y={area.y + 4/scale}
              width={area.name.length * 6.5/scale + 12/scale} height={16/scale}
              rx={4/scale} fill={area.color} opacity={0.85}
            />
            <text
              x={area.x + 10/scale} y={area.y + 15/scale}
              fontSize={9/scale} fill="#fff" fontWeight="700"
              style={{ fontFamily: 'Inter, sans-serif' }}>
              {area.name}
            </text>
            {/* Resize handle (bottom-right) */}
            {isSelected && (
              <rect
                x={area.x + area.w - 8/scale} y={area.y + area.h - 8/scale}
                width={8/scale} height={8/scale}
                rx={2/scale} fill={area.color} opacity={0.9}
                style={{ cursor: 'se-resize' }}
              />
            )}
          </g>
        );
      })}
    </>
  );
}

// ─── Calibration line renderer ────────────────────────────────────────────────
function CalibrationLine({
  p1, p2, scale, realDist,
}: {
  p1: { x: number; y: number };
  p2: { x: number; y: number } | null;
  scale: number;
  realDist?: number;
}) {
  if (!p2) {
    return <circle cx={p1.x} cy={p1.y} r={5/scale} fill="#F59E0B" stroke="#fff" strokeWidth={1.5/scale} />;
  }
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const pxDist = Math.sqrt(dx*dx + dy*dy).toFixed(1);
  return (
    <g>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke="#F59E0B" strokeWidth={2/scale} strokeDasharray={`${5/scale},${3/scale}`} />
      <circle cx={p1.x} cy={p1.y} r={5/scale} fill="#F59E0B" stroke="#fff" strokeWidth={1.5/scale} />
      <circle cx={p2.x} cy={p2.y} r={5/scale} fill="#F59E0B" stroke="#fff" strokeWidth={1.5/scale} />
      {/* Tick marks */}
      <line x1={p1.x} y1={p1.y - 8/scale} x2={p1.x} y2={p1.y + 8/scale}
        stroke="#F59E0B" strokeWidth={1.5/scale} />
      <line x1={p2.x} y1={p2.y - 8/scale} x2={p2.x} y2={p2.y + 8/scale}
        stroke="#F59E0B" strokeWidth={1.5/scale} />
      <rect x={mx - 28/scale} y={my - 12/scale} width={56/scale} height={16/scale}
        rx={4/scale} fill="#1A1D2E" opacity={0.85} />
      <text x={mx} y={my - 1/scale} textAnchor="middle"
        fontSize={9/scale} fill="#F59E0B" fontWeight="700"
        style={{ fontFamily: 'Inter, sans-serif' }}>
        {realDist ? `${realDist}m` : `${pxDist}px`}
      </text>
    </g>
  );
}

// ─── Main Viewer ──────────────────────────────────────────────────────────────
export default function PlanosViewer({
  fileUrl, fileName = 'Plano', building = '', floor = '', scale: scaleProp = '1:100', onSave,
}: PlanosViewerProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef    = useRef<any>(null);

  const [zoom, setZoom]         = useState(1);
  const [pan, setPan]           = useState({ x: 0, y: 0 });
  const [page, setPage]         = useState(1);
  const [totalPages, setTotal]  = useState(1);
  const [loading, setLoading]   = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

  // Layers
  const [layers, setLayers]         = useState<Layer[]>(DEFAULT_LAYERS);
  const [activeLayer, setActiveLayer] = useState('general');
  const [activeTool, setActiveTool]   = useState<AnnotationType | 'pan' | 'select' | 'area' | 'calibrate'>('select');
  const [activeColor, setActiveColor] = useState<LayerColor>('#EF4444');
  const [drawing, setDrawing]         = useState(false);
  const [currentAnn, setCurrentAnn]   = useState<Annotation | null>(null);
  const [textInput, setTextInput]     = useState('');
  const [showTextModal, setShowTextModal] = useState(false);
  const [textPos, setTextPos]         = useState({ x: 0, y: 0 });

  // Infra elements
  const [infraElements, setInfraElements] = useState<InfraElement[]>([]);
  const [activeInfraTool, setActiveInfraTool] = useState<InfraElementType | null>(null);
  const [infraLineStart, setInfraLineStart]   = useState<{ x: number; y: number } | null>(null);
  const [mousePos, setMousePos]               = useState({ x: 0, y: 0 });
  const [selectedInfraId, setSelectedInfraId] = useState<string | null>(null);
  const [labelModal, setLabelModal]           = useState(false);
  const [labelInput, setLabelInput]           = useState('');
  const [pendingInfra, setPendingInfra]       = useState<Partial<InfraElement> | null>(null);
  const [infraCount, setInfraCount]           = useState<Record<string, number>>({});

  // ── DRAG element state ────────────────────────────────────────────────────
  const dragState = useRef<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    startElX: number;
    startElY: number;
    isLine: boolean;
    startElX2?: number;
    startElY2?: number;
  } | null>(null);

  // ── PLAN AREAS ────────────────────────────────────────────────────────────
  const [planAreas, setPlanAreas]           = useState<PlanArea[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [areaDrawStart, setAreaDrawStart]   = useState<{ x: number; y: number } | null>(null);
  const [areaDrawCurrent, setAreaDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [areaNameModal, setAreaNameModal]   = useState(false);
  const [pendingArea, setPendingArea]       = useState<Omit<PlanArea,'id'|'name'> | null>(null);
  const [areaNameInput, setAreaNameInput]   = useState('');
  const [areaColorIdx, setAreaColorIdx]     = useState(0);
  // Area drag
  const areaDragState = useRef<{
    id: string;
    startMx: number; startMy: number;
    startX: number; startY: number;
  } | null>(null);

  // ── CALIBRATION ───────────────────────────────────────────────────────────
  const [calibP1, setCalibP1]           = useState<{ x: number; y: number } | null>(null);
  const [calibP2, setCalibP2]           = useState<{ x: number; y: number } | null>(null);
  const [calibModal, setCalibModal]     = useState(false);
  const [calibRealDist, setCalibRealDist] = useState('');
  const [calibUnit, setCalibUnit]       = useState<'m' | 'cm' | 'ft'>('m');
  const [calibResult, setCalibResult]   = useState<string | null>(null); // computed scale string

  // UI
  const [showLayerPanel, setShowLayerPanel]     = useState(false);
  const [fullscreen, setFullscreen]             = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [annotCount, setAnnotCount]             = useState(0);

  const panStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  // ── Load PDF ──────────────────────────────────────────────────────────────
  const renderPage = useCallback(async (doc: any, pageNum: number, z: number) => {
    if (!canvasRef.current) return;
    const pdfPage = await doc.getPage(pageNum);
    const viewport = pdfPage.getViewport({ scale: z * 1.5 });
    const canvas = canvasRef.current;
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    setCanvasSize({ w: viewport.width, h: viewport.height });
    const ctx = canvas.getContext('2d')!;
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  }, []);

  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const loadingTask = pdfjsLib.getDocument({
          url: fileUrl,
          rangeChunkSize: 65536,
          disableAutoFetch: false,
          disableStream: false,
        });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setTotal(doc.numPages);
        setPage(1);
        await renderPage(doc, 1, zoom);
      } catch (e) { console.error('PDF load error:', e); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [fileUrl]);

  useEffect(() => {
    if (!pdfDocRef.current) return;
    renderPage(pdfDocRef.current, page, zoom);
  }, [page, zoom]);

  useEffect(() => {
    setAnnotCount(layers.reduce((a, l) => a + l.annotations.length, 0));
  }, [layers]);

  // ── Coordinate transform ──────────────────────────────────────────────────
  const svgCoords = (e: RMouseEvent): { x: number; y: number } => {
    // El SVG está dentro del div que ya aplica translate(pan.x, pan.y),
    // por lo que getBoundingClientRect() ya incluye el pan.
    // Solo necesitamos convertir de píxeles CSS a coordenadas SVG (viewBox).
    const rect = svgRef.current!.getBoundingClientRect();
    // El SVG tiene width=canvasSize.w px en pantalla pero viewBox de ancho canvasSize.w/(zoom*1.5)
    // => factor de escala = viewBox.width / rect.width = 1/(zoom*1.5)
    const scaleX = (canvasSize.w / (zoom * 1.5)) / rect.width;
    const scaleY = (canvasSize.h / (zoom * 1.5)) / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  };

  // ── Hit-test: is the click on an existing infra element? ──────────────────
  const hitTestInfraElement = (pt: { x: number; y: number }): string | null => {
    const scale = zoom * 1.5;
    const sz = 26 / scale;
    const hitRadius = sz * 0.8;
    // Check in reverse order (top elements first)
    for (let i = infraElements.length - 1; i >= 0; i--) {
      const el = infraElements[i];
      if (el.x2 !== undefined && el.y2 !== undefined) {
        // Line element: check proximity to line segment
        const dx = el.x2 - el.x, dy = el.y2 - el.y;
        const len2 = dx*dx + dy*dy;
        if (len2 === 0) continue;
        const t = Math.max(0, Math.min(1, ((pt.x - el.x)*dx + (pt.y - el.y)*dy) / len2));
        const nearX = el.x + t*dx, nearY = el.y + t*dy;
        const dist = Math.sqrt((pt.x-nearX)**2 + (pt.y-nearY)**2);
        if (dist < 8/scale) return el.id;
      } else {
        // Point element
        const dist = Math.sqrt((pt.x - el.x)**2 + (pt.y - el.y)**2);
        if (dist < hitRadius) return el.id;
      }
    }
    return null;
  };

  // ── Hit-test: is the click on an existing plan area? ─────────────────────
  const hitTestArea = (pt: { x: number; y: number }): string | null => {
    for (let i = planAreas.length - 1; i >= 0; i--) {
      const a = planAreas[i];
      if (pt.x >= a.x && pt.x <= a.x + a.w && pt.y >= a.y && pt.y <= a.y + a.h) {
        return a.id;
      }
    }
    return null;
  };

  // ── Generate label ────────────────────────────────────────────────────────
  const genLabel = (type: InfraElementType): string => {
    const count = (infraCount[type] || 0) + 1;
    const prefix: Record<string, string> = {
      camara: 'CAM', lector: 'LEC', controladora: 'CTRL', puerta: 'PTA',
      sensor: 'SEN', bocina: 'BOC', idf_mdf: 'IDF', rack: 'RCK',
      servidor: 'SRV', patch_panel: 'PP', switch_net: 'SW', ups: 'UPS',
      ap_wifi: 'AP', nodo_utp: 'NUD', marcador_infra: 'MRK', escalerilla: 'ESC',
      cable_utp: 'UTP', conexion: 'CON', trayecto_utp: 'TRY', area_zona: 'ZONA',
    };
    return `${prefix[type] || type.toUpperCase().slice(0,3)}${String(count).padStart(3,'0')}`;
  };

  const getInfraTool = (type: InfraElementType): InfraTool | undefined => {
    for (const cat of INFRA_CATEGORIES) {
      const t = cat.tools.find(t => t.id === type);
      if (t) return t;
    }
    return undefined;
  };

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const handleMouseDown = (e: RMouseEvent) => {
    if (e.button !== 0) return;
    const pt = svgCoords(e);

    // ── CALIBRATION mode ─────────────────────────────────────────────────
    if (activeTool === 'calibrate') {
      if (!calibP1) {
        setCalibP1(pt);
      } else if (!calibP2) {
        setCalibP2(pt);
        setCalibModal(true);
      }
      return;
    }

    // ── AREA drawing mode ─────────────────────────────────────────────────
    if (activeTool === 'area' && !activeInfraTool) {
      // Check if clicking an existing area (to drag it)
      const hitId = hitTestArea(pt);
      if (hitId) {
        const area = planAreas.find(a => a.id === hitId)!;
        setSelectedAreaId(hitId);
        areaDragState.current = { id: hitId, startMx: e.clientX, startMy: e.clientY, startX: area.x, startY: area.y };
        return;
      }
      setAreaDrawStart(pt);
      setAreaDrawCurrent(pt);
      return;
    }

    // ── SELECT mode — try to drag an existing infra element ──────────────
    if (activeTool === 'select' && !activeInfraTool) {
      const hitId = hitTestInfraElement(pt);
      if (hitId) {
        const el = infraElements.find(e => e.id === hitId)!;
        setSelectedInfraId(hitId);
        dragState.current = {
          id: hitId,
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          startElX: el.x,
          startElY: el.y,
          isLine: el.x2 !== undefined,
          startElX2: el.x2,
          startElY2: el.y2,
        };
        return;
      }
      // Click on empty area — deselect and start pan
      setSelectedInfraId(null);
      setSelectedAreaId(null);
      panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      return;
    }

    // ── PAN mode ─────────────────────────────────────────────────────────
    if (activeTool === 'pan' && !activeInfraTool) {
      panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      return;
    }

    // ── INFRA TOOL insertion ──────────────────────────────────────────────
    if (activeInfraTool) {
      const toolDef = getInfraTool(activeInfraTool);
      if (!toolDef) return;

      if (toolDef.isLine) {
        if (!infraLineStart) {
          setInfraLineStart(pt);
        } else {
          const newEl: InfraElement = {
            id: `inf_${Date.now()}`,
            type: activeInfraTool,
            layerId: toolDef.layerId,
            x: infraLineStart.x, y: infraLineStart.y,
            x2: pt.x, y2: pt.y,
            label: genLabel(activeInfraTool),
            color: toolDef.color,
          };
          setInfraElements(prev => [...prev, newEl]);
          setInfraCount(prev => ({ ...prev, [activeInfraTool]: (prev[activeInfraTool] || 0) + 1 }));
          setInfraLineStart(null);
        }
        return;
      }

      const needsLabel = ['camara','lector','controladora','idf_mdf','rack','servidor','ap_wifi','nodo_utp','marcador_infra'].includes(activeInfraTool);
      const label = genLabel(activeInfraTool);
      if (needsLabel) {
        setPendingInfra({ type: activeInfraTool, layerId: toolDef.layerId, x: pt.x, y: pt.y, color: toolDef.color });
        setLabelInput(label);
        setLabelModal(true);
      } else {
        const newEl: InfraElement = {
          id: `inf_${Date.now()}`,
          type: activeInfraTool, layerId: toolDef.layerId,
          x: pt.x, y: pt.y, label, color: toolDef.color,
        };
        setInfraElements(prev => [...prev, newEl]);
        setInfraCount(prev => ({ ...prev, [activeInfraTool]: (prev[activeInfraTool] || 0) + 1 }));
      }
      return;
    }

    // ── Annotation tools ──────────────────────────────────────────────────
    if (activeTool === 'text') {
      setTextPos(pt);
      setShowTextModal(true);
      return;
    }
    const annType = activeTool as AnnotationType;
    if (['marker','line','measure','rect','arrow'].includes(annType)) {
      const newAnn: Annotation = {
        id: `ann-${Date.now()}`,
        layerId: activeLayer, type: annType, color: activeColor,
        points: [pt], strokeWidth: 2,
      };
      setCurrentAnn(newAnn);
      setDrawing(true);
    }
  };

  const handleMouseMove = (e: RMouseEvent) => {
    const pt = svgCoords(e);
    setMousePos(pt);

    // Drag infra element
    if (dragState.current) {
      const ds = dragState.current;
      const dxPx = e.clientX - ds.startMouseX;
      const dyPx = e.clientY - ds.startMouseY;
      // El canvas está renderizado a zoom*1.5 (factor de calidad del PDF)
      const dxSvg = dxPx / (zoom * 1.5);
      const dySvg = dyPx / (zoom * 1.5);
      setInfraElements(prev => prev.map(el => {
        if (el.id !== ds.id) return el;
        if (ds.isLine && ds.startElX2 !== undefined && ds.startElY2 !== undefined) {
          return { ...el, x: ds.startElX + dxSvg, y: ds.startElY + dySvg, x2: ds.startElX2 + dxSvg, y2: ds.startElY2 + dySvg };
        }
        return { ...el, x: ds.startElX + dxSvg, y: ds.startElY + dySvg };
      }));
      return;
    }

    // Drag area
    if (areaDragState.current) {
      const ds = areaDragState.current;
      const dxPx = e.clientX - ds.startMx;
      const dyPx = e.clientY - ds.startMy;
      const dxSvg = dxPx / (zoom * 1.5);
      const dySvg = dyPx / (zoom * 1.5);
      setPlanAreas(prev => prev.map(a =>
        a.id === ds.id ? { ...a, x: ds.startX + dxSvg, y: ds.startY + dySvg } : a
      ));
      return;
    }

    // Pan canvas
    if (panStart.current) {
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.mx),
        y: panStart.current.py + (e.clientY - panStart.current.my),
      });
      return;
    }

    // Area drawing preview
    if (activeTool === 'area' && areaDrawStart) {
      setAreaDrawCurrent(pt);
      return;
    }

    // Annotation drawing
    if (!drawing || !currentAnn) return;
    if (currentAnn.type === 'marker') return;
    setCurrentAnn(prev => prev ? { ...prev, points: [prev.points[0], pt] } : prev);
  };

  const handleMouseUp = (e: RMouseEvent) => {
    // Finish element drag
    if (dragState.current) {
      dragState.current = null;
      return;
    }

    // Finish area drag
    if (areaDragState.current) {
      areaDragState.current = null;
      return;
    }

    panStart.current = null;

    // Finish area drawing
    if (activeTool === 'area' && areaDrawStart && areaDrawCurrent) {
      const x = Math.min(areaDrawStart.x, areaDrawCurrent.x);
      const y = Math.min(areaDrawStart.y, areaDrawCurrent.y);
      const w = Math.abs(areaDrawCurrent.x - areaDrawStart.x);
      const h = Math.abs(areaDrawCurrent.y - areaDrawStart.y);
      if (w > 10 && h > 10) {
        setPendingArea({ x, y, w, h, color: AREA_COLORS[areaColorIdx % AREA_COLORS.length] });
        setAreaNameInput(`Área ${planAreas.length + 1}`);
        setAreaNameModal(true);
      }
      setAreaDrawStart(null);
      setAreaDrawCurrent(null);
      return;
    }

    // Finish annotation
    if (!drawing || !currentAnn) return;
    setDrawing(false);
    if (currentAnn.points.length >= 1) {
      setLayers(prev => prev.map(l =>
        l.id === activeLayer ? { ...l, annotations: [...l.annotations, currentAnn] } : l
      ));
    }
    setCurrentAnn(null);
  };

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.min(5, Math.max(0.2, +(z + delta).toFixed(2))));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── Confirm area name ─────────────────────────────────────────────────────
  const confirmArea = () => {
    if (!pendingArea) return;
    const newArea: PlanArea = {
      id: `area_${Date.now()}`,
      name: areaNameInput.trim() || `Área ${planAreas.length + 1}`,
      ...pendingArea,
    };
    setPlanAreas(prev => [...prev, newArea]);
    setAreaColorIdx(i => i + 1);
    setAreaNameModal(false);
    setPendingArea(null);
    setAreaNameInput('');
  };

  // ── Confirm calibration ───────────────────────────────────────────────────
  const confirmCalibration = () => {
    if (!calibP1 || !calibP2 || !calibRealDist) return;
    const realVal = parseFloat(calibRealDist);
    if (isNaN(realVal) || realVal <= 0) return;
    const dx = calibP2.x - calibP1.x, dy = calibP2.y - calibP1.y;
    const pxDist = Math.sqrt(dx*dx + dy*dy);
    // Convert real distance to meters
    const realM = calibUnit === 'cm' ? realVal / 100 : calibUnit === 'ft' ? realVal * 0.3048 : realVal;
    const pxPerMeter = pxDist / realM;
    const scaleNum = Math.round(pxPerMeter);
    setCalibResult(`1:${scaleNum} (${pxPerMeter.toFixed(1)} px/m)`);
    setCalibModal(false);
    setCalibRealDist('');
  };

  const resetCalibration = () => {
    setCalibP1(null);
    setCalibP2(null);
    setCalibResult(null);
    setCalibRealDist('');
  };

  const confirmInfraInsert = () => {
    if (!pendingInfra) return;
    const newEl: InfraElement = {
      id: `inf_${Date.now()}`,
      type: pendingInfra.type!, layerId: pendingInfra.layerId!,
      x: pendingInfra.x!, y: pendingInfra.y!,
      label: labelInput, color: pendingInfra.color!,
    };
    setInfraElements(prev => [...prev, newEl]);
    setInfraCount(prev => ({ ...prev, [newEl.type]: (prev[newEl.type] || 0) + 1 }));
    setLabelModal(false);
    setPendingInfra(null);
    setLabelInput('');
  };

  const addTextAnnotation = () => {
    if (!textInput.trim()) { setShowTextModal(false); return; }
    const ann: Annotation = {
      id: `ann-${Date.now()}`, layerId: activeLayer, type: 'text',
      color: activeColor, points: [textPos], text: textInput, fontSize: 14,
    };
    setLayers(prev => prev.map(l =>
      l.id === activeLayer ? { ...l, annotations: [...l.annotations, ann] } : l
    ));
    setTextInput('');
    setShowTextModal(false);
  };

  const clearLayer = (layerId: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, annotations: [] } : l));
  };

  const toggleLayer = (layerId: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l));
  };

  const deleteSelectedInfra = () => {
    if (!selectedInfraId) return;
    setInfraElements(prev => prev.filter(el => el.id !== selectedInfraId));
    setSelectedInfraId(null);
  };

  const deleteSelectedArea = () => {
    if (!selectedAreaId) return;
    setPlanAreas(prev => prev.filter(a => a.id !== selectedAreaId));
    setSelectedAreaId(null);
  };

  const isLayerVisible = (id: string) => {
    const l = layers.find(l => l.id === id);
    return l?.visible !== false;
  };

  // ── Export PDF ────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!canvasRef.current) return;
    const { jsPDF } = await import('jspdf');
    const canvas = canvasRef.current;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
      unit: 'px', format: [canvas.width, canvas.height],
    });
    pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
    pdf.save(`${fileName.replace(/\s+/g,'_')}_anotado.pdf`);
  };

  const printPlan = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>${fileName}</title>
      <style>body{margin:0} img{width:100%;height:auto} @media print{body{margin:0}}</style>
      </head><body><img src="${dataUrl}" />
      <script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
    win.document.close();
  };

  const zoomIn  = () => setZoom(z => Math.min(5, +(z+0.25).toFixed(2)));
  const zoomOut = () => setZoom(z => Math.max(0.2, +(z-0.25).toFixed(2)));
  const resetView = () => { setZoom(1); setPan({ x:0, y:0 }); };

  const DRAW_TOOLS: { id: AnnotationType | 'pan' | 'select' | 'area' | 'calibrate'; label: string; icon: any; title?: string }[] = [
    { id: 'select',    label: 'Seleccionar', icon: Move,      title: 'Seleccionar y mover elementos (S)' },
    { id: 'pan',       label: 'Mover Plano', icon: Move,      title: 'Mover el plano (H)' },
    { id: 'marker',    label: 'Marcador',    icon: MapPin,    title: 'Marcador de punto' },
    { id: 'line',      label: 'Línea',       icon: Minus,     title: 'Trazar línea' },
    { id: 'text',      label: 'Texto',       icon: Type,      title: 'Agregar texto' },
    { id: 'measure',   label: 'Medir',       icon: Ruler,     title: 'Medir distancia' },
    { id: 'rect',      label: 'Rectángulo',  icon: Maximize2, title: 'Dibujar rectángulo' },
    { id: 'area',      label: 'Área',        icon: Scissors,  title: 'Definir área/zona con nombre' },
    { id: 'calibrate', label: 'Calibrar',    icon: Crosshair, title: 'Calibrar escala del plano' },
  ];

  const activeLayerObj = layers.find(l => l.id === activeLayer);

  const getCursor = () => {
    if (dragState.current) return 'grabbing';
    if (areaDragState.current) return 'grabbing';
    if (activeTool === 'calibrate') return calibP1 && !calibP2 ? 'crosshair' : 'cell';
    if (activeTool === 'area') return areaDrawStart ? 'crosshair' : 'copy';
    if (activeTool === 'select') return 'default';
    if (activeInfraTool) return infraLineStart ? 'crosshair' : 'cell';
    if (activeTool === 'pan') return panStart.current ? 'grabbing' : 'grab';
    return 'crosshair';
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: fullscreen ? '100vh' : 'calc(100vh - 140px)',
      background: 'var(--surface, #fff)',
      border: '1px solid var(--border-light, #E8EBF4)',
      borderRadius: fullscreen ? 0 : 16,
      overflow: 'hidden',
      position: fullscreen ? 'fixed' : 'relative',
      top: fullscreen ? 0 : undefined, left: fullscreen ? 0 : undefined,
      right: fullscreen ? 0 : undefined, bottom: fullscreen ? 0 : undefined,
      zIndex: fullscreen ? 9999 : undefined,
      fontFamily: 'Inter, sans-serif',
    }}>

      {/* ── Top toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '8px 14px',
        borderBottom: '1px solid var(--border-light, #E8EBF4)',
        background: 'var(--surface-2, #F4F5FB)',
        flexShrink: 0,
      }}>
        {/* Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--surface,#fff)', border: '1px solid var(--border,#DDE0EE)', borderRadius: 8, padding: '2px 4px' }}>
          <button onClick={zoomOut} style={btnStyle}><ZoomOut size={14} /></button>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-1,#1A1D2E)', minWidth: 38, textAlign: 'center' }}>
            {Math.round(zoom*100)}%
          </span>
          <button onClick={zoomIn} style={btnStyle}><ZoomIn size={14} /></button>
          <button onClick={resetView} style={btnStyle} title="Reset"><RotateCcw size={12} /></button>
        </div>

        <div style={dividerStyle} />

        {/* Draw tools */}
        {DRAW_TOOLS.map(t => {
          const Icon = t.icon;
          const isActive = !activeInfraTool && activeTool === t.id;
          // Special styling for new tools
          const isArea = t.id === 'area';
          const isCalib = t.id === 'calibrate';
          const isSelect = t.id === 'select';
          const accentColor = isArea ? '#10B981' : isCalib ? '#F59E0B' : isSelect ? '#4361EE' : '#4361EE';
          return (
            <button key={t.id}
              onClick={() => {
                setActiveTool(t.id as any);
                setActiveInfraTool(null);
                setInfraLineStart(null);
                if (t.id !== 'calibrate') { setCalibP1(null); setCalibP2(null); }
                if (t.id !== 'area') { setAreaDrawStart(null); setAreaDrawCurrent(null); }
              }}
              title={t.title || t.label}
              style={{
                ...btnStyle,
                background: isActive ? `${accentColor}18` : 'transparent',
                color: isActive ? accentColor : 'var(--text-2,#5C6194)',
                border: isActive ? `1px solid ${accentColor}40` : '1px solid transparent',
                borderRadius: 7, padding: '5px 9px',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: '0.78rem', fontWeight: isActive ? 600 : 400,
              }}>
              <Icon size={13} />
              {(isArea || isCalib || isSelect) && <span style={{ fontSize: '0.72rem' }}>{t.label}</span>}
            </button>
          );
        })}

        <div style={dividerStyle} />

        {/* Active layer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3,#9EA3C8)' }}>Capa:</span>
          <div style={{ position: 'relative' }}>
            <select value={activeLayer} onChange={e => setActiveLayer(e.target.value)}
              style={{
                background: 'var(--surface,#fff)', border: '1px solid var(--border,#DDE0EE)',
                borderRadius: 7, padding: '4px 28px 4px 10px',
                fontSize: '0.78rem', fontWeight: 600,
                color: activeLayerObj?.color ?? 'var(--text-1)',
                cursor: 'pointer', appearance: 'none', fontFamily: 'Inter, sans-serif',
              }}>
              {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <ChevronDown size={11} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-3)' }} />
          </div>
        </div>

        <div style={dividerStyle} />

        {/* Layer visibility pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3,#9EA3C8)' }}>Mostrar:</span>
          {layers.map(l => (
            <button key={l.id} onClick={() => toggleLayer(l.id)} title={`${l.visible ? 'Ocultar' : 'Mostrar'} ${l.name}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 20,
                border: `1px solid ${l.color}40`,
                background: l.visible ? `${l.color}18` : 'transparent',
                color: l.visible ? l.color : 'var(--text-3,#9EA3C8)',
                fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                opacity: l.visible ? 1 : 0.5,
              }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
              {l.annotations.length + infraElements.filter(el => el.layerId === l.id).length}
            </button>
          ))}
        </div>

        <div style={dividerStyle} />

        {/* Color */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3,#9EA3C8)' }}>Color:</span>
          {TOOL_COLORS.map(c => (
            <button key={c} onClick={() => setActiveColor(c)}
              style={{
                width: 18, height: 18, borderRadius: '50%', background: c,
                border: activeColor === c ? '2px solid var(--text-1,#1A1D2E)' : '2px solid transparent',
                cursor: 'pointer', padding: 0,
                boxShadow: activeColor === c ? '0 0 0 2px rgba(0,0,0,0.15)' : 'none',
              }} />
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Page nav */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setPage(p => Math.max(1,p-1))} style={btnStyle} disabled={page<=1}><ChevronLeft size={13} /></button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', minWidth: 60, textAlign: 'center' }}>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages,p+1))} style={btnStyle} disabled={page>=totalPages}><ChevronRight size={13} /></button>
          </div>
        )}

        {/* Actions */}
        {selectedInfraId && (
          <button onClick={deleteSelectedInfra} style={actionBtnStyle('#EF4444')}>
            <Trash2 size={13} /> Eliminar
          </button>
        )}
        {selectedAreaId && (
          <button onClick={deleteSelectedArea} style={actionBtnStyle('#EF4444')}>
            <Trash2 size={13} /> Eliminar Área
          </button>
        )}
        <button onClick={() => onSave?.(layers)} style={actionBtnStyle('#4361EE')}><Save size={13} /> Guardar</button>
        <button onClick={exportPDF} style={actionBtnStyle('#10B981')}><FileDown size={13} /> Exportar PDF</button>
        <button onClick={printPlan} style={actionBtnStyle('#F59E0B')}><Printer size={13} /> Imprimir</button>
        <button onClick={() => clearLayer(activeLayer)} style={actionBtnStyle('#EF4444')}><Trash2 size={13} /> Limpiar</button>
        <button onClick={() => setFullscreen(f => !f)} style={btnStyle}>
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* ── Info bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 14px',
        borderBottom: '1px solid var(--border-light, #E8EBF4)',
        background: 'var(--surface, #fff)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {building && <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Edificio: <b style={{ color: 'var(--text-2)' }}>{building}</b></span>}
          {floor    && <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Piso: <b style={{ color: 'var(--text-2)' }}>{floor}</b></span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
            Escala: <b style={{ color: calibResult ? '#F59E0B' : 'var(--text-2)' }}>{calibResult ?? scaleProp}</b>
            {calibResult && (
              <button onClick={resetCalibration} style={{ ...btnStyle, padding: '1px 4px', fontSize: '0.65rem', marginLeft: 4, color: '#EF4444' }}>✕</button>
            )}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Anotaciones: <b style={{ color: '#4361EE' }}>{annotCount}</b></span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Elementos: <b style={{ color: '#10B981' }}>{infraElements.length}</b></span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Áreas: <b style={{ color: '#8B5CF6' }}>{planAreas.length}</b></span>
          {activeInfraTool && (
            <span style={{ fontSize: '0.72rem', background: '#4361EE15', color: '#4361EE', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
              Insertando: {activeInfraTool} {infraLineStart ? '(haz clic para el punto final)' : ''}
            </span>
          )}
          {activeTool === 'area' && (
            <span style={{ fontSize: '0.72rem', background: '#10B98115', color: '#10B981', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
              {areaDrawStart ? 'Arrastra para definir el área' : 'Haz clic y arrastra para crear un área'}
            </span>
          )}
          {activeTool === 'calibrate' && (
            <span style={{ fontSize: '0.72rem', background: '#F59E0B15', color: '#F59E0B', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
              {!calibP1 ? 'Haz clic en el punto inicial de la distancia conocida' : !calibP2 ? 'Haz clic en el punto final' : 'Calibración lista'}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* ── LEFT SIDEBAR ── */}
        <div style={{
          width: sidebarCollapsed ? 42 : 148, flexShrink: 0,
          background: '#1A1D2E',
          borderRight: '1px solid #2D3A56',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto', overflowX: 'hidden',
          transition: 'width 0.2s',
        }}>
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', padding: '8px 0',
              background: 'transparent', border: 'none', borderBottom: '1px solid #2D3A56',
              color: '#64748B', cursor: 'pointer', fontSize: 12,
            }}>
            {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {/* Seleccionar (mover elementos) */}
          <button
            onClick={() => { setActiveInfraTool(null); setActiveTool('select'); setInfraLineStart(null); }}
            title="Seleccionar y mover elementos individualmente"
            style={{
              ...sideToolBtn,
              background: !activeInfraTool && activeTool === 'select' ? 'rgba(67,97,238,0.18)' : 'transparent',
              borderLeft: !activeInfraTool && activeTool === 'select' ? '3px solid #4361EE' : '3px solid transparent',
              color: !activeInfraTool && activeTool === 'select' ? '#4361EE' : '#94A3B8',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            }}>
            <span style={{ fontSize: 15 }}>↖</span>
            {!sidebarCollapsed && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 7 }}>Seleccionar</span>}
          </button>

          {/* Mover plano */}
          <button
            onClick={() => { setActiveInfraTool(null); setActiveTool('pan'); setInfraLineStart(null); }}
            title="Mover el plano (pan)"
            style={{
              ...sideToolBtn,
              background: !activeInfraTool && activeTool === 'pan' ? 'rgba(100,116,139,0.18)' : 'transparent',
              borderLeft: !activeInfraTool && activeTool === 'pan' ? '3px solid #64748B' : '3px solid transparent',
              color: !activeInfraTool && activeTool === 'pan' ? '#94A3B8' : '#64748B',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            }}>
            <span style={{ fontSize: 15 }}>✋</span>
            {!sidebarCollapsed && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 7 }}>Mover Plano</span>}
          </button>

          {/* Área */}
          <button
            onClick={() => { setActiveInfraTool(null); setActiveTool('area'); setInfraLineStart(null); }}
            title="Definir área/zona con nombre"
            style={{
              ...sideToolBtn,
              background: !activeInfraTool && activeTool === 'area' ? 'rgba(16,185,129,0.18)' : 'transparent',
              borderLeft: !activeInfraTool && activeTool === 'area' ? '3px solid #10B981' : '3px solid transparent',
              color: !activeInfraTool && activeTool === 'area' ? '#10B981' : '#64748B',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            }}>
            <span style={{ fontSize: 15 }}>✂</span>
            {!sidebarCollapsed && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 7 }}>Área / Zona</span>}
          </button>

          {/* Calibrar */}
          <button
            onClick={() => { setActiveInfraTool(null); setActiveTool('calibrate'); setInfraLineStart(null); resetCalibration(); }}
            title="Calibrar escala del plano"
            style={{
              ...sideToolBtn,
              background: !activeInfraTool && activeTool === 'calibrate' ? 'rgba(245,158,11,0.18)' : 'transparent',
              borderLeft: !activeInfraTool && activeTool === 'calibrate' ? '3px solid #F59E0B' : '3px solid transparent',
              color: !activeInfraTool && activeTool === 'calibrate' ? '#F59E0B' : '#64748B',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            }}>
            <span style={{ fontSize: 15 }}>⊕</span>
            {!sidebarCollapsed && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 7 }}>Calibrar</span>}
          </button>

          {!sidebarCollapsed && (
            <div style={{ height: 1, background: '#2D3A56', margin: '4px 0' }} />
          )}

          {/* Categorías de infraestructura */}
          {INFRA_CATEGORIES.map(cat => (
            <div key={cat.id}>
              {!sidebarCollapsed && (
                <p style={{
                  fontSize: 9, fontWeight: 700, color: '#475569',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  padding: '8px 10px 3px', margin: 0,
                }}>
                  {cat.label}
                </p>
              )}
              {cat.tools.map(tool => {
                const isActive = activeInfraTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    onClick={() => {
                      setActiveInfraTool(tool.id);
                      setActiveTool('select');
                      setInfraLineStart(null);
                      setSelectedInfraId(null);
                    }}
                    title={tool.description}
                    style={{
                      ...sideToolBtn,
                      background: isActive ? tool.color + '22' : 'transparent',
                      borderLeft: isActive ? `3px solid ${tool.color}` : '3px solid transparent',
                      color: isActive ? tool.color : '#94A3B8',
                      justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    }}>
                    <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{tool.icon}</span>
                    {!sidebarCollapsed && (
                      <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 400, marginLeft: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tool.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Acciones de archivo */}
          {!sidebarCollapsed && (
            <div style={{ marginTop: 'auto', borderTop: '1px solid #2D3A56', padding: '6px 0' }}>
              <button style={{ ...sideToolBtn, color: '#4ADE80' }} onClick={exportPDF}>
                <FileDown size={13} /><span style={{ fontSize: 10, marginLeft: 6 }}>Exportar PDF</span>
              </button>
              <button style={{ ...sideToolBtn, color: '#60A5FA' }} onClick={() => setShowLayerPanel(v => !v)}>
                <Layers size={13} /><span style={{ fontSize: 10, marginLeft: 6 }}>Por capas</span>
              </button>
              <button style={{ ...sideToolBtn, color: '#F59E0B' }} onClick={() => onSave?.(layers)}>
                <Save size={13} /><span style={{ fontSize: 10, marginLeft: 6 }}>Guardar versión</span>
              </button>
              <button style={{ ...sideToolBtn, color: '#A78BFA' }}>
                <Share2 size={13} /><span style={{ fontSize: 10, marginLeft: 6 }}>Compartir</span>
              </button>
              <button style={{ ...sideToolBtn, color: '#64748B' }}>
                <Mail size={13} /><span style={{ fontSize: 10, marginLeft: 6 }}>Enviar correo</span>
              </button>
            </div>
          )}
        </div>

        {/* ── Canvas area ── */}
        <div
          ref={containerRef}
          style={{
            flex: 1, overflow: 'hidden', position: 'relative',
            background: '#E8EBF4',
            cursor: getCursor(),
          }}
        >
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(238,240,248,0.85)', zIndex: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(67,97,238,0.15)', borderTopColor: '#4361EE', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <span style={{ fontSize: '0.84rem', color: 'var(--text-2)', fontFamily: 'Inter, sans-serif' }}>Cargando plano…</span>
              </div>
            </div>
          )}

          {!fileUrl && !loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(67,97,238,0.06)', border: '1px solid rgba(67,97,238,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={28} color="#4361EE" />
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-2)', fontFamily: 'Inter, sans-serif' }}>Selecciona un plano para visualizar</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>Soporta archivos PDF de hasta 500 MB</span>
            </div>
          )}

          <div style={{ position: 'absolute', transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: '0 0' }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />

            <svg
              ref={svgRef}
              style={{ position: 'absolute', top: 0, left: 0, width: canvasSize.w, height: canvasSize.h, overflow: 'visible' }}
              viewBox={`0 0 ${canvasSize.w/(zoom*1.5)} ${canvasSize.h/(zoom*1.5)}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={e => {
                // Deselect only if not dragging and not on an element
                if (!dragState.current && !areaDragState.current && !activeInfraTool) {
                  if (activeTool === 'select') {
                    const pt = svgCoords(e);
                    if (!hitTestInfraElement(pt) && !hitTestArea(pt)) {
                      setSelectedInfraId(null);
                      setSelectedAreaId(null);
                    }
                  }
                }
              }}
            >
              {/* Plan areas (below everything) */}
              <PlanAreasLayer
                areas={planAreas}
                scale={zoom*1.5}
                selectedId={selectedAreaId}
                onSelect={id => { if (activeTool === 'select' || activeTool === 'area') setSelectedAreaId(id); }}
              />

              {/* Saved annotations */}
              {layers.map(l => (
                <AnnotationLayer key={l.id} annotations={l.annotations} visible={l.visible} scale={zoom*1.5} />
              ))}
              {/* In-progress annotation */}
              {currentAnn && <AnnotationLayer annotations={[currentAnn]} visible={true} scale={zoom*1.5} />}

              {/* Infra elements */}
              <InfraElementsLayer
                elements={infraElements}
                visible={isLayerVisible}
                scale={zoom*1.5}
                selectedId={selectedInfraId}
                onSelect={id => {
                  setSelectedInfraId(id);
                  if (!activeInfraTool) setActiveTool('select');
                }}
              />

              {/* Line in progress */}
              {infraLineStart && activeInfraTool && (
                <line
                  x1={infraLineStart.x} y1={infraLineStart.y}
                  x2={mousePos.x} y2={mousePos.y}
                  stroke={getInfraTool(activeInfraTool)?.color ?? '#4361EE'}
                  strokeWidth={2/(zoom*1.5)}
                  strokeDasharray={`${6/(zoom*1.5)},${3/(zoom*1.5)}`}
                  opacity={0.7}
                />
              )}

              {/* Area drawing preview */}
              {activeTool === 'area' && areaDrawStart && areaDrawCurrent && (
                <rect
                  x={Math.min(areaDrawStart.x, areaDrawCurrent.x)}
                  y={Math.min(areaDrawStart.y, areaDrawCurrent.y)}
                  width={Math.abs(areaDrawCurrent.x - areaDrawStart.x)}
                  height={Math.abs(areaDrawCurrent.y - areaDrawStart.y)}
                  rx={4/(zoom*1.5)}
                  stroke={AREA_COLORS[areaColorIdx % AREA_COLORS.length]}
                  strokeWidth={1.5/(zoom*1.5)}
                  fill={AREA_COLORS[areaColorIdx % AREA_COLORS.length] + '18'}
                  strokeDasharray={`${6/(zoom*1.5)},${3/(zoom*1.5)}`}
                />
              )}

              {/* Calibration line */}
              {activeTool === 'calibrate' && calibP1 && (
                <CalibrationLine
                  p1={calibP1}
                  p2={calibP2 ?? (calibP1 ? mousePos : null)}
                  scale={zoom*1.5}
                />
              )}
            </svg>
          </div>
        </div>

        {/* ── RIGHT PANEL — Capas ── */}
        {showLayerPanel && (
          <div style={{
            width: 200, flexShrink: 0,
            background: 'var(--surface, #fff)',
            borderLeft: '1px solid var(--border-light, #E8EBF4)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={13} color="#4361EE" />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }}>Capas</span>
              </div>
              <button onClick={() => setShowLayerPanel(false)} style={{ ...btnStyle, padding: 2 }}><X size={12} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {layers.map(l => {
                const isActive = l.id === activeLayer;
                const elCount = infraElements.filter(el => el.layerId === l.id).length;
                return (
                  <div key={l.id} onClick={() => setActiveLayer(l.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 9px', borderRadius: 8, marginBottom: 3,
                      background: isActive ? 'rgba(67,97,238,0.06)' : 'transparent',
                      border: isActive ? '1px solid rgba(67,97,238,0.15)' : '1px solid transparent',
                      cursor: 'pointer',
                    }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: isActive ? 600 : 400, color: isActive ? '#4361EE' : 'var(--text-1)' }}>
                      {l.name}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', background: 'var(--surface-2)', borderRadius: 10, padding: '1px 6px' }}>
                      {l.annotations.length + elCount}
                    </span>
                    <button onClick={e => { e.stopPropagation(); toggleLayer(l.id); }}
                      style={{ ...btnStyle, padding: 2, color: l.visible ? l.color : 'var(--text-3)' }}>
                      {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>
                    <button onClick={e => { e.stopPropagation(); clearLayer(l.id); }}
                      style={{ ...btnStyle, padding: 2, color: 'var(--text-3)' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
            {/* Plan areas summary */}
            {planAreas.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border-light)', padding: '10px 12px' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Áreas definidas</p>
                {planAreas.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'pointer' }}
                    onClick={() => { setSelectedAreaId(a.id); setActiveTool('area'); }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: a.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    <button onClick={e => { e.stopPropagation(); setPlanAreas(prev => prev.filter(x => x.id !== a.id)); }}
                      style={{ ...btnStyle, padding: 1, color: 'var(--text-3)' }}><Trash2 size={10} /></button>
                  </div>
                ))}
              </div>
            )}
            {/* Infra element summary */}
            <div style={{ borderTop: '1px solid var(--border-light)', padding: '10px 12px' }}>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Elementos insertados</p>
              {Object.entries(infraCount).map(([type, count]) => count > 0 && (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-2)' }}>{type}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-1)', fontWeight: 700 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!showLayerPanel && (
          <button onClick={() => setShowLayerPanel(true)}
            style={{ position: 'absolute', right: 12, top: 12, ...actionBtnStyle('#4361EE'), padding: '6px 10px' }}>
            <Layers size={13} /> Capas
          </button>
        )}

        {/* ── CAMERA PROPERTIES PANEL ── */}
        {(() => {
          const selEl = selectedInfraId ? infraElements.find(e => e.id === selectedInfraId) : null;
          if (!selEl || selEl.type !== 'camara') return null;
          const rot = selEl.rotation ?? 0;
          const cov = selEl.coverageAngle ?? 90;
          const dist = selEl.coverageDist ?? 80 / (zoom * 1.5);
          const updateCamera = (patch: Partial<InfraElement>) => {
            setInfraElements(prev => prev.map(e => e.id === selectedInfraId ? { ...e, ...patch } : e));
          };
          return (
            <div style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              background: '#1A1D2E', border: '1px solid #2D3A56',
              borderRadius: 14, padding: '12px 18px',
              display: 'flex', alignItems: 'center', gap: 16,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              zIndex: 50, minWidth: 420,
            }}>
              {/* Camera icon + label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: selEl.color + '25', border: `1px solid ${selEl.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📷</div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#E2E8F0' }}>{selEl.label}</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748B' }}>Cámara</div>
                </div>
              </div>

              <div style={{ width: 1, height: 36, background: '#2D3A56', flexShrink: 0 }} />

              {/* Rotation */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600 }}>ROTACIÓN</span>
                  <span style={{ fontSize: '0.75rem', color: selEl.color, fontWeight: 700 }}>{rot}°</span>
                </div>
                <input type="range" min={0} max={359} step={1} value={rot}
                  onChange={e => updateCamera({ rotation: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: selEl.color, cursor: 'pointer' }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
                    <button key={deg} onClick={() => updateCamera({ rotation: deg })}
                      style={{ flex: 1, padding: '2px 0', fontSize: '0.6rem', borderRadius: 4,
                        background: rot === deg ? selEl.color : '#2D3A56',
                        color: rot === deg ? '#fff' : '#64748B',
                        border: 'none', cursor: 'pointer', fontWeight: rot === deg ? 700 : 400 }}>
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ width: 1, height: 36, background: '#2D3A56', flexShrink: 0 }} />

              {/* Coverage angle */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600 }}>COBERTURA</span>
                  <span style={{ fontSize: '0.75rem', color: '#F59E0B', fontWeight: 700 }}>{cov}°</span>
                </div>
                <input type="range" min={20} max={180} step={5} value={cov}
                  onChange={e => updateCamera({ coverageAngle: Number(e.target.value) })}
                  style={{ width: '100%', accentColor: '#F59E0B', cursor: 'pointer' }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  {[45, 60, 90, 120, 180].map(ang => (
                    <button key={ang} onClick={() => updateCamera({ coverageAngle: ang })}
                      style={{ flex: 1, padding: '2px 0', fontSize: '0.6rem', borderRadius: 4,
                        background: cov === ang ? '#F59E0B' : '#2D3A56',
                        color: cov === ang ? '#1A1D2E' : '#64748B',
                        border: 'none', cursor: 'pointer', fontWeight: cov === ang ? 700 : 400 }}>
                      {ang}°
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ width: 1, height: 36, background: '#2D3A56', flexShrink: 0 }} />

              {/* Coverage distance */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 90 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 600 }}>ALCANCE</span>
                  <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 700 }}>{Math.round(dist * zoom * 1.5)}px</span>
                </div>
                <input type="range" min={20} max={300} step={5}
                  value={Math.round(dist * zoom * 1.5)}
                  onChange={e => updateCamera({ coverageDist: Number(e.target.value) / (zoom * 1.5) })}
                  style={{ width: '100%', accentColor: '#10B981', cursor: 'pointer' }} />
              </div>

              {/* Close */}
              <button onClick={() => setSelectedInfraId(null)}
                style={{ ...btnStyle, color: '#64748B', padding: 4, marginLeft: 4, flexShrink: 0 }}>
                <X size={14} />
              </button>
            </div>
          );
        })()}
      </div>

      {/* ── Label modal ── */}
      {labelModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #DDE0EE)',
            borderRadius: 14, padding: '20px 24px', minWidth: 300,
            boxShadow: '0 16px 48px rgba(67,97,238,0.2)',
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-1)', marginBottom: 8 }}>Etiqueta del elemento</div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: '0 0 12px' }}>
              Tipo: <b style={{ color: 'var(--text-2)' }}>{pendingInfra?.type}</b>
              {' · '}Capa: <b style={{ color: layers.find(l => l.id === pendingInfra?.layerId)?.color }}>{pendingInfra?.layerId}</b>
            </p>
            <input autoFocus value={labelInput} onChange={e => setLabelInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmInfraInsert(); if (e.key === 'Escape') { setLabelModal(false); setPendingInfra(null); } }}
              placeholder="Ej: CAM001, IDF-PB1..."
              style={{
                width: '100%', padding: '8px 12px',
                border: '1px solid var(--border, #DDE0EE)', borderRadius: 8,
                fontSize: '0.84rem', color: 'var(--text-1)', background: 'var(--surface-2)',
                fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box',
              }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => { setLabelModal(false); setPendingInfra(null); }}
                style={{ ...btnStyle, padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.8rem' }}>
                Cancelar
              </button>
              <button onClick={confirmInfraInsert} style={actionBtnStyle('#4361EE')}>Insertar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Text modal ── */}
      {showTextModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #DDE0EE)',
            borderRadius: 14, padding: '20px 24px', minWidth: 300,
            boxShadow: '0 16px 48px rgba(67,97,238,0.2)',
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-1)', marginBottom: 12 }}>Agregar texto</div>
            <input autoFocus value={textInput} onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTextAnnotation()}
              placeholder="Escribe tu anotación..."
              style={{
                width: '100%', padding: '8px 12px',
                border: '1px solid var(--border, #DDE0EE)', borderRadius: 8,
                fontSize: '0.84rem', color: 'var(--text-1)', background: 'var(--surface-2)',
                fontFamily: 'Inter, sans-serif', outline: 'none',
              }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowTextModal(false)} style={{ ...btnStyle, padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.8rem' }}>Cancelar</button>
              <button onClick={addTextAnnotation} style={actionBtnStyle('#4361EE')}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Area name modal ── */}
      {areaNameModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #DDE0EE)',
            borderRadius: 16, padding: '24px 28px', minWidth: 340,
            boxShadow: '0 20px 60px rgba(16,185,129,0.18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#10B98115', border: '1px solid #10B98130', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Scissors size={16} color="#10B981" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-1)' }}>Nombrar Área</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Define el nombre y color de esta zona</div>
              </div>
            </div>
            <input autoFocus value={areaNameInput} onChange={e => setAreaNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmArea(); if (e.key === 'Escape') { setAreaNameModal(false); setPendingArea(null); } }}
              placeholder="Ej: Sala de Juntas, Recepción, Server Room..."
              style={{
                width: '100%', padding: '9px 13px',
                border: '1px solid var(--border, #DDE0EE)', borderRadius: 9,
                fontSize: '0.85rem', color: 'var(--text-1)', background: 'var(--surface-2)',
                fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box', marginBottom: 12,
              }} />
            {/* Color picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Color:</span>
              {AREA_COLORS.map((c, i) => (
                <button key={c} onClick={() => { setAreaColorIdx(i); setPendingArea(prev => prev ? { ...prev, color: c } : prev); }}
                  style={{
                    width: 22, height: 22, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', padding: 0,
                    boxShadow: pendingArea?.color === c ? `0 0 0 3px ${c}60` : 'none',
                    transform: pendingArea?.color === c ? 'scale(1.2)' : 'scale(1)',
                    transition: 'all 0.15s',
                  }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setAreaNameModal(false); setPendingArea(null); }}
                style={{ ...btnStyle, padding: '7px 16px', border: '1px solid var(--border)', borderRadius: 9, fontSize: '0.8rem' }}>
                Cancelar
              </button>
              <button onClick={confirmArea} style={actionBtnStyle('#10B981')}>Crear Área</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Calibration modal ── */}
      {calibModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #DDE0EE)',
            borderRadius: 16, padding: '24px 28px', minWidth: 360,
            boxShadow: '0 20px 60px rgba(245,158,11,0.18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F59E0B15', border: '1px solid #F59E0B30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Crosshair size={16} color="#F59E0B" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-1)' }}>Calibrar Escala</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Ingresa la distancia real de la línea trazada</div>
              </div>
            </div>
            <div style={{ background: '#F59E0B08', border: '1px solid #F59E0B20', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', margin: 0 }}>
                Trazaste una línea de <b style={{ color: '#F59E0B' }}>
                  {calibP1 && calibP2 ? Math.sqrt((calibP2.x-calibP1.x)**2 + (calibP2.y-calibP1.y)**2).toFixed(1) : '—'}
                </b> píxeles en el plano.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                autoFocus
                type="number"
                min="0.01"
                step="0.01"
                value={calibRealDist}
                onChange={e => setCalibRealDist(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmCalibration(); if (e.key === 'Escape') { setCalibModal(false); resetCalibration(); } }}
                placeholder="Distancia real (ej: 5)"
                style={{
                  flex: 1, padding: '9px 13px',
                  border: '1px solid var(--border, #DDE0EE)', borderRadius: 9,
                  fontSize: '0.85rem', color: 'var(--text-1)', background: 'var(--surface-2)',
                  fontFamily: 'Inter, sans-serif', outline: 'none',
                }} />
              <select value={calibUnit} onChange={e => setCalibUnit(e.target.value as any)}
                style={{
                  padding: '9px 13px', border: '1px solid var(--border, #DDE0EE)', borderRadius: 9,
                  fontSize: '0.85rem', background: 'var(--surface-2)', color: 'var(--text-1)',
                  fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                }}>
                <option value="m">m</option>
                <option value="cm">cm</option>
                <option value="ft">ft</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setCalibModal(false); resetCalibration(); }}
                style={{ ...btnStyle, padding: '7px 16px', border: '1px solid var(--border)', borderRadius: 9, fontSize: '0.8rem' }}>
                Cancelar
              </button>
              <button onClick={confirmCalibration} style={actionBtnStyle('#F59E0B')}>Aplicar Escala</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────
const btnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-2, #5C6194)', padding: '4px 6px',
  borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4,
  fontSize: '0.78rem', fontFamily: 'Inter, sans-serif',
  transition: 'background 120ms, color 120ms',
};

const dividerStyle: React.CSSProperties = {
  width: 1, height: 20, background: 'var(--border-light, #E8EBF4)', flexShrink: 0,
};

const sideToolBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  width: '100%', padding: '7px 10px',
  background: 'transparent', border: 'none',
  color: '#64748B', cursor: 'pointer',
  fontSize: 12, transition: 'all 0.12s',
  textAlign: 'left',
};

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 12px', borderRadius: 8,
    border: 'none', cursor: 'pointer',
    background: color, color: '#fff',
    fontSize: '0.78rem', fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    transition: 'opacity 120ms, transform 100ms',
    boxShadow: `0 2px 6px ${color}40`,
  };
}
