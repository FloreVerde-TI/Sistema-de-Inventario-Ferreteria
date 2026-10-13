"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Product, Movimiento } from '@/types';
import { Loader2, ArrowUpCircle } from 'lucide-react';

type ProductOption = Pick<Product, 'id' | 'sku' | 'nombre' | 'stock'>;
type SalidaRow = Pick<
  Movimiento,
  'id' | 'producto_id' | 'cantidad' | 'motivo' | 'usuario' | 'referencia' | 'created_at'
>;

type FormState = {
  producto_id: string;
  cantidad: string;
  motivo: string;
  referencia: string;
};

const EMPTY_FORM: FormState = {
  producto_id: '',
  cantidad: '',
  motivo: '',
  referencia: '',
};

const MOTIVOS = [
  'Venta',
  'Producto dañado',
  'Ajuste de inventario',
  'Uso interno',
  'Devolución a proveedor',
  'Pérdida / Robo',
];

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

export default function SalidasPage() {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [salidas, setSalidas] = useState<SalidaRow[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const since = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000).toISOString();

    const [prodRes, salRes] = await Promise.all([
      supabase
        .from('productos')
        .select('id, sku, nombre, stock')
        .neq('activo', false)
        .order('nombre'),
      supabase
        .from('movimientos')
        .select('id, producto_id, cantidad, motivo, usuario, referencia, created_at')
        .eq('tipo', 'salida')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const failed = prodRes.error ?? salRes.error;
    if (failed) {
      console.error('Error cargando salidas:', failed);
      setError(failed.message);
    } else {
      setError(null);
      setProducts((prodRes.data ?? []) as ProductOption[]);
      setSalidas((salRes.data ?? []) as SalidaRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Si se llega desde Código de Barras, el producto viene en la dirección (?producto=ID)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('producto');
    if (id) setForm((prev) => ({ ...prev, producto_id: id }));
  }, []);

  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.nombre])), [products]);

  const setField = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cantidad = Number(form.cantidad);
    const product = products.find((p) => p.id === form.producto_id);

    if (!product) {
      setError('Selecciona un producto.');
      return;
    }
    if (!form.motivo) {
      setError('Selecciona el motivo de la salida.');
      return;
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setError('La cantidad debe ser un número entero mayor que 0.');
      return;
    }
    // La base de datos resta sin revisar, así que se valida aquí para no dejar stock negativo
    if (cantidad > (product.stock ?? 0)) {
      setError(`No hay stock suficiente: "${product.nombre}" tiene ${product.stock ?? 0} unidades.`);
      return;
    }

    setSaving(true);

    // Nombre del usuario que registra la salida
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

    // cantidad siempre positiva: el trigger resta el stock cuando tipo no es 'entrada'
    const { error: insertError } = await supabase.from('movimientos').insert({
      producto_id: form.producto_id,
      tipo: 'salida',
      cantidad,
      motivo: form.motivo,
      referencia: form.referencia.trim() || null,
      usuario,
      origen: 'panel',
    });

    if (insertError) {
      console.error('Error registrando salida:', insertError);
      setError(`No se pudo registrar la salida: ${insertError.message}`);
    } else {
      setSuccess('Salida registrada correctamente.');
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
          <h2 className="text-2xl font-bold text-text tracking-tight">Salidas de inventario</h2>
          <p className="text-text-muted text-sm">Registra las salidas de productos del almacén</p>
        </div>

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-success-soft text-success border border-success/30 rounded-lg p-4 text-sm">
            {success}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className={`${CARD} p-6`}>
          <h3 className="text-[15px] font-semibold text-text mb-4">Registrar nueva salida</h3>

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
                {products.map((p) => (
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
              <label className={LABEL}>
                Motivo <span className="text-danger">*</span>
              </label>
              <select
                className={FIELD}
                value={form.motivo}
                onChange={(e) => setField('motivo', e.target.value)}
              >
                <option value="">Seleccionar motivo…</option>
                {MOTIVOS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2 flex flex-col gap-1.5">
              <label className={LABEL}>Documento de referencia</label>
              <input
                placeholder="N° boleta o comprobante"
                className={FIELD}
                value={form.referencia}
                onChange={(e) => setField('referencia', e.target.value)}
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
              className="px-4 py-2 text-sm font-medium bg-danger text-white rounded-lg hover:opacity-90 transition-opacity shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <ArrowUpCircle size={16} />}
              Registrar salida
            </button>
          </div>
        </form>

        {/* Historial */}
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-[15px] font-semibold text-text">Historial de salidas</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Egresos registrados en los últimos {DAYS_BACK} días (máx. 50)
            </p>
          </div>

          {loading ? (
            <div className="p-16 text-center text-text-muted italic">Cargando salidas...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface-alt border-b border-border">
                  <tr>
                    <th className={TH}>Fecha</th>
                    <th className={TH}>Producto</th>
                    <th className={TH}>Motivo</th>
                    <th className={`${TH} text-right`}>Cantidad</th>
                    <th className={TH}>Documento</th>
                    <th className={TH}>Usuario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {salidas.length > 0 ? (
                    salidas.map((m) => (
                      <tr key={m.id} className="hover:bg-surface-alt transition-colors">
                        <td className={`${TD} text-text-soft whitespace-nowrap`}>{formatDate(m.created_at)}</td>
                        <td className={`${TD} font-medium text-text`}>
                          {productName.get(m.producto_id) ?? 'Producto no disponible'}
                        </td>
                        <td className={`${TD} text-text-soft`}>{m.motivo || '—'}</td>
                        <td className={`${TD} text-right font-semibold text-danger`}>−{m.cantidad}</td>
                        <td className={`${TD} text-text-soft`}>{m.referencia || '—'}</td>
                        <td className={`${TD} text-text-soft`}>{m.usuario || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-text-muted italic">
                        No hay salidas registradas en los últimos {DAYS_BACK} días.
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
