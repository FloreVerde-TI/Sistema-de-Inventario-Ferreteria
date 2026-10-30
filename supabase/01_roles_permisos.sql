-- =====================================================================
-- VerdeTrack · PASO 1: roles, permisos, perfiles, bitácora y configuración
-- Correr TODO de una vez en Supabase → SQL Editor → Run.
-- Está dentro de begin/commit: si algo falla, NO se aplica nada.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) ROLES con permisos personalizables
-- nivel: un usuario solo puede gestionar roles/usuarios de nivel MENOR al suyo
-- es_super: tiene todos los permisos sin importar la lista
-- es_sistema: rol base, no se puede borrar
-- ---------------------------------------------------------------------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  nivel int not null check (nivel between 1 and 100),
  es_super boolean not null default false,
  es_sistema boolean not null default false,
  permisos text[] not null default '{}',
  created_at timestamptz not null default now()
);

insert into public.roles (nombre, descripcion, nivel, es_super, es_sistema, permisos) values
('Super Administrador', 'Desarrolladores del sistema. Acceso total.', 100, true, true,
  array['productos_crear','productos_editar','productos_deshabilitar','productos_eliminar',
        'entradas','salidas','pedidos_revisar','pedidos_reabrir','reportes',
        'usuarios_gestionar','roles_gestionar','config_editar','bitacora_ver']),
('Administrador', 'Dueño de la empresa. Todo lo del negocio.', 80, false, true,
  array['productos_crear','productos_editar','productos_deshabilitar','productos_eliminar',
        'entradas','salidas','pedidos_revisar','pedidos_reabrir','reportes',
        'usuarios_gestionar','roles_gestionar','config_editar','bitacora_ver']),
('Jefe', 'Encargado de operaciones.', 60, false, true,
  array['productos_crear','productos_editar','productos_deshabilitar',
        'entradas','salidas','pedidos_revisar','pedidos_reabrir','reportes','bitacora_ver']),
('Empleado', 'Operación diaria.', 20, false, true,
  array['entradas','salidas','pedidos_revisar','reportes'])
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------
-- 2) PROFILES: quitar restricciones viejas, agregar "activo", ligar a roles
-- ---------------------------------------------------------------------
-- Quita cualquier CHECK viejo sobre "role" (ej. solo Administrador/Empleado)
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.profiles'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

-- Si se borra la cuenta en Auth, se borra su perfil
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.profiles'::regclass and contype = 'f'
             and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;

alter table public.profiles add column if not exists activo boolean not null default true;

-- Crea perfiles faltantes (ej. aletejo18). El nombre se corrige luego en Usuarios.
insert into public.profiles (id, full_name, email, role)
select u.id, split_part(u.email, '@', 1), u.email, 'Empleado'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Adrian y Aletejo = Super Administrador
update public.profiles set role = 'Super Administrador'
where id in ('cb88e5b9-53c4-4c17-a5f8-87ba31f9fe1d', '6ed18459-49d7-4ca1-8c29-72910d05714d');

update public.profiles set role = 'Empleado'
where role is null or role not in (select nombre from public.roles);

alter table public.profiles alter column role set not null;
alter table public.profiles drop constraint if exists profiles_role_fkey;
-- Si se renombra un rol, los perfiles se actualizan solos.
-- Un rol con usuarios asignados NO se puede borrar.
alter table public.profiles
  add constraint profiles_role_fkey foreign key (role) references public.roles(nombre) on update cascade;

-- ---------------------------------------------------------------------
-- 3) FUNCIONES de permisos (las usan las políticas RLS y la app)
-- ---------------------------------------------------------------------
create or replace function public.tiene_permiso(p_permiso text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr
    join public.roles r on r.nombre = pr.role
    where pr.id = auth.uid() and pr.activo
      and (r.es_super or p_permiso = any (r.permisos))
  );
$$;

create or replace function public.mi_nivel()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.nivel from public.profiles pr
    join public.roles r on r.nombre = pr.role
    where pr.id = auth.uid() and pr.activo
  ), 0);
$$;

grant execute on function public.tiene_permiso(text) to authenticated;
grant execute on function public.mi_nivel() to authenticated;

-- ---------------------------------------------------------------------
-- 4) TRIGGER: crear perfil automático al crear usuario en Auth
-- El rol se toma de app_metadata (solo el servidor puede ponerlo, no el navegador)
-- ---------------------------------------------------------------------
create or replace function public.crear_perfil_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce((select nombre from public.roles where nombre = new.raw_app_meta_data ->> 'role'), 'Empleado')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists tr_crear_perfil on auth.users;
create trigger tr_crear_perfil
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();

-- ---------------------------------------------------------------------
-- 5) RLS de roles y profiles
-- ---------------------------------------------------------------------
alter table public.roles enable row level security;

drop policy if exists "Roles: lectura" on public.roles;
drop policy if exists "Roles: crear" on public.roles;
drop policy if exists "Roles: editar" on public.roles;
drop policy if exists "Roles: borrar" on public.roles;

create policy "Roles: lectura" on public.roles
  for select to authenticated using (true);
create policy "Roles: crear" on public.roles
  for insert to authenticated
  with check (public.tiene_permiso('roles_gestionar') and nivel < public.mi_nivel()
              and not es_super and not es_sistema);
