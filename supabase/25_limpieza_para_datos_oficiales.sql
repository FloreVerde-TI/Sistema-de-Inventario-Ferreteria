-- =====================================================================
-- PASO 25: LIMPIEZA TOTAL ANTES DE CARGAR LOS DATOS OFICIALES
-- Para cuando la empresa entregue el Excel oficial: deja la ferretería
-- elegida "en blanco" para importar desde cero.
--
-- BORRA de esa ferretería: productos, categorías, proveedores, movimientos,
-- pedidos y su detalle, cotizaciones, códigos de barras adicionales,
-- historial de precios, imágenes extra, promociones, paquetes y bitácora.
-- NO BORRA: usuarios, roles, permisos, ferreterías, configuración
-- (datos de la empresa, logo, tarjetas) ni las imágenes del Storage
-- (las plantillas se siguen usando).
--
-- ⚠️⚠️ NO SE PUEDE DESHACER. Haz antes un respaldo (Supabase → Database →
-- Backups) y corre primero el bloque 0 para ver cuánto se borrará.
-- Cambia el slug de la línea "v_slug" si es para Ferre Fuerte.
-- =====================================================================

-- 0) SOLO LECTURA: cuántos registros hay hoy en Flore Verde
select 'productos' as tabla, count(*) from public.productos where tienda_id = (select id from public.tiendas where slug = 'floreverde')
union all select 'categorias', count(*) from public.categorias where tienda_id = (select id from public.tiendas where slug = 'floreverde')
union all select 'proveedores', count(*) from public.proveedores where tienda_id = (select id from public.tiendas where slug = 'floreverde')
union all select 'movimientos', count(*) from public.movimientos where tienda_id = (select id from public.tiendas where slug = 'floreverde')
union all select 'pedidos', count(*) from public.pedidos where tienda_id = (select id from public.tiendas where slug = 'floreverde')
union all select 'cotizaciones', count(*) from public.cotizaciones where tienda_id = (select id from public.tiendas where slug = 'floreverde')
union all select 'promociones', count(*) from public.promociones where tienda_id = (select id from public.tiendas where slug = 'floreverde')
union all select 'paquetes', count(*) from public.paquetes where tienda_id = (select id from public.tiendas where slug = 'floreverde');


begin;

do $$
declare
  v_slug constant text := 'floreverde';   -- 'ferrefuerte' para la otra ferretería
  t uuid;
  tabla text;
begin
  select id into t from public.tiendas where slug = v_slug;
  if t is null then
    raise exception 'No existe la ferretería %', v_slug;
  end if;

  -- Sin disparadores mientras se borra (no mueven stock ni mandan avisos)
  foreach tabla in array array['detalle_pedido','pedidos','cotizaciones','movimientos','movements','codigos_barras',
                               'historial_precios','imagenes_producto','paquete_items','paquetes','promociones',
                               'productos','categorias','proveedores','actividad']
  loop
    execute format('alter table public.%I disable trigger user', tabla);
  end loop;

  -- En orden: primero lo que depende de otros
  delete from public.detalle_pedido where tienda_id = t;
  delete from public.pedidos where tienda_id = t;
  delete from public.cotizaciones where tienda_id = t;
  delete from public.movimientos where tienda_id = t;
  delete from public.movements where tienda_id = t;
  delete from public.codigos_barras where tienda_id = t;
  delete from public.historial_precios where tienda_id = t;
  delete from public.imagenes_producto where tienda_id = t;
  delete from public.paquete_items where tienda_id = t;
  delete from public.paquetes where tienda_id = t;
  delete from public.promociones where tienda_id = t;
  delete from public.productos where tienda_id = t;
  delete from public.categorias where tienda_id = t;
  delete from public.proveedores where tienda_id = t;
  delete from public.actividad where tienda_id = t;

  foreach tabla in array array['detalle_pedido','pedidos','cotizaciones','movimientos','movements','codigos_barras',
                               'historial_precios','imagenes_producto','paquete_items','paquetes','promociones',
                               'productos','categorias','proveedores','actividad']
  loop
    execute format('alter table public.%I enable trigger user', tabla);
  end loop;

  insert into public.actividad (tienda_id, usuario, accion, entidad, detalle)
  values (t, 'Sistema', 'eliminar', 'configuracion', 'Limpieza total para cargar los datos oficiales');
end $$;

commit;


-- VERIFICACIÓN (SOLO LECTURA): corre el bloque 0 otra vez; todo debe dar 0.
-- Después: Productos → Importar Excel con el archivo oficial.
