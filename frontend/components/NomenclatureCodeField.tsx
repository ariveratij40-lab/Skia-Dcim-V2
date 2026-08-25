import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

interface Props {
  assetType: string;
  onAvailability?: (available: boolean) => void;
  placementCode?: string;
}

export default function NomenclatureCodeField({ assetType, onAvailability, placementCode }: Props) {
  const [preview, setPreview] = useState('');
  const [available, setAvailable] = useState(false);

  const loadRule = useCallback(() => {
    setAvailable(false);
    setPreview('');
    axios.get('/api/dcim/catalogs/naming-rules').then(res => {
      const rules = res.data?.naming_rules ?? [];
      const rule = rules.find((item: { asset_type_code: string; active: boolean }) =>
        item.asset_type_code === assetType && item.active,
      );
      const nextAvailable = Boolean(rule);
      setAvailable(nextAvailable);
      setPreview((rule?.next_code_preview ?? '').replace('PLACEMENT',placementCode||'UBICACIÓN'));
      onAvailability?.(nextAvailable);
    }).catch(() => {
      setAvailable(false);
      onAvailability?.(false);
    });
  }, [assetType, onAvailability, placementCode]);

  useEffect(() => {
    loadRule();
    const reloadOnReturn = () => loadRule();
    window.addEventListener('focus', reloadOnReturn);
    return () => window.removeEventListener('focus', reloadOnReturn);
  }, [loadRule]);

  if (!available) {
    return (
      <div style={{ padding: 12, borderRadius: 8, background: '#FFF7ED', border: '1px solid #FDBA74', color: '#9A3412', fontSize: 13 }}>
        No existe una nomenclatura configurada para este tipo de activo. Antes de registrar el activo debe definir su nomenclatura.{' '}
        <a href={`/infraestructura/catalogs/nomenclaturas?type=${assetType}&from=wizard`} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Configurar nomenclatura</a>
      </div>
    );
  }
  return (
    <div style={{ padding: '10px 14px', borderRadius: 8, background: '#EEF2FF', color: '#3730A3', fontWeight: 700 }}>
      Código técnico: {placementCode?'Se generará automáticamente':'Seleccione ubicación para generar preview'}{placementCode&&preview ? ` (${preview})` : ''}
    </div>
  );
}
