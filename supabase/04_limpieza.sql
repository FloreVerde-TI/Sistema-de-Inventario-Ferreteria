-- =====================================================================
-- VerdeTrack · PASO 4: Limpieza de la base de datos
-- Borra columnas duplicadas y vacías de productos y la tabla "usuarios" (vacía).
-- Dentro de begin/commit: si algo depende de ellas, da error y NO borra nada.
-- =====================================================================

-- A) REVISIÓN PREVIA (SOLO LECTURA) — córrela primero y pásame el resultado.
--    Deben salir: con_stock_min = 0, con_barcode = 0, filas_usuarios = 0
select
  (select count(*) from public.productos where stock_min is not null) as con_stock_min,
  (select count(*) from public.productos where barcode is not null and barcode <> '') as con_barcode,
  (select count(*) from public.usuarios) as filas_usuarios;


-- B) LIMPIEZA (CAMBIA LA BASE) — solo si A salió todo en 0
begin;

alter table public.productos drop column if exists stock_min;
alter table public.productos drop column if exists barcode;
drop table if exists public.usuarios;

commit;


-- C) VERIFICACIÓN (SOLO LECTURA): no debe salir ninguna fila
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'productos' and column_name in ('stock_min', 'barcode')) or table_name = 'usuarios');
