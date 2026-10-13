"use client";

import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Product, Category } from '@/types';
import { Plus, Search, Eye, Edit, Trash2, Download } from 'lucide-react';

type ProductRow = Pick<
  Product,
  'id' | 'sku' | 'codigo_barras' | 'nombre' | 'categoria_id' | 'stock' | 'stock_minimo' | 'ubicacion'
>;
type CategoryRow = Pick<Category, 'id' | 'nombre'>;
type StockStatus = 'normal' | 'low' | 'out';
type StatusFilter = 'all' | StockStatus;

// Tarjeta blanca que se mantiene clara en modo oscuro (ver .card-light en globals.css)
const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all';
const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-soft';
const TD = 'px-4 py-3';

function getStatus(stock?: number | null, min?: number | null): StockStatus {
  const s = stock ?? 0;
  const m = min ?? 0;
  if (s <= 0) return 'out';
  if (s <= m) return 'low';
  return 'normal';
}

export default function ProductosPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');

  useEffect(() => {
    async function fetchData() {
      const [catRes, prodRes] = await Promise.all([
        supabase.from('categorias').select('id, nombre').order('nombre'),
        supabase
          .from('productos')
          .select('id, sku, codigo_barras, nombre, categoria_id, stock, stock_minimo, ubicacion')
          .order('nombre'),
      ]);

      const failed = catRes.error ?? prodRes.error;
      if (failed) {
        console.error('Error cargando productos:', failed);
        setError(failed.message);
      } else {
        setCategories((catRes.data ?? []) as CategoryRow[]);
        setProducts((prodRes.data ?? []) as ProductRow[]);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.nombre])), [categories]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !term || [p.nombre, p.sku, p.codigo_barras].some((v) => v?.toLowerCase().includes(term));
      const matchesCategory = filterCategory === 'all' || p.categoria_id === filterCategory;
      const matchesStatus =
        filterStatus === 'all' || getStatus(p.stock, p.stock_minimo) === filterStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchTerm, filterCategory, filterStatus]);

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
            <button className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2">
              <Download size={16} /> Exportar
            </button>
            <button className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2">
              <Plus size={16} /> Nuevo producto
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">
            No se pudieron cargar los productos: {error}
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
                      <tr key={p.id} className="hover:bg-surface-alt transition-colors">
                        <td className={`${TD} font-bold text-text`}>{p.sku || '—'}</td>
                        <td className={`${TD} text-text-muted`}>{p.codigo_barras || '—'}</td>
                        <td className={`${TD} font-medium text-text`}>{p.nombre}</td>
                        <td className={`${TD} text-text-soft`}>
                          {(p.categoria_id && categoryName.get(p.categoria_id)) || 'Sin categoría'}
                        </td>
                        <td className={`${TD} text-right font-semibold text-text`}>{p.stock ?? 0}</td>
                        <td className={`${TD} text-right text-text-muted`}>{p.stock_minimo ?? 0}</td>
                        <td className={`${TD} text-text-soft`}>{p.ubicacion || '—'}</td>
                        <td className={TD}>
                          <StatusBadge status={getStatus(p.stock, p.stock_minimo)} />
                        </td>
                        <td className={TD}>
                          <div className="flex justify-end gap-1">
                            <button title="Ver" className="p-2 rounded-lg text-text-soft hover:bg-bg hover:text-text transition-colors">
                              <Eye size={16} />
                            </button>
                            <button title="Editar" className="p-2 rounded-lg text-text-soft hover:bg-bg hover:text-text transition-colors">
                              <Edit size={16} />
                            </button>
                            <button title="Eliminar" className="p-2 rounded-lg text-danger hover:bg-danger-soft transition-colors">
                              <Trash2 size={16} />
                            </button>
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
