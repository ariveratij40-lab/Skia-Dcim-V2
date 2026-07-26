import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Search, X, ArrowRight, Package, Database, Grid3x3, Network, Zap,
  Layers, Radio, FileText, Tag, Plug, Server, Cpu, AlertCircle,
  CheckSquare, Wrench, DollarSign, BarChart3, Shield
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface SearchResult {
  id: string;
  module: string;
  moduleLabel: string;
  moduleColor: string;
  moduleIcon: any;
  path: string;
  title: string;
  subtitle: string;
  tags: string[];
  matchedFields: string[];
}

// ─── Índice de datos de todos los módulos ────────────────────────────────────
// En producción estos datos vendrían del API; aquí usamos los datos mock
// que coinciden con los de cada módulo para demostración.

const SEARCH_INDEX: Omit<SearchResult, 'matchedFields'>[] = [
  // ── ACTIVOS ──────────────────────────────────────────────────────────────
  { id:'a1', module:'activos', moduleLabel:'Activos', moduleColor:'#6366F1', moduleIcon:Package, path:'/infraestructura/activos', title:'SRV-DC-001', subtitle:'Dell PowerEdge R750 · Servidor · Datacenter Principal', tags:['servidor','dell','poweredge','datacenter','r750','activo','operativo','2024'] },
  { id:'a2', module:'activos', moduleLabel:'Activos', moduleColor:'#6366F1', moduleIcon:Package, path:'/infraestructura/activos', title:'FW-CORE-001', subtitle:'Cisco ASA 5555-X · Firewall · MDF Torre A', tags:['firewall','cisco','asa','mdf','seguridad','activo','operativo'] },
  { id:'a3', module:'activos', moduleLabel:'Activos', moduleColor:'#6366F1', moduleIcon:Package, path:'/infraestructura/activos', title:'STG-SAN-001', subtitle:'NetApp FAS8700 · Storage SAN · Datacenter Principal', tags:['storage','san','netapp','fas8700','datacenter','activo'] },
  { id:'a4', module:'activos', moduleLabel:'Activos', moduleColor:'#6366F1', moduleIcon:Package, path:'/infraestructura/activos', title:'BAL-WEB-001', subtitle:'F5 BIG-IP 2200s · Load Balancer · DMZ', tags:['balanceador','f5','bigip','dmz','web','activo'] },
  { id:'a5', module:'activos', moduleLabel:'Activos', moduleColor:'#6366F1', moduleIcon:Package, path:'/infraestructura/activos', title:'SRV-APP-002', subtitle:'HPE ProLiant DL380 · Servidor App · Piso 3', tags:['servidor','hpe','proliant','dl380','aplicaciones','piso3'] },

  // ── MDF / IDF ─────────────────────────────────────────────────────────────
  { id:'m1', module:'mdf-idf', moduleLabel:'MDF / IDF', moduleColor:'#0EA5E9', moduleIcon:Database, path:'/infraestructura/mdf-idf', title:'MDF-TORRE-A', subtitle:'Main Distribution Frame · Torre A Piso 1 · 13 racks', tags:['mdf','torre','distribucion','piso1','telecomunicaciones','cuarto','tecnico'] },
  { id:'m2', module:'mdf-idf', moduleLabel:'MDF / IDF', moduleColor:'#0EA5E9', moduleIcon:Database, path:'/infraestructura/mdf-idf', title:'IDF-P3-B', subtitle:'Intermediate Distribution Frame · Piso 3 Torre B · 4 racks', tags:['idf','piso3','torre','b','intermedio','distribucion'] },
  { id:'m3', module:'mdf-idf', moduleLabel:'MDF / IDF', moduleColor:'#0EA5E9', moduleIcon:Database, path:'/infraestructura/mdf-idf', title:'IDF-P5-A', subtitle:'Intermediate Distribution Frame · Piso 5 Torre A · 3 racks', tags:['idf','piso5','torre','a','intermedio'] },
  { id:'m4', module:'mdf-idf', moduleLabel:'MDF / IDF', moduleColor:'#0EA5E9', moduleIcon:Database, path:'/infraestructura/mdf-idf', title:'IDF-PLANTA-BAJA', subtitle:'Intermediate Distribution Frame · Planta Baja · 2 racks', tags:['idf','planta','baja','pb','recepcion'] },

  // ── RACKS ─────────────────────────────────────────────────────────────────
  { id:'r1', module:'racks', moduleLabel:'Racks', moduleColor:'#10B981', moduleIcon:Grid3x3, path:'/infraestructura/racks', title:'RCK-IDF2-A0001', subtitle:'Panduit RP40 · 48U · IDF2 Área de Producción · 25% uso', tags:['rack','panduit','rp40','48u','idf2','produccion','cableado','operativo'] },
  { id:'r2', module:'racks', moduleLabel:'Racks', moduleColor:'#10B981', moduleIcon:Grid3x3, path:'/infraestructura/racks', title:'RCK-MDF-A0001', subtitle:'Chatsworth CPI 45U · MDF Principal Torre A · 84% uso', tags:['rack','chatsworth','cpi','45u','mdf','torre','a','equipo','activo','operativo','rfid'] },
  { id:'r3', module:'racks', moduleLabel:'Racks', moduleColor:'#10B981', moduleIcon:Grid3x3, path:'/infraestructura/racks', title:'RCK-CCTV-B0001', subtitle:'Tripp Lite SR42UB · 42U · Torre B Planta Baja · CCTV', tags:['rack','tripp','lite','sr42ub','42u','torre','b','cctv','planta','baja','operativo'] },
  { id:'r4', module:'racks', moduleLabel:'Racks', moduleColor:'#10B981', moduleIcon:Grid3x3, path:'/infraestructura/racks', title:'RCK-TEL-A0001', subtitle:'APC NetShelter SX 42U · Sala Técnica Piso 10 · Telefonía', tags:['rack','apc','netshelter','42u','piso10','telefonia','atencion'] },
  { id:'r5', module:'racks', moduleLabel:'Racks', moduleColor:'#10B981', moduleIcon:Grid3x3, path:'/infraestructura/racks', title:'RCK-SRV-DC001', subtitle:'Dell PowerEdge Rack 48U · Datacenter Principal · 96% uso', tags:['rack','dell','poweredge','48u','datacenter','servidores','critico','rfid'] },

  // ── PATCH PANELS ──────────────────────────────────────────────────────────
  { id:'pp1', module:'patch-panels', moduleLabel:'Patch Panels', moduleColor:'#F59E0B', moduleIcon:Network, path:'/infraestructura/patch-panels', title:'PP-IDF1-A-01', subtitle:'Panduit NetKey 48p Cat6A · IDF1 Piso 1 · Rack A · 100% uso', tags:['patch','panel','panduit','netkey','48p','cat6a','idf1','piso1','rack','a','operativo'] },
  { id:'pp2', module:'patch-panels', moduleLabel:'Patch Panels', moduleColor:'#F59E0B', moduleIcon:Network, path:'/infraestructura/patch-panels', title:'PP-MDF-B-01', subtitle:'Leviton GigaMax 24p Cat6 · MDF Principal · Rack B', tags:['patch','panel','leviton','gigamax','24p','cat6','mdf','rack','b','operativo'] },
  { id:'pp3', module:'patch-panels', moduleLabel:'Patch Panels', moduleColor:'#F59E0B', moduleIcon:Network, path:'/infraestructura/patch-panels', title:'PP-IDF2-C-01', subtitle:'CommScope SYSTIMAX 48p Cat6A · IDF2 Producción · Rack C', tags:['patch','panel','commscope','systimax','48p','cat6a','idf2','produccion','rack','c'] },

  // ── SWITCHES ──────────────────────────────────────────────────────────────
  { id:'sw1', module:'switches', moduleLabel:'Switches', moduleColor:'#8B5CF6', moduleIcon:Zap, path:'/infraestructura/switches', title:'SW-CORE-MDF-01', subtitle:'Cisco Catalyst 9500 · Core · MDF Principal · 48 puertos', tags:['switch','cisco','catalyst','9500','core','mdf','48p','operativo','capa3'] },
  { id:'sw2', module:'switches', moduleLabel:'Switches', moduleColor:'#8B5CF6', moduleIcon:Zap, path:'/infraestructura/switches', title:'SW-DIST-P3-01', subtitle:'Cisco Catalyst 9300 · Distribución · IDF Piso 3 · 24 puertos', tags:['switch','cisco','catalyst','9300','distribucion','idf','piso3','24p'] },
  { id:'sw3', module:'switches', moduleLabel:'Switches', moduleColor:'#8B5CF6', moduleIcon:Zap, path:'/infraestructura/switches', title:'SW-ACC-P5-01', subtitle:'Cisco Catalyst 2960X · Acceso · IDF Piso 5 · 48 puertos', tags:['switch','cisco','catalyst','2960x','acceso','piso5','48p','poe'] },
  { id:'sw4', module:'switches', moduleLabel:'Switches', moduleColor:'#8B5CF6', moduleIcon:Zap, path:'/infraestructura/switches', title:'SW-CORE-MDF-02', subtitle:'Aruba 8400 · Core redundante · MDF Principal', tags:['switch','aruba','8400','core','mdf','redundante','operativo'] },

  // ── BACKBONE ──────────────────────────────────────────────────────────────
  { id:'bb1', module:'backbone', moduleLabel:'Backbone', moduleColor:'#EC4899', moduleIcon:Layers, path:'/infraestructura/backbone', title:'BB-MDF-IDF1-F01', subtitle:'Fibra OS2 12 hilos · MDF Torre A → IDF Piso 1 · 45m', tags:['backbone','fibra','os2','12','hilos','mdf','idf1','piso1','45m','operativo'] },
  { id:'bb2', module:'backbone', moduleLabel:'Backbone', moduleColor:'#EC4899', moduleIcon:Layers, path:'/infraestructura/backbone', title:'BB-MDF-IDF3-F01', subtitle:'Fibra OM4 24 hilos · MDF → IDF Piso 3 · 78m', tags:['backbone','fibra','om4','24','hilos','mdf','idf3','piso3','78m'] },
  { id:'bb3', module:'backbone', moduleLabel:'Backbone', moduleColor:'#EC4899', moduleIcon:Layers, path:'/infraestructura/backbone', title:'BB-IDF1-IDF2-F01', subtitle:'Fibra OM3 12 hilos · IDF1 → IDF2 · 32m', tags:['backbone','fibra','om3','12','hilos','idf1','idf2','32m'] },

  // ── NODOS ─────────────────────────────────────────────────────────────────
  { id:'n1', module:'nodos', moduleLabel:'Nodos', moduleColor:'#14B8A6', moduleIcon:Plug, path:'/infraestructura/nodos', title:'NOD-IDF1-0001', subtitle:'Panduit Cat5 · IDF1-P1-E2 · Voz · Producción · 45m', tags:['nodo','panduit','cat5','idf1','voz','produccion','45m','certificado','activo'] },
  { id:'n2', module:'nodos', moduleLabel:'Nodos', moduleColor:'#14B8A6', moduleIcon:Plug, path:'/infraestructura/nodos', title:'NOD-IDF1-0002', subtitle:'Panduit Cat5e · IDF1-P1-E2 · Datos · Recepción · 38m', tags:['nodo','panduit','cat5e','idf1','datos','recepcion','38m','sin','normativa','activo'] },
  { id:'n3', module:'nodos', moduleLabel:'Nodos', moduleColor:'#14B8A6', moduleIcon:Plug, path:'/infraestructura/nodos', title:'NOD-IDF2-0001', subtitle:'Belden Cat6 · IDF2-P2-E1 · Video · Almacén · 52m', tags:['nodo','belden','cat6','idf2','video','almacen','52m','certificado','activo'] },
  { id:'n4', module:'nodos', moduleLabel:'Nodos', moduleColor:'#14B8A6', moduleIcon:Plug, path:'/infraestructura/nodos', title:'NOD-IDF2-0002', subtitle:'CommScope Cat6A · IDF2-P2-E1 · Control Acceso · Almacén · 61m', tags:['nodo','commscope','cat6a','idf2','control','acceso','almacen','61m','certificado'] },
  { id:'n5', module:'nodos', moduleLabel:'Nodos', moduleColor:'#14B8A6', moduleIcon:Plug, path:'/infraestructura/nodos', title:'NOD-MDF-0001', subtitle:'Panduit Cat6A · MDF-E1-A · Datos · Sala Servidores · 12m', tags:['nodo','panduit','cat6a','mdf','datos','sala','servidores','12m','certificado','activo'] },
  { id:'n6', module:'nodos', moduleLabel:'Nodos', moduleColor:'#14B8A6', moduleIcon:Plug, path:'/infraestructura/nodos', title:'NOD-IDF3-0001', subtitle:'Leviton Cat5e · IDF3-P3-E1 · WiFi · Cafetería · 29m', tags:['nodo','leviton','cat5e','idf3','wifi','cafeteria','29m','sin','normativa','inactivo'] },

  // ── UPS / PDUs ────────────────────────────────────────────────────────────
  { id:'u1', module:'ups-pdus', moduleLabel:'UPS / PDUs', moduleColor:'#F97316', moduleIcon:Zap, path:'/infraestructura/ups-pdus', title:'UPS-MDF-001', subtitle:'APC Smart-UPS 10kVA · MDF Principal · 8.2kW carga', tags:['ups','apc','smart','10kva','mdf','respaldo','operativo','bateria'] },
  { id:'u2', module:'ups-pdus', moduleLabel:'UPS / PDUs', moduleColor:'#F97316', moduleIcon:Zap, path:'/infraestructura/ups-pdus', title:'PDU-RACK-DC01', subtitle:'Raritan PX3 32A · Datacenter Rack 1 · 28 tomas', tags:['pdu','raritan','px3','32a','datacenter','rack','tomas','operativo'] },
  { id:'u3', module:'ups-pdus', moduleLabel:'UPS / PDUs', moduleColor:'#F97316', moduleIcon:Zap, path:'/infraestructura/ups-pdus', title:'UPS-IDF3-001', subtitle:'Eaton 9PX 6kVA · IDF Piso 3 · 4.1kW carga', tags:['ups','eaton','9px','6kva','idf3','piso3','respaldo','atencion'] },

  // ── ETIQUETAS RFID ────────────────────────────────────────────────────────
  { id:'rf1', module:'etiquetas-rfid', moduleLabel:'Etiquetas RFID', moduleColor:'#6366F1', moduleIcon:Tag, path:'/infraestructura/etiquetas-rfid', title:'RFID-0001', subtitle:'Panduit RFID-LBL · RCK-MDF-A0001 · Rack Equipo Activo', tags:['rfid','panduit','etiqueta','rack','mdf','activo','asignado'] },
  { id:'rf2', module:'etiquetas-rfid', moduleLabel:'Etiquetas RFID', moduleColor:'#6366F1', moduleIcon:Tag, path:'/infraestructura/etiquetas-rfid', title:'RFID-0002', subtitle:'Panduit RFID-LBL · RCK-CCTV-B0001 · Rack CCTV', tags:['rfid','panduit','etiqueta','rack','cctv','asignado'] },
  { id:'rf3', module:'etiquetas-rfid', moduleLabel:'Etiquetas RFID', moduleColor:'#6366F1', moduleIcon:Tag, path:'/infraestructura/etiquetas-rfid', title:'RFID-0003', subtitle:'Panduit RFID-LBL · Disponible · Sin asignar', tags:['rfid','panduit','etiqueta','disponible','sin','asignar','libre'] },
];

