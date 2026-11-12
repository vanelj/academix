-- =====================================================================
-- MIGRACIÓN INCREMENTAL V5 — «Mis cursos» del estudiante (cuenta única
-- multiinstitucional)
-- ---------------------------------------------------------------------
-- Problema: el estudiante tiene una sola cuenta global y puede matricularse
-- en varias instituciones, pero las políticas RLS de cursos y grupos solo
-- dejan leer la institución propia (privado.mi_institucion()). El panel solo
-- puede nombrar sus cursos con las vistas públicas (oferta_*), que excluyen
-- los grupos en curso o cerrados: una matrícula confirmada no podía mostrarse
-- completa en «Mis cursos».
--
-- Solución (mismo patrón que mis_cuotas y mis_certificados):
--   public.mis_cursos(): SECURITY DEFINER, SOLO LECTURA, devuelve únicamente
--   las matrículas del usuario autenticado con rol estudiante activo
--   (m.estudiante_id = auth.uid()), de cualquier institución, con el nombre
--   del curso, grupo, institución, fechas, docente (o null = «Docente por
--   asignar») y horarios. No devuelve enlaces de clase ni datos de otros
--   estudiantes. No cambia tablas, políticas ni permisos existentes.
--
-- No modifica filas. Es independiente de oferta_grupos_anon_v5.
-- Mientras no se aplique, la app muestra las matrículas con los datos de la
-- oferta pública (aviso de detalle incompleto) y nada falla.
-- =====================================================================
begin;

-- 0. Requisitos (aborta sin cambios si falta algo)
do $$
begin
  if to_regclass('public.matriculas') is null or to_regclass('public.grupos') is null
     or to_regclass('public.cursos') is null or to_regclass('public.instituciones') is null
     or to_regclass('public.horarios') is null or to_regclass('public.perfiles') is null then
    raise exception 'Faltan tablas de V5 (matriculas, grupos, cursos, instituciones, horarios o perfiles)';
  end if;
  if to_regprocedure('privado.mi_rol_activo()') is null then
    raise exception 'Falta privado.mi_rol_activo()';
  end if;
  if to_regprocedure('public.mis_cursos()') is not null then
    raise notice 'public.mis_cursos() ya existe: se reemplaza con la misma firma';
  end if;
end $$;

-- 1. Función de lectura
create or replace function public.mis_cursos()
returns table (
  matricula_id uuid,
  estado text,
  estado_final text,
  fecha_matricula timestamptz,
  institucion_id uuid,
  institucion text,
  curso_id uuid,
  curso text,
  grupo_id uuid,
  grupo text,
  grupo_estado text,
  fecha_inicio date,
  fecha_fin date,
  docente text,
  horarios jsonb)
language sql stable security definer set search_path = ''
as $$
  select m.id::uuid, m.estado::text, m.estado_final::text, m.fecha_matricula::timestamptz,
         i.id::uuid, i.nombre::text,
         c.id::uuid, c.nombre::text,
         g.id::uuid, g.codigo::text, g.estado::text, g.fecha_inicio::date, g.fecha_fin::date,
         nullif(trim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')), '')::text,
         coalesce((select jsonb_agg(jsonb_build_object('dia_semana', h.dia_semana,
                                                       'hora_inicio', to_char(h.hora_inicio, 'HH24:MI'),
                                                       'hora_fin', to_char(h.hora_fin, 'HH24:MI'))
                                    order by h.dia_semana, h.hora_inicio)
                   from public.horarios h where h.grupo_id = g.id), '[]'::jsonb)
  from public.matriculas m
  join public.grupos g on g.id = m.grupo_id
  join public.cursos c on c.id = g.curso_id
  join public.instituciones i on i.id = m.institucion_id
  left join public.perfiles p on p.id = g.docente_id
  where auth.uid() is not null
    and m.estudiante_id = auth.uid()
    and privado.mi_rol_activo() = 'estudiante'
  order by (m.estado::text = 'activa') desc, g.fecha_inicio desc, c.nombre
$$;

revoke all on function public.mis_cursos() from public, anon;
grant execute on function public.mis_cursos() to authenticated;

-- 2. Aserciones
do $$
begin
  if to_regprocedure('public.mis_cursos()') is null then raise exception 'mis_cursos() no se creó'; end if;
  if has_function_privilege('anon', 'public.mis_cursos()', 'EXECUTE') then raise exception 'anon no debe ejecutar mis_cursos()'; end if;
  if not has_function_privilege('authenticated', 'public.mis_cursos()', 'EXECUTE') then raise exception 'authenticated debe ejecutar mis_cursos()'; end if;
end $$;

commit;

-- =====================================================================
-- VERIFICACIÓN (solo lectura)
-- =====================================================================
-- Antes de aplicar (esperado: null):
-- select to_regprocedure('public.mis_cursos()');
--
-- Después (esperado: la función, security definer, sin acceso para anon):
-- select p.proname, p.prosecdef, has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
-- from pg_proc p where p.oid = 'public.mis_cursos()'::regprocedure;
--
-- Desde el SQL Editor (sin sesión de estudiante) devuelve 0 filas: auth.uid() es null.
-- La prueba real es en la app: /estudiante/cursos con una cuenta de estudiante.

-- =====================================================================
-- REVERSIÓN
-- =====================================================================
-- drop function if exists public.mis_cursos();
