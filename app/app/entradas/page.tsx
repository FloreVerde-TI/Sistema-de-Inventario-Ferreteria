"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Product, Movimiento } from '@/types';
import { Loader2, ArrowDownCircle, ScanLine } from 'lucide-react';

type ProductOption = Pick<Product, 'id' | 'sku' | 'nombre' | 'stock' | 'habilitado'>;
type EntradaRow = Pick<
  Movimiento,
  'id' | 'producto_id' | 'cantidad' | 'motivo' | 'usuario' | 'proveedor' | 'referencia' | 'created_at'
>;

type FormState = {
  producto_id: string;
  cantidad: string;
  proveedor: string;
  referencia: string;
  motivo: string;
};

const EMPTY_FORM: FormState = {
  producto_id: '',
  cantidad: '',
  proveedor: '',
  referencia: '',
  motivo: '',
};

// Tarjeta blanca que se mantiene clara en modo oscuro (ver .card-light en globals.css)
const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-primary-light transition-all';
const LABEL = 'text-xs font-semibold text-text-soft';
const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-soft';
const TD = 'px-4 py-3';

const DAYS_BACK = 30;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EntradasPage() {
  const router = useRouter();

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [entradas, setEntradas] = useState<EntradaRow[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fromBarcode, setFromBarcode] = useState(false);

  const loadData = useCallback(async () => {
    const since = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000).toISOString();

    const [prodRes, entRes] = await Promise.all([
      supabase
        .from('productos')
        .select('id, sku, nombre, stock, habilitado')
        .order('nombre'),
      supabase
        .from('movimientos')
        .select('id, producto_id, cantidad, motivo, usuario, proveedor, referencia, created_at')
        .eq('tipo', 'entrada')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const failed = prodRes.error ?? entRes.error;
    if (failed) {
      console.error('Error cargando entradas:', failed);
      setError(failed.message);
    } else {
      setError(null);
      setProducts((prodRes.data ?? []) as ProductOption[]);
      setEntradas((entRes.data ?? []) as EntradaRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Si se llega desde Código de Barras, la dirección trae ?producto=ID&desde=barcode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('producto');
    setForm(id ? { ...EMPTY_FORM, producto_id: id } : EMPTY_FORM);
    setFromBarcode(params.get('desde') === 'barcode');
    setSuccess(null);
    setError(null);
  }, []);

  // Solo los habilitados se pueden usar; la lista completa sirve para mostrar nombres en el historial
  const enabledProducts = useMemo(() => products.filter((p) => p.habilitado !== false), [products]);
  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.nombre])), [products]);

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(null); // al empezar otro registro, el aviso anterior desaparece
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cantidad = Number(form.cantidad);
    if (!enabledProducts.some((p) => p.id === form.producto_id)) {
      setError('Selecciona un producto habilitado.');
      return;
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setError('La cantidad debe ser un número entero mayor que 0.');
      return;
    }

    setSaving(true);

    // Nombre del usuario que registra la entrada
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let usuario = user?.email ?? 'Desconocido';
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      usuario = profile?.full_name ?? usuario;
    }

    // tipo SIEMPRE en minúscula: el trigger solo suma stock con 'entrada' exacto
    const { error: insertError } = await supabase.from('movimientos').insert({
      producto_id: form.producto_id,
      tipo: 'entrada',
      cantidad,
      motivo: form.motivo.trim() || null,
      proveedor: form.proveedor.trim() || null,
      referencia: form.referencia.trim() || null,
      usuario,
      origen: 'panel',
    });

    if (insertError) {
      console.error('Error registrando entrada:', insertError);
      setError(`No se pudo registrar la entrada: ${insertError.message}`);
    } else {
      setSuccess('Entrada registrada correctamente.');
      setForm(EMPTY_FORM);
      await loadData();
    }
    setSaving(false);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Encabezado */}
        <div>
          <h2 className="text-2xl font-bold text-text tracking-tight">Entradas de inventario</h2>
          <p className="text-text-muted text-sm">Registra los ingresos de mercadería al almacén</p>
        </div>

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-success-soft text-success border border-success/30 rounded-lg p-4 text-sm flex items-center justify-between gap-4">
            <span>{success}</span>
            {/* Solo aparece si se llegó desde Código de Barras */}
            {fromBarcode && (
              <button
                type="button"
                onClick={() => router.push('/barcode')}
                className="px-3 py-1.5 text-sm font-medium bg-surface text-text border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2 shrink-0"
              >
                <ScanLine size={16} /> Volver a Escanear Producto
              </button>
            )}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className={`${CARD} p-6`}>
          <h3 className="text-[15px] font-semibold text-text mb-4">Registrar nueva entrada</h3>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className={LABEL}>
                Producto <span className="text-danger">*</span>
              </label>
              <select
                className={FIELD}
                value={form.producto_id}
                onChange={(e) => setField('producto_id', e.target.value)}
              >
                <option value="">Seleccionar producto…</option>
                {enabledProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku ? `${p.sku} · ` : ''}
                    {p.nombre} (Stock: {p.stock ?? 0})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>
                Cantidad <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                min={1}
                step={1}
                placeholder="0"
                className={FIELD}
                value={form.cantidad}
                onChange={(e) => setField('cantidad', e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>Proveedor</label>
              <input
                placeholder="Ej. Distribuidora El Tornillo"
                className={FIELD}
                value={form.proveedor}
                onChange={(e) => setField('proveedor', e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>Documento de referencia</label>
              <input
                placeholder="N° factura o guía"
                className={FIELD}
                value={form.referencia}
                onChange={(e) => setField('referencia', e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>Motivo / descripción</label>
              <input
                placeholder="Ej. Compra, reposición quincenal"
                className={FIELD}
                value={form.motivo}
                onChange={(e) => setField('motivo', e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-border">
            <button
              type="button"
              onClick={() => {
                setForm(EMPTY_FORM);
                setError(null);
                setSuccess(null);
              }}
              className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors"
            >
              Limpiar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-success text-white rounded-lg hover:opacity-90 transition-opacity shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <ArrowDownCircle size={16} />}
              Registrar entrada
            </button>
          </div>
        </form>

        {/* Historial */}
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-[15px] font-semibold text-text">Historial de entradas</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Ingresos registrados en los últimos {DAYS_BACK} días (máx. 50)
            </p>
          </div>

          {loading ? (
            <div className="p-16 text-center text-text-muted italic">Cargando entradas...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface-alt border-b border-border">
                  <tr>
                    <th className={TH}>Fecha</th>
                    <th className={TH}>Producto</th>
                    <th className={TH}>Proveedor</th>
                    <th className={`${TH} text-right`}>Cantidad</th>
                    <th className={TH}>Documento</th>
                    <th className={TH}>Motivo</th>
                    <th className={TH}>Usuario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entradas.length > 0 ? (
                    entradas.map((m) => (
                      <tr key={m.id} className="hover:bg-surface-alt transition-colors">
                        <td className={`${TD} text-text-soft whitespace-nowrap`}>{formatDate(m.created_at)}</td>
                        <td className={`${TD} font-medium text-text`}>
                          {productName.get(m.producto_id) ?? 'Producto no disponible'}
                        </td>
                        <td className={`${TD} text-text-soft`}>{m.proveedor || '—'}</td>
                        <td className={`${TD} text-right font-semibold text-success`}>+{m.cantidad}</td>
                        <td className={`${TD} text-text-soft`}>{m.referencia || '—'}</td>
                        <td className={`${TD} text-text-soft`}>{m.motivo || '—'}</td>
                        <td className={`${TD} text-text-soft`}>{m.usuario || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-text-muted italic">
                        No hay entradas registradas en los últimos {DAYS_BACK} días.
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
