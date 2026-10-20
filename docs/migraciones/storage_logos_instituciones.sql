-- =====================================================================
-- CURSOS VIRTUALES | STORAGE: LOGOTIPOS DE INSTITUCIONES
-- Requiere la base V5 instalada (usa privado.mi_institucion() y
-- privado.mi_rol_activo(), definidas en V4 y vigentes en V5).
--
-- NO modifica tablas de V5. Solo crea/configura un bucket de Storage y sus
-- políticas sobre storage.objects. Es idempotente: puede ejecutarse de nuevo.
--
-- Modelo de rutas:  <uuid-de-la-institución>/logo-<marca-de-tiempo>-<aleatorio>.<png|jpg|webp>
--   - La primera carpeta DEBE ser la institución del administrador que sube.
--   - Las políticas comparan esa carpeta con privado.mi_institucion(), que la
--     BD calcula desde el perfil de auth.uid(): el navegador no puede elegir
--     otra institución.
--
-- Lectura: el bucket es público. Los logotipos se sirven por su URL pública
-- (/storage/v1/object/public/logos-instituciones/...) sin política SELECT para
-- anónimos; así nadie puede LISTAR el bucket, solo abrir URLs conocidas.
-- =====================================================================

begin;

-- 1. Bucket: público, máximo 2 MB, solo PNG, JPEG y WebP (sin SVG).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos-instituciones',
  'logos-instituciones',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Políticas. Solo usuarios autenticados con rol ACTIVO admin y únicamente
--    dentro de la carpeta de SU institución. Extensiones restringidas.
drop policy if exists "logos: admin lee su carpeta"      on storage.objects;
drop policy if exists "logos: admin sube a su carpeta"   on storage.objects;
drop policy if exists "logos: admin reemplaza su logo"   on storage.objects;
drop policy if exists "logos: admin elimina su logo"     on storage.objects;

-- SELECT (necesario para operaciones de la API como remove/upsert sobre sus
-- propios objetos). La lectura pública por URL no depende de esta política.
create policy "logos: admin lee su carpeta" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'logos-instituciones'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
  );

create policy "logos: admin sube a su carpeta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos-instituciones'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
  );

create policy "logos: admin reemplaza su logo" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos-instituciones'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
  )
  with check (
    bucket_id = 'logos-instituciones'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
  );

create policy "logos: admin elimina su logo" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos-instituciones'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
  );

commit;

-- =====================================================================
-- COMPROBACIONES (ejecutar después, solo lectura)
-- =====================================================================
-- Bucket configurado:
--   select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'logos-instituciones';
--
-- Políticas creadas (deben aparecer 4):
--   select policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname like 'logos:%';
--
-- Permiso de las funciones usadas por las políticas (deben ser true):
--   select has_function_privilege('authenticated', 'privado.mi_institucion()', 'execute'),
--          has_function_privilege('authenticated', 'privado.mi_rol_activo()', 'execute');
--
-- =====================================================================
-- PARA REVERTIR (solo si se decide retirar la funcionalidad)
-- =====================================================================
-- 1) Quitar las referencias y las políticas:
--   update public.instituciones set logo_url = null
--     where logo_url like '%/storage/v1/object/public/logos-instituciones/%';
--   drop policy if exists "logos: admin lee su carpeta"    on storage.objects;
--   drop policy if exists "logos: admin sube a su carpeta" on storage.objects;
--   drop policy if exists "logos: admin reemplaza su logo" on storage.objects;
--   drop policy if exists "logos: admin elimina su logo"   on storage.objects;
-- 2) Vaciar y eliminar el bucket desde el Dashboard (Storage > logos-instituciones):
--    Supabase no permite borrar objetos ni buckets con SQL directo sobre storage.*.
