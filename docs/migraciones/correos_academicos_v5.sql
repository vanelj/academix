-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA) — Correos académicos (Resend)
-- ---------------------------------------------------------------------
-- Amplía la bandeja de correos YA APLICADA (correos_transaccionales_v5):
-- no crea otro sistema. Mismo patrón: el correo se ENCOLA en la misma
-- transacción del cambio (si se deshace, no se envía), con clave única
-- (sin duplicados) y la app lo envía con la API de Resend.
--
--   1. correo_contexto() añade «horario» (texto) a los datos de los correos
--      de un grupo: el correo de matrícula confirmada ya lo muestra.
--   2. horario_cambiado: alta, cambio de día/hora o retiro de un horario de un
--      grupo vigente → un correo por estudiante con matrícula ACTIVA, máximo
--      uno por grupo y día (cambiar el enlace de clase NO envía correos).
--   3. resultado_final: matrícula de en_curso a aprobado/desaprobado → correo al
--      estudiante SIN la nota (se consulta iniciando sesión).
--
-- No modifica tablas ni datos. Un error al encolar NUNCA bloquea la operación.
-- Requisitos: correos_transaccionales_v5 (aplicada). Reversión al final.
-- =====================================================================
begin;

do $$
begin
  if to_regprocedure('privado.encolar_correo(text,text,uuid,text,uuid,jsonb)') is null
     or to_regclass('public.correos_salientes') is null then
    raise exception 'Aplica antes correos_transaccionales_v5';
  end if;
  if to_regprocedure('privado.correo_contexto(uuid,uuid)') is null then
    raise exception 'Falta privado.correo_contexto(uuid, uuid)';
  end if;
end $$;

-- 1. Horario legible de un grupo: «Lunes 19:00–21:00, Viernes 19:00–21:00».
create or replace function privado.horario_texto(p_grupo uuid)
returns text language sql stable security definer set search_path = '' as $$
  select string_agg(
           (array['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'])[h.dia_semana]
           || ' ' || to_char(h.hora_inicio, 'HH24:MI') || '–' || to_char(h.hora_fin, 'HH24:MI'),
           ', ' order by h.dia_semana, h.hora_inicio)
    from public.horarios h where h.grupo_id = p_grupo
$$;

-- Misma firma y mismas claves que antes, más «horario».
create or replace function privado.correo_contexto(p_grupo uuid, p_perfil uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'curso', c.nombre, 'grupo', g.codigo, 'fecha_inicio', g.fecha_inicio,
    'institucion', i.nombre, 'institucion_correo', i.correo, 'institucion_telefono', i.telefono,
    'instrucciones_pago', pi.texto_pagos,
    'horario', privado.horario_texto(g.id),
    'nombre', (select p.nombres from public.perfiles p where p.id = p_perfil))
  from public.grupos g
  join public.cursos c on c.id = g.curso_id
  join public.instituciones i on i.id = g.institucion_id
  left join public.politicas_institucion pi on pi.institucion_id = i.id
  where g.id = p_grupo
$$;

-- 2. Cambio de horario.
create or replace function privado.correo_horario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_grupo uuid := coalesce(new.grupo_id, old.grupo_id);
  v_estado text; v_hoy text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD');
  v_dias text[] := array['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  v_anterior text; v_nuevo text; r record;
begin
  begin
    select g.estado::text into v_estado from public.grupos g where g.id = v_grupo;
    if v_estado is null or v_estado not in ('programado', 'abierto', 'en_curso') then return null; end if;
    if tg_op in ('UPDATE', 'DELETE') then
      v_anterior := v_dias[old.dia_semana] || ' ' || to_char(old.hora_inicio, 'HH24:MI') || '–' || to_char(old.hora_fin, 'HH24:MI');
    end if;
    if tg_op in ('UPDATE', 'INSERT') then
      v_nuevo := v_dias[new.dia_semana] || ' ' || to_char(new.hora_inicio, 'HH24:MI') || '–' || to_char(new.hora_fin, 'HH24:MI');
    end if;
    if tg_op = 'UPDATE' and v_anterior = v_nuevo then return null; end if;
    for r in select m.id, m.estudiante_id, m.institucion_id from public.matriculas m
              where m.grupo_id = v_grupo and m.estado::text = 'activa' and m.estado_final::text = 'en_curso'
    loop
      perform privado.encolar_correo('horario_cambiado', 'horario_cambiado:' || v_grupo || ':' || r.estudiante_id || ':' || v_hoy,
        r.estudiante_id, null, r.institucion_id,
        privado.correo_contexto(v_grupo, r.estudiante_id)
          || jsonb_build_object('matricula_id', r.id,
                                'anterior', coalesce(v_anterior, 'Sin esa clase'),
                                'nuevo', coalesce(v_nuevo, 'Clase retirada')));
    end loop;
  exception when others then
    raise warning 'correo_horario: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end $$;
drop trigger if exists correo_horario_v5 on public.horarios;
create trigger correo_horario_v5
  after insert or delete or update of dia_semana, hora_inicio, hora_fin on public.horarios
  for each row execute function privado.correo_horario();

-- 3. Resultado final disponible (sin la nota).
create or replace function privado.correo_resultado_final()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if old.estado_final::text = 'en_curso' and new.estado_final::text in ('aprobado', 'desaprobado') then
      perform privado.encolar_correo('resultado_final', 'resultado_final:' || new.id || ':' || to_char(now(), 'YYYYMMDDHH24MISS'),
        new.estudiante_id, null, new.institucion_id,
        privado.correo_contexto(new.grupo_id, new.estudiante_id) || jsonb_build_object('matricula_id', new.id));
    end if;
  exception when others then
    raise warning 'correo_resultado_final: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end $$;
drop trigger if exists correo_resultado_final_v5 on public.matriculas;
create trigger correo_resultado_final_v5
  after update of estado_final on public.matriculas
  for each row execute function privado.correo_resultado_final();

revoke all on function privado.horario_texto(uuid) from public, anon, authenticated;
revoke all on function privado.correo_horario() from public, anon, authenticated;
revoke all on function privado.correo_resultado_final() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'correo_horario_v5')
     or not exists (select 1 from pg_trigger where tgname = 'correo_resultado_final_v5') then
    raise exception 'No se crearon los disparadores';
  end if;
end $$;

commit;

-- =====================================================================
-- VERIFICACIÓN POSTERIOR (solo lectura)
-- =====================================================================
-- select tgname, tgrelid::regclass from pg_trigger where tgname in ('correo_horario_v5', 'correo_resultado_final_v5');
-- select privado.correo_contexto(g.id, null) ? 'horario' as incluye_horario from public.grupos g limit 1;
-- select tipo, estado, count(*) from public.correos_salientes group by 1, 2 order by 1, 2;

-- =====================================================================
-- REVERSIÓN (la versión anterior de correo_contexto es la de correos_transaccionales_v5)
-- =====================================================================
-- begin;
-- drop trigger if exists correo_horario_v5 on public.horarios;
-- drop trigger if exists correo_resultado_final_v5 on public.matriculas;
-- drop function if exists privado.correo_horario(), privado.correo_resultado_final();
-- -- volver a ejecutar la sección 2 de correos_transaccionales_v5.sql (correo_contexto sin «horario»)
-- drop function if exists privado.horario_texto(uuid);
-- commit;
