-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA) — Eliminación segura de cursos y grupos
-- ---------------------------------------------------------------------
-- POR QUÉ: hoy cualquier grupo (aunque esté vacío) o un plan de cuotas impiden
-- eliminar un curso, y el borrado se hace en varios pasos desde la app.
--
-- QUÉ AÑADE (no modifica tablas, datos ni funciones existentes):
--   diagnostico_eliminar_curso(curso)  · diagnostico_eliminar_grupo(grupo)
--     Solo lectura: qué se borraría y qué historial lo impide (conteos reales).
--   eliminar_curso(curso, confirmacion) · eliminar_grupo(grupo, confirmacion)
--     UNA transacción: bloquea el curso/grupos, REVALIDA, exige escribir el
--     nombre (curso) o el código (grupo) y borra la configuración en orden. Si
--     algo falla (incluida una dependencia no prevista), se revierte TODO.
--
-- HISTORIAL QUE NUNCA SE BORRA (si existe, no se elimina nada):
--   matrículas (también anuladas), solicitudes de inscripción y, a través de
--   ellas, pagos, comprobantes, cuotas, calificaciones, resultados
--   (historial_resultados) y certificados. Calificaciones solo existen con
--   matrícula; aun así se cuentan. Cualquier otra tabla que referencie al curso
--   o a sus grupos se informa como «dependencia no prevista» y bloquea.
-- CONFIGURACIÓN QUE SE BORRA con el curso/grupo: condiciones, plan de cuotas
--   (sin cuotas generadas: las cuotas cuelgan de matrículas), configuración del
--   certificado, grupos sin historial, horarios y enlaces, evaluaciones sin
--   notas, materiales. Los ARCHIVOS (portada y materiales) los limpia la app
--   DESPUÉS (Storage no es transaccional): estas funciones devuelven sus rutas.
--
-- PERMISOS: administrador de la institución del curso; con administracion_v5,
--   módulo «cursos» (curso) o «docentes» (grupo). SECURITY DEFINER con
--   search_path vacío; anon sin acceso. Llamarlas directamente no salta nada:
--   las reglas están DENTRO de la función.
--
-- ORDEN: independiente de administracion_v5 y correos_academicos_v5.
-- Diagnóstico previo: docs/diagnostico/verificacion_previa_eliminacion_segura_v5.sql
-- =====================================================================
begin;

do $$
begin
  if to_regclass('public.cursos') is null or to_regclass('public.grupos') is null
     or to_regclass('public.condiciones_curso') is null or to_regclass('public.plan_cuotas') is null
     or to_regclass('public.solicitudes_inscripcion') is null then
    raise exception 'Faltan tablas de V5';
  end if;
  if to_regprocedure('privado.admin_de_institucion(uuid)') is null then
    raise exception 'Falta privado.admin_de_institucion(uuid)';
  end if;
end $$;

