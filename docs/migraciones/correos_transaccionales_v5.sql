-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA) — Correos transaccionales de pagos
--
-- QUÉ HACE
--   Bandeja de salida (outbox) en la BD. Los correos se ENCOLAN dentro de la
--   misma transacción que cambia el estado (disparadores), y la app los ENVÍA
--   después con Resend (src/lib/correos). Así:
--   - Nunca se envía un correo de algo que se deshizo (ROLLBACK = no se encola).
--   - Sin duplicados: cada evento tiene una clave única (ON CONFLICT DO NOTHING)
--     y la misma clave viaja a Resend como Idempotency-Key.
--   - Los fallos quedan registrados (intentos, ultimo_error) y se reintentan
--     con espera creciente; tras max_intentos quedan en 'fallido'.
--   - Un fallo al encolar NUNCA bloquea un pago, matrícula ni solicitud: los
--     disparadores capturan cualquier error y solo emiten un WARNING.
--
-- EVENTOS (tipo → cuándo)
--   solicitud_recibida      INSERT en solicitudes_inscripcion (con instrucciones de pago)
--   reserva_confirmada      solicitud → 'reservada'
--   solicitud_rechazada     solicitud → 'rechazada'
--   solicitud_cancelada     solicitud → 'cancelada'
--   reserva_vencida         solicitud → 'vencida', o reserva caducada (tarea programada)
--   reserva_por_vencer      reserva que caduca en < 24 h (tarea programada)
--   comprobante_recibido    INSERT en pagos (al estudiante)
--   comprobante_por_revisar INSERT en pagos (al correo de contacto de la institución)
--   pago_rechazado          pago → 'rechazado' (con la observación)
--   cuota_confirmada        pago de cuota → 'pagado' (con saldo restante)
--   matricula_confirmada    INSERT en matriculas (con cronograma de cuotas)
--   matricula_anulada       matrícula → 'anulada'
--   recordatorio_cuota      3 días antes, el día del vencimiento, y 1 y 7 días
--                           después (tarea programada; omite cuotas con un
--                           comprobante en revisión)
--   El pago aprobado de una SOLICITUD no genera un correo aparte: lo informan
--   reserva_confirmada o matricula_confirmada (un solo correo por evento).
--
-- NO MODIFICA tablas, funciones, políticas ni disparadores existentes: solo
-- AÑADE una tabla, funciones y disparadores nuevos. Idempotente (se puede
-- volver a ejecutar). Reversión al final del archivo.
--
-- PERMISOS
--   - authenticated: solo LEE los correos de su institución si es admin
--     (RLS) y puede pedir reintentar uno fallido (correos_reintentar).
--   - correos_tomar / correos_resultado / encolar_recordatorios_correo: solo
--     service_role. Las usa el procesador del servidor (sin sesión de usuario),
--     protegido con CRON_SECRET. Nunca desde el navegador.
--
-- CÓMO APLICAR: revisar y ejecutar en Supabase > SQL Editor.
-- =====================================================================

begin;

-- 1. BANDEJA DE SALIDA ------------------------------------------------
create table if not exists public.correos_salientes (
  id               uuid primary key default gen_random_uuid(),
  institucion_id   uuid references public.instituciones(id),
  usuario_id       uuid references auth.users(id) on delete set null,
  destinatario     text not null check (position('@' in destinatario) > 1),
  tipo             text not null,
  clave            text not null unique check (length(clave) <= 256),
  datos            jsonb not null default '{}'::jsonb,
  estado           text not null default 'pendiente'
                     check (estado in ('pendiente','enviando','enviado','fallido')),
  intentos         integer not null default 0,
  max_intentos     integer not null default 6,
  proximo_intento  timestamptz not null default now(),
  bloqueado_hasta  timestamptz,
  ultimo_error     text,
  proveedor_id     text,
  creado_en        timestamptz not null default now(),
  enviado_en       timestamptz
);
create index if not exists correos_salientes_cola_idx
  on public.correos_salientes (proximo_intento) where estado in ('pendiente','enviando');
create index if not exists correos_salientes_inst_idx
  on public.correos_salientes (institucion_id, creado_en desc);

alter table public.correos_salientes enable row level security;
revoke all on table public.correos_salientes from anon, authenticated;
grant select on table public.correos_salientes to authenticated;

