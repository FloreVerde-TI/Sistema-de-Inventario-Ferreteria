"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Product } from '@/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Package, AlertTriangle, Ban, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

/* ---------- Tipos de las filas que pedimos a Supabase ---------- */
type ProductRow = Pick<Product, 'categoria_id' | 'stock' | 'stock_minimo' | 'habilitado'>;
// Tabla "movimientos": registro unificado (panel + pedidos web)
type MovementRow = { tipo: string; cantidad: number; created_at: string };
type CategoryRow = { id: string; nombre: string };

type Kpis = {
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
  entriesToday: number;
  exitsToday: number;
};
type DayPoint = { dia: string; Entrada: number; Salida: number };
type CategorySlice = { name: string; value: number; color: string };

const EMPTY_KPIS: Kpis = { totalProducts: 0, lowStock: 0, outOfStock: 0, entriesToday: 0, exitsToday: 0 };
const CATEGORY_COLORS = ['#1e40af', '#3b82f6', '#0ea5e9', '#06b6d4', '#10b981', '#f59e0b'];
const DAYS = 7;

// Tarjeta blanca que se mantiene clara incluso en modo oscuro (ver .card-light en globals.css)
const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';

/* ---------- Funciones auxiliares (sin React, fáciles de probar) ---------- */

// Fecha local AAAA-MM-DD. toISOString() usa UTC y en Costa Rica (UTC-6)
// movería los movimientos de después de las 6 pm al día siguiente.
const localKey = (d: Date) => d.toLocaleDateString('en-CA');

function errorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return 'Error desconocido';
}

// En "movimientos" el tipo se guarda en minúscula ('entrada' / 'salida'); se compara sin importar mayúsculas
const kindOf = (m: MovementRow) => m.tipo.toLowerCase();

function buildKpis(products: ProductRow[], movements: MovementRow[], todayKey: string): Kpis {
  const stockOf = (p: ProductRow) => p.stock ?? 0;
  const minOf = (p: ProductRow) => p.stock_minimo ?? 0;
  const today = movements.filter((m) => localKey(new Date(m.created_at)) === todayKey);

  return {
    totalProducts: products.length,
    outOfStock: products.filter((p) => stockOf(p) <= 0).length,
    lowStock: products.filter((p) => stockOf(p) > 0 && stockOf(p) <= minOf(p)).length,
    entriesToday: today.filter((m) => kindOf(m) === 'entrada').length,
    exitsToday: today.filter((m) => kindOf(m) === 'salida').length,
  };
}

function buildDailyChart(movements: MovementRow[]): DayPoint[] {
  // Un punto por cada uno de los últimos 7 días, aunque no tenga movimientos
  const days = new Map<string, DayPoint>();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.set(localKey(d), {
      dia: d.toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric' }),
      Entrada: 0,
      Salida: 0,
    });
  }

  for (const m of movements) {
    const point = days.get(localKey(new Date(m.created_at)));
    if (!point) continue;
    if (kindOf(m) === 'entrada') point.Entrada += Math.abs(m.cantidad);
    if (kindOf(m) === 'salida') point.Salida += Math.abs(m.cantidad);
  }
  return [...days.values()];
}

