import { supabase } from '@/lib/supabase';

// =====================================================================
// PROMOCIONES (descuentos y ofertas) Y PAQUETES
// El precio normal del producto NO se cambia: la promoción se guarda aparte
// y la base calcula el precio final (funciones promo_de_producto y
// promos_vigentes, script 22). Aquí solo se repite el cálculo para las
// vistas previas.
// =====================================================================

export type TipoPromo = 'descuento' | 'oferta';
export type AlcancePromo = 'producto' | 'categoria' | 'proveedor' | 'todos';

export interface Promocion {
  id: string;
  tipo: TipoPromo;
  alcance: AlcancePromo;
  producto_id: string | null;
  categoria_id: string | null;
  proveedor_id: string | null;
  porcentaje: number | null;
  precio_oferta: number | null;
  redondeo: number;
  sello_texto: string | null;
  inicia: string;
  termina: string | null;
  activa: boolean;
  creado_por: string | null;
  created_at: string;
}

/** Promoción vigente de un producto (lo que devuelve promos_vigentes). */
export interface PromoVigente {
  producto_id: string;
  promocion_id: string;
  tipo: TipoPromo;
  porcentaje: number | null;
  precio_normal: number;
  precio_final: number;
  sello_texto: string | null;
  termina: string | null;
}

export const REDONDEOS = [
  { value: 0, label: 'Sin redondeo' },
  { value: 5, label: 'Al ₡5 más cercano' },
  { value: 10, label: 'Al ₡10 más cercano' },
  { value: 25, label: 'Al ₡25 más cercano' },
  { value: 50, label: 'Al ₡50 más cercano' },
  { value: 100, label: 'Al ₡100 más cercano' },
];

/** Precio con descuento (mismo cálculo que la base). */
export function precioConDescuento(precio: number, porcentaje: number, redondeo = 0): number {
  const bruto = precio * (1 - porcentaje / 100);
  return redondeo > 0 ? Math.round(bruto / redondeo) * redondeo : Math.round(bruto);
}

/** Cuánto baja: monto y porcentaje respecto al precio normal. */
export function rebaja(normal: number, final: number): { monto: number; pct: number } {
  if (!normal || normal <= 0) return { monto: 0, pct: 0 };
  const monto = normal - final;
  return { monto, pct: Math.round((monto / normal) * 1000) / 10 };
}

/** Todas las promociones vigentes de la ferretería actual, por producto. */
export async function cargarPromosVigentes(): Promise<Map<string, PromoVigente>> {
  const { data, error } = await supabase.rpc('promos_vigentes');
  const mapa = new Map<string, PromoVigente>();
  if (error) {
    console.error('No se pudieron cargar las promociones:', error.message);
    return mapa;
  }
  for (const p of (data ?? []) as PromoVigente[]) {
    mapa.set(p.producto_id, { ...p, precio_normal: Number(p.precio_normal), precio_final: Number(p.precio_final) });
  }
  return mapa;
}

/** Etiqueta corta para la lista de productos. */
export function etiquetaPromo(p: Pick<PromoVigente, 'tipo' | 'porcentaje'>): string {
  return p.tipo === 'oferta' ? 'OFERTA' : `DESCUENTO ${Number(p.porcentaje)}%`;
}

/** "2026-11-09" → inicio de ese día en hora local (ISO). */
export function inicioDelDia(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a, m - 1, d).toISOString();
}

/** "2026-11-30" → la promoción dura TODO ese día (termina a las 00:00 del siguiente). */
export function finDelDia(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a, m - 1, d + 1).toISOString();
}

/** ISO → "2026-11-09" en hora local (para los campos de fecha). */
export function aCampoFecha(iso: string | null | undefined, esFin = false): string {
  if (!iso) return '';
  const f = new Date(iso);
  if (esFin) f.setDate(f.getDate() - 1); // se guardó como el día siguiente a las 00:00
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const dd = String(f.getDate()).padStart(2, '0');
  return `${f.getFullYear()}-${mm}-${dd}`;
}

export function hoyCampoFecha(): string {
  return aCampoFecha(new Date().toISOString());
}

/**
 * Reparte el precio de UN paquete entre sus productos según el precio normal
 * de cada uno (igual que la base al crear el pedido). Devuelve el monto de cada línea.
 */
export function repartirPaquete(
  precioPaquete: number,
  items: { precio: number; cantidad: number; regalia?: boolean }[]
): number[] {
  // Las regalías van en ₡0: el precio se reparte solo entre los que se cobran
  const cobrados = items.filter((i) => !i.regalia);
  const suma = cobrados.reduce((s, i) => s + i.precio * i.cantidad, 0);
  let resto = precioPaquete;
  let vistos = 0;
  return items.map((i) => {
    if (i.regalia) return 0;
    vistos++;
    if (vistos === cobrados.length) return Math.round(resto * 100) / 100;
    const parte =
      suma > 0
        ? Math.round(((precioPaquete * i.precio * i.cantidad) / suma) * 100) / 100
        : Math.round((precioPaquete / cobrados.length) * 100) / 100;
    resto -= parte;
    return parte;
  });
}

export const formatoColones = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
