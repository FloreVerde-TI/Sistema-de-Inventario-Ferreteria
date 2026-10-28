"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Página de inicio "/": con sesión va al Dashboard, sin sesión al Login
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      router.replace(data.session ? '/dashboard' : '/login');
    });
  }, [router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0f2e1a 0%, #1f7a3a 45%, #a8dbb4 100%)' }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center overflow-hidden shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icono.png" alt="Flore Verde" className="w-full h-full object-contain p-1.5" />
        </div>
        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
        <p className="text-white/90 text-sm font-medium">Cargando FerreStock...</p>
      </div>
    </div>
  );
}
