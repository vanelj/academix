-- =====================================================================
-- ACADEMIX | MIGRACIÓN INCREMENTAL: PORTADA DE LOS CURSOS
-- Estado: PREPARADA, NO APLICADA. Requiere autorización del responsable.
--
-- QUÉ AÑADE (sin tocar datos existentes)
-- 1. public.cursos.portada_url (texto, opcional). Los cursos actuales quedan con
--    null y siguen mostrando la portada generada de su categoría.
-- 2. Bucket público «portadas-cursos» (máx. 3 MB; PNG, JPEG o WebP).
--    Ruta: <institución>/<curso>/portada-<marca>-<aleatorio>.<ext>
--    Políticas: solo el administrador ACTIVO de la institución, solo en la
--    carpeta de su institución y de un curso que le pertenece.
--    Lectura: pública por URL (sin política SELECT para anon: nadie puede listar).
-- 3. public.oferta_cursos expone portada_url AL FINAL (mismas columnas y filtro;
--    las vistas que dependen de ella no cambian).
--
-- Archivos huérfanos: la app sube primero el archivo nuevo, luego actualiza
-- portada_url y solo entonces borra el anterior; si la actualización falla,
-- borra el archivo recién subido (mismo patrón que los logotipos).
--
-- Orden: después de todas las migraciones V5 aplicadas. Independiente de
-- oferta_grupos_anon_v5.sql (pueden aplicarse en cualquier orden).
-- =====================================================================

begin;

-- 0. REQUISITOS (aborta sin aplicar nada si la base no es la esperada)
do $$
declare
  v_cols text;
  v_view text;
begin
  if to_regclass('public.cursos') is null or to_regclass('public.oferta_cursos') is null then
    raise exception 'Faltan public.cursos o public.oferta_cursos';
  end if;
  if to_regprocedure('privado.mi_institucion()') is null or to_regprocedure('privado.mi_rol_activo()') is null then
    raise exception 'Faltan privado.mi_institucion() o privado.mi_rol_activo()';
  end if;
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
  from information_schema.columns where table_schema = 'public' and table_name = 'oferta_cursos';
  if v_cols is distinct from 'id,nombre,descripcion,precio,categoria_id,categoria,institucion_id,institucion,logo_url,modalidad'
     and v_cols is distinct from 'id,nombre,descripcion,precio,categoria_id,categoria,institucion_id,institucion,logo_url,modalidad,portada_url' then
    raise exception 'public.oferta_cursos no coincide con la definición esperada: %', v_cols;
  end if;
  v_view := lower(pg_get_viewdef('public.oferta_cursos'::regclass, true));
  if position('publicado' in v_view) = 0
     or position('cat.activo' in v_view) = 0
     or position('i.activo' in v_view) = 0
     or position('c.categoria_id' in v_view) = 0
     or position('c.institucion_id' in v_view) = 0 then
    raise exception 'public.oferta_cursos tiene filtros o relaciones distintos de V5; no se reemplazó la vista';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cursos' and column_name = 'portada_url'
      and data_type <> 'text'
  ) then
    raise exception 'public.cursos.portada_url existe, pero no es text; revisar antes de aplicar';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = any(array[
        'portadas: admin lee su carpeta', 'portadas: admin sube',
        'portadas: admin reemplaza', 'portadas: admin elimina'
      ])
  ) then
    raise exception 'Ya existen políticas con nombres reservados para portadas; verificar si la migración ya fue aplicada antes de continuar';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and roles && array['authenticated', 'public']::name[]
      and (
        (cmd in ('INSERT', 'UPDATE', 'ALL') and coalesce(with_check, '') not ilike '%bucket_id%')
        or (cmd in ('SELECT', 'UPDATE', 'DELETE', 'ALL') and coalesce(qual, '') not ilike '%bucket_id%')
      )
  ) then
    raise exception 'Hay políticas globales de Storage sin filtro bucket_id; revisar el aislamiento antes de continuar';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname not like 'portadas:%'
      and (coalesce(qual, '') ilike '%portadas-cursos%'
           or coalesce(with_check, '') ilike '%portadas-cursos%')
  ) then
    raise exception 'Ya hay políticas de Storage adicionales para portadas-cursos; revisarlas antes de continuar';
  end if;
end $$;

-- 1. Columna de portada (URL pública del bucket, https).
alter table public.cursos add column if not exists portada_url text;
do $$
declare
  v_def text;
  v_validada boolean;
begin
  select pg_get_constraintdef(oid), convalidated into v_def, v_validada
  from pg_constraint
  where conrelid = 'public.cursos'::regclass and conname = 'cursos_portada_url_check';
  if v_def is null then
    alter table public.cursos add constraint cursos_portada_url_check
      check (portada_url is null or (portada_url ~ '^https://' and length(portada_url) <= 1000));
  elsif not v_validada or v_def not ilike '%portada_url%' or v_def not ilike '%https://%' or v_def not ilike '%1000%' then
    raise exception 'Ya existe cursos_portada_url_check con otra definición: %', v_def;
  end if;
