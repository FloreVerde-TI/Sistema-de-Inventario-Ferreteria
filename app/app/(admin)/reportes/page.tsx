"use client";

import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { traerTodo } from '@/lib/paginar';
import { Product, Category, Movimiento } from '@/types';
import { exportReport, formatMoney, type Column, type ExportSpec, type Format } from '@/lib/exportar';
import { useDefensa, defensaActiva } from '@/lib/defensa';
import {
  FileSpreadsheet, FileText, Package, AlertTriangle, Ban, ArrowLeftRight, ShoppingCart,
  SlidersHorizontal, X, Loader2, Hourglass,
} from 'lucide-react';

/* ---------- Tipos ---------- */
type ProductRow = { proveedor_id: string | null } & Pick<
  Product,
  | 'id' | 'sku' | 'codigo_barras' | 'nombre' | 'descripcion' | 'precio' | 'categoria_id'
  | 'stock' | 'stock_minimo' | 'ubicacion' | 'activo' | 'habilitado'
>;
type CategoryRow = Pick<Category, 'id' | 'nombre'>;
type ProveedorRow = { id: string; nombre: string };
type ProductName = Pick<Product, 'id' | 'nombre'>;
type MovRow = Pick<
  Movimiento,
  'producto_id' | 'tipo' | 'cantidad' | 'motivo' | 'usuario' | 'origen' | 'proveedor' | 'referencia' | 'observaciones' | 'created_at'
>;
type PedidoRow = {
  codigo: string | null;
  fecha: string | null;
  nombre_cliente: string | null;
  telefono: string | null;
  metodo_pago: string | null;
  total: number | null;
  estado: string | null;
  revisado_nombre: string | null;
  revisado_en: string | null;
  motivo_rechazo: string | null;
  reabierto_nombre: string | null;
  reabierto_en: string | null;
};

type ProductItem = ProductRow & { categoria: string; proveedor: string };
// Producto sin movimiento: fecha del último movimiento y días sin moverse
type SinMovItem = ProductItem & { ultimo: string | null; dias: number | null };
type MovItem = MovRow & { producto: string };

type Source = 'productos' | 'movimientos' | 'pedidos';

// proveedor: 'all' (todos), 'none' (sin proveedor) o el id del proveedor
type ProdFilter = { categoria: string; proveedor: string; deshabilitados: boolean };
type MovFilter = { desde: string; hasta: string; tipo: 'all' | 'entrada' | 'salida'; producto: string };
type EstadoFilter = 'all' | 'Pendiente' | 'Aprobado' | 'Rechazado';
type PagoFilter = 'all' | 'sinpe' | 'transferencia' | 'whatsapp';
type PedFilter = { desde: string; hasta: string; estado: EstadoFilter; pago: PagoFilter };

const EMPTY_PROD: ProdFilter = { categoria: 'all', proveedor: 'all', deshabilitados: false };
const EMPTY_MOV: MovFilter = { desde: '', hasta: '', tipo: 'all', producto: 'all' };
const EMPTY_PED: PedFilter = { desde: '', hasta: '', estado: 'all', pago: 'all' };

const PRODUCT_FIELDS =
  'id, sku, codigo_barras, nombre, descripcion, precio, categoria_id, stock, stock_minimo, ubicacion, activo, habilitado, proveedor_id';
const MOV_FIELDS = 'producto_id, tipo, cantidad, motivo, usuario, origen, proveedor, referencia, observaciones, created_at';
const PED_FIELDS =
  'codigo, fecha, nombre_cliente, telefono, metodo_pago, total, estado, revisado_nombre, revisado_en, motivo_rechazo, reabierto_nombre, reabierto_en';
const PAGE = 1000; // límite de filas por consulta en Supabase

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all';
const LABEL = 'block text-[11px] font-semibold uppercase tracking-wide text-text-soft mb-1';

const PAGO_LABEL: Record<string, string> = { sinpe: 'SINPE', transferencia: 'Transferencia', whatsapp: 'WhatsApp' };
const SOURCE_LABEL: Record<Source, string> = { productos: 'Productos', movimientos: 'Movimientos', pedidos: 'Pedidos web' };

/* ---------- Funciones auxiliares ---------- */

function errorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return 'Error desconocido';
}

function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('es-CR') : '';
}

function stockStatus(p: ProductRow): 'Normal' | 'Stock bajo' | 'Agotado' {
  const s = p.stock ?? 0;
  if (s <= 0) return 'Agotado';
  if (s <= (p.stock_minimo ?? 0)) return 'Stock bajo';
  return 'Normal';
}

