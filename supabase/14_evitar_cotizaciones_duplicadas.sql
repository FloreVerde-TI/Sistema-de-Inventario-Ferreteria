-- =====================================================================
-- VerdeTrack · PASO 14: Evitar cotizaciones duplicadas
-- Si entra una cotización con el MISMO correo y el MISMO mensaje que otra
-- de los últimos 2 minutos, la base la ignora en silencio (la web no ve
-- ningún error). Así no hay duplicados ni doble aviso al correo.
-- Dentro de begin/commit: si algo falla, NO se aplica nada.
-- =====================================================================
begin;

create or replace function public.evitar_cotizacion_duplicada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.cotizaciones c
    where lower(trim(coalesce(c.correo, ''))) = lower(trim(coalesce(new.correo, '')))
      and trim(coalesce(c.mensaje, '')) = trim(coalesce(new.mensaje, ''))
      and coalesce(c.fecha, now()) > now() - interval '2 minutes'
  ) then
    return null; -- se ignora la repetida
  end if;
  return new;
end $$;

drop trigger if exists tr_evitar_cotizacion_duplicada on public.cotizaciones;
create trigger tr_evitar_cotizacion_duplicada
  before insert on public.cotizaciones
  for each row execute function public.evitar_cotizacion_duplicada();

commit;

-- VERIFICACIÓN (solo lectura): debe salir el disparador
select tgname from pg_trigger where tgrelid = 'public.cotizaciones'::regclass and not tgisinternal;
