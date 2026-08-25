import SwitchWizard, { SwitchWizardData } from '../../components/SwitchWizard';
import axios from 'axios';
import Head from 'next/head';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  Plus, Upload, Download, FileSpreadsheet, Search, RefreshCw,
  X, Edit2, Trash2, Network, BarChart2,
  CheckCircle2, AlertTriangle, XCircle,
  Package, Activity, ChevronRight, ChevronDown,
  Wifi, Shield, Zap, Settings,
  Server, BookOpen, Camera, FileText, Layers,
} from 'lucide-react';
import AppLayout from '../../components/AppLayout';
import SwitchAdminPanel from '../../components/SwitchAdmin';
import ModuleEmptyState from '../../components/ModuleEmptyState';

type SwStatus  = 'Activo' | 'Inactivo' | 'Baja';
type SwTipo    = 'Core' | 'Distribución' | 'Acceso' | 'PoE' | 'Industrial' | 'Administrable' | 'No administrable';
type CertAnswer = 'cumple' | 'no_cumple' | 'na';
type CertCrit   = 'baja' | 'media' | 'alta' | 'critica';
type CertNorm   = 'ANSI/TIA-942-C' | 'ANSI/TIA-606' | 'ANSI/TIA-568' | 'ANSI/TIA-569' | 'ISO/IEC 11801' | 'Evaluación interna SKIA';

interface SWItem {
  id: string; code: string; brand: string; model: string; serie: string;
  tipo: SwTipo; ubicacion: string; ubicacion_plano: string; foto: string;
  observaciones: string; puertos: number; puertos_libres: number; puertos_poe: number;
  capacidad_puerto: string; ip: string; fecha_compra: string; expiracion_garantia: string;
  tiempo_uso: string; status: SwStatus; no_factura: string; costo_dls: number;
  proveedor: string; firmware: string; contrato_sla: string; rfid: string;
  anio_instalacion: number; centro_costos: string;
}

interface SCQ { id:string; category:string; question:string; norm_ref:string; criticality:CertCrit; hint:string; }
interface SCA { question_id:string; answer:CertAnswer; observation:string; evidence_url:string; }
interface SCE { id:string; sw_id:string; sw_code:string; standard:CertNorm; evaluator:string; eval_date:string; answers:SCA[]; overall_pct:number|null; badge:'Certificable'|'Encaminado'|'Crítico'; notes:string; }

const MOCK_SW: SWItem[] = [
  { id:'sw-1', code:'SW-CORE-A001', brand:'Cisco', model:'Catalyst 9300-48P', serie:'FDO2312G0AB', tipo:'Core', ubicacion:'MDF Torre A', ubicacion_plano:'Plano MDF-A', foto:'', observaciones:'Switch core principal', puertos:48, puertos_libres:8, puertos_poe:48, capacidad_puerto:'1G', ip:'10.0.0.1', fecha_compra:'2023-01-15', expiracion_garantia:'2026-01-15', tiempo_uso:'2 años', status:'Activo', no_factura:'INV-2023-001', costo_dls:8500, proveedor:'IAMET', firmware:'17.9.4a', contrato_sla:'SLA-GOLD-001', rfid:'RFID-SW-001', anio_instalacion:2023, centro_costos:'CC-TI-001' },
  { id:'sw-2', code:'SW-DIST-B001', brand:'Cisco', model:'Catalyst 9200-24T', serie:'FDO2315H1CD', tipo:'Distribución', ubicacion:'IDF2 Producción', ubicacion_plano:'Plano IDF2-Prod', foto:'', observaciones:'Switch distribución piso 2', puertos:24, puertos_libres:4, puertos_poe:0, capacidad_puerto:'1G', ip:'10.0.1.1', fecha_compra:'2023-03-10', expiracion_garantia:'2026-03-10', tiempo_uso:'2 años', status:'Activo', no_factura:'INV-2023-015', costo_dls:3200, proveedor:'Bajanet', firmware:'17.6.5', contrato_sla:'SLA-SILVER-002', rfid:'RFID-SW-002', anio_instalacion:2023, centro_costos:'CC-TI-002' },
  { id:'sw-3', code:'SW-ACC-C001', brand:'HP', model:'Aruba 2530-48G-PoE+', serie:'SG32B1C0012', tipo:'Acceso', ubicacion:'IDF3 Oficinas', ubicacion_plano:'Plano IDF3-Of', foto:'', observaciones:'Switch acceso planta baja', puertos:48, puertos_libres:12, puertos_poe:48, capacidad_puerto:'1G', ip:'10.0.2.1', fecha_compra:'2022-06-20', expiracion_garantia:'2025-06-20', tiempo_uso:'3 años', status:'Inactivo', no_factura:'INV-2022-088', costo_dls:2100, proveedor:'IAMET', firmware:'YA.16.11.0010', contrato_sla:'', rfid:'RFID-SW-003', anio_instalacion:2022, centro_costos:'CC-TI-001' },
  { id:'sw-4', code:'SW-POE-D001', brand:'Ubiquiti', model:'UniFi USW-Pro-48-PoE', serie:'UBQ2023X0045', tipo:'PoE', ubicacion:'IDF1 Almacén', ubicacion_plano:'Plano IDF1-Alm', foto:'', observaciones:'Switch PoE para cámaras IP y teléfonos', puertos:48, puertos_libres:20, puertos_poe:48, capacidad_puerto:'1G', ip:'192.168.1.10', fecha_compra:'2024-01-05', expiracion_garantia:'2027-01-05', tiempo_uso:'1 año', status:'Activo', no_factura:'INV-2024-003', costo_dls:1800, proveedor:'Bajanet', firmware:'6.6.55', contrato_sla:'', rfid:'RFID-SW-004', anio_instalacion:2024, centro_costos:'CC-TI-003' },
  { id:'sw-5', code:'SW-IND-E001', brand:'Siemens', model:'SCALANCE X208', serie:'SIE2021P0078', tipo:'Industrial', ubicacion:'Planta Producción', ubicacion_plano:'Plano Planta-Prod', foto:'', observaciones:'Switch industrial zona de producción', puertos:8, puertos_libres:2, puertos_poe:0, capacidad_puerto:'100M', ip:'172.16.0.10', fecha_compra:'2021-09-12', expiracion_garantia:'2024-09-12', tiempo_uso:'4 años', status:'Baja', no_factura:'INV-2021-055', costo_dls:950, proveedor:'Siemens México', firmware:'5.1.1', contrato_sla:'', rfid:'RFID-SW-005', anio_instalacion:2021, centro_costos:'CC-OPS-001' },
  { id:'sw-6', code:'SW-ADM-F001', brand:'Juniper', model:'EX2300-48P', serie:'JNP2022Q0091', tipo:'Administrable', ubicacion:'MDF Torre B', ubicacion_plano:'Plano MDF-B', foto:'', observaciones:'Switch administrable torre B', puertos:48, puertos_libres:16, puertos_poe:48, capacidad_puerto:'1G', ip:'10.1.0.1', fecha_compra:'2022-11-30', expiracion_garantia:'2025-11-30', tiempo_uso:'2.5 años', status:'Activo', no_factura:'INV-2022-120', costo_dls:4200, proveedor:'IAMET', firmware:'21.4R3-S5', contrato_sla:'SLA-SILVER-003', rfid:'RFID-SW-006', anio_instalacion:2022, centro_costos:'CC-TI-002' },
];

