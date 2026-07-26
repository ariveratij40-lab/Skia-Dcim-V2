import React, { useState, useMemo, useRef } from 'react';
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, FileText,
  Network, Zap, Wind, Shield, ChevronDown, ChevronRight,
  Camera, BookOpen, Info, Award, History, Plus,
  BarChart2, Search, Building2, MapPin, User,
  Download, Printer, RefreshCw, X, Eye, CheckSquare, Edit2,
} from 'lucide-react';
import type { MdfIdfRecord } from '../pages/infraestructura/mdf-idf';

// ============================================================
// TIPOS ENRIQUECIDOS
// ============================================================
export type CertAnswer = 'cumple' | 'no_cumple' | 'na';
export type CertCriticality = 'baja' | 'media' | 'alta' | 'critica';
export type CertNorm =
  | 'ANSI/TIA-942-C'
  | 'ICREA'
  | 'ANSI/TIA-606'
  | 'ANSI/TIA-568'
  | 'ANSI/TIA-569'
  | 'ISO/IEC 11801';

export interface NormQuestion {
  id: string;
  category: string;
  question: string;
  norm_ref: string;
  norm_name: CertNorm;
  norm_clause: string;
  technical_explanation: string;
  physical_validation: string;
  recommended_evidence: string;
  criticality: CertCriticality;
  operational_risk: string;
}

export interface EvalAnswer {
  question_id: string;
  answer: CertAnswer;
  observation: string;
  evidence_url: string;
  answered_at: string;
}

export interface CertEvalRecord {
  id: string;
  site_id: string;
  site_name: string;
  standard: CertNorm | 'Evaluación interna SKIA';
  evaluator: string;
  eval_date: string;
  answers: EvalAnswer[];
  overall_pct: number | null;
  badge: 'Certificable' | 'Encaminado' | 'Crítico';
  notes: string;
  created_at: string;
}

