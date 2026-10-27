-- =====================================================================
-- ACADEMIX | PRUEBAS REALES — evaluaciones_admin_v5 + certificados_v5
-- Ejecutar DESPUÉS de aplicar ambas migraciones. NO EJECUTAR AÚN.
--
-- Todo ocurre en UNA transacción que termina en ROLLBACK: evaluaciones,
-- notas, resultados, pagos y certificados de prueba desaparecen al final.
-- Resultados en la pestaña «Messages»: cada línea dice OK, FALLA o REVISAR.
--
-- Cuentas y registros de PRUEBA (nunca estudiantes reales):
--   <INST_A>, <INST_B>  dos instituciones activas
--   <ADMIN_A>, <ADMIN_B> administradores (rol_activo = 'admin') de A y de B
--   <DOCENTE_A>          docente asignado a <GRUPO_A> (rol_activo = 'docente')
--   <GRUPO_A>            grupo de A en estado 'en_curso' y SIN evaluaciones
--   <CURSO_A>            curso de <GRUPO_A> (nota aprobatoria 11 por defecto)
--   <EST_1>, <MAT_1>     estudiante (rol_activo = 'estudiante') y su matrícula
--                        ACTIVA en <GRUPO_A>, estado_final 'en_curso', sin certificado
--   <EST_2>              otro estudiante sin relación con <MAT_1>
--   <ARCHIVO_EST_1>      ruta de un comprobante ya subido por EST_1 desde la app:
--                        comprobantes-cursos-v5/<EST_1>/<uuid>.pdf
-- =====================================================================

-- 0. PRECONDICIONES (solo lectura) ---------------------------------------
select p.id, p.institucion_id, p.rol_activo, p.activo from public.perfiles p
where p.id in ('<ADMIN_A>','<ADMIN_B>','<DOCENTE_A>','<EST_1>','<EST_2>');
select g.id, g.estado, g.docente_id = '<DOCENTE_A>' as docente_ok, g.curso_id = '<CURSO_A>' as curso_ok,
       (select count(*) from public.evaluaciones e where e.grupo_id = g.id) as evaluaciones   -- debe ser 0
from public.grupos g where g.id = '<GRUPO_A>';
select m.id, m.estado, m.estado_final, m.estudiante_id = '<EST_1>' as est_ok, m.grupo_id = '<GRUPO_A>' as grupo_ok,
       exists (select 1 from public.certificados c where c.matricula_id = m.id) as tiene_certificado  -- debe ser false
from public.matriculas m where m.id = '<MAT_1>';
select exists (select 1 from storage.objects where bucket_id = 'comprobantes-cursos-v5' and name = '<ARCHIVO_EST_1>') as comprobante_existe;

begin;

-- =========================== EVALUACIONES ================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','<ADMIN_A>','role','authenticated')::text, true);
do $$ declare v uuid; begin
  insert into public.evaluaciones (institucion_id, grupo_id, nombre, peso) values ('<INST_A>','<GRUPO_A>','Parcial (prueba)',60) returning id into v;
  perform set_config('pruebas.ev1', v::text, true);
  insert into public.evaluaciones (institucion_id, grupo_id, nombre, peso) values ('<INST_A>','<GRUPO_A>','Final (prueba)',40) returning id into v;
  perform set_config('pruebas.ev2', v::text, true);
  raise notice 'E1 OK: el admin A crea evaluaciones de su grupo (60 %% + 40 %%)';
exception when others then raise notice 'E1 FALLA: % (%)', sqlerrm, sqlstate;
end $$;
do $$ begin
  insert into public.evaluaciones (institucion_id, grupo_id, nombre, peso) values ('<INST_A>','<GRUPO_A>','Extra',10);
  raise notice 'E2 FALLA: se aceptó superar 100 %%';
exception when others then raise notice 'E2 %: %', case when sqlerrm like '%supera 100%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;
do $$ begin
  insert into public.calificaciones (institucion_id, grupo_id, evaluacion_id, matricula_id, nota)
  values ('<INST_A>','<GRUPO_A>', current_setting('pruebas.ev1')::uuid, '<MAT_1>', 20);
  raise notice 'E3 FALLA: el administrador registró una nota';
exception when insufficient_privilege then raise notice 'E3 OK: el admin no registra notas (42501)';
  when others then raise notice 'E3 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;

