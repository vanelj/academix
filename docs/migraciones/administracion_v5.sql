-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA) — Equipo administrativo y enlaces
-- ---------------------------------------------------------------------
-- POR QUÉ ES NECESARIA
--   1. Varios administradores por institución con dos niveles dentro del
--      MISMO perfil Administrador (no se crean roles nuevos):
--        · principal: acceso completo, gestiona el equipo;
--        · secundario: acceso completo o módulos concretos.
--      Hoy todo administrador tiene acceso total y cualquiera puede asignar
--      el rol admin a otra persona.
--   2. El docente puede gestionar el enlace de su clase SOLO si la institución
--      lo autoriza (hoy solo el administrador escribe en horarios).
--
-- ENTIDADES AFECTADAS
--   NUEVAS: public.administradores_institucion, funciones privado.admin_puede,
--   privado.es_admin_principal y RPC gestionar_administrador,
--   cambiar_acceso_administrador, nombrar_principal, actualizar_enlace_clase.
--   instituciones (+ docentes_gestionan_enlaces, por defecto false).
--   Políticas RESTRICTIVAS nuevas (solo escritura) en las tablas de cada módulo.
--   NO modifica las políticas, funciones ni RPC existentes (pagos incluidos).
--
-- COMPATIBILIDAD
--   - Todos los administradores actuales pasan a ser PRINCIPALES con acceso
--     completo: nadie pierde acceso al aplicar la migración.
--   - Un administrador sin fila (caso anómalo) conserva el acceso completo.
--   - Las políticas restrictivas solo afectan a usuarios con rol activo
--     «admin»; docentes y estudiantes no cambian.
--
-- LÍMITE CONOCIDO (documentado): las RPC SECURITY DEFINER existentes
--   (revisar_pago, matricular, registrar_resultado_final, emitir_certificado…)
--   no se reescriben para no tocar pagos ni certificados: exigen rol admin de la
--   institución, y el permiso por módulo lo comprueba la app en el servidor antes
--   de llamarlas. Las LECTURAS siguen abiertas a todo admin de la institución.
--
-- ORDEN: después de todas las migraciones V5 aplicadas (incluida aula_academica_v5).
-- Diagnóstico previo: docs/diagnostico/verificacion_previa_administracion_v5.sql
-- =====================================================================
begin;

-- 0. REQUISITOS -----------------------------------------------------------
do $$
begin
  if to_regclass('public.usuario_roles') is null or to_regclass('public.perfiles') is null
     or to_regclass('public.horarios') is null or to_regclass('public.instituciones') is null then
    raise exception 'Faltan tablas de V5';
  end if;
  if to_regprocedure('privado.admin_de_institucion(uuid)') is null or to_regprocedure('privado.mi_rol_activo()') is null
     or to_regprocedure('privado.mi_institucion()') is null or to_regprocedure('privado.es_docente_del_grupo(uuid)') is null then
    raise exception 'Faltan funciones privadas de V5';
  end if;
end $$;

-- 1. TABLA DEL EQUIPO -------------------------------------------------------
create table if not exists public.administradores_institucion (
  perfil_id        uuid not null,
  institucion_id   uuid not null references public.instituciones(id),
  principal        boolean not null default false,
  acceso_total     boolean not null default false,
  modulos          text[] not null default '{}'
                   check (modulos <@ array['cursos','docentes','estudiantes','pagos','evaluaciones','certificados','institucion']::text[]),
  activo           boolean not null default true,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid references auth.users(id) on delete set null,
  primary key (perfil_id, institucion_id),
  foreign key (perfil_id, institucion_id) references public.perfiles(id, institucion_id) on delete cascade
);

-- Administradores actuales: principales con acceso completo (nadie pierde acceso).
insert into public.administradores_institucion (perfil_id, institucion_id, principal, acceso_total, activo)
select ur.perfil_id, ur.institucion_id, true, true, ur.activo
  from public.usuario_roles ur
  join public.perfiles p on p.id = ur.perfil_id and p.institucion_id = ur.institucion_id
 where ur.rol = 'admin' and ur.institucion_id is not null
on conflict (perfil_id, institucion_id) do nothing;

alter table public.administradores_institucion enable row level security;
revoke all on table public.administradores_institucion from public, anon, authenticated;
grant select on table public.administradores_institucion to authenticated;
-- Sin INSERT/UPDATE/DELETE directos: solo con las RPC de la sección 4.

