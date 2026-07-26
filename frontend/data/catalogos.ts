// ─── SKIA DCIM — Catálogos Predefinidos ───────────────────────────────────────
// Fuente: TIA-568, TIA-569, TIA-606, ICREA, ANSI/BICSI

// ── Marcas de cableado estructurado ──────────────────────────────────────────
export const MARCAS_CABLE = [
  'Panduit', 'Belden', 'CommScope', 'Leviton', 'Siemon',
  'Nexans', 'Legrand', 'Molex', 'Hubbell', 'Ortronics',
  'Corning', 'Fluke Networks', 'Amphenol', 'Tyco', 'TE Connectivity',
  'Draka', 'Superior Essex', 'General Cable', 'Otro',
];

// ── Marcas de equipos activos ─────────────────────────────────────────────────
export const MARCAS_ACTIVOS = [
  'Cisco', 'HP / Aruba', 'Juniper', 'Fortinet', 'Palo Alto',
  'Dell', 'HPE', 'Lenovo', 'Supermicro', 'IBM',
  'APC / Schneider', 'Eaton', 'Vertiv', 'Emerson', 'Socomec',
  'Hikvision', 'Axis', 'Bosch Security', 'Hanwha', 'Dahua',
  'HID Global', 'Honeywell', 'Lenel', 'Genetec', 'Milestone',
  'Ubiquiti', 'Ruckus', 'Meraki', 'Extreme Networks', 'Otro',
];

// ── Categorías de cable ───────────────────────────────────────────────────────
export interface CategoriaOption { value: string; label: string; norm: string; maxFreq: string; maxVelocidad: string }
export const CATEGORIAS_CABLE: CategoriaOption[] = [
  { value: '5',   label: 'Cat 5',   norm: 'TIA-568-A',   maxFreq: '100 MHz',  maxVelocidad: '100 Mbps'  },
  { value: '5e',  label: 'Cat 5e',  norm: 'TIA-568-B.2', maxFreq: '100 MHz',  maxVelocidad: '1 Gbps'    },
  { value: '6',   label: 'Cat 6',   norm: 'TIA-568-B.2-1', maxFreq: '250 MHz', maxVelocidad: '1 Gbps'   },
  { value: '6A',  label: 'Cat 6A',  norm: 'TIA-568-C.2', maxFreq: '500 MHz',  maxVelocidad: '10 Gbps'   },
  { value: '7',   label: 'Cat 7',   norm: 'ISO/IEC 11801', maxFreq: '600 MHz', maxVelocidad: '10 Gbps'  },
  { value: '7A',  label: 'Cat 7A',  norm: 'ISO/IEC 11801', maxFreq: '1000 MHz', maxVelocidad: '40 Gbps' },
  { value: '8',   label: 'Cat 8',   norm: 'TIA-568-C.2-1', maxFreq: '2000 MHz', maxVelocidad: '40 Gbps' },
  { value: 'OM1', label: 'Fibra OM1', norm: 'TIA-568-C.3', maxFreq: '—', maxVelocidad: '1 Gbps'         },
  { value: 'OM2', label: 'Fibra OM2', norm: 'TIA-568-C.3', maxFreq: '—', maxVelocidad: '10 Gbps'        },
  { value: 'OM3', label: 'Fibra OM3', norm: 'TIA-568-C.3', maxFreq: '—', maxVelocidad: '40 Gbps'        },
  { value: 'OM4', label: 'Fibra OM4', norm: 'TIA-568-C.3', maxFreq: '—', maxVelocidad: '100 Gbps'       },
  { value: 'OM5', label: 'Fibra OM5', norm: 'TIA-568-C.3', maxFreq: '—', maxVelocidad: '400 Gbps'       },
  { value: 'OS1', label: 'Fibra OS1', norm: 'ISO/IEC 11801', maxFreq: '—', maxVelocidad: '10 Gbps'      },
  { value: 'OS2', label: 'Fibra OS2', norm: 'ISO/IEC 11801', maxFreq: '—', maxVelocidad: '100 Gbps'     },
];