select set_config('request.jwt.claims', json_build_object('sub','<ADMIN_B>','role','authenticated')::text, true);
do $$ begin
  insert into public.evaluaciones (institucion_id, grupo_id, nombre, peso) values ('<INST_A>','<GRUPO_A>','Intruso',5);
  raise notice 'E4 FALLA: el admin B creó una evaluación en la institución A';
exception when insufficient_privilege then raise notice 'E4 OK: otra institución no crea evaluaciones (42501)';
  when others then raise notice 'E4 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;

select set_config('request.jwt.claims', json_build_object('sub','<DOCENTE_A>','role','authenticated')::text, true);
do $$ begin
  insert into public.calificaciones (institucion_id, grupo_id, evaluacion_id, matricula_id, nota) values
    ('<INST_A>','<GRUPO_A>', current_setting('pruebas.ev1')::uuid, '<MAT_1>', 15),
    ('<INST_A>','<GRUPO_A>', current_setting('pruebas.ev2')::uuid, '<MAT_1>', 16);
  raise notice 'E5 OK: el docente del grupo registra las notas (15 y 16)';
exception when others then raise notice 'E5 FALLA: % (%)', sqlerrm, sqlstate;
end $$;

select set_config('request.jwt.claims', json_build_object('sub','<EST_2>','role','authenticated')::text, true);
do $$ declare n integer; begin
  select count(*) into n from public.calificaciones where matricula_id = '<MAT_1>';
  raise notice 'E6 %: EST_2 ve % notas de MAT_1 (esperado 0)', case when n = 0 then 'OK' else 'FALLA' end, n;
end $$;
do $$ begin
  perform public.registrar_resultado_final('<MAT_1>');
  raise notice 'E7 FALLA: un estudiante registró un resultado';
exception when insufficient_privilege then raise notice 'E7 OK: un estudiante no registra resultados (42501)';
  when others then raise notice 'E7 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;

select set_config('request.jwt.claims', json_build_object('sub','<ADMIN_B>','role','authenticated')::text, true);
do $$ begin
  perform public.registrar_resultado_final('<MAT_1>');
  raise notice 'E8 FALLA: el admin B registró un resultado de A';
exception when insufficient_privilege then raise notice 'E8 OK: otra institución no registra resultados (42501)';
  when others then raise notice 'E8 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;

select set_config('request.jwt.claims', json_build_object('sub','<ADMIN_A>','role','authenticated')::text, true);
do $$ begin
  update public.matriculas set estado_final = 'aprobado' where id = '<MAT_1>';
  raise notice 'E9 FALLA: el admin cambió estado_final directamente';
exception when insufficient_privilege then raise notice 'E9 OK: estado_final no se edita directamente (42501)';
  when others then raise notice 'E9 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;
do $$ declare r text; begin
  r := public.registrar_resultado_final('<MAT_1>');
  raise notice 'E10 %: resultado calculado = % (esperado aprobado: 15×0.6 + 16×0.4 = 15.40)', case when r = 'aprobado' then 'OK' else 'FALLA' end, r;
exception when others then raise notice 'E10 FALLA: % (%)', sqlerrm, sqlstate;
end $$;
do $$ begin
  perform public.registrar_resultado_final('<MAT_1>');
  raise notice 'E11 FALLA: se registró dos veces';
exception when others then raise notice 'E11 %: %', case when sqlerrm like '%ya tiene resultado final%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;
do $$ begin
  update public.evaluaciones set peso = 50 where id = current_setting('pruebas.ev1')::uuid;
  raise notice 'E12 FALLA: se cambió un peso con resultados registrados';
exception when others then raise notice 'E12 %: %', case when sqlerrm like '%resultados finales registrados%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;
do $$ declare n integer; begin
  select count(*) into n from public.historial_resultados where matricula_id = '<MAT_1>';
  raise notice 'E13 %: el admin A ve % registro(s) en el historial (esperado 1)', case when n = 1 then 'OK' else 'FALLA' end, n;
end $$;

select set_config('request.jwt.claims', json_build_object('sub','<DOCENTE_A>','role','authenticated')::text, true);
do $$ begin
  update public.calificaciones set nota = 20 where matricula_id = '<MAT_1>';
  raise notice 'E14 FALLA: el docente cambió una nota con resultado final';
