"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { traerTodo } from '@/lib/paginar';

// Suma a cada producto sus códigos de barras adicionales y el nombre de su proveedor,
// para que el buscador también encuentre por esos datos.

type Base = { id: string; proveedor_id?: string | null };
type Extra = { codigos: string[]; proveedor: string | null };

export function useProductosBuscables<T extends Base>(productos: T[]): (T & Extra)[] {
  const [codigos, setCodigos] = useState<Map<string, string[]>>(new Map());
  const [proveedores, setProveedores] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let activo = true;
    (async () => {
      const [cod, prov] = await Promise.all([
        traerTodo<{ producto_id: string; codigo: string }>((a, b) =>
          supabase.from('codigos_barras').select('producto_id, codigo').order('id').range(a, b)
        ),
        supabase.from('proveedores').select('id, nombre'),
      ]);
      if (!activo) return;
      const mapa = new Map<string, string[]>();
      for (const c of cod.data ?? []) mapa.set(c.producto_id, [...(mapa.get(c.producto_id) ?? []), c.codigo]);
      setCodigos(mapa);
      setProveedores(new Map(((prov.data ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre])));
    })();
    return () => {
      activo = false;
    };
  }, []);

  return useMemo(
    () =>
      productos.map((p) => ({
        ...p,
        codigos: codigos.get(p.id) ?? [],
        proveedor: p.proveedor_id ? proveedores.get(p.proveedor_id) ?? null : null,
      })),
    [productos, codigos, proveedores]
  );
}
