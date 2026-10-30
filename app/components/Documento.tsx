"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Camera, FileText, Paperclip, X, Loader2 } from 'lucide-react';
import { abrirDocumento, TIPOS_DOCUMENTO, validarDocumento } from '@/lib/documentos';

/**
 * Campo para adjuntar la foto o PDF de la factura/comprobante.
 * No sube nada: guarda el archivo elegido y la página lo sube al registrar.
 */
export function AdjuntarDocumento({
  archivo,
  onChange,
}: {
  archivo: File | null;
  onChange: (f: File | null) => void;
}) {
  const camara = useRef<HTMLInputElement>(null);
  const archivos = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Miniatura de la foto elegida
  useEffect(() => {
    if (!archivo || !archivo.type.startsWith('image/')) {
      setVista(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!f) return;
    const msg = validarDocumento(f);
    setError(msg);
    if (!msg) onChange(f);
  }

  const BTN =
    'px-3 py-2 text-xs font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-1.5';

  return (
    <div className="space-y-2">
      <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegir} />
      <input ref={archivos} type="file" accept={TIPOS_DOCUMENTO} className="hidden" onChange={elegir} />

      {archivo ? (
        <div className="flex items-center gap-3 p-2 border border-border rounded-lg bg-bg">
          {vista ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vista} alt="Documento" className="w-12 h-12 rounded object-cover border border-border" />
          ) : (
            <div className="w-12 h-12 rounded bg-danger-soft text-danger flex items-center justify-center">
              <FileText size={20} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text truncate">{archivo.name}</p>
            <p className="text-[11px] text-text-muted">
              {(archivo.size / 1024 / 1024).toFixed(1)} MB · se guarda al registrar
            </p>
          </div>
          <button type="button" title="Quitar" onClick={() => onChange(null)} className="p-1.5 rounded-lg text-text-soft hover:bg-surface">
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN} onClick={() => camara.current?.click()}>
            <Camera size={14} /> Tomar foto
          </button>
          <button type="button" className={BTN} onClick={() => archivos.current?.click()}>
            <Paperclip size={14} /> Elegir archivo (foto o PDF)
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Botón pequeño para abrir el documento guardado de un movimiento. */
export function VerDocumento({ ruta }: { ruta: string | null | undefined }) {
  const [abriendo, setAbriendo] = useState(false);
  if (!ruta) return null;
  const esPdf = ruta.endsWith('.pdf');
  return (
    <button
      type="button"
      title="Ver documento adjunto"
      disabled={abriendo}
      onClick={async () => {
        setAbriendo(true);
        try {
          await abrirDocumento(ruta);
        } catch (e) {
          alert(e instanceof Error ? e.message : 'No se pudo abrir el documento.');
        } finally {
          setAbriendo(false);
        }
      }}
      className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-info-soft text-info hover:opacity-80 transition-opacity disabled:opacity-50"
    >
      {abriendo ? <Loader2 size={11} className="animate-spin" /> : esPdf ? <FileText size={11} /> : <Camera size={11} />}
      Ver {esPdf ? 'PDF' : 'foto'}
    </button>
  );
}
