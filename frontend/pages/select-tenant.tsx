'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Building2, ChevronRight } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  logo?: string;
}

export default function SelectTenantPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadTenants = async () => {
      try {
        // Primero intentar obtener del localStorage
        const storedTenants = localStorage.getItem('tenants');
        if (storedTenants) {
          const parsed = JSON.parse(storedTenants);
          setTenants(parsed);
          setLoading(false);
          return;
        }

        // Si no hay en localStorage, obtener del servidor
        const response = await axios.get('/api/auth/tenants');
        if (response.data.tenants) {
          setTenants(response.data.tenants);
          localStorage.setItem('tenants', JSON.stringify(response.data.tenants));
        }
      } catch (err) {
        console.error('Error cargando tenants:', err);
        setError('Error cargando organizaciones');
      } finally {
        setLoading(false);
      }
    };

    loadTenants();
  }, []);

  const handleSelectTenant = async (tenantId: string) => {
    setSelectedTenant(tenantId);
    try {
      await axios.post('/api/auth/select-tenant', { tenantId: tenantId });
      localStorage.setItem('selected_tenant', tenantId);
      router.push('/select-branch');
    } catch (err) {
      console.error('Error seleccionando tenant:', err);
      setError('Error seleccionando organización');
      setSelectedTenant(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Cargando organizaciones...</p>
        </div>
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No hay organizaciones disponibles</p>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Volver al login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-gray-50 p-4">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-72 h-72 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      </div>

      <div className="relative max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Selecciona organización</h1>
          <p className="text-gray-500">Elige la organización con la que deseas trabajar en SKIA</p>
        </div>

        {/* Tenants Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              onClick={() => handleSelectTenant(tenant.id)}
              disabled={selectedTenant !== null && selectedTenant !== tenant.id}
              className={`relative p-6 rounded-xl border-2 transition-all duration-300 ${
                selectedTenant === tenant.id
                  ? 'bg-blue-50 border-blue-500 shadow-lg'
                  : 'bg-white/70 border-gray-200 hover:border-blue-300 hover:shadow-md'
              } ${selectedTenant !== null && selectedTenant !== tenant.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
                    <p className="text-sm text-gray-500">ID: {tenant.id.substring(0, 8)}</p>
                  </div>
                </div>
                {selectedTenant === tenant.id && (
                  <ChevronRight className="w-5 h-5 text-blue-600 animate-pulse" />
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
          <p>Selecciona una organización para acceder a SKIA</p>
        </div>
      </div>
    </div>
  );
}
