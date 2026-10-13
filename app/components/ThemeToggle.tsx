"use client";

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Lee el tema que el script de layout.tsx ya aplicó al <html>
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // Si el navegador bloquea localStorage, el tema solo dura esta sesión
    }
  };

  return (
    <button
      onClick={toggle}
      className="p-2 text-text-muted hover:text-text transition-colors"
      title={dark ? 'Modo claro' : 'Modo oscuro'}
      aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'}
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
