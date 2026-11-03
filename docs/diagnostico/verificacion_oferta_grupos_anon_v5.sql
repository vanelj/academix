-- ACADEMIX | OFERTA_GRUPOS_ANON_V5 — VERIFICACIÓN DE SOLO LECTURA
-- Ejecutar en Supabase SQL Editor. No modifica tablas, políticas ni datos.

-- 1. Función pública de disponibilidad, permiso de consulta para anon y
--    confirmación de que anon no recibió acceso al esquema privado.
select to_regprocedure('public.vacantes_oferta(uuid)') is not null as existe_funcion_publica,
       case
         when to_regprocedure('public.vacantes_oferta(uuid)') is not null
         then has_function_privilege('anon', to_regprocedure('public.vacantes_oferta(uuid)'), 'EXECUTE')
         else false
       end as anon_puede_ejecutarla,
       has_schema_privilege('anon', 'privado', 'USAGE') as anon_tiene_acceso_a_privado;

-- 2. Permiso de lectura, columnas y definición real de la vista pública.
select to_regclass('public.oferta_grupos') is not null as existe_vista,
       case
         when to_regclass('public.oferta_grupos') is not null
         then has_table_privilege('anon', 'public.oferta_grupos', 'SELECT')
         else false
       end as anon_puede_consultar_vista,
       case when to_regclass('public.oferta_grupos') is not null
            then pg_get_viewdef(to_regclass('public.oferta_grupos'), true)
       end as definicion_oferta_grupos;

select table_schema, table_name, ordinal_position, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'oferta_grupos'
order by ordinal_position;

-- 3. Verificación efectiva bajo anon. Transacción de solo lectura; ROLLBACK
--    revierte únicamente el contexto de la transacción, no cambia datos.
begin;
set local role anon;
select id, curso_id, codigo, estado, vacantes_disponibles
from public.oferta_grupos
order by fecha_inicio
limit 20;
rollback;
