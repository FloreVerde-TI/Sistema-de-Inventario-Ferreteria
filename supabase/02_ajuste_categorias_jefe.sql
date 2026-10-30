-- VerdeTrack · PASO 1b: ajuste de categorías y permiso del Jefe
begin;

-- Quita la política vieja (con tilde) que daba acceso a cualquier usuario con sesión
drop policy if exists "Admin: Gestión total de categorías" on public.categorias;

-- El Jefe puede eliminar productos
update public.roles
set permisos = array_append(permisos, 'productos_eliminar')
where nombre = 'Jefe' and not ('productos_eliminar' = any (permisos));

commit;

-- VERIFICACIÓN (solo lectura): no debe salir "Admin: Gestión total de categorías"
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'categorias'
order by policyname;
