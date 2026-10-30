-- =====================================================================
-- PASO 19: DATOS DE PRUEBA PARA FERRE FUERTE
-- Para que Ferre Fuerte no se vea vacía: configuración, 6 categorías,
-- 4 proveedores, 16 productos y 2 semanas de entradas y salidas.
--
-- ⚠️ Correr DESPUÉS del paso 18. Solo agrega datos a Ferre Fuerte;
-- Flore Verde no se toca. Dentro de begin/commit: si algo falla, no se aplica nada.
-- Se puede borrar todo después (ver el final del archivo).
-- =====================================================================
begin;

do $$
declare
  ff uuid := (select id from public.tiendas where slug = 'ferrefuerte');
  c_herr uuid; c_elec uuid; c_plom uuid; c_pint uuid; c_torn uuid; c_cons uuid;
  p_ferre uuid; p_elec uuid; p_pint uuid; p_cons uuid;
  r record;
  dia int;
begin
  if ff is null then
    raise exception 'Primero corre el paso 18 (no existe la tienda ferrefuerte).';
  end if;
  if exists (select 1 from public.productos where tienda_id = ff) then
    raise exception 'Ferre Fuerte ya tiene productos: este paso ya se corrió.';
  end if;

  -- 1) Configuración (datos de ejemplo)
  insert into public.settings (id, tienda_id, business_name, nombre_comercial, cedula_juridica, phone, whatsapp,
                               email, address, horario, stock_minimo_defecto, logo_url, pie_reportes)
  values (2, ff, 'Ferre Fuerte S.A.', 'Ferre Fuerte', '3-101-000000', '2222-0000', '8888-0000',
          'contacto@ferrefuerte.example', 'San José, Costa Rica (dirección de ejemplo)',
          'Lunes a sábado, 7:00 a.m. – 6:00 p.m.', 5, '/logo-ferrefuerte.png',
          'Ferre Fuerte · Documento generado por el sistema de inventario')
  on conflict (id) do nothing;

  -- 2) Categorías
  insert into public.categorias (nombre, descripcion, tienda_id) values ('Herramientas manuales', 'Martillos, llaves, desatornilladores', ff) returning id into c_herr;
  insert into public.categorias (nombre, descripcion, tienda_id) values ('Eléctricos', 'Cables, tomas, apagadores, bombillos', ff) returning id into c_elec;
  insert into public.categorias (nombre, descripcion, tienda_id) values ('Plomería', 'Tubos, uniones, llaves de paso', ff) returning id into c_plom;
  insert into public.categorias (nombre, descripcion, tienda_id) values ('Pinturas', 'Pinturas, brochas y rodillos', ff) returning id into c_pint;
  insert into public.categorias (nombre, descripcion, tienda_id) values ('Tornillería', 'Tornillos, clavos, tacos', ff) returning id into c_torn;
  insert into public.categorias (nombre, descripcion, tienda_id) values ('Construcción', 'Cemento, varilla, block', ff) returning id into c_cons;

  -- 3) Proveedores (ejemplo)
  insert into public.proveedores (nombre, telefono, correo, tienda_id) values ('Distribuidora Central', '2200-1100', 'ventas@central.example', ff) returning id into p_ferre;
  insert into public.proveedores (nombre, telefono, correo, tienda_id) values ('Eléctrica del Valle', '2200-2200', 'pedidos@electricavalle.example', ff) returning id into p_elec;
  insert into public.proveedores (nombre, telefono, correo, tienda_id) values ('Pinturas Tropicales', '2200-3300', 'info@pinturastrop.example', ff) returning id into p_pint;
  insert into public.proveedores (nombre, telefono, correo, tienda_id) values ('Materiales del Norte', '2200-4400', 'ventas@matnorte.example', ff) returning id into p_cons;

  -- 4) Productos (empiezan en 0: el stock lo ponen las entradas de abajo)
  insert into public.productos (tienda_id, nombre, descripcion, precio, sku, codigo_barras, stock, stock_minimo, ubicacion, categoria_id, proveedor_id)
  values
    (ff, 'Martillo de uña 16 oz',          'Mango de fibra de vidrio',  6500, 'FF-HER-001', '7500100000011', 0, 5, 'Pasillo 1', c_herr, p_ferre),
    (ff, 'Juego de desatornilladores 6 pz', 'Punta plana y estrella',    8900, 'FF-HER-002', '7500100000028', 0, 4, 'Pasillo 1', c_herr, p_ferre),
    (ff, 'Llave ajustable 10"',            'Acero cromado',             7200, 'FF-HER-003', '7500100000035', 0, 3, 'Pasillo 1', c_herr, p_ferre),
    (ff, 'Cinta métrica 5 m',              'Con freno',                 3500, 'FF-HER-004', '7500100000042', 0, 6, 'Pasillo 1', c_herr, p_ferre),
    (ff, 'Cable eléctrico #12 (metro)',    'THHN, color negro',          650, 'FF-ELE-001', '7500100000059', 0, 50,'Pasillo 2', c_elec, p_elec),
    (ff, 'Tomacorriente doble',            'Blanco, 15 A',              1800, 'FF-ELE-002', '7500100000066', 0, 10,'Pasillo 2', c_elec, p_elec),
    (ff, 'Bombillo LED 9 W',               'Luz blanca, rosca E27',     1500, 'FF-ELE-003', '7500100000073', 0, 12,'Pasillo 2', c_elec, p_elec),
    (ff, 'Tubo PVC 1/2" x 6 m',            'Presión SDR 13.5',          3200, 'FF-PLO-001', '7500100000080', 0, 8, 'Patio',     c_plom, p_cons),
    (ff, 'Codo PVC 1/2"',                  '90 grados',                  250, 'FF-PLO-002', '7500100000097', 0, 30,'Pasillo 3', c_plom, p_cons),
    (ff, 'Llave de paso 1/2"',             'Bronce',                    4800, 'FF-PLO-003', '7500100000103', 0, 4, 'Pasillo 3', c_plom, p_cons),
    (ff, 'Pintura látex blanca (galón)',   'Interior y exterior',      14500, 'FF-PIN-001', '7500100000110', 0, 5, 'Pasillo 4', c_pint, p_pint),
    (ff, 'Brocha 3"',                      'Cerda natural',             1900, 'FF-PIN-002', '7500100000127', 0, 8, 'Pasillo 4', c_pint, p_pint),
    (ff, 'Rodillo 9" con bandeja',         'Para paredes lisas',        5200, 'FF-PIN-003', '7500100000134', 0, 4, 'Pasillo 4', c_pint, p_pint),
    (ff, 'Tornillo gypsum 1" (caja 100)',  'Punta fina',                2300, 'FF-TOR-001', '7500100000141', 0, 10,'Pasillo 5', c_torn, p_ferre),
    (ff, 'Clavo de 2" (kilo)',             'Con cabeza',                1700, 'FF-TOR-002', '7500100000158', 0, 10,'Pasillo 5', c_torn, p_ferre),
    (ff, 'Cemento gris (saco 50 kg)',      'Uso general',               7900, 'FF-CON-001', '7500100000165', 0, 10,'Bodega',    c_cons, p_cons);

  -- 5) Entradas iniciales (hace 14 días) → el disparador suma el stock
  for r in select id, stock_minimo, proveedor_id from public.productos where tienda_id = ff loop
    insert into public.movimientos (producto_id, tipo, cantidad, motivo, usuario, origen, proveedor, referencia, created_at)
    values (r.id, 'entrada', r.stock_minimo * 4, 'Compra a proveedor', 'Sistema (datos de prueba)', 'panel',
            (select nombre from public.proveedores where id = r.proveedor_id), 'FAC-PRUEBA-001',
            now() - interval '14 days');
  end loop;

  -- 6) Ventas de las últimas 2 semanas (salidas variadas, nunca dejan el stock en negativo)
  for dia in reverse 13..0 loop
    for r in
      select id, stock, stock_minimo from public.productos
      where tienda_id = ff and stock > stock_minimo
      order by md5(id::text || dia::text) limit 4
    loop
      insert into public.movimientos (producto_id, tipo, cantidad, motivo, usuario, origen, created_at)
      values (r.id, 'salida', greatest(1, least(r.stock - r.stock_minimo, (r.stock_minimo / 3) + (dia % 3) + 1)),
              'Venta en mostrador', 'Sistema (datos de prueba)', 'panel',
              now() - make_interval(days => dia, hours => 9 + (dia % 8)));
    end loop;
  end loop;

  -- Dos productos con stock bajo, para que se vean las alertas
  for r in select id, stock, stock_minimo from public.productos
           where tienda_id = ff and sku in ('FF-ELE-003', 'FF-PIN-001') loop
    if r.stock - (r.stock_minimo - 1) > 0 then
      insert into public.movimientos (producto_id, tipo, cantidad, motivo, usuario, origen, created_at)
      values (r.id, 'salida', r.stock - (r.stock_minimo - 1), 'Venta en mostrador', 'Sistema (datos de prueba)', 'panel', now() - interval '3 hours');
    end if;
  end loop;

  -- 7) Historial de precios (dos ajustes de ejemplo)
  insert into public.historial_precios (producto_id, precio_anterior, precio_nuevo, usuario, creado_en)
  select id, 13900, 14500, 'Sistema (datos de prueba)', now() - interval '7 days' from public.productos where tienda_id = ff and sku = 'FF-PIN-001';
  insert into public.historial_precios (producto_id, precio_anterior, precio_nuevo, usuario, creado_en)
  select id, 7500, 7900, 'Sistema (datos de prueba)', now() - interval '5 days' from public.productos where tienda_id = ff and sku = 'FF-CON-001';

  -- 8) Bitácora
  insert into public.actividad (tienda_id, usuario, accion, entidad, detalle)
  values (ff, 'Sistema', 'crear', 'producto', 'Se cargaron los datos de prueba de Ferre Fuerte (16 productos)');
