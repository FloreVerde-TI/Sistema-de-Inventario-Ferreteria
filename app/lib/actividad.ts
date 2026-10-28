import { supabase } from '@/lib/supabase';

export type EntidadActividad = 'producto' | 'pedido' | 'usuario' | 'rol' | 'configuracion';

/**
 * Guarda una acción en la Bitácora.
 * El usuario ("Nombre — Rol") y la fecha los completa la base de datos.
 * Si falla, no detiene la acción principal (solo avisa en la consola).
 */
export async function registrarActividad(a: {
  accion: string;
  entidad: EntidadActividad;
  entidad_id?: string | null;
  detalle?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('actividad').insert({
    accion: a.accion,
    entidad: a.entidad,
    entidad_id: a.entidad_id ?? null,
    detalle: a.detalle ?? null,
  });
  if (error) console.error('No se pudo registrar en la bitácora:', error.message);
}

/** "Nombre — Rol" del usuario con sesión (para movimientos.usuario, etc.) */
export async function etiquetaUsuario(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'Desconocido';
  const { data } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!data) return user.email ?? 'Desconocido';
  return `${data.full_name} — ${data.role}`;
}