drop policy if exists "v5 admin ve correos de su institucion" on public.correos_salientes;
create policy "v5 admin ve correos de su institucion" on public.correos_salientes
  for select to authenticated
  using (privado.admin_de_institucion(institucion_id));

-- 2. AUXILIARES --------------------------------------------------------
-- Encola un correo. Si no hay destinatario o la clave ya existe, no hace nada.
create or replace function privado.encolar_correo(
  p_tipo text, p_clave text, p_usuario uuid, p_correo text, p_institucion uuid, p_datos jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_correo text := nullif(trim(p_correo), '');
begin
  if v_correo is null and p_usuario is not null then
    select u.email into v_correo from auth.users u where u.id = p_usuario;
  end if;
  if v_correo is null or position('@' in v_correo) < 2 then return; end if;
  insert into public.correos_salientes (institucion_id, usuario_id, destinatario, tipo, clave, datos)
  values (p_institucion, p_usuario, lower(v_correo), p_tipo, p_clave, coalesce(p_datos, '{}'::jsonb))
  on conflict (clave) do nothing;
end
$$;

-- Datos comunes de un grupo: curso, institución, contacto e instrucciones de pago
-- (el texto que la propia institución escribió en sus políticas; nunca inventado).
create or replace function privado.correo_contexto(p_grupo uuid, p_perfil uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'curso', c.nombre, 'grupo', g.codigo, 'fecha_inicio', g.fecha_inicio,
    'institucion', i.nombre, 'institucion_correo', i.correo, 'institucion_telefono', i.telefono,
    'instrucciones_pago', pi.texto_pagos,
    'nombre', (select p.nombres from public.perfiles p where p.id = p_perfil))
  from public.grupos g
  join public.cursos c on c.id = g.curso_id
  join public.instituciones i on i.id = g.institucion_id
  left join public.politicas_institucion pi on pi.institucion_id = i.id
  where g.id = p_grupo
$$;

revoke all on function privado.encolar_correo(text, text, uuid, text, uuid, jsonb) from public;
revoke all on function privado.correo_contexto(uuid, uuid) from public;

-- 3. DISPARADORES ------------------------------------------------------
-- 3a. Solicitudes: alta y cambios de estado.
create or replace function privado.correo_solicitud()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_tipo text;
  v_ctx jsonb;
  v_monto numeric;
begin
  if tg_op = 'INSERT' then
    v_tipo := 'solicitud_recibida';
  elsif new.estado is distinct from old.estado then
    v_tipo := case new.estado
      when 'reservada' then 'reserva_confirmada'
      when 'rechazada' then 'solicitud_rechazada'
      when 'cancelada' then 'solicitud_cancelada'
      when 'vencida'   then 'reserva_vencida'
      else null end;  -- 'matriculada' lo informa matricula_confirmada
  end if;
  if v_tipo is null then return null; end if;

  begin
    v_ctx := privado.correo_contexto(new.grupo_id, new.estudiante_id);
    if v_tipo = 'reserva_confirmada' then
      select p.monto into v_monto from public.pagos p
      where p.solicitud_id = new.id and p.estado = 'pagado' order by p.verificado_en desc nulls last limit 1;
    end if;
    perform privado.encolar_correo(v_tipo, v_tipo || ':' || new.id, new.estudiante_id, null, new.institucion_id,
      v_ctx || jsonb_build_object(
        'solicitud_id', new.id, 'tipo_solicitud', new.tipo, 'importe', new.importe_esperado,
        'reserva_vence_en', new.reserva_vence_en, 'comentario', new.comentario_revision,
        'monto_aprobado', v_monto));
  exception when others then
    raise warning 'correo_solicitud: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end
$$;

drop trigger if exists correo_solicitud_v5 on public.solicitudes_inscripcion;
create trigger correo_solicitud_v5
  after insert or update of estado on public.solicitudes_inscripcion
  for each row execute function privado.correo_solicitud();

-- 3b. Pagos: comprobante recibido (al insertar) y resultado de la revisión.
--     DIFERIDO hasta el COMMIT: revisar_pago actualiza la cuota después del pago,
--     y el saldo se calcula con el estado final de la transacción.
create or replace function privado.correo_pago()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p record;
  v_grupo uuid;
  v_concepto text;
  v_ctx jsonb;
  v_datos jsonb;
  v_cuota_importe numeric;
  v_cuota_estado text;
  v_cuota_vence date;
  v_aplicado numeric;
  v_inst_correo text;
begin
  begin
    select * into p from public.pagos where id = new.id;
    if not found or p.estudiante_id is null or (p.solicitud_id is null and p.cuota_id is null) then
      return null;  -- pagos V4 (por matrícula) no generan correos
    end if;

    if p.solicitud_id is not null then
      select s.grupo_id, case s.tipo when 'reserva' then 'Reserva de vacante' else 'Matrícula' end
        into v_grupo, v_concepto
      from public.solicitudes_inscripcion s where s.id = p.solicitud_id;
    else
      select m.grupo_id, q.concepto || ' ' || q.numero, q.importe, q.estado, q.vencimiento
        into v_grupo, v_concepto, v_cuota_importe, v_cuota_estado, v_cuota_vence
      from public.cuotas q join public.matriculas m on m.id = q.matricula_id where q.id = p.cuota_id;
    end if;

    v_ctx := privado.correo_contexto(v_grupo, p.estudiante_id);
    v_datos := v_ctx || jsonb_build_object(
      'pago_id', p.id, 'monto', p.monto, 'metodo', p.metodo, 'referencia', p.referencia_operacion,
      'concepto', v_concepto, 'observacion', p.observacion);

    if tg_op = 'INSERT' then
      if p.estado <> 'pendiente' then return null; end if;
      perform privado.encolar_correo('comprobante_recibido', 'comprobante_recibido:' || p.id,
        p.estudiante_id, null, p.institucion_id, v_datos);
      select i.correo into v_inst_correo from public.instituciones i where i.id = p.institucion_id;
      perform privado.encolar_correo('comprobante_por_revisar', 'comprobante_por_revisar:' || p.id,
        null, v_inst_correo, p.institucion_id,
        v_datos || jsonb_build_object('estudiante',
          (select pf.nombres || ' ' || pf.apellidos from public.perfiles pf where pf.id = p.estudiante_id)));
      return null;
    end if;

    if p.estado = 'rechazado' then
      perform privado.encolar_correo('pago_rechazado', 'pago_rechazado:' || p.id,
        p.estudiante_id, null, p.institucion_id, v_datos);
    elsif p.estado = 'pagado' and p.cuota_id is not null then
      select coalesce(sum(x.monto), 0) into v_aplicado from public.pagos x
      where x.cuota_id = p.cuota_id and x.estado = 'pagado';
      perform privado.encolar_correo('cuota_confirmada', 'cuota_confirmada:' || p.id,
        p.estudiante_id, null, p.institucion_id,
        v_datos || jsonb_build_object('cuota_estado', v_cuota_estado, 'importe_cuota', v_cuota_importe,
          'saldo', greatest(v_cuota_importe - v_aplicado, 0), 'vencimiento', v_cuota_vence));
    end if;
  exception when others then
    raise warning 'correo_pago: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end
$$;

drop trigger if exists correo_pago_v5 on public.pagos;
create constraint trigger correo_pago_v5
  after insert or update on public.pagos
  deferrable initially deferred
  for each row execute function privado.correo_pago();

-- 3c. Matrículas: confirmación (con cronograma) y anulación. DIFERIDO: las
--     cuotas se crean y se anulan en la misma transacción, después de la fila.
create or replace function privado.correo_matricula()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  m record;
  v_ctx jsonb;
  v_cuotas jsonb;
  v_monto numeric;
begin
  begin
    select * into m from public.matriculas where id = new.id;
    if not found then return null; end if;
    v_ctx := privado.correo_contexto(m.grupo_id, m.estudiante_id);

    if tg_op = 'INSERT' and m.estado = 'activa' then
      select coalesce(jsonb_agg(jsonb_build_object('numero', q.numero, 'concepto', q.concepto,
               'importe', q.importe, 'vencimiento', q.vencimiento) order by q.numero), '[]'::jsonb)
        into v_cuotas from public.cuotas q where q.matricula_id = m.id;
      select p.monto into v_monto from public.pagos p
        join public.solicitudes_inscripcion s on s.id = p.solicitud_id
      where s.matricula_id = m.id and p.estado = 'pagado' order by p.verificado_en desc nulls last limit 1;
      perform privado.encolar_correo('matricula_confirmada', 'matricula_confirmada:' || m.id,
        m.estudiante_id, null, m.institucion_id,
        v_ctx || jsonb_build_object('matricula_id', m.id, 'cuotas', v_cuotas, 'monto_aprobado', v_monto));
    elsif tg_op = 'UPDATE' and m.estado = 'anulada' and old.estado is distinct from 'anulada' then
      perform privado.encolar_correo('matricula_anulada', 'matricula_anulada:' || m.id,
        m.estudiante_id, null, m.institucion_id,
        v_ctx || jsonb_build_object('matricula_id', m.id,
          'cuotas_anuladas', (select count(*) from public.cuotas q where q.matricula_id = m.id and q.estado = 'anulada'),
          'cuotas_parciales', (select count(*) from public.cuotas q where q.matricula_id = m.id and q.estado = 'parcial')));
    end if;
  exception when others then
    raise warning 'correo_matricula: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end
$$;

drop trigger if exists correo_matricula_v5 on public.matriculas;
create constraint trigger correo_matricula_v5
  after insert or update on public.matriculas
  deferrable initially deferred
  for each row execute function privado.correo_matricula();

revoke all on function privado.correo_solicitud() from public;
revoke all on function privado.correo_pago() from public;
revoke all on function privado.correo_matricula() from public;

-- 4. RECORDATORIOS (tarea programada) ---------------------------------
-- Encola recordatorios de cuotas y de reservas. La clave incluye el momento,
-- así que llamarla muchas veces al día no duplica nada. Fechas en hora de Lima.
create or replace function public.encolar_recordatorios_correo()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_antes integer;
  r record;
begin
  select count(*) into v_antes from public.correos_salientes;

  for r in
    select q.id, q.numero, q.concepto, q.importe, q.vencimiento, q.institucion_id, m.estudiante_id, m.grupo_id,
           case v_hoy - q.vencimiento when -3 then 'faltan_3' when 0 then 'hoy' when 1 then 'vencida_1' when 7 then 'vencida_7' end as momento,
           q.importe - coalesce((select sum(x.monto) from public.pagos x where x.cuota_id = q.id and x.estado = 'pagado'), 0) as saldo
    from public.cuotas q
    join public.matriculas m on m.id = q.matricula_id
    join public.instituciones i on i.id = q.institucion_id
    where q.estado in ('pendiente','parcial') and m.estado = 'activa' and i.activo
      and (v_hoy - q.vencimiento) in (-3, 0, 1, 7)
      and not exists (select 1 from public.pagos x where x.cuota_id = q.id and x.estado = 'pendiente')
  loop
    perform privado.encolar_correo('recordatorio_cuota', 'recordatorio_cuota:' || r.id || ':' || r.vencimiento || ':' || r.momento,
      r.estudiante_id, null, r.institucion_id,
      privado.correo_contexto(r.grupo_id, r.estudiante_id) || jsonb_build_object(
        'cuota_id', r.id, 'concepto', r.concepto || ' ' || r.numero, 'importe_cuota', r.importe,
        'saldo', r.saldo, 'vencimiento', r.vencimiento, 'momento', r.momento));
  end loop;

  for r in
    select s.id, s.institucion_id, s.estudiante_id, s.grupo_id, s.reserva_vence_en,
           case when s.reserva_vence_en <= now() then 'reserva_vencida' else 'reserva_por_vencer' end as tipo
    from public.solicitudes_inscripcion s
    join public.instituciones i on i.id = s.institucion_id
    where s.estado = 'reservada' and i.activo
      and s.reserva_vence_en <= now() + interval '24 hours'
      and s.reserva_vence_en > now() - interval '3 days'
  loop
    perform privado.encolar_correo(r.tipo, r.tipo || ':' || r.id, r.estudiante_id, null, r.institucion_id,
      privado.correo_contexto(r.grupo_id, r.estudiante_id) || jsonb_build_object(
        'solicitud_id', r.id, 'reserva_vence_en', r.reserva_vence_en));
  end loop;

  return (select count(*) from public.correos_salientes) - v_antes;
end
$$;

-- 5. PROCESADOR (solo service_role) ------------------------------------
-- Toma un lote para enviar. SKIP LOCKED: dos procesadores simultáneos nunca
-- toman el mismo correo. Un correo 'enviando' cuyo bloqueo venció (el proceso
-- se cortó) vuelve a tomarse; la Idempotency-Key evita el doble envío en Resend.
create or replace function public.correos_tomar(p_limite integer default 20)
returns setof public.correos_salientes
language plpgsql security definer set search_path = ''
as $$
begin
  -- Agotados con bloqueo vencido → fallido.
  update public.correos_salientes
     set estado = 'fallido', bloqueado_hasta = null,
         ultimo_error = coalesce(ultimo_error, 'Envío interrumpido')
   where estado = 'enviando' and bloqueado_hasta < now() and intentos >= max_intentos;

  return query
  update public.correos_salientes c
     set estado = 'enviando', intentos = c.intentos + 1, bloqueado_hasta = now() + interval '5 minutes'
   where c.id in (
     select x.id from public.correos_salientes x
      where x.intentos < x.max_intentos
        and ((x.estado = 'pendiente' and x.proximo_intento <= now())
          or (x.estado = 'enviando' and x.bloqueado_hasta < now()))
      order by x.proximo_intento
      limit least(greatest(coalesce(p_limite, 20), 1), 100)
      for update skip locked)
  returning c.*;
end
$$;

-- Resultado de un envío. Reintentos con espera 2, 4, 8, 16, 32 min (máx. 6 h).
create or replace function public.correos_resultado(
  p_id uuid, p_ok boolean, p_proveedor_id text, p_error text, p_reintentable boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.correos_salientes c set
    estado = case when p_ok then 'enviado'
                  when p_reintentable and c.intentos < c.max_intentos then 'pendiente'
                  else 'fallido' end,
    enviado_en = case when p_ok then now() else c.enviado_en end,
    proveedor_id = coalesce(p_proveedor_id, c.proveedor_id),
    ultimo_error = case when p_ok then null else left(p_error, 500) end,
    proximo_intento = case when p_ok then c.proximo_intento
                           else now() + least(interval '1 minute' * power(2, c.intentos), interval '6 hours') end,
    bloqueado_hasta = null
  where c.id = p_id and c.estado = 'enviando';
end
$$;

-- Reintento manual de un correo fallido (admin de su institución).
create or replace function public.correos_reintentar(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_inst uuid;
begin
  select institucion_id into v_inst from public.correos_salientes where id = p_id and estado = 'fallido';
  if v_inst is null or not privado.admin_de_institucion(v_inst) then
    raise exception 'Correo inaccesible' using errcode = '42501';
  end if;
  update public.correos_salientes
     set estado = 'pendiente', intentos = 0, proximo_intento = now(), ultimo_error = null
   where id = p_id and estado = 'fallido';
end
$$;

revoke all on function public.encolar_recordatorios_correo() from public, anon, authenticated;
revoke all on function public.correos_tomar(integer) from public, anon, authenticated;
revoke all on function public.correos_resultado(uuid, boolean, text, text, boolean) from public, anon, authenticated;
grant execute on function public.encolar_recordatorios_correo() to service_role;
grant execute on function public.correos_tomar(integer) to service_role;
grant execute on function public.correos_resultado(uuid, boolean, text, text, boolean) to service_role;
revoke all on function public.correos_reintentar(uuid) from public, anon;
grant execute on function public.correos_reintentar(uuid) to authenticated;

commit;

-- =====================================================================
-- VERIFICACIÓN (solo lectura, después de aplicar)
-- =====================================================================
-- select tgname, tgrelid::regclass, tgdeferrable from pg_trigger where tgname like 'correo_%_v5';
-- select proname, proacl from pg_proc where proname in
--   ('correos_tomar','correos_resultado','correos_reintentar','encolar_recordatorios_correo');
-- select estado, count(*) from public.correos_salientes group by estado;

-- =====================================================================
-- REVERSIÓN (deshace solo lo que añade este archivo)
-- =====================================================================
-- begin;
-- drop trigger if exists correo_solicitud_v5 on public.solicitudes_inscripcion;
-- drop trigger if exists correo_pago_v5 on public.pagos;
-- drop trigger if exists correo_matricula_v5 on public.matriculas;
-- drop function if exists privado.correo_solicitud(), privado.correo_pago(), privado.correo_matricula();
-- drop function if exists public.encolar_recordatorios_correo(), public.correos_tomar(integer),
--   public.correos_resultado(uuid, boolean, text, text, boolean), public.correos_reintentar(uuid);
-- drop function if exists privado.encolar_correo(text, text, uuid, text, uuid, jsonb), privado.correo_contexto(uuid, uuid);
-- drop table if exists public.correos_salientes;
-- commit;
