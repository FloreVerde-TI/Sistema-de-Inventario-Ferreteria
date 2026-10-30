-- =====================================================================
-- VerdeTrack · PASO 18: MULTI-TIENDA (Flore Verde + Ferre Fuerte)
-- Un mismo sistema para dos ferreterías con inventarios separados.
--
-- Cómo funciona:
--  - Tabla "tiendas" con las dos ferreterías (logo, nombre, color, si tiene web).
--  - Cada dato (productos, movimientos, pedidos, etc.) lleva "tienda_id".
--  - Cada usuario tiene acceso a una o a las dos (tabla "usuario_tiendas") y
--    una "tienda actual" en su perfil. La base SOLO le muestra los datos de su
--    tienda actual (políticas RESTRICTIVAS: se suman a las que ya existían).
--  - Lo que se crea se guarda solo en la tienda actual (valor por defecto).
--  - Los datos "hijos" (movimientos, códigos, historial, detalle de pedidos)
--    copian la tienda de su producto o pedido (disparador).
--  - La web (sin sesión) sigue igual: todo va a Flore Verde (tienda principal)
--    y solo ve productos de tiendas con web.
--  - Códigos de barras, SKU y nombres de proveedor pasan a ser únicos POR tienda.
--
-- ⚠️ Toca casi todas las tablas. Dentro de begin/commit: si algo falla, NO se aplica nada.
-- Haz antes un respaldo: Supabase → Database → Backups (o exporta las tablas a CSV).
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) TIENDAS
-- ---------------------------------------------------------------------
create table if not exists public.tiendas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nombre text not null,
  nombre_app text not null,          -- nombre que se ve en el sistema
  logo text not null,                -- ruta del logo (carpeta public de la app)
  color text not null default '#1f7a3a',
  es_principal boolean not null default false,
  tiene_web boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists tiendas_una_principal on public.tiendas (es_principal) where es_principal;

insert into public.tiendas (slug, nombre, nombre_app, logo, color, es_principal, tiene_web)
values
  ('floreverde', 'Flore Verde', 'FerreStock', '/logo-icono.png', '#1f7a3a', true, true),
  ('ferrefuerte', 'Ferre Fuerte', 'Ferre Fuerte', '/logo-ferrefuerte.png', '#c62828', false, false)
on conflict (slug) do nothing;

create or replace function public.tienda_principal()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.tiendas where es_principal limit 1;
$$;

-- ---------------------------------------------------------------------
-- 2) ACCESO DE USUARIOS A TIENDAS + TIENDA ACTUAL
-- ---------------------------------------------------------------------
create table if not exists public.usuario_tiendas (
  user_id uuid not null references auth.users(id) on delete cascade,
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  primary key (user_id, tienda_id)
);

alter table public.profiles add column if not exists tienda_actual uuid references public.tiendas(id) on delete set null;

-- Todos los usuarios actuales: acceso a Flore Verde
insert into public.usuario_tiendas (user_id, tienda_id)
select p.id, public.tienda_principal() from public.profiles p
on conflict do nothing;
-- Los Super Administradores: también a Ferre Fuerte
insert into public.usuario_tiendas (user_id, tienda_id)
select p.id, t.id
from public.profiles p
join public.roles r on r.nombre = p.role and r.es_super
cross join public.tiendas t where t.slug = 'ferrefuerte'
on conflict do nothing;
update public.profiles set tienda_actual = public.tienda_principal() where tienda_actual is null;

-- Tienda actual de quien hace la consulta. Sin sesión (la web) = tienda principal.
create or replace function public.mi_tienda()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pr.tienda_actual from public.profiles pr
      where pr.id = auth.uid()
        and exists (select 1 from public.usuario_tiendas ut
                    where ut.user_id = pr.id and ut.tienda_id = pr.tienda_actual)),
    (select ut.tienda_id from public.usuario_tiendas ut
      join public.tiendas t on t.id = ut.tienda_id
      where ut.user_id = auth.uid() order by t.es_principal desc, t.nombre limit 1),
    public.tienda_principal()
  );
$$;

-- Cambiar de ferretería (solo a una a la que tenga acceso)
create or replace function public.cambiar_tienda(p_tienda uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.usuario_tiendas where user_id = auth.uid() and tienda_id = p_tienda) then
    raise exception 'No tienes acceso a esa ferretería.';
  end if;
  update public.profiles set tienda_actual = p_tienda where id = auth.uid();
  return p_tienda;
end $$;

revoke execute on function public.cambiar_tienda(uuid) from public, anon;
grant execute on function public.cambiar_tienda(uuid) to authenticated;
grant execute on function public.mi_tienda() to anon, authenticated;
grant execute on function public.tienda_principal() to anon, authenticated;

-- Permisos de las tablas nuevas (los cambios de acceso los hace la ruta del servidor)
alter table public.tiendas enable row level security;
alter table public.usuario_tiendas enable row level security;
drop policy if exists "Tiendas: ver" on public.tiendas;
create policy "Tiendas: ver" on public.tiendas for select to authenticated
  using (id in (select tienda_id from public.usuario_tiendas where user_id = auth.uid())
         or public.tiene_permiso('usuarios_gestionar'));
drop policy if exists "Usuario tiendas: ver" on public.usuario_tiendas;
create policy "Usuario tiendas: ver" on public.usuario_tiendas for select to authenticated
  using (user_id = auth.uid() or public.tiene_permiso('usuarios_gestionar'));

