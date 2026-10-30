-- =====================================================================
-- VerdeTrack · PASO 11: Pedidos web en TIEMPO REAL
-- Activa Supabase Realtime en la tabla pedidos, para que el panel se
-- entere al instante cuando llega, se aprueba o se rechaza un pedido.
-- No cambia datos ni permisos: Realtime respeta las mismas reglas (RLS),
-- así que solo el personal con sesión recibe los avisos; la web (anon) no.
-- =====================================================================
begin;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos'
  ) then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end $$;

commit;

-- VERIFICACIÓN (solo lectura): debe salir una fila con "pedidos"
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'pedidos';
