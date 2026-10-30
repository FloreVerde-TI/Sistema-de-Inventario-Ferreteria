"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { exportReport, type Column, type Format } from '@/lib/exportar';
import { useDefensa, defensaActiva } from '@/lib/defensa';
import { Search, Download, ChevronDown, FileSpreadsheet, FileText, X } from 'lucide-react';

type Fila = {
  id: number;
  usuario: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: string | null;
  created_at: string;
};
type Filtros = { texto: string; entidad: string; accion: string; desde: string; hasta: string };

const VACIOS: Filtros = { texto: '', entidad: 'all', accion: 'all', desde: '', hasta: '' };
const PAGE_SIZE = 25;
const LOTE = 1000; // límite de Supabase por consulta
const COLUMNAS = 'id, usuario, accion, entidad, entidad_id, detalle, created_at';

const ENTIDADES: Record<string, string> = {
  producto: 'Producto',
  categoria: 'Categoría',
  proveedor: 'Proveedor',
  pedido: 'Pedido web',
  cotizacion: 'Cotización web',
  usuario: 'Usuario',
  rol: 'Rol',
  configuracion: 'Configuración',
};

const ACCIONES: Record<string, { label: string; clase: string }> = {
  crear: { label: 'Creó', clase: 'bg-success-soft text-green-800' },
  editar: { label: 'Editó', clase: 'bg-info-soft text-sky-800' },
  habilitar: { label: 'Habilitó', clase: 'bg-success-soft text-green-800' },
  deshabilitar: { label: 'Deshabilitó', clase: 'bg-warning-soft text-amber-800' },
  eliminar: { label: 'Eliminó', clase: 'bg-danger-soft text-red-800' },
  aprobar: { label: 'Aprobó', clase: 'bg-success-soft text-green-800' },
  rechazar: { label: 'Rechazó', clase: 'bg-danger-soft text-red-800' },
  reabrir: { label: 'Reabrió', clase: 'bg-warning-soft text-amber-800' },
  responder: { label: 'Respondió', clase: 'bg-info-soft text-sky-800' },
  cerrar: { label: 'Cerró', clase: 'bg-surface-alt text-text-soft' },
  activar: { label: 'Activó', clase: 'bg-success-soft text-green-800' },
  desactivar: { label: 'Desactivó', clase: 'bg-warning-soft text-amber-800' },
  cambiar_contrasena: { label: 'Cambió contraseña', clase: 'bg-info-soft text-sky-800' },
};

const CARD = 'card-light bg-surface border border-border rounded-xl shadow-sm';
const FIELD =
  'px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-primary-light transition-all';
const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-soft';
const TD = 'px-4 py-3';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const etiquetaAccion = (a: string) => ACCIONES[a]?.label ?? a;
const etiquetaEntidad = (e: string) => ENTIDADES[e] ?? e;

// Consulta con los filtros aplicados (se reutiliza para la tabla y para exportar)
function consulta(f: Filtros, conConteo: boolean) {
  let q = supabase
    .from('actividad')
    .select(COLUMNAS, conConteo ? { count: 'exact' } : undefined)
    .order('created_at', { ascending: false });
  // Modo defensa: sin registros de pedidos ni cotizaciones de la web
  if (defensaActiva()) q = q.not('entidad', 'in', '(pedido,cotizacion)');
  if (f.entidad !== 'all') q = q.eq('entidad', f.entidad);
  if (f.accion !== 'all') q = q.eq('accion', f.accion);
  if (f.desde) q = q.gte('created_at', new Date(`${f.desde}T00:00:00`).toISOString());
  if (f.hasta) q = q.lte('created_at', new Date(`${f.hasta}T23:59:59.999`).toISOString());
  const t = f.texto.trim().replace(/[,()%*]/g, ' ').trim();
  if (t) q = q.or(`usuario.ilike.%${t}%,detalle.ilike.%${t}%`);
  return q;
}

const COLUMNAS_EXPORT: Column<Fila>[] = [
  { key: 'fecha', label: 'Fecha', get: (r) => formatDate(r.created_at) },
  { key: 'usuario', label: 'Usuario', get: (r) => r.usuario ?? '' },
  { key: 'accion', label: 'Acción', get: (r) => etiquetaAccion(r.accion) },
  { key: 'entidad', label: 'Sobre', get: (r) => etiquetaEntidad(r.entidad) },
  { key: 'detalle', label: 'Detalle', get: (r) => r.detalle ?? '', maxChars: 110 },
];

