-- =====================================================================
-- ACADEMIX | PRUEBAS REALES DE AISLAMIENTO — medios_cobro_v5
-- Ejecutar DESPUÉS de aplicar docs/migraciones/medios_cobro_v5.sql.
--
-- Todo ocurre en UNA transacción que termina en ROLLBACK: los medios de
-- prueba que se crean desaparecen y la base queda igual. Resultados en
-- "Messages" (NOTICE): cada línea dice OK o FALLA.
--
-- Cuentas de PRUEBA necesarias (nunca estudiantes reales):
--   <INST_A>, <INST_B>  dos instituciones distintas y activas
--   <ADMIN_A>           admin de INST_A con rol_activo = 'admin'
--   <ADMIN_B>           admin de INST_B con rol_activo = 'admin'
--   <EST_1>             estudiante (rol_activo = 'estudiante') con una
--                       solicitud pendiente/reservada o una cuota abierta en INST_A
--   <EST_2>             estudiante (rol_activo = 'estudiante') SIN obligaciones
--                       abiertas con INST_A
-- Sustituir los marcadores y ejecutar primero el bloque 0 (solo lectura).
-- =====================================================================

-- 0. PRECONDICIONES (solo lectura) -------------------------------------
select p.id, p.institucion_id, p.rol_activo, p.activo,
       case p.id when '<ADMIN_A>' then 'ADMIN_A' when '<ADMIN_B>' then 'ADMIN_B'
                 when '<EST_1>' then 'EST_1' when '<EST_2>' then 'EST_2' end as cuenta
from public.perfiles p
where p.id in ('<ADMIN_A>', '<ADMIN_B>', '<EST_1>', '<EST_2>');
-- Esperado: ADMIN_A/INST_A/admin, ADMIN_B/INST_B/admin, EST_1 y EST_2 con estudiante.

select 'EST_1 debe a INST_A' as caso,
  exists (select 1 from public.solicitudes_inscripcion s where s.institucion_id = '<INST_A>'
          and s.estudiante_id = '<EST_1>' and s.estado in ('pendiente','reservada'))
  or exists (select 1 from public.cuotas q join public.matriculas m on m.id = q.matricula_id
             where q.institucion_id = '<INST_A>' and m.estudiante_id = '<EST_1>'
               and m.estado = 'activa' and q.estado in ('pendiente','parcial')) as valor   -- debe ser true
union all
select 'EST_2 debe a INST_A',
  exists (select 1 from public.solicitudes_inscripcion s where s.institucion_id = '<INST_A>'
          and s.estudiante_id = '<EST_2>' and s.estado in ('pendiente','reservada'))
  or exists (select 1 from public.cuotas q join public.matriculas m on m.id = q.matricula_id
             where q.institucion_id = '<INST_A>' and m.estudiante_id = '<EST_2>'
               and m.estado = 'activa' and q.estado in ('pendiente','parcial'));            -- debe ser false

-- 1. PRUEBAS (una sola transacción, se deshace al final) -----------------
begin;

-- ---- ADMIN_A crea dos medios de SU institución (uno activo y uno inactivo)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_A>', 'role', 'authenticated')::text, true);
do $$ declare v uuid; begin
  insert into public.medios_cobro_institucion (institucion_id, tipo, titular, celular)
    values ('<INST_A>', 'yape', 'Prueba A activo', '900000001') returning id into v;
  perform set_config('pruebas.a_activo', v::text, true);
  insert into public.medios_cobro_institucion (institucion_id, tipo, titular, celular, activo)
    values ('<INST_A>', 'plin', 'Prueba A inactivo', '900000002', false) returning id into v;
  perform set_config('pruebas.a_inactivo', v::text, true);
  raise notice 'M1 OK: el admin A crea medios de su institución';
exception when others then raise notice 'M1 FALLA: % (%)', sqlerrm, sqlstate;
end $$;

do $$ begin
  insert into public.medios_cobro_institucion (institucion_id, tipo, titular, celular)
    values ('<INST_B>', 'yape', 'Intruso', '900000003');
  raise notice 'M2 FALLA: el admin A creó un medio para la institución B';