-- ---------------------------------------------------------------------
-- 3) COLUMNA tienda_id EN TODAS LAS TABLAS DE DATOS (lo actual = Flore Verde)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['productos','categorias','proveedores','movimientos','movements','pedidos',
                           'detalle_pedido','cotizaciones','codigos_barras','historial_precios',
                           'actividad','imagenes_producto','settings']
  loop
    execute format('alter table public.%I add column if not exists tienda_id uuid references public.tiendas(id)', t);
    execute format('update public.%I set tienda_id = public.tienda_principal() where tienda_id is null', t);
    execute format('alter table public.%I alter column tienda_id set not null', t);
    execute format('alter table public.%I alter column tienda_id set default public.mi_tienda()', t);
    execute format('create index if not exists %I on public.%I (tienda_id)', t || '_tienda_idx', t);
  end loop;
end $$;

-- Una configuración por tienda
create unique index if not exists settings_una_por_tienda on public.settings (tienda_id);
alter table public.settings alter column id drop default;

-- ---------------------------------------------------------------------
-- 4) LOS DATOS "HIJOS" COPIAN LA TIENDA DE SU PRODUCTO O PEDIDO
--    (se llama "a_..." para que corra antes que los demás disparadores)
-- ---------------------------------------------------------------------
create or replace function public.heredar_tienda()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid; v_pedido uuid;
begin
  if tg_table_name = 'movements' then
    select tienda_id into v from public.productos where id = new.product_id;
  elsif tg_table_name = 'detalle_pedido' then
    select tienda_id into v_pedido from public.pedidos where id = new.pedido_id;
    select tienda_id into v from public.productos where id = new.producto_id;
    if v is distinct from v_pedido then
      raise exception 'El producto no pertenece a esta ferretería.';
    end if;
  else
    select tienda_id into v from public.productos where id = new.producto_id;
  end if;
  if v is not null then
    new.tienda_id := v;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['movimientos','movements','detalle_pedido','codigos_barras','historial_precios','imagenes_producto']
  loop
    execute format('drop trigger if exists a_heredar_tienda on public.%I', t);
    execute format('create trigger a_heredar_tienda before insert on public.%I for each row execute function public.heredar_tienda()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5) ÚNICOS POR TIENDA (el mismo código puede existir en las dos ferreterías)
-- ---------------------------------------------------------------------
alter table public.productos drop constraint if exists productos_codigo_barras_key;
alter table public.productos drop constraint if exists productos_sku_key;
create unique index if not exists productos_codigo_barras_tienda on public.productos (tienda_id, codigo_barras);
create unique index if not exists productos_sku_tienda on public.productos (tienda_id, sku);

drop index if exists public.codigos_barras_codigo_unico;
create unique index if not exists codigos_barras_codigo_tienda on public.codigos_barras (tienda_id, codigo);

drop index if exists public.proveedores_nombre_unico;
create unique index if not exists proveedores_nombre_tienda on public.proveedores (tienda_id, lower(trim(nombre)));

-- La validación de códigos de barras ahora mira solo la misma tienda
create or replace function public.validar_codigo_barras_unico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'codigos_barras' then
    if exists (select 1 from public.productos where codigo_barras = new.codigo and tienda_id = new.tienda_id) then
      raise exception 'CODIGO_DUPLICADO: el código % ya está registrado como código principal', new.codigo;
    end if;
  elsif coalesce(new.codigo_barras, '') <> '' then
    if exists (select 1 from public.codigos_barras where codigo = new.codigo_barras and tienda_id = new.tienda_id) then
      raise exception 'CODIGO_DUPLICADO: el código % ya está registrado como código adicional', new.codigo_barras;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 6) POLÍTICAS RESTRICTIVAS: cada quien solo ve y toca SU tienda actual
--    (se suman a las políticas que ya existían; no las reemplazan)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['productos','categorias','proveedores','movimientos','movements','pedidos',
                           'detalle_pedido','cotizaciones','codigos_barras','historial_precios',
                           'actividad','imagenes_producto','settings']
  loop
    execute format('drop policy if exists "Tienda: solo la actual" on public.%I', t);
    execute format(
      'create policy "Tienda: solo la actual" on public.%I as restrictive for all to authenticated
         using (tienda_id = (select public.mi_tienda()))
         with check (tienda_id = (select public.mi_tienda()))', t);
  end loop;
end $$;

-- La web (sin sesión): solo tiendas con página web
drop policy if exists "Tienda: web solo tiendas con web" on public.productos;
create policy "Tienda: web solo tiendas con web" on public.productos as restrictive for select to anon
  using (tienda_id in (select id from public.tiendas where tiene_web));
drop policy if exists "Tienda: web solo tiendas con web" on public.categorias;
create policy "Tienda: web solo tiendas con web" on public.categorias as restrictive for select to anon
  using (tienda_id in (select id from public.tiendas where tiene_web));
drop policy if exists "Tienda: web solo tiendas con web" on public.cotizaciones;
create policy "Tienda: web solo tiendas con web" on public.cotizaciones as restrictive for insert to anon
  with check (tienda_id in (select id from public.tiendas where tiene_web));

commit;


-- =====================================================================
-- VERIFICACIÓN (SOLO LECTURA) — corre cada consulta por separado
-- =====================================================================
-- 1) Las dos tiendas
select slug, nombre, nombre_app, es_principal, tiene_web from public.tiendas order by es_principal desc;

-- 2) Quién entra a qué ferretería
select p.full_name, p.role, t.nombre as tienda
from public.usuario_tiendas ut
join public.profiles p on p.id = ut.user_id
join public.tiendas t on t.id = ut.tienda_id
order by p.full_name, t.nombre;

-- 3) Todo lo actual quedó en Flore Verde (debe salir solo "Flore Verde")
select t.nombre, count(*) as productos from public.productos pr join public.tiendas t on t.id = pr.tienda_id group by t.nombre;
