import UpsPduWizard, { UpsPduWizardData } from '../../components/UpsPduWizard';
import axios from 'axios';
import Head from 'next/head';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import {
  Plus, Upload, Download, FileSpreadsheet, Search, RefreshCw,
  X, Edit2, Trash2, MapPin, Layers, BarChart2,
  CheckCircle2, AlertTriangle, Clock, XCircle, Info,
  LayoutGrid, List, Package, Activity, ChevronRight,
  Building2, Zap, Battery, BatteryCharging, BatteryFull,
  BatteryLow, BatteryMedium, Plug, TrendingUp, Shield,
  Calendar, Tag,
} from 'lucide-react';
import AppLayout from '../../components/AppLayout';
import ModuleEmptyState from '../../components/ModuleEmptyState';

// ============================================================
// TIPOS
// ============================================================
type DeviceStatus = 'Operativo' | 'Atención' | 'Crítico' | 'Planeado' | 'Fuera de servicio';
type DeviceType   = 'UPS' | 'PDU';
type UPSTopology  = 'Online' | 'Line-Interactive' | 'Standby';
type PDUType      = 'Básica' | 'Monitoreada' | 'Conmutada' | 'ATS';

interface PowerDevice {
  id: string;
  code: string;
  name: string;
  device_type: DeviceType;
  // UPS fields
  ups_topology?: UPSTopology;
  kva?: number;
  kw?: number;
  battery_runtime_min?: number;
  battery_health_pct?: number;
  battery_last_replace?: string;
  battery_next_replace?: string;
  input_voltage?: number;
  output_voltage?: number;
  load_pct?: number;
  // PDU fields
  pdu_type?: PDUType;
  total_outlets?: number;
  used_outlets?: number;
  amperage?: number;
  voltage?: number;
  metered?: boolean;
  // Common
  building: string;
  floor: string;
  room: string;
  rack_name: string;
  rack_u: string;
  mdf_idf_name: string;
  status: DeviceStatus;
  manufacturer: string;
  model: string;
  serial: string;
  mgmt_ip: string;
  responsible: string;
  install_date: string;
  last_maintenance: string;
  notes: string;
  tags: string[];
}

