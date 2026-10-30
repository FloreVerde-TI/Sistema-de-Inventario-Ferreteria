-- =====================================================================
-- VerdeTrack · PASO 8: Permisos de imágenes (Storage, bucket "productos")
-- Ver las imágenes: cualquiera (bucket público, la web las necesita).
-- Subir / borrar: solo quien crea o edita productos (carpeta productos/)
-- o quien edita la configuración (carpeta empresa/, el logo).
-- =====================================================================
begin;

drop policy if exists "img_productos_subir" on storage.objects;
drop policy if exists "img_productos_actualizar" on storage.objects;
drop policy if exists "img_productos_borrar" on storage.objects;
drop policy if exists "Imagenes: ver" on storage.objects;
drop policy if exists "Imagenes: subir" on storage.objects;
drop policy if exists "Imagenes: borrar" on storage.objects;

create or replace function public.puede_gestionar_imagen(p_nombre text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_nombre like 'productos/%' then public.tiene_permiso('productos_crear') or public.tiene_permiso('productos_editar')
    when p_nombre like 'empresa/%' then public.tiene_permiso('config_editar')
    else false
  end;
$$;
grant execute on function public.puede_gestionar_imagen(text) to authenticated;

create policy "Imagenes: ver" on storage.objects
  for select to authenticated using (bucket_id = 'productos');
create policy "Imagenes: subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'productos' and public.puede_gestionar_imagen(name));
create policy "Imagenes: borrar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'productos' and public.puede_gestionar_imagen(name));

commit;

-- VERIFICACIÓN (solo lectura)
select policyname, cmd, roles from pg_policies where schemaname = 'storage' and tablename = 'objects';
