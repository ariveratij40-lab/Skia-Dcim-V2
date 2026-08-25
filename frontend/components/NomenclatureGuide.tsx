type CapabilityStatus = 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'NOT_SUPPORTED';

interface GuidePart {
  token: string;
  label: string;
  meaning: string;
  status: CapabilityStatus;
}

interface AssetGuide {
  example: string;
  parts: GuidePart[];
}

const supported = (token: string, label: string, meaning: string): GuidePart => ({ token, label, meaning, status: 'SUPPORTED' });
const partial = (token: string, label: string, meaning: string): GuidePart => ({ token, label, meaning, status: 'PARTIALLY_SUPPORTED' });
const future = (token: string, label: string, meaning: string): GuidePart => ({ token, label, meaning, status: 'NOT_SUPPORTED' });

// Centralized educational examples. A token marked NOT_SUPPORTED may exist as
// asset data, but the normative generator does not consume it today.
const ASSET_GUIDES: Record<string, AssetGuide> = {
  SWITCH: {
    example: 'TIJ-IDF01-R02-ACC-48-001',
    parts: [
      supported('TIJ', 'Sucursal', 'Sucursal Tijuana'),
      supported('IDF01', 'Ubicación', 'IDF 01'),
      partial('R02', 'Rack', 'Rack 02'),
      future('ACC', 'Tipo', 'Switch de Acceso'),
      partial('48', 'Puertos', '48 puertos'),
      supported('001', 'Consecutivo', 'Consecutivo automático'),
    ],
  },
  RACK: { example: 'TIJ-IDF01-RK-001', parts: [supported('TIJ','Sucursal','Sucursal Tijuana'),supported('IDF01','Ubicación','IDF 01'),supported('RK','Prefijo','Prefijo configurado'),supported('001','Consecutivo','Consecutivo automático')] },
  PATCH_PANEL: { example: 'TIJ-IDF01-R02-PP-48-001', parts: [supported('TIJ','Sucursal','Sucursal Tijuana'),supported('IDF01','Ubicación','IDF 01'),partial('R02','Rack','Rack 02'),supported('PP','Prefijo','Patch Panel'),partial('48','Puertos','48 puertos'),supported('001','Consecutivo','Consecutivo automático')] },
  UPS: { example: 'TIJ-MDF01-R01-UPS-003', parts: [supported('TIJ','Sucursal','Sucursal Tijuana'),supported('MDF01','Ubicación','MDF 01'),partial('R01','Rack','Rack 01'),supported('UPS','Prefijo','UPS'),supported('003','Consecutivo','Consecutivo automático')] },
  PDU: { example: 'TIJ-IDF01-PDU-001', parts: [supported('TIJ','Sucursal','Sucursal Tijuana'),supported('IDF01','Ubicación','IDF 01'),supported('PDU','Prefijo','PDU'),supported('001','Consecutivo','Consecutivo automático')] },
  NODE: { example: 'TIJ-IDF01-ND-001', parts: [supported('TIJ','Sucursal','Sucursal Tijuana'),supported('IDF01','Ubicación','IDF 01'),supported('ND','Prefijo','Nodo'),supported('001','Consecutivo','Consecutivo automático')] },
  MDF: { example: 'TIJ-MDF-001', parts: [supported('TIJ','Sucursal','Sucursal Tijuana'),supported('MDF','Prefijo','MDF'),supported('001','Consecutivo','Consecutivo automático')] },
  IDF: { example: 'TIJ-IDF-001', parts: [supported('TIJ','Sucursal','Sucursal Tijuana'),supported('IDF','Prefijo','IDF'),supported('001','Consecutivo','Consecutivo automático')] },
};

const DEFAULT_GUIDE: AssetGuide = {
  example: 'TIJ-ACTIVO-001',
  parts: [supported('TIJ','Sucursal','Sucursal seleccionada'),supported('ACTIVO','Prefijo','Prefijo configurado'),supported('001','Consecutivo','Consecutivo automático')],
};

export default function NomenclatureGuide({ assetType, includeBranch, includePlacement }: { assetType: string; includeBranch: boolean; includePlacement: boolean }) {
  const guide = ASSET_GUIDES[assetType] || DEFAULT_GUIDE;
  const automatic = [includeBranch && 'Sucursal', includePlacement && 'Ubicación / placement', 'Consecutivo'].filter(Boolean) as string[];
  const futureParts = guide.parts.filter(part => part.status !== 'SUPPORTED');

  return <section aria-labelledby="nomenclature-guide-title" style={{background:'#f8fafc',border:'1px solid #dbeafe',borderRadius:11,padding:14,marginBottom:16}}>
    <h3 id="nomenclature-guide-title" style={{margin:'0 0 5px',fontSize:15,color:'#1e3a8a'}}>¿Cómo se construye una nomenclatura?</h3>
    <p style={{margin:'0 0 12px',fontSize:12,color:'#475569'}}>SKIA combina información autoritativa de la ubicación y del activo con la estructura definida por el administrador. El código definitivo se genera con los datos reales al registrar el activo.</p>
    <div style={{fontSize:11,fontWeight:800,color:'#64748b',marginBottom:6}}>EJEMPLO CONCEPTUAL PARA {assetType}</div>
    <code style={{display:'block',fontSize:'clamp(15px,2.5vw,20px)',fontWeight:900,color:'#172554',overflowWrap:'anywhere',marginBottom:10}}>{guide.example}</code>
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{guide.parts.map((part,index)=><div key={`${part.label}-${index}`} style={{minWidth:90,flex:'1 1 105px',background:'#fff',border:`1px solid ${part.status==='SUPPORTED'?'#bfdbfe':'#fed7aa'}`,borderRadius:8,padding:'7px 8px'}}><div style={{fontFamily:'monospace',fontWeight:900,color:'#1e40af'}}>{part.token}</div><div style={{fontSize:11,fontWeight:800,color:'#334155'}}>{part.label}</div><div style={{fontSize:10,color:'#64748b'}}>{part.meaning}</div>{part.status!=='SUPPORTED'&&<div style={{fontSize:9,fontWeight:800,color:'#9a3412',marginTop:3}}>{part.status==='PARTIALLY_SUPPORTED'?'DATO EXISTENTE · MOTOR FUTURO':'CAPACIDAD FUTURA'}</div>}</div>)}</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:8,marginTop:12}}>
      <div style={{background:'#ecfdf5',borderRadius:8,padding:9}}><strong style={{fontSize:11,color:'#047857'}}>SKIA DERIVA HOY</strong><div style={{fontSize:11,color:'#475569',marginTop:3}}>{automatic.join(' · ')}</div></div>
      <div style={{background:'#eef2ff',borderRadius:8,padding:9}}><strong style={{fontSize:11,color:'#3730a3'}}>CONFIGURA EL ADMINISTRADOR</strong><div style={{fontSize:11,color:'#475569',marginTop:3}}>Prefijo · Separador · Dígitos · Inclusiones permitidas · Segmentos personalizados</div></div>
    </div>
    {futureParts.length>0&&<p style={{margin:'9px 0 0',fontSize:10,color:'#9a3412'}}>Rack, tipo/función o puertos se muestran solo para explicar el modelo objetivo cuando aparecen en este ejemplo. Aunque algunos flujos capturan esos datos, el motor normativo todavía no los incorpora al código.</p>}
  </section>;
}
