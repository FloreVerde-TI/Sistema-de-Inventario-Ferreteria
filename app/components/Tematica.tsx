"use client";

import React, { useEffect, useSyncExternalStore } from 'react';
import { Pause, Play, Sparkles, X } from 'lucide-react';
import {
  TEMAS,
  cambiarEncendido,
  cambiarPrueba,
  estadoTema,
  estadoTemaServidor,
  interpretarEstado,
  suscribirTema,
  type Tema,
  type TemaId,
} from '@/lib/temas';

// =====================================================================
// TEMÁTICAS DE TEMPORADA (adornos dibujados aquí mismo en SVG: pesan
// poquísimo y no dependen de imágenes externas).
// - Los adornos de fondo van DETRÁS de las tarjetas (no tapan datos).
// - Los de las orillas son pequeños, semitransparentes y no se pueden
//   tocar (pointer-events: none).
// - Si la compu tiene "reducir movimiento", las animaciones se detienen.
// =====================================================================

// ---- Pausar animaciones (para compus lentas). Se guarda en este navegador. ----
const CLAVE_PAUSA = 'ferrestock_animaciones_pausa';
const EVENTO_PAUSA = 'ferrestock-animaciones';
function leerPausa(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_PAUSA) === '1';
  } catch {
    return false;
  }
}
function suscribirPausa(cb: () => void) {
  window.addEventListener(EVENTO_PAUSA, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENTO_PAUSA, cb);
    window.removeEventListener('storage', cb);
  };
}
export function usePausaAnimacion() {
  return useSyncExternalStore(suscribirPausa, leerPausa, () => false);
}
function cambiarPausa(pausa: boolean) {
  try {
    if (pausa) window.localStorage.setItem(CLAVE_PAUSA, '1');
    else window.localStorage.removeItem(CLAVE_PAUSA);
  } catch {
    /* sin almacenamiento: dura solo esta sesión */
  }
  window.dispatchEvent(new Event(EVENTO_PAUSA));
}

/** Botón ⏸/▶ junto al ✨: congela o reanuda los adornos animados. */
export function BotonPausaAnimacion() {
  const pausa = usePausaAnimacion();
  return (
    <button
      type="button"
      onClick={() => cambiarPausa(!pausa)}
      className={`p-2 transition-colors ${pausa ? 'text-text-muted hover:text-text' : 'text-text-muted hover:text-primary'}`}
      title={pausa ? 'Animaciones en pausa (clic para reanudar)' : 'Pausar animaciones (útil en computadoras lentas)'}
      aria-label={pausa ? 'Reanudar animaciones' : 'Pausar animaciones'}
      aria-pressed={pausa}
    >
      {pausa ? <Play size={18} /> : <Pause size={18} />}
    </button>
  );
}

export function useTema() {
  const estado = useSyncExternalStore(suscribirTema, estadoTema, estadoTemaServidor);
  return interpretarEstado(estado);
}

/** Aplica el tema al <html> y dibuja los adornos. Va una sola vez en AdminLayout. */
export function DecoracionTema({ tienda }: { tienda?: string }) {
  const { tema } = useTema();
  const pausa = usePausaAnimacion();

  useEffect(() => {
    const html = document.documentElement;
    if (pausa) html.dataset.animPausa = '1';
    else delete html.dataset.animPausa;
  }, [pausa]);

  useEffect(() => {
    const html = document.documentElement;
    if (tema) html.dataset.tema = tema.id;
    else delete html.dataset.tema;
    return () => {
      delete html.dataset.tema;
    };
  }, [tema]);

  // Sin temática de temporada (o "Sin tema"): el adorno de siempre de cada ferretería
  if (!tema) {
    if (!tienda) return null;
    return (
      <div aria-hidden="true">
        {tienda === 'ferrefuerte' ? <AmbienteFerreFuerte /> : <AmbienteFloreVerde />}
      </div>
    );
  }
  return (
    <div aria-hidden="true">
      {tema.id === 'navidad' && <Navidad />}
      {tema.id === 'halloween' && <Halloween />}
      {tema.id === 'independencia' && <Independencia />}
      {tema.id === 'amor' && <Amor />}
      {tema.id === 'madre' && <Madre />}
      {tema.id === 'semanasanta' && <SemanaSanta />}
    </div>
  );
}

