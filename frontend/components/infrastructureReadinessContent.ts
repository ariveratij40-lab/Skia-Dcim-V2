import type { InfrastructureReadinessStep, ReadinessActionTarget } from '../hooks/useInfrastructureReadiness';

export const READINESS_ACTION_LABELS: Record<ReadinessActionTarget, string> = {
  site_create: 'Crear Sitio',
  internal_area_create: 'Crear Área',
  mdf_create: 'Crear MDF',
  idf_create: 'Crear IDF',
  nomenclature_configure: 'Configurar nomenclatura',
  rack_create: 'Ir a Racks',
};

export function readinessActionPath(target: ReadinessActionTarget): string {
  if (target === 'rack_create') return '/infraestructura/racks';
  if (target === 'nomenclature_configure') return '/infraestructura/catalogs/nomenclaturas?from=readiness';
  if (target === 'idf_create') return '/infraestructura/mdf-idf?create=IDF&from=readiness';
  return '/infraestructura/mdf-idf?create=MDF&from=readiness';
}

export interface ReadinessHelp {
  what: string;
  interpretation: string;
  purpose: string;
}

export const READINESS_HELP: Record<InfrastructureReadinessStep['key'], ReadinessHelp> = {
  branch: {
    what: 'Es la unidad operativa desde la que trabaja el usuario.',
    interpretation: 'La sucursal activa pertenece al contexto autorizado de la sesión.',
    purpose: 'Separa correctamente la infraestructura administrada por sucursal.',
  },
  site: {
    what: 'Es el inmueble o instalación física: edificio, planta, oficina o campus individual.',
    interpretation: 'SKIA usa buildings como autoridad canónica de Sitio.',
    purpose: 'Ubica físicamente la infraestructura sin crear un segundo nivel Site/Building.',
  },
  internal_area: {
    what: 'Es una ubicación específica dentro del Sitio, como Producción, Oficinas o Site TI.',
    interpretation: 'SKIA vincula el Área interna con un Sitio activo de la sucursal.',
    purpose: 'Aporta contexto físico más preciso para MDF e IDF.',
  },
  nomenclature: {
    what: 'Define la estructura con la que SKIA identifica consistentemente los activos.',
    interpretation: 'SKIA lee reglas activas por tenant y tipo de activo; el preview no reserva un número.',
    purpose: 'Genera códigos técnicos consistentes. El consecutivo definitivo se reserva al guardar.',
  },
  mdf_idf: {
    what: 'MDF es Main Distribution Frame; IDF es Intermediate Distribution Frame.',
    interpretation: 'SKIA los registra como puntos físicos de distribución dentro de Sitio y Área.',
    purpose: 'Organizan racks y otros componentes asociados.',
  },
  rack: {
    what: 'Es el gabinete o bastidor donde se instalan equipos y componentes.',
    interpretation: 'SKIA lo relaciona con un MDF/IDF cuando la modalidad física lo requiere.',
    purpose: 'Permite organizar físicamente equipos; por eso continúa siendo opcional.',
  },
};

export const READINESS_LEGEND = [
  ['Obligatorio', 'Necesario para completar la estructura base.'],
  ['Opcional', 'Depende del tipo o modalidad de infraestructura.'],
  ['Configurado', 'SKIA encontró configuración válida en su autoridad canónica.'],
  ['Bloqueado', 'Falta completar una dependencia anterior.'],
] as const;
