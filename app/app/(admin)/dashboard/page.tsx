import DashboardCliente from './DashboardCliente';

// Esta pantalla depende de la sesión y de datos en vivo: no se puede "pre-armar"
// para la navegación instantánea. Así Next.js deja de mostrar ese aviso.
export const instant = false;

export default function DashboardPage() {
  return <DashboardCliente />;
}
