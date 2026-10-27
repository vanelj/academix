-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA) — Medios de cobro y estado de cuenta
-- Versión revisada 2 (ver "CAMBIOS" al final del encabezado).
--
-- POR QUÉ ES NECESARIA
--   1. V5 no tiene dónde guardar los medios de cobro de cada institución:
--      solo existe politicas_institucion.texto_pagos (texto libre). Para que
--      el estudiante vea, al pagar, el Yape/Plin o la cuenta EXACTA de la
--      institución que recibe el dinero, hace falta una tabla estructurada.
--   2. Un estudiante "global" (perfil de otra institución) NO puede leer
--      grupos, cursos ni instituciones de la institución donde se matriculó:
--      RLS de esas tablas usa mi_institucion(). Las vistas públicas oferta_*
--      solo muestran grupos 'programado' o 'abierto'. Cuando el grupo pasa a
--      'en_curso', sus cuotas quedan sin nombre de curso ni institución.
--      mis_cuotas() devuelve SOLO las cuotas propias (auth.uid()) con esos
--      nombres. Es de solo lectura; los importes y estados se siguen leyendo
--      con la RLS existente de cuotas y pagos.
--
-- QUÉ NO HACE
--   - No modifica tablas, funciones, políticas ni disparadores existentes.
--   - No guarda contraseñas, claves, tokens ni credenciales bancarias: solo
--     los datos que la institución publica para recibir pagos (titular,
--     celular, banco, número de cuenta, CCI e instrucciones).
--   - No crea una cuenta global de Academix: cada fila pertenece a una institución.
--   - No cambia pagos: pagos.metodo sigue guardando el texto del método elegido.
--
-- PERMISOS
--   - Administrador activo de la institución: lee, crea, edita y elimina sus
--     medios (privado.admin_de_institucion). WITH CHECK impide crear una fila
--     o mover una existente a otra institución.
--   - Estudiante: solo VE los medios ACTIVOS de una institución con la que
--     tiene una obligación abierta (solicitud pendiente/reservada o cuota
--     pendiente/parcial de una matrícula activa). No puede escribir.
--   - anon: sin acceso a la tabla ni a las funciones.
--
-- FUNCIONES SECURITY DEFINER (revisión de autorización)
--   privado.estudiante_debe_a(uuid) → boolean
--     - Solo responde por la sesión actual (auth.uid()) y exige rol activo
--       'estudiante'; con otro rol o sin sesión devuelve false.
--     - No devuelve datos, solo un booleano sobre la propia cuenta. Se usa
--       dentro de la política RLS, por eso necesita EXECUTE para authenticated.
--     - search_path = '' y nombres calificados: sin secuestro de esquema.
--     - El esquema privado no está expuesto por la API (PostgREST).
--   public.mis_cuotas() → setof filas
--     - Filtra SIEMPRE por m.estudiante_id = auth.uid() y rol 'estudiante':
--       no recibe parámetros, no se puede pedir la cuota de otra persona.
--     - Con rol admin/docente o sin sesión devuelve 0 filas.
--     - EXECUTE solo para authenticated (revocado a public y anon).
--     - search_path = '' y nombres calificados.
--   Ambas deben quedar con dueño postgres (lo normal al ejecutar en el SQL
--   Editor). La verificación final lo muestra.
--
-- CAMBIOS RESPECTO A LA VERSIÓN ANTERIOR
--   a) mis_cuotas(): conversiones explícitas (::uuid, ::text, ::integer,
--      ::numeric, ::date, ::boolean) en TODAS las columnas. Una función SQL
--      con RETURNS TABLE falla si el tipo real de una columna difiere (p. ej.
--      varchar, enum o integer en lugar de text); con las conversiones el
--      resultado coincide aunque el tipo real sea otro compatible.
--   b) Bloque 0 de requisitos: aborta (sin cambiar nada) si falta el esquema
--      privado, alguna función usada o alguna columna esperada.
--   c) Verificación: pg_policies usa policyname y cmd (antes decía polname).
--      Se añaden comprobaciones de dueño, SECURITY DEFINER, search_path y
--      privilegios de las funciones.
--   d) Paso previo de solo lectura (sección P) para confirmar los tipos reales.
--
-- CÓMO APLICAR
--   1. Ejecutar la sección P (solo lectura) y revisar los tipos.
--   2. Ejecutar desde "begin;" hasta "commit;" en Supabase > SQL Editor.
--      Idempotente. Si el bloque 0 falla, no se aplica nada.
--   3. Ejecutar la VERIFICACIÓN y luego
--      docs/diagnostico/pruebas_medios_cobro_v5.sql (con ROLLBACK).
--   Reversión al final del archivo.
-- =====================================================================