function normEstado(estado: string | null): 'Pendiente' | 'Aprobado' | 'Rechazado' {
  const e = (estado ?? '').trim().toLowerCase();
  if (e === 'aprobado') return 'Aprobado';
  if (e === 'rechazado') return 'Rechazado';
  return 'Pendiente';
}

// Modo defensa: nunca se exportan columnas de la página web
const SOLO_WEB = ['web', 'origen'];
function pick<T>(cols: Column<T>[], keys: string[]): Column<T>[] {
  const ks = defensaActiva() ? keys.filter((k) => !SOLO_WEB.includes(k)) : keys;
  return ks.map((k) => cols.find((c) => c.key === k)).filter((c): c is Column<T> => !!c);
}

function rangeText(desde: string, hasta: string): string {
  if (!desde && !hasta) return 'Todo el historial';
  const f = (s: string) => s.split('-').reverse().join('/');
  return `${desde ? f(desde) : 'inicio'} a ${hasta ? f(hasta) : 'hoy'}`;
}

function checkRange(desde: string, hasta: string) {
  if (desde && hasta && desde > hasta) throw new Error('La fecha inicial no puede ser mayor que la final.');
}

const dayStart = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

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

/* ---------- Columnas disponibles (se reutilizan en todos los reportes) ---------- */

const PRODUCT_COLUMNS: Column<ProductItem>[] = [
  { key: 'sku', label: 'Código', get: (p) => p.sku ?? '' },
  { key: 'barras', label: 'Cód. barras', get: (p) => p.codigo_barras ?? '' },
  { key: 'nombre', label: 'Nombre', get: (p) => p.nombre },
  { key: 'categoria', label: 'Categoría', get: (p) => p.categoria },
  { key: 'proveedor', label: 'Proveedor', get: (p) => p.proveedor },
  { key: 'precio', label: 'Precio', get: (p) => p.precio ?? 0, right: true, money: true },
  { key: 'stock', label: 'Stock', get: (p) => p.stock ?? 0, right: true },
  { key: 'minimo', label: 'Mínimo', get: (p) => p.stock_minimo ?? 0, right: true },
  {
    key: 'reponer',
    label: 'Por reponer',
    get: (p) => Math.max((p.stock_minimo ?? 0) - (p.stock ?? 0), 0),
    right: true,
  },
  {
    key: 'valor',
    label: 'Valor en stock',
    get: (p) => (p.precio ?? 0) * Math.max(p.stock ?? 0, 0),
    right: true,
    money: true,
  },
  { key: 'ubicacion', label: 'Ubicación', get: (p) => p.ubicacion ?? '' },
  { key: 'estado', label: 'Estado', get: (p) => (p.habilitado === false ? 'Deshabilitado' : stockStatus(p)) },
  { key: 'web', label: 'En web', get: (p) => (p.activo ? 'Sí' : 'No') },
  { key: 'descripcion', label: 'Descripción', get: (p) => p.descripcion ?? '', maxChars: 120 },
];

const MOV_COLUMNS: Column<MovItem>[] = [
  { key: 'fecha', label: 'Fecha', get: (m) => formatDateTime(m.created_at) },
  { key: 'producto', label: 'Producto', get: (m) => m.producto },
  { key: 'tipo', label: 'Tipo', get: (m) => (m.tipo === 'entrada' ? 'Entrada' : 'Salida') },
  { key: 'cantidad', label: 'Cantidad', get: (m) => m.cantidad, right: true },
  { key: 'motivo', label: 'Motivo', get: (m) => m.motivo ?? '' },
  { key: 'observaciones', label: 'Observaciones', get: (m) => m.observaciones ?? '', maxChars: 100 },
  { key: 'proveedor', label: 'Proveedor', get: (m) => m.proveedor ?? '' },
  { key: 'referencia', label: 'Doc. referencia', get: (m) => m.referencia ?? '' },
  { key: 'usuario', label: 'Usuario', get: (m) => m.usuario ?? '' },
  { key: 'origen', label: 'Origen', get: (m) => (m.origen === 'web' ? 'Web' : 'Panel') },
];

