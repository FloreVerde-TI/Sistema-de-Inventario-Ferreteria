-- =====================================================================
-- VerdeTrack · 18a ESQUEMA COMPLETO (SOLO LECTURA: no cambia nada)
-- Nombre: "18a Esquema completo (solo lectura)"
-- Descripción: "Columnas, llaves, índices, disparadores, funciones y políticas, para preparar multi-tienda."
-- Corre CADA bloque por separado. En el resultado usa "Copy" → "Copy as JSON" y pégamelo
-- (puedes pegarlos todos juntos en un solo .txt).
-- =====================================================================

-- 1) Columnas de todas las tablas
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 2) Llaves, únicos y checks
select conrelid::regclass as tabla, conname, contype, pg_get_constraintdef(oid) as definicion
from pg_constraint
where connamespace = 'public'::regnamespace
order by 1, 2;

-- 3) Índices únicos
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and indexdef ilike '%unique%'
order by 1, 2;

-- 4) Disparadores
select event_object_table as tabla, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by 1, 2;

-- 5) Código de las funciones (todas menos crear_pedido_web, que ya la tengo)
select p.proname as funcion, pg_get_functiondef(p.oid) as codigo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.proname <> 'crear_pedido_web'
order by 1;

-- 6) Todas las políticas
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, cmd;

-- 7) Cuántas filas tiene cada tabla (para los datos de prueba de Ferre Fuerte)
select relname as tabla, n_live_tup as filas_aprox
from pg_stat_user_tables
where schemaname = 'public'
order by 1;
