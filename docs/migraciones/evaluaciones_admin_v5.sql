-- =====================================================================
-- ACADEMIX | MIGRACIÓN DEFINITIVA (NO EJECUTADA) — Evaluaciones del
-- administrador y cierre controlado del resultado académico
-- Orden: aplicar ANTES de certificados_v5.sql (que lo comprueba).
--
-- ESTADO REAL DE V5
--   - evaluaciones (nombre, descripcion, peso 0–100 %, fecha): las CREA y
--     EDITA solo el docente del grupo ("docente gestiona evaluaciones"). El
--     administrador solo las LEE.
--   - calificaciones (nota numeric(4,2) entre 0 y 20): las registra el docente.
--   - cursos.nota_aprobatoria (0–20, por curso): umbral de aprobación.
--   - matriculas.estado_final ('en_curso' | 'aprobado' | 'desaprobado'): V4
--     concedió UPDATE directo, sin cálculo, sin registro ni comprobación de notas.
--   - Nada impide que los pesos de un grupo superen 100 %.
--
-- QUÉ HACE
--   1. Políticas para que el ADMINISTRADOR activo de la institución cree,
--      edite y elimine evaluaciones de grupos de SU institución que no estén
--      cerrados ni cancelados. La política del docente no cambia.
--   2. Disparador: la suma de pesos de un grupo no puede superar 100 %.
--   3. Disparadores de protección: si una matrícula tiene resultado final, no
--      se cambian sus notas ni los pesos/evaluaciones de su grupo. Para
--      corregir, se reabre el resultado con motivo (queda en el historial).
--   4. historial_resultados: registro inmutable (sin escritura directa).
--   5. registrar_resultado_final(p_matricula): CALCULA el promedio ponderado
--      (exige pesos = 100 % y todas las notas) y fija aprobado/desaprobado con
--      la nota aprobatoria del curso. El administrador no elige el resultado.
--   6. reabrir_resultado_final(p_matricula, p_motivo): vuelve a 'en_curso'
--      solo sin certificado emitido y con motivo.
--   7. OBLIGATORIO: se retira el UPDATE directo de public.matriculas a
--      authenticated. Ninguna parte de la app lo usa (anular_matricula y las
--      funciones de este archivo son SECURITY DEFINER). Es lo que garantiza
--      que un certificado solo se emita sobre un resultado calculado.
--
-- ESCALA: V5 fija las notas entre 0 y 20 y la nota aprobatoria la define cada
-- curso. Esta migración NO cambia la escala.
--
-- BLOQUEOS: grupo → matrícula (mismo orden que anular_matricula y las RPC de
-- V5). Sin ciclos con emitir_certificado (solo bloquea la matrícula).
--
-- No modifica tablas existentes; añade políticas, disparadores, una tabla y
-- funciones, y retira un permiso. Idempotente. Reversión al final.
-- =====================================================================

begin;

-- 0. REQUISITOS (si falta algo, se aborta sin cambiar nada) --------------
do $$
declare v_falta text;
begin
  select string_agg(f, ', ') into v_falta
  from unnest(array['privado.admin_de_institucion(uuid)', 'privado.mi_rol_activo()', 'privado.mi_institucion()']) f
  where to_regprocedure(f) is null;
  if v_falta is not null then raise exception 'Requisito: faltan funciones %', v_falta; end if;

  select string_agg(t || '.' || c, ', ') into v_falta
  from (values ('evaluaciones','peso'), ('evaluaciones','grupo_id'), ('calificaciones','nota'), ('calificaciones','matricula_id'),
               ('calificaciones','evaluacion_id'), ('matriculas','estado_final'), ('matriculas','estado'), ('matriculas','grupo_id'),
               ('cursos','nota_aprobatoria'), ('grupos','estado'), ('certificados','matricula_id'), ('instituciones','activo')) e(t, c)
  where not exists (select 1 from information_schema.columns ic where ic.table_schema = 'public' and ic.table_name = e.t and ic.column_name = e.c);
  if v_falta is not null then raise exception 'Requisito: faltan columnas %', v_falta; end if;

  if not exists (select 1 from pg_enum en join pg_type ty on ty.oid = en.enumtypid
                 where ty.typname = 'estado_final' and en.enumlabel in ('en_curso','aprobado','desaprobado')
                 group by ty.oid having count(*) = 3) then
    raise exception 'Requisito: el tipo estado_final no tiene los valores en_curso/aprobado/desaprobado';
  end if;

  if exists (select 1 from public.evaluaciones group by grupo_id having sum(peso) > 100) then
    raise notice 'AVISO: hay grupos cuyas evaluaciones ya suman más de 100 %%. No se modifican, pero no podrán cerrar resultados hasta corregirlas.';
  end if;