function buildCategorySlices(products: ProductRow[], categories: CategoryRow[]): CategorySlice[] {
  const counts = new Map<string | null, number>();
  for (const p of products) {
    const key = p.categoria_id ?? null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const slices = categories
    .map((c) => ({ name: c.nombre, value: counts.get(c.id) ?? 0 }))
    .filter((s) => s.value > 0);

  const uncategorized = counts.get(null) ?? 0;
  if (uncategorized > 0) slices.push({ name: 'Sin categoría', value: uncategorized });

  return slices.map((s, i) => ({ ...s, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
}

/* ---------- Página ---------- */

export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpis>(EMPTY_KPIS);
  const [daily, setDaily] = useState<DayPoint[]>([]);
  const [slices, setSlices] = useState<CategorySlice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        // Medianoche local de hace 6 días: así los 7 días del gráfico quedan completos
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (DAYS - 1));

        // Tres consultas en paralelo; los KPIs de "hoy" salen de la misma consulta de movimientos
        const [productsRes, categoriesRes, movementsRes] = await Promise.all([
          supabase.from('productos').select('categoria_id, stock, stock_minimo, habilitado'),
          supabase.from('categorias').select('id, nombre'),
          supabase.from('movimientos').select('tipo, cantidad, created_at').gte('created_at', start.toISOString()),
        ]);

        const failed = productsRes.error ?? categoriesRes.error ?? movementsRes.error;
        if (failed) throw failed;

        // Los productos deshabilitados no cuentan en los KPIs ni en la distribución
        const products = ((productsRes.data ?? []) as ProductRow[]).filter((p) => p.habilitado !== false);
        const categories = (categoriesRes.data ?? []) as CategoryRow[];
        const movements = (movementsRes.data ?? []) as MovementRow[];

        setKpis(buildKpis(products, movements, localKey(new Date())));
        setDaily(buildDailyChart(movements));
        setSlices(buildCategorySlices(products, categories));
      } catch (e) {
        console.error('Error cargando el dashboard:', e);
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const show = (n: number) => (loading ? '—' : n);
  const hasMovements = daily.some((d) => d.Entrada > 0 || d.Salida > 0);

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-text tracking-tight">Resumen general</h2>
            <p className="text-text-muted text-sm">Estado actual del inventario en tiempo real</p>
          </div>
          <div className="flex gap-3">
            <button className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors">
              📅 Hoy
            </button>
            <button className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm">
              + Nuevo movimiento
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">
            No se pudieron cargar los datos: {error}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard icon={<Package size={20} />} label="Total Productos" value={show(kpis.totalProducts)} color="blue" />
          <KpiCard icon={<AlertTriangle size={20} />} label="Stock Bajo" value={show(kpis.lowStock)} color="amber" />
          <KpiCard icon={<Ban size={20} />} label="Agotados" value={show(kpis.outOfStock)} color="red" />
          <KpiCard icon={<ArrowDownCircle size={20} />} label="Entradas Hoy" value={show(kpis.entriesToday)} color="green" />
          <KpiCard icon={<ArrowUpCircle size={20} />} label="Salidas Hoy" value={show(kpis.exitsToday)} color="cyan" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Gráfico de barras */}
          <div className={`lg:col-span-2 p-6 ${CARD}`}>
            <div className="mb-6">
              <h3 className="font-semibold text-text">Movimientos Recientes</h3>
              <p className="text-xs text-text-muted">Entradas vs Salidas (Últimos 7 días, en unidades)</p>
            </div>
            <div className="h-80 w-full">
              {hasMovements ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="dia" tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} />
                    <Legend verticalAlign="top" align="right" height={36} />
                    <Bar dataKey="Entrada" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Salida" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState text={loading ? 'Cargando...' : 'Aún no hay entradas ni salidas en los últimos 7 días.'} />
              )}
            </div>
          </div>

          {/* Gráfico circular */}
          <div className={`p-6 ${CARD}`}>
            <div className="mb-6">
              <h3 className="font-semibold text-text">Distribución</h3>
              <p className="text-xs text-text-muted">Productos por categoría</p>
            </div>
            <div className="h-80 w-full">
              {slices.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={slices} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                      {slices.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" align="center" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState text={loading ? 'Cargando...' : 'Aún no hay productos registrados.'} />
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

/* ---------- Componentes pequeños ---------- */

const KPI_STYLES = {
  blue: 'bg-primary-soft text-primary-ink',
  amber: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
  green: 'bg-success-soft text-success',
  cyan: 'bg-info-soft text-info',
} as const;

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: keyof typeof KPI_STYLES;
}) {
  return (
    <div className={`p-5 relative overflow-hidden group ${CARD}`}>
      <div
        className={`absolute right-4 top-4 w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${KPI_STYLES[color]}`}
      >
        {icon}
      </div>
      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-text">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="h-full flex items-center justify-center text-sm text-text-muted text-center px-6">{text}</div>;
}
