-- =====================================================================
-- VerdeTrack · PASO 15: Límite de cotizaciones (anti-spam)
-- Una misma persona puede enviar máximo 3 cotizaciones cada 10 minutos.
-- "Misma persona" = mismo correo, o mismo teléfono, o misma conexión (IP).
-- Al pasarse, la base RECHAZA la 4.ª con el mensaje:
--   "LIMITE_COTIZACIONES: Espere N minuto(s) para enviar otra cotización."
-- (Si envía 3 seguidas, debe esperar unos 8–10 minutos.)
-- De la IP NO se guarda la dirección: solo una huella (hash) para comparar.
-- Las cotizaciones repetidas (script 14) se ignoran antes y no cuentan.
-- Dentro de begin/commit: si algo falla, NO se aplica nada.
-- =====================================================================
begin;

alter table public.cotizaciones add column if not exists origen_huella text;
create index if not exists cotizaciones_fecha_idx on public.cotizaciones (fecha desc);

create or replace function public.limitar_cotizaciones()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_headers json;
  v_ip text;
  v_correo text := lower(trim(coalesce(new.correo, '')));
  v_tel text := regexp_replace(coalesce(new.telefono, ''), '\D', '', 'g');
  v_cuantas int;
  v_primera timestamptz;
  v_minutos int;
begin
  -- IP de quien envía (la pone Supabase en los encabezados de la petición)
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(trim(split_part(coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-forwarded-for', ''), ',', 1)), '');
  new.origen_huella := case when v_ip is null then null else md5('ferrestock:' || v_ip) end;

  -- Cotizaciones de la misma persona en los últimos 10 minutos
  select count(*), min(fecha) into v_cuantas, v_primera
  from (
    select c.fecha from public.cotizaciones c
    where c.fecha > now() - interval '10 minutes'
      and (
        (v_correo <> '' and lower(trim(coalesce(c.correo, ''))) = v_correo)
        or (length(v_tel) >= 8 and regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g') = v_tel)
        or (new.origen_huella is not null and c.origen_huella = new.origen_huella)
      )
    order by c.fecha desc
    limit 3
  ) ultimas;

  if v_cuantas >= 3 then
    v_minutos := greatest(1, ceil(extract(epoch from (v_primera + interval '10 minutes' - now())) / 60)::int);
    raise exception 'LIMITE_COTIZACIONES: Espere % minuto(s) para enviar otra cotización.', v_minutos
      using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists tr_limite_cotizaciones on public.cotizaciones;
create trigger tr_limite_cotizaciones
  before insert on public.cotizaciones
  for each row execute function public.limitar_cotizaciones();

commit;

-- VERIFICACIÓN (solo lectura): deben salir aviso_cotizacion, tr_evitar_cotizacion_duplicada y tr_limite_cotizaciones
select tgname from pg_trigger where tgrelid = 'public.cotizaciones'::regclass and not tgisinternal order by tgname;
