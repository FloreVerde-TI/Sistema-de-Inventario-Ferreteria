-- =====================================================================
-- VerdeTrack · PASO 17: Historial de precios
-- Cada vez que cambia el precio de un producto (al editarlo, con
-- "Actualizar precios", con el importador o desde donde sea) la base
-- guarda: precio anterior, precio nuevo, quién y cuándo.
-- Lo hace un disparador: no depende de la pantalla y nadie puede saltárselo.
-- Dentro de begin/commit: si algo falla, NO se aplica nada.
-- =====================================================================
begin;

create table if not exists public.historial_precios (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  precio_anterior numeric,
  precio_nuevo numeric,
  usuario text,
  creado_en timestamptz not null default now()
);
create index if not exists historial_precios_producto_idx on public.historial_precios (producto_id, creado_en desc);

create or replace function public.registrar_cambio_precio()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_usuario text;
begin
  if new.precio is distinct from old.precio then
    select p.full_name || ' — ' || p.role into v_usuario from public.profiles p where p.id = auth.uid();
    insert into public.historial_precios (producto_id, precio_anterior, precio_nuevo, usuario)
    values (new.id, old.precio, new.precio, coalesce(v_usuario, 'Sistema'));
  end if;
  return new;
end $$;

drop trigger if exists tr_historial_precios on public.productos;
create trigger tr_historial_precios
  after update of precio on public.productos
  for each row execute function public.registrar_cambio_precio();

-- Permisos: el personal lo ve; nadie lo edita ni lo borra (es historial)
alter table public.historial_precios enable row level security;
drop policy if exists "Historial precios: ver" on public.historial_precios;
create policy "Historial precios: ver" on public.historial_precios
  for select to authenticated using (true);

commit;

-- VERIFICACIÓN (solo lectura): debe salir la tabla con 0 filas y el disparador
select count(*) as cambios_registrados from public.historial_precios;
select tgname from pg_trigger where tgrelid = 'public.productos'::regclass and tgname = 'tr_historial_precios';