exception when others then raise notice 'E14 %: %', case when sqlerrm like '%ya tiene resultado final%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;

-- =========================== CERTIFICADOS ================================
select set_config('request.jwt.claims', json_build_object('sub','<ADMIN_B>','role','authenticated')::text, true);
do $$ begin
  insert into public.certificacion_curso (curso_id, institucion_id, modalidad) values ('<CURSO_A>','<INST_A>','gratuito');
  raise notice 'C1 FALLA: el admin B configuró la certificación de un curso de A';
exception when insufficient_privilege then raise notice 'C1 OK: otra institución no configura la certificación (42501)';
  when others then raise notice 'C1 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;

select set_config('request.jwt.claims', json_build_object('sub','<ADMIN_A>','role','authenticated')::text, true);
do $$ begin
  insert into public.certificacion_curso (curso_id, institucion_id, modalidad, nota_minima) values ('<CURSO_A>','<INST_A>','gratuito',18)
  on conflict (curso_id) do update set modalidad = 'gratuito', importe = 0, nota_minima = 18;
  perform public.emitir_certificado('<MAT_1>');
  raise notice 'C2 FALLA: se emitió sin alcanzar la nota mínima (18 > 15.40)';
exception when others then raise notice 'C2 %: %', case when sqlerrm like '%nota mínima%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;
do $$ begin
  update public.certificacion_curso set modalidad = 'costo_adicional', importe = 50, nota_minima = null where curso_id = '<CURSO_A>';
  perform public.emitir_certificado('<MAT_1>');
  raise notice 'C3 FALLA: se emitió sin pago verificado';
exception when others then raise notice 'C3 %: %', case when sqlerrm like '%pago del certificado no está verificado%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;
do $$ begin
  insert into public.certificados (institucion_id, matricula_id) values ('<INST_A>','<MAT_1>');
  raise notice 'C4 FALLA: el admin insertó un certificado directamente (sin requisitos)';
exception when insufficient_privilege then raise notice 'C4 OK: no se insertan certificados directamente (42501)';
  when others then raise notice 'C4 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;

select set_config('request.jwt.claims', json_build_object('sub','<EST_2>','role','authenticated')::text, true);
do $$ begin
  perform public.solicitar_certificado('<MAT_1>');
  raise notice 'C5 FALLA: EST_2 solicitó el certificado de otra persona';
exception when insufficient_privilege then raise notice 'C5 OK: no se solicita el certificado de otra matrícula (42501)';
  when others then raise notice 'C5 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;

select set_config('request.jwt.claims', json_build_object('sub','<EST_1>','role','authenticated')::text, true);
do $$ declare v uuid; v2 uuid; begin
  v := public.solicitar_certificado('<MAT_1>');
  v2 := public.solicitar_certificado('<MAT_1>');
  perform set_config('pruebas.sol', v::text, true);
  raise notice 'C6 %: EST_1 solicita su certificado y la segunda vez recibe la misma solicitud', case when v = v2 then 'OK' else 'FALLA' end;
exception when others then raise notice 'C6 FALLA: % (%)', sqlerrm, sqlstate;
end $$;
do $$ begin
  perform public.presentar_comprobante_certificado(current_setting('pruebas.sol')::uuid, 49, 'Yape', 'PRUEBA-49', '<ARCHIVO_EST_1>');
  raise notice 'C7 FALLA: aceptó un monto distinto del importe';
exception when others then raise notice 'C7 %: %', case when sqlerrm like '%coincidir con el importe%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;
do $$ declare v uuid; begin
  v := public.presentar_comprobante_certificado(current_setting('pruebas.sol')::uuid, 50, 'Yape', 'PRUEBA-50', '<ARCHIVO_EST_1>');
  perform set_config('pruebas.pago', v::text, true);
  raise notice 'C8 OK: comprobante del certificado presentado';
exception when others then raise notice 'C8 REVISAR (¿existe <ARCHIVO_EST_1>?): % (%)', sqlerrm, sqlstate;
end $$;
do $$ begin
  perform public.presentar_comprobante_certificado(current_setting('pruebas.sol')::uuid, 50, 'Yape', 'PRUEBA-DOBLE', '<ARCHIVO_EST_1>');
  raise notice 'C9 FALLA: aceptó dos comprobantes pendientes';
