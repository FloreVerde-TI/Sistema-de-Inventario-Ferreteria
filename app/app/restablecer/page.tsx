"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, CheckCircle2, Eye, EyeOff, Loader2, Lock, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Estado = 'verificando' | 'listo' | 'invalido' | 'exito';

const MIN_CARACTERES = 8;

const INPUT =
  'w-full pl-11 pr-11 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-text-muted focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all';

function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('different from the old')) return 'La contraseña nueva debe ser distinta a la anterior.';
  if (m.includes('at least') || m.includes('weak'))
    return `La contraseña debe tener al menos ${MIN_CARACTERES} caracteres, con letras y números.`;
  if (m.includes('session') || m.includes('expired') || m.includes('jwt'))
    return 'El enlace venció. Pide uno nuevo desde la pantalla de inicio de sesión.';
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'No hay conexión con el servidor. Revisa tu internet.';
  return 'No se pudo cambiar la contraseña. Inténtalo de nuevo.';
}

function mensajeDe(err: unknown): string {
  return err instanceof Error ? err.message : '';
}

function reglas(password: string, confirmar: string) {
  return [
    { ok: password.length >= MIN_CARACTERES, texto: `Al menos ${MIN_CARACTERES} caracteres` },
    { ok: /[A-Za-z]/.test(password) && /\d/.test(password), texto: 'Letras y números' },
    { ok: password.length > 0 && password === confirmar, texto: 'Las dos contraseñas coinciden' },
  ];
}

