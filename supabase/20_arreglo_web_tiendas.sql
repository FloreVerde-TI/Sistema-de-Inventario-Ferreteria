-- =====================================================================
-- PASO 20: ARREGLO — LA WEB VUELVE A VER LOS PRODUCTOS
-- Qué pasó: en el paso 18 la web (sin sesión) solo puede ver productos de
-- "tiendas con web", pero para saber cuáles son tiene que leer la tabla
-- "tiendas"… y la web NO tiene permiso de leerla. Resultado: 0 productos,
-- 0 categorías, y las cotizaciones de la web también fallarían.
-- Arreglo: una función segura que responde "¿esta tienda tiene web?" sin
-- abrirle la tabla "tiendas" a la web.
--
-- ⚠️ Cambia permisos en la base (solo de la web). Dentro de begin/commit.
-- =====================================================================
begin;

create or replace function public.tienda_tiene_web(p_tienda uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tiendas where id = p_tienda and tiene_web);
$$;
revoke execute on function public.tienda_tiene_web(uuid) from public;
grant execute on function public.tienda_tiene_web(uuid) to anon, authenticated;

drop policy if exists "Tienda: web solo tiendas con web" on public.productos;
create policy "Tienda: web solo tiendas con web" on public.productos as restrictive for select to anon
  using (public.tienda_tiene_web(tienda_id));

drop policy if exists "Tienda: web solo tiendas con web" on public.categorias;
create policy "Tienda: web solo tiendas con web" on public.categorias as restrictive for select to anon
  using (public.tienda_tiene_web(tienda_id));

drop policy if exists "Tienda: web solo tiendas con web" on public.cotizaciones;
create policy "Tienda: web solo tiendas con web" on public.cotizaciones as restrictive for insert to anon
  with check (public.tienda_tiene_web(tienda_id));

commit;


-- =====================================================================
-- VERIFICACIÓN (SOLO LECTURA) — corre cada consulta por separado
-- =====================================================================
-- 1) Debe decir true para Flore Verde y false para Ferre Fuerte
select nombre, public.tienda_tiene_web(id) as tiene_web from public.tiendas order by es_principal desc;

-- 2) Las 3 políticas nuevas de la web
select tablename, policyname, cmd, qual, with_check
from pg_policies where policyname = 'Tienda: web solo tiendas con web' order by tablename;

-- 3) Después: abre la web y recarga (Ctrl + F5). Deben salir los productos de Flore Verde.
