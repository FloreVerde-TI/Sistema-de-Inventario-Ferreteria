-- =====================================================================
-- VerdeTrack · PASO 5: Observaciones en movimientos (campo opcional)
-- =====================================================================
begin;

alter table public.movimientos
  add column if not exists observaciones text check (observaciones is null or length(observaciones) <= 300);

commit;

-- VERIFICACIÓN (solo lectura): debe salir la columna observaciones
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'movimientos' and column_name = 'observaciones';
