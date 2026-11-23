-- =====================================================================
-- VerdeTrack · PASO 6: SEGURIDAD (políticas reales)
-- Quita las políticas abiertas (dev_all_*, "Admin: Gestión total", etc.)
-- y crea las correctas usando los permisos de cada rol.
--
-- El stock lo mueven los triggers (SECURITY DEFINER), no el cliente.
--
-- Dentro de begin/commit: si algo falla, NO se aplica nada.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0) Borrar TODAS las políticas viejas de estas tablas
-- (categorias, roles, profiles, settings y proveedores ya están bien)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('productos','movimientos')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 1) PRODUCTOS
-- ---------------------------------------------------------------------
create policy "Productos: personal ve todos" on public.productos
  for select to authenticated using (true);
create policy "Productos: crear" on public.productos
  for insert to authenticated with check (public.tiene_permiso('productos_crear'));
create policy "Productos: editar" on public.productos
  for update to authenticated
  using (public.tiene_permiso('productos_editar') or public.tiene_permiso('productos_deshabilitar'))
  with check (public.tiene_permiso('productos_editar') or public.tiene_permiso('productos_deshabilitar'));
create policy "Productos: eliminar" on public.productos
  for delete to authenticated using (public.tiene_permiso('productos_eliminar'));

-- ---------------------------------------------------------------------
-- 2) MOVIMIENTOS (panel). Sin editar ni borrar: el historial no se altera.
-- ---------------------------------------------------------------------
create policy "Movimientos: personal ve todos" on public.movimientos
  for select to authenticated using (true);
create policy "Movimientos: registrar según permiso" on public.movimientos
  for insert to authenticated
  with check (
    origen = 'panel' and (
      (tipo = 'entrada' and (public.tiene_permiso('entradas')
                             or (motivo = 'Stock inicial' and public.tiene_permiso('productos_crear'))))
      or (tipo = 'salida' and public.tiene_permiso('salidas'))
    )
  );

commit;


-- =====================================================================
-- VERIFICACIÓN (SOLO LECTURA): ya no debe salir ninguna "dev_all" ni "Admin: Gestión total"
-- =====================================================================
select tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public'
order by tablename, policyname;
