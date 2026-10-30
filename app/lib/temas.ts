// =====================================================================
// TEMÁTICAS DE TEMPORADA
// El sistema elige el tema según la fecha. Cada usuario puede apagarlo
// (se guarda en su navegador). Mientras se prueba, el Super Administrador
// puede forzar cualquier tema desde el botón "Probar temas" (TEMPORAL).
// Los colores están en globals.css ([data-tema="..."]) y los adornos en
// components/Tematica.tsx.
// =====================================================================

export type TemaId = 'navidad' | 'halloween' | 'independencia' | 'amor' | 'madre' | 'semanasanta';

export type Tema = {
  id: TemaId;
  nombre: string;
  emoji: string;
  titulo: string; // mensaje del Dashboard
  texto: string;
  // ¿Está activo en esta fecha? (mes 1-12, día, fecha completa)
  activo: (mes: number, dia: number, fecha: Date) => boolean;
};

/** Domingo de Pascua (de Resurrección) de un año: algoritmo de Meeus/Butcher (calendario gregoriano). */
export function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

/** Semana Santa: del Domingo de Ramos al Domingo de Resurrección (cambia cada año). */
function esSemanaSanta(fecha: Date): boolean {
  const pascua = domingoDePascua(fecha.getFullYear());
  const ramos = new Date(pascua.getFullYear(), pascua.getMonth(), pascua.getDate() - 7);
  const hoy = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  return hoy >= ramos && hoy <= pascua;
}

export const TEMAS: Tema[] = [
  {
    id: 'navidad',
    nombre: 'Navidad',
    emoji: '🎄',
    titulo: '¡Felices fiestas!',
    texto: 'De parte de todo el equipo, les deseamos una feliz Navidad y un próspero año nuevo.',
    // 20 de noviembre al 6 de enero
    activo: (m, d) => (m === 11 && d >= 20) || m === 12 || (m === 1 && d <= 6),
  },
  {
    id: 'halloween',
    nombre: 'Halloween',
    emoji: '🎃',
    titulo: '¡Feliz Halloween!',
    texto: 'Que esta temporada solo den miedo las telarañas, no el inventario.',
    // 15 al 31 de octubre
    activo: (m, d) => m === 10 && d >= 15,
  },
  {
    id: 'independencia',
    nombre: 'Independencia',
    emoji: '🏮', // farol (el emoji de la bandera sale como "CR" en Windows)
    titulo: '¡Feliz Día de la Independencia!',
    texto: '¡Pura vida! Celebramos con orgullo un año más de independencia de Costa Rica.',
    // 1 al 15 de septiembre
    activo: (m, d) => m === 9 && d <= 15,
  },
  {
    id: 'amor',
    nombre: 'Día del Amor y la Amistad',
    emoji: '💘',
    titulo: '¡Feliz Día del Amor y la Amistad!',
    texto: 'Gracias por ser parte de este equipo. ¡Que hoy sobren los abrazos y los buenos clientes!',
    // 7 al 14 de febrero
    activo: (m, d) => m === 2 && d >= 7 && d <= 14,
  },
  {
    id: 'madre',
    nombre: 'Día de la Madre',
    emoji: '💐',
    titulo: '¡Feliz Día de la Madre!',
    texto: 'Un abrazo enorme a todas las mamás que nos acompañan, hoy 15 de agosto y siempre.',
    // 8 al 15 de agosto (en Costa Rica se celebra el 15)
    activo: (m, d) => m === 8 && d >= 8 && d <= 15,
  },
  {
    id: 'semanasanta',
    nombre: 'Semana Santa',
    emoji: '🕊️',
    titulo: 'Semana Santa',
    texto: 'Les deseamos unos días de paz, reflexión y descanso junto a sus seres queridos.',
    // Del Domingo de Ramos al Domingo de Resurrección (se calcula cada año)
    activo: (_m, _d, fecha) => esSemanaSanta(fecha),
  },
];

export function temaDeFecha(fecha = new Date()): Tema | null {
  const m = fecha.getMonth() + 1;
  const d = fecha.getDate();
  return TEMAS.find((t) => t.activo(m, d, fecha)) ?? null;
}

export function temaPorId(id: string | null | undefined): Tema | null {
  return TEMAS.find((t) => t.id === id) ?? null;
}

// ---------------------------------------------------------------------
// Preferencias del usuario (en su navegador) + aviso entre componentes
// ---------------------------------------------------------------------
const CLAVE_ON = 'ferrestock_tema_on'; // '0' = apagado
const CLAVE_PRUEBA = 'ferrestock_tema_prueba'; // '' | 'ninguno' | TemaId  (TEMPORAL)
const EVENTO = 'ferrestock-tema';

function leer(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function guardar(clave: string, valor: string | null) {
  try {
    if (valor === null) window.localStorage.removeItem(clave);
    else window.localStorage.setItem(clave, valor);
  } catch {
    // Si el navegador bloquea el almacenamiento, dura solo esta sesión
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function suscribirTema(cb: () => void): () => void {
  window.addEventListener(EVENTO, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener('storage', cb);
  };
}

/**
 * Texto que resume el estado ("encendido|prueba|temaDeHoy|año"): es la "foto" estable para React.
 * La fecha se lee SOLO en el navegador (en el servidor no hay tema: así no hay diferencias al cargar).
 */
export function estadoTema(): string {
  const hoy = new Date();
  return `${leer(CLAVE_ON) === '0' ? '0' : '1'}|${leer(CLAVE_PRUEBA) ?? ''}|${temaDeFecha(hoy)?.id ?? ''}|${hoy.getFullYear()}`;
}
export const estadoTemaServidor = () => '1|||';

export function interpretarEstado(estado: string): {
  encendido: boolean;
  prueba: string;
  tema: Tema | null;
  deFecha: Tema | null;
  anio: string;
} {
  const [on, prueba = '', hoyId = '', anio = ''] = estado.split('|');
  const encendido = on !== '0';
  const deFecha = temaPorId(hoyId);
  let tema: Tema | null;
  if (prueba === 'ninguno') tema = null;
  else if (prueba) tema = temaPorId(prueba);
  else tema = encendido ? deFecha : null;
  return { encendido, prueba, tema, deFecha, anio };
}

export function cambiarEncendido(encendido: boolean) {
  guardar(CLAVE_ON, encendido ? '1' : '0');
}
export function cambiarPrueba(valor: '' | 'ninguno' | TemaId) {
  guardar(CLAVE_PRUEBA, valor || null);
}
