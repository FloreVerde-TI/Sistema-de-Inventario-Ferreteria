"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { etiquetaUsuario } from '@/lib/actividad';
import SiPuede from '@/components/SiPuede';
import { Product, Movimiento } from '@/types';
import { Loader2, ArrowDownCircle, ScanLine } from 'lucide-react';

type ProductOption = Pick<Product, 'id' | 'sku' | 'nombre' | 'stock' | 'habilitado'> & { proveedor_id: string | null };
type ProveedorRow = { id: string; nombre: string };
type EntradaRow = Pick<
  Movimiento,
  'id' | 'producto_id' | 'cantidad' | 'motivo' | 'usuario' | 'proveedor' | 'referencia' | 'observaciones' | 'created_at'
>;

type FormState = {
  producto_id: string;
  cantidad: string;
  proveedor: string; // id del proveedor, '' (ninguno) o NEW_PROVEEDOR
  nuevoProveedor: string;
  referencia: string;
  observaciones: string;
  motivo: string;
};

const EMPTY_FORM: FormState = {
  producto_id: '',
  cantidad: '',
  proveedor: '',
  nuevoProveedor: '',
  referencia: '',
  observaciones: '',
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
const MAX_OBS = 150; // máximo de caracteres de Observaciones
const NEW_PROVEEDOR = '__nuevo_proveedor__';

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
  const [proveedores, setProveedores] = useState<ProveedorRow[]>([]);
  const [entradas, setEntradas] = useState<EntradaRow[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fromBarcode, setFromBarcode] = useState(false);

  const loadData = useCallback(async () => {
    const since = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000).toISOString();

    const [prodRes, entRes, provRes] = await Promise.all([
      supabase
        .from('productos')
        .select('id, sku, nombre, stock, habilitado, proveedor_id')
        .order('nombre'),
      supabase
        .from('movimientos')
        .select('id, producto_id, cantidad, motivo, usuario, proveedor, referencia, observaciones, created_at')
        .eq('tipo', 'entrada')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    ]);

    const failed = prodRes.error ?? entRes.error;
    if (failed) {
      console.error('Error cargando entradas:', failed);
      setError(failed.message);
    } else {
      setError(null);
      setProducts((prodRes.data ?? []) as unknown as ProductOption[]);
      setProveedores((provRes.data ?? []) as ProveedorRow[]);
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

  // Si se llega con un producto ya elegido (desde Código de Barras), se propone su proveedor
  useEffect(() => {
    if (!form.producto_id) return;
    const prov = products.find((p) => p.id === form.producto_id)?.proveedor_id;
    if (prov) setForm((prev) => (prev.proveedor ? prev : { ...prev, proveedor: prov }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // Al elegir un producto, el proveedor se llena solo con el del producto (se puede cambiar)
  const elegirProducto = (id: string) => {
    const prov = products.find((p) => p.id === id)?.proveedor_id ?? '';
    setForm((prev) => ({ ...prev, producto_id: id, proveedor: prov, nuevoProveedor: '' }));
    setSuccess(null);
  };

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
    if (form.proveedor === NEW_PROVEEDOR && !form.nuevoProveedor.trim()) {
      setError('Escribe el nombre del nuevo proveedor.');
      return;
    }

    setSaving(true);

    // Proveedor: se guarda el nombre en el movimiento (así el historial no cambia si luego se renombra)
    let proveedorNombre: string | null = null;
    if (form.proveedor === NEW_PROVEEDOR) {
      const nuevo = form.nuevoProveedor.trim();
      const existente = proveedores.find((p) => p.nombre.trim().toLowerCase() === nuevo.toLowerCase());
      if (existente) {
        proveedorNombre = existente.nombre;
      } else {
        const { data: prov, error: provErr } = await supabase
          .from('proveedores')
          .insert({ nombre: nuevo })
          .select('id, nombre')
          .single();
        if (provErr) {
          setError(`No se pudo crear el proveedor: ${provErr.message}`);
          setSaving(false);
          return;
        }
        const creado = prov as ProveedorRow;
        proveedorNombre = creado.nombre;
        setProveedores((prev) => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }
    } else if (form.proveedor) {
      proveedorNombre = proveedores.find((p) => p.id === form.proveedor)?.nombre ?? null;
    }

    // Quien registra la entrada: "Nombre — Rol"
    const usuario = await etiquetaUsuario();

    // tipo SIEMPRE en minúscula: el trigger solo suma stock con 'entrada' exacto
    const { error: insertError } = await supabase.from('movimientos').insert({
      producto_id: form.producto_id,
      tipo: 'entrada',
      cantidad,
      motivo: form.motivo.trim() || null,
      proveedor: proveedorNombre,
      referencia: form.referencia.trim() || null,
      usuario,
      origen: 'panel',
      observaciones: form.observaciones.trim() || null,
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
                onChange={(e) => elegirProducto(e.target.value)}
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
              <select
                className={FIELD}
                value={form.proveedor}
                onChange={(e) => {
                  setField('proveedor', e.target.value);
                  if (e.target.value !== NEW_PROVEEDOR) setField('nuevoProveedor', '');
                }}
              >
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
                {/* Agregar proveedores requiere permiso de crear o editar productos */}
                <SiPuede permiso="productos_crear" sino={<SiPuede permiso="productos_editar"><option value={NEW_PROVEEDOR}>+ Agregar nuevo proveedor</option></SiPuede>}>
                  <option value={NEW_PROVEEDOR}>+ Agregar nuevo proveedor</option>
                </SiPuede>
              </select>
              {form.proveedor === NEW_PROVEEDOR && (
                <input
                  placeholder="Nombre del nuevo proveedor"
                  className={FIELD}
                  value={form.nuevoProveedor}
                  onChange={(e) => setField('nuevoProveedor', e.target.value)}
                />
              )}
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

            <div className="col-span-2 flex flex-col gap-1.5">
              <label className={LABEL}>Observaciones (opcional)</label>
              <textarea
                rows={2}
                maxLength={MAX_OBS}
                placeholder="Ej. Llegó una caja golpeada, se revisó y está bien"
                className={`${FIELD} resize-none`}
                value={form.observaciones}
                onChange={(e) => setField('observaciones', e.target.value)}
              />
              <span className="text-[11px] text-text-muted text-right">
                {form.observaciones.length}/{MAX_OBS}
              </span>
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
                        <td className={`${TD} text-text-soft`}>
                          {m.motivo || '—'}
                          {m.observaciones && (
                            <div
                              title={m.observaciones}
                              className="text-xs text-text-muted mt-0.5 italic max-w-xs line-clamp-2 [overflow-wrap:anywhere]"
                            >
                              {m.observaciones}
                            </div>
                          )}
                        </td>
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