// ============================================================
// MOCK DATA
// ============================================================
const MOCK_DEVICES: PowerDevice[] = [
  {
    id: 'u1', code: 'UPS-MDF-001', name: 'UPS Principal MDF Torre A',
    device_type: 'UPS', ups_topology: 'Online',
    kva: 10, kw: 9, battery_runtime_min: 30, battery_health_pct: 92,
    battery_last_replace: '2023-06-01', battery_next_replace: '2026-06-01',
    input_voltage: 220, output_voltage: 220, load_pct: 68,
    building: 'Torre A', floor: 'Sótano 1', room: 'MDF Principal',
    rack_name: 'Rack Principal MDF Torre A', rack_u: '7-10U',
    mdf_idf_name: 'MDF Principal — Torre A',
    status: 'Operativo', manufacturer: 'APC', model: 'Smart-UPS SRT 10kVA', serial: 'APC-SRT10-001',
    mgmt_ip: '10.0.0.10',
    responsible: 'Ing. Carlos Méndez', install_date: '2021-03-15', last_maintenance: '2025-11-20',
    notes: 'UPS principal con autonomía de 30 min al 68% de carga. Batería en buen estado.',
    tags: ['ups', 'mdf', 'online', 'producción'],
  },
  {
    id: 'u2', code: 'PDU-MDF-001', name: 'PDU Monitoreada MDF Torre A — 1',
    device_type: 'PDU', pdu_type: 'Monitoreada',
    total_outlets: 24, used_outlets: 20, amperage: 32, voltage: 220, metered: true,
    building: 'Torre A', floor: 'Sótano 1', room: 'MDF Principal',
    rack_name: 'Rack Principal MDF Torre A', rack_u: '11U',
    mdf_idf_name: 'MDF Principal — Torre A',
    status: 'Operativo', manufacturer: 'APC', model: 'AP8959EU3', serial: 'APC-PDU-002',
    mgmt_ip: '10.0.0.11',
    responsible: 'Ing. Carlos Méndez', install_date: '2021-03-15', last_maintenance: '2025-11-20',
    notes: 'PDU monitoreada con medición por toma. 20/24 tomas ocupadas.',
    tags: ['pdu', 'monitoreada', 'mdf'],
  },
  {
    id: 'u3', code: 'UPS-SRV-001', name: 'UPS Servidores MDF Torre A',
    device_type: 'UPS', ups_topology: 'Online',
    kva: 20, kw: 18, battery_runtime_min: 20, battery_health_pct: 78,
    battery_last_replace: '2022-01-15', battery_next_replace: '2025-01-15',
    input_voltage: 220, output_voltage: 220, load_pct: 85,
    building: 'Torre A', floor: 'Sótano 1', room: 'MDF Principal',
    rack_name: 'Rack Servidores MDF Torre A', rack_u: '7-12U',
    mdf_idf_name: 'MDF Principal — Torre A',
    status: 'Atención', manufacturer: 'Eaton', model: '9PX 20kVA', serial: 'EAT-9PX20-003',
    mgmt_ip: '10.0.0.12',
    responsible: 'Ing. Carlos Méndez', install_date: '2020-09-01', last_maintenance: '2025-01-10',
    notes: 'Batería al 78%. Requiere reemplazo pronto. Carga al 85%.',
    tags: ['ups', 'servidores', 'batería-baja'],
  },
  {
    id: 'u4', code: 'PDU-SRV-001', name: 'PDU Conmutada Servidores',
    device_type: 'PDU', pdu_type: 'Conmutada',
    total_outlets: 16, used_outlets: 16, amperage: 32, voltage: 220, metered: true,
    building: 'Torre A', floor: 'Sótano 1', room: 'MDF Principal',
    rack_name: 'Rack Servidores MDF Torre A', rack_u: '13U',
    mdf_idf_name: 'MDF Principal — Torre A',
    status: 'Crítico', manufacturer: 'Raritan', model: 'PX3-5130R', serial: 'RAR-PX3-004',
    mgmt_ip: '10.0.0.13',
    responsible: 'Ing. Carlos Méndez', install_date: '2020-09-01', last_maintenance: '2025-01-10',
    notes: 'Tomas al 100%. Requiere expansión urgente.',
    tags: ['pdu', 'conmutada', 'crítico'],
  },
  {
    id: 'u5', code: 'UPS-IDF-P3-001', name: 'UPS IDF Piso 3',
    device_type: 'UPS', ups_topology: 'Line-Interactive',
    kva: 1.5, kw: 1.35, battery_runtime_min: 15, battery_health_pct: 95,
    battery_last_replace: '2024-03-01', battery_next_replace: '2027-03-01',
    input_voltage: 127, output_voltage: 127, load_pct: 45,
    building: 'Torre A', floor: 'Piso 3', room: 'Closet Telecom',
    rack_name: 'Rack IDF Piso 3', rack_u: '3U',
    mdf_idf_name: 'IDF Piso 3 — Torre A',
    status: 'Operativo', manufacturer: 'APC', model: 'Smart-UPS 1500VA', serial: 'APC-SMT15-005',
    mgmt_ip: '10.0.3.10',
    responsible: 'Ing. Laura Soto', install_date: '2021-06-10', last_maintenance: '2025-10-15',
    notes: 'UPS IDF piso 3 en buen estado. Batería nueva.',
    tags: ['ups', 'idf', 'piso3'],
  },
  {
    id: 'u6', code: 'UPS-IDF-P7-001', name: 'UPS IDF Piso 7',
    device_type: 'UPS', ups_topology: 'Line-Interactive',
    kva: 1.5, kw: 1.35, battery_runtime_min: 8, battery_health_pct: 55,
    battery_last_replace: '2020-06-10', battery_next_replace: '2023-06-10',
    input_voltage: 127, output_voltage: 127, load_pct: 72,
    building: 'Torre A', floor: 'Piso 7', room: 'Closet Telecom',
    rack_name: 'Rack IDF Piso 7', rack_u: '3U',
    mdf_idf_name: 'IDF Piso 7 — Torre A',
    status: 'Crítico', manufacturer: 'APC', model: 'Smart-UPS 1500VA', serial: 'APC-SMT15-006',
    mgmt_ip: '10.0.7.10',
    responsible: 'Ing. Laura Soto', install_date: '2020-06-10', last_maintenance: '2024-08-20',
    notes: 'Batería vencida. Autonomía real de 8 min. Reemplazo urgente.',
    tags: ['ups', 'idf', 'piso7', 'batería-vencida'],
  },
  {
    id: 'u7', code: 'UPS-MDF-B-001', name: 'UPS MDF Torre B',
    device_type: 'UPS', ups_topology: 'Online',
    kva: 6, kw: 5.4, battery_runtime_min: 25, battery_health_pct: 88,
    battery_last_replace: '2023-03-01', battery_next_replace: '2026-03-01',
    input_voltage: 220, output_voltage: 220, load_pct: 52,
    building: 'Torre B', floor: 'Planta Baja', room: 'Cuarto Telecom',
    rack_name: 'Rack MDF Torre B', rack_u: '5-8U',
    mdf_idf_name: 'MDF Torre B',
    status: 'Operativo', manufacturer: 'Eaton', model: '9PX 6kVA', serial: 'EAT-9PX6-007',
    mgmt_ip: '10.1.0.10',
    responsible: 'Ing. Roberto Vega', install_date: '2022-03-01', last_maintenance: '2025-09-15',
    notes: 'UPS Torre B en buen estado.',
    tags: ['ups', 'mdf', 'torreB'],
  },
  {
    id: 'u8', code: 'PDU-MDF-B-001', name: 'PDU Básica MDF Torre B',
    device_type: 'PDU', pdu_type: 'Básica',
    total_outlets: 16, used_outlets: 10, amperage: 16, voltage: 220, metered: false,
    building: 'Torre B', floor: 'Planta Baja', room: 'Cuarto Telecom',
    rack_name: 'Rack MDF Torre B', rack_u: '9U',
    mdf_idf_name: 'MDF Torre B',
    status: 'Operativo', manufacturer: 'Tripp Lite', model: 'PDU1230', serial: 'TL-PDU-008',
    mgmt_ip: '',
    responsible: 'Ing. Roberto Vega', install_date: '2022-03-01', last_maintenance: '2025-09-15',
    notes: 'PDU básica sin monitoreo.',
    tags: ['pdu', 'básica', 'torreB'],
  },
  {
    id: 'u9', code: 'UPS-DC-001', name: 'UPS Datacenter Piso 10',
    device_type: 'UPS', ups_topology: 'Online',
    kva: 40, kw: 36, battery_runtime_min: 15, battery_health_pct: 82,
    battery_last_replace: '2023-09-01', battery_next_replace: '2026-09-01',
    input_voltage: 220, output_voltage: 220, load_pct: 91,
    building: 'Torre A', floor: 'Piso 10', room: 'Sala de Servidores',
    rack_name: 'Rack Open Frame Sala Técnica P10', rack_u: '5-12U',
    mdf_idf_name: 'Sala Técnica Piso 10',
    status: 'Atención', manufacturer: 'Schneider Electric', model: 'Galaxy VS 40kVA', serial: 'SE-GVS40-009',
    mgmt_ip: '10.0.10.10',
    responsible: 'Ing. Carlos Méndez', install_date: '2020-09-01', last_maintenance: '2025-01-10',
    notes: 'Carga al 91%. Requiere expansión de capacidad urgente.',
    tags: ['ups', 'datacenter', 'carga-alta'],
  },
  {
    id: 'u10', code: 'PDU-DC-ATS-001', name: 'PDU ATS Datacenter',
    device_type: 'PDU', pdu_type: 'ATS',
    total_outlets: 32, used_outlets: 32, amperage: 32, voltage: 220, metered: true,
    building: 'Torre A', floor: 'Piso 10', room: 'Sala de Servidores',
    rack_name: 'Rack Open Frame Sala Técnica P10', rack_u: '13U',
    mdf_idf_name: 'Sala Técnica Piso 10',
    status: 'Crítico', manufacturer: 'APC', model: 'AP4424A', serial: 'APC-ATS-010',
    mgmt_ip: '10.0.10.11',
    responsible: 'Ing. Carlos Méndez', install_date: '2020-09-01', last_maintenance: '2025-01-10',
    notes: 'ATS al 100% de tomas. Requiere expansión urgente.',
    tags: ['pdu', 'ats', 'datacenter', 'crítico'],
  },
];

