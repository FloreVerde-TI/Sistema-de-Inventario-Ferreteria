-- =====================================================================
-- PASO 23: MARCA DEL PRODUCTO Y REGALÍAS EN PAQUETES
-- A) productos.marca: opcional y distinta del proveedor (ej. proveedor
--    "Importadora del Valle", marca "Stanley").
-- B) paquete_items.regalia: ese producto va incluido SIN COSTO en el
--    paquete (ej. pintura + rodillo de regalía). El precio del paquete se
--    reparte solo entre los demás productos.
-- Dentro de begin/commit: si algo falla, NO se aplica nada.
-- =====================================================================
begin;

alter table public.productos add column if not exists marca text
  check (marca is null or char_length(btrim(marca)) between 1 and 60);

alter table public.paquete_items add column if not exists regalia boolean not null default false;

commit;


-- =====================================================================
-- VERIFICACIÓN (SOLO LECTURA)
-- =====================================================================
-- Deben salir las 2 columnas nuevas
select table_name, column_name, data_type from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'productos' and column_name = 'marca')
    or (table_name = 'paquete_items' and column_name = 'regalia'));
