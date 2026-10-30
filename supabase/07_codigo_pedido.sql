-- =====================================================================
-- VerdeTrack · PASO 7: Código de pedido (#0413332D)
-- Columna calculada sola: los primeros 8 caracteres del ID en mayúsculas,
-- igual al que la web pone en el mensaje de WhatsApp.
-- Sirve para pedidos viejos y nuevos, sin tocar la web.
-- =====================================================================
begin;

alter table public.pedidos
  add column if not exists codigo text generated always as (upper(left(id::text, 8))) stored;

create index if not exists pedidos_codigo_idx on public.pedidos (codigo);

commit;

-- VERIFICACIÓN (solo lectura): debe salir 0413332D para "Wowo testeando"
select codigo, nombre_cliente, fecha from public.pedidos order by fecha desc limit 5;
