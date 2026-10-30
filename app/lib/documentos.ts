import { supabase } from '@/lib/supabase';

// Fotos o PDF de facturas/comprobantes de cada movimiento.
// Bucket PRIVADO "documentos": solo el personal con sesión puede verlos,
// y se abren con un enlace temporal (no hay enlace público).
const BUCKET = 'documentos';
const MAX_LADO = 1800; // px: suficiente para leer una factura
const CALIDAD = 0.8;
const MAX_MB = 5;

export const TIPOS_DOCUMENTO = 'image/*,application/pdf';

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
  const aBlob = (tipo: string) => new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), tipo, CALIDAD));
  const webp = await aBlob('image/webp');
  if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp', tipo: 'image/webp' };
  const jpg = await aBlob('image/jpeg');
  if (!jpg) throw new Error('No se pudo comprimir la imagen.');
  return { blob: jpg, ext: 'jpg', tipo: 'image/jpeg' };
}

/** Revisa el archivo antes de guardar. Devuelve el error en texto, o null si está bien. */
export function validarDocumento(file: File): string | null {
  const esPdf = file.type === 'application/pdf';
  if (!esPdf && !file.type.startsWith('image/')) return 'Solo se aceptan fotos o PDF.';
  if (esPdf && file.size > MAX_MB * 1024 * 1024) return `El PDF pesa más de ${MAX_MB} MB.`;
  if (!esPdf && file.size > 20 * 1024 * 1024) return 'La foto pesa más de 20 MB.';
  return null;
}

/** Sube la foto (comprimida) o el PDF. Devuelve la ruta interna para guardar en el movimiento. */
export async function subirDocumento(file: File, tipo: 'entrada' | 'salida'): Promise<string> {
  const error = validarDocumento(file);
  if (error) throw new Error(error);
  const esPdf = file.type === 'application/pdf';
  const { blob, ext, tipo: contentType } = esPdf
    ? { blob: file as Blob, ext: 'pdf', tipo: 'application/pdf' }
    : await comprimir(file);
  const hoy = new Date();
  const ruta = `${tipo}s/${hoy.getFullYear()}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(ruta, blob, { contentType, upsert: false });
  if (upErr) throw new Error(`No se pudo subir el documento: ${upErr.message}`);
  return ruta;
}

/** Abre el documento en otra pestaña con un enlace que vence en 5 minutos. */
export async function abrirDocumento(ruta: string): Promise<void> {
  // La pestaña se abre antes de esperar (si no, el navegador la bloquea como ventana emergente)
  const ventana = window.open('', '_blank');
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 300);
  if (error || !data) {
    ventana?.close();
    throw new Error('No se pudo abrir el documento.');
  }
  if (ventana) ventana.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}
