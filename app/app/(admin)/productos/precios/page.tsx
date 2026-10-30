"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { traerTodo } from '@/lib/paginar';
import { registrarActividad } from '@/lib/actividad';
import { X, Percent, Loader2, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

// =====================================================================
// ACTUALIZAR PRECIOS EN MASA
// Se eligen productos (categoría / proveedor / búsqueda), una regla
// (% o monto) y un redondeo. Se ve el resultado ANTES de aplicar.
// =====================================================================

type Producto = {
  id: string;
  nombre: string;
  sku: string | null;
  precio: number | null;
  categoria_id: string | null;
  proveedor_id: string | null;
  habilitado: boolean | null;
};
type Opcion = { id: string; nombre: string };
type Tipo = 'subir_pct' | 'bajar_pct' | 'sumar' | 'restar';

const TIPOS: { value: Tipo; label: string }[] = [
  { value: 'subir_pct', label: 'Subir un porcentaje (%)' },
  { value: 'bajar_pct', label: 'Bajar un porcentaje (%)' },
  { value: 'sumar', label: 'Sumar un monto (₡)' },
  { value: 'restar', label: 'Restar un monto (₡)' },
];
const REDONDEOS = [
  { value: 0, label: 'Sin redondeo' },
  { value: 5, label: 'Al ₡5 más cercano' },
  { value: 10, label: 'Al ₡10 más cercano' },
  { value: 25, label: 'Al ₡25 más cercano' },
  { value: 50, label: 'Al ₡50 más cercano' },
  { value: 100, label: 'Al ₡100 más cercano' },
];
const LOTE = 500; // productos por envío a la base

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all';
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-text-soft mb-1';
const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-soft';
const TD = 'px-4 py-2.5';

function precio(v: number): string {
  return `₡${v.toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;
}

function calcular(actual: number, tipo: Tipo, valor: number, redondeo: number): number {
  let nuevo = actual;
  if (tipo === 'subir_pct') nuevo = actual * (1 + valor / 100);
  else if (tipo === 'bajar_pct') nuevo = actual * (1 - valor / 100);
  else if (tipo === 'sumar') nuevo = actual + valor;
  else nuevo = actual - valor;
  nuevo = redondeo > 0 ? Math.round(nuevo / redondeo) * redondeo : Math.round(nuevo * 100) / 100;
  return nuevo;
}

function describirRegla(tipo: Tipo, valor: number, redondeo: number): string {
  const regla =
    tipo === 'subir_pct' ? `+${valor}%` : tipo === 'bajar_pct' ? `−${valor}%` : tipo === 'sumar' ? `+${precio(valor)}` : `−${precio(valor)}`;
  return redondeo > 0 ? `${regla}, redondeo a ₡${redondeo}` : regla;
}

export default function PreciosMasaPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Opcion[]>([]);
  const [proveedores, setProveedores] = useState<Opcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // Filtros
  const [categoria, setCategoria] = useState('all');
  const [proveedor, setProveedor] = useState('all');
  const [busqueda, setBusqueda] = useState('');
  const [conDeshabilitados, setConDeshabilitados] = useState(false);

  // Regla
  const [tipo, setTipo] = useState<Tipo>('subir_pct');
  const [valorTxt, setValorTxt] = useState('');
  const [redondeo, setRedondeo] = useState(0);

  // Productos que el usuario quitó de la lista a mano
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const [prodRes, catRes, provRes] = await Promise.all([
        traerTodo<Producto>((a, b) =>
          supabase
            .from('productos')
            .select('id, nombre, sku, precio, categoria_id, proveedor_id, habilitado')
            .order('nombre')
            .order('id')
            .range(a, b)
        ),
        supabase.from('categorias').select('id, nombre').order('nombre'),
        supabase.from('proveedores').select('id, nombre').order('nombre'),
      ]);
      if (prodRes.error) setError(prodRes.error.message);
      setProductos(prodRes.data ?? []);
      setCategorias((catRes.data ?? []) as Opcion[]);
      setProveedores((provRes.data ?? []) as Opcion[]);
      setCargando(false);
    }
    cargar();
  }, [recarga]);

  const valor = Number(valorTxt.replace(',', '.'));
  const valorValido = valorTxt.trim() !== '' && Number.isFinite(valor) && valor > 0;
  const errorValor = !valorTxt.trim()
    ? null
    : !valorValido
      ? 'Escribe un número mayor a 0.'
      : (tipo === 'subir_pct' || tipo === 'bajar_pct') && valor > (tipo === 'bajar_pct' ? 90 : 200)
        ? `Máximo ${tipo === 'bajar_pct' ? 90 : 200}%.`
        : null;

  // Productos que cumplen los filtros
  const elegidos = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    return productos.filter(
      (p) =>
        (categoria === 'all' || p.categoria_id === (categoria === 'none' ? null : categoria)) &&
        (proveedor === 'all' || p.proveedor_id === (proveedor === 'none' ? null : proveedor)) &&
        (conDeshabilitados || p.habilitado !== false) &&
        (!term || [p.nombre, p.sku].some((v) => v?.toLowerCase().includes(term)))
    );
  }, [productos, categoria, proveedor, busqueda, conDeshabilitados]);

  // Vista previa: solo los que realmente cambian
  const vista = useMemo(() => {
    if (!valorValido || errorValor) return [];
    return elegidos
      .map((p) => {
        const actual = Number(p.precio ?? 0);
        const nuevo = calcular(actual, tipo, valor, redondeo);
        return { ...p, actual, nuevo };
      })
      .filter((p) => p.nuevo !== p.actual);
  }, [elegidos, tipo, valor, valorValido, errorValor, redondeo]);

  const negativos = vista.filter((p) => p.nuevo < 0);
  const aAplicar = vista.filter((p) => !excluidos.has(p.id) && p.nuevo >= 0);

  // Al cambiar filtros o regla, la confirmación y las exclusiones se reinician
  useEffect(() => {
    setConfirmando(false);
    setExcluidos(new Set());
  }, [categoria, proveedor, busqueda, conDeshabilitados, tipo, valorTxt, redondeo]);

  function alternar(id: string) {
    setExcluidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  async function aplicar() {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setError(null);
    setAplicando(true);
    try {
      let total = 0;
      for (let i = 0; i < aAplicar.length; i += LOTE) {
        const cambios = aAplicar.slice(i, i + LOTE).map((p) => ({ id: p.id, precio: p.nuevo }));
        const { data, error: err } = await supabase.rpc('actualizar_precios_lote', { cambios });
        if (err) throw new Error(err.message);
        total += Number(data ?? 0);
      }

      const filtro = [
        categoria !== 'all' && `categoría ${categoria === 'none' ? 'sin categoría' : categorias.find((c) => c.id === categoria)?.nombre}`,
        proveedor !== 'all' && `proveedor ${proveedor === 'none' ? 'sin proveedor' : proveedores.find((p) => p.id === proveedor)?.nombre}`,
        busqueda.trim() && `búsqueda "${busqueda.trim()}"`,
      ]
        .filter(Boolean)
        .join(', ');
      await registrarActividad({
        accion: 'editar',
        entidad: 'producto',
        entidad_id: null,
        detalle: `Actualizó el precio de ${total} producto(s) (${describirRegla(tipo, valor, redondeo)}${filtro ? ` · ${filtro}` : ''})`,
      });

      setExito(`Se actualizó el precio de ${total} producto(s).`);
      setValorTxt('');
      setRecarga((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron actualizar los precios.');
    } finally {
      setAplicando(false);
      setConfirmando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text tracking-tight">Actualizar precios</h2>
          <p className="text-text-muted text-sm">Cambia el precio de varios productos a la vez, viendo el resultado antes de aplicar</p>
        </div>
        <Link
          href="/productos"
          className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2"
        >
          <X size={16} /> Volver
        </Link>
      </div>

      {error && <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">{error}</div>}
      {exito && (
        <div className="bg-success-soft text-success border border-success/30 rounded-lg p-4 text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} /> {exito}
          </span>
          <button type="button" onClick={() => setExito(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Qué productos */}
        <div className={`${CARD} p-6 space-y-4`}>
          <h3 className="text-[15px] font-semibold text-text">1. ¿Qué productos?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Categoría</label>
              <select className={FIELD} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="all">Todas</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
                <option value="none">Sin categoría</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Proveedor</label>
              <select className={FIELD} value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                <option value="all">Todos</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
                <option value="none">Sin proveedor</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Buscar (opcional)</label>
              <input
                className={FIELD}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre o SKU, ej. 'tornillo'"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-soft cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={conDeshabilitados}
              onChange={(e) => setConDeshabilitados(e.target.checked)}
            />
            Incluir productos deshabilitados
          </label>
          <p className="text-xs text-text-muted">
            {cargando ? 'Cargando productos…' : `${elegidos.length} producto(s) cumplen estos filtros.`}
          </p>
        </div>

        {/* 2. Regla */}
        <div className={`${CARD} p-6 space-y-4`}>
          <h3 className="text-[15px] font-semibold text-text">2. ¿Cómo cambia el precio?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={LABEL}>Cambio</label>
              <select className={FIELD} value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>{tipo.endsWith('pct') ? 'Porcentaje' : 'Monto (₡)'}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={FIELD}
                value={valorTxt}
                onChange={(e) => setValorTxt(e.target.value)}
                placeholder={tipo.endsWith('pct') ? 'Ej. 8' : 'Ej. 500'}
              />
              {errorValor && <p className="text-xs text-danger mt-1">{errorValor}</p>}
            </div>
            <div>
              <label className={LABEL}>Redondeo</label>
              <select className={FIELD} value={redondeo} onChange={(e) => setRedondeo(Number(e.target.value))}>
                {REDONDEOS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {valorValido && !errorValor && (
            <div className="bg-bg border border-border rounded-lg p-3 text-sm text-text-soft">
              Ejemplo: un producto de {precio(10000)} quedaría en{' '}
              <strong className="text-text">{precio(calcular(10000, tipo, valor, redondeo))}</strong>.
            </div>
          )}
        </div>
      </div>

      {/* 3. Vista previa */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-text">3. Revisa y aplica</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {vista.length === 0
                ? 'Elige los productos y el cambio para ver el resultado.'
                : `${aAplicar.length} de ${vista.length} producto(s) cambiarán de precio. Desmarca los que no quieras cambiar.`}
            </p>
          </div>
          {vista.length > 0 && (
            <div className="flex items-center gap-3">
              {confirmando && !aplicando && (
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={aplicar}
                disabled={aplicando || aAplicar.length === 0}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 ${
                  confirmando ? 'bg-danger hover:opacity-90' : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {aplicando ? <Loader2 size={16} className="animate-spin" /> : <Percent size={16} />}
                {aplicando
                  ? 'Aplicando…'
                  : confirmando
                    ? `Sí, cambiar ${aAplicar.length} precio(s)`
                    : `Aplicar a ${aAplicar.length} producto(s)`}
              </button>
            </div>
          )}
        </div>

        {confirmando && (
          <div className="px-6 py-3 bg-warning-soft text-amber-800 text-sm flex items-center gap-2 border-b border-border">
            <AlertTriangle size={16} /> Se cambiará el precio de {aAplicar.length} producto(s) ({describirRegla(tipo, valor, redondeo)}).
            Los cambios se ven al instante en la página web. Presiona otra vez para confirmar.
          </div>
        )}
        {negativos.length > 0 && (
          <div className="px-6 py-3 bg-danger-soft text-danger text-sm border-b border-border">
            {negativos.length} producto(s) quedarían con precio negativo y se omitirán.
          </div>
        )}

        {vista.length > 0 && (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-alt border-b border-border sticky top-0">
                <tr>
                  <th className={`${TH} w-10`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      title="Marcar o desmarcar todos"
                      checked={excluidos.size === 0}
                      onChange={() => setExcluidos(excluidos.size === 0 ? new Set(vista.map((p) => p.id)) : new Set())}
                    />
                  </th>
                  <th className={TH}>Producto</th>
                  <th className={`${TH} text-right`}>Precio actual</th>
                  <th className={TH}></th>
                  <th className={`${TH} text-right`}>Precio nuevo</th>
                  <th className={`${TH} text-right`}>Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vista.map((p) => {
                  const fuera = excluidos.has(p.id) || p.nuevo < 0;
                  const dif = p.nuevo - p.actual;
                  return (
                    <tr key={p.id} className={fuera ? 'opacity-40' : 'hover:bg-surface-alt'}>
                      <td className={TD}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={!fuera}
                          disabled={p.nuevo < 0}
                          onChange={() => alternar(p.id)}
                        />
                      </td>
                      <td className={TD}>
                        <div className="font-medium text-text">{p.nombre}</div>
                        <div className="text-xs text-text-muted">
                          {p.sku || 'Sin SKU'}
                          {p.habilitado === false && ' · Deshabilitado'}
                        </div>
                      </td>
                      <td className={`${TD} text-right text-text-soft`}>{precio(p.actual)}</td>
                      <td className={`${TD} text-text-muted`}>
                        <ArrowRight size={14} />
                      </td>
                      <td className={`${TD} text-right font-semibold text-text`}>{precio(p.nuevo)}</td>
                      <td className={`${TD} text-right font-medium ${dif > 0 ? 'text-success' : 'text-danger'}`}>
                        {dif > 0 ? '+' : '−'}
                        {precio(Math.abs(dif))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
