-- =====================================================================
-- VerdeTrack · REVISIÓN DE SEGURIDAD  (SOLO LECTURA: no cambia nada)
-- Nombre para guardarlo: "10 Revision de seguridad (solo lectura)"
-- Descripción: "Lista políticas, tablas sin RLS y funciones SECURITY DEFINER para auditar."
-- Ejecuta cada bloque por separado y pásame el resultado.
-- =====================================================================

-- 1) Tablas SIN RLS activado (debería salir vacío)
select tablename
from pg_tables
where schemaname = 'public' and rowsecurity = false;

-- 2) Políticas de profiles y roles (para revisar que nadie pueda cambiarse su propio rol)
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('profiles', 'roles', 'settings', 'actividad')
order by tablename, cmd;

-- 3) Todo lo que puede hacer el público (anon), en cualquier tabla
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and 'anon' = any(roles)
order by tablename;

-- 4) Funciones SECURITY DEFINER y si el público puede ejecutarlas
select p.proname as funcion,
       pg_get_function_result(p.oid) as devuelve,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede_ejecutar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by 1;
