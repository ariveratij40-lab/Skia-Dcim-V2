export type RelocatableAssetType = 'MDF' | 'IDF' | 'RACK' | 'PATCH_PANEL' | 'SWITCH' | 'PDU' | 'UPS';
export type CanonicalMountMode = 'NONE' | 'RACK_MOUNTED' | 'ROOM_MOUNTED';

export interface RelocatableAsset {
  id: string;
  code: string;
  name: string;
  asset_type: RelocatableAssetType;
  location_id: string;
  housing_rack_id: string;
  mount_mode: CanonicalMountMode;
  distribution_point_id: string;
}

export interface CanonicalRelocationPayload {
  asset_id: string;
  distribution_point_id?: string;
  housing_rack_id?: string;
  mount_mode?: CanonicalMountMode;
  placement_id?: string;
  zone_id?: string;
  site_id?: string;
  internal_area_id?: string;
}

export interface RelocationDestination {
  distributionPointID?: string;
  housingRackID?: string;
  mountMode?: CanonicalMountMode;
  placementID?: string;
  zoneID?: string;
  siteID?: string;
  internalAreaID?: string;
}

export function buildCanonicalRelocationPayload(asset: RelocatableAsset, destination: RelocationDestination): CanonicalRelocationPayload {
  const payload: CanonicalRelocationPayload = { asset_id: asset.id };
  switch (asset.asset_type) {
    case 'MDF':
    case 'IDF':
      if (!destination.zoneID) throw new Error('ZONE_REQUIRED');
      payload.zone_id = destination.zoneID;
      if (destination.siteID) payload.site_id = destination.siteID;
      if (destination.internalAreaID) payload.internal_area_id = destination.internalAreaID;
      return payload;
    case 'RACK':
      if (!destination.distributionPointID) throw new Error('DISTRIBUTION_POINT_REQUIRED');
      payload.distribution_point_id = destination.distributionPointID;
      return payload;
    case 'PATCH_PANEL':
    case 'SWITCH':
    case 'PDU':
      if (!destination.housingRackID) throw new Error('HOUSING_RACK_REQUIRED');
      payload.housing_rack_id = destination.housingRackID;
      return payload;
    case 'UPS': {
      if (destination.mountMode === 'RACK_MOUNTED') {
        if (!destination.housingRackID) throw new Error('HOUSING_RACK_REQUIRED');
        payload.mount_mode = 'RACK_MOUNTED';
        payload.housing_rack_id = destination.housingRackID;
        return payload;
      }
      if (destination.mountMode === 'ROOM_MOUNTED') {
        if (!destination.placementID) throw new Error('PLACEMENT_REQUIRED');
        payload.mount_mode = 'ROOM_MOUNTED';
        payload.placement_id = destination.placementID;
        return payload;
      }
      throw new Error('MOUNT_MODE_REQUIRED');
    }
  }
}

const messages: Record<string, string> = {
  INVALID_PAYLOAD: 'El destino no corresponde con el tipo de activo.',
  ASSET_NOT_FOUND: 'El activo ya no está disponible en la sucursal activa.',
  RELOCATION_UNSUPPORTED: 'Este tipo de activo no admite relocalización canónica.',
  DISTRIBUTION_POINT_NOT_FOUND: 'El MDF/IDF destino no está disponible en la sucursal activa.',
  HOUSING_RACK_NOT_FOUND: 'El Rack destino no está disponible en la sucursal activa.',
  PLACEMENT_NOT_FOUND: 'La ubicación destino no está disponible en la sucursal activa.',
  ZONE_REQUIRED: 'Debe seleccionar una Zona canónica.',
  ZONE_NOT_FOUND: 'La Zona destino no está disponible en la sucursal activa.',
  INVALID_ASSET_PLACEMENT: 'La ubicación física del activo no es válida para esta operación.',
  PHYSICAL_SCOPE_MISMATCH: 'El destino no pertenece al mismo contexto físico autorizado.',
  INCOMPATIBLE_HOUSING: 'El alojamiento seleccionado es incompatible con el activo.',
  INVALID_PARENT_TYPE: 'El padre físico seleccionado no es válido.',
  INVALID_MOUNT_MODE: 'El modo de montaje no es válido.',
  HOUSING_REQUIRED: 'Debe seleccionar un Rack de alojamiento.',
  HOUSING_FORBIDDEN: 'El modo seleccionado no permite Rack de alojamiento.',
  CANONICAL_RELOCATION_CONFLICT: 'La operación dejaría el grafo físico en un estado inconsistente.',
  legacy_relocation_not_supported: 'El activo usa una ubicación legacy y requiere remediación antes de relocalizarse.',
};

export function canonicalRelocationError(error: any): { code: string; message: string } {
  const code = String(error?.response?.data?.error || error?.message || 'UNKNOWN_ERROR');
  return { code, message: messages[code] || 'No fue posible completar la relocalización.' };
}
