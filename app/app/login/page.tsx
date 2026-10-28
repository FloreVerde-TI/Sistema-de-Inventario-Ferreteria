"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Package,
  ShoppingCart,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Aviso = { tipo: 'error' | 'exito'; texto: string } | null;
type Vista = 'login' | 'recuperar';

const INPUT =
  'w-full pl-11 pr-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-text-muted focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all';

const DESTACADOS = [
  { icon: Package, texto: 'Control de stock en tiempo real' },
  { icon: ShoppingCart, texto: 'Pedidos de la tienda web' },
  { icon: BarChart3, texto: 'Reportes en Excel y PDF' },
];

// Traduce los errores de Supabase a mensajes claros en español
function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'El correo aún no está confirmado. Contacta al administrador.';
  if (m.includes('banned')) return 'Tu usuario está desactivado. Contacta al administrador.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'No hay conexión con el servidor. Revisa tu internet.';
  return 'No se pudo completar la acción. Inténtalo de nuevo.';
}

function mensajeDe(err: unknown): string {
  return err instanceof Error ? err.message : '';
}

export default function LoginPage() {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revisandoSesion, setRevisandoSesion] = useState(true);
  const [aviso, setAviso] = useState<Aviso>(null);

  // Si ya hay sesión, ir directo al Dashboard
  useEffect(() => {
    let activo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return;
      if (data.session) router.replace('/dashboard');
      else setRevisandoSesion(false);
    });
    return () => {
      activo = false;
    };
  }, [router]);

  const cambiarVista = (nueva: Vista) => {
    setVista(nueva);
    setAviso(null);
    setPassword('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAviso(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      // Revisar que el usuario esté activo
      const { data: perfil } = await supabase
        .from('profiles')
        .select('activo')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!perfil || !perfil.activo) {
        await supabase.auth.signOut();
        setAviso({ tipo: 'error', texto: 'Tu usuario está desactivado. Contacta al administrador.' });
        return;
      }

      router.replace('/dashboard');
    } catch (err) {
      setAviso({ tipo: 'error', texto: traducirError(mensajeDe(err)) });
    } finally {
      setLoading(false);
    }
  };

  const handleRecuperar = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAviso(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/restablecer`,
      });
      if (error) throw error;
      // Mensaje genérico: no revela si el correo existe o no
      setAviso({
        tipo: 'exito',
        texto: 'Si el correo está registrado, te llegará un enlace para crear una contraseña nueva.',
      });
    } catch (err) {
      setAviso({ tipo: 'error', texto: traducirError(mensajeDe(err)) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden"
      // Degradado fijo con los colores de la marca (no cambia con el modo oscuro)
      style={{ background: 'linear-gradient(135deg, #0f2e1a 0%, #1f7a3a 45%, #a8dbb4 100%)' }}
    >
      {/* Manchas difuminadas */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-[30rem] h-[30rem] rounded-full bg-[#2a8a45] opacity-40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 w-[34rem] h-[34rem] rounded-full bg-[#e3f4e7] opacity-50 blur-3xl" />

      {/* Logo grande de fondo (marca de agua) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-icono.png"
        alt=""
        aria-hidden
        className="pointer-events-none select-none absolute -left-24 -bottom-24 w-[42rem] opacity-[0.12] mix-blend-multiply -rotate-12 blur-[2px]"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-icono.png"
        alt=""
        aria-hidden
        className="pointer-events-none select-none absolute -right-16 -top-20 w-[26rem] opacity-[0.10] mix-blend-multiply rotate-12 blur-[2px]"
      />

      <div className="relative w-full max-w-5xl">
        <div className="card-light bg-surface rounded-3xl shadow-2xl overflow-hidden grid md:grid-cols-2 min-h-[600px]">
          {/* Panel izquierdo: marca */}
          <div
            className="relative hidden md:flex flex-col justify-between p-12 text-white overflow-hidden"
            style={{ background: 'linear-gradient(160deg, #1f7a3a 0%, #155c2b 55%, #0f2e1a 100%)' }}
          >
            {/* Brillo suave */}
            <div className="pointer-events-none absolute -top-20 -right-20 w-80 h-80 rounded-full bg-[#6fbf73] opacity-30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-[#a8dbb4] opacity-20 blur-3xl" />

            <div className="relative">
              <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center overflow-hidden shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-icono.png" alt="Flore Verde" className="w-full h-full object-contain p-1.5" />
              </div>
              <h1 className="mt-8 text-4xl font-bold leading-tight">FerreStock</h1>
              <p className="mt-2 text-white/80 text-lg">
                El inventario de Flore Verde, en un solo lugar.
              </p>
            </div>

            <ul className="relative space-y-4">
              {DESTACADOS.map((d) => (
                <li key={d.texto} className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                    <d.icon size={20} />
                  </span>
                  <span className="text-white/90">{d.texto}</span>
                </li>
              ))}
            </ul>

            <p className="relative text-xs text-white/60">© 2026 Flore Verde SRL · Uso interno</p>
          </div>

          {/* Panel derecho: formulario */}
          <div className="flex flex-col justify-center p-10 md:p-14">
            <div className="mb-8">
              <div className="md:hidden w-24 h-24 mb-4 bg-white rounded-2xl flex items-center justify-center overflow-hidden shadow-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="Flore Verde" className="w-full h-full object-contain p-2" />
              </div>
              <h2 className="text-3xl font-bold text-text">
                {vista === 'login' ? 'Bienvenido' : 'Recuperar contraseña'}
              </h2>
              <p className="text-sm text-text-muted mt-2">
                {vista === 'login'
                  ? 'Inicia sesión con tu cuenta para continuar.'
                  : 'Escribe el correo de tu usuario y te enviaremos un enlace para crear una contraseña nueva.'}
              </p>
            </div>

            {revisandoSesion ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="animate-spin text-primary" size={32} />
              </div>
            ) : (
              <form
                onSubmit={vista === 'login' ? handleLogin : handleRecuperar}
                className="space-y-5"
              >
                <div>
                  <label className="block text-sm font-medium text-text-soft mb-1.5">Correo electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                    <input
                      type="email"
                      autoComplete="email"
                      className={INPUT}
                      placeholder="usuario@floreverde.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {vista === 'login' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-text-soft">Contraseña</label>
                      <button
                        type="button"
                        onClick={() => cambiarVista('recuperar')}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                      <input
                        type={verPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        className={`${INPUT} pr-11`}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setVerPassword((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                        title={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {verPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                )}

                {aviso && (
                  <div
                    className={`flex items-start gap-2 p-3 text-sm rounded-xl border ${
                      aviso.tipo === 'error'
                        ? 'bg-danger-soft text-danger border-danger/30'
                        : 'bg-success-soft text-success border-success/30'
                    }`}
                  >
                    <span className="flex-1">{aviso.texto}</span>
                    <button type="button" onClick={() => setAviso(null)} title="Cerrar">
                      <X size={16} />
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-primary hover:opacity-90 text-white font-semibold py-3 rounded-xl transition-all shadow-md disabled:opacity-60"
                >
                  {loading && <Loader2 className="animate-spin" size={18} />}
                  {vista === 'login'
                    ? loading ? 'Ingresando...' : 'Iniciar sesión'
                    : loading ? 'Enviando...' : 'Enviar enlace'}
                </button>

                {vista === 'recuperar' && (
                  <button
                    type="button"
                    onClick={() => cambiarVista('login')}
                    className="w-full flex items-center justify-center gap-2 text-sm text-text-soft hover:text-text"
                  >
                    <ArrowLeft size={16} /> Volver a iniciar sesión
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
