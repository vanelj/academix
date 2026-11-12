-- =====================================================================
-- DIAGNÓSTICO PREVIO (SOLO LECTURA) — aula_academica_v5.sql
-- Ejecutar en Supabase > SQL Editor ANTES de aplicar la migración.
-- No modifica nada. Cada consulta indica el resultado esperado.
-- =====================================================================

-- 1. Requisitos: todas deben devolver un valor (no null).
select to_regprocedure('public.registrar_resultado_final(uuid)') as evaluaciones_admin_v5,
       to_regprocedure('public.mis_cursos()')                    as mis_cursos_v5,
       to_regprocedure('privado.admin_de_institucion(uuid)')     as admin_de_institucion,
       (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'cursos' and column_name = 'portada_url') as portadas_cursos_v5;

-- 2. Política actual de lectura de notas (esperado: contiene es_mi_matricula y es_docente_del_grupo).
select policyname, qual from pg_policies where schemaname = 'public' and tablename = 'calificaciones';

-- 3. ¿La migración ya está aplicada? (esperado antes: 0 filas en cada una)
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'evaluaciones' and column_name in ('publicada_en', 'publicada_por');
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'horarios' and column_name = 'ubicacion';
select to_regclass('public.materiales_curso') as materiales_curso;
select id, public from storage.buckets where id = 'materiales-curso';

-- 4. Impacto de la publicación: evaluaciones con notas que HOY ve el estudiante
--    y que quedarán ocultas hasta publicarlas (ver bloque OPCIONAL 7).
select count(distinct e.id) as evaluaciones_con_notas, count(c.id) as notas
  from public.evaluaciones e join public.calificaciones c on c.evaluacion_id = e.id;

-- 5. ¿Está aplicada notificaciones_v5? (si devuelve null, la publicación no genera avisos; no es error)
select to_regclass('public.notificaciones') as notificaciones,
       to_regprocedure('privado.notificar(uuid,text,uuid,text,text,text,text,text)') as notificar;

-- 6. Protección de pagos (pendiente según el registro del proyecto):
--    ¿está aplicada solicitudes_estado_grupo_v5? Revisa su sección de verificación.
--    Esperado si está aplicada: 2 filas (exigir_grupo_admite_matricula y exigir_grupo_admite_confirmacion).
select tgname, tgrelid::regclass from pg_trigger
 where tgname in ('exigir_grupo_admite_matricula', 'exigir_grupo_admite_confirmacion');