// ── Clasificaciones de cable ──────────────────────────────────────────────────
export interface ClasificacionOption { value: string; label: string; descripcion: string }
export const CLASIFICACIONES_CABLE: ClasificacionOption[] = [
  { value: 'CMR',   label: 'CMR — Riser',         descripcion: 'Uso en ductos verticales entre pisos. Retardante de llama.' },
  { value: 'CMP',   label: 'CMP — Plenum',         descripcion: 'Espacios de circulación de aire (plafones, pisos elevados). Baja emisión de humo.' },
  { value: 'CMX',   label: 'CMX — Residencial',    descripcion: 'Uso residencial en espacios cerrados.' },
  { value: 'LSZH',  label: 'LSZH — Low Smoke Zero Halogen', descripcion: 'Sin halógenos. Recomendado en espacios confinados y data centers.' },
  { value: 'Riser', label: 'Riser (genérico)',      descripcion: 'Instalación vertical entre plantas.' },
  { value: 'Outdoor', label: 'Outdoor / Exterior',  descripcion: 'Resistente a UV, humedad y temperatura extrema.' },
  { value: 'Direct Burial', label: 'Direct Burial', descripcion: 'Enterrado directo sin ducto.' },
  { value: 'Armored', label: 'Armored / Blindado',  descripcion: 'Protección mecánica adicional con armadura metálica.' },
];

// ── Tipos de servicio ─────────────────────────────────────────────────────────
export const TIPOS_SERVICIO = [
  { value: 'Voz',            label: 'Voz',             color: '#22c55e', icon: '📞' },
  { value: 'Datos',          label: 'Datos',           color: '#3b82f6', icon: '💻' },
  { value: 'Video',          label: 'Video',           color: '#a855f7', icon: '📹' },
  { value: 'Control Acceso', label: 'Control Acceso',  color: '#f59e0b', icon: '🔐' },
  { value: 'CCTV',           label: 'CCTV',            color: '#ef4444', icon: '📷' },
  { value: 'WiFi',           label: 'WiFi / AP',       color: '#06b6d4', icon: '📡' },
  { value: 'IoT',            label: 'IoT / Sensores',  color: '#84cc16', icon: '🌐' },
  { value: 'BMS',            label: 'BMS / Edificio',  color: '#f97316', icon: '🏢' },
  { value: 'PoE',            label: 'PoE',             color: '#8b5cf6', icon: '⚡' },
  { value: 'Fibra',          label: 'Fibra Óptica',    color: '#0ea5e9', icon: '🔆' },
];

// ── Estados de activos ────────────────────────────────────────────────────────
export const ESTADOS_ACTIVO = [
  { value: 'Activo',       label: 'Activo',          color: '#22c55e', descripcion: 'En operación normal' },
  { value: 'Inactivo',     label: 'Inactivo',        color: '#94a3b8', descripcion: 'Instalado pero sin uso' },
  { value: 'Mantenimiento',label: 'Mantenimiento',   color: '#f59e0b', descripcion: 'En proceso de mantenimiento' },
  { value: 'Falla',        label: 'Falla',           color: '#ef4444', descripcion: 'Con falla reportada' },
  { value: 'Baja',         label: 'Baja',            color: '#6b7280', descripcion: 'Dado de baja / retirado' },
  { value: 'Reserva',      label: 'Reserva',         color: '#8b5cf6', descripcion: 'En almacén como repuesto' },
  { value: 'Planeado',     label: 'Planeado',        color: '#3b82f6', descripcion: 'En proceso de instalación' },
];

// ── Niveles MICE ──────────────────────────────────────────────────────────────
export const NIVELES_MICE = [
  { value: 'Bajo',  label: 'Bajo (M1/I1/C1/E1)',  color: '#22c55e', descripcion: 'Entornos de oficina estándar. Temperatura 18–27°C, humedad 30–55%.' },
  { value: 'Medio', label: 'Medio (M2/I2/C2/E2)', color: '#f59e0b', descripcion: 'Entornos industriales ligeros. Temperatura 5–40°C, vibración moderada.' },
  { value: 'Alto',  label: 'Alto (M3/I3/C3/E3)',  color: '#ef4444', descripcion: 'Entornos industriales severos. Temperatura -5–55°C, polvo, vibración alta.' },
];