// ============================================================
// HELPERS
// ============================================================
const statusConfig: Record<DeviceStatus, { label: string; color: string; icon: React.ReactNode }> = {
  'Operativo':         { label: 'Operativo',         color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={12}/> },
  'Atención':          { label: 'Atención',           color: 'bg-amber-100 text-amber-700 border-amber-200',       icon: <AlertTriangle size={12}/> },
  'Crítico':           { label: 'Crítico',             color: 'bg-red-100 text-red-700 border-red-200',             icon: <XCircle size={12}/> },
  'Planeado':          { label: 'Planeado',            color: 'bg-blue-100 text-blue-700 border-blue-200',          icon: <Clock size={12}/> },
  'Fuera de servicio': { label: 'Fuera de servicio',  color: 'bg-slate-100 text-slate-500 border-[#E8EBF4]',       icon: <XCircle size={12}/> },
};

function batteryIcon(pct: number) {
  if (pct >= 80) return <BatteryFull size={14} className="text-emerald-500"/>;
  if (pct >= 50) return <BatteryMedium size={14} className="text-amber-500"/>;
  if (pct >= 20) return <BatteryLow size={14} className="text-orange-500"/>;
  return <BatteryLow size={14} className="text-red-500"/>;
}

function batteryColor(pct: number) {
  if (pct >= 80) return 'bg-emerald-400';
  if (pct >= 50) return 'bg-amber-400';
  return 'bg-red-500';
}

function loadColor(pct: number) {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 75) return 'bg-amber-400';
  return 'bg-emerald-400';
}

function outletColor(pct: number) {
  if (pct >= 95) return 'bg-red-500';
  if (pct >= 80) return 'bg-amber-400';
  return 'bg-blue-400';
}

// ============================================================
// MODAL
// ============================================================
const EMPTY_DEV: Omit<PowerDevice, 'id'> = {
  code: '', name: '', device_type: 'UPS',
  ups_topology: 'Online', kva: 0, kw: 0, battery_runtime_min: 0, battery_health_pct: 100,
  battery_last_replace: '', battery_next_replace: '', input_voltage: 220, output_voltage: 220, load_pct: 0,
  pdu_type: 'Monitoreada', total_outlets: 16, used_outlets: 0, amperage: 16, voltage: 220, metered: false,
  building: '', floor: '', room: '', rack_name: '', rack_u: '', mdf_idf_name: '',
  status: 'Operativo', manufacturer: '', model: '', serial: '', mgmt_ip: '',
  responsible: '', install_date: '', last_maintenance: '', notes: '', tags: [],
};

