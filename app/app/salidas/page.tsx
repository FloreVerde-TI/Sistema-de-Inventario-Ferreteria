"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Product } from '@/types';
import { ArrowDownCircle, ArrowUpCircle, Save, Loader2, X } from 'lucide-react';

export default function MovimientosPage() {
  const [activeTab, setActiveTab] = useState<'entrada' | 'salida'>('entrada');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState({
    product_id: '',
    quantity: '',
    reference: '',
    observations: ''
  });

  useEffect(() => {
    async function loadData() {
      const { data } = await supabase.from('productos').select('*');
      setProducts(data || []);
    }
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const type = activeTab === 'entrada' ? 'Entrada' : 'Salida';
      const qty = activeTab === 'entrada' ? parseInt(formData.quantity) : -parseInt(formData.quantity);
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('movements').insert([{
        product_id: formData.product_id,
        type: type,
        quantity: qty,
        reference: formData.reference,
        observations: formData.observations,
        user_id: user?.id
      }]);

      if (error) throw error;
      alert(`${type} registrada exitosamente`);
      setFormData({ product_id: '', quantity: '', reference: '', observations: '' });
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Movimientos de Stock</h2>
            <p className="text-slate-500 text-sm">Registra el ingreso y egreso de mercadería</p>
          </div>
        </div>

        <div className="flex gap-2 p-1 bg-slate-200 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('entrada')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === 'entrada' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowDownCircle size={18} /> Entrada
          </button>
          <button
            onClick={() => setActiveTab('salida')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === 'salida' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowUpCircle size={18} /> Salida
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 max-w-3xl">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Producto *</label>
              <select
                required
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.product_id}
                onChange={e => setFormData({...formData, product_id: e.target.value})}
              >
                <option value="">Seleccione un producto...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.sku} - {p.nombre} (Stock: {p.stock})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Cantidad *</label>
              <input
                required
                type="number"
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.quantity}
                onChange={e => setFormData({...formData, quantity: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Referencia (Factura/Boleta)</label>
              <input
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.reference}
                onChange={e => setFormData({...formData, reference: e.target.value})}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Observaciones</label>
              <textarea
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-//none transition-all h-24"
                value={formData.observations}
                onChange={e => setFormData({...formData, observations: e.target.value})}
              />
            </div>
            <div className="md:col-span-2 pt-6 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className={`px-6 py-3 text-white font-bold rounded-lg transition-all shadow-md flex items-center gap-2 ${
                  activeTab === 'entrada' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                } disabled:opacity-50`}
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                Registrar {activeTab === 'entrada' ? 'Entrada' : 'Salida'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
