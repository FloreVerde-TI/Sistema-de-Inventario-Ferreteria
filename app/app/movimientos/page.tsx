"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Product, Movimiento } from '@/types';
import { exportReport, type Column, type Format } from '@/lib/exportar';
import { Search, Download, ChevronDown, FileSpreadsheet, FileText, X, Loader2 } from 'lucide-react';

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
const EXPORT_PAGE = 1000; // límite de filas por consulta en Supabase
const FIELDS = 'id, producto_id, tipo, cantidad, motivo, usuario, origen, proveedor, referencia, created_at';

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

// Consulta con los filtros aplicados (se usa para la tabla y para exportar)
function movQuery(f: Filters, products: ProductName[], count: boolean) {
  let query = supabase.from('movimientos').select(FIELDS, count ? { count: 'exact' } : undefined);

  if (f.tipo !== 'all') query = query.eq('tipo', f.tipo);
  if (f.producto !== 'all') query = query.eq('producto_id', f.producto);
  if (f.desde) query = query.gte('created_at', new Date(`${f.desde}T00:00:00`).toISOString());
  if (f.hasta) query = query.lte('created_at', new Date(`${f.hasta}T23:59:59.999`).toISOString());

  // Búsqueda: usuario, motivo, proveedor, documento o nombre de producto
  const term = f.search.trim().replace(/[,()%*]/g, ' ').trim();
  if (term) {
    const ids = products.filter((p) => p.nombre.toLowerCase().includes(term.toLowerCase())).map((p) => p.id);
    const parts = [
      `usuario.ilike.%${term}%`,
      `motivo.ilike.%${term}%`,
      `proveedor.ilike.%${term}%`,
      `referencia.ilike.%${term}%`,
    ];
    if (ids.length > 0) parts.push(`producto_id.in.(${ids.join(',')})`);
    query = query.or(parts.join(','));
  }
  return query;
}

async function fetchAllMovements(f: Filters, products: ProductName[]): Promise<MovimientoRow[]> {
  const all: MovimientoRow[] = [];
  for (let from = 0; ; from += EXPORT_PAGE) {
    const { data, error } = await movQuery(f, products, false)
      .order('created_at', { ascending: true })
      .range(from, from + EXPORT_PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as MovimientoRow[];
    all.push(...chunk);
    if (chunk.length < EXPORT_PAGE) break;
  }
  return all;
}

type ExportRow = MovimientoRow & { producto: string };

const EXPORT_COLUMNS: Column<ExportRow>[] = [
  { key: 'fecha', label: 'Fecha', get: (m) => new Date(m.created_at).toLocaleString('es-CR') },
  { key: 'producto', label: 'Producto', get: (m) => m.producto },
  { key: 'tipo', label: 'Tipo', get: (m) => (m.tipo === 'entrada' ? 'Entrada' : 'Salida') },
  { key: 'cantidad', label: 'Cantidad', get: (m) => m.cantidad, right: true },
  { key: 'motivo', label: 'Motivo', get: (m) => m.motivo ?? '', maxChars: 80 },
  { key: 'proveedor', label: 'Proveedor', get: (m) => m.proveedor ?? '' },
  { key: 'referencia', label: 'Doc. referencia', get: (m) => m.referencia ?? '' },
  { key: 'usuario', label: 'Usuario', get: (m) => m.usuario ?? '' },
  { key: 'origen', label: 'Origen', get: (m) => (m.origen === 'web' ? 'Web' : 'Panel') },
];

function filtersSummary(f: Filters, products: ProductName[]): string[] {
  const fecha = (s: string) => s.split('-').reverse().join('/');
  const lines = [
    !f.desde && !f.hasta ? 'Todo el historial' : `Rango: ${f.desde ? fecha(f.desde) : 'inicio'} a ${f.hasta ? fecha(f.hasta) : 'hoy'}`,
  ];
  if (f.tipo !== 'all') lines.push(`Tipo: ${f.tipo === 'entrada' ? 'Entrada' : 'Salida'}`);
  if (f.producto !== 'all') lines.push(`Producto: ${products.find((p) => p.id === f.producto)?.nombre ?? '-'}`);
  if (f.search.trim()) lines.push(`Búsqueda: "${f.search.trim()}"`);
  return lines;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Cierra el menú de exportar al hacer clic fuera de él
  useEffect(() => {
    if (!exportOpen) return;
    function onDown(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [exportOpen]);

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

      const query = movQuery(applied, products, true).order('created_at', { ascending: false });

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

  // Exporta TODOS los movimientos con los filtros aplicados (no solo la página visible)
  async function handleExport(format: Format) {
    setExportOpen(false);
    setNotice(null);
    setExporting(true);
    try {
      const data = await fetchAllMovements(applied, products);
      if (data.length === 0) {
        setNotice('No hay movimientos para exportar con los filtros aplicados.');
        return;
      }
      const rows: ExportRow[] = data.map((m) => ({ ...m, producto: productName.get(m.producto_id) ?? 'Producto no disponible' }));
      const units = (t: string) => rows.filter((m) => m.tipo === t).reduce((sum, m) => sum + m.cantidad, 0);
      await exportReport(
        {
          title: 'Historial de movimientos',
          file: 'historial_movimientos',
          columns: EXPORT_COLUMNS,
          rows,
          summary: [
            ...filtersSummary(applied, products),
            `Movimientos: ${rows.length}`,
            `Unidades entrada: ${units('entrada')}`,
            `Unidades salida: ${units('salida')}`,
          ],
        },
        format
      );
      setNotice(`Se exportaron ${rows.length} movimientos a ${format === 'excel' ? 'Excel' : 'PDF'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar el historial.');
    } finally {
      setExporting(false);
    }
  }

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
          <div className="relative" ref={exportRef}>
            <button
              type="button"
              onClick={() => setExportOpen((o) => !o)}
              disabled={exporting}
              title="Exporta todos los movimientos con los filtros aplicados"
              className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {exporting ? 'Exportando...' : 'Exportar historial'} <ChevronDown size={14} />
            </button>
            {exportOpen && (
              <div className="card-light absolute right-0 mt-2 w-48 z-20 bg-surface border border-border rounded-lg shadow-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleExport('excel')}
                  className="w-full px-4 py-2.5 text-sm text-left text-text hover:bg-bg flex items-center gap-2"
                >
                  <FileSpreadsheet size={16} /> Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  className="w-full px-4 py-2.5 text-sm text-left text-text hover:bg-bg flex items-center gap-2 border-t border-border"
                >
                  <FileText size={16} /> PDF (.pdf)
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">
            No se pudieron cargar los movimientos: {error}
          </div>
        )}

        {notice && (
          <div className="bg-primary-soft text-primary-ink border border-primary/20 rounded-lg p-4 text-sm flex items-start justify-between gap-3">
            <span>{notice}</span>
            <button type="button" title="Cerrar aviso" onClick={() => setNotice(null)}>
              <X size={16} />
            </button>
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