// ── Tipos de MDF/IDF ──────────────────────────────────────────────────────────
export const TIPOS_MDF_IDF = [
  { value: 'MDF',  label: 'MDF — Main Distribution Frame',         descripcion: 'Cuarto principal de telecomunicaciones. Punto central de la red.' },
  { value: 'IDF',  label: 'IDF — Intermediate Distribution Frame', descripcion: 'Cuarto secundario. Distribuye a zonas de trabajo.' },
  { value: 'TR',   label: 'TR — Telecommunications Room',          descripcion: 'Cuarto de telecomunicaciones según TIA-569.' },
  { value: 'ER',   label: 'ER — Equipment Room',                   descripcion: 'Sala de equipos centralizada.' },
  { value: 'DC',   label: 'DC — Data Center',                      descripcion: 'Centro de datos dedicado.' },
  { value: 'EF',   label: 'EF — Entrance Facility',                descripcion: 'Punto de entrada de servicios externos.' },
  { value: 'WLAN', label: 'WLAN — Wireless LAN Controller',        descripcion: 'Punto de distribución inalámbrica.' },
];

// ── Tipos de rack ─────────────────────────────────────────────────────────────
export const TIPOS_RACK = [
  { value: 'Open Frame',   label: 'Open Frame',       descripcion: 'Marco abierto 2 postes. Fácil acceso.' },
  { value: 'Cerrado 2P',   label: 'Cerrado 2 postes', descripcion: 'Gabinete cerrado 2 postes. Seguridad básica.' },
  { value: 'Cerrado 4P',   label: 'Cerrado 4 postes', descripcion: 'Gabinete cerrado 4 postes. Máxima rigidez.' },
  { value: 'Wall Mount',   label: 'Wall Mount',        descripcion: 'Montado en pared. Para espacios reducidos.' },
  { value: 'Floor Stand',  label: 'Floor Stand',       descripcion: 'Pedestal de piso. Para equipos pesados.' },
  { value: 'Micro DC',     label: 'Micro Data Center', descripcion: 'Gabinete autónomo con climatización integrada.' },
  { value: 'Blade',        label: 'Blade Chassis',     descripcion: 'Chasis para servidores blade.' },
];

// ── Alturas de rack (U) ───────────────────────────────────────────────────────
export const ALTURAS_RACK_U = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 27, 30, 32, 36, 40, 42, 45, 48];

// ── Tipos de patch cord ───────────────────────────────────────────────────────
export const LONGITUDES_PATCHCORD = [
  '1 Pie', '2 Pies', '3 Pies', '5 Pies', '7 Pies',
  '10 Pies', '14 Pies', '15 Pies', '20 Pies', '25 Pies', '30 Pies',
];

// ── Colores estándar TIA-606 ──────────────────────────────────────────────────
export const COLORES_CABLE = [
  { value: 'Azul',     label: 'Azul',     hex: '#3b82f6', uso: 'Datos / Horizontal' },
  { value: 'Rojo',     label: 'Rojo',     hex: '#ef4444', uso: 'Datos críticos / Fibra' },
  { value: 'Verde',    label: 'Verde',    hex: '#22c55e', uso: 'Voz' },
  { value: 'Amarillo', label: 'Amarillo', hex: '#eab308', uso: 'Backbone / Fibra OM' },
  { value: 'Naranja',  label: 'Naranja',  hex: '#f97316', uso: 'Fibra OM1/OM2' },
  { value: 'Aqua',     label: 'Aqua',     hex: '#06b6d4', uso: 'Fibra OM3/OM4' },
  { value: 'Gris',     label: 'Gris',     hex: '#94a3b8', uso: 'Gestión / OOB' },
  { value: 'Blanco',   label: 'Blanco',   hex: '#f8fafc', uso: 'Backbone UTP' },
  { value: 'Negro',    label: 'Negro',    hex: '#1e293b', uso: 'Cableado externo' },
  { value: 'Morado',   label: 'Morado',   hex: '#8b5cf6', uso: 'Fibra OS1/OS2' },
  { value: 'Rosa',     label: 'Rosa',     hex: '#ec4899', uso: 'Reservado' },
  { value: 'Café',     label: 'Café',     hex: '#92400e', uso: 'Backbone coaxial' },
];

