"use client";

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';
import { UserPlus, Edit, Trash2, Loader2 } from 'lucide-react';

export default function UsuariosPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsers() {
      setLoading(true);
      try {
        const { data } = await supabase.from('profiles').select('*').order('full_name');
        setUsers(data || []);
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Gestión de Usuarios</h2>
            <p className="text-slate-500 text-sm">Administra los accesos al sistema y los roles del personal</p>
          </div>
          <button className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
            <UserPlus size={16} /> Crear usuario
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-20 text-center text-slate-400 italic">Cargando usuarios...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                  <tr>
                    <th className="px-6 py-4">Nombre</th>
                    <th className="px-6 py-4">Usuario / Email</th>
                    <th className="px-6 py-4">Rol</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.length > 0 ? (
                    users.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                              {u.full_name.charAt(0)}
                            </div>
                            <span className="font-medium text-slate-900">{u.full_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{u.email}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            u.role === 'Administrador' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span> Activo
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <button className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"><Edit size={16} /></button>
                            <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center text-slate-400 italic">No se encontraron usuarios.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
