import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FerreStock — Sistema de Gestión de Inventario',
  description: 'Gestión de inventario para ferretería',
};

// Se ejecuta antes de pintar la página para evitar el parpadeo blanco en modo oscuro
const themeScript =
  "try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
