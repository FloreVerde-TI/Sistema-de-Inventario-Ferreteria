-- =====================================================================
-- VerdeTrack · PASO 12: Cotizaciones + Foto de documento + Precios en masa
-- Todo va dentro de begin/commit: si algo falla, NO se aplica nada.
--
-- A) COTIZACIONES
--    - Columnas para guardar la respuesta y quién respondió.
--    - Permiso nuevo "cotizaciones" (se les da a los roles que ya
--      aprueban pedidos; luego se puede quitar/poner en Usuarios > Roles).
--    - La web (sin sesión) solo puede CREAR cotizaciones nuevas.
--    - Tiempo real (aviso al instante en el panel).
-- B) FOTO / PDF DEL DOCUMENTO en entradas y salidas
--    - Bucket PRIVADO "documentos" (las facturas NO son públicas).
-- C) ACTUALIZAR PRECIOS EN MASA
--    - Función que cambia varios precios de una vez, respetando permisos.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- A) COTIZACIONES
-- ---------------------------------------------------------------------
alter table public.cotizaciones
  add column if not exists respuesta text,
  add column if not exists respondido_por uuid,
  add column if not exists respondido_nombre text,
  add column if not exists respondido_en timestamptz;

-- Permiso nuevo para quienes hoy aprueban pedidos
update public.roles
set permisos = array_append(permisos, 'cotizaciones')
where 'pedidos_revisar' = any(permisos) and not ('cotizaciones' = any(permisos));

-- Bitácora: si tenía una lista fija de "entidad" o "accion", se quita
-- para poder registrar "cotizacion", "responder" y "cerrar".
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.actividad'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%entidad%' or pg_get_constraintdef(oid) ilike '%accion%')
  loop
    execute format('alter table public.actividad drop constraint %I', r.conname);
  end loop;
end $$;

-- Políticas
drop policy if exists "Cotizaciones: la web crea" on public.cotizaciones;
drop policy if exists "Cotizaciones: personal ve" on public.cotizaciones;
drop policy if exists "Cotizaciones: personal gestiona" on public.cotizaciones;

create policy "Cotizaciones: la web crea" on public.cotizaciones
  for insert to anon, authenticated
  with check (
    coalesce(lower(estado), 'nueva') = 'nueva'
    and respuesta is null and respondido_por is null
    and respondido_nombre is null and respondido_en is null
  );
create policy "Cotizaciones: personal ve" on public.cotizaciones
  for select to authenticated using (public.tiene_permiso('cotizaciones'));
create policy "Cotizaciones: personal gestiona" on public.cotizaciones
  for update to authenticated
  using (public.tiene_permiso('cotizaciones'))
  with check (public.tiene_permiso('cotizaciones'));

-- Tiempo real
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cotizaciones'
  ) then
    alter publication supabase_realtime add table public.cotizaciones;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- B) DOCUMENTO ADJUNTO EN MOVIMIENTOS
-- ---------------------------------------------------------------------
alter table public.movimientos add column if not exists documento_path text;

-- Bucket privado: máx. 5 MB, solo fotos (webp/jpg) y PDF
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 5242880, array['image/webp', 'image/jpeg', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Sube documentos de entradas quien registra entradas, y de salidas quien registra salidas
create or replace function public.puede_subir_documento(p_nombre text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_nombre like 'entradas/%' then public.tiene_permiso('entradas')
    when p_nombre like 'salidas/%' then public.tiene_permiso('salidas')
    else false
  end;
$$;
revoke execute on function public.puede_subir_documento(text) from public, anon;
grant execute on function public.puede_subir_documento(text) to authenticated;

drop policy if exists "Documentos: ver" on storage.objects;
drop policy if exists "Documentos: subir" on storage.objects;
-- Ver: todo el personal con sesión (con enlace temporal). Nadie edita ni borra: es historial.
create policy "Documentos: ver" on storage.objects
  for select to authenticated using (bucket_id = 'documentos');
create policy "Documentos: subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and public.puede_subir_documento(name));

-- ---------------------------------------------------------------------
-- C) PRECIOS EN MASA
-- SECURITY INVOKER: corre con los permisos de quien la llama (RLS aplica).
-- Recibe: [{"id": "...", "precio": 1234.5}, ...]  (máx. 1000 por llamada)
-- ---------------------------------------------------------------------
create or replace function public.actualizar_precios_lote(cambios jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if not public.tiene_permiso('productos_editar') then
    raise exception 'No tienes permiso para editar precios.';
  end if;
  if jsonb_typeof(cambios) <> 'array' or jsonb_array_length(cambios) > 1000 then
    raise exception 'La lista de cambios no es válida.';
  end if;

  update public.productos p
  set precio = round((c->>'precio')::numeric, 2)
  from jsonb_array_elements(cambios) c
  where p.id = (c->>'id')::uuid
    and (c->>'precio')::numeric >= 0;

  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.actualizar_precios_lote(jsonb) from public, anon;
grant execute on function public.actualizar_precios_lote(jsonb) to authenticated;

commit;


-- =====================================================================
-- VERIFICACIÓN (SOLO LECTURA) — corre cada consulta por separado
-- =====================================================================
-- 1) Roles con el permiso nuevo (deberían salir los que aprueban pedidos)
select nombre, permisos from public.roles where 'cotizaciones' = any(permisos);

-- 2) Columnas nuevas (deben salir 5 filas)
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'cotizaciones' and column_name in ('respuesta','respondido_por','respondido_nombre','respondido_en'))
    or (table_name = 'movimientos' and column_name = 'documento_path'));

-- 3) Bucket privado (public debe ser false)
select id, public, file_size_limit from storage.buckets where id = 'documentos';

-- 4) Tiempo real (deben salir pedidos y cotizaciones)
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
