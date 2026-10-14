"use client";

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Category } from '@/types';
import { Save, X, Loader2, Package, Globe, CheckCircle2 } from 'lucide-react';

type CategoryRow = Pick<Category, 'id' | 'nombre'>;

interface FormState {
  nombre: string;
  descripcion: string;
  categoria: string; // id de categoría, '' (sin elegir) o NEW_CATEGORY
  nuevaCategoria: string;
  precio: string;
  sku: string;
  codigo_barras: string;
  stock: string;
  stock_minimo: string;
  ubicacion: string;
  imagen: string;
  enWeb: boolean;
}

const NEW_CATEGORY = '__nueva__';

const EMPTY_FORM: FormState = {
  nombre: '',
  descripcion: '',
  categoria: '',
  nuevaCategoria: '',
  precio: '',
  sku: '',
  codigo_barras: '',
  stock: '0',
  stock_minimo: '5',
  ubicacion: '',
  imagen: '',
  enWeb: true,
};

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all disabled:opacity-50 disabled:cursor-not-allowed';
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-text-soft mb-1';

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Error desconocido';
}

function isNonNegativeInt(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-bold text-text mb-4 pb-2 border-b border-border">{children}</h3>;
}

function NuevoProductoForm() {
  const codigoInicial = useSearchParams().get('codigo') ?? '';

  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, codigo_barras: codigoInicial });
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    async function loadCategories() {
      const { data, error: err } = await supabase.from('categorias').select('id, nombre').order('nombre');
      if (err) {
        setError(`No se pudieron cargar las categorías: ${err.message}`);
        return;
      }
      setCategories((data ?? []) as CategoryRow[]);
    }
    loadCategories();
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const creatingCategory = form.categoria === NEW_CATEGORY;
  const imageUrl = form.imagen.trim();
  const showImage = imageUrl !== '' && !imgFailed;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const nombre = form.nombre.trim();
    const precio = Number(form.precio);
    const stock = Number(form.stock);
    const minimo = Number(form.stock_minimo);
    const nuevaCat = form.nuevaCategoria.trim();
    const barras = form.codigo_barras.trim();

    if (!nombre) return setError('Escribe el nombre del producto.');
    if (!form.categoria) return setError('Elige una categoría.');
    if (creatingCategory && !nuevaCat) return setError('Escribe el nombre de la nueva categoría.');
    if (form.precio.trim() === '' || !Number.isFinite(precio) || precio < 0) {
      return setError('El precio debe ser un número igual o mayor a 0.');
    }
    if (!isNonNegativeInt(stock)) return setError('El stock inicial debe ser un entero igual o mayor a 0.');
    if (!isNonNegativeInt(minimo)) return setError('El stock mínimo debe ser un entero igual o mayor a 0.');

    setSaving(true);
    try {
      // 1. Código de barras repetido
      if (barras) {
        const { data: dup, error: dupErr } = await supabase
          .from('productos')
          .select('id, nombre')
          .eq('codigo_barras', barras)
          .limit(1);
        if (dupErr) throw dupErr;
        if (dup && dup.length > 0) {
          setError(`Ese código de barras ya pertenece a "${dup[0].nombre}".`);
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

      // 3. Producto (stock en 0: el stock inicial entra como movimiento)
      const { data: prod, error: prodErr } = await supabase
        .from('productos')
        .insert({
          nombre,
          descripcion: form.descripcion.trim(),
          categoria_id: categoriaId,
          precio,
          sku: form.sku.trim() || null,
          codigo_barras: barras || null,
          stock: 0,
          stock_minimo: minimo,
          ubicacion: form.ubicacion.trim() || null,
          imagen_principal: imageUrl || null,
          activo: form.enWeb,
        })
        .select('id')
        .single();
      if (prodErr) throw prodErr;

      // 4. Stock inicial como entrada (el trigger suma el stock)
      if (stock > 0) {
        const { data: auth } = await supabase.auth.getUser();
        const { error: movErr } = await supabase.from('movimientos').insert({
          producto_id: (prod as { id: string }).id,
          tipo: 'entrada',
          cantidad: stock,
          motivo: 'Stock inicial',
          usuario: auth.user?.email ?? null,
          origen: 'panel',
        });
        if (movErr) {
          setError(`El producto se creó, pero no se pudo registrar el stock inicial: ${movErr.message}`);
          return;
        }
      }

      setSuccess(`Producto "${nombre}" registrado correctamente.`);
      setForm({ ...EMPTY_FORM });
      setImgFailed(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-text tracking-tight">Nuevo producto</h2>
            <p className="text-text-muted text-sm">Registra un nuevo artículo en el catálogo</p>
          </div>
          <Link
            href="/productos"
            className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2"
          >
            <X size={16} /> Cancelar
          </Link>
        </div>

        {codigoInicial && (
          <div className="bg-primary-soft text-primary-ink border border-primary/20 rounded-lg p-4 text-sm">
            Código de barras <strong>{codigoInicial}</strong> cargado desde el escáner. Completa los demás datos.
          </div>
        )}

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">{error}</div>
        )}

        {success && (
          <div className="bg-success-soft text-green-800 border border-green-800/20 rounded-lg p-4 text-sm flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={18} /> {success}
            </span>
            <Link href="/productos" className="font-semibold underline">
              Ir a productos
            </Link>
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
                  <input
                    className={FIELD}
                    value={form.nombre}
                    onChange={(e) => set('nombre', e.target.value)}
                    placeholder="Ej: Martillo de uña 16oz"
                  />
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
                    placeholder="Opcional"
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
                    placeholder="0.00"
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
                  <label className={LABEL}>Stock inicial *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={FIELD}
                    value={form.stock}
                    onChange={(e) => set('stock', e.target.value)}
                  />
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
                El stock inicial se registra como una entrada en Movimientos (motivo: Stock inicial).
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
              <label className={LABEL}>URL de la imagen</label>
              <input
                className={FIELD}
                value={form.imagen}
                onChange={(e) => {
                  set('imagen', e.target.value);
                  setImgFailed(false);
                }}
                placeholder="https://..."
              />
            </div>

            <div className={`${CARD} p-6`}>
              <SectionTitle>Publicación</SectionTitle>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={form.enWeb}
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
              {saving ? 'Guardando...' : 'Guardar producto'}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}

export default function NuevoProductoPage() {
  return (
    <Suspense fallback={null}>
      <NuevoProductoForm />
    </Suspense>
  );
}
