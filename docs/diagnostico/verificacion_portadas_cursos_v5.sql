-- ACADEMIX | PORTADAS V5 — DIAGNÓSTICO PREVIO Y VERIFICACIÓN POSTERIOR
-- Todas las sentencias de este archivo son de solo lectura.
-- Ejecutar primero la sección PREVIO en Supabase SQL Editor.
-- Ejecutar POSTERIOR solo después de que un responsable aplique la migración.

-- =====================================================================
-- PREVIO: comprobar requisitos y si la migración parece estar aplicada
-- =====================================================================

-- 1. PostgreSQL y funciones institucionales requeridas por las políticas.
select current_setting('server_version') as postgres_version,
       to_regprocedure('privado.mi_institucion()') is not null as existe_mi_institucion,
       to_regprocedure('privado.mi_rol_activo()') is not null as existe_mi_rol_activo;

-- 2. Estado de cursos.portada_url y definición actual de oferta_cursos.
select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where (table_schema, table_name, column_name) in
  (('public', 'cursos', 'portada_url'), ('public', 'oferta_cursos', 'portada_url'))
order by table_name;

select table_schema, table_name, ordinal_position, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'oferta_cursos'
order by ordinal_position;

select case when to_regclass('public.oferta_cursos') is not null
            then pg_get_viewdef(to_regclass('public.oferta_cursos'), true)
       end as definicion_oferta_cursos;

select distinct n.nspname as esquema, v.relname as vista_dependiente,
       pg_get_viewdef(v.oid, true) as definicion
from pg_depend d
join pg_rewrite r on r.oid = d.objid
join pg_class v on v.oid = r.ev_class and v.relkind in ('v', 'm')
join pg_namespace n on n.oid = v.relnamespace
where d.refobjid = to_regclass('public.oferta_cursos')
  and v.oid <> to_regclass('public.oferta_cursos')
order by n.nspname, v.relname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'oferta_cursos'
order by grantee, privilege_type;

-- 3. Configuración previa del bucket y cualquier política que ya lo mencione.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'portadas-cursos';

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (policyname like 'portadas:%'
       or coalesce(qual, '') ilike '%portadas-cursos%'
       or coalesce(with_check, '') ilike '%portadas-cursos%'
       or (roles && array['authenticated', 'public']::name[] and (
         (cmd in ('INSERT', 'UPDATE', 'ALL') and coalesce(with_check, '') not ilike '%bucket_id%')
         or (cmd in ('SELECT', 'UPDATE', 'DELETE', 'ALL') and coalesce(qual, '') not ilike '%bucket_id%')
       )))
order by policyname;

-- 4. Datos actuales del curso que se quiere preservar. Una portada NULL es válida.
select c.id, c.nombre, i.nombre as institucion,
       to_jsonb(c)->>'portada_url' as portada_url_si_existe
from public.cursos c
join public.instituciones i on i.id = c.institucion_id
where c.nombre = 'Programación con Python desde Cero'
  and i.nombre = 'Academia Virtual Nova';

-- 5. Conteo y valores de portada actuales sin asumir que la columna existe.
-- Si la columna aún no existe, el resultado de to_jsonb permite ver su ausencia
-- sin referenciar directamente cursos.portada_url.
select count(*) as total_cursos,
       count(*) filter (where to_jsonb(c) ? 'portada_url') as filas_con_columna,
       count(*) filter (where nullif(to_jsonb(c)->>'portada_url', '') is not null) as filas_con_valor
from public.cursos c;

-- =====================================================================
-- POSTERIOR: ejecutar únicamente después de aplicar la migración aprobada
-- =====================================================================

-- 6. La columna debe existir como text y seguir siendo nullable.
select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'cursos' and column_name = 'portada_url';

-- 7. Bucket público y límite/formats exactos esperados.
select id, name, public, file_size_limit, allowed_mime_types,
       public and file_size_limit = 3145728
         and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']
         and allowed_mime_types <@ array['image/png', 'image/jpeg', 'image/webp'] as configuracion_esperada
from storage.buckets
where id = 'portadas-cursos';

-- 8. Políticas añadidas para este bucket. Confirmar que solo son las de la migración.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (policyname like 'portadas:%'
       or coalesce(qual, '') ilike '%portadas-cursos%'
       or coalesce(with_check, '') ilike '%portadas-cursos%'
       or (roles && array['authenticated', 'public']::name[] and (
         (cmd in ('INSERT', 'UPDATE', 'ALL') and coalesce(with_check, '') not ilike '%bucket_id%')
         or (cmd in ('SELECT', 'UPDATE', 'DELETE', 'ALL') and coalesce(qual, '') not ilike '%bucket_id%')
       )))
order by policyname;

-- 9. La vista mantiene sus columnas originales y añade portada_url al final.
select table_schema, table_name, ordinal_position, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'oferta_cursos'
order by ordinal_position;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'oferta_cursos'
order by grantee, privilege_type;

-- 10. Ningún curso debe desaparecer ni alterarse por aplicar la migración.
-- Compara estos resultados con PREVIO. La columna puede contener una URL si ya
-- existía antes; la migración no actualiza filas de cursos.
select count(*) as total_cursos,
       count(*) filter (where portada_url is not null) as cursos_con_portada
from public.cursos;

select c.id, c.nombre, i.nombre as institucion, c.portada_url
from public.cursos c
join public.instituciones i on i.id = c.institucion_id
where c.nombre = 'Programación con Python desde Cero'
  and i.nombre = 'Academia Virtual Nova';
