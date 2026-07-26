import React, { useState } from 'react';
import { Trash2, AlertTriangle, CheckCircle, Clock, User, FileText } from 'lucide-react';

interface ClearInventoryLog {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  timestamp: string;
  action: string;
  details: string;
  status: string;
}

interface ClearInventoryResponse {
  success: boolean;
  message: string;
  deletedCount: {
    [key: string]: number;
  };
  log: ClearInventoryLog;
}

export function ClearInventoryButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState<ClearInventoryResponse | null>(null);
  const [error, setError] = useState('');

  const handleClearInventory = async () => {
    if (!adminPassword) {
      setError('La contraseña de administrador es requerida');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/inventory/clear-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(errorData || 'Error al vaciar el inventario');
      }

      const data: ClearInventoryResponse = await response.json();

      if (data.success) {
        setSuccessData(data);
        setShowSuccess(true);
        setAdminPassword('');
        setIsOpen(false);
        alert(`✅ Inventario vaciado exitosamente. Se eliminaron ${Object.values(data.deletedCount).reduce((a, b) => a + b, 0)} items`);
      } else {
        throw new Error(data.message || 'Error desconocido');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al vaciar el inventario';
      setError(errorMessage);
      alert(`❌ Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <>
      {/* Botón de Vaciar Inventario */}
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-white bg-red-600 border border-red-700 rounded-xl hover:bg-red-700 transition-all shadow-sm"
        title="Eliminar todo el inventario del tenant"
      >
        <Trash2 className="w-4 h-4" />
        Vaciar Inventario
      </button>

      {/* Modal de Confirmación */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-bold text-gray-900">Vaciar Inventario</h2>
            </div>

            {/* Descripción */}
            <div className="text-base text-gray-700">
              ⚠️ Esta acción eliminará <strong>TODO</strong> el inventario existente del tenant:
              <ul className="mt-3 space-y-1 text-sm">
                <li>• Todos los Activos</li>
                <li>• Todos los Racks</li>
                <li>• Todos los Patch Panels</li>
                <li>• Todos los Jobs de Importación</li>
                <li>• Todos los Items Importados</li>
              </ul>
              <p className="mt-3 font-semibold text-red-600">
                Esta acción NO se puede deshacer.
              </p>
            </div>

            {/* Formulario de Contraseña */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">
                Contraseña de Administrador
              </label>
              <input
                type="password"
                placeholder="Ingresa la contraseña de administrador"
                value={adminPassword}
                onChange={(e) => {
                  setAdminPassword(e.target.value);
                  setError('');
                }}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100"
              />
              {error && (
                <p className="text-sm text-red-500 mt-2">{error}</p>
              )}
            </div>

            {/* Botones de Acción */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setAdminPassword('');
                  setError('');
                }}
                disabled={isLoading}
                className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearInventory}
                disabled={isLoading || !adminPassword}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Eliminando...' : 'Confirmar Eliminación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Éxito */}
      {showSuccess && successData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  ✅ Inventario Vaciado Exitosamente
                </h2>
                <p className="text-gray-600 text-sm">
                  {successData.message}
                </p>
              </div>
            </div>

            {/* Resumen de Eliminación */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-3">
                Resumen de Eliminación:
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(successData.deletedCount).map(([key, count]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-gray-700 capitalize">
                      {key.replace(/_/g, ' ')}:
                    </span>
                    <span className="font-semibold text-blue-600">{count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-blue-200 flex justify-between font-semibold">
                <span>Total Eliminado:</span>
                <span className="text-blue-600">
                  {Object.values(successData.deletedCount).reduce((a, b) => a + b, 0)} items
                </span>
              </div>
            </div>

            {/* Log de Auditoría */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Log de Auditoría
              </h3>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">Usuario:</span>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                    {successData.log.userEmail}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">Fecha y Hora:</span>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                    {formatDate(successData.log.timestamp)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <span className="text-gray-600">Detalles:</span>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">
                    {successData.log.details}
                  </span>
                </div>

                <div className="flex gap-2">
                  <span className="text-gray-600">ID de Log:</span>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs truncate">
                    {successData.log.id}
                  </span>
                </div>
              </div>
            </div>

            {/* Botón de Cierre */}
            <button
              onClick={() => {
                setShowSuccess(false);
                setSuccessData(null);
                window.location.reload();
              }}
              className="w-full px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              Cerrar y Recargar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
