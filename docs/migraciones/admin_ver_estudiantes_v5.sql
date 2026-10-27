-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA) — v2
-- El administrador identifica a los estudiantes con relación académica
-- con SU institución, mediante funciones con columnas explícitas.
--
-- PROBLEMA EN V5
--   "ver perfiles" solo deja al administrador ver perfiles con su mismo
--   institucion_id. Los estudiantes V5 son globales (institucion_id NULL):
--   el admin ve sus solicitudes y matrículas, pero no quién es.
--
-- POR QUÉ FUNCIONES Y NO AMPLIAR "ver perfiles" (propuesta v1, descartada)
--   - Ampliar la política expone TODAS las columnas de perfiles (dni,
--     telefono, rol_activo, institucion_id, activo) en cualquier consulta.
--   - Una función devuelve solo las columnas declaradas, se audita en un
--     único lugar y la tabla perfiles queda exactamente como en V5.
--
-- QUÉ VE CADA ADMINISTRADOR (solo con rol activo admin y perfil activo)
--   1. estudiantes_de_mi_institucion(): nombres y apellidos de quienes tienen
--      ALGUNA solicitud o matrícula (cualquier estado) en su institución.
--   2. contacto_estudiante(id): nombres, apellidos, documento, teléfono y
--      correo SOLO si esa persona tiene una relación VIGENTE con su
--      institución: solicitud pendiente/reservada o matrícula activa.
--      Con relación solo histórica (cancelada, rechazada, anulada...) no
--      devuelve nada.
--   Nunca: contraseñas, tokens, metadatos ni otros campos de Auth; perfiles
--   sin relación; datos de solicitudes o matrículas de otras instituciones.
--
-- POR QUÉ NO SE PUEDE ELUDIR CON PARÁMETROS
--   - La institución NO es un parámetro: sale de privado.mi_institucion(),
--     que la BD calcula desde auth.uid() (perfil activo).
--   - El rol sale de privado.mi_rol_activo() (rol activo y habilitado).
--   - En contacto_estudiante, un id ajeno o inventado no cumple el filtro de
--     relación vigente y devuelve 0 filas (sin error: no revela si existe).
--   - SECURITY DEFINER con search_path = '' y nombres calificados.
--   - EXECUTE solo para authenticated (revocado a public y anon).
--
-- CÓMO APLICAR: revisar y ejecutar en Supabase > SQL Editor. Idempotente.
-- No modifica tablas ni políticas RLS existentes.
-- =====================================================================

begin;

-- 1. Listado mínimo: identificación de estudiantes relacionados.
create or replace function public.estudiantes_de_mi_institucion()
returns table (estudiante_id uuid, nombres text, apellidos text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.nombres, p.apellidos
  from public.perfiles p
  where coalesce(privado.mi_rol_activo() = 'admin', false)
    and privado.mi_institucion() is not null
    and p.id in (
      select m.estudiante_id from public.matriculas m
      where m.institucion_id = privado.mi_institucion()
      union
      select s.estudiante_id from public.solicitudes_inscripcion s
      where s.institucion_id = privado.mi_institucion()
    )
$$;

-- 2. Contacto controlado: solo con relación VIGENTE (para gestionar la solicitud/matrícula).
create or replace function public.contacto_estudiante(p_estudiante uuid)
returns table (
  estudiante_id uuid, nombres text, apellidos text,
  dni text, telefono text, correo text
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.nombres, p.apellidos, p.dni, p.telefono, u.email::text
  from public.perfiles p
  join auth.users u on u.id = p.id
  where p.id = p_estudiante
    and coalesce(privado.mi_rol_activo() = 'admin', false)
    and privado.mi_institucion() is not null
    and (
      exists (select 1 from public.solicitudes_inscripcion s
              where s.estudiante_id = p.id
                and s.institucion_id = privado.mi_institucion()
                and s.estado in ('pendiente', 'reservada'))
      or exists (select 1 from public.matriculas m
                 where m.estudiante_id = p.id
                   and m.institucion_id = privado.mi_institucion()
                   and m.estado = 'activa')
    )
$$;

revoke all on function public.estudiantes_de_mi_institucion() from public, anon;
revoke all on function public.contacto_estudiante(uuid) from public, anon;
grant execute on function public.estudiantes_de_mi_institucion() to authenticated;
grant execute on function public.contacto_estudiante(uuid) to authenticated;

commit;

-- =====================================================================
-- COMPROBACIONES (solo lectura)
-- =====================================================================
-- a) Las funciones existen, son SECURITY DEFINER y tienen search_path fijo:
--   select proname, prosecdef, proconfig
--   from pg_proc where proname in ('estudiantes_de_mi_institucion', 'contacto_estudiante');
--   -> prosecdef = true, proconfig = {search_path=""}
--
-- b) Permisos (true, true, false, false):
--   select has_function_privilege('authenticated', 'public.estudiantes_de_mi_institucion()', 'execute'),
--          has_function_privilege('authenticated', 'public.contacto_estudiante(uuid)', 'execute'),
--          has_function_privilege('anon', 'public.estudiantes_de_mi_institucion()', 'execute'),
--          has_function_privilege('anon', 'public.contacto_estudiante(uuid)', 'execute');
--
-- c) Las políticas de perfiles NO cambian (sigue siendo la de V5):
--   select policyname, qual from pg_policies
--   where schemaname = 'public' and tablename = 'perfiles';
--
-- d) Prueba funcional desde la app (con sesión de admin):
--   supabase.rpc('estudiantes_de_mi_institucion')         -> solo tus estudiantes
--   supabase.rpc('contacto_estudiante', { p_estudiante })  -> 1 fila o ninguna
--   Con un id de otra institución o con rol activo distinto de admin -> 0 filas.
--   (En el SQL Editor auth.uid() es NULL, así que ahí ambas devuelven 0 filas.)
--
-- e) Prueba EN EL SQL EDITOR haciéndose pasar por un usuario (no deja cambios).
--    <ADMIN_ID>: id (auth.users) de un administrador con rol activo admin.
--    <ESTUDIANTE_ID>: un estudiante con solicitud o matrícula en esa institución.
--    <AJENO_ID>: un estudiante SIN relación con esa institución.
--
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<ADMIN_ID>', 'role', 'authenticated')::text, true);
--   select auth.uid(), privado.mi_rol_activo(), privado.mi_institucion();  -- comprueba la identidad simulada
--   select * from public.estudiantes_de_mi_institucion();                -- solo estudiantes de esa institución
--   select * from public.contacto_estudiante('<ESTUDIANTE_ID>');         -- 1 fila si la relación es vigente
--   select * from public.contacto_estudiante('<AJENO_ID>');              -- 0 filas
--   select count(*) from public.perfiles where id = '<ESTUDIANTE_ID>';   -- 0: la RLS de perfiles sigue igual
--   rollback;
--
--   Visitante anónimo (debe fallar con "permission denied for function"):
--   begin;
--   set local role anon;
--   select * from public.estudiantes_de_mi_institucion();
--   rollback;
--
-- =====================================================================
-- PARA REVERTIR
-- =====================================================================
--   begin;
--   drop function if exists public.contacto_estudiante(uuid);
--   drop function if exists public.estudiantes_de_mi_institucion();
--   commit;
