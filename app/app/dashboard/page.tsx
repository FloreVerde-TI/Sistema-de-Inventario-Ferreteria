"use client";

import React, { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Product } from '@/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Package, AlertTriangle, Ban, ArrowDownCircle, ArrowUpCircle, ShoppingCart,
  CalendarDays, Plus, ScanLine, ChevronDown,
} from 'lucide-react';

/* ---------- Tipos ---------- */
type ProductRow = Pick<Product, 'categoria_id' | 'stock' | 'stock_minimo' | 'habilitado'>;
type MovementRow = { tipo: string; cantidad: number; created_at: string };
type PedidoRow = { estado: string | null; fecha: string };
type CategoryRow = { id: string; nombre: string };

type RangeKey = 'hoy' | '7d' | '15d' | '30d' | '90d' | 'anio' | 'custom';
type PresetKey = Exclude<RangeKey, 'custom'>;
type Range = { start: Date; end: Date; label: string };
type Granularity = 'hour' | 'day' | 'month';
type BucketDef = { key: string; label: string };

type Snapshot = { totalProducts: number; lowStock: number; outOfStock: number };
type MovPoint = { label: string; Entrada: number; Salida: number };
type PedPoint = { label: string; Pendiente: number; Aprobado: number; Rechazado: number };
type CategorySlice = { name: string; value: number; color: string };
type RangeData = {
  movChart: MovPoint[];
  pedChart: PedPoint[];
  entries: number;
  exits: number;
  pedidos: number;
  pendientes: number;
  granularity: Granularity;
};

const EMPTY_SNAPSHOT: Snapshot = { totalProducts: 0, lowStock: 0, outOfStock: 0 };
const EMPTY_RANGE_DATA: RangeData = {
  movChart: [], pedChart: [], entries: 0, exits: 0, pedidos: 0, pendientes: 0, granularity: 'day',
};

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: 'Últimos 7 días' },
  { key: '15d', label: 'Últimos 15 días' },
  { key: '30d', label: 'Últimos 30 días' },
  { key: '90d', label: 'Últimos 3 meses' },
  { key: 'anio', label: 'Este año' },
  { key: 'custom', label: 'Personalizado…' },
];

const CATEGORY_COLORS = ['#1e40af', '#3b82f6', '#0ea5e9', '#06b6d4', '#10b981', '#f59e0b'];
const PAGE = 1000; // Supabase devuelve máx. 1000 filas por consulta

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all';

/* ---------- Funciones auxiliares ---------- */

// Fecha local AAAA-MM-DD (toISOString usa UTC y movería las fechas en Costa Rica)
const localKey = (d: Date) => d.toLocaleDateString('en-CA');

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function errorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return 'Error desconocido';
}

function presetRange(key: PresetKey): Range {
  const today = new Date();
  const daysBack = (n: number, label: string): Range => {
    const s = startOfDay(today);
    s.setDate(s.getDate() - (n - 1));
    return { start: s, end: endOfDay(today), label };
  };
  switch (key) {
    case 'hoy':
      return { start: startOfDay(today), end: endOfDay(today), label: 'Hoy' };
    case '7d':
      return daysBack(7, '7 días');
    case '15d':
      return daysBack(15, '15 días');
    case '30d':
      return daysBack(30, '30 días');
    case '90d':
      return daysBack(90, '3 meses');
    default:
      return { start: new Date(today.getFullYear(), 0, 1), end: endOfDay(today), label: String(today.getFullYear()) };
  }
}

// Devuelve el rango o un mensaje de error
function customRange(desde: string, hasta: string): Range | string {
  if (!desde || !hasta) return 'Elige la fecha inicial y la final.';
  const start = startOfDay(parseLocal(desde));
  const end = endOfDay(parseLocal(hasta));
  if (start > end) return 'La fecha inicial no puede ser mayor que la final.';
  const fmt = (d: Date) => d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const label = localKey(start) === localKey(end) ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
  return { start, end, label };
}

function granularityOf(r: Range): Granularity {
  const days = Math.round((startOfDay(r.end).getTime() - r.start.getTime()) / 86400000) + 1;
  if (days <= 1) return 'hour';
  if (days <= 62) return 'day';
  return 'month';
}

