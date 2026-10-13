"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Product, Category } from '@/types';
import { Plus, Save, X, Loader2 } from 'lucide-react';

export default function NuevoProductoPage() {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    categoria_id: '',
    precio: '',
    sku: '',
    barcode: '',
    stock: '',
    stock_min: '',
    ubicacion: '',
    unit: 'Unidad'
  });

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase.from('categorias').select('*');
      setCategories(data || []);
    }
    loadCategories();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from('productos').insert([{
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        categoria_id: formData.categoria_id,
        precio: parseFloat(formData.precio),
        sku: formData.sku,
        barcode: formData.barcode,
        stock: parseInt(formData.stock),
        stock_min: parseInt(formData.stock_min),
        ubicacion: formData.ubicacion,
        activo: true
      }]);

      if (error) throw error;
      alert('Producto registrado exitosamente');
      window.location.href = '/productos';
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
            <h2 className="text-2xl font-bold text-slate-900">Nuevo Producto</h2>
            <p className="text-slate-500 text-sm">Registra un nuevo artículo en el catálogo</p>
          </div>
          <button
            onClick={() => window.location.href = '/productos'}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <X size={16} /> Cancelar
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Nombre del Producto *</label>
              <input
                required
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.nombre}
                onChange={e => setFormData({...formData, nombre: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Categoría *</label>
              <select
                required
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.categoria_id}
                onChange={e => setFormData({...formData, categoria_id: e.target.value})}
              >
                <option value="">Seleccione categoría...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Descripción</label>
              <textarea
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all h-24"
                value={formData.descripcion}
                onChange={e => setFormData({...formData, descripcion: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">SKU (Código Interno) *</label>
              <input
                required
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.sku}
                onChange={e => setFormData({...formData, sku: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Código de Barras</label>
              <input
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.barcode}
                onChange={e => setFormData({...formData, barcode: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Precio Venta *</label>
              <input
                required
                type="number"
                step="0.01"
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.precio}
                onChange={e => setFormData({...formData, precio: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Unidad de Medida *</label>
              <select
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.unit}
                onChange={e => setFormData({...formData, unit: e.target.value})}
              >
                <option value="Unidad">Unidad</option>
                <option value="Caja">Caja</option>
                <option value="Bolsa">Bolsa</option>
                <option value="Litro">Litro</option>
                <option value="Kilogramo">Kilogramo</option>
                <option value="Metro">Metro</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Stock Inicial *</label>
              <input
                required
                type="number"
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.stock}
                onChange={e => setFormData({...formData, stock: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Stock Mínimo (Alerta) *</label>
              <input
                required
                type="number"
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={formData.stock_min}
                onChange={e => setFormData({...formData, stock_min: e.target.value})}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Ubicación (Pasillo / Estante)</label>
              <input
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Ej: Pasillo A, Estante 3"
                value={formData.ubicacion}
                onChange={e => setFormData({...formData, ubicacion: e.target.value})}
              />
            </div>
            <div className="md:col-span-2 pt-6 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center gap-2 disabled:bg-blue-400"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                {loading ? 'Guardando...' : 'Guardar Producto'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
