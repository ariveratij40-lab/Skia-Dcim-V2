import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

export type HousingMode = 'distribution' | 'rack';
export interface HousingOption {
  id: string;
  code: string;
  name: string;
  type: 'MDF' | 'IDF' | 'RACK';
  locationID: string;
  location: string;
  parentCode?: string;
}
interface AuthorizedBranch { id: string; name: string; city: string; selected: boolean }
interface Props {
  mode: HousingMode;
  value: string;
  disabled?: boolean;
  onChange: (id: string, item?: HousingOption) => void;
  onBranchChange?: (branchID: string) => void;
}

export default function HousingSelector({ mode, value, disabled, onChange, onBranchChange }: Props) {
  const [branches, setBranches] = useState<AuthorizedBranch[]>([]);
  const [branchID, setBranchID] = useState('');
  const [items, setItems] = useState<HousingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const changeRef = useRef(onChange);
  const branchRef = useRef(onBranchChange);
  const valueRef = useRef(value);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => { branchRef.current = onBranchChange; }, [onBranchChange]);
  useEffect(() => { valueRef.current = value; }, [value]);

  const loadItems = useCallback(async (selectedBranch: string) => {
    if (!selectedBranch) { setItems([]); return; }
    const response = await axios.get(mode === 'distribution' ? '/api/infra/mdf-idf' : '/api/infra/racks');
    const next: HousingOption[] = (Array.isArray(response.data) ? response.data : []).map((row: any): HousingOption => mode === 'distribution' ? {
      id: row.mdf_idf_id, code: row.code, name: row.name, type: row.type,
      locationID: row.location_id, location: [row.building, row.floor, row.zone].filter(Boolean).join(' / '),
    } : {
      id: row.housing_rack_id, code: row.code, name: row.name || row.code, type: 'RACK' as const,
      locationID: row.location_id, location: [row.mdf_idf_code, row.mdf_idf_name].filter(Boolean).join(' · '), parentCode: row.mdf_idf_code,
    }).filter((item: HousingOption) => Boolean(item.id));
    setItems(next);
    if (valueRef.current) {
      const selected = next.find(item => item.id === valueRef.current);
      selected ? changeRef.current(selected.id, selected) : changeRef.current('');
    }
  }, [mode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/auth/select-branch');
      const available: AuthorizedBranch[] = response.data?.branches ?? [];
      setBranches(available);
      let selected = available.find(branch => branch.selected)?.id ?? '';
      if (!selected && available.length === 1) {
        selected = available[0].id;
        await axios.post('/api/auth/select-branch', { branchId: selected });
        window.dispatchEvent(new Event('skia:branch-changed'));
      }
      setBranchID(selected); branchRef.current?.(selected); await loadItems(selected);
    } finally { setLoading(false); }
  }, [loadItems]);
  useEffect(() => { void load(); }, [load]);

  const selectBranch = async (next: string) => {
    changeRef.current(''); setItems([]); setBranchID(next); branchRef.current?.(next); setLoading(true);
    try {
      await axios.post('/api/auth/select-branch', { branchId: next });
      window.dispatchEvent(new Event('skia:branch-changed'));
      setBranches(previous => previous.map(branch => ({ ...branch, selected: branch.id === next })));
      await loadItems(next);
    } finally { setLoading(false); }
  };

  const label = mode === 'distribution' ? 'MDF / IDF padre' : 'Rack de alojamiento';
  return <div style={{ display: 'grid', gap: 10 }}>
    <label><b>1. Sucursal *</b><select disabled={disabled || loading} value={branchID} onChange={event => void selectBranch(event.target.value)} style={{ width: '100%', padding: 10, marginTop: 4 }}><option value="">Seleccione sucursal</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}{branch.city ? ` · ${branch.city}` : ''}</option>)}</select></label>
    <label><b>2. {label} *</b><select disabled={disabled || loading || !branchID} value={value} onChange={event => changeRef.current(event.target.value, items.find(item => item.id === event.target.value))} style={{ width: '100%', padding: 10, marginTop: 4 }}><option value="">{loading ? 'Cargando…' : `Seleccione ${label.toLowerCase()}`}</option>{items.map(item => <option key={item.id} value={item.id}>{item.type} · {item.code} · {item.name}{item.location ? ` · ${item.location}` : ''}</option>)}</select></label>
    {!loading && branchID && items.length === 0 && <div style={{ padding: 12, background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8 }}>No hay {mode === 'distribution' ? 'MDF/IDF' : 'racks'} disponibles en la sucursal activa.</div>}
    {disabled && <div style={{ color: '#92400E', fontSize: 13 }}>Reubicación gestionada por flujo dedicado.</div>}
  </div>;
}
