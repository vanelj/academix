-- =====================================================================
-- DIAGNÓSTICO PREVIO (SOLO LECTURA) — administracion_v5.sql
-- Ejecutar en Supabase > SQL Editor ANTES de aplicar. No modifica nada.
-- =====================================================================

-- 1. ¿Ya aplicada? (esperado antes: null / 0 filas)
select to_regclass('public.administradores_institucion') as tabla_equipo;
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'instituciones' and column_name = 'docentes_gestionan_enlaces';

-- 2. Administradores actuales por institución (todos pasarán a PRINCIPAL con acceso completo).
select i.nombre, count(*) filter (where ur.activo) as admins_activos, count(*) as admins_total
  from public.usuario_roles ur join public.instituciones i on i.id = ur.institucion_id
 where ur.rol = 'admin' group by i.nombre order by 1;

-- 3. Roles admin sin perfil en la misma institución (esperado: 0; no recibirían fila).
select count(*) as roles_admin_sin_perfil
  from public.usuario_roles ur
 where ur.rol = 'admin'
   and not exists (select 1 from public.perfiles p where p.id = ur.perfil_id and p.institucion_id = ur.institucion_id);

-- 4. Tablas a las que se añadirán políticas restrictivas (deben existir con institucion_id).
select t.table_name, (c.column_name is not null) as tiene_institucion_id
  from (values ('categorias'),('cursos'),('condiciones_curso'),('plan_cuotas'),('grupos'),('horarios'),('materiales_curso'),
               ('matriculas'),('solicitudes_inscripcion'),('pagos'),('cuotas'),('medios_cobro_institucion'),
               ('evaluaciones'),('calificaciones'),('plantillas_certificado'),('firmantes_certificado'),
               ('certificacion_curso'),('certificados'),('politicas_institucion')) as t(table_name)
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'institucion_id';

-- 5. Políticas restrictivas previas con el mismo nombre (esperado: 0).
select tablename, policyname from pg_policies where policyname like 'v5 permiso admin%';
