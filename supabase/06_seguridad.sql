-- =====================================================================
-- VerdeTrack · PASO 6: SEGURIDAD (políticas reales)
-- Quita las políticas abiertas (dev_all_*, "Admin: Gestión total", etc.)
-- y crea las correctas usando los permisos de cada rol.
--
-- La WEB sigue funcionando SIN cuentas:
--   anónimos pueden VER productos en web y categorías,
--   y CREAR pedidos, su detalle y cotizaciones. Nada más.
-- El stock lo mueven los triggers (SECURITY DEFINER), no el cliente.
--
-- Dentro de begin/commit: si algo falla, NO se aplica nada.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0) Borrar TODAS las políticas viejas de estas tablas
-- (categorias, roles, profiles, settings, actividad y proveedores ya están bien)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('productos','movimientos','movements','pedidos','detalle_pedido','cotizaciones','imagenes_producto')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 1) PRODUCTOS
-- ---------------------------------------------------------------------
create policy "Productos: web ve los publicados" on public.productos
  for select to anon using (activo = true);
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

-- 3) MOVEMENTS (solo la usan los triggers de pedidos web): sin políticas = nadie desde fuera.

-- ---------------------------------------------------------------------
-- 4) PEDIDOS
-- ---------------------------------------------------------------------
create policy "Pedidos: la web crea pendientes" on public.pedidos
  for insert to anon, authenticated
  with check (
    (estado is null or lower(estado) = 'pendiente')
    and revisado_por is null and reabierto_por is null
  );
create policy "Pedidos: personal ve todos" on public.pedidos
  for select to authenticated using (true);
create policy "Pedidos: revisar o reabrir" on public.pedidos
  for update to authenticated
  using (public.tiene_permiso('pedidos_revisar') or public.tiene_permiso('pedidos_reabrir'))
  with check (public.tiene_permiso('pedidos_revisar') or public.tiene_permiso('pedidos_reabrir'));

-- ---------------------------------------------------------------------
-- 5) DETALLE DEL PEDIDO: solo se agregan productos a un pedido pendiente
--    creado hace menos de 30 minutos (la web lo hace al instante).
-- ---------------------------------------------------------------------
create or replace function public.pedido_recien_creado(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pedidos p
    where p.id = p_id
      and (p.estado is null or lower(p.estado) = 'pendiente')
      and coalesce(p.fecha, now()) > now() - interval '30 minutes'
  );
$$;
grant execute on function public.pedido_recien_creado(uuid) to anon, authenticated;

create policy "Detalle: la web agrega a su pedido" on public.detalle_pedido
  for insert to anon, authenticated
  with check (cantidad > 0 and public.pedido_recien_creado(pedido_id));
create policy "Detalle: personal ve todos" on public.detalle_pedido
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 6) COTIZACIONES: la web crea; las ve y gestiona quien revisa pedidos
-- ---------------------------------------------------------------------
create policy "Cotizaciones: la web crea" on public.cotizaciones
  for insert to anon, authenticated with check (true);
create policy "Cotizaciones: personal ve" on public.cotizaciones
  for select to authenticated using (public.tiene_permiso('pedidos_revisar'));
create policy "Cotizaciones: personal gestiona" on public.cotizaciones
  for update to authenticated
  using (public.tiene_permiso('pedidos_revisar'))
  with check (public.tiene_permiso('pedidos_revisar'));

-- ---------------------------------------------------------------------
-- 7) IMÁGENES DE PRODUCTO (tabla, hoy vacía)
-- ---------------------------------------------------------------------
create policy "Imágenes: todos ven" on public.imagenes_producto
  for select to anon, authenticated using (true);
create policy "Imágenes: gestionar" on public.imagenes_producto
  for all to authenticated
  using (public.tiene_permiso('productos_crear') or public.tiene_permiso('productos_editar'))
  with check (public.tiene_permiso('productos_crear') or public.tiene_permiso('productos_editar'));

commit;


-- =====================================================================
-- VERIFICACIÓN (SOLO LECTURA): ya no debe salir ninguna "dev_all" ni "Admin: Gestión total"
-- =====================================================================
select tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public'
order by tablename, policyname;
