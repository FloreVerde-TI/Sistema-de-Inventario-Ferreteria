"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { normalizar, variantes } from '@/lib/sinonimos';

// ---------------------------------------------------------------------
// BUSCADOR DE PRODUCTOS (reemplaza al desplegable cuando hay muchos productos)
// Se escribe parte del nombre, el código (SKU), un código de barras (principal
// o adicional) o el proveedor, y se elige de la lista. Entiende sinónimos
// (ver lib/sinonimos.ts). También sirve escanear con la pistola en el campo.
// ---------------------------------------------------------------------

export type ProductoBuscable = {
  id: string;
  nombre: string;
  sku?: string | null;
  codigo_barras?: string | null;
  stock?: number | null;
  /** Códigos de barras adicionales */
  codigos?: string[];
  /** Nombre del proveedor */
  proveedor?: string | null;
};

type Props = {
  productos: ProductoBuscable[];
  /** id del producto elegido ('' = ninguno, o valorTodos si se usa "Todos") */
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Si se pasa, el buscador tiene la opción "Todos" (para filtros) con este valor, ej. 'all' */
  valorTodos?: string;
  textoTodos?: string;
  /** Mostrar el stock en la lista (Entradas y Salidas) */
  mostrarStock?: boolean;
  className?: string;
};

const MAX_RESULTADOS = 50;

function etiqueta(p: ProductoBuscable): string {
  return p.sku ? `${p.sku} · ${p.nombre}` : p.nombre;
}

export default function BuscarProducto({
  productos,
  value,
  onChange,
  placeholder = 'Buscar producto por nombre, código o código de barras…',
  valorTodos,
  textoTodos = 'Todos los productos',
  mostrarStock = false,
  className = '',
}: Props) {
  const idLista = useId();
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  // Posición de la lista en pantalla (fija, para que ningún contenedor la recorte)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);

  const elegido = productos.find((p) => p.id === value) ?? null;
  const esTodos = valorTodos !== undefined && (value === valorTodos || value === '');

  // Lo que se ve en el campo cuando no se está escribiendo
  const textoElegido = elegido ? etiqueta(elegido) : esTodos ? textoTodos : '';

  const resultados = useMemo(() => {
    const q = normalizar(texto);
    if (!q) return productos.slice(0, MAX_RESULTADOS);
    // Cada palabra escrita debe aparecer (ella o un sinónimo) en algún dato del producto
    const palabras = q.split(/\s+/).map(variantes);
    return productos
      .filter((p) => {
        const donde = normalizar(
          `${p.nombre} ${p.sku ?? ''} ${p.codigo_barras ?? ''} ${(p.codigos ?? []).join(' ')} ${p.proveedor ?? ''}`
        );
        return palabras.every((formas) => formas.some((w) => donde.includes(w)));
      })
      .slice(0, MAX_RESULTADOS);
  }, [texto, productos]);

  // Clic fuera: se cierra y vuelve a mostrar lo elegido
  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) {
        setAbierto(false);
        setTexto('');
      }
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  // Calcula dónde mostrar la lista: debajo del campo, o arriba si no cabe
  useEffect(() => {
    if (!abierto) return;
    function ubicar() {
      const r = input.current?.getBoundingClientRect();
      if (!r) return;
      const alto = 320;
      const abajo = window.innerHeight - r.bottom;
      if (abajo < alto && r.top > abajo) setPos({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 });
      else setPos({ left: r.left, width: r.width, top: r.bottom + 4 });
    }
    ubicar();
    window.addEventListener('resize', ubicar);
    window.addEventListener('scroll', ubicar, true);
    return () => {
      window.removeEventListener('resize', ubicar);
      window.removeEventListener('scroll', ubicar, true);
    };
  }, [abierto]);

  // Mantener visible la opción marcada con las flechas
  useEffect(() => {
    lista.current?.children[marcado]?.scrollIntoView({ block: 'nearest' });
  }, [marcado]);

  function elegir(id: string) {
    onChange(id);
    setAbierto(false);
    setTexto('');
    input.current?.blur();
  }

  function limpiar() {
    onChange(valorTodos ?? '');
    setTexto('');
    setAbierto(true);
    input.current?.focus();
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setMarcado((m) => Math.min(m + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMarcado((m) => Math.max(m - 1, 0));
    } else if (e.key === 'Enter') {
      // Enter no envía el formulario: elige el producto
      e.preventDefault();
      const q = normalizar(texto);
      // Si se escaneó un código exacto, se elige ese producto
      const exacto = productos.find(
        (p) =>
          q &&
          (normalizar(p.codigo_barras ?? '') === q ||
            normalizar(p.sku ?? '') === q ||
            (p.codigos ?? []).some((c) => normalizar(c) === q))
      );
      const p = exacto ?? (abierto ? resultados[marcado] : undefined);
      if (p) elegir(p.id);
    } else if (e.key === 'Escape') {
      setAbierto(false);
      setTexto('');
    }
  }

  const hayValor = !!elegido || (valorTodos !== undefined && !esTodos);

  return (
    <div className={`relative ${className}`} ref={caja}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        value={abierto ? texto : textoElegido}
        placeholder={abierto && textoElegido ? textoElegido : placeholder}
        onFocus={() => {
          setAbierto(true);
          setTexto('');
          setMarcado(0);
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setMarcado(0);
        }}
        onKeyDown={alTeclear}
        className={`w-full pl-9 ${hayValor ? 'pr-9' : 'pr-3'} py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-primary-light transition-all truncate`}
      />
      {hayValor && (
        <button
          type="button"
          onClick={limpiar}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-muted hover:text-text"
          aria-label="Quitar producto elegido"
          title="Quitar"
        >
          <X size={15} />
        </button>
      )}

      {abierto && pos && (
        <div
          className="card-light fixed z-50 bg-surface border border-border rounded-xl shadow-lg overflow-hidden"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
        >
          <ul ref={lista} id={idLista} className="max-h-64 overflow-y-auto py-1" role="listbox">
            {valorTodos !== undefined && !texto && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(valorTodos)}
                  className="w-full text-left px-3 py-2 text-sm font-medium text-primary-ink hover:bg-bg"
                >
                  {textoTodos}
                </button>
              </li>
            )}
            {resultados.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setMarcado(i)}
                  onClick={() => elegir(p.id)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 ${
                    i === marcado ? 'bg-bg' : ''
                  } ${p.id === value ? 'font-semibold' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-text truncate">{p.nombre}</span>
                    <span className="block text-[11px] text-text-muted truncate">
                      {[p.sku, p.codigo_barras, p.proveedor].filter(Boolean).join(' · ') || 'Sin código'}
                    </span>
                  </span>
                  {mostrarStock && (
                    <span className="shrink-0 text-xs text-text-soft">Stock: {p.stock ?? 0}</span>
                  )}
                </button>
              </li>
            ))}
            {resultados.length === 0 && (
              <li className="px-3 py-4 text-sm text-text-muted text-center">No se encontraron productos.</li>
            )}
          </ul>
          {resultados.length === MAX_RESULTADOS && (
            <p className="px-3 py-1.5 text-[11px] text-text-muted border-t border-border bg-surface-alt">
              Se muestran los primeros {MAX_RESULTADOS}. Escriba más para afinar la búsqueda.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