/** Botón ✨ junto al sol/luna: enciende o apaga la temática (solo se ve si hay una). */
export function BotonTema() {
  const { tema, encendido, prueba, deFecha } = useTema();
  const posible = tema ?? deFecha;
  if (!posible && !prueba) return null;

  const activo = !!tema;
  const nombre = (tema ?? deFecha)?.nombre ?? 'temporada';
  return (
    <button
      type="button"
      onClick={() => {
        if (activo) {
          cambiarPrueba('');
          cambiarEncendido(false);
        } else {
          cambiarEncendido(true);
        }
      }}
      className={`p-2 transition-colors ${activo ? 'text-primary' : 'text-text-muted hover:text-text'}`}
      title={activo ? `Temática de ${nombre}: encendida (clic para apagar)` : `Temática de ${nombre}: apagada (clic para encender)`}
      aria-label={activo ? 'Apagar temática de temporada' : 'Encender temática de temporada'}
      aria-pressed={activo && encendido}
    >
      <Sparkles size={20} />
    </button>
  );
}

/** TEMPORAL: selector para ver cada tema sin esperar la fecha (solo Super Administrador). */
export function ProbarTemas() {
  const { prueba } = useTema();
  return (
    <div className="hidden md:flex fixed left-3 bottom-20 z-50 card-light bg-surface border border-border rounded-full shadow-md pl-3 pr-1 py-1 items-center gap-2 text-xs">
      <span className="font-semibold text-text-soft">🎨 Probar tema</span>
      <select
        className="bg-bg border border-border rounded-full px-2 py-1 text-xs text-text outline-none"
        value={prueba}
        onChange={(e) => cambiarPrueba(e.target.value as '' | 'ninguno' | TemaId)}
        title="Temporal: solo para probar cómo se ve cada temática"
      >
        <option value="">Automático (según la fecha)</option>
        <option value="ninguno">Sin tema</option>
        {TEMAS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.emoji} {t.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Mensaje del Dashboard que explica por qué cambiaron los colores. */
export function MensajeTema() {
  const { tema, anio } = useTema();
  // Se oculta por tema y por año (el próximo año vuelve a salir)
  const clave = tema ? `ferrestock_tema_visto_${tema.id}_${anio}` : '';
  const oculto = useSyncExternalStore(
    suscribirTema,
    () => {
      if (!clave) return true;
      try {
        return window.localStorage.getItem(clave) === '1';
      } catch {
        return false;
      }
    },
    () => true
  );
  if (!tema || oculto) return null;

  return (
    <div className="card-light relative overflow-hidden rounded-xl border border-border shadow-sm tema-mensaje">
      <div className="flex items-start gap-4 p-5 pr-12">
        <div className="text-3xl leading-none select-none">{tema.id === 'independencia' ? <BanderaCR /> : tema.emoji}</div>
        <div>
          <p className="font-bold text-text">{tema.titulo}</p>
          <p className="text-sm text-text-soft mt-0.5">{tema.texto}</p>
          <p className="text-xs text-text-muted mt-2">
            Los colores del sistema cambian según la temporada. Puedes apagarlo con el botón ✨ de la barra superior.
          </p>
        </div>
      </div>
      <button
        type="button"
        title="Cerrar mensaje"
        onClick={() => {
          try {
            window.localStorage.setItem(clave, '1');
          } catch {
            /* sin almacenamiento: se vuelve a mostrar la próxima vez */
          }
          window.dispatchEvent(new Event('ferrestock-tema'));
        }}
        className="absolute right-3 top-3 p-1.5 rounded-lg text-text-muted hover:bg-bg"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export type { Tema };

/** Bandera de Costa Rica dibujada (Windows no muestra el emoji de banderas). */
function BanderaCR() {
  return (
    <svg width="36" height="24" viewBox="0 0 36 24" className="rounded-[3px] shadow-sm" aria-label="Bandera de Costa Rica">
      <rect width="36" height="24" fill="#002b7f" />
      <rect y="4" width="36" height="16" fill="#ffffff" />
      <rect y="8" width="36" height="8" fill="#ce1126" />
    </svg>
  );
}

/* =====================================================================
   ADORNOS
   ===================================================================== */

// Posiciones "al azar" pero siempre iguales (no cambian en cada render)
const azar = (i: number, s: number) => ((Math.sin(i * 12.9898 + s * 78.233) * 43758.5453) % 1 + 1) % 1;

/** Luces de colores de fondo, muy borrosas (efecto "bokeh"). */
function Bokeh({ colores, suave = false }: { colores: string[]; suave?: boolean }) {
  return (
    <div className={`fixed inset-0 -z-10 pointer-events-none overflow-hidden ${suave ? 'opacity-50 dark:opacity-30' : ''}`}>
      {colores.map((c, i) => (
        <span
          key={i}
          className="absolute rounded-full tema-anim tema-flotar tema-bokeh"
          style={{
            background: c,
            width: `${160 + azar(i, 1) * 220}px`,
            height: `${160 + azar(i, 1) * 220}px`,
            left: `${azar(i, 2) * 90}%`,
            top: `${azar(i, 3) * 85}%`,
            filter: 'blur(60px)',
            animationDelay: `${-azar(i, 4) * 20}s`,
          }}
        />
      ))}
    </div>
  );
}

// Cable con 8 "combas" iguales (cada una mide 12.5 de ancho y baja hasta y = 10)
const CABLE = Array.from({ length: 8 }, (_, i) => `${i === 0 ? 'M0 4 ' : ''}Q ${i * 12.5 + 6.25} 16 ${(i + 1) * 12.5} 4`).join(' ');

/** Guirnalda que cuelga en la parte de arriba (luces o banderines). */
function Guirnalda({ n, pieza }: { n: number; pieza: (i: number) => React.ReactNode }) {
  return (
    <div className="fixed top-0 left-0 md:left-64 right-0 h-9 z-40 pointer-events-none overflow-hidden">
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 36">
        <path
          d={CABLE}
          fill="none"
          stroke="currentColor"
          className="text-text-muted"
          strokeWidth="0.35"
          vectorEffect="non-scaling-stroke"
          opacity="0.6"
        />
      </svg>
      {Array.from({ length: n }, (_, i) => {
        const x = (i + 0.5) / n; // 0..1
        const fase = (x * 100) % 12.5; // cada "comba" mide 12.5
        const t = fase / 12.5; // posición dentro de la comba (0..1)
        const y = 4 + 12 * 2 * t * (1 - t); // misma curva que el cable (máx. 10)
        return (
          <span key={i} className="absolute" style={{ left: `${x * 100}%`, top: `${(y / 36) * 100}%` }}>
            {pieza(i)}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------- DE SIEMPRE: FLORE VERDE (naturaleza) ------------------- */

function HojaSVG({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 2C6 6 3.5 12 6 21c5-1 10-4 11.5-9.5C18.6 7.4 15.5 4 12 2z" fill={color} />
      <path d="M12 3.5c-1.2 5-2.6 10.5-5.6 17" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function Brote({ alto }: { alto: number }) {
  return (
    <svg width={alto * 0.8} height={alto} viewBox="0 0 32 40" fill="none" strokeLinecap="round">
      <path d="M16 40V18" stroke="#15803d" strokeWidth="2.2" />
      <path d="M16 24C9 24 5 19 4 12c7 0 11 4 12 12z" fill="#22c55e" />
      <path d="M16 19c1-7 5-12 12-12-1 7-5 11-12 12z" fill="#4ade80" />
    </svg>
  );
}

function AmbienteFloreVerde() {
  const verdes = ['#16a34a', '#22c55e', '#4ade80', '#15803d', '#65a30d', '#84cc16'];
  return (
    <>
      <Bokeh suave colores={['#bbf7d0', '#86efac', '#d9f99d', '#a7f3d0']} />

      {/* Hojas que caen despacio, detrás de las tarjetas */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden opacity-60 dark:opacity-40">
        {Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className="absolute -top-8 tema-anim tema-caer"
            style={{
              left: `${azar(i, 21) * 100}%`,
              animationDuration: `${20 + azar(i, 22) * 18}s`,
              animationDelay: `${-azar(i, 23) * 38}s`,
            }}
          >
            <HojaSVG size={12 + Math.round(azar(i, 24) * 12)} color={verdes[i % verdes.length]} />
          </span>
        ))}
      </div>

      {/* Brotes que se mecen abajo */}
      <div className="fixed bottom-0 left-0 md:left-64 right-0 h-16 -z-10 pointer-events-none overflow-hidden opacity-50 dark:opacity-35">
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className="absolute bottom-0 tema-anim tema-mecer origin-bottom"
            style={{ left: `${4 + i * 11 + azar(i, 25) * 5}%`, animationDelay: `${-azar(i, 26) * 3.5}s` }}
          >
            <Brote alto={26 + Math.round(azar(i, 27) * 22)} />
          </span>
        ))}
      </div>
    </>
  );
}

/* ------------------- DE SIEMPRE: FERRE FUERTE (herramientas) ------------------- */

// Engranaje dibujado con 'dientes' dientes
function engranaje(dientes: number) {
  const pts: string[] = [];
  for (let i = 0; i < dientes * 4; i++) {
    const ang = (i / (dientes * 4)) * Math.PI * 2;
    const radio = i % 4 < 2 ? 50 : 41;
    pts.push(`${(50 + radio * Math.cos(ang)).toFixed(2)},${(50 + radio * Math.sin(ang)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}
const ENGRANE_12 = engranaje(12);
const ENGRANE_9 = engranaje(9);

function EngraneSVG({ size, color, d }: { size: number; color: string; d: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <path d={d} fill={color} />
      <circle cx="50" cy="50" r="15" fill="var(--bg)" />
    </svg>
  );
}

function TuercaSVG({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M7 3h10l5 9-5 9H7l-5-9z" fill={color} />
      <circle cx="12" cy="12" r="3.6" fill="var(--bg)" />
    </svg>
  );
}

function TornilloSVG({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size * 0.5} height={size} viewBox="0 0 12 24" fill="none">
      <rect x="1" y="0.5" width="10" height="4" rx="1" fill={color} />
      <path d="M4 4.5h4v15L6 23l-2-3.5z" fill={color} />
      <path d="M3.5 8l5-1.2M3.5 11l5-1.2M3.5 14l5-1.2M3.5 17l5-1.2" stroke="var(--bg)" strokeWidth="0.9" />
    </svg>
  );
}

function AmbienteFerreFuerte() {
  const metales = ['#c62828', '#d4a017', '#9ca3af', '#b91c1c', '#ca8a04', '#6b7280'];
  return (
    <>
      <Bokeh suave colores={['#fecaca', '#fde68a', '#fca5a5', '#fef3c7']} />

      {/* Engranajes grandes que giran muy lento en las esquinas */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden opacity-[0.12] dark:opacity-[0.09]">
        <span className="absolute -right-24 -top-24 tema-anim tema-girar" style={{ animationDuration: '90s' }}>
          <EngraneSVG size={320} color="#c62828" d={ENGRANE_12} />
        </span>
        <span
          className="absolute right-40 top-36 tema-anim tema-girar"
          style={{ animationDuration: '60s', animationDirection: 'reverse' }}
        >
          <EngraneSVG size={150} color="#d4a017" d={ENGRANE_9} />
        </span>
        <span className="absolute left-48 -bottom-28 tema-anim tema-girar" style={{ animationDuration: '110s' }}>
          <EngraneSVG size={280} color="#6b7280" d={ENGRANE_12} />
        </span>
      </div>

      {/* Tuercas y tornillos que caen despacio */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden opacity-55 dark:opacity-40">
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className="absolute -top-8 tema-anim tema-caer"
            style={{
              left: `${azar(i, 31) * 100}%`,
              animationDuration: `${18 + azar(i, 32) * 16}s`,
              animationDelay: `${-azar(i, 33) * 34}s`,
            }}
          >
            {i % 2 === 0 ? (
              <TuercaSVG size={11 + Math.round(azar(i, 34) * 9)} color={metales[i % metales.length]} />
            ) : (
              <TornilloSVG size={16 + Math.round(azar(i, 35) * 10)} color={metales[i % metales.length]} />
            )}
          </span>
        ))}
      </div>
    </>
  );
}

/* ----------------------------- NAVIDAD ----------------------------- */

function CopoSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" />
      <path d="M12 2l-2 2M12 2l2 2M12 22l-2-2M12 22l2-2M3.3 7l2.7.4M3.3 7l1-2.5M20.7 17l-2.7-.4M20.7 17l-1 2.5M3.3 17l1 2.5M3.3 17l2.7-.4M20.7 7l-1-2.5M20.7 7l-2.7.4" />
    </svg>
  );
}

function Navidad() {
  const colores = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#f97316'];
  return (
    <>
      <Bokeh colores={['#93c5fd', '#ffffff', '#fde68a', '#bfdbfe', '#fca5a5', '#a5f3fc']} />

      {/* Pinos borrosos al fondo */}
      <svg className="fixed bottom-0 left-0 w-full h-40 -z-10 pointer-events-none text-sky-900/20 dark:text-sky-200/10" viewBox="0 0 1200 160" preserveAspectRatio="none" style={{ filter: 'blur(3px)' }}>
        {Array.from({ length: 14 }, (_, i) => {
          const x = i * 90 + azar(i, 5) * 40;
          const h = 70 + azar(i, 6) * 80;
          return <path key={i} d={`M${x} 160 L${x + 32} ${160 - h} L${x + 64} 160 Z`} fill="currentColor" />;
        })}
      </svg>

      {/* Nieve que cae lento, detrás de las tarjetas */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden text-sky-400 dark:text-sky-100">
        {Array.from({ length: 26 }, (_, i) => (
          <span
            key={i}
            className="absolute -top-6 tema-anim tema-caer"
            style={{
              left: `${azar(i, 7) * 100}%`,
              animationDuration: `${14 + azar(i, 8) * 14}s`,
              animationDelay: `${-azar(i, 9) * 28}s`,
              opacity: 0.55 + azar(i, 10) * 0.4,
              filter: 'drop-shadow(0 0 2px rgba(30,64,175,.35))',
            }}
          >
            <CopoSVG size={8 + Math.round(azar(i, 11) * 10)} />
          </span>
        ))}
      </div>

      {/* Luces navideñas arriba */}
      <Guirnalda
        n={28}
        pieza={(i) => (
          <span
            className="block w-[7px] h-[11px] -ml-[3.5px] rounded-b-full rounded-t-[3px] tema-anim tema-parpadeo"
            style={{
              background: colores[i % colores.length],
              boxShadow: `0 0 8px 2px ${colores[i % colores.length]}`,
              animationDelay: `${(i % 4) * 0.6}s`,
            }}
          />
        )}
      />
    </>
  );
}

/* ----------------------------- HALLOWEEN ----------------------------- */

function Telarana({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width="120" height="120" viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1">
      {/* Hilos que salen de la esquina */}
      <path d="M120 0 L0 0 M120 0 L10 60 M120 0 L40 105 M120 0 L85 120 M120 0 L120 120" />
      {/* Anillos */}
      {[22, 44, 66, 88].map((r) => (
        <path key={r} d={`M${120 - r} 0 Q ${120 - r * 0.85} ${r * 0.28} ${120 - r * 0.91} ${r * 0.5} Q ${120 - r * 0.62} ${r * 0.62} ${120 - r * 0.58} ${r * 0.85} Q ${120 - r * 0.32} ${r * 0.85} ${120 - r * 0.2} ${r} Q ${120 - r * 0.05} ${r * 0.98} 120 ${r}`} />
      ))}
    </svg>
  );
}

function Arana() {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="currentColor">
      <ellipse cx="8" cy="8" rx="3.2" ry="3.6" />
      <circle cx="8" cy="3.6" r="2" />
      <g stroke="currentColor" strokeWidth="0.9" fill="none" strokeLinecap="round">
        <path d="M5 6.5 L1.5 4.5 M5 8 L1 8.5 M5.3 9.5 L2 12.5 M11 6.5 L14.5 4.5 M11 8 L15 8.5 M10.7 9.5 L14 12.5" />
      </g>
      <circle cx="7.3" cy="3.4" r="0.45" fill="#f97316" />
      <circle cx="8.7" cy="3.4" r="0.45" fill="#f97316" />
    </svg>
  );
}

function ManoZombie() {
  return (
    <svg width="44" height="58" viewBox="0 0 44 58">
      <path
        d="M10 58 L12 34 Q 6 30 5 22 Q 4 16 7 16 Q 9 16 10 22 L11 25 L10 10 Q 10 6 13 6 Q 16 6 16 10 L17 22 L17 5 Q 17 1 20 1 Q 23 1 23 5 L23 22 L24 7 Q 24 3 27 3 Q 30 3 30 7 L29 24 L31 13 Q 32 10 34.5 10.5 Q 37 11 36.5 14 L34 32 Q 32 38 30 40 L31 58 Z"
        fill="#86a36b"
        stroke="#4d6b3a"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M14 44 L28 44 M15 50 L27 49" stroke="#4d6b3a" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

function Murcielago() {
  return (
    <svg width="22" height="10" viewBox="0 0 22 10" fill="currentColor">
      <path d="M11 3 Q 12 1 12.6 3 Q 16 0 22 2 Q 18 3 18 6 Q 15 4.5 13 7 Q 11.5 6 11 8 Q 10.5 6 9 7 Q 7 4.5 4 6 Q 4 3 0 2 Q 6 0 9.4 3 Q 10 1 11 3 Z" />
    </svg>
  );
}

function Halloween() {
  return (
    <>
      <Bokeh colores={['#fb923c', '#f97316', '#a855f7', '#fdba74', '#7c3aed', '#fbbf24']} />

      {/* Calabazas borrosas al fondo */}
      <svg className="fixed bottom-0 left-0 w-full h-36 -z-10 pointer-events-none" viewBox="0 0 1200 140" preserveAspectRatio="xMidYMax slice" style={{ filter: 'blur(2.5px)', opacity: 0.28 }}>
        {Array.from({ length: 7 }, (_, i) => {
          const x = 80 + i * 170 + azar(i, 12) * 40;
          const r = 26 + azar(i, 13) * 16;
          return (
            <g key={i}>
              <ellipse cx={x} cy={140 - r} rx={r * 1.25} ry={r} fill="#ea580c" />
              <ellipse cx={x} cy={140 - r} rx={r * 0.45} ry={r} fill="#c2410c" />
              <rect x={x - 3} y={140 - r * 2 - 8} width="6" height="12" rx="2" fill="#3f6212" />
            </g>
          );
        })}
      </svg>

      {/* Murciélagos lejanos */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden text-neutral-800/40 dark:text-orange-200/25">
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className="absolute tema-anim tema-volar"
            style={{ top: `${18 + azar(i, 14) * 45}%`, animationDuration: `${38 + azar(i, 15) * 20}s`, animationDelay: `${-azar(i, 16) * 40}s` }}
          >
            <Murcielago />
          </span>
        ))}
      </div>

      {/* Telaraña con arañita (esquina superior derecha, bajo la barra) */}
      <div className="fixed right-0 top-16 z-30 pointer-events-none text-neutral-500/50 dark:text-neutral-300/30">
        <Telarana />
        <span className="absolute right-[34px] top-0 flex flex-col items-center tema-anim tema-colgar text-neutral-800 dark:text-neutral-200">
          <span className="block w-px h-[54px] bg-current opacity-50" />
          <Arana />
        </span>
      </div>

      {/* Telaraña chica (esquina inferior izquierda del área de trabajo) */}
      <div className="fixed left-0 md:left-64 bottom-0 z-30 pointer-events-none text-neutral-500/40 dark:text-neutral-300/25" style={{ transform: 'rotate(180deg) scaleX(-1)' }}>
        <Telarana style={{ width: 80, height: 80 }} />
      </div>

      {/* Manita de zombie que se asoma abajo a la derecha */}
      <div className="fixed right-8 bottom-0 z-30 pointer-events-none tema-anim tema-asomar" style={{ opacity: 0.85 }}>
        <ManoZombie />
      </div>
    </>
  );
}

/* --------------------------- INDEPENDENCIA --------------------------- */

function Farol({ color }: { color: string }) {
  return (
    <svg width="26" height="44" viewBox="0 0 26 44">
      <line x1="13" y1="0" x2="13" y2="8" stroke="#475569" strokeWidth="1" />
      <rect x="8" y="7" width="10" height="4" rx="1" fill="#334155" />
      <path d="M5 11 H21 L19 34 H7 Z" fill={color} opacity="0.9" stroke="#1e293b" strokeWidth="0.8" />
      <path d="M9 13 H17 L16 31 H10 Z" fill="#fde68a" opacity="0.85" />
      <rect x="7" y="34" width="12" height="3" rx="1" fill="#334155" />
      <path d="M13 37 V42" stroke="#334155" strokeWidth="1" />
    </svg>
  );
}

function Independencia() {
  const banderin = ['#1e3a8a', '#ffffff', '#ce1126', '#ffffff', '#1e3a8a'];
  return (
    <>
      <Bokeh colores={['#93c5fd', '#fca5a5', '#ffffff', '#60a5fa', '#f87171', '#bfdbfe']} />

      {/* Franjas de la bandera, muy borrosas, abajo */}
      <div className="fixed left-0 right-0 bottom-0 h-28 -z-10 pointer-events-none" style={{ filter: 'blur(14px)', opacity: 0.25 }}>
        <div className="h-1/5 bg-[#1e3a8a]" />
        <div className="h-1/5 bg-white" />
        <div className="h-1/5 bg-[#ce1126]" />
        <div className="h-1/5 bg-white" />
        <div className="h-1/5 bg-[#1e3a8a]" />
      </div>

      {/* Banderines arriba */}
      <Guirnalda
        n={30}
        pieza={(i) => (
          <svg width="12" height="15" viewBox="0 0 12 15" className="-ml-[6px] tema-anim tema-mecer" style={{ animationDelay: `${(i % 5) * 0.4}s` }}>
            <path d="M0 0 H12 L6 15 Z" fill={banderin[i % banderin.length]} stroke="#94a3b8" strokeWidth="0.5" />
          </svg>
        )}
      />

      {/* Faroles colgando (esquina superior derecha, bajo la barra) */}
      <div className="fixed right-6 top-16 z-30 pointer-events-none flex gap-3">
        {['#1e3a8a', '#ce1126', '#f8fafc'].map((c, i) => (
          <span key={i} className="block tema-anim tema-mecer origin-top" style={{ animationDelay: `${i * 0.7}s`, marginTop: i === 1 ? 10 : 0 }}>
            <Farol color={c} />
          </span>
        ))}
      </div>
    </>
  );
}

/* ----------------------- AMOR Y AMISTAD ----------------------- */

function Corazon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 22">
      <path
        d="M12 21 C 5 15.5 1 12 1 7 A 5.5 5.5 0 0 1 12 4.2 A 5.5 5.5 0 0 1 23 7 C 23 12 19 15.5 12 21 Z"
        fill={color}
      />
    </svg>
  );
}

function Amor() {
  const tonos = ['#fb7185', '#f43f5e', '#fda4af', '#e11d48', '#fecdd3'];
  return (
    <>
      <Bokeh colores={['#fda4af', '#fecdd3', '#f9a8d4', '#ffffff', '#fb7185', '#fbcfe8']} />

      {/* Corazoncitos que suben lento detrás de las tarjetas */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        {Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            className="absolute -bottom-8 tema-anim tema-subir"
            style={{
              left: `${azar(i, 20) * 100}%`,
              animationDuration: `${16 + azar(i, 21) * 14}s`,
              animationDelay: `${-azar(i, 22) * 30}s`,
              opacity: 0.35 + azar(i, 23) * 0.35,
            }}
          >
            <Corazon size={10 + Math.round(azar(i, 24) * 14)} color={tonos[i % tonos.length]} />
          </span>
        ))}
      </div>

      {/* Guirnalda de corazones que laten */}
      <Guirnalda
        n={24}
        pieza={(i) => (
          <span className="block -ml-[6px] tema-anim tema-latir" style={{ animationDelay: `${(i % 6) * 0.35}s` }}>
            <Corazon size={12} color={tonos[i % tonos.length]} />
          </span>
        )}
      />

      {/* Corazón grande y suave en la esquina */}
      <div className="fixed right-6 top-20 z-30 pointer-events-none tema-anim tema-latir" style={{ opacity: 0.8 }}>
        <Corazon size={30} color="#f43f5e" />
      </div>
    </>
  );
}

/* --------------------------- DÍA DE LA MADRE --------------------------- */

function Flor({ size, petalo, centro = '#facc15' }: { size: number; petalo: string; centro?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      {Array.from({ length: 6 }, (_, i) => (
        <ellipse key={i} cx="20" cy="10" rx="6.5" ry="10" fill={petalo} transform={`rotate(${i * 60} 20 20)`} opacity="0.92" />
      ))}
      <circle cx="20" cy="20" r="5.5" fill={centro} />
    </svg>
  );
}

function Petalo({ color }: { color: string }) {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16">
      <path d="M6 0 C 11 4 12 10 6 16 C 0 10 1 4 6 0 Z" fill={color} />
    </svg>
  );
}

function Ramo() {
  return (
    <svg width="74" height="92" viewBox="0 0 74 92">
      {/* Tallos y hojas */}
      <g stroke="#3f7d4a" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M37 92 Q 36 70 22 46" />
        <path d="M37 92 Q 38 66 37 36" />
        <path d="M37 92 Q 40 70 54 48" />
      </g>
      <path d="M30 70 Q 18 66 16 56 Q 28 58 30 70 Z" fill="#5a9a64" />
      <path d="M44 72 Q 58 68 60 58 Q 46 60 44 72 Z" fill="#5a9a64" />
      {/* Flores */}
      <g transform="translate(6 30)"><Flor size={30} petalo="#f9a8d4" /></g>
      <g transform="translate(23 14)"><Flor size={30} petalo="#f472b6" centro="#fde68a" /></g>
      <g transform="translate(40 32)"><Flor size={28} petalo="#e9d5ff" /></g>
    </svg>
  );
}

function Madre() {
  const petalos = ['#f9a8d4', '#fbcfe8', '#f472b6', '#e9d5ff', '#fecdd3'];
  return (
    <>
      <Bokeh colores={['#fbcfe8', '#e9d5ff', '#bbf7d0', '#fde68a', '#f9a8d4', '#ffffff']} />

      {/* Pétalos que caen girando, detrás de las tarjetas */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        {Array.from({ length: 20 }, (_, i) => (
          <span
            key={i}
            className="absolute -top-6 tema-anim tema-caer"
            style={{
              left: `${azar(i, 30) * 100}%`,
              animationDuration: `${15 + azar(i, 31) * 12}s`,
              animationDelay: `${-azar(i, 32) * 26}s`,
              opacity: 0.45 + azar(i, 33) * 0.35,
            }}
          >
            <Petalo color={petalos[i % petalos.length]} />
          </span>
        ))}
      </div>

      {/* Florecitas en la esquina superior, meciéndose */}
      <div className="fixed right-5 top-[68px] z-30 pointer-events-none flex gap-1">
        {['#f472b6', '#f9a8d4', '#e9d5ff'].map((c, i) => (
          <span key={i} className="block tema-anim tema-mecer" style={{ animationDelay: `${i * 0.6}s`, marginTop: i === 1 ? 8 : 0 }}>
            <Flor size={22} petalo={c} />
          </span>
        ))}
      </div>

      {/* Ramo pequeño abajo a la derecha */}
      <div className="fixed right-6 bottom-0 z-30 pointer-events-none tema-anim tema-mecer origin-bottom" style={{ opacity: 0.9 }}>
        <Ramo />
      </div>
    </>
  );
}

/* ----------------------------- SEMANA SANTA ----------------------------- */

function Palma({ espejo = false }: { espejo?: boolean }) {
  return (
    <svg width="90" height="120" viewBox="0 0 90 120" style={espejo ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M10 120 Q 30 70 78 8" stroke="#a16207" strokeWidth="2" fill="none" strokeLinecap="round" />
      {Array.from({ length: 11 }, (_, i) => {
        const t = 0.12 + i * 0.075;
        const x = 10 + (78 - 10) * t + 6 * Math.sin(t * 3);
        const y = 120 - 112 * t;
        const largo = 26 - i * 1.3;
        return (
          <g key={i}>
            <path d={`M${x} ${y} q ${-largo * 0.8} ${-largo * 0.2} ${-largo} ${largo * 0.45}`} stroke="#ca8a04" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d={`M${x} ${y} q ${largo * 0.5} ${largo * 0.15} ${largo * 0.75} ${largo * 0.7}`} stroke="#eab308" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}

function SemanaSanta() {
  return (
    <>
      <Bokeh colores={['#c4b5fd', '#fde68a', '#ddd6fe', '#facc15', '#a78bfa', '#ffffff']} />

      {/* Rayos de luz dorada que giran muy lento desde la esquina */}
      <div className="fixed -right-64 -top-64 w-[640px] h-[640px] -z-10 pointer-events-none tema-anim tema-girar" style={{ opacity: 0.22, filter: 'blur(2px)' }}>
        <svg viewBox="0 0 200 200" className="w-full h-full">
          {Array.from({ length: 16 }, (_, i) => (
            <path key={i} d="M100 100 L 96 0 L 104 0 Z" fill="#facc15" transform={`rotate(${i * 22.5} 100 100)`} opacity={i % 2 ? 0.5 : 0.9} />
          ))}
          <circle cx="100" cy="100" r="18" fill="#fde68a" />
        </svg>
      </div>

      {/* Destellos dorados que suben lento */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        {Array.from({ length: 16 }, (_, i) => (
          <span
            key={i}
            className="absolute -bottom-4 block rounded-full tema-anim tema-subir"
            style={{
              left: `${azar(i, 40) * 100}%`,
              width: `${4 + azar(i, 41) * 5}px`,
              height: `${4 + azar(i, 41) * 5}px`,
              background: i % 3 ? '#facc15' : '#c4b5fd',
              boxShadow: '0 0 8px 2px rgba(250, 204, 21, .55)',
              animationDuration: `${18 + azar(i, 42) * 14}s`,
              animationDelay: `${-azar(i, 43) * 30}s`,
              opacity: 0.6,
            }}
          />
        ))}
      </div>

      {/* Ramitos de palma (Domingo de Ramos) que se mecen en las esquinas inferiores */}
      <div className="fixed right-2 bottom-0 z-30 pointer-events-none tema-anim tema-mecer origin-bottom" style={{ opacity: 0.75 }}>
        <Palma />
      </div>
      <div className="fixed left-0 md:left-64 bottom-0 z-30 pointer-events-none tema-anim tema-mecer origin-bottom" style={{ opacity: 0.55, animationDelay: '1.2s' }}>
        <Palma espejo />
      </div>
    </>
  );
}
