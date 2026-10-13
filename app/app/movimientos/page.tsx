"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Movement, Profile } from '@/types';
import { Search, Download, Filter } from 'lucide-react';

export default function MovimientosPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function fetchMovements() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('movements')
          .select('*, productos(nombre), profiles(full_name)')
          .order('created_at', { ascending: false });
        setMovements(data || []);
      } catch (error) {
        console.error('Error fetching movements:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchMovements();
  }, []);

  const filtered = movements.filter(m =>
    m.observations?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m as any).productos?.nombre?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Historial de Movimientos</h2>
            <p className="text-slate-500 text-sm">Auditoría completa de entradas y salidas</p>
          </div>
          <button className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2">
            <Download size={16} /> Exportar historial
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar producto, usuario u observación..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">Aplicar filtros</button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-20 text-center text-slate-400 italic">Cargando movimientos...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                  <tr>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Producto</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4 text-right">Cantidad</th>
                    <th className="px-6 py-4">Observaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filtered.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-slate-600">{// Formateo simple de fecha
                        // m.created_at.split('T')[0]
                      }</td>
                      <td className="px-6 py-4 font-medium">{(m as any).profiles?.full_name || 'Sistema'}</td>
                      <td className="px-6 py-4 text-slate-700">{(m as any).productos?.nombre || 'N/A'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          m.type === 'Entrada' ? 'bg-green-50 text-green-700 border-green-200' :
                          m.type === 'Salida' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {m.type}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-right font-semibold ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{m.observations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
