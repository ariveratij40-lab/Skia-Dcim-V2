'use client';

import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import AppLayout from '@/components/AppLayout';

const ASSET_TYPES = [
  { value: 'activos', label: 'Activos', icon: '📦', desc: 'Equipos y dispositivos generales' },
  { value: 'racks', label: 'Racks', icon: '🗄️', desc: 'Gabinetes y racks' },
  { value: 'switches', label: 'Switches', icon: '🔌', desc: 'Equipos de red' },
  { value: 'ups_pdu', label: 'UPS/PDU', icon: '⚡', desc: 'Sistemas de energía' },
  { value: 'mdf_idf', label: 'MDF/IDF', icon: '📡', desc: 'Distribuidores principales' },
  { value: 'patch_panels', label: 'Patch Panels', icon: '🔗', desc: 'Paneles de parcheo' },
  { value: 'backbone', label: 'Backbone', icon: '🌐', desc: 'Infraestructura de red' },
  { value: 'nodos', label: 'Nodos', icon: '🎯', desc: 'Puntos de red' },
];

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

export default function ImportInventoryPage() {
  const [step, setStep] = useState(1); // 1: Seleccionar tipo, 2: Subir PDF, 3: Progreso, 4: Resultado
  const [selectedAssetType, setSelectedAssetType] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [jobId, setJobId] = useState('');

  const handleAssetTypeSelect = (type: string) => {
    setSelectedAssetType(type);
    setStep(2);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type === 'application/pdf' || file.name.endsWith('.pdf'))) {
      setPdfFile(file);
      setError('');
    } else {
      setError('Por favor selecciona un archivo PDF válido');
      setPdfFile(null);
    }
  };

  const uploadChunks = async (uploadId: string, file: File) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      const formData = new FormData();
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', i.toString());
      formData.append('totalChunks', totalChunks.toString());
      formData.append('chunk', chunk);
      
      const response = await fetch('/api/import/upload/chunk', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`Error uploading chunk ${i + 1}/${totalChunks}`);
      }
      
      setProgress(Math.round((i / totalChunks) * 30)); // 0-30% para chunks
      setProgressMessage(`Subiendo fragmento ${i + 1} de ${totalChunks}...`);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    let isComplete = false;
    let attempts = 0;
    const maxAttempts = 300; // 5 minutos con polling cada segundo
    
    while (!isComplete && attempts < maxAttempts) {
      const response = await fetch(`/api/import/upload/status/${jobId}`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Error getting job status');
      }
      
      const job = await response.json();
      
      setProgress(30 + Math.round((job.progress / 100) * 70)); // 30-100%
      setProgressMessage(job.message || 'Procesando...');
      
      if (job.status === 'done') {
        // Parse result JSON if it's a string
        let resultData = job.result;
        if (typeof job.result === 'string') {
          try {
            resultData = JSON.parse(job.result);
          } catch (e) {
            resultData = { items: [] };
          }
        }
        setExtractedData(resultData);
        setImportedCount(job.itemsExtracted || 0);
        setSuccess(true);
        isComplete = true;
      } else if (job.status === 'error') {
        throw new Error(job.message || 'Error processing file');
      }
      
      if (!isComplete) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        attempts++;
      }
    }
    
    if (!isComplete) {
      throw new Error('Job processing timeout');
    }
  };

  const handleUploadAndExtract = async () => {
    if (!pdfFile || !selectedAssetType) {
      setError('Falta seleccionar archivo o tipo de activo');
      return;
    }

    setLoading(true);
    setError('');
    setProgress(0);
    setProgressMessage('Iniciando carga...');
    setStep(3);

    try {
      // Step 1: Start upload session
      setProgressMessage('Iniciando sesión de carga...');
      const totalChunks = Math.ceil(pdfFile.size / CHUNK_SIZE);
      
      const startResponse = await fetch('/api/import/upload/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: pdfFile.name,
          totalChunks: totalChunks,
        }),
        credentials: 'include',
      });

      if (!startResponse.ok) {
        throw new Error('Error starting upload session');
      }

      const startData = await startResponse.json();
      const uploadId = startData.uploadId;

      setProgress(5);

      // Step 2: Upload chunks
      setProgressMessage('Subiendo archivo...');
      await uploadChunks(uploadId, pdfFile);

      setProgress(35);

      // Step 3: Process file
      setProgressMessage('Procesando archivo...');
      const processResponse = await fetch('/api/import/upload/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, fileName: pdfFile.name, totalChunks }),
        credentials: 'include',
      });

      if (!processResponse.ok) {
        throw new Error('Error processing file');
      }

      const processData = await processResponse.json();
      const newJobId = processData.jobId;
      setJobId(newJobId);

      // Step 4: Poll for completion
      setProgressMessage('Extrayendo datos...');
      await pollJobStatus(newJobId);

      setProgress(100);
      setStep(4);
    } catch (err: any) {
      setError(err.message || 'Error al procesar el archivo');
      setSuccess(false);
      setStep(4);
    } finally {
      setLoading(false);
    }
  };

  const assetTypeInfo = ASSET_TYPES.find(t => t.value === selectedAssetType);

  return (
    <AppLayout breadcrumb={[
      { label: 'Infraestructura' },
      { label: 'Importar Inventario' }
    ]}>
      <div className="max-w-4xl mx-auto">
        {/* Encabezado */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-[#1A1D2E] tracking-tight">Importar Inventario</h1>
          <p className="text-sm text-[#8B92B8] mt-2">Sube un PDF con tu Memoria Técnica o documento de inventario. La IA extraerá automáticamente los datos.</p>
        </div>

        {/* Indicador de pasos */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <React.Fragment key={s}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                step >= s 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-[#E8EBF4] text-[#8B92B8]'
              }`}>
                {s}
              </div>
              {s < 4 && <div className={`flex-1 h-1 ${step > s ? 'bg-blue-600' : 'bg-[#E8EBF4]'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* PASO 1: Seleccionar tipo de activo */}
        {step === 1 && (
          <div className="bg-white border border-[#E8EBF4] rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-[#1A1D2E] mb-6">Selecciona el tipo de activo a importar</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ASSET_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => handleAssetTypeSelect(type.value)}
                  className="p-4 border border-[#E8EBF4] rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
                >
                  <div className="text-2xl mb-2">{type.icon}</div>
                  <div className="font-bold text-[#1A1D2E]">{type.label}</div>
                  <div className="text-xs text-[#8B92B8] mt-1">{type.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PASO 2: Subir PDF */}
        {step === 2 && (
          <div className="bg-white border border-[#E8EBF4] rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-[#E8EBF4]">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText size={20} className="text-blue-600" />
              </div>
              <div>
                <h2 className="font-bold text-[#1A1D2E]">{assetTypeInfo?.label}</h2>
                <p className="text-xs text-[#8B92B8]">{assetTypeInfo?.desc}</p>
              </div>
            </div>

            <div className="border-2 border-dashed border-[#E8EBF4] rounded-xl p-8 text-center mb-6 hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="hidden"
                id="pdf-upload"
              />
              <label htmlFor="pdf-upload" className="cursor-pointer">
                <Upload size={32} className="text-[#8B92B8] mx-auto mb-3" />
                <p className="font-bold text-[#1A1D2E] mb-1">
                  {pdfFile ? pdfFile.name : 'Arrastra tu PDF aquí o haz clic para seleccionar'}
                </p>
                <p className="text-xs text-[#8B92B8]">Máximo 100MB. Compatible con Memorias Técnicas e inventarios</p>
              </label>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-6">
                <AlertCircle size={16} className="text-red-600" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 px-4 py-2 border border-[#E8EBF4] rounded-lg text-[#1A1D2E] font-bold hover:bg-[#F5F6FA] transition-colors"
              >
                Atrás
              </button>
              <button
                onClick={handleUploadAndExtract}
                disabled={!pdfFile || loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    Procesar PDF
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* PASO 3: Progreso */}
        {step === 3 && (
          <div className="bg-white border border-[#E8EBF4] rounded-2xl shadow-sm p-6">
            <div className="text-center">
              <Loader2 size={48} className="text-blue-600 mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-bold text-[#1A1D2E] mb-2">Procesando tu archivo...</h2>
              <p className="text-[#8B92B8] mb-6">{progressMessage}</p>
              
              <div className="w-full bg-[#E8EBF4] rounded-full h-2 mb-4">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-[#8B92B8]">{progress}% completado</p>
            </div>
          </div>
        )}

        {/* PASO 4: Resultado */}
        {step === 4 && (
          <div className="bg-white border border-[#E8EBF4] rounded-2xl shadow-sm p-6">
            {success ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} className="text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-[#1A1D2E] mb-2">¡Importación exitosa!</h2>
                <p className="text-[#8B92B8] mb-6">Se importaron {importedCount} {assetTypeInfo?.label.toLowerCase()}</p>
                
                {extractedData?.items && (
                  <div className="bg-[#F5F6FA] rounded-lg p-4 mb-6 text-left max-h-64 overflow-y-auto">
                    <h3 className="font-bold text-[#1A1D2E] mb-3">Datos importados:</h3>
                    <div className="space-y-2">
                      {extractedData.items.slice(0, 5).map((item: any, idx: number) => (
                        <div key={idx} className="text-sm text-[#8B92B8] p-2 bg-white rounded border border-[#E8EBF4]">
                          <strong>{item.name || `Item ${idx + 1}`}</strong>
                          {item.model && ` - ${item.model}`}
                          {item.location && ` - ${item.location}`}
                        </div>
                      ))}
                      {extractedData.items.length > 5 && (
                        <p className="text-xs text-[#8B92B8] p-2">... y {extractedData.items.length - 5} más</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setStep(1);
                      setPdfFile(null);
                      setSelectedAssetType('');
                      setExtractedData(null);
                      setSuccess(false);
                      setProgress(0);
                    }}
                    className="flex-1 px-4 py-2 border border-[#E8EBF4] rounded-lg text-[#1A1D2E] font-bold hover:bg-[#F5F6FA] transition-colors"
                  >
                    Importar otro
                  </button>
                  <button
                    onClick={() => window.location.href = `/infraestructura/${selectedAssetType}`}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors"
                  >
                    Ver {assetTypeInfo?.label}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <AlertCircle size={32} className="text-red-600 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-[#1A1D2E] mb-2">Error en la importación</h2>
                <p className="text-[#8B92B8] mb-6">{error}</p>
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors"
                >
                  Intentar de nuevo
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
