-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA) — Centro de notificaciones internas
--
-- QUÉ HACE
--   1. Tabla public.notificaciones: un aviso por persona y rol, con enlace a la
--      sección correspondiente, estado leída/no leída y clave anti-duplicados.
--   2. Disparadores AFTER sobre tablas V5 que generan los avisos en la misma
--      transacción de la operación real (no hay avisos de operaciones que no
--      ocurrieron). NUNCA bloquean la operación: si generar un aviso falla, se
--      registra un WARNING y la operación académica o de pago continúa.
--   3. No depende de Resend ni de servicios externos. La campana de la app
--      consulta esta tabla (lectura periódica ligera, sin infraestructura de
--      tiempo real).
--
-- SEGURIDAD
--   - RLS: cada persona solo ve SUS avisos y solo los del ROL ACTIVO
--     (privado.mi_rol_activo), así un docente que también es estudiante no
--     mezcla avisos. El aislamiento institucional sale de quién recibe el
--     aviso: a los administradores solo se les avisa de su institución.
--   - authenticated solo puede SELECT y UPDATE de la columna leida_en.
--     No hay INSERT/DELETE desde el cliente: los avisos los crean funciones
--     SECURITY DEFINER con search_path vacío, sin EXECUTE para nadie.
--   - Los textos no incluyen DNI, teléfonos, montos de otros ni comprobantes.
--
-- AVISOS
--   Administrador: nueva solicitud; nuevo comprobante por revisar (cursos);
--                  grupo cerrado con resultados pendientes de cierre.
--   Docente:       asignación a un grupo; nuevos estudiantes (máx. 1 aviso por
--                  grupo y día); evaluación nueva en su grupo; grupo cerrado con
--                  notas faltantes; cambios de horario.
--   Estudiante:    solicitud registrada / rechazada / cancelada / vencida;
--                  pago aprobado o rechazado; matrícula confirmada o anulada;
--                  cambio de horario o de fechas; grupo cancelado; resultado
--                  final; certificado disponible. El aviso de NOTAS no sale de
--                  aquí: una nota guardada es borrador; al publicar una
--                  evaluación avisa public.publicar_evaluacion()
--                  (aula_academica_v5.sql), un aviso por evaluación.
--
-- NO MODIFICA: tablas, políticas ni funciones existentes (solo añade).
-- Idempotente. Reversión al final.
-- CÓMO APLICAR: revisar y ejecutar en Supabase > SQL Editor.
-- =====================================================================

begin;

-- 0. REQUISITOS ---------------------------------------------------------
do $$
declare v_falta text;
begin
  select string_agg(t, ', ') into v_falta
  from unnest(array['public.perfiles','public.usuario_roles','public.grupos','public.cursos','public.horarios',
                    'public.matriculas','public.solicitudes_inscripcion','public.pagos','public.calificaciones',
                    'public.evaluaciones','public.certificados']) t
  where to_regclass(t) is null;
  if v_falta is not null then raise exception 'Requisito: faltan tablas %', v_falta; end if;
  if to_regprocedure('privado.mi_rol_activo()') is null then raise exception 'Requisito: falta privado.mi_rol_activo()'; end if;
end $$;

-- 1. TABLA ---------------------------------------------------------------
create table if not exists public.notificaciones (
  id              uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references public.perfiles(id) on delete cascade,
  rol             text not null check (rol in ('admin','docente','estudiante')),
  institucion_id  uuid references public.instituciones(id),
  tipo            text not null check (length(tipo) between 3 and 60),
  titulo          text not null check (length(trim(titulo)) between 1 and 160),
  cuerpo          text check (cuerpo is null or length(cuerpo) <= 500),
  enlace          text check (enlace is null or (enlace ~ '^/[A-Za-z0-9/_?=&.-]*$' and length(enlace) <= 300)),
  clave           text unique check (clave is null or length(clave) <= 200),
  creada_en       timestamptz not null default now(),
  leida_en        timestamptz
);
create index if not exists notificaciones_bandeja_idx
  on public.notificaciones (destinatario_id, rol, creada_en desc);