const PED_COLUMNS: Column<PedidoRow>[] = [
  { key: 'fecha', label: 'Fecha', get: (p) => formatDateTime(p.fecha) },
  { key: 'codigo', label: 'Código', get: (p) => (p.codigo ? `#${p.codigo}` : '') },
  { key: 'cliente', label: 'Cliente', get: (p) => p.nombre_cliente ?? '' },
  { key: 'telefono', label: 'Teléfono', get: (p) => p.telefono ?? '' },
  { key: 'pago', label: 'Pago', get: (p) => (p.metodo_pago && PAGO_LABEL[p.metodo_pago]) || '' },
  { key: 'total', label: 'Total', get: (p) => p.total ?? 0, right: true, money: true },
  { key: 'estado', label: 'Estado', get: (p) => normEstado(p.estado) },
  { key: 'revisado', label: 'Revisado por', get: (p) => p.revisado_nombre ?? '' },
  { key: 'revisado_en', label: 'Fecha revisión', get: (p) => formatDateTime(p.revisado_en) },
  { key: 'motivo', label: 'Motivo rechazo', get: (p) => p.motivo_rechazo ?? '', maxChars: 120 },
  { key: 'reabierto', label: 'Reabierto por', get: (p) => p.reabierto_nombre ?? '' },
  { key: 'reabierto_en', label: 'Fecha reapertura', get: (p) => formatDateTime(p.reabierto_en) },
];

const ALL_KEYS: Record<Source, string[]> = {
  productos: PRODUCT_COLUMNS.map((c) => c.key),
  movimientos: MOV_COLUMNS.map((c) => c.key),
  pedidos: PED_COLUMNS.map((c) => c.key),
};

/* ---------- Carga de datos ---------- */

async function loadProducts(f: ProdFilter): Promise<ProductItem[]> {
  const [catRes, provRes, prods] = await Promise.all([
    supabase.from('categorias').select('id, nombre'),
    supabase.from('proveedores').select('id, nombre'),
    fetchAll<ProductRow>((a, b) => supabase.from('productos').select(PRODUCT_FIELDS).order('nombre').order('id').range(a, b)),
  ]);
  if (catRes.error) throw catRes.error;
  if (provRes.error) throw provRes.error;
  const names = new Map(((catRes.data ?? []) as CategoryRow[]).map((c) => [c.id, c.nombre]));
  const provNames = new Map(((provRes.data ?? []) as ProveedorRow[]).map((p) => [p.id, p.nombre]));
  const matchesProv = (p: ProductRow) =>
    f.proveedor === 'all' || (f.proveedor === 'none' ? !p.proveedor_id : p.proveedor_id === f.proveedor);
  return prods
    .filter(
      (p) =>
        (f.deshabilitados || p.habilitado !== false) &&
        (f.categoria === 'all' || p.categoria_id === f.categoria) &&
        matchesProv(p)
    )
    .map((p) => ({
      ...p,
      categoria: (p.categoria_id && names.get(p.categoria_id)) || 'Sin categoría',
      proveedor: (p.proveedor_id && provNames.get(p.proveedor_id)) || '',
    }));
}

async function loadMovements(f: MovFilter): Promise<MovItem[]> {
  checkRange(f.desde, f.hasta);
  const [prods, movs] = await Promise.all([
    fetchAll<ProductName>((a, b) => supabase.from('productos').select('id, nombre').order('id').range(a, b)),
    fetchAll<MovRow>((a, b) => {
      let q = supabase.from('movimientos').select(MOV_FIELDS);
      if (defensaActiva()) q = q.or('origen.is.null,origen.neq.web'); // modo defensa
      if (f.tipo !== 'all') q = q.eq('tipo', f.tipo);
      if (f.producto !== 'all') q = q.eq('producto_id', f.producto);
      if (f.desde) q = q.gte('created_at', dayStart(f.desde));
      if (f.hasta) q = q.lte('created_at', dayEnd(f.hasta));
      return q.order('created_at').range(a, b);
    }),
  ]);
  const names = new Map(prods.map((p) => [p.id, p.nombre]));
  return movs.map((m) => ({ ...m, producto: names.get(m.producto_id) ?? 'Producto eliminado' }));
}

async function loadPedidos(f: PedFilter): Promise<PedidoRow[]> {
  checkRange(f.desde, f.hasta);
  return fetchAll<PedidoRow>((a, b) => {
    let q = supabase.from('pedidos').select(PED_FIELDS);
    if (f.estado === 'Pendiente') q = q.or('estado.is.null,estado.ilike.pendiente');
    else if (f.estado !== 'all') q = q.ilike('estado', f.estado);
    if (f.pago !== 'all') q = q.eq('metodo_pago', f.pago);
    if (f.desde) q = q.gte('fecha', dayStart(f.desde));
    if (f.hasta) q = q.lte('fecha', dayEnd(f.hasta));
    return q.order('fecha').range(a, b);
  });
}

/* ---------- Productos sin movimiento ---------- */

const MESES_SIN_MOV = [1, 3, 6, 12];

