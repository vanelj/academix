-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA) — Revisión funcional V5
-- ---------------------------------------------------------------------
-- POR QUÉ ES NECESARIA (cada bloque es independiente de la interfaz: sin
-- esta migración la app sigue funcionando como antes y avisa qué falta)
--
--   1. PAGOS DE CERTIFICADO: avisos al administrador cuando llega un
--      comprobante de certificado y al estudiante cuando se revisa (hoy el
--      cobro no genera ningún aviso y pasaba desapercibido).
--   2. CRUCES DE HORARIO DEL DOCENTE: función de lectura que devuelve las
--      franjas ocupadas del docente, también en OTRAS instituciones, sin
--      revelar su curso, grupo ni nombre (privacidad multiinstitucional).
--   3. DISPONIBILIDAD EN EL CATÁLOGO: función pública que añade a la oferta
--      los grupos EN CURSO (solo código, fechas y estado; sin docente ni
--      enlaces) para mostrar «En curso» / «Sin inscripciones abiertas».
--   4. HORA ACADÉMICA: instituciones.minutos_hora_academica (15–120, null =
--      no definida). Academix no asume ninguna equivalencia.
--   5. NOTAS: publicación POR NOTA («Guardar y publicar») sin publicar los
--      borradores de otros estudiantes; correcciones de notas visibles con
--      motivo; anulación auditada (sin borrado directo desde la app);
--      historial inmutable de cada cambio.
--   6. TAREAS: tareas del grupo, entregas del estudiante (texto y/o archivo
--      en un bucket PRIVADO), reglas de plazo, entregas tardías y reenvíos,
--      revisión y calificación integrada con las evaluaciones existentes
--      (la nota de una tarea calificable ES la nota de su evaluación).
--
-- COMPATIBILIDAD
--   - No modifica ni borra filas existentes. Las notas actuales conservan su
--     visibilidad (publicadas por evaluación) y quedan con publicada_en null.
--   - registrar_resultado_final, publicar_evaluacion, los pesos y el control
--     de resultados cerrados (proteger_calificacion) NO cambian.
--   - Tras aplicarla, las notas solo se escriben con guardar_calificaciones
--     (y calificar_entrega): se retira INSERT/UPDATE/DELETE directo sobre
--     calificaciones para que toda corrección y anulación quede registrada.
--
-- ORDEN: después de aula_academica_v5 y certificados_v5 (aplicadas).
-- Opcional: notificaciones_v5 (avisos), administracion_v5 (permisos por
-- módulo). Diagnóstico previo de solo lectura:
--   docs/diagnostico/verificacion_previa_revision_funcional_v5.sql
-- Una sola transacción: si el bloque 0 falla, no se aplica nada.
-- =====================================================================
begin;

-- 0. REQUISITOS --------------------------------------------------------
do $$
declare v_qual text;
begin
  if to_regclass('public.calificaciones') is null or to_regclass('public.evaluaciones') is null
     or to_regclass('public.materiales_curso') is null or to_regclass('public.oferta_grupos') is null then
    raise exception 'Faltan tablas de V5 (aplica antes aula_academica_v5)';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'evaluaciones' and column_name = 'publicada_en') then
    raise exception 'Aplica antes aula_academica_v5 (falta evaluaciones.publicada_en)';
  end if;
  if to_regprocedure('privado.evaluacion_publicada(uuid)') is null or to_regprocedure('privado.es_mi_matricula(uuid)') is null
     or to_regprocedure('privado.es_docente_del_grupo(uuid)') is null or to_regprocedure('privado.admin_de_institucion(uuid)') is null
     or to_regprocedure('privado.mi_institucion()') is null or to_regprocedure('privado.mi_rol_activo()') is null
     or to_regprocedure('privado.estoy_matriculado_en(uuid)') is null then
    raise exception 'Faltan funciones privadas de V5 / aula_academica_v5';
  end if;
  select qual into v_qual from pg_policies where schemaname = 'public' and tablename = 'calificaciones' and policyname = 'ver calificaciones';
  if v_qual is null or v_qual not like '%evaluacion_publicada%' then
    raise exception 'La política «ver calificaciones» no es la de aula_academica_v5: %', v_qual;
  end if;
  if exists (select 1 from storage.buckets where id = 'entregas-tareas' and public) then
    raise exception 'Ya existe un bucket entregas-tareas PÚBLICO: revísalo antes de aplicar';
  end if;
end $$;

