"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Html5Qrcode } from 'html5-qrcode';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import SiPuede from '@/components/SiPuede';
import { Product, Category } from '@/types';
import { ScanLine, Search, Package, ArrowDownCircle, ArrowUpCircle, X, Loader2, Plus } from 'lucide-react';

type ProductResult = Pick<
  Product,
  'id' | 'sku' | 'codigo_barras' | 'nombre' | 'categoria_id' | 'stock' | 'stock_minimo' | 'ubicacion' | 'imagen_principal' | 'habilitado'
>;
type CategoryRow = Pick<Category, 'id' | 'nombre'>;
type StockStatus = 'normal' | 'low' | 'out';

// Tarjeta blanca que se mantiene clara en modo oscuro (ver .card-light en globals.css)
const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';

const PRODUCT_FIELDS =
  'id, sku, codigo_barras, nombre, categoria_id, stock, stock_minimo, ubicacion, imagen_principal, habilitado';

// Claves del navegador: la opción del desplegable y el último producto escaneado
const LS_SHOW_LAST = 'barcode:mostrarUltimo';
const LS_LAST_ID = 'barcode:ultimoProducto';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Sin acceso al almacenamiento del navegador: la pantalla funciona igual
  }
}

function getStatus(stock?: number | null, min?: number | null): StockStatus {
  const s = stock ?? 0;
  const m = min ?? 0;
  if (s <= 0) return 'out';
  if (s <= m) return 'low';
  return 'normal';
}

