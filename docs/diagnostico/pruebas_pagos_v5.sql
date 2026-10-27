-- =====================================================================
-- ACADEMIX | PRUEBAS REALES DE PAGOS Y CUOTAS (SIN DEJAR CAMBIOS)
-- Cada bloque va entre BEGIN ... ROLLBACK: la base queda igual.
-- Usar SOLO cuentas y registros de PRUEBA autorizados (nunca estudiantes
-- reales). Sustituir los marcadores <...>. Resultados en "Messages" (NOTICE).
-- Ejecutar un bloque a la vez en Supabase > SQL Editor.
--
-- Datos de prueba necesarios (crearlos con la app, no con SQL):
--   <ADMIN_ID>             admin de la institución de prueba
--   <ESTUDIANTE_ID>        estudiante de prueba con un archivo subido a
--                          comprobantes-cursos-v5/<ESTUDIANTE_ID>/<archivo>
--   <PAGO_SOLICITUD>       pago 'pendiente' de una solicitud de reserva o matrícula
--   <PAGO_CUOTA>           pago 'pendiente' de una cuota
--   <PAGO_OTRA_INST>       pago de otra institución (o cualquier UUID ajeno)
--   <USUARIO_NO_ADMIN_ID>  docente o estudiante
-- =====================================================================

-- 0. Lectura previa (solo lectura): estado de los registros de prueba.
select p.id, p.estado, p.monto, p.solicitud_id, p.cuota_id, p.referencia_operacion,
       (p.comprobante_url is not null) as tiene_archivo,
       s.estado as solicitud, s.importe_esperado, g.estado as grupo,
       q.estado as cuota, q.importe as importe_cuota, m.estado as matricula
from public.pagos p
left join public.solicitudes_inscripcion s on s.id = p.solicitud_id
left join public.grupos g on g.id = s.grupo_id
left join public.cuotas q on q.id = p.cuota_id
left join public.matriculas m on m.id = q.matricula_id
where p.id in ('<PAGO_SOLICITUD>', '<PAGO_CUOTA>');

-- 1. FLUJO DEL ESTUDIANTE: presentar un comprobante (requiere el archivo en Storage).
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ESTUDIANTE_ID>', 'role', 'authenticated')::text, true);
do $$ declare v uuid; begin
  v := public.presentar_comprobante(
    p_solicitud_id => '<SOLICITUD_PENDIENTE_SIN_PAGO>', p_cuota_id => null,
    p_monto => <IMPORTE_EXACTO>, p_metodo => 'Transferencia', p_referencia => 'PRUEBA-001',
    p_comprobante_path => '<ESTUDIANTE_ID>/<archivo>');
  raise notice 'T1 OK: pago % creado (se deshará)', v;
exception when others then raise notice 'T1 ERROR: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 2. APROBACIÓN de un pago de solicitud + 3. DOBLE APROBACIÓN en la misma transacción.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ declare v text; begin
  v := public.revisar_pago('<PAGO_SOLICITUD>', true, 'Prueba de aprobación');
  raise notice 'T2 OK: %', v;
exception when others then raise notice 'T2 ERROR: % (%)', sqlerrm, sqlstate;
end $$;
do $$ begin
  perform public.revisar_pago('<PAGO_SOLICITUD>', true, 'Segunda aprobación');
  raise notice 'T3 INESPERADO: se aprobó dos veces';
exception when others then raise notice 'T3 esperado: % (%)', sqlerrm, sqlstate;
end $$;
select p.estado, p.verificado_por, p.verificado_en, s.estado as solicitud, s.reserva_vence_en, s.matricula_id
from public.pagos p join public.solicitudes_inscripcion s on s.id = p.solicitud_id where p.id = '<PAGO_SOLICITUD>';
rollback;

-- 4. RECHAZO con observación (la solicitud sigue 'pendiente').
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ declare v text; begin
  v := public.revisar_pago('<PAGO_SOLICITUD>', false, 'Operación no encontrada (prueba)');
  raise notice 'T4 OK: %', v;
exception when others then raise notice 'T4 ERROR: % (%)', sqlerrm, sqlstate;
end $$;
select p.estado, p.observacion, s.estado as solicitud from public.pagos p
join public.solicitudes_inscripcion s on s.id = p.solicitud_id where p.id = '<PAGO_SOLICITUD>';
rollback;

-- 5. APROBACIÓN de un pago de cuota (parcial o total según el monto).
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ declare v text; begin
  v := public.revisar_pago('<PAGO_CUOTA>', true, 'Prueba cuota');
  raise notice 'T5 OK: %', v;
