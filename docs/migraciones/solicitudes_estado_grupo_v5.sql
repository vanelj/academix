-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA)
-- Impedir que se confirme una reserva o una matrícula en un grupo que ya
-- no admite estudiantes (cancelado o cerrado).
--
-- RIESGO EN V5
--   public.revisar_pago() aprueba el pago de una solicitud 'pendiente' y:
--     - tipo 'reserva'   -> pasa la solicitud a 'reservada' (consume plaza);
--     - tipo 'matricula' -> inserta en public.matriculas y la marca 'matriculada'.
--   Comprueba vacantes y montos, pero NO el estado del grupo. Si el grupo se
--   cancela o se cierra mientras hay solicitudes pendientes con comprobante,
--   aprobar el pago confirmaría una plaza en un grupo que no se dictará.
--   (crear_solicitud_inscripcion y confirmar_matricula_sin_saldo sí exigen
--   grupo 'abierto'.)
--
-- SOLUCIÓN: dos disparadores, sin modificar ninguna función de V5
--   1. BEFORE INSERT en matriculas: el grupo debe estar 'abierto' o 'en_curso'.
--   2. BEFORE UPDATE OF estado en solicitudes_inscripcion: al pasar de
--      'pendiente' a 'reservada' o 'matriculada', el grupo debe estar
--      'abierto' o 'en_curso'.
--   Si no, se lanza un error: TODA la transacción de revisar_pago se deshace
--   (el pago sigue 'pendiente'). La institución puede entonces rechazar el
--   pago (esa rama no toca la solicitud) y gestionar la devolución.
--
-- POR QUÉ 'abierto' Y 'en_curso'
--   - 'abierto': estado en que V5 admite solicitudes.
--   - 'en_curso': una solicitud presentada con el grupo abierto puede
--     revisarse después de iniciadas las clases (incorporación tardía). Si la
--     institución no quiere permitirlo, basta quitar 'en_curso' de las listas.
--   - 'programado' nunca tiene solicitudes (V5 exige 'abierto' para crearlas).
--
-- CONCURRENCIA
--   revisar_pago, confirmar_matricula_sin_saldo y cancelar_solicitud bloquean
--   la fila del grupo (FOR UPDATE) antes de confirmar. Cambiar el estado del
--   grupo desde la app es un UPDATE sobre esa misma fila: ambas operaciones se
--   serializan y el disparador siempre lee el estado ya confirmado.
--
-- CÓMO APLICAR: revisar y ejecutar en Supabase > SQL Editor. Idempotente.
-- No modifica tablas, columnas, políticas RLS ni funciones existentes.
-- =====================================================================

begin;

create or replace function privado.exigir_grupo_admite_estudiantes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_estado public.estado_grupo;
begin
  -- En solicitudes solo importa la confirmación (pendiente -> reservada/matriculada).
  if tg_table_name = 'solicitudes_inscripcion' then
    if not (old.estado = 'pendiente' and new.estado in ('reservada', 'matriculada')) then
      return new;
    end if;
  end if;

  select g.estado into v_estado from public.grupos g where g.id = new.grupo_id;

  if v_estado is null or v_estado not in ('abierto', 'en_curso') then
    raise exception 'El grupo no admite nuevas reservas ni matrículas (estado: %).', coalesce(v_estado::text, 'inexistente')
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

drop trigger if exists exigir_grupo_admite_matricula on public.matriculas;
create trigger exigir_grupo_admite_matricula
  before insert on public.matriculas
  for each row execute function privado.exigir_grupo_admite_estudiantes();

drop trigger if exists exigir_grupo_admite_confirmacion on public.solicitudes_inscripcion;
create trigger exigir_grupo_admite_confirmacion
  before update of estado on public.solicitudes_inscripcion
  for each row execute function privado.exigir_grupo_admite_estudiantes();

commit;

-- =====================================================================
-- COMPROBACIONES (solo lectura)
-- =====================================================================
-- a) Disparadores creados y habilitados (tgenabled = 'O'):
--   select tgrelid::regclass, tgname, tgenabled
--   from pg_trigger
--   where tgname in ('exigir_grupo_admite_matricula', 'exigir_grupo_admite_confirmacion');
--
-- b) Función con permisos elevados y search_path fijo:
--   select prosecdef, proconfig from pg_proc where proname = 'exigir_grupo_admite_estudiantes';
--
-- c) Prueba sin dejar cambios (requiere una solicitud de tipo 'reserva' en
--    estado 'pendiente'; el CHECK de V5 exige tipo 'reserva' para 'reservada'):
--   begin;
--   update public.grupos set estado = 'cancelado' where id = '<GRUPO_ID>';
--   update public.solicitudes_inscripcion set estado = 'reservada',
--     reserva_vence_en = now() + interval '1 day' where id = '<SOLICITUD_ID>';
--   -- -> ERROR check_violation: "El grupo no admite nuevas reservas ni matrículas"
--   rollback;
--
-- =====================================================================
-- PARA REVERTIR
-- =====================================================================
--   begin;
--   drop trigger if exists exigir_grupo_admite_confirmacion on public.solicitudes_inscripcion;
--   drop trigger if exists exigir_grupo_admite_matricula on public.matriculas;
--   drop function if exists privado.exigir_grupo_admite_estudiantes();
--   commit;
