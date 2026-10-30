"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ArrowDownCircle,
  ArrowUpCircle,
  FileText,
  ScanLine,
  ShoppingCart,
  BarChart3,
  Users,
  Settings,
  ScrollText,
  LogOut,
  Search,
  ShieldAlert,
  MapPin,
  Loader2,
  MessageSquareText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/components/ThemeToggle';

// ---------------------------------------------------------------------
// PERMISOS (los mismos nombres que en la tabla "roles" de Supabase)
// ---------------------------------------------------------------------
export type Permiso =
  | 'productos_crear'
  | 'productos_editar'
  | 'productos_deshabilitar'
  | 'productos_eliminar'
  | 'entradas'
  | 'salidas'
  | 'pedidos_revisar'
  | 'pedidos_reabrir'
  | 'cotizaciones'
  | 'reportes'
  | 'usuarios_gestionar'
  | 'roles_gestionar'
  | 'config_editar'
  | 'bitacora_ver';

export type PerfilSesion = {
  id: string;
  nombre: string;
  rol: string;
  nivel: number;
  esSuper: boolean;
  permisos: string[];
  /** "Nombre — Rol", para guardar en movimientos, pedidos, etc. */
  etiqueta: string;
};

function tienePermiso(perfil: PerfilSesion | null, permiso: Permiso): boolean {
  return !!perfil && (perfil.esSuper || perfil.permisos.includes(permiso));
}

const PerfilContext = createContext<PerfilSesion | null>(null);

/** Úsalo en cualquier página dentro de AdminLayout:
 *  const { perfil, puede } = usePerfil();
 *  {puede('productos_eliminar') && <button>Borrar</button>}
 */
export function usePerfil() {
  const perfil = useContext(PerfilContext);
  return { perfil, puede: (p: Permiso) => tienePermiso(perfil, p) };
}

// ---------------------------------------------------------------------
// MENÚ
// ---------------------------------------------------------------------
const SECTIONS = ['Principal', 'Operaciones', 'Administración'];

type NavItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  section: string;
  permiso?: Permiso;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Principal' },
  { id: 'productos', label: 'Productos', icon: Package, section: 'Principal' },
  { id: 'entradas', label: 'Entradas', icon: ArrowDownCircle, section: 'Principal', permiso: 'entradas' },
  { id: 'salidas', label: 'Salidas', icon: ArrowUpCircle, section: 'Principal', permiso: 'salidas' },
  { id: 'movimientos', label: 'Movimientos', icon: FileText, section: 'Principal' },
  { id: 'pedidos', label: 'Pedidos Web', icon: ShoppingCart, section: 'Operaciones' },
  { id: 'cotizaciones', label: 'Cotizaciones', icon: MessageSquareText, section: 'Operaciones', permiso: 'cotizaciones' },
  { id: 'barcode', label: 'Código de Barras', icon: ScanLine, section: 'Operaciones' },
  { id: 'reportes', label: 'Reportes', icon: BarChart3, section: 'Operaciones', permiso: 'reportes' },
  { id: 'usuarios', label: 'Usuarios', icon: Users, section: 'Administración', permiso: 'usuarios_gestionar' },
  { id: 'config', label: 'Configuración', icon: Settings, section: 'Administración', permiso: 'config_editar' },
  { id: 'bitacora', label: 'Bitácora', icon: ScrollText, section: 'Administración', permiso: 'bitacora_ver' },
];

// Subpáginas que piden un permiso propio
function permisoDeSubruta(pathname: string): Permiso | undefined {
  if (pathname === '/productos/nuevo') return 'productos_crear';
  if (pathname === '/productos/precios') return 'productos_editar';
  if (/^\/productos\/[^/]+\/editar$/.test(pathname)) return 'productos_editar';
  return undefined;
}

type FilaPerfil = {
  full_name: string;
  role: string;
  activo: boolean;
  roles: { permisos: string[]; es_super: boolean; nivel: number } | null;
};