const SINMOV_COLUMNS: Column<SinMovItem>[] = [
  { key: 'sku', label: 'Código', get: (p) => p.sku ?? '' },
  { key: 'nombre', label: 'Nombre', get: (p) => p.nombre },
  { key: 'categoria', label: 'Categoría', get: (p) => p.categoria },
  { key: 'proveedor', label: 'Proveedor', get: (p) => p.proveedor },
  { key: 'stock', label: 'Stock', get: (p) => p.stock ?? 0, right: true },
  {
    key: 'valor',
    label: 'Dinero detenido',
    get: (p) => (p.precio ?? 0) * Math.max(p.stock ?? 0, 0),
    right: true,
    money: true,
  },
  { key: 'ultimo', label: 'Último movimiento', get: (p) => (p.ultimo ? formatDateTime(p.ultimo) : 'Nunca') },
  { key: 'dias', label: 'Días sin movimiento', get: (p) => (p.dias === null ? 'Nunca' : p.dias), right: true },
  { key: 'ubicacion', label: 'Ubicación', get: (p) => p.ubicacion ?? '' },
];

async function buildSinMovimiento(
  f: ProdFilter,
  meses: number,
  categories: CategoryRow[],
  proveedores: ProveedorRow[]
): Promise<ExportSpec<SinMovItem>> {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - meses);
  const [prods, movs] = await Promise.all([
    loadProducts({ ...f, deshabilitados: false }),
    fetchAll<{ producto_id: string; created_at: string }>((a, b) =>
      supabase.from('movimientos').select('producto_id, created_at').order('created_at').range(a, b)
    ),
  ]);
  // Fecha del último movimiento de cada producto
  const ultimo = new Map<string, string>();
  for (const m of movs) {
    const prev = ultimo.get(m.producto_id);
    if (!prev || m.created_at > prev) ultimo.set(m.producto_id, m.created_at);
  }
  const hoy = Date.now();
  const rows: SinMovItem[] = prods
    .filter((p) => (p.stock ?? 0) > 0) // solo lo que está ocupando espacio
    .map((p) => {
      const u = ultimo.get(String(p.id)) ?? null;
      return { ...p, ultimo: u, dias: u ? Math.floor((hoy - new Date(u).getTime()) / 86400000) : null };
    })
    .filter((p) => !p.ultimo || new Date(p.ultimo) < limite)
    .sort((a, b) => (b.dias ?? Infinity) - (a.dias ?? Infinity) || a.nombre.localeCompare(b.nombre));

  const unidades = rows.reduce((s, p) => s + Math.max(p.stock ?? 0, 0), 0);
  const valor = rows.reduce((s, p) => s + (p.precio ?? 0) * Math.max(p.stock ?? 0, 0), 0);
  return {
    title: `Productos sin movimiento (${meses} ${meses === 1 ? 'mes' : 'meses'} o más)`,
    file: 'productos_sin_movimiento',
    columns: SINMOV_COLUMNS,
    rows,
    summary: [
      ...prodFilterText(f, categories, proveedores),
      `Sin entradas ni salidas desde: ${limite.toLocaleDateString('es-CR')}`,
      `Productos: ${rows.length}`,
      `Unidades: ${unidades}`,
      `Dinero detenido: ${formatMoney(valor)}`,
    ],
    totals: { nombre: 'TOTAL', stock: unidades, valor },
  };
}

/* ---------- Construcción de cada reporte ---------- */

function categoryText(f: ProdFilter, categories: CategoryRow[]): string {
  if (f.categoria === 'all') return 'Todas las categorías';
  return categories.find((c) => c.id === f.categoria)?.nombre ?? 'Categoría';
}

function proveedorText(f: ProdFilter, proveedores: ProveedorRow[]): string {
  if (f.proveedor === 'all') return 'Todos los proveedores';
  if (f.proveedor === 'none') return 'Sin proveedor';
  return `Proveedor: ${proveedores.find((p) => p.id === f.proveedor)?.nombre ?? '—'}`;
}

// Líneas de resumen de filtros de productos
function prodFilterText(f: ProdFilter, categories: CategoryRow[], proveedores: ProveedorRow[]): string[] {
  return [categoryText(f, categories), proveedorText(f, proveedores)];
}

function movSummary(rows: MovItem[], f: MovFilter): string[] {
  const units = (t: string) => rows.filter((m) => m.tipo === t).reduce((s, m) => s + m.cantidad, 0);
  return [
    `Rango: ${rangeText(f.desde, f.hasta)}`,
    `Movimientos: ${rows.length}`,
    `Unidades entrada: ${units('entrada')}`,
    `Unidades salida: ${units('salida')}`,
  ];
}

