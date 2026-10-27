-- =====================================================================
-- ACADEMIX | DIAGNÓSTICO PREVIO (SOLO LECTURA)
-- Antes de aplicar: evaluaciones_admin_v5.sql y certificados_v5.sql
--
-- Ninguna consulta modifica datos ni permisos. Ejecutar cada bloque en
-- Supabase > SQL Editor y revisar el resultado «Esperado».
-- El bloque 12 resume en una sola fila si se puede aplicar cada migración.
-- =====================================================================

-- 1. VERSIÓN DE POSTGRESQL (certificados_v5 exige 15 o superior)
select current_setting('server_version') as version, current_setting('server_version_num')::int >= 150000 as apto_pg15;

-- 2. FUNCIONES DE V5 QUE USAN LAS MIGRACIONES (todas deben existir; prosecdef = true)
select f as funcion, to_regprocedure(f) is not null as existe,
       (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(f)) as security_definer
from unnest(array[
  'privado.admin_de_institucion(uuid)', 'privado.mi_rol_activo()', 'privado.mi_institucion()',
  'privado.es_mi_matricula(uuid)', 'privado.es_docente_del_grupo(uuid)', 'privado.es_docente_de_matricula(uuid)',
  'privado.estoy_matriculado_en(uuid)', 'privado.validar_certificado()', 'public.anular_matricula(uuid)',
  'privado.estudiante_debe_a(uuid)', 'public.mis_cuotas()']) f;

-- 2b. Definición real de admin_de_institucion (confirmar que exige rol admin ACTIVO y la misma institución)
select pg_get_functiondef('privado.admin_de_institucion(uuid)'::regprocedure);

-- 3. COLUMNAS Y TIPOS (esperado: nota numeric(4,2) 0–20, peso numeric(5,2),
--    estado_final USER-DEFINED con en_curso/aprobado/desaprobado, codigo con default)
select table_name, column_name, data_type, udt_name, numeric_precision, numeric_scale, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and (table_name, column_name) in (
  ('evaluaciones','peso'), ('evaluaciones','grupo_id'), ('evaluaciones','institucion_id'),
  ('calificaciones','nota'), ('calificaciones','matricula_id'), ('calificaciones','evaluacion_id'), ('calificaciones','grupo_id'),
  ('matriculas','estado'), ('matriculas','estado_final'), ('matriculas','grupo_id'), ('matriculas','estudiante_id'),
  ('cursos','nota_aprobatoria'), ('cursos','nombre'), ('grupos','estado'), ('grupos','codigo'), ('grupos','fecha_inicio'), ('grupos','fecha_fin'),
  ('certificados','codigo'), ('certificados','matricula_id'), ('certificados','archivo_url'), ('certificados','fecha_emision'),
  ('instituciones','activo'), ('instituciones','logo_url'), ('perfiles','nombres'), ('perfiles','apellidos'))
order by table_name, column_name;

select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as valores
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typname in ('estado_final','estado_matricula','estado_pago','estado_grupo') group by t.typname;

-- 4. RESTRICCIONES CLAVE (esperado: certificados con UNIQUE en matricula_id y codigo;
--    UNIQUE (id, institucion_id) en cursos; UNIQUE (evaluacion_id, matricula_id) en calificaciones)
select conrelid::regclass as tabla, conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid in ('public.certificados'::regclass, 'public.cursos'::regclass, 'public.calificaciones'::regclass, 'public.evaluaciones'::regclass)
  and contype in ('u','p','f','c')
order by 1, 2;

-- 5. DISPARADORES ACTUALES (esperado: validar_certificado en certificados; ninguno *_v5 de estas migraciones aún)
select tgrelid::regclass as tabla, tgname, tgenabled, pg_get_triggerdef(oid) as definicion
from pg_trigger
where not tgisinternal and tgrelid in ('public.evaluaciones'::regclass, 'public.calificaciones'::regclass,
  'public.matriculas'::regclass, 'public.certificados'::regclass, 'public.pagos'::regclass)
order by 1, 2;

-- 6. POLÍTICAS ACTUALES
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename in ('evaluaciones','calificaciones','matriculas','certificados','medios_cobro_institucion')
order by 1, 2;
select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1;

-- 7. PERMISOS ACTUALES (lo que las migraciones retirarán)
select 'matriculas UPDATE (tabla)' as permiso, has_table_privilege('authenticated','public.matriculas','UPDATE') as authenticated
union all select 'matriculas.estado_final UPDATE', has_column_privilege('authenticated','public.matriculas','estado_final','UPDATE')
union all select 'matriculas.estado UPDATE', has_column_privilege('authenticated','public.matriculas','estado','UPDATE')
union all select 'certificados INSERT', has_table_privilege('authenticated','public.certificados','INSERT')
union all select 'certificados UPDATE', has_table_privilege('authenticated','public.certificados','UPDATE')
union all select 'certificados DELETE', has_table_privilege('authenticated','public.certificados','DELETE')
union all select 'evaluaciones INSERT', has_table_privilege('authenticated','public.evaluaciones','INSERT')
union all select 'calificaciones INSERT', has_table_privilege('authenticated','public.calificaciones','INSERT')
union all select 'anon lee certificados', has_table_privilege('anon','public.certificados','SELECT')
union all select 'esquema privado USAGE', has_schema_privilege('authenticated','privado','USAGE');
-- Esperado hoy: "certificados INSERT" = true (V4) → certificados_v5 lo retira.
-- "anon lee certificados" debería ser false. "esquema privado USAGE" = true (lo usan las políticas).

