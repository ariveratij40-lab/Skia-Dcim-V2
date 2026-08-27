import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export type ReadinessStatus = 'complete' | 'pending' | 'blocked' | 'available' | 'optional';
export type ReadinessActionTarget = 'site_create' | 'internal_area_create' | 'mdf_idf_create' | 'rack_create';

export interface InfrastructureReadinessStep {
  key: 'branch' | 'site' | 'internal_area' | 'mdf_idf' | 'rack';
  status: ReadinessStatus;
  count: number;
  required: boolean;
  message: string;
  action: { kind: 'open'; target: ReadinessActionTarget } | null;
  unresolved_count?: number;
}

export interface InfrastructureReadiness {
  branch: { id: string; code: string; name: string };
  ready: boolean;
  progress: { required_complete: number; required_total: number; percent: number };
  steps: InfrastructureReadinessStep[];
}

export default function useInfrastructureReadiness(enabled = true) {
  const router = useRouter();
  const [data, setData] = useState<InfrastructureReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const refetch = useCallback(async () => {
    if (!enabled) return null;
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<InfrastructureReadiness>('/api/dcim/readiness');
      if (requestVersion.current === version) setData(response.data);
      return response.data;
    } catch (requestError: any) {
      if (requestVersion.current === version) {
        setData(null);
        const status = requestError?.response?.status;
        setError(status === 409 ? 'Seleccione una sucursal para continuar.' : status === 403 ? 'No hay una sucursal autorizada disponible.' : 'No se pudo consultar la configuración de infraestructura.');
      }
      return null;
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setData(null); return; }
    void refetch();
    const refresh = () => { void refetch(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('skia:branch-changed', refresh);
    window.addEventListener('skia:infrastructure-changed', refresh);
    router.events.on('routeChangeComplete', refresh);
    return () => {
      requestVersion.current++;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('skia:branch-changed', refresh);
      window.removeEventListener('skia:infrastructure-changed', refresh);
      router.events.off('routeChangeComplete', refresh);
    };
  }, [enabled, refetch, router.events]);

  return { data, loading, error, refetch };
}