exception when others then raise notice 'T5 ERROR: % (%)', sqlerrm, sqlstate;
end $$;
select q.estado, q.importe, (select sum(monto) from public.pagos where cuota_id = q.id and estado = 'pagado') as aprobado
from public.cuotas q where q.id = (select cuota_id from public.pagos where id = '<PAGO_CUOTA>');
rollback;

-- 6. PAGO DE OTRA INSTITUCIÓN → 'Pago inexistente o sin autorización'.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.revisar_pago('<PAGO_OTRA_INST>', true, null);
  raise notice 'T6 INESPERADO: aprobó un pago ajeno';
exception when others then raise notice 'T6 esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 7. USUARIO SIN AUTORIZACIÓN (docente o estudiante) → rechazo.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<USUARIO_NO_ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.revisar_pago('<PAGO_SOLICITUD>', true, null);
  raise notice 'T7 INESPERADO: un usuario no admin aprobó';
exception when others then raise notice 'T7 esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 8. CUOTA DE MATRÍCULA ANULADA: la anulación se bloquea con el pago pendiente;
--    y si la matrícula ya estuviera anulada, el disparador impide aprobar.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.anular_matricula((select q.matricula_id from public.cuotas q join public.pagos p on p.cuota_id = q.id where p.id = '<PAGO_CUOTA>'));
  raise notice 'T8a INESPERADO: anuló con un pago pendiente';
exception when others then raise notice 'T8a esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

begin;  -- T8b como propietario (sin RLS), todo se deshace
update public.matriculas m set estado = 'anulada' from public.cuotas q
where q.matricula_id = m.id and q.id = (select cuota_id from public.pagos where id = '<PAGO_CUOTA>');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.revisar_pago('<PAGO_CUOTA>', true, null);
  raise notice 'T8b INESPERADO: se aprobó el pago de una cuota de matrícula anulada';
exception when others then raise notice 'T8b esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 9. GRUPO NO ABIERTO: aprobar el pago de una solicitud de un grupo cerrado o cancelado.
begin;  -- como propietario se cambia el grupo SOLO dentro de la transacción
update public.grupos set estado = 'cancelado'
where id = (select s.grupo_id from public.solicitudes_inscripcion s join public.pagos p on p.solicitud_id = s.id where p.id = '<PAGO_SOLICITUD>');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.revisar_pago('<PAGO_SOLICITUD>', true, null);
  raise notice 'T9 INESPERADO: aprobó con el grupo cancelado (revisar_pago no comprueba el grupo)';
exception when others then raise notice 'T9 esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- =====================================================================
-- 10. CONCURRENCIA (dos pestañas del SQL Editor, casi a la vez)
--     La pestaña A retiene los bloqueos 15 s y luego deshace; la pestaña B
--     debe quedar ESPERANDO (no fallar por interbloqueo) hasta que A termine.
--     Anotar la duración de B: ~15 s confirma la serialización.
-- =====================================================================
-- Pestaña A:
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
--   select public.revisar_pago('<PAGO_CUOTA>', false, 'concurrencia A');
--   select pg_sleep(15);
--   rollback;
-- Pestaña B (iniciar 2-3 s después):
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
--   select public.revisar_pago('<PAGO_CUOTA>', false, 'concurrencia B');  -- espera a A; luego rechaza (A se deshizo)
--   rollback;
-- Variante anulación ↔ comprobante: en A, anular_matricula(<MATRICULA_CON_CUOTA>) + pg_sleep(15);
-- en B, como estudiante, presentar_comprobante sobre una cuota de esa matrícula. B debe esperar.

-- =====================================================================
-- CASOS ADICIONALES (Fase 7). Mismas reglas: BEGIN ... ROLLBACK, solo
-- registros de PRUEBA. Marcadores nuevos:
--   <SOLICITUD_RECHAZADA>  solicitud 'pendiente' cuyo último pago fue rechazado
--   <CUOTA_ABIERTA>        cuota 'pendiente' (sin pago pendiente) de una matrícula activa de <ESTUDIANTE_ID>
--   <IMPORTE_CUOTA>        importe de esa cuota
--   <PAGO_SOLICITUD_LLENO> pago pendiente de una solicitud cuyo grupo ya no tiene vacantes
--   <ARCHIVO_2>, <ARCHIVO_3> otros archivos subidos a la carpeta de <ESTUDIANTE_ID>
-- =====================================================================

-- 11. NUEVO ENVÍO TRAS UN RECHAZO (V5 lo permite: solo bloquea si hay uno PENDIENTE).
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ESTUDIANTE_ID>', 'role', 'authenticated')::text, true);
do $$ declare v uuid; begin
  v := public.presentar_comprobante(p_solicitud_id => '<SOLICITUD_RECHAZADA>', p_monto => <IMPORTE_EXACTO>,
       p_metodo => 'Yape', p_referencia => 'PRUEBA-REENVIO', p_comprobante_path => '<ESTUDIANTE_ID>/<ARCHIVO_2>');
  raise notice 'T11 OK: nuevo comprobante % tras el rechazo', v;