-- =====================================================================
-- P. PASO PREVIO (SOLO LECTURA): tipos reales de las columnas usadas
-- =====================================================================
-- select table_name, column_name, data_type, udt_name
-- from information_schema.columns
-- where table_schema = 'public' and (table_name, column_name) in (
--   ('instituciones','id'), ('instituciones','nombre'), ('cursos','nombre'), ('grupos','codigo'),
--   ('grupos','curso_id'), ('matriculas','estudiante_id'), ('matriculas','estado'), ('matriculas','grupo_id'),
--   ('cuotas','id'), ('cuotas','matricula_id'), ('cuotas','institucion_id'), ('cuotas','numero'),
--   ('cuotas','concepto'), ('cuotas','importe'), ('cuotas','vencimiento'), ('cuotas','estado'),
--   ('pagos','cuota_id'), ('pagos','monto'), ('pagos','estado'),
--   ('solicitudes_inscripcion','institucion_id'), ('solicitudes_inscripcion','estudiante_id'),
--   ('solicitudes_inscripcion','estado'))
-- order by table_name, column_name;
-- Esperado según V5: nombre/codigo/concepto/estado(cuotas, solicitudes) = text;
-- matriculas.estado y pagos.estado = USER-DEFINED (enum); numero = integer;
-- importe/monto = numeric; vencimiento = date. Cualquier otro tipo compatible
-- también funciona gracias a las conversiones explícitas de mis_cuotas().

begin;

-- 0. REQUISITOS: si falta algo, se aborta y no se cambia nada ------------
do $$
declare v_falta text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'privado') then
    raise exception 'Requisito: falta el esquema privado';
  end if;
  select string_agg(f, ', ') into v_falta
  from unnest(array['privado.admin_de_institucion(uuid)', 'privado.mi_rol_activo()']) as f
  where to_regprocedure(f) is null;
  if v_falta is not null then raise exception 'Requisito: faltan funciones %', v_falta; end if;

  select string_agg(t || '.' || c, ', ') into v_falta
  from (values ('instituciones','nombre'), ('cursos','nombre'), ('grupos','codigo'), ('grupos','curso_id'),
               ('matriculas','estudiante_id'), ('matriculas','estado'), ('matriculas','grupo_id'),
               ('cuotas','matricula_id'), ('cuotas','institucion_id'), ('cuotas','numero'), ('cuotas','concepto'),
               ('cuotas','importe'), ('cuotas','vencimiento'), ('cuotas','estado'),
               ('pagos','cuota_id'), ('pagos','monto'), ('pagos','estado'),
               ('solicitudes_inscripcion','institucion_id'), ('solicitudes_inscripcion','estudiante_id'),
               ('solicitudes_inscripcion','estado')) as e(t, c)
  where not exists (select 1 from information_schema.columns ic
                    where ic.table_schema = 'public' and ic.table_name = e.t and ic.column_name = e.c);
  if v_falta is not null then raise exception 'Requisito: faltan columnas %', v_falta; end if;
end $$;

-- 1. MEDIOS DE COBRO -------------------------------------------------
create table if not exists public.medios_cobro_institucion (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones(id),
  tipo            text not null check (tipo in ('yape','plin','transferencia','deposito')),
  titular         text not null check (length(trim(titular)) between 2 and 150),
  celular         text check (celular is null or celular ~ '^9[0-9]{8}$'),
  banco           text check (banco is null or length(trim(banco)) between 2 and 100),
  numero_cuenta   text check (numero_cuenta is null or numero_cuenta ~ '^[0-9][0-9-]{4,28}[0-9]$'),
  cci             text check (cci is null or cci ~ '^[0-9]{20}$'),
  instrucciones   text check (instrucciones is null or length(instrucciones) <= 1000),
  activo          boolean not null default true,
  orden           integer not null default 0,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  check (tipo not in ('yape','plin') or celular is not null),
  check (tipo not in ('transferencia','deposito') or (banco is not null and numero_cuenta is not null))
);
create index if not exists medios_cobro_institucion_idx
  on public.medios_cobro_institucion (institucion_id, activo, orden);

-- ¿El estudiante de la sesión tiene una obligación abierta con la institución?
-- Solo responde por auth.uid(); con otro rol o sin sesión devuelve false.
create or replace function privado.estudiante_debe_a(p_institucion uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.uid() is not null and privado.mi_rol_activo() = 'estudiante' and (
    exists (select 1 from public.solicitudes_inscripcion s
            where s.institucion_id = p_institucion and s.estudiante_id = auth.uid()
              and s.estado::text in ('pendiente','reservada'))
    or exists (select 1 from public.cuotas q join public.matriculas m on m.id = q.matricula_id
               where q.institucion_id = p_institucion and m.estudiante_id = auth.uid()
                 and m.estado::text = 'activa' and q.estado::text in ('pendiente','parcial'))), false)