function DeviceModal({ device, onClose, onSave }: {
  device: PowerDevice | null; onClose: () => void; onSave: (d: PowerDevice) => void;
}) {
  const isNew = !device;
  const [form, setForm] = useState<Omit<PowerDevice, 'id'>>(device ? { ...device } : { ...EMPTY_DEV });
  const [tagInput, setTagInput] = useState('');

  function set(field: keyof typeof form, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !form.tags.includes(t)) setForm(prev => ({ ...prev, tags: [...prev.tags, t] }));
    setTagInput('');
  }

  function removeTag(t: string) {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(x => x !== t) }));
  }

  function handleSave() {
    if (!form.code || !form.name) return;
    onSave({ id: device?.id ?? `d${Date.now()}`, ...form });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EBF4]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <Zap size={18} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">{isNew ? 'Nuevo UPS / PDU' : 'Editar dispositivo'}</h2>
              <p className="text-xs text-[#5C6194]">{isNew ? 'Registrar UPS o PDU' : `Editando ${device?.code}`}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X size={18}/></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Identificación */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Identificación</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de dispositivo</label>
                <select value={form.device_type} onChange={e => set('device_type', e.target.value as DeviceType)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300">
                  <option value="UPS">UPS</option>
                  <option value="PDU">PDU</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
                <select value={form.status} onChange={e => set('status', e.target.value as DeviceStatus)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300">
                  {(['Operativo', 'Atención', 'Crítico', 'Planeado', 'Fuera de servicio'] as DeviceStatus[]).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Código *</label>
                <input value={form.code} onChange={e => set('code', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="UPS-MDF-001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="UPS Principal MDF" />
              </div>
            </div>
          </section>

          {/* UPS específico */}
          {form.device_type === 'UPS' && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Especificaciones UPS</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Topología</label>
                  <select value={form.ups_topology} onChange={e => set('ups_topology', e.target.value as UPSTopology)}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300">
                    {(['Online', 'Line-Interactive', 'Standby'] as UPSTopology[]).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Capacidad (kVA)</label>
                  <input type="number" step="0.5" value={form.kva} onChange={e => set('kva', Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Potencia (kW)</label>
                  <input type="number" step="0.1" value={form.kw} onChange={e => set('kw', Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Autonomía (min)</label>
                  <input type="number" value={form.battery_runtime_min} onChange={e => set('battery_runtime_min', Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Salud batería (%)</label>
                  <input type="number" min={0} max={100} value={form.battery_health_pct} onChange={e => set('battery_health_pct', Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Carga actual (%)</label>
                  <input type="number" min={0} max={100} value={form.load_pct} onChange={e => set('load_pct', Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Últ. reemplazo batería</label>
                  <input type="date" value={form.battery_last_replace} onChange={e => set('battery_last_replace', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Próx. reemplazo batería</label>
                  <input type="date" value={form.battery_next_replace} onChange={e => set('battery_next_replace', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
              </div>
            </section>
          )}

          {/* PDU específico */}
          {form.device_type === 'PDU' && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Especificaciones PDU</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de PDU</label>
                  <select value={form.pdu_type} onChange={e => set('pdu_type', e.target.value as PDUType)}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300">
                    {(['Básica', 'Monitoreada', 'Conmutada', 'ATS'] as PDUType[]).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tomas totales</label>
                  <input type="number" value={form.total_outlets} onChange={e => set('total_outlets', Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tomas usadas</label>
                  <input type="number" value={form.used_outlets} onChange={e => set('used_outlets', Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Amperaje (A)</label>
                  <input type="number" value={form.amperage} onChange={e => set('amperage', Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Voltaje (V)</label>
                  <input type="number" value={form.voltage} onChange={e => set('voltage', Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.metered} onChange={e => set('metered', e.target.checked)}
                      className="w-4 h-4 rounded accent-amber-600" />
                    <span className="text-sm text-slate-600">Con medición por toma</span>
                  </label>
                </div>
              </div>
            </section>
          )}

          {/* Ubicación */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Ubicación</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Edificio</label>
                <input value={form.building} onChange={e => set('building', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Torre A" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Piso</label>
                <input value={form.floor} onChange={e => set('floor', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Sótano 1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cuarto</label>
                <input value={form.room} onChange={e => set('room', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="MDF Principal" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Rack</label>
                <input value={form.rack_name} onChange={e => set('rack_name', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Rack Principal MDF Torre A" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Posición (U)</label>
                <input value={form.rack_u} onChange={e => set('rack_u', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="7-10U" />
              </div>
            </div>
          </section>

          {/* Hardware */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Hardware</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fabricante</label>
                <input value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="APC, Eaton, Schneider..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Modelo</label>
                <input value={form.model} onChange={e => set('model', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Smart-UPS SRT 10kVA" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Número de serie</label>
                <input value={form.serial} onChange={e => set('serial', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="APC-SRT10-001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">IP de gestión</label>
                <input value={form.mgmt_ip} onChange={e => set('mgmt_ip', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="10.0.0.10" />
              </div>
            </div>
          </section>

          {/* Responsable */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Responsable y fechas</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">Responsable</label>
                <input value={form.responsible} onChange={e => set('responsible', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Ing. Carlos Méndez" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fecha instalación</label>
                <input type="date" value={form.install_date} onChange={e => set('install_date', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Último mantenimiento</label>
                <input type="date" value={form.last_maintenance} onChange={e => set('last_maintenance', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
            </div>
          </section>

          {/* Tags */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Etiquetas</h3>
            <div className="flex gap-2 flex-wrap mb-2">
              {form.tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs">
                  {t}<button onClick={() => removeTag(t)} className="hover:text-red-500"><X size={10}/></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); }}}
                className="flex-1 px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="Agregar etiqueta..." />
              <button onClick={addTag} className="px-3 py-2 bg-amber-50 text-amber-700 rounded-lg text-sm hover:bg-amber-100">Agregar</button>
            </div>
          </section>

          <section>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notas / Observaciones</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
              placeholder="Observaciones técnicas, historial de mantenimiento..." />
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E8EBF4] bg-slate-50/80 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={handleSave}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg shadow-sm">
            {isNew ? 'Crear dispositivo' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FILA EXPANDIBLE
// ============================================================
function DeviceRow({ device, onEdit, onDelete, isHighlighted, rowRef }: {
  device: PowerDevice; onEdit: (d: PowerDevice) => void; onDelete: (id: string) => void; isHighlighted?:boolean; rowRef?:(el:HTMLTableRowElement|null)=>void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sc = statusConfig[device.status];
  const isUPS = device.device_type === 'UPS';

  return (
    <>
      <tr
        ref={rowRef}
        className={`border-b border-[#E8EBF4] hover:bg-slate-50/80 cursor-pointer transition-colors ${expanded ? 'bg-amber-50 border-l-4 border-l-amber-500' : 'border-l-4 border-l-transparent'}${isHighlighted?' skia-highlight-row':''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3 w-8">
          <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`}>
            <ChevronRight size={14}/>
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isUPS ? 'bg-amber-100' : 'bg-orange-100'}`}>
              {isUPS ? <Battery size={15} className="text-amber-600"/> : <Plug size={15} className="text-orange-600"/>}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">{device.name}</p>
              <p className="text-xs text-[#5C6194]">{device.code}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isUPS ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>
            {device.device_type}
          </span>
          <p className="text-xs text-[#5C6194] mt-0.5">
            {isUPS ? `${device.ups_topology} · ${device.kva}kVA` : `${device.pdu_type}`}
          </p>
        </td>
        <td className="px-4 py-3 text-sm text-slate-600">
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="text-slate-500"/>
            <span>{device.building}</span>
          </div>
          <p className="text-xs text-[#5C6194] ml-4">{device.floor} · {device.room}</p>
        </td>
        <td className="px-4 py-3">
          {isUPS ? (
            <div className="w-28">
              <div className="flex items-center gap-1.5 mb-1">
                {batteryIcon(device.battery_health_pct ?? 0)}
                <span className="text-xs text-[#5C6194]">{device.battery_health_pct}% salud</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${loadColor(device.load_pct ?? 0)}`} style={{ width: `${device.load_pct}%` }}/>
              </div>
              <p className="text-xs text-[#5C6194] mt-0.5">Carga: {device.load_pct}%</p>
            </div>
          ) : (
            <div className="w-28">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${outletColor((device.used_outlets ?? 0) / (device.total_outlets ?? 1) * 100)}`}
                    style={{ width: `${(device.total_outlets ?? 0) > 0 ? Math.round((device.used_outlets ?? 0) / (device.total_outlets ?? 1) * 100) : 0}%` }}/>
                </div>
                <span className="text-xs text-[#5C6194] w-10 text-right">{device.used_outlets}/{device.total_outlets}</span>
              </div>
              <p className="text-xs text-[#5C6194] mt-0.5">{device.metered ? 'Monitoreada' : 'Sin monitoreo'}</p>
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-slate-600">{device.responsible || '—'}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sc.color}`}>
            {sc.icon}{sc.label}
          </span>
        </td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(device)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-500 hover:text-amber-600"><Edit2 size={14}/></button>
            <button onClick={() => onDelete(device.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500"><Trash2 size={14}/></button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-amber-50 border-b-2 border-b-amber-200 border-l-4 border-l-amber-500">
          <td colSpan={8} className="px-6 py-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2 bg-slate-100/80 rounded-xl border border-amber-100 p-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Package size={12}/> Especificaciones
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {isUPS ? [
                    ['Fabricante', device.manufacturer || '—'],
                    ['Modelo', device.model || '—'],
                    ['Serie', device.serial || '—'],
                    ['Topología', device.ups_topology || '—'],
                    ['Capacidad', `${device.kva}kVA / ${device.kw}kW`],
                    ['Autonomía', `${device.battery_runtime_min} min`],
                    ['Voltaje E/S', `${device.input_voltage}V / ${device.output_voltage}V`],
                    ['IP gestión', device.mgmt_ip || '—'],
                  ].map(([k, v]) => (
                    <div key={k}><span className="text-xs text-[#5C6194]">{k}</span><p className="text-slate-700 font-medium text-xs">{v}</p></div>
                  )) : [
                    ['Fabricante', device.manufacturer || '—'],
                    ['Modelo', device.model || '—'],
                    ['Serie', device.serial || '—'],
                    ['Tipo PDU', device.pdu_type || '—'],
                    ['Tomas', `${device.used_outlets}/${device.total_outlets}`],
                    ['Amperaje', `${device.amperage}A`],
                    ['Voltaje', `${device.voltage}V`],
                    ['IP gestión', device.mgmt_ip || '—'],
                  ].map(([k, v]) => (
                    <div key={k}><span className="text-xs text-[#5C6194]">{k}</span><p className="text-slate-700 font-medium text-xs">{v}</p></div>
                  ))}
                </div>
              </div>
              {isUPS && (
                <div className="bg-slate-100/80 rounded-xl border border-amber-100 p-4">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <BatteryCharging size={12}/> Batería
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs text-[#5C6194] mb-0.5">
                        <span>Salud</span><span>{device.battery_health_pct}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${batteryColor(device.battery_health_pct ?? 0)}`} style={{ width: `${device.battery_health_pct}%` }}/>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-[#5C6194] mb-0.5">
                        <span>Carga actual</span><span>{device.load_pct}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${loadColor(device.load_pct ?? 0)}`} style={{ width: `${device.load_pct}%` }}/>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between"><span className="text-xs text-[#5C6194]">Últ. reemplazo</span><span className="text-xs text-slate-700">{device.battery_last_replace || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-xs text-[#5C6194]">Próx. reemplazo</span><span className="text-xs text-slate-700">{device.battery_next_replace || '—'}</span></div>
                  </div>
                </div>
              )}
              {!isUPS && (
                <div className="bg-slate-100/80 rounded-xl border border-amber-100 p-4">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Activity size={12}/> Tomas
                  </h4>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-xs text-[#5C6194] mb-0.5">
                        <span>Ocupación</span><span>{device.used_outlets}/{device.total_outlets}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${outletColor((device.used_outlets ?? 0) / (device.total_outlets ?? 1) * 100)}`}
                          style={{ width: `${(device.total_outlets ?? 0) > 0 ? Math.round((device.used_outlets ?? 0) / (device.total_outlets ?? 1) * 100) : 0}%` }}/>
                      </div>
                    </div>
                    <div className="flex justify-between"><span className="text-xs text-[#5C6194]">Monitoreo</span><span className={`text-xs font-medium ${device.metered ? 'text-emerald-600' : 'text-slate-500'}`}>{device.metered ? '✓ Sí' : '✗ No'}</span></div>
                  </div>
                </div>
              )}
              <div className="bg-slate-100/80 rounded-xl border border-amber-100 p-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Info size={12}/> Notas
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">{device.notes || 'Sin notas registradas.'}</p>
                {device.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {device.tags.map(t => (
                      <span key={t} className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs">{t}</span>
                    ))}
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-[#E8EBF4]">
                  <p className="text-xs text-[#5C6194]">Responsable</p>
                  <p className="text-xs text-slate-600 font-medium">{device.responsible || '—'}</p>
                  <p className="text-xs text-[#5C6194] mt-1">Últ. mantenimiento</p>
                  <p className="text-xs text-slate-600 font-medium">{device.last_maintenance || '—'}</p>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================
// CARD
// ============================================================
function DeviceCard({ device, onEdit, onDelete }: {
  device: PowerDevice; onEdit: (d: PowerDevice) => void; onDelete: (id: string) => void;
}) {
  const sc = statusConfig[device.status];
  const isUPS = device.device_type === 'UPS';
  return (
    <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isUPS ? 'bg-amber-100' : 'bg-orange-100'}`}>
            {isUPS ? <Battery size={16} className="text-amber-600"/> : <Plug size={16} className="text-orange-600"/>}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 leading-tight">{device.name}</p>
            <p className="text-xs text-[#5C6194]">{device.code}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sc.color}`}>
          {sc.icon}{sc.label}
        </span>
      </div>
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-[#5C6194]">
          <MapPin size={11}/> {device.building} · {device.floor}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#5C6194]">
          <Package size={11}/> {device.manufacturer} {device.model}
        </div>
        {isUPS && (
          <div className="flex items-center gap-1.5 text-xs text-[#5C6194]">
            <Zap size={11}/> {device.kva}kVA · {device.ups_topology}
          </div>
        )}
      </div>
      {isUPS ? (
        <div className="mb-3 space-y-1.5">
          <div>
            <div className="flex justify-between text-xs text-[#5C6194] mb-0.5"><span>Batería</span><span>{device.battery_health_pct}%</span></div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${batteryColor(device.battery_health_pct ?? 0)}`} style={{ width: `${device.battery_health_pct}%` }}/>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-[#5C6194] mb-0.5"><span>Carga</span><span>{device.load_pct}%</span></div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${loadColor(device.load_pct ?? 0)}`} style={{ width: `${device.load_pct}%` }}/>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-[#5C6194] mb-0.5">
            <span>Tomas</span>
            <span>{device.used_outlets}/{device.total_outlets}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${outletColor((device.used_outlets ?? 0) / (device.total_outlets ?? 1) * 100)}`}
              style={{ width: `${(device.total_outlets ?? 0) > 0 ? Math.round((device.used_outlets ?? 0) / (device.total_outlets ?? 1) * 100) : 0}%` }}/>
          </div>
        </div>
      )}
      <div className="flex items-center justify-end gap-1 pt-2 border-t border-[#E8EBF4]">
        <button onClick={() => onEdit(device)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-500 hover:text-amber-600"><Edit2 size={14}/></button>
        <button onClick={() => onDelete(device.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500"><Trash2 size={14}/></button>
      </div>
    </div>
  );
}

// ============================================================
// PÁGINA PRINCIPAL
// ============================================================
export default function UpsPdusPage() {
  const router = useRouter();
  const highlightCode = typeof router.query.highlight === 'string' ? decodeURIComponent(router.query.highlight) : undefined;
  const [activeTab, setActiveTab] = useState<'resumen' | 'inventario'>(highlightCode ? 'inventario' : 'resumen');
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const [search, setSearch] = useState(highlightCode||'');
  const [highlightedId, setHighlightedId] = useState<string|null>(null);
  const upsRowRefs = useRef<Record<string,HTMLTableRowElement|null>>({});
  const didHLUps = useRef(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterBuilding, setFilterBuilding] = useState('');
  const [devices, setDevices] = useState<PowerDevice[]>([]);

  // Cargar UPS/PDUs del backend al montar
  useEffect(() => {
    import('axios').then(({ default: axios }) => {
      axios.get('/api/infra/ups-pdus')
        .then(res => setDevices(Array.isArray(res.data) ? res.data : []))
        .catch(() => setDevices([]));
    });
  }, []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDev, setEditingDev] = useState<PowerDevice | null>(null);
  const [showUpsWizard, setShowUpsWizard] = useState(false);

  const filtered = useMemo(() => {
    return devices.filter(d => {
      const q = search.toLowerCase();
      const matchSearch = !q || d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q) || d.building.toLowerCase().includes(q);
      const matchStatus = !filterStatus || d.status === filterStatus;
      const matchType   = !filterType   || d.device_type === filterType;
      const matchBuilding = !filterBuilding || d.building === filterBuilding;
      return matchSearch && matchStatus && matchType && matchBuilding;
    });
  }, [devices, search, filterStatus, filterType, filterBuilding]);

  // Scroll + highlight desde búsqueda global
  useEffect(() => {
    if (!highlightCode || didHLUps.current) return;
    setSearch(highlightCode);
    setActiveTab('inventario');
    const t = setTimeout(() => {
      const match = devices.find(d =>
        d.code === highlightCode || d.code.toLowerCase().includes(highlightCode.toLowerCase())
      );
      if (!match) return;
      setHighlightedId(match.id);
      didHLUps.current = true;
      const el = upsRowRefs.current[match.id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        setHighlightedId(null);
        const { highlight: _h, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
      }, 2500);
    }, 300);
    return () => clearTimeout(t);
  }, [highlightCode, devices]);

  const buildings = useMemo(() => Array.from(new Set(devices.map(d => d.building))), [devices]);
  const upsCount  = devices.filter(d => d.device_type === 'UPS').length;
  const pduCount  = devices.filter(d => d.device_type === 'PDU').length;
  const critCount = devices.filter(d => d.status === 'Crítico').length;
  const attnCount = devices.filter(d => d.status === 'Atención').length;
  const totalKva  = devices.filter(d => d.device_type === 'UPS').reduce((s, d) => s + (d.kva ?? 0), 0);

  function handleSave(d: PowerDevice) {
    setDevices(prev => prev.some(x => x.id === d.id) ? prev.map(x => x.id === d.id ? d : x) : [...prev, d]);
    setModalOpen(false);
    setEditingDev(null);
  }

  function handleEdit(d: PowerDevice) { setEditingDev(d); setModalOpen(true); }
  function handleDelete(id: string) { setDevices(prev => prev.filter(d => d.id !== id)); }
  function handleNew() { setEditingDev(null); setModalOpen(true); }

  return (
    <AppLayout>
      <Head><title>UPS / PDUs — SKIA DCIM Platform</title></Head>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Zap size={24} className="text-amber-600"/> UPS / PDUs
            </h1>
            <p className="text-sm text-[#5C6194] mt-0.5">Gestión de sistemas de alimentación ininterrumpida y unidades de distribución de energía.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-slate-100/80 border border-[#E8EBF4] rounded-lg hover:bg-slate-50">
              <Upload size={14}/> Importar
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-slate-100/80 border border-[#E8EBF4] rounded-lg hover:bg-slate-50">
              <Download size={14}/> CSV
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-slate-100/80 border border-[#E8EBF4] rounded-lg hover:bg-slate-50">
              <FileSpreadsheet size={14}/> Excel
            </button>
            <button onClick={() => setShowUpsWizard(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm">
              <Plus size={14}/> Nuevo UPS/PDU
            </button>
          </div>
        </div>

        <div className="flex gap-1 bg-slate-100/80 p-1 rounded-xl w-fit">
          {(['resumen', 'inventario'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${activeTab === tab ? 'bg-slate-100 text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {tab === 'resumen' ? 'Resumen' : 'Inventario'}
            </button>
          ))}
        </div>
      </div>

      {devices.length === 0 && (
        <ModuleEmptyState
          icon={<Battery size={36} className="text-amber-600" />}
          title="Sin UPS ni PDUs registrados"
          description="Los UPS y PDUs son la columna vertebral de la continuidad eléctrica. Registra cada dispositivo con su capacidad, estado de batería y ubicación para garantizar la disponibilidad de tu infraestructura."
          features={[
            { icon: <Battery size={14}/>, text: 'Monitoreo de salud de batería' },
            { icon: <Zap size={14}/>, text: 'Control de capacidad kVA y carga' },
            { icon: <AlertTriangle size={14}/>, text: 'Alertas de batería baja o vencida' },
            { icon: <Plug size={14}/>, text: 'Inventario de PDUs y circuitos' },
          ]}
          wizardLabel="Registrar primer UPS / PDU"
          onOpenWizard={() => setShowUpsWizard(true)}
          accentColor="amber"
        />
      )}
      {devices.length > 0 && activeTab === 'resumen' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'UPS registrados', value: upsCount, icon: <Battery size={18} className="text-amber-600"/>, ring: 'bg-amber-100', bar: 'bg-amber-400', sub: `${totalKva} kVA total` },
              { label: 'PDUs registradas', value: pduCount, icon: <Plug size={18} className="text-orange-600"/>, ring: 'bg-orange-100', bar: 'bg-orange-400', sub: 'unidades de distribución' },
              { label: 'Total dispositivos', value: devices.length, icon: <Zap size={18} className="text-yellow-600"/>, ring: 'bg-yellow-100', bar: 'bg-yellow-400', sub: 'UPS + PDUs' },
              { label: 'Requieren atención', value: critCount + attnCount, icon: <AlertTriangle size={18} className="text-red-600"/>, ring: 'bg-red-100', bar: 'bg-red-400', sub: `${critCount} críticos` },
            ].map(kpi => (
              <div key={kpi.label} className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl p-4">
                <div className={`w-9 h-9 rounded-xl ${kpi.ring} flex items-center justify-center mb-3`}>{kpi.icon}</div>
                <p className="text-2xl font-bold text-slate-800">{kpi.value}</p>
                <p className="text-xs font-medium text-slate-600 mt-0.5">{kpi.label}</p>
                <p className="text-xs text-[#5C6194]">{kpi.sub}</p>
                <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${kpi.bar} rounded-full`} style={{ width: '60%' }}/>
                </div>
              </div>
            ))}
          </div>

          {/* UPS con batería baja */}
          {devices.filter(d => d.device_type === 'UPS' && (d.battery_health_pct ?? 100) < 80).length > 0 && (
            <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                <AlertTriangle size={16}/> UPS con batería baja o vencida
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {devices.filter(d => d.device_type === 'UPS' && (d.battery_health_pct ?? 100) < 80).map(d => (
                  <div key={d.id} className="bg-slate-100/80 rounded-xl border border-amber-200 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{d.name}</p>
                      <p className="text-xs text-[#5C6194]">{d.building} · {d.floor}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${batteryColor(d.battery_health_pct ?? 0).replace('bg-', 'text-').replace('-400', '-600').replace('-500', '-600')}`}>
                        {d.battery_health_pct}%
                      </p>
                      <p className="text-xs text-[#5C6194]">salud batería</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Por edificio */}
          <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Building2 size={16} className="text-amber-500"/> Dispositivos por edificio
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {buildings.map(b => {
                const bDevs = devices.filter(d => d.building === b);
                const bUPS  = bDevs.filter(d => d.device_type === 'UPS').length;
                const bPDU  = bDevs.filter(d => d.device_type === 'PDU').length;
                return (
                  <div key={b} className="bg-slate-50/80 border border-[#E8EBF4] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">{b}</span>
                      <span className="text-xs text-[#5C6194]">{bDevs.length} dispositivos</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">{bUPS} UPS</span>
                      <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded">{bPDU} PDU</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setActiveTab('inventario')}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl shadow-sm">
              Ver inventario completo <ChevronRight size={16}/>
            </button>
          </div>
        </div>
      )}

      {devices.length > 0 && activeTab === 'inventario' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100/80 border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="Buscar por nombre, código, edificio..." />
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="px-3 py-2 text-sm bg-slate-100/80 border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300">
                <option value="">Todos los estados</option>
                {(['Operativo', 'Atención', 'Crítico', 'Planeado', 'Fuera de servicio'] as DeviceStatus[]).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="px-3 py-2 text-sm bg-slate-100/80 border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300">
                <option value="">UPS y PDUs</option>
                <option value="UPS">Solo UPS</option>
                <option value="PDU">Solo PDUs</option>
              </select>
              <select value={filterBuilding} onChange={e => setFilterBuilding(e.target.value)}
                className="px-3 py-2 text-sm bg-slate-100/80 border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300">
                <option value="">Todos los edificios</option>
                {buildings.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <div className="flex items-center gap-1 bg-slate-100/80 border border-[#E8EBF4] rounded-lg p-1">
                <button onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:text-slate-600'}`}>
                  <List size={16}/>
                </button>
                <button onClick={() => setViewMode('cards')}
                  className={`p-1.5 rounded ${viewMode === 'cards' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:text-slate-600'}`}>
                  <LayoutGrid size={16}/>
                </button>
              </div>
              <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterType(''); setFilterBuilding(''); }}
                className="p-2 text-slate-500 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <RefreshCw size={15}/>
              </button>
            </div>
            <p className="text-xs text-[#5C6194]">{filtered.length} de {devices.length} dispositivos</p>
          </div>

          {viewMode === 'list' && (
            <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#E8EBF4] bg-slate-50/80">
                    <th className="w-8 px-4 py-3"></th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre / Código</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ubicación</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Capacidad / Carga</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Responsable</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500 text-sm">No se encontraron dispositivos con los filtros aplicados.</td></tr>
                  ) : (
                    filtered.map(d => (
                      <DeviceRow key={d.id} device={d} onEdit={handleEdit} onDelete={handleDelete} isHighlighted={highlightedId===d.id} rowRef={el=>{ upsRowRefs.current[d.id]=el as HTMLTableRowElement|null; }}/>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {viewMode === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.length === 0 ? (
                <div className="col-span-3 py-12 text-center text-slate-500 text-sm">No se encontraron dispositivos con los filtros aplicados.</div>
              ) : (
                filtered.map(d => (
                  <DeviceCard key={d.id} device={d} onEdit={handleEdit} onDelete={handleDelete}/>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <DeviceModal
          device={editingDev}
          onClose={() => { setModalOpen(false); setEditingDev(null); }}
          onSave={handleSave}
        />
      )}
      {showUpsWizard && (
        <UpsPduWizard
          onClose={() => setShowUpsWizard(false)}
          onSave={(data: UpsPduWizardData) => {
            const newDev: PowerDevice = {
              id: Date.now().toString(),
              code: data.code,
              name: data.name,
              device_type: data.device_type as any,
              status: data.status as any,
              manufacturer: data.manufacturer,
              model: data.model,
              serial: data.serial,
              building: data.building,
              floor: data.floor,
              room: data.room,
              rack_name: data.rack_name,
              rack_u: data.rack_u,
              mdf_idf_name: data.mdf_idf_name,
              kva: data.kva,
              kw: data.kw,
              battery_runtime_min: data.battery_runtime_min,
              battery_health_pct: data.battery_health_pct,
              input_voltage: data.input_voltage,
              output_voltage: data.output_voltage,
              load_pct: data.load_pct,
              mgmt_ip: data.mgmt_ip,
              responsible: data.responsible,
              install_date: data.install_date,
              last_maintenance: data.last_maintenance,
              notes: data.notes,
              tags: data.tags ?? [],
            };
            import('axios').then(({ default: axios }) => {
              axios.post('/api/infra/ups-pdus', {
                internal_code: '',
                name: data.name,
                device_type: data.device_type ?? 'UPS',
                status: data.status === 'Operativo' ? 'active' : 'inactive',
                manufacturer: data.manufacturer,
                model: data.model,
                serial: data.serial,
                location: [data.building, data.floor, data.room].filter(Boolean).join(' - '),
                kva: data.kva ?? 0,
                battery_runtime_min: data.battery_runtime_min ?? 0,
                observations: data.notes ?? '',
              }).then(resp => {
                setDevices(prev => [{ ...newDev, id: resp.data.id ?? newDev.id, code: resp.data.internal_code ?? newDev.code }, ...prev]);
              }).catch(() => undefined);
            });
            setShowUpsWizard(false);
          }}
        />
      )}
    </AppLayout>
  );
}