create index if not exists notificaciones_no_leidas_idx
  on public.notificaciones (destinatario_id, rol) where leida_en is null;

alter table public.notificaciones enable row level security;
revoke all on table public.notificaciones from public, anon, authenticated;
grant select on table public.notificaciones to authenticated;
grant update (leida_en) on table public.notificaciones to authenticated;

drop policy if exists "v5 ver mis notificaciones" on public.notificaciones;
create policy "v5 ver mis notificaciones" on public.notificaciones
  for select to authenticated
  using (destinatario_id = auth.uid() and rol = privado.mi_rol_activo());

drop policy if exists "v5 marcar mis notificaciones" on public.notificaciones;
create policy "v5 marcar mis notificaciones" on public.notificaciones
  for update to authenticated
  using (destinatario_id = auth.uid() and rol = privado.mi_rol_activo())
  with check (destinatario_id = auth.uid() and rol = privado.mi_rol_activo());

-- 2. FUNCIONES AUXILIARES ------------------------------------------------
-- Inserta un aviso; la clave evita duplicados (on conflict do nothing).
create or replace function privado.notificar(
  p_destinatario uuid, p_rol text, p_institucion uuid, p_tipo text,
  p_titulo text, p_cuerpo text, p_enlace text, p_clave text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_destinatario is null then return; end if;
  insert into public.notificaciones (destinatario_id, rol, institucion_id, tipo, titulo, cuerpo, enlace, clave)
  values (p_destinatario, p_rol, p_institucion, p_tipo, left(p_titulo, 160), left(p_cuerpo, 500), p_enlace, p_clave)
  on conflict (clave) do nothing;
end
$$;

-- Administradores activos de una institución.
create or replace function privado.notificar_admins(
  p_institucion uuid, p_tipo text, p_titulo text, p_cuerpo text, p_enlace text, p_clave text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  for r in
    select ur.perfil_id from public.usuario_roles ur
    join public.perfiles p on p.id = ur.perfil_id and p.activo
    where ur.institucion_id = p_institucion and ur.rol = 'admin' and ur.activo
  loop
    perform privado.notificar(r.perfil_id, 'admin', p_institucion, p_tipo, p_titulo, p_cuerpo, p_enlace,
      case when p_clave is null then null else p_clave || ':' || r.perfil_id end);
  end loop;
end
$$;

-- Estudiantes con matrícula activa en un grupo.
create or replace function privado.notificar_estudiantes_grupo(
  p_grupo uuid, p_tipo text, p_titulo text, p_cuerpo text, p_enlace text, p_clave text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  for r in select m.estudiante_id, m.institucion_id from public.matriculas m where m.grupo_id = p_grupo and m.estado = 'activa'
  loop
    perform privado.notificar(r.estudiante_id, 'estudiante', r.institucion_id, p_tipo, p_titulo, p_cuerpo, p_enlace,
      case when p_clave is null then null else p_clave || ':' || r.estudiante_id end);
  end loop;
end
$$;

create or replace function privado.nombre_curso_grupo(p_grupo uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select c.nombre || ' · ' || g.codigo from public.grupos g join public.cursos c on c.id = g.curso_id where g.id = p_grupo
$$;

-- 3. DISPARADORES ---------------------------------------------------------
-- Cada función captura sus errores: un aviso jamás impide la operación real.

-- 3.1 Solicitudes de inscripción
create or replace function privado.aviso_solicitud()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_curso text := privado.nombre_curso_grupo(new.grupo_id);
begin
  begin
    if tg_op = 'INSERT' then
      perform privado.notificar_admins(new.institucion_id, 'solicitud_nueva', 'Nueva solicitud de inscripción',
        coalesce(v_curso, 'Un curso') || '.', '/admin/solicitudes/' || new.id, 'solicitud_nueva:' || new.id);
      perform privado.notificar(new.estudiante_id, 'estudiante', new.institucion_id, 'solicitud_registrada',
        'Registramos tu inscripción', coalesce(v_curso, 'Tu curso') ||
          case when new.importe_esperado > 0 then '. Completa el pago y sube tu comprobante.' else '.' end,
        case when new.importe_esperado > 0 then '/estudiante/pagos/pagar?solicitud=' || new.id else '/estudiante/solicitudes' end,
        'solicitud_registrada:' || new.id);
    elsif new.estado is distinct from old.estado and new.estado in ('rechazada','cancelada','vencida') then
      perform privado.notificar(new.estudiante_id, 'estudiante', new.institucion_id, 'solicitud_' || new.estado,
        case new.estado when 'rechazada' then 'Tu solicitud fue rechazada'
                        when 'cancelada' then 'Tu solicitud fue cancelada'
                        else 'Tu solicitud venció' end,
        coalesce(v_curso, 'Tu curso') || coalesce('. ' || nullif(trim(new.comentario_revision), ''), '.'),
        '/estudiante/solicitudes', 'solicitud_' || new.estado || ':' || new.id);
    end if;
  exception when others then
    raise warning 'aviso_solicitud: %', sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists aviso_solicitud_v5 on public.solicitudes_inscripcion;
create trigger aviso_solicitud_v5
  after insert or update of estado on public.solicitudes_inscripcion
  for each row execute function privado.aviso_solicitud();

-- 3.2 Pagos de cursos (comprobantes)
create or replace function privado.aviso_pago()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_estudiante uuid; v_estado_solicitud text;
begin
  begin
    v_estudiante := coalesce(new.estudiante_id,
      (select s.estudiante_id from public.solicitudes_inscripcion s where s.id = new.solicitud_id),
      (select m.estudiante_id from public.matriculas m where m.id = new.matricula_id),
      (select m.estudiante_id from public.cuotas q join public.matriculas m on m.id = q.matricula_id where q.id = new.cuota_id));
    if tg_op = 'INSERT' then
      if new.estado::text = 'pendiente' then
        perform privado.notificar_admins(new.institucion_id, 'comprobante_nuevo', 'Nuevo comprobante por revisar',
          'Un estudiante envió un comprobante de pago.', '/admin/pagos/' || new.id, 'comprobante_nuevo:' || new.id);
      end if;
    elsif new.estado::text is distinct from old.estado::text then
      if new.estado::text = 'pagado' then
        -- Si el pago confirmó la matrícula, el aviso «Matrícula confirmada» ya lo explica.
        select s.estado into v_estado_solicitud from public.solicitudes_inscripcion s where s.id = new.solicitud_id;
        if coalesce(v_estado_solicitud, '') <> 'matriculada' then
          perform privado.notificar(v_estudiante, 'estudiante', new.institucion_id, 'pago_aprobado', 'Tu pago fue verificado',
            'La institución confirmó tu pago.', '/estudiante/pagos', 'pago_aprobado:' || new.id);
        end if;
      elsif new.estado::text = 'rechazado' then
        perform privado.notificar(v_estudiante, 'estudiante', new.institucion_id, 'pago_rechazado', 'Tu comprobante fue observado',
          coalesce(nullif(trim(new.observacion), ''), 'Revisa el motivo y vuelve a enviarlo.'), '/estudiante/pagos', 'pago_rechazado:' || new.id);
      end if;
    end if;
  exception when others then
    raise warning 'aviso_pago: %', sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists aviso_pago_v5 on public.pagos;
create trigger aviso_pago_v5
  after insert or update of estado on public.pagos
  for each row execute function privado.aviso_pago();

-- 3.3 Matrículas
create or replace function privado.aviso_matricula()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_curso text := privado.nombre_curso_grupo(new.grupo_id); v_docente uuid;
begin
  begin
    if tg_op = 'INSERT' then
      perform privado.notificar(new.estudiante_id, 'estudiante', new.institucion_id, 'matricula_confirmada', '¡Matrícula confirmada!',
        coalesce(v_curso, 'Tu curso') || ' ya está en «Mis cursos».', '/estudiante/cursos/' || new.id, 'matricula_confirmada:' || new.id);
      select g.docente_id into v_docente from public.grupos g where g.id = new.grupo_id;
      perform privado.notificar(v_docente, 'docente', new.institucion_id, 'estudiantes_nuevos', 'Nuevos estudiantes en tu grupo',
        coalesce(v_curso, 'Tu grupo') || '.', '/docente/estudiantes?grupo=' || new.grupo_id,
        'estudiantes_nuevos:' || new.grupo_id || ':' || to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD'));
    else
      if new.estado::text = 'anulada' and old.estado::text <> 'anulada' then
        perform privado.notificar(new.estudiante_id, 'estudiante', new.institucion_id, 'matricula_anulada', 'Tu matrícula fue anulada',
          coalesce(v_curso, 'Tu curso') || '. Consulta con la institución si tienes dudas.', '/estudiante/cursos', 'matricula_anulada:' || new.id);
      end if;
      if new.estado_final::text in ('aprobado','desaprobado') and old.estado_final::text = 'en_curso' then
        perform privado.notificar(new.estudiante_id, 'estudiante', new.institucion_id, 'resultado_final', 'Tu resultado final está disponible',
          coalesce(v_curso, 'Tu curso') || ': ' || case new.estado_final::text when 'aprobado' then 'aprobado.' else 'desaprobado.' end,
          '/estudiante/cursos/' || new.id || '?seccion=notas', 'resultado_final:' || new.id || ':' || to_char(now(), 'YYYYMMDDHH24MISS'));
      end if;
    end if;
  exception when others then
    raise warning 'aviso_matricula: %', sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists aviso_matricula_v5 on public.matriculas;
create trigger aviso_matricula_v5
  after insert or update of estado, estado_final on public.matriculas
  for each row execute function privado.aviso_matricula();

-- 3.4 Grupos: asignación de docente, fechas, cancelación y cierre
create or replace function privado.aviso_grupo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_curso text := privado.nombre_curso_grupo(new.id); v_hoy text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD');
        v_pendientes int; v_faltan int;
begin
  begin
    if new.docente_id is not null and (tg_op = 'INSERT' or new.docente_id is distinct from old.docente_id) then
      perform privado.notificar(new.docente_id, 'docente', new.institucion_id, 'grupo_asignado', 'Te asignaron un grupo',
        coalesce(v_curso, 'Un grupo') || '.', '/docente/grupos', 'grupo_asignado:' || new.id || ':' || new.docente_id);
    end if;
    if tg_op = 'UPDATE' then
      if new.estado::text = 'cancelado' and old.estado::text <> 'cancelado' then
        perform privado.notificar_estudiantes_grupo(new.id, 'grupo_cancelado', 'Un grupo fue cancelado',
          coalesce(v_curso, 'Tu curso') || '. La institución te indicará los siguientes pasos.', '/estudiante/cursos', 'grupo_cancelado:' || new.id);
      elsif new.fecha_inicio is distinct from old.fecha_inicio or new.fecha_fin is distinct from old.fecha_fin then
        perform privado.notificar_estudiantes_grupo(new.id, 'fechas_cambiadas', 'Cambiaron las fechas de tu curso',
          coalesce(v_curso, 'Tu curso') || '.', '/estudiante/horarios', 'fechas:' || new.id || ':' || v_hoy);
        perform privado.notificar(new.docente_id, 'docente', new.institucion_id, 'fechas_cambiadas', 'Cambiaron las fechas de tu grupo',
          coalesce(v_curso, 'Tu grupo') || '.', '/docente/horarios', 'fechas:' || new.id || ':' || v_hoy || ':' || coalesce(new.docente_id::text, ''));
      end if;
      if new.estado::text = 'cerrado' and old.estado::text <> 'cerrado' then
        select count(*) into v_pendientes from public.matriculas m where m.grupo_id = new.id and m.estado = 'activa' and m.estado_final = 'en_curso';
        if v_pendientes > 0 then
          perform privado.notificar_admins(new.institucion_id, 'resultados_pendientes', 'Resultados pendientes de cierre',
            coalesce(v_curso, 'Un grupo') || ': ' || v_pendientes || ' matrícula(s) sin resultado final.', '/admin/evaluaciones/' || new.id,
            'resultados_pendientes:' || new.id);
          select count(*) into v_faltan
            from public.matriculas m cross join public.evaluaciones e
           where m.grupo_id = new.id and e.grupo_id = new.id and m.estado = 'activa'
             and not exists (select 1 from public.calificaciones c where c.matricula_id = m.id and c.evaluacion_id = e.id);
          if v_faltan > 0 then
            perform privado.notificar(new.docente_id, 'docente', new.institucion_id, 'notas_pendientes', 'Faltan notas por registrar',
              coalesce(v_curso, 'Tu grupo') || ': ' || v_faltan || ' nota(s) pendiente(s).', '/docente/calificaciones/' || new.id,
              'notas_pendientes:' || new.id);
          end if;
        end if;
      end if;
    end if;
  exception when others then
    raise warning 'aviso_grupo: %', sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists aviso_grupo_v5 on public.grupos;
create trigger aviso_grupo_v5
  after insert or update of docente_id, estado, fecha_inicio, fecha_fin on public.grupos
  for each row execute function privado.aviso_grupo();

-- 3.5 Horarios (máx. un aviso por grupo, persona y día)
create or replace function privado.aviso_horario()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_grupo uuid := coalesce(new.grupo_id, old.grupo_id); v_g record; v_hoy text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD');
begin
  begin
    select g.id, g.institucion_id, g.docente_id, g.estado::text as estado into v_g from public.grupos g where g.id = v_grupo;
    if found and v_g.estado in ('programado','abierto','en_curso') then
      perform privado.notificar_estudiantes_grupo(v_grupo, 'horario_cambiado', 'Cambió el horario de tu curso',
        coalesce(privado.nombre_curso_grupo(v_grupo), 'Tu curso') || '.', '/estudiante/horarios', 'horario:' || v_grupo || ':' || v_hoy);
      perform privado.notificar(v_g.docente_id, 'docente', v_g.institucion_id, 'horario_cambiado', 'Cambió el horario de tu grupo',
        coalesce(privado.nombre_curso_grupo(v_grupo), 'Tu grupo') || '.', '/docente/horarios',
        'horario:' || v_grupo || ':' || v_hoy || ':' || coalesce(v_g.docente_id::text, ''));
    end if;
  exception when others then
    raise warning 'aviso_horario: %', sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists aviso_horario_v5 on public.horarios;
create trigger aviso_horario_v5
  after insert or update or delete on public.horarios
  for each row execute function privado.aviso_horario();

-- 3.6 Evaluaciones nuevas (al docente del grupo, máx. una por grupo y día)
create or replace function privado.aviso_evaluacion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_docente uuid;
begin
  begin
    select g.docente_id into v_docente from public.grupos g where g.id = new.grupo_id;
    if v_docente is not null and v_docente is distinct from auth.uid() then
      perform privado.notificar(v_docente, 'docente', new.institucion_id, 'evaluacion_nueva', 'Hay evaluaciones por calificar',
        coalesce(privado.nombre_curso_grupo(new.grupo_id), 'Tu grupo') || ': «' || new.nombre || '».', '/docente/calificaciones/' || new.grupo_id,
        'evaluacion_nueva:' || new.grupo_id || ':' || to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD'));
    end if;
  exception when others then
    raise warning 'aviso_evaluacion: %', sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists aviso_evaluacion_v5 on public.evaluaciones;
create trigger aviso_evaluacion_v5
  after insert on public.evaluaciones
  for each row execute function privado.aviso_evaluacion();

-- 3.7 Calificaciones: SIN aviso por nota guardada. Una nota guardada es un
-- borrador hasta que el docente publica la evaluación; el aviso al estudiante
-- (uno por evaluación publicada) lo emite public.publicar_evaluacion() de
-- aula_academica_v5.sql. Se eliminan restos de versiones anteriores.
drop trigger if exists aviso_calificacion_v5 on public.calificaciones;
drop function if exists privado.aviso_calificacion();

-- 3.8 Certificados emitidos
create or replace function privado.aviso_certificado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_m record;
begin
  begin
    select m.estudiante_id, m.grupo_id into v_m from public.matriculas m where m.id = new.matricula_id;
    if found then
      perform privado.notificar(v_m.estudiante_id, 'estudiante', new.institucion_id, 'certificado_emitido', 'Tu certificado está disponible',
        coalesce(privado.nombre_curso_grupo(v_m.grupo_id), 'Tu curso') || '. Ya puedes descargarlo.', '/estudiante/cursos/' || new.matricula_id || '?seccion=certificado',
        'certificado:' || new.id);
    end if;
  exception when others then
    raise warning 'aviso_certificado: %', sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists aviso_certificado_v5 on public.certificados;
create trigger aviso_certificado_v5
  after insert on public.certificados
  for each row execute function privado.aviso_certificado();

-- 4. PERMISOS DE LAS FUNCIONES (solo las usan los disparadores) -----------
revoke all on function privado.notificar(uuid, text, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function privado.notificar_admins(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function privado.notificar_estudiantes_grupo(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function privado.nombre_curso_grupo(uuid) from public, anon, authenticated;
revoke all on function privado.aviso_solicitud() from public, anon, authenticated;
revoke all on function privado.aviso_pago() from public, anon, authenticated;
revoke all on function privado.aviso_matricula() from public, anon, authenticated;
revoke all on function privado.aviso_grupo() from public, anon, authenticated;
revoke all on function privado.aviso_horario() from public, anon, authenticated;
revoke all on function privado.aviso_evaluacion() from public, anon, authenticated;
revoke all on function privado.aviso_certificado() from public, anon, authenticated;

-- 5. ASERCIONES -----------------------------------------------------------
do $$
begin
  if has_table_privilege('authenticated', 'public.notificaciones', 'INSERT')
     or has_table_privilege('authenticated', 'public.notificaciones', 'DELETE')
     or has_table_privilege('anon', 'public.notificaciones', 'SELECT') then
    raise exception 'Permisos de notificaciones demasiado amplios';
  end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'public.calificaciones'::regclass and t.tgname like 'aviso_%') then
    raise exception 'No debe haber avisos por nota guardada (las notas son borradores hasta publicarse)';
  end if;
  if has_column_privilege('authenticated', 'public.notificaciones', 'titulo', 'UPDATE') then
    raise exception 'authenticated no debe poder editar el texto de los avisos';
  end if;
end $$;

commit;

-- =====================================================================
-- VERIFICACIÓN (solo lectura)
-- =====================================================================
-- select tgname, tgrelid::regclass, tgenabled from pg_trigger where tgname like 'aviso_%_v5' order by 1;
-- select policyname, cmd from pg_policies where tablename = 'notificaciones';
-- select count(*) from public.notificaciones;  -- 0 justo después de aplicar

-- =====================================================================
-- REVERSIÓN
-- =====================================================================
-- begin;
-- drop trigger if exists aviso_solicitud_v5 on public.solicitudes_inscripcion;
-- drop trigger if exists aviso_pago_v5 on public.pagos;
-- drop trigger if exists aviso_matricula_v5 on public.matriculas;
-- drop trigger if exists aviso_grupo_v5 on public.grupos;
-- drop trigger if exists aviso_horario_v5 on public.horarios;
-- drop trigger if exists aviso_evaluacion_v5 on public.evaluaciones;
-- drop trigger if exists aviso_certificado_v5 on public.certificados;
-- drop function if exists privado.aviso_solicitud(), privado.aviso_pago(), privado.aviso_matricula(),
--   privado.aviso_grupo(), privado.aviso_horario(), privado.aviso_evaluacion(),
--   privado.aviso_certificado(), privado.nombre_curso_grupo(uuid),
--   privado.notificar_estudiantes_grupo(uuid, text, text, text, text, text),
--   privado.notificar_admins(uuid, text, text, text, text, text),
--   privado.notificar(uuid, text, uuid, text, text, text, text, text);
-- drop table if exists public.notificaciones;
-- commit;
