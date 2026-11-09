// =====================================================================
// TARJETAS POR PROMOCIONES (los sellos con picos de la página web)
// Se guardan en settings.sellos_promo (una fila por ferretería) y la web
// los lee con la función sellos_web(). Si algo falta, se usan los de aquí.
// La web tiene una copia de estos valores por defecto (lib/sellos.ts).
// =====================================================================

export type ClaveSello = 'ofertas' | 'descuentos' | 'paquetes' | 'nuevos' | 'de_vuelta';
export type Sello = { texto: string; color: string };
export type SellosPromo = Record<ClaveSello, Sello>;

export const NOMBRES_SELLO: Record<ClaveSello, string> = {
  ofertas: 'Ofertas',
  descuentos: 'Descuentos',
  paquetes: 'Paquetes',
  nuevos: 'Recién ingresados',
  de_vuelta: 'De vuelta en inventario',
};

export const SELLOS_BASE: SellosPromo = {
  ofertas: { texto: 'OFERTAS', color: '#dc2626' },
  descuentos: { texto: 'DESCUENTOS', color: '#dc2626' },
  paquetes: { texto: 'PAQUETES', color: '#2563eb' },
  nuevos: { texto: 'NUEVOS', color: '#0e7490' },
  de_vuelta: { texto: 'DE VUELTA', color: '#16a34a' },
};

export type PlantillaSellos = { id: string; nombre: string; emoji: string; sellos: SellosPromo };

/** Plantillas listas (fechas festivas del inventario + campañas comunes). Al elegir una, se llenan los campos. */
export const PLANTILLAS_SELLOS: PlantillaSellos[] = [
  { id: 'normal', nombre: 'Normal', emoji: '🏷️', sellos: SELLOS_BASE },
  {
    id: 'navidad',
    nombre: 'Navidad',
    emoji: '🎄',
    sellos: {
      ofertas: { texto: 'OFERTAS NAVIDEÑAS', color: '#b91c1c' },
      descuentos: { texto: 'DESCUENTOS NAVIDEÑOS', color: '#b91c1c' },
      paquetes: { texto: 'COMBOS NAVIDEÑOS', color: '#15803d' },
      nuevos: { texto: 'NUEVOS', color: '#a16207' },
      de_vuelta: { texto: 'DE VUELTA', color: '#15803d' },
    },
  },
  {
    id: 'halloween',
    nombre: 'Halloween',
    emoji: '🎃',
    sellos: {
      ofertas: { texto: 'OFERTAS DE MIEDO', color: '#ea580c' },
      descuentos: { texto: 'DESCUENTOS DE MIEDO', color: '#ea580c' },
      paquetes: { texto: 'PAQUETES', color: '#7c3aed' },
      nuevos: { texto: 'NUEVOS', color: '#7c3aed' },
      de_vuelta: { texto: 'DE VUELTA', color: '#16a34a' },
    },
  },
  {
    id: 'independencia',
    nombre: 'Independencia',
    emoji: '🏮',
    sellos: {
      ofertas: { texto: 'OFERTAS PATRIAS', color: '#dc2626' },
      descuentos: { texto: 'DESCUENTOS PATRIOS', color: '#dc2626' },
      paquetes: { texto: 'PAQUETES', color: '#1d4ed8' },
      nuevos: { texto: 'NUEVOS', color: '#1d4ed8' },
      de_vuelta: { texto: 'DE VUELTA', color: '#16a34a' },
    },
  },
  {
    id: 'amor',
    nombre: 'Amor y Amistad',
    emoji: '💘',
    sellos: {
      ofertas: { texto: 'OFERTAS', color: '#db2777' },
      descuentos: { texto: 'DESCUENTOS', color: '#db2777' },
      paquetes: { texto: 'PAQUETES', color: '#be123c' },
      nuevos: { texto: 'NUEVOS', color: '#9d174d' },
      de_vuelta: { texto: 'DE VUELTA', color: '#16a34a' },
    },
  },
  {
    id: 'madre',
    nombre: 'Día de la Madre',
    emoji: '💐',
    sellos: {
      ofertas: { texto: 'OFERTAS PARA MAMÁ', color: '#c026d3' },
      descuentos: { texto: 'DESCUENTOS', color: '#c026d3' },
      paquetes: { texto: 'REGALOS PARA MAMÁ', color: '#2563eb' },
      nuevos: { texto: 'NUEVOS', color: '#7e22ce' },
      de_vuelta: { texto: 'DE VUELTA', color: '#16a34a' },
    },
  },
  {
    id: 'semanasanta',
    nombre: 'Semana Santa',
    emoji: '🕊️',
    sellos: {
      ofertas: { texto: 'OFERTAS', color: '#7c3aed' },
      descuentos: { texto: 'DESCUENTOS', color: '#7c3aed' },
      paquetes: { texto: 'PAQUETES', color: '#a16207' },
      nuevos: { texto: 'NUEVOS', color: '#a16207' },
      de_vuelta: { texto: 'DE VUELTA', color: '#16a34a' },
    },
  },
  {
    id: 'viernes_negro',
    nombre: 'Viernes Negro',
    emoji: '🖤',
    sellos: {
      ofertas: { texto: 'VIERNES NEGRO', color: '#111827' },
      descuentos: { texto: 'VIERNES NEGRO', color: '#111827' },
      paquetes: { texto: 'COMBOS VIERNES NEGRO', color: '#111827' },
      nuevos: { texto: 'NUEVOS', color: '#0e7490' },
      de_vuelta: { texto: 'DE VUELTA', color: '#16a34a' },
    },
  },
  {
    id: 'liquidacion',
    nombre: 'Liquidación',
    emoji: '📦',
    sellos: {
      ofertas: { texto: 'LIQUIDACIÓN', color: '#ea580c' },
      descuentos: { texto: 'LIQUIDACIÓN', color: '#ea580c' },
      paquetes: { texto: 'PAQUETES', color: '#2563eb' },
      nuevos: { texto: 'NUEVOS', color: '#0e7490' },
      de_vuelta: { texto: 'DE VUELTA', color: '#16a34a' },
    },
  },
];

/** Completa lo guardado con los valores por defecto. */
export function leerSellos(guardado: unknown): SellosPromo {
  const g = (guardado && typeof guardado === 'object' ? guardado : {}) as Partial<Record<ClaveSello, Partial<Sello>>>;
  const out = {} as SellosPromo;
  (Object.keys(SELLOS_BASE) as ClaveSello[]).forEach((k) => {
    out[k] = {
      texto: (g[k]?.texto || SELLOS_BASE[k].texto).toString().slice(0, 30),
      color: /^#[0-9a-f]{6}$/i.test(g[k]?.color ?? '') ? (g[k]!.color as string) : SELLOS_BASE[k].color,
    };
  });
  return out;
}
