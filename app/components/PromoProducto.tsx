'use client';

import React, { useEffect, useState } from 'react';
import { BadgePercent, Loader2, Save, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { etiquetaUsuario, registrarActividad } from '@/lib/actividad';
import { useLimpiarAlSalir } from '@/lib/limpiarAlSalir';
import {
  Promocion,
  PromoVigente,
  REDONDEOS,
  TipoPromo,
  aCampoFecha,
  finDelDia,
  formatoColones,
  hoyCampoFecha,
  inicioDelDia,
  precioConDescuento,
  rebaja,
} from '@/lib/promos';

const FIELD =
  'w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all disabled:opacity-50 disabled:cursor-not-allowed';
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-text-soft mb-1';

type Form = {
  tipo: TipoPromo;
  porcentaje: string;
  precioOferta: string;
  redondeo: number;
  sello: string;
  inicia: string;
  termina: string;
};

const VACIO: Form = { tipo: 'descuento', porcentaje: '', precioOferta: '', redondeo: 0, sello: '', inicia: '', termina: '' };

/**
 * Oferta o descuento de UN producto (Editar producto).
 * Viene apagado; al encenderlo se muestran los campos. Tiene su propio botón de guardar.
 */
export default function PromoProducto({
  productoId,
  nombre,
  precio,
  defensa,
}: {
  productoId: string;
  nombre: string;
  precio: number;
  defensa: boolean;
}) {
  const [cargando, setCargando] = useState(true);
  const [existente, setExistente] = useState<Promocion | null>(null);
  const [vigente, setVigente] = useState<PromoVigente | null>(null);
  const [encendido, setEncendido] = useState(false);
  const [form, setForm] = useState<Form>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  useLimpiarAlSalir(setError, setAviso); // avisos fuera al volver a la pantalla

  async function cargar() {
    const [propia, mejor] = await Promise.all([
      supabase
        .from('promociones')
        .select('*')
        .eq('producto_id', productoId)
        .eq('alcance', 'producto')
        .eq('activa', true)
        .maybeSingle(),
      supabase.rpc('promo_de_producto', { p_producto: productoId }),
    ]);
    const p = (propia.data as Promocion | null) ?? null;
    setExistente(p);
    const m = ((mejor.data ?? []) as PromoVigente[])[0] ?? null;
    setVigente(m);
    if (p) {
      setEncendido(true);
      setForm({
        tipo: p.tipo,
        porcentaje: p.porcentaje != null ? String(p.porcentaje) : '',
        precioOferta: p.precio_oferta != null ? String(p.precio_oferta) : '',
        redondeo: p.redondeo ?? 0,
        sello: p.sello_texto ?? '',
        inicia: aCampoFecha(p.inicia),
        termina: aCampoFecha(p.termina, true),
      });
    } else {
      setEncendido(false);
      setForm({ ...VACIO, inicia: hoyCampoFecha() });
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Vista previa
  const pct = Number(form.porcentaje);
  const oferta = Number(form.precioOferta);
  const final =
    form.tipo === 'descuento'
      ? pct > 0 && pct < 100
        ? precioConDescuento(precio, pct, form.redondeo)
        : null
      : oferta > 0
      ? oferta
      : null;
  const baja = final != null ? rebaja(precio, final) : null;

  // Promoción que viene de otro lado (categoría, proveedor o toda la tienda)
  const masiva = vigente && vigente.promocion_id !== existente?.id ? vigente : null;

  async function guardar() {
    setError(null);
    setAviso(null);
    if (!precio || precio <= 0) return setError('El producto necesita un precio de venta mayor a 0.');
    if (form.tipo === 'descuento' && !(pct > 0 && pct < 100)) return setError('El descuento debe estar entre 1% y 99%.');
    if (form.tipo === 'oferta' && !(oferta > 0)) return setError('Escribe el precio de oferta.');
    if (final == null || final >= precio) return setError('El precio con promoción debe ser menor al precio normal.');
    if (!form.inicia) return setError('Elige la fecha de inicio.');
    if (form.termina && form.termina < form.inicia) return setError('La fecha de fin no puede ser antes del inicio.');

    setGuardando(true);
    try {
      const datos = {
        tipo: form.tipo,
        alcance: 'producto' as const,
        producto_id: productoId,
        porcentaje: form.tipo === 'descuento' ? pct : null,
        precio_oferta: form.tipo === 'oferta' ? oferta : null,
        redondeo: form.tipo === 'descuento' ? form.redondeo : 0,
        sello_texto: form.sello.trim().toUpperCase() || null,
        inicia: inicioDelDia(form.inicia),
        termina: form.termina ? finDelDia(form.termina) : null,
        activa: true,
      };
      if (existente) {
        const { error: e } = await supabase.from('promociones').update(datos).eq('id', existente.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('promociones').insert({ ...datos, creado_por: await etiquetaUsuario() });
        if (e) throw e;
      }
      await registrarActividad({
        accion: existente ? 'editar' : 'crear',
        entidad: 'promocion',
        entidad_id: productoId,
        detalle: `${existente ? 'Editó' : 'Creó'} ${form.tipo === 'oferta' ? 'la oferta' : `el descuento de ${pct}%`} de "${nombre}" (${formatoColones(precio)} → ${formatoColones(final)})`,
      });
      setAviso('Promoción guardada.');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'No se pudo guardar la promoción.');
    } finally {
      setGuardando(false);
    }
  }

  async function terminar() {
    if (!existente) {
      setEncendido(false);
      return;
    }
    if (!confirm(`¿Terminar la promoción de "${nombre}"? Vuelve a su precio normal de ${formatoColones(precio)}.`)) return;
    setGuardando(true);
    const { error: e } = await supabase.from('promociones').update({ activa: false }).eq('id', existente.id);
    setGuardando(false);
    if (e) return setError(e.message);
    await registrarActividad({
      accion: 'eliminar',
      entidad: 'promocion',
      entidad_id: productoId,
      detalle: `Terminó la promoción de "${nombre}"`,
    });
    setAviso('Promoción terminada. El producto vuelve a su precio normal.');
    await cargar();
  }

  if (cargando) return null;

  return (
    <div className="card-light bg-surface border border-border rounded-xl shadow-sm p-6 space-y-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-primary"
          checked={encendido}
          onChange={(e) => (e.target.checked ? setEncendido(true) : terminar())}
        />
        <span>
          <span className="flex items-center gap-2 text-sm font-semibold text-text">
            <BadgePercent size={16} /> Oferta o descuento
          </span>
          <span className="block text-xs text-text-muted mt-0.5">
            Baja el precio por un tiempo sin tocar el precio normal.
          </span>
        </span>
      </label>

      {masiva && (
        <p className="text-xs bg-info-soft text-sky-800 rounded-lg p-3 flex gap-2">
          <Info size={14} className="shrink-0 mt-0.5" />
          Ya tiene un descuento general de {Number(masiva.porcentaje)}% ({formatoColones(masiva.precio_final)}). Si creas
          una promoción propia, se usa el precio más bajo de las dos.
        </p>
      )}

      {error && <p className="text-xs bg-danger-soft text-danger rounded-lg p-3">{error}</p>}
      {aviso && <p className="text-xs bg-success-soft text-green-800 rounded-lg p-3">{aviso}</p>}

      {encendido && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(['descuento', 'oferta'] as TipoPromo[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('tipo', t)}
                className={`px-3 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                  form.tipo === t ? 'bg-primary text-white border-primary' : 'bg-bg border-border text-text-soft hover:bg-surface'
                }`}
              >
                {t === 'descuento' ? 'Descuento (%)' : 'Oferta (precio fijo)'}
              </button>
            ))}
          </div>

          {form.tipo === 'descuento' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Porcentaje</label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  className={FIELD}
                  value={form.porcentaje}
                  onChange={(e) => set('porcentaje', e.target.value)}
                  placeholder="Ej: 20"
                />
              </div>
              <div>
                <label className={LABEL}>Redondeo</label>
                <select className={FIELD} value={form.redondeo} onChange={(e) => set('redondeo', Number(e.target.value))}>
                  {REDONDEOS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className={LABEL}>Precio de oferta (₡)</label>
              <input
                type="number"
                min="1"
                className={FIELD}
                value={form.precioOferta}
                onChange={(e) => set('precioOferta', e.target.value)}
                placeholder={`Menos de ${formatoColones(precio)}`}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Desde</label>
              <input type="date" className={FIELD} value={form.inicia} onChange={(e) => set('inicia', e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Hasta (opcional)</label>
              <input type="date" className={FIELD} value={form.termina} onChange={(e) => set('termina', e.target.value)} />
            </div>
          </div>

          {!defensa && (
            <div>
              <label className={LABEL}>Texto del sello en la web (opcional)</label>
              <input
                className={FIELD}
                maxLength={40}
                value={form.sello}
                onChange={(e) => set('sello', e.target.value)}
                placeholder="Ej: VIERNES NEGRO"
              />
            </div>
          )}

          {/* Comparativa */}
          <div className="rounded-lg border border-border bg-bg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-text-muted">Precio normal</span>
              <span className="tabular-nums">{formatoColones(precio)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Con promoción</span>
              <span className="tabular-nums">{final != null ? formatoColones(final) : '—'}</span>
            </div>
            {baja && baja.monto > 0 && (
              <div className="flex justify-between text-danger text-xs">
                <span>Baja por promoción</span>
                <span className="tabular-nums">
                  −{formatoColones(baja.monto)} (−{baja.pct}%)
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="flex-1 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {existente ? 'Guardar promoción' : 'Crear promoción'}
            </button>
            {existente && (
              <button
                type="button"
                onClick={terminar}
                disabled={guardando}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-border text-danger hover:bg-danger-soft whitespace-nowrap"
              >
                Terminar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