drop policy if exists "v5 ver equipo administrativo" on public.administradores_institucion;
create policy "v5 ver equipo administrativo" on public.administradores_institucion for select to authenticated
  using (perfil_id = auth.uid() or privado.admin_de_institucion(institucion_id));

-- 2. FUNCIONES DE PERMISO ---------------------------------------------------
create or replace function privado.es_admin_principal(p_institucion uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.admin_de_institucion(p_institucion)
     and exists (select 1 from public.administradores_institucion a
                  where a.perfil_id = auth.uid() and a.institucion_id = p_institucion and a.activo and a.principal)
$$;

-- p_modulo: uno de los módulos o 'equipo' (solo principal).
create or replace function privado.admin_puede(p_institucion uuid, p_modulo text)
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.admin_de_institucion(p_institucion)
     and coalesce((
       select a.activo and (a.principal or (p_modulo <> 'equipo' and (a.acceso_total or p_modulo = any (a.modulos))))
         from public.administradores_institucion a
        where a.perfil_id = auth.uid() and a.institucion_id = p_institucion), true)
$$;

-- Un nuevo rol admin crea su fila: principal si la institución aún no tiene uno.
create or replace function privado.alta_administrador()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_hay_principal boolean;
begin
  if new.rol = 'admin' and new.institucion_id is not null then
    select exists (select 1 from public.administradores_institucion a
                    where a.institucion_id = new.institucion_id and a.principal and a.activo) into v_hay_principal;
    insert into public.administradores_institucion (perfil_id, institucion_id, principal, acceso_total, activo, actualizado_por)
    values (new.perfil_id, new.institucion_id, not v_hay_principal, not v_hay_principal, new.activo, auth.uid())
    on conflict (perfil_id, institucion_id) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists alta_administrador_v5 on public.usuario_roles;
create trigger alta_administrador_v5 after insert on public.usuario_roles
  for each row execute function privado.alta_administrador();

-- 3. POLÍTICAS RESTRICTIVAS DE ESCRITURA POR MÓDULO --------------------------
-- Se combinan (AND) con las permisivas existentes. Solo afectan al rol admin.
do $$
declare
  r record; v_cmd text;
  v_mapa text[][] := array[
    ['categorias','cursos'], ['cursos','cursos'], ['condiciones_curso','cursos'], ['plan_cuotas','cursos'],
    ['grupos','docentes'], ['horarios','docentes'], ['materiales_curso','docentes'],
    ['matriculas','estudiantes'], ['solicitudes_inscripcion','estudiantes'],
    ['pagos','pagos'], ['cuotas','pagos'], ['medios_cobro_institucion','pagos'],
    ['evaluaciones','evaluaciones'], ['calificaciones','evaluaciones'],
    ['plantillas_certificado','certificados'], ['firmantes_certificado','certificados'],
    ['certificacion_curso','certificados'], ['certificados','certificados'],
    ['politicas_institucion','institucion']];
  i int;
begin
  for i in 1 .. array_length(v_mapa, 1) loop
    if to_regclass('public.' || v_mapa[i][1]) is null
       or not exists (select 1 from information_schema.columns where table_schema = 'public'
                       and table_name = v_mapa[i][1] and column_name = 'institucion_id') then
      raise notice 'Se omite %: no existe o no tiene institucion_id', v_mapa[i][1];
      continue;
    end if;
    foreach v_cmd in array array['insert','update','delete'] loop
      execute format('drop policy if exists %I on public.%I', 'v5 permiso admin ' || v_cmd, v_mapa[i][1]);
      if v_cmd = 'insert' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (privado.mi_rol_activo() is distinct from %L or privado.admin_puede(institucion_id, %L))',
                       'v5 permiso admin ' || v_cmd, v_mapa[i][1], 'admin', v_mapa[i][2]);
      else
        execute format('create policy %I on public.%I as restrictive for %s to authenticated using (privado.mi_rol_activo() is distinct from %L or privado.admin_puede(institucion_id, %L))',
                       'v5 permiso admin ' || v_cmd, v_mapa[i][1], v_cmd, 'admin', v_mapa[i][2]);
      end if;
    end loop;
  end loop;
end $$;

-- Datos de la institución: módulo «institucion».
drop policy if exists "v5 permiso admin institucion" on public.instituciones;
create policy "v5 permiso admin institucion" on public.instituciones as restrictive for update to authenticated
  using (privado.mi_rol_activo() is distinct from 'admin' or privado.admin_puede(id, 'institucion'));

