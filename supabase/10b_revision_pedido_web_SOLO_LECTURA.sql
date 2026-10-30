-- =====================================================================
-- VerdeTrack · REVISIÓN 10b (SOLO LECTURA: no cambia nada)
-- Nombre: "10b Revision pedido web (solo lectura)"
-- Descripción: "Código de crear_pedido_web y políticas actuales de pedidos y detalle."
-- Corre cada bloque por separado y pásame el resultado (puedes copiar el texto).
-- =====================================================================

-- 1) Código de la función que usa la web para crear pedidos
select pg_get_functiondef('public.crear_pedido_web'::regproc) as codigo;

-- 2) Políticas actuales de pedidos y detalle_pedido (todas)
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('pedidos', 'detalle_pedido')
order by tablename, cmd;