end $$;

-- 1. EL ADMINISTRADOR GESTIONA EVALUACIONES DE SU INSTITUCIÓN ------------
create or replace function privado.grupo_editable(p_grupo uuid, p_institucion uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.grupos g
                 join public.instituciones i on i.id = g.institucion_id
                 where g.id = p_grupo and g.institucion_id = p_institucion and i.activo
                   and g.estado::text not in ('cerrado','cancelado'))
$$;
revoke all on function privado.grupo_editable(uuid, uuid) from public, anon;
grant execute on function privado.grupo_editable(uuid, uuid) to authenticated;

drop policy if exists "v5 admin crea evaluaciones" on public.evaluaciones;
create policy "v5 admin crea evaluaciones" on public.evaluaciones
  for insert to authenticated
  with check (privado.admin_de_institucion(institucion_id) and privado.grupo_editable(grupo_id, institucion_id));

drop policy if exists "v5 admin edita evaluaciones" on public.evaluaciones;
create policy "v5 admin edita evaluaciones" on public.evaluaciones
  for update to authenticated
  using (privado.admin_de_institucion(institucion_id) and privado.grupo_editable(grupo_id, institucion_id))
  with check (privado.admin_de_institucion(institucion_id) and privado.grupo_editable(grupo_id, institucion_id));

drop policy if exists "v5 admin elimina evaluaciones" on public.evaluaciones;
create policy "v5 admin elimina evaluaciones" on public.evaluaciones
  for delete to authenticated
  using (privado.admin_de_institucion(institucion_id) and privado.grupo_editable(grupo_id, institucion_id));
-- Una evaluación con notas no se puede eliminar: lo impide la FK de calificaciones.

-- 2 y 3. PESOS Y PROTECCIÓN DE RESULTADOS REGISTRADOS --------------------
create or replace function privado.validar_evaluacion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_grupo uuid := coalesce(new.grupo_id, old.grupo_id); v_suma numeric;
begin
  -- Serializa los cambios de un mismo grupo (dos sesiones a la vez).
  perform 1 from public.grupos where id = v_grupo for update;
  if exists (select 1 from public.matriculas m where m.grupo_id = v_grupo
             and m.estado::text = 'activa' and m.estado_final::text <> 'en_curso') then
    raise exception 'Hay resultados finales registrados en el grupo: reábrelos antes de cambiar las evaluaciones';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  select coalesce(sum(e.peso), 0) into v_suma from public.evaluaciones e
   where e.grupo_id = new.grupo_id and e.id <> new.id;
  if v_suma + new.peso > 100 then
    raise exception 'La suma de pesos de las evaluaciones del grupo supera 100%% (ya asignado: % %%)', v_suma;
  end if;
  return new;
end
$$;
drop trigger if exists validar_evaluacion_v5 on public.evaluaciones;
create trigger validar_evaluacion_v5
  before insert or delete or update of peso, grupo_id on public.evaluaciones
  for each row execute function privado.validar_evaluacion();

create or replace function privado.proteger_calificacion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.matriculas m where m.id = coalesce(new.matricula_id, old.matricula_id)
             and m.estado_final::text <> 'en_curso') then
    raise exception 'La matrícula ya tiene resultado final: reábrelo antes de cambiar sus notas';
  end if;
  return coalesce(new, old);
end
$$;
drop trigger if exists proteger_calificacion_v5 on public.calificaciones;
create trigger proteger_calificacion_v5
  before insert or update or delete on public.calificaciones
  for each row execute function privado.proteger_calificacion();

revoke all on function privado.validar_evaluacion() from public, anon, authenticated;
revoke all on function privado.proteger_calificacion() from public, anon, authenticated;

