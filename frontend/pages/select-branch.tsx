'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { MapPin, CheckCircle2 } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  city: string;
  status: string;
}

export default function SelectBranchPage() {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadBranches = async () => {
      try {
        // Simular carga de sucursales
        const mockBranches: Branch[] = [
          {
            id: '550e8400-e29b-41d4-a716-446655440201',
            name: 'Sede Principal - Miami',
            city: 'Miami, FL',
            status: 'active'
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440202',
            name: 'Centro de Datos - Nueva York',
            city: 'Nueva York, NY',
            status: 'active'
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440203',
            name: 'Oficina Regional - Texas',
            city: 'Dallas, TX',
            status: 'active'
          }
        ];
        setBranches(mockBranches);
      } catch (err) {
        setError('Error cargando sucursales');
      } finally {
        setLoading(false);
      }
    };

    loadBranches();
  }, []);

  const handleSelectBranch = async (branchId: string) => {
    setSelectedBranch(branchId);
    try {
      await axios.post('/api/auth/select-branch', { branchId: branchId });
      localStorage.setItem('selected_branch', branchId);
      
      // Pequeña pausa para animación
      setTimeout(() => {
        router.push('/dashboard');
      }, 500);
    } catch (err) {
      setError('Error seleccionando sucursal');
      setSelectedBranch(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Cargando sucursales...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-gray-50 p-4">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-72 h-72 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      </div>

      <div className="relative max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Selecciona sucursal</h1>
          <p className="text-gray-500">Elige la sucursal o centro de datos donde trabajarás en SKIA</p>
        </div>

        {/* Branches Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {branches.map((branch) => (
            <button
              key={branch.id}
              onClick={() => handleSelectBranch(branch.id)}
              disabled={selectedBranch !== null && selectedBranch !== branch.id}
              className={`relative p-6 rounded-xl border-2 transition-all duration-300 group ${
                selectedBranch === branch.id
                  ? 'bg-blue-50 border-blue-500 shadow-xl scale-105'
                  : 'bg-white/70 border-gray-200 hover:border-blue-300 hover:shadow-lg hover:scale-102'
              } ${selectedBranch !== null && selectedBranch !== branch.id ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex flex-col gap-4">
                {/* Icon & Status */}
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center group-hover:shadow-lg transition-all">
                    <MapPin className="w-6 h-6 text-white" />
                  </div>
                  {branch.status === 'active' && (
                    <div className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      Activo
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="text-left">
                  <h3 className="font-semibold text-gray-900 text-sm">{branch.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{branch.city}</p>
                </div>

                {/* Selection Indicator */}
                {selectedBranch === branch.id && (
                  <div className="pt-2 border-t border-blue-200">
                    <p className="text-xs text-blue-600 font-medium">✓ Seleccionado</p>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Info */}
        <div className="mt-12 text-center text-sm text-gray-500">
          <p>Selecciona una sucursal para acceder a SKIA</p>
        </div>
      </div>
    </div>
  );
}
