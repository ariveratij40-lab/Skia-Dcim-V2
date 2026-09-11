import axios from 'axios';

export type MountMode = 'RACK_MOUNTED' | 'ROOM_MOUNTED';

const messages: Record<string, string> = {
  INVALID_PAYLOAD: 'Los datos enviados no son válidos.',
  DISTRIBUTION_POINT_NOT_FOUND: 'El MDF/IDF seleccionado ya no está disponible.',
  HOUSING_RACK_NOT_FOUND: 'El rack seleccionado ya no está disponible.',
  PLACEMENT_NOT_FOUND: 'La ubicación seleccionada ya no está disponible.',
  CANONICAL_RELOCATION_CONFLICT: 'La reubicación requiere el flujo dedicado.',
  INCOMPATIBLE_HOUSING: 'El alojamiento no es compatible con este activo.',
  PHYSICAL_SCOPE_MISMATCH: 'El alojamiento no pertenece a la sucursal activa.',
  INVALID_PARENT_TYPE: 'El padre seleccionado no es válido para este activo.',
  INVALID_MOUNT_MODE: 'El modo de instalación no es válido.',
  HOUSING_REQUIRED: 'Debe seleccionar el alojamiento requerido.',
  HOUSING_FORBIDDEN: 'Este modo no permite el alojamiento enviado.',
};

export function canonicalHousingError(error: unknown): { code: string; message: string } {
  if (!axios.isAxiosError(error)) return { code: 'UNKNOWN_ERROR', message: 'No fue posible guardar. Intenta nuevamente.' };
  const raw = error.response?.data?.error;
  const code = typeof raw === 'string' ? raw.toUpperCase() : 'UNKNOWN_ERROR';
  return { code, message: messages[code] ?? 'No fue posible guardar. Verifica el contexto físico e intenta nuevamente.' };
}

export function upsHousingPayload(mode: MountMode, housingRackID: string, placementID: string) {
  return mode === 'RACK_MOUNTED'
    ? { mount_mode: mode, housing_rack_id: housingRackID, placement_id: undefined }
    : { mount_mode: mode, housing_rack_id: undefined, placement_id: placementID };
}

export const rackHousingPayload = (mdfIdfID: string) => ({ mdf_idf_id: mdfIdfID });
export const equipmentHousingPayload = (housingRackID: string) => ({ housing_rack_id: housingRackID });
export const resetCanonicalHousing = () => ({ mdf_idf_id: '', housing_rack_id: '', placement_id: '' });
