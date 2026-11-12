-- =====================================================================
-- DIAGNÓSTICO DE SOLO LECTURA — ids generados por el asistente de cursos
-- ---------------------------------------------------------------------
-- El asistente genera en el navegador el id (uuid v4) de los cursos,
-- grupos, cuotas del plan y horarios nuevos, y lo envía al crearlos para
-- que un reintento no los duplique. Esta consulta comprueba en la base
-- REAL que eso es compatible con V5:
--   1. id es uuid con valor por defecto (se puede enviar uno propio).
--   2. el rol authenticated puede insertar la columna id.
--   3. las políticas RLS de inserción no restringen el id.
--   4. ningún disparador BEFORE INSERT reemplaza el id.
--   5. claves únicas que el asistente da por supuestas.
-- No modifica nada: transacción de solo lectura que termina en ROLLBACK.
-- Ejecutar en el SQL Editor de Supabase y revisar el bloque 6 (resumen).
-- =====================================================================
begin;
set transaction read only;

-- 1. Tipo y valor por defecto de id
select table_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and column_name = 'id'
  and table_name in ('cursos', 'grupos', 'plan_cuotas', 'horarios')
order by table_name;

-- 2. Permiso de inserción del rol authenticated (tabla y columna id)
select t.tabla,
       has_table_privilege('authenticated', 'public.' || t.tabla, 'INSERT')        as insert_tabla,
       has_column_privilege('authenticated', 'public.' || t.tabla, 'id', 'INSERT') as insert_columna_id
from (values ('cursos'), ('grupos'), ('plan_cuotas'), ('horarios')) as t(tabla)
order by t.tabla;

-- 3. Políticas RLS que afectan a la inserción (revisar que with_check no use "id")
select tablename, policyname, cmd, roles, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('cursos', 'grupos', 'plan_cuotas', 'horarios')
  and cmd in ('INSERT', 'ALL')
order by tablename, policyname;

-- 4. Disparadores de usuario en esas tablas (un BEFORE INSERT podría cambiar el id)
select c.relname as tabla, tg.tgname as disparador, p.proname as funcion,
       (tg.tgtype & 2) <> 0 as es_before,
       (tg.tgtype & 4) <> 0 as en_insert
from pg_trigger tg
join pg_class c on c.oid = tg.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = tg.tgfoid
where n.nspname = 'public'
  and c.relname in ('cursos', 'grupos', 'plan_cuotas', 'horarios')
  and not tg.tgisinternal
order by c.relname, tg.tgname;

-- 5. Claves primarias y únicas
select c.relname as tabla, con.conname as restriccion, con.contype as tipo,
       pg_get_constraintdef(con.oid) as definicion
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('cursos', 'grupos', 'plan_cuotas', 'horarios')
  and con.contype in ('p', 'u')
order by c.relname, con.conname;

-- 6. Resumen: todo debe salir en true
select
  (select bool_and(data_type = 'uuid' and column_default is not null)
     from information_schema.columns
    where table_schema = 'public' and column_name = 'id'
      and table_name in ('cursos', 'grupos', 'plan_cuotas', 'horarios'))                     as ids_uuid_con_defecto,
  (select bool_and(has_column_privilege('authenticated', 'public.' || t, 'id', 'INSERT'))
     from unnest(array['cursos', 'grupos', 'plan_cuotas', 'horarios']) as t)                 as authenticated_inserta_id,
  (select coalesce(bool_and(coalesce(with_check, '') !~* '(^|[^_a-z])id([^_a-z]|$)'), true)
     from pg_policies
    where schemaname = 'public' and tablename in ('cursos', 'grupos', 'plan_cuotas', 'horarios')
      and cmd in ('INSERT', 'ALL'))                                                          as politicas_no_restringen_id,
  (select count(*) = 4
     from pg_constraint con join pg_class c on c.oid = con.conrelid
    where c.relnamespace = 'public'::regnamespace and con.contype = 'p'
      and c.relname in ('cursos', 'grupos', 'plan_cuotas', 'horarios'))                      as cuatro_claves_primarias,
  exists (select 1 from pg_constraint con join pg_class c on c.oid = con.conrelid
           where c.relnamespace = 'public'::regnamespace and c.relname = 'grupos' and con.contype = 'u'
             and pg_get_constraintdef(con.oid) ilike '%(curso_id, codigo)%')                as grupos_codigo_unico,
  exists (select 1 from pg_constraint con join pg_class c on c.oid = con.conrelid
           where c.relnamespace = 'public'::regnamespace and c.relname = 'plan_cuotas' and con.contype = 'u'
             and pg_get_constraintdef(con.oid) ilike '%(curso_id, numero)%')                as plan_numero_unico;

-- Si «politicas_no_restringen_id» sale false, revisar a mano el bloque 3: puede ser un
-- falso positivo si with_check menciona el id de OTRA tabla (p. ej. «c.id» en una subconsulta);
-- curso_id, grupo_id o institucion_id no cuentan. Solo importa una condición sobre el id de la fila nueva.
-- Si algún disparador del bloque 4 es BEFORE + INSERT, comprobar que no asigne NEW.id.

rollback;