const CERT_CATS = ['Instalación física','Configuración y seguridad','Rendimiento y conectividad','Gestión y monitoreo','Documentación'];
const CERT_QS: SCQ[] = [
  {id:'if-1',category:'Instalación física',question:'¿El switch está correctamente montado en el rack con tornillos en las 4 esquinas?',norm_ref:'TIA-569-D §7.4',criticality:'alta',hint:'TIA-569-D §7.4 exige que los equipos activos estén fijados al rack con tornillos en los 4 puntos de montaje para evitar vibraciones y desconexiones accidentales. Un switch mal montado puede desconectarse por vibración o al manipular equipos adyacentes, causando interrupciones de red. Verificar que los tornillos sean del tipo cage nut apropiados para el rack.'},
  {id:'if-2',category:'Instalación física',question:'¿Existe espacio de 1U libre encima y debajo del switch para ventilación?',norm_ref:'TIA-942-C §7.2',criticality:'media',hint:'TIA-942-C §7.2 recomienda dejar al menos 1U de espacio libre alrededor de los equipos activos para garantizar el flujo de aire. Los switches de alta densidad (48 puertos, PoE) generan hasta 200W de calor. Sin espacio de ventilación, la temperatura interna puede superar los 70°C, activando el throttling térmico y reduciendo la vida útil del equipo hasta un 50%.'},
  {id:'if-3',category:'Instalación física',question:'¿Los cables están organizados con patch cords de longitud adecuada y sin tensión?',norm_ref:'TIA-568.2-D §6.5',criticality:'alta',hint:'TIA-568.2-D §6.5 establece que los patch cords deben tener la longitud mínima necesaria para el tendido sin tensión, con un radio de curvatura mínimo de 4× el diámetro del cable. Patch cords demasiado largos crean bucles que bloquean el flujo de aire; demasiado cortos generan tensión en los puertos RJ45, deformando los contactos y causando errores de transmisión intermitentes.'},
  {id:'if-4',category:'Instalación física',question:'¿El switch cuenta con alimentación redundante (PSU dual) o está conectado a UPS?',norm_ref:'TIA-942-C §8.2',criticality:'critica',hint:'TIA-942-C §8.2 requiere protección UPS para todos los switches de distribución y core. Los switches de acceso deben estar al menos en un circuito protegido por UPS con autonomía mínima de 10 minutos. Los switches con PSU dual deben tener cada fuente en un circuito eléctrico independiente (preferiblemente de diferentes UPS) para eliminar el punto único de falla eléctrica.'},
  {id:'if-5',category:'Instalación física',question:'¿El switch está etiquetado con su código de inventario y datos de gestión?',norm_ref:'TIA-606-C §5.3',criticality:'media',hint:'TIA-606-C §5.3 exige etiquetado físico de todos los equipos activos con: código de inventario, nombre del dispositivo, IP de gestión y VLAN de gestión. La etiqueta debe ser visible sin necesidad de mover el equipo, impresa con impresora de etiquetas y resistente a temperaturas de hasta 70°C. Facilita la identificación rápida durante intervenciones de emergencia.'},
  {id:'cs-1',category:'Configuración y seguridad',question:'¿El switch tiene contraseña de acceso segura y diferente a la de fábrica?',norm_ref:'ISO/IEC 27001 A.9.4',criticality:'critica',hint:'ISO/IEC 27001 A.9.4 exige que todos los dispositivos de red tengan credenciales únicas y seguras, diferentes a las de fábrica. Las contraseñas deben tener mínimo 12 caracteres con combinación de mayúsculas, minúsculas, números y símbolos. El uso de credenciales de fábrica (admin/admin, cisco/cisco) es la vulnerabilidad más explotada en ataques de red interna.'},
  {id:'cs-2',category:'Configuración y seguridad',question:'¿Está configurado SSH v2 para acceso remoto y Telnet está deshabilitado?',norm_ref:'NIST SP 800-115',criticality:'alta',hint:'NIST SP 800-115 establece que el acceso remoto a dispositivos de red debe realizarse exclusivamente mediante protocolos cifrados (SSH v2, HTTPS). Telnet transmite credenciales en texto claro y debe estar deshabilitado en todos los dispositivos. SSH v2 ofrece cifrado AES-256 y autenticación por clave pública, eliminando el riesgo de captura de credenciales mediante sniffing de red.'},
  {id:'cs-3',category:'Configuración y seguridad',question:'¿Están configuradas VLANs para segmentación de tráfico (datos, voz, gestión, CCTV)?',norm_ref:'TIA-942-C §5.3',criticality:'alta',hint:'TIA-942-C §5.3 recomienda segmentación de red mediante VLANs para separar el tráfico de datos, voz IP, gestión de red, CCTV y sistemas de control. La VLAN de gestión debe ser diferente a la VLAN de datos de usuario y no debe ser la VLAN 1 (nativa). La segmentación reduce el dominio de broadcast, mejora el rendimiento y limita el alcance de un posible compromiso de seguridad.'},
  {id:'cs-4',category:'Configuración y seguridad',question:'¿Está habilitado Port Security o 802.1X para control de acceso por puerto?',norm_ref:'IEEE 802.1X',criticality:'alta',hint:'IEEE 802.1X proporciona autenticación por puerto antes de permitir el acceso a la red. Port Security limita el número de MACs permitidas por puerto (recomendado: máximo 2) y puede configurarse para deshabilitar el puerto automáticamente ante una violación. Sin control de acceso por puerto, cualquier dispositivo conectado físicamente al switch obtiene acceso a la red.'},
  {id:'cs-5',category:'Configuración y seguridad',question:'¿Están deshabilitados los puertos no utilizados y asignados a una VLAN de cuarentena?',norm_ref:'CIS Benchmark Network',criticality:'media',hint:'El CIS Benchmark para dispositivos de red recomienda deshabilitar administrativamente todos los puertos no utilizados (shutdown) y asignarlos a una VLAN de cuarentena sin acceso a la red de producción. Los puertos activos sin dispositivo conectado son vectores de ataque físico. Verificar que los puertos deshabilitados no puedan ser activados remotamente sin autorización documentada.'},
  {id:'rc-1',category:'Rendimiento y conectividad',question:'¿El firmware del switch está actualizado a la versión estable más reciente?',norm_ref:'NIST SP 800-40',criticality:'alta',hint:'NIST SP 800-40 establece que los dispositivos de red deben mantenerse actualizados con los parches de seguridad del fabricante. Los fabricantes publican actualizaciones de firmware que corrigen vulnerabilidades CVE, mejoran la estabilidad y añaden funcionalidades. Las versiones con más de 18 meses de antigüedad generalmente tienen vulnerabilidades conocidas sin parche.'},
  {id:'rc-2',category:'Rendimiento y conectividad',question:'¿El uso de puertos no supera el 80% de la capacidad total?',norm_ref:'TIA-942-C §5.1',criticality:'media',hint:'TIA-942-C §5.1 recomienda mantener al menos un 20% de puertos libres para crecimiento y redundancia. Un switch con más del 80% de puertos ocupados no tiene capacidad para conectar dispositivos temporales durante mantenimiento, ni para reemplazar puertos defectuosos sin interrumpir el servicio. Planificar la expansión cuando se supere el 70% de ocupación.'},
  {id:'rc-3',category:'Rendimiento y conectividad',question:'¿Los enlaces uplink están configurados como trunk con LACP/EtherChannel para redundancia?',norm_ref:'IEEE 802.3ad',criticality:'alta',hint:'IEEE 802.3ad (LACP) permite agrupar múltiples enlaces físicos en un canal lógico de mayor ancho de banda y con redundancia automática. Un switch de acceso con un único enlace uplink de 1G hacia el switch de distribución crea un cuello de botella cuando hay 48 usuarios activos. Se recomienda LACP con mínimo 2 enlaces de 10G para switches de acceso de alta densidad.'},
  {id:'rc-4',category:'Rendimiento y conectividad',question:'¿Está configurado Spanning Tree (RSTP/MSTP) con el root bridge correcto?',norm_ref:'IEEE 802.1w',criticality:'alta',hint:'IEEE 802.1w (RSTP) previene los bucles de red que pueden causar tormentas de broadcast y colapso total de la red. El root bridge debe ser el switch core principal, configurado explícitamente con prioridad 4096 (no dejarlo al azar). Un root bridge incorrecto puede causar rutas subóptimas y aumentar la latencia. Verificar que BPDU Guard esté habilitado en todos los puertos de acceso.'},
  {id:'rc-5',category:'Rendimiento y conectividad',question:'¿El presupuesto PoE no supera el 80% de la capacidad total del switch?',norm_ref:'IEEE 802.3bt',criticality:'media',hint:'IEEE 802.3bt (PoE++) define presupuestos de hasta 90W por puerto. Un switch PoE con presupuesto total de 740W no debe superar los 592W de consumo total para mantener margen de seguridad. Superar el 80% del presupuesto PoE puede causar que el switch deje de alimentar nuevos dispositivos o, en casos extremos, reinicie la fuente de poder. Monitorear el consumo PoE en tiempo real mediante SNMP.'},
  {id:'gm-1',category:'Gestión y monitoreo',question:'¿El switch está configurado con NTP para sincronización de tiempo?',norm_ref:'RFC 5905',criticality:'media',hint:'RFC 5905 (NTP v4) establece el protocolo estándar para sincronización de tiempo en redes. Los logs del switch deben tener timestamps precisos para correlacionar eventos de seguridad y diagnosticar incidentes. Sin NTP, los logs pueden tener diferencias de horas o días respecto al tiempo real, haciendo imposible la correlación forense. Configurar al menos 2 servidores NTP con autenticación MD5.'},
  {id:'gm-2',category:'Gestión y monitoreo',question:'¿Está configurado SNMP v3 con autenticación y cifrado para monitoreo?',norm_ref:'RFC 3411',criticality:'alta',hint:'RFC 3411 define SNMPv3 con autenticación (SHA-256) y cifrado (AES-128) para la gestión segura de dispositivos de red. SNMP v1 y v2c transmiten la community string en texto claro y deben estar deshabilitados. SNMPv3 permite monitorear en tiempo real: uso de CPU, memoria, temperatura, estado de puertos, consumo PoE y contadores de errores, integrándose con sistemas NMS como Zabbix, PRTG o SolarWinds.'},
  {id:'gm-3',category:'Gestión y monitoreo',question:'¿Están configurados Syslog para envío de logs a servidor centralizado?',norm_ref:'RFC 5424',criticality:'media',hint:'RFC 5424 define el formato estándar de Syslog para envío de logs a servidores centralizados (SIEM). Los switches deben enviar logs de nivel Warning o superior al servidor Syslog, incluyendo: cambios de configuración, violaciones de Port Security, cambios de estado de puertos (up/down) y autenticaciones fallidas. Los logs deben conservarse mínimo 90 días para cumplimiento regulatorio.'},
  {id:'gm-4',category:'Gestión y monitoreo',question:'¿Existe alerta configurada para cuando un puerto cambia de estado (up/down)?',norm_ref:'TIA-942-C §10.2',criticality:'media',hint:'TIA-942-C §10.2 recomienda monitoreo proactivo del estado de los puertos de red. Las alertas de cambio de estado (link up/down) permiten detectar desconexiones accidentales, fallos de equipos o intentos de manipulación física. Configurar traps SNMP o notificaciones Syslog para cambios de estado, priorizando los puertos de uplink, servidores y equipos críticos.'},
  {id:'gm-5',category:'Gestión y monitoreo',question:'¿Se realiza respaldo de la configuración del switch de forma periódica?',norm_ref:'ITIL Change Management',criticality:'alta',hint:'ITIL Change Management recomienda respaldar la configuración de todos los dispositivos de red antes y después de cualquier cambio, y de forma programada (mínimo semanal). Los respaldos deben almacenarse en servidor TFTP/SFTP externo al switch, con control de versiones y retención mínima de 30 días. Sin respaldo, la recuperación ante un fallo de hardware o configuración incorrecta puede tardar horas en lugar de minutos.'},
  {id:'dc-1',category:'Documentación',question:'¿Existe inventario actualizado con todos los datos del switch (marca, modelo, serie, IP, firmware)?',norm_ref:'TIA-606-C §4.1',criticality:'alta',hint:'TIA-606-C §4.1 requiere un inventario completo de todos los equipos activos de red con: identificador único, marca, modelo, número de serie, versión de firmware, IP de gestión, VLAN de gestión, ubicación física (rack, U), fecha de instalación y estado operativo. El inventario debe actualizarse dentro de las 24 horas posteriores a cualquier cambio.'},
  {id:'dc-2',category:'Documentación',question:'¿Existe diagrama de red actualizado que muestre las conexiones del switch?',norm_ref:'TIA-606-C §6.2',criticality:'alta',hint:'TIA-606-C §6.2 requiere diagramas de red que muestren: topología física (qué está conectado a qué puerto), topología lógica (VLANs, rutas), direccionamiento IP y relaciones de redundancia. Los diagramas deben estar en formato digital (Visio, draw.io, Lucidchart) y actualizarse dentro de las 24 horas posteriores a cualquier cambio. Un diagrama desactualizado es la principal causa de errores durante intervenciones de emergencia.'},
  {id:'dc-3',category:'Documentación',question:'¿Está documentada la configuración de VLANs y políticas de seguridad aplicadas?',norm_ref:'TIA-942-C §5.3',criticality:'media',hint:'La documentación de VLANs debe incluir: ID de VLAN, nombre, propósito, rango de IP asignado, puertos asignados y políticas de acceso (ACLs). Las políticas de seguridad (Port Security, 802.1X, ACLs) deben documentarse con el criterio de diseño para facilitar su mantenimiento. Sin documentación, los cambios de configuración pueden romper la segmentación de red o las políticas de seguridad sin que el técnico lo sepa.'},
  {id:'dc-4',category:'Documentación',question:'¿Existe procedimiento documentado de mantenimiento y actualización de firmware?',norm_ref:'ITIL Change Management',criticality:'media',hint:'El procedimiento de actualización de firmware debe incluir: ventana de mantenimiento aprobada, respaldo previo de configuración, verificación de compatibilidad con la versión actual de IOS/firmware, procedimiento de rollback en caso de fallo, y pruebas de conectividad post-actualización. Sin procedimiento documentado, las actualizaciones de firmware son el principal riesgo de interrupciones de servicio no planificadas.'},
  {id:'dc-5',category:'Documentación',question:'¿Están documentados los contratos de soporte y garantía vigentes?',norm_ref:'TIA-942-C §11.2',criticality:'baja',hint:'TIA-942-C §11.2 recomienda mantener un registro de todos los contratos de soporte y garantía de los equipos de red, incluyendo: número de contrato, proveedor, nivel de servicio (NBD, 4h, 2h), fecha de vencimiento y procedimiento de activación. Los contratos de soporte vencidos pueden resultar en tiempos de reemplazo de hardware de semanas en lugar de horas, con impacto crítico en la disponibilidad del servicio.'},
];