exception when insufficient_privilege then raise notice 'M2 OK: crear para otra institución rechazado (42501)';
  when others then raise notice 'M2 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;

-- ---- ADMIN_B crea un medio de SU institución
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_B>', 'role', 'authenticated')::text, true);
do $$ declare v uuid; begin
  insert into public.medios_cobro_institucion (institucion_id, tipo, titular, banco, numero_cuenta)
    values ('<INST_B>', 'transferencia', 'Prueba B', 'BCP', '1911234567012') returning id into v;
  perform set_config('pruebas.b', v::text, true);
  raise notice 'M3 OK: el admin B crea medios de su institución';
exception when others then raise notice 'M3 FALLA: % (%)', sqlerrm, sqlstate;
end $$;

-- ---- ADMIN_A no ve ni toca los de B, y no puede mover los suyos a B
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_A>', 'role', 'authenticated')::text, true);
do $$ declare n integer; begin
  select count(*) into n from public.medios_cobro_institucion where institucion_id <> '<INST_A>';
  raise notice 'M4 %: el admin A ve % medios de otras instituciones (esperado 0)', case when n = 0 then 'OK' else 'FALLA' end, n;
  select count(*) into n from public.medios_cobro_institucion where institucion_id = '<INST_A>';
  raise notice 'M5 %: el admin A ve % medios propios, incluido el inactivo (esperado >= 2)', case when n >= 2 then 'OK' else 'FALLA' end, n;

  update public.medios_cobro_institucion set titular = 'Modificado por A' where id = current_setting('pruebas.b')::uuid;
  get diagnostics n = row_count;
  raise notice 'M6 %: el admin A modificó % medios de B (esperado 0)', case when n = 0 then 'OK' else 'FALLA' end, n;

  delete from public.medios_cobro_institucion where id = current_setting('pruebas.b')::uuid;
  get diagnostics n = row_count;
  raise notice 'M7 %: el admin A eliminó % medios de B (esperado 0)', case when n = 0 then 'OK' else 'FALLA' end, n;
end $$;

do $$ begin
  update public.medios_cobro_institucion set institucion_id = '<INST_B>' where id = current_setting('pruebas.a_activo')::uuid;
  raise notice 'M8 FALLA: el admin A movió su medio a la institución B';
exception when insufficient_privilege then raise notice 'M8 OK: mover un medio a otra institución rechazado (42501)';
  when others then raise notice 'M8 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;

-- ---- EST_1 (debe a INST_A): ve SOLO los activos de INST_A y no puede escribir
select set_config('request.jwt.claims', json_build_object('sub', '<EST_1>', 'role', 'authenticated')::text, true);
do $$ declare n integer; begin
  select count(*) into n from public.medios_cobro_institucion where id = current_setting('pruebas.a_activo')::uuid;
  raise notice 'M9 %: EST_1 ve el medio activo de A (esperado 1, vio %)', case when n = 1 then 'OK' else 'FALLA' end, n;
  select count(*) into n from public.medios_cobro_institucion where id = current_setting('pruebas.a_inactivo')::uuid;
  raise notice 'M10 %: EST_1 ve el medio INACTIVO de A (esperado 0, vio %)', case when n = 0 then 'OK' else 'FALLA' end, n;
  select count(*) into n from public.medios_cobro_institucion where id = current_setting('pruebas.b')::uuid;
  raise notice 'M11 %: EST_1 ve el medio de B, con quien no tiene deuda (esperado 0, vio %)', case when n = 0 then 'OK' else 'FALLA' end, n;

  update public.medios_cobro_institucion set celular = '900000009' where id = current_setting('pruebas.a_activo')::uuid;
  get diagnostics n = row_count;
  raise notice 'M12 %: EST_1 modificó % medios (esperado 0)', case when n = 0 then 'OK' else 'FALLA' end, n;
end $$;

do $$ begin
  insert into public.medios_cobro_institucion (institucion_id, tipo, titular, celular)
    values ('<INST_A>', 'yape', 'Estudiante', '900000004');
  raise notice 'M13 FALLA: un estudiante creó un medio de cobro';
