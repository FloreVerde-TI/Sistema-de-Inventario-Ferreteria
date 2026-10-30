"use client";

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { registrarActividad } from '@/lib/actividad';
import SiPuede from '@/components/SiPuede';
import SubirImagen from '@/components/SubirImagen';
import CodigosAdicionales from '@/components/CodigosAdicionales';
import { borrarImagenSiEsNuestra } from '@/lib/imagenes';
import { Product, Category } from '@/types';
import { Save, X, Loader2, Package, Globe, CheckCircle2, Power } from 'lucide-react';

type CategoryRow = Pick<Category, 'id' | 'nombre'>;
type ProveedorRow = { id: string; nombre: string };
type ProductRow = { proveedor_id: string | null } & Pick<
  Product,
  | 'id'
  | 'nombre'
  | 'descripcion'
  | 'categoria_id'
  | 'precio'
  | 'sku'
  | 'codigo_barras'
  | 'stock'
  | 'stock_minimo'
  | 'ubicacion'
  | 'imagen_principal'
  | 'activo'
  | 'habilitado'
>;

interface FormState {
  nombre: string;
  descripcion: string;
  categoria: string; // id de categoría o NEW_CATEGORY
  nuevaCategoria: string;
  proveedor: string; // id del proveedor, '' (ninguno) o NEW_PROVEEDOR
  nuevoProveedor: string;
  precio: string;
  sku: string;
  codigo_barras: string;
  stock_minimo: string;
  ubicacion: string;
  imagen: string;
  enWeb: boolean;
  habilitado: boolean;
}

const NEW_CATEGORY = '__nueva__';
const NEW_PROVEEDOR = '__nuevo_proveedor__';

const PRODUCT_FIELDS =
  'id, nombre, descripcion, categoria_id, precio, sku, codigo_barras, stock, stock_minimo, ubicacion, imagen_principal, activo, habilitado, proveedor_id';

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all disabled:opacity-50 disabled:cursor-not-allowed';
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-text-soft mb-1';

function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505')
    return 'Ya existe una categoría o proveedor con ese nombre. Si está deshabilitado, habilítalo en Configuración → Catálogos.';
  if (err instanceof Error) return err.message.replace('CODIGO_DUPLICADO: ', '');
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message).replace('CODIGO_DUPLICADO: ', '');
  }
  return 'Error desconocido';
}

function isNonNegativeInt(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

function toForm(p: ProductRow): FormState {
  return {
    nombre: p.nombre ?? '',
    descripcion: p.descripcion ?? '',
    categoria: p.categoria_id ?? '',
    nuevaCategoria: '',
    proveedor: p.proveedor_id ?? '',
    nuevoProveedor: '',
    precio: p.precio === null || p.precio === undefined ? '' : String(p.precio),
    sku: p.sku ?? '',
    codigo_barras: p.codigo_barras ?? '',
    stock_minimo: String(p.stock_minimo ?? 0),
    ubicacion: p.ubicacion ?? '',
    imagen: p.imagen_principal ?? '',
    enWeb: p.activo === true,
    habilitado: p.habilitado !== false,
  };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-bold text-text mb-4 pb-2 border-b border-border">{children}</h3>;
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Cerrar aviso"
      aria-label="Cerrar aviso"
      className="p-1 rounded hover:bg-black/10 transition-colors"
    >
      <X size={16} />
    </button>
  );
}

