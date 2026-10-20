-- =====================================================================
-- CURSOS VIRTUALES | DIAGNÓSTICO V5 (SOLO LECTURA)
-- Ejecutar en Supabase > SQL Editor. Todas las consultas son SELECT sobre
-- el catálogo de PostgreSQL: no crean, modifican ni borran nada.
-- Sirven para confirmar lo que la aplicación no puede ver con la clave
-- pública: restricciones, políticas RLS, permisos y funciones.
-- Puede ejecutarse una a una (seleccionando el bloque) o todo junto.
-- =====================================================================

-- 1. Tablas y vistas V5 presentes (esperado: 13 filas)
select table_name, table_type
from information_schema.tables
where table_schema = 'public'
  and table_name in ('categorias','cursos','instituciones','politicas_institucion',
                     'solicitudes_inscripcion','condiciones_curso','plan_cuotas','cuotas',
                     'oferta_cursos','oferta_grupos','oferta_condiciones',
                     'oferta_politicas_institucion','oferta_horarios')
order by table_name;

-- 2. Columnas reales de categorias
--    Esperado: id uuid, institucion_id uuid NOT NULL, nombre text NOT NULL,
--    descripcion text, activo boolean NOT NULL default true, created_at timestamptz.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'categorias'
order by ordinal_position;

-- 3. Restricciones de categorias y la FK de cursos hacia categorias
--    Esperado: PK(id); UNIQUE(institucion_id, nombre); UNIQUE(id, institucion_id);
--    CHECK(length(trim(nombre)) > 0); FK institucion_id -> instituciones;
--    en cursos: FK (categoria_id, institucion_id) -> categorias(id, institucion_id)
--    con confdeltype = 'a' (NO ACTION: impide borrar categorías en uso).
select conrelid::regclass as tabla, conname, contype, confdeltype,
       pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid in ('public.categorias'::regclass, 'public.cursos'::regclass)
order by tabla, contype, conname;

-- 4. RLS activado (esperado: true en todas)
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('categorias','cursos','instituciones','politicas_institucion','solicitudes_inscripcion');

-- 5. Políticas RLS de categorias y cursos
--    Esperado en categorias: "ver categorias" (SELECT) y "admin gestiona categorias" (ALL)
--    ambas con privado.mi_institucion() y, la segunda, mi_rol_activo() = 'admin'.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('categorias','cursos')
order by tablename, policyname;

-- 6. Permisos de authenticated y anon sobre categorias
--    Esperado: authenticated SELECT, INSERT, UPDATE, DELETE; anon ninguno.
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as permisos
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'categorias'
  and grantee in ('anon','authenticated')
group by grantee;

-- 7. Funciones auxiliares usadas por las políticas (esperado: true, true)
select has_function_privilege('authenticated', 'privado.mi_institucion()', 'execute') as mi_institucion,
       has_function_privilege('authenticated', 'privado.mi_rol_activo()', 'execute')  as mi_rol_activo;

-- 8. Disparadores sobre categorias (esperado: ninguno)
select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.categorias'::regclass and not tgisinternal;

-- 9. Bucket de logotipos y sus políticas (esperado: 1 bucket público y 4 políticas "logos:")
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'logos-instituciones';
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'logos:%';