// ============================================================
// BANCO DE PREGUNTAS NORMATIVAS ENRIQUECIDAS
// 6 categorías × 5 preguntas = 30 preguntas
// ============================================================
export const NORM_QUESTIONS: NormQuestion[] = [
  // ─── TELECOMUNICACIONES ───────────────────────────────────
  {
    id: 'tel-1', category: 'Telecomunicaciones',
    question: '¿El cableado horizontal cumple con la categoría mínima Cat 6A o superior?',
    norm_ref: 'TIA-568.2-D §6.3', norm_name: 'ANSI/TIA-568', norm_clause: '6.3',
    technical_explanation: 'El estándar TIA-568.2-D establece Cat 6A como el mínimo recomendado para nuevas instalaciones, soportando 10GBase-T hasta 100 m.',
    physical_validation: 'Verificar etiqueta del cable (Cat 6A, Cat 7, Cat 8), certificados de prueba Fluke o equivalente, y documentación del fabricante.',
    recommended_evidence: 'Certificado de prueba de canal (Fluke DSX-8000 o similar), etiquetas visibles en ambos extremos, ficha técnica del cable.',
    criticality: 'alta',
    operational_risk: 'Limitación de velocidad a 1 Gbps máximo, incompatibilidad con PoE++ y sistemas 10G futuros.',
  },
  {
    id: 'tel-2', category: 'Telecomunicaciones',
    question: '¿Todos los cables están etiquetados en ambos extremos según TIA-606?',
    norm_ref: 'TIA-606-C §5.2', norm_name: 'ANSI/TIA-606', norm_clause: '5.2',
    technical_explanation: 'TIA-606-C define el sistema de administración de infraestructura de telecomunicaciones, incluyendo identificadores únicos en cada extremo del enlace.',
    physical_validation: 'Revisar etiquetas en patch panel y en el jack del área de trabajo. Verificar que el identificador coincide con el plano de cableado.',
    recommended_evidence: 'Fotografía de patch panel con etiquetas visibles, plano de cableado actualizado, reporte de administración del sistema.',
    criticality: 'media',
    operational_risk: 'Dificultad para diagnóstico de fallas, tiempo de resolución de incidentes aumenta hasta 300%.',
  },
  {
    id: 'tel-3', category: 'Telecomunicaciones',
    question: '¿Los patch panels están documentados con plano de conexiones actualizado?',
    norm_ref: 'TIA-606-C §6.1', norm_name: 'ANSI/TIA-606', norm_clause: '6.1',
    technical_explanation: 'La documentación de patch panels debe incluir el mapeo completo de puertos, identificación de circuitos activos y registros de cambios.',
    physical_validation: 'Comparar el plano físico con las conexiones actuales del patch panel. Verificar fecha de última actualización del documento.',
    recommended_evidence: 'Plano de patch panel actualizado (fecha ≤ 90 días), registro de cambios, captura del sistema de gestión de cableado.',
    criticality: 'media',
    operational_risk: 'Errores en movimientos, adiciones y cambios (MAC). Riesgo de desconexiones accidentales de servicios críticos.',
  },
  {
    id: 'tel-4', category: 'Telecomunicaciones',
    question: '¿Se han realizado pruebas de normativa de canal con resultados PASS?',
    norm_ref: 'TIA-568.2-D §6.7', norm_name: 'ANSI/TIA-568', norm_clause: '6.7',
    technical_explanation: 'Las pruebas de normativa de canal verifican que el enlace completo (cable + conectores + patch cords) cumple los parámetros eléctricos de la categoría instalada.',
    physical_validation: 'Solicitar reportes de normativa del equipo de prueba (Fluke, IDEAL, Softing). Verificar que todos los puertos tienen resultado PASS.',
    recommended_evidence: 'Reporte completo de normativa con fecha, equipo calibrado, parámetros medidos (IL, NEXT, PS-NEXT, RL, PS-ACRF) y resultado PASS.',
    criticality: 'critica',
    operational_risk: 'Sin normativa no existe garantía de rendimiento. Fallas intermitentes, pérdida de paquetes y degradación de servicios.',
  },
  {
    id: 'tel-5', category: 'Telecomunicaciones',
    question: '¿El cuarto de telecomunicaciones cumple con las dimensiones mínimas de TIA-569?',
    norm_ref: 'TIA-569-D §4.3', norm_name: 'ANSI/TIA-569', norm_clause: '4.3',
    technical_explanation: 'TIA-569-D establece dimensiones mínimas para cuartos de telecomunicaciones según el área de servicio: mínimo 3.0 m × 2.4 m para áreas hasta 1000 m².',
    physical_validation: 'Medir las dimensiones del cuarto. Verificar que el espacio libre frente a racks es ≥ 1.0 m. Comprobar altura libre ≥ 2.4 m.',
    recommended_evidence: 'Plano arquitectónico con dimensiones, fotografía del cuarto con escala de referencia, reporte de inspección física.',
    criticality: 'alta',
    operational_risk: 'Espacio insuficiente para mantenimiento, riesgo de accidentes, imposibilidad de expansión futura.',
  },

  // ─── ENERGÍA ──────────────────────────────────────────────
  {
    id: 'ene-1', category: 'Energía',
    question: '¿Existe UPS con autonomía mínima de 15 minutos para equipos críticos?',
    norm_ref: 'TIA-942-C §5.3.2', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.3.2',
    technical_explanation: 'TIA-942-C Tier I requiere UPS con autonomía mínima de 15 minutos. Tier II+ requiere redundancia N+1 y mayor autonomía.',
    physical_validation: 'Verificar capacidad del banco de baterías, fecha de instalación (vida útil 3-5 años), prueba de descarga documentada.',
    recommended_evidence: 'Ficha técnica del UPS, reporte de prueba de descarga (≤ 6 meses), registro de mantenimiento de baterías.',
    criticality: 'critica',
    operational_risk: 'Pérdida de datos, corrupción de sistemas, tiempo de inactividad no planificado ante cortes de energía.',
  },
  {
    id: 'ene-2', category: 'Energía',
    question: '¿El circuito eléctrico dedicado está protegido con breaker diferencial (GFCI)?',
    norm_ref: 'TIA-942-C §5.3.1', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.3.1',
    technical_explanation: 'Los circuitos dedicados para equipos de TI deben tener protección diferencial para detectar corrientes de fuga y prevenir riesgos eléctricos.',
    physical_validation: 'Inspeccionar el tablero eléctrico. Verificar que los circuitos del cuarto tienen breakers diferenciales etiquetados. Probar el botón de prueba del diferencial.',
    recommended_evidence: 'Fotografía del tablero con breakers etiquetados, certificado de instalación eléctrica, reporte de inspección de instalaciones.',
    criticality: 'alta',
    operational_risk: 'Riesgo de incendio eléctrico, electrocución de personal, daño a equipos por sobretensión.',
  },
  {
    id: 'ene-3', category: 'Energía',
    question: '¿Se cuenta con PDU con monitoreo de consumo por toma o por circuito?',
    norm_ref: 'TIA-942-C §5.3.4', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.3.4',
    technical_explanation: 'Las PDU inteligentes permiten monitorear consumo en tiempo real, detectar sobrecargas y gestionar remotamente la energía por equipo.',
    physical_validation: 'Verificar modelo de PDU instalada. Confirmar acceso a interfaz de monitoreo. Revisar alertas configuradas para sobrecarga.',
    recommended_evidence: 'Fotografía de PDU con modelo visible, captura de pantalla del sistema de monitoreo, configuración de alertas.',
    criticality: 'media',
    operational_risk: 'Imposibilidad de detectar sobrecargas hasta que ocurre una falla. Sin visibilidad de consumo por equipo.',
  },
  {
    id: 'ene-4', category: 'Energía',
    question: '¿El sistema eléctrico cuenta con tierra física certificada (<5 Ω)?',
    norm_ref: 'TIA-942-C §5.3.5', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.3.5',
    technical_explanation: 'La resistencia de tierra debe ser inferior a 5 Ω según TIA-942-C. Una tierra deficiente causa interferencias, daños a equipos y riesgos de seguridad.',
    physical_validation: 'Solicitar certificado de medición de tierra con telurómetro. Verificar que la medición es ≤ 5 Ω y tiene fecha ≤ 12 meses.',
    recommended_evidence: 'Certificado de medición de resistencia de tierra con telurómetro calibrado, fecha de medición y valor obtenido.',
    criticality: 'alta',
    operational_risk: 'Interferencias electromagnéticas, daño a equipos por descargas, riesgo de electrocución.',
  },
  {
    id: 'ene-5', category: 'Energía',
    question: '¿Existe plan de mantenimiento preventivo para UPS con registros actualizados?',
    norm_ref: 'TIA-942-C §5.3.3', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.3.3',
    technical_explanation: 'El mantenimiento preventivo del UPS debe incluir prueba de baterías, limpieza de filtros, verificación de conexiones y prueba de transferencia.',
    physical_validation: 'Solicitar bitácora de mantenimiento. Verificar que el último mantenimiento fue ≤ 6 meses. Revisar estado visual de baterías.',
    recommended_evidence: 'Bitácora de mantenimiento firmada, reporte técnico del último servicio, contrato de mantenimiento vigente.',
    criticality: 'alta',
    operational_risk: 'Falla del UPS sin previo aviso, pérdida de autonomía, interrupción de servicios críticos.',
  },

  // ─── AMBIENTE ─────────────────────────────────────────────
  {
    id: 'amb-1', category: 'Ambiente',
    question: '¿La temperatura se mantiene entre 18°C y 27°C (ASHRAE A1)?',
    norm_ref: 'TIA-942-C §5.4.1', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.4.1',
    technical_explanation: 'ASHRAE clase A1 define el rango operativo de 15°C a 32°C, con rango recomendado de 18°C a 27°C para maximizar vida útil de equipos.',
    physical_validation: 'Revisar registros del sistema de monitoreo ambiental. Verificar que no hay puntos calientes (hot spots) con termómetro infrarrojo.',
    recommended_evidence: 'Reporte histórico de temperatura (últimos 30 días), mapa de calor del cuarto, certificado de calibración del sensor.',
    criticality: 'alta',
    operational_risk: 'Temperatura alta: falla prematura de equipos, throttling de CPU. Temperatura baja: condensación, daño por frío.',
  },
  {
    id: 'amb-2', category: 'Ambiente',
    question: '¿La humedad relativa se mantiene entre 40% y 60% (ASHRAE A1)?',
    norm_ref: 'TIA-942-C §5.4.2', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.4.2',
    technical_explanation: 'Humedad fuera de rango causa corrosión (alta humedad) o descarga electrostática (baja humedad), ambas dañinas para equipos electrónicos.',
    physical_validation: 'Revisar lecturas del higrómetro o sistema de monitoreo. Verificar ausencia de condensación en superficies.',
    recommended_evidence: 'Reporte histórico de humedad relativa (últimos 30 días), certificado de calibración del sensor, fotografía del higrómetro.',
    criticality: 'media',
    operational_risk: 'Corrosión de contactos, fallas por ESD, reducción de vida útil de equipos electrónicos.',
  },
  {
    id: 'amb-3', category: 'Ambiente',
    question: '¿El sistema de climatización tiene redundancia N+1 o superior?',
    norm_ref: 'TIA-942-C §5.4.3', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.4.3',
    technical_explanation: 'Redundancia N+1 significa que si falla una unidad de climatización, las demás pueden mantener las condiciones ambientales requeridas.',
    physical_validation: 'Contar unidades de climatización instaladas vs. requeridas. Verificar que el sistema puede operar con una unidad fuera de servicio.',
    recommended_evidence: 'Diagrama de sistema de climatización, ficha técnica de unidades, prueba de failover documentada.',
    criticality: 'alta',
    operational_risk: 'Falla única de climatización causa sobrecalentamiento y apagado de equipos por temperatura.',
  },
  {
    id: 'amb-4', category: 'Ambiente',
    question: '¿Existe monitoreo ambiental con alertas automáticas configuradas?',
    norm_ref: 'TIA-942-C §5.4.4', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.4.4',
    technical_explanation: 'El monitoreo ambiental continuo permite detectar condiciones fuera de rango antes de que causen daños. Las alertas deben notificar al personal responsable.',
    physical_validation: 'Verificar sensores instalados (temperatura, humedad, agua). Probar que las alertas llegan al personal designado.',
    recommended_evidence: 'Captura del sistema de monitoreo con umbrales configurados, registro de alertas enviadas, lista de contactos de notificación.',
    criticality: 'media',
    operational_risk: 'Sin monitoreo, las condiciones fuera de rango pueden pasar desapercibidas hasta causar fallas de equipos.',
  },
  {
    id: 'amb-5', category: 'Ambiente',
    question: '¿El cuarto está libre de humedad, goteras, condensación o inundaciones?',
    norm_ref: 'TIA-569-D §4.5', norm_name: 'ANSI/TIA-569', norm_clause: '4.5',
    technical_explanation: 'TIA-569-D prohíbe la presencia de tuberías de agua, vapor o gas sobre los cuartos de telecomunicaciones. El cuarto debe estar en zona libre de inundación.',
    physical_validation: 'Inspección visual de techo, paredes y piso. Verificar ausencia de manchas de humedad, eflorescencias o tubería de agua expuesta.',
    recommended_evidence: 'Fotografías del cuarto (techo, paredes, piso), reporte de inspección física, plano de instalaciones hidráulicas.',
    criticality: 'critica',
    operational_risk: 'Cortocircuito, falla catastrófica de equipos, pérdida total de servicios.',
  },

  // ─── SEGURIDAD FÍSICA ─────────────────────────────────────
  {
    id: 'seg-1', category: 'Seguridad física',
    question: '¿El acceso está controlado por tarjeta, biométrico o llave de seguridad?',
    norm_ref: 'TIA-942-C §5.5.1', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.5.1',
    technical_explanation: 'TIA-942-C requiere control de acceso físico a todos los cuartos de telecomunicaciones. Tier II+ requiere autenticación de dos factores.',
    physical_validation: 'Verificar el mecanismo de control de acceso instalado. Probar que solo personal autorizado puede ingresar. Revisar lista de accesos vigente.',
    recommended_evidence: 'Fotografía del control de acceso, lista de personas autorizadas, reporte de accesos del último mes.',
    criticality: 'alta',
    operational_risk: 'Acceso no autorizado, sabotaje, robo de equipos, modificaciones no controladas.',
  },
  {
    id: 'seg-2', category: 'Seguridad física',
    question: '¿Existe registro de acceso electrónico o bitácora física actualizada?',
    norm_ref: 'TIA-942-C §5.5.2', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.5.2',
    technical_explanation: 'El registro de accesos permite auditar quién ingresó al cuarto, cuándo y por cuánto tiempo. Es fundamental para investigación de incidentes.',
    physical_validation: 'Revisar el sistema de registro de accesos o bitácora física. Verificar que los registros están completos y actualizados.',
    recommended_evidence: 'Reporte de accesos del último mes, bitácora física firmada, configuración del sistema de control de acceso.',
    criticality: 'media',
    operational_risk: 'Imposibilidad de auditar accesos, dificultad para investigar incidentes de seguridad.',
  },
  {
    id: 'seg-3', category: 'Seguridad física',
    question: '¿El cuarto cuenta con cámara de vigilancia funcional con grabación ≥ 30 días?',
    norm_ref: 'TIA-942-C §5.5.3', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.5.3',
    technical_explanation: 'La videovigilancia debe cubrir el acceso principal y el interior del cuarto. La retención mínima recomendada es de 30 días.',
    physical_validation: 'Verificar cámaras instaladas y su campo de visión. Confirmar que el sistema de grabación está activo y tiene almacenamiento suficiente.',
    recommended_evidence: 'Fotografía de cámaras instaladas, captura del sistema de grabación con fecha, configuración de retención.',
    criticality: 'media',
    operational_risk: 'Sin evidencia visual para investigación de incidentes, robo o sabotaje sin posibilidad de identificación.',
  },
  {
    id: 'seg-4', category: 'Seguridad física',
    question: '¿Los racks tienen cerradura individual o están en área de acceso restringido?',
    norm_ref: 'TIA-942-C §5.5.4', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.5.4',
    technical_explanation: 'La seguridad en profundidad requiere múltiples capas: control de acceso al cuarto + cerradura de rack para proteger equipos individuales.',
    physical_validation: 'Verificar que los racks tienen puertas con cerradura funcional. Revisar que las llaves están controladas y registradas.',
    recommended_evidence: 'Fotografía de racks con cerradura, inventario de llaves, política de gestión de acceso a racks.',
    criticality: 'media',
    operational_risk: 'Acceso no controlado a equipos individuales, riesgo de extracción de hardware o medios de almacenamiento.',
  },
  {
    id: 'seg-5', category: 'Seguridad física',
    question: '¿Existe política documentada de acceso y procedimiento de visitantes?',
    norm_ref: 'TIA-942-C §5.5.5', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.5.5',
    technical_explanation: 'La política de acceso debe definir quién puede ingresar, bajo qué condiciones, con qué escolta y qué actividades están permitidas.',
    physical_validation: 'Solicitar el documento de política de acceso. Verificar que está vigente, aprobado y que el personal lo conoce.',
    recommended_evidence: 'Política de acceso aprobada y vigente, registro de capacitación del personal, formulario de acceso de visitantes.',
    criticality: 'baja',
    operational_risk: 'Accesos no controlados, incumplimiento normativo, responsabilidad legal ante incidentes.',
  },

  // ─── PROTECCIÓN CONTRA INCENDIO ───────────────────────────
  {
    id: 'inc-1', category: 'Protección contra incendio',
    question: '¿Existe detector de humo o incendio certificado UL dentro del cuarto?',
    norm_ref: 'TIA-942-C §5.6.1', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.6.1',
    technical_explanation: 'Los detectores de humo deben ser del tipo iónicos o fotoeléctricos, certificados UL 268, instalados según NFPA 72 y conectados a la central de alarmas.',
    physical_validation: 'Verificar detector instalado, fecha de prueba (≤ 12 meses), conexión a central de alarmas y prueba de funcionamiento.',
    recommended_evidence: 'Fotografía del detector con etiqueta de prueba, reporte de prueba del sistema de detección, certificado de instalación.',
    criticality: 'critica',
    operational_risk: 'Sin detección temprana, un incendio puede destruir la instalación completa antes de ser detectado.',
  },
  {
    id: 'inc-2', category: 'Protección contra incendio',
    question: '¿Se cuenta con extintor de CO2 o agente limpio con recarga vigente?',
    norm_ref: 'TIA-942-C §5.6.2', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.6.2',
    technical_explanation: 'Los extintores para cuartos de TI deben ser de CO2 o agente limpio (FM-200, Novec 1230). Los extintores de polvo químico dañan los equipos.',
    physical_validation: 'Verificar tipo de extintor (CO2 o agente limpio), fecha de última recarga (≤ 12 meses) y que está accesible y señalizado.',
    recommended_evidence: 'Fotografía del extintor con etiqueta de recarga visible, certificado de recarga, registro de inspección mensual.',
    criticality: 'alta',
    operational_risk: 'Sin extintor adecuado, un incendio pequeño puede propagarse y destruir equipos y datos.',
  },
  {
    id: 'inc-3', category: 'Protección contra incendio',
    question: '¿El cuarto está libre de materiales combustibles o almacenamiento no autorizado?',
    norm_ref: 'TIA-569-D §4.6', norm_name: 'ANSI/TIA-569', norm_clause: '4.6',
    technical_explanation: 'TIA-569-D prohíbe el almacenamiento de materiales combustibles en cuartos de telecomunicaciones. Solo deben estar presentes equipos y materiales de TI.',
    physical_validation: 'Inspección visual del cuarto. Verificar ausencia de cajas, papel, materiales de limpieza, ropa u otros materiales combustibles.',
    recommended_evidence: 'Fotografías del cuarto mostrando ausencia de materiales combustibles, lista de verificación de inspección.',
    criticality: 'alta',
    operational_risk: 'Mayor carga de fuego, propagación rápida de incendio, invalidación de seguros.',
  },
  {
    id: 'inc-4', category: 'Protección contra incendio',
    question: '¿Los cables están organizados y sin acumulación que represente riesgo de incendio?',
    norm_ref: 'TIA-569-D §6.5', norm_name: 'ANSI/TIA-569', norm_clause: '6.5',
    technical_explanation: 'La acumulación excesiva de cables puede generar calor, dificultar la circulación de aire y crear condiciones para cortocircuitos.',
    physical_validation: 'Inspeccionar la organización del cableado en racks y bandejas. Verificar que no hay cables sueltos, doblados en exceso o acumulados.',
    recommended_evidence: 'Fotografías del interior de racks y bandejas de cable, reporte de inspección de cableado.',
    criticality: 'media',
    operational_risk: 'Cortocircuito por daño mecánico, sobrecalentamiento, dificultad para mantenimiento.',
  },
  {
    id: 'inc-5', category: 'Protección contra incendio',
    question: '¿Existe plan de emergencia y se realizan simulacros documentados?',
    norm_ref: 'TIA-942-C §5.6.5', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.6.5',
    technical_explanation: 'El plan de emergencia debe incluir procedimientos de evacuación, contactos de emergencia, procedimientos de apagado de emergencia y recuperación.',
    physical_validation: 'Solicitar el plan de emergencia. Verificar que el personal lo conoce. Revisar registros de simulacros (mínimo 1 por año).',
    recommended_evidence: 'Plan de emergencia aprobado y vigente, registros de simulacros con fecha y participantes, señalización de emergencia.',
    criticality: 'media',
    operational_risk: 'Respuesta inadecuada ante emergencias, mayor daño, riesgo para el personal.',
  },

  // ─── DOCUMENTACIÓN ────────────────────────────────────────
  {
    id: 'doc-1', category: 'Documentación',
    question: '¿Existe plano actualizado de distribución de racks y equipos (As-Built)?',
    norm_ref: 'TIA-606-C §7.1', norm_name: 'ANSI/TIA-606', norm_clause: '7.1',
    technical_explanation: 'Los planos As-Built deben reflejar la instalación real, incluyendo posición de racks, equipos, rutas de cableado y conexiones activas.',
    physical_validation: 'Comparar el plano con la instalación física. Verificar fecha de última actualización. Confirmar que refleja la realidad actual.',
    recommended_evidence: 'Plano As-Built con fecha de actualización ≤ 90 días, firma del responsable técnico, versión controlada.',
    criticality: 'alta',
    operational_risk: 'Errores en intervenciones, tiempo de resolución de fallas aumentado, riesgo de daños por desconocimiento de la instalación.',
  },
  {
    id: 'doc-2', category: 'Documentación',
    question: '¿El inventario de activos está completo y actualizado en el sistema DCIM?',
    norm_ref: 'TIA-606-C §7.2', norm_name: 'ANSI/TIA-606', norm_clause: '7.2',
    technical_explanation: 'El inventario debe incluir todos los activos con: número de serie, modelo, fabricante, fecha de instalación, posición en rack y estado.',
    physical_validation: 'Comparar el inventario del sistema con los equipos físicamente instalados. Verificar que no hay equipos sin registrar.',
    recommended_evidence: 'Reporte de inventario del sistema DCIM, resultado de auditoría física vs. sistema, fecha de última actualización.',
    criticality: 'media',
    operational_risk: 'Activos no gestionados, imposibilidad de planificar capacidad, pérdida de activos sin detección.',
  },
  {
    id: 'doc-3', category: 'Documentación',
    question: '¿Existe diagrama de red lógica y física actualizado?',
    norm_ref: 'TIA-606-C §7.3', norm_name: 'ANSI/TIA-606', norm_clause: '7.3',
    technical_explanation: 'El diagrama lógico muestra la topología de red (VLANs, rutas, protocolos). El físico muestra las conexiones reales entre equipos.',
    physical_validation: 'Solicitar diagramas de red. Verificar que reflejan la configuración actual. Confirmar fecha de última actualización.',
    recommended_evidence: 'Diagrama lógico y físico con fecha ≤ 90 días, herramienta de documentación (Visio, draw.io, NetBox), versión controlada.',
    criticality: 'alta',
    operational_risk: 'Diagnóstico de fallas complejo, cambios sin visibilidad de impacto, imposibilidad de planificar.',
  },
  {
    id: 'doc-4', category: 'Documentación',
    question: '¿Se cuenta con procedimientos escritos de operación y mantenimiento?',
    norm_ref: 'TIA-942-C §5.7.4', norm_name: 'ANSI/TIA-942-C', norm_clause: '5.7.4',
    technical_explanation: 'Los procedimientos operativos estándar (SOP) deben cubrir: arranque/apagado, mantenimiento preventivo, respuesta a incidentes y cambios.',
    physical_validation: 'Solicitar los SOPs. Verificar que están actualizados, aprobados y accesibles para el personal operativo.',
    recommended_evidence: 'SOPs aprobados y vigentes, registro de capacitación del personal, evidencia de uso (bitácoras de mantenimiento).',
    criticality: 'media',
    operational_risk: 'Operaciones inconsistentes, errores humanos, dependencia de conocimiento individual no documentado.',
  },
  {
    id: 'doc-5', category: 'Documentación',
    question: '¿Los certificados de pruebas, calibraciones y garantías están archivados?',
    norm_ref: 'TIA-606-C §7.5', norm_name: 'ANSI/TIA-606', norm_clause: '7.5',
    technical_explanation: 'El archivo técnico debe incluir: certificados de cableado, calibración de equipos de medición, garantías de fabricantes y contratos de mantenimiento.',
    physical_validation: 'Verificar la existencia y organización del archivo técnico. Confirmar que los documentos están vigentes y accesibles.',
    recommended_evidence: 'Índice del archivo técnico, certificados de cableado, contratos de mantenimiento vigentes, garantías de equipos.',
    criticality: 'baja',
    operational_risk: 'Pérdida de garantías, imposibilidad de reclamar servicios, incumplimiento en auditorías.',
  },
];