function pedSummary(rows: PedidoRow[], f: PedFilter): string[] {
  const count = (e: string) => rows.filter((p) => normEstado(p.estado) === e).length;
  const aprobado = rows
    .filter((p) => normEstado(p.estado) === 'Aprobado')
    .reduce((s, p) => s + (p.total ?? 0), 0);
  return [
    `Rango: ${rangeText(f.desde, f.hasta)}`,
    `Pedidos: ${rows.length} (${count('Pendiente')} pend., ${count('Aprobado')} aprob., ${count('Rechazado')} rech.)`,
    `Total aprobado: ${formatMoney(aprobado)}`,
  ];
}

async function buildInventario(f: ProdFilter, categories: CategoryRow[], proveedores: ProveedorRow[]): Promise<ExportSpec<ProductItem>> {
  const rows = await loadProducts(f);
  const units = rows.reduce((s, p) => s + Math.max(p.stock ?? 0, 0), 0);
  const value = rows.reduce((s, p) => s + (p.precio ?? 0) * Math.max(p.stock ?? 0, 0), 0);
  return {
    title: 'Inventario completo',
    file: 'inventario_completo',
    columns: pick(PRODUCT_COLUMNS, ['sku', 'barras', 'nombre', 'categoria', 'proveedor', 'precio', 'stock', 'minimo', 'valor', 'ubicacion', 'estado', 'web']),
    rows,
    summary: [...prodFilterText(f, categories, proveedores), `Productos: ${rows.length}`, `Unidades: ${units}`, `Valor total: ${formatMoney(value)}`],
    totals: { nombre: 'TOTAL', stock: units, valor: value },
  };
}

async function buildStockBajo(f: ProdFilter, categories: CategoryRow[], proveedores: ProveedorRow[]): Promise<ExportSpec<ProductItem>> {
  const rows = (await loadProducts({ ...f, deshabilitados: false })).filter((p) => stockStatus(p) === 'Stock bajo');
  return {
    title: 'Productos con stock bajo',
    file: 'stock_bajo',
    columns: pick(PRODUCT_COLUMNS, ['sku', 'nombre', 'categoria', 'proveedor', 'stock', 'minimo', 'reponer', 'ubicacion']),
    rows,
    summary: [...prodFilterText(f, categories, proveedores), `Productos: ${rows.length}`],
  };
}

async function buildAgotados(f: ProdFilter, categories: CategoryRow[], proveedores: ProveedorRow[]): Promise<ExportSpec<ProductItem>> {
  const rows = (await loadProducts({ ...f, deshabilitados: false })).filter((p) => stockStatus(p) === 'Agotado');
  return {
    title: 'Productos agotados',
    file: 'agotados',
    columns: pick(PRODUCT_COLUMNS, ['sku', 'barras', 'nombre', 'categoria', 'proveedor', 'stock', 'minimo', 'ubicacion']),
    rows,
    summary: [...prodFilterText(f, categories, proveedores), `Productos: ${rows.length}`],
  };
}

async function buildMovimientos(f: MovFilter): Promise<ExportSpec<MovItem>> {
  const rows = await loadMovements(f);
  return { title: 'Movimientos de inventario', file: 'movimientos', columns: pick(MOV_COLUMNS, MOV_COLUMNS.map((c) => c.key)), rows, summary: movSummary(rows, f) };
}

async function buildPedidos(f: PedFilter): Promise<ExportSpec<PedidoRow>> {
  const rows = await loadPedidos(f);
  return { title: 'Pedidos web', file: 'pedidos_web', columns: PED_COLUMNS, rows, summary: pedSummary(rows, f) };
}

/* ---------- Página ---------- */