-- 1. AVISOS DE PAGOS DE CERTIFICADO -------------------------------------
create or replace function privado.aviso_pago_certificado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_curso text;
begin
  if to_regprocedure('privado.notificar_admins(uuid,text,text,text,text,text)') is null then return new; end if;
  begin
    select c.nombre into v_curso
      from public.solicitudes_certificado s
      join public.matriculas m on m.id = s.matricula_id
      join public.grupos g on g.id = m.grupo_id
      join public.cursos c on c.id = g.curso_id
     where s.id = new.solicitud_id;
    if tg_op = 'INSERT' and new.estado::text = 'pendiente' then
      execute 'select privado.notificar_admins($1, $2, $3, $4, $5, $6)'
        using new.institucion_id, 'pago_certificado_nuevo', 'Pago de certificado por revisar',
              coalesce(v_curso, 'Un curso') || ': el estudiante subió su comprobante del certificado.',
              '/admin/pagos/certificados', 'pago_certificado_nuevo:' || new.id;
    elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado and new.estado::text in ('pagado', 'rechazado') then
      execute 'select privado.notificar($1, $2, $3, $4, $5, $6, $7, $8)'
        using new.estudiante_id, 'estudiante', new.institucion_id, 'pago_certificado_' || new.estado::text,
              case when new.estado::text = 'pagado' then 'Pago del certificado aprobado' else 'Pago del certificado rechazado' end,
              coalesce(v_curso, 'Tu curso') || case when new.estado::text = 'pagado' then '. Tu certificado ya puede emitirse.'
                                                    else coalesce('. Motivo: ' || nullif(trim(new.observacion), ''), '.') end,
              '/estudiante/certificados', 'pago_certificado_' || new.estado::text || ':' || new.id;
    end if;
  exception when others then
    raise warning 'aviso_pago_certificado: %', sqlerrm;   -- un aviso nunca bloquea el pago
  end;
  return new;
end
$$;
revoke all on function privado.aviso_pago_certificado() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.pagos_certificado') is not null then
    execute 'drop trigger if exists aviso_pago_certificado_v5 on public.pagos_certificado';
    execute 'create trigger aviso_pago_certificado_v5 after insert or update of estado on public.pagos_certificado
               for each row execute function privado.aviso_pago_certificado()';
  end if;
end $$;

-- 2. FRANJAS OCUPADAS DEL DOCENTE (cruces de horario) -------------------
-- Solo para el administrador de una institución donde el docente tiene el
-- rol docente. De otras instituciones devuelve las franjas SIN curso, grupo
-- ni nombre de la institución.
create or replace function public.franjas_ocupadas_docente(p_docente uuid, p_desde date, p_hasta date, p_excluir uuid default null)
returns table (grupo_id uuid, curso text, codigo text, institucion text, propia boolean, estado text,
               fecha_inicio text, fecha_fin text, dia_semana integer, hora_inicio text, hora_fin text)
language sql stable security definer set search_path = ''
as $$
  select g.id,
         case when g.institucion_id = privado.mi_institucion() then c.nombre end,
         case when g.institucion_id = privado.mi_institucion() then g.codigo end,
         case when g.institucion_id = privado.mi_institucion() then i.nombre end,
         g.institucion_id = privado.mi_institucion(),
         g.estado::text, g.fecha_inicio::text, g.fecha_fin::text,
         h.dia_semana::integer, h.hora_inicio::text, h.hora_fin::text
  from public.grupos g
  join public.cursos c on c.id = g.curso_id
  join public.instituciones i on i.id = g.institucion_id
  join public.horarios h on h.grupo_id = g.id
  where privado.mi_rol_activo() = 'admin'
    and exists (select 1 from public.usuario_roles ur
                 where ur.perfil_id = p_docente and ur.rol = 'docente' and ur.institucion_id = privado.mi_institucion())
    and g.docente_id = p_docente
    and g.estado::text in ('programado', 'abierto', 'en_curso')
    and (p_excluir is null or g.id <> p_excluir)
    and g.fecha_inicio <= p_hasta and g.fecha_fin >= p_desde
$$;
revoke all on function public.franjas_ocupadas_docente(uuid, date, date, uuid) from public, anon;
grant execute on function public.franjas_ocupadas_docente(uuid, date, date, uuid) to authenticated;

-- 3. OFERTA: GRUPOS INSCRIBIBLES + GRUPOS EN CURSO -----------------------
create or replace function public.resumen_oferta_grupos()
returns table (id uuid, curso_id uuid, codigo text, estado text, fecha_inicio text, fecha_fin text, vacantes_disponibles integer)
language sql stable security definer set search_path = ''
as $$
  select og.id, og.curso_id, og.codigo, og.estado::text, og.fecha_inicio::text, og.fecha_fin::text, og.vacantes_disponibles::integer
  from public.oferta_grupos og
  union all
  select g.id, g.curso_id, g.codigo, g.estado::text, g.fecha_inicio::text, g.fecha_fin::text, null::integer
  from public.grupos g
  join public.oferta_cursos oc on oc.id = g.curso_id
  where g.estado::text = 'en_curso'
$$;
revoke all on function public.resumen_oferta_grupos() from public;
grant execute on function public.resumen_oferta_grupos() to anon, authenticated;

-- 4. HORA ACADÉMICA DE LA INSTITUCIÓN ------------------------------------
alter table public.instituciones add column if not exists minutos_hora_academica smallint
  check (minutos_hora_academica is null or minutos_hora_academica between 15 and 120);
grant update (minutos_hora_academica) on public.instituciones to authenticated;   -- política «admin edita su institucion»

-- 5. NOTAS: PUBLICACIÓN POR NOTA, CORRECCIONES Y ANULACIÓN AUDITADAS -----
alter table public.calificaciones add column if not exists publicada_en timestamptz;
alter table public.calificaciones add column if not exists publicada_por uuid;

