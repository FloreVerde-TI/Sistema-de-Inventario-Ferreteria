"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { registrarActividad } from '@/lib/actividad';
import SiPuede from '@/components/SiPuede';
import { usePerfil } from '@/components/AdminLayout';
import { Product } from '@/types';
import { Search, Eye, X, Check, Ban, ClipboardCheck, RotateCcw } from 'lucide-react';

type Estado = 'Pendiente' | 'Aprobado' | 'Rechazado';
type EstadoFilter = 'all' | Estado;
type PagoFilter = 'all' | 'sinpe' | 'transferencia' | 'whatsapp';

type PedidoRow = {
  id: string;
  codigo: string | null; // ej. 0413332D (el mismo del WhatsApp)
  nombre_cliente: string | null;
  telefono: string | null;
  total: number | null;
  estado: string | null;
  fecha: string | null;
  metodo_pago: string | null;
  revisado_nombre: string | null;
  revisado_en: string | null;
  motivo_rechazo: string | null;
  reabierto_nombre: string | null;
  reabierto_en: string | null;
};
type DetalleRow = { id: string; producto_id: string | null; cantidad: number; precio_unitario: number };
type ProductInfo = Pick<Product, 'id' | 'nombre' | 'stock'>;

type Filters = { search: string; desde: string; hasta: string; estado: EstadoFilter; pago: PagoFilter };

const EMPTY_FILTERS: Filters = { search: '', desde: '', hasta: '', estado: 'all', pago: 'all' };
const PAGE_SIZE = 20;
const COLUMNS =
  'id, codigo, nombre_cliente, telefono, total, estado, fecha, metodo_pago, revisado_nombre, revisado_en, motivo_rechazo, reabierto_nombre, reabierto_en';

// Un pedido sin estado (null) o con "pendiente" en minúscula cuenta como Pendiente
const PENDIENTE_COND = 'or(estado.is.null,estado.ilike.pendiente)';

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-primary-light transition-all';
const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-soft';
const TD = 'px-4 py-3';
const ICON_BTN = 'p-2 rounded-lg text-text-soft hover:bg-bg hover:text-text transition-colors';

const PAGO_LABEL: Record<string, string> = { sinpe: 'SINPE', transferencia: 'Transferencia', whatsapp: 'WhatsApp' };