-- 8. OBJETOS QUE LAS MIGRACIONES CREARÁN (esperado: todo false en la primera aplicación)
select t as tabla_o_vista, to_regclass(t) is not null as ya_existe
from unnest(array[
  'public.historial_resultados', 'public.plantillas_certificado', 'public.firmantes_certificado', 'public.certificacion_curso',
  'public.certificados_contenido', 'public.solicitudes_certificado', 'public.pagos_certificado', 'public.oferta_certificacion']) t;
select f as funcion, to_regprocedure(f) is not null as ya_existe
from unnest(array[
  'public.registrar_resultado_final(uuid)', 'public.reabrir_resultado_final(uuid,text)', 'public.emitir_certificado(uuid,uuid,uuid)',
  'public.adjuntar_pdf_certificado(uuid,text)', 'public.solicitar_certificado(uuid)',
  'public.presentar_comprobante_certificado(uuid,numeric,text,text,text)', 'public.revisar_pago_certificado(uuid,boolean,text)',
  'public.verificar_certificado(text)', 'public.mis_certificados()', 'privado.grupo_editable(uuid,uuid)',
  'privado.promedio_matricula(uuid)']) f;
select id, public, file_size_limit, allowed_mime_types from storage.buckets
where id in ('certificados-recursos','certificados-emitidos','comprobantes-cursos-v5','logos-instituciones');
-- Esperado: existen comprobantes-cursos-v5 (privado) y logos-instituciones (público); los de certificados aún no.

-- 9. DATOS QUE CONVIENE REVISAR ANTES DE APLICAR
-- 9a. Grupos con pesos que ya superan 100 % (la migración no los cambia, pero no podrán cerrar resultados)
select e.grupo_id, g.codigo, sum(e.peso) as suma from public.evaluaciones e join public.grupos g on g.id = e.grupo_id
group by e.grupo_id, g.codigo having sum(e.peso) > 100;
-- 9b. Resultados finales ya registrados SIN la función de cálculo (heredados de V4): podrán certificarse tal cual
select m.estado_final, count(*) as matriculas,
       count(*) filter (where not exists (select 1 from public.calificaciones c where c.matricula_id = m.id)) as sin_notas
from public.matriculas m where m.estado = 'activa' group by m.estado_final;
-- 9c. Certificados existentes (V4/V5) y cuántos no tienen archivo
select count(*) as certificados, count(*) filter (where archivo_url is null) as sin_archivo,
       count(*) filter (where archivo_url ~* '^https?://') as con_url_externa
from public.certificados;
-- 9d. Certificados de matrículas que NO están activas y aprobadas (inconsistencias previas)
select c.id, c.codigo, m.estado, m.estado_final from public.certificados c join public.matriculas m on m.id = c.matricula_id
where m.estado <> 'activa' or m.estado_final <> 'aprobado';
-- 9e. Notas fuera de rango o de matrículas de otro grupo (deben ser 0 por las restricciones de V5)
select count(*) filter (where nota < 0 or nota > 20) as fuera_de_rango from public.calificaciones;
-- 9f. Instituciones inactivas (no podrán registrar resultados ni emitir)
select id, nombre from public.instituciones where not activo;

-- 10. MIGRACIONES RELACIONADAS
select to_regclass('public.medios_cobro_institucion') is not null as medios_cobro_aplicada,
       to_regclass('public.correos_salientes') is not null as correos_aplicada;
-- Esperado: medios_cobro_aplicada = true; correos_aplicada = false (el evento de correo quedará inactivo).

-- 11. QUIÉN SERÁ DUEÑO DE LAS FUNCIONES (debe ser postgres para que SECURITY DEFINER omita RLS)
select current_user as usuario_actual, (select rolbypassrls from pg_roles where rolname = current_user) as omite_rls;

-- 12. RESUMEN: ¿se puede aplicar?
select
  current_setting('server_version_num')::int >= 150000 as pg15,
  to_regprocedure('privado.admin_de_institucion(uuid)') is not null
    and to_regprocedure('privado.mi_rol_activo()') is not null
    and to_regprocedure('privado.mi_institucion()') is not null as funciones_v5,
  not exists (select 1 from public.evaluaciones group by grupo_id having sum(peso) > 100) as pesos_ok,
  to_regclass('public.historial_resultados') is null as evaluaciones_sin_aplicar,
  to_regclass('public.plantillas_certificado') is null as certificados_sin_aplicar,
  to_regclass('public.medios_cobro_institucion') is not null as medios_aplicada;
-- Si pg15 y funciones_v5 son true: aplicar evaluaciones_admin_v5 y luego certificados_v5.
-- pesos_ok = false no impide aplicar; solo avisa de grupos que deben corregirse.
