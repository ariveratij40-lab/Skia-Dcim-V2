/**
 * RackBuilder — Constructor visual de rack con drag & drop
 * Permite arrastrar activos reales del inventario a las unidades U de un rack.
 * Reglas de integridad:
 *  - Cada activo solo puede estar en un rack a la vez (no duplicados entre IDFs)
 *  - No se pueden asignar más activos de los registrados en el inventario
 *  - El rack no puede exceder su capacidad total en U
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { RefreshCw, Save, Trash2, Info, ChevronDown, ChevronUp, GripVertical, AlertTriangle, CheckCircle, X } from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface InventoryAsset {
  id: string;
  internal_code: string;
  name: string;
  asset_type_code: string;
  asset_type_name: string;
  manufacturer: string;
  model: string;
  status: string;
  rack_id: string | null;       // null = disponible, uuid = ya asignado a otro rack
  rack_unit: number | null;
  height_u: number;             // cuántas U ocupa este equipo (default 1)
  color: string;                // color del tipo para la visualización
}

interface RackSlot {
  unit: number;                 // unidad U (1 = fondo del rack, total_u = tope)
  asset_id: string | null;
  asset: InventoryAsset | null;
  span: number;                 // cuántas U ocupa (height_u del activo)
  is_occupied_by_above: boolean; // true si esta U es continuación de un activo de arriba
}

interface RackBuilderProps {
  rackId: string;          // UUID del rack en la tabla racks
  rackCode: string;        // Código visual (ej: RCK-001)
  totalU: number;          // Capacidad total del rack
  mdfIdfId: string;        // UUID del MDF/IDF al que pertenece
  onClose: () => void;
  onSaved: () => void;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  SWITCH:      '#4361EE',
  PATCH_PANEL: '#7C3AED',
  UPS:         '#F59E0B',
  PDU:         '#F97316',
  NODE:        '#0EA5E9',
  RACK:        '#64748B',
  MDF:         '#10B981',
  IDF:         '#06B6D4',
  BACKBONE:    '#8B5CF6',
  DEFAULT:     '#94A3B8',
};

const TYPE_HEIGHT_U: Record<string, number> = {
  SWITCH:      1,
  PATCH_PANEL: 1,
  UPS:         2,
  PDU:         1,
  NODE:        2,
  BACKBONE:    1,
};

const TYPE_LABELS: Record<string, string> = {
  SWITCH:      'Switch',
  PATCH_PANEL: 'Patch Panel',
  UPS:         'UPS',
  PDU:         'PDU',
  NODE:        'Servidor / Nodo',
  BACKBONE:    'Backbone',
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function RackBuilder({ rackId, rackCode, totalU, mdfIdfId, onClose, onSaved }: RackBuilderProps) {
  const [slots, setSlots] = useState<RackSlot[]>([]);
  const [available, setAvailable] = useState<InventoryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [dragAsset, setDragAsset] = useState<InventoryAsset | null>(null);
  const [dragOverUnit, setDragOverUnit] = useState<number | null>(null);
  const [dragSource, setDragSource] = useState<'panel' | 'rack' | null>(null);
  const [dragFromUnit, setDragFromUnit] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [dirty, setDirty] = useState(false);

  // ─── Carga de datos ─────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Cargar activos del inventario con su asignación actual de rack
      const assetsRes = await axios.get('/api/dcim/assets?include_rack=true');
      const allAssets: InventoryAsset[] = (assetsRes.data.assets || []).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        internal_code: a.internal_code as string,
        name: a.name as string,
        asset_type_code: (a.asset_type_code as string) || 'DEFAULT',
        asset_type_name: (a.asset_type_name as string) || '',
        manufacturer: (a.manufacturer as string) || '',
        model: (a.model as string) || '',
        status: (a.status as string) || 'active',
        rack_id: (a.rack_id as string) || null,
        rack_unit: (a.rack_unit as number) || null,
        height_u: TYPE_HEIGHT_U[(a.asset_type_code as string)] || 1,
        color: TYPE_COLORS[(a.asset_type_code as string)] || TYPE_COLORS.DEFAULT,
      }));

      // 2. Activos ya en ESTE rack
      const inThisRack = allAssets.filter(a => a.rack_id === rackId);
      // 3. Activos disponibles (sin rack asignado)
      const freeAssets = allAssets.filter(a => !a.rack_id);

      setAvailable(freeAssets);

      // 4. Construir la grilla de U (de arriba hacia abajo: U=totalU en tope, U=1 en fondo)
      const grid: RackSlot[] = [];
      for (let u = totalU; u >= 1; u--) {
        grid.push({ unit: u, asset_id: null, asset: null, span: 1, is_occupied_by_above: false });
      }

      // 5. Colocar activos ya asignados
      inThisRack.forEach(asset => {
        if (asset.rack_unit !== null) {
          const idx = grid.findIndex(s => s.unit === asset.rack_unit);
          if (idx >= 0) {
            grid[idx].asset_id = asset.id;
            grid[idx].asset = asset;
            grid[idx].span = asset.height_u;
            // Marcar las U adicionales como ocupadas
            for (let h = 1; h < asset.height_u; h++) {
              const nextIdx = idx + h;
              if (nextIdx < grid.length) {
                grid[nextIdx].is_occupied_by_above = true;
              }
            }
          }
        }
      });

      setSlots(grid);
    } catch (e) {
      setError('Error al cargar el inventario. Intenta de nuevo.');
      console.error(e);
    }
    setLoading(false);
  }, [rackId, totalU]);

  useEffect(() => { load(); }, [load]);

  // ─── Drag & Drop desde el panel de activos ──────────────────────────────────

  const handleDragStartPanel = (asset: InventoryAsset) => {
    setDragAsset(asset);
    setDragSource('panel');
    setDragFromUnit(null);
  };

  const handleDragStartRack = (asset: InventoryAsset, unit: number) => {
    setDragAsset(asset);
    setDragSource('rack');
    setDragFromUnit(unit);
  };

  const handleDragOver = (e: React.DragEvent, unit: number) => {
    e.preventDefault();
    setDragOverUnit(unit);
  };

  const handleDrop = (e: React.DragEvent, targetUnit: number) => {
    e.preventDefault();
    if (!dragAsset) return;

    const newSlots = [...slots];
    const targetIdx = newSlots.findIndex(s => s.unit === targetUnit);
    if (targetIdx < 0) return;

    // Verificar que el slot destino esté libre
    const slot = newSlots[targetIdx];
    if (slot.is_occupied_by_above) {
      setError(`La unidad U${targetUnit} está ocupada por un activo de arriba.`);
      setTimeout(() => setError(''), 3000);
      resetDrag();
      return;
    }
    if (slot.asset_id && slot.asset_id !== dragAsset.id) {
      setError(`La unidad U${targetUnit} ya está ocupada por ${slot.asset?.internal_code}.`);
      setTimeout(() => setError(''), 3000);
      resetDrag();
      return;
    }

    // Verificar que haya espacio suficiente para el alto del activo
    const heightU = dragAsset.height_u;
    for (let h = 0; h < heightU; h++) {
      const checkIdx = targetIdx + h;
      if (checkIdx >= newSlots.length) {
        setError(`No hay suficiente espacio desde U${targetUnit} para este equipo (${heightU}U).`);
        setTimeout(() => setError(''), 3000);
        resetDrag();
        return;
      }
      const checkSlot = newSlots[checkIdx];
      if (checkSlot.is_occupied_by_above || (checkSlot.asset_id && checkSlot.asset_id !== dragAsset.id)) {
        setError(`No hay ${heightU}U libres consecutivas desde U${targetUnit}.`);
        setTimeout(() => setError(''), 3000);
        resetDrag();
        return;
      }
    }

    // Si venía del rack, limpiar la posición anterior
    if (dragSource === 'rack' && dragFromUnit !== null) {
      const prevIdx = newSlots.findIndex(s => s.unit === dragFromUnit);
      if (prevIdx >= 0) {
        const prevSpan = newSlots[prevIdx].span;
        newSlots[prevIdx] = { ...newSlots[prevIdx], asset_id: null, asset: null, span: 1, is_occupied_by_above: false };
        for (let h = 1; h < prevSpan; h++) {
          const clearIdx = prevIdx + h;
          if (clearIdx < newSlots.length) {
            newSlots[clearIdx].is_occupied_by_above = false;
          }
        }
      }
    }

    // Colocar el activo en la nueva posición
    newSlots[targetIdx] = { ...newSlots[targetIdx], asset_id: dragAsset.id, asset: dragAsset, span: heightU, is_occupied_by_above: false };
    for (let h = 1; h < heightU; h++) {
      const fillIdx = targetIdx + h;
      if (fillIdx < newSlots.length) {
        newSlots[fillIdx] = { ...newSlots[fillIdx], is_occupied_by_above: true };
      }
    }

    // Si venía del panel, remover del panel de disponibles
    if (dragSource === 'panel') {
      setAvailable(prev => prev.filter(a => a.id !== dragAsset!.id));
    }

    setSlots(newSlots);
    setDirty(true);
    resetDrag();
  };

  const handleRemoveFromRack = (unit: number) => {
    const newSlots = [...slots];
    const idx = newSlots.findIndex(s => s.unit === unit);
    if (idx < 0) return;
    const asset = newSlots[idx].asset;
    const span = newSlots[idx].span;
    if (!asset) return;

    // Limpiar slots
    newSlots[idx] = { ...newSlots[idx], asset_id: null, asset: null, span: 1, is_occupied_by_above: false };
    for (let h = 1; h < span; h++) {
      const clearIdx = idx + h;
      if (clearIdx < newSlots.length) {
        newSlots[clearIdx].is_occupied_by_above = false;
      }
    }

    setSlots(newSlots);
    setAvailable(prev => [...prev, asset]);
    setDirty(true);
  };

  const resetDrag = () => {
    setDragAsset(null);
    setDragOverUnit(null);
    setDragSource(null);
    setDragFromUnit(null);
  };

  // ─── Guardar layout ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      // Construir el payload: lista de asignaciones {asset_id, rack_unit}
      const assignments = slots
        .filter(s => s.asset_id && !s.is_occupied_by_above)
        .map(s => ({ asset_id: s.asset_id, rack_unit: s.unit, height_u: s.span }));

      await axios.post(`/api/infra/racks/${rackId}/layout`, {
        mdf_idf_id: mdfIdfId,
        assignments,
      });

      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 3000);
      onSaved();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Error al guardar el layout.');
    }
    setSaving(false);
  };

  // ─── Estadísticas del rack ───────────────────────────────────────────────────

  const usedU = slots.filter(s => s.asset_id || s.is_occupied_by_above).length;
  const freeU = totalU - usedU;
  const usedPct = Math.round((usedU / totalU) * 100);

  // ─── Tipos únicos en el panel ────────────────────────────────────────────────

  const availableTypes = ['ALL', ...Array.from(new Set(available.map(a => a.asset_type_code)))];
  const filteredAvailable = filterType === 'ALL' ? available : available.filter(a => a.asset_type_code === filterType);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 1100,
        maxHeight: '95vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(15,23,42,0.25)',
        overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid #E8EBF4',
          background: 'linear-gradient(135deg, #1a1d2e 0%, #2d3561 100%)',
          color: '#fff',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🗄️</span>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Rack Builder — {rackCode}</span>
              <span style={{
                background: 'rgba(255,255,255,0.15)', borderRadius: 20,
                padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600,
              }}>{totalU}U</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>
              Arrastra activos del panel derecho a las unidades del rack
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {dirty && (
              <span style={{ fontSize: '0.75rem', color: '#FCD34D', display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={13} /> Cambios sin guardar
              </span>
            )}
            <button
              onClick={load}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem' }}
            >
              <RefreshCw size={13} /> Actualizar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{
                background: dirty ? '#4361EE' : 'rgba(255,255,255,0.1)',
                border: 'none', color: '#fff', borderRadius: 8,
                padding: '7px 16px', cursor: dirty ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: '0.8rem', fontWeight: 600,
                opacity: saving ? 0.7 : 1,
              }}
            >
              <Save size={13} /> {saving ? 'Guardando...' : 'Guardar Layout'}
            </button>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Barra de estado del rack ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 24, padding: '10px 24px',
          background: '#F8FAFF', borderBottom: '1px solid #E8EBF4',
          fontSize: '0.8rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#64748B' }}>Capacidad:</span>
            <strong>{totalU}U</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#64748B' }}>Ocupado:</span>
            <strong style={{ color: usedPct > 80 ? '#EF4444' : usedPct > 60 ? '#F59E0B' : '#10B981' }}>{usedU}U ({usedPct}%)</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#64748B' }}>Libre:</span>
            <strong style={{ color: '#10B981' }}>{freeU}U</strong>
          </div>
          <div style={{ flex: 1, background: '#E8EBF4', borderRadius: 10, height: 8, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 10, transition: 'width 300ms',
              width: `${usedPct}%`,
              background: usedPct > 80 ? '#EF4444' : usedPct > 60 ? '#F59E0B' : '#4361EE',
            }} />
          </div>
          {saved && (
            <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
              <CheckCircle size={13} /> Guardado
            </span>
          )}
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '8px 24px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* ── Cuerpo: Rack + Panel ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── Visualización del Rack ── */}
          <div style={{
            flex: '0 0 420px', borderRight: '1px solid #E8EBF4',
            overflowY: 'auto', padding: '16px 20px',
            background: '#F1F5F9',
          }}>
            <div style={{ marginBottom: 10, fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Vista del Rack — {rackCode}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Cargando...</div>
            ) : (
              <div style={{
                background: '#1a1d2e',
                borderRadius: 10,
                border: '3px solid #374151',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
                {/* Cabecera del rack */}
                <div style={{
                  background: '#111827', padding: '8px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderBottom: '2px solid #374151',
                }}>
                  <span style={{ color: '#9CA3AF', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em' }}>
                    ▲ TOPE — {rackCode}
                  </span>
                  <span style={{ color: '#4361EE', fontSize: '0.7rem', fontWeight: 700 }}>{totalU}U</span>
                </div>

                {/* Unidades del rack */}
                {slots.map((slot) => {
                  if (slot.is_occupied_by_above) return null; // ya renderizado por el activo de arriba

                  const isOccupied = !!slot.asset;
                  const isDragTarget = dragOverUnit === slot.unit;
                  const canDrop = dragAsset && !slot.is_occupied_by_above && (!slot.asset_id || slot.asset_id === dragAsset?.id);

                  return (
                    <div
                      key={slot.unit}
                      onDragOver={e => handleDragOver(e, slot.unit)}
                      onDrop={e => handleDrop(e, slot.unit)}
                      onDragLeave={() => setDragOverUnit(null)}
                      style={{
                        display: 'flex',
                        height: `${slot.span * 28}px`,
                        minHeight: 28,
                        borderBottom: '1px solid #374151',
                        transition: 'background 100ms',
                        background: isDragTarget && canDrop
                          ? 'rgba(67,97,238,0.3)'
                          : isDragTarget && !canDrop
                          ? 'rgba(239,68,68,0.2)'
                          : isOccupied
                          ? `${slot.asset!.color}18`
                          : 'transparent',
                        cursor: isOccupied ? 'grab' : 'default',
                      }}
                    >
                      {/* Número de U */}
                      <div style={{
                        width: 32, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.6rem', color: '#6B7280', fontFamily: 'monospace',
                        borderRight: '1px solid #374151',
                        background: '#111827',
                      }}>
                        {slot.unit}
                      </div>

                      {/* Contenido del slot */}
                      <div
                        draggable={isOccupied}
                        onDragStart={() => isOccupied && handleDragStartRack(slot.asset!, slot.unit)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6, overflow: 'hidden' }}
                      >
                        {isOccupied ? (
                          <>
                            <div style={{
                              width: 4, height: '70%', borderRadius: 2,
                              background: slot.asset!.color, flexShrink: 0,
                            }} />
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {slot.asset!.internal_code}
                              </div>
                              <div style={{ fontSize: '0.62rem', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {slot.asset!.manufacturer} {slot.asset!.model}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveFromRack(slot.unit)}
                              style={{
                                background: 'rgba(239,68,68,0.2)', border: 'none',
                                color: '#F87171', borderRadius: 4, padding: '2px 5px',
                                cursor: 'pointer', flexShrink: 0, fontSize: '0.65rem',
                              }}
                              title="Quitar del rack"
                            >
                              <Trash2 size={10} />
                            </button>
                          </>
                        ) : (
                          <div style={{ fontSize: '0.62rem', color: '#4B5563', fontStyle: 'italic' }}>
                            {isDragTarget && canDrop ? '⬇ Soltar aquí' : `U${slot.unit} — libre`}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Pie del rack */}
                <div style={{
                  background: '#111827', padding: '8px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderTop: '2px solid #374151',
                }}>
                  <span style={{ color: '#9CA3AF', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em' }}>
                    ▼ BASE — U1
                  </span>
                  <span style={{ color: '#6B7280', fontSize: '0.65rem' }}>
                    {usedU}U usadas / {freeU}U libres
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── Panel de activos disponibles ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Activos disponibles ({filteredAvailable.length})
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {availableTypes.map(t => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem',
                      border: `1.5px solid ${filterType === t ? (TYPE_COLORS[t] || '#4361EE') : '#E8EBF4'}`,
                      background: filterType === t ? `${TYPE_COLORS[t] || '#4361EE'}18` : '#fff',
                      color: filterType === t ? (TYPE_COLORS[t] || '#4361EE') : '#64748B',
                      cursor: 'pointer', fontWeight: filterType === t ? 700 : 400,
                    }}
                  >
                    {t === 'ALL' ? 'Todos' : (TYPE_LABELS[t] || t)}
                  </button>
                ))}
              </div>
            </div>

            {/* Banner de instrucciones */}
            <div style={{
              background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 10,
              padding: '8px 12px', marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center',
              fontSize: '0.75rem', color: '#4338CA',
            }}>
              <Info size={13} />
              <span>Arrastra un activo al rack. Cada activo solo puede estar en un rack a la vez. Los activos ya asignados a otro rack no aparecen aquí.</span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Cargando inventario...</div>
            ) : filteredAvailable.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📦</div>
                <div style={{ fontWeight: 600 }}>No hay activos disponibles</div>
                <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                  {filterType !== 'ALL'
                    ? `Todos los ${TYPE_LABELS[filterType] || filterType} ya están asignados a un rack.`
                    : 'Todos los activos del inventario ya están asignados a racks.'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredAvailable.map(asset => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={() => handleDragStartPanel(asset)}
                    onDragEnd={resetDrag}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', borderRadius: 10,
                      border: `1.5px solid ${dragAsset?.id === asset.id ? asset.color : '#E8EBF4'}`,
                      background: dragAsset?.id === asset.id ? `${asset.color}12` : '#fff',
                      cursor: 'grab', transition: 'all 120ms',
                      boxShadow: dragAsset?.id === asset.id ? `0 4px 12px ${asset.color}30` : 'none',
                    }}
                    onMouseEnter={e => { if (dragAsset?.id !== asset.id) (e.currentTarget as HTMLDivElement).style.borderColor = asset.color; }}
                    onMouseLeave={e => { if (dragAsset?.id !== asset.id) (e.currentTarget as HTMLDivElement).style.borderColor = '#E8EBF4'; }}
                  >
                    <GripVertical size={14} color="#CBD5E1" style={{ flexShrink: 0 }} />
                    <div style={{
                      width: 8, height: 28, borderRadius: 3,
                      background: asset.color, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1E293B' }}>{asset.internal_code}</span>
                        <span style={{
                          fontSize: '0.65rem', padding: '1px 6px', borderRadius: 10,
                          background: `${asset.color}18`, color: asset.color, fontWeight: 600,
                        }}>
                          {TYPE_LABELS[asset.asset_type_code] || asset.asset_type_code} · {asset.height_u}U
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 1 }}>
                        {asset.manufacturer} {asset.model}
                      </div>
                    </div>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: asset.status === 'active' ? '#10B981' : asset.status === 'maintenance' ? '#F59E0B' : '#94A3B8',
                      flexShrink: 0,
                    }} title={asset.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