-- Permiso del administrador sobre un módulo (con o sin administracion_v5).
create or replace function privado.admin_modulo(p_institucion uuid, p_modulo text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v boolean;
begin
  if not privado.admin_de_institucion(p_institucion) then return false; end if;
  if to_regprocedure('privado.admin_puede(uuid,text)') is null then return true; end if;
  execute 'select privado.admin_puede($1, $2)' into v using p_institucion, p_modulo;
  return coalesce(v, false);
end $$;

-- Cuenta filas de una tabla OPCIONAL (0 si no existe) con un filtro sobre ids.
create or replace function privado.contar_si_existe(p_tabla text, p_columna text, p_ids uuid[])
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare n bigint;
begin
  if to_regclass('public.' || p_tabla) is null or cardinality(p_ids) = 0 then return 0; end if;
  execute format('select count(*) from public.%I where %I = any ($1)', p_tabla, p_columna) into n using p_ids;
  return n;
end $$;

-- Núcleo del diagnóstico para un conjunto de grupos (los de un curso o uno solo).
create or replace function privado.diagnostico_grupos(p_grupos uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_mats uuid[]; v_sols uuid[]; v_cuotas uuid[]; v_evals uuid[]; v_inesperadas jsonb := '[]'::jsonb; r record; n bigint;
  v_conocidas text[] := array['horarios','evaluaciones','matriculas','calificaciones','solicitudes_inscripcion','materiales_curso'];
begin
  select coalesce(array_agg(id), '{}') into v_mats from public.matriculas where grupo_id = any (p_grupos);
  select coalesce(array_agg(id), '{}') into v_sols from public.solicitudes_inscripcion where grupo_id = any (p_grupos);
  select coalesce(array_agg(id), '{}') into v_cuotas from public.cuotas where matricula_id = any (v_mats);
  select coalesce(array_agg(id), '{}') into v_evals from public.evaluaciones where grupo_id = any (p_grupos);
  -- Tablas no previstas que referencian a grupos con una columna grupo_id.
  for r in
    select distinct cl.relname as tabla
      from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
     where c.contype = 'f' and c.confrelid = 'public.grupos'::regclass and ns.nspname = 'public'
       and not (cl.relname = any (v_conocidas))
       and exists (select 1 from information_schema.columns ic where ic.table_schema = 'public' and ic.table_name = cl.relname and ic.column_name = 'grupo_id')
  loop
    n := privado.contar_si_existe(r.tabla, 'grupo_id', p_grupos);
    if n > 0 then v_inesperadas := v_inesperadas || jsonb_build_object('tabla', r.tabla, 'filas', n); end if;
  end loop;
  return jsonb_build_object(
    'grupos', cardinality(p_grupos),
    'horarios', (select count(*) from public.horarios where grupo_id = any (p_grupos)),
    'evaluaciones', cardinality(v_evals),
    'materiales', privado.contar_si_existe('materiales_curso', 'grupo_id', p_grupos),
    'matriculas', cardinality(v_mats),
    'matriculas_anuladas', (select count(*) from public.matriculas where id = any (v_mats) and estado::text = 'anulada'),
    'solicitudes', cardinality(v_sols),
    'pagos', (select count(*) from public.pagos p
               where p.matricula_id = any (v_mats) or p.solicitud_id = any (v_sols) or p.cuota_id = any (v_cuotas)),
    'cuotas', cardinality(v_cuotas),
    'calificaciones', (select count(*) from public.calificaciones where evaluacion_id = any (v_evals) or matricula_id = any (v_mats)),
    'resultados', privado.contar_si_existe('historial_resultados', 'matricula_id', v_mats),
    'certificados', privado.contar_si_existe('certificados', 'matricula_id', v_mats),
    'inesperadas', v_inesperadas);
end $$;

create or replace function privado.historial_vacio(d jsonb) returns boolean language sql immutable set search_path = '' as $$
  select coalesce((d->>'matriculas')::int, 0) = 0 and coalesce((d->>'solicitudes')::int, 0) = 0
     and coalesce((d->>'pagos')::int, 0) = 0 and coalesce((d->>'cuotas')::int, 0) = 0
     and coalesce((d->>'calificaciones')::int, 0) = 0 and coalesce((d->>'resultados')::int, 0) = 0
     and coalesce((d->>'certificados')::int, 0) = 0 and jsonb_array_length(coalesce(d->'inesperadas', '[]'::jsonb)) = 0
$$;

-- ---------------------------------------------------------------------------
-- CURSO
create or replace function public.diagnostico_eliminar_curso(p_curso uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_c record; v_grupos uuid[]; d jsonb; v_inesperadas jsonb := '[]'::jsonb; r record; n bigint;
  v_conocidas text[] := array['grupos','condiciones_curso','certificacion_curso','plan_cuotas'];
begin
  select c.id, c.institucion_id, c.nombre, c.portada_url into v_c from public.cursos c where c.id = p_curso;
  if not found or not privado.admin_modulo(v_c.institucion_id, 'cursos') then
    raise exception 'Curso inaccesible' using errcode = '42501';
  end if;
  select coalesce(array_agg(id), '{}') into v_grupos from public.grupos where curso_id = p_curso;
  d := privado.diagnostico_grupos(v_grupos);
  for r in
    select distinct cl.relname as tabla
      from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
     where c.contype = 'f' and c.confrelid = 'public.cursos'::regclass and ns.nspname = 'public'
       and not (cl.relname = any (v_conocidas))
       and exists (select 1 from information_schema.columns ic where ic.table_schema = 'public' and ic.table_name = cl.relname and ic.column_name = 'curso_id')
  loop
    n := privado.contar_si_existe(r.tabla, 'curso_id', array[p_curso]);
    if n > 0 then v_inesperadas := v_inesperadas || jsonb_build_object('tabla', r.tabla, 'filas', n); end if;
  end loop;
  d := d || jsonb_build_object(
    'inesperadas', coalesce(d->'inesperadas', '[]'::jsonb) || v_inesperadas,
    'curso', v_c.nombre,
    'plan_cuotas', (select count(*) from public.plan_cuotas where curso_id = p_curso),
    'condiciones', (select count(*) from public.condiciones_curso where curso_id = p_curso),
    'certificacion', privado.contar_si_existe('certificacion_curso', 'curso_id', array[p_curso]),
    'portada', case when v_c.portada_url is null then 0 else 1 end);
  return d || jsonb_build_object('eliminable', privado.historial_vacio(d));
end $$;

create or replace function public.eliminar_curso(p_curso uuid, p_confirmacion text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_c record; v_grupos uuid[]; d jsonb; v_archivos text[] := '{}'; v_n jsonb;
begin
  -- Bloqueo del curso y de TODOS sus grupos antes de revalidar: una solicitud o
  -- matrícula concurrente espera y, al continuar, falla por la clave foránea.
  select c.id, c.institucion_id, c.nombre, c.portada_url into v_c from public.cursos c where c.id = p_curso for update;
  if not found or not privado.admin_modulo(v_c.institucion_id, 'cursos') then
    raise exception 'Curso inaccesible' using errcode = '42501';
  end if;
  if p_confirmacion is null or btrim(p_confirmacion) <> btrim(v_c.nombre) then
    raise exception 'La confirmación no coincide con el nombre del curso';
  end if;
  perform 1 from public.grupos where curso_id = p_curso for update;
  d := public.diagnostico_eliminar_curso(p_curso);
  if not (d->>'eliminable')::boolean then
    raise exception 'El curso tiene historial que debe conservarse: archívalo en su lugar';
  end if;
  select coalesce(array_agg(id), '{}') into v_grupos from public.grupos where curso_id = p_curso;

  if to_regclass('public.materiales_curso') is not null then
    execute 'with b as (delete from public.materiales_curso where grupo_id = any ($1) returning archivo_path)
             select coalesce(array_agg(archivo_path) filter (where archivo_path is not null), ''{}'') from b'
      into v_archivos using v_grupos;
  end if;
  delete from public.evaluaciones where grupo_id = any (v_grupos);
  delete from public.horarios where grupo_id = any (v_grupos);
  delete from public.grupos where id = any (v_grupos);
  delete from public.plan_cuotas where curso_id = p_curso;
  delete from public.condiciones_curso where curso_id = p_curso;
  if to_regclass('public.certificacion_curso') is not null then
    execute 'delete from public.certificacion_curso where curso_id = $1' using p_curso;
  end if;
  delete from public.cursos where id = p_curso;

  v_n := jsonb_build_object('grupos', cardinality(v_grupos), 'horarios', d->'horarios', 'evaluaciones', d->'evaluaciones', 'materiales', d->'materiales');
  return jsonb_build_object('eliminado', true, 'institucion_id', v_c.institucion_id, 'grupos_ids', to_jsonb(v_grupos),
                            'portada_url', v_c.portada_url, 'archivos', to_jsonb(v_archivos), 'conteos', v_n);
end $$;

-- ---------------------------------------------------------------------------
-- GRUPO
create or replace function public.diagnostico_eliminar_grupo(p_grupo uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_g record; d jsonb;
begin
  select g.id, g.institucion_id, g.codigo, g.estado::text as estado into v_g from public.grupos g where g.id = p_grupo;
  if not found or not privado.admin_modulo(v_g.institucion_id, 'docentes') then
    raise exception 'Grupo inaccesible' using errcode = '42501';
  end if;
  d := privado.diagnostico_grupos(array[p_grupo]) || jsonb_build_object('codigo', v_g.codigo, 'estado', v_g.estado);
  return d || jsonb_build_object('eliminable', privado.historial_vacio(d));
end $$;

create or replace function public.eliminar_grupo(p_grupo uuid, p_confirmacion text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_g record; d jsonb; v_archivos text[] := '{}';
begin
  select g.id, g.institucion_id, g.codigo into v_g from public.grupos g where g.id = p_grupo for update;
  if not found or not privado.admin_modulo(v_g.institucion_id, 'docentes') then
    raise exception 'Grupo inaccesible' using errcode = '42501';
  end if;
  if p_confirmacion is null or btrim(p_confirmacion) <> btrim(v_g.codigo) then
    raise exception 'La confirmación no coincide con el código del grupo';
  end if;
  d := public.diagnostico_eliminar_grupo(p_grupo);
  if not (d->>'eliminable')::boolean then
    raise exception 'El grupo tiene historial que debe conservarse: cancélalo o ciérralo en su lugar';
  end if;
  if to_regclass('public.materiales_curso') is not null then
    execute 'with b as (delete from public.materiales_curso where grupo_id = $1 returning archivo_path)
             select coalesce(array_agg(archivo_path) filter (where archivo_path is not null), ''{}'') from b'
      into v_archivos using p_grupo;
  end if;
  delete from public.evaluaciones where grupo_id = p_grupo;
  delete from public.horarios where grupo_id = p_grupo;
  delete from public.grupos where id = p_grupo;
  return jsonb_build_object('eliminado', true, 'institucion_id', v_g.institucion_id, 'grupos_ids', to_jsonb(array[p_grupo]),
                            'archivos', to_jsonb(v_archivos),
                            'conteos', jsonb_build_object('horarios', d->'horarios', 'evaluaciones', d->'evaluaciones', 'materiales', d->'materiales'));
end $$;

-- Permisos.
revoke all on function privado.admin_modulo(uuid, text) from public, anon;
grant execute on function privado.admin_modulo(uuid, text) to authenticated;
revoke all on function privado.contar_si_existe(text, text, uuid[]) from public, anon, authenticated;
revoke all on function privado.diagnostico_grupos(uuid[]) from public, anon, authenticated;
revoke all on function privado.historial_vacio(jsonb) from public, anon, authenticated;
revoke all on function public.diagnostico_eliminar_curso(uuid) from public, anon;
grant execute on function public.diagnostico_eliminar_curso(uuid) to authenticated;
revoke all on function public.eliminar_curso(uuid, text) from public, anon;
grant execute on function public.eliminar_curso(uuid, text) to authenticated;
revoke all on function public.diagnostico_eliminar_grupo(uuid) from public, anon;
grant execute on function public.diagnostico_eliminar_grupo(uuid) to authenticated;
revoke all on function public.eliminar_grupo(uuid, text) from public, anon;
grant execute on function public.eliminar_grupo(uuid, text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.eliminar_curso(uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.eliminar_grupo(uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'privado.diagnostico_grupos(uuid[])', 'EXECUTE') then
    raise exception 'Permisos demasiado amplios';
  end if;
end $$;

commit;

-- =====================================================================
-- PRUEBA SEGURA (en una transacción que se DESHACE; usar un curso de prueba)
-- =====================================================================
-- begin;
--   select public.diagnostico_eliminar_curso('<id del curso de prueba>');
--   -- desde el SQL Editor no hay sesión de admin: devuelve «Curso inaccesible» (correcto).
-- rollback;
-- La prueba real se hace desde la app con una cuenta administradora y un curso de prueba.

-- =====================================================================
-- VERIFICACIÓN POSTERIOR (solo lectura)
-- =====================================================================
-- select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth
--   from pg_proc p where p.proname in ('diagnostico_eliminar_curso','eliminar_curso','diagnostico_eliminar_grupo','eliminar_grupo');

-- =====================================================================
-- REVERSIÓN
-- =====================================================================
-- drop function if exists public.eliminar_curso(uuid, text), public.diagnostico_eliminar_curso(uuid),
--   public.eliminar_grupo(uuid, text), public.diagnostico_eliminar_grupo(uuid),
--   privado.diagnostico_grupos(uuid[]), privado.historial_vacio(jsonb), privado.contar_si_existe(text, text, uuid[]),
--   privado.admin_modulo(uuid, text);
