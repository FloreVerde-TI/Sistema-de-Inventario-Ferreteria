"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Html5Qrcode } from 'html5-qrcode';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Product, Category } from '@/types';
import { ScanLine, Search, Package, ArrowDownCircle, ArrowUpCircle, X, Loader2 } from 'lucide-react';

type ProductResult = Pick<
  Product,
  'id' | 'sku' | 'codigo_barras' | 'nombre' | 'categoria_id' | 'stock' | 'stock_minimo' | 'ubicacion' | 'imagen_principal'
>;
type CategoryRow = Pick<Category, 'id' | 'nombre'>;
type StockStatus = 'normal' | 'low' | 'out';

// Tarjeta blanca que se mantiene clara en modo oscuro (ver .card-light en globals.css)
const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';

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
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  // Categorías, para mostrar el nombre en el resultado
  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase.from('categorias').select('id, nombre');
      setCategories((data ?? []) as CategoryRow[]);
    }
    loadCategories();
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
    setProduct(null);
    setImgError(false);

    const { data, error: queryError } = await supabase
      .from('productos')
      .select('id, sku, codigo_barras, nombre, categoria_id, stock, stock_minimo, ubicacion, imagen_principal')
      .or(`codigo_barras.eq.${value},sku.eq.${value}`)
      .limit(1);

    if (queryError) {
      console.error('Error buscando producto:', queryError);
      setError(`No se pudo realizar la búsqueda: ${queryError.message}`);
    } else if (!data || data.length === 0) {
      setError(`No se encontró ningún producto con el código "${value}".`);
    } else {
      setProduct(data[0] as ProductResult);
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

        scanner = new Scanner('reader');
        let handled = false;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 140 } },
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

  const categoryName = product?.categoria_id
    ? categories.find((c) => c.id === product.categoria_id)?.nombre
    : undefined;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Encabezado */}
        <div>
          <h2 className="text-2xl font-bold text-text tracking-tight">Consulta por código de barras</h2>
          <p className="text-text-muted text-sm">
            Escanea o ingresa un código para ver la información del producto
          </p>
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

        {/* Resultado */}
        {product && (
          <div className={`${CARD} p-6 flex gap-6`}>
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
              <h3 className="text-xl font-bold text-text">{product.nombre}</h3>
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
                    <StatusBadge status={getStatus(product.stock, product.stock_minimo)} />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => router.push(`/entradas?producto=${product.id}`)}
                  className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2"
                >
                  <ArrowDownCircle size={16} /> Registrar entrada
                </button>
                <button
                  onClick={() => router.push(`/salidas?producto=${product.id}`)}
                  className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2"
                >
                  <ArrowUpCircle size={16} /> Registrar salida
                </button>
              </div>
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
