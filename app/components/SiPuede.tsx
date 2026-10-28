"use client";

import React from 'react';
import { usePerfil, Permiso } from '@/components/AdminLayout';

/**
 * Muestra su contenido solo si el rol tiene el permiso.
 * Uso: <SiPuede permiso="productos_eliminar"><button>Borrar</button></SiPuede>
 * "sino" (opcional) es lo que se muestra cuando NO tiene permiso.
 */
export default function SiPuede({
  permiso,
  children,
  sino = null,
}: {
  permiso: Permiso;
  children: React.ReactNode;
  sino?: React.ReactNode;
}) {
  const { puede } = usePerfil();
  return <>{puede(permiso) ? children : sino}</>;
}
