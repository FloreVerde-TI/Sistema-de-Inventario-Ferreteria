"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Settings, Save, Loader2 } from 'lucide-react';
import { Setting as SettingType } from '@/types';

export default function ConfigPage() {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<SettingType>({
    id: 1,
    business_name: '',
    ruc: '',
    phone: '',
    email: '',
    address: '',
    updated_at: ''
  });

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase.from('settings').select('*').single();
      if (data) setSettings(data);
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ ...settings, updated_at: new Date().toISOString() });
      if (error) throw error;
      alert('Configuración guardada exitosamente');
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
            <h2 className="text-2xl font-bold text-slate-900">Configuración</h2>
            <p className="text-slate-500 text-sm">Ajustes generales del sistema y datos de la empresa</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 max-w-4xl">
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
              <Settings size={20} />
            </div>
            <h3 className="font-semibold text-slate-800">Datos de la ferretería</h3>
          </div>

          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Razón Social</label>
              <input
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={settings.business_name}
                onChange={e => setSettings({...settings, business_name: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">RUC</label>
              <input
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={settings.ruc}
                onChange={e => setSettings({...settings, ruc: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Teléfono</label>
              <input
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={settings.phone}
                onChange={e => setSettings({...settings, phone: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Correo Electrónico</label>
              <input
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={settings.email}
                onChange={e => setSettings({...settings, email: e.target.value})}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Dirección Física</label>
              <input
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={settings.address}
                onChange={e => setSettings({...settings, address: e.target.value})}
              />
            </div>
            <div className="md:col-span-2 pt-6 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all shadow-md flex items-center gap-2 disabled:bg-blue-400"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