-- El estudiante ve una nota si su evaluación está publicada O si la nota se
-- publicó al guardarla. Admin y docente: igual que antes.
drop policy if exists "ver calificaciones" on public.calificaciones;
create policy "ver calificaciones" on public.calificaciones for select to authenticated
using (
  (privado.mi_rol_activo() = 'estudiante' and privado.es_mi_matricula(matricula_id)
     and (publicada_en is not null or privado.evaluacion_publicada(evaluacion_id)))
  or (institucion_id = privado.mi_institucion() and
      (privado.mi_rol_activo() = 'admin' or privado.es_docente_del_grupo(grupo_id)))
);

create table if not exists public.historial_calificaciones (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones(id),
  grupo_id        uuid not null,
  calificacion_id uuid,
  evaluacion_id   uuid not null,
  matricula_id    uuid not null,
  accion          text not null check (accion in ('registro', 'correccion', 'publicacion', 'anulacion')),
  nota_anterior   numeric(4,2),
  nota_nueva      numeric(4,2),
  motivo          text check (motivo is null or length(motivo) <= 500),
  realizado_por   uuid,
  realizado_en    timestamptz not null default now()
);
create index if not exists historial_calificaciones_idx on public.historial_calificaciones (grupo_id, matricula_id, realizado_en desc);
alter table public.historial_calificaciones enable row level security;
revoke all on table public.historial_calificaciones from public, anon, authenticated;
grant select on table public.historial_calificaciones to authenticated;   -- inmutable: sin INSERT/UPDATE/DELETE
drop policy if exists "v5 ver historial de notas" on public.historial_calificaciones;
create policy "v5 ver historial de notas" on public.historial_calificaciones for select to authenticated
  using (privado.admin_de_institucion(institucion_id)
         or (privado.es_docente_del_grupo(grupo_id) and institucion_id = privado.mi_institucion()));

