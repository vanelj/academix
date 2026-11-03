-- =====================================================================
-- ACADEMIX | MIGRACIÓN INCREMENTAL: oferta_grupos visible para visitantes
-- Estado: PREPARADA, NO APLICADA. Requiere autorización del responsable.
--
-- PROBLEMA (detectado en la auditoría del 31-10-2026)
-- La vista pública public.oferta_grupos calcula las vacantes con
-- privado.vacantes_disponibles(g.id). En PostgreSQL, quien consulta una vista
-- necesita EXECUTE sobre las funciones que usa, y V5 solo concede el esquema
-- privado a `authenticated`. Un visitante sin sesión (`anon`) recibe:
--   42501 permission denied for function vacantes_disponibles
-- y la ficha /cursos/[id] no puede mostrarle los grupos ni sus vacantes.
--
-- SOLUCIÓN
-- No se concede el esquema privado a anon: cualquier función de privado creada
-- sin «revoke ... from public» quedaría expuesta. En su lugar se crea una
-- función pública mínima, SECURITY DEFINER, que solo devuelve las vacantes de
-- grupos ofertados (curso publicado, institución y categoría activas, grupo
-- programado o abierto), y la vista pasa a usarla. Mismas columnas y mismo
-- cálculo (sigue delegando en privado.vacantes_disponibles).
--
-- Orden: después de todas las migraciones V5 aplicadas. Independiente de las demás.
-- =====================================================================

begin;

-- 0. REQUISITOS (aborta sin aplicar nada si la base no es la esperada)
do $$
declare
  v_def text;
  v_cols text;
begin
  if to_regprocedure('privado.vacantes_disponibles(uuid)') is null then
    raise exception 'Falta privado.vacantes_disponibles(uuid)';
  end if;
  if to_regclass('public.oferta_grupos') is null or to_regclass('public.oferta_cursos') is null then
    raise exception 'Faltan las vistas public.oferta_grupos u public.oferta_cursos';
  end if;
  v_def := pg_get_viewdef('public.oferta_grupos'::regclass, true);
  if v_def not ilike '%privado.vacantes_disponibles(g.id)%' or v_def not ilike '%''programado''%' then
    raise exception 'public.oferta_grupos no coincide con la definición V5 esperada; revisar antes de aplicar: %', v_def;
  end if;
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
  from information_schema.columns where table_schema = 'public' and table_name = 'oferta_grupos';
  if v_cols is distinct from 'id,curso_id,codigo,fecha_inicio,fecha_fin,estado,vacantes_disponibles,docente' then
    raise exception 'Columnas inesperadas en public.oferta_grupos: %', v_cols;
  end if;
end $$;

-- 1. Vacantes de un grupo OFERTADO (null para cualquier otro id).
create or replace function public.vacantes_oferta(p_grupo uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  select privado.vacantes_disponibles(g.id)
  from public.grupos g
  join public.oferta_cursos oc on oc.id = g.curso_id
  where g.id = p_grupo and g.estado in ('programado', 'abierto')
$$;
comment on function public.vacantes_oferta(uuid) is
  'Vacantes libres de un grupo ofertado públicamente (catálogo). Devuelve null si el grupo no está en la oferta.';

revoke all on function public.vacantes_oferta(uuid) from public;
grant execute on function public.vacantes_oferta(uuid) to anon, authenticated;

-- 2. La vista usa la función pública (mismas columnas, mismo filtro).
create or replace view public.oferta_grupos
with (security_invoker = false) as
select g.id, g.curso_id, g.codigo, g.fecha_inicio, g.fecha_fin, g.estado,
       public.vacantes_oferta(g.id) as vacantes_disponibles,
       p.nombres || ' ' || p.apellidos as docente
from public.grupos g
join public.oferta_cursos oc on oc.id = g.curso_id
left join public.perfiles p on p.id = g.docente_id
where g.estado in ('programado', 'abierto');

-- 3. Aserción: anon puede leer la vista y NO tiene acceso al esquema privado.
do $$
begin
  if not has_function_privilege('anon', 'public.vacantes_oferta(uuid)', 'EXECUTE') then
    raise exception 'anon no puede ejecutar public.vacantes_oferta';
  end if;
  if has_schema_privilege('anon', 'privado', 'USAGE') then
    raise exception 'anon tiene USAGE sobre el esquema privado (no debería)';
  end if;
end $$;

commit;

-- =====================================================================
-- VERIFICACIÓN (solo lectura, después de aplicar)
-- =====================================================================
-- set local role anon;  -- dentro de una transacción de prueba:
-- begin; set local role anon;
--   select id, codigo, estado, vacantes_disponibles from public.oferta_grupos limit 5;  -- sin error 42501
-- rollback;
-- select has_schema_privilege('anon', 'privado', 'USAGE') as anon_privado;            -- esperado: false

-- =====================================================================
-- REVERSIÓN (vuelve a la definición V5; los visitantes volverían a recibir 42501)
-- =====================================================================
-- begin;
-- create or replace view public.oferta_grupos with (security_invoker = false) as
-- select g.id, g.curso_id, g.codigo, g.fecha_inicio, g.fecha_fin, g.estado,
--        privado.vacantes_disponibles(g.id) as vacantes_disponibles,
--        p.nombres || ' ' || p.apellidos as docente
-- from public.grupos g
-- join public.oferta_cursos oc on oc.id = g.curso_id
-- left join public.perfiles p on p.id = g.docente_id
-- where g.estado in ('programado','abierto');
-- drop function if exists public.vacantes_oferta(uuid);
-- commit;
