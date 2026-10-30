-- =====================================================================
-- VerdeTrack · PASO 13: Quién reabrió una cotización + deshabilitar categorías
-- Dentro de begin/commit: si algo falla, NO se aplica nada.
--
-- A) Cotizaciones: guarda quién la reabrió y cuándo (igual que pedidos).
-- B) Categorías: columna "activa" para deshabilitarlas (los proveedores ya
--    tienen "activo"). Deshabilitar = editar productos; borrar = eliminar productos.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- A) COTIZACIONES
-- ---------------------------------------------------------------------
alter table public.cotizaciones
  add column if not exists reabierto_por uuid,
  add column if not exists reabierto_nombre text,
  add column if not exists reabierto_en timestamptz;

-- La web sigue pudiendo crear solo cotizaciones nuevas y "limpias"
drop policy if exists "Cotizaciones: la web crea" on public.cotizaciones;
create policy "Cotizaciones: la web crea" on public.cotizaciones
  for insert to anon, authenticated
  with check (
    coalesce(lower(estado), 'nueva') = 'nueva'
    and respuesta is null and respondido_por is null
    and respondido_nombre is null and respondido_en is null
    and reabierto_por is null and reabierto_nombre is null and reabierto_en is null
  );

-- ---------------------------------------------------------------------
-- B) CATEGORÍAS
-- ---------------------------------------------------------------------
alter table public.categorias add column if not exists activa boolean not null default true;

drop policy if exists "Categorias: deshabilitar" on public.categorias;
drop policy if exists "Categorias: borrar" on public.categorias;
create policy "Categorias: deshabilitar" on public.categorias
  for update to authenticated
  using (public.tiene_permiso('productos_editar'))
  with check (public.tiene_permiso('productos_editar'));
create policy "Categorias: borrar" on public.categorias
  for delete to authenticated
  using (public.tiene_permiso('productos_eliminar'));

commit;


-- =====================================================================
-- VERIFICACIÓN (SOLO LECTURA) — corre cada consulta por separado
-- =====================================================================
-- 1) Columnas nuevas (deben salir 4 filas)
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'cotizaciones' and column_name in ('reabierto_por','reabierto_nombre','reabierto_en'))
    or (table_name = 'categorias' and column_name = 'activa'));

-- 2) Políticas de categorías
select policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename = 'categorias' order by cmd;