/**
 * AdminLayout ahora vive en app/(admin)/layout.tsx y se carga UNA sola vez.
 * Si una página todavía se envuelve en <AdminLayout>, aquí se detecta que ya
 * está dentro y solo muestra el contenido (no duplica el menú).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const yaDentro = useContext(PerfilContext) !== null;
  if (yaDentro) return <>{children}</>;
  return <AdminShell>{children}</AdminShell>;
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [perfil, setPerfil] = useState<PerfilSesion | null>(null);
  // Cantidad de pedidos web pendientes (número rojo en el menú), en tiempo real
  const [pendientes, setPendientes] = useState(0);
  // Cotizaciones nuevas (número celeste en el menú)
  const [cotNuevas, setCotNuevas] = useState(0);

  useEffect(() => {
    if (!perfil) return;
    let activo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;

    async function contar() {
      const { count } = await supabase
        .from('pedidos')
        .select('id', { count: 'exact', head: true })
        .or('estado.is.null,estado.ilike.pendiente');
      if (activo) setPendientes(count ?? 0);
    }
    // Las cotizaciones solo se cuentan si el rol puede verlas
    const veCotizaciones = tienePermiso(perfil, 'cotizaciones');
    async function contarCot() {
      if (!veCotizaciones) return;
      const { count } = await supabase
        .from('cotizaciones')
        .select('id', { count: 'exact', head: true })
        .or('estado.is.null,estado.ilike.nueva');
      if (activo) setCotNuevas(count ?? 0);
    }
    contar();
    contarCot();

    let esperaCot: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel('pedidos-menu')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        clearTimeout(espera);
        espera = setTimeout(contar, 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, () => {
        clearTimeout(esperaCot);
        esperaCot = setTimeout(contarCot, 500);
      })
      .subscribe();

    return () => {
      activo = false;
      clearTimeout(espera);
      clearTimeout(esperaCot);
      supabase.removeChannel(canal);
    };
  }, [perfil]);

  // La pestaña del navegador también avisa: "(2) FerreStock"
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    const avisos = pendientes + cotNuevas;
    document.title = avisos > 0 ? `(${avisos}) ${base}` : base;
  }, [pendientes, cotNuevas, pathname]);

  useEffect(() => {
    let activo = true;

    async function cargarPerfil() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace('/login');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('full_name, role, activo, roles(permisos, es_super, nivel)')
        .eq('id', authUser.id)
        .maybeSingle();

      if (!activo) return;
      const fila = data as unknown as FilaPerfil | null;

      // Sin perfil o desactivado: fuera del sistema
      if (!fila || !fila.activo) {
        await supabase.auth.signOut();
        router.replace('/login');
        return;
      }

      setPerfil({
        id: authUser.id,
        nombre: fila.full_name,
        rol: fila.role,
        nivel: fila.roles?.nivel ?? 0,
        esSuper: fila.roles?.es_super ?? false,
        permisos: fila.roles?.permisos ?? [],
        etiqueta: `${fila.full_name} — ${fila.role}`,
      });
    }

    cargarPerfil();

    // Si la sesión se cierra (en otra pestaña o por vencimiento), volver al login
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login');
    });

    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  // Página actual (también cuenta rutas internas como /productos/nuevo)
  const current = NAV_ITEMS.find(
    (i) => pathname === `/${i.id}` || pathname.startsWith(`/${i.id}/`)
  );

  if (!perfil) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const permisoPagina = permisoDeSubruta(pathname) ?? current?.permiso;
  const sinAcceso = !!permisoPagina && !tienePermiso(perfil, permisoPagina);

  const initials =
    (perfil.nombre.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2) || '?').toUpperCase();

  return (
    <PerfilContext.Provider value={perfil}>
      <div className="flex min-h-screen font-sans text-text">
        {/* Sidebar */}
        <aside className="w-64 app-sidebar border-r border-border flex flex-col sticky top-0 h-screen">
          <div className="p-6 border-b border-border flex items-center gap-3">
            {/* Fondo blanco para que el logo se vea igual en modo oscuro */}
            <div className="w-11 h-11 shrink-0 bg-white rounded-lg flex items-center justify-center overflow-hidden shadow-sm border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-icono.png" alt="Flore Verde" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-none">FerreStock</h1>
              <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider">
                Gestión de Inventario
              </span>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
            {SECTIONS.map((section) => {
              // Solo se muestran las opciones permitidas para el rol
              const items = NAV_ITEMS.filter(
                (item) => item.section === section && (!item.permiso || tienePermiso(perfil, item.permiso))
              );
              if (items.length === 0) return null;
              return (
                <div key={section}>
                  <h3 className="px-3 text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">
                    {section}
                  </h3>
                  <div className="space-y-1">
                    {items.map((item) => {
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
                          <span className="flex-1 text-left">{item.label}</span>
                          {item.id === 'pedidos' && pendientes > 0 && (
                            <span
                              className="min-w-5 h-5 px-1.5 rounded-full bg-danger text-white text-[11px] font-bold flex items-center justify-center animate-pulse"
                              title={`${pendientes} pedido(s) pendiente(s)`}
                            >
                              {pendientes > 99 ? '99+' : pendientes}
                            </span>
                          )}
                          {item.id === 'cotizaciones' && cotNuevas > 0 && (
                            <span
                              className="min-w-5 h-5 px-1.5 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center"
                              title={`${cotNuevas} cotización(es) nueva(s)`}
                            >
                              {cotNuevas > 99 ? '99+' : cotNuevas}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
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
              <BuscadorRapido />

              <ThemeToggle />

              <div className="flex items-center gap-3 pl-6 border-l border-border">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold leading-none">{perfil.nombre}</p>
                  <p className="text-[11px] text-text-muted font-medium">{perfil.rol}</p>
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
          <main className="p-8 overflow-auto">
            {sinAcceso ? (
              <div className="card-light bg-surface border border-border rounded-xl shadow-sm max-w-lg mx-auto mt-16 p-10 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-danger-soft flex items-center justify-center">
                  <ShieldAlert className="text-danger" size={28} />
                </div>
                <h3 className="text-xl font-bold text-text">Sin acceso</h3>
                <p className="text-sm text-text-muted mt-2">
                  Tu rol ({perfil.rol}) no tiene permiso para esta sección. Si lo necesitas, pídeselo a un administrador.
                </p>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="mt-6 px-5 py-2.5 bg-primary hover:opacity-90 text-white text-sm font-semibold rounded-lg shadow-sm transition-all"
                >
                  Ir al Dashboard
                </button>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </PerfilContext.Provider>
  );
}

// ---------------------------------------------------------------------
// BUSCADOR RÁPIDO DE PRODUCTOS (barra superior)
// Muestra stock y ubicación al instante. Enter o clic: abre Productos filtrado.
// Atajo: Ctrl + K
// ---------------------------------------------------------------------
type Resultado = {
  id: string;
  nombre: string;
  sku: string | null;
  codigo_barras: string | null;
  stock: number | null;
  stock_minimo: number | null;
  ubicacion: string | null;
  habilitado: boolean | null;
};

function estadoStock(r: Resultado): { texto: string; clase: string } {
  if (r.habilitado === false) return { texto: 'Deshabilitado', clase: 'bg-black text-white' };
  const s = r.stock ?? 0;
  if (s <= 0) return { texto: 'Agotado', clase: 'bg-danger-soft text-red-800' };
  if (s <= (r.stock_minimo ?? 0)) return { texto: 'Stock bajo', clase: 'bg-warning-soft text-amber-800' };
  return { texto: 'Disponible', clase: 'bg-success-soft text-green-800' };
}

function BuscadorRapido() {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const cajaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl + K para enfocar el buscador desde cualquier pantalla
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    // Clic fuera: se cierra y se limpia
    function onClick(e: MouseEvent) {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) {
        setAbierto(false);
        setTexto('');
        setResultados([]);
      }
    }
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  // Busca 300 ms después de dejar de escribir
  useEffect(() => {
    const t = texto.trim().replace(/[,()%*]/g, ' ').trim();
    if (t.length < 2) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    const timer = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase
        .from('productos')
        .select('id, nombre, sku, codigo_barras, stock, stock_minimo, ubicacion, habilitado')
        .or(`nombre.ilike.%${t}%,sku.ilike.%${t}%,codigo_barras.ilike.%${t}%`)
        .order('nombre')
        .limit(8);
      if (cancelado) return;
      setResultados((data ?? []) as Resultado[]);
      setAbierto(true);
      setBuscando(false);
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [texto]);

  // Al abrir un resultado, el buscador queda limpio
  function abrirEnProductos(valor: string) {
    setAbierto(false);
    setTexto('');
    setResultados([]);
    inputRef.current?.blur();
    router.push(`/productos?buscar=${encodeURIComponent(valor)}`);
  }

  const mostrarLista = abierto && texto.trim().length >= 2;

  return (
    <div className="relative hidden md:block" ref={cajaRef}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
      <input
        ref={inputRef}
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setAbierto(false);
            setTexto('');
            setResultados([]);
            inputRef.current?.blur();
          }
          if (e.key === 'Enter' && texto.trim().length >= 2) {
            abrirEnProductos(resultados.length === 1 ? resultados[0].nombre : texto.trim());
          }
        }}
        placeholder="Búsqueda rápida de productos… (Ctrl+K)"
        title="Busca por nombre, código o código de barras"
        className="pl-10 pr-8 py-1.5 bg-bg border border-transparent rounded-lg text-sm text-text placeholder:text-text-muted focus:bg-surface focus:ring-2 focus:ring-primary-light outline-none transition-all w-80"
      />
      {buscando && (
        <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-muted" />
      )}

      {mostrarLista && (
        <div className="card-light absolute right-0 mt-2 w-[26rem] z-30 bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
          {resultados.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted text-center">
              {buscando ? 'Buscando...' : 'No se encontraron productos.'}
            </p>
          ) : (
            <>
              <ul className="max-h-96 overflow-y-auto divide-y divide-border">
                {resultados.map((r) => {
                  const est = estadoStock(r);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => abrirEnProductos(r.nombre)}
                        className="w-full text-left px-4 py-3 hover:bg-bg transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-text truncate">{r.nombre}</p>
                            <p className="text-xs text-text-muted truncate">
                              {r.sku || 'Sin código'}
                              {r.codigo_barras ? ` · ${r.codigo_barras}` : ''}
                            </p>
                            <p className="text-xs text-text-soft mt-1 flex items-center gap-1">
                              <MapPin size={12} /> {r.ubicacion || 'Sin ubicación'}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-bold text-text leading-none">{r.stock ?? 0}</p>
                            <p className="text-[10px] text-text-muted mb-1">en stock</p>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${est.clase}`}>
                              {est.texto}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => abrirEnProductos(texto.trim())}
                className="w-full px-4 py-2.5 text-xs font-semibold text-primary-ink bg-surface-alt hover:bg-bg border-t border-border text-left"
              >
                Ver todos los resultados en Productos →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
