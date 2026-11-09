"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { traerTodo } from '@/lib/paginar';
import { etiquetaUsuario, registrarActividad } from '@/lib/actividad';
import { useDefensa } from '@/lib/defensa';
import { useLimpiarAlSalir } from '@/lib/limpiarAlSalir';
import SubirImagen from '@/components/SubirImagen';
import { aCampoFecha, finDelDia, formatoColones, hoyCampoFecha, inicioDelDia, repartirPaquete } from '@/lib/promos';
import { plantillaAlAzar } from '@/lib/plantillas';
import { Boxes, CheckCircle2, Edit, Eye, List, Loader2, Plus, Save, Search, Trash2, X } from 'lucide-react';

// =====================================================================
// PAQUETES: 2 o más productos con un solo precio.
// - Producto propio: el paquete es un producto más, con su propio stock
//   (se le da entrada en Entradas, como a cualquier producto).
// - Descontar de los existentes: no tiene stock propio; al venderlo baja
//   el stock de cada producto. Hay tantos como alcance el que menos tenga.
// - Regalía: un producto del paquete que va incluido sin costo (₡0);
//   el precio del paquete se reparte entre los demás.
// =====================================================================

type Modo = 'propio' | 'componentes';
type Producto = {
  id: string;
  nombre: string;
  sku: string | null;
  precio: number | null;
  stock: number | null;
  categoria_id: string | null;
  imagen_principal: string | null;
  habilitado: boolean | null;
};
type Item = { producto_id: string; cantidad: number; regalia: boolean };
type Paquete = {
  id: string;
  nombre: string;
  descripcion: string | null;
  imagen: string | null;
  modo: Modo;
  producto_id: string | null;
  precio: number | null;
  sello_texto: string | null;
  en_web: boolean;
  activo: boolean;
  inicia: string;
  termina: string | null;
  creado_por: string | null;
  paquete_items: Item[];
};
type Opcion = { id: string; nombre: string };

type Form = {
  id: string | null;
  nombre: string;
  descripcion: string;
  modo: Modo;
  precio: string;
  categoria: string;
  imagen: string;
  sello: string;
  enWeb: boolean;
  inicia: string;
  termina: string;
  items: Item[];
};

const VACIO: Form = {
  id: null,
  nombre: '',
  descripcion: '',
  modo: 'componentes',
  precio: '',
  categoria: '',
  imagen: '',
  sello: '',
  enWeb: true,
  inicia: '',
  termina: '',
  items: [],
};

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all disabled:opacity-50';
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-text-soft mb-1';
const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-soft';
const TD = 'px-4 py-2.5';
const pct = (normal: number, final: number) => (normal > 0 ? Math.round(((normal - final) / normal) * 1000) / 10 : 0);

