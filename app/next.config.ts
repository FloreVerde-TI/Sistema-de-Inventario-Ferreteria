import type { NextConfig } from "next";

// Cabeceras de seguridad para TODAS las páginas del inventario
const seguridad = [
  // Que Google y otros buscadores no muestren el inventario en sus resultados
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  // Nadie puede meter el inventario dentro de otra página (evita engaños tipo "clickjacking")
  { key: "X-Frame-Options", value: "DENY" },
  // El navegador no "adivina" tipos de archivo (evita ejecutar archivos disfrazados)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Al abrir un enlace externo no se envía la dirección completa de la página
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Cámara solo para el propio sistema (escáner y foto de documentos); micrófono y ubicación apagados
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  // Siempre por HTTPS
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false, // no anunciar que el sitio usa Next.js
  async headers() {
    return [{ source: "/:path*", headers: seguridad }];
  },
};

export default nextConfig;
