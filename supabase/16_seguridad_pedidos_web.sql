-- =====================================================================
-- VerdeTrack · PASO 16: Seguridad de pedidos web
-- La web ya crea los pedidos con la función crear_pedido_web (la hizo
-- Aletejo y está muy bien: toma los precios de la base, limita cantidades,
-- revisa stock y máximo 5 pendientes por teléfono). Esto la complementa:
--
-- A) Pedido DUPLICADO: mismo teléfono y mismo total en menos de 2 minutos
--    (doble clic) → se rechaza con un mensaje y NO se descuenta stock dos veces.
-- B) Límite por CONEXIÓN (IP): máximo 5 pedidos pendientes por hora desde la
--    misma conexión, aunque cambien el teléfono (evita vaciar el stock con bots).
--    De la IP solo se guarda una huella (hash), no la dirección.
-- C) Se quitan los permisos viejos de insertar pedidos/detalle directo
--    (la web ya no los usa: todo pasa por crear_pedido_web).
-- Dentro de begin/commit: si algo falla, NO se aplica nada.
-- =====================================================================
begin;

alter table public.pedidos add column if not exists origen_huella text;

create or replace function public.proteger_pedido_web()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_headers json;
  v_ip text;
  v_tel text := regexp_replace(coalesce(new.telefono, ''), '\D', '', 'g');
  v_n int;
begin
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(trim(split_part(coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-forwarded-for', ''), ',', 1)), '');
  new.origen_huella := case when v_ip is null then null else md5('ferrestock:' || v_ip) end;

  -- A) Duplicado (doble clic)
  if exists (
    select 1 from public.pedidos p
    where regexp_replace(coalesce(p.telefono, ''), '\D', '', 'g') = v_tel
      and p.total = new.total
      and p.fecha > now() - interval '2 minutes'
  ) then
    raise exception 'Ya recibimos este pedido hace un momento. Revisa tu WhatsApp o espera 2 minutos para enviarlo de nuevo.';
  end if;

  -- B) Límite por conexión
  if new.origen_huella is not null then
    select count(*) into v_n from public.pedidos p
    where p.origen_huella = new.origen_huella
      and lower(coalesce(p.estado, 'pendiente')) = 'pendiente'
      and p.fecha > now() - interval '1 hour';
    if v_n >= 5 then
      raise exception 'Se enviaron varios pedidos desde esta conexión. Espera a que te contactemos por WhatsApp.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists tr_proteger_pedido_web on public.pedidos;
create trigger tr_proteger_pedido_web
  before insert on public.pedidos
  for each row execute function public.proteger_pedido_web();

-- C) Ya nadie inserta pedidos ni detalle directo (todo va por crear_pedido_web)
drop policy if exists "Pedidos: la web crea pendientes" on public.pedidos;
drop policy if exists "Detalle: la web agrega a su pedido" on public.detalle_pedido;

commit;

-- VERIFICACIÓN (solo lectura)
-- 1) Debe salir tr_proteger_pedido_web
select tgname from pg_trigger where tgrelid = 'public.pedidos'::regclass and not tgisinternal order by tgname;
-- 2) Ya no deben salir políticas INSERT en pedidos ni detalle_pedido
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('pedidos', 'detalle_pedido') order by tablename, cmd;
