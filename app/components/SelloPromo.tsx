import React from 'react';

// Sello con picos (como los de "OFERTA" de las tiendas). Se dibuja con SVG.
// La web tiene el mismo diseño en components/ui/SelloPromo.tsx.

const PICOS = 16;
const PUNTOS = Array.from({ length: PICOS * 2 }, (_, i) => {
  const r = i % 2 === 0 ? 50 : 42;
  const a = (Math.PI * i) / PICOS - Math.PI / 2;
  return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

/** Parte el texto en máximo 3 renglones cortos. */
function renglones(texto: string): string[] {
  const palabras = texto.trim().split(/\s+/);
  const out: string[] = [];
  for (const p of palabras) {
    const ultimo = out[out.length - 1];
    if (ultimo && (ultimo + ' ' + p).length <= 11) out[out.length - 1] = ultimo + ' ' + p;
    else out.push(p);
  }
  return out.slice(0, 3);
}

export default function SelloPromo({
  texto,
  extra,
  color,
  size = 96,
  className = '',
}: {
  texto: string;
  extra?: string; // segundo dato, más grande (ej. "20%")
  color: string;
  size?: number;
  className?: string;
}) {
  const lineas = renglones(texto);
  const largo = Math.max(...lineas.map((l) => l.length), extra ? extra.length : 0);
  const fuente = Math.min(15, 88 / Math.max(largo, 4) * 1.15);
  const total = lineas.length + (extra ? 1.5 : 0);
  const inicio = 50 - ((total - 1) * fuente * 1.05) / 2;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={[texto, extra].filter(Boolean).join(' ')}
      className={className}
    >
      <polygon points={PUNTOS} fill={color} />
      <circle cx="50" cy="50" r="37" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" strokeDasharray="2 2" />
      <text
        x="50"
        textAnchor="middle"
        fill="#fff"
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
        style={{ letterSpacing: '0.02em' }}
      >
        {lineas.map((l, i) => (
          <tspan key={i} x="50" y={inicio + i * fuente * 1.05} fontSize={fuente} dominantBaseline="middle">
            {l}
          </tspan>
        ))}
        {extra && (
          <tspan x="50" y={inicio + (lineas.length + 0.25) * fuente * 1.05} fontSize={fuente * 1.6} dominantBaseline="middle">
            {extra}
          </tspan>
        )}
      </text>
    </svg>
  );
}