const CERT_NORMS: CertNorm[] = ['ANSI/TIA-942-C','ANSI/TIA-606','ANSI/TIA-568','ANSI/TIA-569','ISO/IEC 11801','Evaluación interna SKIA'];
const CAT_ICONS: Record<string,React.ReactNode> = {
  'Instalación física': <Server size={12}/>,
  'Configuración y seguridad': <Shield size={12}/>,
  'Rendimiento y conectividad': <Wifi size={12}/>,
  'Gestión y monitoreo': <Activity size={12}/>,
  'Documentación': <FileText size={12}/>,
};
const BADGE_COLOR = { 'Certificable':'bg-emerald-100 text-emerald-700 border-emerald-200', 'Encaminado':'bg-amber-100 text-amber-700 border-amber-200', 'Crítico':'bg-red-100 text-red-700 border-red-200' };

function buildAnswers(): SCA[] { return CERT_QS.map(q=>({question_id:q.id,answer:'na' as CertAnswer,observation:'',evidence_url:''})); }
function calcBadge(answers: SCA[]): { pct: number; badge: 'Certificable'|'Encaminado'|'Crítico' } {
  const applicable = answers.filter(a=>a.answer!=='na');
  if(!applicable.length) return {pct:0,badge:'Crítico'};
  const cumple = applicable.filter(a=>a.answer==='cumple').length;
  const pct = Math.round((cumple/applicable.length)*100);
  return {pct, badge: pct>=85?'Certificable':pct>=60?'Encaminado':'Crítico'};
}