-- Registra TODO cambio de calificaciones (también los de funciones SECURITY DEFINER).
create or replace function privado.historial_calificacion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_motivo text := nullif(left(current_setting('academix.motivo_nota', true), 500), '');
begin
  if tg_op = 'INSERT' then
    insert into public.historial_calificaciones (institucion_id, grupo_id, calificacion_id, evaluacion_id, matricula_id, accion, nota_nueva, motivo, realizado_por)
    values (new.institucion_id, new.grupo_id, new.id, new.evaluacion_id, new.matricula_id, 'registro', new.nota, v_motivo, auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    if new.nota is distinct from old.nota then
      insert into public.historial_calificaciones (institucion_id, grupo_id, calificacion_id, evaluacion_id, matricula_id, accion, nota_anterior, nota_nueva, motivo, realizado_por)
      values (new.institucion_id, new.grupo_id, new.id, new.evaluacion_id, new.matricula_id, 'correccion', old.nota, new.nota, v_motivo, auth.uid());
    end if;
    if new.publicada_en is not null and old.publicada_en is null then
      insert into public.historial_calificaciones (institucion_id, grupo_id, calificacion_id, evaluacion_id, matricula_id, accion, nota_nueva, realizado_por)
      values (new.institucion_id, new.grupo_id, new.id, new.evaluacion_id, new.matricula_id, 'publicacion', new.nota, auth.uid());
    end if;
    return new;
  else
    -- La anulación conserva el valor anulado en el historial inmutable.
    insert into public.historial_calificaciones (institucion_id, grupo_id, calificacion_id, evaluacion_id, matricula_id, accion, nota_anterior, motivo, realizado_por)
    values (old.institucion_id, old.grupo_id, old.id, old.evaluacion_id, old.matricula_id, 'anulacion', old.nota, v_motivo, auth.uid());
    return old;
  end if;
end
$$;
revoke all on function privado.historial_calificacion() from public, anon, authenticated;
drop trigger if exists historial_calificacion_v5 on public.calificaciones;
create trigger historial_calificacion_v5
  after insert or update or delete on public.calificaciones
  for each row execute function privado.historial_calificacion();

-- Registro de notas (docente del grupo o administrador de la institución).
--   p_notas: [{ "matricula": uuid, "evaluacion": uuid, "nota": "15.5" | null }]
--   nota null/vacía = ANULAR la nota existente (con motivo si ya era visible).
--   p_publicar: la nota queda visible al estudiante al guardarla. Solo afecta
--   a las notas de ESTA llamada (nunca publica borradores de otros).
--   Cambiar una nota ya visible exige p_motivo (5+ caracteres).
-- Cada nota se procesa por separado: un error no deshace las demás.
create or replace function public.guardar_calificaciones(p_grupo uuid, p_notas jsonb, p_publicar boolean default true, p_motivo text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_g record; v_item jsonb; v_m uuid; v_e uuid; v_txt text; v_nota numeric; v_c public.calificaciones%rowtype;
  v_existe boolean; v_visible boolean; v_ok integer := 0; v_err jsonb := '[]'::jsonb;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  select g.id, g.institucion_id, g.estado::text as estado into v_g from public.grupos g where g.id = p_grupo for update;
  if not found or not (
       (privado.es_docente_del_grupo(p_grupo) and v_g.institucion_id = privado.mi_institucion())
       or privado.admin_de_institucion(v_g.institucion_id)) then
    raise exception 'Grupo inaccesible' using errcode = '42501';
  end if;
  if v_g.estado = 'cancelado' then raise exception 'El grupo fue cancelado: no admite notas'; end if;
  if jsonb_typeof(p_notas) is distinct from 'array' or jsonb_array_length(p_notas) > 2000 then
    raise exception 'Datos de notas no válidos';
  end if;
  if v_motivo is not null and length(v_motivo) > 500 then raise exception 'El motivo admite como máximo 500 caracteres'; end if;
  perform set_config('academix.motivo_nota', coalesce(v_motivo, ''), true);

  for v_item in select value from jsonb_array_elements(p_notas) loop
    begin
      v_m := (v_item->>'matricula')::uuid;
      v_e := (v_item->>'evaluacion')::uuid;
      v_txt := nullif(trim(coalesce(v_item->>'nota', '')), '');
      if not exists (select 1 from public.matriculas m where m.id = v_m and m.grupo_id = p_grupo and m.estado::text = 'activa') then
        raise exception 'La matrícula no está activa en este grupo';
      end if;
      if not exists (select 1 from public.evaluaciones e where e.id = v_e and e.grupo_id = p_grupo) then
        raise exception 'La evaluación no pertenece a este grupo';
      end if;
      select * into v_c from public.calificaciones c where c.evaluacion_id = v_e and c.matricula_id = v_m for update;
      v_existe := found;
      v_visible := v_existe and (v_c.publicada_en is not null or privado.evaluacion_publicada(v_e));

      if v_txt is null then
        if v_existe then
          if v_visible and (v_motivo is null or length(v_motivo) < 5) then
            raise exception 'Indica el motivo para anular una nota que el estudiante ya ve';
          end if;
          delete from public.calificaciones where id = v_c.id;   -- el valor queda en historial_calificaciones
          v_ok := v_ok + 1;
        end if;
      else
        v_nota := round(v_txt::numeric, 2);
        if v_nota < 0 or v_nota > 20 then raise exception 'La nota debe estar entre 0 y 20'; end if;
        if v_existe then
          if v_c.nota <> v_nota and v_visible and (v_motivo is null or length(v_motivo) < 5) then
            raise exception 'Indica el motivo de la corrección: el estudiante ya ve esta nota';
          end if;
          if v_c.nota <> v_nota or (p_publicar and v_c.publicada_en is null) then
            update public.calificaciones
               set nota = v_nota,
                   publicada_en = case when p_publicar then coalesce(publicada_en, now()) else publicada_en end,
                   publicada_por = case when p_publicar and publicada_en is null then auth.uid() else publicada_por end
             where id = v_c.id;
            v_ok := v_ok + 1;
          end if;
        else
          insert into public.calificaciones (institucion_id, grupo_id, evaluacion_id, matricula_id, nota, publicada_en, publicada_por)
          values (v_g.institucion_id, p_grupo, v_e, v_m, v_nota,
                  case when p_publicar then now() end, case when p_publicar then auth.uid() end);
          v_ok := v_ok + 1;
        end if;
      end if;
    exception when others then
      v_err := v_err || jsonb_build_object('matricula', v_item->>'matricula', 'evaluacion', v_item->>'evaluacion', 'mensaje', sqlerrm);
    end;
  end loop;
  perform set_config('academix.motivo_nota', '', true);
  return jsonb_build_object('guardadas', v_ok, 'errores', v_err);
end
$$;
revoke all on function public.guardar_calificaciones(uuid, jsonb, boolean, text) from public, anon;
grant execute on function public.guardar_calificaciones(uuid, jsonb, boolean, text) to authenticated;

-- Desde ahora toda escritura pasa por las funciones (quedan en el historial con motivo).
revoke insert, update, delete on table public.calificaciones from authenticated;
revoke update (nota, observacion) on table public.calificaciones from authenticated;   -- permiso por columna de V5

-- 6. TAREAS Y ENTREGAS ---------------------------------------------------
create table if not exists public.tareas (
  id               uuid primary key default gen_random_uuid(),
  institucion_id   uuid not null,
  grupo_id         uuid not null,
  titulo           text not null check (length(trim(titulo)) between 3 and 160),
  instrucciones    text check (instrucciones is null or length(instrucciones) <= 5000),
  fecha_limite     timestamptz not null,
  permite_tardias  boolean not null default false,
  tardias_hasta    timestamptz,
  max_envios       smallint not null default 1 check (max_envios between 1 and 10),
  puntaje_max      numeric(5,2) not null default 20 check (puntaje_max > 0 and puntaje_max <= 100),
  evaluacion_id    uuid,
  materiales       uuid[] not null default '{}' check (cardinality(materiales) <= 10),
  enlace           text check (enlace is null or (enlace ~ '^https://[^\s]+$' and length(enlace) <= 1000)),
  estado           text not null default 'borrador' check (estado in ('borrador', 'publicada', 'cerrada')),
  publicada_en     timestamptz,
  creado_por       uuid default auth.uid(),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  foreign key (grupo_id, institucion_id) references public.grupos(id, institucion_id),
  foreign key (evaluacion_id, grupo_id) references public.evaluaciones(id, grupo_id),
  check (tardias_hasta is null or (permite_tardias and tardias_hasta > fecha_limite))
);
create unique index if not exists tareas_evaluacion_unica on public.tareas (evaluacion_id) where evaluacion_id is not null;
create index if not exists tareas_grupo_idx on public.tareas (grupo_id, fecha_limite);

create table if not exists public.entregas_tarea (
  id               uuid primary key default gen_random_uuid(),
  institucion_id   uuid not null,
  grupo_id         uuid not null,
  tarea_id         uuid not null references public.tareas(id),
  matricula_id     uuid not null,
  estudiante_id    uuid not null references public.perfiles(id),
  texto            text check (texto is null or length(texto) <= 5000),
  archivo_path     text check (archivo_path is null or length(archivo_path) <= 500),
  archivo_nombre   text check (archivo_nombre is null or length(archivo_nombre) <= 200),
  archivo_tipo     text check (archivo_tipo is null or length(archivo_tipo) <= 120),
  archivo_bytes    integer check (archivo_bytes is null or archivo_bytes between 1 and 20971520),
  envios           smallint not null default 1,
  entregada_en     timestamptz not null default now(),
  tardia           boolean not null default false,
  estado           text not null default 'entregada' check (estado in ('entregada', 'calificada', 'devuelta')),
  puntaje          numeric(5,2),
  comentario       text check (comentario is null or length(comentario) <= 2000),
  calificada_por   uuid,
  calificada_en    timestamptz,
  unique (tarea_id, matricula_id),
  foreign key (matricula_id, grupo_id) references public.matriculas(id, grupo_id),
  check (texto is not null or archivo_path is not null),
  check (archivo_path is null or archivo_path like institucion_id::text || '/' || grupo_id::text || '/' || tarea_id::text || '/' || estudiante_id::text || '/%')
);
create index if not exists entregas_tarea_idx on public.entregas_tarea (tarea_id, estado);

alter table public.tareas enable row level security;
alter table public.entregas_tarea enable row level security;
revoke all on table public.tareas, public.entregas_tarea from public, anon, authenticated;
grant select on table public.tareas, public.entregas_tarea to authenticated;   -- escrituras SOLO por funciones

drop policy if exists "v5 ver tareas" on public.tareas;
create policy "v5 ver tareas" on public.tareas for select to authenticated
  using (privado.gestiona_materiales_grupo(grupo_id)
         or (estado <> 'borrador' and privado.mi_rol_activo() = 'estudiante' and privado.estoy_matriculado_en(grupo_id)));

drop policy if exists "v5 ver entregas" on public.entregas_tarea;
create policy "v5 ver entregas" on public.entregas_tarea for select to authenticated
  using (privado.gestiona_materiales_grupo(grupo_id)
         or (estudiante_id = auth.uid() and privado.mi_rol_activo() = 'estudiante'));

-- Crear o editar una tarea (docente del grupo o administrador).
create or replace function public.guardar_tarea(p_tarea uuid, p_grupo uuid, p_datos jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_g record; v_t public.tareas%rowtype; v_id uuid; v_eval uuid; v_mats uuid[]; v_limite timestamptz; v_hasta timestamptz;
begin
  select g.id, g.institucion_id, g.estado::text as estado into v_g from public.grupos g where g.id = p_grupo;
  if not found or not privado.gestiona_materiales_grupo(p_grupo) then raise exception 'Grupo inaccesible' using errcode = '42501'; end if;
  if v_g.estado in ('cerrado', 'cancelado') then raise exception 'El grupo está cerrado o cancelado'; end if;
  v_limite := (p_datos->>'fecha_limite')::timestamptz;
  v_hasta := nullif(p_datos->>'tardias_hasta', '')::timestamptz;
  v_eval := nullif(p_datos->>'evaluacion_id', '')::uuid;
  select coalesce(array_agg(x::uuid), '{}') into v_mats from jsonb_array_elements_text(coalesce(p_datos->'materiales', '[]'::jsonb)) x;
  if v_eval is not null and not exists (select 1 from public.evaluaciones e where e.id = v_eval and e.grupo_id = p_grupo) then
    raise exception 'La evaluación no pertenece a este grupo';
  end if;
  if exists (select 1 from unnest(v_mats) m where not exists (select 1 from public.materiales_curso mc where mc.id = m and mc.grupo_id = p_grupo)) then
    raise exception 'Uno de los materiales adjuntos no pertenece a este grupo';
  end if;
  if p_tarea is null then
    insert into public.tareas (institucion_id, grupo_id, titulo, instrucciones, fecha_limite, permite_tardias, tardias_hasta, max_envios, puntaje_max, evaluacion_id, materiales, enlace)
    values (v_g.institucion_id, p_grupo, trim(p_datos->>'titulo'), nullif(trim(coalesce(p_datos->>'instrucciones', '')), ''), v_limite,
            coalesce((p_datos->>'permite_tardias')::boolean, false), v_hasta, coalesce((p_datos->>'max_envios')::smallint, 1),
            coalesce((p_datos->>'puntaje_max')::numeric, 20), v_eval, v_mats, nullif(trim(coalesce(p_datos->>'enlace', '')), ''))
    returning id into v_id;
    return v_id;
  end if;
  select * into v_t from public.tareas where id = p_tarea and grupo_id = p_grupo for update;
  if not found then raise exception 'La tarea no existe' using errcode = '42501'; end if;
  if v_t.evaluacion_id is distinct from v_eval and exists (select 1 from public.entregas_tarea en where en.tarea_id = v_t.id and en.estado = 'calificada') then
    raise exception 'La tarea ya tiene entregas calificadas: no se cambia su evaluación';
  end if;
  update public.tareas set titulo = trim(p_datos->>'titulo'), instrucciones = nullif(trim(coalesce(p_datos->>'instrucciones', '')), ''),
         fecha_limite = v_limite, permite_tardias = coalesce((p_datos->>'permite_tardias')::boolean, false), tardias_hasta = v_hasta,
         max_envios = coalesce((p_datos->>'max_envios')::smallint, 1), puntaje_max = coalesce((p_datos->>'puntaje_max')::numeric, 20),
         evaluacion_id = v_eval, materiales = v_mats, enlace = nullif(trim(coalesce(p_datos->>'enlace', '')), ''), actualizado_en = now()
   where id = v_t.id;
  return v_t.id;
end
$$;

-- Publicar / cerrar / volver a borrador (sin entregas). Avisa a los estudiantes al publicar.
create or replace function public.cambiar_estado_tarea(p_tarea uuid, p_estado text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_t public.tareas%rowtype; v_curso text;
begin
  select * into v_t from public.tareas where id = p_tarea for update;
  if not found or not privado.gestiona_materiales_grupo(v_t.grupo_id) then raise exception 'Tarea inaccesible' using errcode = '42501'; end if;
  if p_estado not in ('borrador', 'publicada', 'cerrada') then raise exception 'Estado no válido'; end if;
  if p_estado = 'borrador' and exists (select 1 from public.entregas_tarea e where e.tarea_id = v_t.id) then
    raise exception 'La tarea ya tiene entregas: ciérrala en lugar de volver a borrador';
  end if;
  update public.tareas set estado = p_estado, publicada_en = case when p_estado = 'publicada' then coalesce(publicada_en, now()) else publicada_en end,
         actualizado_en = now() where id = v_t.id;
  if p_estado = 'publicada' and v_t.publicada_en is null and to_regprocedure('privado.notificar_estudiantes_grupo(uuid,text,text,text,text,text)') is not null then
    begin
      select c.nombre into v_curso from public.grupos g join public.cursos c on c.id = g.curso_id where g.id = v_t.grupo_id;
      execute 'select privado.notificar_estudiantes_grupo($1, $2, $3, $4, $5, $6)'
        using v_t.grupo_id, 'tarea_publicada', 'Nueva tarea: ' || left(v_t.titulo, 120), coalesce(v_curso, 'Tu curso') || '.',
              '/estudiante/cursos', 'tarea_publicada:' || v_t.id;
    exception when others then raise warning 'cambiar_estado_tarea (aviso): %', sqlerrm;
    end;
  end if;
  return p_estado;
end
$$;

-- Entrega del estudiante. Reglas explícitas:
--   - Hasta fecha_limite: a tiempo.
--   - Después: solo si permite_tardias y (sin tardias_hasta o antes de esa fecha) → tardía.
--   - Reenvío: mientras no esté calificada (o fue devuelta) y queden envíos (max_envios).
--     Una entrega devuelta admite un reenvío adicional.
create or replace function public.entregar_tarea(p_tarea uuid, p_texto text, p_archivo_path text, p_archivo_nombre text, p_archivo_tipo text, p_archivo_bytes integer)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_t public.tareas%rowtype; v_m record; v_e public.entregas_tarea%rowtype; v_tardia boolean; v_id uuid;
  v_texto text := nullif(trim(coalesce(p_texto, '')), ''); v_path text := nullif(trim(coalesce(p_archivo_path, '')), '');
begin
  if privado.mi_rol_activo() <> 'estudiante' then raise exception 'Solo estudiantes pueden entregar tareas' using errcode = '42501'; end if;
  select * into v_t from public.tareas where id = p_tarea;
  if not found or v_t.estado <> 'publicada' then raise exception 'La tarea no está disponible para entregas'; end if;
  select m.id, m.institucion_id, m.grupo_id into v_m from public.matriculas m
   where m.grupo_id = v_t.grupo_id and m.estudiante_id = auth.uid() and m.estado::text = 'activa';
  if not found then raise exception 'No tienes matrícula activa en este grupo' using errcode = '42501'; end if;
  if v_texto is null and v_path is null then raise exception 'Escribe tu respuesta o adjunta un archivo'; end if;
  if v_path is not null then
    if v_path not like v_t.institucion_id::text || '/' || v_t.grupo_id::text || '/' || v_t.id::text || '/' || auth.uid()::text || '/%' then
      raise exception 'El archivo debe estar en tu carpeta de entregas';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'entregas-tareas' and o.name = v_path) then
      raise exception 'No se encontró el archivo subido';
    end if;
  end if;
  v_tardia := now() > v_t.fecha_limite;
  if v_tardia and not (v_t.permite_tardias and (v_t.tardias_hasta is null or now() <= v_t.tardias_hasta)) then
    raise exception 'El plazo de entrega venció';
  end if;
  select * into v_e from public.entregas_tarea where tarea_id = v_t.id and matricula_id = v_m.id for update;
  if not found then
    insert into public.entregas_tarea (institucion_id, grupo_id, tarea_id, matricula_id, estudiante_id, texto, archivo_path, archivo_nombre, archivo_tipo, archivo_bytes, tardia)
    values (v_t.institucion_id, v_t.grupo_id, v_t.id, v_m.id, auth.uid(), v_texto, v_path, left(p_archivo_nombre, 200), left(p_archivo_tipo, 120), p_archivo_bytes, v_tardia)
    returning id into v_id;
    return v_id;
  end if;
  if v_e.estado = 'calificada' then raise exception 'Tu entrega ya fue calificada'; end if;
  if v_e.estado <> 'devuelta' and v_e.envios >= v_t.max_envios then raise exception 'Ya usaste todos los envíos permitidos'; end if;
  update public.entregas_tarea set texto = v_texto, archivo_path = coalesce(v_path, archivo_path),
         archivo_nombre = case when v_path is not null then left(p_archivo_nombre, 200) else archivo_nombre end,
         archivo_tipo = case when v_path is not null then left(p_archivo_tipo, 120) else archivo_tipo end,
         archivo_bytes = case when v_path is not null then p_archivo_bytes else archivo_bytes end,
         envios = envios + 1, entregada_en = now(), tardia = v_tardia, estado = 'entregada'
   where id = v_e.id;
  return v_e.id;
end
$$;

-- Revisión del docente: comentario, puntaje y (si la tarea es calificable)
-- la nota de su evaluación, publicada al estudiante. p_devolver = pedir corrección.
create or replace function public.calificar_entrega(p_entrega uuid, p_puntaje numeric, p_comentario text, p_devolver boolean default false)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_e public.entregas_tarea%rowtype; v_t public.tareas%rowtype; v_nota numeric; v_r jsonb;
begin
  select * into v_e from public.entregas_tarea where id = p_entrega for update;
  if not found then raise exception 'Entrega inaccesible' using errcode = '42501'; end if;
  select * into v_t from public.tareas where id = v_e.tarea_id;
  if not privado.gestiona_materiales_grupo(v_e.grupo_id) then raise exception 'Entrega inaccesible' using errcode = '42501'; end if;
  if p_devolver then
    if length(trim(coalesce(p_comentario, ''))) < 5 then raise exception 'Indica qué debe corregir el estudiante'; end if;
    update public.entregas_tarea set estado = 'devuelta', comentario = left(trim(p_comentario), 2000), calificada_por = auth.uid(), calificada_en = now() where id = v_e.id;
    return 'devuelta';
  end if;
  if p_puntaje is null or p_puntaje < 0 or p_puntaje > v_t.puntaje_max then
    raise exception 'El puntaje debe estar entre 0 y %', v_t.puntaje_max;
  end if;
  update public.entregas_tarea set estado = 'calificada', puntaje = round(p_puntaje, 2), comentario = nullif(left(trim(coalesce(p_comentario, '')), 2000), ''),
         calificada_por = auth.uid(), calificada_en = now() where id = v_e.id;
  if v_t.evaluacion_id is not null then
    v_nota := round(p_puntaje / v_t.puntaje_max * 20, 2);
    v_r := public.guardar_calificaciones(v_e.grupo_id,
             jsonb_build_array(jsonb_build_object('matricula', v_e.matricula_id, 'evaluacion', v_t.evaluacion_id, 'nota', v_nota::text)),
             true, 'Calificación de la tarea «' || left(v_t.titulo, 100) || '»');
    if jsonb_array_length(v_r->'errores') > 0 then
      raise exception '%', v_r->'errores'->0->>'mensaje';
    end if;
  end if;
  return 'calificada';
end
$$;

revoke all on function public.guardar_tarea(uuid, uuid, jsonb), public.cambiar_estado_tarea(uuid, text),
  public.entregar_tarea(uuid, text, text, text, text, integer), public.calificar_entrega(uuid, numeric, text, boolean) from public, anon;
grant execute on function public.guardar_tarea(uuid, uuid, jsonb), public.cambiar_estado_tarea(uuid, text),
  public.entregar_tarea(uuid, text, text, text, text, integer), public.calificar_entrega(uuid, numeric, text, boolean) to authenticated;

-- Bucket PRIVADO de entregas: <institución>/<grupo>/<tarea>/<estudiante>/<archivo>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entregas-tareas', 'entregas-tareas', false, 20971520, array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'image/png', 'image/jpeg', 'image/webp', 'application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function privado.ruta_entrega_valida(p_nombre text, p_para_subir boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v text[] := string_to_array(p_nombre, '/'); v_t public.tareas%rowtype; re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if array_length(v, 1) <> 5 or v[1] !~* re or v[2] !~* re or v[3] !~* re or v[4] !~* re or length(v[5]) = 0 then return false; end if;
  select * into v_t from public.tareas where id = v[3]::uuid and grupo_id = v[2]::uuid and institucion_id = v[1]::uuid;
  if not found then return false; end if;
  if p_para_subir then
    return v[4]::uuid = auth.uid() and v_t.estado = 'publicada' and privado.mi_rol_activo() = 'estudiante' and privado.estoy_matriculado_en(v_t.grupo_id);
  end if;
  return (v[4]::uuid = auth.uid() and privado.mi_rol_activo() = 'estudiante') or privado.gestiona_materiales_grupo(v_t.grupo_id);
end $$;
revoke all on function privado.ruta_entrega_valida(text, boolean) from public, anon;
grant execute on function privado.ruta_entrega_valida(text, boolean) to authenticated;

drop policy if exists "v5 entregas: subir" on storage.objects;
create policy "v5 entregas: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'entregas-tareas' and privado.ruta_entrega_valida(name, true));
drop policy if exists "v5 entregas: leer" on storage.objects;
create policy "v5 entregas: leer" on storage.objects for select to authenticated
  using (bucket_id = 'entregas-tareas' and privado.ruta_entrega_valida(name, false));
-- Sin políticas de UPDATE/DELETE: una entrega enviada no se reemplaza ni se borra en Storage.

-- 7. VERIFICACIÓN (dentro de la transacción) ------------------------------
do $$
begin
  if has_table_privilege('authenticated', 'public.calificaciones', 'DELETE') or has_table_privilege('authenticated', 'public.calificaciones', 'INSERT')
     or has_column_privilege('authenticated', 'public.calificaciones', 'nota', 'UPDATE') then
    raise exception 'calificaciones aún admite escritura directa';
  end if;
  if has_table_privilege('anon', 'public.tareas', 'SELECT') or has_table_privilege('anon', 'public.entregas_tarea', 'SELECT') then
    raise exception 'anon no debe leer tareas ni entregas';
  end if;
  if exists (select 1 from storage.buckets where id = 'entregas-tareas' and public) then
    raise exception 'El bucket entregas-tareas debe ser privado';
  end if;
end $$;

commit;

-- =====================================================================
-- COMPROBACIONES POSTERIORES (solo lectura)
-- =====================================================================
-- select to_regprocedure('public.guardar_calificaciones(uuid,jsonb,boolean,text)'), to_regprocedure('public.resumen_oferta_grupos()'),
--        to_regprocedure('public.franjas_ocupadas_docente(uuid,date,date,uuid)'), to_regclass('public.tareas'), to_regclass('public.historial_calificaciones');
-- select column_name from information_schema.columns where table_name = 'instituciones' and column_name = 'minutos_hora_academica';
-- select tgname from pg_trigger where tgname in ('historial_calificacion_v5', 'aviso_pago_certificado_v5');
-- select id, public, file_size_limit from storage.buckets where id = 'entregas-tareas';   -- public = false

-- =====================================================================
-- REVERSIÓN (no recomendada tras usarla: perdería tareas y el historial)
-- =====================================================================
-- begin;
-- grant insert, delete on public.calificaciones to authenticated;
-- grant update (nota, observacion) on public.calificaciones to authenticated;
-- drop policy if exists "ver calificaciones" on public.calificaciones;
-- create policy "ver calificaciones" on public.calificaciones for select to authenticated using (
--   (privado.mi_rol_activo() = 'estudiante' and privado.es_mi_matricula(matricula_id) and privado.evaluacion_publicada(evaluacion_id))
--   or (institucion_id = privado.mi_institucion() and (privado.mi_rol_activo() = 'admin' or privado.es_docente_del_grupo(grupo_id))));
-- drop trigger if exists historial_calificacion_v5 on public.calificaciones;
-- drop trigger if exists aviso_pago_certificado_v5 on public.pagos_certificado;
-- drop function if exists public.guardar_calificaciones(uuid, jsonb, boolean, text), public.calificar_entrega(uuid, numeric, text, boolean),
--   public.entregar_tarea(uuid, text, text, text, text, integer), public.cambiar_estado_tarea(uuid, text), public.guardar_tarea(uuid, uuid, jsonb),
--   public.resumen_oferta_grupos(), public.franjas_ocupadas_docente(uuid, date, date, uuid);
-- drop policy if exists "v5 entregas: subir" on storage.objects;
-- drop policy if exists "v5 entregas: leer" on storage.objects;
-- drop table if exists public.entregas_tarea, public.tareas;   -- ¡borra tareas y entregas!
-- commit;
