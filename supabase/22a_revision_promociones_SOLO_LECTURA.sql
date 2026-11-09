-- =====================================================================
-- PASO 22a: REVISIÓN ANTES DE PROMOCIONES — SOLO LECTURA
-- No cambia nada. Sirve para confirmar cómo está la base antes de
-- correr el paso 22. Corre cada consulta por separado y copia el resultado.
-- =====================================================================

-- 1) Disparadores de las tablas que tocan las promociones y los pedidos
select c.relname as tabla, t.tgname as disparador, p.proname as funcion
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where c.relname in ('productos', 'pedidos', 'detalle_pedido', 'movimientos', 'movements')
  and not t.tgisinternal
order by c.relname, t.tgname;

-- 2) Código de las funciones de esos disparadores que mueven el stock
select p.proname as funcion, pg_get_functiondef(p.oid) as codigo
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where c.relname in ('pedidos', 'detalle_pedido')
  and not t.tgisinternal
  and p.proname not in ('heredar_tienda', 'proteger_pedido_web');

-- 3) Restricciones e índices únicos de detalle_pedido
select conname as restriccion, pg_get_constraintdef(oid) as definicion
from pg_constraint where conrelid = 'public.detalle_pedido'::regclass;
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'detalle_pedido';

-- 4) Columnas de productos, detalle_pedido, pedidos y settings
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('productos', 'detalle_pedido', 'pedidos', 'settings')
order by table_name, ordinal_position;

-- 5) Roles y sus permisos (para agregar el permiso "promociones")
select nombre, nivel, es_super, permisos from public.roles order by nivel desc;

-- 6) Que no existan ya tablas con estos nombres
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('promociones', 'paquetes', 'paquete_items');

-- 7) Imágenes de plantilla ya subidas al Storage (deben salir 35)
select count(*) as plantillas_subidas
from storage.objects
where bucket_id = 'productos' and name like 'productos/demo-FV-%.webp';

-- 8) Logo de cada ferretería (para productos sin imagen ni categoría)
select t.slug, t.logo, s.logo_url
from public.tiendas t
left join public.settings s on s.tienda_id = t.id
order by t.es_principal desc;