export default function BitacoraPage() {
  const defensa = useDefensa();
  const [rows, setRows] = useState<Fila[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Filtros>(VACIOS);
  const [applied, setApplied] = useState<Filtros>(VACIOS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Al salir de la pantalla, filtros, búsqueda y página vuelven a empezar
  useEffect(() => {
    return () => {
      setDraft(VACIOS);
      setApplied(VACIOS);
      setPage(1);
      setNotice(null);
    };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setLoading(true);
      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error: err } = await consulta(applied, true).range(from, from + PAGE_SIZE - 1);
      if (cancelado) return;
      if (err) setError(err.message);
      else {
        setError(null);
        setRows((data ?? []) as Fila[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [applied, page, defensa]);

  const setCampo = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setDraft((p) => ({ ...p, [k]: v }));

  function aplicar(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (draft.desde && draft.hasta && draft.desde > draft.hasta) {
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }
    setPage(1);
    setApplied(draft);
  }

  function limpiar() {
    setDraft(VACIOS);
    setPage(1);
    setApplied(VACIOS);
    setNotice(null);
  }

  async function exportar(format: Format) {
    setExportOpen(false);
    setNotice(null);
    setExporting(true);
    try {
      // Trae todas las filas filtradas, de 1000 en 1000
      const todas: Fila[] = [];
      for (let from = 0; ; from += LOTE) {
        const { data, error: err } = await consulta(applied, false).range(from, from + LOTE - 1);
        if (err) throw new Error(err.message);
        const lote = (data ?? []) as Fila[];
        todas.push(...lote);
        if (lote.length < LOTE) break;
      }
      if (todas.length === 0) {
        setNotice('No hay registros para exportar con los filtros aplicados.');
        return;
      }
      const resumen = [`Registros: ${todas.length}`];
      if (applied.desde || applied.hasta) resumen.push(`Rango: ${applied.desde || '…'} a ${applied.hasta || '…'}`);
      if (applied.entidad !== 'all') resumen.push(`Sobre: ${etiquetaEntidad(applied.entidad)}`);
      if (applied.accion !== 'all') resumen.push(`Acción: ${etiquetaAccion(applied.accion)}`);
      await exportReport({ title: 'Bitácora de actividad', file: 'bitacora', columns: COLUMNAS_EXPORT, rows: todas, summary: resumen }, format);
      setNotice(`Se exportaron ${todas.length} registros a ${format === 'excel' ? 'Excel' : 'PDF'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar.');
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const primero = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const ultimo = Math.min(page * PAGE_SIZE, total);
  const sinFiltros = useMemo(() => JSON.stringify(applied) === JSON.stringify(VACIOS), [applied]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-text tracking-tight">Bitácora de actividad</h2>
            <p className="text-text-muted text-sm">Quién hizo qué y cuándo: productos, {defensa ? '' : 'pedidos, '}usuarios y configuración</p>
          </div>
          <div className="relative" ref={exportRef}>
            <button
              type="button"
              onClick={() => setExportOpen((o) => !o)}
              disabled={loading || exporting}
              className="card-light px-4 py-2 text-sm font-medium bg-surface border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              <Download size={16} /> {exporting ? 'Exportando...' : 'Exportar'} <ChevronDown size={14} />
            </button>
            {exportOpen && (
              <div className="card-light absolute right-0 mt-2 w-48 z-20 bg-surface border border-border rounded-lg shadow-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => exportar('excel')}
                  className="w-full px-4 py-2.5 text-sm text-left text-text hover:bg-bg flex items-center gap-2"
                >
                  <FileSpreadsheet size={16} /> Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => exportar('pdf')}
                  className="w-full px-4 py-2.5 text-sm text-left text-text hover:bg-bg flex items-center gap-2 border-t border-border"
                >
                  <FileText size={16} /> PDF (.pdf)
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-danger-soft text-danger border border-danger/30 rounded-lg p-4 text-sm flex items-start justify-between gap-3">
            <span>{error}</span>
            <button type="button" title="Cerrar aviso" onClick={() => setError(null)}>
              <X size={16} />
            </button>
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
        <form onSubmit={aplicar} className={`${CARD} p-5 flex flex-wrap gap-3 items-center`}>
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="text"
              placeholder="Buscar por usuario o detalle…"
              className={`${FIELD} w-full pl-10 pr-4`}
              value={draft.texto}
              onChange={(e) => setCampo('texto', e.target.value)}
            />
          </div>
          <select className={FIELD} value={draft.entidad} onChange={(e) => setCampo('entidad', e.target.value)}>
            <option value="all">Todo</option>
            {Object.entries(ENTIDADES)
              .filter(([k]) => !(defensa && (k === 'pedido' || k === 'cotizacion')))
              .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select className={FIELD} value={draft.accion} onChange={(e) => setCampo('accion', e.target.value)}>
            <option value="all">Todas las acciones</option>
            {Object.entries(ACCIONES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <input type="date" aria-label="Desde" className={FIELD} value={draft.desde} onChange={(e) => setCampo('desde', e.target.value)} />
          <input type="date" aria-label="Hasta" className={FIELD} value={draft.hasta} onChange={(e) => setCampo('hasta', e.target.value)} />
          <button
            type="button"
            onClick={limpiar}
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
            <div className="p-20 text-center text-text-muted italic">Cargando bitácora...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface-alt border-b border-border">
                  <tr>
                    <th className={TH}>Fecha</th>
                    <th className={TH}>Usuario</th>
                    <th className={TH}>Acción</th>
                    <th className={TH}>Sobre</th>
                    <th className={TH}>Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.length > 0 ? (
                    rows.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-alt transition-colors">
                        <td className={`${TD} text-text-soft whitespace-nowrap`}>{formatDate(r.created_at)}</td>
                        <td className={`${TD} font-medium text-text whitespace-nowrap`}>{r.usuario || '—'}</td>
                        <td className={TD}>
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                              ACCIONES[r.accion]?.clase ?? 'bg-surface-alt text-text-soft'
                            }`}
                          >
                            {etiquetaAccion(r.accion)}
                          </span>
                        </td>
                        <td className={`${TD} text-text-soft whitespace-nowrap`}>{etiquetaEntidad(r.entidad)}</td>
                        <td className={`${TD} text-text-soft`}>{r.detalle || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center text-text-muted italic">
                        {total === 0 && sinFiltros
                          ? 'Aún no hay actividad registrada.'
                          : 'No se encontraron registros con los filtros aplicados.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between px-6 py-3.5 border-t border-border text-xs text-text-muted">
            <span>
              Mostrando {primero.toLocaleString('es-CR')}–{ultimo.toLocaleString('es-CR')} de {total.toLocaleString('es-CR')} registros
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
    </AdminLayout>
  );
}
