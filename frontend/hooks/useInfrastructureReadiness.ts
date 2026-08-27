import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { beginReadinessRequest, rejectReadinessRequest, resolveReadinessRequest, type ReadinessRequestState } from './infrastructureReadinessState';

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
  const [state, setState] = useState<ReadinessRequestState<InfrastructureReadiness>>({ data: null, loading: false, error: null, requestID: 0 });
  const requestVersion = useRef(0);

  const refetch = useCallback(async () => {
    if (!enabled) return null;
    const version = ++requestVersion.current;
    setState(previous => beginReadinessRequest(previous, version));
    try {
      const response = await axios.get<InfrastructureReadiness>('/api/dcim/readiness');
      setState(previous => resolveReadinessRequest(previous, version, response.data));
      return response.data;
    } catch (requestError: any) {
      setState(previous => rejectReadinessRequest(previous, version, requestError?.response?.status));
      return null;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setState({ data: null, loading: false, error: null, requestID: ++requestVersion.current }); return; }
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

  return { data: state.data, loading: state.loading, error: state.error, refetch };
}
