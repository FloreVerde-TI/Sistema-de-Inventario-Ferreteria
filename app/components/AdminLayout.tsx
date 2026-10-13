"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ArrowDownCircle,
  ArrowUpCircle,
  FileText,
  ScanLine,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/components/ThemeToggle';

const SECTIONS = ['Principal', 'Operaciones', 'Administración'];

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Principal' },
  { id: 'productos', label: 'Productos', icon: Package, section: 'Principal' },
  { id: 'entradas', label: 'Entradas', icon: ArrowDownCircle, section: 'Principal' },
  { id: 'salidas', label: 'Salidas', icon: ArrowUpCircle, section: 'Principal' },
  { id: 'movimientos', label: 'Movimientos', icon: FileText, section: 'Principal' },
  { id: 'barcode', label: 'Código de Barras', icon: ScanLine, section: 'Operaciones' },
  { id: 'reportes', label: 'Reportes', icon: BarChart3, section: 'Operaciones' },
  { id: 'usuarios', label: 'Usuarios', icon: Users, section: 'Administración' },
  { id: 'config', label: 'Configuración', icon: Settings, section: 'Administración' },
];

type SessionUser = { name: string; role?: string };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace('/login');
        return;
      }

      // Si no existe perfil, se muestra el correo de la sesión
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', authUser.id)
        .maybeSingle();

      setUser({
        name: profile?.full_name ?? authUser.email ?? 'Usuario',
        role: profile?.role,
      });
    }
    loadUser();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  // Página actual (también cuenta rutas internas como /productos/nuevo)
  const current = NAV_ITEMS.find(
    (i) => pathname === `/${i.id}` || pathname.startsWith(`/${i.id}/`)
  );

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const initials =
    (user.name.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2) || '?').toUpperCase();

  return (
    <div className="flex min-h-screen bg-bg font-sans text-text">
      {/* Sidebar */}
      <aside className="w-64 bg-surface border-r border-border flex flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary-light rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm">
            F
          </div>
          <div>
            <h1 className="text-sm font-bold leading-none">FerreStock</h1>
            <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider">
              Gestión de Inventario
            </span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          {SECTIONS.map((section) => (
            <div key={section}>
              <h3 className="px-3 text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">
                {section}
              </h3>
              <div className="space-y-1">
                {NAV_ITEMS.filter((item) => item.section === section).map((item) => {
                  const isActive = current?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => router.push(`/${item.id}`)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-primary-soft text-primary-ink shadow-sm'
                          : 'text-text-soft hover:bg-bg hover:text-text'
                      }`}
                    >
                      <item.icon size={18} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-border text-center">
          <span className="text-[11px] text-text-muted">v 2.4.1 · © 2026 FerreStock</span>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-surface border-b border-border px-8 flex items-center justify-between sticky top-0 z-10">
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-text">{current?.label ?? 'Panel'}</h2>
            <span className="text-xs text-text-muted">Inicio / {current?.label ?? 'General'}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <input
                type="text"
                placeholder="Buscar producto, código o usuario..."
                className="pl-10 pr-4 py-1.5 bg-bg border border-transparent rounded-lg text-sm text-text placeholder:text-text-muted focus:bg-surface focus:ring-2 focus:ring-primary-light outline-none transition-all w-64"
              />
            </div>

            <ThemeToggle />

            <div className="flex items-center gap-3 pl-6 border-l border-border">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold leading-none">{user.name}</p>
                {user.role && (
                  <p className="text-[11px] text-text-muted font-medium">{user.role}</p>
                )}
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-primary-light text-white flex items-center justify-center text-xs font-bold shadow-sm">
                {initials}
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-text-muted hover:text-danger transition-colors"
                title="Cerrar Sesión"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