exception when insufficient_privilege then raise notice 'M13 OK: el estudiante no puede crear medios (42501)';
  when others then raise notice 'M13 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;

-- ---- EST_2 (sin deuda con INST_A): no ve nada de A
select set_config('request.jwt.claims', json_build_object('sub', '<EST_2>', 'role', 'authenticated')::text, true);
do $$ declare n integer; b boolean; begin
  select count(*) into n from public.medios_cobro_institucion where institucion_id = '<INST_A>';
  raise notice 'M14 %: EST_2 ve % medios de A (esperado 0)', case when n = 0 then 'OK' else 'FALLA' end, n;
  b := privado.estudiante_debe_a('<INST_A>');
  raise notice 'M15 %: estudiante_debe_a(A) para EST_2 = % (esperado false)', case when not b then 'OK' else 'FALLA' end, b;
end $$;

-- ---- mis_cuotas(): cada estudiante solo recibe SUS cuotas
select set_config('request.jwt.claims', json_build_object('sub', '<EST_1>', 'role', 'authenticated')::text, true);
do $$ begin
  perform set_config('pruebas.cuotas_est1', coalesce((select string_agg(cuota_id::text, ',') from public.mis_cuotas()), ''), true);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', '<EST_2>', 'role', 'authenticated')::text, true);
do $$ begin
  perform set_config('pruebas.cuotas_est2', coalesce((select string_agg(cuota_id::text, ',') from public.mis_cuotas()), ''), true);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_A>', 'role', 'authenticated')::text, true);
do $$ declare n integer; begin
  select count(*) into n from public.mis_cuotas();
  raise notice 'M16 %: mis_cuotas() con rol admin devuelve % filas (esperado 0)', case when n = 0 then 'OK' else 'FALLA' end, n;
end $$;

-- ---- anon: sin acceso a la tabla ni a la función
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$ begin
  perform 1 from public.medios_cobro_institucion limit 1;
  raise notice 'M17 FALLA: anon puede leer medios de cobro';
exception when insufficient_privilege then raise notice 'M17 OK: anon no puede leer la tabla (42501)';
end $$;
do $$ begin
  perform 1 from public.mis_cuotas();
  raise notice 'M18 FALLA: anon puede ejecutar mis_cuotas()';
exception when insufficient_privilege then raise notice 'M18 OK: anon no puede ejecutar mis_cuotas() (42501)';
end $$;

-- ---- Comprobación final como propietario: las cuotas devueltas son de cada uno
reset role;
do $$ declare ids1 uuid[]; ids2 uuid[]; ajenas integer; total integer; begin
  ids1 := coalesce(string_to_array(nullif(current_setting('pruebas.cuotas_est1'), ''), ',')::uuid[], '{}');
  ids2 := coalesce(string_to_array(nullif(current_setting('pruebas.cuotas_est2'), ''), ',')::uuid[], '{}');
  select count(*) into ajenas from public.cuotas q join public.matriculas m on m.id = q.matricula_id
   where q.id = any(ids1) and m.estudiante_id <> '<EST_1>';
  select count(*) into total from public.cuotas q join public.matriculas m on m.id = q.matricula_id
   where m.estudiante_id = '<EST_1>';
  raise notice 'M19 %: mis_cuotas() de EST_1 devolvió % cuotas ajenas (esperado 0)', case when ajenas = 0 then 'OK' else 'FALLA' end, ajenas;
  raise notice 'M20 %: EST_1 recibió % de sus % cuotas', case when cardinality(ids1) = total then 'OK' else 'FALLA' end, cardinality(ids1), total;
  raise notice 'M21 %: EST_2 recibió % cuotas de EST_1 (esperado 0)',
    case when not (ids1 && ids2) then 'OK' else 'FALLA' end,
    (select count(*) from unnest(ids2) x where x = any(ids1));
end $$;

rollback;
-- Tras el ROLLBACK, los medios de prueba no existen:
-- select count(*) from public.medios_cobro_institucion where titular like 'Prueba %';  -- 0
