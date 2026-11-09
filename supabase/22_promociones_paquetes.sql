-- =====================================================================
-- PASO 22: PROMOCIONES (DESCUENTOS Y OFERTAS) Y PAQUETES
--
-- A) promociones: un producto, una categoría, un proveedor o toda la
--    tienda pueden tener un DESCUENTO (%) o una OFERTA (precio fijo, solo
--    por producto), con fecha de inicio y de fin. El precio normal del
--    producto NO se toca: al terminar la promoción vuelve solo.
--    Si un producto tiene varias promociones a la vez, se usa la mejor.
--    Un producto solo puede tener UNA promoción propia activa.
-- B) paquetes + paquete_items: 2 o más productos con un solo precio.
--    modo 'propio'      = el paquete es un producto con su propio stock.
--    modo 'componentes' = no tiene stock propio: descuenta de cada producto.
-- C) productos.reingreso_at: fecha en que un producto agotado volvió a
--    tener existencias.
-- D) detalle_pedido guarda el precio normal, la promoción y el paquete,
--    para que el precio original nunca se pierda.
-- E) Permiso nuevo "promociones" (Administrador y Jefe; Super ya lo tiene).
--
-- Todo dentro de begin/commit: si algo falla, NO se aplica nada.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- A) PROMOCIONES
-- ---------------------------------------------------------------------
create table if not exists public.promociones (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null default public.mi_tienda() references public.tiendas(id),
  tipo text not null check (tipo in ('descuento', 'oferta')),
  alcance text not null check (alcance in ('producto', 'categoria', 'proveedor', 'todos')),
  producto_id uuid references public.productos(id) on delete cascade,
  categoria_id uuid references public.categorias(id) on delete cascade,
  proveedor_id uuid references public.proveedores(id) on delete cascade,
  porcentaje numeric check (porcentaje is null or (porcentaje > 0 and porcentaje < 100)),
  precio_oferta numeric check (precio_oferta is null or precio_oferta > 0),
  redondeo int not null default 0 check (redondeo in (0, 5, 10, 25, 50, 100)),
  sello_texto text check (sello_texto is null or char_length(sello_texto) <= 40),
  inicia timestamptz not null default now(),
  termina timestamptz,
  activa boolean not null default true,
  creado_por text,
  created_at timestamptz not null default now(),
  -- Descuento lleva porcentaje; oferta lleva precio y solo es por producto
  constraint promociones_tipo_ok check (
    (tipo = 'descuento' and porcentaje is not null and precio_oferta is null)
    or (tipo = 'oferta' and precio_oferta is not null and porcentaje is null and alcance = 'producto')
  ),
  -- Cada alcance con su dato
  constraint promociones_alcance_ok check (
    (alcance = 'producto' and producto_id is not null)
    or (alcance = 'categoria' and categoria_id is not null)
    or (alcance = 'proveedor' and proveedor_id is not null)
    or (alcance = 'todos')
  ),
  constraint promociones_fechas_ok check (termina is null or termina > inicia)
);

create index if not exists promociones_tienda_idx on public.promociones (tienda_id, activa);
create index if not exists promociones_producto_idx on public.promociones (producto_id);
-- Un producto: una sola promoción propia activa (la pantalla avisa antes de reemplazar)
create unique index if not exists promociones_una_por_producto
  on public.promociones (producto_id) where activa and alcance = 'producto';

-- ---------------------------------------------------------------------
-- B) PAQUETES
-- ---------------------------------------------------------------------
create table if not exists public.paquetes (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null default public.mi_tienda() references public.tiendas(id),
  nombre text not null check (char_length(btrim(nombre)) between 3 and 120),
  descripcion text,
  imagen text,
  modo text not null check (modo in ('propio', 'componentes')),
  -- modo propio: el producto que representa al paquete (su precio y stock mandan)
  producto_id uuid references public.productos(id) on delete cascade,
  -- modo componentes: precio del paquete
  precio numeric check (precio is null or precio > 0),
  sello_texto text check (sello_texto is null or char_length(sello_texto) <= 40),
  en_web boolean not null default true,
  activo boolean not null default true,
  inicia timestamptz not null default now(),
  termina timestamptz,
  creado_por text,
  created_at timestamptz not null default now(),
  -- Uno u otro, nunca los dos
  constraint paquetes_modo_ok check (
    (modo = 'propio' and producto_id is not null and precio is null)
    or (modo = 'componentes' and producto_id is null and precio is not null)
  ),
  constraint paquetes_fechas_ok check (termina is null or termina > inicia)
);
create index if not exists paquetes_tienda_idx on public.paquetes (tienda_id, activo);
create unique index if not exists paquetes_un_producto on public.paquetes (producto_id) where producto_id is not null;

