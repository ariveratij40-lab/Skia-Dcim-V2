'use client';
import axios from 'axios';
import Head from 'next/head';

import AppLayout from '@/components/AppLayout';
import ModuleEmptyState from '@/components/ModuleEmptyState';
import NodeWizard, { NodeWizardData } from '@/components/NodeWizard';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  ChevronDown, ChevronRight, Plus, Search, Download, Upload,
  Edit2, Trash2, X, CheckCircle, AlertTriangle, Clock, Tag,
  BookOpen, FileText, MapPin, Layers, Plug, Eye, UploadCloud
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type NodeMICE = 'Bajo' | 'Medio' | 'Alto';
type NodeCategoria = '5' | '5e' | '6' | '6A';
type NodeGama = 'PanNET' | 'NetKey' | 'Mini-Com' | 'KeyConnect' | 'Otro';
type NodeClasificacion = 'CMR' | 'Plenum' | 'LSZH' | 'Riser';
type NodeServicio = 'Voz' | 'Datos' | 'Video' | 'Control Acceso' | 'CCTV' | 'WiFi' | 'IoT';
type NodeEstado = 'Activo' | 'Inactivo' | 'Baja';
type CertAnswer = 'cumple' | 'no_cumple' | 'na' | null;

interface NodeItem {
  id: string;
  codigo: string;
  marca: string;
  mice: NodeMICE;
  numParte: string;
  color: string;
  categoria: NodeCategoria;
  gama: NodeGama;
  clasificacion: NodeClasificacion;
  idf: string;
  servicio: NodeServicio;
  area: string;
  patchpanel: string;
  patchcordInterno: string;
  switchDestino: string;
  longitud: string;
  normativa: boolean;
  certificadoFluke: boolean;
  verEnPlano: string;
  integrador: string;
  po: string;
  costo: number;
  docFluke: string;      // nombre del archivo PDF subido
  docFlukeUrl: string;   // URL/dataURL del PDF
  docPanduit: string;    // nombre del archivo PDF subido
  docPanduitUrl: string; // URL/dataURL del PDF
  centroCostos: string;
  etiquetaRFID: string;
  anioInstalacion: number;
  estado: NodeEstado;
  observaciones: string;
  foto: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_NODES: NodeItem[] = [
  { id:'n1', codigo:'NOD-IDF1-0001', marca:'Panduit', mice:'Bajo', numParte:'PUR6C04BU-F', color:'Azul', categoria:'5', gama:'PanNET', clasificacion:'CMR', idf:'IDF1-P1-E2', servicio:'Voz', area:'Produccion', patchpanel:'IDF1-RA-PP3-P12', patchcordInterno:'3 Pies', switchDestino:'IDF1-RB-SW2-P12', longitud:'45mts', normativa:true, certificadoFluke:true, verEnPlano:'Plano-IDF1-P1', integrador:'Bajanet', po:'PO-2025-001', costo:20, docFluke:'Fluke_NOD-IDF1-0001.pdf', docFlukeUrl:'', docPanduit:'Panduit_NOD-IDF1-0001.pdf', docPanduitUrl:'', centroCostos:'CC-TI-001', etiquetaRFID:'RFID-NOD-0001', anioInstalacion:2025, estado:'Activo', observaciones:'Nodo en buen estado', foto:'' },
  { id:'n2', codigo:'NOD-IDF1-0002', marca:'Panduit', mice:'Medio', numParte:'PUR5E04GR-F', color:'Gris', categoria:'5e', gama:'NetKey', clasificacion:'Plenum', idf:'IDF1-P1-E2', servicio:'Datos', area:'Recepcion', patchpanel:'IDF1-RA-PP3-P13', patchcordInterno:'7 Pies', switchDestino:'IDF1-RB-SW2-P13', longitud:'38mts', normativa:false, certificadoFluke:false, verEnPlano:'Plano-IDF1-P1', integrador:'Telmex', po:'PO-2025-002', costo:18, docFluke:'', docFlukeUrl:'', docPanduit:'', docPanduitUrl:'', centroCostos:'CC-TI-001', etiquetaRFID:'RFID-NOD-0002', anioInstalacion:2025, estado:'Activo', observaciones:'Pendiente certificar', foto:'' },
  { id:'n3', codigo:'NOD-IDF2-0001', marca:'Belden', mice:'Alto', numParte:'BDN-C6-YE-F', color:'Amarillo', categoria:'6', gama:'Mini-Com', clasificacion:'CMR', idf:'IDF2-P2-E1', servicio:'Video', area:'Almacen', patchpanel:'IDF2-RA-PP1-P05', patchcordInterno:'3 Pies', switchDestino:'IDF2-RB-SW1-P05', longitud:'52mts', normativa:true, certificadoFluke:true, verEnPlano:'Plano-IDF2-P2', integrador:'Foundation Corp', po:'PO-2024-015', costo:25, docFluke:'Fluke_NOD-IDF2-0001.pdf', docFlukeUrl:'', docPanduit:'Panduit_NOD-IDF2-0001.pdf', docPanduitUrl:'', centroCostos:'CC-SEG-002', etiquetaRFID:'RFID-NOD-0003', anioInstalacion:2024, estado:'Activo', observaciones:'', foto:'' },
  { id:'n4', codigo:'NOD-IDF2-0002', marca:'CommScope', mice:'Medio', numParte:'CS-C6A-BL-F', color:'Negro', categoria:'6A', gama:'KeyConnect', clasificacion:'LSZH', idf:'IDF2-P2-E1', servicio:'Control Acceso', area:'Almacen', patchpanel:'IDF2-RA-PP1-P06', patchcordInterno:'20 Pies', switchDestino:'IDF2-RB-SW1-P06', longitud:'61mts', normativa:true, certificadoFluke:true, verEnPlano:'Plano-IDF2-P2', integrador:'Cablemas', po:'PO-2024-016', costo:32, docFluke:'Fluke_NOD-IDF2-0002.pdf', docFlukeUrl:'', docPanduit:'Panduit_NOD-IDF2-0002.pdf', docPanduitUrl:'', centroCostos:'CC-ACC-003', etiquetaRFID:'RFID-NOD-0004', anioInstalacion:2024, estado:'Activo', observaciones:'Nodo para control de acceso puerta principal', foto:'' },
  { id:'n5', codigo:'NOD-MDF-0001', marca:'Panduit', mice:'Alto', numParte:'PUR6AC04RD-F', color:'Rojo', categoria:'6A', gama:'PanNET', clasificacion:'Plenum', idf:'MDF-E1-A', servicio:'Datos', area:'Sala Servidores', patchpanel:'MDF-RA-PP1-P01', patchcordInterno:'3 Pies', switchDestino:'MDF-SW-CORE-P01', longitud:'12mts', normativa:true, certificadoFluke:true, verEnPlano:'Plano-MDF-E1', integrador:'Bajanet', po:'PO-2025-010', costo:45, docFluke:'Fluke_NOD-MDF-0001.pdf', docFlukeUrl:'', docPanduit:'Panduit_NOD-MDF-0001.pdf', docPanduitUrl:'', centroCostos:'CC-TI-001', etiquetaRFID:'RFID-NOD-0005', anioInstalacion:2025, estado:'Activo', observaciones:'Nodo crítico sala servidores', foto:'' },
  { id:'n6', codigo:'NOD-IDF3-0001', marca:'Leviton', mice:'Bajo', numParte:'LEV-5E-GR-F', color:'Verde', categoria:'5e', gama:'Otro', clasificacion:'CMR', idf:'IDF3-P3-E1', servicio:'WiFi', area:'Cafeteria', patchpanel:'IDF3-RA-PP2-P08', patchcordInterno:'7 Pies', switchDestino:'IDF3-RB-SW1-P08', longitud:'29mts', normativa:false, certificadoFluke:false, verEnPlano:'Plano-IDF3-P3', integrador:'Telmex', po:'PO-2023-022', costo:15, docFluke:'', docFlukeUrl:'', docPanduit:'', docPanduitUrl:'', centroCostos:'CC-TI-001', etiquetaRFID:'', anioInstalacion:2023, estado:'Inactivo', observaciones:'Nodo sin uso desde remodelacion', foto:'' },
];

// ─── Cert Questions ───────────────────────────────────────────────────────────
interface NCQ { id:number; cat:string; norm:string; question:string; criticality:'Alta'|'Media'|'Baja'; hint:string; }
const CERT_QS: NCQ[] = [
  // Instalación física
  { id:1, cat:'Instalación física', norm:'TIA-568.2-D §6.4', question:'¿El nodo está correctamente instalado en la caja de salida o faceplate?', criticality:'Alta', hint:'El faceplate debe estar nivelado, sin holgura y con todos los tornillos apretados. El keystone debe hacer clic al insertarse. Un nodo mal asegurado puede causar pérdida de inserción >0.5 dB por micro-movimientos.' },
  { id:2, cat:'Instalación física', norm:'TIA-568.2-D §10.2', question:'¿El radio de curvatura del cable en la caja de salida es correcto?', criticality:'Alta', hint:'Radio mínimo: 4× el diámetro del cable (≈25 mm para Cat6). En la caja de salida el cable no debe doblarse bruscamente. Usar organizadores de cable o cajas con guías de curvatura integradas.' },
  { id:3, cat:'Instalación física', norm:'TIA-568.2-D §6.5', question:'¿El par de hilos está correctamente terminado (sin exceso de destrenzado)?', criticality:'Alta', hint:'Destrenzado máximo permitido: 13 mm (Cat5e), 6 mm (Cat6), 4 mm (Cat6A). El exceso de destrenzado aumenta la diafonía (NEXT) y puede causar fallo en la normativa. Verificar con certificador Fluke.' },
  { id:4, cat:'Instalación física', norm:'TIA-568.2-D §6.3', question:'¿El nodo tiene protección contra polvo (dust cap) cuando no está en uso?', criticality:'Media', hint:'Los dust caps previenen contaminación de los contactos dorados. Un contacto oxidado puede causar resistencia de contacto >0.1 Ω, causando errores intermitentes. Usar caps de color según servicio (azul=datos, verde=voz).' },
  { id:5, cat:'Instalación física', norm:'TIA-569-D §9.3', question:'¿La caja de salida está ubicada a la altura correcta (40-120 cm del piso)?', criticality:'Baja', hint:'TIA-569-D recomienda 40-120 cm del piso para nodos de trabajo. En áreas especiales (salas de conferencia, laboratorios) puede variar. Documentar cualquier desviación con justificación técnica.' },
  // Etiquetado y documentación
  { id:6, cat:'Etiquetado y documentación', norm:'TIA-606-C §4.2', question:'¿El nodo tiene etiqueta con ID único visible y legible?', criticality:'Alta', hint:'Formato recomendado: {Edificio}-{Piso}-{Cuarto}-{Puerto} (ej. IDF1-P1-PP3-P12). Etiquetas de poliéster o vinilo resistente a UV. Tamaño mínimo 6pt. Actualizar inmediatamente ante cualquier cambio.' },
  { id:7, cat:'Etiquetado y documentación', norm:'TIA-606-C §6.1', question:'¿El nodo aparece en el plano de planta actualizado?', criticality:'Media', hint:'El plano debe mostrar la ubicación exacta, ID del nodo, servicio asignado y trayectoria del cable. Actualización máxima 24h después de cualquier cambio. Formato digital (.dwg/.pdf) y copia impresa en cuarto técnico.' },
  { id:8, cat:'Etiquetado y documentación', norm:'TIA-606-C §7.3', question:'¿Existe registro de normativa con resultados de prueba?', criticality:'Alta', hint:'El registro debe incluir: fecha, técnico certificador, equipo de medición (modelo+serial+fecha calibración), resultados de todos los parámetros (Wire Map, Length, NEXT, ELFEXT, Return Loss, Delay Skew) y resultado PASS/FAIL.' },
  { id:9, cat:'Etiquetado y documentación', norm:'TIA-606-C §8.2', question:'¿El nodo está registrado en el sistema de gestión de infraestructura (DCIM)?', criticality:'Media', hint:'El registro en DCIM debe incluir: ID, ubicación, servicio, switch destino, puerto de patch panel, fecha instalación, integrador y estado actual. Permite trazabilidad completa y gestión de cambios.' },
  { id:10, cat:'Etiquetado y documentación', norm:'TIA-606-C §9.1', question:'¿Existe documentación del patchcord interno y su categoría?', criticality:'Baja', hint:'El patchcord interno (entre keystone y patch panel) debe ser de la misma categoría o superior al cable horizontal. Documentar longitud, color y categoría. Longitudes recomendadas: 3, 5, 7 o 10 pies.' },
  // Normativa y pruebas
  { id:11, cat:'Normativa y pruebas', norm:'TIA-568.2-D §11.1', question:'¿El nodo ha sido certificado con equipo Fluke DSX o equivalente?', criticality:'Alta', hint:'La normativa debe realizarse en modo Permanent Link (sin patchcords) con adaptadores certificados. El equipo debe tener calibración vigente (máx. 1 año). Guardar archivos .flw originales por mínimo 5 años.' },
  { id:12, cat:'Normativa y pruebas', norm:'TIA-568.2-D §11.2', question:'¿Todos los parámetros de normativa están dentro de los límites?', criticality:'Alta', hint:'Parámetros críticos Cat6: NEXT ≥44.3 dB @100MHz, Return Loss ≥20.1 dB, IL ≤21.3 dB, Length ≤90m. Para Cat6A: NEXT ≥54.0 dB @500MHz. Un FAIL en cualquier parámetro invalida el canal completo.' },
  { id:13, cat:'Normativa y pruebas', norm:'TIA-568.2-D §11.3', question:'¿La longitud del cable horizontal no excede los 90 metros?', criticality:'Alta', hint:'El canal permanente (Permanent Link) no debe exceder 90m. El canal completo (con patchcords) no debe exceder 100m. Longitudes mayores causan atenuación excesiva y fallo en normativa. Medir con certificador, no con cinta.' },
  { id:14, cat:'Normativa y pruebas', norm:'TIA-568.2-D §11.4', question:'¿El Wire Map muestra continuidad correcta en los 4 pares?', criticality:'Alta', hint:'Wire Map debe mostrar: 1-2, 3-6, 4-5, 7-8 (T568B) o 1-2, 3-6, 4-5, 7-8 (T568A). Errores comunes: split pairs (pares cruzados), opens (circuito abierto), shorts (cortocircuito), reversed pairs. Cualquier error = FAIL.' },
  { id:15, cat:'Normativa y pruebas', norm:'TIA-568.2-D §11.5', question:'¿La normativa está vigente (menos de 3 años)?', criticality:'Media', hint:'Se recomienda re-certificar cada 3 años o después de cualquier intervención física. Los parámetros de los cables pueden degradarse por temperatura, humedad, daño físico o envejecimiento de los conectores.' },
  // Gestión de cables
  { id:16, cat:'Gestión de cables', norm:'TIA-569-D §9.4', question:'¿El cable tiene holgura suficiente en la caja de salida (mínimo 15 cm)?', criticality:'Media', hint:'La holgura permite futuras re-terminaciones sin necesidad de jalar más cable. Mínimo 15 cm desde el punto de entrada a la caja. Sin holgura, una re-terminación puede dejar el cable demasiado corto para alcanzar el nodo.' },
  { id:17, cat:'Gestión de cables', norm:'TIA-568.2-D §10.3', question:'¿El cable está protegido contra daño físico en su trayectoria?', criticality:'Alta', hint:'Verificar que el cable no esté aplastado por muebles, pisado por puertas, doblado en ángulos agudos o expuesto a calor. Usar canaletas, tubería conduit o protectores de cable en zonas de riesgo.' },
  { id:18, cat:'Gestión de cables', norm:'TIA-568.2-D §10.4', question:'¿El cable está separado de fuentes de EMI (mínimo 50 mm de cables de energía)?', criticality:'Media', hint:'Separación mínima: 50 mm de cables de 120V, 100 mm de cables de 240V, 200 mm de transformadores y motores. En paralelo >30m: usar bandeja separada. El EMI puede causar errores de bit y degradar el rendimiento de la red.' },
  { id:19, cat:'Gestión de cables', norm:'TIA-569-D §9.5', question:'¿El cable está correctamente etiquetado en ambos extremos?', criticality:'Media', hint:'Etiqueta en el nodo y en el puerto del patch panel correspondiente. Mismo ID en ambos extremos. Verificar que la etiqueta del patch panel coincide con el plano y el sistema DCIM. Usar etiquetas wrap-around resistentes.' },
  { id:20, cat:'Gestión de cables', norm:'TIA-568.2-D §10.5', question:'¿El tipo de cable instalado corresponde a la categoría documentada?', criticality:'Alta', hint:'Verificar la impresión en la chaqueta del cable (ej. "Cat6 UTP CMR"). El cable instalado debe ser de la categoría documentada o superior. Un cable Cat5e en un canal documentado como Cat6 invalida la normativa.' },
  // Seguridad y acceso
  { id:21, cat:'Seguridad y acceso', norm:'TIA-942-B §10.2', question:'¿Los nodos en áreas sensibles tienen protección contra acceso no autorizado?', criticality:'Alta', hint:'En áreas de seguridad (salas de servidores, cuartos de telecomunicaciones) usar port locks o nodos con tapa con llave. Registrar quién tiene acceso. Un nodo desprotegido permite insertar dispositivos no autorizados.' },
  { id:22, cat:'Seguridad y acceso', norm:'ISO 27001 A.11.2', question:'¿Existe procedimiento para el alta y baja de nodos?', criticality:'Media', hint:'El procedimiento debe incluir: solicitud formal, aprobación de TI, instalación por técnico certificado, normativa, documentación en DCIM y notificación al usuario. Para bajas: desconexión, etiquetado como inactivo y registro.' },
  { id:23, cat:'Seguridad y acceso', norm:'TIA-942-B §10.3', question:'¿Los nodos inactivos están desconectados en el patch panel?', criticality:'Media', hint:'Los puertos inactivos en el switch deben estar administrativamente apagados (shutdown). El patchcord entre patch panel y switch debe estar desconectado. Esto previene acceso no autorizado a la red.' },
  { id:24, cat:'Seguridad y acceso', norm:'TIA-942-B §10.4', question:'¿Los nodos están inventariados con su estado actual (activo/inactivo/baja)?', criticality:'Baja', hint:'El inventario debe reflejar el estado real en tiempo real. Nodos inactivos sin documentar son un riesgo de seguridad y generan confusión en la gestión de cambios. Auditoría física recomendada cada 6 meses.' },
  { id:25, cat:'Seguridad y acceso', norm:'TIA-942-B §10.5', question:'¿Existe registro de todos los cambios realizados en los nodos?', criticality:'Baja', hint:'El registro de cambios (change log) debe incluir: fecha, técnico, tipo de cambio (instalación, re-terminación, cambio de servicio, baja), motivo y estado post-cambio. Retención mínima: 3 años.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MICE_COLOR: Record<NodeMICE, string> = {
  'Bajo': '#22c55e',
  'Medio': '#f59e0b',
  'Alto': '#ef4444',
};
const CAT_COLOR: Record<NodeCategoria, string> = {
  '5': '#6b7280',
  '5e': '#3b82f6',
  '6': '#8b5cf6',
  '6A': '#06b6d4',
};
const SERVICIO_COLOR: Record<NodeServicio, string> = {
  'Voz': '#22c55e',
  'Datos': '#3b82f6',
  'Video': '#f59e0b',
  'Control Acceso': '#ef4444',
  'CCTV': '#8b5cf6',
  'WiFi': '#06b6d4',
  'IoT': '#f97316',
};
const ESTADO_COLOR: Record<NodeEstado, string> = {
  'Activo': '#22c55e',
  'Inactivo': '#f59e0b',
  'Baja': '#ef4444',
};

// ─── NodeRow ──────────────────────────────────────────────────────────────────
function NodeRow({ item, onEdit, onDelete }: { item: NodeItem; onEdit: (i: NodeItem) => void; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showFluke, setShowFluke] = useState(false);
  const [showPanduit, setShowPanduit] = useState(false);
  const [localItem, setLocalItem] = useState<NodeItem>(item);
  const flukeInputRef = React.useRef<HTMLInputElement>(null);
  const panduitInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileUpload = (type: 'fluke' | 'panduit', file: File) => {
    const url = URL.createObjectURL(file);
    if (type === 'fluke') {
      setLocalItem(prev => ({ ...prev, docFluke: file.name, docFlukeUrl: url, certificadoFluke: true }));
    } else {
      setLocalItem(prev => ({ ...prev, docPanduit: file.name, docPanduitUrl: url }));
    }
  };
  return (
    <>
      <div
        style={{
          display:'grid',
          gridTemplateColumns:'1.5rem 2fr 1.4fr 1fr 1fr 1fr 1.2fr 1.4fr',
          gap:'0.5rem',
          alignItems:'center',
          padding:'0.75rem 1rem',
          cursor:'pointer',
          borderBottom:'1px solid #E8EBF4',
          background: expanded ? '#EEF2FF' : 'transparent',
          transition:'background 0.15s',
        }}
        onMouseEnter={e => { if(!expanded)(e.currentTarget as HTMLDivElement).style.background='#F8FAFF'; }}
        onMouseLeave={e => { if(!expanded)(e.currentTarget as HTMLDivElement).style.background='transparent'; }}
      >
        <span onClick={() => setExpanded(e => !e)} style={{ color:'#2563EB', display:'flex', alignItems:'center', cursor:'pointer' }}>
          {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
        </span>
        <div onClick={() => setExpanded(e => !e)}>
          <div style={{ color:'#1E293B', fontWeight:600, fontSize:'0.85rem' }}>{item.codigo}</div>
          <div style={{ color:'#64748B', fontSize:'0.75rem' }}>{item.marca}</div>
        </div>
        <div onClick={() => setExpanded(e => !e)} style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
          <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'0.7rem', fontWeight:700, color: MICE_COLOR[item.mice], background: MICE_COLOR[item.mice]+'22', padding:'1px 6px', borderRadius:'4px' }}>{item.mice}</span>
            <span style={{ fontSize:'0.7rem', color:'#64748B', background:'#F1F5F9', padding:'1px 6px', borderRadius:'4px' }}>Cat{item.categoria}</span>
          </div>
          <span style={{ fontSize:'0.7rem', fontWeight:600, color: SERVICIO_COLOR[item.servicio], background: SERVICIO_COLOR[item.servicio]+'22', padding:'1px 6px', borderRadius:'4px', width:'fit-content' }}>{item.servicio}</span>
        </div>
        <span onClick={() => setExpanded(e => !e)} style={{ fontSize:'0.75rem', color:'#1E293B' }}>{item.idf}</span>
        <span onClick={() => setExpanded(e => !e)} style={{ fontSize:'0.75rem', color:'#1E293B' }}>{item.area}</span>
        <span onClick={() => setExpanded(e => !e)} style={{ fontSize:'0.75rem', color:'#1E293B' }}>{item.longitud}</span>
        <div onClick={() => setExpanded(e => !e)} style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
          <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'0.75rem', color: item.normativa ? '#22c55e' : '#ef4444' }}>
            {item.normativa ? <CheckCircle size={13}/> : <AlertTriangle size={13}/>}
            {item.normativa ? 'Certificado' : 'Sin certif.'}
          </span>
          <span style={{ fontSize:'0.7rem', fontWeight:600, color: ESTADO_COLOR[item.estado], background: ESTADO_COLOR[item.estado]+'22', padding:'1px 6px', borderRadius:'4px', width:'fit-content' }}>{item.estado}</span>
        </div>
        {/* Columna Acciones — PDF upload/view */}
        <div style={{ display:'flex', flexDirection:'column', gap:'4px' }} onClick={e => e.stopPropagation()}>
          {/* Prueba Fluke */}
          <input ref={flukeInputRef} type="file" accept=".pdf" style={{ display:'none' }}
            onChange={e => { if(e.target.files?.[0]) handleFileUpload('fluke', e.target.files[0]); }}
          />
          <div style={{ display:'flex', gap:'3px' }}>
            <button
              onClick={() => localItem.docFlukeUrl ? setShowFluke(true) : flukeInputRef.current?.click()}
              style={{ flex:1, display:'flex', alignItems:'center', gap:'3px', padding:'4px 7px',
                background: localItem.docFluke ? '#F0FDF4' : '#FFF7ED',
                color: localItem.docFluke ? '#16a34a' : '#ea580c',
                border:`1px solid ${localItem.docFluke ? '#BBF7D0' : '#FED7AA'}`,
                borderRadius:'5px', cursor:'pointer', fontSize:'0.68rem', fontWeight:600, whiteSpace:'nowrap' }}
              title={localItem.docFluke || 'Subir prueba Fluke PDF'}
            >
              {localItem.docFluke ? <Eye size={10}/> : <UploadCloud size={10}/>}
              {localItem.docFluke ? 'Prueba Fluke ✓' : 'Prueba Fluke'}
            </button>
            {localItem.docFluke && (
              <button onClick={() => flukeInputRef.current?.click()}
                style={{ padding:'4px 5px', background:'#F0FDF4', color:'#16a34a', border:'1px solid #BBF7D0', borderRadius:'5px', cursor:'pointer' }}
                title="Reemplazar archivo"
              ><UploadCloud size={10}/></button>
            )}
          </div>
          {/* Cert. Panduit */}
          <input ref={panduitInputRef} type="file" accept=".pdf" style={{ display:'none' }}
            onChange={e => { if(e.target.files?.[0]) handleFileUpload('panduit', e.target.files[0]); }}
          />
          <div style={{ display:'flex', gap:'3px' }}>
            <button
              onClick={() => localItem.docPanduitUrl ? setShowPanduit(true) : panduitInputRef.current?.click()}
              style={{ flex:1, display:'flex', alignItems:'center', gap:'3px', padding:'4px 7px',
                background: localItem.docPanduit ? '#EFF6FF' : '#F8FAFF',
                color: localItem.docPanduit ? '#2563EB' : '#64748B',
                border:`1px solid ${localItem.docPanduit ? '#BFDBFE' : '#E2E8F0'}`,
                borderRadius:'5px', cursor:'pointer', fontSize:'0.68rem', fontWeight:600, whiteSpace:'nowrap' }}
              title={localItem.docPanduit || 'Subir certificado Panduit PDF'}
            >
              {localItem.docPanduit ? <Eye size={10}/> : <UploadCloud size={10}/>}
              {localItem.docPanduit ? 'Certificado Panduit ✓' : 'Certificado Panduit'}
            </button>
            {localItem.docPanduit && (
              <button onClick={() => panduitInputRef.current?.click()}
                style={{ padding:'4px 5px', background:'#EFF6FF', color:'#2563EB', border:'1px solid #BFDBFE', borderRadius:'5px', cursor:'pointer' }}
                title="Reemplazar archivo"
              ><UploadCloud size={10}/></button>
            )}
          </div>
        </div>
      </div>
      {/* Visor PDF Fluke */}
      {showFluke && localItem.docFlukeUrl && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setShowFluke(false)}>
          <div style={{ background:'#fff', borderRadius:'14px', width:'90vw', maxWidth:'900px', height:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.3)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.875rem 1.25rem', borderBottom:'1px solid #E2E8F0', background:'#F8FAFF' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                <CheckCircle size={16} color="#16a34a"/>
                <span style={{ fontWeight:700, color:'#1E293B', fontSize:'0.9rem' }}>Prueba Fluke — {localItem.codigo}</span>
                <span style={{ fontSize:'0.75rem', color:'#64748B', background:'#F1F5F9', padding:'2px 8px', borderRadius:'4px' }}>{localItem.docFluke}</span>
              </div>
              <div style={{ display:'flex', gap:'0.5rem' }}>
                <a href={localItem.docFlukeUrl} download={localItem.docFluke}
                  style={{ display:'flex', alignItems:'center', gap:'4px', padding:'6px 12px', background:'#2563EB', color:'#fff', borderRadius:'7px', textDecoration:'none', fontSize:'0.8rem', fontWeight:600 }}
                ><Download size={13}/> Descargar</a>
                <button onClick={() => setShowFluke(false)} style={{ background:'#F1F5F9', border:'none', borderRadius:'7px', padding:'6px 10px', cursor:'pointer', color:'#475569' }}><X size={16}/></button>
              </div>
            </div>
            <iframe src={localItem.docFlukeUrl} style={{ flex:1, border:'none', width:'100%' }} title="Prueba Fluke PDF"/>
          </div>
        </div>
      )}
      {/* Visor PDF Panduit */}
      {showPanduit && localItem.docPanduitUrl && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setShowPanduit(false)}>
          <div style={{ background:'#fff', borderRadius:'14px', width:'90vw', maxWidth:'900px', height:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.3)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.875rem 1.25rem', borderBottom:'1px solid #E2E8F0', background:'#F8FAFF' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                <FileText size={16} color="#2563EB"/>
                <span style={{ fontWeight:700, color:'#1E293B', fontSize:'0.9rem' }}>Certificado Panduit — {localItem.codigo}</span>
                <span style={{ fontSize:'0.75rem', color:'#64748B', background:'#F1F5F9', padding:'2px 8px', borderRadius:'4px' }}>{localItem.docPanduit}</span>
              </div>
              <div style={{ display:'flex', gap:'0.5rem' }}>
                <a href={localItem.docPanduitUrl} download={localItem.docPanduit}
                  style={{ display:'flex', alignItems:'center', gap:'4px', padding:'6px 12px', background:'#2563EB', color:'#fff', borderRadius:'7px', textDecoration:'none', fontSize:'0.8rem', fontWeight:600 }}
                ><Download size={13}/> Descargar</a>
                <button onClick={() => setShowPanduit(false)} style={{ background:'#F1F5F9', border:'none', borderRadius:'7px', padding:'6px 10px', cursor:'pointer', color:'#475569' }}><X size={16}/></button>
              </div>
            </div>
            <iframe src={localItem.docPanduitUrl} style={{ flex:1, border:'none', width:'100%' }} title="Certificado Panduit PDF"/>
          </div>
        </div>
      )}
      {expanded && (
        <div style={{ background:'#EEF2FF', borderBottom:'2px solid #C7D2FE', borderLeft:'4px solid #6366F1', padding:'1rem 1.5rem' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'0.75rem 1.5rem', marginBottom:'1rem' }}>
            {[
              ['Código', item.codigo], ['Marca', item.marca], ['MICE', item.mice], ['# Parte', item.numParte],
              ['Color', item.color], ['Categoría', `Cat${item.categoria}`], ['Gama', item.gama], ['Clasificación', item.clasificacion],
              ['IDF', item.idf], ['Servicio', item.servicio], ['Área', item.area], ['Patch Panel', item.patchpanel],
              ['Patchcord Interno', item.patchcordInterno], ['Switch Destino', item.switchDestino], ['Longitud', item.longitud], ['Año Instalación', item.anioInstalacion.toString()],
              ['Integrador', item.integrador], ['PO', item.po], ['Costo', `$${item.costo} USD`], ['Centro de Costos', item.centroCostos],
              ['Etiqueta RFID', item.etiquetaRFID || '—'], ['Ver en Plano', item.verEnPlano || '—'], ['Certificado Fluke', item.certificadoFluke ? 'Sí' : 'No'], ['Estado', item.estado],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize:'0.68rem', color:'#64748B', marginBottom:'2px' }}>{label}</div>
                <div style={{ fontSize:'0.8rem', color:'#1E293B' }}>{value}</div>
              </div>
            ))}
          </div>
          {item.observaciones && (
            <div style={{ marginBottom:'1rem' }}>
              <div style={{ fontSize:'0.68rem', color:'#64748B', marginBottom:'2px' }}>Observaciones</div>
              <div style={{ fontSize:'0.8rem', color:'#1E293B' }}>{item.observaciones}</div>
            </div>
          )}
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <button onClick={e => { e.stopPropagation(); onEdit(item); }} style={{ display:'flex', alignItems:'center', gap:'4px', padding:'6px 14px', background:'#EFF6FF', color:'#2563EB', border:'1px solid #BFDBFE', borderRadius:'6px', cursor:'pointer', fontSize:'0.8rem' }}>
              <Edit2 size={13}/> Editar
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(item.id); }} style={{ display:'flex', alignItems:'center', gap:'4px', padding:'6px 14px', background:'#FEF2F2', color:'#ef4444', border:'1px solid #FECACA', borderRadius:'6px', cursor:'pointer', fontSize:'0.8rem' }}>
              <Trash2 size={13}/> Eliminar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── NodeModal ────────────────────────────────────────────────────────────────