export default function PaquetesPage() {
  const defensa = useDefensa();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Opcion[]>([]);
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [vista, setVista] = useState<'lista' | 'form'>('lista');
  const [form, setForm] = useState<Form | null>(null);
  const [viendo, setViendo] = useState<Paquete | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  // Al salir de la pantalla se borran avisos y el formulario a medias
  useLimpiarAlSalir(setError, setExito, setForm, setViendo, () => setBusqueda(''), () => setVista('lista'));

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const [prodRes, catRes, paqRes] = await Promise.all([
        traerTodo<Producto>((a, b) =>
          supabase
            .from('productos')
            .select('id, nombre, sku, precio, stock, categoria_id, imagen_principal, habilitado')
            .order('nombre')
            .order('id')
            .range(a, b)
        ),
        supabase.from('categorias').select('id, nombre').order('nombre'),
        supabase
          .from('paquetes')
          .select('*, paquete_items(producto_id, cantidad, regalia)')
          .eq('activo', true)
          .order('created_at', { ascending: false }),
      ]);
      if (prodRes.error || paqRes.error) setError((prodRes.error ?? paqRes.error)!.message);
      const lista = (paqRes.data ?? []) as Paquete[];
      setProductos(prodRes.data ?? []);
      setCategorias((catRes.data ?? []) as Opcion[]);
      setPaquetes(lista);
      setCargando(false);

      // Desde Productos se puede llegar con ?ver=id o ?editar=id
      const params = new URLSearchParams(window.location.search);
      const ver = lista.find((p) => p.id === params.get('ver'));
      if (ver) setViendo(ver);
      const ed = lista.find((p) => p.id === params.get('editar'));
      if (ed) editarConProductos(ed, prodRes.data ?? []);
      if (ver || ed) window.history.replaceState({}, '', '/productos/paquetes');
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarga]);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  // ---- Cálculos de un paquete ----
  function precioNormal(items: Item[]) {
    return items.reduce((s, i) => s + Number(porId.get(i.producto_id)?.precio ?? 0) * i.cantidad, 0);
  }
  function disponibles(p: { modo: Modo; producto_id: string | null; items: Item[] }) {
    if (p.modo === 'propio') return Math.max(Number(porId.get(p.producto_id ?? '')?.stock ?? 0), 0);
    if (p.items.length === 0) return 0;
    return Math.min(
      ...p.items.map((i) => {
        const prod = porId.get(i.producto_id);
        if (!prod || prod.habilitado === false) return 0;
        return Math.floor(Math.max(Number(prod.stock ?? 0), 0) / i.cantidad);
      })
    );
  }
  function precioDe(p: Paquete) {
    return p.modo === 'propio' ? Number(porId.get(p.producto_id ?? '')?.precio ?? 0) : Number(p.precio ?? 0);
  }
  const nombreItem = (i: Item) =>
    `${i.cantidad > 1 ? `${i.cantidad}× ` : ''}${porId.get(i.producto_id)?.nombre ?? '—'}${i.regalia ? ' (regalía)' : ''}`;

  // ---- Formulario ----
  function nuevo() {
    setError(null);
    setExito(null);
    setBusqueda('');
    setForm({ ...VACIO, inicia: hoyCampoFecha() });
    setVista('form');
  }

  function editarConProductos(p: Paquete, lista: Producto[]) {
    setError(null);
    setExito(null);
    setBusqueda('');
    const prod = p.producto_id ? lista.find((x) => x.id === p.producto_id) : null;
    setForm({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      modo: p.modo,
      precio: String((p.modo === 'propio' ? prod?.precio : p.precio) ?? ''),
      categoria: prod?.categoria_id ?? '',
      imagen: p.imagen ?? '',
      sello: p.sello_texto ?? '',
      enWeb: p.en_web,
      inicia: aCampoFecha(p.inicia),
      termina: aCampoFecha(p.termina, true),
      items: p.paquete_items.map((i) => ({ ...i, regalia: !!i.regalia })),
    });
    setViendo(null);
    setVista('form');
  }
  const editar = (p: Paquete) => editarConProductos(p, productos);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setItem = (n: number, cambios: Partial<Item>) =>
    setForm((f) => (f ? { ...f, items: f.items.map((x, k) => (k === n ? { ...x, ...cambios } : x)) } : f));

  const candidatos = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!form || t.length < 2) return [];
    const usados = new Set(form.items.map((i) => i.producto_id));
    // Un paquete no puede contenerse a sí mismo ni a otro paquete propio
    const propios = new Set(paquetes.map((p) => p.producto_id).filter(Boolean));
    return productos
      .filter(
        (p) =>
          p.habilitado !== false &&
          !usados.has(p.id) &&
          !propios.has(p.id) &&
          [p.nombre, p.sku].some((v) => v?.toLowerCase().includes(t))
      )
      .slice(0, 8);
  }, [busqueda, form, productos, paquetes]);

  const precioPaquete = Number(form?.precio ?? 0);
  const normalForm = form ? precioNormal(form.items) : 0;
  const partes =
    form && precioPaquete > 0
      ? repartirPaquete(
          precioPaquete,
          form.items.map((i) => ({ precio: Number(porId.get(i.producto_id)?.precio ?? 0), cantidad: i.cantidad, regalia: i.regalia }))
        )
      : [];

  async function guardar() {
    if (!form) return;
    setError(null);
    const nombre = form.nombre.trim();
    const unidades = form.items.reduce((s, i) => s + i.cantidad, 0);
    if (nombre.length < 3) return setError('Escribe el nombre del paquete (mínimo 3 letras).');
    if (unidades < 2) return setError('Un paquete lleva al menos 2 productos (o 2 unidades del mismo).');
    if (form.items.every((i) => i.regalia)) return setError('Al menos un producto del paquete debe cobrarse (no todos pueden ser regalía).');
    if (!(precioPaquete > 0)) return setError('Escribe el precio del paquete.');
    if (precioPaquete >= normalForm)
      return setError(`El precio del paquete debe ser menor a la suma normal (${formatoColones(normalForm)}).`);
    if (!form.inicia) return setError('Elige la fecha de inicio.');
    if (form.termina && form.termina < form.inicia) return setError('La fecha de fin no puede ser antes del inicio.');

    setGuardando(true);
    try {
      const anterior = form.id ? paquetes.find((p) => p.id === form.id) : null;
      if (anterior && anterior.modo !== form.modo)
        throw new Error('No se puede cambiar el tipo de un paquete ya creado. Termínalo y crea uno nuevo.');

      // Producto propio: el paquete es un producto (su precio y stock viven en "productos")
      let productoId = anterior?.producto_id ?? null;
      if (form.modo === 'propio') {
        const nombreCat = categorias.find((c) => c.id === form.categoria)?.nombre;
        const datosProd = {
          nombre,
          descripcion: form.descripcion.trim(),
          precio: precioPaquete,
          categoria_id: form.categoria || null,
          imagen_principal:
            form.imagen.trim() || porId.get(form.items[0].producto_id)?.imagen_principal || plantillaAlAzar(nombreCat),
          activo: form.enWeb,
        };
        if (productoId) {
          const { error: e } = await supabase.from('productos').update(datosProd).eq('id', productoId);
          if (e) throw e;
        } else {
          const { data, error: e } = await supabase.from('productos').insert({ ...datosProd, stock: 0 }).select('id').single();
          if (e) throw e;
          productoId = (data as { id: string }).id;
        }
      }

      const datos = {
        nombre,
        descripcion: form.descripcion.trim() || null,
        imagen: form.imagen.trim() || null,
        modo: form.modo,
        producto_id: form.modo === 'propio' ? productoId : null,
        precio: form.modo === 'componentes' ? precioPaquete : null,
        sello_texto: form.sello.trim().toUpperCase() || null,
        en_web: form.enWeb,
        inicia: inicioDelDia(form.inicia),
        termina: form.termina ? finDelDia(form.termina) : null,
      };

      let paqueteId = form.id;
      if (paqueteId) {
        const { error: e } = await supabase.from('paquetes').update(datos).eq('id', paqueteId);
        if (e) throw e;
        const { error: e2 } = await supabase.from('paquete_items').delete().eq('paquete_id', paqueteId);
        if (e2) throw e2;
      } else {
        const { data, error: e } = await supabase
          .from('paquetes')
          .insert({ ...datos, creado_por: await etiquetaUsuario() })
          .select('id')
          .single();
        if (e) throw e;
        paqueteId = (data as { id: string }).id;
      }
      const { error: e3 } = await supabase.from('paquete_items').insert(
        form.items.map((i) => ({ paquete_id: paqueteId, producto_id: i.producto_id, cantidad: i.cantidad, regalia: i.regalia }))
      );
      if (e3) throw e3;

      await registrarActividad({
        accion: form.id ? 'editar' : 'crear',
        entidad: 'paquete',
        entidad_id: paqueteId,
        detalle: `${form.id ? 'Editó' : 'Creó'} el paquete "${nombre}" (${formatoColones(normalForm)} → ${formatoColones(precioPaquete)})`,
      });
      setExito(
        form.modo === 'propio' && !form.id
          ? `Paquete "${nombre}" creado. Dale entrada en Entradas para tener existencias.`
          : `Paquete "${nombre}" guardado.`
      );
      setForm(null);
      setVista('lista');
      setRecarga((n) => n + 1);
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'No se pudo guardar el paquete.');
    } finally {
      setGuardando(false);
    }
  }

  async function terminar(p: Paquete) {
    if (!confirm(`¿Terminar el paquete "${p.nombre}"? Deja de venderse.${p.modo === 'propio' ? ' El producto del paquete se quita de la web.' : ''}`)) return;
    const { error: e } = await supabase.from('paquetes').update({ activo: false }).eq('id', p.id);
    if (e) return setError(e.message);
    if (p.producto_id) await supabase.from('productos').update({ activo: false }).eq('id', p.producto_id);
    await registrarActividad({ accion: 'eliminar', entidad: 'paquete', entidad_id: p.id, detalle: `Terminó el paquete "${p.nombre}"` });
    setViendo(null);
    setRecarga((n) => n + 1);
  }

  const pestana = (activa: boolean) =>
    `px-4 py-2 text-sm font-semibold rounded-lg border transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${
      activa ? 'bg-primary text-white border-primary' : 'bg-surface border-border text-text-soft hover:bg-bg'
    }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-text tracking-tight">Paquetes</h2>
          <p className="text-text-muted text-sm">Junta 2 o más productos con un solo precio</p>
        </div>
        <Link
          href="/productos"
          className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center justify-center gap-2 whitespace-nowrap self-start sm:self-auto"
        >
          <X size={16} /> Volver
        </Link>
      </div>

      {/* Pestañas */}
      <div className="grid grid-cols-2 gap-2 max-w-md">
        <button
          type="button"
          onClick={() => {
            setVista('lista');
            setForm(null);
          }}
          className={pestana(vista === 'lista')}
        >
          <List size={16} /> Lista ({paquetes.length})
        </button>
        <button type="button" onClick={() => (form ? setVista('form') : nuevo())} className={pestana(vista === 'form')}>
          <Plus size={16} /> {form?.id ? 'Editar paquete' : 'Nuevo paquete'}
        </button>
      </div>

      {error && <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">{error}</div>}
      {exito && (
        <div className="bg-success-soft text-success border border-success/30 rounded-lg p-4 text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} /> {exito}
          </span>
          <button type="button" onClick={() => setExito(null)} aria-label="Cerrar aviso">
            <X size={16} />
          </button>
        </div>
      )}

      {vista === 'form' && form && (
        <div className={`${CARD} p-6 space-y-5`}>
          <h3 className="text-[15px] font-semibold text-text">{form.id ? 'Editar paquete' : 'Nuevo paquete'}</h3>

          {/* Tipo: uno u otro */}
          <div>
            <label className={LABEL}>Tipo de paquete</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                ['componentes', 'Descontar de los existentes', 'No tiene stock propio: al venderlo baja el stock de cada producto.'],
                ['propio', 'Producto propio', 'Es un producto más, con su propio stock (se le da entrada en Entradas).'],
              ] as const).map(([valor, titulo, texto]) => (
                <label
                  key={valor}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                    form.modo === valor ? 'border-primary bg-primary-soft' : 'border-border bg-bg'
                  } ${form.id ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="modo"
                    className="mt-1 accent-primary"
                    checked={form.modo === valor}
                    disabled={!!form.id}
                    onChange={() => set('modo', valor)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-text">{titulo}</span>
                    <span className="block text-xs text-text-muted">{texto}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Nombre *</label>
              <input className={FIELD} value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej. Taladro + juego de brocas" />
            </div>
            {form.modo === 'propio' && (
              <div>
                <label className={LABEL}>Categoría</label>
                <select className={FIELD} value={form.categoria} onChange={(e) => set('categoria', e.target.value)}>
                  <option value="">Sin categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="md:col-span-2">
              <label className={LABEL}>Descripción</label>
              <textarea
                className={`${FIELD} h-20 resize-none`}
                value={form.descripcion}
                onChange={(e) => set('descripcion', e.target.value)}
                placeholder="Qué incluye y por qué conviene"
              />
            </div>
          </div>

          {/* Productos */}
          <div className="space-y-2">
            <label className={LABEL}>Productos del paquete *</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                className={`${FIELD} pl-9`}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Busca por nombre o SKU para agregar…"
              />
              {candidatos.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {candidatos.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          set('items', [...form.items, { producto_id: p.id, cantidad: 1, regalia: false }]);
                          setBusqueda('');
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-bg flex justify-between gap-3"
                      >
                        <span className="truncate">{p.nombre}</span>
                        <span className="text-text-muted whitespace-nowrap">
                          {formatoColones(Number(p.precio ?? 0))} · stock {p.stock ?? 0}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {form.items.length > 0 && (
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-surface-alt border-b border-border">
                    <tr>
                      <th className={TH}>Producto</th>
                      <th className={`${TH} text-right`}>Cant.</th>
                      <th className={`${TH} text-center`} title="Va incluido sin costo">
                        Regalía
                      </th>
                      <th className={`${TH} text-right`}>Precio normal</th>
                      <th className={`${TH} text-right`}>En el paquete</th>
                      <th className={`${TH} text-right`}>Baja</th>
                      <th className={TH}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {form.items.map((i, n) => {
                      const prod = porId.get(i.producto_id);
                      const normal = Number(prod?.precio ?? 0) * i.cantidad;
                      const parte = partes[n];
                      return (
                        <tr key={i.producto_id} className={i.regalia ? 'bg-success-soft/40' : ''}>
                          <td className={TD}>
                            <div className="font-medium text-text">{prod?.nombre ?? 'Producto eliminado'}</div>
                            <div className="text-xs text-text-muted">Stock {prod?.stock ?? 0}</div>
                          </td>
                          <td className={`${TD} text-right`}>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              className="w-16 px-2 py-1 bg-bg border border-border rounded text-right"
                              value={i.cantidad}
                              onChange={(e) => setItem(n, { cantidad: Math.max(1, Math.min(50, Math.floor(Number(e.target.value) || 1))) })}
                            />
                          </td>
                          <td className={`${TD} text-center`}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={i.regalia}
                              onChange={(e) => setItem(n, { regalia: e.target.checked })}
                              aria-label={`${prod?.nombre ?? 'Producto'} va de regalía`}
                            />
                          </td>
                          <td className={`${TD} text-right text-text-soft`}>{formatoColones(normal)}</td>
                          <td className={`${TD} text-right font-semibold`}>
                            {i.regalia ? <span className="text-success">Regalía (₡0)</span> : parte != null ? formatoColones(parte) : '—'}
                          </td>
                          <td className={`${TD} text-right text-danger whitespace-nowrap`}>
                            {parte != null && normal > 0 ? `−${pct(normal, parte)}%` : '—'}
                          </td>
                          <td className={TD}>
                            <button
                              type="button"
                              title="Quitar"
                              onClick={() => set('items', form.items.filter((_, k) => k !== n))}
                              className="p-1.5 rounded text-danger hover:bg-danger-soft"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-text-muted">
              Marca &quot;Regalía&quot; en el producto que va incluido sin costo (ej. el rodillo con la pintura). El precio del paquete se
              reparte entre los demás.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={LABEL}>Precio del paquete (₡) *</label>
              <input
                type="number"
                min="1"
                className={FIELD}
                value={form.precio}
                onChange={(e) => set('precio', e.target.value)}
                placeholder={normalForm ? `Menos de ${formatoColones(normalForm)}` : ''}
              />
            </div>
            <div>
              <label className={LABEL}>Desde</label>
              <input type="date" className={FIELD} value={form.inicia} onChange={(e) => set('inicia', e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Hasta (opcional)</label>
              <input type="date" className={FIELD} value={form.termina} onChange={(e) => set('termina', e.target.value)} />
            </div>
          </div>

          {/* Comparativa */}
          {form.items.length > 0 && (
            <div className="rounded-lg border border-border bg-bg p-4 text-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-text-muted">Suma a precio normal</p>
                <p className="font-semibold tabular-nums">{formatoColones(normalForm)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Precio del paquete</p>
                <p className="font-semibold tabular-nums">{precioPaquete > 0 ? formatoColones(precioPaquete) : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Baja por el paquete</p>
                <p className={`font-semibold tabular-nums ${precioPaquete > 0 && precioPaquete < normalForm ? 'text-danger' : ''}`}>
                  {precioPaquete > 0 && normalForm > 0
                    ? `−${formatoColones(normalForm - precioPaquete)} (−${pct(normalForm, precioPaquete)}%)`
                    : '—'}
                </p>
              </div>
              {form.modo === 'componentes' && (
                <p className="sm:col-span-3 text-xs text-text-muted">
                  Con el stock de hoy alcanza para {disponibles({ modo: 'componentes', producto_id: null, items: form.items })} paquete(s).
                </p>
              )}
            </div>
          )}

          {!defensa && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Texto del sello en la web (opcional)</label>
                <input className={FIELD} maxLength={40} value={form.sello} onChange={(e) => set('sello', e.target.value)} placeholder="Ej. CON REGALÍA, COMBO NAVIDEÑO" />
              </div>
              <label className="flex items-center gap-2 text-sm text-text cursor-pointer md:mt-6">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.enWeb} onChange={(e) => set('enWeb', e.target.checked)} />
                Mostrar en la web
              </label>
            </div>
          )}

          <div className="max-w-sm">
            <label className={LABEL}>Imagen (opcional)</label>
            {form.imagen && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imagen} alt="" className="w-28 h-28 object-contain rounded-lg border border-border bg-bg mb-2" />
            )}
            <SubirImagen carpeta="productos" onSubida={(url) => set('imagen', url)} />
            {form.imagen && (
              <button type="button" onClick={() => set('imagen', '')} className="mt-2 text-xs font-medium text-danger hover:underline">
                Quitar imagen
              </button>
            )}
            <p className="text-xs text-text-muted mt-1">Si no subes una, se usan las fotos de los productos.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setVista('lista');
              }}
              className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg justify-center whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="px-5 py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary-dark flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-60"
            >
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {form.id ? 'Guardar cambios' : 'Crear paquete'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {vista === 'lista' && (
        <div className={`${CARD} overflow-hidden`}>
          {cargando ? (
            <div className="p-16 text-center text-text-muted italic">Cargando paquetes…</div>
          ) : paquetes.length === 0 ? (
            <div className="p-16 text-center text-text-muted">
              <Boxes size={36} className="mx-auto mb-2" />
              Aún no hay paquetes activos.
              <div className="mt-4">
                <button type="button" onClick={nuevo} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark">
                  Crear el primero
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface-alt border-b border-border">
                  <tr>
                    <th className={TH}>Paquete</th>
                    <th className={TH}>Tipo</th>
                    <th className={`${TH} text-right`}>Normal</th>
                    <th className={`${TH} text-right`}>Paquete</th>
                    <th className={`${TH} text-right`}>Disponibles</th>
                    <th className={TH}>Vigencia</th>
                    <th className={`${TH} text-right`}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paquetes.map((p) => {
                    const normal = precioNormal(p.paquete_items);
                    const precio = precioDe(p);
                    return (
                      <tr key={p.id} className="hover:bg-surface-alt">
                        <td className={TD}>
                          <div className="font-medium text-text">{p.nombre}</div>
                          <div className="text-xs text-text-muted">{p.paquete_items.map(nombreItem).join(' + ')}</div>
                        </td>
                        <td className={`${TD} whitespace-nowrap`}>{p.modo === 'propio' ? 'Producto propio' : 'De los existentes'}</td>
                        <td className={`${TD} text-right text-text-muted line-through whitespace-nowrap`}>{formatoColones(normal)}</td>
                        <td className={`${TD} text-right whitespace-nowrap`}>
                          <span className="font-semibold text-danger">{formatoColones(precio)}</span>
                          {normal > 0 && <span className="block text-xs text-text-muted">−{pct(normal, precio)}%</span>}
                        </td>
                        <td className={`${TD} text-right font-semibold`}>
                          {disponibles({ modo: p.modo, producto_id: p.producto_id, items: p.paquete_items })}
                        </td>
                        <td className={`${TD} text-text-soft whitespace-nowrap`}>
                          {aCampoFecha(p.inicia)}
                          {p.termina ? ` → ${aCampoFecha(p.termina, true)}` : ' → sin fin'}
                        </td>
                        <td className={TD}>
                          <div className="flex justify-end gap-1">
                            <button type="button" title="Ver" onClick={() => setViendo(p)} className="p-2 rounded-lg text-text-soft hover:bg-bg">
                              <Eye size={16} />
                            </button>
                            <button type="button" title="Editar" onClick={() => editar(p)} className="p-2 rounded-lg text-text-soft hover:bg-bg">
                              <Edit size={16} />
                            </button>
                            <button type="button" title="Terminar" onClick={() => terminar(p)} className="p-2 rounded-lg text-danger hover:bg-danger-soft">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Ver paquete */}
      {viendo && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setViendo(null)} role="dialog" aria-modal="true">
          <div className={`${CARD} w-full max-w-2xl max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 p-6 border-b border-border">
              <div>
                <h3 className="text-lg font-bold text-text">{viendo.nombre}</h3>
                <p className="text-xs text-text-muted mt-1">
                  {viendo.modo === 'propio' ? 'Producto propio (stock propio)' : 'Descuenta de los productos existentes'}
                  {!defensa && (viendo.en_web ? ' · En web' : ' · No está en la web')}
                </p>
              </div>
              <button type="button" onClick={() => setViendo(null)} title="Cerrar" className="p-2 rounded-lg text-text-soft hover:bg-bg">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-5 text-sm">
              {viendo.descripcion && <p className="text-text-soft">{viendo.descripcion}</p>}
              {(() => {
                const items = viendo.paquete_items;
                const precio = precioDe(viendo);
                const normal = precioNormal(items);
                const reparto = repartirPaquete(
                  precio,
                  items.map((i) => ({ precio: Number(porId.get(i.producto_id)?.precio ?? 0), cantidad: i.cantidad, regalia: i.regalia }))
                );
                return (
                  <>
                    <div className="overflow-x-auto border border-border rounded-lg">
                      <table className="w-full text-left text-[13px]">
                        <thead className="bg-surface-alt border-b border-border">
                          <tr>
                            <th className={TH}>Producto</th>
                            <th className={`${TH} text-right`}>Cant.</th>
                            <th className={`${TH} text-right`}>Normal</th>
                            <th className={`${TH} text-right`}>En el paquete</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {items.map((i, n) => (
                            <tr key={i.producto_id}>
                              <td className={TD}>
                                {porId.get(i.producto_id)?.nombre ?? '—'}
                                <span className="block text-xs text-text-muted">Stock {porId.get(i.producto_id)?.stock ?? 0}</span>
                              </td>
                              <td className={`${TD} text-right`}>{i.cantidad}</td>
                              <td className={`${TD} text-right text-text-soft`}>
                                {formatoColones(Number(porId.get(i.producto_id)?.precio ?? 0) * i.cantidad)}
                              </td>
                              <td className={`${TD} text-right font-semibold`}>
                                {i.regalia ? <span className="text-success">Regalía (₡0)</span> : formatoColones(reparto[n])}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs text-text-muted">Normal</p>
                        <p className="font-semibold line-through text-text-muted">{formatoColones(normal)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted">Paquete</p>
                        <p className="font-semibold text-danger">{formatoColones(precio)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted">Baja</p>
                        <p className="font-semibold">−{pct(normal, precio)}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted">Disponibles</p>
                        <p className="font-semibold">{disponibles({ modo: viendo.modo, producto_id: viendo.producto_id, items })}</p>
                      </div>
                    </div>
                    <p className="text-xs text-text-muted">
                      Vigencia: {aCampoFecha(viendo.inicia)}
                      {viendo.termina ? ` → ${aCampoFecha(viendo.termina, true)}` : ' → sin fecha de fin'}
                      {!defensa && viendo.sello_texto ? ` · Sello "${viendo.sello_texto}"` : ''}
                      {viendo.creado_por ? ` · Creado por ${viendo.creado_por}` : ''}
                    </p>
                  </>
                );
              })()}
            </div>
            <div className="p-6 pt-0 flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => editar(viendo)}
                className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark flex items-center justify-center gap-2"
              >
                <Edit size={16} /> Editar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
