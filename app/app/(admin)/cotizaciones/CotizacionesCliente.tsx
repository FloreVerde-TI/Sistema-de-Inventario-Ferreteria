"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { registrarActividad, etiquetaUsuario } from '@/lib/actividad';
import SiPuede from '@/components/SiPuede';
import { traerTodo } from '@/lib/paginar';
import { exportReport, type Column, type Format } from '@/lib/exportar';
import { Search, X, MessageSquareText, Mail, Send, Loader2, Phone, CheckCircle2, Archive, RotateCcw, Eye, Info, Download, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';

// =====================================================================
// COTIZACIONES de la página web
// Mismo flujo que Pedidos Web, con acento celeste para distinguirlas.
// Se responden: (a) desde el sistema (sale del correo de la empresa),
// (b) abriendo Gmail, o (c) por WhatsApp; y luego se marcan respondidas.
// =====================================================================

type Estado = 'Nueva' | 'Respondida' | 'Cerrada';
type EstadoFilter = 'all' | Estado;

type CotizacionRow = {
  id: string;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  mensaje: string | null;
  estado: string | null;
  fecha: string | null;
  respuesta: string | null;
  respondido_nombre: string | null;
  respondido_en: string | null;
  reabierto_nombre: string | null;
  reabierto_en: string | null;
};
type Filters = { search: string; desde: string; hasta: string; estado: EstadoFilter };
type Empresa = { nombre: string; telefono: string; correo: string };

const EMPTY_FILTERS: Filters = { search: '', desde: '', hasta: '', estado: 'all' };
const PAGE_SIZE = 20;
const COLUMNS =
  'id, nombre, correo, telefono, mensaje, estado, fecha, respuesta, respondido_nombre, respondido_en, reabierto_nombre, reabierto_en';
const NUEVA_COND = 'or(estado.is.null,estado.ilike.nueva)';

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-sky-400 transition-all';
const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-soft';
const TD = 'px-4 py-3';
const BTN = 'px-3 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2 disabled:opacity-50';

function normEstado(e: string | null): Estado {
  const v = (e ?? '').trim().toLowerCase();
  if (v === 'respondida') return 'Respondida';
  if (v === 'cerrada') return 'Cerrada';
  return 'Nueva';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Teléfono de Costa Rica para WhatsApp: 8 dígitos → 506XXXXXXXX
function numeroWhatsApp(tel: string | null): string | null {
  const d = (tel ?? '').replace(/\D/g, '');
  if (d.length === 8) return `506${d}`;
  if (d.length >= 10) return d;
  return null;
}

// Aplica los filtros de la pantalla a una consulta (se usa en la lista y al exportar)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function conFiltros(query: any, f: Filters) {
  const conds: string[] = [];
  if (f.estado === 'Nueva') conds.push(NUEVA_COND);
  else if (f.estado !== 'all') query = query.ilike('estado', f.estado);
  if (f.desde) query = query.gte('fecha', new Date(`${f.desde}T00:00:00`).toISOString());
  if (f.hasta) query = query.lte('fecha', new Date(`${f.hasta}T23:59:59.999`).toISOString());
  const term = f.search.trim().replace(/[,()%*]/g, ' ').trim();
  if (term) conds.push(`or(nombre.ilike.%${term}%,correo.ilike.%${term}%,telefono.ilike.%${term}%,mensaje.ilike.%${term}%)`);
  if (conds.length > 0) query = query.or(`and(${conds.join(',')})`);
  return query;
}

const EXPORT_COLUMNS: Column<CotizacionRow>[] = [
  { key: 'fecha', label: 'Fecha', get: (c) => formatDate(c.fecha) },
  { key: 'nombre', label: 'Cliente', get: (c) => c.nombre ?? '' },
  { key: 'correo', label: 'Correo', get: (c) => c.correo ?? '' },
  { key: 'telefono', label: 'Teléfono', get: (c) => c.telefono ?? '' },
  { key: 'mensaje', label: 'Mensaje', get: (c) => c.mensaje ?? '', maxChars: 140 },
  { key: 'estado', label: 'Estado', get: (c) => normEstado(c.estado) },
  { key: 'atendida', label: 'Atendida por', get: (c) => c.respondido_nombre ?? '' },
  { key: 'atendida_en', label: 'Fecha atención', get: (c) => (c.respondido_en ? formatDate(c.respondido_en) : '') },
  { key: 'respuesta', label: 'Respuesta', get: (c) => c.respuesta ?? '', maxChars: 140 },
];

export default function CotizacionesCliente() {
  const [rows, setRows] = useState<CotizacionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<CotizacionRow | null>(null);
  const [empresa, setEmpresa] = useState<Empresa>({ nombre: 'Ferretería', telefono: '', correo: '' });
  const [refresco, setRefresco] = useState(0);
  const silencioso = useRef(false);

  // Datos de la empresa para la firma de las respuestas
  useEffect(() => {
    supabase
      .from('settings')
      .select('business_name, nombre_comercial, phone, whatsapp, email')
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setEmpresa({
          nombre: data.nombre_comercial || data.business_name || 'Ferretería',
          telefono: data.whatsapp || data.phone || '',
          correo: data.email || '',
        });
      });
  }, []);

  // Al salir de la pantalla, los filtros vuelven a empezar
  useEffect(() => {
    return () => {
      setDraft(EMPTY_FILTERS);
      setApplied(EMPTY_FILTERS);
      setPage(1);
      setNotice(null);
    };
  }, []);

  // Tiempo real: llegan o cambian cotizaciones → la lista se recarga sola
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel('cotizaciones-pantalla')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, (cambio) => {
        if (cambio.eventType === 'INSERT') setNotice('💬 Llegó una cotización nueva desde la web.');
        clearTimeout(espera);
        espera = setTimeout(() => {
          silencioso.current = true;
          setRefresco((n) => n + 1);
        }, 600);
      })
      .subscribe();
    return () => {
      clearTimeout(espera);
      supabase.removeChannel(canal);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!silencioso.current) setLoading(true);
      silencioso.current = false;
      const query = conFiltros(
        supabase.from('cotizaciones').select(COLUMNS, { count: 'exact' }).order('fecha', { ascending: false }),
        applied
      );

      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error: err } = await query.range(from, from + PAGE_SIZE - 1);
      if (cancelled) return;
      if (err) setError(err.message);
      else {
        setError(null);
        setRows((data ?? []) as CotizacionRow[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [applied, page, refresco]);

  // Exportar a Excel o PDF todas las cotizaciones que cumplen los filtros aplicados
  const [menuExport, setMenuExport] = useState(false);
  const [exportando, setExportando] = useState(false);
  async function exportar(fmt: Format) {
    setMenuExport(false);
    setExportando(true);
    setError(null);
    try {
      const { data, error: err } = await traerTodo<CotizacionRow>((a, b) =>
        conFiltros(supabase.from('cotizaciones').select(COLUMNS).order('fecha', { ascending: false }).order('id'), applied).range(a, b)
      );
      if (err) throw new Error(err.message);
      const filas = data ?? [];
      if (filas.length === 0) {
        setNotice('No hay cotizaciones con esos filtros para exportar.');
        return;
      }
      const cuenta = (e: Estado) => filas.filter((c) => normEstado(c.estado) === e).length;
      const resumen = [
        applied.desde || applied.hasta ? `Rango: ${applied.desde || 'inicio'} a ${applied.hasta || 'hoy'}` : 'Rango: todas las fechas',
        applied.estado !== 'all' ? `Estado: ${applied.estado}` : 'Todos los estados',
        `Cotizaciones: ${filas.length} (${cuenta('Nueva')} nuevas, ${cuenta('Respondida')} respondidas, ${cuenta('Cerrada')} cerradas)`,
      ];
      if (applied.search.trim()) resumen.push(`Búsqueda: "${applied.search.trim()}"`);
      await exportReport({ title: 'Cotizaciones web', file: 'cotizaciones', columns: EXPORT_COLUMNS, rows: filas, summary: resumen }, fmt);
      setNotice(`Se exportaron ${filas.length} cotizaciones a ${fmt === 'excel' ? 'Excel' : 'PDF'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar.');
    } finally {
      setExportando(false);
    }
  }

  const setDraftField = <K extends keyof Filters>(key: K, value: Filters[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  function onCambio(c: CotizacionRow, msg: string) {
    setRows((prev) => prev.map((r) => (r.id === c.id ? c : r)));
    setSelected(null);
    setNotice(msg);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);
  const noFilters = useMemo(() => JSON.stringify(applied) === JSON.stringify(EMPTY_FILTERS), [applied]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
            <MessageSquareText size={20} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-text tracking-tight">Cotizaciones web</h2>
            <p className="text-text-muted text-sm">Consultas que dejan los clientes en el formulario de la página web</p>
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuExport((v) => !v)}
            disabled={exportando}
            className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Exportar <ChevronDown size={14} />
          </button>
          {menuExport && (
            <div className="card-light absolute right-0 mt-2 w-48 bg-surface border border-border rounded-lg shadow-lg z-20 overflow-hidden">
              <button type="button" onClick={() => exportar('excel')} className="w-full px-4 py-2.5 text-sm text-left text-text hover:bg-bg flex items-center gap-2">
                <FileSpreadsheet size={16} /> Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => exportar('pdf')}
                className="w-full px-4 py-2.5 text-sm text-left text-text hover:bg-bg flex items-center gap-2 border-t border-border"
              >
                <FileText size={16} /> PDF (.pdf)
              </button>
              <p className="px-4 py-2 text-[11px] text-text-muted border-t border-border">Usa los filtros aplicados</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm">No se pudieron cargar las cotizaciones: {error}</div>
      )}
      {notice && (
        <div className="bg-sky-50 text-sky-800 border border-sky-200 rounded-lg p-4 text-sm flex items-start justify-between gap-3">
          <span>{notice}</span>
          <button type="button" title="Cerrar aviso" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filtros */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setApplied(draft);
        }}
        className={`${CARD} p-5 flex flex-wrap gap-3 items-center border-t-4 border-t-sky-500`}
      >
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
          <input
            type="text"
            placeholder="Buscar por cliente, correo, teléfono o mensaje…"
            className={`${FIELD} w-full pl-10 pr-4`}
            value={draft.search}
            onChange={(e) => setDraftField('search', e.target.value)}
          />
        </div>
        <input type="date" aria-label="Desde" className={FIELD} value={draft.desde} onChange={(e) => setDraftField('desde', e.target.value)} />
        <input type="date" aria-label="Hasta" className={FIELD} value={draft.hasta} onChange={(e) => setDraftField('hasta', e.target.value)} />
        <select className={FIELD} value={draft.estado} onChange={(e) => setDraftField('estado', e.target.value as EstadoFilter)}>
          <option value="all">Todos los estados</option>
          <option value="Nueva">Nueva</option>
          <option value="Respondida">Respondida</option>
          <option value="Cerrada">Cerrada</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY_FILTERS);
            setPage(1);
            setApplied(EMPTY_FILTERS);
          }}
          className="px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors"
        >
          Limpiar
        </button>
        <button type="submit" className="px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors shadow-sm">
          Aplicar filtros
        </button>
      </form>

      {/* Tabla */}
      <div className={`${CARD} overflow-hidden`}>
        {loading ? (
          <div className="p-20 text-center text-text-muted italic">Cargando cotizaciones...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-alt border-b border-border">
                <tr>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Cliente</th>
                  <th className={TH}>Contacto</th>
                  <th className={TH}>Mensaje</th>
                  <th className={TH}>Estado</th>
                  <th className={TH}>Atendida por</th>
                  <th className={`${TH} text-right`}>Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length > 0 ? (
                  rows.map((c) => {
                    const nueva = normEstado(c.estado) === 'Nueva';
                    return (
                      <tr key={c.id} className={`transition-colors ${nueva ? 'bg-sky-50/60 hover:bg-sky-50' : 'hover:bg-surface-alt'}`}>
                        <td className={`${TD} text-text-soft whitespace-nowrap`}>{formatDate(c.fecha)}</td>
                        <td className={`${TD} font-medium text-text`}>{c.nombre || '—'}</td>
                        <td className={`${TD} text-text-soft`}>
                          <div>{c.correo || '—'}</div>
                          {c.telefono && <div className="text-xs text-text-muted">{c.telefono}</div>}
                        </td>
                        <td className={`${TD} text-text-soft`}>
                          <div title={c.mensaje ?? ''} className="max-w-sm line-clamp-2 [overflow-wrap:anywhere]">
                            {c.mensaje || '—'}
                          </div>
                        </td>
                        <td className={TD}>
                          <EstadoBadge estado={c.estado} />
                        </td>
                        <td className={`${TD} text-text-soft`}>
                          {c.respondido_nombre ? (
                            <>
                              <div>{c.respondido_nombre}</div>
                              <div className="text-xs text-text-muted">{formatDate(c.respondido_en)}</div>
                            </>
                          ) : (
                            '—'
                          )}
                          {c.reabierto_nombre && (
                            <div className="mt-1.5 text-xs text-amber-700">
                              <RotateCcw size={11} className="inline mr-1 -mt-0.5" />
                              Reabierta por {c.reabierto_nombre}
                              <div className="text-text-muted">{formatDate(c.reabierto_en)}</div>
                            </div>
                          )}
                        </td>
                        <td className={TD}>
                          <div className="flex justify-end">
                            {nueva ? (
                              <SiPuede
                                permiso="cotizaciones"
                                sino={
                                  <button type="button" title="Ver" onClick={() => setSelected(c)} className="p-2 rounded-lg text-text-soft hover:bg-bg">
                                    <Eye size={16} />
                                  </button>
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNotice(null);
                                    setSelected(c);
                                  }}
                                  className="px-3 py-1.5 text-xs font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors flex items-center gap-1.5"
                                >
                                  <MessageSquareText size={14} /> Responder
                                </button>
                              </SiPuede>
                            ) : (
                              <button type="button" title="Ver" onClick={() => setSelected(c)} className="p-2 rounded-lg text-text-soft hover:bg-bg">
                                <Eye size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center text-text-muted italic">
                      {total === 0 && noFilters ? 'Aún no hay cotizaciones.' : 'No se encontraron cotizaciones con los filtros aplicados.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-3.5 border-t border-border text-xs text-text-muted">
          <span>
            Mostrando {firstShown}–{lastShown} de {total} cotizaciones
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

      {selected && <CotizacionModal cot={selected} empresa={empresa} onClose={() => setSelected(null)} onCambio={onCambio} />}
    </div>
  );
}

const ESTADO_BADGES: Record<Estado, string> = {
  Nueva: 'bg-sky-100 text-sky-800',
  Respondida: 'bg-success-soft text-green-800',
  Cerrada: 'bg-rose-100 text-rose-900', // rojo vino: resalta sin parecer error
};

function EstadoBadge({ estado }: { estado: string | null }) {
  const key = normEstado(estado);
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${ESTADO_BADGES[key]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {key}
    </span>
  );
}

function CotizacionModal({
  cot,
  empresa,
  onClose,
  onCambio,
}: {
  cot: CotizacionRow;
  empresa: Empresa;
  onClose: () => void;
  onCambio: (c: CotizacionRow, msg: string) => void;
}) {
  const estado = normEstado(cot.estado);
  // Plantilla: saludo, espacio para escribir (el cursor queda ahí) y cierre
  const saludo = `Hola ${cot.nombre?.split(' ')[0] || ''},\n\n`;
  const cierre = `\n\nGracias por escribirnos, quedamos atentos a cualquier consulta.\n\nSaludos cordiales,\n${empresa.nombre}`;
  const texto = useRef<HTMLTextAreaElement>(null);
  const [asunto, setAsunto] = useState(`Respuesta a su cotización — ${empresa.nombre}`);
  const [respuesta, setRespuesta] = useState(cot.respuesta ?? saludo + cierre);
  const [ocupado, setOcupado] = useState<null | 'enviar' | 'marcar' | 'cerrar' | 'reabrir'>(null);
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wa = numeroWhatsApp(cot.telefono);

  // Al abrir, el cursor queda en el espacio en blanco entre el saludo y el cierre
  useEffect(() => {
    const t = texto.current;
    if (!t || cot.respuesta) return;
    t.focus();
    t.setSelectionRange(saludo.length, saludo.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !ocupado) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, ocupado]);

  // Cambia el estado desde el navegador (marcar respondida, cerrar o reabrir)
  async function cambiarEstado(nuevo: 'respondida' | 'cerrada' | 'nueva', accion: 'marcar' | 'cerrar' | 'reabrir') {
    setError(null);
    setOcupado(accion);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const quien = await etiquetaUsuario();
      const cambios =
        nuevo === 'nueva'
          ? {
              estado: 'nueva',
              reabierto_por: auth.user?.id ?? null,
              reabierto_nombre: quien,
              reabierto_en: new Date().toISOString(),
            }
          : {
              estado: nuevo,
              respuesta: nuevo === 'respondida' ? respuesta.trim() || null : cot.respuesta,
              respondido_por: auth.user?.id ?? null,
              respondido_nombre: quien,
              respondido_en: new Date().toISOString(),
            };
      const { data, error: err } = await supabase.from('cotizaciones').update(cambios).eq('id', cot.id).select(COLUMNS);
      if (err) throw new Error(err.message);
      if (!data || data.length === 0) throw new Error('No tienes permiso para modificar cotizaciones.');
      const texto =
        nuevo === 'respondida' ? 'Marcó como respondida' : nuevo === 'cerrada' ? 'Cerró sin responder' : 'Reabrió';
      await registrarActividad({
        accion: nuevo === 'respondida' ? 'responder' : nuevo === 'cerrada' ? 'cerrar' : 'reabrir',
        entidad: 'cotizacion',
        entidad_id: cot.id,
        detalle: `${texto} la cotización de ${cot.nombre || 'cliente'}`,
      });
      onCambio(data[0] as CotizacionRow, `Cotización de ${cot.nombre || 'cliente'}: ${texto.toLowerCase()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setOcupado(null);
    }
  }

  // Envía el correo desde el sistema (sale de la cuenta de la empresa)
  async function enviar() {
    setError(null);
    if (!cot.correo) return setError('Esta cotización no tiene correo.');
    if (respuesta.trim().length < 10 || respuesta.trim() === (saludo + cierre).trim())
      return setError('Escribe tu respuesta en el espacio en blanco entre el saludo y el cierre.');
    if (!confirmarEnvio) {
      setConfirmarEnvio(true);
      return;
    }
    setOcupado('enviar');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
      const res = await fetch('/api/cotizaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id: cot.id, asunto: asunto.trim(), respuesta: respuesta.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; cotizacion?: CotizacionRow };
      if (!res.ok || !json.cotizacion) throw new Error(json.error ?? 'No se pudo enviar el correo.');
      onCambio(json.cotizacion, `Respuesta enviada a ${cot.correo}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el correo.');
      setOcupado(null);
      setConfirmarEnvio(false);
    }
  }

  // Gmail con la cuenta de la EMPRESA: primero pasa por el selector de cuentas de Google
  // (si no está abierta en este navegador, pide iniciar sesión con ella) y luego abre el correo listo.
  const redactar = cot.correo
    ? `https://mail.google.com/mail/?${empresa.correo ? `authuser=${encodeURIComponent(empresa.correo)}&` : ''}view=cm&fs=1&to=${encodeURIComponent(cot.correo)}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(respuesta)}`
    : null;
  const gmail =
    redactar && empresa.correo
      ? `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(empresa.correo)}&continue=${encodeURIComponent(redactar)}`
      : redactar;
  const whatsapp = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(respuesta)}` : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !ocupado && onClose()} role="dialog" aria-modal="true">
      <div className={`${CARD} w-full max-w-2xl max-h-[92vh] overflow-y-auto border-t-4 border-t-sky-500`} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-text flex items-center gap-2">
              <MessageSquareText size={18} className="text-sky-600" /> Cotización de {cot.nombre || 'cliente'}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              {formatDate(cot.fecha)} · <EstadoBadge estado={cot.estado} />
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={!!ocupado} className="p-1.5 rounded-lg text-text-soft hover:bg-bg">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-text-soft">
              <Mail size={15} /> {cot.correo || 'Sin correo'}
            </div>
            <div className="flex items-center gap-2 text-text-soft">
              <Phone size={15} /> {cot.telefono || 'Sin teléfono'}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-soft mb-1">Mensaje del cliente</p>
            <div className="bg-sky-50 border border-sky-100 rounded-lg p-4 text-sm text-text whitespace-pre-wrap [overflow-wrap:anywhere]">
              {cot.mensaje || '—'}
            </div>
          </div>

          {estado === 'Nueva' && cot.reabierto_nombre && (
            <p className="text-xs text-amber-700 flex items-center gap-1">
              <RotateCcw size={12} /> Reabierta por {cot.reabierto_nombre} · {formatDate(cot.reabierto_en)}
            </p>
          )}

          {estado === 'Nueva' ? (
            <SiPuede permiso="cotizaciones" sino={<p className="text-sm text-text-muted">No tienes permiso para responder cotizaciones.</p>}>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-text-soft mb-1">Asunto</label>
                  <input className={`${FIELD} w-full`} value={asunto} maxLength={150} onChange={(e) => setAsunto(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-text-soft mb-1">Respuesta</label>
                  <textarea
                    ref={texto}
                    rows={9}
                    maxLength={5000}
                    className={`${FIELD} w-full resize-y`}
                    value={respuesta}
                    onChange={(e) => {
                      setRespuesta(e.target.value);
                      setConfirmarEnvio(false);
                    }}
                  />
                </div>

                {error && <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-3 text-sm">{error}</div>}
                {confirmarEnvio && (
                  <p className="text-sm text-sky-800 font-medium">
                    Se enviará este correo a <strong>{cot.correo}</strong> desde la cuenta de la empresa. Presiona otra vez para confirmar.
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <div className="flex flex-wrap gap-2">
                    {gmail && (
                      <a href={gmail} target="_blank" rel="noopener noreferrer" className={BTN} title="Abre Gmail con la respuesta lista">
                        <Mail size={15} /> Abrir en Gmail
                      </a>
                    )}
                    {whatsapp && (
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={BTN} title="Abre WhatsApp con la respuesta lista">
                        <Phone size={15} /> WhatsApp
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={BTN} disabled={!!ocupado} onClick={() => cambiarEstado('cerrada', 'cerrar')} title="Spam, repetida o atendida por otro medio">
                      {ocupado === 'cerrar' ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />} Cerrar
                    </button>
                    <button type="button" className={BTN} disabled={!!ocupado} onClick={() => cambiarEstado('respondida', 'marcar')} title="Ya la respondí por Gmail o WhatsApp">
                      {ocupado === 'marcar' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Marcar respondida
                    </button>
                    {cot.correo && (
                      <button
                        type="button"
                        disabled={!!ocupado}
                        onClick={enviar}
                        className="px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        {ocupado === 'enviar' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        {confirmarEnvio ? 'Sí, enviar' : 'Enviar desde el sistema'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-text-muted flex gap-1.5">
                  <Info size={13} className="shrink-0 mt-px" />
                  <span>
                    &quot;Abrir en Gmail&quot; usa la cuenta <strong>{empresa.correo || '(sin correo en Configuración)'}</strong>; si no está abierta en
                    este navegador, Google te pedirá entrar con ella. Revisa el remitente antes de enviar. &quot;Gmail&quot; y &quot;WhatsApp&quot; solo
                    preparan el mensaje: después presiona &quot;Marcar respondida&quot;. &quot;Enviar desde el sistema&quot; siempre sale del correo de la
                    empresa.
                  </span>
                </div>
              </div>
            </SiPuede>
          ) : (
            <div className="space-y-3">
              {cot.respuesta && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-soft mb-1">Respuesta</p>
                  <div className="bg-bg border border-border rounded-lg p-4 text-sm text-text whitespace-pre-wrap [overflow-wrap:anywhere]">{cot.respuesta}</div>
                </div>
              )}
              <p className="text-xs text-text-muted">
                {estado === 'Respondida' ? 'Respondida' : 'Cerrada'} por {cot.respondido_nombre || '—'} · {formatDate(cot.respondido_en)}
              </p>
              {cot.reabierto_nombre && (
                <p className="text-xs text-amber-700">
                  Antes fue reabierta por {cot.reabierto_nombre} · {formatDate(cot.reabierto_en)}
                </p>
              )}
              {error && <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-3 text-sm">{error}</div>}
              <SiPuede permiso="cotizaciones">
                <div className="flex justify-end">
                  <button type="button" className={BTN} disabled={!!ocupado} onClick={() => cambiarEstado('nueva', 'reabrir')}>
                    {ocupado === 'reabrir' ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Reabrir
                  </button>
                </div>
              </SiPuede>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
