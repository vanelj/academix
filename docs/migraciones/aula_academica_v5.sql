-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA) — Aula académica V5
-- ---------------------------------------------------------------------
-- POR QUÉ ES NECESARIA
--   1. Publicación progresiva de notas. Hoy el estudiante ve cada nota en
--      cuanto el docente la guarda (RLS «ver calificaciones»). Se distingue
--      GUARDAR (borrador, privado) de PUBLICAR (visible al estudiante) por
--      evaluación, sin tocar las notas existentes.
--   2. Materiales del curso. No existe infraestructura: tabla + bucket
--      PRIVADO con acceso solo para el docente del grupo, el administrador
--      de la institución y los estudiantes con matrícula activa.
--   3. Clases presenciales: horarios no tiene dónde indicar el aula o sede.
--      Se añade una columna opcional (ubicacion). La modalidad por sesión se
--      deduce de lo registrado (enlace = virtual, ubicación = presencial);
--      no se añaden columnas redundantes ni se cambia cursos.modalidad.
--   4. El aula del estudiante necesita modalidad, nota aprobatoria y portada
--      de cursos de CUALQUIER institución, que RLS de cursos no le deja leer:
--      RPC de solo lectura mis_cursos_detalle() (mismo patrón que mis_cursos()).
--
-- ENTIDADES AFECTADAS
--   evaluaciones (+ publicada_en, publicada_por), calificaciones (política de
--   lectura del estudiante), horarios (+ ubicacion), NUEVAS: materiales_curso,
--   bucket «materiales-curso» y sus políticas; funciones nuevas.
--
-- COMPATIBILIDAD CON LOS DATOS EXISTENTES
--   - No modifica ni borra calificaciones, evaluaciones ni horarios.
--   - Las evaluaciones existentes quedan SIN publicar: sus notas dejan de verse
--     para el estudiante hasta que el docente o el administrador las publique.
--     (Bloque OPCIONAL 7 al final, comentado, para conservar visibles las que ya
--     tienen notas. Decide antes de aplicar.)
--   - Administrador y docente siguen viendo todo lo de su institución/grupo.
--   - El cálculo del resultado final (registrar_resultado_final) no cambia.
--
-- ORDEN: después de evaluaciones_admin_v5, certificados_v5, portadas_cursos_v5
-- y mis_cursos_v5 (aplicadas). Independiente de notificaciones_v5: si existe,
-- la publicación genera UN aviso por estudiante y evaluación.
-- Diagnóstico previo: docs/diagnostico/verificacion_previa_aula_academica_v5.sql
-- =====================================================================
begin;

-- 0. REQUISITOS (aborta sin cambios si falta algo) ---------------------
do $$
declare v_qual text;
begin
  if to_regclass('public.evaluaciones') is null or to_regclass('public.calificaciones') is null
     or to_regclass('public.horarios') is null or to_regclass('public.grupos') is null
     or to_regclass('public.matriculas') is null or to_regclass('public.cursos') is null then
    raise exception 'Faltan tablas de V5';
  end if;
  if to_regprocedure('privado.mi_rol_activo()') is null or to_regprocedure('privado.mi_institucion()') is null
     or to_regprocedure('privado.es_docente_del_grupo(uuid)') is null or to_regprocedure('privado.estoy_matriculado_en(uuid)') is null
     or to_regprocedure('privado.es_mi_matricula(uuid)') is null or to_regprocedure('privado.admin_de_institucion(uuid)') is null then
    raise exception 'Faltan funciones privadas de V5';
  end if;
  if to_regprocedure('public.registrar_resultado_final(uuid)') is null then
    raise exception 'Aplica antes evaluaciones_admin_v5';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cursos' and column_name = 'portada_url') then
    raise exception 'Aplica antes portadas_cursos_v5 (falta cursos.portada_url)';
  end if;
  select lower(qual) into v_qual from pg_policies
   where schemaname = 'public' and tablename = 'calificaciones' and policyname = 'ver calificaciones';
  if v_qual is null or v_qual not like '%es_mi_matricula%' or v_qual not like '%es_docente_del_grupo%' then
    raise exception 'La política «ver calificaciones» no es la esperada de V5: %', v_qual;
  end if;
  if exists (select 1 from storage.buckets where id = 'materiales-curso' and public) then
    raise exception 'Ya existe un bucket materiales-curso PÚBLICO: revísalo antes de aplicar';
  end if;
end $$;