end $$;
comment on column public.cursos.portada_url is
  'URL pública de la portada en el bucket portadas-cursos (null = portada generada por categoría).';

-- 2. Bucket público, 3 MB, sin SVG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portadas-cursos', 'portadas-cursos', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'portadas-cursos' and name = 'portadas-cursos' and public
      and file_size_limit = 3145728
      and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']
      and allowed_mime_types <@ array['image/png', 'image/jpeg', 'image/webp']
  ) then
    raise exception 'El bucket portadas-cursos ya existe con una configuración distinta; revisar manualmente, no se modificó';
  end if;
end $$;

-- Carpeta 1 = institución del admin; carpeta 2 = un curso de esa institución.
create policy "portadas: admin lee su carpeta" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'portadas-cursos'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
    and exists (
      select 1 from public.cursos c
      where c.id::text = (storage.foldername(name))[2] and c.institucion_id = privado.mi_institucion()
    )
  );

create policy "portadas: admin sube" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'portadas-cursos'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
    and exists (
      select 1 from public.cursos c
      where c.id::text = (storage.foldername(name))[2] and c.institucion_id = privado.mi_institucion()
    )
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
  );

create policy "portadas: admin reemplaza" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'portadas-cursos'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
    and exists (
      select 1 from public.cursos c
      where c.id::text = (storage.foldername(name))[2] and c.institucion_id = privado.mi_institucion()
    )
  )
  with check (
    bucket_id = 'portadas-cursos'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
    and exists (
      select 1 from public.cursos c
      where c.id::text = (storage.foldername(name))[2] and c.institucion_id = privado.mi_institucion()
    )
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
  );

create policy "portadas: admin elimina" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'portadas-cursos'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
    and exists (
      select 1 from public.cursos c
      where c.id::text = (storage.foldername(name))[2] and c.institucion_id = privado.mi_institucion()
    )
  );

-- 3. Catálogo público: misma vista + portada_url al final.
create or replace view public.oferta_cursos
with (security_invoker = false) as
select c.id,
       c.nombre,
       c.descripcion,
       c.precio,
       cat.id     as categoria_id,
       cat.nombre as categoria,
       i.id       as institucion_id,
       i.nombre   as institucion,
       i.logo_url,
       c.modalidad,
       c.portada_url
from public.cursos c
join public.categorias cat on cat.id = c.categoria_id
join public.instituciones i on i.id = c.institucion_id
where c.estado = 'publicado' and cat.activo and i.activo;

-- 4. Aserciones
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'oferta_cursos' and column_name = 'portada_url') then
    raise exception 'oferta_cursos no expone portada_url';
  end if;
  if not exists (select 1 from storage.buckets where id = 'portadas-cursos' and public) then
    raise exception 'El bucket portadas-cursos no quedó público';
  end if;
end $$;

commit;

-- =====================================================================
-- VERIFICACIÓN (solo lectura)
-- =====================================================================
-- select count(*) filter (where portada_url is not null) as con_portada, count(*) as cursos from public.cursos;  -- con_portada = 0 al aplicar
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'portadas-cursos';
-- select policyname, cmd from pg_policies where schemaname = 'storage' and policyname like 'portadas:%' order by 1;
-- select id, nombre, portada_url from public.oferta_cursos limit 5;

-- =====================================================================
-- REVERSIÓN (los archivos del bucket deben vaciarse antes desde el panel de Storage)
-- =====================================================================
-- CREATE OR REPLACE no puede quitar columnas y DROP VIEW ... CASCADE borraría
-- oferta_grupos y sus permisos. Por eso la vista conserva la columna, pero
-- devuelve null: la app vuelve a la portada generada.
-- begin;
-- create or replace view public.oferta_cursos with (security_invoker = false) as
-- select c.id, c.nombre, c.descripcion, c.precio, cat.id as categoria_id, cat.nombre as categoria,
--        i.id as institucion_id, i.nombre as institucion, i.logo_url, c.modalidad,
--        null::text as portada_url
-- from public.cursos c join public.categorias cat on cat.id = c.categoria_id
-- join public.instituciones i on i.id = c.institucion_id
-- where c.estado = 'publicado' and cat.activo and i.activo;
-- drop policy if exists "portadas: admin lee su carpeta" on storage.objects;
-- drop policy if exists "portadas: admin sube" on storage.objects;
-- drop policy if exists "portadas: admin reemplaza" on storage.objects;
-- drop policy if exists "portadas: admin elimina" on storage.objects;
-- alter table public.cursos drop constraint if exists cursos_portada_url_check;
-- alter table public.cursos drop column if exists portada_url;
-- delete from storage.buckets where id = 'portadas-cursos';
-- commit;