// ─── Función de búsqueda ──────────────────────────────────────────────────────
function searchIndex(query: string): SearchResult[] {
  if (!query || query.trim().length < 2) return [];
  const terms = query.toLowerCase().trim().split(/\s+/);
  const results: SearchResult[] = [];

  for (const item of SEARCH_INDEX) {
    const searchable = [
      item.title,
      item.subtitle,
      item.moduleLabel,
      ...item.tags,
    ].join(' ').toLowerCase();

    const matchedTerms = terms.filter(t => searchable.includes(t));
    if (matchedTerms.length === 0) continue;

    // Calcular campos coincidentes para mostrar al usuario
    const matchedFields: string[] = [];
    if (item.title.toLowerCase().includes(query.toLowerCase())) matchedFields.push('código');
    if (item.subtitle.toLowerCase().includes(query.toLowerCase())) matchedFields.push('descripción');
    if (item.tags.some(t => terms.some(q => t.includes(q)))) matchedFields.push('campos');

    results.push({
      ...item,
      matchedFields: matchedFields.length > 0 ? matchedFields : ['coincidencia'],
    });
  }

  // Ordenar: más términos coincidentes primero
  return results.sort((a, b) => {
    const scoreA = terms.filter(t => [a.title, a.subtitle, ...a.tags].join(' ').toLowerCase().includes(t)).length;
    const scoreB = terms.filter(t => [b.title, b.subtitle, ...b.tags].join(' ').toLowerCase().includes(t)).length;
    return scoreB - scoreA;
  }).slice(0, 20);
}

