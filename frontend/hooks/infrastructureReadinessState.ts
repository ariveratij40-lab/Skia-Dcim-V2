export interface ReadinessRequestState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  requestID: number;
}

export function beginReadinessRequest<T>(state: ReadinessRequestState<T>, requestID: number): ReadinessRequestState<T> {
  return { ...state, data: null, loading: true, error: null, requestID };
}

export function resolveReadinessRequest<T>(state: ReadinessRequestState<T>, requestID: number, data: T): ReadinessRequestState<T> {
  return state.requestID === requestID ? { data, loading: false, error: null, requestID } : state;
}

export function readinessErrorMessage(status?: number): string {
  if (status === 409) return 'Seleccione una sucursal para continuar.';
  if (status === 403) return 'No hay una sucursal autorizada disponible.';
  return 'No se pudo consultar la configuración de infraestructura.';
}

export function rejectReadinessRequest<T>(state: ReadinessRequestState<T>, requestID: number, status?: number): ReadinessRequestState<T> {
  return state.requestID === requestID
    ? { data: null, loading: false, error: readinessErrorMessage(status), requestID }
    : state;
}
