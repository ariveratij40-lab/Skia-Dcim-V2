import { useState } from 'react';
import AssetPlacementSelector, { AssetPlacement } from './AssetPlacementSelector';
import NomenclatureCodeField from './NomenclatureCodeField';
import axios from 'axios';

interface Props {
  assetType: string;
  placementID: string;
  placement?: AssetPlacement;
  onPlacementChange: (id: string, placement?: AssetPlacement) => void;
  onNomenclatureAvailability: (available: boolean) => void;
  onBranchChange?: (branchID: string) => void;
}

export async function placementMatchesActiveBranch(branchID: string, placementID: string) {
  if (!branchID || !placementID) return false;
  const response = await axios.get('/api/dcim/placements');
  return response.data?.branch_id === branchID && (response.data?.placements ?? []).some((item: AssetPlacement) => item.id === placementID);
}

export default function AssetPlacementStep({ assetType, placementID, placement, onPlacementChange, onNomenclatureAvailability, onBranchChange }: Props) {
  const [branchID, setBranchID] = useState('');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ padding: 12, borderRadius: 10, background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', fontSize: 13 }}>
        Selecciona primero la sucursal y después una ubicación registrada. La identidad técnica se genera a partir de este contexto.
      </div>
      <AssetPlacementSelector assetType={assetType} value={placementID} onBranchChange={id=>{setBranchID(id);onBranchChange?.(id)}} onChange={onPlacementChange} />
      <NomenclatureCodeField assetType={assetType} branchSelected={Boolean(branchID)} placementCode={placement?.canonical_code} onAvailability={onNomenclatureAvailability} />
      {placement?.type === 'WAREHOUSE' && (
        <div style={{ padding: 12, borderRadius: 10, background: '#FFF7ED', border: '1px solid #FDBA74', color: '#9A3412', fontWeight: 700, fontSize: 13 }}>
          Activo en Almacén — se registrará como inactivo.
        </div>
      )}
    </div>
  );
}
