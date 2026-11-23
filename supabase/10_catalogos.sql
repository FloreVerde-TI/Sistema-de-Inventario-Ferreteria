-- =====================================================================
-- VerdeTrack · PASO 10: Deshabilitar categorías (catálogos)
-- Dentro de begin/commit: si algo falla, NO se aplica nada.
--
-- Categorías: columna "activa" para deshabilitarlas (los proveedores ya
-- tienen "activo"). Deshabilitar = editar productos; borrar = eliminar productos.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- CATEGORÍAS
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
-- 1) Columna nueva (debe salir 1 fila)
select table_name, column_name from information_schema.columns
where table_schema = 'public' and table_name = 'categorias' and column_name = 'activa';

-- 2) Políticas de categorías
select policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename = 'categorias' order by cmd;
