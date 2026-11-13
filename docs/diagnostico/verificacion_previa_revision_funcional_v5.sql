-- =====================================================================
-- ACADEMIX | DIAGNÓSTICO PREVIO (SOLO LECTURA) — revision_funcional_v5
-- No modifica nada. Ejecutar en el SQL Editor antes de aplicar la migración.
-- =====================================================================

-- 1. Requisitos (todas deben ser true)
select
  to_regclass('public.calificaciones') is not null                         as calificaciones,
  to_regclass('public.materiales_curso') is not null                       as aula_academica_aplicada,
  to_regclass('public.pagos_certificado') is not null                      as certificados_v5,
  to_regprocedure('privado.evaluacion_publicada(uuid)') is not null        as evaluacion_publicada,
  to_regprocedure('privado.estoy_matriculado_en(uuid)') is not null        as estoy_matriculado_en,
  exists (select 1 from pg_policies where tablename = 'calificaciones' and policyname = 'ver calificaciones'
          and qual like '%evaluacion_publicada%')                          as politica_notas_esperada,
  not exists (select 1 from storage.buckets where id = 'entregas-tareas')  as bucket_entregas_libre;

-- 2. Opcionales (solo cambian los avisos)
select to_regprocedure('privado.notificar_admins(uuid,text,text,text,text,text)') is not null as notificaciones_v5,
       to_regclass('public.administradores_institucion') is not null                     as administracion_v5;

-- 3. Qué se escribe hoy directamente en calificaciones (tras la migración, solo por funciones)
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'calificaciones' and grantee = 'authenticated' order by 2;

-- 4. Volumen actual de notas (no se modifican; quedan con publicada_en = null y su visibilidad actual)
select count(*) as notas, count(distinct evaluacion_id) as evaluaciones_con_notas from public.calificaciones;

-- 5. Docentes con cruces REALES hoy (mismo docente, mismo día, horas superpuestas, periodos que comparten ese día)
select g1.docente_id, g1.codigo as grupo_a, g2.codigo as grupo_b, h1.dia_semana, h1.hora_inicio, h1.hora_fin, h2.hora_inicio as b_inicio, h2.hora_fin as b_fin
from public.grupos g1
join public.grupos g2 on g2.docente_id = g1.docente_id and g2.id > g1.id
join public.horarios h1 on h1.grupo_id = g1.id
join public.horarios h2 on h2.grupo_id = g2.id and h2.dia_semana = h1.dia_semana
where g1.docente_id is not null
  and g1.estado::text in ('programado','abierto','en_curso') and g2.estado::text in ('programado','abierto','en_curso')
  and h1.hora_inicio < h2.hora_fin and h2.hora_inicio < h1.hora_fin
  and greatest(g1.fecha_inicio, g2.fecha_inicio) <= least(g1.fecha_fin, g2.fecha_fin)
limit 50;
