"use client";

import { useSyncExternalStore } from 'react';

// =====================================================================
// MODO DEFENSA (presentaciones de la universidad)
// Oculta todo lo relacionado con la página web (pedidos, cotizaciones,
// "en web", movimientos de origen web…) para mostrar solo el inventario.
// Se guarda en ESTE navegador. Se activa de forma discreta:
//   - 5 clics rápidos sobre el texto de versión al pie del menú, o
//   - Ctrl + Alt + D
// (solo para Super Administrador). No cambia ningún dato de la base.
// =====================================================================

const CLAVE = 'ferrestock_modo_defensa';
const EVENTO = 'ferrestock-defensa';

// Si la ferretería actual NO tiene página web (p. ej. Ferre Fuerte), también se oculta
// todo lo de la web, igual que en modo defensa. Lo marca AdminLayout al cargar la tienda.
let tiendaSinWeb = false;
export function marcarTiendaSinWeb(valor: boolean) {
  if (tiendaSinWeb === valor) return;
  tiendaSinWeb = valor;
  window.dispatchEvent(new Event(EVENTO));
}

function leerSoloDefensa(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

function leer(): boolean {
  return tiendaSinWeb || leerSoloDefensa();
}

function suscribir(cb: () => void): () => void {
  window.addEventListener(EVENTO, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener('storage', cb);
  };
}

/** true si hay que ocultar lo de la web (modo defensa activo, o tienda sin página web). */
export function useDefensa(): boolean {
  return useSyncExternalStore(suscribir, leer, () => false);
}

/** true solo si el modo defensa está encendido a mano (no cuenta "tienda sin web"). */
export function useDefensaManual(): boolean {
  return useSyncExternalStore(suscribir, leerSoloDefensa, () => false);
}

/** Lectura directa (para funciones fuera de React, p. ej. al armar un reporte). */
export function defensaActiva(): boolean {
  return typeof window !== 'undefined' && leer();
}

/** Activa o desactiva. Devuelve el nuevo estado. */
export function alternarDefensa(): boolean {
  const nuevo = !leerSoloDefensa();
  try {
    if (nuevo) window.localStorage.setItem(CLAVE, '1');
    else window.localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: no se puede activar */
  }
  window.dispatchEvent(new Event(EVENTO));
  return nuevo;
}