create table if not exists public.paquete_items (
  id uuid primary key default gen_random_uuid(),
  paquete_id uuid not null references public.paquetes(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  cantidad int not null default 1 check (cantidad between 1 and 50),
  tienda_id uuid not null default public.mi_tienda() references public.tiendas(id),
  unique (paquete_id, producto_id)
);
create index if not exists paquete_items_producto_idx on public.paquete_items (producto_id);

-- Los productos del paquete copian la tienda de su producto (igual que las demás tablas hijas)
drop trigger if exists a_heredar_tienda on public.paquete_items;
create trigger a_heredar_tienda before insert on public.paquete_items
  for each row execute function public.heredar_tienda();

-- Un paquete solo puede llevar productos de su misma ferretería
create or replace function public.validar_paquete_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select tienda_id from public.paquetes where id = new.paquete_id) is distinct from new.tienda_id then
    raise exception 'El producto no pertenece a esta ferretería.';
  end if;
  if exists (select 1 from public.paquetes where id = new.paquete_id and producto_id = new.producto_id) then
    raise exception 'Un paquete no puede contenerse a sí mismo.';
  end if;
  return new;
end $$;
drop trigger if exists tr_validar_paquete_item on public.paquete_items;
create trigger tr_validar_paquete_item before insert or update on public.paquete_items
  for each row execute function public.validar_paquete_item();

-- ---------------------------------------------------------------------
-- C) "DE VUELTA EN INVENTARIO"
-- ---------------------------------------------------------------------
alter table public.productos add column if not exists reingreso_at timestamptz;

create or replace function public.marcar_reingreso()
returns trigger language plpgsql as $$
begin
  if coalesce(old.stock, 0) <= 0 and coalesce(new.stock, 0) > 0 then
    new.reingreso_at := now();
  end if;
  return new;
end $$;
drop trigger if exists tr_marcar_reingreso on public.productos;
create trigger tr_marcar_reingreso before update of stock on public.productos
  for each row execute function public.marcar_reingreso();

-- ---------------------------------------------------------------------
-- D) EL PEDIDO RECUERDA EL PRECIO NORMAL, LA PROMOCIÓN Y EL PAQUETE
-- ---------------------------------------------------------------------
alter table public.detalle_pedido
  add column if not exists precio_normal numeric,
  add column if not exists promocion_id uuid references public.promociones(id) on delete set null,
  add column if not exists paquete_id uuid references public.paquetes(id) on delete set null,
  add column if not exists paquete_nombre text;

-- ---------------------------------------------------------------------
-- E) CÁLCULO DEL PRECIO CON PROMOCIÓN (una sola fuente de verdad)
--    Devuelve la MEJOR promoción vigente de un producto, o nada.
-- ---------------------------------------------------------------------
create or replace function public.promo_de_producto(p_producto uuid)
returns table (promocion_id uuid, tipo text, porcentaje numeric, precio_normal numeric,
               precio_final numeric, sello_texto text, termina timestamptz)
