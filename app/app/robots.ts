import type { MetadataRoute } from 'next';

// robots.txt: le pide a todos los buscadores que NO recorran el inventario
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