function EditarProductoForm() {
  const { id } = useParams<{ id: string }>();

  const [form, setForm] = useState<FormState | null>(null);
  const [stock, setStock] = useState(0);
  const [habilitadoOriginal, setHabilitadoOriginal] = useState(true);
  const [imagenOriginal, setImagenOriginal] = useState('');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      const [catRes, prodRes, provRes] = await Promise.all([
        supabase.from('categorias').select('id, nombre, activa').order('nombre'),
        supabase.from('productos').select(PRODUCT_FIELDS).eq('id', id).maybeSingle(),
        supabase.from('proveedores').select('id, nombre, activo').order('nombre'),
      ]);
      if (!active) return;
      // Deshabilitados no se ofrecen, salvo el que ya tiene este producto
      const actual = prodRes.data as unknown as { categoria_id: string | null; proveedor_id: string | null } | null;
      setProveedores(
        ((provRes.data ?? []) as (ProveedorRow & { activo: boolean | null })[])
          .filter((p) => p.activo !== false || p.id === actual?.proveedor_id)
          .map(({ id, nombre }) => ({ id, nombre }))
      );

      const failed = catRes.error ?? prodRes.error;
      if (failed) {
        setError(`No se pudo cargar el producto: ${failed.message}`);
      } else if (!prodRes.data) {
        setNotFound(true);
      } else {
        const p = prodRes.data as unknown as ProductRow;
        setCategories(
          ((catRes.data ?? []) as (CategoryRow & { activa: boolean | null })[])
            .filter((c) => c.activa !== false || c.id === actual?.categoria_id)
            .map(({ id, nombre }) => ({ id, nombre }))
        );
        setForm(toForm(p));
        setStock(p.stock ?? 0);
        setHabilitadoOriginal(p.habilitado !== false);
        setImagenOriginal(p.imagen_principal ?? '');
        setNotFound(false);
      }
      setImgFailed(false);
      setLoading(false);
    }
    fetchData();

    // Al salir de la página (o cambiar de producto) se borran los avisos,
    // así al volver a editar no aparece el mensaje anterior.
    return () => {
      active = false;
      setSuccess(null);
      setError(null);
    };
  }, [id]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSuccess(null);

    const nombre = form.nombre.trim();
    const precio = Number(form.precio);
    const minimo = Number(form.stock_minimo);
    const nuevaCat = form.nuevaCategoria.trim();
    const barras = form.codigo_barras.trim();
    const creatingCategory = form.categoria === NEW_CATEGORY;

    if (!nombre) return setError('Escribe el nombre del producto.');
    if (!form.categoria) return setError('Elige una categoría.');
    if (creatingCategory && !nuevaCat) return setError('Escribe el nombre de la nueva categoría.');
    if (form.proveedor === NEW_PROVEEDOR && !form.nuevoProveedor.trim())
      return setError('Escribe el nombre del nuevo proveedor.');
    if (form.precio.trim() === '' || !Number.isFinite(precio) || precio < 0) {
      return setError('El precio debe ser un número igual o mayor a 0.');
    }
    if (!isNonNegativeInt(minimo)) return setError('El stock mínimo debe ser un entero igual o mayor a 0.');

    setSaving(true);
    try {
      // 1. Código de barras repetido en OTRO producto
      if (barras) {
        const { data: dup, error: dupErr } = await supabase
          .from('productos')
          .select('id, nombre')
          .eq('codigo_barras', barras)
          .neq('id', id)
          .limit(1);
        if (dupErr) throw dupErr;
        if (dup && dup.length > 0) {
          setError(`Ese código de barras ya pertenece a "${dup[0].nombre}".`);
          return;
        }
        // ...o es un código ADICIONAL (de este u otro producto)
        const { data: dupAd, error: dupAdErr } = await supabase
          .from('codigos_barras')
          .select('producto_id, productos(nombre)')
          .eq('codigo', barras)
          .limit(1);
        if (dupAdErr) throw dupAdErr;
        if (dupAd && dupAd.length > 0) {
          const fila = dupAd[0] as { producto_id: string; productos: { nombre: string } | { nombre: string }[] | null };
          const dueño = Array.isArray(fila.productos) ? fila.productos[0]?.nombre : fila.productos?.nombre;
          setError(
            fila.producto_id === id
              ? 'Ese código ya está en los códigos adicionales de este producto. Quítalo de ahí primero.'
              : `Ese código de barras ya es un código adicional de "${dueño ?? 'otro producto'}".`
          );
          return;
        }
      }

      // 2. Categoría (existente o nueva)
      let categoriaId = form.categoria;
      if (creatingCategory) {
        const existing = categories.find((c) => c.nombre.trim().toLowerCase() === nuevaCat.toLowerCase());
        if (existing) {
          categoriaId = existing.id;
        } else {
          const { data: cat, error: catErr } = await supabase
            .from('categorias')
            .insert({ nombre: nuevaCat })
            .select('id, nombre')
            .single();
          if (catErr) throw catErr;
          const created = cat as CategoryRow;
          categoriaId = created.id;
          setCategories((prev) => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        }
      }

      // 2b. Proveedor (existente, nuevo o ninguno)
      let proveedorId: string | null = form.proveedor && form.proveedor !== NEW_PROVEEDOR ? form.proveedor : null;
      if (form.proveedor === NEW_PROVEEDOR) {
        const nuevoProv = form.nuevoProveedor.trim();
        const existente = proveedores.find((p) => p.nombre.trim().toLowerCase() === nuevoProv.toLowerCase());
        if (existente) {
          proveedorId = existente.id;
        } else {
          const { data: prov, error: provErr } = await supabase
            .from('proveedores')
            .insert({ nombre: nuevoProv })
            .select('id, nombre')
            .single();
          if (provErr) throw provErr;
          const creado = prov as ProveedorRow;
          proveedorId = creado.id;
          setProveedores((prev) => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        }
      }

      // 3. Actualizar (el stock NO se toca: cambia solo con Entradas/Salidas)
      const visibleEnWeb = form.habilitado && form.enWeb;
      const { error: updErr } = await supabase
        .from('productos')
        .update({
          nombre,
          descripcion: form.descripcion.trim(),
          categoria_id: categoriaId,
          proveedor_id: proveedorId,
          precio,
          sku: form.sku.trim() || null,
          codigo_barras: barras || null,
          stock_minimo: minimo,
          ubicacion: form.ubicacion.trim() || null,
          imagen_principal: form.imagen.trim() || null,
          activo: visibleEnWeb,
          habilitado: form.habilitado,
        })
        .eq('id', id);
      if (updErr) throw updErr;

      // Si se cambió o quitó la imagen, se borra la anterior de nuestro Storage
      const imagenNueva = form.imagen.trim();
      if (imagenOriginal && imagenOriginal !== imagenNueva) {
        await borrarImagenSiEsNuestra(imagenOriginal);
      }
      setImagenOriginal(imagenNueva);

      // Bitácora: edición y, si cambió, habilitar / deshabilitar
      await registrarActividad({
        accion: 'editar',
        entidad: 'producto',
        entidad_id: id,
        detalle: `Editó el producto "${nombre}"`,
      });
      if (form.habilitado !== habilitadoOriginal) {
        await registrarActividad({
          accion: form.habilitado ? 'habilitar' : 'deshabilitar',
          entidad: 'producto',
          entidad_id: id,
          detalle: `${form.habilitado ? 'Habilitó' : 'Deshabilitó'} el producto "${nombre}"`,
        });
        setHabilitadoOriginal(form.habilitado);
      }

      setForm((prev) =>
        prev
          ? { ...prev, categoria: categoriaId, nuevaCategoria: '', proveedor: proveedorId ?? '', nuevoProveedor: '', enWeb: visibleEnWeb }
          : prev
      );
      setSuccess(`Producto "${nombre}" actualizado correctamente.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <div className="flex items-end justify-between">
      <div>
        <h2 className="text-2xl font-bold text-text tracking-tight">Editar producto</h2>
        <p className="text-text-muted text-sm">Modifica los datos del artículo</p>
      </div>
      <Link
        href="/productos"
        className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2"
      >
        <X size={16} /> Volver
      </Link>
    </div>
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          {header}
          <div className={`${CARD} p-20 text-center text-text-muted italic`}>Cargando producto...</div>
        </div>
      </AdminLayout>
    );
  }

  if (notFound || !form) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          {header}
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">
            {error ?? 'No se encontró el producto.'}
          </div>
        </div>
      </AdminLayout>
    );
  }

  const creatingCategory = form.categoria === NEW_CATEGORY;
  const imageUrl = form.imagen.trim();
  const showImage = imageUrl !== '' && !imgFailed;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {header}

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm flex items-center justify-between gap-4">
            <span>{error}</span>
            <CloseButton onClick={() => setError(null)} />
          </div>
        )}

        {success && (
          <div className="bg-success-soft text-green-800 border border-green-800/20 rounded-lg p-4 text-sm flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={18} /> {success}
            </span>
            <span className="flex items-center gap-3">
              <Link href="/productos" className="font-semibold underline">
                Ir a productos
              </Link>
              <CloseButton onClick={() => setSuccess(null)} />
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Columna izquierda */}
          <div className="lg:col-span-2 space-y-6">
            <div className={`${CARD} p-6`}>
              <SectionTitle>Información general</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className={LABEL}>Nombre del producto *</label>
                  <input className={FIELD} value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
                </div>

                <div>
                  <label className={LABEL}>Categoría *</label>
                  <select
                    className={FIELD}
                    value={form.categoria}
                    onChange={(e) => {
                      set('categoria', e.target.value);
                      if (e.target.value !== NEW_CATEGORY) set('nuevaCategoria', '');
                    }}
                  >
                    <option value="">Seleccionar...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                    <option value={NEW_CATEGORY}>+ Crear nueva categoría</option>
                  </select>
                </div>

                <div>
                  <label className={LABEL}>Nueva categoría</label>
                  <input
                    className={FIELD}
                    value={form.nuevaCategoria}
                    onChange={(e) => set('nuevaCategoria', e.target.value)}
                    disabled={!creatingCategory}
                    placeholder={creatingCategory ? 'Nombre de la categoría' : 'Elige "Crear nueva categoría"'}
                  />
                </div>

                <div>
                  <label className={LABEL}>Proveedor</label>
                  <select
                    className={FIELD}
                    value={form.proveedor}
                    onChange={(e) => {
                      set('proveedor', e.target.value);
                      if (e.target.value !== NEW_PROVEEDOR) set('nuevoProveedor', '');
                    }}
                  >
                    <option value="">Sin proveedor</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                    <option value={NEW_PROVEEDOR}>+ Agregar nuevo proveedor</option>
                  </select>
                </div>

                <div>
                  <label className={LABEL}>Nuevo proveedor</label>
                  <input
                    className={FIELD}
                    value={form.nuevoProveedor}
                    onChange={(e) => set('nuevoProveedor', e.target.value)}
                    disabled={form.proveedor !== NEW_PROVEEDOR}
                    placeholder={form.proveedor === NEW_PROVEEDOR ? 'Nombre del proveedor' : 'Elige "Agregar nuevo proveedor"'}
                  />
                </div>

                <div>
                  <label className={LABEL}>Código (SKU)</label>
                  <input
                    className={FIELD}
                    value={form.sku}
                    onChange={(e) => set('sku', e.target.value)}
                    placeholder="Opcional"
                  />
                </div>

                <div>
                  <label className={LABEL}>Código de barras</label>
                  <input
                    className={FIELD}
                    value={form.codigo_barras}
                    onChange={(e) => set('codigo_barras', e.target.value)}
                    placeholder="Opcional (código principal)"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className={LABEL}>Códigos de barras adicionales</label>
                  <CodigosAdicionales
                    productoId={id}
                    nombreProducto={form.nombre.trim()}
                    codigoPrincipal={form.codigo_barras}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className={LABEL}>Descripción</label>
                  <textarea
                    className={`${FIELD} h-24 resize-none`}
                    value={form.descripcion}
                    onChange={(e) => set('descripcion', e.target.value)}
                    placeholder="Detalles del producto (se muestra también en la web)"
                  />
                </div>
              </div>
            </div>

            <div className={`${CARD} p-6`}>
              <SectionTitle>Precio e inventario</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Precio de venta (₡) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={FIELD}
                    value={form.precio}
                    onChange={(e) => set('precio', e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Ubicación (pasillo / estante)</label>
                  <input
                    className={FIELD}
                    value={form.ubicacion}
                    onChange={(e) => set('ubicacion', e.target.value)}
                    placeholder="Ej: Pasillo A, Estante 3"
                  />
                </div>
                <div>
                  <label className={LABEL}>Stock actual (solo lectura)</label>
                  <input className={FIELD} value={stock} disabled readOnly />
                </div>
                <div>
                  <label className={LABEL}>Stock mínimo (alerta) *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={FIELD}
                    value={form.stock_minimo}
                    onChange={(e) => set('stock_minimo', e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-text-muted mt-3">
                El stock se modifica desde Entradas y Salidas para mantener el historial de Movimientos.
              </p>
            </div>
          </div>

          {/* Columna derecha */}
          <div className="space-y-6">
            <div className={`${CARD} p-6`}>
              <SectionTitle>Imagen</SectionTitle>
              <div className="aspect-square w-full rounded-lg bg-bg border border-border flex items-center justify-center overflow-hidden mb-4">
                {showImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt="Vista previa"
                    className="w-full h-full object-contain"
                    onError={() => setImgFailed(true)}
                  />
                ) : (
                  <div className="text-center text-text-muted">
                    <Package size={48} className="mx-auto mb-2" />
                    <p className="text-xs">
                      {imgFailed ? 'No se pudo cargar la imagen' : 'Sin imagen (se usará la predeterminada)'}
                    </p>
                  </div>
                )}
              </div>
              <SubirImagen
                carpeta="productos"
                onSubida={(url) => {
                  set('imagen', url);
                  setImgFailed(false);
                }}
              />
              <label className={`${LABEL} mt-4`}>O pega el enlace de una imagen</label>
              <input
                className={FIELD}
                value={form.imagen}
                onChange={(e) => {
                  set('imagen', e.target.value);
                  setImgFailed(false);
                }}
                placeholder="https://..."
              />
              {form.imagen.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    set('imagen', '');
                    setImgFailed(false);
                  }}
                  className="mt-2 text-xs font-medium text-danger hover:underline"
                >
                  Quitar imagen
                </button>
              )}
            </div>

            <div className={`${CARD} p-6 space-y-5`}>
              <SectionTitle>Estado y publicación</SectionTitle>

              {/* Solo quien puede deshabilitar ve este interruptor */}
              <SiPuede permiso="productos_deshabilitar">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={form.habilitado}
                  onChange={(e) => {
                    set('habilitado', e.target.checked);
                    if (!e.target.checked) set('enWeb', false);
                  }}
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-text">
                    <Power size={16} /> Producto habilitado
                  </span>
                  <span className="block text-xs text-text-muted mt-0.5">
                    Si lo deshabilitas, no se podrá usar en Entradas, Salidas ni en la web.
                  </span>
                </span>
              </label>
              </SiPuede>

              <label className={`flex items-start gap-3 ${form.habilitado ? 'cursor-pointer' : 'opacity-50'}`}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={form.enWeb}
                  disabled={!form.habilitado}
                  onChange={(e) => set('enWeb', e.target.checked)}
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-text">
                    <Globe size={16} /> Disponible en la web
                  </span>
                  <span className="block text-xs text-text-muted mt-0.5">
                    Si está activo, el producto aparece en la página promocional.
                  </span>
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}

export default function EditarProductoPage() {
  return (
    <Suspense fallback={null}>
      <EditarProductoForm />
    </Suspense>
  );
}
