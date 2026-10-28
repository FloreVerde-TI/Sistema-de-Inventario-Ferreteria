import { supabase } from '@/lib/supabase';

// Imágenes en Supabase Storage (bucket público "productos").
// Se comprimen en el navegador antes de subir para que pesen poco.
const BUCKET = 'productos';
const MAX_LADO = 1000; // px del lado más largo
const CALIDAD = 0.82;
const MAX_MB_ORIGINAL = 15;

export type CarpetaImagen = 'productos' | 'empresa';

async function comprimir(file: File): Promise<{ blob: Blob; ext: string; tipo: string }> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo procesar la imagen.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const aBlob = (tipo: string) =>
    new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), tipo, CALIDAD));
  const webp = await aBlob('image/webp');
  if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp', tipo: 'image/webp' };
  const jpg = await aBlob('image/jpeg');
  if (!jpg) throw new Error('No se pudo comprimir la imagen.');
  return { blob: jpg, ext: 'jpg', tipo: 'image/jpeg' };
}

/** Comprime y sube la imagen. Devuelve el enlace público. */
export async function subirImagen(file: File, carpeta: CarpetaImagen): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  if (file.size > MAX_MB_ORIGINAL * 1024 * 1024) throw new Error(`La imagen pesa más de ${MAX_MB_ORIGINAL} MB.`);

  const { blob, ext, tipo } = await comprimir(file);
  const nombre = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(nombre, blob, { contentType: tipo, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(nombre).data.publicUrl;
}

/** Si el enlace es de nuestro Storage, borra el archivo (para no acumular imágenes sin uso). */
export async function borrarImagenSiEsNuestra(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const marca = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marca);
  if (i === -1) return; // es un enlace externo: no se toca
  const ruta = decodeURIComponent(url.slice(i + marca.length).split('?')[0]);
  const { error } = await supabase.storage.from(BUCKET).remove([ruta]);
  if (error) console.error('No se pudo borrar la imagen anterior:', error.message);
}
