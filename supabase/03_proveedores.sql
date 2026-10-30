-- =====================================================================
-- VerdeTrack · PASO 3: Proveedores
-- Tabla de proveedores fijos + columna proveedor_id en productos.
-- Correr TODO de una vez. Dentro de begin/commit: si falla, no se aplica nada.
-- =====================================================================
begin;

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  telefono text,
  correo text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- No se repiten nombres (sin importar mayúsculas)
create unique index if not exists proveedores_nombre_unico on public.proveedores (lower(trim(nombre)));

-- Si se borra un proveedor, el producto queda "sin proveedor" (no se borra)
alter table public.productos
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null;

create index if not exists productos_proveedor_idx on public.productos (proveedor_id);

-- Permisos: todos con sesión leen; crean/editan quienes crean o editan productos
alter table public.proveedores enable row level security;
drop policy if exists "Proveedores: lectura" on public.proveedores;
drop policy if exists "Proveedores: crear" on public.proveedores;
drop policy if exists "Proveedores: editar" on public.proveedores;
drop policy if exists "Proveedores: borrar" on public.proveedores;

create policy "Proveedores: lectura" on public.proveedores
  for select to authenticated using (true);
create policy "Proveedores: crear" on public.proveedores
  for insert to authenticated
  with check (public.tiene_permiso('productos_crear') or public.tiene_permiso('productos_editar'));
create policy "Proveedores: editar" on public.proveedores
  for update to authenticated
  using (public.tiene_permiso('productos_crear') or public.tiene_permiso('productos_editar'))
  with check (public.tiene_permiso('productos_crear') or public.tiene_permiso('productos_editar'));
create policy "Proveedores: borrar" on public.proveedores
  for delete to authenticated
  using (public.tiene_permiso('productos_eliminar'));

commit;

-- VERIFICACIÓN (solo lectura): debe salir la columna proveedor_id
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'productos' and column_name = 'proveedor_id';
