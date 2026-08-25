import { useEffect, useState } from 'react';
import axios from 'axios';

interface Props {
  assetType: string;
  onAvailability?: (available: boolean) => void;
}

export default function NomenclatureCodeField({ assetType, onAvailability }: Props) {
  const [preview, setPreview] = useState('');
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let current = true;
    setAvailable(false);
    setPreview('');
    axios.get('/api/dcim/catalogs/naming-rules').then(res => {
      if (!current) return;
      const rules = res.data?.naming_rules ?? [];
      const rule = rules.find((item: { asset_type_code: string; active: boolean }) =>
        item.asset_type_code === assetType && item.active,
      );
      const nextAvailable = Boolean(rule);
      setAvailable(nextAvailable);
      setPreview(rule?.next_code_preview ?? '');
      onAvailability?.(nextAvailable);
    }).catch(() => {
      if (!current) return;
      setAvailable(false);
      onAvailability?.(false);
    });
    return () => { current = false; };
  }, [assetType, onAvailability]);

  if (!available) {
    return (
      <div style={{ padding: 12, borderRadius: 8, background: '#FFF7ED', border: '1px solid #FDBA74', color: '#9A3412', fontSize: 13 }}>
        No existe una nomenclatura configurada para este tipo de activo. Antes de registrar el activo debe definir su nomenclatura.{' '}
        <a href={`/infraestructura/catalogs/nomenclaturas?type=${assetType}`} style={{ fontWeight: 700 }}>Configurar nomenclatura</a>
      </div>
    );
  }
  return (
    <div style={{ padding: '10px 14px', borderRadius: 8, background: '#EEF2FF', color: '#3730A3', fontWeight: 700 }}>
      Código técnico: Se generará automáticamente{preview ? ` (${preview})` : ''}
    </div>
  );
}