function bucketKey(d: Date, g: Granularity): string {
  if (g === 'hour') return String(d.getHours());
  if (g === 'day') return localKey(d);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function buildBuckets(r: Range, g: Granularity): BucketDef[] {
  const out: BucketDef[] = [];
  if (g === 'hour') {
    for (let h = 0; h < 24; h++) out.push({ key: String(h), label: `${h}:00` });
    return out;
  }
  if (g === 'day') {
    const short = granularityDays(r) <= 14;
    for (const d = new Date(r.start); d <= r.end; d.setDate(d.getDate() + 1)) {
      out.push({
        key: localKey(d),
        label: short
          ? d.toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric' })
          : d.toLocaleDateString('es-CR', { day: 'numeric', month: 'numeric' }),
      });
    }
    return out;
  }
  for (const d = new Date(r.start.getFullYear(), r.start.getMonth(), 1); d <= r.end; d.setMonth(d.getMonth() + 1)) {
    out.push({ key: bucketKey(d, 'month'), label: d.toLocaleDateString('es-CR', { month: 'short', year: '2-digit' }) });
  }
  return out;
}

function granularityDays(r: Range): number {
  return Math.round((startOfDay(r.end).getTime() - r.start.getTime()) / 86400000) + 1;
}

function normEstado(estado: string | null): 'Pendiente' | 'Aprobado' | 'Rechazado' {
  const e = (estado ?? '').trim().toLowerCase();
  if (e === 'aprobado') return 'Aprobado';
  if (e === 'rechazado') return 'Rechazado';
  return 'Pendiente';
}

const kindOf = (m: MovementRow) => m.tipo.toLowerCase();

function buildMovChart(movs: MovementRow[], buckets: BucketDef[], g: Granularity): MovPoint[] {
  const map = new Map(buckets.map((b) => [b.key, { label: b.label, Entrada: 0, Salida: 0 }]));
  for (const m of movs) {
    const p = map.get(bucketKey(new Date(m.created_at), g));
    if (!p) continue;
    if (kindOf(m) === 'entrada') p.Entrada += Math.abs(m.cantidad);
    if (kindOf(m) === 'salida') p.Salida += Math.abs(m.cantidad);
  }
  return [...map.values()];
}

function buildPedChart(peds: PedidoRow[], buckets: BucketDef[], g: Granularity): PedPoint[] {
  const map = new Map(buckets.map((b) => [b.key, { label: b.label, Pendiente: 0, Aprobado: 0, Rechazado: 0 }]));
  for (const p of peds) {
    const point = map.get(bucketKey(new Date(p.fecha), g));
    if (point) point[normEstado(p.estado)] += 1;
  }
  return [...map.values()];
}

function buildSnapshot(products: ProductRow[]): Snapshot {
  const stockOf = (p: ProductRow) => p.stock ?? 0;
  const minOf = (p: ProductRow) => p.stock_minimo ?? 0;
  return {
    totalProducts: products.length,
    outOfStock: products.filter((p) => stockOf(p) <= 0).length,
    lowStock: products.filter((p) => stockOf(p) > 0 && stockOf(p) <= minOf(p)).length,
  };
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

// Trae todas las filas por páginas de 1000 (necesario en rangos largos)
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/* ---------- Página ---------- */

// Suspense: el rango usa la fecha actual, así Next.js la calcula en cada visita
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [slices, setSlices] = useState<CategorySlice[]>([]);
  const [snapLoading, setSnapLoading] = useState(true);

  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const [range, setRange] = useState<Range>(() => presetRange('7d'));
  const [draftDesde, setDraftDesde] = useState('');
  const [draftHasta, setDraftHasta] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);

  const [data, setData] = useState<RangeData>(EMPTY_RANGE_DATA);
  const [rangeLoading, setRangeLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Al salir del Dashboard, el rango vuelve a "Últimos 7 días"
  // (Next.js puede conservar la pantalla en memoria al navegar)
  useEffect(() => {
    return () => {
      setRangeKey('7d');
      setRange(presetRange('7d'));
      setRangeError(null);
    };
  }, []);

  // Estado actual del catálogo (no depende del rango)
  useEffect(() => {
    let cancelled = false;
    async function loadSnapshot() {
      try {
        const [productsRes, categoriesRes] = await Promise.all([
          supabase.from('productos').select('categoria_id, stock, stock_minimo, habilitado'),
          supabase.from('categorias').select('id, nombre'),
        ]);
        const failed = productsRes.error ?? categoriesRes.error;
        if (failed) throw failed;
        if (cancelled) return;
        // Los deshabilitados no cuentan
        const products = ((productsRes.data ?? []) as ProductRow[]).filter((p) => p.habilitado !== false);
        setSnapshot(buildSnapshot(products));
        setSlices(buildCategorySlices(products, (categoriesRes.data ?? []) as CategoryRow[]));
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setSnapLoading(false);
      }
    }
    loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Movimientos y pedidos del rango elegido
  useEffect(() => {
    let cancelled = false;
    async function loadRange() {
      setRangeLoading(true);
      try {
        const from = range.start.toISOString();
        const to = range.end.toISOString();
        const [movs, peds] = await Promise.all([
          fetchAll<MovementRow>((a, b) =>
            supabase
              .from('movimientos')
              .select('tipo, cantidad, created_at')
              .gte('created_at', from)
              .lte('created_at', to)
              .order('created_at')
              .range(a, b)
          ),
          fetchAll<PedidoRow>((a, b) =>
            supabase.from('pedidos').select('estado, fecha').gte('fecha', from).lte('fecha', to).order('fecha').range(a, b)
          ),
        ]);
        if (cancelled) return;

        const g = granularityOf(range);
        const buckets = buildBuckets(range, g);
        setData({
          movChart: buildMovChart(movs, buckets, g),
          pedChart: buildPedChart(peds, buckets, g),
          entries: movs.filter((m) => kindOf(m) === 'entrada').length,
          exits: movs.filter((m) => kindOf(m) === 'salida').length,
          pedidos: peds.length,
          pendientes: peds.filter((p) => normEstado(p.estado) === 'Pendiente').length,
          granularity: g,
        });
        setError(null);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setRangeLoading(false);
      }
    }
    loadRange();
    return () => {
      cancelled = true;
    };
  }, [range]);

  function handleRangeChange(key: RangeKey) {
    setRangeKey(key);
    setRangeError(null);
    if (key === 'custom') {
      setDraftDesde(localKey(range.start));
      setDraftHasta(localKey(range.end));
    } else {
      setRange(presetRange(key));
    }
  }

  function applyCustom() {
    const r = customRange(draftDesde, draftHasta);
    if (typeof r === 'string') {
      setRangeError(r);
      return;
    }
    setRangeError(null);
    setRange(r);
  }

  const snap = (n: number) => (snapLoading ? '—' : n);
  const inRange = (n: number) => (rangeLoading ? '—' : n);
  const grouping =
    data.granularity === 'hour' ? 'por hora' : data.granularity === 'month' ? 'por mes' : 'por día';
  const hasMovements = data.movChart.some((d) => d.Entrada > 0 || d.Salida > 0);
  const hasPedidos = data.pedChart.some((d) => d.Pendiente + d.Aprobado + d.Rechazado > 0);

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-text tracking-tight">Resumen general</h2>
            <p className="text-text-muted text-sm">Estado del inventario · {range.label}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <CalendarDays
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <select
                aria-label="Rango de fechas"
                className={`card-light ${FIELD} bg-surface pl-9 pr-8 font-medium`}
                value={rangeKey}
                onChange={(e) => handleRangeChange(e.target.value as RangeKey)}
              >
                {RANGE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {rangeKey === 'custom' && (
              <>
                <input
                  type="date"
                  aria-label="Desde"
                  className={`card-light ${FIELD} bg-surface`}
                  value={draftDesde}
                  onChange={(e) => setDraftDesde(e.target.value)}
                />
                <input
                  type="date"
                  aria-label="Hasta"
                  className={`card-light ${FIELD} bg-surface`}
                  value={draftHasta}
                  onChange={(e) => setDraftHasta(e.target.value)}
                />
                <button
                  type="button"
                  onClick={applyCustom}
                  className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors"
                >
                  Aplicar
                </button>
              </>
            )}

            <NuevoMovimientoMenu />
          </div>
        </div>

        {rangeError && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">{rangeError}</div>
        )}

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">
            No se pudieron cargar los datos: {error}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard icon={<Package size={20} />} label="Total productos" hint="Actual" value={snap(snapshot.totalProducts)} color="blue" />
          <KpiCard icon={<AlertTriangle size={20} />} label="Stock bajo" hint="Actual" value={snap(snapshot.lowStock)} color="amber" />
          <KpiCard icon={<Ban size={20} />} label="Agotados" hint="Actual" value={snap(snapshot.outOfStock)} color="red" />
          <KpiCard icon={<ArrowDownCircle size={20} />} label="Entradas" hint={range.label} value={inRange(data.entries)} color="green" />
          <KpiCard icon={<ArrowUpCircle size={20} />} label="Salidas" hint={range.label} value={inRange(data.exits)} color="cyan" />
          <KpiCard
            icon={<ShoppingCart size={20} />}
            label="Pedidos web"
            hint={rangeLoading ? range.label : `${range.label} · ${data.pendientes} pendientes`}
            value={inRange(data.pedidos)}
            color="blue"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Movimientos */}
          <div className={`lg:col-span-2 p-6 ${CARD}`}>
            <div className="mb-6">
              <h3 className="font-semibold text-text">Movimientos</h3>
              <p className="text-xs text-text-muted">
                Entradas vs Salidas en unidades · {range.label}, {grouping}
              </p>
            </div>
            <div className="h-80 w-full">
              {hasMovements ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.movChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} />
                    <Legend verticalAlign="top" align="right" height={36} />
                    <Bar dataKey="Entrada" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Salida" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState text={rangeLoading ? 'Cargando...' : 'No hay entradas ni salidas en este rango.'} />
              )}
            </div>
          </div>

          {/* Distribución (siempre actual) */}
          <div className={`p-6 ${CARD}`}>
            <div className="mb-6">
              <h3 className="font-semibold text-text">Distribución actual</h3>
              <p className="text-xs text-text-muted">Productos por categoría · no depende del rango</p>
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
                <EmptyState text={snapLoading ? 'Cargando...' : 'Aún no hay productos registrados.'} />
              )}
            </div>
          </div>
        </div>

        {/* Pedidos web */}
        <div className={`p-6 ${CARD}`}>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-text">Pedidos web</h3>
              <p className="text-xs text-text-muted">
                Cantidad de pedidos por estado · {range.label}, {grouping}
              </p>
            </div>
            <Link href="/pedidos" className="text-xs font-semibold text-primary-ink hover:underline">
              Ver pedidos
            </Link>
          </div>
          <div className="h-72 w-full">
            {hasPedidos ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.pedChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} />
                  <Legend verticalAlign="top" align="right" height={36} />
                  <Bar dataKey="Pendiente" stackId="p" fill="#f59e0b" />
                  <Bar dataKey="Aprobado" stackId="p" fill="#10b981" />
                  <Bar dataKey="Rechazado" stackId="p" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text={rangeLoading ? 'Cargando...' : 'No hay pedidos web en este rango.'} />
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

/* ---------- Componentes pequeños ---------- */

const MENU_ITEMS = [
  { href: '/entradas', label: 'Entrada', desc: 'Registrar ingreso de stock', icon: ArrowDownCircle, color: 'text-success' },
  { href: '/salidas', label: 'Salida', desc: 'Registrar venta, daño o ajuste', icon: ArrowUpCircle, color: 'text-warning' },
  { href: '/barcode', label: 'Código de barras', desc: 'Buscar o registrar por código', icon: ScanLine, color: 'text-primary-ink' },
];

function NuevoMovimientoMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2"
      >
        <Plus size={16} /> Nuevo movimiento <ChevronDown size={14} />
      </button>
      {open && (
        <div className={`absolute right-0 mt-2 w-64 z-20 p-1.5 ${CARD} shadow-lg`}>
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-bg transition-colors"
            >
              <item.icon size={18} className={`mt-0.5 ${item.color}`} />
              <span>
                <span className="block text-sm font-semibold text-text">{item.label}</span>
                <span className="block text-xs text-text-muted">{item.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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
  hint,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
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
      <p className="text-[11px] text-text-muted mt-1 pr-10 truncate">{hint}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="h-full flex items-center justify-center text-sm text-text-muted text-center px-6">{text}</div>;
}
