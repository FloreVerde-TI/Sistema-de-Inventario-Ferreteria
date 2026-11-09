'use client';

import React, { useMemo, useState } from 'react';
import { LayoutGrid, Check, X } from 'lucide-react';
import { todasLasPlantillas, grupoDeCategoria } from '@/lib/plantillas';

/**
 * Botón "Elegir una plantilla": muestra SOLO los iconos de plantilla.
 * Los de la categoría del producto salen primero.
 */
export default function ElegirPlantilla({
  categoria,
  actual,
  onElegir,
}: {
  categoria: string | null | undefined;
  actual: string;
  onElegir: (url: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const sugerido = grupoDeCategoria(categoria);

  const plantillas = useMemo(() => {
    const todas = todasLasPlantillas();
    if (!sugerido) return todas;
    return [...todas.filter((p) => p.grupo.prefijo === sugerido.prefijo), ...todas.filter((p) => p.grupo.prefijo !== sugerido.prefijo)];
  }, [sugerido]);

  // Agrupadas por categoría, cada grupo con su título
  const grupos = useMemo(() => {
    const out: { grupo: (typeof plantillas)[number]['grupo']; items: typeof plantillas }[] = [];
    for (const p of plantillas) {
      const ultimo = out[out.length - 1];
      if (ultimo && ultimo.grupo.prefijo === p.grupo.prefijo) ultimo.items.push(p);
      else out.push({ grupo: p.grupo, items: [p] });
    }
    return out;
  }, [plantillas]);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full px-3 py-2 text-sm font-medium border border-border rounded-lg bg-surface hover:bg-bg transition-colors flex items-center justify-center gap-2"
      >
        {abierto ? <X size={16} /> : <LayoutGrid size={16} />}
        {abierto ? 'Cerrar plantillas' : 'Elegir una plantilla'}
      </button>

      {abierto && (
        <div className="mt-2 border border-border rounded-lg p-2 bg-bg">
          <p className="text-xs text-text-muted px-1 pb-2">
            {sugerido ? `Primero las de ${sugerido.nombre.toLowerCase()}.` : 'Elige el icono que mejor represente al producto.'}
          </p>
          <div className="max-h-72 overflow-y-auto pr-1 space-y-3">
            {grupos.map(({ grupo, items }) => (
              <div key={grupo.prefijo}>
                <p className="sticky top-0 z-10 bg-bg py-1 text-[11px] font-semibold uppercase tracking-wide text-text-soft">
                  {grupo.nombre}
                  {sugerido?.prefijo === grupo.prefijo && <span className="ml-1 normal-case text-primary">· sugeridas</span>}
                </p>
                <div className="grid grid-cols-4 gap-2">
            {items.map((p) => {
              const elegido = actual === p.url;
              return (
                <button
                  key={p.codigo}
                  type="button"
                  title={`${p.grupo.nombre} ${p.codigo.slice(-1)}`}
                  aria-label={`Plantilla ${p.codigo.slice(-1)} de ${p.grupo.nombre}`}
                  onClick={() => {
                    onElegir(p.url);
                    setAbierto(false);
                  }}
                  className={`relative aspect-square rounded-md overflow-hidden border-2 transition-colors ${
                    elegido ? 'border-primary' : 'border-transparent hover:border-border'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  {elegido && (
                    <span className="absolute top-1 right-1 bg-primary text-white rounded-full p-0.5">
                      <Check size={12} />
                    </span>
                  )}
                </button>
              );
            })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
