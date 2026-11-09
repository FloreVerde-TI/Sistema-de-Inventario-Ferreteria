import { useEffect } from 'react';

/**
 * Next 16 deja las pantallas "guardadas" al cambiar de menú: al volver,
 * seguirían los avisos de éxito o error de la vez anterior.
 * Este gancho los borra al salir de la pantalla.
 * Uso: useLimpiarAlSalir(setExito, setError);
 */
export function useLimpiarAlSalir(...limpiar: ((v: null) => void)[]) {
  useEffect(() => {
    return () => limpiar.forEach((f) => f(null));
    // Los "set" de useState no cambian: basta con correrlo una vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