end $$;

commit;


-- =====================================================================
-- VERIFICACIÓN (SOLO LECTURA) — corre cada consulta por separado
-- =====================================================================
-- 1) Cuántos datos tiene cada ferretería
select t.nombre,
  (select count(*) from public.productos p where p.tienda_id = t.id)   as productos,
  (select count(*) from public.categorias c where c.tienda_id = t.id)  as categorias,
  (select count(*) from public.proveedores v where v.tienda_id = t.id) as proveedores,
  (select count(*) from public.movimientos m where m.tienda_id = t.id) as movimientos
from public.tiendas t order by t.es_principal desc;

-- 2) Stock de Ferre Fuerte (ninguno negativo; 2 deben quedar bajo el mínimo)
select p.nombre, p.stock, p.stock_minimo, (p.stock < p.stock_minimo) as stock_bajo
from public.productos p join public.tiendas t on t.id = p.tienda_id
where t.slug = 'ferrefuerte' order by p.sku;


-- =====================================================================
-- (OPCIONAL, PARA DESPUÉS) BORRAR LOS DATOS DE PRUEBA DE FERRE FUERTE
-- Solo cuando ya vayan a cargar datos reales. Quita los "--" para usarlo.
-- =====================================================================
-- begin;
-- delete from public.movimientos       where tienda_id = (select id from public.tiendas where slug = 'ferrefuerte');
-- delete from public.historial_precios where tienda_id = (select id from public.tiendas where slug = 'ferrefuerte');
-- delete from public.productos         where tienda_id = (select id from public.tiendas where slug = 'ferrefuerte');
-- delete from public.categorias        where tienda_id = (select id from public.tiendas where slug = 'ferrefuerte');
-- delete from public.proveedores       where tienda_id = (select id from public.tiendas where slug = 'ferrefuerte');
-- delete from public.actividad         where tienda_id = (select id from public.tiendas where slug = 'ferrefuerte');
-- commit;
