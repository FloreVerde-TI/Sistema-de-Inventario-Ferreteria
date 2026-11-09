'use client';

import React, { useEffect, useState } from 'react';
import { CalendarHeart, Globe, Loader2, Save, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { registrarActividad } from '@/lib/actividad';
import SelloPromo from '@/components/SelloPromo';
import { ClaveSello, NOMBRES_SELLO, PLANTILLAS_SELLOS, SellosPromo, leerSellos } from '@/lib/sellos';
import { temaDeFecha } from '@/lib/temas';
import { useLimpiarAlSalir } from '@/lib/limpiarAlSalir';

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all';
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-text-soft mb-1';

/**
 * "Tarjetas por promociones": texto y color de los sellos de la página web.
 * Se guarda al instante con su propio botón (como Catálogos).
 */
export default function TarjetasPromo({ filaId }: { filaId: number | null }) {
  const [sellos, setSellos] = useState<SellosPromo>(leerSellos(null));
  const [original, setOriginal] = useState('');
  // true = en fechas festivas la web usa sola la plantilla de esa fecha
  const [auto, setAuto] = useState(false);
  // false = la web no muestra ofertas, descuentos ni paquetes (y cobra precio normal)
  const [mostrar, setMostrar] = useState(true);
  const [guardandoMostrar, setGuardandoMostrar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null);
  useLimpiarAlSalir(setAviso); // avisos fuera al volver a la pantalla

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase.from('settings').select('sellos_promo').maybeSingle();
      const guardado = (data as { sellos_promo: { auto?: boolean; mostrar?: boolean } | null } | null)?.sellos_promo;
      setMostrar(guardado?.mostrar !== false);
      const s = leerSellos(guardado);
      const a = guardado?.auto === true;
      setSellos(s);
      setAuto(a);
      setOriginal(JSON.stringify({ ...s, auto: a }));
      setCargando(false);
    }
    cargar();
  }, []);

  const cambiar = (k: ClaveSello, campo: 'texto' | 'color', v: string) =>
    setSellos((s) => ({ ...s, [k]: { ...s[k], [campo]: campo === 'texto' ? v.toUpperCase() : v } }));

  async function guardar() {
    setAviso(null);
    if ((Object.keys(sellos) as ClaveSello[]).some((k) => !sellos[k].texto.trim()))
      return setAviso({ tipo: 'error', texto: 'Ningún sello puede quedar sin texto.' });
    setGuardando(true);
    const { error } = await supabase.rpc('guardar_sellos_promo', { p_sellos: { ...sellos, auto, mostrar } });
    setGuardando(false);
    if (error) return setAviso({ tipo: 'error', texto: error.message });
    await registrarActividad({ accion: 'editar', entidad: 'configuracion', detalle: 'Cambió las tarjetas por promociones de la web' });
    setOriginal(JSON.stringify({ ...sellos, auto }));
    setAviso({ tipo: 'exito', texto: 'Tarjetas guardadas. La web las muestra al recargar.' });
  }

  const hayCambios = JSON.stringify({ ...sellos, auto }) !== original;

  // Se guarda al instante (no espera a "Guardar tarjetas")
  async function cambiarMostrar(valor: boolean) {
    setAviso(null);
    setGuardandoMostrar(true);
    const { data: fila } = await supabase.from('settings').select('sellos_promo').maybeSingle();
    const actual = ((fila as { sellos_promo: Record<string, unknown> | null } | null)?.sellos_promo ?? {}) as Record<string, unknown>;
    const { error } = await supabase.rpc('guardar_sellos_promo', { p_sellos: { ...actual, mostrar: valor } });
    setGuardandoMostrar(false);
    if (error) return setAviso({ tipo: 'error', texto: error.message });
    setMostrar(valor);
    await registrarActividad({
      accion: 'editar',
      entidad: 'configuracion',
      detalle: valor ? 'Encendió las promociones en la página web' : 'Apagó las promociones en la página web',
    });
    setAviso({ tipo: 'exito', texto: valor ? 'La web ya muestra las promociones.' : 'La web ya no muestra promociones (cobra precio normal).' });
  }
  const temaHoy = temaDeFecha();

  return (
    <div className={`${CARD} p-6`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-soft text-primary-ink rounded-lg flex items-center justify-center">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-text">Tarjetas por promociones</h3>
            <p className="text-xs text-text-muted">Los sellos con picos que salen en la página web</p>
          </div>
        </div>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || cargando || !hayCambios}
          className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary-dark flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
        >
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Guardar tarjetas
        </button>
      </div>

      {aviso && (
        <p className={`mb-4 text-sm rounded-lg p-3 ${aviso.tipo === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
          {aviso.texto}
        </p>
      )}

      {cargando ? (
        <p className="text-sm text-text-muted italic">Cargando…</p>
      ) : (
        <>
          {/* Interruptor general de la web */}
          <label className={`flex items-start gap-3 mb-3 p-3 rounded-lg border ${mostrar ? 'border-primary bg-primary-soft' : 'border-border bg-bg'} ${guardandoMostrar ? 'opacity-60' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary"
              checked={mostrar}
              disabled={guardandoMostrar}
              onChange={(e) => cambiarMostrar(e.target.checked)}
            />
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold text-text">
                <Globe size={16} /> Mostrar promociones (ofertas, paquetes y descuentos) en la página web
              </span>
              <span className="block text-xs text-text-muted mt-0.5">
                Se guarda al instante. Apagado: la web no muestra ofertas, descuentos ni paquetes y cobra el precio normal. El
                inventario las sigue mostrando igual.
              </span>
            </span>
          </label>

          {/* Automático por fecha festiva: no depende de si cada usuario tiene la temática encendida */}
          <label className="flex items-start gap-3 cursor-pointer mb-5 p-3 rounded-lg border border-border bg-bg">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold text-text">
                <CalendarHeart size={16} /> Tarjetas festivas automáticas
              </span>
              <span className="block text-xs text-text-muted mt-0.5">
                En Navidad, Halloween, Independencia, Amor y Amistad, Día de la Madre y Semana Santa la web usa sola la
                plantilla de esa fecha. El resto del año, las tarjetas de aquí abajo.
                {temaHoy ? ` Hoy aplica: ${temaHoy.emoji} ${temaHoy.nombre}.` : ' Hoy no hay fecha festiva.'}
              </span>
            </span>
          </label>

          <p className={LABEL}>Plantillas</p>
          <div className="flex flex-wrap gap-2 mb-6">
            {PLANTILLAS_SELLOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSellos(p.sellos)}
                className="px-3 py-1.5 text-sm rounded-lg border border-border bg-bg hover:bg-surface whitespace-nowrap"
              >
                {p.emoji} {p.nombre}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(Object.keys(NOMBRES_SELLO) as ClaveSello[]).map((k) => (
              <div key={k} className="border border-border rounded-lg p-4 flex gap-4 items-center">
                <SelloPromo texto={sellos[k].texto || ' '} extra={k === 'descuentos' ? '20%' : undefined} color={sellos[k].color} size={84} />
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-sm font-semibold text-text">{NOMBRES_SELLO[k]}</p>
                  <input
                    className={FIELD}
                    maxLength={30}
                    value={sellos[k].texto}
                    onChange={(e) => cambiar(k, 'texto', e.target.value)}
                    aria-label={`Texto de ${NOMBRES_SELLO[k]}`}
                  />
                  <label className="flex items-center gap-2 text-xs text-text-soft">
                    <input
                      type="color"
                      value={sellos[k].color}
                      onChange={(e) => cambiar(k, 'color', e.target.value)}
                      className="h-8 w-10 rounded border border-border bg-bg cursor-pointer"
                    />
                    Color
                  </label>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-4">
            En Descuentos, la web agrega el porcentaje (ej. &quot;DESCUENTOS 20%&quot;). Cada promoción puede tener además su propio texto
            (ej. &quot;VIERNES NEGRO&quot;) desde Editar producto, Actualizar precios o Paquetes.
          </p>
        </>
      )}
    </div>
  );
}