const STATUS_COLORS: Record<SwStatus,string> = {
  'Activo':'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Inactivo':'bg-amber-100 text-amber-700 border-amber-200',
  'Baja':'bg-red-100 text-red-700 border-red-200',
};
const STATUS_ICONS: Record<SwStatus,React.ReactNode> = {
  'Activo':<CheckCircle2 size={12}/>,
  'Inactivo':<AlertTriangle size={12}/>,
  'Baja':<XCircle size={12}/>,
};

function SwModal({ sw, onClose, onSave }: { sw:SWItem|null; onClose:()=>void; onSave:(s:SWItem)=>void }) {
  const blank: SWItem = { id:'', code:'', brand:'', model:'', serie:'', tipo:'Acceso', ubicacion:'', ubicacion_plano:'', foto:'', observaciones:'', puertos:24, puertos_libres:24, puertos_poe:0, capacidad_puerto:'1G', ip:'', fecha_compra:'', expiracion_garantia:'', tiempo_uso:'', status:'Activo', no_factura:'', costo_dls:0, proveedor:'', firmware:'', contrato_sla:'', rfid:'', anio_instalacion:new Date().getFullYear(), centro_costos:'' };
  const [form, setForm] = useState<SWItem>(sw ?? blank);
  const set = (k: keyof SWItem, v: unknown) => setForm(f=>({...f,[k]:v}));
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { const res = await fetch('/api/upload',{method:'POST',body:fd}); const data = await res.json(); if(data.url) set('foto',data.url); }
    catch { set('foto', URL.createObjectURL(file)); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EBF4]">
          <h2 className="text-base font-bold text-[#1A1D2E]">{sw ? 'Editar Switch' : 'Nuevo Switch'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16}/></button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([['code','Código','text'],['brand','Marca','text'],['model','Modelo','text'],['serie','Serie','text'],['ubicacion','Ubicación','text'],['ubicacion_plano','Ubicación en Plano','text'],['ip','IP de Gestión','text'],['firmware','Firmware','text'],['puertos','Puertos','number'],['puertos_libres','Puertos Libres','number'],['puertos_poe','Puertos PoE','number'],['fecha_compra','Fecha de Compra','date'],['expiracion_garantia','Expiración Garantía','date'],['tiempo_uso','Tiempo de Uso','text'],['no_factura','No. Factura','text'],['costo_dls','Costo USD','number'],['proveedor','Proveedor','text'],['contrato_sla','Contrato SLA','text'],['rfid','Etiqueta RFID','text'],['anio_instalacion','Año de Instalación','number'],['centro_costos','Centro de Costos','text']] as [keyof SWItem,string,string][]).map(([k,label,type])=>(
            <div key={k}><label className="block text-xs font-medium text-slate-600 mb-1">{label}</label><input type={type} value={String(form[k]??'')} onChange={e=>set(k,type==='number'?Number(e.target.value):e.target.value)} className="w-full px-3 py-2 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/></div>
          ))}
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label><select value={form.tipo} onChange={e=>set('tipo',e.target.value as SwTipo)} className="w-full px-3 py-2 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">{(['Core','Distribución','Acceso','PoE','Industrial','Administrable','No administrable'] as SwTipo[]).map(t=><option key={t}>{t}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Capacidad Puerto</label><select value={form.capacidad_puerto} onChange={e=>set('capacidad_puerto',e.target.value)} className="w-full px-3 py-2 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">{['100M','1G','2.5G','5G','10G','25G','40G','100G'].map(c=><option key={c}>{c}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Estado</label><select value={form.status} onChange={e=>set('status',e.target.value as SwStatus)} className="w-full px-3 py-2 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">{(['Activo','Inactivo','Baja'] as SwStatus[]).map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="sm:col-span-2"><label className="block text-xs font-medium text-slate-600 mb-1">Observaciones</label><textarea value={form.observaciones} onChange={e=>set('observaciones',e.target.value)} rows={2} className="w-full px-3 py-2 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Foto</label><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFoto}/><button type="button" onClick={()=>fileRef.current?.click()} className="flex items-center gap-2 px-3 py-2 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg hover:border-cyan-300 transition-colors w-full"><Camera size={14} className="text-slate-500"/>{form.foto?'Cambiar foto':'Subir foto'}</button>{form.foto&&<img src={form.foto} alt="foto" className="mt-2 h-16 rounded-lg object-cover border border-[#E8EBF4]"/>}</div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#E8EBF4]">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={()=>onSave({...form,id:form.id||`sw-${Date.now()}`})} className="px-4 py-2 text-sm font-bold bg-cyan-600 text-white rounded-lg hover:bg-cyan-700">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function SwRow({ sw, onEdit, onDelete, onAdmin, isHighlighted, rowRef }: { sw:SWItem; onEdit:(s:SWItem)=>void; onDelete:(id:string)=>void; onAdmin:(s:SWItem)=>void; isHighlighted?:boolean; rowRef?:(el:HTMLTableRowElement|null)=>void }) {
  const [open, setOpen] = useState(false);
  const usoPct = sw.puertos>0 ? Math.round(((sw.puertos-sw.puertos_libres)/sw.puertos)*100) : 0;
  return (
    <>
      <tr ref={rowRef} onClick={()=>setOpen(o=>!o)} className={`border-b border-[#E8EBF4] hover:bg-cyan-50/30 cursor-pointer transition-colors${isHighlighted?' skia-highlight-row':''}`}>
        <td className="px-3 py-3"><ChevronRight size={14} className={`text-slate-500 transition-transform ${open?'rotate-90':''}`}/></td>
        <td className="px-4 py-3"><div className="font-mono text-xs font-bold text-cyan-700">{sw.code}</div><div className="text-xs text-[#5C6194]">{sw.brand} {sw.model}</div></td>
        <td className="px-4 py-3"><span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">{sw.tipo}</span></td>
        <td className="px-4 py-3 text-xs text-slate-600">{sw.ubicacion}</td>
        <td className="px-4 py-3"><div className="text-xs text-slate-700">{sw.puertos-sw.puertos_libres}/{sw.puertos}</div><div className="w-20 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden"><div className={`h-full rounded-full ${usoPct>=90?'bg-red-500':usoPct>=70?'bg-amber-500':'bg-emerald-500'}`} style={{width:`${usoPct}%`}}/></div></td>
        <td className="px-4 py-3"><div className="text-xs font-mono text-slate-600">{sw.ip||'—'}</div><div className="text-[12px] text-[#5C6194]">{sw.capacidad_puerto}</div></td>
        <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 text-[12px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[sw.status]}`}>{STATUS_ICONS[sw.status]}{sw.status}</span></td>
        <td className="px-4 py-3" onClick={e=>e.stopPropagation()}><div className="flex items-center gap-1"><button onClick={()=>onAdmin(sw)} title="Administración" className="p-1.5 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"><Settings size={13}/></button><button onClick={()=>onEdit(sw)} className="p-1.5 text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"><Edit2 size={13}/></button><button onClick={()=>onDelete(sw.id)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={13}/></button></div></td>
      </tr>
      {open && (
        <tr className="bg-cyan-50/20 border-b border-[#E8EBF4]">
          <td colSpan={8} className="px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[['Serie',sw.serie],['Firmware',sw.firmware],['Puertos PoE',String(sw.puertos_poe)],['Cap. Puerto',sw.capacidad_puerto],['Proveedor',sw.proveedor],['No. Factura',sw.no_factura],['Costo',sw.costo_dls?`$${sw.costo_dls.toLocaleString()} USD`:'—'],['Contrato SLA',sw.contrato_sla||'—'],['Fecha Compra',sw.fecha_compra||'—'],['Exp. Garantía',sw.expiracion_garantia||'—'],['Tiempo de Uso',sw.tiempo_uso||'—'],['Año Instalación',String(sw.anio_instalacion)],['Centro de Costos',sw.centro_costos||'—'],['RFID',sw.rfid||'—'],['Ubic. Plano',sw.ubicacion_plano||'—'],['IP Gestión',sw.ip||'—']].map(([k,v])=>(
                <div key={k} className="bg-slate-100/80 rounded-xl p-3 border border-[#E8EBF4]"><div className="text-[12px] text-[#5C6194] uppercase tracking-wider mb-0.5">{k}</div><div className="text-xs font-semibold text-[#1A1D2E] truncate">{v||'—'}</div></div>
              ))}
            </div>
            {sw.observaciones&&<div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-3"><div className="text-[12px] text-amber-600 font-semibold uppercase mb-1">Observaciones</div><p className="text-xs text-amber-800">{sw.observaciones}</p></div>}
            {sw.foto&&<img src={sw.foto} alt="foto" className="h-24 rounded-xl object-cover border border-[#E8EBF4] mb-3"/>}
            <div className="flex justify-end gap-2">
              <button onClick={()=>onAdmin(sw)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors"><Settings size={12}/>Administración</button>
              <button onClick={()=>onEdit(sw)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors"><Edit2 size={12}/>Editar</button>
              <button onClick={()=>onDelete(sw.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"><Trash2 size={12}/>Eliminar</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SwitchesPage() {
  const router = useRouter();
  const highlightCode = typeof router.query.highlight === 'string' ? decodeURIComponent(router.query.highlight) : undefined;
  const [switches, setSwitches] = useState<SWItem[]>([]);

  // Cargar switches del backend al montar
  useEffect(() => {
    import('axios').then(({ default: axios }) => {
      axios.get('/api/infra/switches')
        .then(res => setSwitches(Array.isArray(res.data) ? res.data : []))
        .catch(() => setSwitches([]));
    });
  }, []);
  const [activeTab, setActiveTab] = useState<'resumen'|'inventario'|'normativa'>(highlightCode ? 'inventario' : 'resumen');
  const [search, setSearch] = useState(highlightCode||'');
  const [highlightedId, setHighlightedId] = useState<string|null>(null);
  const swRowRefs = useRef<Record<string,HTMLTableRowElement|null>>({});
  const didHLSw = useRef(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSw, setEditingSw] = useState<SWItem|null>(null);
  const [showSwWizard, setShowSwWizard] = useState(false);
  const [adminSw, setAdminSw] = useState<SWItem|null>(null);
  const [selSwId, setSelSwId] = useState<string>('');
  const [evals, setEvals] = useState<SCE[]>([]);
  const [activeEval, setActiveEval] = useState<SCE|null>(null);
  const [openCat, setOpenCat] = useState<string|null>(CERT_CATS[0]);
  const [uploadingQId, setUploadingQId] = useState<string|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(()=>switches.filter(s=>{
    const q=search.toLowerCase();
    const matchQ=!q||s.code.toLowerCase().includes(q)||s.brand.toLowerCase().includes(q)||s.model.toLowerCase().includes(q)||s.ubicacion.toLowerCase().includes(q);
    return matchQ&&(!filterStatus||s.status===filterStatus)&&(!filterTipo||s.tipo===filterTipo);
  }),[switches,search,filterStatus,filterTipo]);

  // Scroll + highlight desde búsqueda global
  useEffect(() => {
    if (!highlightCode || didHLSw.current) return;
    setSearch(highlightCode);
    setActiveTab('inventario');
    const t = setTimeout(() => {
      const match = switches.find(s =>
        s.code === highlightCode || s.code.toLowerCase().includes(highlightCode.toLowerCase())
      );
      if (!match) return;
      setHighlightedId(match.id);
      didHLSw.current = true;
      const el = swRowRefs.current[match.id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        setHighlightedId(null);
        const { highlight: _h, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
      }, 2500);
    }, 300);
    return () => clearTimeout(t);
  }, [highlightCode, switches]);

  const totalPuertos=switches.reduce((a,s)=>a+s.puertos,0);
  const usadosPuertos=switches.reduce((a,s)=>a+(s.puertos-s.puertos_libres),0);
  const totalPoE=switches.reduce((a,s)=>a+s.puertos_poe,0);
  const usoPct=totalPuertos>0?Math.round((usadosPuertos/totalPuertos)*100):0;

  const handleEdit=(s:SWItem)=>{setEditingSw(s);setModalOpen(true);};
  const handleDelete=(id:string)=>setSwitches(ss=>ss.filter(s=>s.id!==id));
  const handleAdmin=(s:SWItem)=>setAdminSw(s);
  const handleSave=(s:SWItem)=>{setSwitches(ss=>ss.some(x=>x.id===s.id)?ss.map(x=>x.id===s.id?s:x):[...ss,s]);setModalOpen(false);setEditingSw(null);};

  const selSw=switches.find(s=>s.id===selSwId);
  const swEvals=evals.filter(e=>e.sw_id===selSwId);

  const handleNewEval=()=>{const e:SCE={id:`sce-${Date.now()}`,sw_id:selSwId,sw_code:selSw?.code??'',standard:'ANSI/TIA-942-C',evaluator:'',eval_date:new Date().toISOString().slice(0,10),answers:buildAnswers(),overall_pct:null,badge:'Crítico',notes:''};setActiveEval(e);};
  const handleSaveEval=()=>{if(!activeEval)return;const{pct,badge}=calcBadge(activeEval.answers);const saved={...activeEval,overall_pct:pct,badge};setEvals(ev=>ev.some(e=>e.id===saved.id)?ev.map(e=>e.id===saved.id?saved:e):[...ev,saved]);setActiveEval(null);};

  const handleUploadEvidence=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file||!uploadingQId)return;
    const fd=new FormData();fd.append('file',file);
    try{const res=await fetch('/api/upload',{method:'POST',body:fd});const data=await res.json();const url=data.url??URL.createObjectURL(file);setActiveEval(ev=>ev?{...ev,answers:ev.answers.map(a=>a.question_id===uploadingQId?{...a,evidence_url:url}:a)}:ev);}
    catch{setActiveEval(ev=>ev?{...ev,answers:ev.answers.map(a=>a.question_id===uploadingQId?{...a,evidence_url:URL.createObjectURL(file)}:a)}:ev);}
    setUploadingQId(null);
  };

  return (
    <AppLayout>
      <Head><title>Switches — SKIA DCIM</title></Head>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUploadEvidence}/>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-200"><Network size={16} className="text-white"/></div>
            <h1 className="text-xl font-bold text-[#1A1D2E]">Switches</h1>
          </div>
          <p className="text-sm text-[#5C6194] ml-10">Gestión de switches de red y su conectividad.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100/80 border border-[#E8EBF4] rounded-xl hover:bg-slate-50 transition-colors"><Upload size={14}/>Importar</button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100/80 border border-[#E8EBF4] rounded-xl hover:bg-slate-50 transition-colors"><Download size={14}/>CSV</button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100/80 border border-[#E8EBF4] rounded-xl hover:bg-slate-50 transition-colors"><FileSpreadsheet size={14}/>Excel</button>
          <button onClick={()=>setShowSwWizard(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl hover:opacity-90 shadow-lg shadow-cyan-200 transition-opacity"><Plus size={15}/>Nuevo Switch</button>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-slate-100/80 rounded-xl p-1 mb-6 w-fit">
        {(['resumen','inventario','normativa'] as const).map(tab=>(
          <button key={tab} onClick={()=>setActiveTab(tab)} className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${activeTab===tab?'bg-slate-100 text-cyan-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
            {tab==='resumen'?'Resumen':tab==='inventario'?'Inventario':'Normativa'}
          </button>
        ))}
      </div>

      {switches.length === 0 && (
        <ModuleEmptyState
          icon={<Network size={36} className="text-cyan-600" />}
          title="Sin switches registrados"
          description="Los switches son el núcleo de tu red de datos. Registra cada switch con su modelo, puertos, VLAN y ubicación para gestionar la conectividad de toda tu infraestructura."
          features={[
            { icon: <Network size={14}/>, text: 'Inventario con puertos y VLANs' },
            { icon: <Zap size={14}/>, text: 'Control de puertos PoE y capacidad' },
            { icon: <Shield size={14}/>, text: 'Evaluación de normativa de red' },
            { icon: <BarChart2 size={14}/>, text: 'Resumen de uso global de puertos' },
          ]}
          wizardLabel="Registrar primer Switch"
          onOpenWizard={() => setShowSwWizard(true)}
          accentColor="cyan"
        />
      )}
      {switches.length > 0 && activeTab==='resumen'&&(
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[{icon:<Package size={20}/>,label:'Total Switches',val:switches.length,sub:'registrados',color:'from-cyan-500 to-blue-600',shadow:'shadow-cyan-200'},{icon:<Network size={20}/>,label:'Puertos Totales',val:totalPuertos,sub:`${usadosPuertos} usados`,color:'from-violet-500 to-purple-600',shadow:'shadow-violet-200'},{icon:<Zap size={20}/>,label:'Puertos PoE',val:totalPoE,sub:'con alimentación',color:'from-amber-500 to-orange-500',shadow:'shadow-amber-200'},{icon:<BarChart2 size={20}/>,label:'Uso Global',val:`${usoPct}%`,sub:`${totalPuertos-usadosPuertos} libres`,color:'from-emerald-500 to-teal-600',shadow:'shadow-emerald-200'}].map(k=>(
              <div key={k.label} className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl p-5 hover:shadow-lg transition-shadow">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${k.color} flex items-center justify-center text-white shadow-lg ${k.shadow} mb-3`}>{k.icon}</div>
                <div className="text-2xl font-bold text-slate-800">{k.val}</div>
                <div className="text-sm font-medium text-slate-600">{k.label}</div>
                <div className="text-xs text-[#5C6194] mt-0.5">{k.sub}</div>
                <div className="mt-3 h-0.5 bg-gradient-to-r from-slate-200 to-transparent rounded-full"/>
              </div>
            ))}
          </div>
          <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-[#1A1D2E] mb-4 flex items-center gap-2"><BarChart2 size={14} className="text-cyan-500"/>Uso de puertos global</h3>
            <div className="flex items-center gap-3 mb-2"><div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${usoPct>=90?'bg-red-500':usoPct>=70?'bg-amber-500':'bg-emerald-500'}`} style={{width:`${usoPct}%`}}/></div><span className="text-sm font-bold text-[#1A1D2E] w-12 text-right">{usoPct}%</span></div>
            <div className="flex justify-between text-xs text-[#5C6194]"><span>{usadosPuertos} puertos usados</span><span>{totalPuertos-usadosPuertos} libres de {totalPuertos}</span></div>
          </div>
          <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-[#1A1D2E] mb-4 flex items-center gap-2"><Layers size={14} className="text-cyan-500"/>Por tipo de switch</h3>
            <div className="space-y-3">
              {(['Core','Distribución','Acceso','PoE','Industrial','Administrable','No administrable'] as SwTipo[]).map(tipo=>{
                const items=switches.filter(s=>s.tipo===tipo);if(!items.length)return null;
                const pts=items.reduce((a,s)=>a+s.puertos,0);const used=items.reduce((a,s)=>a+(s.puertos-s.puertos_libres),0);const pct=pts>0?Math.round((used/pts)*100):0;
                return(<div key={tipo}><div className="flex justify-between text-xs mb-1"><span className="font-medium text-slate-700">{tipo} <span className="text-slate-500">({items.length})</span></span><span className="text-slate-500">{used}/{pts} · {pct}%</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct>=90?'bg-red-400':pct>=70?'bg-amber-400':'bg-cyan-400'}`} style={{width:`${pct}%`}}/></div></div>);
              })}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(['Activo','Inactivo','Baja'] as SwStatus[]).map(s=>{const n=switches.filter(x=>x.status===s).length;return(<div key={s} className={`rounded-2xl p-4 border text-center ${STATUS_COLORS[s]}`}><div className="text-2xl font-bold">{n}</div><div className="text-xs font-semibold mt-0.5">{s}</div></div>);})}
          </div>
          <div className="flex justify-end"><button onClick={()=>setActiveTab('inventario')} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl hover:opacity-90 shadow-lg shadow-cyan-200">Ver inventario completo <ChevronRight size={14}/></button></div>
        </div>
      )}

      {switches.length > 0 && activeTab==='inventario'&&(
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por código, marca, modelo..." className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100/80 border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/></div>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="px-3 py-2 text-sm bg-slate-100/80 border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"><option value="">Todos los estados</option>{(['Activo','Inactivo','Baja'] as SwStatus[]).map(s=><option key={s}>{s}</option>)}</select>
            <select value={filterTipo} onChange={e=>setFilterTipo(e.target.value)} className="px-3 py-2 text-sm bg-slate-100/80 border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"><option value="">Todos los tipos</option>{(['Core','Distribución','Acceso','PoE','Industrial','Administrable','No administrable'] as SwTipo[]).map(t=><option key={t}>{t}</option>)}</select>
            <button onClick={()=>{setSearch('');setFilterStatus('');setFilterTipo('');}} className="p-2 text-slate-500 hover:text-slate-600 hover:bg-slate-100 rounded-lg"><RefreshCw size={15}/></button>
          </div>
          <p className="text-xs text-[#5C6194]">{filtered.length} de {switches.length} switches</p>
          <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-[#E8EBF4] bg-slate-50/80">
                <th className="w-8 px-3 py-3"/>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Código / Marca</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ubicación</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Puertos</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">IP / Velocidad</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr></thead>
              <tbody>
                {filtered.length===0
                  ?<tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500 text-sm">No se encontraron switches.</td></tr>
                  :filtered.map(sw=>(
                    <SwRow key={sw.id} sw={sw} onEdit={handleEdit} onDelete={handleDelete} onAdmin={handleAdmin} isHighlighted={highlightedId===sw.id} rowRef={el=>{ swRowRefs.current[sw.id]=el as HTMLTableRowElement|null; }}/>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {switches.length > 0 && activeTab==='normativa'&&(
        <div className="space-y-4">
          <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl p-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Switch a evaluar</label>
            <select value={selSwId} onChange={e=>{setSelSwId(e.target.value);setActiveEval(null);}} className="w-full max-w-sm px-3 py-2 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">
              {switches.map(s=><option key={s.id} value={s.id}>{s.code} — {s.brand} {s.model} ({s.ubicacion})</option>)}
            </select>
          </div>
          {!activeEval&&(
            <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8EBF4]">
                <h3 className="text-sm font-bold text-[#1A1D2E]">Historial de evaluaciones — {selSw?.code}</h3>
                <button onClick={handleNewEval} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg hover:opacity-90 shadow-md shadow-cyan-200"><Plus size={12}/>Nueva evaluación</button>
              </div>
              {swEvals.length===0
                ?<div className="py-12 text-center text-slate-500 text-sm">No hay evaluaciones para este switch.<br/><span className="text-xs">Haz clic en "Nueva evaluación" para comenzar.</span></div>
                :<table className="w-full"><thead><tr className="border-b border-[#E8EBF4] bg-slate-50/80"><th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Fecha</th><th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Evaluador</th><th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Estándar</th><th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Resultado</th><th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Badge</th><th className="px-4 py-3"/></tr></thead><tbody>{swEvals.map(ev=>(<tr key={ev.id} className="border-b border-[#E8EBF4] hover:bg-slate-50/80"><td className="px-4 py-3 text-xs text-slate-600">{ev.eval_date}</td><td className="px-4 py-3 text-xs text-slate-600">{ev.evaluator||'—'}</td><td className="px-4 py-3 text-xs text-[#5C6194] font-mono">{ev.standard}</td><td className="px-4 py-3"><span className="text-sm font-bold text-[#1A1D2E]">{ev.overall_pct??'—'}%</span></td><td className="px-4 py-3"><span className={`text-[12px] font-bold px-2 py-0.5 rounded-full border ${BADGE_COLOR[ev.badge]}`}>{ev.badge}</span></td><td className="px-4 py-3"><button onClick={()=>setActiveEval(ev)} className="flex items-center gap-1 px-2 py-1 text-[12px] font-bold text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100"><Edit2 size={10}/>Editar</button></td></tr>))}</tbody></table>
              }
            </div>
          )}
          {activeEval&&(
            <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8EBF4] bg-gradient-to-r from-cyan-50 to-blue-50">
                <div><h3 className="text-sm font-bold text-slate-800">Evaluación de normativa</h3><p className="text-xs text-[#5C6194] mt-0.5">{selSw?.code} — {selSw?.brand} {selSw?.model}</p></div>
                <button onClick={()=>setActiveEval(null)} className="p-1.5 hover:bg-slate-100/80 rounded-lg"><X size={15}/></button>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-[#E8EBF4]">
                <div><label className="block text-xs font-medium text-slate-600 mb-1">Estándar de referencia</label><select value={activeEval.standard} onChange={e=>setActiveEval(ev=>ev?{...ev,standard:e.target.value as CertNorm}:ev)} className="w-full px-3 py-2 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">{CERT_NORMS.map(n=><option key={n}>{n}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">Evaluador</label><input value={activeEval.evaluator} onChange={e=>setActiveEval(ev=>ev?{...ev,evaluator:e.target.value}:ev)} className="w-full px-3 py-2 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label><input type="date" value={activeEval.eval_date} onChange={e=>setActiveEval(ev=>ev?{...ev,eval_date:e.target.value}:ev)} className="w-full px-3 py-2 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/></div>
              </div>
              <div className="divide-y divide-[#F0F2FA]">
                {CERT_CATS.map(cat=>{
                  const qs=CERT_QS.filter(q=>q.category===cat);const isOpen=openCat===cat;
                  const answered=qs.filter(q=>activeEval.answers.find(a=>a.question_id===q.id)?.answer!=='na').length;
                  return(
                    <div key={cat}>
                      <button type="button" onClick={()=>setOpenCat(isOpen?null:cat)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50/80 transition-colors">
                        <div className="flex items-center gap-2"><span className="text-cyan-500">{CAT_ICONS[cat]}</span><span className="text-sm font-semibold text-slate-700">{cat}</span><span className="text-[12px] text-[#5C6194]">({answered}/{qs.length} respondidas)</span></div>
                        <ChevronDown size={14} className={`text-slate-500 transition-transform ${isOpen?'rotate-180':''}`}/>
                      </button>
                      {isOpen&&(
                        <div className="divide-y divide-slate-50">
                          {qs.map(q=>{
                            const ans=activeEval.answers.find(a=>a.question_id===q.id)!;
                            return(
                              <div key={q.id} className="px-5 py-3 space-y-2">
                                <div className="flex items-start gap-2">
                                  <span className={`flex-shrink-0 text-[13px] font-bold px-1.5 py-0.5 rounded border mt-0.5 ${q.criticality==='critica'?'bg-red-100 text-red-700 border-red-200':q.criticality==='alta'?'bg-orange-100 text-orange-700 border-orange-200':q.criticality==='media'?'bg-amber-100 text-amber-700 border-amber-200':'bg-slate-100 text-slate-500 border-[#E8EBF4]'}`}>{q.criticality.toUpperCase()}</span>
                                  <div className="flex-1"><p className="text-xs text-slate-700">{q.question}</p><div className="mt-1.5 flex items-start gap-1.5 bg-blue-50/60 border border-blue-100 rounded-lg px-2.5 py-1.5"><BookOpen size={10} className="text-blue-400 flex-shrink-0 mt-0.5"/><p className="text-[12px] text-blue-700 leading-relaxed">{q.hint}</p></div></div>
                                  <span className="text-[13px] text-slate-500 font-mono flex-shrink-0">{q.norm_ref}</span>
                                </div>
                                <div className="flex items-center gap-2 ml-8">
                                  {(['cumple','no_cumple','na'] as CertAnswer[]).map(opt=>(
                                    <button key={opt} type="button" onClick={()=>setActiveEval(ev=>ev?{...ev,answers:ev.answers.map(a=>a.question_id===q.id?{...a,answer:opt}:a)}:ev)} className={`px-3 py-1 text-[12px] font-bold rounded-lg border transition-all ${ans.answer===opt?(opt==='cumple'?'bg-emerald-500 text-white border-emerald-500':opt==='no_cumple'?'bg-red-500 text-white border-red-500':'bg-gray-400 text-white border-gray-400'):'bg-slate-100 text-slate-500 border-[#E8EBF4] hover:border-gray-300'}`}>{opt==='cumple'?'Cumple':opt==='no_cumple'?'No cumple':'N/A'}</button>
                                  ))}
                                  <input value={ans.observation} onChange={e=>setActiveEval(ev=>ev?{...ev,answers:ev.answers.map(a=>a.question_id===q.id?{...a,observation:e.target.value}:a)}:ev)} placeholder="Observación..." className="flex-1 px-2 py-1 text-[13px] bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-400"/>
                                  <button type="button" onClick={()=>{setUploadingQId(q.id);fileRef.current?.click();}} className={`flex items-center gap-1 px-2 py-1 text-[12px] font-bold rounded-lg border transition-colors ${ans.evidence_url?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-slate-50 text-slate-500 border-[#E8EBF4] hover:border-cyan-300'}`}><Camera size={9}/>{ans.evidence_url?'Ver':'Evidencia'}</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-4 border-t border-[#E8EBF4]"><label className="block text-xs font-medium text-slate-600 mb-1">Notas generales</label><textarea value={activeEval.notes} onChange={e=>setActiveEval(ev=>ev?{...ev,notes:e.target.value}:ev)} rows={2} className="w-full px-3 py-2 text-sm bg-[#F8F9FE] border border-[#E8EBF4] rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300"/></div>
              <div className="flex justify-end gap-3 px-5 py-4 border-t border-[#E8EBF4]">
                <button onClick={()=>setActiveEval(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button onClick={handleSaveEval} className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:opacity-90 shadow-md shadow-cyan-200">Guardar evaluación</button>
              </div>
            </div>
          )}
        </div>
      )}

      {modalOpen&&<SwModal sw={editingSw} onClose={()=>{setModalOpen(false);setEditingSw(null);}} onSave={handleSave}/>}
      {showSwWizard && (
        <SwitchWizard
          onClose={() => setShowSwWizard(false)}
          onSave={(data: SwitchWizardData) => {
            const newSw: SWItem = {
              id: Date.now().toString(),
              code: data.code,
              brand: data.brand,
              model: data.model,
              serie: data.serie ?? '',
              tipo: data.tipo as any,
              status: data.status as any,
              ubicacion: data.ubicacion ?? '',
              ubicacion_plano: data.ubicacion_plano ?? '',
              foto: '',
              observaciones: data.observaciones ?? '',
              puertos: data.puertos ?? 0,
              puertos_libres: data.puertos_libres ?? 0,
              puertos_poe: data.puertos_poe ?? 0,
              capacidad_puerto: data.capacidad_puerto ?? '1G',
              ip: data.ip ?? '',
              fecha_compra: data.fecha_compra ?? '',
              expiracion_garantia: data.expiracion_garantia ?? '',
              tiempo_uso: '',
              no_factura: data.no_factura ?? '',
              costo_dls: data.costo_dls ?? 0,
              proveedor: data.proveedor ?? '',
              firmware: data.firmware ?? '',
              contrato_sla: data.contrato_sla ?? '',
              rfid: data.rfid ?? '',
              anio_instalacion: data.anio_instalacion ?? new Date().getFullYear(),
              centro_costos: data.centro_costos ?? '',
            };
            import('axios').then(({ default: axios }) => {
              axios.post('/api/infra/switches', {
                internal_code: '',
                name: data.name,
                brand: data.brand,
                model: data.model,
                serial: data.serie ?? '',
                switch_type: data.tipo ?? 'Acceso',
                status: data.status === 'Activo' ? 'active' : 'inactive',
                location: data.ubicacion ?? '',
                ip_address: data.ip ?? '',
                ports_total: data.puertos ?? 0,
                ports_free: data.puertos_libres ?? 0,
                observations: data.observaciones ?? '',
                placement_id: data.placement_id,
              }).then(resp => {
                setSwitches(ss => [{ ...newSw, id: resp.data.id ?? newSw.id, code: resp.data.internal_code ?? newSw.code }, ...ss]);
              }).catch(() => undefined);
            });
            setShowSwWizard(false);
          }}
        />
      )}
      {adminSw&&<SwitchAdminPanel sw={adminSw} onClose={()=>setAdminSw(null)}/>}
    </AppLayout>
  );
}