// ── Normas aplicables ─────────────────────────────────────────────────────────
export const NORMAS = [
  { value: 'TIA-568.2-D',   label: 'TIA-568.2-D',   descripcion: 'Cableado de par trenzado balanceado para telecomunicaciones' },
  { value: 'TIA-568.3-D',   label: 'TIA-568.3-D',   descripcion: 'Cableado de fibra óptica' },
  { value: 'TIA-569-D',     label: 'TIA-569-D',      descripcion: 'Espacios y trayectorias de telecomunicaciones' },
  { value: 'TIA-606-C',     label: 'TIA-606-C',      descripcion: 'Administración de infraestructura de telecomunicaciones' },
  { value: 'TIA-607-C',     label: 'TIA-607-C',      descripcion: 'Sistemas de tierra y unión para telecomunicaciones' },
  { value: 'TIA-942-B',     label: 'TIA-942-B',      descripcion: 'Estándar de infraestructura de centros de datos' },
  { value: 'ISO/IEC 11801', label: 'ISO/IEC 11801',  descripcion: 'Cableado genérico para edificios de clientes' },
  { value: 'ISO/IEC 24764', label: 'ISO/IEC 24764',  descripcion: 'Cableado genérico para centros de datos' },
  { value: 'ANSI/BICSI 002', label: 'ANSI/BICSI 002', descripcion: 'Estándar de diseño de centros de datos' },
  { value: 'ICREA Std-131', label: 'ICREA Std-131',  descripcion: 'Estándar de centros de datos ICREA (México/LATAM)' },
  { value: 'NOM-001-SEDE',  label: 'NOM-001-SEDE',   descripcion: 'Instalaciones eléctricas (México)' },
  { value: 'NEC 2023',      label: 'NEC 2023',        descripcion: 'National Electrical Code' },
  { value: 'EN 50173',      label: 'EN 50173',        descripcion: 'Sistemas de cableado genérico (Europa)' },
];

// ── Tipos de certificación ────────────────────────────────────────────────────
export const TIPOS_CERTIFICACION = [
  { value: 'Fluke DSX',     label: 'Fluke DSX-5000/8000', descripcion: 'Certificador de canal y enlace permanente. Estándar de la industria.' },
  { value: 'Fluke Versiv',  label: 'Fluke Versiv',         descripcion: 'Plataforma modular Fluke para cobre y fibra.' },
  { value: 'IDEAL R8000',   label: 'IDEAL R8000',           descripcion: 'Certificador de cableado de cobre y fibra.' },
  { value: 'Panduit PanTalk', label: 'Panduit PanTalk',    descripcion: 'Certificador de cableado Panduit.' },
  { value: 'Softing CableMaster', label: 'Softing CableMaster', descripcion: 'Certificador de cableado estructurado.' },
  { value: 'OTDR',          label: 'OTDR (Fibra)',          descripcion: 'Optical Time Domain Reflectometer para fibra óptica.' },
  { value: 'OLTS',          label: 'OLTS (Fibra)',          descripcion: 'Optical Loss Test Set. Mide pérdida de inserción en fibra.' },
  { value: 'Visual Fault',  label: 'Visual Fault Locator',  descripcion: 'Localizador de fallas en fibra óptica.' },
  { value: 'Manual',        label: 'Verificación manual',   descripcion: 'Inspección visual y prueba de continuidad básica.' },
];

// ── Gamas de producto ─────────────────────────────────────────────────────────
export const GAMAS_PANDUIT = ['PanNET', 'PanZone', 'Mini-Com', 'NetKey', 'Keystone', 'Otro'];
export const GAMAS_BELDEN  = ['REVConnect', 'DataTwist', 'Brilliance', 'Otro'];
export const GAMAS_COMMSCOPE = ['KeyConnect', 'GigaSPEED', 'NetConnect', 'Otro'];
export const GAMAS_LEVITON = ['eXtreme', 'Atlas-X1', 'QuickPort', 'Otro'];
export const GAMAS_SIEMON  = ['Z-MAX', 'TERA', 'MAX', 'Otro'];