create policy "Roles: editar" on public.roles
  for update to authenticated
  using (public.tiene_permiso('roles_gestionar') and nivel < public.mi_nivel())
  with check (nivel < public.mi_nivel() and not es_super);
create policy "Roles: borrar" on public.roles
  for delete to authenticated
  using (public.tiene_permiso('roles_gestionar') and nivel < public.mi_nivel() and not es_sistema);

-- "Leer propio perfil" se mantiene. Esta agrega: quien gestiona usuarios ve a todos.
drop policy if exists "Perfiles: gestores ven todos" on public.profiles;
create policy "Perfiles: gestores ven todos" on public.profiles
  for select to authenticated using (public.tiene_permiso('usuarios_gestionar'));
-- Crear/editar/desactivar perfiles se hace desde la ruta del servidor (no desde el navegador).

-- ---------------------------------------------------------------------
-- 6) BITÁCORA de actividad
-- El usuario ("Nombre — Rol") lo pone la base de datos, no el navegador.
-- ---------------------------------------------------------------------
create table if not exists public.actividad (
  id bigint generated always as identity primary key,
  usuario_id uuid references auth.users(id) on delete set null,
  usuario text,
  accion text not null,      -- crear, editar, deshabilitar, habilitar, eliminar, aprobar, rechazar, reabrir...
  entidad text not null,     -- producto, pedido, usuario, rol, configuracion
  entidad_id text,
  detalle text,
  created_at timestamptz not null default now()
);
create index if not exists actividad_created_at_idx on public.actividad (created_at desc);

create or replace function public.actividad_completar_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.usuario_id := auth.uid();
    select pr.full_name || ' — ' || pr.role into new.usuario
    from public.profiles pr where pr.id = auth.uid();
  end if;
  new.usuario := coalesce(new.usuario, 'Sistema');
  new.created_at := now();
  return new;
end $$;

drop trigger if exists tr_actividad_usuario on public.actividad;
create trigger tr_actividad_usuario
  before insert on public.actividad
  for each row execute function public.actividad_completar_usuario();

alter table public.actividad enable row level security;
drop policy if exists "Actividad: registrar" on public.actividad;
drop policy if exists "Actividad: ver" on public.actividad;
create policy "Actividad: registrar" on public.actividad
  for insert to authenticated with check (auth.uid() is not null);
create policy "Actividad: ver" on public.actividad
  for select to authenticated using (public.tiene_permiso('bitacora_ver'));
-- Sin políticas de editar/borrar: la bitácora no se puede alterar.

-- ---------------------------------------------------------------------
-- 7) CONFIGURACIÓN (settings)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'settings' and column_name = 'ruc') then
    alter table public.settings rename column ruc to cedula_juridica;
  end if;
end $$;

alter table public.settings
  add column if not exists nombre_comercial text,
  add column if not exists whatsapp text,
  add column if not exists sitio_web text,
  add column if not exists horario text,
  add column if not exists stock_minimo_defecto int not null default 5 check (stock_minimo_defecto >= 0),
  add column if not exists logo_url text,
  add column if not exists pie_reportes text;

insert into public.settings (id, business_name, nombre_comercial, sitio_web)
select 1, 'Flore Verde SRL', 'Flore Verde', 'https://web-floreverde.vercel.app/'
where not exists (select 1 from public.settings);

alter table public.settings enable row level security;
drop policy if exists "Config: lectura" on public.settings;
drop policy if exists "Config: editar" on public.settings;
create policy "Config: lectura" on public.settings
  for select to authenticated using (true);
create policy "Config: editar" on public.settings
  for update to authenticated
  using (public.tiene_permiso('config_editar'))
  with check (public.tiene_permiso('config_editar'));

-- ---------------------------------------------------------------------
-- 8) SEGURIDAD de categorías (nota 7): quitar la temporal sin cuenta
-- La lectura pública se mantiene (la web la necesita).
-- ---------------------------------------------------------------------
drop policy if exists "dev_all_categorias_insert" on public.categorias;
drop policy if exists "Admin: Gestión total de categorias" on public.categorias;
drop policy if exists "Lectura pública de categorias" on public.categorias; -- duplicada (sin tilde)
drop policy if exists "Categorías: crear" on public.categorias;
drop policy if exists "Categorías: editar" on public.categorias;
drop policy if exists "Categorías: borrar" on public.categorias;

create policy "Categorías: crear" on public.categorias
  for insert to authenticated
  with check (public.tiene_permiso('productos_crear') or public.tiene_permiso('productos_editar'));
create policy "Categorías: editar" on public.categorias
  for update to authenticated
  using (public.tiene_permiso('productos_crear') or public.tiene_permiso('productos_editar'))
  with check (public.tiene_permiso('productos_crear') or public.tiene_permiso('productos_editar'));
create policy "Categorías: borrar" on public.categorias
  for delete to authenticated
  using (public.tiene_permiso('productos_eliminar'));

commit;


-- =====================================================================
-- VERIFICACIÓN (SOLO LECTURA) — correr DESPUÉS, por separado, y pasarme el resultado
-- =====================================================================
-- A)
select p.full_name, p.email, p.role, p.activo from public.profiles p;

-- B)
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('categorias','roles','profiles','settings','actividad')
order by tablename, policyname;