function normEstado(estado: string | null): Estado {
  const e = (estado ?? '').trim().toLowerCase();
  if (e === 'aprobado') return 'Aprobado';
  if (e === 'rechazado') return 'Rechazado';
  return 'Pendiente';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrice(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return `₡${Number(value).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CR');
}

// Nombre y rol de quien revisa, ej. "Adrian — Administrador"
async function getReviewer(): Promise<{ id: string; label: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error('No hay una sesión iniciada.');
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();
  const name = prof?.full_name || user.email || 'Usuario';
  return { id: user.id, label: prof?.role ? `${name} — ${prof.role}` : name };
}

export default function PedidosPage() {
  const [rows, setRows] = useState<PedidoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<PedidoRow | null>(null);
  const [reopening, setReopening] = useState<PedidoRow | null>(null);
  // Tiempo real: cuando llega o cambia un pedido, la lista se recarga sola (sin parpadear)
  const [refresco, setRefresco] = useState(0);
  const silencioso = useRef(false);

  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel('pedidos-pantalla')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (cambio) => {
        if (cambio.eventType === 'INSERT') setNotice('🔔 Llegó un pedido nuevo desde la web.');
        // Se espera un momento para que el pedido termine de guardarse con sus productos
        clearTimeout(espera);
        espera = setTimeout(() => {
          silencioso.current = true;
          setRefresco((n) => n + 1);
        }, 800);
      })
      .subscribe();
    return () => {
      clearTimeout(espera);
      supabase.removeChannel(canal);
    };
  }, []);

  // Al salir de la pantalla, filtros, búsqueda y página vuelven a empezar
  useEffect(() => {
    return () => {
      setDraft(EMPTY_FILTERS);
      setApplied(EMPTY_FILTERS);
      setPage(1);
      setNotice(null);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Las recargas automáticas no muestran el "cargando"
      if (!silencioso.current) setLoading(true);
      silencioso.current = false;
      let query = supabase
        .from('pedidos')
        .select(COLUMNS, { count: 'exact' })
        .order('fecha', { ascending: false });

      const conds: string[] = [];
      if (applied.estado === 'Pendiente') conds.push(PENDIENTE_COND);
      else if (applied.estado !== 'all') query = query.ilike('estado', applied.estado);

      if (applied.pago !== 'all') query = query.eq('metodo_pago', applied.pago);
      if (applied.desde) query = query.gte('fecha', new Date(`${applied.desde}T00:00:00`).toISOString());
      if (applied.hasta) query = query.lte('fecha', new Date(`${applied.hasta}T23:59:59.999`).toISOString());

      // Se quita el "#" para poder pegar el código tal como llega por WhatsApp
      const term = applied.search.trim().replace(/[,()%*#]/g, ' ').trim();
      if (term) conds.push(`or(codigo.ilike.%${term}%,nombre_cliente.ilike.%${term}%,telefono.ilike.%${term}%)`);

      if (conds.length > 0) query = query.or(`and(${conds.join(',')})`);

      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error: err } = await query.range(from, from + PAGE_SIZE - 1);
      if (cancelled) return;

      if (err) {
        console.error('Error cargando pedidos:', err);
        setError(err.message);
      } else {
        setError(null);
        setRows((data ?? []) as PedidoRow[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [applied, page, refresco]);

  const setDraftField = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setApplied(draft);
  };

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setPage(1);
    setApplied(EMPTY_FILTERS);
  };

  function handleReviewed(updated: PedidoRow) {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelected(null);
    setNotice(
      updated.estado === 'Aprobado'
        ? `Pedido #${updated.codigo ?? ''} de ${updated.nombre_cliente ?? 'cliente'} aprobado.`
        : `Pedido #${updated.codigo ?? ''} de ${updated.nombre_cliente ?? 'cliente'} rechazado. El stock se devolvió al inventario.`
    );
  }

  function handleReopened(updated: PedidoRow) {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setReopening(null);
    setNotice(`Pedido de ${updated.nombre_cliente ?? 'cliente'} reabierto. Vuelve a estar Pendiente.`);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);
  const noFilters = useMemo(() => JSON.stringify(applied) === JSON.stringify(EMPTY_FILTERS), [applied]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-text tracking-tight">Gestión de pedidos web</h2>
          <p className="text-text-muted text-sm">Aprueba o rechaza los pedidos que llegan desde la página web</p>
        </div>

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">
            No se pudieron cargar los pedidos: {error}
          </div>
        )}

        {notice && (
          <div className="bg-primary-soft text-primary-ink border border-primary/20 rounded-lg p-4 text-sm flex items-start justify-between gap-3">
            <span>{notice}</span>
            <button type="button" title="Cerrar aviso" onClick={() => setNotice(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Filtros */}
        <form onSubmit={applyFilters} className={`${CARD} p-5 flex flex-wrap gap-3 items-center`}>
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="text"
              placeholder="Buscar por código (#0413332D), cliente o teléfono…"
              className={`${FIELD} w-full pl-10 pr-4`}
              value={draft.search}
              onChange={(e) => setDraftField('search', e.target.value)}
            />
          </div>
          <input
            type="date"
            aria-label="Desde"
            className={FIELD}
            value={draft.desde}
            onChange={(e) => setDraftField('desde', e.target.value)}
          />
          <input
            type="date"
            aria-label="Hasta"
            className={FIELD}
            value={draft.hasta}
            onChange={(e) => setDraftField('hasta', e.target.value)}
          />
          <select
            className={FIELD}
            value={draft.estado}
            onChange={(e) => setDraftField('estado', e.target.value as EstadoFilter)}
          >
            <option value="all">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Aprobado">Aprobado</option>
            <option value="Rechazado">Rechazado</option>
          </select>
          <select
            className={FIELD}
            value={draft.pago}
            onChange={(e) => setDraftField('pago', e.target.value as PagoFilter)}
          >
            <option value="all">Todos los métodos</option>
            <option value="sinpe">SINPE</option>
            <option value="transferencia">Transferencia</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors"
          >
            Limpiar
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm"
          >
            Aplicar filtros
          </button>
        </form>

        {/* Tabla */}
        <div className={`${CARD} overflow-hidden`}>
          {loading ? (
            <div className="p-20 text-center text-text-muted italic">Cargando pedidos...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface-alt border-b border-border">
                  <tr>
                    <th className={TH}>Fecha</th>
                    <th className={TH}>Código</th>
                    <th className={TH}>Cliente</th>
                    <th className={TH}>Teléfono</th>
                    <th className={TH}>Pago</th>
                    <th className={`${TH} text-right`}>Total</th>
                    <th className={TH}>Estado</th>
                    <th className={TH}>Revisado por</th>
                    <th className={`${TH} text-right`}>Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.length > 0 ? (
                    rows.map((p) => {
                      const isPending = normEstado(p.estado) === 'Pendiente';
                      return (
                        <tr key={p.id} className="hover:bg-surface-alt transition-colors">
                          <td className={`${TD} text-text-soft whitespace-nowrap`}>{formatDate(p.fecha)}</td>
                          <td className={`${TD} font-mono font-semibold text-text whitespace-nowrap`}>
                            {p.codigo ? `#${p.codigo}` : '—'}
                          </td>
                          <td className={`${TD} font-medium text-text`}>{p.nombre_cliente || '—'}</td>
                          <td className={`${TD} text-text-soft`}>{p.telefono || '—'}</td>
                          <td className={`${TD} text-text-soft`}>
                            {(p.metodo_pago && PAGO_LABEL[p.metodo_pago]) || '—'}
                          </td>
                          <td className={`${TD} text-right font-semibold text-text`}>{formatPrice(p.total)}</td>
                          <td className={TD}>
                            <EstadoBadge estado={p.estado} />
                          </td>
                          <td className={`${TD} text-text-soft`}>
                            {p.revisado_nombre ? (
                              <>
                                <div>{p.revisado_nombre}</div>
                                <div className="text-xs text-text-muted">{formatDate(p.revisado_en)}</div>
                              </>
                            ) : (
                              '—'
                            )}
                            {p.reabierto_nombre && (
                              <div className="mt-1.5 text-xs text-amber-700">
                                <RotateCcw size={11} className="inline mr-1 -mt-0.5" />
                                Reabierto por {p.reabierto_nombre}
                                <div className="text-text-muted">{formatDate(p.reabierto_en)}</div>
                              </div>
                            )}
                          </td>
                          <td className={TD}>
                            <div className="flex justify-end">
                              {isPending ? (
                                <SiPuede
                                  permiso="pedidos_revisar"
                                  sino={
                                    <button
                                      type="button"
                                      title="Ver pedido"
                                      onClick={() => {
                                        setNotice(null);
                                        setSelected(p);
                                      }}
                                      className={ICON_BTN}
                                    >
                                      <Eye size={16} />
                                    </button>
                                  }
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNotice(null);
                                      setSelected(p);
                                    }}
                                    className="px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-1.5"
                                  >
                                    <ClipboardCheck size={14} /> Revisar
                                  </button>
                                </SiPuede>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    title="Ver pedido"
                                    onClick={() => {
                                      setNotice(null);
                                      setSelected(p);
                                    }}
                                    className={ICON_BTN}
                                  >
                                    <Eye size={16} />
                                  </button>
                                  {normEstado(p.estado) === 'Aprobado' && (
                                    <SiPuede permiso="pedidos_reabrir">
                                    <button
                                      type="button"
                                      title="Reabrir pedido"
                                      onClick={() => {
                                        setNotice(null);
                                        setReopening(p);
                                      }}
                                      className="p-2 rounded-lg text-amber-600 hover:bg-warning-soft transition-colors"
                                    >
                                      <RotateCcw size={16} />
                                    </button>
                                    </SiPuede>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-6 py-20 text-center text-text-muted italic">
                        {total === 0 && noFilters
                          ? 'Aún no hay pedidos web.'
                          : 'No se encontraron pedidos con los filtros aplicados.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between px-6 py-3.5 border-t border-border text-xs text-text-muted">
            <span>
              Mostrando {formatNumber(firstShown)}–{formatNumber(lastShown)} de {formatNumber(total)} pedidos
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 bg-surface border border-border rounded-lg text-text hover:bg-bg transition-colors disabled:opacity-40"
              >
                ‹ Anterior
              </button>
              <span className="px-2">
                Página {page} de {totalPages}
              </span>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 bg-surface border border-border rounded-lg text-text hover:bg-bg transition-colors disabled:opacity-40"
              >
                Siguiente ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <PedidoModal pedido={selected} onClose={() => setSelected(null)} onReviewed={handleReviewed} />
      )}

      {reopening && (
        <ReabrirModal pedido={reopening} onClose={() => setReopening(null)} onReopened={handleReopened} />
      )}
    </AdminLayout>
  );
}

function ReabrirModal({
  pedido,
  onClose,
  onReopened,
}: {
  pedido: PedidoRow;
  onClose: () => void;
  onReopened: (p: PedidoRow) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reopen() {
    setError(null);
    setBusy(true);
    try {
      const reviewer = await getReviewer();
      const changes = {
        estado: 'Pendiente',
        reabierto_por: reviewer.id,
        reabierto_nombre: reviewer.label,
        reabierto_en: new Date().toISOString(),
      };
      // Solo se reabre si sigue Aprobado (los rechazados son definitivos)
      const { data, error: err } = await supabase
        .from('pedidos')
        .update(changes)
        .eq('id', pedido.id)
        .ilike('estado', 'aprobado')
        .select('id');
      if (err) throw new Error(err.message);
      if (!data || data.length === 0) {
        throw new Error('El pedido ya no está aprobado o no hay permisos para modificarlo.');
      }
      await registrarActividad({
        accion: 'reabrir',
        entidad: 'pedido',
        entidad_id: pedido.id,
        detalle: `Reabrió el pedido #${pedido.codigo ?? ''} de ${pedido.nombre_cliente || 'cliente'}`,
      });
      onReopened({ ...pedido, ...changes });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reabrir el pedido.');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className={`${CARD} w-full max-w-md p-6 space-y-4`} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-text flex items-center gap-2">
          <RotateCcw size={18} className="text-amber-600" /> Reabrir pedido
        </h3>
        <p className="text-sm text-text-soft">
          El pedido de <strong>{pedido.nombre_cliente || 'cliente'}</strong> volverá a estar{' '}
          <strong>Pendiente</strong> para revisarlo de nuevo. El stock no cambia.
        </p>
        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-3 text-sm">{error}</div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={reopen}
            className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RotateCcw size={16} /> {busy ? 'Reabriendo...' : 'Reabrir'}
          </button>
        </div>
      </div>
    </div>
  );
}

const ESTADO_BADGES: Record<Estado, string> = {
  Pendiente: 'bg-warning-soft text-amber-800',
  Aprobado: 'bg-success-soft text-green-800',
  Rechazado: 'bg-danger-soft text-red-800',
};

function EstadoBadge({ estado }: { estado: string | null }) {
  const key = normEstado(estado);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${ESTADO_BADGES[key]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {key}
    </span>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-soft">{label}</p>
      <p className="text-sm text-text mt-0.5 break-words">{value}</p>
    </div>
  );
}

function PedidoModal({
  pedido,
  onClose,
  onReviewed,
}: {
  pedido: PedidoRow;
  onClose: () => void;
  onReviewed: (p: PedidoRow) => void;
}) {
  const [items, setItems] = useState<DetalleRow[]>([]);
  const [products, setProducts] = useState<Map<string, ProductInfo>>(new Map());
  const [loadingItems, setLoadingItems] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [motivo, setMotivo] = useState('');
  const { puede } = usePerfil();
  const estado = normEstado(pedido.estado);
  // Sin permiso de revisar, el pedido pendiente solo se puede ver
  const pending = estado === 'Pendiente' && puede('pedidos_revisar');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  useEffect(() => {
    let cancelled = false;
    async function loadItems() {
      const { data, error: err } = await supabase
        .from('detalle_pedido')
        .select('id, producto_id, cantidad, precio_unitario')
        .eq('pedido_id', pedido.id);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoadingItems(false);
        return;
      }
      const list = (data ?? []) as DetalleRow[];
      setItems(list);

      const ids = list.map((i) => i.producto_id).filter((x): x is string => !!x);
      if (ids.length > 0) {
        const { data: prods, error: prodErr } = await supabase
          .from('productos')
          .select('id, nombre, stock')
          .in('id', ids);
        if (cancelled) return;
        if (prodErr) setError(prodErr.message);
        else setProducts(new Map(((prods ?? []) as ProductInfo[]).map((p) => [p.id, p])));
      }
      setLoadingItems(false);
    }
    loadItems();
    return () => {
      cancelled = true;
    };
  }, [pedido.id]);

  async function review(nuevo: 'Aprobado' | 'Rechazado') {
    if (nuevo === 'Rechazado' && motivo.trim() === '') {
      setError('Escribe el motivo del rechazo.');
      return;
    }
    setError(null);
    setBusy(nuevo === 'Aprobado' ? 'approve' : 'reject');
    try {
      const reviewer = await getReviewer();
      const changes = {
        estado: nuevo,
        revisado_por: reviewer.id,
        revisado_nombre: reviewer.label,
        revisado_en: new Date().toISOString(),
        motivo_rechazo: nuevo === 'Rechazado' ? motivo.trim() : null,
      };
      // Solo actualiza si sigue Pendiente (evita decidir dos veces)
      const { data, error: err } = await supabase
        .from('pedidos')
        .update(changes)
        .eq('id', pedido.id)
        .or('estado.is.null,estado.ilike.pendiente')
        .select('id');
      if (err) throw new Error(err.message);
      if (!data || data.length === 0) {
        throw new Error('El pedido ya no está pendiente o no hay permisos para modificarlo.');
      }
      await registrarActividad({
        accion: nuevo === 'Aprobado' ? 'aprobar' : 'rechazar',
        entidad: 'pedido',
        entidad_id: pedido.id,
        detalle:
          nuevo === 'Aprobado'
            ? `Aprobó el pedido #${pedido.codigo ?? ''} de ${pedido.nombre_cliente || 'cliente'}`
            : `Rechazó el pedido #${pedido.codigo ?? ''} de ${pedido.nombre_cliente || 'cliente'}. Motivo: ${motivo.trim()}`,
      });
      onReviewed({ ...pedido, ...changes });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la decisión.');
      setBusy(null);
    }
  }

  const BTN =
    'card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors disabled:opacity-50';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className={`${CARD} w-full max-w-2xl max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 p-6 border-b border-border">
          <div>
            <h3 className="text-lg font-bold text-text">
              Pedido {pedido.codigo ? `#${pedido.codigo} ` : ''}de {pedido.nombre_cliente || 'cliente'}
            </h3>
            <div className="mt-2">
              <EstadoBadge estado={pedido.estado} />
            </div>
          </div>
          <button type="button" onClick={onClose} title="Cerrar" className={ICON_BTN}>
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <DetailItem label="Fecha" value={formatDate(pedido.fecha)} />
            <DetailItem label="Teléfono" value={pedido.telefono || '—'} />
            <DetailItem label="Método de pago" value={(pedido.metodo_pago && PAGO_LABEL[pedido.metodo_pago]) || '—'} />
            <DetailItem label="Total" value={formatPrice(pedido.total)} />
          </div>

          {!pending && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailItem label="Revisado por" value={pedido.revisado_nombre || '—'} />
              <DetailItem label="Fecha de revisión" value={formatDate(pedido.revisado_en)} />
              {estado === 'Rechazado' && (
                <div className="sm:col-span-2">
                  <DetailItem label="Motivo del rechazo" value={pedido.motivo_rechazo || '—'} />
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-soft mb-2">Productos</p>
            {loadingItems ? (
              <p className="text-sm text-text-muted italic">Cargando productos...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-text-muted italic">Este pedido no tiene productos.</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-surface-alt border-b border-border">
                    <tr>
                      <th className={TH}>Producto</th>
                      <th className={`${TH} text-right`}>Cant.</th>
                      <th className={`${TH} text-right`}>Precio</th>
                      <th className={`${TH} text-right`}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((i) => {
                      const prod = i.producto_id ? products.get(i.producto_id) : undefined;
                      const negative = prod !== undefined && (prod.stock ?? 0) < 0;
                      return (
                        <tr key={i.id} className={negative ? 'bg-danger-soft' : ''}>
                          <td className={TD}>
                            <div className="font-medium text-text">{prod?.nombre ?? 'Producto no disponible'}</div>
                            {prod && (
                              <div className={`text-xs ${negative ? 'text-danger font-semibold' : 'text-text-muted'}`}>
                                Stock actual: {prod.stock ?? 0}
                                {negative && ' · Stock negativo'}
                              </div>
                            )}
                          </td>
                          <td className={`${TD} text-right text-text`}>{i.cantidad}</td>
                          <td className={`${TD} text-right text-text-soft`}>{formatPrice(i.precio_unitario)}</td>
                          <td className={`${TD} text-right font-semibold text-text`}>
                            {formatPrice(i.cantidad * i.precio_unitario)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-3 text-sm">{error}</div>
          )}

          {pending && rejecting && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-text-soft">
                Motivo del rechazo (obligatorio)
              </label>
              <textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej.: pago no recibido, producto sin existencias…"
                className={`${FIELD} w-full mt-1`}
              />
              <p className="text-xs text-text-muted mt-1">Al rechazar, el stock de los productos se devuelve.</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex justify-end gap-3">
          {pending && !rejecting && (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setRejecting(true)}
                className={`${BTN} flex items-center gap-2 !text-danger`}
              >
                <Ban size={16} /> Rechazar
              </button>
              <button
                type="button"
                disabled={busy !== null || loadingItems}
                onClick={() => review('Aprobado')}
                className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Check size={16} /> {busy === 'approve' ? 'Aprobando...' : 'Aprobar pedido'}
              </button>
            </>
          )}
          {pending && rejecting && (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setRejecting(false);
                  setError(null);
                }}
                className={BTN}
              >
                Volver
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => review('Rechazado')}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Ban size={16} /> {busy === 'reject' ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
            </>
          )}
          {!pending && (
            <button type="button" onClick={onClose} className={BTN}>
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