-- 4. HISTORIAL INMUTABLE ------------------------------------------------
create table if not exists public.historial_resultados (
  id               uuid primary key default gen_random_uuid(),
  institucion_id   uuid not null references public.instituciones(id),
  matricula_id     uuid not null references public.matriculas(id),
  resultado        text not null check (resultado in ('en_curso','aprobado','desaprobado')),
  promedio         numeric(5,2),
  nota_aprobatoria numeric(4,2),
  motivo           text check (motivo is null or length(motivo) <= 500),
  registrado_por   uuid not null,
  registrado_en    timestamptz not null default now()
);
create index if not exists historial_resultados_matricula_idx on public.historial_resultados (matricula_id, registrado_en desc);
alter table public.historial_resultados enable row level security;
revoke all on table public.historial_resultados from public, anon, authenticated;
grant select on table public.historial_resultados to authenticated;
drop policy if exists "v5 admin lee historial de resultados" on public.historial_resultados;
create policy "v5 admin lee historial de resultados" on public.historial_resultados
  for select to authenticated using (privado.admin_de_institucion(institucion_id));

-- 5. CIERRE DEL RESULTADO (calculado, no elegido) -------------------------
create or replace function public.registrar_resultado_final(p_matricula uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_m public.matriculas%rowtype; v_estado_grupo text; v_aprobatoria numeric;
  v_suma numeric; v_faltan integer; v_promedio numeric; v_resultado text;
begin
  select * into v_m from public.matriculas where id = p_matricula;
  if not found or not privado.admin_de_institucion(v_m.institucion_id) then
    raise exception 'Matrícula inaccesible' using errcode = '42501';
  end if;
  if not exists (select 1 from public.instituciones i where i.id = v_m.institucion_id and i.activo) then
    raise exception 'La institución no está activa';
  end if;
  -- Bloqueo: grupo → matrícula.
  select g.estado::text, c.nota_aprobatoria into v_estado_grupo, v_aprobatoria
    from public.grupos g join public.cursos c on c.id = g.curso_id where g.id = v_m.grupo_id for update of g;
  select * into v_m from public.matriculas where id = p_matricula for update;
  if v_m.estado::text <> 'activa' then raise exception 'La matrícula no está activa'; end if;
  if v_m.estado_final::text <> 'en_curso' then raise exception 'La matrícula ya tiene resultado final'; end if;
  if v_estado_grupo not in ('en_curso','cerrado') then
    raise exception 'El grupo debe estar en curso o cerrado para registrar resultados';
  end if;
  select coalesce(sum(e.peso), 0) into v_suma from public.evaluaciones e where e.grupo_id = v_m.grupo_id;
  if v_suma <> 100 then raise exception 'Las evaluaciones del grupo deben sumar 100%% (suman % %%)', v_suma; end if;
  select count(*) into v_faltan from public.evaluaciones e
   where e.grupo_id = v_m.grupo_id
     and not exists (select 1 from public.calificaciones c where c.evaluacion_id = e.id and c.matricula_id = v_m.id);
  if v_faltan > 0 then raise exception 'Faltan % calificaciones de esta matrícula', v_faltan; end if;

  select round(sum(c.nota * e.peso) / 100, 2) into v_promedio
    from public.calificaciones c join public.evaluaciones e on e.id = c.evaluacion_id
   where c.matricula_id = v_m.id;
  v_resultado := case when v_promedio >= v_aprobatoria then 'aprobado' else 'desaprobado' end;

  update public.matriculas set estado_final = v_resultado::public.estado_final where id = v_m.id;
  insert into public.historial_resultados (institucion_id, matricula_id, resultado, promedio, nota_aprobatoria, registrado_por)
  values (v_m.institucion_id, v_m.id, v_resultado, v_promedio, v_aprobatoria, auth.uid());
  return v_resultado;
end
$$;

-- 6. REAPERTURA (con motivo; nunca con certificado emitido) ---------------
create or replace function public.reabrir_resultado_final(p_matricula uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_m public.matriculas%rowtype;
begin
  -- Bloquea la matrícula: emitir_certificado también la bloquea, así que una
  -- reapertura y una emisión simultáneas se serializan.
  select * into v_m from public.matriculas where id = p_matricula for update;
  if not found or not privado.admin_de_institucion(v_m.institucion_id) then
    raise exception 'Matrícula inaccesible' using errcode = '42501';
  end if;
  if not exists (select 1 from public.instituciones i where i.id = v_m.institucion_id and i.activo) then
    raise exception 'La institución no está activa';
  end if;
  if v_m.estado_final::text = 'en_curso' then raise exception 'La matrícula no tiene resultado final'; end if;
  if exists (select 1 from public.certificados c where c.matricula_id = v_m.id) then
    raise exception 'La matrícula tiene un certificado emitido: su resultado no se puede reabrir';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 10 then raise exception 'Indica el motivo de la reapertura (mínimo 10 caracteres)'; end if;
  update public.matriculas set estado_final = 'en_curso' where id = v_m.id;
  insert into public.historial_resultados (institucion_id, matricula_id, resultado, motivo, registrado_por)
  values (v_m.institucion_id, v_m.id, 'en_curso', left(trim(p_motivo), 500), auth.uid());
end
$$;

revoke all on function public.registrar_resultado_final(uuid) from public, anon;
revoke all on function public.reabrir_resultado_final(uuid, text) from public, anon;
grant execute on function public.registrar_resultado_final(uuid) to authenticated;
grant execute on function public.reabrir_resultado_final(uuid, text) to authenticated;

-- 7. SIN ESCRITURA DIRECTA DE MATRÍCULAS (obligatorio) ---------------------
-- Se retiran tanto el permiso de tabla como los de columna (V4 concedió
-- update (estado, estado_final)); las RPC SECURITY DEFINER siguen funcionando.
revoke update on table public.matriculas from public, authenticated, anon;
revoke update (estado, estado_final) on public.matriculas from public, authenticated, anon;
do $$ begin
  if has_column_privilege('authenticated', 'public.matriculas', 'estado_final', 'UPDATE')
     or has_column_privilege('authenticated', 'public.matriculas', 'estado', 'UPDATE') then
    raise exception 'authenticated conserva UPDATE sobre matriculas (posible concesión vía otro rol). Revísalo antes de continuar.';
  end if;
end $$;

commit;

-- =====================================================================
-- VERIFICACIÓN (solo lectura, después de aplicar)
-- =====================================================================
-- select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'evaluaciones' order by 1;
--   Esperado: "docente gestiona evaluaciones" (ALL), "ver evaluaciones" (SELECT) y las 3 "v5 admin ..." (INSERT/UPDATE/DELETE).
-- select tgname, tgrelid::regclass, tgenabled from pg_trigger where tgname in ('validar_evaluacion_v5','proteger_calificacion_v5');
-- select p.oid::regprocedure, p.prosecdef, pg_get_userbyid(p.proowner) as dueno, p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
--   from pg_proc p where p.proname in ('registrar_resultado_final','reabrir_resultado_final','grupo_editable');
--   Esperado: SECURITY DEFINER, dueño postgres, search_path vacío, anon = false, authenticated = true.
-- select has_column_privilege('authenticated','public.matriculas','estado_final','UPDATE') as estado_final,
--        has_table_privilege('authenticated','public.matriculas','UPDATE') as tabla;     -- ambos false

-- =====================================================================
-- REVERSIÓN (no restaura el UPDATE directo de matrículas: hacerlo sería inseguro)
-- =====================================================================
-- begin;
-- drop trigger if exists validar_evaluacion_v5 on public.evaluaciones;
-- drop trigger if exists proteger_calificacion_v5 on public.calificaciones;
-- drop policy if exists "v5 admin crea evaluaciones" on public.evaluaciones;
-- drop policy if exists "v5 admin edita evaluaciones" on public.evaluaciones;
-- drop policy if exists "v5 admin elimina evaluaciones" on public.evaluaciones;
-- drop function if exists public.registrar_resultado_final(uuid), public.reabrir_resultado_final(uuid, text);
-- drop function if exists privado.validar_evaluacion(), privado.proteger_calificacion(), privado.grupo_editable(uuid, uuid);
-- drop table if exists public.historial_resultados;
-- commit;
