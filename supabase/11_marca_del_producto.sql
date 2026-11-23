-- =====================================================================
-- PASO 11: MARCA DEL PRODUCTO
-- productos.marca: opcional y distinta del proveedor (ej. proveedor
-- "Importadora del Valle", marca "Stanley").
-- Dentro de begin/commit: si algo falla, NO se aplica nada.
-- =====================================================================
begin;

alter table public.productos add column if not exists marca text
  check (marca is null or char_length(btrim(marca)) between 1 and 60);

commit;


-- =====================================================================
-- VERIFICACIÓN (SOLO LECTURA)
-- =====================================================================
-- Debe salir la columna nueva
select table_name, column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'productos' and column_name = 'marca';
