import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

export interface AssetPlacement { id:string; type:'MDF'|'IDF'|'WAREHOUSE'; canonical_code:string; name:string; active:boolean }

interface Props { assetType:string; value:string; onChange:(id:string, placement?:AssetPlacement)=>void }

export default function AssetPlacementSelector({assetType,value,onChange}:Props){
  const [branch,setBranch]=useState({id:'',name:''}); const [items,setItems]=useState<AssetPlacement[]>([]); const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);try{const r=await axios.get('/api/dcim/placements');const next=(r.data?.placements||[]).map((p:any)=>({...p,canonical_code:p.CanonicalCode||p.canonical_code||p.code}));setBranch({id:r.data.branch_id,name:r.data.branch_name});setItems(next);if(value&&!next.some((p:AssetPlacement)=>p.id===value))onChange('');}finally{setLoading(false)}},[value]);
  useEffect(()=>{void load();const focus=()=>void load();window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus)},[load]);
  const createWarehouse=async()=>{const name=window.prompt('Nombre del Almacén');if(!name)return;const r=await axios.post('/api/dcim/placements',{type:'WAREHOUSE',name});await load();onChange(r.data.id,{id:r.data.id,type:'WAREHOUSE',canonical_code:r.data.code,name:r.data.name,active:true})};
  const link=(type:'MDF'|'IDF')=>`/infraestructura/mdf-idf?create=${type}&return_to=${encodeURIComponent(location.pathname)}&asset_type=${assetType}&branch_id=${branch.id}`;
  return <div style={{display:'grid',gap:10}}><label><b>1. Sucursal</b><input readOnly value={branch.name||'Sucursal de la sesión'} style={{width:'100%',padding:10,marginTop:4}}/></label><label><b>2. Ubicación</b><select disabled={loading||!branch.id} value={value} onChange={e=>onChange(e.target.value,items.find(p=>p.id===e.target.value))} style={{width:'100%',padding:10,marginTop:4}}><option value="">{loading?'Cargando…':'Seleccione ubicación'}</option>{items.map(p=><option key={p.id} value={p.id}>{p.type} · {p.canonical_code} · {p.name}</option>)}</select></label>{!loading&&items.length===0&&<div style={{padding:12,background:'#fff7ed',border:'1px solid #fdba74',borderRadius:8}}>No existen ubicaciones disponibles para esta sucursal.<div style={{display:'flex',gap:8,marginTop:8}}><a href={link('MDF')} target="_blank" rel="noreferrer">+ Crear MDF</a><a href={link('IDF')} target="_blank" rel="noreferrer">+ Crear IDF</a><button type="button" onClick={createWarehouse}>+ Crear Almacén</button></div></div>}</div>
}