export const CERT_CATEGORIES = [
  'Telecomunicaciones',
  'Energía',
  'Ambiente',
  'Seguridad física',
  'Protección contra incendio',
  'Documentación',
];

export const CATEGORY_META: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string; text: string }> = {
  'Telecomunicaciones': { icon: <Network size={14} />, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  'Energía':           { icon: <Zap size={14} />,     color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  'Ambiente':          { icon: <Wind size={14} />,     color: 'text-teal-600',  bg: 'bg-teal-50',  border: 'border-teal-200',  text: 'text-teal-700' },
  'Seguridad física':  { icon: <Shield size={14} />,   color: 'text-violet-600',bg: 'bg-violet-50',border: 'border-violet-200',text: 'text-violet-700' },
  'Protección contra incendio': { icon: <AlertTriangle size={14} />, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
  'Documentación':     { icon: <FileText size={14} />, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-[#E8EBF4]', text: 'text-slate-700' },
};

const CRITICALITY_META: Record<CertCriticality, { label: string; color: string; bg: string; dot: string }> = {
  baja:    { label: 'Baja',    color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200',   dot: 'bg-blue-400' },
  media:   { label: 'Media',   color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-400' },
  alta:    { label: 'Alta',    color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-400' },
  critica: { label: 'Crítica', color: 'text-red-600',    bg: 'bg-red-50 border-red-200',     dot: 'bg-red-500' },
};

const NORM_BADGE_COLOR: Record<CertNorm, string> = {
  'ANSI/TIA-942-C': 'bg-blue-100 text-blue-700 border-blue-200',
  'ICREA':          'bg-violet-100 text-violet-700 border-violet-200',
  'ANSI/TIA-606':   'bg-teal-100 text-teal-700 border-teal-200',
  'ANSI/TIA-568':   'bg-cyan-100 text-cyan-700 border-cyan-200',
  'ANSI/TIA-569':   'bg-indigo-100 text-indigo-700 border-indigo-200',
  'ISO/IEC 11801':  'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function buildDefaultAnswers(): EvalAnswer[] {
  return NORM_QUESTIONS.map(q => ({
    question_id: q.id,
    answer: 'na' as CertAnswer,
    observation: '',
    evidence_url: '',
    answered_at: '',
  }));
}

function calcResults(answers: EvalAnswer[]) {
  const byCategory = CERT_CATEGORIES.map(cat => {
    const qs = NORM_QUESTIONS.filter(q => q.category === cat);
    const ans = qs.map(q => answers.find(a => a.question_id === q.id));
    const applicable = ans.filter(a => a?.answer !== 'na');
    const compliant = applicable.filter(a => a?.answer === 'cumple');
    const pct = applicable.length > 0 ? Math.round((compliant.length / applicable.length) * 100) : null;
    const critical = qs.filter(q => {
      const a = answers.find(a => a.question_id === q.id);
      return a?.answer === 'no_cumple' && (q.criticality === 'alta' || q.criticality === 'critica');
    });
    return { cat, pct, compliant: compliant.length, applicable: applicable.length, total: qs.length, critical };
  });
  const applicableCats = byCategory.filter(c => c.pct !== null);
  const overall = applicableCats.length > 0
    ? Math.round(applicableCats.reduce((s, c) => s + (c.pct ?? 0), 0) / applicableCats.length)
    : null;
  const criticalFindings = NORM_QUESTIONS.filter(q => {
    const a = answers.find(a => a.question_id === q.id);
    return a?.answer === 'no_cumple' && (q.criticality === 'alta' || q.criticality === 'critica');
  });
  const badge: 'Certificable' | 'Encaminado' | 'Crítico' =
    overall === null ? 'Encaminado' :
    overall >= 85 ? 'Certificable' :
    overall >= 50 ? 'Encaminado' : 'Crítico';
  const recommendation =
    overall === null ? 'Complete la evaluación respondiendo todas las preguntas aplicables para obtener un diagnóstico.' :
    overall >= 85 ? 'La instalación está en condiciones avanzadas de preparación. Se recomienda proceder con auditoría formal por organismo certificador acreditado.' :
    overall >= 50 ? 'Se identificaron áreas de mejora. Atienda los hallazgos críticos antes de solicitar normativa formal.' :
    'La instalación presenta deficiencias críticas. Se requiere plan de acción correctiva urgente antes de considerar cualquier proceso de normativa.';
  return { byCategory, overall, criticalFindings, badge, recommendation };
}

// ============================================================
// COMPONENTE PRINCIPAL: TabNormativa
// ============================================================
interface TabNormativaProps {
  sites: MdfIdfRecord[];
}

export function TabNormativa({ sites }: TabNormativaProps) {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [history, setHistory] = useState<CertEvalRecord[]>([]);
  const [activeEval, setActiveEval] = useState<{
    answers: EvalAnswer[];
    standard: CertNorm | 'Evaluación interna SKIA';
    evaluator: string;
    eval_date: string;
    notes: string;
  } | null>(null);
  const [openCat, setOpenCat] = useState<string | null>(CERT_CATEGORIES[0]);
  const [showHelp, setShowHelp] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<CertEvalRecord | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingQId, setUploadingQId] = useState<string | null>(null);

  const selectedSite = sites.find(s => s.id === selectedSiteId);
  const siteHistory = history.filter(h => h.site_id === selectedSiteId);

  const results = useMemo(
    () => activeEval ? calcResults(activeEval.answers) : null,
    [activeEval]
  );

  function startNewEval() {
    setActiveEval({
      answers: buildDefaultAnswers(),
      standard: 'Evaluación interna SKIA',
      evaluator: '',
      eval_date: new Date().toISOString().slice(0, 10),
      notes: '',
    });
    setOpenCat(CERT_CATEGORIES[0]);
  }

  function editExistingEval(rec: CertEvalRecord) {
    // Cargar la evaluación existente en el formulario de edición
    setActiveEval({
      answers: rec.answers,
      standard: rec.standard,
      evaluator: rec.evaluator,
      eval_date: rec.eval_date,
      notes: rec.notes || '',
    });
    setEditingRecordId(rec.id);
    setOpenCat(CERT_CATEGORIES[0]);
    setViewingRecord(null);
  }

  function setAnswer(qId: string, patch: Partial<EvalAnswer>) {
    if (!activeEval) return;
    setActiveEval(ev => ev ? {
      ...ev,
      answers: ev.answers.map(a => a.question_id === qId ? { ...a, ...patch, answered_at: new Date().toISOString() } : a),
    } : null);
  }

  function handleEvidenceFile(qId: string, file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => { if (e.target?.result) setAnswer(qId, { evidence_url: e.target.result as string }); };
    reader.readAsDataURL(file);
  }

  function saveEval() {
    if (!activeEval || !selectedSite || !results) return;
    if (editingRecordId) {
      // Actualizar evaluación existente
      setHistory(h => h.map(rec =>
        rec.id === editingRecordId
          ? {
              ...rec,
              standard: activeEval.standard,
              evaluator: activeEval.evaluator,
              eval_date: activeEval.eval_date,
              answers: activeEval.answers,
              overall_pct: results.overall,
              badge: results.badge,
              notes: activeEval.notes,
            }
          : rec
      ));
      setEditingRecordId(null);
    } else {
      // Nueva evaluación
      const rec: CertEvalRecord = {
        id: Date.now().toString(),
        site_id: selectedSite.id,
        site_name: selectedSite.name,
        standard: activeEval.standard,
        evaluator: activeEval.evaluator,
        eval_date: activeEval.eval_date,
        answers: activeEval.answers,
        overall_pct: results.overall,
        badge: results.badge,
        notes: activeEval.notes,
        created_at: new Date().toISOString(),
      };
      setHistory(h => [rec, ...h]);
    }
    setActiveEval(null);
  }

  const badgeStyle = (badge: string) =>
    badge === 'Certificable' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' :
    badge === 'Encaminado'   ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' :
                               'bg-red-100 text-red-700 ring-1 ring-red-300';

  const badgeIcon = (badge: string) =>
    badge === 'Certificable' ? <CheckCircle2 size={11} /> :
    badge === 'Encaminado'   ? <Clock size={11} /> : <XCircle size={11} />;

  const inp = "w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-xs focus:border-indigo-400 focus:outline-none bg-slate-100/80";

  // ── Vista de historial de una evaluación ──────────────────
  if (viewingRecord) {
    const r = calcResults(viewingRecord.answers);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => setViewingRecord(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100/80 border border-[#E8EBF4] rounded-xl px-3 py-1.5 transition-colors">
            <ChevronRight size={12} className="rotate-180" /> Volver al historial
          </button>
          <button onClick={() => editExistingEval(viewingRecord)}
            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-3 py-1.5 transition-colors">
            <Edit2 size={12} /> Editar evaluación
          </button>
          <span className="text-sm font-black text-[#1A1D2E]">{viewingRecord.site_name}</span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-bold ${badgeStyle(viewingRecord.badge)}`}>
            {badgeIcon(viewingRecord.badge)} {viewingRecord.badge}
            {viewingRecord.overall_pct !== null ? ` — ${viewingRecord.overall_pct}%` : ''}
          </span>
        </div>
        <EvalResultCard results={r} standard={viewingRecord.standard} evaluator={viewingRecord.evaluator} date={viewingRecord.eval_date} />
        <div className="grid grid-cols-2 gap-3">
          {CERT_CATEGORIES.map(cat => {
            const meta = CATEGORY_META[cat];
            const catR = r.byCategory.find(c => c.cat === cat)!;
            const catQs = NORM_QUESTIONS.filter(q => q.category === cat);
            return (
              <div key={cat} className={`bg-slate-100/80 backdrop-blur-sm border ${meta.border} rounded-2xl p-4`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={meta.color}>{meta.icon}</span>
                  <span className="text-xs font-black text-slate-700">{cat}</span>
                  <span className={`ml-auto text-sm font-black ${catR.pct === null ? 'text-[#5C6194]' : catR.pct >= 85 ? 'text-emerald-600' : catR.pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                    {catR.pct !== null ? `${catR.pct}%` : 'N/A'}
                  </span>
                </div>
                {catQs.map((q, qi) => {
                  const a = viewingRecord.answers.find(a => a.question_id === q.id);
                  return (
                    <div key={q.id} className="border-t border-[#E8EBF4] pt-2 mt-2 first:border-0 first:pt-0 first:mt-0">
                      <div className="flex items-start gap-2">
                        <span className="text-[12px] font-black text-[#5C6194] mt-0.5">{qi + 1}.</span>
                        <div className="flex-1">
                          <p className="text-[13px] text-slate-700 font-medium leading-snug mb-1">{q.question}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[12px] font-bold border ${
                              a?.answer === 'cumple' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' :
                              a?.answer === 'no_cumple' ? 'bg-red-50 border-red-300 text-red-700' :
                              'bg-[#F0F2FA] border-[#E8EBF4] text-slate-500'
                            }`}>
                              {a?.answer === 'cumple' ? '✓ Cumple' : a?.answer === 'no_cumple' ? '✕ No cumple' : 'N/A'}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[13px] font-bold border ${CRITICALITY_META[q.criticality].bg}`}>
                              <span className={`w-1 h-1 rounded-full ${CRITICALITY_META[q.criticality].dot}`} />
                              {CRITICALITY_META[q.criticality].label}
                            </span>
                          </div>
                          {a?.observation && <p className="text-[12px] text-[#5C6194] mt-1 italic">"{a.observation}"</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function startNewEvalForSite(siteId: string) {
    setSelectedSiteId(siteId);
    setActiveEval({
      answers: buildDefaultAnswers(),
      standard: 'Evaluación interna SKIA',
      evaluator: '',
      eval_date: new Date().toISOString().slice(0, 10),
      notes: '',
    });
    setOpenCat(CERT_CATEGORIES[0]);
    setEditingRecordId(null);
  }

  return (
    <div className="space-y-3">
      {/* ── Cabecera de tabla ─────────────────────────────── */}
      <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl overflow-hidden shadow-sm">
        {/* Header row */}
        <div className="grid grid-cols-[32px_1fr_80px_140px_100px_80px_120px_100px] gap-3 px-4 py-2.5 border-b border-[#E8EBF4] bg-slate-50/80">
          <div />
          <div className="text-[12px] font-black text-slate-500 uppercase tracking-widest">Nombre / Código</div>
          <div className="text-[12px] font-black text-slate-500 uppercase tracking-widest">Tipo</div>
          <div className="text-[12px] font-black text-slate-500 uppercase tracking-widest">Ubicación</div>
          <div className="text-[12px] font-black text-slate-500 uppercase tracking-widest">Responsable</div>
          <div className="text-[12px] font-black text-slate-500 uppercase tracking-widest text-center">Evals.</div>
          <div className="text-[12px] font-black text-slate-500 uppercase tracking-widest">Último resultado</div>
          <div className="text-[12px] font-black text-slate-500 uppercase tracking-widest text-right">Acciones</div>
        </div>

        {/* Filas expandibles */}
        {sites.map(site => {
          const siteHist = history.filter(h => h.site_id === site.id);
          const lastEval = siteHist[0];
          const isExpanded = selectedSiteId === site.id;

          return (
            <div key={site.id} className="border-b border-[#E8EBF4] last:border-0">
              {/* Fila colapsada */}
              <div
                onClick={() => {
                  if (isExpanded) { setSelectedSiteId(null); setActiveEval(null); setEditingRecordId(null); }
                  else { setSelectedSiteId(site.id); setActiveEval(null); setEditingRecordId(null); }
                }}
                className={`grid grid-cols-[32px_1fr_80px_140px_100px_80px_120px_100px] gap-3 px-4 py-3 cursor-pointer transition-colors ${
                  isExpanded ? 'bg-indigo-50/60' : 'hover:bg-slate-50/80'
                }`}>
                {/* Chevron */}
                <div className="flex items-center justify-center">
                  <ChevronRight size={14} className={`text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                </div>
                {/* Nombre */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    site.type === 'MDF' ? 'bg-blue-100' : site.type === 'IDF' ? 'bg-indigo-100' : site.type === 'Site' ? 'bg-teal-100' : 'bg-slate-100'
                  }`}>
                    <Building2 size={13} className={site.type === 'MDF' ? 'text-blue-600' : site.type === 'IDF' ? 'text-indigo-600' : site.type === 'Site' ? 'text-teal-600' : 'text-slate-500'} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{site.name}</p>
                    <p className="text-[12px] font-mono text-indigo-500">{site.code}</p>
                  </div>
                </div>
                {/* Tipo */}
                <div className="flex items-center">
                  <span className={`text-[12px] font-bold px-2 py-0.5 rounded-md ${
                    site.type === 'MDF' ? 'bg-blue-100 text-blue-700' :
                    site.type === 'IDF' ? 'bg-indigo-100 text-indigo-700' :
                    site.type === 'Site' ? 'bg-teal-100 text-teal-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>{site.type}</span>
                </div>
                {/* Ubicación */}
                <div className="flex flex-col justify-center min-w-0">
                  <p className="text-[13px] font-semibold text-slate-700 truncate">{site.building}</p>
                  <p className="text-[12px] text-[#5C6194] truncate">{site.floor} · {site.zone}</p>
                </div>
                {/* Responsable */}
                <div className="flex items-center">
                  <p className="text-[13px] text-slate-600 truncate">{site.responsible || '—'}</p>
                </div>
                {/* Evals */}
                <div className="flex items-center justify-center">
                  <span className="text-sm font-black text-slate-700">{siteHist.length}</span>
                </div>
                {/* Último resultado */}
                <div className="flex items-center">
                  {lastEval ? (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-bold ${badgeStyle(lastEval.badge)}`}>
                      {badgeIcon(lastEval.badge)} {lastEval.badge} {lastEval.overall_pct !== null ? `${lastEval.overall_pct}%` : ''}
                    </span>
                  ) : (
                    <span className="text-[12px] text-[#5C6194] italic">Sin evaluar</span>
                  )}
                </div>
                {/* Acciones */}
                <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => { setSelectedSiteId(site.id); setActiveEval(null); setEditingRecordId(null); startNewEvalForSite(site.id); }}
                    className="flex items-center gap-1 text-[12px] text-indigo-500 hover:text-indigo-700 font-bold border border-indigo-200 rounded-lg px-2 py-1 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                    <Plus size={10} /> Evaluar
                  </button>
                </div>
              </div>

              {/* Panel expandido debajo de la fila */}
              {isExpanded && (
                <div className="bg-indigo-50/30 border-t border-indigo-100 px-6 py-5">
                  <div className="space-y-4">
                    {/* Encabezado del panel expandido */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <History size={14} className="text-indigo-500" />
                        <span className="text-xs font-black text-slate-700">Evaluaciones de {site.name}</span>
                        <span className="text-[12px] text-[#5C6194] bg-slate-100 px-2 py-0.5 rounded-full">{siteHist.length} registros</span>
                      </div>
                      {!activeEval && (
                        <button onClick={() => startNewEvalForSite(site.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
                          <Plus size={12} /> Nueva evaluación
                        </button>
                      )}
                      {activeEval && (
                        <button onClick={() => { setActiveEval(null); setEditingRecordId(null); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F0F2FA] border border-[#E8EBF4] text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors">
                          <X size={12} /> Cancelar
                        </button>
                      )}
                    </div>

                    {/* Historial cuando no hay evaluación activa */}
                    {!activeEval && siteHist.length === 0 && (
                      <div className="text-center py-8">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center mx-auto mb-2">
                          <Award size={18} className="text-indigo-400" />
                        </div>
                        <p className="text-xs font-bold text-slate-500">Sin evaluaciones registradas</p>
                        <p className="text-[13px] text-[#5C6194] mt-0.5">Inicia una nueva evaluación para este sitio</p>
                      </div>
                    )}

                    {!activeEval && siteHist.length > 0 && (
                      <div className="space-y-2">
                        {siteHist.map(rec => (
                          <div key={rec.id} className="flex items-center gap-3 p-3 bg-slate-100/80 border border-[#E8EBF4] rounded-xl hover:border-indigo-200 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-bold ${badgeStyle(rec.badge)}`}>
                                  {badgeIcon(rec.badge)} {rec.badge}{rec.overall_pct !== null ? ` — ${rec.overall_pct}%` : ''}
                                </span>
                                <span className="text-[12px] text-[#5C6194] font-mono bg-slate-100 px-1.5 py-0.5 rounded-md">{rec.standard}</span>
                              </div>
                              <p className="text-[13px] text-[#5C6194]">{rec.eval_date} · {rec.evaluator || 'Sin evaluador'}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => editExistingEval(rec)}
                                className="flex items-center gap-1 text-[12px] text-blue-500 hover:text-blue-700 font-bold border border-blue-200 rounded-lg px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 transition-colors">
                                <Edit2 size={10} /> Editar
                              </button>
                              <button onClick={() => setViewingRecord(rec)}
                                className="flex items-center gap-1 text-[12px] text-indigo-500 hover:text-indigo-700 font-bold border border-indigo-200 rounded-lg px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                                <Eye size={10} /> Ver detalle
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

          {/* ── Formulario de evaluación activa ─────────────── */}
          {activeEval && results && (
            <div className="space-y-4">
              {/* Configuración */}
              <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl p-4">
                <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-3">
                {editingRecordId ? '✏️ Editando evaluación existente' : 'Configuración de la evaluación'}
              </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Estándar de referencia</label>
                    <select className={inp} value={activeEval.standard}
                      onChange={e => setActiveEval(ev => ev ? { ...ev, standard: e.target.value as any } : null)}>
                      <option>Evaluación interna SKIA</option>
                      <option>ANSI/TIA-942-C</option>
                      <option>ICREA</option>
                      <option>ANSI/TIA-606</option>
                      <option>ANSI/TIA-568</option>
                      <option>ANSI/TIA-569</option>
                      <option>ISO/IEC 11801</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Responsable de evaluación</label>
                    <input className={inp} placeholder="Nombre del evaluador"
                      value={activeEval.evaluator}
                      onChange={e => setActiveEval(ev => ev ? { ...ev, evaluator: e.target.value } : null)} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-1">Fecha</label>
                    <input type="date" className={inp} value={activeEval.eval_date}
                      onChange={e => setActiveEval(ev => ev ? { ...ev, eval_date: e.target.value } : null)} />
                  </div>
                </div>
              </div>

              {/* Ficha de resultado en tiempo real */}
              <EvalResultCard results={results} standard={activeEval.standard} evaluator={activeEval.evaluator} date={activeEval.eval_date} live />

              {/* Preguntas por categoría */}
              <div className="space-y-2">
                {CERT_CATEGORIES.map(cat => {
                  const meta = CATEGORY_META[cat];
                  const catQs = NORM_QUESTIONS.filter(q => q.category === cat);
                  const catR = results.byCategory.find(c => c.cat === cat)!;
                  const isOpen = openCat === cat;
                  return (
                    <div key={cat} className={`border ${meta.border} rounded-2xl overflow-hidden bg-slate-100/80 backdrop-blur-sm`}>
                      <button type="button" onClick={() => setOpenCat(isOpen ? null : cat)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-100/80 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className={meta.color}>{meta.icon}</span>
                          <span className="text-xs font-black text-slate-700">{cat}</span>
                          <span className="text-[12px] text-[#5C6194]">{catR.applicable}/{catR.total} respondidas</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {catR.pct !== null && (
                            <span className={`text-sm font-black ${catR.pct >= 85 ? 'text-emerald-600' : catR.pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                              {catR.pct}%
                            </span>
                          )}
                          {catR.critical.length > 0 && (
                            <span className="flex items-center gap-0.5 text-[12px] text-red-500 font-bold">
                              <AlertTriangle size={9} /> {catR.critical.length}
                            </span>
                          )}
                          <ChevronDown size={13} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-[#E8EBF4] divide-y divide-slate-50">
                          {catQs.map((q, qi) => {
                            const a = activeEval.answers.find(a => a.question_id === q.id)!;
                            const cm = CRITICALITY_META[q.criticality];
                            const isHelpOpen = showHelp === q.id;
                            return (
                              <div key={q.id} className="px-4 py-4 bg-slate-100/40">
                                {/* Cabecera de pregunta */}
                                <div className="flex items-start gap-3 mb-3">
                                  <span className="text-[12px] font-black text-[#5C6194] mt-0.5 min-w-[18px]">{qi + 1}.</span>
                                  <div className="flex-1">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <p className="text-[13px] text-slate-800 font-semibold leading-snug flex-1">{q.question}</p>
                                      <button type="button" onClick={() => setShowHelp(isHelpOpen ? null : q.id)}
                                        className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 hover:bg-indigo-100 flex items-center justify-center transition-colors">
                                        <Info size={11} className={isHelpOpen ? 'text-indigo-600' : 'text-slate-500'} />
                                      </button>
                                    </div>

                                    {/* Badges normativos */}
                                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[13px] font-black border ${NORM_BADGE_COLOR[q.norm_name]}`}>
                                        <Award size={8} /> {q.norm_name}
                                      </span>
                                      <span className="text-[13px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                                        §{q.norm_clause}
                                      </span>
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[13px] font-bold border ${cm.bg}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${cm.dot}`} />
                                        {cm.label}
                                      </span>
                                    </div>

                                    {/* Panel de ayuda contextual */}
                                    {isHelpOpen && (
                                      <div className="bg-indigo-50/80 border border-indigo-200/60 rounded-xl p-3 mb-3 space-y-2">
                                        <div>
                                          <p className="text-[13px] font-black text-indigo-600 uppercase tracking-wider mb-0.5">Explicación técnica</p>
                                          <p className="text-[13px] text-slate-700 leading-relaxed">{q.technical_explanation}</p>
                                        </div>
                                        <div>
                                          <p className="text-[13px] font-black text-indigo-600 uppercase tracking-wider mb-0.5">¿Qué validar físicamente?</p>
                                          <p className="text-[13px] text-slate-700 leading-relaxed">{q.physical_validation}</p>
                                        </div>
                                        <div>
                                          <p className="text-[13px] font-black text-indigo-600 uppercase tracking-wider mb-0.5">Evidencia recomendada</p>
                                          <p className="text-[13px] text-slate-700 leading-relaxed">{q.recommended_evidence}</p>
                                        </div>
                                        <div className="bg-red-50/80 border border-red-200/60 rounded-lg p-2">
                                          <p className="text-[13px] font-black text-red-600 uppercase tracking-wider mb-0.5">Riesgo operativo si no cumple</p>
                                          <p className="text-[13px] text-red-700 leading-relaxed">{q.operational_risk}</p>
                                        </div>
                                      </div>
                                    )}

                                    {/* Botones de respuesta */}
                                    <div className="flex items-center gap-2 mb-3">
                                      {(['cumple', 'no_cumple', 'na'] as CertAnswer[]).map(val => (
                                        <button key={val} type="button"
                                          onClick={() => setAnswer(q.id, { answer: val })}
                                          className={`px-3 py-1.5 rounded-xl text-[13px] font-bold border transition-all ${
                                            a.answer === val
                                              ? val === 'cumple' ? 'bg-emerald-100 border-emerald-400 text-emerald-700 shadow-sm'
                                              : val === 'no_cumple' ? 'bg-red-100 border-red-400 text-red-700 shadow-sm'
                                              : 'bg-slate-200 border-slate-400 text-slate-700 shadow-sm'
                                              : 'bg-[#F0F2FA] border-[#E8EBF4] text-slate-500 hover:border-[#E8EBF4]'
                                          }`}>
                                          {val === 'cumple' ? '✓ Cumple' : val === 'no_cumple' ? '✕ No cumple' : 'N/A'}
                                        </button>
                                      ))}
                                    </div>

                                    {/* Observaciones */}
                                    <textarea rows={2} placeholder="Observaciones técnicas (opcional)"
                                      value={a.observation}
                                      onChange={e => setAnswer(q.id, { observation: e.target.value })}
                                      className="w-full px-3 py-2 border border-[#E8EBF4] rounded-xl text-[13px] text-slate-600 resize-none focus:border-indigo-400 focus:outline-none bg-slate-100/80 mb-2" />

                                    {/* Evidencia */}
                                    <div className="flex items-center gap-2">
                                      <input ref={q.id === uploadingQId ? fileInputRef : undefined}
                                        type="file" accept="image/*" className="hidden"
                                        onChange={e => {
                                          const f = e.target.files?.[0];
                                          if (f) handleEvidenceFile(q.id, f);
                                          setUploadingQId(null);
                                          if (e.target) e.target.value = '';
                                        }} />
                                      {a.evidence_url ? (
                                        <div className="flex items-center gap-2">
                                          <img src={a.evidence_url} alt="Evidencia" className="h-10 w-16 object-cover rounded-lg border border-[#E8EBF4]" />
                                          <button type="button" onClick={() => setAnswer(q.id, { evidence_url: '' })}
                                            className="text-[12px] text-red-400 hover:text-red-600 font-semibold">Eliminar</button>
                                        </div>
                                      ) : (
                                        <button type="button"
                                          onClick={() => { setUploadingQId(q.id); setTimeout(() => fileInputRef.current?.click(), 50); }}
                                          className="flex items-center gap-1.5 text-[12px] text-indigo-500 hover:text-indigo-700 font-semibold border border-indigo-200 rounded-lg px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                                          <Camera size={10} /> Adjuntar evidencia
                                        </button>
                                      )}
                                    </div>
                                  </div>
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

              {/* Notas finales y guardar */}
              <div className="bg-slate-100/80 backdrop-blur-sm border border-[#E8EBF4]/70 rounded-2xl p-4">
                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-widest mb-2">Notas finales de la evaluación</label>
                <textarea rows={3} className={`${inp} resize-none mb-4`} placeholder="Observaciones generales, contexto de la evaluación, próximos pasos..."
                  value={activeEval.notes}
                  onChange={e => setActiveEval(ev => ev ? { ...ev, notes: e.target.value } : null)} />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setActiveEval(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 bg-[#F0F2FA] border border-[#E8EBF4] rounded-xl hover:bg-slate-50 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={saveEval}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-1.5">
                    <CheckSquare size={13} /> {editingRecordId ? 'Actualizar evaluación' : 'Guardar evaluación'}
                  </button>
                </div>
              </div>
            </div>
          )}

                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// COMPONENTE: Ficha de resultado de evaluación
// ============================================================
interface EvalResultCardProps {
  results: ReturnType<typeof calcResults>;
  standard: string;
  evaluator: string;
  date: string;
  live?: boolean;
}

function EvalResultCard({ results, standard, evaluator, date, live }: EvalResultCardProps) {
  const overallColor = results.overall === null ? 'text-slate-500' :
    results.overall >= 85 ? 'text-emerald-600' : results.overall >= 50 ? 'text-amber-600' : 'text-red-600';
  const overallBg = results.overall === null ? 'from-slate-50 to-white' :
    results.overall >= 85 ? 'from-emerald-50 to-white' : results.overall >= 50 ? 'from-amber-50 to-white' : 'from-red-50 to-white';
  const overallBar = results.overall === null ? 'bg-slate-200' :
    results.overall >= 85 ? 'bg-emerald-400' : results.overall >= 50 ? 'bg-amber-400' : 'bg-red-400';
  const badgeStyle = results.badge === 'Certificable' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' :
    results.badge === 'Encaminado' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' :
    'bg-red-100 text-red-700 ring-1 ring-red-300';

  return (
    <div className={`bg-gradient-to-br ${overallBg} border border-[#E8EBF4]/80 rounded-2xl p-5 shadow-sm`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest">Resultado de evaluación</p>
            {live && <span className="flex items-center gap-1 text-[13px] font-bold text-indigo-500 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />En curso</span>}
          </div>
          <p className="text-[13px] text-[#5C6194]">{standard}</p>
          {evaluator && <p className="text-[12px] text-[#5C6194]">{evaluator} · {date}</p>}
        </div>
        <div className="text-right">
          <span className={`text-4xl font-black ${overallColor}`}>
            {results.overall !== null ? `${results.overall}%` : '—'}
          </span>
          <div className="mt-1">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-bold ${badgeStyle}`}>
              {results.badge === 'Certificable' ? <CheckCircle2 size={10} /> : results.badge === 'Encaminado' ? <Clock size={10} /> : <XCircle size={10} />}
              {results.badge}
            </span>
          </div>
        </div>
      </div>

      {results.overall !== null && (
        <div className="mb-4">
          <div className="h-2.5 w-full bg-slate-100/80 rounded-full overflow-hidden shadow-inner">
            <div className={`h-full rounded-full transition-all duration-700 ${overallBar}`} style={{ width: `${results.overall}%` }} />
          </div>
        </div>
      )}

      {/* Porcentajes por categoría */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {results.byCategory.map(c => {
          const meta = CATEGORY_META[c.cat];
          return (
            <div key={c.cat} className="bg-slate-100/80 rounded-xl p-2.5 border border-white/80 shadow-sm">
              <div className="flex items-center gap-1 mb-1.5">
                <span className={meta.color}>{meta.icon}</span>
                <span className="text-[13px] font-bold text-slate-500 truncate">{c.cat}</span>
              </div>
              <div className="flex items-end justify-between">
                <span className={`text-lg font-black ${
                  c.pct === null ? 'text-[#5C6194]' :
                  c.pct >= 85 ? 'text-emerald-600' : c.pct >= 50 ? 'text-amber-600' : 'text-red-600'
                }`}>{c.pct !== null ? `${c.pct}%` : 'N/A'}</span>
                <span className="text-[13px] text-slate-500">{c.compliant}/{c.applicable}</span>
              </div>
              <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden mt-1">
                <div className={`h-full rounded-full transition-all duration-500 ${
                  c.pct === null ? 'bg-slate-200' :
                  c.pct >= 85 ? 'bg-emerald-400' : c.pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
                }`} style={{ width: `${c.pct ?? 0}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Hallazgos críticos */}
      {results.criticalFindings.length > 0 && (
        <div className="bg-red-50/80 border border-red-200/60 rounded-xl p-3 mb-3">
          <p className="text-[12px] font-black text-red-600 mb-2 flex items-center gap-1">
            <AlertTriangle size={10} /> {results.criticalFindings.length} hallazgo(s) crítico(s) pendiente(s)
          </p>
          <div className="space-y-1">
            {results.criticalFindings.slice(0, 5).map(q => (
              <p key={q.id} className="text-[12px] text-red-600 leading-relaxed">
                • <span className="font-semibold">[{q.category}]</span> {q.question}
              </p>
            ))}
            {results.criticalFindings.length > 5 && (
              <p className="text-[12px] text-red-400 italic">...y {results.criticalFindings.length - 5} más</p>
            )}
          </div>
        </div>
      )}

      {/* Recomendación */}
      <div className="bg-slate-100/80 rounded-xl p-3 border border-[#E8EBF4]">
        <p className="text-[13px] font-black text-slate-500 uppercase tracking-wider mb-1">Recomendación automática</p>
        <p className="text-[13px] text-slate-600 leading-relaxed">{results.recommendation}</p>
        <p className="text-[13px] text-slate-500 mt-2 italic">
          * Evaluación interna de preparación para normativa. No equivale a normativa oficial.
        </p>
      </div>
    </div>
  );
}