-- 1. PUBLICACIÓN DE EVALUACIONES ------------------------------------------
alter table public.evaluaciones add column if not exists publicada_en timestamptz;
alter table public.evaluaciones add column if not exists publicada_por uuid references auth.users(id) on delete set null;
-- Sin GRANT UPDATE sobre estas columnas: solo cambian con publicar_evaluacion().

-- Una evaluación nueva nace sin publicar (aunque el INSERT traiga otra cosa).
create or replace function privado.evaluacion_nace_sin_publicar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.publicada_en := null;
  new.publicada_por := null;
  return new;
end $$;
drop trigger if exists evaluacion_nace_sin_publicar_v5 on public.evaluaciones;
create trigger evaluacion_nace_sin_publicar_v5
  before insert on public.evaluaciones
  for each row execute function privado.evaluacion_nace_sin_publicar();

create or replace function privado.evaluacion_publicada(p_evaluacion uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.evaluaciones e where e.id = p_evaluacion and e.publicada_en is not null)
$$;

-- El estudiante solo lee notas de evaluaciones PUBLICADAS. El resto de la
-- política es idéntico a V5 (admin y docente de su institución).
drop policy if exists "ver calificaciones" on public.calificaciones;
create policy "ver calificaciones" on public.calificaciones for select to authenticated
using (
  (privado.mi_rol_activo() = 'estudiante' and privado.es_mi_matricula(matricula_id)
     and privado.evaluacion_publicada(evaluacion_id))
  or (institucion_id = privado.mi_institucion() and
      (privado.mi_rol_activo() = 'admin' or privado.es_docente_del_grupo(grupo_id)))
);

-- Publicar (p_publicar = true) o retirar la publicación (false).
-- Pueden: el docente del grupo (rol activo) o el administrador de la institución.
create or replace function public.publicar_evaluacion(p_evaluacion uuid, p_publicar boolean default true)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_e public.evaluaciones%rowtype; v_estado text; v_curso text; v_notas int; v_ahora timestamptz := now();
  r record; v_listo boolean;
begin
  select * into v_e from public.evaluaciones where id = p_evaluacion;
  if not found or not (
       (privado.es_docente_del_grupo(v_e.grupo_id) and v_e.institucion_id = privado.mi_institucion())
       or privado.admin_de_institucion(v_e.institucion_id)) then
    raise exception 'Evaluación inaccesible' using errcode = '42501';
  end if;
  -- Bloqueo: grupo → evaluación (mismo orden que validar_evaluacion).
  select g.estado::text into v_estado from public.grupos g where g.id = v_e.grupo_id for update;
  select * into v_e from public.evaluaciones where id = p_evaluacion for update;
  if v_estado = 'cancelado' then raise exception 'El grupo está cancelado'; end if;

  if p_publicar then
    if v_e.publicada_en is not null then return v_e.publicada_en; end if;
    select count(*) into v_notas from public.calificaciones c where c.evaluacion_id = v_e.id;
    if v_notas = 0 then raise exception 'La evaluación aún no tiene notas registradas'; end if;
    update public.evaluaciones set publicada_en = v_ahora, publicada_por = auth.uid() where id = v_e.id;

    -- Avisos (solo si notificaciones_v5 está aplicada). Nunca bloquean.
    if to_regprocedure('privado.notificar(uuid,text,uuid,text,text,text,text,text)') is not null then
      begin
        select c.nombre || ' · ' || g.codigo into v_curso from public.grupos g join public.cursos c on c.id = g.curso_id where g.id = v_e.grupo_id;
        for r in
          select m.id, m.estudiante_id, m.institucion_id from public.matriculas m
           where m.grupo_id = v_e.grupo_id and m.estado::text = 'activa'
             and exists (select 1 from public.calificaciones c where c.matricula_id = m.id and c.evaluacion_id = v_e.id)
        loop
          execute 'select privado.notificar($1, $2, $3, $4, $5, $6, $7, $8)'
            using r.estudiante_id, 'estudiante', r.institucion_id, 'nota_publicada', 'Se publicó una nota',
                  coalesce(v_curso, 'Tu curso') || ': «' || v_e.nombre || '».',
                  '/estudiante/cursos/' || r.id || '?seccion=notas', 'nota_publicada:' || v_e.id || ':' || r.id;
        end loop;
        -- ¿Grupo listo para cerrar resultados? (pesos = 100, todo publicado y sin notas faltantes)
        select coalesce(sum(e.peso), 0) = 100 and bool_and(e.publicada_en is not null)
          into v_listo from public.evaluaciones e where e.grupo_id = v_e.grupo_id;
        if v_listo and not exists (
             select 1 from public.matriculas m cross join public.evaluaciones e
              where m.grupo_id = v_e.grupo_id and e.grupo_id = v_e.grupo_id and m.estado::text = 'activa'
                and m.estado_final::text = 'en_curso'
                and not exists (select 1 from public.calificaciones c where c.matricula_id = m.id and c.evaluacion_id = e.id))
           and to_regprocedure('privado.notificar_admins(uuid,text,text,text,text,text)') is not null then
          execute 'select privado.notificar_admins($1, $2, $3, $4, $5, $6)'
            using v_e.institucion_id, 'resultados_listos', 'Resultados listos para revisar',
                  coalesce(v_curso, 'Un grupo') || ': todas las notas están publicadas.',
                  '/admin/evaluaciones/' || v_e.grupo_id, 'resultados_listos:' || v_e.grupo_id;
        end if;
      exception when others then
        raise warning 'publicar_evaluacion (aviso): %', sqlerrm;
      end;
    end if;
    return v_ahora;
  end if;

  -- Retirar la publicación: no con resultados finales ya registrados.
  if exists (select 1 from public.matriculas m where m.grupo_id = v_e.grupo_id
             and m.estado::text = 'activa' and m.estado_final::text <> 'en_curso') then
    raise exception 'Hay resultados finales registrados en el grupo: no se puede retirar la publicación';
  end if;
  update public.evaluaciones set publicada_en = null, publicada_por = null where id = v_e.id;
  return null;
