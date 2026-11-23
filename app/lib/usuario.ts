import { supabase } from '@/lib/supabase';

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
