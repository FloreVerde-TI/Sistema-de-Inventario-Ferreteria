-- =====================================================================
-- VerdeTrack · PASO 9: Varios códigos de barras por producto
-- productos.codigo_barras sigue siendo el código PRINCIPAL (web, reportes, importador).
-- La tabla codigos_barras guarda los códigos ADICIONALES (sin límite).
-- Un mismo código nunca puede pertenecer a dos productos (lo controla la base).
-- =====================================================================
begin;

create table if not exists public.codigos_barras (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  codigo text not null check (length(trim(codigo)) > 0),
  created_at timestamptz not null default now()
);
create unique index if not exists codigos_barras_codigo_unico on public.codigos_barras (codigo);
create index if not exists codigos_barras_producto_idx on public.codigos_barras (producto_id);

-- Evita que un código esté a la vez como principal y como adicional
create or replace function public.validar_codigo_barras_unico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'codigos_barras' then
    if exists (select 1 from public.productos where codigo_barras = new.codigo) then
      raise exception 'CODIGO_DUPLICADO: el código % ya está registrado como código principal', new.codigo;
    end if;
  elsif coalesce(new.codigo_barras, '') <> '' then
    if exists (select 1 from public.codigos_barras where codigo = new.codigo_barras) then
      raise exception 'CODIGO_DUPLICADO: el código % ya está registrado como código adicional', new.codigo_barras;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tr_codigos_barras_unico on public.codigos_barras;
create trigger tr_codigos_barras_unico
  before insert or update on public.codigos_barras
  for each row execute function public.validar_codigo_barras_unico();

drop trigger if exists tr_productos_codigo_unico on public.productos;
create trigger tr_productos_codigo_unico
  before insert or update of codigo_barras on public.productos
  for each row execute function public.validar_codigo_barras_unico();

-- Permisos: el personal los ve; agregan/quitan quienes crean o editan productos
alter table public.codigos_barras enable row level security;
drop policy if exists "Codigos: ver" on public.codigos_barras;
drop policy if exists "Codigos: gestionar" on public.codigos_barras;
create policy "Codigos: ver" on public.codigos_barras
  for select to authenticated using (true);
create policy "Codigos: gestionar" on public.codigos_barras
  for all to authenticated
  using (public.tiene_permiso('productos_crear') or public.tiene_permiso('productos_editar'))
  with check (public.tiene_permiso('productos_crear') or public.tiene_permiso('productos_editar'));

commit;

-- VERIFICACIÓN (solo lectura): debe salir la tabla con 0 filas
select count(*) as codigos_adicionales from public.codigos_barras;