language sql stable security definer set search_path = public as $$
  select x.id, x.tipo, x.porcentaje, x.precio, x.final, x.sello_texto, x.termina
  from (
    select pr.id, pr.tipo, pr.porcentaje, p.precio, pr.sello_texto, pr.termina,
           case
             when pr.tipo = 'oferta' then pr.precio_oferta
             when pr.redondeo > 0 then round(p.precio * (1 - pr.porcentaje / 100.0) / pr.redondeo) * pr.redondeo
             else round(p.precio * (1 - pr.porcentaje / 100.0))
           end as final,
           -- en empate gana la propia del producto
           case pr.alcance when 'producto' then 0 else 1 end as orden
    from public.productos p
    join public.promociones pr on pr.tienda_id = p.tienda_id
    where p.id = p_producto
      and p.tienda_id = public.mi_tienda()
      and (auth.uid() is not null or public.tienda_tiene_web(p.tienda_id))
      and p.precio > 0
      and pr.activa
      and pr.inicia <= now()
      and (pr.termina is null or pr.termina > now())
      and (   pr.alcance = 'todos'
           or (pr.alcance = 'producto'  and pr.producto_id  = p.id)
           or (pr.alcance = 'categoria' and pr.categoria_id = p.categoria_id)
           or (pr.alcance = 'proveedor' and pr.proveedor_id = p.proveedor_id))
  ) x
  where x.final > 0 and x.final < x.precio
  order by x.final asc, x.orden asc
  limit 1;
$$;

-- Todos los productos de la tienda actual que hoy tienen promoción
-- (la web lo usa sin sesión: solo ve los productos publicados)
create or replace function public.promos_vigentes()
returns table (producto_id uuid, promocion_id uuid, tipo text, porcentaje numeric,
               precio_normal numeric, precio_final numeric, sello_texto text, termina timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, x.promocion_id, x.tipo, x.porcentaje, x.precio_normal, x.precio_final, x.sello_texto, x.termina
  from public.productos p
  cross join lateral public.promo_de_producto(p.id) x
  where p.tienda_id = public.mi_tienda()
    and (auth.uid() is not null or (p.activo and public.tienda_tiene_web(p.tienda_id)));
$$;

revoke execute on function public.promo_de_producto(uuid) from public;
revoke execute on function public.promos_vigentes() from public;
grant execute on function public.promo_de_producto(uuid) to anon, authenticated;
grant execute on function public.promos_vigentes() to anon, authenticated;

-- ---------------------------------------------------------------------
-- F) PERMISOS (RLS)
-- ---------------------------------------------------------------------
alter table public.promociones enable row level security;
alter table public.paquetes enable row level security;
alter table public.paquete_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['promociones', 'paquetes', 'paquete_items']
  loop
    execute format('drop policy if exists "Tienda: solo la actual" on public.%I', t);
    execute format(
      'create policy "Tienda: solo la actual" on public.%I as restrictive for all to authenticated
         using (tienda_id = (select public.mi_tienda()))
         with check (tienda_id = (select public.mi_tienda()))', t);
    execute format('drop policy if exists "Promos: personal ve" on public.%I', t);
    execute format('create policy "Promos: personal ve" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists "Promos: gestionar" on public.%I', t);
    execute format(
      'create policy "Promos: gestionar" on public.%I for all to authenticated
         using (public.tiene_permiso(''promociones''))
         with check (public.tiene_permiso(''promociones''))', t);
  end loop;
end $$;
-- La web (anon) NO lee estas tablas directo: usa promos_vigentes() y paquetes_web() (paso 2.1 de la web)

-- Permiso nuevo para Administrador y Jefe (el Super Administrador ya tiene todo)
update public.roles
   set permisos = array_append(permisos, 'promociones')
 where nombre in ('Administrador', 'Jefe')
   and not ('promociones' = any (permisos));

commit;


-- =====================================================================
-- VERIFICACIÓN (SOLO LECTURA) — corre cada consulta por separado
-- =====================================================================
-- 1) Deben salir las 3 tablas nuevas
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('promociones', 'paquetes', 'paquete_items');

-- 2) Columnas nuevas
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'productos' and column_name = 'reingreso_at')
    or (table_name = 'detalle_pedido' and column_name in ('precio_normal', 'promocion_id', 'paquete_id', 'paquete_nombre')));

-- 3) Administrador y Jefe deben tener "promociones"
select nombre, 'promociones' = any (permisos) as tiene_promociones from public.roles order by nivel desc;

-- 4) Por ahora 0 filas (todavía no hay promociones)
select * from public.promos_vigentes();