export default function BarcodePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [code, setCode] = useState('');
  const [product, setProduct] = useState<ProductResult | null>(null);
  const [showLast, setShowLast] = useState(true);
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null); // código que no existe en la BD
  const [imgError, setImgError] = useState(false);

  // Categorías, para mostrar el nombre en el resultado
  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase.from('categorias').select('id, nombre');
      setCategories((data ?? []) as CategoryRow[]);
    }
    loadCategories();
  }, []);

  // Al entrar: lee la opción guardada y, si está en "Sí", vuelve a consultar el
  // último producto escaneado (así el stock siempre sale actualizado)
  useEffect(() => {
    let cancelled = false;

    async function restoreLast() {
      const show = readStorage(LS_SHOW_LAST) !== '0';
      setShowLast(show);
      setError(null);

      // Con "No", al volver la pantalla queda limpia
      if (!show) {
        setProduct(null);
        return;
      }

      const id = readStorage(LS_LAST_ID);
      if (!id) return;

      const { data } = await supabase
        .from('productos')
        .select(PRODUCT_FIELDS)
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;
      if (data) {
        setImgError(false);
        setProduct(data as ProductResult); // reemplaza el resultado viejo por el stock actual
      } else {
        setProduct(null);
        writeStorage(LS_LAST_ID, null); // el producto ya no existe
      }
    }

    restoreLast();
    return () => {
      cancelled = true;
    };
  }, []);

  // Busca por código de barras o por código interno (SKU)
  const lookup = useCallback(async (raw: string) => {
    // Se quitan caracteres que romperían el filtro de la consulta
    const value = raw.trim().replace(/[,()%*]/g, '');
    if (value.length < 3) {
      setError('Ingresa un código válido para buscar.');
      return;
    }

    setSearching(true);
    setError(null);
    setNotFound(null);
    setProduct(null);
    setImgError(false);

    let { data, error: queryError } = await supabase
      .from('productos')
      .select(PRODUCT_FIELDS)
      .or(`codigo_barras.eq.${value},sku.eq.${value}`)
      .limit(1);

    // Si no es el código principal ni el SKU, se busca en los códigos adicionales
    if (!queryError && (!data || data.length === 0)) {
      const { data: extra, error: extraErr } = await supabase
        .from('codigos_barras')
        .select('producto_id')
        .eq('codigo', value)
        .limit(1);
      if (extraErr) queryError = extraErr;
      else if (extra && extra.length > 0) {
        ({ data, error: queryError } = await supabase
          .from('productos')
          .select(PRODUCT_FIELDS)
          .eq('id', extra[0].producto_id)
          .limit(1));
      }
    }

    if (queryError) {
      console.error('Error buscando producto:', queryError);
      setError(`No se pudo realizar la búsqueda: ${queryError.message}`);
    } else if (!data || data.length === 0) {
      setNotFound(value);
    } else {
      const found = data[0] as ProductResult;
      setProduct(found);
      writeStorage(LS_LAST_ID, String(found.id)); // se recuerda como "último escaneado"
    }
    setSearching(false);
  }, []);

  // Escáner de cámara
  useEffect(() => {
    if (!scanning) return;

    let cancelled = false;
    let started = false;
    let scanner: Html5Qrcode | null = null;

    async function stop() {
      if (scanner && started) {
        started = false;
        try {
          await scanner.stop();
          scanner.clear();
        } catch {
          // El escáner ya estaba detenido
        }
      }
    }

    async function start() {
      try {
        const { Html5Qrcode: Scanner } = await import('html5-qrcode');
        if (cancelled) return;

        // Solo formatos de ferretería/comercio: lee más rápido y con menos errores
        const { Html5QrcodeSupportedFormats: F } = await import('html5-qrcode');
        if (cancelled) return;

        scanner = new Scanner('reader', {
          verbose: false,
          useBarCodeDetectorIfSupported: true, // usa el lector nativo del navegador si existe
          formatsToSupport: [
            F.QR_CODE,
            F.CODE_128,
            F.CODE_39,
            F.EAN_13,
            F.EAN_8,
            F.UPC_A,
            F.UPC_E,
          ],
        });
        let handled = false;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            // Zona de lectura ancha (90% del ancho, 55% del alto del video)
            qrbox: (w, h) => ({ width: Math.floor(w * 0.9), height: Math.floor(h * 0.55) }),
          },
          (decodedText) => {
            if (handled) return;
            handled = true;
            setCode(decodedText);
            setScanning(false); // al cerrar el escáner, el efecto lo detiene
            lookup(decodedText);
          },
          () => {
            // Error de lectura de un cuadro: se ignora, el escáner sigue intentando
          }
        );
        started = true;
        if (cancelled) await stop();
      } catch (err) {
        console.error('Error iniciando la cámara:', err);
        if (!cancelled) {
          setError('No se pudo abrir la cámara. Revisa que el navegador tenga permiso para usarla.');
          setScanning(false);
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [scanning, lookup]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookup(code);
    // Se limpia el campo para que el siguiente escaneo no se pegue al anterior
    setCode('');
    inputRef.current?.focus();
  };

  const handleShowLastChange = (value: boolean) => {
    setShowLast(value);
    writeStorage(LS_SHOW_LAST, value ? '1' : '0');
  };

  const handleClearResult = () => {
    setProduct(null);
    setNotFound(null);
    setImgError(false);
    writeStorage(LS_LAST_ID, null);
  };

  const categoryName = product?.categoria_id
    ? categories.find((c) => c.id === product.categoria_id)?.nombre
    : undefined;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-text tracking-tight">Consulta por código de barras</h2>
            <p className="text-text-muted text-sm">
              Escanea o ingresa un código para ver la información del producto
            </p>
          </div>

          <div className="flex flex-col gap-1 shrink-0">
            <label htmlFor="show-last" className="text-xs font-semibold text-text-soft">
              Mostrar último producto escaneado al volver
            </label>
            <select
              id="show-last"
              value={showLast ? 'si' : 'no'}
              onChange={(e) => handleShowLastChange(e.target.value === 'si')}
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all"
            >
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>

        {/* Escáner */}
        <div className={`${CARD} p-10 text-center`}>
          {scanning ? (
            <div className="max-w-md mx-auto space-y-4">
              <div id="reader" className="overflow-hidden rounded-xl border-2 border-primary-light" />
              <button
                onClick={() => setScanning(false)}
                className="px-4 py-2 text-sm font-medium bg-danger-soft text-danger rounded-lg hover:opacity-80 transition-opacity inline-flex items-center gap-2"
              >
                <X size={16} /> Cancelar escaneo
              </button>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-primary-soft text-primary-ink flex items-center justify-center mx-auto mb-3">
                <ScanLine size={32} />
              </div>
              <h3 className="text-lg font-semibold text-text">Escanear código de barras</h3>
              <p className="text-text-muted text-sm mb-6">
                Usa el lector, la cámara, o escribe el código manualmente
              </p>

              <form onSubmit={handleSubmit}>
                <input
                  ref={inputRef}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Código de barras o código interno"
                  className="w-full max-w-lg px-5 py-4 text-lg text-center font-semibold tracking-wider bg-bg text-text placeholder:text-text-muted border-2 border-dashed border-border rounded-xl outline-none focus:border-solid focus:border-primary-light focus:ring-4 focus:ring-primary-light/20 transition-all"
                />
                <div className="flex justify-center gap-3 mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setNotFound(null);
                      setScanning(true);
                    }}
                    className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2"
                  >
                    <ScanLine size={16} /> Usar cámara
                  </button>
                  <button
                    type="submit"
                    disabled={searching}
                    className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {searching ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                    Buscar producto
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">{error}</div>
        )}

        {/* Código que no existe: ofrece registrarlo */}
        {notFound && (
          <div className={`${CARD} p-6 flex items-center justify-between gap-4`}>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text break-words">
                No se encontró ningún producto con el código «{notFound}».
              </p>
              <SiPuede permiso="productos_crear">
                <p className="text-sm text-text-muted mt-1">¿Registrar como nuevo producto?</p>
              </SiPuede>
            </div>
            <div className="flex gap-3 shrink-0">
              <SiPuede
                permiso="productos_crear"
                sino={
                  <button
                    type="button"
                    onClick={() => setNotFound(null)}
                    className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors"
                  >
                    Cerrar
                  </button>
                }
              >
                <button
                  type="button"
                  onClick={() => setNotFound(null)}
                  className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors"
                >
                  Ahora no
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/productos/nuevo?codigo=${encodeURIComponent(notFound)}`)}
                  className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm flex items-center gap-2"
                >
                  <Plus size={16} /> Registrar como nuevo producto
                </button>
              </SiPuede>
            </div>
          </div>
        )}

        {/* Resultado */}
        {product && (
          <div className={`${CARD} p-6 flex gap-6 relative`}>
            <button
              onClick={handleClearResult}
              className="absolute top-4 right-4 px-2.5 py-1 text-xs font-medium text-text-soft bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-1"
            >
              <X size={14} /> Limpiar resultado
            </button>

            <div className="w-40 h-40 shrink-0 rounded-xl bg-surface-alt border border-border flex items-center justify-center text-text-muted overflow-hidden">
              {product.imagen_principal && !imgError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imagen_principal}
                  alt={product.nombre}
                  className="w-full h-full object-cover"
                  onError={() => setImgError(true)}
                />
              ) : (
                <Package size={56} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3
                className={`text-xl font-bold pr-40 ${
                  product.habilitado === false
                    ? 'text-text-muted line-through decoration-red-400 decoration-2'
                    : 'text-text'
                }`}
              >
                {product.nombre}
              </h3>
              <p className="text-xs text-text-muted mb-5">
                Código: {product.sku || '—'} · Barras: {product.codigo_barras || '—'}
              </p>

              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Info label="Categoría" value={categoryName ?? 'Sin categoría'} />
                <Info label="Ubicación" value={product.ubicacion || '—'} />
                <Info
                  label="Stock disponible"
                  value={`${product.stock ?? 0} unidades`}
                  valueClass={getStatus(product.stock, product.stock_minimo) === 'out' ? 'text-danger' : 'text-success'}
                />
                <Info label="Stock mínimo" value={`${product.stock_minimo ?? 0} unidades`} />
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Estado</div>
                  <div className="mt-1">
                    {product.habilitado === false ? (
                      <DisabledBadge />
                    ) : (
                      <StatusBadge status={getStatus(product.stock, product.stock_minimo)} />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <SiPuede permiso="entradas">
                <button
                  onClick={() => router.push(`/entradas?producto=${product.id}&desde=barcode`)}
                  disabled={product.habilitado === false}
                  className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowDownCircle size={16} /> Registrar entrada
                </button>
                </SiPuede>
                <SiPuede permiso="salidas">
                <button
                  onClick={() => router.push(`/salidas?producto=${product.id}&desde=barcode`)}
                  disabled={product.habilitado === false}
                  className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowUpCircle size={16} /> Registrar salida
                </button>
                </SiPuede>
              </div>
              {product.habilitado === false && (
                <p className="text-xs text-text-muted mt-3">
                  Producto deshabilitado: no admite entradas ni salidas. Habilítalo desde Editar producto.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Info({ label, value, valueClass = 'text-text' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`text-sm font-semibold mt-1 ${valueClass}`}>{value}</div>
    </div>
  );
}

// Los textos oscuros son los del diseño de referencia (el resultado siempre está en tarjeta clara)
const BADGES: Record<StockStatus, { label: string; className: string }> = {
  normal: { label: 'Normal', className: 'bg-success-soft text-green-800' },
  low: { label: 'Stock bajo', className: 'bg-warning-soft text-amber-800' },
  out: { label: 'Agotado', className: 'bg-danger-soft text-red-800' },
};

function DisabledBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-black text-white">
      Deshabilitado
    </span>
  );
}

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