exception when others then raise notice 'T11 ERROR: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 12. DOBLE PRESENTACIÓN: el segundo comprobante para la misma cuota debe rechazarse.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ESTUDIANTE_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.presentar_comprobante(p_cuota_id => '<CUOTA_ABIERTA>', p_monto => 10, p_metodo => 'Plin',
          p_referencia => 'PRUEBA-A', p_comprobante_path => '<ESTUDIANTE_ID>/<ARCHIVO_2>');
  perform public.presentar_comprobante(p_cuota_id => '<CUOTA_ABIERTA>', p_monto => 10, p_metodo => 'Plin',
          p_referencia => 'PRUEBA-B', p_comprobante_path => '<ESTUDIANTE_ID>/<ARCHIVO_3>');
  raise notice 'T12 INESPERADO: se aceptaron dos comprobantes pendientes';
exception when others then raise notice 'T12 esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 13. MENSUALIDAD PARCIAL Y LUEGO TOTAL (presenta como estudiante y aprueba como admin).
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ESTUDIANTE_ID>', 'role', 'authenticated')::text, true);
create temp table t13 (pago uuid) on commit drop;
insert into t13 select public.presentar_comprobante(p_cuota_id => '<CUOTA_ABIERTA>', p_monto => 10,
  p_metodo => 'Yape', p_referencia => 'PRUEBA-PARCIAL', p_comprobante_path => '<ESTUDIANTE_ID>/<ARCHIVO_2>');
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
select public.revisar_pago((select pago from t13), true, 'Prueba parcial');
select estado as "T13a debe ser parcial" from public.cuotas where id = '<CUOTA_ABIERTA>';
select set_config('request.jwt.claims', json_build_object('sub', '<ESTUDIANTE_ID>', 'role', 'authenticated')::text, true);
delete from t13;
insert into t13 select public.presentar_comprobante(p_cuota_id => '<CUOTA_ABIERTA>', p_monto => <IMPORTE_CUOTA> - 10,
  p_metodo => 'Yape', p_referencia => 'PRUEBA-TOTAL', p_comprobante_path => '<ESTUDIANTE_ID>/<ARCHIVO_3>');
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
select public.revisar_pago((select pago from t13), true, 'Prueba total');
select estado as "T13b debe ser pagada" from public.cuotas where id = '<CUOTA_ABIERTA>';
rollback;

-- 14. PAGO MAYOR AL SALDO: debe rechazarse al presentarlo.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ESTUDIANTE_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.presentar_comprobante(p_cuota_id => '<CUOTA_ABIERTA>', p_monto => <IMPORTE_CUOTA> + 1,
          p_metodo => 'Yape', p_referencia => 'PRUEBA-EXCESO', p_comprobante_path => '<ESTUDIANTE_ID>/<ARCHIVO_2>');
  raise notice 'T14 INESPERADO: aceptó un monto mayor al saldo';
exception when others then raise notice 'T14 esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 15. GRUPO SIN VACANTES: aprobar una solicitud cuando el grupo está lleno.
--     (Reducir vacantes en la transacción como propietario; se deshace.)
begin;
update public.grupos g set vacantes = greatest(1, (select count(*) from public.matriculas m where m.grupo_id = g.id and m.estado = 'activa'))
where g.id = (select s.grupo_id from public.solicitudes_inscripcion s join public.pagos p on p.solicitud_id = s.id where p.id = '<PAGO_SOLICITUD_LLENO>');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.revisar_pago('<PAGO_SOLICITUD_LLENO>', true, null);
  raise notice 'T15 INESPERADO (o el grupo aún tenía vacantes): se aprobó';
exception when others then raise notice 'T15 esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 16. ESTUDIANTE INTENTA APROBAR SU PROPIO PAGO → debe rechazarse.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ESTUDIANTE_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.revisar_pago('<PAGO_SOLICITUD>', true, null);
  raise notice 'T16 INESPERADO: el estudiante aprobó su pago';
exception when others then raise notice 'T16 esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 17. CUOTA VENCIDA (solo lectura): cuotas abiertas de matrículas activas con fecha pasada.
select q.id, q.numero, q.vencimiento, q.estado
from public.cuotas q join public.matriculas m on m.id = q.matricula_id
where m.estado = 'activa' and q.estado in ('pendiente','parcial')
  and q.vencimiento < (now() at time zone 'America/Lima')::date
order by q.vencimiento limit 20;
