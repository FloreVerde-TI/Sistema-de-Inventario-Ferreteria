"use client";

import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Product, Movimiento } from '@/types';
import { Search, Download } from 'lucide-react';

type ProductName = Pick<Product, 'id' | 'nombre'>;
type MovimientoRow = Pick<
  Movimiento,
  'id' | 'producto_id' | 'tipo' | 'cantidad' | 'motivo' | 'usuario' | 'origen' | 'proveedor' | 'referencia' | 'created_at'
>;
type TipoFilter = 'all' | 'entrada' | 'salida';

type Filters = {
  search: string;
  desde: string;
  hasta: string;
  tipo: TipoFilter;
  producto: string;
};

const EMPTY_FILTERS: Filters = { search: '', desde: '', hasta: '', tipo: 'all', producto: 'all' };
const PAGE_SIZE = 20;

// Tarjeta blanca que se mantiene clara en modo oscuro (ver .card-light en globals.css)
const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-primary-light transition-all';
const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-soft';
const TD = 'px-4 py-3';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CR');
}

export default function MovimientosPage() {
  const [products, setProducts] = useState<ProductName[]>([]);
  const [rows, setRows] = useState<MovimientoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS); // lo que se escribe
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS); // lo que se consulta
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Nombres de productos (incluye inactivos, para mostrar movimientos antiguos)
  useEffect(() => {
    async function loadProducts() {
      const { data, error: prodError } = await supabase
        .from('productos')
        .select('id, nombre')
        .order('nombre');
      if (prodError) {
        console.error('Error cargando productos:', prodError);
        setError(prodError.message);
        return;
      }
      setProducts((data ?? []) as ProductName[]);
    }
    loadProducts();
  }, []);

  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.nombre])), [products]);

  // Movimientos con filtros y paginación hechos en la base de datos
  useEffect(() => {
    let cancelled = false;

    async function loadMovimientos() {
      setLoading(true);

      let query = supabase
        .from('movimientos')
        .select('id, producto_id, tipo, cantidad, motivo, usuario, origen, proveedor, referencia, created_at', {
          count: 'exact',
        })
        .order('created_at', { ascending: false });

      if (applied.tipo !== 'all') query = query.eq('tipo', applied.tipo);
      if (applied.producto !== 'all') query = query.eq('producto_id', applied.producto);
      if (applied.desde) query = query.gte('created_at', new Date(`${applied.desde}T00:00:00`).toISOString());
      if (applied.hasta) query = query.lte('created_at', new Date(`${applied.hasta}T23:59:59.999`).toISOString());

      // Búsqueda: usuario, motivo, proveedor, documento o nombre de producto
      const term = applied.search.trim().replace(/[,()%*]/g, ' ').trim();
      if (term) {
        const ids = products
          .filter((p) => p.nombre.toLowerCase().includes(term.toLowerCase()))
          .map((p) => p.id);
        const parts = [
          `usuario.ilike.%${term}%`,
          `motivo.ilike.%${term}%`,
          `proveedor.ilike.%${term}%`,
          `referencia.ilike.%${term}%`,
        ];
        if (ids.length > 0) parts.push(`producto_id.in.(${ids.join(',')})`);
        query = query.or(parts.join(','));
      }

      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error: movError } = await query.range(from, from + PAGE_SIZE - 1);

      if (cancelled) return;

      if (movError) {
        console.error('Error cargando movimientos:', movError);
        setError(movError.message);
      } else {
        setError(null);
        setRows((data ?? []) as MovimientoRow[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    }

    loadMovimientos();
    return () => {
      cancelled = true;
    };
  }, [applied, page, products]);

  const setDraftField = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setApplied(draft);
  };

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setPage(1);
    setApplied(EMPTY_FILTERS);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-text tracking-tight">Historial de movimientos</h2>
            <p className="text-text-muted text-sm">Auditoría completa de entradas y salidas del inventario</p>
          </div>
          <button className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2">
            <Download size={16} /> Exportar historial
          </button>
        </div>

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">
            No se pudieron cargar los movimientos: {error}
          </div>
        )}

        {/* Filtros */}
        <form onSubmit={applyFilters} className={`${CARD} p-5 flex flex-wrap gap-3 items-center`}>
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="text"
              placeholder="Buscar por producto, usuario, proveedor o motivo…"
              className={`${FIELD} w-full pl-10 pr-4`}
              value={draft.search}
              onChange={(e) => setDraftField('search', e.target.value)}
            />
          </div>

          <input
            type="date"
            aria-label="Desde"
            className={FIELD}
            value={draft.desde}
            onChange={(e) => setDraftField('desde', e.target.value)}
          />
          <input
            type="date"
            aria-label="Hasta"
            className={FIELD}
            value={draft.hasta}
            onChange={(e) => setDraftField('hasta', e.target.value)}
          />

          <select
            className={FIELD}
            value={draft.tipo}
            onChange={(e) => setDraftField('tipo', e.target.value as TipoFilter)}
          >
            <option value="all">Todos los tipos</option>
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
          </select>

          <select
            className={`${FIELD} max-w-[220px]`}
            value={draft.producto}
            onChange={(e) => setDraftField('producto', e.target.value)}
          >
            <option value="all">Todos los productos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors"
          >
            Limpiar
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm"
          >
            Aplicar filtros
          </button>
        </form>

        {/* Tabla */}
        <div className={`${CARD} overflow-hidden`}>
          {loading ? (
            <div className="p-20 text-center text-text-muted italic">Cargando movimientos...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface-alt border-b border-border">
                  <tr>
                    <th className={TH}>Fecha y hora</th>
                    <th className={TH}>Usuario</th>
                    <th className={TH}>Producto</th>
                    <th className={TH}>Tipo</th>
                    <th className={`${TH} text-right`}>Cantidad</th>
                    <th className={TH}>Motivo / detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.length > 0 ? (
                    rows.map((m) => (
                      <tr key={m.id} className="hover:bg-surface-alt transition-colors">
                        <td className={`${TD} text-text-soft whitespace-nowrap`}>{formatDate(m.created_at)}</td>
                        <td className={`${TD} text-text`}>{m.usuario || 'Sistema'}</td>
                        <td className={`${TD} font-medium text-text`}>
                          {productName.get(m.producto_id) ?? 'Producto no disponible'}
                        </td>
                        <td className={TD}>
                          <TipoBadge tipo={m.tipo} />
                        </td>
                        <td
                          className={`${TD} text-right font-semibold ${
                            m.tipo === 'entrada' ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {m.tipo === 'entrada' ? '+' : '−'}
                          {m.cantidad}
                        </td>
                        <td className={`${TD} text-text-soft`}>
                          <div>{m.motivo || '—'}</div>
                          {(m.proveedor || m.referencia) && (
                            <div className="text-xs text-text-muted mt-0.5">
                              {[m.proveedor && `Proveedor: ${m.proveedor}`, m.referencia && `Doc: ${m.referencia}`]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-20 text-center text-text-muted italic">
                        {total === 0 && applied === EMPTY_FILTERS
                          ? 'Aún no hay movimientos registrados.'
                          : 'No se encontraron movimientos con los filtros aplicados.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación */}
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-border text-xs text-text-muted">
            <span>
              Mostrando {formatNumber(firstShown)}–{formatNumber(lastShown)} de {formatNumber(total)} movimientos
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 bg-surface border border-border rounded-lg text-text hover:bg-bg transition-colors disabled:opacity-40"
              >
                ‹ Anterior
              </button>
              <span className="px-2">
                Página {page} de {totalPages}
              </span>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 bg-surface border border-border rounded-lg text-text hover:bg-bg transition-colors disabled:opacity-40"
              >
                Siguiente ›
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

// Los textos oscuros son los del diseño de referencia (la tabla siempre está en tarjeta clara)
const TIPO_BADGES: Record<Movimiento['tipo'], { label: string; className: string }> = {
  entrada: { label: 'Entrada', className: 'bg-success-soft text-green-800' },
  salida: { label: 'Salida', className: 'bg-danger-soft text-red-800' },
};

function TipoBadge({ tipo }: { tipo: Movimiento['tipo'] }) {
  const { label, className } = TIPO_BADGES[tipo];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
