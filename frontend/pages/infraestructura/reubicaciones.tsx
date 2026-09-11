import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import axios from 'axios';
import AppLayout from '../../components/AppLayout';
import HousingSelector from '../../components/HousingSelector';
import AssetPlacementSelector from '../../components/AssetPlacementSelector';
import {
  buildCanonicalRelocationPayload,
  canonicalRelocationError,
  CanonicalMountMode,
  RelocatableAsset,
} from '../../lib/canonicalRelocation';

type Option = { id: string; code?: string; name: string; site_id?: string; floor_id?: string; zone_id?: string };

export default function CanonicalRelocationsPage() {
  const [assets, setAssets] = useState<RelocatableAsset[]>([]);
  const [assetID, setAssetID] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [distributionPointID, setDistributionPointID] = useState('');
  const [housingRackID, setHousingRackID] = useState('');
  const [mountMode, setMountMode] = useState<CanonicalMountMode>('RACK_MOUNTED');
  const [placementID, setPlacementID] = useState('');

  const [sites, setSites] = useState<Option[]>([]);
  const [floors, setFloors] = useState<Option[]>([]);
  const [zones, setZones] = useState<Option[]>([]);
  const [areas, setAreas] = useState<Option[]>([]);
  const [siteID, setSiteID] = useState('');
  const [floorID, setFloorID] = useState('');
  const [zoneID, setZoneID] = useState('');
  const [areaID, setAreaID] = useState('');

  const selected = useMemo(() => assets.find(asset => asset.id === assetID), [assets, assetID]);

  const clearDestination = useCallback(() => {
    setDistributionPointID('');
    setHousingRackID('');
    setMountMode('RACK_MOUNTED');
    setPlacementID('');
    setSiteID('');
    setFloorID('');
    setZoneID('');
    setAreaID('');
    setFloors([]);
    setZones([]);
    setAreas([]);
    setError('');
    setSuccess('');
  }, []);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/dcim/relocations');
      setAssets(Array.isArray(response.data?.assets) ? response.data.assets : []);
    } catch (requestError) {
      const mapped = canonicalRelocationError(requestError);
      setError(`${mapped.message} (${mapped.code})`);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAssets(); }, [loadAssets]);

  useEffect(() => {
    if (selected?.asset_type !== 'MDF' && selected?.asset_type !== 'IDF') return;
    void axios.get('/api/dcim/sites').then(response => setSites(response.data?.sites ?? [])).catch(() => setSites([]));
  }, [selected?.asset_type]);

  const chooseAsset = (next: string) => {
    setAssetID(next);
    clearDestination();
  };

  const changeBranch = () => {
    setAssetID('');
    clearDestination();
    void loadAssets();
  };

  const chooseSite = async (next: string) => {
    setSiteID(next); setFloorID(''); setZoneID(''); setAreaID(''); setFloors([]); setZones([]); setAreas([]);
    if (!next) return;
    const [floorsResponse, areasResponse] = await Promise.all([
      axios.get('/api/dcim/floors', { params: { site_id: next } }),
      axios.get('/api/dcim/internal-areas', { params: { site_id: next } }),
    ]);
    setFloors(floorsResponse.data?.floors ?? []);
    setAreas(areasResponse.data?.internal_areas ?? []);
  };

  const chooseFloor = async (next: string) => {
    setFloorID(next); setZoneID(''); setAreaID(''); setZones([]);
    if (!next || !siteID) return;
    const response = await axios.get('/api/dcim/zones', { params: { site_id: siteID, floor_id: next } });
    setZones(response.data?.zones ?? []);
  };

  const compatibleAreas = useMemo(
    () => areas.filter(area => (!floorID || area.floor_id === floorID) && (!zoneID || area.zone_id === zoneID)),
    [areas, floorID, zoneID],
  );

  const submit = async () => {
    if (!selected || saving) return;
    setError(''); setSuccess(''); setSaving(true);
    try {
      const payload = buildCanonicalRelocationPayload(selected, {
        distributionPointID,
        housingRackID,
        mountMode,
        placementID,
        zoneID,
        siteID,
        internalAreaID: areaID,
      });
      const response = await axios.post('/api/dcim/relocations', payload);
      setSuccess(response.data?.changed === false
        ? 'El activo ya se encontraba en el destino canónico seleccionado.'
        : `Relocalización completada${response.data?.cascaded_assets ? `; ${response.data.cascaded_assets} activos dependientes fueron sincronizados` : ''}.`);
      await loadAssets();
    } catch (requestError) {
      const mapped = canonicalRelocationError(requestError);
      setError(`${mapped.message} (${mapped.code})`);
    } finally {
      setSaving(false);
    }
  };

  const destinationReady = Boolean(selected && (
    ((selected.asset_type === 'MDF' || selected.asset_type === 'IDF') && zoneID) ||
    (selected.asset_type === 'RACK' && distributionPointID) ||
    (['PATCH_PANEL', 'SWITCH', 'PDU'].includes(selected.asset_type) && housingRackID) ||
    (selected.asset_type === 'UPS' && ((mountMode === 'RACK_MOUNTED' && housingRackID) || (mountMode === 'ROOM_MOUNTED' && placementID)))
  ));

  return <AppLayout title="Reubicación física" breadcrumb={[{ label: 'Infraestructura' }, { label: 'Reubicación física' }]}>
    <Head><title>Reubicación física | SKIA</title></Head>
    <div style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: 18 }}>
      <section style={{ background: '#fff', border: '1px solid #E8EBF4', borderRadius: 14, padding: 22 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Reubicación física canónica</h1>
        <p style={{ color: '#64748b', marginBottom: 20 }}>
          Este flujo actualiza en una sola operación la ubicación, el alojamiento físico y los dependientes que correspondan. La edición normal del activo no modifica estas autoridades.
        </p>
        <label style={{ display: 'grid', gap: 6 }}>
          <b>Activo a reubicar *</b>
          <select value={assetID} disabled={loading || saving} onChange={event => chooseAsset(event.target.value)} style={{ padding: 11, borderRadius: 8, border: '1px solid #cbd5e1' }}>
            <option value="">{loading ? 'Cargando activos…' : 'Seleccione un activo'}</option>
            {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.asset_type} · {asset.code} · {asset.name}</option>)}
          </select>
        </label>
        {selected && <div style={{ marginTop: 12, padding: 12, background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
          Estado actual: <b>{selected.mount_mode}</b>{selected.housing_rack_id ? ` · Rack ${selected.housing_rack_id}` : ''} · Location {selected.location_id}
        </div>}
      </section>

      {selected && <section style={{ background: '#fff', border: '1px solid #E8EBF4', borderRadius: 14, padding: 22, display: 'grid', gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Destino autorizado</h2>

        {(selected.asset_type === 'MDF' || selected.asset_type === 'IDF') && <>
          <label><b>Edificio / Site *</b><select value={siteID} onChange={event => void chooseSite(event.target.value)} style={{ width: '100%', padding: 10, marginTop: 4 }}><option value="">Seleccione</option>{sites.map(site => <option key={site.id} value={site.id}>{site.code} · {site.name}</option>)}</select></label>
          <label><b>Piso *</b><select disabled={!siteID} value={floorID} onChange={event => void chooseFloor(event.target.value)} style={{ width: '100%', padding: 10, marginTop: 4 }}><option value="">Seleccione</option>{floors.map(floor => <option key={floor.id} value={floor.id}>{floor.code} · {floor.name}</option>)}</select></label>
          <label><b>Zona canónica *</b><select disabled={!floorID} value={zoneID} onChange={event => { setZoneID(event.target.value); setAreaID(''); }} style={{ width: '100%', padding: 10, marginTop: 4 }}><option value="">Seleccione</option>{zones.map(zone => <option key={zone.id} value={zone.id}>{zone.code} · {zone.name}</option>)}</select></label>
          <label><b>Área interna</b><select disabled={!zoneID} value={areaID} onChange={event => setAreaID(event.target.value)} style={{ width: '100%', padding: 10, marginTop: 4 }}><option value="">Sin área interna</option>{compatibleAreas.map(area => <option key={area.id} value={area.id}>{area.code} · {area.name}</option>)}</select></label>
        </>}

        {selected.asset_type === 'RACK' && <HousingSelector mode="distribution" value={distributionPointID} onChange={setDistributionPointID} onBranchChange={changeBranch} />}

        {['PATCH_PANEL', 'SWITCH', 'PDU'].includes(selected.asset_type) && <HousingSelector mode="rack" value={housingRackID} onChange={setHousingRackID} onBranchChange={changeBranch} />}

        {selected.asset_type === 'UPS' && <>
          <label><b>Modo de montaje *</b><select value={mountMode} onChange={event => { const mode = event.target.value as CanonicalMountMode; setMountMode(mode); setHousingRackID(''); setPlacementID(''); }} style={{ width: '100%', padding: 10, marginTop: 4 }}><option value="RACK_MOUNTED">Montado en Rack</option><option value="ROOM_MOUNTED">Instalado en cuarto / ubicación</option></select></label>
          {mountMode === 'RACK_MOUNTED'
            ? <HousingSelector mode="rack" value={housingRackID} onChange={setHousingRackID} onBranchChange={changeBranch} />
            : <AssetPlacementSelector assetType="UPS" value={placementID} onChange={setPlacementID} onBranchChange={changeBranch} />}
        </>}

        {error && <div style={{ padding: 12, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>{error}</div>}
        {success && <div style={{ padding: 12, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>{success}</div>}
        <button type="button" disabled={!destinationReady || saving} onClick={() => void submit()} style={{ justifySelf: 'start', padding: '11px 18px', border: 0, borderRadius: 8, background: destinationReady && !saving ? '#111827' : '#cbd5e1', color: '#fff', cursor: destinationReady && !saving ? 'pointer' : 'not-allowed' }}>
          {saving ? 'Reubicando…' : 'Confirmar reubicación'}
        </button>
      </section>}
    </div>
  </AppLayout>;
}
