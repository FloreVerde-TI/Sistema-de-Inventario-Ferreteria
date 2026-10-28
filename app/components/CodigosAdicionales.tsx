"use client";

import React, { useEffect, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { registrarActividad } from '@/lib/actividad';

type Codigo = { id: string; codigo: string };

// Mensaje claro cuando el código ya existe
function mensaje(e: { message: string; code?: string }): string {
  if (e.code === '23505') return 'Ese código ya está registrado en otro producto.';
  return e.message.replace('CODIGO_DUPLICADO: ', '');
}

/** Códigos de barras ADICIONALES de un producto (se guardan al instante). */
export default function CodigosAdicionales({
  productoId,
  nombreProducto,
  codigoPrincipal,
}: {
  productoId: string;
  nombreProducto: string;
  codigoPrincipal: string;
}) {
  const [codigos, setCodigos] = useState<Codigo[]>([]);
  const [nuevo, setNuevo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from('codigos_barras')
      .select('id, codigo')
      .eq('producto_id', productoId)
      .order('created_at')
      .then(({ data }) => {
        if (!cancelado) setCodigos((data ?? []) as Codigo[]);
      });
    return () => {
      cancelado = true;
    };
  }, [productoId]);

  async function agregar() {
    const codigo = nuevo.trim();
    setError(null);
    if (!codigo) return;
    if (codigo === codigoPrincipal.trim()) return setError('Ese ya es el código principal de este producto.');
    if (codigos.some((c) => c.codigo === codigo)) return setError('Ese código ya está en la lista.');

    setOcupado(true);
    // ¿Es el código principal de otro producto?
    const { data: dup } = await supabase.from('productos').select('nombre').eq('codigo_barras', codigo).limit(1);
    if (dup && dup.length > 0) {
      setError(`Ese código ya es el principal de "${dup[0].nombre}".`);
      setOcupado(false);
      return;
    }
    const { data, error: e } = await supabase
      .from('codigos_barras')
      .insert({ producto_id: productoId, codigo })
      .select('id, codigo')
      .single();
    setOcupado(false);
    if (e) return setError(mensaje(e));
    setCodigos((prev) => [...prev, data as Codigo]);
    setNuevo('');
    await registrarActividad({
      accion: 'editar',
      entidad: 'producto',
      entidad_id: productoId,
      detalle: `Agregó el código de barras ${codigo} a "${nombreProducto}"`,
    });
  }

  async function quitar(c: Codigo) {
    setError(null);
    const { error: e } = await supabase.from('codigos_barras').delete().eq('id', c.id);
    if (e) return setError(e.message);
    setCodigos((prev) => prev.filter((x) => x.id !== c.id));
    await registrarActividad({
      accion: 'editar',
      entidad: 'producto',
      entidad_id: productoId,
      detalle: `Quitó el código de barras ${c.codigo} de "${nombreProducto}"`,
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            // Enter agrega (útil con lector de códigos) sin guardar todo el formulario
            if (e.key === 'Enter') {
              e.preventDefault();
              agregar();
            }
          }}
          placeholder="Escanea o escribe otro código y presiona Enter"
        />
        <button
          type="button"
          onClick={agregar}
          disabled={ocupado || !nuevo.trim()}
          className="px-3 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-1 disabled:opacity-50 shrink-0"
        >
          {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Agregar
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {codigos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {codigos.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium bg-primary-soft text-primary-ink"
            >
              {c.codigo}
              <button type="button" onClick={() => quitar(c)} title="Quitar" className="p-0.5 rounded-full hover:bg-black/10">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-muted">Sin códigos adicionales. Útil si el mismo producto llega con distintos empaques o marcas.</p>
      )}
    </div>
  );
}