-- Roles: asignar o cambiar el rol ADMIN solo lo hace un principal; los demás
-- roles (docente) requieren el módulo «docentes». Nadie modifica su propio rol admin.
drop policy if exists "v5 permiso admin roles insert" on public.usuario_roles;
create policy "v5 permiso admin roles insert" on public.usuario_roles as restrictive for insert to authenticated
  with check (privado.mi_rol_activo() is distinct from 'admin'
              or (rol = 'admin' and privado.es_admin_principal(institucion_id))
              or (rol <> 'admin' and privado.admin_puede(institucion_id, 'docentes')));
drop policy if exists "v5 permiso admin roles update" on public.usuario_roles;
create policy "v5 permiso admin roles update" on public.usuario_roles as restrictive for update to authenticated
  using (privado.mi_rol_activo() is distinct from 'admin'
         or (rol = 'admin' and perfil_id <> auth.uid() and privado.es_admin_principal(institucion_id))
         or (rol <> 'admin' and privado.admin_puede(institucion_id, 'docentes')));
drop policy if exists "v5 permiso admin roles delete" on public.usuario_roles;
create policy "v5 permiso admin roles delete" on public.usuario_roles as restrictive for delete to authenticated
  using (privado.mi_rol_activo() is distinct from 'admin'
         or (rol = 'admin' and perfil_id <> auth.uid() and privado.es_admin_principal(institucion_id))
         or (rol <> 'admin' and privado.admin_puede(institucion_id, 'docentes')));

-- Perfiles: el admin edita datos de docentes/estudiantes con el módulo
-- correspondiente; cada persona sigue editando el suyo.
drop policy if exists "v5 permiso admin perfiles" on public.perfiles;
create policy "v5 permiso admin perfiles" on public.perfiles as restrictive for update to authenticated
  using (privado.mi_rol_activo() is distinct from 'admin' or id = auth.uid()
         or privado.admin_puede(institucion_id, 'docentes') or privado.admin_puede(institucion_id, 'estudiantes'));

