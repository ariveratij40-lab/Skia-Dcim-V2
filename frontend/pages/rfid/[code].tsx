/**
 * rfid/[code].tsx — Página de escaneo RFID/QR (Fase 2)
 *
 * Cambios respecto a la versión legacy:
 *   - Elimina MOCK_DEVICES y DEFAULT_DEVICE
 *   - Consume GET /api/dcim/rfid/{code} (INV-TRK-0001)
 *   - Muestra datos reales: activo, tabla satélite y últimos 5 logs
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Tag, Layers, MapPin, Calendar, Wrench, FileText,
  ChevronRight, XCircle, X, Activity, Clock, User,
} from 'lucide-react';
import { ASSET_TYPE_UI, OPERATIONAL_STATUS_UI } from '../../hooks/useCatalogs';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface RFIDAsset {
  id: string;
  internal_code: string;
  name: string;
  asset_type_code: string;
  asset_type_name: string;
  status: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  location_name: string | null;
  rfid_tag: string | null;
  qr_code: string | null;
  install_year: number | null;
  observations: string | null;
}

interface SatelliteData {
  [key: string]: string | number | null | undefined;
}

interface AssetLog {
  id: string;
  event_type: string;
  notes: string | null;
  performed_at: string;
  performed_by_name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  rfid_scan:       'Escaneo RFID',
  location_change: 'Cambio de ubicación',
  status_change:   'Cambio de estado',
  maintenance:     'Mantenimiento',
  inspection:      'Inspección',
  created:         'Creación',
  updated:         'Actualización',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function RfidMobilePage() {
  const router = useRouter();
  const { code } = router.query;
  const deviceCode = typeof code === 'string' ? decodeURIComponent(code) : '';

  const [asset, setAsset] = useState<RFIDAsset | null>(null);
  const [satellite, setSatellite] = useState<SatelliteData>({});
  const [logs, setLogs] = useState<AssetLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventario' | 'tecnico' | 'bitacora'>('inventario');

  useEffect(() => {
    if (!deviceCode) return;
    setLoading(true);
    setNotFound(false);
    axios.get(`/api/dcim/rfid/${encodeURIComponent(deviceCode)}`)
      .then(res => {
        setAsset(res.data.asset);
        setSatellite(res.data.satellite ?? {});
        setLogs(res.data.logs ?? []);
      })
      .catch(err => {
        if (err.response?.status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [deviceCode]);

  const typeUI = asset ? (ASSET_TYPE_UI[asset.asset_type_code] ?? null) : null;
  const statusUI = asset ? (OPERATIONAL_STATUS_UI[asset.status] ?? null) : null;

  // ── Estado de carga ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto animate-pulse">
            <Tag size={20} className="text-white" />
          </div>
          <p className="text-slate-400 text-sm">Buscando activo...</p>
          <p className="text-slate-500 text-xs font-mono">{deviceCode}</p>
        </div>
      </div>
    );
  }

  // ── Activo no encontrado ──────────────────────────────────────────────────

  if (notFound || !asset) {
    return (
      <>
        <Head><title>Código no encontrado — SKIA RFID</title></Head>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
          <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto">
              <XCircle size={24} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Código no registrado</h2>
              <p className="text-slate-400 text-sm mt-1">
                El código <span className="font-mono text-cyan-400">{deviceCode}</span> no está asociado a ningún activo en este tenant.
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="w-full py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl"
            >
              Volver
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Vista principal ───────────────────────────────────────────────────────

  return (
    <>
      <Head><title>{asset.name} — SKIA RFID</title></Head>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">

        {/* Header móvil */}
        <div className="bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <Tag size={14} className="text-white" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{asset.internal_code}</div>
                <div className="text-[10px] text-slate-400 font-mono">{deviceCode}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {statusUI && (
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${statusUI.pill}`}>
                  {statusUI.label}
                </span>
              )}
              <button onClick={() => router.back()} className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

          {/* Tarjeta principal del activo */}
          <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${typeUI?.color ?? '#64748B'}22`, border: `1.5px solid ${typeUI?.color ?? '#64748B'}44` }}
              >
                <span className="text-2xl" style={{ color: typeUI?.color ?? '#94A3B8' }}>●</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-base leading-tight truncate">{asset.name}</div>
                <div className="text-slate-400 text-xs mt-0.5">{typeUI?.label ?? asset.asset_type_name}</div>
                {(asset.manufacturer || asset.model) && (
                  <div className="text-slate-300 text-xs mt-1">
                    {[asset.manufacturer, asset.model].filter(Boolean).join(' — ')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-slate-800/40 rounded-xl p-1 gap-1">
            {(['inventario', 'tecnico', 'bitacora'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === tab
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab === 'inventario' ? 'Inventario' : tab === 'tecnico' ? 'Técnico' : 'Bitácora'}
              </button>
            ))}
          </div>

          {/* Tab: Inventario */}
          {activeTab === 'inventario' && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
              {[
                { icon: <Tag size={13} />,      label: 'Código interno',  value: asset.internal_code },
                { icon: <MapPin size={13} />,   label: 'Ubicación',       value: asset.location_name ?? '—' },
                { icon: <Calendar size={13} />, label: 'Año instalación', value: asset.install_year ? String(asset.install_year) : '—' },
                { icon: <Layers size={13} />,   label: 'No. de serie',    value: asset.serial_number ?? '—' },
                { icon: <Activity size={13} />, label: 'Estado',          value: statusUI?.label ?? asset.status },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                  <div className="flex items-center gap-2 text-slate-400 text-xs">
                    {icon}
                    <span>{label}</span>
                  </div>
                  <span className="text-white text-xs font-medium text-right max-w-[55%] truncate">{value}</span>
                </div>
              ))}
              {asset.observations && (
                <div className="pt-2">
                  <div className="text-slate-400 text-xs mb-1 flex items-center gap-1.5">
                    <FileText size={12} /> Observaciones
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">{asset.observations}</p>
                </div>
              )}
            </div>
          )}

          {/* Tab: Técnico (datos satélite) */}
          {activeTab === 'tecnico' && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
              {Object.keys(satellite).length === 0 ? (
                <p className="text-slate-400 text-xs text-center py-4">
                  No hay especificaciones técnicas adicionales para este activo.
                </p>
              ) : (
                Object.entries(satellite).map(([key, value]) => {
                  if (value === null || value === undefined) return null;
                  const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  return (
                    <div key={key} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                      <span className="text-slate-400 text-xs">{label}</span>
                      <span className="text-white text-xs font-medium">{String(value)}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Tab: Bitácora */}
          {activeTab === 'bitacora' && (
            <div className="space-y-3">
              {logs.length === 0 ? (
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 text-center">
                  <Clock size={20} className="text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-400 text-xs">Sin eventos registrados</p>
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0 text-cyan-400">
                        <Wrench size={12} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white text-xs font-semibold">
                            {EVENT_TYPE_LABELS[log.event_type] ?? log.event_type}
                          </span>
                          <span className="text-slate-500 text-[10px] flex-shrink-0">
                            {formatDate(log.performed_at)}
                          </span>
                        </div>
                        {log.performed_by_name && (
                          <div className="flex items-center gap-1 text-slate-400 text-[10px] mt-0.5">
                            <User size={9} /> {log.performed_by_name}
                          </div>
                        )}
                        {log.notes && (
                          <p className="text-slate-300 text-xs mt-1.5 leading-relaxed">{log.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <p className="text-slate-500 text-[10px] text-center pb-2">
                Mostrando los últimos 5 eventos
              </p>
            </div>
          )}

          {/* Botón de acción */}
          <button
            onClick={() => router.push(`/infraestructura/activos?highlight=${asset.id}`)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-2xl text-white text-sm font-bold shadow-lg shadow-cyan-500/20"
          >
            <span>Ver en inventario completo</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
