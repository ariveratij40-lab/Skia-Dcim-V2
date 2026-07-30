'use client';
import { useState, useRef, useCallback } from 'react';
import {
  X, Upload, FileSpreadsheet, FileText, File,
  CheckCircle, AlertCircle, Info, Download, ChevronRight,
  Loader2, Table2,
} from 'lucide-react';

interface ImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const ACCEPTED_FORMATS = [
  {
    ext: '.csv',
    mime: 'text/csv',
    label: 'CSV',
    description: 'Valores separados por coma',
    icon: <FileText size={20} className="text-emerald-500" />,
    color: 'border-emerald-200 bg-emerald-50/60',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  {
    ext: '.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Excel (.xlsx)',
    description: 'Microsoft Excel moderno',
    icon: <FileSpreadsheet size={20} className="text-blue-500" />,
    color: 'border-blue-200 bg-blue-50/60',
    badge: 'bg-blue-100 text-blue-700',
  },
  {
    ext: '.xls',
    mime: 'application/vnd.ms-excel',
    label: 'Excel (.xls)',
    description: 'Microsoft Excel clásico',
    icon: <FileSpreadsheet size={20} className="text-indigo-500" />,
    color: 'border-indigo-200 bg-indigo-50/60',
    badge: 'bg-indigo-100 text-indigo-700',
  },
  {
    ext: '.json',
    mime: 'application/json',
    label: 'JSON',
    description: 'Datos estructurados JSON',
    icon: <File size={20} className="text-amber-500" />,
    color: 'border-amber-200 bg-amber-50/60',
    badge: 'bg-amber-100 text-amber-700',
  },
  {
    ext: '.pdf',
    mime: 'application/pdf',
    label: 'PDF',
    description: 'Reporte o ficha técnica (IA extrae datos)',
    icon: <File size={20} className="text-rose-500" />,
    color: 'border-rose-200 bg-rose-50/60',
    badge: 'bg-rose-100 text-rose-700',
  },
];

const TEMPLATE_COLUMNS = [
  'nombre', 'tipo_activo', 'fabricante', 'modelo', 'serie',
  'estado', 'ubicacion', 'rfid', 'año_instalacion', 'observaciones',
];

// Valores válidos para el campo tipo_activo
const ASSET_TYPE_VALUES = [
  'MDF', 'IDF', 'RACK', 'SWITCH', 'BACKBONE',
  'UPS', 'PDU', 'PATCH_PANEL', 'NODE',
];

// Una fila de ejemplo por cada tipo de activo
const TEMPLATE_ROWS: string[][] = [
  ['MDF Principal Piso 1',      'MDF',         'Panduit',  'WMPH2',          'MDF-001', 'active', 'Edificio A Piso 1', '',         '2023', 'Gabinete principal de distribución'],
  ['IDF Piso 3 Ala Norte',      'IDF',         'Panduit',  'WMPH1',          'IDF-003', 'active', 'Edificio A Piso 3', '',         '2023', 'Distribución intermedia norte'],
  ['Rack 42U Sala Servidores',  'RACK',        'APC',      'AR3100',         'RK-001',  'active', 'Sala Servidores',   '',         '2022', 'Rack principal de servidores'],
  ['Switch Core MDF',           'SWITCH',      'Cisco',    'Catalyst 9300',  'SW-001',  'active', 'MDF Piso 1',        '',         '2024', 'Switch core de distribución'],
  ['Backbone Fibra Piso 1-3',   'BACKBONE',    'Panduit',  'OPTICOM',        'BB-001',  'active', 'Canaleta vertical', '',        '2023', 'Cableado troncal multimodo'],
  ['UPS Sala Servidores 10kVA', 'UPS',         'APC',      'Smart-UPS 10000','UPS-001', 'active', 'Sala Servidores',   '',         '2021', 'UPS principal sala de servidores'],
  ['PDU Rack 01',               'PDU',         'APC',      'AP7930',         'PDU-001', 'active', 'Sala Servidores',   '',         '2022', 'Distribución de energía rack 01'],
  ['Patch Panel 24p Cat6A',     'PATCH_PANEL', 'Panduit',  'CPPL24WBLY',     'PP-001',  'active', 'MDF Piso 1',        '',         '2023', 'Panel de parcheo 24 puertos'],
  ['Servidor Blade HP',         'NODE',        'HP',       'ProLiant BL460c','SRV-001', 'active', 'Sala Servidores',   'RFID-001', '2022', 'Servidor de aplicaciones'],
];

type Step = 'select' | 'uploading' | 'result';

export function ImportModal({ onClose, onSuccess }: ImportModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedMimes = ACCEPTED_FORMATS.map(f => f.mime).join(',');
  const acceptedExts = ACCEPTED_FORMATS.map(f => f.ext).join(',');

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const validExts = ACCEPTED_FORMATS.map(f => f.ext);
    if (!validExts.includes(ext)) {
      return `Formato no soportado: ${ext}. Use: ${validExts.join(', ')}`;
    }
    if (file.size > 100 * 1024 * 1024) {
      return 'El archivo supera el límite de 100 MB.';
    }
    return null;
  };

  const handleFile = (file: File) => {
    setError('');
    const err = validateFile(file);
    if (err) { setError(err); return; }
    setSelectedFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setStep('uploading');
    setError('');
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      const res = await fetch('/api/import/inventory', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.error?.message ||
          data.message ||
          `Error ${res.status}`
        );
      }
      // Backend devuelve { success, data: { import_id, filename, file_type, status } }
      setResult(data.data ?? data);
      setStep('result');
    } catch (err: any) {
      setError(err.message ?? 'Error al importar');
      setStep('select');
    }
  };

  const downloadTemplate = () => {
    // Encabezado con los nombres de columna
    const header = TEMPLATE_COLUMNS.join(',');
    // Una fila de ejemplo por cada tipo de activo, con valores entre comillas para soportar comas
    const rows = TEMPLATE_ROWS.map(row =>
      row.map(v => `"${v.replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    // Comentario informativo al inicio del archivo
    const info = [
      '# PLANTILLA DE IMPORTACIÓN — SKIA DCIM',
      `# Tipos de activo válidos: ${ASSET_TYPE_VALUES.join(' | ')}`,
      `# Estados válidos: active | maintenance | inactive | obsolete`,
      '# Elimina estas líneas de comentario antes de importar',
    ].map(l => `"${l}"`).join(',') + '\n';
    // No incluir comentarios en el CSV final (algunos parsers los rechazan)
    const csv = `\uFEFF${header}\n${rows}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'plantilla_inventario_skia.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const formatForFile = (file: File) =>
    ACCEPTED_FORMATS.find(f => file.name.toLowerCase().endsWith(f.ext));

  const fileFmt = selectedFile ? formatForFile(selectedFile) : null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#E8EBF4] w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EBF4]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
              <Upload size={16} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-[#1A1D2E]">Importar Inventario</h2>
              <p className="text-[11px] text-[#5C6194]">Carga masiva de activos desde archivo</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* ── STEP: SELECCIONAR ARCHIVO ── */}
          {step === 'select' && (
            <>
              {/* Formatos aceptados */}
              <div>
                <p className="text-xs font-bold text-[#5C6194] uppercase tracking-wider mb-3">
                  Formatos aceptados
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ACCEPTED_FORMATS.map(fmt => (
                    <div key={fmt.ext}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${fmt.color}`}>
                      {fmt.icon}
                      <div>
                        <p className="text-xs font-bold text-[#1A1D2E]">{fmt.label}</p>
                        <p className="text-[10px] text-[#5C6194]">{fmt.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Zona drag & drop */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative flex flex-col items-center justify-center gap-3 p-8
                  border-2 border-dashed rounded-2xl cursor-pointer transition-all
                  ${dragOver
                    ? 'border-blue-400 bg-blue-50'
                    : selectedFile
                      ? 'border-emerald-300 bg-emerald-50/50'
                      : 'border-[#D0D5F0] bg-slate-50/60 hover:border-blue-300 hover:bg-blue-50/30'
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptedExts}
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                {selectedFile ? (
                  <>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${fileFmt?.badge ?? 'bg-slate-100'}`}>
                      {fileFmt?.icon ?? <File size={22} />}
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-sm text-[#1A1D2E]">{selectedFile.name}</p>
                      <p className="text-[11px] text-[#5C6194] mt-0.5">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                        {fileFmt && <span className="ml-2 font-semibold text-emerald-600">{fileFmt.label}</span>}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedFile(null); }}
                      className="text-[11px] text-slate-400 hover:text-red-500 underline transition-colors"
                    >
                      Cambiar archivo
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
                      <Upload size={22} className="text-blue-500" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-sm text-[#1A1D2E]">
                        Arrastra tu archivo aquí
                      </p>
                      <p className="text-[11px] text-[#5C6194] mt-0.5">
                        o haz clic para seleccionar
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        CSV, Excel (.xlsx/.xls), JSON, PDF · Máx. 100 MB
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {/* Info de columnas */}
              <div className="bg-slate-50 border border-[#E8EBF4] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Table2 size={13} className="text-blue-500" />
                  <p className="text-xs font-bold text-[#1A1D2E]">Columnas esperadas en CSV/Excel</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_COLUMNS.map(col => (
                    <span key={col}
                      className="px-2 py-0.5 bg-white border border-[#E8EBF4] rounded-md text-[10px] font-mono text-slate-600">
                      {col}
                    </span>
                  ))}
                </div>

                {/* Tipos de activo válidos */}
                <div className="mt-3 pt-3 border-t border-[#E8EBF4]">
                  <p className="text-[10px] font-bold text-[#5C6194] uppercase tracking-wider mb-1.5">
                    Valores válidos para <span className="font-mono normal-case">tipo_activo</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ASSET_TYPE_VALUES.map(t => (
                      <span key={t}
                        className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-md text-[10px] font-mono text-blue-700">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Estados válidos */}
                <div className="mt-2">
                  <p className="text-[10px] font-bold text-[#5C6194] uppercase tracking-wider mb-1.5">
                    Valores válidos para <span className="font-mono normal-case">estado</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { v: 'active',      label: 'Activo',          cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                      { v: 'maintenance', label: 'Mantenimiento',   cls: 'bg-amber-50 border-amber-200 text-amber-700' },
                      { v: 'inactive',    label: 'Inactivo',        cls: 'bg-slate-100 border-slate-300 text-slate-600' },
                      { v: 'obsolete',    label: 'Obsoleto/Baja',   cls: 'bg-red-50 border-red-200 text-red-600' },
                    ].map(s => (
                      <span key={s.v}
                        className={`px-2 py-0.5 border rounded-md text-[10px] font-mono ${s.cls}`}>
                        {s.v}
                        <span className="ml-1 font-sans text-[9px] opacity-70">({s.label})</span>
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={downloadTemplate}
                  className="mt-3 flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                >
                  <Download size={11} /> Descargar plantilla completa — 9 tipos de activo (.csv)
                </button>
              </div>

              {/* Nota PDF */}
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-700">
                <Info size={12} className="flex-shrink-0 mt-0.5" />
                <span>
                  Los archivos <strong>PDF</strong> son procesados con IA para extraer el inventario automáticamente.
                  El resultado puede requerir revisión manual antes de confirmar la importación.
                </span>
              </div>

              {/* Acciones */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 border border-[#E8EBF4] rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-[#4361EE] rounded-xl hover:bg-[#3451D1] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  <Upload size={14} /> Importar ahora
                  <ChevronRight size={14} />
                </button>
              </div>
            </>
          )}

          {/* ── STEP: SUBIENDO ── */}
          {step === 'uploading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 size={36} className="text-blue-500 animate-spin" />
              <div className="text-center">
                <p className="font-bold text-sm text-[#1A1D2E]">Procesando archivo...</p>
                <p className="text-[11px] text-[#5C6194] mt-1">
                  {selectedFile?.name}
                </p>
              </div>
              <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full animate-pulse w-3/4" />
              </div>
            </div>
          )}

          {/* ── STEP: RESULTADO ── */}
          {step === 'result' && result && (
            <>
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle size={20} className="text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="font-bold text-sm text-emerald-800">Importación iniciada correctamente</p>
                  <p className="text-[11px] text-emerald-600 mt-0.5">
                    El archivo fue recibido y está siendo procesado en segundo plano.
                  </p>
                </div>
              </div>

              {(result.import_id || result.importId) && (
                <div className="bg-slate-50 border border-[#E8EBF4] rounded-xl p-4 space-y-2">
                  <p className="text-xs font-bold text-[#5C6194] uppercase tracking-wider">Detalles</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#5C6194]">ID de importación:</span>
                      <span className="font-mono text-[#1A1D2E] text-[10px]">{(result.import_id ?? result.importId)?.slice(0, 12)}...</span>
                    </div>
                    {result.totalRows != null && (
                      <div className="flex justify-between">
                        <span className="text-[#5C6194]">Filas detectadas:</span>
                        <span className="font-bold text-[#1A1D2E]">{result.totalRows}</span>
                      </div>
                    )}
                    {result.validRows != null && (
                      <div className="flex justify-between">
                        <span className="text-[#5C6194]">Filas válidas:</span>
                        <span className="font-bold text-emerald-600">{result.validRows}</span>
                      </div>
                    )}
                    {result.errorRows != null && result.errorRows > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[#5C6194]">Con errores:</span>
                        <span className="font-bold text-red-500">{result.errorRows}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-700">
                <Info size={12} className="flex-shrink-0 mt-0.5" />
                <span>
                  Puedes revisar el estado detallado de la importación en
                  <strong className="ml-1">Infraestructura → Dashboard Importación</strong>.
                </span>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { onSuccess(); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-[#4361EE] rounded-xl hover:bg-[#3451D1] transition-colors shadow-sm"
                >
                  <CheckCircle size={14} /> Cerrar y actualizar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