$$;
revoke all on function privado.estudiante_debe_a(uuid) from public, anon;
grant execute on function privado.estudiante_debe_a(uuid) to authenticated;

alter table public.medios_cobro_institucion enable row level security;
revoke all on table public.medios_cobro_institucion from public, anon, authenticated;
grant select, insert, update, delete on table public.medios_cobro_institucion to authenticated;

drop policy if exists "v5 admin gestiona medios de cobro" on public.medios_cobro_institucion;
create policy "v5 admin gestiona medios de cobro" on public.medios_cobro_institucion
  for all to authenticated
  using (privado.admin_de_institucion(institucion_id))
  with check (privado.admin_de_institucion(institucion_id));

drop policy if exists "v5 estudiante ve medios para pagar" on public.medios_cobro_institucion;
create policy "v5 estudiante ve medios para pagar" on public.medios_cobro_institucion
  for select to authenticated
  using (activo and privado.estudiante_debe_a(institucion_id));

-- 2. NOMBRES PARA EL ESTADO DE CUENTA DEL ESTUDIANTE (solo filas propias)
-- Conversiones explícitas en todas las columnas: el resultado coincide con
-- RETURNS TABLE aunque el tipo real sea varchar, enum o numeric(p,s).
create or replace function public.mis_cuotas()
returns table (
  cuota_id uuid, matricula_id uuid, institucion_id uuid, institucion text, curso text, grupo text,
  numero integer, concepto text, importe numeric, aplicado numeric, vencimiento date,
  estado text, matricula_estado text, en_revision boolean)
language sql stable security definer set search_path = ''
as $$
  select q.id::uuid, q.matricula_id::uuid, q.institucion_id::uuid,
         i.nombre::text, c.nombre::text, g.codigo::text,
         q.numero::integer, q.concepto::text, q.importe::numeric,
         coalesce((select sum(p.monto) from public.pagos p
                   where p.cuota_id = q.id and p.estado::text = 'pagado'), 0)::numeric,
         q.vencimiento::date, q.estado::text, m.estado::text,
         exists (select 1 from public.pagos p where p.cuota_id = q.id and p.estado::text = 'pendiente')::boolean
  from public.cuotas q
  join public.matriculas m on m.id = q.matricula_id
  join public.grupos g on g.id = m.grupo_id
  join public.cursos c on c.id = g.curso_id
  join public.instituciones i on i.id = q.institucion_id
  where auth.uid() is not null
    and m.estudiante_id = auth.uid()
    and privado.mi_rol_activo() = 'estudiante'
  order by q.vencimiento, q.numero
$$;

revoke all on function public.mis_cuotas() from public, anon;
grant execute on function public.mis_cuotas() to authenticated;

commit;

-- =====================================================================
-- VERIFICACIÓN (solo lectura, después de aplicar)
-- =====================================================================
-- Políticas (esperado: 2 filas; "admin" con cmd ALL y "estudiante" con cmd SELECT):
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies where schemaname = 'public' and tablename = 'medios_cobro_institucion';
--
-- RLS activa (esperado: true):
-- select relrowsecurity from pg_class where oid = 'public.medios_cobro_institucion'::regclass;
--
-- Privilegios de la tabla (esperado: anon sin nada; authenticated con los 4):
-- select grantee, string_agg(privilege_type, ', ' order by privilege_type)
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'medios_cobro_institucion'
--   and grantee in ('anon','authenticated') group by grantee;
--
-- Funciones (esperado: security_definer = true, dueño postgres,
-- config = {search_path=""}, anon sin EXECUTE, authenticated con EXECUTE):
-- select p.oid::regprocedure as funcion, p.prosecdef as security_definer,
--        pg_get_userbyid(p.proowner) as dueno, p.proconfig as config,
--        has_function_privilege('anon', p.oid, 'execute') as anon_execute,
--        has_function_privilege('authenticated', p.oid, 'execute') as auth_execute
-- from pg_proc p
-- where p.oid in ('public.mis_cuotas()'::regprocedure, 'privado.estudiante_debe_a(uuid)'::regprocedure);
--
-- Tipos devueltos por mis_cuotas (debe ejecutarse sin error; 0 filas desde el editor):
-- select * from public.mis_cuotas() limit 0;

-- =====================================================================
-- REVERSIÓN (solo lo que añade este archivo; no hay datos de otros módulos)
-- =====================================================================
-- begin;
-- drop function if exists public.mis_cuotas();
-- drop table if exists public.medios_cobro_institucion;
-- drop function if exists privado.estudiante_debe_a(uuid);
-- commit;