-- 4. RPC DEL EQUIPO ------------------------------------------------------------
-- Solo un principal; nunca sobre sí mismo; los principales no reciben módulos.
create or replace function public.gestionar_administrador(p_perfil uuid, p_acceso_total boolean, p_modulos text[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_inst uuid := privado.mi_institucion(); v_a public.administradores_institucion%rowtype; v_mods text[];
begin
  if v_inst is null or not privado.es_admin_principal(v_inst) then
    raise exception 'Solo el administrador principal gestiona el equipo' using errcode = '42501';
  end if;
  if p_perfil = auth.uid() then raise exception 'No puedes cambiar tus propios permisos'; end if;
  select * into v_a from public.administradores_institucion where perfil_id = p_perfil and institucion_id = v_inst for update;
  if not found then raise exception 'La persona no es administradora de tu institución' using errcode = '42501'; end if;
  if v_a.principal then raise exception 'Un administrador principal ya tiene acceso completo'; end if;
  select coalesce(array_agg(distinct m order by m), '{}') into v_mods from unnest(coalesce(p_modulos, '{}')) m
   where m = any (array['cursos','docentes','estudiantes','pagos','evaluaciones','certificados','institucion']);
  if not coalesce(p_acceso_total, false) and cardinality(v_mods) = 0 then
    raise exception 'Elige al menos un módulo o el acceso completo';
  end if;
  update public.administradores_institucion
     set acceso_total = coalesce(p_acceso_total, false), modulos = case when p_acceso_total then '{}' else v_mods end,
         actualizado_en = now(), actualizado_por = auth.uid()
   where perfil_id = p_perfil and institucion_id = v_inst;
  if to_regprocedure('privado.notificar(uuid,text,uuid,text,text,text,text,text)') is not null then
    begin
      execute 'select privado.notificar($1, $2, $3, $4, $5, $6, $7, $8)'
        using p_perfil, 'admin', v_inst, 'acceso_actualizado', 'Se actualizaron tus permisos',
              case when p_acceso_total then 'Ahora tienes acceso completo al panel de la institución.' else 'Revisa los módulos a los que tienes acceso.' end,
              '/admin', 'acceso:' || p_perfil || ':' || to_char(now(), 'YYYYMMDDHH24MISS');
    exception when others then raise warning 'gestionar_administrador (aviso): %', sqlerrm;
    end;
  end if;
end $$;

-- Activar o desactivar el acceso institucional de otro administrador.
create or replace function public.cambiar_acceso_administrador(p_perfil uuid, p_activo boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inst uuid := privado.mi_institucion(); v_a public.administradores_institucion%rowtype;
begin
  if v_inst is null or not privado.es_admin_principal(v_inst) then
    raise exception 'Solo el administrador principal gestiona el equipo' using errcode = '42501';
  end if;
  if p_perfil = auth.uid() then raise exception 'No puedes cambiar tu propio acceso'; end if;
  perform 1 from public.instituciones where id = v_inst for update;
  select * into v_a from public.administradores_institucion where perfil_id = p_perfil and institucion_id = v_inst for update;
  if not found then raise exception 'La persona no es administradora de tu institución' using errcode = '42501'; end if;
  if not p_activo and v_a.principal and not exists (
       select 1 from public.administradores_institucion a
        where a.institucion_id = v_inst and a.principal and a.activo and a.perfil_id <> p_perfil) then
    raise exception 'La institución no puede quedarse sin un administrador principal activo';
  end if;
  update public.administradores_institucion set activo = p_activo, actualizado_en = now(), actualizado_por = auth.uid()
   where perfil_id = p_perfil and institucion_id = v_inst;
  -- El acceso al panel lo da el rol: se habilita o deshabilita (proteger_ultimo_admin_rol sigue activo).
  update public.usuario_roles set activo = p_activo where perfil_id = p_perfil and institucion_id = v_inst and rol = 'admin';
  if to_regprocedure('privado.notificar(uuid,text,uuid,text,text,text,text,text)') is not null and p_activo then
    begin
      execute 'select privado.notificar($1, $2, $3, $4, $5, $6, $7, $8)'
        using p_perfil, 'admin', v_inst, 'acceso_actualizado', 'Tu acceso administrativo está activo', null::text, '/admin',
              'acceso_activo:' || p_perfil || ':' || to_char(now(), 'YYYYMMDDHH24MISS');
    exception when others then raise warning 'cambiar_acceso_administrador (aviso): %', sqlerrm;
    end;
  end if;
end $$;

-- Nombrar o retirar a otro administrador como principal (nunca dejar la institución sin principal).
create or replace function public.nombrar_principal(p_perfil uuid, p_principal boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inst uuid := privado.mi_institucion();
begin
  if v_inst is null or not privado.es_admin_principal(v_inst) then
    raise exception 'Solo el administrador principal gestiona el equipo' using errcode = '42501';
  end if;
  if p_perfil = auth.uid() then raise exception 'No puedes cambiar tu propio nivel'; end if;
  perform 1 from public.instituciones where id = v_inst for update;
  if not exists (select 1 from public.administradores_institucion where perfil_id = p_perfil and institucion_id = v_inst and activo) then
    raise exception 'La persona no es una administradora activa de tu institución' using errcode = '42501';
  end if;
  update public.administradores_institucion
     set principal = p_principal, acceso_total = case when p_principal then true else acceso_total end,
         actualizado_en = now(), actualizado_por = auth.uid()
   where perfil_id = p_perfil and institucion_id = v_inst;
  if not exists (select 1 from public.administradores_institucion where institucion_id = v_inst and principal and activo) then
    raise exception 'La institución no puede quedarse sin un administrador principal activo';
  end if;
end $$;

-- 5. ENLACES DE CLASE GESTIONADOS POR EL DOCENTE (si la institución lo autoriza)
alter table public.instituciones add column if not exists docentes_gestionan_enlaces boolean not null default false;
grant update (docentes_gestionan_enlaces) on public.instituciones to authenticated;

-- Un horario concreto (p_horario) o todos los del grupo (p_horario null). p_enlace null = retirar.
create or replace function public.actualizar_enlace_clase(p_grupo uuid, p_horario uuid, p_enlace text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_g record; v_n integer; v_enlace text := nullif(trim(coalesce(p_enlace, '')), '');
begin
  select g.id, g.institucion_id, g.estado::text as estado into v_g from public.grupos g where g.id = p_grupo;
  if not found or not (
       privado.admin_puede(v_g.institucion_id, 'docentes')
       or (privado.es_docente_del_grupo(v_g.id) and v_g.institucion_id = privado.mi_institucion()
           and exists (select 1 from public.instituciones i where i.id = v_g.institucion_id and i.docentes_gestionan_enlaces))) then
    raise exception 'No tienes permiso para gestionar el enlace de este grupo' using errcode = '42501';
  end if;
  if v_g.estado in ('cerrado', 'cancelado') then raise exception 'El grupo está cerrado o cancelado'; end if;
  if v_enlace is not null and (v_enlace !~ '^https://[^\s]+$' or length(v_enlace) > 500) then
    raise exception 'El enlace debe empezar por https://';
  end if;
  update public.horarios set enlace_clase = v_enlace
   where grupo_id = p_grupo and institucion_id = v_g.institucion_id and (p_horario is null or id = p_horario);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 6. PERMISOS DE FUNCIONES ---------------------------------------------------------
revoke all on function privado.alta_administrador() from public, anon, authenticated;
revoke all on function privado.es_admin_principal(uuid) from public, anon;
grant execute on function privado.es_admin_principal(uuid) to authenticated;
revoke all on function privado.admin_puede(uuid, text) from public, anon;
grant execute on function privado.admin_puede(uuid, text) to authenticated;
revoke all on function public.gestionar_administrador(uuid, boolean, text[]) from public, anon;
grant execute on function public.gestionar_administrador(uuid, boolean, text[]) to authenticated;
revoke all on function public.cambiar_acceso_administrador(uuid, boolean) from public, anon;
grant execute on function public.cambiar_acceso_administrador(uuid, boolean) to authenticated;
revoke all on function public.nombrar_principal(uuid, boolean) from public, anon;
grant execute on function public.nombrar_principal(uuid, boolean) to authenticated;
revoke all on function public.actualizar_enlace_clase(uuid, uuid, text) from public, anon;
grant execute on function public.actualizar_enlace_clase(uuid, uuid, text) to authenticated;

-- 7. ASERCIONES ------------------------------------------------------------------
do $$
begin
  if has_table_privilege('authenticated', 'public.administradores_institucion', 'INSERT')
     or has_table_privilege('authenticated', 'public.administradores_institucion', 'UPDATE')
     or has_table_privilege('authenticated', 'public.administradores_institucion', 'DELETE') then
    raise exception 'El equipo solo debe cambiar mediante las RPC';
  end if;
  if exists (select 1 from public.usuario_roles ur where ur.rol = 'admin' and ur.institucion_id is not null
              and not exists (select 1 from public.administradores_institucion a
                               where a.perfil_id = ur.perfil_id and a.institucion_id = ur.institucion_id)) then
    raise exception 'Hay administradores sin fila en el equipo';
  end if;
  if exists (select 1 from public.instituciones i where exists (select 1 from public.usuario_roles ur where ur.institucion_id = i.id and ur.rol = 'admin' and ur.activo)
               and not exists (select 1 from public.administradores_institucion a where a.institucion_id = i.id and a.principal and a.activo)) then
    raise exception 'Hay instituciones con administradores activos y sin principal';
  end if;
end $$;

commit;

-- =====================================================================
-- VERIFICACIÓN POSTERIOR (solo lectura)
-- =====================================================================
-- select institucion_id, count(*) filter (where principal) principales, count(*) total
--   from public.administradores_institucion group by 1;
-- select tablename, policyname, permissive, cmd from pg_policies where policyname like 'v5 permiso admin%' order by 1, 2;
-- select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') anon from pg_proc p
--  where p.proname in ('gestionar_administrador','cambiar_acceso_administrador','nombrar_principal','actualizar_enlace_clase');
-- select column_name from information_schema.columns where table_name = 'instituciones' and column_name = 'docentes_gestionan_enlaces';

-- =====================================================================
-- REVERSIÓN (vuelve al acceso completo de todos los administradores)
-- =====================================================================
-- begin;
-- do $$ declare r record; begin
--   for r in select tablename, policyname from pg_policies where schemaname = 'public' and policyname like 'v5 permiso admin%' loop
--     execute format('drop policy %I on public.%I', r.policyname, r.tablename);
--   end loop; end $$;
-- drop trigger if exists alta_administrador_v5 on public.usuario_roles;
-- drop function if exists public.gestionar_administrador(uuid, boolean, text[]), public.cambiar_acceso_administrador(uuid, boolean),
--   public.nombrar_principal(uuid, boolean), public.actualizar_enlace_clase(uuid, uuid, text),
--   privado.alta_administrador(), privado.admin_puede(uuid, text), privado.es_admin_principal(uuid);
-- drop table if exists public.administradores_institucion;
-- revoke update (docentes_gestionan_enlaces) on public.instituciones from authenticated;
-- alter table public.instituciones drop column if exists docentes_gestionan_enlaces;
-- commit;