export default function RestablecerPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>('verificando');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Lee el enlace del correo y abre una sesión temporal para cambiar la contraseña
  useEffect(() => {
    let activo = true;

    const marcarListo = () => {
      if (!activo) return;
      setEstado('listo');
      // Limpia los datos del enlace de la barra de direcciones
      window.history.replaceState(null, '', '/restablecer');
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) marcarListo();
    });

    async function iniciar() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const query = new URLSearchParams(window.location.search);

      // Enlace vencido o ya usado
      if (hash.get('error_description') || query.get('error_description')) {
        if (activo) setEstado('invalido');
        return;
      }

      const code = query.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (activo) setEstado('invalido');
          return;
        }
        marcarListo();
        return;
      }

      // Da tiempo a que Supabase lea el enlace
      await new Promise((r) => setTimeout(r, 1500));
      const { data } = await supabase.auth.getSession();
      if (!activo) return;
      if (data.session) marcarListo();
      else setEstado((e) => (e === 'verificando' ? 'invalido' : e));
    }

    iniciar();

    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const lista = reglas(password, confirmar);
  const valido = lista.every((r) => r.ok);

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido) {
      setAviso('Revisa los requisitos de la contraseña.');
      return;
    }
    setLoading(true);
    setAviso(null);
    try {
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Registro en la bitácora (el usuario lo completa la base de datos)
      await supabase.from('actividad').insert({
        accion: 'cambiar_contrasena',
        entidad: 'usuario',
        entidad_id: data.user.id,
        detalle: 'Restableció su contraseña con el enlace del correo',
      });

      // Cierra la sesión temporal: debe entrar con la contraseña nueva
      await supabase.auth.signOut();
      setEstado('exito');
    } catch (err) {
      setAviso(traducirError(mensajeDe(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f2e1a 0%, #1f7a3a 45%, #a8dbb4 100%)' }}
    >
      {/* Fondo igual al Login */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-[30rem] h-[30rem] rounded-full bg-[#2a8a45] opacity-40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 w-[34rem] h-[34rem] rounded-full bg-[#e3f4e7] opacity-50 blur-3xl" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-icono.png"
        alt=""
        aria-hidden
        className="pointer-events-none select-none absolute -left-24 -bottom-24 w-[42rem] opacity-[0.12] mix-blend-multiply -rotate-12 blur-[2px]"
      />

      <div className="relative w-full max-w-lg">
        <div className="card-light bg-surface rounded-3xl shadow-2xl overflow-hidden">
          {/* Encabezado verde */}
          <div
            className="flex items-center gap-4 px-10 py-7 text-white"
            style={{ background: 'linear-gradient(160deg, #1f7a3a 0%, #155c2b 55%, #0f2e1a 100%)' }}
          >
            <div className="flex gap-2 shrink-0">
              <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center overflow-hidden shadow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-icono.png" alt="Flore Verde" className="w-full h-full object-contain p-1" />
              </div>
              <div className="w-14 h-14 bg-black rounded-xl flex items-center justify-center overflow-hidden shadow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-ferrefuerte.png" alt="Ferre Fuerte" className="w-full h-full object-contain" />
              </div>
            </div>
            <div>
              <p className="text-xl font-bold leading-tight">Sistema de Inventario</p>
              <p className="text-sm text-white/75">Flore Verde · Ferre Fuerte</p>
            </div>
          </div>

          <div className="p-10">
            {estado === 'verificando' && (
              <div className="py-10 flex flex-col items-center gap-3 text-text-muted">
                <Loader2 className="animate-spin text-primary" size={32} />
                <span className="text-sm">Verificando el enlace...</span>
              </div>
            )}

            {estado === 'invalido' && (
              <div className="text-center py-4">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-warning-soft flex items-center justify-center">
                  <AlertTriangle className="text-warning" size={28} />
                </div>
                <h1 className="text-2xl font-bold text-text">Enlace no válido</h1>
                <p className="text-sm text-text-muted mt-2">
                  El enlace venció o ya se usó. Pide uno nuevo con la opción “¿Olvidaste tu contraseña?”.
                </p>
                <button
                  onClick={() => router.replace('/login')}
                  className="mt-6 w-full bg-primary hover:opacity-90 text-white font-semibold py-3 rounded-xl shadow-md transition-all"
                >
                  Ir a iniciar sesión
                </button>
              </div>
            )}

            {estado === 'exito' && (
              <div className="text-center py-4">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-success-soft flex items-center justify-center">
                  <CheckCircle2 className="text-success" size={30} />
                </div>
                <h1 className="text-2xl font-bold text-text">¡Contraseña actualizada!</h1>
                <p className="text-sm text-text-muted mt-2">Ya puedes iniciar sesión con tu contraseña nueva.</p>
                <button
                  onClick={() => router.replace('/login')}
                  className="mt-6 w-full bg-primary hover:opacity-90 text-white font-semibold py-3 rounded-xl shadow-md transition-all"
                >
                  Iniciar sesión
                </button>
              </div>
            )}

            {estado === 'listo' && (
              <>
                <h1 className="text-2xl font-bold text-text">Crea tu nueva contraseña</h1>
                <p className="text-sm text-text-muted mt-2 mb-7">Escríbela dos veces para confirmarla.</p>

                <form onSubmit={handleGuardar} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-text-soft mb-1.5">Contraseña nueva</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                      <input
                        type={verPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className={INPUT}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setVerPassword((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                        title={verPassword ? 'Ocultar' : 'Mostrar'}
                      >
                        {verPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-soft mb-1.5">Confirmar contraseña</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                      <input
                        type={verPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className={INPUT}
                        placeholder="••••••••"
                        value={confirmar}
                        onChange={(e) => setConfirmar(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Requisitos */}
                  <ul className="space-y-1.5">
                    {lista.map((r) => (
                      <li
                        key={r.texto}
                        className={`flex items-center gap-2 text-xs ${r.ok ? 'text-success' : 'text-text-muted'}`}
                      >
                        <Check size={14} className={r.ok ? 'opacity-100' : 'opacity-30'} />
                        {r.texto}
                      </li>
                    ))}
                  </ul>

                  {aviso && (
                    <div className="flex items-start gap-2 p-3 text-sm rounded-xl border bg-danger-soft text-danger border-danger/30">
                      <span className="flex-1">{aviso}</span>
                      <button type="button" onClick={() => setAviso(null)} title="Cerrar">
                        <X size={16} />
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !valido}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:opacity-90 text-white font-semibold py-3 rounded-xl shadow-md transition-all disabled:opacity-50"
                  >
                    {loading && <Loader2 className="animate-spin" size={18} />}
                    {loading ? 'Guardando...' : 'Guardar contraseña'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-white/80 mt-6">© 2026 · Uso interno</p>
      </div>
    </div>
  );
}
