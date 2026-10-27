-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA) — versión 2, tras la auditoría
-- Anulación atómica de matrículas y protección de pagos de cuotas.
--
-- SITUACIÓN EN V5
--   No existe una RPC de anulación. Lo que hoy la permite es:
--     - GRANT UPDATE (estado, estado_final) ON public.matriculas TO authenticated;
--     - política "admin actualiza matriculas" (admin activo de la institución);
--     - disparador impedir_reactivar_matricula (anulada -> activa prohibido).
--   La app (src/lib/matriculas/acciones.ts) comprueba ANTES del UPDATE que la
--   matrícula siga en curso, que el grupo no esté cerrado, que no haya
--   certificado y que no haya comprobantes en revisión. Esas comprobaciones
--   no son atómicas.
--
-- HALLAZGOS DE LA AUDITORÍA (sobre la versión 1 de esta propuesta)
--   H1. Carrera con presentar_comprobante: esa función bloquea la CUOTA
--       (no la matrícula ni el grupo) y comprueba que la matrícula esté
--       activa. La v1 bloqueaba grupo y matrícula pero no las cuotas: un
--       comprobante presentado en paralelo podía quedar 'pendiente' sobre
--       una matrícula ya anulada. CORRECCIÓN: bloquear las cuotas de la
--       matrícula (FOR UPDATE) ANTES de buscar pagos pendientes.
--   H2. revisar_pago, en la rama de cuotas, no comprueba que la matrícula
--       siga activa. Con H1 corregido y el UPDATE directo cerrado no debería
--       quedar ningún pago pendiente sobre una matrícula anulada, pero la
--       anulación directa actual (o datos previos) sí puede dejarlos.
--       CORRECCIÓN: disparador que impide aprobar ('pagado') un pago de
--       cuota si la matrícula no está activa. El rechazo sigue permitido.
--   H3. Autorización: la v1 usaba mi_rol_activo() + mi_institucion(). Se
--       usa privado.admin_de_institucion(), la misma regla que revisar_pago
--       y cancelar_solicitud, y se exige además la institución activa.
--   H4. Cuotas 'parcial': se CONSERVAN. Registran dinero recibido; el
--       saldo restante deja de ser cobrable desde Academix (el estudiante ya
--       no puede presentar comprobantes para una matrícula anulada), pero la
--       obligación o la devolución las decide la institución según sus
--       políticas. Las cuotas 'pendiente' sin pagos pasan a 'anulada'.
--   H5. Pagos aprobados: no se tocan. Anular NO es devolver dinero; la
--       devolución se gestiona fuera de Academix según la política de
--       devoluciones de la institución.
--   H6. Certificados y estados finales: se mantienen las reglas (no se
--       anula con certificado emitido ni con resultado final registrado).
--   H7. Trazabilidad: V5 no guarda quién anuló ni cuándo. Ver la sección
--       OPCIONAL al final (tabla nueva de auditoría, sin tocar tablas V5).
--
-- No modifica tablas, columnas ni políticas RLS existentes.
-- CÓMO APLICAR: revisar y ejecutar en Supabase > SQL Editor. Idempotente.
-- Tras aplicarla, la acción de la app puede pasar a llamar a
-- supabase.rpc('anular_matricula', { p_matricula_id }) (requiere autorización).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. RPC de anulación
-- ---------------------------------------------------------------------
create or replace function public.anular_matricula(p_matricula_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inst uuid;
  v_grupo_id uuid;
  v_m public.matriculas%rowtype;
  v_estado_grupo public.estado_grupo;
begin
  select m.institucion_id, m.grupo_id into v_inst, v_grupo_id
  from public.matriculas m where m.id = p_matricula_id;
  if v_inst is null or not privado.admin_de_institucion(v_inst) then
    raise exception 'Matrícula inaccesible' using errcode = '42501';
  end if;
  if not exists (select 1 from public.instituciones i where i.id = v_inst and i.activo) then
    raise exception 'La institución no está activa' using errcode = '42501';
  end if;

  -- Orden de bloqueo: grupo -> matrícula -> cuotas (H1).
  select g.estado into v_estado_grupo from public.grupos g where g.id = v_grupo_id for update;
  select * into v_m from public.matriculas where id = p_matricula_id for update;
  perform 1 from public.cuotas q where q.matricula_id = v_m.id order by q.id for update;

  if v_m.estado <> 'activa' then
    raise exception 'La matrícula ya está anulada';
  end if;
  if v_m.estado_final <> 'en_curso' then
    raise exception 'La matrícula ya tiene un resultado final registrado';
  end if;
  if v_estado_grupo = 'cerrado' then
    raise exception 'El grupo está cerrado';
  end if;
  if exists (select 1 from public.certificados c where c.matricula_id = v_m.id) then
    raise exception 'La matrícula tiene un certificado emitido';
  end if;
  if exists (
    select 1 from public.pagos p
    where p.estado = 'pendiente'
      and (p.matricula_id = v_m.id
           or p.cuota_id in (select q.id from public.cuotas q where q.matricula_id = v_m.id))
  ) then
    raise exception 'Hay un pago bajo revisión; revise el pago antes de anular';
  end if;

  update public.matriculas set estado = 'anulada' where id = v_m.id;
  -- H4: solo las cuotas sin ningún pago aprobado.
  update public.cuotas set estado = 'anulada' where matricula_id = v_m.id and estado = 'pendiente';
end
$$;

revoke execute on function public.anular_matricula(uuid) from public, anon;
grant execute on function public.anular_matricula(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. H2: no aprobar pagos de cuotas de matrículas no activas
--    (BEFORE UPDATE OF estado en pagos; no modifica revisar_pago).
-- ---------------------------------------------------------------------
create or replace function privado.exigir_matricula_activa_pago_cuota()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.estado = 'pagado' and old.estado <> 'pagado' and new.cuota_id is not null
     and not exists (
       select 1 from public.cuotas q
       join public.matriculas m on m.id = q.matricula_id
       where q.id = new.cuota_id and m.estado = 'activa'
     ) then
    raise exception 'La matrícula de la cuota no está activa; rechace el pago y gestione la devolución'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists exigir_matricula_activa_pago_cuota on public.pagos;
create trigger exigir_matricula_activa_pago_cuota
  before update of estado on public.pagos
  for each row execute function privado.exigir_matricula_activa_pago_cuota();

commit;

-- ---------------------------------------------------------------------
-- 3. RECOMENDADO tras cambiar la app a la RPC (decidir aparte): cerrar el
--    UPDATE directo de la columna estado, para que la anulación solo pase
--    por anular_matricula(). estado_final sigue disponible para el flujo de
--    evaluaciones. Comprobar antes que nada más actualiza matriculas.estado.
-- ---------------------------------------------------------------------
--   revoke update (estado) on public.matriculas from authenticated;

-- ---------------------------------------------------------------------
-- 4. OPCIONAL (H7): registro de anulaciones (tabla NUEVA; no altera V5).
--    Si se aplica, añadir al final de anular_matricula():
--      insert into privado.anulaciones_matricula(matricula_id, institucion_id, anulado_por)
--      values (v_m.id, v_m.institucion_id, auth.uid());
-- ---------------------------------------------------------------------
--   create table if not exists privado.anulaciones_matricula (
--     matricula_id uuid primary key references public.matriculas(id),
--     institucion_id uuid not null,
--     anulado_por uuid not null references public.perfiles(id),
--     anulado_en timestamptz not null default now()
--   );
--   revoke all on privado.anulaciones_matricula from public, anon, authenticated;

-- =====================================================================
-- COMPROBACIONES (solo lectura)
-- =====================================================================
-- a) Función con permisos elevados, search_path fijo y sin EXECUTE para anon:
--   select proname, prosecdef, proconfig, proacl from pg_proc
--   where proname in ('anular_matricula', 'exigir_matricula_activa_pago_cuota');
--
-- b) Disparador creado:
--   select tgname, tgenabled from pg_trigger where tgname = 'exigir_matricula_activa_pago_cuota';
--
-- c) Prueba sin dejar cambios (sesión de admin simulada, como en
--    admin_ver_estudiantes_v5.sql, sección e):
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<ADMIN_ID>","role":"authenticated"}';
--   select public.anular_matricula('<MATRICULA_ID>');
--   select estado from public.matriculas where id = '<MATRICULA_ID>';  -- 'anulada'
--   select numero, estado from public.cuotas where matricula_id = '<MATRICULA_ID>';
--   rollback;
--
-- =====================================================================
-- PARA REVERTIR
-- =====================================================================
--   begin;
--   drop trigger if exists exigir_matricula_activa_pago_cuota on public.pagos;
--   drop function if exists privado.exigir_matricula_activa_pago_cuota();
--   drop function if exists public.anular_matricula(uuid);
--   commit;
    