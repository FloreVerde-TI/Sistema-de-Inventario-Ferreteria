"use client";

import React, { useRef, useState } from 'react';
import { Upload, Loader2, Camera } from 'lucide-react';
import { subirImagen, type CarpetaImagen } from '@/lib/imagenes';

/** Botones "Tomar foto" (abre la cámara en el celular) y "Subir imagen" (galería o archivo):
 *  comprime la imagen, la sube y devuelve el enlace. */
export default function SubirImagen({
  carpeta,
  onSubida,
  texto = 'Subir imagen',
  conCamara = true,
}: {
  carpeta: CarpetaImagen;
  onSubida: (url: string) => void;
  texto?: string;
  /** false = solo "Subir imagen" (p. ej. el logo de la empresa) */
  conCamara?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite elegir el mismo archivo otra vez
    if (!file) return;
    setError(null);
    setSubiendo(true);
    try {
      onSubida(await subirImagen(file, carpeta));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={elegir} />
      {/* En el celular abre directo la cámara trasera; en la compu abre la selección de archivos */}
      <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegir} />
      <div className="flex gap-2">
        {conCamara && (
          <button
            type="button"
            disabled={subiendo}
            onClick={() => camaraRef.current?.click()}
            className="flex-1 px-3 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Camera size={16} /> Tomar foto
          </button>
        )}
        <button
          type="button"
          disabled={subiendo}
          onClick={() => inputRef.current?.click()}
          className="flex-1 px-3 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {subiendo ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {subiendo ? 'Subiendo...' : texto}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