end
$$;

-- 2. DETALLE DE «MIS CURSOS» (solo lectura, solo matrículas propias) ------
create or replace function public.mis_cursos_detalle()
returns table (matricula_id uuid, modalidad text, nota_aprobatoria numeric, portada_url text, descripcion text)
language sql stable security definer set search_path = ''
as $$
  select m.id, c.modalidad::text, c.nota_aprobatoria, c.portada_url, c.descripcion
  from public.matriculas m
  join public.grupos g on g.id = m.grupo_id
  join public.cursos c on c.id = g.curso_id
  where auth.uid() is not null
    and m.estudiante_id = auth.uid()
    and privado.mi_rol_activo() = 'estudiante'
$$;

-- 3. UBICACIÓN DE CLASES PRESENCIALES -------------------------------------
alter table public.horarios add column if not exists ubicacion text;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.horarios'::regclass and conname = 'horarios_ubicacion_check') then
    alter table public.horarios add constraint horarios_ubicacion_check
      check (ubicacion is null or length(trim(ubicacion)) between 1 and 200);
  end if;
end $$;
-- La lee quien ya lee horarios (RLS «ver horarios»); la escribe el admin
-- (política «admin gestiona horarios»). La oferta pública no la expone.

-- 4. MATERIALES DEL CURSO --------------------------------------------------
create table if not exists public.materiales_curso (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null,
  grupo_id        uuid not null,
  titulo          text not null check (length(trim(titulo)) between 1 and 160),
  descripcion     text check (descripcion is null or length(descripcion) <= 1000),
  tema            text check (tema is null or length(trim(tema)) between 1 and 80),
  tipo            text not null check (tipo in ('archivo', 'enlace')),
  enlace          text check (enlace is null or (enlace ~ '^https://[^\s]+$' and length(enlace) <= 1000)),
  archivo_path    text check (archivo_path is null or length(archivo_path) <= 500),
  archivo_nombre  text check (archivo_nombre is null or length(archivo_nombre) <= 200),
  archivo_tipo    text check (archivo_tipo is null or length(archivo_tipo) <= 120),
  archivo_bytes   integer check (archivo_bytes is null or archivo_bytes between 1 and 20971520),
  creado_por      uuid default auth.uid() references auth.users(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  check ((tipo = 'archivo' and archivo_path is not null and enlace is null)
      or (tipo = 'enlace' and enlace is not null and archivo_path is null)),
  -- El archivo vive en la carpeta <institución>/<grupo>/ del bucket privado.
  check (archivo_path is null or archivo_path like institucion_id::text || '/' || grupo_id::text || '/%'),
  foreign key (grupo_id, institucion_id) references public.grupos(id, institucion_id) on delete cascade
);
create index if not exists materiales_curso_grupo_idx on public.materiales_curso (grupo_id, tema, creado_en);

create or replace function privado.gestiona_materiales_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.grupos g
     where g.id = p_grupo and g.estado::text <> 'cancelado'
       and (privado.admin_de_institucion(g.institucion_id)
            or (privado.es_docente_del_grupo(g.id) and g.institucion_id = privado.mi_institucion())))
