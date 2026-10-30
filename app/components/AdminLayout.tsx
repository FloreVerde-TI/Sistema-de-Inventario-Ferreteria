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
  ArrowLeftRight,
  MessageSquareText,
  Menu,
  X as Cerrar,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/components/ThemeToggle';
import { BotonPausaAnimacion, BotonTema, DecoracionTema, ProbarTemas } from '@/components/Tematica';
import { useDefensa, useDefensaManual, alternarDefensa, marcarTiendaSinWeb } from '@/lib/defensa';

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

/** Una ferretería del sistema (tabla "tiendas"). */
export type Tienda = {
  id: string;
  slug: string;
  nombre: string;
  nombre_app: string;
  logo: string;
  color: string;
  es_principal: boolean;
  tiene_web: boolean;
};

export type PerfilSesion = {
  id: string;
  nombre: string;
  rol: string;
  nivel: number;
  esSuper: boolean;
  permisos: string[];
  /** "Nombre — Rol", para guardar en movimientos, pedidos, etc. */
  etiqueta: string;
  /** Ferretería en la que está trabajando ahora */
  tienda: Tienda;
  /** Ferreterías a las que tiene acceso (si son 2, ve el botón para cambiar) */
  tiendas: Tienda[];
  /** Todas las ferreterías (solo las ve quien gestiona usuarios, para asignarlas) */
  todasTiendas: Tienda[];
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

  // Modo defensa (universidad): oculta todo lo de la página web
  const defensa = useDefensa();
  const defensaManual = useDefensaManual();
  const [avisoDefensa, setAvisoDefensa] = useState<string | null>(null);
  const clicsVersion = useRef<number[]>([]);
  // Menú lateral en celular (en compu siempre está visible)
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Se cierra con Escape o si la pantalla vuelve a ser de compu
  useEffect(() => {
    if (!menuAbierto) return;
    const pc = window.matchMedia('(min-width: 768px)');
    const cerrar = () => setMenuAbierto(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    const onCambio = (e: MediaQueryListEvent) => e.matches && cerrar();
    window.addEventListener('keydown', onKey);
    pc.addEventListener('change', onCambio);
    return () => {
      window.removeEventListener('keydown', onKey);
      pc.removeEventListener('change', onCambio);
    };
  }, [menuAbierto]);

  function cambiarDefensa() {
    const activo = alternarDefensa();
    setAvisoDefensa(activo ? 'Modo presentación activado' : 'Modo presentación desactivado');
    // La página se recarga sola para que todas las listas se vuelvan a leer (no hace falta F5)
    setTimeout(() => window.location.reload(), 900);
  }

  // Atajo discreto: Ctrl + Alt + D (solo Super Administrador)
  useEffect(() => {
    if (!perfil?.esSuper) return;
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        cambiarDefensa();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [perfil?.esSuper]);

  // Si está activo, las pantallas de la web no se pueden abrir ni por dirección
  useEffect(() => {
    if (defensa && (pathname.startsWith('/pedidos') || pathname.startsWith('/cotizaciones'))) {
      router.replace('/dashboard');
    }
  }, [defensa, pathname, router]);

  // La pestaña del navegador también avisa: "(2) FerreStock"
  useEffect(() => {
    const base = perfil ? `${perfil.tienda.nombre_app} — Inventario` : document.title.replace(/^\(\d+\)\s*/, '');
    const avisos = defensa ? 0 : pendientes + cotNuevas;
    document.title = avisos > 0 ? `(${avisos}) ${base}` : base;
  }, [pendientes, cotNuevas, pathname, defensa, perfil]);

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

      // Ferretería actual y a cuáles tiene acceso
      const [{ data: actualId }, { data: todas }, { data: mias }] = await Promise.all([
        supabase.rpc('mi_tienda'),
        supabase.from('tiendas').select('id, slug, nombre, nombre_app, logo, color, es_principal, tiene_web').order('es_principal', { ascending: false }).order('nombre'),
        supabase.from('usuario_tiendas').select('tienda_id').eq('user_id', authUser.id),
      ]);
      if (!activo) return;
      const todasTiendas = (todas ?? []) as Tienda[];
      const idsMias = new Set(((mias ?? []) as { tienda_id: string }[]).map((m) => m.tienda_id));
      const tiendas = todasTiendas.filter((t) => idsMias.has(t.id));
      const tienda =
        todasTiendas.find((t) => t.id === actualId) ??
        tiendas[0] ??
        todasTiendas[0] ?? {
          id: '',
          slug: 'floreverde',
          nombre: 'Flore Verde',
          nombre_app: 'FerreStock',
          logo: '/logo-icono.png',
          color: '#1f7a3a',
          es_principal: true,
          tiene_web: true,
        };

      // Colores de la tienda y, si no tiene web, se ocultan las pantallas de la web
      document.documentElement.dataset.tienda = tienda.slug;
      // Ícono de la pestaña del navegador: el logo de la ferretería actual
      if (tienda.slug !== 'floreverde') {
        const iconos = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
        if (iconos.length === 0) {
          const nuevo = document.createElement('link');
          nuevo.rel = 'icon';
          document.head.appendChild(nuevo);
        }
        document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach((l) => {
          l.type = 'image/png';
          l.href = tienda.logo;
        });
      }
      marcarTiendaSinWeb(!tienda.tiene_web);

      setPerfil({
        id: authUser.id,
        nombre: fila.full_name,
        rol: fila.role,
        nivel: fila.roles?.nivel ?? 0,
        esSuper: fila.roles?.es_super ?? false,
        permisos: fila.roles?.permisos ?? [],
        etiqueta: `${fila.full_name} — ${fila.role}`,
        tienda,
        tiendas: tiendas.length > 0 ? tiendas : [tienda],
        todasTiendas,
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
      {/* Temática de temporada (colores y adornos) */}
      <DecoracionTema tienda={perfil.tienda.slug} />
      {/* TEMPORAL: selector para probar las temáticas (solo Super Administrador) */}
      {perfil.esSuper && !defensaManual && <ProbarTemas />}
      {avisoDefensa && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-black/80 text-white text-xs shadow-lg">
          {avisoDefensa}
        </div>
      )}
      <div className="flex min-h-screen font-sans text-text">
        {/* Fondo oscuro detrás del menú (solo celular) */}
        {menuAbierto && (
          <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMenuAbierto(false)} aria-hidden="true" />
        )}

        {/* Sidebar: en celular se abre con el botón ☰ */}
        <aside
          className={`w-64 shrink-0 app-sidebar bg-surface border-r border-border flex-col h-screen md:flex md:sticky md:top-0 md:z-auto md:shadow-none ${
            menuAbierto ? 'flex fixed inset-y-0 left-0 z-50 shadow-2xl' : 'hidden'
          }`}
        >
          <div className="p-6 border-b border-border flex items-center gap-3">
            {/* Fondo blanco para que el logo se vea igual en modo oscuro */}
            <div className="w-11 h-11 shrink-0 bg-white rounded-lg flex items-center justify-center overflow-hidden shadow-sm border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={perfil.tienda.logo} alt={perfil.tienda.nombre} className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold leading-none">{perfil.tienda.nombre_app}</h1>
              <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider">
                Gestión de Inventario
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMenuAbierto(false)}
              className="md:hidden p-2 -mr-2 text-text-muted hover:text-text"
              aria-label="Cerrar menú"
            >
              <Cerrar size={20} />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
            {SECTIONS.map((section) => {
              // Solo se muestran las opciones permitidas para el rol
              const items = NAV_ITEMS.filter(
                (item) =>
                  item.section === section &&
                  (!item.permiso || tienePermiso(perfil, item.permiso)) &&
                  !(defensa && (item.id === 'pedidos' || item.id === 'cotizaciones'))
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
                          onClick={() => {
                            setMenuAbierto(false);
                            router.push(`/${item.id}`);
                          }}
                          aria-current={isActive ? 'page' : undefined}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
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
            {/* 5 clics rápidos aquí = modo defensa (solo Super Administrador); no parece un botón */}
            <span
              className="text-[11px] text-text-muted select-none"
              onClick={() => {
                if (!perfil.esSuper) return;
                const ahora = Date.now();
                clicsVersion.current = [...clicsVersion.current.filter((t) => ahora - t < 2000), ahora];
                if (clicsVersion.current.length >= 5) {
                  clicsVersion.current = [];
                  cambiarDefensa();
                }
              }}
            >
              v 2.4.1 · © 2026 {perfil.tienda.nombre_app}
            </span>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <header className="h-16 bg-surface border-b border-border px-3 sm:px-5 lg:px-8 flex items-center justify-between gap-2 sticky top-0 z-30">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setMenuAbierto(true)}
                className="md:hidden p-2 -ml-1 rounded-lg text-text-soft hover:bg-bg"
                aria-label="Abrir menú"
              >
                <Menu size={22} />
              </button>
              <div className="flex flex-col min-w-0">
                <h2 className="text-base lg:text-lg font-semibold text-text truncate">{current?.label ?? 'Panel'}</h2>
                <span className="hidden sm:block text-xs text-text-muted truncate">Inicio / {current?.label ?? 'General'}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 lg:gap-4 shrink-0">
              {perfil.tiendas.length > 1 && <CambiarTienda perfil={perfil} />}
              <BuscadorRapido />

              <div className="flex items-center">
                <span className="hidden sm:contents">
                  <BotonPausaAnimacion />
                </span>
                <BotonTema />
                <ThemeToggle />
              </div>

              <div className="flex items-center gap-2 lg:gap-3 pl-2 lg:pl-6 border-l border-border">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold leading-none">{perfil.nombre}</p>
                  <p className="text-[11px] text-text-muted font-medium">{perfil.rol}</p>
                </div>
                <div className="hidden sm:flex w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-primary-light text-white items-center justify-center text-xs font-bold shadow-sm">
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
          <main className="p-3 sm:p-5 lg:p-8 overflow-x-hidden">
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
    <div className="relative hidden lg:block" ref={cajaRef}>
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


/** Botón para cambiar de ferretería (solo si el usuario tiene acceso a más de una). */
function CambiarTienda({ perfil }: { perfil: PerfilSesion }) {
  const [abierto, setAbierto] = useState(false);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  async function cambiar(t: Tienda) {
    if (t.id === perfil.tienda.id) return setAbierto(false);
    setError(null);
    setCambiando(t.id);
    const { error: err } = await supabase.rpc('cambiar_tienda', { p_tienda: t.id });
    if (err) {
      setError(err.message);
      setCambiando(null);
      return;
    }
    // Recarga completa en el Panel: datos, logo y colores de la otra ferretería
    window.location.assign('/dashboard');
  }

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-lg border border-border bg-bg hover:bg-surface-alt transition-colors"
        title="Cambiar de ferretería"
      >
        <span className="w-6 h-6 rounded-md bg-white border border-border overflow-hidden flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={perfil.tienda.logo} alt="" className="w-full h-full object-contain" />
        </span>
        <span className="text-xs font-semibold text-text hidden lg:inline">{perfil.tienda.nombre}</span>
        <ArrowLeftRight size={14} className="text-text-muted" />
      </button>
      {abierto && (
        <div className="card-light absolute right-0 mt-2 w-64 bg-surface border border-border rounded-xl shadow-lg z-30 overflow-hidden">
          <p className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Cambiar de ferretería</p>
          {perfil.tiendas.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!!cambiando}
              onClick={() => cambiar(t)}
              className={`w-full px-4 py-2.5 flex items-center gap-3 text-left text-sm hover:bg-bg transition-colors ${
                t.id === perfil.tienda.id ? 'bg-bg font-semibold' : ''
              }`}
            >
              <span className="w-8 h-8 rounded-lg bg-white border border-border overflow-hidden flex items-center justify-center shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.logo} alt="" className="w-full h-full object-contain" />
              </span>
              <span className="flex-1">
                <span className="block text-text">{t.nombre}</span>
                <span className="block text-[11px] text-text-muted">{t.id === perfil.tienda.id ? 'Actual' : 'Cambiar a esta'}</span>
              </span>
              {cambiando === t.id && <Loader2 size={16} className="animate-spin text-text-muted" />}
            </button>
          ))}
          {error && <p className="px-4 py-2 text-xs text-danger border-t border-border">{error}</p>}
        </div>
      )}
    </div>
  );
}
