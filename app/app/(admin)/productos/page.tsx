"use client";

import React, { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { registrarActividad } from '@/lib/actividad';
import SiPuede from '@/components/SiPuede';
import { Product, Category } from '@/types';
import { exportReport, type Column, type Format } from '@/lib/exportar';
import {
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Download,
  Globe,
  Package,
  X,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  Check,
} from 'lucide-react';

type ProductRow = { proveedor_id: string | null } & Pick<
  Product,
  | 'id'
  | 'sku'
  | 'codigo_barras'
  | 'nombre'
  | 'descripcion'
  | 'precio'
  | 'imagen_principal'
  | 'activo'
  | 'categoria_id'
  | 'stock'
  | 'stock_minimo'
  | 'ubicacion'
  | 'habilitado'
>;
type CategoryRow = Pick<Category, 'id' | 'nombre'>;
type ProveedorRow = { id: string; nombre: string };
type StockStatus = 'normal' | 'low' | 'out';
type StatusFilter = 'all' | StockStatus;
type WebFilter = 'all' | 'web' | 'noweb';

// Tarjeta blanca que se mantiene clara en modo oscuro (ver .card-light en globals.css)
const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all';
const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-soft';
const TD = 'px-4 py-3';
const ICON_BTN = 'p-2 rounded-lg text-text-soft hover:bg-bg hover:text-text transition-colors';

function getStatus(stock?: number | null, min?: number | null): StockStatus {
  const s = stock ?? 0;
  const m = min ?? 0;
  if (s <= 0) return 'out';
  if (s <= m) return 'low';
  return 'normal';
}

function formatPrice(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return `₡${Number(value).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;
}

const STATUS_LABEL: Record<StockStatus, string> = {
  normal: 'Normal',
  low: 'Stock bajo',
  out: 'Agotado',
};

type MovementRow = {
  tipo: string;
  cantidad: number;
  motivo: string | null;
  usuario: string | null;
  origen: string | null;
  proveedor: string | null;
  referencia: string | null;
  observaciones: string | null;
  created_at: string;
};

const MOV_PAGE_SIZE = 1000;

// Trae TODOS los movimientos del producto (de 1000 en 1000, por el límite de Supabase)
async function fetchProductMovements(productId: ProductRow['id']): Promise<MovementRow[]> {
  const all: MovementRow[] = [];
  for (let from = 0; ; from += MOV_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('movimientos')
      .select('tipo, cantidad, motivo, usuario, origen, proveedor, referencia, observaciones, created_at')
      .eq('producto_id', productId)
      .order('created_at', { ascending: true })
      .range(from, from + MOV_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as MovementRow[];
    all.push(...chunk);
    if (chunk.length < MOV_PAGE_SIZE) break;
  }
  return all;
}

function fileSafe(text: string): string {
  return text.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
}

const MOVEMENT_COLUMNS: Column<MovementRow>[] = [
  { key: 'fecha', label: 'Fecha', get: (m) => new Date(m.created_at).toLocaleString('es-CR') },
  { key: 'tipo', label: 'Tipo', get: (m) => (m.tipo === 'entrada' ? 'Entrada' : 'Salida') },
  { key: 'cantidad', label: 'Cantidad', get: (m) => m.cantidad, right: true },
  { key: 'motivo', label: 'Motivo', get: (m) => m.motivo ?? '', maxChars: 80 },
  { key: 'observaciones', label: 'Observaciones', get: (m) => m.observaciones ?? '', maxChars: 80 },
  { key: 'proveedor', label: 'Proveedor', get: (m) => m.proveedor ?? '' },
  { key: 'referencia', label: 'Doc. referencia', get: (m) => m.referencia ?? '' },
  { key: 'usuario', label: 'Usuario', get: (m) => m.usuario ?? '' },
  { key: 'origen', label: 'Origen', get: (m) => (m.origen === 'web' ? 'Web' : 'Panel') },
];

function exportMovements(product: ProductRow, rows: MovementRow[], format: Format): Promise<void> {
  return exportReport(
    {
      title: `Historial de movimientos - ${product.nombre}`,
      file: `movimientos_${fileSafe(product.sku || product.nombre)}`,
      columns: MOVEMENT_COLUMNS,
      rows,
      summary: [`Código: ${product.sku ?? '-'}`, `Stock actual: ${product.stock ?? 0}`, `Movimientos: ${rows.length}`],
    },
    format
  );
}

type ProductExportRow = ProductRow & { categoria: string; proveedor: string };

const PRODUCT_COLUMNS: Column<ProductExportRow>[] = [
  { key: 'sku', label: 'Código', get: (p) => p.sku ?? '' },
  { key: 'barras', label: 'Cód. barras', get: (p) => p.codigo_barras ?? '' },
  { key: 'nombre', label: 'Nombre', get: (p) => p.nombre },
  { key: 'categoria', label: 'Categoría', get: (p) => p.categoria },
  { key: 'proveedor', label: 'Proveedor', get: (p) => p.proveedor },
  { key: 'precio', label: 'Precio', get: (p) => p.precio ?? 0, right: true, money: true },
  { key: 'stock', label: 'Stock', get: (p) => p.stock ?? 0, right: true },
  { key: 'minimo', label: 'Mín.', get: (p) => p.stock_minimo ?? 0, right: true },
  { key: 'ubicacion', label: 'Ubicación', get: (p) => p.ubicacion ?? '' },
  {
    key: 'estado',
    label: 'Estado',
    get: (p) => (p.habilitado === false ? 'Deshabilitado' : STATUS_LABEL[getStatus(p.stock, p.stock_minimo)]),
  },
  { key: 'web', label: 'En web', get: (p) => (p.activo ? 'Sí' : 'No') },
  { key: 'descripcion', label: 'Descripción', get: (p) => p.descripcion ?? '', maxChars: 100 },
  { key: 'imagen', label: 'URL de imagen', get: (p) => p.imagen_principal ?? '', maxChars: 40 },
];

// Suspense: la página lee ?buscar= (lo usa el buscador rápido de la barra superior)
export default function ProductosPage() {
  return (
    <Suspense fallback={null}>
      <ProductosContenido />
    </Suspense>
  );
}

function ProductosContenido() {
  const router = useRouter();
  const buscarParam = useSearchParams().get('buscar');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(buscarParam ?? '');

  // Si llega una búsqueda desde la barra superior, se aplica y se quita de la dirección
  // (así, al volver a Productos más tarde, no reaparece)
  useEffect(() => {
    if (buscarParam === null) return;
    setSearchTerm(buscarParam);
    router.replace('/productos', { scroll: false });
  }, [buscarParam, router]);

  // Al salir de la pantalla (Nuevo, Editar, otro menú…) los filtros se limpian
  useEffect(() => {
    return () => {
      setSearchTerm('');
      setFilterCategory('all');
      setFilterStatus('all');
      setFilterWeb('all');
      setNotice(null);
    };
  }, []);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [filterWeb, setFilterWeb] = useState<WebFilter>('all');
  const [selected, setSelected] = useState<ProductRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Cierra el menú de exportar al hacer clic fuera de él
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    async function fetchData() {
      const [catRes, prodRes, provRes] = await Promise.all([
        supabase.from('categorias').select('id, nombre').order('nombre'),
        supabase
          .from('productos')
          .select(
            'id, sku, codigo_barras, nombre, descripcion, precio, imagen_principal, activo, categoria_id, stock, stock_minimo, ubicacion, habilitado, proveedor_id'
          )
          .order('nombre'),
        supabase.from('proveedores').select('id, nombre').order('nombre'),
      ]);

      const failed = catRes.error ?? prodRes.error;
      if (failed) {
        console.error('Error cargando productos:', failed);
        setError(failed.message);
      } else {
        setCategories((catRes.data ?? []) as CategoryRow[]);
        setProducts((prodRes.data ?? []) as unknown as ProductRow[]);
        setProveedores((provRes.data ?? []) as ProveedorRow[]);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.nombre])), [categories]);
  const proveedorName = useMemo(() => new Map(proveedores.map((p) => [p.id, p.nombre])), [proveedores]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !term || [p.nombre, p.sku, p.codigo_barras].some((v) => v?.toLowerCase().includes(term));
      const matchesCategory = filterCategory === 'all' || p.categoria_id === filterCategory;
      const matchesStatus =
        filterStatus === 'all' || getStatus(p.stock, p.stock_minimo) === filterStatus;
      const matchesWeb =
        filterWeb === 'all' || (filterWeb === 'web' ? p.activo === true : p.activo !== true);
      return matchesSearch && matchesCategory && matchesStatus && matchesWeb;
    });
  }, [products, searchTerm, filterCategory, filterStatus, filterWeb]);

  async function handleExport(format: Format) {
    setNotice(null);
    setExportOpen(false);
    if (filteredProducts.length === 0) {
      setNotice('No hay productos para exportar con los filtros aplicados.');
      return;
    }
    const rows: ProductExportRow[] = filteredProducts.map((p) => ({
      ...p,
      categoria: (p.categoria_id && categoryName.get(p.categoria_id)) || 'Sin categoría',
      proveedor: (p.proveedor_id && proveedorName.get(p.proveedor_id)) || '',
    }));
    try {
      await exportReport(
        {
          title: 'Listado de productos',
          file: 'productos',
          columns: PRODUCT_COLUMNS,
          rows,
          summary: [`Productos: ${rows.length}`],
        },
        format
      );
      setNotice(`Se exportaron ${rows.length} productos a ${format === 'excel' ? 'Excel' : 'PDF'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar.');
    }
  }

  function handleDeleted(p: ProductRow) {
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
    setDeleteTarget(null);
    setNotice(`El producto «${p.nombre}» se borró definitivamente.`);
  }

  function handleDisabled(p: ProductRow) {
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, habilitado: false, activo: false } : x)));
    setDeleteTarget(null);
    setNotice(`El producto «${p.nombre}» quedó deshabilitado.`);
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-text tracking-tight">Gestión de productos</h2>
            <p className="text-text-muted text-sm">
              Administra el catálogo, stock y ubicaciones de la ferretería
            </p>
          </div>
          <div className="flex gap-3">
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                onClick={() => setExportOpen((open) => !open)}
                disabled={loading}
                className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2 disabled:opacity-60"
              >
                <Download size={16} /> Exportar <ChevronDown size={14} />
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
            <SiPuede permiso="productos_crear">
              <Link
                href="/productos/nuevo"
                className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2"
              >
                <Plus size={16} /> Nuevo producto
              </Link>
            </SiPuede>
          </div>
        </div>

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">
            No se pudieron cargar los productos: {error}
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
        <div className={`${CARD} p-5 flex flex-wrap gap-4 items-center`}>
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="text"
              placeholder="Buscar por nombre, código o código de barras..."
              className={`${FIELD} w-full pl-10 pr-4`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select className={FIELD} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>

          <select
            className={FIELD}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
          >
            <option value="all">Todos los estados</option>
            <option value="normal">Normal</option>
            <option value="low">Stock bajo</option>
            <option value="out">Agotado</option>
          </select>

          <select className={FIELD} value={filterWeb} onChange={(e) => setFilterWeb(e.target.value as WebFilter)}>
            <option value="all">Todos</option>
            <option value="web">En Web</option>
            <option value="noweb">No en Web</option>
          </select>
        </div>

        {/* Tabla */}
        <div className={`${CARD} overflow-hidden`}>
          {loading ? (
            <div className="p-20 text-center text-text-muted italic">Cargando productos...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface-alt border-b border-border">
                  <tr>
                    <th className={TH}>Código</th>
                    <th className={TH}>Cód. Barras</th>
                    <th className={TH}>Nombre</th>
                    <th className={TH}>Categoría</th>
                    <th className={`${TH} text-right`}>Stock</th>
                    <th className={`${TH} text-right`}>Mín.</th>
                    <th className={TH}>Ubicación</th>
                    <th className={TH}>Estado</th>
                    <th className={`${TH} text-right`}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredProducts.length > 0 ? (
                    filteredProducts.map((p) => (
                      <tr
                        key={p.id}
                        className={`hover:bg-surface-alt transition-colors ${p.habilitado === false ? 'bg-surface-alt' : ''}`}
                      >
                        <td className={`${TD} font-bold text-text`}>{p.sku || '—'}</td>
                        <td className={`${TD} text-text-muted`}>{p.codigo_barras || '—'}</td>
                        <td
                          className={`${TD} font-medium ${
                            p.habilitado === false
                              ? 'text-text-muted line-through decoration-red-400 decoration-2'
                              : 'text-text'
                          }`}
                        >
                          {p.nombre}
                        </td>
                        <td className={`${TD} text-text-soft`}>
                          {(p.categoria_id && categoryName.get(p.categoria_id)) || 'Sin categoría'}
                        </td>
                        <td className={`${TD} text-right font-semibold text-text`}>{p.stock ?? 0}</td>
                        <td className={`${TD} text-right text-text-muted`}>{p.stock_minimo ?? 0}</td>
                        <td className={`${TD} text-text-soft`}>{p.ubicacion || '—'}</td>
                        <td className={TD}>
                          <div className="flex flex-col items-start gap-1">
                            {p.habilitado === false ? (
                              <DisabledBadge />
                            ) : (
                              <>
                                <StatusBadge status={getStatus(p.stock, p.stock_minimo)} />
                                {p.activo && <WebBadge />}
                              </>
                            )}
                          </div>
                        </td>
                        <td className={TD}>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              title="Ver"
                              onClick={() => setSelected(p)}
                              className={ICON_BTN}
                            >
                              <Eye size={16} />
                            </button>
                            <SiPuede permiso="productos_editar">
                              <Link href={`/productos/${p.id}/editar`} title="Editar" className={ICON_BTN}>
                                <Edit size={16} />
                              </Link>
                            </SiPuede>
                            <SiPuede permiso="productos_eliminar">
                            <button
                              type="button"
                              title="Eliminar"
                              onClick={() => {
                                setNotice(null);
                                setDeleteTarget(p);
                              }}
                              className="p-2 rounded-lg text-danger hover:bg-danger-soft transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                            </SiPuede>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-6 py-20 text-center text-text-muted italic">
                        {products.length === 0
                          ? 'Aún no hay productos registrados.'
                          : 'No se encontraron productos con los filtros aplicados.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <ProductDetailModal
          product={selected}
          categoria={(selected.categoria_id && categoryName.get(selected.categoria_id)) || 'Sin categoría'}
          proveedor={(selected.proveedor_id && proveedorName.get(selected.proveedor_id)) || '—'}
          onClose={() => setSelected(null)}
        />
      )}

      {deleteTarget && (
        <DeleteProductModal
          product={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
          onDisabled={handleDisabled}
        />
      )}
    </AdminLayout>
  );
}

// Los textos oscuros (green-800, amber-800, red-800) son los del diseño de referencia.
// Se usan colores fijos porque la tabla siempre está en una tarjeta clara.
const BADGES: Record<StockStatus, { label: string; className: string }> = {
  normal: { label: 'Normal', className: 'bg-success-soft text-green-800' },
  low: { label: 'Stock bajo', className: 'bg-warning-soft text-amber-800' },
  out: { label: 'Agotado', className: 'bg-danger-soft text-red-800' },
};

function StatusBadge({ status }: { status: StockStatus }) {
  const { label, className } = BADGES[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function DisabledBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-black text-white">
      Deshabilitado
    </span>
  );
}

function WebBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-primary-soft text-primary-ink">
      <Globe size={10} />
      En web
    </span>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-soft">{label}</p>
      <p className="text-sm text-text mt-0.5 break-words">{value}</p>
    </div>
  );
}

function ProductDetailModal({
  product,
  categoria,
  proveedor,
  onClose,
}: {
  product: ProductRow;
  categoria: string;
  proveedor: string;
  onClose: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageUrl = product.imagen_principal?.trim() ?? '';
  const showImage = imageUrl !== '' && !imgFailed;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`${CARD} w-full max-w-2xl max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-border">
          <div>
            <h3 className="text-lg font-bold text-text">{product.nombre}</h3>
            <div className="flex flex-wrap gap-2 mt-2">
              {product.habilitado === false ? (
                <DisabledBadge />
              ) : (
                <>
                  <StatusBadge status={getStatus(product.stock, product.stock_minimo)} />
                  {product.activo && <WebBadge />}
                </>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} title="Cerrar" className={ICON_BTN}>
            <X size={18} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="aspect-square rounded-lg bg-bg border border-border flex items-center justify-center overflow-hidden">
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={product.nombre}
                className="w-full h-full object-contain"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="text-center text-text-muted">
                <Package size={40} className="mx-auto mb-1" />
                <p className="text-xs">Sin imagen</p>
              </div>
            )}
          </div>

          <div className="sm:col-span-2 grid grid-cols-2 gap-4">
            <DetailItem label="Categoría" value={categoria} />
            <DetailItem label="Precio" value={formatPrice(product.precio)} />
            <DetailItem label="Código (SKU)" value={product.sku || '—'} />
            <DetailItem label="Código de barras" value={product.codigo_barras || '—'} />
            <DetailItem label="Stock actual" value={product.stock ?? 0} />
            <DetailItem label="Stock mínimo" value={product.stock_minimo ?? 0} />
            <DetailItem label="Proveedor" value={proveedor} />
            <DetailItem label="Ubicación" value={product.ubicacion || '—'} />
          </div>

          <div className="sm:col-span-3">
            <DetailItem label="Descripción" value={product.descripcion || 'Sin descripción'} />
          </div>
          <div className="sm:col-span-3">
            <DetailItem label="URL de la imagen" value={imageUrl || '—'} />
          </div>
        </div>

        <div className="p-6 border-t border-border flex justify-end gap-3">
          <SiPuede permiso="productos_editar">
            <Link
              href={`/productos/${product.id}/editar`}
              className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-2"
            >
              <Edit size={16} /> Editar
            </Link>
          </SiPuede>
          <button
            type="button"
            onClick={onClose}
            className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteProductModal({
  product,
  onClose,
  onDeleted,
  onDisabled,
}: {
  product: ProductRow;
  onClose: () => void;
  onDeleted: (p: ProductRow) => void;
  onDisabled: (p: ProductRow) => void;
}) {
  const [busy, setBusy] = useState<'export' | 'delete' | 'disable' | null>(null);
  const [exportedMsg, setExportedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const alreadyDisabled = product.habilitado === false;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  async function handleExport(format: 'excel' | 'pdf') {
    setError(null);
    setBusy('export');
    try {
      const rows = await fetchProductMovements(product.id);
      if (rows.length === 0) {
        setExportedMsg('Este producto no tiene movimientos, no hay nada que exportar.');
      } else {
        await exportMovements(product, rows, format);
        setExportedMsg(`Se exportaron ${rows.length} movimientos a ${format === 'excel' ? 'Excel' : 'PDF'}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar el historial.');
    }
    setBusy(null);
  }

  async function handleDelete() {
    if (!exportedMsg) return;
    setError(null);
    setBlocked(false);
    setBusy('delete');
    const { data, error: delError } = await supabase
      .from('productos')
      .delete()
      .eq('id', product.id)
      .select('id');
    setBusy(null);

    if (delError) {
      // 23503 = la base no deja borrar porque hay pedidos web (detalle_pedido)
      if (delError.code === '23503') setBlocked(true);
      else setError(delError.message);
      return;
    }
    if (!data || data.length === 0) {
      setError('La base no borró el producto. Revisa los permisos (RLS).');
      return;
    }
    await registrarActividad({
      accion: 'eliminar',
      entidad: 'producto',
      entidad_id: product.id,
      detalle: `Eliminó el producto "${product.nombre}"${product.sku ? ` (${product.sku})` : ''}`,
    });
    onDeleted(product);
  }

  async function handleDisable() {
    setError(null);
    setBusy('disable');
    const { data, error: updError } = await supabase
      .from('productos')
      .update({ habilitado: false, activo: false })
      .eq('id', product.id)
      .select('id');
    setBusy(null);

    if (updError) {
      setError(updError.message);
      return;
    }
    if (!data || data.length === 0) {
      setError('La base no deshabilitó el producto. Revisa los permisos (RLS).');
      return;
    }
    await registrarActividad({
      accion: 'deshabilitar',
      entidad: 'producto',
      entidad_id: product.id,
      detalle: `Deshabilitó el producto "${product.nombre}"`,
    });
    onDisabled(product);
  }

  const STEP = 'border border-border rounded-lg p-4';
  const BTN =
    'card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className={`${CARD} w-full max-w-lg max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 p-6 border-b border-border">
          <AlertTriangle className="text-danger shrink-0 mt-0.5" size={22} />
          <div>
            <h3 className="text-lg font-bold text-text">Eliminar producto</h3>
            <p className="text-sm text-text-soft mt-0.5">{product.nombre}</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-text-soft">
            Borrar elimina el producto y todo su historial de movimientos. No se puede deshacer.
          </p>

          {error && (
            <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-3 text-sm">{error}</div>
          )}

          {blocked && (
            <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-3 text-sm">
              No se puede borrar: este producto tiene pedidos web asociados. Puedes deshabilitarlo para que no se use
              más.
            </div>
          )}

          <div className={STEP}>
            <p className="text-sm font-semibold text-text mb-3">1. Exporta el historial de movimientos</p>
            <div className="flex gap-3">
              <button type="button" disabled={busy !== null} onClick={() => handleExport('excel')} className={BTN}>
                <FileSpreadsheet size={16} /> Excel
              </button>
              <button type="button" disabled={busy !== null} onClick={() => handleExport('pdf')} className={BTN}>
                <FileText size={16} /> PDF
              </button>
            </div>
            {busy === 'export' && <p className="text-xs text-text-muted mt-2">Exportando...</p>}
            {exportedMsg && (
              <p className="text-xs text-success mt-2 flex items-center gap-1">
                <Check size={14} /> {exportedMsg}
              </p>
            )}
          </div>

          <div className={STEP}>
            <p className="text-sm font-semibold text-text mb-3">2. Borra definitivamente</p>
            <button
              type="button"
              disabled={!exportedMsg || busy !== null}
              onClick={handleDelete}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 size={16} /> {busy === 'delete' ? 'Borrando...' : 'Borrar definitivamente'}
            </button>
            {!exportedMsg && <p className="text-xs text-text-muted mt-2">Primero debes exportar el historial.</p>}
          </div>

          <SiPuede permiso="productos_deshabilitar">
          <div className={STEP}>
            <p className="text-sm font-semibold text-text mb-1">¿Prefieres conservarlo?</p>
            <p className="text-xs text-text-muted mb-3">
              Deshabilitar lo oculta de la web y de Entradas y Salidas, pero guarda todo su historial.
            </p>
            <button
              type="button"
              disabled={alreadyDisabled || busy !== null}
              onClick={handleDisable}
              className={BTN}
            >
              {alreadyDisabled ? 'Ya está deshabilitado' : busy === 'disable' ? 'Deshabilitando...' : 'Solo deshabilitar'}
            </button>
          </div>
          </SiPuede>
        </div>

        <div className="p-6 border-t border-border flex justify-end">
          <button type="button" disabled={busy !== null} onClick={onClose} className={BTN}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