// ── Integradores / Contratistas ───────────────────────────────────────────────
export const INTEGRADORES = [
  'Bajanet', 'Telmex', 'Axtel', 'Foundation Corp', 'Cablemas',
  'Telcel Empresas', 'AT&T México', 'Megacable Empresarial',
  'Siemens México', 'Honeywell México', 'Johnson Controls',
  'Grupo Dicas', 'Syscom', 'Ingram Micro', 'Scansource',
  'Otro',
];

// ── Áreas / Zonas comunes ─────────────────────────────────────────────────────
export const AREAS_COMUNES = [
  'Sala de Servidores', 'Data Center', 'MDF', 'IDF',
  'Oficinas Generales', 'Sala de Juntas', 'Recepción',
  'Lobby', 'Producción', 'Almacén', 'Bodega',
  'Cafetería', 'Comedor', 'Baños', 'Pasillos',
  'Estacionamiento', 'Azotea', 'Cuarto Eléctrico',
  'Sala de Control', 'Laboratorio', 'Sala de Capacitación',
  'Gerencia', 'Dirección', 'Recursos Humanos',
  'Contabilidad', 'Ventas', 'Soporte Técnico', 'Otro',
];

// ── Años de instalación ───────────────────────────────────────────────────────
export const ANIOS_INSTALACION = Array.from({ length: 20 }, (_, i) => 2006 + i);

// ── Longitudes de cable ───────────────────────────────────────────────────────
export const LONGITUDES_CABLE = [
  '5 mts', '10 mts', '15 mts', '20 mts', '25 mts', '30 mts',
  '35 mts', '40 mts', '45 mts', '50 mts', '55 mts', '60 mts',
  '70 mts', '80 mts', '90 mts', '90+ mts',
];

// ── Tipos de conector ─────────────────────────────────────────────────────────
export const TIPOS_CONECTOR = [
  'RJ45 T568A', 'RJ45 T568B', 'LC Dúplex', 'SC Dúplex',
  'ST', 'MPO/MTP 12F', 'MPO/MTP 24F', 'E2000', 'FC', 'Otro',
];

// ── Responsables / Roles ──────────────────────────────────────────────────────
export const ROLES_RESPONSABLE = [
  'Administrador de Red', 'Ingeniero de Infraestructura',
  'Técnico de Cableado', 'Supervisor de TI',
  'Gerente de TI', 'Director de Tecnología (CTO)',
  'Contratista Externo', 'Integrador', 'Otro',
];

// ── Objeto CATALOGOS (acceso unificado) ───────────────────────────────────────
export const CATALOGOS = {
  marcas:            MARCAS_CABLE,
  marcasActivos:     MARCAS_ACTIVOS,
  categorias:        CATEGORIAS_CABLE,
  clasificaciones:   CLASIFICACIONES_CABLE,
  tiposServicio:     TIPOS_SERVICIO,
  estados:           ESTADOS_ACTIVO,
  nivelesMice:       NIVELES_MICE,
  tiposMdfIdf:       TIPOS_MDF_IDF,
  tiposRack:         TIPOS_RACK,
  alturasRack:       ALTURAS_RACK_U,
  longitudes:        LONGITUDES_PATCHCORD,
  colores:           COLORES_CABLE,
  normas:            NORMAS,
  tiposCertificacion: TIPOS_CERTIFICACION,
  gamasPanduit:      GAMAS_PANDUIT,
  gamasBelden:       GAMAS_BELDEN,
  gamasCommscope:    GAMAS_COMMSCOPE,
  gamasLeviton:      GAMAS_LEVITON,
  gamasSimeon:       GAMAS_SIEMON,
  integradores:      INTEGRADORES,
  areas:             AREAS_COMUNES,
  anios:             ANIOS_INSTALACION,
  longitudesCable:   LONGITUDES_CABLE,
  tiposConector:     TIPOS_CONECTOR,
  roles:             ROLES_RESPONSABLE,
};
