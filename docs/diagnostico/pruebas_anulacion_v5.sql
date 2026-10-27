-- =====================================================================
-- ACADEMIX | PRUEBAS REALES DE ANULACIÓN (SIN DEJAR CAMBIOS)
-- Cada bloque se ejecuta dentro de BEGIN ... ROLLBACK: la base queda igual.
-- Ejecutar en Supabase > SQL Editor, UN BLOQUE A LA VEZ, sustituyendo los
-- marcadores <...> por identificadores reales de datos de prueba
-- autorizados. Los resultados aparecen como NOTICE ("Messages").
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. VERSIÓN INSTALADA (solo lectura)
-- ---------------------------------------------------------------------
-- 0a. ¿Es la versión 2? Debe contener 'admin_de_institucion',
--     'i.activo' y el bloqueo de cuotas ('from public.cuotas q ... for update').
select pg_get_functiondef('public.anular_matricula(uuid)'::regprocedure);

-- 0b. Señales de la versión 2 en una sola fila (todas deben ser true).
select
  def ilike '%admin_de_institucion%'                       as usa_admin_de_institucion,
  def ilike '%i.activo%'                                   as exige_institucion_activa,
  def ~* 'from public\.cuotas q where q\.matricula_id = v_m\.id order by q\.id for update' as bloquea_cuotas,
  def ilike '%set estado = ''anulada'' where matricula_id%' as anula_cuotas_pendientes
from (select pg_get_functiondef('public.anular_matricula(uuid)'::regprocedure) as def) f;

-- 0c. Permisos de ejecución: authenticated debe figurar; anon y PUBLIC no.
select p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') as puede_ejecutar
from pg_proc p
cross join (select oid, rolname from pg_roles where rolname in ('anon', 'authenticated')) r
where p.oid = 'public.anular_matricula(uuid)'::regprocedure;

-- 0d. Disparadores instalados (¿existe exigir_matricula_activa_pago_cuota?).
select tgrelid::regclass as tabla, tgname, tgenabled
from pg_trigger
where not tgisinternal
  and tgname in ('exigir_matricula_activa_pago_cuota', 'impedir_reactivar_matricula',
                 'exigir_grupo_admite_matricula', 'exigir_grupo_admite_confirmacion', 'validar_vacantes_grupo');

-- 0e. ¿Se aplicó el paso opcional de cerrar el UPDATE directo de estado?
--     true = authenticated aún puede actualizar matriculas.estado directamente.
select has_column_privilege('authenticated', 'public.matriculas', 'estado', 'UPDATE') as update_directo_estado_abierto;

-- ---------------------------------------------------------------------
-- Plantilla de cada prueba como administrador (o como otro usuario):
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', '<USUARIO>', 'role', 'authenticated')::text, true);
-- ---------------------------------------------------------------------

-- 1. MATRÍCULA ACTIVA (sin comprobantes en revisión) → se anula.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.anular_matricula('<MATRICULA_ACTIVA>');
  raise notice 'P1 OK: la RPC anuló la matrícula';
exception when others then raise notice 'P1 ERROR: % (%)', sqlerrm, sqlstate;
end $$;
select id, estado from public.matriculas where id = '<MATRICULA_ACTIVA>';   -- esperado: anulada
rollback;

-- 2. MATRÍCULA YA ANULADA → 'La matrícula ya está anulada'.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.anular_matricula('<MATRICULA_ANULADA>');
  raise notice 'P2 INESPERADO: se anuló dos veces';
exception when others then raise notice 'P2 esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 3. CUOTAS PENDIENTES → la matrícula se anula y sus cuotas 'pendiente' pasan a 'anulada'.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.anular_matricula('<MATRICULA_CON_CUOTAS_PENDIENTES>');
  raise notice 'P3 OK';
exception when others then raise notice 'P3 ERROR: % (%)', sqlerrm, sqlstate;
end $$;
select numero, estado from public.cuotas where matricula_id = '<MATRICULA_CON_CUOTAS_PENDIENTES>' order by numero;  -- esperado: anulada
rollback;

-- 4. CUOTAS PARCIALMENTE PAGADAS → la matrícula se anula; las cuotas 'parcial' se conservan.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.anular_matricula('<MATRICULA_CON_CUOTA_PARCIAL>');
  raise notice 'P4 OK';
exception when others then raise notice 'P4 ERROR: % (%)', sqlerrm, sqlstate;
end $$;
select numero, estado from public.cuotas where matricula_id = '<MATRICULA_CON_CUOTA_PARCIAL>' order by numero;  -- 'parcial' se mantiene
rollback;

-- 5. COMPROBANTE PENDIENTE (de la matrícula o de una cuota) → 'Hay un pago bajo revisión'.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.anular_matricula('<MATRICULA_CON_PAGO_PENDIENTE>');
  raise notice 'P5 INESPERADO: se anuló con un pago en revisión';
exception when others then raise notice 'P5 esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 6. MATRÍCULA DE OTRA INSTITUCIÓN → 'Matrícula inaccesible' (42501).
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.anular_matricula('<MATRICULA_DE_OTRA_INSTITUCION>');
  raise notice 'P6 INESPERADO: anuló una matrícula ajena';
exception when others then raise notice 'P6 esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 7. USUARIO SIN AUTORIZACIÓN (docente o estudiante, incluso de la misma institución) → 42501.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<USUARIO_NO_ADMIN_ID>', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.anular_matricula('<MATRICULA_ACTIVA>');
  raise notice 'P7 INESPERADO: un usuario no admin anuló';
exception when others then raise notice 'P7 esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;

-- 8. DISPARADOR H2: no aprobar el pago de una cuota de matrícula anulada.
--    Requiere un pago 'pendiente' de una cuota. Se ejecuta como propietario
--    (sin RLS) y todo se deshace al final.
begin;
update public.matriculas m set estado = 'anulada'
from public.cuotas q
where q.matricula_id = m.id and q.id = (select cuota_id from public.pagos where id = '<PAGO_PENDIENTE_DE_CUOTA>');
do $$ begin
  update public.pagos set estado = 'pagado' where id = '<PAGO_PENDIENTE_DE_CUOTA>';
  raise notice 'P8 INESPERADO: se aprobó el pago de una cuota de matrícula anulada';
exception when others then raise notice 'P8 esperado: % (%)', sqlerrm, sqlstate;
end $$;
rollback;
