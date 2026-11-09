'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, BadgePercent, CheckCircle2, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { etiquetaUsuario, registrarActividad } from '@/lib/actividad';
import { useLimpiarAlSalir } from '@/lib/limpiarAlSalir';
import {
  Promocion,
  PromoVigente,
  REDONDEOS,
  aCampoFecha,
  cargarPromosVigentes,
  finDelDia,
  formatoColones,
  hoyCampoFecha,
  inicioDelDia,
  precioConDescuento,
} from '@/lib/promos';

// =====================================================================
// DESCUENTO GENERAL (por categoría, proveedor o toda la tienda)
// No cambia el precio normal: al terminar la fecha cada producto vuelve
// solo a su precio. Si un producto tiene otra promoción, se usa la mejor.
// =====================================================================

type Producto = {
  id: string;
  nombre: string;
  sku: string | null;
  precio: number | null;
  categoria_id: string | null;
  proveedor_id: string | null;
  habilitado: boolean | null;
};
type Opcion = { id: string; nombre: string };
type Alcance = 'todos' | 'categoria' | 'proveedor';

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-light transition-all';
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-text-soft mb-1';
const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-soft';
const TD = 'px-4 py-2.5';

export default function PromoMasiva({
  productos,
  categorias,
  proveedores,
  defensa,
}: {
  productos: Producto[];
  categorias: Opcion[];
  proveedores: Opcion[];
  defensa: boolean;
}) {
  const [alcance, setAlcance] = useState<Alcance>('categoria');
  const [destino, setDestino] = useState('');
  const [pctTxt, setPctTxt] = useState('');
  const [redondeo, setRedondeo] = useState(0);
  const [inicia, setInicia] = useState(hoyCampoFecha());
  const [termina, setTermina] = useState('');
  const [sello, setSello] = useState('');

  const [activas, setActivas] = useState<Promocion[]>([]);
  const [vigentes, setVigentes] = useState<Map<string, PromoVigente>>(new Map());
  const [recarga, setRecarga] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  useLimpiarAlSalir(setError, setExito); // avisos fuera al volver a la pantalla

  useEffect(() => {
    async function cargar() {
      const [act, vig] = await Promise.all([
        supabase.from('promociones').select('*').eq('activa', true).neq('alcance', 'producto').order('created_at', { ascending: false }),
        cargarPromosVigentes(),
      ]);
      setActivas((act.data ?? []) as Promocion[]);
      setVigentes(vig);
    }
    cargar();
  }, [recarga]);

  useEffect(() => setConfirmando(false), [alcance, destino, pctTxt, redondeo, inicia, termina]);

  const pct = Number(pctTxt.replace(',', '.'));
  const pctValido = pctTxt.trim() !== '' && pct >= 1 && pct <= 95;

  const nombreDe = (a: Alcance | 'producto', id: string | null) =>
    a === 'todos'
      ? 'Toda la tienda'
      : a === 'categoria'
      ? `Categoría ${categorias.find((c) => c.id === id)?.nombre ?? '—'}`
      : a === 'proveedor'
      ? `Proveedor ${proveedores.find((p) => p.id === id)?.nombre ?? '—'}`
      : 'Producto';

  const afectados = useMemo(() => {
    if (alcance !== 'todos' && !destino) return [];
    return productos.filter(
      (p) =>
        p.habilitado !== false &&
        Number(p.precio ?? 0) > 0 &&
        (alcance === 'todos' || (alcance === 'categoria' ? p.categoria_id === destino : p.proveedor_id === destino))
    );
  }, [productos, alcance, destino]);

  const vista = useMemo(() => {
    if (!pctValido) return [];
    return afectados.map((p) => {
      const normal = Number(p.precio);
      const nuevo = precioConDescuento(normal, pct, redondeo);
      const otra = vigentes.get(p.id);
      // Si ya tiene una promoción más barata, se queda esa
      const mejorOtra = otra && otra.precio_final < nuevo ? otra : null;
      return { ...p, normal, nuevo, mejorOtra };
    });
  }, [afectados, pct, pctValido, redondeo, vigentes]);

  // ¿Ya hay un descuento general para el mismo grupo? Se reemplaza.
  const repetida = activas.find(
    (a) => a.alcance === alcance && (alcance === 'todos' || (alcance === 'categoria' ? a.categoria_id : a.proveedor_id) === destino)
  );

  const totalNormal = vista.reduce((s, p) => s + p.normal, 0);
  const totalNuevo = vista.reduce((s, p) => s + (p.mejorOtra ? p.mejorOtra.precio_final : p.nuevo), 0);

  async function crear() {
    setError(null);
    if (alcance !== 'todos' && !destino) return setError('Elige la categoría o el proveedor.');
    if (!pctValido) return setError('El descuento debe estar entre 1% y 95%.');
    if (!inicia) return setError('Elige la fecha de inicio.');
    if (termina && termina < inicia) return setError('La fecha de fin no puede ser antes del inicio.');
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setGuardando(true);
    try {
      if (repetida) {
        const { error: e } = await supabase.from('promociones').update({ activa: false }).eq('id', repetida.id);
        if (e) throw e;
      }
      const { error: e } = await supabase.from('promociones').insert({
        tipo: 'descuento',
        alcance,
        categoria_id: alcance === 'categoria' ? destino : null,
        proveedor_id: alcance === 'proveedor' ? destino : null,
        porcentaje: pct,
        redondeo,
        sello_texto: sello.trim().toUpperCase() || null,
        inicia: inicioDelDia(inicia),
        termina: termina ? finDelDia(termina) : null,
        creado_por: await etiquetaUsuario(),
      });
      if (e) throw e;
      await registrarActividad({
        accion: 'crear',
        entidad: 'promocion',
        detalle: `Creó un descuento de ${pct}% · ${nombreDe(alcance, destino)} (${vista.length} producto(s))${
          termina ? ` hasta el ${termina}` : ''
        }`,
      });
      setExito(`Descuento de ${pct}% creado para ${vista.length} producto(s).`);
      setPctTxt('');
      setSello('');
      setRecarga((n) => n + 1);
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'No se pudo crear el descuento.');
    } finally {
      setGuardando(false);
      setConfirmando(false);
    }
  }

  async function terminar(p: Promocion) {
    if (!confirm(`¿Terminar el descuento de ${Number(p.porcentaje)}% (${nombreDe(p.alcance, p.categoria_id ?? p.proveedor_id)})?`)) return;
    const { error: e } = await supabase.from('promociones').update({ activa: false }).eq('id', p.id);
    if (e) return setError(e.message);
    await registrarActividad({
      accion: 'eliminar',
      entidad: 'promocion',
      detalle: `Terminó el descuento de ${Number(p.porcentaje)}% · ${nombreDe(p.alcance, p.categoria_id ?? p.proveedor_id)}`,
    });
    setRecarga((n) => n + 1);
  }

  return (
    <div className="space-y-6">
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

      {/* Descuentos generales activos */}
      {activas.length > 0 && (
        <div className={`${CARD} p-6 space-y-3`}>
          <h3 className="text-[15px] font-semibold text-text">Descuentos generales activos</h3>
          <ul className="divide-y divide-border">
            {activas.map((a) => (
              <li key={a.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                <span>
                  <strong>−{Number(a.porcentaje)}%</strong> · {nombreDe(a.alcance, a.categoria_id ?? a.proveedor_id)}
                  <span className="text-text-muted">
                    {' '}
                    · desde {aCampoFecha(a.inicia)}
                    {a.termina ? ` hasta ${aCampoFecha(a.termina, true)}` : ' (sin fecha de fin)'}
                    {!defensa && a.sello_texto ? ` · sello "${a.sello_texto}"` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => terminar(a)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-danger hover:bg-danger-soft whitespace-nowrap justify-center"
                >
                  Terminar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`${CARD} p-6 space-y-4`}>
          <h3 className="text-[15px] font-semibold text-text">1. ¿A qué productos?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Aplicar a</label>
              <select
                className={FIELD}
                value={alcance}
                onChange={(e) => {
                  setAlcance(e.target.value as Alcance);
                  setDestino('');
                }}
              >
                <option value="categoria">Una categoría</option>
                <option value="proveedor">Un proveedor</option>
                <option value="todos">Toda la tienda</option>
              </select>
            </div>
            {alcance !== 'todos' && (
              <div>
                <label className={LABEL}>{alcance === 'categoria' ? 'Categoría' : 'Proveedor'}</label>
                <select className={FIELD} value={destino} onChange={(e) => setDestino(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {(alcance === 'categoria' ? categorias : proveedores).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="text-xs text-text-muted">{afectados.length} producto(s) habilitado(s) con precio.</p>
          {repetida && (
            <p className="text-xs bg-warning-soft text-amber-800 rounded-lg p-3 flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Ya hay un descuento de {Number(repetida.porcentaje)}% para este grupo. Si creas uno nuevo, lo reemplaza.
            </p>
          )}
        </div>

        <div className={`${CARD} p-6 space-y-4`}>
          <h3 className="text-[15px] font-semibold text-text">2. ¿Cuánto y hasta cuándo?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Descuento (%)</label>
              <input
                type="number"
                min="1"
                max="95"
                className={FIELD}
                value={pctTxt}
                onChange={(e) => setPctTxt(e.target.value)}
                placeholder="Ej. 20"
              />
            </div>
            <div>
              <label className={LABEL}>Redondeo</label>
              <select className={FIELD} value={redondeo} onChange={(e) => setRedondeo(Number(e.target.value))}>
                {REDONDEOS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Desde</label>
              <input type="date" className={FIELD} value={inicia} onChange={(e) => setInicia(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Hasta (opcional)</label>
              <input type="date" className={FIELD} value={termina} onChange={(e) => setTermina(e.target.value)} />
            </div>
            {!defensa && (
              <div className="sm:col-span-2">
                <label className={LABEL}>Texto del sello en la web (opcional)</label>
                <input
                  className={FIELD}
                  maxLength={40}
                  value={sello}
                  onChange={(e) => setSello(e.target.value)}
                  placeholder="Ej. VIERNES NEGRO, LIQUIDACIÓN"
                />
              </div>
            )}
          </div>
          <p className="text-xs text-text-muted">El precio normal no cambia: al terminar la fecha, cada producto vuelve solo a su precio.</p>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-text">3. Revisa y crea</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {vista.length === 0
                ? 'Elige los productos y el porcentaje para ver el resultado.'
                : `${vista.length} producto(s). Precio normal total ${formatoColones(totalNormal)} → con descuento ${formatoColones(
                    totalNuevo
                  )} (−${formatoColones(totalNormal - totalNuevo)}).`}
            </p>
          </div>
          {vista.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              {confirmando && !guardando && (
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors justify-center whitespace-nowrap"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={crear}
                disabled={guardando}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50 ${
                  confirmando ? 'bg-danger hover:opacity-90' : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {guardando ? <Loader2 size={16} className="animate-spin" /> : <BadgePercent size={16} />}
                {guardando ? 'Creando…' : confirmando ? `Sí, crear descuento de ${pct}%` : 'Crear descuento'}
              </button>
            </div>
          )}
        </div>

        {confirmando && (
          <div className="px-6 py-3 bg-warning-soft text-amber-800 text-sm flex items-center gap-2 border-b border-border">
            <AlertTriangle size={16} className="shrink-0" /> Se aplicará −{pct}% a {vista.length} producto(s)
            {repetida ? ' y se reemplazará el descuento anterior' : ''}. Presiona otra vez para confirmar.
          </div>
        )}

        {vista.length > 0 && (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-alt border-b border-border sticky top-0">
                <tr>
                  <th className={TH}>Producto</th>
                  <th className={`${TH} text-right`}>Precio normal</th>
                  <th className={TH}></th>
                  <th className={`${TH} text-right`}>Con descuento</th>
                  <th className={`${TH} text-right`}>Baja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vista.map((p) => {
                  const final = p.mejorOtra ? p.mejorOtra.precio_final : p.nuevo;
                  return (
                    <tr key={p.id} className="hover:bg-surface-alt">
                      <td className={TD}>
                        <div className="font-medium text-text">{p.nombre}</div>
                        <div className="text-xs text-text-muted">
                          {p.sku || 'Sin SKU'}
                          {p.mejorOtra && ' · ya tiene una promoción mejor: se queda esa'}
                        </div>
                      </td>
                      <td className={`${TD} text-right text-text-soft`}>{formatoColones(p.normal)}</td>
                      <td className={`${TD} text-text-muted`}>
                        <ArrowRight size={14} />
                      </td>
                      <td className={`${TD} text-right font-semibold text-text`}>{formatoColones(final)}</td>
                      <td className={`${TD} text-right font-medium text-danger`}>
                        −{formatoColones(p.normal - final)} (−{Math.round(((p.normal - final) / p.normal) * 1000) / 10}%)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
