-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA)
-- Las vacantes de un grupo no pueden quedar por debajo de las plazas
-- comprometidas, también con operaciones simultáneas.
--
-- CÓMO CUENTA V5 LAS PLAZAS (privado.vacantes_disponibles)
--   comprometidas = matrículas activas
--                 + solicitudes 'reservada' con reserva_vence_en > now()
--   (las solicitudes 'pendiente' NO ocupan plaza)
--
-- CÓMO SE CONSUMEN PLAZAS EN V5 (todas bloquean la fila del grupo primero)
--   crear_solicitud_inscripcion, revisar_pago, confirmar_matricula_sin_saldo
--   y cancelar_solicitud hacen "select ... from grupos ... for update".
--   authenticated no tiene INSERT sobre matriculas ni solicitudes_inscripcion,
--   y el disparador impedir_reactivar_matricula impide pasar de anulada a activa.
--
-- RIESGO ACTUAL
--   La app comprueba las plazas ocupadas en JavaScript y después hace el UPDATE
--   de vacantes. Entre ambos pasos, revisar_pago puede confirmar una matrícula
--   o una reserva: el UPDATE se aplicaría con un cálculo viejo.
--
-- SOLUCIÓN: disparador BEFORE UPDATE OF vacantes en grupos
--   - PostgreSQL bloquea la fila del grupo ANTES de ejecutar un disparador
--     BEFORE ROW UPDATE. Si una RPC tiene el grupo bloqueado, el UPDATE espera
--     a que termine; después el disparador cuenta las plazas con datos ya
--     confirmados (READ COMMITTED: cada consulta del disparador usa una
--     instantánea nueva). Mientras el disparador cuenta, ninguna RPC puede
--     consumir plazas de ese grupo, porque todas necesitan el mismo bloqueo.
--   - Protege cualquier vía de escritura (app, SQL Editor, código futuro),
--     no solo la pantalla actual.
--   - No cambia reglas de negocio: solo impide un estado incoherente.
--     Aumentar vacantes o editar otros campos no se ve afectado.
--
-- CÓMO APLICAR: revisar y ejecutar en Supabase > SQL Editor. Idempotente.
-- =====================================================================

begin;

create or replace function privado.validar_vacantes_grupo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_comprometidas integer;
begin
  -- Solo importa cuando se REDUCEN las vacantes.
  if new.vacantes >= old.vacantes then
    return new;
  end if;

  select (select count(*) from public.matriculas m
          where m.grupo_id = new.id and m.estado = 'activa')
       + (select count(*) from public.solicitudes_inscripcion s
          where s.grupo_id = new.id and s.estado = 'reservada'
            and s.reserva_vence_en > now())
    into v_comprometidas;

  if new.vacantes < v_comprometidas then
    raise exception 'No se puede reducir las vacantes a %: hay % plazas comprometidas (matrículas activas y reservas vigentes).',
      new.vacantes, v_comprometidas
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

drop trigger if exists validar_vacantes_grupo on public.grupos;
create trigger validar_vacantes_grupo
  before update of vacantes on public.grupos
  for each row execute function privado.validar_vacantes_grupo();

commit;

-- =====================================================================
-- COMPROBACIONES (solo lectura)
-- =====================================================================
-- a) El disparador existe y está habilitado (tgenabled = 'O'):
--   select tgname, tgenabled, pg_get_triggerdef(oid)
--   from pg_trigger where tgrelid = 'public.grupos'::regclass and tgname = 'validar_vacantes_grupo';
--
-- b) La función es SECURITY DEFINER con search_path fijo:
--   select prosecdef, proconfig from pg_proc where proname = 'validar_vacantes_grupo';
--
-- =====================================================================
-- PRUEBA SIN DEJAR CAMBIOS (todo se deshace con ROLLBACK)
-- Usa un grupo que tenga al menos una matrícula activa o reserva vigente.
-- =====================================================================
--   begin;
--   select id, vacantes, privado.vacantes_disponibles(id) as libres
--   from public.grupos where id = '<ID_DEL_GRUPO>';
--   -- comprometidas = vacantes - libres. Intenta dejar 1 vacante:
--   update public.grupos set vacantes = 1 where id = '<ID_DEL_GRUPO>';
--   -- Si hay más de 1 plaza comprometida -> ERROR check_violation (esperado).
--   rollback;
--
-- PRUEBA DE CONCURRENCIA (dos pestañas del SQL Editor, también con ROLLBACK)
--   Pestaña A:  begin; select * from public.grupos where id = '<ID>' for update;
--   Pestaña B:  update public.grupos set vacantes = <MENOR> where id = '<ID>';
--               -> queda esperando (A tiene el bloqueo, como lo haría revisar_pago)
--   Pestaña A:  rollback;   -> B continúa y el disparador cuenta con datos actuales.
--   Pestaña B:  si B no estaba en una transacción, el UPDATE ya se aplicó o falló;
--               para no dejar cambios, ejecuta B dentro de begin; ... rollback;
--
-- =====================================================================
-- PARA REVERTIR
-- =====================================================================
--   begin;
--   drop trigger if exists validar_vacantes_grupo on public.grupos;
--   drop function if exists privado.validar_vacantes_grupo();
--   commit;