exception when others then raise notice 'C9 %: %', case when sqlerrm like '%pendiente de revisión%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;

select set_config('request.jwt.claims', json_build_object('sub','<ADMIN_B>','role','authenticated')::text, true);
do $$ declare n integer; begin
  select count(*) into n from public.pagos_certificado where solicitud_id = nullif(current_setting('pruebas.sol', true), '')::uuid;
  raise notice 'C10 %: el admin B ve % pagos de certificados de A (esperado 0)', case when n = 0 then 'OK' else 'FALLA' end, n;
  begin
    perform public.revisar_pago_certificado(nullif(current_setting('pruebas.pago', true), '')::uuid, true, null);
    raise notice 'C11 FALLA: el admin B aprobó un pago de A';
  exception when insufficient_privilege then raise notice 'C11 OK: otra institución no revisa pagos (42501)';
    when others then raise notice 'C11 REVISAR: % (%)', sqlerrm, sqlstate;
  end;
  begin
    perform public.emitir_certificado('<MAT_1>');
    raise notice 'C12 FALLA: el admin B emitió un certificado de A';
  exception when insufficient_privilege then raise notice 'C12 OK: otra institución no emite (42501)';
    when others then raise notice 'C12 REVISAR: % (%)', sqlerrm, sqlstate;
  end;
end $$;

select set_config('request.jwt.claims', json_build_object('sub','<ADMIN_A>','role','authenticated')::text, true);
do $$ begin
  perform public.revisar_pago_certificado(current_setting('pruebas.pago')::uuid, false, null);
  raise notice 'C13 FALLA: rechazó sin motivo';
exception when others then raise notice 'C13 %: %', case when sqlerrm like '%motivo del rechazo%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;
do $$ declare r text; begin
  r := public.revisar_pago_certificado(current_setting('pruebas.pago')::uuid, true, 'Ingreso verificado (prueba)');
  raise notice 'C14 %: pago del certificado = %', case when r = 'pagado' then 'OK' else 'FALLA' end, r;
  begin
    perform public.revisar_pago_certificado(current_setting('pruebas.pago')::uuid, true, null);
    raise notice 'C15 FALLA: aprobó dos veces';
  exception when others then raise notice 'C15 %: %', case when sqlerrm like '%ya fue revisado%' then 'OK' else 'REVISAR' end, sqlerrm;
  end;
exception when others then raise notice 'C14 REVISAR (depende de C8): % (%)', sqlerrm, sqlstate;
end $$;
do $$ declare v_id uuid; v_codigo text; begin
  select certificado_id, codigo into v_id, v_codigo from public.emitir_certificado('<MAT_1>');
  perform set_config('pruebas.cert', v_id::text, true);
  perform set_config('pruebas.codigo', v_codigo, true);
  raise notice 'C16 OK: certificado emitido con código %', v_codigo;
exception when others then raise notice 'C16 REVISAR (depende de C14): % (%)', sqlerrm, sqlstate;
end $$;
do $$ begin
  perform public.emitir_certificado('<MAT_1>');
  raise notice 'C17 FALLA: se emitió dos veces';
exception when others then raise notice 'C17 %: %', case when sqlerrm like '%ya fue emitido%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;
do $$ declare n integer; begin
  update public.certificados set archivo_url = 'x' where id = nullif(current_setting('pruebas.cert', true), '')::uuid;
  get diagnostics n = row_count;
  raise notice 'C18 FALLA: se modificó un certificado emitido (% filas)', n;
exception when insufficient_privilege then raise notice 'C18 OK: un certificado emitido no se modifica (42501)';
end $$;
do $$ begin
  perform public.adjuntar_pdf_certificado(current_setting('pruebas.cert')::uuid, '<INST_A>/otro.pdf');
  raise notice 'C19 FALLA: aceptó una ruta de PDF distinta';
exception when others then raise notice 'C19 %: %', case when sqlerrm like '%Ruta de PDF no válida%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;
do $$ begin
  perform public.adjuntar_pdf_certificado(current_setting('pruebas.cert')::uuid, '<INST_A>/' || current_setting('pruebas.cert') || '.pdf');
  raise notice 'C20 FALLA: enlazó un PDF que no existe';