// ─── Agrupar por módulo ───────────────────────────────────────────────────────
function groupByModule(results: SearchResult[]): Record<string, SearchResult[]> {
  const groups: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!groups[r.moduleLabel]) groups[r.moduleLabel] = [];
    groups[r.moduleLabel].push(r);
  }
  return groups;
}

// ─── Componente GlobalSearch ──────────────────────────────────────────────────
interface GlobalSearchProps {
  darkMode: boolean;
  C: Record<string, string>;
}

export default function GlobalSearch({ darkMode, C }: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Búsqueda en tiempo real
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSelected(-1);
      return;
    }
    const res = searchIndex(query);
    setResults(res);
    setSelected(-1);
    setOpen(true);
  }, [query]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Atajo de teclado Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Navegación con teclado
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, -1));
    } else if (e.key === 'Enter' && selected >= 0) {
      e.preventDefault();
      navigateTo(results[selected]);
    }
  }, [open, results, selected]);

  const navigateTo = (result: SearchResult) => {
    // Navegar al módulo con el código del elemento para scroll+highlight exacto
    const url = `${result.path}?highlight=${encodeURIComponent(result.title)}`;
    router.push(url);
    setQuery('');
    setOpen(false);
    setResults([]);
  };

  const groups = groupByModule(results);
  const flatResults = results;

  // Colores del dropdown
  const dropBg = darkMode ? '#1A1F35' : '#FFFFFF';
  const dropBorder = darkMode ? '#2D3154' : '#E2E8F0';
  const dropShadow = darkMode
    ? '0 20px 60px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)'
    : '0 20px 60px rgba(67,97,238,0.12), 0 4px 16px rgba(0,0,0,0.08)';
  const hoverBg = darkMode ? 'rgba(67,97,238,0.12)' : '#F0F4FF';
  const selectedBg = darkMode ? 'rgba(67,97,238,0.2)' : '#E8EEFF';
  const textPrimary = darkMode ? '#E2E8F0' : '#1E293B';
  const textSecondary = darkMode ? '#94A3B8' : '#64748B';
  const groupLabelColor = darkMode ? '#7B8DB8' : '#94A3B8';
  const dividerColor = darkMode ? '#2D3154' : '#F1F5F9';

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {/* Input de búsqueda */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search size={14} style={{ position: 'absolute', left: 11, color: C.text3, pointerEvents: 'none', zIndex: 1 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (query.length >= 2) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar en todos los módulos... (⌘K)"
          style={{
            background: C.searchBg,
            border: `1px solid ${open ? C.primary : C.searchBorder}`,
            borderRadius: 10,
            color: C.searchText,
            fontSize: '0.82rem',
            padding: '7px 36px 7px 32px',
            width: open ? 320 : 260,
            outline: 'none',
            fontFamily: 'inherit',
            transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
            boxShadow: open ? `0 0 0 3px ${darkMode ? 'rgba(67,97,238,0.2)' : 'rgba(67,97,238,0.12)'}` : 'none',
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus(); }}
            style={{
              position: 'absolute', right: 8, background: 'none', border: 'none',
              color: C.text3, cursor: 'pointer', padding: 2, borderRadius: 4,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Dropdown de resultados */}
      {open && (
        <div
          ref={dropRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 480,
            maxHeight: 520,
            overflowY: 'auto',
            background: dropBg,
            border: `1px solid ${dropBorder}`,
            borderRadius: 14,
            boxShadow: dropShadow,
            zIndex: 9999,
            padding: '8px 0',
          }}
        >
          {/* Sin resultados */}
          {query.length >= 2 && results.length === 0 && (
            <div style={{ padding: '24px 20px', textAlign: 'center' }}>
              <Search size={28} style={{ color: groupLabelColor, marginBottom: 8 }} />
              <p style={{ color: textPrimary, fontWeight: 600, margin: '0 0 4px', fontSize: '0.9rem' }}>
                Sin resultados para "{query}"
              </p>
              <p style={{ color: textSecondary, margin: 0, fontSize: '0.8rem' }}>
                Intenta con código, marca, ubicación, área o estado
              </p>
            </div>
          )}

          {/* Resultados agrupados por módulo */}
          {Object.entries(groups).map(([moduleLabel, items], gi) => {
            const firstItem = items[0];
            const ModuleIcon = firstItem.moduleIcon;
            return (
              <div key={moduleLabel}>
                {gi > 0 && <div style={{ height: 1, background: dividerColor, margin: '4px 0' }} />}
                {/* Cabecera del grupo */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 16px 4px',
                }}>
                  <ModuleIcon size={12} style={{ color: firstItem.moduleColor }} />
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em',
                    color: firstItem.moduleColor, textTransform: 'uppercase',
                  }}>
                    {moduleLabel}
                  </span>
                  <span style={{
                    marginLeft: 'auto', fontSize: '0.7rem', color: groupLabelColor,
                    background: darkMode ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                    padding: '1px 6px', borderRadius: 10,
                  }}>
                    {items.length}
                  </span>
                </div>

                {/* Items del grupo */}
                {items.map((result, idx) => {
                  const globalIdx = flatResults.indexOf(result);
                  const isSelected = globalIdx === selected;
                  return (
                    <button
                      key={result.id}
                      onClick={() => navigateTo(result)}
                      onMouseEnter={() => setSelected(globalIdx)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        width: '100%', padding: '8px 16px',
                        background: isSelected ? selectedBg : 'transparent',
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        transition: 'background 100ms',
                      }}
                      onMouseLeave={() => setSelected(-1)}
                    >
                      {/* Ícono del módulo */}
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: firstItem.moduleColor + '18',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <ModuleIcon size={15} style={{ color: firstItem.moduleColor }} />
                      </div>

                      {/* Texto */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: textPrimary, fontWeight: 600, fontSize: '0.85rem',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {result.title}
                        </div>
                        <div style={{
                          color: textSecondary, fontSize: '0.75rem',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {result.subtitle}
                        </div>
                      </div>

                      {/* Flecha */}
                      <ArrowRight size={14} style={{
                        color: isSelected ? firstItem.moduleColor : groupLabelColor,
                        flexShrink: 0, transition: 'color 100ms',
                      }} />
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Footer con atajos de teclado */}
          {results.length > 0 && (
            <div style={{
              padding: '8px 16px 4px',
              borderTop: `1px solid ${dividerColor}`,
              display: 'flex', gap: 16, alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.7rem', color: groupLabelColor, display: 'flex', alignItems: 'center', gap: 4 }}>
                <kbd style={{ background: darkMode ? '#2D3154' : '#F1F5F9', padding: '1px 5px', borderRadius: 4, fontSize: '0.65rem', border: `1px solid ${dropBorder}` }}>↑↓</kbd>
                navegar
              </span>
              <span style={{ fontSize: '0.7rem', color: groupLabelColor, display: 'flex', alignItems: 'center', gap: 4 }}>
                <kbd style={{ background: darkMode ? '#2D3154' : '#F1F5F9', padding: '1px 5px', borderRadius: 4, fontSize: '0.65rem', border: `1px solid ${dropBorder}` }}>↵</kbd>
                abrir
              </span>
              <span style={{ fontSize: '0.7rem', color: groupLabelColor, display: 'flex', alignItems: 'center', gap: 4 }}>
                <kbd style={{ background: darkMode ? '#2D3154' : '#F1F5F9', padding: '1px 5px', borderRadius: 4, fontSize: '0.65rem', border: `1px solid ${dropBorder}` }}>Esc</kbd>
                cerrar
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: groupLabelColor }}>
                {results.length} resultado{results.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
