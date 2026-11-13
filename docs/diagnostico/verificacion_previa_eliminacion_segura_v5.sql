-- =====================================================================
-- DIAGNÓSTICO PREVIO (SOLO LECTURA) — eliminacion_segura_v5.sql y correos_academicos_v5.sql
-- No modifica nada.
-- =====================================================================

-- 1. ¿Ya aplicadas? (esperado antes: nulls)
select to_regprocedure('public.eliminar_curso(uuid,text)') as eliminar_curso,
       to_regprocedure('public.eliminar_grupo(uuid,text)') as eliminar_grupo,
       to_regprocedure('privado.correo_horario()') as correo_horario;

-- 2. Todas las claves foráneas que apuntan a cursos, grupos, condiciones_curso,
--    plan_cuotas y evaluaciones. Las conocidas son: grupos, condiciones_curso,
--    certificacion_curso, plan_cuotas, horarios, evaluaciones, matriculas,
--    calificaciones, solicitudes_inscripcion y materiales_curso. Cualquier otra
--    aparecerá en el diagnóstico de la app como «dependencia no prevista».
select cl.relname as tabla, c.conname as restriccion, c.confrelid::regclass as referencia,
       pg_get_constraintdef(c.oid) as definicion
  from pg_constraint c join pg_class cl on cl.oid = c.conrelid
 where c.contype = 'f'
   and c.confrelid in ('public.cursos'::regclass, 'public.grupos'::regclass, 'public.condiciones_curso'::regclass,
                       'public.plan_cuotas'::regclass, 'public.evaluaciones'::regclass)
 order by 3, 1;

-- 3. Disparadores sobre esas tablas que podrían actuar al borrar (revisar que ninguno bloquee).
select tgname, tgrelid::regclass as tabla, pg_get_triggerdef(oid) as definicion
  from pg_trigger
 where not tgisinternal
   and tgrelid in ('public.cursos'::regclass, 'public.grupos'::regclass, 'public.horarios'::regclass,
                   'public.evaluaciones'::regclass, 'public.plan_cuotas'::regclass, 'public.condiciones_curso'::regclass)
 order by 2, 1;

-- 4. Cursos que HOY se podrían eliminar (sin matrículas ni solicitudes en sus grupos).
select c.nombre, c.estado::text,
       (select count(*) from public.grupos g where g.curso_id = c.id) as grupos
  from public.cursos c
 where not exists (select 1 from public.grupos g join public.matriculas m on m.grupo_id = g.id where g.curso_id = c.id)
   and not exists (select 1 from public.grupos g join public.solicitudes_inscripcion s on s.grupo_id = g.id where g.curso_id = c.id)
 order by c.nombre;