export default function ReportesPage() {
  const defensa = useDefensa(); // modo defensa: sin reportes de la página web
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorRow[]>([]);
  const [productNames, setProductNames] = useState<ProductName[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [invF, setInvF] = useState<ProdFilter>(EMPTY_PROD);
  const [lowF, setLowF] = useState<ProdFilter>(EMPTY_PROD);
  const [outF, setOutF] = useState<ProdFilter>(EMPTY_PROD);
  const [movF, setMovF] = useState<MovFilter>(EMPTY_MOV);
  const [pedF, setPedF] = useState<PedFilter>(EMPTY_PED);
  const [sinF, setSinF] = useState<ProdFilter>(EMPTY_PROD);
  const [sinMeses, setSinMeses] = useState(3);

  const [source, setSource] = useState<Source>('productos');
  const [customCols, setCustomCols] = useState<Record<Source, string[]>>(ALL_KEYS);
  const [cProdF, setCProdF] = useState<ProdFilter>(EMPTY_PROD);
  const [cMovF, setCMovF] = useState<MovFilter>(EMPTY_MOV);
  const [cPedF, setCPedF] = useState<PedFilter>(EMPTY_PED);

  // Listas para los filtros (categorías y nombres de productos)
  useEffect(() => {
    let cancelled = false;
    async function loadLists() {
      const [catRes, prodRes, provRes] = await Promise.all([
        supabase.from('categorias').select('id, nombre').order('nombre'),
        traerTodo((a, b) => supabase.from('productos').select('id, nombre').order('nombre').order('id').range(a, b)),
        supabase.from('proveedores').select('id, nombre').order('nombre'),
      ]);
      if (cancelled) return;
      const failed = catRes.error ?? prodRes.error ?? provRes.error;
      setProveedores((provRes.data ?? []) as ProveedorRow[]);
      if (failed) setError(`No se pudieron cargar los filtros: ${failed.message}`);
      setCategories((catRes.data ?? []) as CategoryRow[]);
      setProductNames((prodRes.data ?? []) as ProductName[]);
    }
    loadLists();
    return () => {
      cancelled = true;
    };
  }, []);

  async function run<T>(format: Format, build: () => Promise<ExportSpec<T>>) {
    setNotice(null);
    setError(null);
    try {
      const spec = await build();
      if (spec.rows.length === 0) {
        setNotice(`"${spec.title}": no hay datos con esos filtros.`);
        return;
      }
      await exportReport(spec, format);
      setNotice(`Se generó "${spec.title}" en ${format === 'excel' ? 'Excel' : 'PDF'} (${spec.rows.length} filas).`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function runCustom(format: Format): Promise<void> {
    const keys = customCols[source];
    if (keys.length === 0) {
      setNotice(null);
      setError('Elige al menos una columna.');
      return Promise.resolve();
    }
    const base = { title: `Reporte personalizado - ${SOURCE_LABEL[source]}`, file: `personalizado_${source}` };
    if (source === 'productos') {
      return run(format, async () => {
        const rows = await loadProducts(cProdF);
        return { ...base, columns: pick(PRODUCT_COLUMNS, keys), rows, summary: [...prodFilterText(cProdF, categories, proveedores), `Productos: ${rows.length}`] };
      });
    }
    if (source === 'movimientos') {
      return run(format, async () => {
        const rows = await loadMovements(cMovF);
        return { ...base, columns: pick(MOV_COLUMNS, keys), rows, summary: movSummary(rows, cMovF) };
      });
    }
    return run(format, async () => {
      const rows = await loadPedidos(cPedF);
      return { ...base, columns: pick(PED_COLUMNS, keys), rows, summary: pedSummary(rows, cPedF) };
    });
  }

  function toggleColumn(key: string) {
    setCustomCols((prev) => {
      const current = prev[source];
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : ALL_KEYS[source].filter((k) => k === key || current.includes(k)); // mantiene el orden original
      return { ...prev, [source]: next };
    });
  }

  const sourceColumns: { key: string; label: string }[] = (
    source === 'productos' ? PRODUCT_COLUMNS : source === 'movimientos' ? MOV_COLUMNS : PED_COLUMNS
  ).filter((c) => !(defensa && SOLO_WEB.includes(c.key)));

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-text tracking-tight">Generación de reportes</h2>
          <p className="text-text-muted text-sm">Exporta la información del inventario en Excel o PDF</p>
        </div>

        {error && (
          <Banner tone="danger" onClose={() => setError(null)}>
            {error}
          </Banner>
        )}
        {notice && (
          <Banner tone="info" onClose={() => setNotice(null)}>
            {notice}
          </Banner>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <ReportCard
            icon={<Package size={22} />}
            color="blue"
            title="Inventario completo"
            desc="Todos los productos con precio, stock, ubicación y valor total del inventario."
            onExport={(fmt) => run(fmt, () => buildInventario(invF, categories, proveedores))}
          >
            <ProductFilters value={invF} onChange={setInvF} categories={categories} proveedores={proveedores} showDisabled />
          </ReportCard>

          <ReportCard
            icon={<AlertTriangle size={22} />}
            color="amber"
            title="Stock bajo"
            desc="Artículos en o por debajo del mínimo, con la cantidad por reponer."
            onExport={(fmt) => run(fmt, () => buildStockBajo(lowF, categories, proveedores))}
          >
            <ProductFilters value={lowF} onChange={setLowF} categories={categories} proveedores={proveedores} />
          </ReportCard>

          <ReportCard
            icon={<Ban size={22} />}
            color="red"
            title="Agotados"
            desc="Artículos sin existencias disponibles para la venta."
            onExport={(fmt) => run(fmt, () => buildAgotados(outF, categories, proveedores))}
          >
            <ProductFilters value={outF} onChange={setOutF} categories={categories} proveedores={proveedores} />
          </ReportCard>

          <ReportCard
            icon={<ArrowLeftRight size={22} />}
            color="green"
            title="Movimientos"
            desc="Entradas y salidas por rango de fechas, con totales de unidades."
            onExport={(fmt) => run(fmt, () => buildMovimientos(movF))}
          >
            <MovFilters value={movF} onChange={setMovF} products={productNames} />
          </ReportCard>

          {!defensa && (
            <ReportCard
              icon={<ShoppingCart size={22} />}
              color="cyan"
              title="Pedidos web"
              desc="Pedidos por rango, con estado, quién los revisó y el total aprobado."
              onExport={(fmt) => run(fmt, () => buildPedidos(pedF))}
            >
              <PedFilters value={pedF} onChange={setPedF} />
            </ReportCard>
          )}

          <ReportCard
            icon={<Hourglass size={22} />}
            color="amber"
            title="Productos sin movimiento"
            desc="Lo que no se ha vendido ni movido en un tiempo: dinero detenido en bodega, ideal para ofertas o dejar de comprar."
            onExport={(fmt) => run(fmt, () => buildSinMovimiento(sinF, sinMeses, categories, proveedores))}
          >
            <div>
              <label className={LABEL}>Sin movimiento desde hace</label>
              <select className={FIELD} value={sinMeses} onChange={(e) => setSinMeses(Number(e.target.value))}>
                {MESES_SIN_MOV.map((m) => (
                  <option key={m} value={m}>
                    {m} {m === 1 ? 'mes' : 'meses'} o más
                  </option>
                ))}
              </select>
            </div>
            <ProductFilters value={sinF} onChange={setSinF} categories={categories} proveedores={proveedores} />
          </ReportCard>
        </div>

        {/* Reporte personalizado */}
        <ReportCard
          icon={<SlidersHorizontal size={22} />}
          color="blue"
          title="Reporte personalizado"
          desc="Elige la fuente, marca las columnas que necesitas y aplica filtros."
          onExport={runCustom}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              <div>
                <label className={LABEL}>Fuente de datos</label>
                <select className={FIELD} value={source} onChange={(e) => setSource(e.target.value as Source)}>
                  {(Object.keys(SOURCE_LABEL) as Source[]).filter((s) => !(defensa && s === 'pedidos')).map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              {source === 'productos' && (
                <ProductFilters value={cProdF} onChange={setCProdF} categories={categories} proveedores={proveedores} showDisabled />
              )}
              {source === 'movimientos' && <MovFilters value={cMovF} onChange={setCMovF} products={productNames} />}
              {source === 'pedidos' && <PedFilters value={cPedF} onChange={setCPedF} />}
            </div>

            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <span className={LABEL}>
                  Columnas ({customCols[source].length} de {ALL_KEYS[source].length})
                </span>
                <span className="flex gap-3 text-xs font-semibold">
                  <button
                    type="button"
                    className="text-primary-ink hover:underline"
                    onClick={() => setCustomCols((p) => ({ ...p, [source]: ALL_KEYS[source] }))}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    className="text-text-muted hover:underline"
                    onClick={() => setCustomCols((p) => ({ ...p, [source]: [] }))}
                  >
                    Ninguna
                  </button>
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sourceColumns.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-text cursor-pointer hover:bg-bg"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={customCols[source].includes(c.key)}
                      onChange={() => toggleColumn(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </ReportCard>
      </div>
    </AdminLayout>
  );
}

/* ---------- Componentes pequeños ---------- */

const ICON_STYLES = {
  blue: 'bg-primary-soft text-primary-ink',
  amber: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
  green: 'bg-success-soft text-success',
  cyan: 'bg-info-soft text-info',
} as const;

function Banner({
  tone,
  onClose,
  children,
}: {
  tone: 'danger' | 'info';
  onClose: () => void;
  children: React.ReactNode;
}) {
  const cls =
    tone === 'danger'
      ? 'bg-danger-soft text-danger border-danger/30'
      : 'bg-primary-soft text-primary-ink border-primary/20';
  return (
    <div className={`border rounded-lg p-4 text-sm flex items-start justify-between gap-3 ${cls}`}>
      <span>{children}</span>
      <button type="button" title="Cerrar aviso" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}

function ReportCard({
  icon,
  color,
  title,
  desc,
  children,
  onExport,
}: {
  icon: React.ReactNode;
  color: keyof typeof ICON_STYLES;
  title: string;
  desc: string;
  children: React.ReactNode;
  onExport: (format: Format) => Promise<void>;
}) {
  const [busy, setBusy] = useState<Format | null>(null);

  async function handle(format: Format) {
    setBusy(format);
    try {
      await onExport(format);
    } finally {
      setBusy(null);
    }
  }

  const BTN =
    'flex-1 py-2 text-xs font-semibold bg-surface text-text border border-border rounded-lg hover:bg-bg transition-colors flex items-center justify-center gap-2 disabled:opacity-50';

  return (
    <div className={`${CARD} p-6 flex flex-col gap-4`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${ICON_STYLES[color]}`}>{icon}</div>
        <div>
          <h4 className="font-bold text-text leading-tight">{title}</h4>
          <p className="text-xs text-text-muted mt-1">{desc}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
      <div className="flex gap-2 mt-auto pt-4 border-t border-border">
        <button type="button" disabled={busy !== null} onClick={() => handle('excel')} className={BTN}>
          {busy === 'excel' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel
        </button>
        <button type="button" disabled={busy !== null} onClick={() => handle('pdf')} className={BTN}>
          {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF
        </button>
      </div>
    </div>
  );
}

function ProductFilters({
  value,
  onChange,
  categories,
  proveedores,
  showDisabled = false,
}: {
  value: ProdFilter;
  onChange: (f: ProdFilter) => void;
  categories: CategoryRow[];
  proveedores: ProveedorRow[];
  showDisabled?: boolean;
}) {
  return (
    <>
      <div>
        <label className={LABEL}>Categoría</label>
        <select className={FIELD} value={value.categoria} onChange={(e) => onChange({ ...value, categoria: e.target.value })}>
          <option value="all">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={LABEL}>Proveedor</label>
        <select className={FIELD} value={value.proveedor} onChange={(e) => onChange({ ...value, proveedor: e.target.value })}>
          <option value="all">Todos los proveedores</option>
          <option value="none">Sin proveedor</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>
      {showDisabled && (
        <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={value.deshabilitados}
            onChange={(e) => onChange({ ...value, deshabilitados: e.target.checked })}
          />
          Incluir productos deshabilitados
        </label>
      )}
    </>
  );
}

function DateFields({
  desde,
  hasta,
  onChange,
}: {
  desde: string;
  hasta: string;
  onChange: (desde: string, hasta: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={LABEL}>Desde</label>
        <input type="date" className={FIELD} value={desde} onChange={(e) => onChange(e.target.value, hasta)} />
      </div>
      <div>
        <label className={LABEL}>Hasta</label>
        <input type="date" className={FIELD} value={hasta} onChange={(e) => onChange(desde, e.target.value)} />
      </div>
    </div>
  );
}

function MovFilters({
  value,
  onChange,
  products,
}: {
  value: MovFilter;
  onChange: (f: MovFilter) => void;
  products: ProductName[];
}) {
  return (
    <>
      <DateFields desde={value.desde} hasta={value.hasta} onChange={(desde, hasta) => onChange({ ...value, desde, hasta })} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL}>Tipo</label>
          <select
            className={FIELD}
            value={value.tipo}
            onChange={(e) => onChange({ ...value, tipo: e.target.value as MovFilter['tipo'] })}
          >
            <option value="all">Todos</option>
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>Producto</label>
          <select className={FIELD} value={value.producto} onChange={(e) => onChange({ ...value, producto: e.target.value })}>
            <option value="all">Todos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[11px] text-text-muted">Sin fechas se exporta todo el historial.</p>
    </>
  );
}

function PedFilters({ value, onChange }: { value: PedFilter; onChange: (f: PedFilter) => void }) {
  return (
    <>
      <DateFields desde={value.desde} hasta={value.hasta} onChange={(desde, hasta) => onChange({ ...value, desde, hasta })} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL}>Estado</label>
          <select
            className={FIELD}
            value={value.estado}
            onChange={(e) => onChange({ ...value, estado: e.target.value as EstadoFilter })}
          >
            <option value="all">Todos</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Aprobado">Aprobado</option>
            <option value="Rechazado">Rechazado</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>Pago</label>
          <select
            className={FIELD}
            value={value.pago}
            onChange={(e) => onChange({ ...value, pago: e.target.value as PagoFilter })}
          >
            <option value="all">Todos</option>
            <option value="sinpe">SINPE</option>
            <option value="transferencia">Transferencia</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
      </div>
    </>
  );
}
