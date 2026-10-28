import { Suspense } from 'react';
import AdminLayout from '@/components/AdminLayout';

// Menú, barra superior y permisos para todas las pantallas del panel.
// Se carga una sola vez: al cambiar de pantalla ya no vuelve a cargar el perfil.
// Suspense: el menú lee la dirección actual, que en Next 16 solo existe al abrir la página.
export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
        </div>
      }
    >
      <AdminLayout>{children}</AdminLayout>
    </Suspense>
  );
}
