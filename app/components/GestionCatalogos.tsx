"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { traerTodo } from '@/lib/paginar';
import { registrarActividad } from '@/lib/actividad';
import { usePerfil } from '@/components/AdminLayout';
import { Tags, Truck, Trash2, Power, Loader2, X, Search, AlertTriangle } from 'lucide-react';

// =====================================================================
// CATÁLOGOS: categorías y proveedores
// - Con productos asociados: NO se borran, solo se deshabilitan
//   (dejan de ofrecerse al crear productos o registrar entradas).
// - Sin productos: se pueden borrar, marcando una casilla de confirmación.
// =====================================================================

type Tipo = 'categoria' | 'proveedor';
type Item = { id: string; nombre: string; habilitado: boolean };
type ProductoMini = { id: string; nombre: string; categoria_id: string | null; proveedor_id: string | null };

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all';

const CONF = {
  categoria: { tabla: 'categorias', columna: 'activa', fk: 'categoria_id', singular: 'categoría', titulo: 'Categorías', icon: Tags },
  proveedor: { tabla: 'proveedores', columna: 'activo', fk: 'proveedor_id', singular: 'proveedor', titulo: 'Proveedores', icon: Truck },
} as const;

export default function GestionCatalogos() {
  const { puede } = usePerfil();
  const [categorias, setCategorias] = useState<Item[]>([]);
  const [proveedores, setProveedores] = useState<Item[]>([]);
  const [productos, setProductos] = useState<ProductoMini[]>([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null);
  const [abierto, setAbierto] = useState<{ tipo: Tipo; item: Item } | null>(null);

  const cargar = useCallback(async () => {
    const [catRes, provRes, prodRes] = await Promise.all([
      supabase.from('categorias').select('id, nombre, activa').order('nombre'),
      supabase.from('proveedores').select('id, nombre, activo').order('nombre'),
      traerTodo<ProductoMini>((a, b) =>
        supabase.from('productos').select('id, nombre, categoria_id, proveedor_id').order('nombre').order('id').range(a, b)
      ),
    ]);
    const err = catRes.error ?? provRes.error ?? prodRes.error;
    if (err) setAviso({ tipo: 'error', texto: `No se pudieron cargar los catálogos: ${err.message}` });
    setCategorias((catRes.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, habilitado: c.activa !== false })));
    setProveedores((provRes.data ?? []).map((p) => ({ id: p.id, nombre: p.nombre, habilitado: p.activo !== false })));
    setProductos(prodRes.data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Productos asociados a cada categoría / proveedor
  const asociados = useMemo(() => {
    const cat = new Map<string, ProductoMini[]>();
    const prov = new Map<string, ProductoMini[]>();
    for (const p of productos) {
      if (p.categoria_id) cat.set(p.categoria_id, [...(cat.get(p.categoria_id) ?? []), p]);
      if (p.proveedor_id) prov.set(p.proveedor_id, [...(prov.get(p.proveedor_id) ?? []), p]);
    }
    return { categoria: cat, proveedor: prov };
  }, [productos]);

  // Volver a habilitar (directo, sin ventana)
  async function habilitar(tipo: Tipo, item: Item) {
    const c = CONF[tipo];
    const { data, error } = await supabase.from(c.tabla).update({ [c.columna]: true }).eq('id', item.id).select('id');
    if (error || !data || data.length === 0) {
      setAviso({ tipo: 'error', texto: error?.message ?? 'No tienes permiso para habilitarlo.' });
      return;
    }
    await registrarActividad({ accion: 'habilitar', entidad: tipo, entidad_id: item.id, detalle: `Habilitó ${tipo === 'categoria' ? 'la categoría' : 'el proveedor'} "${item.nombre}"` });
    setAviso({ tipo: 'exito', texto: `"${item.nombre}" vuelve a estar disponible.` });
    cargar();
  }

  if (!puede('productos_editar') && !puede('productos_eliminar')) return null;

  return (
    <div className="space-y-3">
      <div className="pt-2">
        <h3 className="text-sm font-semibold text-text">Catálogos de productos</h3>
        <p className="text-xs text-text-muted">
          Borra o deshabilita categorías y proveedores. Los que tienen productos no se borran: se deshabilitan.
        </p>
      </div>

      {aviso && (
        <div
          className={`rounded-lg p-3 text-sm flex items-start justify-between gap-3 border ${
            aviso.tipo === 'error' ? 'bg-danger-soft text-danger border-danger/30' : 'bg-success-soft text-success border-success/30'
          }`}
        >
          <span>{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(['categoria', 'proveedor'] as Tipo[]).map((tipo) => (
          <Lista
            key={tipo}
            tipo={tipo}
            items={tipo === 'categoria' ? categorias : proveedores}
            asociados={asociados[tipo]}
            cargando={cargando}
            onEliminar={(item) => {
              setAviso(null);
              setAbierto({ tipo, item });
            }}
            onHabilitar={(item) => habilitar(tipo, item)}
            puedeEditar={puede('productos_editar')}
          />
        ))}
      </div>

      {abierto && (
        <EliminarModal
          tipo={abierto.tipo}
          item={abierto.item}
          productos={asociados[abierto.tipo].get(abierto.item.id) ?? []}
          puedeBorrar={puede('productos_eliminar')}
          puedeDeshabilitar={puede('productos_editar')}
          onClose={() => setAbierto(null)}
          onListo={(texto) => {
            setAbierto(null);
            setAviso({ tipo: 'exito', texto });
            cargar();
          }}
        />
      )}
    </div>
  );
}

function Lista({
  tipo,
  items,
  asociados,
  cargando,
  onEliminar,
  onHabilitar,
  puedeEditar,
}: {
  tipo: Tipo;
  items: Item[];
  asociados: Map<string, ProductoMini[]>;
  cargando: boolean;
  onEliminar: (i: Item) => void;
  onHabilitar: (i: Item) => void;
  puedeEditar: boolean;
}) {
  const c = CONF[tipo];
  const Icon = c.icon;
  const [buscar, setBuscar] = useState('');
  const visibles = items.filter((i) => i.nombre.toLowerCase().includes(buscar.trim().toLowerCase()));

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 bg-primary-soft text-primary-ink rounded-lg flex items-center justify-center">
          <Icon size={18} />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-text text-sm">{c.titulo}</h4>
          <p className="text-xs text-text-muted">
            {items.length} en total · {items.filter((i) => !i.habilitado).length} deshabilitado(s)
          </p>
        </div>
      </div>
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className={`${FIELD} pl-9`}
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          // Está dentro del formulario de Configuración: Enter no debe guardarlo
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          placeholder={`Buscar ${c.singular}…`}
        />
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-border border border-border rounded-lg">
        {cargando ? (
          <p className="p-4 text-sm text-text-muted italic">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="p-4 text-sm text-text-muted italic">No hay resultados.</p>
        ) : (
          visibles.map((i) => {
            const n = asociados.get(i.id)?.length ?? 0;
            return (
              <div key={i.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${i.habilitado ? '' : 'bg-bg'}`}>
                <span className={`flex-1 truncate ${i.habilitado ? 'text-text' : 'text-text-muted line-through'}`}>{i.nombre}</span>
                <span className="text-[11px] text-text-muted whitespace-nowrap">{n} prod.</span>
                {i.habilitado ? (
                  <button type="button" title="Borrar o deshabilitar" onClick={() => onEliminar(i)} className="p-1.5 rounded-lg text-danger hover:bg-danger-soft">
                    <Trash2 size={15} />
                  </button>
                ) : (
                  puedeEditar && (
                    <button
                      type="button"
                      onClick={() => onHabilitar(i)}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold text-success hover:bg-success-soft flex items-center gap-1"
                    >
                      <Power size={12} /> Habilitar
                    </button>
                  )
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function EliminarModal({
  tipo,
  item,
  productos,
  puedeBorrar,
  puedeDeshabilitar,
  onClose,
  onListo,
}: {
  tipo: Tipo;
  item: Item;
  productos: ProductoMini[];
  puedeBorrar: boolean;
  puedeDeshabilitar: boolean;
  onClose: () => void;
  onListo: (texto: string) => void;
}) {
  const c = CONF[tipo];
  const art = tipo === 'categoria' ? 'la categoría' : 'el proveedor';
  const tieneProductos = productos.length > 0;
  const [confirmo, setConfirmo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deshabilitar() {
    setError(null);
    setOcupado(true);
    const { data, error: err } = await supabase.from(c.tabla).update({ [c.columna]: false }).eq('id', item.id).select('id');
    if (err || !data || data.length === 0) {
      setError(err?.message ?? 'No tienes permiso para deshabilitarlo.');
      setOcupado(false);
      return;
    }
    await registrarActividad({
      accion: 'deshabilitar',
      entidad: tipo,
      entidad_id: item.id,
      detalle: `Deshabilitó ${art} "${item.nombre}" (${productos.length} producto(s) asociados)`,
    });
    onListo(`"${item.nombre}" quedó deshabilitado. Los productos lo conservan.`);
  }

  async function borrar() {
    setError(null);
    setOcupado(true);
    // Se revisa de nuevo en la base por si alguien lo asignó mientras tanto
    const { count } = await supabase.from('productos').select('id', { count: 'exact', head: true }).eq(c.fk, item.id);
    if ((count ?? 0) > 0) {
      setError(`Ahora tiene ${count} producto(s) asociados. Cierra y vuelve a intentarlo.`);
      setOcupado(false);
      return;
    }
    const { data, error: err } = await supabase.from(c.tabla).delete().eq('id', item.id).select('id');
    if (err || !data || data.length === 0) {
      setError(err?.code === '23503' ? 'Está en uso y no se puede borrar. Deshabilítalo.' : err?.message ?? 'No tienes permiso para borrarlo.');
      setOcupado(false);
      return;
    }
    await registrarActividad({ accion: 'eliminar', entidad: tipo, entidad_id: item.id, detalle: `Eliminó ${art} "${item.nombre}"` });
    onListo(`Se eliminó ${art} "${item.nombre}".`);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !ocupado && onClose()} role="dialog" aria-modal="true">
      <div className={`${CARD} w-full max-w-md p-6 space-y-4`} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-text flex items-center gap-2">
          <Trash2 size={18} className="text-danger" /> {tieneProductos ? 'No se puede borrar' : 'Borrar'} {art}
        </h3>

        {tieneProductos ? (
          <>
            <div className="bg-warning-soft text-amber-800 rounded-lg p-3 text-sm flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                <strong>&quot;{item.nombre}&quot;</strong> tiene {productos.length} producto(s) asociados. Para no perder esa información, solo se puede{' '}
                <strong>deshabilitar</strong>: ya no aparecerá al crear productos ni al registrar entradas, pero los productos la conservan.
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-soft mb-1">Productos asociados</p>
              <ul className="max-h-40 overflow-y-auto text-sm text-text-soft border border-border rounded-lg divide-y divide-border">
                {productos.slice(0, 50).map((p) => (
                  <li key={p.id} className="px-3 py-1.5 truncate">
                    {p.nombre}
                  </li>
                ))}
                {productos.length > 50 && <li className="px-3 py-1.5 italic text-text-muted">…y {productos.length - 50} más</li>}
              </ul>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-text-soft">
              <strong>&quot;{item.nombre}&quot;</strong> no tiene productos asociados, así que se puede borrar. Esta acción no se puede deshacer.
            </p>
            {puedeBorrar ? (
              <label className="flex items-start gap-2 text-sm text-text cursor-pointer pt-2 border-t border-border">
                <input type="checkbox" className="h-4 w-4 mt-0.5 accent-danger" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
                Sí, quiero borrar {art} &quot;{item.nombre}&quot; definitivamente.
              </label>
            ) : (
              <p className="text-xs text-text-muted">No tienes permiso para borrar. Puedes deshabilitarlo.</p>
            )}
          </>
        )}

        {error && <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-3 text-sm">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={ocupado}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          {(tieneProductos || !puedeBorrar) && puedeDeshabilitar && (
            <button
              type="button"
              disabled={ocupado}
              onClick={deshabilitar}
              className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />} Deshabilitar
            </button>
          )}
          {!tieneProductos && puedeBorrar && (
            <button
              type="button"
              disabled={ocupado || !confirmo}
              onClick={borrar}
              className="px-4 py-2 text-sm font-medium bg-danger text-white rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-40"
            >
              {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Borrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
