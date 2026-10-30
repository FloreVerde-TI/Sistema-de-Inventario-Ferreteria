"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquareText, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePerfil } from '@/components/AdminLayout';

type Cot = { id: string; nombre: string | null; mensaje: string | null; fecha: string | null };

const NUEVAS = 'estado.is.null,estado.ilike.nueva';

function hace(iso: string | null): string {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
}

/** Tarjeta del Dashboard: cotizaciones nuevas sin responder (en tiempo real). */
export default function TarjetaCotizaciones() {
  const { puede } = usePerfil();
  const permitido = puede('cotizaciones');
  const [total, setTotal] = useState(0);
  const [ultimas, setUltimas] = useState<Cot[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!permitido) return;
    let activo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;

    async function cargar() {
      const { data, count } = await supabase
        .from('cotizaciones')
        .select('id, nombre, mensaje, fecha', { count: 'exact' })
        .or(NUEVAS)
        .order('fecha', { ascending: false })
        .limit(3);
      if (!activo) return;
      setUltimas((data ?? []) as Cot[]);
      setTotal(count ?? 0);
      setCargando(false);
    }
    cargar();

    const canal = supabase
      .channel(`cotizaciones-dashboard-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, () => {
        clearTimeout(espera);
        espera = setTimeout(cargar, 600);
      })
      .subscribe();
    return () => {
      activo = false;
      clearTimeout(espera);
      supabase.removeChannel(canal);
    };
  }, [permitido]);

  if (!permitido) return null;

  return (
    <div className="card-light bg-surface border border-border rounded-xl shadow-sm p-6 border-t-4 border-t-sky-500">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
            <MessageSquareText size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-text">Cotizaciones por responder</h3>
            <p className="text-xs text-text-muted">Consultas nuevas desde la página web</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-text leading-none">{cargando ? '—' : total}</p>
          <p className="text-[11px] text-text-muted mt-1">nuevas</p>
        </div>
      </div>

      {cargando ? (
        <p className="text-sm text-text-muted italic">Cargando…</p>
      ) : ultimas.length === 0 ? (
        <p className="text-sm text-text-muted">¡Al día! No hay cotizaciones pendientes. 🎉</p>
      ) : (
        <ul className="divide-y divide-border">
          {ultimas.map((c) => (
            <li key={c.id} className="py-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text truncate">{c.nombre || 'Cliente'}</p>
                <p className="text-xs text-text-muted truncate">{c.mensaje || '—'}</p>
              </div>
              <span className="text-[11px] text-text-muted whitespace-nowrap">{hace(c.fecha)}</span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/cotizaciones"
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
      >
        Ver cotizaciones <ArrowRight size={13} />
      </Link>
    </div>
  );
}
