-- =====================================================================
-- PASO 24: TARJETAS DE PROMOCIONES TAMBIÉN PARA EL JEFE
-- Configuración solo la puede editar quien tiene "config_editar"
-- (Administrador). El Jefe tiene "promociones": con esta función puede
-- guardar SOLO las tarjetas e interruptores de promociones
-- (settings.sellos_promo), nunca los datos de la empresa.
-- Dentro de begin/commit.
-- =====================================================================
begin;

create or replace function public.guardar_sellos_promo(p_sellos jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.tiene_permiso('promociones') or public.tiene_permiso('config_editar')) then
    raise exception 'No tienes permiso para cambiar las tarjetas de promociones.';
  end if;
  if p_sellos is null or jsonb_typeof(p_sellos) <> 'object' or length(p_sellos::text) > 5000 then
    raise exception 'Datos de tarjetas no válidos.';
  end if;
  update public.settings set sellos_promo = p_sellos where tienda_id = public.mi_tienda();
end $$;

revoke execute on function public.guardar_sellos_promo(jsonb) from public, anon;
grant execute on function public.guardar_sellos_promo(jsonb) to authenticated;

commit;


-- VERIFICACIÓN (SOLO LECTURA): debe salir la función
select proname from pg_proc where proname = 'guardar_sellos_promo';