$$;

create or replace function privado.ve_materiales_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.estoy_matriculado_en(p_grupo)
      or exists (select 1 from public.grupos g where g.id = p_grupo
                  and (privado.admin_de_institucion(g.institucion_id)
                       or (privado.es_docente_del_grupo(g.id) and g.institucion_id = privado.mi_institucion())))
$$;

-- Grupo de una ruta «<institución>/<grupo>/<archivo>» si ambas partes coinciden; si no, null.
create or replace function privado.grupo_de_ruta_material(p_nombre text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_partes text[] := string_to_array(p_nombre, '/'); v_grupo uuid;
begin
  if array_length(v_partes, 1) <> 3
     or v_partes[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_partes[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or length(v_partes[3]) = 0 then
    return null;
  end if;
  select g.id into v_grupo from public.grupos g
   where g.id = v_partes[2]::uuid and g.institucion_id = v_partes[1]::uuid;
  return v_grupo;
end $$;

create or replace function privado.material_actualizado()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end $$;
drop trigger if exists material_actualizado_v5 on public.materiales_curso;
create trigger material_actualizado_v5 before update on public.materiales_curso
  for each row execute function privado.material_actualizado();

alter table public.materiales_curso enable row level security;
revoke all on table public.materiales_curso from public, anon, authenticated;
grant select, insert, delete on table public.materiales_curso to authenticated;
grant update (titulo, descripcion, tema, enlace) on table public.materiales_curso to authenticated;

drop policy if exists "v5 ver materiales" on public.materiales_curso;
create policy "v5 ver materiales" on public.materiales_curso for select to authenticated
  using (privado.ve_materiales_grupo(grupo_id));

drop policy if exists "v5 crear materiales" on public.materiales_curso;
create policy "v5 crear materiales" on public.materiales_curso for insert to authenticated
  with check (privado.gestiona_materiales_grupo(grupo_id) and creado_por = auth.uid());

-- El docente edita y retira SUS materiales; el administrador, los de su institución.
drop policy if exists "v5 editar materiales" on public.materiales_curso;
create policy "v5 editar materiales" on public.materiales_curso for update to authenticated
  using (privado.gestiona_materiales_grupo(grupo_id) and (creado_por = auth.uid() or privado.admin_de_institucion(institucion_id)))
  with check (privado.gestiona_materiales_grupo(grupo_id) and (creado_por = auth.uid() or privado.admin_de_institucion(institucion_id)));

drop policy if exists "v5 retirar materiales" on public.materiales_curso;
create policy "v5 retirar materiales" on public.materiales_curso for delete to authenticated
  using (privado.gestiona_materiales_grupo(grupo_id) and (creado_por = auth.uid() or privado.admin_de_institucion(institucion_id)));

-- Bucket PRIVADO: los archivos se abren con URL firmada de corta duración.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materiales-curso', 'materiales-curso', false, 20971520, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "v5 materiales: subir" on storage.objects;
create policy "v5 materiales: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'materiales-curso' and privado.gestiona_materiales_grupo(privado.grupo_de_ruta_material(name)));

drop policy if exists "v5 materiales: leer" on storage.objects;
create policy "v5 materiales: leer" on storage.objects for select to authenticated
  using (bucket_id = 'materiales-curso' and privado.ve_materiales_grupo(privado.grupo_de_ruta_material(name)));

drop policy if exists "v5 materiales: borrar" on storage.objects;
create policy "v5 materiales: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'materiales-curso' and privado.gestiona_materiales_grupo(privado.grupo_de_ruta_material(name)));
-- Sin política UPDATE: un archivo no se sobrescribe (se sube otro y se retira el anterior).

-- 5. PERMISOS DE FUNCIONES -------------------------------------------------
revoke all on function privado.evaluacion_nace_sin_publicar() from public, anon, authenticated;
revoke all on function privado.material_actualizado() from public, anon, authenticated;
revoke all on function privado.evaluacion_publicada(uuid) from public, anon;
grant execute on function privado.evaluacion_publicada(uuid) to authenticated;
revoke all on function privado.gestiona_materiales_grupo(uuid) from public, anon;
grant execute on function privado.gestiona_materiales_grupo(uuid) to authenticated;
revoke all on function privado.ve_materiales_grupo(uuid) from public, anon;
grant execute on function privado.ve_materiales_grupo(uuid) to authenticated;
revoke all on function privado.grupo_de_ruta_material(text) from public, anon;
grant execute on function privado.grupo_de_ruta_material(text) to authenticated;
revoke all on function public.publicar_evaluacion(uuid, boolean) from public, anon;
grant execute on function public.publicar_evaluacion(uuid, boolean) to authenticated;
revoke all on function public.mis_cursos_detalle() from public, anon;
grant execute on function public.mis_cursos_detalle() to authenticated;

-- 6. ASERCIONES -------------------------------------------------------------
do $$
begin
  if has_column_privilege('authenticated', 'public.evaluaciones', 'publicada_en', 'UPDATE') then
    raise exception 'publicada_en no debe poder actualizarse directamente';
  end if;
  if has_function_privilege('anon', 'public.publicar_evaluacion(uuid, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.mis_cursos_detalle()', 'EXECUTE') then
    raise exception 'anon no debe ejecutar las funciones del aula';
  end if;
  if has_table_privilege('anon', 'public.materiales_curso', 'SELECT') then
    raise exception 'anon no debe leer materiales';
  end if;
  if exists (select 1 from storage.buckets where id = 'materiales-curso' and public) then
    raise exception 'El bucket materiales-curso debe ser privado';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'calificaciones' and policyname = 'ver calificaciones'
                 and lower(qual) like '%evaluacion_publicada%') then
    raise exception 'La política de lectura de notas no quedó actualizada';
  end if;
end $$;

commit;

-- =====================================================================
-- 7. OPCIONAL (decide ANTES de aplicar; va en su propia transacción)
-- Conserva visibles para el estudiante las notas que hoy ya ve: marca como
-- publicadas SOLO las evaluaciones que ya tienen notas. No toca notas.
-- =====================================================================
-- update public.evaluaciones e set publicada_en = now()
--  where e.publicada_en is null
--    and exists (select 1 from public.calificaciones c where c.evaluacion_id = e.id);

-- =====================================================================
-- VERIFICACIÓN POSTERIOR (solo lectura)
-- =====================================================================
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'evaluaciones' and column_name like 'publicada%';
-- select policyname, qual from pg_policies where tablename = 'calificaciones';
-- select policyname, cmd from pg_policies where tablename = 'materiales_curso' order by 1;
-- select id, public, file_size_limit from storage.buckets where id = 'materiales-curso';   -- public = false
-- select policyname, cmd from pg_policies where schemaname = 'storage' and policyname like 'v5 materiales%';
-- select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') anon
--   from pg_proc p where p.proname in ('publicar_evaluacion', 'mis_cursos_detalle');
-- select count(*) filter (where publicada_en is null) sin_publicar, count(*) total from public.evaluaciones;

-- =====================================================================
-- REVERSIÓN (deja la lectura de notas como en V5)
-- =====================================================================
-- begin;
-- drop policy if exists "ver calificaciones" on public.calificaciones;
-- create policy "ver calificaciones" on public.calificaciones for select to authenticated
-- using ((privado.mi_rol_activo()='estudiante' and privado.es_mi_matricula(matricula_id))
--   or (institucion_id=privado.mi_institucion() and (privado.mi_rol_activo()='admin' or privado.es_docente_del_grupo(grupo_id))));
-- drop function if exists public.publicar_evaluacion(uuid, boolean), public.mis_cursos_detalle();
-- drop trigger if exists evaluacion_nace_sin_publicar_v5 on public.evaluaciones;
-- drop function if exists privado.evaluacion_nace_sin_publicar(), privado.evaluacion_publicada(uuid);
-- drop policy if exists "v5 materiales: subir" on storage.objects;
-- drop policy if exists "v5 materiales: leer" on storage.objects;
-- drop policy if exists "v5 materiales: borrar" on storage.objects;
-- drop table if exists public.materiales_curso;   -- borra el registro de materiales (los archivos quedan en el bucket)
-- drop function if exists privado.gestiona_materiales_grupo(uuid), privado.ve_materiales_grupo(uuid),
--   privado.grupo_de_ruta_material(text), privado.material_actualizado();
-- alter table public.evaluaciones drop column if exists publicada_en, drop column if exists publicada_por;
-- alter table public.horarios drop constraint if exists horarios_ubicacion_check, drop column if exists ubicacion;
-- commit;