exception when others then raise notice 'C20 %: %', case when sqlerrm like '%No se encontró el PDF%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('certificados-emitidos', '<INST_A>/cualquier-archivo.pdf');
  raise notice 'C21 FALLA: el admin subió un archivo arbitrario a certificados-emitidos';
exception when insufficient_privilege then raise notice 'C21 OK: solo se sube la ruta exacta de un certificado sin PDF (42501)';
  when others then raise notice 'C21 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;
do $$ begin
  perform public.reabrir_resultado_final('<MAT_1>', 'Prueba de reapertura con certificado');
  raise notice 'C22 FALLA: se reabrió un resultado con certificado';
exception when others then raise notice 'C22 %: %', case when sqlerrm like '%certificado emitido%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;
do $$ begin
  perform public.anular_matricula('<MAT_1>');
  raise notice 'C23 FALLA: se anuló una matrícula con certificado';
exception when others then raise notice 'C23 %: %', case when sqlerrm ilike '%certificado%' or sqlerrm ilike '%resultado final%' then 'OK' else 'REVISAR' end, sqlerrm;
end $$;

-- Copia fija: solo el administrador de la institución.
do $$ declare n integer; begin
  select count(*) into n from public.certificados_contenido where certificado_id = nullif(current_setting('pruebas.cert', true), '')::uuid;
  raise notice 'C24 %: el admin A ve la copia fija (% fila, esperado 1)', case when n = 1 then 'OK' else 'REVISAR' end, n;
end $$;
select set_config('request.jwt.claims', json_build_object('sub','<EST_1>','role','authenticated')::text, true);
do $$ declare n integer; t boolean; begin
  select count(*) into n from public.certificados_contenido;
  raise notice 'C25 %: EST_1 ve % copias internas (esperado 0: contienen rutas privadas)', case when n = 0 then 'OK' else 'FALLA' end, n;
  select tiene_pdf into t from public.mis_certificados() where matricula_id = '<MAT_1>';
  raise notice 'C26 %: en mis_certificados el PDF figura como no disponible (tiene_pdf = %)', case when t is false then 'OK' else 'REVISAR' end, t;
  select count(*) into n from storage.objects where bucket_id = 'certificados-recursos';
  raise notice 'C27 %: EST_1 ve % fondos/firmas privados (esperado 0)', case when n = 0 then 'OK' else 'FALLA' end, n;
end $$;
select set_config('request.jwt.claims', json_build_object('sub','<EST_2>','role','authenticated')::text, true);
do $$ declare n integer; begin
  select count(*) into n from public.mis_certificados() where matricula_id = '<MAT_1>';
  raise notice 'C28 %: EST_2 ve % certificados de EST_1 (esperado 0)', case when n = 0 then 'OK' else 'FALLA' end, n;
end $$;

-- Verificación pública (anon): datos mínimos.
set local role anon;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
do $$ declare r record; n integer; begin
  select * into r from public.verificar_certificado(current_setting('pruebas.codigo', true));
  raise notice 'C29 %: verificación pública → titular «%», curso «%»', case when r.codigo is not null then 'OK' else 'REVISAR (depende de C16)' end, r.estudiante, r.curso;
  select count(*) into n from public.verificar_certificado('NOEXISTE1234');
  raise notice 'C30 %: código inexistente devuelve % filas', case when n = 0 then 'OK' else 'FALLA' end, n;
  select count(*) into n from public.verificar_certificado('ab');
  raise notice 'C31 %: código demasiado corto devuelve % filas', case when n = 0 then 'OK' else 'FALLA' end, n;
end $$;
do $$ begin
  perform 1 from public.certificados_contenido limit 1;
  raise notice 'C32 FALLA: anon lee la copia interna';
exception when insufficient_privilege then raise notice 'C32 OK: anon no lee certificados_contenido (42501)';
end $$;
do $$ begin
  perform public.emitir_certificado('<MAT_1>');
  raise notice 'C33 FALLA: anon ejecutó emitir_certificado';
exception when insufficient_privilege then raise notice 'C33 OK: anon no emite (42501)';
  when others then raise notice 'C33 REVISAR: % (%)', sqlerrm, sqlstate;
end $$;

rollback;
-- Tras el ROLLBACK no queda nada: evaluaciones, notas, resultados, pagos ni certificados de prueba.
-- select count(*) from public.evaluaciones where nombre like '%(prueba)';   -- 0
