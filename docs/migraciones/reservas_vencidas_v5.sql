-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA) — Reservas vencidas
--
-- CÓMO FUNCIONA EN V5
--   revisar_pago fija reserva_vence_en = momento de aprobación +
--   condiciones_curso.reserva_plazo_horas (plazo de CADA curso, no global).
--   Una reserva caducada NO cambia de estado: sigue 'reservada'.
--   - Deja de ocupar plaza (vacantes_disponibles exige reserva_vence_en > now()).
--   - Pero BLOQUEA pedir otra reserva del mismo grupo: el índice único
--     solicitudes_pendientes_por_tipo_v5 y crear_solicitud_inscripcion
--     consideran vigente todo estado 'pendiente' o 'reservada'.
--   Ninguna función de V5 usa el estado 'vencida' (existe en el CHECK).
--
-- MIENTRAS NO SE APLIQUE ESTA PROPUESTA
--   La app muestra "Reserva vencida" calculándolo con la fecha, y la
--   reserva caducada puede cancelarse con cancelar_solicitud (estudiante o
--   administrador de la institución) para liberar el bloqueo.
--
-- PROPUESTA
--   1. Función marcar_reservas_vencidas(): el administrador activo marca como
--      'vencida' las reservas caducadas de SU institución (la institución sale
--      de la sesión). Bloquea cada grupo afectado igual que las RPC de V5.
--      Devuelve cuántas reservas marcó. La app la llamaría al abrir el módulo
--      Solicitudes o con un botón "Actualizar reservas vencidas".
--   2. (Opcional, aparte) Tarea programada con pg_cron para todas las
--      instituciones. Requiere habilitar la extensión pg_cron en Supabase;
--      se deja comentada para decidirla después.
--
-- CÓMO APLICAR: revisar y ejecutar en Supabase > SQL Editor. Idempotente.
-- No modifica tablas, políticas ni funciones existentes.
-- =====================================================================

begin;

create or replace function public.marcar_reservas_vencidas()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst uuid := privado.mi_institucion();
  v_total integer := 0;
  v_n integer;
  v_grupo uuid;
begin
  if coalesce(privado.mi_rol_activo() = 'admin', false) is false or v_inst is null then
    raise exception 'Solo el administrador de la institución puede actualizar reservas';
  end if;

  -- Mismo orden de bloqueo que las RPC de V5: primero el grupo.
  for v_grupo in
    select distinct s.grupo_id from public.solicitudes_inscripcion s
    where s.institucion_id = v_inst and s.estado = 'reservada' and s.reserva_vence_en <= now()
  loop
    perform 1 from public.grupos where id = v_grupo for update;
    update public.solicitudes_inscripcion
       set estado = 'vencida'
     where grupo_id = v_grupo
       and institucion_id = v_inst
       and estado = 'reservada'
       and reserva_vence_en <= now();
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;

  return v_total;
end
$$;

revoke all on function public.marcar_reservas_vencidas() from public, anon;
grant execute on function public.marcar_reservas_vencidas() to authenticated;

commit;

-- (OPCIONAL, NO INCLUIDO EN LA TRANSACCIÓN) Tarea cada hora (minuto 15) para todas las
-- instituciones con pg_cron. Antes: Database > Extensions > habilitar pg_cron.
--   select cron.schedule('academix-reservas-vencidas', '15 * * * *', $$
--     update public.solicitudes_inscripcion set estado = 'vencida'
--     where estado = 'reservada' and reserva_vence_en <= now();
--   $$);
--   Para quitarla:  select cron.unschedule('academix-reservas-vencidas');
--
-- =====================================================================
-- COMPROBACIONES
-- =====================================================================
--   select prosecdef, proconfig from pg_proc where proname = 'marcar_reservas_vencidas';
--   select has_function_privilege('anon', 'public.marcar_reservas_vencidas()', 'execute');  -- false
--
-- =====================================================================
-- PARA REVERTIR
-- =====================================================================
--   drop function if exists public.marcar_reservas_vencidas();
--   (las reservas ya marcadas 'vencida' se pueden consultar con:
--    select id from public.solicitudes_inscripcion where estado = 'vencida';)