function NodeModal({ item, onClose, onSave }: { item: NodeItem | null; onClose: () => void; onSave: (i: NodeItem) => void }) {
  const blank: NodeItem = { id:'', codigo:'', marca:'Panduit', mice:'Bajo', numParte:'', color:'Azul', categoria:'6', gama:'PanNET', clasificacion:'CMR', idf:'', servicio:'Datos', area:'', patchpanel:'', patchcordInterno:'3 Pies', switchDestino:'', longitud:'', normativa:false, certificadoFluke:false, verEnPlano:'', integrador:'', po:'', costo:0, docFluke:'', docFlukeUrl:'', docPanduit:'', docPanduitUrl:'', centroCostos:'', etiquetaRFID:'', anioInstalacion:2025, estado:'Activo', observaciones:'', foto:'' };
  const [form, setForm] = useState<NodeItem>(item ?? blank);
  const set = (k: keyof NodeItem, v: any) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = () => {
    if (!form.codigo || !form.idf || !form.area) return;
    onSave({ ...form, id: form.id || `n${Date.now()}` });
  };
  const inputStyle = { width:'100%', padding:'6px 10px', background:'#F8FAFF', border:'1px solid #E2E8F0', borderRadius:'6px', color:'#1E293B', fontSize:'0.82rem' };
  const selectStyle = { ...inputStyle };
  const labelStyle = { fontSize:'0.72rem', color:'#64748B', marginBottom:'3px', display:'block' };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:'12px', width:'min(780px,95vw)', maxHeight:'90vh', overflowY:'auto', padding:'1.5rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
          <h3 style={{ color:'#1E293B', fontWeight:700, fontSize:'1rem' }}>{item ? 'Editar Nodo' : 'Nuevo Nodo'}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#64748B', cursor:'pointer' }}><X size={18}/></button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.75rem' }}>
          {[['Código *','codigo','text'],['Marca','marca','text'],['# Parte','numParte','text']].map(([l,k,t])=>(
            <div key={k}><label style={labelStyle}>{l}</label><input type={t} value={(form as any)[k]} onChange={e=>set(k as keyof NodeItem, e.target.value)} style={inputStyle}/></div>
          ))}
          <div><label style={labelStyle}>MICE</label>
            <select value={form.mice} onChange={e=>set('mice',e.target.value)} style={selectStyle}>
              {(['Bajo','Medio','Alto'] as NodeMICE[]).map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Color</label>
            <select value={form.color} onChange={e=>set('color',e.target.value)} style={selectStyle}>
              {['Azul','Rojo','Verde','Amarillo','Naranja','Gris','Blanco','Negro','Morado','Café'].map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Categoría</label>
            <select value={form.categoria} onChange={e=>set('categoria',e.target.value)} style={selectStyle}>
              {(['5','5e','6','6A'] as NodeCategoria[]).map(v=><option key={v}>Cat{v}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Gama</label>
            <select value={form.gama} onChange={e=>set('gama',e.target.value)} style={selectStyle}>
              {(['PanNET','NetKey','Mini-Com','KeyConnect','Otro'] as NodeGama[]).map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Clasificación</label>
            <select value={form.clasificacion} onChange={e=>set('clasificacion',e.target.value)} style={selectStyle}>
              {(['CMR','Plenum','LSZH','Riser'] as NodeClasificacion[]).map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>IDF *</label><input value={form.idf} onChange={e=>set('idf',e.target.value)} style={inputStyle} placeholder="IDF1-P1-E2"/></div>
          <div><label style={labelStyle}>Servicio</label>
            <select value={form.servicio} onChange={e=>set('servicio',e.target.value)} style={selectStyle}>
              {(['Voz','Datos','Video','Control Acceso','CCTV','WiFi','IoT'] as NodeServicio[]).map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Área *</label><input value={form.area} onChange={e=>set('area',e.target.value)} style={inputStyle} placeholder="Produccion"/></div>
          <div><label style={labelStyle}>Patch Panel</label><input value={form.patchpanel} onChange={e=>set('patchpanel',e.target.value)} style={inputStyle} placeholder="IDF1-RA-PP3-P12"/></div>
          <div><label style={labelStyle}>Patchcord Interno</label>
            <select value={form.patchcordInterno} onChange={e=>set('patchcordInterno',e.target.value)} style={selectStyle}>
              {['3 Pies','5 Pies','7 Pies','10 Pies','14 Pies','20 Pies'].map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Switch Destino</label><input value={form.switchDestino} onChange={e=>set('switchDestino',e.target.value)} style={inputStyle} placeholder="IDF1-RB-SW2-P12"/></div>
          <div><label style={labelStyle}>Longitud</label><input value={form.longitud} onChange={e=>set('longitud',e.target.value)} style={inputStyle} placeholder="45mts"/></div>
          <div><label style={labelStyle}>Ver en Plano</label><input value={form.verEnPlano} onChange={e=>set('verEnPlano',e.target.value)} style={inputStyle}/></div>
          <div><label style={labelStyle}>Integrador</label><input value={form.integrador} onChange={e=>set('integrador',e.target.value)} style={inputStyle}/></div>
          <div><label style={labelStyle}>PO</label><input value={form.po} onChange={e=>set('po',e.target.value)} style={inputStyle}/></div>
          <div><label style={labelStyle}>Costo en USD</label><input type="number" value={form.costo} onChange={e=>set('costo',parseFloat(e.target.value)||0)} style={inputStyle}/></div>
          <div><label style={labelStyle}>Centro de Costos</label><input value={form.centroCostos} onChange={e=>set('centroCostos',e.target.value)} style={inputStyle}/></div>
          <div><label style={labelStyle}>Etiqueta RFID</label><input value={form.etiquetaRFID} onChange={e=>set('etiquetaRFID',e.target.value)} style={inputStyle}/></div>
          <div><label style={labelStyle}>Año de Instalación</label><input type="number" value={form.anioInstalacion} onChange={e=>set('anioInstalacion',parseInt(e.target.value)||2025)} style={inputStyle}/></div>
          <div><label style={labelStyle}>Estado</label>
            <select value={form.estado} onChange={e=>set('estado',e.target.value)} style={selectStyle}>
              {(['Activo','Inactivo','Baja'] as NodeEstado[]).map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', gap:'1.5rem', alignItems:'center', paddingTop:'1.5rem' }}>
            <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', color:'#1E293B', fontSize:'0.82rem' }}>
              <input type="checkbox" checked={form.normativa} onChange={e=>set('normativa',e.target.checked)}/> Certificado
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', color:'#1E293B', fontSize:'0.82rem' }}>
              <input type="checkbox" checked={form.certificadoFluke} onChange={e=>set('certificadoFluke',e.target.checked)}/> Cert. Fluke
            </label>
          </div>
        </div>
        <div style={{ marginTop:'0.75rem' }}>
          <label style={labelStyle}>Observaciones</label>
          <textarea value={form.observaciones} onChange={e=>set('observaciones',e.target.value)} rows={2} style={{ ...inputStyle, resize:'vertical' }}/>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem', marginTop:'1.25rem' }}>
          <button onClick={onClose} style={{ padding:'8px 20px', background:'#F1F5F9', color:'#64748B', border:'1px solid #E2E8F0', borderRadius:'8px', cursor:'pointer', fontSize:'0.85rem' }}>Cancelar</button>
          <button onClick={handleSave} style={{ padding:'8px 20px', background:'#4b8ef5', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.85rem', fontWeight:600 }}>
            {item ? 'Guardar cambios' : 'Crear nodo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Normativa ────────────────────────────────────────────────────────────
interface CertEval { id:string; date:string; evaluator:string; standard:string; score:number; answers:Record<number,CertAnswer>; notes:Record<number,string>; }
function NodeNormativa({ items }: { items: NodeItem[] }) {
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id ?? '');
  const [evals, setEvals] = useState<CertEval[]>([
    { id:'e1', date:'2025-01-15', evaluator:'Ing. García', standard:'TIA-568.2-D / TIA-606-C', score:88,
      answers: Object.fromEntries(CERT_QS.map(q=>[q.id, q.id<=20?'cumple':q.id===21?'no_cumple':'na'])) as Record<number,CertAnswer>,
      notes:{} },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [editEval, setEditEval] = useState<CertEval|null>(null);
  const [newEval, setNewEval] = useState<CertEval>({ id:'', date:new Date().toISOString().slice(0,10), evaluator:'', standard:'TIA-568.2-D', score:0, answers:{}, notes:{} });

  const calcScore = (answers: Record<number,CertAnswer>) => {
    const applicable = CERT_QS.filter(q => answers[q.id] !== 'na');
    const cumple = applicable.filter(q => answers[q.id] === 'cumple').length;
    return applicable.length > 0 ? Math.round((cumple / applicable.length) * 100) : 0;
  };
  const scoreColor = (s:number) => s>=90?'#22c55e':s>=70?'#f59e0b':'#ef4444';
  const setAnswer = (qId:number, val:CertAnswer) => {
    const updated = { ...newEval, answers: { ...newEval.answers, [qId]: val } };
    setNewEval({ ...updated, score: calcScore(updated.answers) });
  };
  const setNote = (qId:number, val:string) => setNewEval(e => ({ ...e, notes: { ...e.notes, [qId]: val } }));
  const handleSaveEval = () => {
    if (!newEval.evaluator) return;
    const ev = { ...newEval, id: `e${Date.now()}` };
    setEvals(prev => [ev, ...prev]);
    setShowForm(false);
    setNewEval({ id:'', date:new Date().toISOString().slice(0,10), evaluator:'', standard:'TIA-568.2-D', score:0, answers:{}, notes:{} });
  };
  const handleEditSave = () => {
    if (!editEval) return;
    setEvals(prev => prev.map(e => e.id === editEval.id ? { ...editEval, score: calcScore(editEval.answers) } : e));
    setEditEval(null);
  };

  const cats = Array.from(new Set(CERT_QS.map(q=>q.cat)));
  const inputStyle = { width:'100%', padding:'6px 10px', background:'#F8FAFF', border:'1px solid #E2E8F0', borderRadius:'6px', color:'#1E293B', fontSize:'0.82rem' };
  const activeEval = editEval ?? newEval;
  const setActiveAnswer = editEval ? (qId:number, val:CertAnswer) => setEditEval(e => e ? { ...e, answers:{ ...e.answers, [qId]:val }, score: calcScore({ ...e.answers, [qId]:val }) } : e) : setAnswer;
  const setActiveNote = editEval ? (qId:number, val:string) => setEditEval(e => e ? { ...e, notes:{ ...e.notes, [qId]:val } } : e) : setNote;

  return (
    <div style={{ padding:'1.5rem' }}>
      <div style={{ marginBottom:'1.5rem' }}>
        <label style={{ fontSize:'0.8rem', color:'#64748B', marginBottom:'6px', display:'block' }}>NODO A EVALUAR</label>
        <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} style={{ padding:'8px 12px', background:'#F8FAFF', border:'1px solid #E2E8F0', borderRadius:'8px', color:'#1E293B', fontSize:'0.85rem', minWidth:'320px' }}>
          {items.map(i=><option key={i.id} value={i.id}>{i.codigo} — {i.marca} Cat{i.categoria} ({i.idf})</option>)}
        </select>
      </div>
      {!showForm && !editEval && (
        <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
            <h3 style={{ color:'#1E293B', fontWeight:600, fontSize:'0.95rem' }}>Historial de evaluaciones</h3>
            <button onClick={()=>setShowForm(true)} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', background:'#4b8ef5', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.82rem', fontWeight:600 }}>
              <Plus size={14}/> Nueva evaluación
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            {evals.map(ev => (
              <div key={ev.id} style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:'10px', padding:'1rem 1.25rem', display:'flex', alignItems:'center', gap:'1.5rem' }}>
                <div style={{ width:'52px', height:'52px', borderRadius:'50%', background: scoreColor(ev.score)+'22', border:`2px solid ${scoreColor(ev.score)}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ color: scoreColor(ev.score), fontWeight:700, fontSize:'0.9rem' }}>{ev.score}%</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ color:'#1E293B', fontWeight:600, fontSize:'0.85rem' }}>{ev.standard}</div>
                  <div style={{ color:'#64748B', fontSize:'0.75rem' }}>{ev.evaluator} · {ev.date}</div>
                </div>
                <button onClick={()=>setEditEval(ev)} style={{ display:'flex', alignItems:'center', gap:'4px', padding:'6px 14px', background:'#EFF6FF', color:'#2563EB', border:'1px solid #BFDBFE', borderRadius:'6px', cursor:'pointer', fontSize:'0.78rem' }}>
                  <Edit2 size={12}/> Editar
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {(showForm || editEval) && (
        <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:'12px', padding:'1.5rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
            <div>
              <h3 style={{ color:'#1E293B', fontWeight:700, fontSize:'1rem' }}>{editEval ? 'Editar evaluación' : 'Evaluación de normativa'}</h3>
              <p style={{ color:'#64748B', fontSize:'0.78rem' }}>{items.find(i=>i.id===selectedId)?.codigo} — {items.find(i=>i.id===selectedId)?.marca}</p>
            </div>
            <button onClick={()=>{ setShowForm(false); setEditEval(null); }} style={{ background:'none', border:'none', color:'#64748B', cursor:'pointer' }}><X size={18}/></button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.75rem', marginBottom:'1.5rem' }}>
            <div>
              <label style={{ fontSize:'0.72rem', color:'#64748B', marginBottom:'3px', display:'block' }}>Estándar de referencia</label>
              <select value={activeEval.standard} onChange={e=>editEval?setEditEval(ev=>ev?{...ev,standard:e.target.value}:ev):setNewEval(ev=>({...ev,standard:e.target.value}))} style={inputStyle}>
                {['TIA-568.2-D','TIA-606-C','ANSI/TIA-942-C','ISO/IEC 11801'].map(v=><option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:'0.72rem', color:'#64748B', marginBottom:'3px', display:'block' }}>Evaluador</label>
              <input value={activeEval.evaluator} onChange={e=>editEval?setEditEval(ev=>ev?{...ev,evaluator:e.target.value}:ev):setNewEval(ev=>({...ev,evaluator:e.target.value}))} style={inputStyle} placeholder="Nombre del evaluador"/>
            </div>
            <div>
              <label style={{ fontSize:'0.72rem', color:'#64748B', marginBottom:'3px', display:'block' }}>Fecha</label>
              <input type="date" value={activeEval.date} onChange={e=>editEval?setEditEval(ev=>ev?{...ev,date:e.target.value}:ev):setNewEval(ev=>({...ev,date:e.target.value}))} style={inputStyle}/>
            </div>
          </div>
          {cats.map(cat => (
            <div key={cat} style={{ marginBottom:'1.5rem' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'0.75rem', paddingBottom:'0.5rem', borderBottom:'1px solid #E8EBF4' }}>
                <BookOpen size={14} color="#4b8ef5"/>
                <span style={{ color:'#1E293B', fontWeight:600, fontSize:'0.88rem' }}>{cat}</span>
                <span style={{ color:'#64748B', fontSize:'0.75rem' }}>
                  {CERT_QS.filter(q=>q.cat===cat).length} preguntas
                </span>
              </div>
              {CERT_QS.filter(q=>q.cat===cat).map(q => (
                <div key={q.id} style={{ background:'#EEF2FF', borderRadius:'8px', padding:'0.875rem 1rem', marginBottom:'0.5rem' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:'8px', marginBottom:'0.5rem' }}>
                    <span style={{ fontSize:'0.65rem', fontWeight:700, padding:'2px 6px', borderRadius:'4px', flexShrink:0, marginTop:'1px',
                      color: q.criticality==='Alta'?'#ef4444':q.criticality==='Media'?'#f59e0b':'#22c55e',
                      background: q.criticality==='Alta'?'#ef444422':q.criticality==='Media'?'#f59e0b22':'#22c55e22'
                    }}>{q.criticality}</span>
                    <span style={{ color:'#1E293B', fontSize:'0.83rem', lineHeight:1.4 }}>{q.question}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:'6px', background:'#FFFFFF', borderRadius:'6px', padding:'0.5rem 0.75rem', marginBottom:'0.625rem' }}>
                    <BookOpen size={12} color="#4b8ef5" style={{ flexShrink:0, marginTop:'2px' }}/>
                    <span style={{ color:'#64748B', fontSize:'0.75rem', lineHeight:1.5 }}>{q.hint}</span>
                  </div>
                  <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', flexWrap:'wrap' }}>
                    {(['cumple','no_cumple','na'] as CertAnswer[]).map(v=>(
                      <button key={v} onClick={()=>setActiveAnswer(q.id, v)} style={{
                        padding:'5px 14px', borderRadius:'6px', cursor:'pointer', fontSize:'0.78rem', fontWeight:600, border:'1px solid',
                        background: activeEval.answers[q.id]===v ? (v==='cumple'?'#22c55e':v==='no_cumple'?'#ef4444':'#6b7280') : '#F1F5F9',
                        color: activeEval.answers[q.id]===v ? '#fff' : '#475569',
                        borderColor: activeEval.answers[q.id]===v ? (v==='cumple'?'#22c55e':v==='no_cumple'?'#ef4444':'#6b7280') : '#CBD5E1',
                      }}>{v==='cumple'?'Cumple':v==='no_cumple'?'No cumple':'N/A'}</button>
                    ))}
                    <input value={activeEval.notes[q.id]??''} onChange={e=>setActiveNote(q.id,e.target.value)} placeholder="Observación..." style={{ flex:1, minWidth:'160px', padding:'5px 10px', background:'#F8FAFF', border:'1px solid #E2E8F0', borderRadius:'6px', color:'#1E293B', fontSize:'0.78rem' }}/>
                    <button style={{ display:'flex', alignItems:'center', gap:'4px', padding:'5px 10px', background:'#EFF6FF', color:'#2563EB', border:'1px solid #BFDBFE', borderRadius:'6px', cursor:'pointer', fontSize:'0.75rem' }}>
                      <FileText size={11}/> Evidencia
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid #E8EBF4' }}>
            <div style={{ color:'#1E293B', fontSize:'0.85rem' }}>
              Puntaje actual: <span style={{ fontWeight:700, color: scoreColor(activeEval.score) }}>{activeEval.score}%</span>
            </div>
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button onClick={()=>{ setShowForm(false); setEditEval(null); }} style={{ padding:'8px 20px', background:'#F1F5F9', color:'#64748B', border:'1px solid #E2E8F0', borderRadius:'8px', cursor:'pointer', fontSize:'0.85rem' }}>Cancelar</button>
              <button onClick={editEval?handleEditSave:handleSaveEval} style={{ padding:'8px 20px', background:'#4b8ef5', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.85rem', fontWeight:600 }}>
                {editEval ? 'Guardar cambios' : 'Guardar evaluación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NodosPage() {
  const router = useRouter();
  const highlightCode = typeof router.query.highlight === 'string' ? decodeURIComponent(router.query.highlight) : undefined;
  const [activeTab, setActiveTab] = useState<'resumen'|'inventario'|'normativa'>('inventario');
  const [nodes, setNodes] = useState<NodeItem[]>([]);

  // Cargar nodos del backend al montar
  useEffect(() => {
    import('axios').then(({ default: axios }) => {
      axios.get('/api/infra/nodos')
        .then(res => setNodes(Array.isArray(res.data) ? res.data : []))
        .catch(() => setNodes([]));
    });
  }, []);
  const [search, setSearch] = useState(highlightCode||'');
  const [filterMICE, setFilterMICE] = useState('Todos');
  const [filterServicio, setFilterServicio] = useState('Todos');
  const [filterEstado, setFilterEstado] = useState('Todos');
  const [modalItem, setModalItem] = useState<NodeItem|null|undefined>(undefined);
  const [highlightedId, setHighlightedId] = useState<string|null>(null);
  const nodeRowRefs = useRef<Record<string, HTMLDivElement|null>>({});
  const didHighlightNode = useRef(false);

  // Scroll + highlight cuando viene ?highlight= de búsqueda global
  useEffect(() => {
    if (!highlightCode || didHighlightNode.current) return;
    setSearch(highlightCode);
    const timer = setTimeout(() => {
      const match = nodes.find(n =>
        n.codigo === highlightCode ||
        n.codigo.toLowerCase().includes(highlightCode.toLowerCase())
      );
      if (!match) return;
      setHighlightedId(match.id);
      didHighlightNode.current = true;
      const el = nodeRowRefs.current[match.id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        setHighlightedId(null);
        const { highlight: _h, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
      }, 2500);
    }, 300);
    return () => clearTimeout(timer);
  }, [highlightCode, nodes]);

  const filtered = useMemo(() => nodes.filter(n => {
    const q = search.toLowerCase();
    const matchQ = !q || [
      n.codigo, n.marca, n.idf, n.area, n.servicio, n.patchpanel,
      n.switchDestino, n.longitud, n.categoria, n.mice, n.gama,
      n.clasificacion, n.color, n.numParte, n.integrador, n.po,
      n.centroCostos, n.etiquetaRFID, n.verEnPlano, n.observaciones,
      n.estado, n.anioInstalacion.toString(), n.patchcordInterno
    ].some(v => v?.toString().toLowerCase().includes(q));
    const matchMICE = filterMICE==='Todos' || n.mice===filterMICE;
    const matchServ = filterServicio==='Todos' || n.servicio===filterServicio;
    const matchEst = filterEstado==='Todos' || n.estado===filterEstado;
    return matchQ && matchMICE && matchServ && matchEst;
  }), [nodes, search, filterMICE, filterServicio, filterEstado]);

  const handleSave = (item: NodeItem) => {
    setNodes(prev => prev.some(n=>n.id===item.id) ? prev.map(n=>n.id===item.id?item:n) : [item,...prev]);
    setModalItem(undefined);
  };
  const handleDelete = (id: string) => setNodes(prev => prev.filter(n=>n.id!==id));

  // KPIs
  const total = nodes.length;
  const activos = nodes.filter(n=>n.estado==='Activo').length;
  const certificados = nodes.filter(n=>n.normativa).length;
  const pctCert = total > 0 ? Math.round((certificados/total)*100) : 0;
  const totalCosto = nodes.reduce((s,n)=>s+n.costo,0);

  const tabStyle = (t: string) => ({
    padding:'8px 20px', borderRadius:'8px', cursor:'pointer', fontSize:'0.85rem', fontWeight:600, border:'none',
    background: activeTab===t ? '#4b8ef5' : 'transparent',
    color: activeTab===t ? '#fff' : '#475569',
    transition:'all 0.15s',
  });
  const selectStyle = { padding:'6px 10px', background:'#F8FAFF', border:'1px solid #E2E8F0', borderRadius:'6px', color:'#1E293B', fontSize:'0.82rem' };

  return (
    <AppLayout>
      <Head><title>Nodos — SKIA DCIM</title></Head>
      <div style={{ padding:'1.5rem', minHeight:'100vh', background:'#EEF0F8' }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:'#4b8ef522', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Plug size={20} color="#4b8ef5"/>
            </div>
            <div>
              <h1 style={{ color:'#1E293B', fontWeight:700, fontSize:'1.4rem', margin:0 }}>Nodos</h1>
              <p style={{ color:'#64748B', fontSize:'0.82rem', margin:0 }}>Gestión de nodos de red y puntos de acceso de cableado estructurado.</p>
            </div>
          </div>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <button style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 14px', background:'#FFFFFF', color:'#64748B', border:'1px solid #E2E8F0', borderRadius:'8px', cursor:'pointer', fontSize:'0.82rem' }}>
              <Upload size={14}/> Importar
            </button>
            <button style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 14px', background:'#FFFFFF', color:'#64748B', border:'1px solid #E2E8F0', borderRadius:'8px', cursor:'pointer', fontSize:'0.82rem' }}>
              <Download size={14}/> CSV
            </button>
            <button onClick={()=>setModalItem(null)} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', background:'#4b8ef5', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.85rem', fontWeight:600 }}>
              <Plus size={15}/> Nuevo Nodo
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:'4px', marginBottom:'1.5rem', background:'#FFFFFF', padding:'4px', borderRadius:'10px', width:'fit-content' }}>
          <button style={tabStyle('resumen')} onClick={()=>setActiveTab('resumen')}>Resumen</button>
          <button style={tabStyle('inventario')} onClick={()=>setActiveTab('inventario')}>Inventario</button>
          <button style={tabStyle('normativa')} onClick={()=>setActiveTab('normativa')}>Normativa</button>
        </div>

        {/* ── EMPTY STATE ── */}
        {nodes.length === 0 && (
          <ModuleEmptyState
            icon={<Plug size={36} className="text-slate-600" />}
            title="Sin nodos registrados"
            description="Los nodos son los puntos de red activos de tu infraestructura: APs, cámaras, servidores, impresoras y más. Registra cada uno con su clasificación MICE, ubicación y normativa para tener control total."
            features={[
              { icon: <Plug size={14}/>, text: 'Inventario por tipo: AP, cámara, servidor, impresora' },
              { icon: <Tag size={14}/>, text: 'Clasificación MICE y tipo de servicio' },
              { icon: <FileText size={14}/>, text: 'Evaluación de normativa por nodo' },
              { icon: <Layers size={14}/>, text: 'Control de costo e inversión' },
            ]}
            wizardLabel="Registrar primer Nodo"
            onOpenWizard={() => setModalItem(null)}
            accentColor="slate"
          />
        )}
        {/* ── RESUMEN ── */}
        {nodes.length > 0 && activeTab==='resumen' && (
          <div>
            {/* KPIs */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
              {[
                { label:'Total Nodos', value:total, sub:'registrados', color:'#2563EB', icon:<Plug size={20}/> },
                { label:'Activos', value:activos, sub:`${total-activos} inactivos/baja`, color:'#22c55e', icon:<CheckCircle size={20}/> },
                { label:'Normativa OK', value:`${pctCert}%`, sub:`${certificados} de ${total}`, color:'#f59e0b', icon:<FileText size={20}/> },
                { label:'Inversión Total', value:`$${totalCosto.toLocaleString()}`, sub:'USD acumulado', color:'#8b5cf6', icon:<Layers size={20}/> },
              ].map(k => (
                <div key={k.label} style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:'12px', padding:'1.25rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.75rem' }}>
                    <span style={{ fontSize:'0.8rem', color:'#64748B' }}>{k.label}</span>
                    <div style={{ color:k.color, background:k.color+'22', padding:'6px', borderRadius:'8px' }}>{k.icon}</div>
                  </div>
                  <div style={{ fontSize:'1.8rem', fontWeight:700, color:k.color, marginBottom:'4px' }}>{k.value}</div>
                  <div style={{ fontSize:'0.75rem', color:'#64748B' }}>{k.sub}</div>
                  <div style={{ marginTop:'0.75rem', height:'3px', background:'#F1F5F9', borderRadius:'2px' }}>
                    <div style={{ height:'100%', background:k.color, borderRadius:'2px', width:'60%' }}/>
                  </div>
                </div>
              ))}
            </div>
            {/* Distribución por Categoría de Cable */}
            <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:'12px', padding:'1.25rem', marginBottom:'1rem' }}>
              <h3 style={{ color:'#1E293B', fontWeight:600, fontSize:'0.9rem', marginBottom:'1rem', margin:'0 0 1rem 0' }}>Distribución por Categoría de Cable</h3>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.5rem' }}>
                {(['5e','6','6A','7','7A','8'] as const).map(cat => {
                  const cnt = nodes.filter(n => n.categoria === cat).length;
                  return (
                    <div key={cat} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', border:'1px solid #E2E8F0', borderRadius:'8px', background:'#F8FAFF' }}>
                      <span style={{ fontSize:'0.82rem', fontWeight:600, color:'#475569' }}>CAT{cat.toUpperCase()}</span>
                      <span style={{ fontSize:'1rem', fontWeight:700, color:'#1E293B' }}>{cnt}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Distribución por MICE */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
              <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:'12px', padding:'1.25rem' }}>
                <h3 style={{ color:'#1E293B', fontWeight:600, fontSize:'0.9rem', marginBottom:'1rem' }}>Distribución por MICE</h3>
                {(['Bajo','Medio','Alto'] as NodeMICE[]).map(m => {
                  const cnt = nodes.filter(n=>n.mice===m).length;
                  const pct = total > 0 ? Math.round((cnt/total)*100) : 0;
                  return (
                    <div key={m} style={{ marginBottom:'0.75rem' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                        <span style={{ fontSize:'0.82rem', color:'#1E293B' }}>{m}</span>
                        <span style={{ fontSize:'0.82rem', color:'#64748B' }}>{cnt} nodos · {pct}%</span>
                      </div>
                      <div style={{ height:'6px', background:'#F1F5F9', borderRadius:'3px' }}>
                        <div style={{ height:'100%', background:MICE_COLOR[m], borderRadius:'3px', width:`${pct}%`, transition:'width 0.5s' }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:'12px', padding:'1.25rem' }}>
                <h3 style={{ color:'#1E293B', fontWeight:600, fontSize:'0.9rem', marginBottom:'1rem' }}>Distribución por Servicio</h3>
                {(['Voz','Datos','Video','Control Acceso','CCTV','WiFi','IoT'] as NodeServicio[]).map(s => {
                  const cnt = nodes.filter(n=>n.servicio===s).length;
                  if (cnt===0) return null;
                  const pct = total > 0 ? Math.round((cnt/total)*100) : 0;
                  return (
                    <div key={s} style={{ marginBottom:'0.6rem' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
                        <span style={{ fontSize:'0.8rem', color:'#1E293B' }}>{s}</span>
                        <span style={{ fontSize:'0.8rem', color:'#64748B' }}>{cnt} · {pct}%</span>
                      </div>
                      <div style={{ height:'5px', background:'#F1F5F9', borderRadius:'3px' }}>
                        <div style={{ height:'100%', background:SERVICIO_COLOR[s], borderRadius:'3px', width:`${pct}%` }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── INVENTARIO ── */}
        {nodes.length > 0 && activeTab==='inventario' && (
          <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:'12px', overflow:'hidden' }}>
            {/* Filters */}
            <div style={{ padding:'1rem', borderBottom:'1px solid #E8EBF4', display:'flex', gap:'0.75rem', flexWrap:'wrap', alignItems:'center' }}>
              <div style={{ position:'relative', flex:1, minWidth:'200px' }}>
                <Search size={14} style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'#64748B' }}/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por código, marca, IDF, área, servicio, categoría, integrador..." style={{ width:'100%', padding:'7px 10px 7px 32px', background:'#F8FAFF', border:'1px solid #E2E8F0', borderRadius:'7px', color:'#1E293B', fontSize:'0.82rem' }}/>
              </div>
              <select value={filterMICE} onChange={e=>setFilterMICE(e.target.value)} style={selectStyle}>
                <option>Todos</option>
                {(['Bajo','Medio','Alto'] as NodeMICE[]).map(v=><option key={v}>{v}</option>)}
              </select>
              <select value={filterServicio} onChange={e=>setFilterServicio(e.target.value)} style={selectStyle}>
                <option>Todos</option>
                {(['Voz','Datos','Video','Control Acceso','CCTV','WiFi','IoT'] as NodeServicio[]).map(v=><option key={v}>{v}</option>)}
              </select>
              <select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)} style={selectStyle}>
                <option>Todos</option>
                {(['Activo','Inactivo','Baja'] as NodeEstado[]).map(v=><option key={v}>{v}</option>)}
              </select>
              <span style={{ color:'#64748B', fontSize:'0.8rem' }}>{filtered.length} nodos</span>
            </div>
            {/* Table header */}
            <div style={{ display:'grid', gridTemplateColumns:'1.5rem 2fr 1.4fr 1fr 1fr 1fr 1.2fr 1.4fr', gap:'0.5rem', padding:'0.6rem 1rem', background:'#EEF2FF', borderBottom:'1px solid #C7D2FE' }}>
              {['','Código / Marca','Categoría / Servicio','IDF','Área','Longitud','Certificado / Estado','Acciones'].map(h=>(
                <span key={h} style={{ fontSize:'0.72rem', fontWeight:600, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</span>
              ))}
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'#64748B' }}>No se encontraron nodos con los filtros aplicados.</div>
            ) : (
              filtered.map(n => (
                <div key={n.id} ref={el=>{ nodeRowRefs.current[n.id]=el as HTMLDivElement|null; }} className={highlightedId===n.id?'skia-highlight-row':''}>
                  <NodeRow item={n} onEdit={i=>setModalItem(i)} onDelete={handleDelete}/>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── NORMATIVA ── */}
        {nodes.length > 0 && activeTab==='normativa' && (
          <div style={{ background:'#FFFFFF', border:'1px solid #E2E8F0', borderRadius:'12px', overflow:'hidden' }}>
            <NodeNormativa items={nodes}/>
          </div>
        )}
      </div>
      {modalItem !== undefined && (
        <NodeWizard
          item={modalItem ? (modalItem as unknown as NodeWizardData) : null}
          onClose={() => setModalItem(undefined)}
          onSave={(data: NodeWizardData) => {
            const item: NodeItem = {
              id: data.id,
              codigo: data.codigo,
              marca: data.marca,
              mice: (data.mice as NodeMICE) || 'Bajo',
              numParte: data.numParte,
              color: data.color,
              categoria: (data.categoria as NodeCategoria) || '6',
              gama: (data.gama as NodeGama) || 'Otro',
              clasificacion: (data.clasificacion as NodeClasificacion) || 'CMR',
              idf: data.idf,
              servicio: (data.servicio as NodeServicio) || 'Datos',
              area: data.area,
              patchpanel: data.patchpanel,
              patchcordInterno: data.patchcordInterno,
              switchDestino: data.switchDestino,
              longitud: data.longitud,
              normativa: data.normativa,
              certificadoFluke: data.certificadoFluke,
              verEnPlano: data.verEnPlano,
              integrador: data.integrador,
              po: data.po,
              costo: data.costo,
              docFluke: data.docFluke,
              docFlukeUrl: data.docFlukeUrl,
              docPanduit: data.docPanduit,
              docPanduitUrl: data.docPanduitUrl,
              centroCostos: data.centroCostos,
              etiquetaRFID: data.etiquetaRFID,
              anioInstalacion: data.anioInstalacion,
              estado: (data.estado as NodeEstado) || 'Activo',
              observaciones: data.observaciones,
              foto: data.foto,
            };
            // Persistir en el backend
            axios.post('/api/infra/nodos', {
              internal_code: '',
              name: data.name,
              brand: data.marca,
              part_number: data.numParte ?? '',
              category: data.categoria ?? '6',
              classification: data.clasificacion ?? 'CMR',
              service: data.servicio ?? 'Datos',
              idf_location: data.idf ?? '',
              area: data.area ?? '',
              patch_panel: data.patchpanel ?? '',
              switch_dest: data.switchDestino ?? '',
              length_m: parseFloat(data.longitud ?? '0') || 0,
              status: data.estado === 'Activo' ? 'active' : 'inactive',
              cost_usd: data.costo ?? 0,
              cost_center: data.centroCostos ?? '',
              observations: data.observaciones ?? '',
            }).then(resp => {
              handleSave({ ...item, id: resp.data.id ?? item.id, codigo: resp.data.internal_code ?? item.codigo });
            }).catch(() => undefined);
          }}
        />
      )}
    </AppLayout>
  );
}
