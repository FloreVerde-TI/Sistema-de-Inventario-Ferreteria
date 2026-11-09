import { supabase } from '@/lib/supabase';

// =====================================================================
// IMÁGENES DE PLANTILLA
// Iconos sencillos por categoría, ya subidos al Storage (bucket "productos")
// como productos/demo-FV-XX-NNN.webp. Varios productos pueden usar el mismo,
// por eso NUNCA se borran (ver borrarImagenSiEsNuestra en lib/imagenes.ts).
// =====================================================================

export type GrupoPlantilla = {
  prefijo: string;
  nombre: string;
  cantidad: number;
};

export const GRUPOS_PLANTILLA: GrupoPlantilla[] = [
  { prefijo: 'HE', nombre: 'Herramientas eléctricas', cantidad: 4 },
  { prefijo: 'HM', nombre: 'Herramientas manuales', cantidad: 6 },
  { prefijo: 'CO', nombre: 'Construcción', cantidad: 5 },
  { prefijo: 'EL', nombre: 'Electricidad', cantidad: 5 },
  { prefijo: 'PL', nombre: 'Plomería', cantidad: 5 },
  { prefijo: 'PI', nombre: 'Pintura', cantidad: 4 },
  { prefijo: 'TF', nombre: 'Tornillería y fijaciones', cantidad: 3 },
  { prefijo: 'SI', nombre: 'Seguridad', cantidad: 2 },
  { prefijo: 'JA', nombre: 'Jardín', cantidad: 1 },
];

export type Plantilla = { codigo: string; grupo: GrupoPlantilla; url: string };

const MARCA_PLANTILLA = '/demo-FV-';

function urlDe(codigo: string): string {
  return supabase.storage.from('productos').getPublicUrl(`productos/demo-${codigo}.webp`).data.publicUrl;
}

/** Las 35 plantillas, agrupadas en el orden de GRUPOS_PLANTILLA. */
export function todasLasPlantillas(): Plantilla[] {
  return GRUPOS_PLANTILLA.flatMap((grupo) =>
    Array.from({ length: grupo.cantidad }, (_, i) => {
      const codigo = `FV-${grupo.prefijo}-${String(i + 1).padStart(3, '0')}`;
      return { codigo, grupo, url: urlDe(codigo) };
    })
  );
}

/** ¿El enlace es una imagen de plantilla? */
export function esPlantilla(url: string | null | undefined): boolean {
  return !!url && url.includes(MARCA_PLANTILLA);
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Grupo de plantillas que corresponde a una categoría (por su nombre), o null. */
export function grupoDeCategoria(nombreCategoria: string | null | undefined): GrupoPlantilla | null {
  if (!nombreCategoria) return null;
  const n = normalizar(nombreCategoria);
  const grupo = (prefijo: string) => GRUPOS_PLANTILLA.find((g) => g.prefijo === prefijo) ?? null;

  if (n.includes('herramient') && n.includes('electr')) return grupo('HE');
  if (n.includes('herramient')) return grupo('HM');
  if (n.includes('electr') || n.includes('ilumin') || n.includes('cable')) return grupo('EL');
  if (n.includes('plomer') || n.includes('fontaner') || n.includes('tuber') || n.includes('sanitar')) return grupo('PL');
  if (n.includes('pintur')) return grupo('PI');
  if (n.includes('tornill') || n.includes('fijacion') || n.includes('clavo') || n.includes('perno')) return grupo('TF');
  if (n.includes('segur') || n.includes('proteccion')) return grupo('SI');
  if (n.includes('jardin')) return grupo('JA');
  if (n.includes('construc') || n.includes('cemento') || n.includes('obra')) return grupo('CO');
  return null;
}

/**
 * Imagen para un producto que se guarda SIN imagen:
 * - una plantilla al azar del grupo de su categoría;
 * - si no hay grupo (o no tiene categoría), el logo de la ferretería actual.
 */
export async function imagenPredeterminada(nombreCategoria: string | null | undefined): Promise<string | null> {
  return plantillaAlAzar(nombreCategoria) ?? (await logoDeLaTienda());
}

/** Plantilla al azar del grupo de la categoría, o null si la categoría no tiene grupo. */
export function plantillaAlAzar(nombreCategoria: string | null | undefined): string | null {
  const grupo = grupoDeCategoria(nombreCategoria);
  if (!grupo) return null;
  const n = Math.floor(Math.random() * grupo.cantidad) + 1;
  return urlDe(`FV-${grupo.prefijo}-${String(n).padStart(3, '0')}`);
}

/** Logo de la ferretería actual (settings solo devuelve la fila de la tienda actual por RLS). */
export async function logoDeLaTienda(): Promise<string | null> {
  const { data } = await supabase.from('settings').select('logo_url').limit(1).maybeSingle();
  return (data as { logo_url: string | null } | null)?.logo_url || null;
}
