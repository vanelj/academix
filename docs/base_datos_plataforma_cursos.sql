-- =====================================================================
-- Plataforma de Oferta y Gestión de Cursos Virtuales
-- Script COMPLETO de base de datos para Supabase (PostgreSQL 15 o superior)
-- Versión 4: V3 (multirrol, rol activo, catálogo público, protección del
-- último administrador y RLS auditado) + campo modalidad en cursos.
--
-- Cómo usarlo: Supabase > SQL Editor > New query > pegar todo > Run
-- Ejecutar UNA sola vez sobre un proyecto vacío (ver nota al final si
-- ya ejecutaron la V1 o la V2).
--
-- Reglas del modelo:
--   * UNA cuenta (auth.users) = UN perfil = UNA institución.
--   * Una cuenta puede tener uno o varios roles: admin, docente, estudiante.
--   * Los permisos de la sesión dependen del ROL ACTIVO elegido.
-- =====================================================================


-- =====================================================================
-- 1. EXTENSIONES Y ESQUEMAS
-- No se requieren extensiones: gen_random_uuid() es nativa desde PG13.
-- El esquema "privado" guarda las funciones internas (ayudantes de RLS
-- y triggers). Supabase solo expone el esquema "public" por la API, así
-- que nadie puede llamar estas funciones directamente desde la app.
-- =====================================================================
create schema if not exists privado;
revoke all on schema privado from public;


-- =====================================================================
-- 2. TIPOS (listas de valores permitidos)
-- Los roles NO son un tipo: viven en la tabla "roles".
-- =====================================================================
create type public.estado_curso     as enum ('borrador', 'publicado', 'desactivado');
create type public.estado_grupo     as enum ('programado', 'abierto', 'en_curso', 'cerrado', 'cancelado');
create type public.estado_matricula as enum ('activa', 'anulada');
create type public.estado_final     as enum ('en_curso', 'aprobado', 'desaprobado');
create type public.estado_pago      as enum ('pendiente', 'pagado', 'rechazado');

-- MODALIDAD: en el alcance actual todos los cursos son virtuales.
-- Para ampliar en el futuro basta con agregar valores, por ejemplo:
--   alter type public.modalidad_curso add value 'presencial';
--   alter type public.modalidad_curso add value 'semipresencial';
-- Los cursos existentes no se modifican y siguen como 'virtual'.
create type public.modalidad_curso  as enum ('virtual');


-- =====================================================================
-- 3. TABLAS (en orden de dependencia)
-- Todas llevan institucion_id. Las llaves foráneas compuestas
-- (id, institucion_id) impiden mezclar datos de instituciones distintas.
-- =====================================================================

-- 3.1 Instituciones
create table public.instituciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(trim(nombre)) > 0),
  ruc         text unique,
  correo      text,
  telefono    text,
  direccion   text,
  logo_url    text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- 3.2 Roles (catálogo fijo)
create table public.roles (
  codigo       text primary key,
  nombre       text not null,
  descripcion  text
);

insert into public.roles (codigo, nombre, descripcion) values
  ('admin',      'Administrador', 'Administra la información académica y administrativa de su institución'),
  ('docente',    'Docente',       'Gestiona sus grupos asignados, evaluaciones y calificaciones'),
  ('estudiante', 'Estudiante',    'Consulta sus cursos, horarios, pagos, calificaciones y certificados');

-- 3.3 Perfiles — MULTIRROL: un solo perfil por persona.
-- Correo y contraseña los guarda Supabase Auth (auth.users).
-- ROL ACTIVO: rol_activo indica con qué rol trabaja la persona ahora.
create table public.perfiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  institucion_id  uuid not null references public.instituciones(id),
  nombres         text not null check (length(trim(nombres)) > 0),
  apellidos       text not null check (length(trim(apellidos)) > 0),
  dni             text,
  telefono        text,
  rol_activo      text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (institucion_id, dni),
  unique (id, institucion_id)
);

-- 3.4 Usuario-Rol — MULTIRROL: qué roles tiene cada cuenta (1, 2 o 3).
-- La llave (perfil_id, institucion_id) obliga a que el rol se asigne
-- dentro de la misma institución del perfil.
create table public.usuario_roles (
  perfil_id       uuid not null,
  institucion_id  uuid not null,
  rol             text not null references public.roles(codigo),
  activo          boolean not null default true,
  asignado_en     timestamptz not null default now(),
  primary key (perfil_id, rol),
  foreign key (perfil_id, institucion_id)
    references public.perfiles(id, institucion_id) on delete cascade
);

-- ROL ACTIVO: solo puede ser un rol realmente asignado a esa cuenta.
-- Si se elimina esa asignación, rol_activo queda en NULL (requiere PG15+).
alter table public.perfiles
  add constraint perfiles_rol_activo_asignado
  foreign key (id, rol_activo)
  references public.usuario_roles(perfil_id, rol)
  on delete set null (rol_activo);

-- 3.5 Categorías
create table public.categorias (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones(id),
  nombre          text not null check (length(trim(nombre)) > 0),
  descripcion     text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (institucion_id, nombre),
  unique (id, institucion_id)
);

-- 3.6 Cursos (ficha de lo que se ofrece; el precio es igual para todos sus grupos)
create table public.cursos (
  id                uuid primary key default gen_random_uuid(),
  institucion_id    uuid not null references public.instituciones(id),
  categoria_id      uuid not null,
  nombre            text not null check (length(trim(nombre)) > 0),
  descripcion       text,
  precio            numeric(10,2) not null default 0 check (precio >= 0),
  modalidad         public.modalidad_curso not null default 'virtual',
  nota_aprobatoria  numeric(4,2) not null default 11 check (nota_aprobatoria between 0 and 20),
  estado            public.estado_curso not null default 'borrador',
  created_at        timestamptz not null default now(),
  unique (id, institucion_id),
  foreign key (categoria_id, institucion_id) references public.categorias(id, institucion_id)
);

-- 3.7 Grupos (cada apertura de un curso)
create table public.grupos (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones(id),
  curso_id        uuid not null,
  docente_id      uuid,
  codigo          text not null,
  vacantes        int not null check (vacantes > 0),
  fecha_inicio    date not null,
  fecha_fin       date not null,
  estado          public.estado_grupo not null default 'programado',
  created_at      timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio),
  unique (curso_id, codigo),
  unique (id, institucion_id),
  foreign key (curso_id, institucion_id)   references public.cursos(id, institucion_id),
  foreign key (docente_id, institucion_id) references public.perfiles(id, institucion_id)
);

-- 3.8 Horarios
create table public.horarios (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null,
  grupo_id        uuid not null,
  dia_semana      smallint not null check (dia_semana between 1 and 7), -- 1 = lunes ... 7 = domingo
  hora_inicio     time not null,
  hora_fin        time not null,
  enlace_clase    text,                                                 -- privado: no sale en la oferta pública
  check (hora_fin > hora_inicio),
  foreign key (grupo_id, institucion_id) references public.grupos(id, institucion_id) on delete cascade
);

-- 3.9 Evaluaciones (del grupo; las gestiona su docente)
create table public.evaluaciones (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null,
  grupo_id        uuid not null,
  nombre          text not null check (length(trim(nombre)) > 0),
  descripcion     text,
  peso            numeric(5,2) not null check (peso > 0 and peso <= 100), -- porcentaje
  fecha           date,
  created_at      timestamptz not null default now(),
  unique (id, grupo_id),
  foreign key (grupo_id, institucion_id) references public.grupos(id, institucion_id)
);

-- 3.10 Matrículas (el estudiante se matricula en un grupo)
create table public.matriculas (
  id               uuid primary key default gen_random_uuid(),
  institucion_id   uuid not null,
  grupo_id         uuid not null,
  estudiante_id    uuid not null,
  fecha_matricula  timestamptz not null default now(),
  estado           public.estado_matricula not null default 'activa',
  estado_final     public.estado_final not null default 'en_curso',
  unique (id, grupo_id),
  unique (id, institucion_id),
  foreign key (grupo_id, institucion_id)      references public.grupos(id, institucion_id),
  foreign key (estudiante_id, institucion_id) references public.perfiles(id, institucion_id)
);

-- 3.11 Pagos (se guarda el monto realmente pagado)
create table public.pagos (
  id               uuid primary key default gen_random_uuid(),
  institucion_id   uuid not null,
  matricula_id     uuid not null,
  monto            numeric(10,2) not null check (monto > 0),
  metodo           text not null,
  fecha_pago       timestamptz not null default now(),
  estado           public.estado_pago not null default 'pendiente',
  comprobante_url  text,
  foreign key (matricula_id, institucion_id) references public.matriculas(id, institucion_id)
);

-- 3.12 Calificaciones (grupo_id garantiza evaluación y matrícula del MISMO grupo)
create table public.calificaciones (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null,
  grupo_id        uuid not null,
  evaluacion_id   uuid not null,
  matricula_id    uuid not null,
  nota            numeric(4,2) not null check (nota between 0 and 20),
  observacion     text,
  registrado_en   timestamptz not null default now(),
  unique (evaluacion_id, matricula_id),
  foreign key (grupo_id, institucion_id) references public.grupos(id, institucion_id),
  foreign key (evaluacion_id, grupo_id)  references public.evaluaciones(id, grupo_id),
  foreign key (matricula_id, grupo_id)   references public.matriculas(id, grupo_id)
);

-- 3.13 Certificados (uno por matrícula aprobada)
create table public.certificados (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null,
  matricula_id    uuid not null unique,
  codigo          text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 12)),
  fecha_emision   timestamptz not null default now(),
  archivo_url     text,
  foreign key (matricula_id, institucion_id) references public.matriculas(id, institucion_id)
);


-- =====================================================================
-- 4. ÍNDICES
-- =====================================================================

-- Un estudiante no puede tener dos matrículas activas en el mismo grupo.
-- (La regla "tampoco en otro grupo del mismo curso" la valida matricular()).
create unique index matricula_activa_unica
  on public.matriculas (estudiante_id, grupo_id)
  where estado = 'activa';

create index on public.perfiles (institucion_id);
create index on public.usuario_roles (institucion_id, rol);
create index on public.cursos (categoria_id);
create index on public.grupos (curso_id);
create index on public.grupos (docente_id);
create index on public.horarios (grupo_id);
create index on public.evaluaciones (grupo_id);
create index on public.matriculas (grupo_id);
create index on public.matriculas (estudiante_id);
create index on public.pagos (matricula_id);
create index on public.calificaciones (matricula_id);


-- =====================================================================
-- 5. FUNCIONES AUXILIARES (esquema privado)
-- Son SECURITY DEFINER para poder leer perfiles/roles sin chocar con RLS,
-- usan search_path vacío (todo va con esquema explícito) y solo reciben
-- permiso de ejecución los usuarios autenticados.
-- ROL ACTIVO: todas las comprobaciones de permisos usan el rol activo,
-- no el conjunto de roles asignados.
-- =====================================================================

-- Institución del usuario actual (solo si su perfil está activo)
create or replace function privado.mi_institucion()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.institucion_id
  from public.perfiles p
  where p.id = auth.uid() and p.activo
$$;

-- Rol activo del usuario actual (solo si el perfil está activo y ese rol
-- sigue asignado y habilitado; si no, devuelve NULL = sin permisos)
create or replace function privado.mi_rol_activo()
returns text
language sql stable security definer set search_path = ''
as $$
  select p.rol_activo
  from public.perfiles p
  join public.usuario_roles ur
    on ur.perfil_id = p.id and ur.rol = p.rol_activo
  where p.id = auth.uid() and p.activo and ur.activo
$$;

-- ¿La cuenta tiene el rol asignado y habilitado, con perfil activo?
create or replace function privado.tiene_rol(p_perfil uuid, p_rol text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.usuario_roles ur
    join public.perfiles p on p.id = ur.perfil_id
    where ur.perfil_id = p_perfil and ur.rol = p_rol and ur.activo and p.activo
  )
$$;

-- ¿Trabajo como docente y este grupo es mío?
create or replace function privado.es_docente_del_grupo(p_grupo uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(privado.mi_rol_activo() = 'docente', false)
     and exists (select 1 from public.grupos g
                 where g.id = p_grupo and g.docente_id = auth.uid())
$$;

-- ¿Trabajo como docente y esta matrícula es de uno de mis grupos?
create or replace function privado.es_docente_de_matricula(p_matricula uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(privado.mi_rol_activo() = 'docente', false)
     and exists (select 1
                 from public.matriculas m
                 join public.grupos g on g.id = m.grupo_id
                 where m.id = p_matricula and g.docente_id = auth.uid())
$$;

-- ¿Trabajo como estudiante y esta matrícula es mía?
create or replace function privado.es_mi_matricula(p_matricula uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(privado.mi_rol_activo() = 'estudiante', false)
     and exists (select 1 from public.matriculas m
                 where m.id = p_matricula and m.estudiante_id = auth.uid())
$$;

-- ¿Trabajo como estudiante y tengo matrícula activa en este grupo?
create or replace function privado.estoy_matriculado_en(p_grupo uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(privado.mi_rol_activo() = 'estudiante', false)
     and exists (select 1 from public.matriculas m
                 where m.grupo_id = p_grupo
                   and m.estudiante_id = auth.uid()
                   and m.estado = 'activa')
$$;

-- ¿Trabajo como docente y esta persona es estudiante de alguno de mis grupos?
create or replace function privado.es_estudiante_de_mis_grupos(p_perfil uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(privado.mi_rol_activo() = 'docente', false)
     and exists (select 1
                 from public.matriculas m
                 join public.grupos g on g.id = m.grupo_id
                 where m.estudiante_id = p_perfil and g.docente_id = auth.uid())
$$;

-- Vacantes libres de un grupo (cuenta TODAS las matrículas activas,
-- aunque el usuario no pueda verlas por RLS)
create or replace function privado.vacantes_disponibles(p_grupo uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  select g.vacantes - (
    select count(*) from public.matriculas m
    where m.grupo_id = g.id and m.estado = 'activa'
  )::int
  from public.grupos g
  where g.id = p_grupo
$$;

-- ¿Queda en la institución otro administrador activo (rol y perfil activos)
-- además de p_perfil?
create or replace function privado.hay_otro_admin_activo(p_inst uuid, p_perfil uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.usuario_roles ur
    join public.perfiles p on p.id = ur.perfil_id
    where ur.institucion_id = p_inst
      and ur.rol = 'admin'
      and ur.activo
      and p.activo
      and ur.perfil_id <> p_perfil
  )
$$;


-- =====================================================================
-- 6. TRIGGERS
-- =====================================================================

-- 6.1 Docente de un grupo: perfil existente, activo, de la misma
--     institución y con rol Docente habilitado.
create or replace function privado.validar_docente_grupo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.docente_id is null then
    return new;
  end if;

  if not exists (select 1 from public.perfiles p
                 where p.id = new.docente_id
                   and p.institucion_id = new.institucion_id
                   and p.activo) then
    raise exception 'El docente no existe, no está activo o pertenece a otra institución';
  end if;

  if not privado.tiene_rol(new.docente_id, 'docente') then
    raise exception 'La cuenta asignada no tiene el rol Docente habilitado';
  end if;

  return new;
end
$$;

create trigger validar_docente_grupo
  before insert or update of docente_id, institucion_id on public.grupos
  for each row execute function privado.validar_docente_grupo();

-- 6.2 Estudiante de una matrícula: perfil existente, activo, de la misma
--     institución y con rol Estudiante habilitado.
create or replace function privado.validar_estudiante_matricula()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.perfiles p
                 where p.id = new.estudiante_id
                   and p.institucion_id = new.institucion_id
                   and p.activo) then
    raise exception 'El estudiante no existe, no está activo o pertenece a otra institución';
  end if;

  if not privado.tiene_rol(new.estudiante_id, 'estudiante') then
    raise exception 'La cuenta no tiene el rol Estudiante habilitado';
  end if;

  return new;
end
$$;

create trigger validar_estudiante_matricula
  before insert or update of estudiante_id, institucion_id on public.matriculas
  for each row execute function privado.validar_estudiante_matricula();

-- 6.3 Una matrícula anulada no puede reactivarse con un UPDATE, porque eso
--     saltaría el control de vacantes y de duplicados. Se registra una nueva
--     con matricular().
create or replace function privado.impedir_reactivar_matricula()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.estado = 'anulada' and new.estado = 'activa' then
    raise exception 'Una matrícula anulada no puede reactivarse; registre una nueva matrícula';
  end if;
  return new;
end
$$;

create trigger impedir_reactivar_matricula
  before update of estado on public.matriculas
  for each row execute function privado.impedir_reactivar_matricula();

-- 6.4 Certificado solo para una matrícula activa y aprobada (RN08).
create or replace function privado.validar_certificado()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.matriculas m
                 where m.id = new.matricula_id
                   and m.institucion_id = new.institucion_id
                   and m.estado = 'activa'
                   and m.estado_final = 'aprobado') then
    raise exception 'Solo se puede emitir certificado para una matrícula activa y aprobada';
  end if;
  return new;
end
$$;

create trigger validar_certificado
  before insert or update of matricula_id, institucion_id on public.certificados
  for each row execute function privado.validar_certificado();

-- 6.5 PROTECCIÓN DEL ÚLTIMO ADMINISTRADOR (tabla usuario_roles)
-- Bloquea DELETE o UPDATE que quite el rol admin activo (desactivarlo,
-- cambiarlo de rol, de perfil o de institución) si no queda otro
-- administrador activo. También cubre el borrado en cascada cuando se
-- elimina la cuenta en auth.users. Solo se omite el bloqueo cuando el
-- perfil ya estaba desactivado (ese admin ya no contaba).
-- Se bloquea la fila de la institución para que dos administradores no
-- puedan quitarse el rol mutuamente al mismo tiempo.
create or replace function privado.proteger_ultimo_admin_rol()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_quita_admin boolean := false;
begin
  if old.rol = 'admin' and old.activo then
    if tg_op = 'DELETE' then
      v_quita_admin := true;
    else
      v_quita_admin := (not new.activo)
                       or new.rol <> 'admin'
                       or new.perfil_id <> old.perfil_id
                       or new.institucion_id <> old.institucion_id;
    end if;
  end if;

  if v_quita_admin
     and not exists (select 1 from public.perfiles p
                     where p.id = old.perfil_id and not p.activo) then
    perform 1 from public.instituciones i where i.id = old.institucion_id for update;
    if not privado.hay_otro_admin_activo(old.institucion_id, old.perfil_id) then
      raise exception 'La institución debe conservar al menos un administrador activo';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger proteger_ultimo_admin_rol
  before update or delete on public.usuario_roles
  for each row execute function privado.proteger_ultimo_admin_rol();

-- 6.6 PROTECCIÓN DEL ÚLTIMO ADMINISTRADOR (tabla perfiles)
-- Desactivar el perfil del único administrador activo también dejaría a
-- la institución sin administrador, así que se bloquea.
create or replace function privado.proteger_ultimo_admin_perfil()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.activo and not new.activo
     and exists (select 1 from public.usuario_roles ur
                 where ur.perfil_id = old.id and ur.rol = 'admin' and ur.activo) then
    perform 1 from public.instituciones i where i.id = old.institucion_id for update;
    if not privado.hay_otro_admin_activo(old.institucion_id, old.id) then
      raise exception 'No se puede desactivar al único administrador activo de la institución';
    end if;
  end if;
  return new;
end
$$;

create trigger proteger_ultimo_admin_perfil
  before update of activo on public.perfiles
  for each row execute function privado.proteger_ultimo_admin_perfil();


-- =====================================================================
-- 7. SEGURIDAD POR FILAS (RLS)
-- Todas las políticas son solo para usuarios autenticados ("to authenticated"):
-- un visitante anónimo no puede leer ni escribir ninguna tabla; solo
-- consulta las vistas públicas de la sección 9.
-- Siempre se exige la propia institución y, según el caso, el ROL ACTIVO.
-- Además, en la sección 10 se limita QUÉ columnas se pueden modificar.
-- =====================================================================
alter table public.instituciones  enable row level security;
alter table public.roles          enable row level security;
alter table public.perfiles       enable row level security;
alter table public.usuario_roles  enable row level security;
alter table public.categorias     enable row level security;
alter table public.cursos         enable row level security;
alter table public.grupos         enable row level security;
alter table public.horarios       enable row level security;
alter table public.evaluaciones   enable row level security;
alter table public.matriculas     enable row level security;
alter table public.pagos          enable row level security;
alter table public.calificaciones enable row level security;
alter table public.certificados   enable row level security;

-- Roles (catálogo)
create policy "leer roles" on public.roles
  for select to authenticated using (true);

-- Instituciones: cada uno ve la suya; solo el admin activo la edita
create policy "ver mi institucion" on public.instituciones
  for select to authenticated
  using (id = privado.mi_institucion());

create policy "admin edita su institucion" on public.instituciones
  for update to authenticated
  using (id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin')
  with check (id = privado.mi_institucion());

-- Perfiles (contienen DNI y teléfono):
--   cada uno ve el suyo; el admin ve los de su institución;
--   el docente ve a los estudiantes de sus grupos.
--   Los nombres de los docentes se consultan con la vista docentes_institucion.
create policy "ver perfiles" on public.perfiles
  for select to authenticated
  using (
    institucion_id = privado.mi_institucion()
    and (id = auth.uid()
         or privado.mi_rol_activo() = 'admin'
         or privado.es_estudiante_de_mis_grupos(id))
  );

create policy "admin edita perfiles" on public.perfiles
  for update to authenticated
  using (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin')
  with check (institucion_id = privado.mi_institucion());
-- No hay política INSERT ni DELETE: los perfiles se crean con
-- registrar_institucion() o desde el servidor al dar de alta cuentas.

-- Usuario-Rol (ASIGNACIÓN DE ROLES PROTEGIDA):
--   cada uno ve sus propios roles (para el selector);
--   solo el admin ACTIVO asigna, habilita o retira roles en su institución.
create policy "ver roles asignados" on public.usuario_roles
  for select to authenticated
  using (
    perfil_id = auth.uid()
    or (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin')
  );

create policy "admin asigna roles" on public.usuario_roles
  for insert to authenticated
  with check (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin');

create policy "admin actualiza roles" on public.usuario_roles
  for update to authenticated
  using (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin')
  with check (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin');

create policy "admin retira roles" on public.usuario_roles
  for delete to authenticated
  using (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin');

-- Categorías: todos los de la institución las ven; el admin las gestiona
create policy "ver categorias" on public.categorias
  for select to authenticated
  using (institucion_id = privado.mi_institucion());

create policy "admin gestiona categorias" on public.categorias
  for all to authenticated
  using (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin')
  with check (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin');

-- Cursos: con rol activo Estudiante no se ven los cursos en borrador
create policy "ver cursos" on public.cursos
  for select to authenticated
  using (
    institucion_id = privado.mi_institucion()
    and (estado <> 'borrador' or privado.mi_rol_activo() in ('admin', 'docente'))
  );

create policy "admin gestiona cursos" on public.cursos
  for all to authenticated
  using (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin')
  with check (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin');

-- Grupos: todos los de la institución los ven; el admin los gestiona
create policy "ver grupos" on public.grupos
  for select to authenticated
  using (institucion_id = privado.mi_institucion());

create policy "admin gestiona grupos" on public.grupos
  for all to authenticated
  using (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin')
  with check (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin');

-- Horarios: admin todos; docente y estudiante solo los de sus grupos
create policy "ver horarios" on public.horarios
  for select to authenticated
  using (
    institucion_id = privado.mi_institucion()
    and (privado.mi_rol_activo() = 'admin'
         or privado.es_docente_del_grupo(grupo_id)
         or privado.estoy_matriculado_en(grupo_id))
  );

create policy "admin gestiona horarios" on public.horarios
  for all to authenticated
  using (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin')
  with check (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin');

-- Evaluaciones: el docente del grupo las gestiona; el admin supervisa;
-- el estudiante ve las de los grupos donde está matriculado
create policy "ver evaluaciones" on public.evaluaciones
  for select to authenticated
  using (
    institucion_id = privado.mi_institucion()
    and (privado.mi_rol_activo() = 'admin'
         or privado.es_docente_del_grupo(grupo_id)
         or privado.estoy_matriculado_en(grupo_id))
  );

create policy "docente gestiona evaluaciones" on public.evaluaciones
  for all to authenticated
  using (institucion_id = privado.mi_institucion() and privado.es_docente_del_grupo(grupo_id))
  with check (institucion_id = privado.mi_institucion() and privado.es_docente_del_grupo(grupo_id));

-- Matrículas: se crean SOLO con matricular(); el admin cambia su estado
create policy "ver matriculas" on public.matriculas
  for select to authenticated
  using (
    institucion_id = privado.mi_institucion()
    and (privado.mi_rol_activo() = 'admin'
         or privado.es_mi_matricula(id)
         or privado.es_docente_del_grupo(grupo_id))
  );

create policy "admin actualiza matriculas" on public.matriculas
  for update to authenticated
  using (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin')
  with check (institucion_id = privado.mi_institucion());

-- Pagos: el estudiante registra el suyo como pendiente y lo consulta;
-- el admin los gestiona; el docente no ve pagos
create policy "ver pagos" on public.pagos
  for select to authenticated
  using (
    institucion_id = privado.mi_institucion()
    and (privado.mi_rol_activo() = 'admin' or privado.es_mi_matricula(matricula_id))
  );

create policy "registrar pago" on public.pagos
  for insert to authenticated
  with check (
    institucion_id = privado.mi_institucion()
    and (privado.mi_rol_activo() = 'admin'
         or (privado.es_mi_matricula(matricula_id) and estado = 'pendiente'))
  );

create policy "admin actualiza pagos" on public.pagos
  for update to authenticated
  using (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin')
  with check (institucion_id = privado.mi_institucion());

-- Calificaciones: el docente del grupo las registra; el admin supervisa;
-- el estudiante ve las suyas
create policy "ver calificaciones" on public.calificaciones
  for select to authenticated
  using (
    institucion_id = privado.mi_institucion()
    and (privado.mi_rol_activo() = 'admin'
         or privado.es_docente_del_grupo(grupo_id)
         or privado.es_mi_matricula(matricula_id))
  );

create policy "docente gestiona calificaciones" on public.calificaciones
  for all to authenticated
  using (institucion_id = privado.mi_institucion() and privado.es_docente_del_grupo(grupo_id))
  with check (institucion_id = privado.mi_institucion() and privado.es_docente_del_grupo(grupo_id));

-- Certificados: el admin emite y consulta; el docente consulta los de sus
-- grupos; el estudiante consulta y descarga los suyos
create policy "ver certificados" on public.certificados
  for select to authenticated
  using (
    institucion_id = privado.mi_institucion()
    and (privado.mi_rol_activo() = 'admin'
         or privado.es_mi_matricula(matricula_id)
         or privado.es_docente_de_matricula(matricula_id))
  );

create policy "admin emite certificados" on public.certificados
  for insert to authenticated
  with check (institucion_id = privado.mi_institucion() and privado.mi_rol_activo() = 'admin');


-- =====================================================================
-- 8. FUNCIONES QUE LLAMA LA APLICACIÓN (RPC, esquema public)
-- =====================================================================

-- 8.1 REGISTRO INICIAL DE INSTITUCIÓN
-- Flujo: usuario de Supabase Auth con sesión -> crea institución -> crea
-- su perfil -> se le asigna 'admin' -> 'admin' queda como rol activo.
-- El rol lo fija la función (el cliente no lo elige). Todo ocurre en una
-- sola transacción: si algo falla, no se guarda nada.
-- Uso: supabase.rpc('registrar_institucion', { p_nombre, p_nombres, p_apellidos, ... })
create or replace function public.registrar_institucion(
  p_nombre     text,
  p_nombres    text,
  p_apellidos  text,
  p_ruc        text default null,
  p_correo     text default null,
  p_telefono   text default null,
  p_direccion  text default null,
  p_dni        text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_inst    uuid;
begin
  if v_usuario is null then
    raise exception 'Debes iniciar sesión para registrar la institución';
  end if;

  -- Cuentas anónimas de Supabase (si algún día se habilitan) no pueden registrar
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Una sesión anónima no puede registrar una institución';
  end if;

  if exists (select 1 from public.perfiles p where p.id = v_usuario) then
    raise exception 'Esta cuenta ya pertenece a una institución';
  end if;

  insert into public.instituciones (nombre, ruc, correo, telefono, direccion)
  values (trim(p_nombre), nullif(trim(p_ruc), ''), p_correo, p_telefono, p_direccion)
  returning id into v_inst;

  insert into public.perfiles (id, institucion_id, nombres, apellidos, dni)
  values (v_usuario, v_inst, trim(p_nombres), trim(p_apellidos), nullif(trim(p_dni), ''));

  insert into public.usuario_roles (perfil_id, institucion_id, rol)
  values (v_usuario, v_inst, 'admin');

  update public.perfiles set rol_activo = 'admin' where id = v_usuario;

  return v_inst;
end
$$;

-- 8.2 SELECCIÓN / CAMBIO DE ROL ACTIVO
-- Solo se puede elegir un rol asignado y habilitado a la propia cuenta.
-- Uso: supabase.rpc('seleccionar_rol', { p_rol: 'docente' })
-- Para el selector, la app lista los roles con:
--   supabase.from('usuario_roles').select('rol, roles(nombre)').eq('activo', true)
create or replace function public.seleccionar_rol(p_rol text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;

  if not exists (select 1 from public.perfiles p where p.id = auth.uid() and p.activo) then
    raise exception 'La cuenta no tiene un perfil activo';
  end if;

  if not privado.tiene_rol(auth.uid(), p_rol) then
    raise exception 'La cuenta no tiene asignado ese rol';
  end if;

  update public.perfiles set rol_activo = p_rol where id = auth.uid();
end
$$;

-- 8.3 MATRÍCULA
-- Reglas: grupo de la propia institución y abierto, curso publicado,
-- vacantes disponibles, sin otra matrícula activa en el mismo curso y
-- sin ser el docente del grupo.
--   * Rol activo Estudiante: se matricula a sí mismo.
--   * Rol activo Administrador: matricula a un estudiante de su institución.
-- Concurrencia: se bloquea la fila del grupo (nadie supera el cupo) y la
-- del estudiante (no puede matricularse a la vez en dos grupos del mismo curso).
-- Uso: supabase.rpc('matricular', { p_grupo_id }) o
--      supabase.rpc('matricular', { p_grupo_id, p_estudiante_id }) como admin
create or replace function public.matricular(p_grupo_id uuid, p_estudiante_id uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_rol         text := privado.mi_rol_activo();
  v_inst        uuid := privado.mi_institucion();
  v_estudiante  uuid;
  v_grupo       public.grupos%rowtype;
  v_ocupadas    int;
  v_id          uuid;
begin
  if v_rol = 'estudiante' then
    if p_estudiante_id is not null and p_estudiante_id <> auth.uid() then
      raise exception 'Con el rol Estudiante solo puedes matricularte a ti mismo';
    end if;
    v_estudiante := auth.uid();
  elsif v_rol = 'admin' then
    if p_estudiante_id is null then
      raise exception 'Indica el estudiante que se va a matricular';
    end if;
    v_estudiante := p_estudiante_id;
  else
    raise exception 'No tienes permiso para realizar esta matrícula';
  end if;

  select * into v_grupo
  from public.grupos g
  where g.id = p_grupo_id and g.institucion_id = v_inst
  for update;

  if not found then
    raise exception 'El grupo no existe';
  end if;

  -- Estudiante de la misma institución, activo y con rol Estudiante
  perform 1 from public.perfiles p
  where p.id = v_estudiante and p.institucion_id = v_inst and p.activo
  for update;

  if not found or not privado.tiene_rol(v_estudiante, 'estudiante') then
    raise exception 'La cuenta indicada no es un estudiante activo de la institución';
  end if;

  if v_grupo.estado <> 'abierto' then
    raise exception 'El grupo no está abierto para matrícula';
  end if;

  if not exists (select 1 from public.cursos c
                 where c.id = v_grupo.curso_id and c.estado = 'publicado') then
    raise exception 'El curso no está publicado';
  end if;

  if v_grupo.docente_id = v_estudiante then
    raise exception 'El docente del grupo no puede matricularse en su propio grupo';
  end if;

  if exists (select 1
             from public.matriculas m
             join public.grupos g on g.id = m.grupo_id
             where m.estudiante_id = v_estudiante
               and m.estado = 'activa'
               and g.curso_id = v_grupo.curso_id) then
    raise exception 'El estudiante ya está matriculado en este curso';
  end if;

  select count(*) into v_ocupadas
  from public.matriculas m
  where m.grupo_id = p_grupo_id and m.estado = 'activa';

  if v_ocupadas >= v_grupo.vacantes then
    raise exception 'No hay vacantes disponibles';
  end if;

  insert into public.matriculas (institucion_id, grupo_id, estudiante_id)
  values (v_inst, p_grupo_id, v_estudiante)
  returning id into v_id;

  return v_id;
end
$$;


-- =====================================================================
-- 9. VISTAS
-- =====================================================================

-- 9.1 OFERTA PÚBLICA (visitantes sin sesión)
-- Estrategia explícita: vistas con security_invoker = false. Se ejecutan
-- con los permisos de su dueño (no con los del visitante), por eso los
-- visitantes NO necesitan acceso a ninguna tabla. La seguridad está en
-- que cada vista solo selecciona columnas públicas y filas publicadas.
-- No exponen: DNI, correos, teléfonos, RUC, pagos, notas, matrículas
-- individuales, certificados ni enlaces de clase.
-- Uso: supabase.from('oferta_cursos').select('*')

create view public.oferta_cursos
with (security_invoker = false) as
select c.id,
       c.nombre,
       c.descripcion,
       c.precio,
       cat.id     as categoria_id,
       cat.nombre as categoria,
       i.id       as institucion_id,
       i.nombre   as institucion,
       i.logo_url,
       c.modalidad
from public.cursos c
join public.categorias cat on cat.id = c.categoria_id
join public.instituciones i on i.id = c.institucion_id
where c.estado = 'publicado' and cat.activo and i.activo;

create view public.oferta_grupos
with (security_invoker = false) as
select g.id,
       g.curso_id,
       g.codigo,
       g.fecha_inicio,
       g.fecha_fin,
       g.estado,
       g.vacantes - (select count(*) from public.matriculas m
                     where m.grupo_id = g.id and m.estado = 'activa')::int
         as vacantes_disponibles,
       p.nombres || ' ' || p.apellidos as docente
from public.grupos g
join public.oferta_cursos oc on oc.id = g.curso_id
left join public.perfiles p on p.id = g.docente_id
where g.estado in ('programado', 'abierto');

create view public.oferta_horarios
with (security_invoker = false) as
select h.grupo_id,
       h.dia_semana,
       h.hora_inicio,
       h.hora_fin
from public.horarios h
join public.oferta_grupos og on og.id = h.grupo_id;

-- 9.2 Directorio de docentes de MI institución (solo nombres), para que
-- estudiantes y docentes vean quién dicta sin acceder a DNI ni teléfonos.
create view public.docentes_institucion
with (security_invoker = false) as
select p.id, p.nombres, p.apellidos
from public.perfiles p
where p.institucion_id = privado.mi_institucion()
  and p.activo
  and exists (select 1 from public.usuario_roles ur
              where ur.perfil_id = p.id and ur.rol = 'docente' and ur.activo);

-- 9.3 Grupos con vacantes disponibles (paneles internos; respeta RLS)
create view public.grupos_con_vacantes
with (security_invoker = true) as
select g.*, privado.vacantes_disponibles(g.id) as vacantes_disponibles
from public.grupos g;


-- =====================================================================
-- 10. PERMISOS (GRANT / REVOKE)
-- Primero se quita todo a anon y authenticated, y luego se da solo lo
-- necesario. Las columnas que se pueden modificar están limitadas: así,
-- por ejemplo, nadie cambia rol_activo, perfil_id o institucion_id con un
-- UPDATE directo. (service_role no se modifica.)
-- =====================================================================

-- 10.1 Tablas y vistas
revoke all on all tables in schema public from anon, authenticated;

grant select on public.roles to authenticated;

grant select on public.instituciones to authenticated;
grant update (nombre, ruc, correo, telefono, direccion, logo_url) on public.instituciones to authenticated;

grant select on public.perfiles to authenticated;
grant update (nombres, apellidos, dni, telefono, activo) on public.perfiles to authenticated;

grant select, insert, delete on public.usuario_roles to authenticated;
grant update (activo) on public.usuario_roles to authenticated;

grant select, insert, update, delete on public.categorias, public.cursos, public.grupos, public.horarios to authenticated;

grant select, insert, delete on public.evaluaciones to authenticated;
grant update (nombre, descripcion, peso, fecha) on public.evaluaciones to authenticated;

grant select on public.matriculas to authenticated;
grant update (estado, estado_final) on public.matriculas to authenticated;

grant select, insert on public.pagos to authenticated;
grant update (monto, metodo, fecha_pago, estado, comprobante_url) on public.pagos to authenticated;

grant select, insert, delete on public.calificaciones to authenticated;
grant update (nota, observacion) on public.calificaciones to authenticated;

grant select, insert on public.certificados to authenticated;

-- Oferta pública: solo lectura para visitantes y usuarios
grant select on public.oferta_cursos, public.oferta_grupos, public.oferta_horarios to anon, authenticated;
-- Vistas internas: solo usuarios autenticados
grant select on public.docentes_institucion, public.grupos_con_vacantes to authenticated;

-- 10.2 Funciones
revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema privado from public, anon, authenticated;

grant usage on schema privado to authenticated;
grant execute on all functions in schema privado to authenticated;

grant execute on function public.registrar_institucion(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.seleccionar_rol(text) to authenticated;
grant execute on function public.matricular(uuid, uuid) to authenticated;


-- =====================================================================
-- 11. PRIMER ADMINISTRADOR DE PRUEBA (opcional, ejecutar aparte)
-- En la app esto lo hace registrar_institucion(). En el SQL Editor no hay
-- sesión de usuario (auth.uid() es NULL), por eso aquí se hace a mano:
-- Paso 1: Authentication > Users > Add user (correo y contraseña)
-- Paso 2: copiar el UID del usuario y ejecutar, cambiando los valores:
--
-- with inst as (
--   insert into public.instituciones (nombre, ruc)
--   values ('Instituto Demo', '20123456789')
--   returning id
-- ), perfil as (
--   insert into public.perfiles (id, institucion_id, nombres, apellidos)
--   select 'UID-DEL-USUARIO', id, 'Admin', 'Demo' from inst
--   returning id, institucion_id
-- )
-- insert into public.usuario_roles (perfil_id, institucion_id, rol)
-- select id, institucion_id, 'admin' from perfil;
--
-- update public.perfiles set rol_activo = 'admin' where id = 'UID-DEL-USUARIO';
--
-- Para darle a esa misma cuenta otro rol (por ejemplo, Docente):
-- insert into public.usuario_roles (perfil_id, institucion_id, rol)
-- select id, institucion_id, 'docente' from public.perfiles where id = 'UID-DEL-USUARIO';
-- =====================================================================


-- =====================================================================
-- NOTA: si ya ejecutaron la V3, no hace falta borrar nada: usen el archivo
-- migracion_v3_a_v4_modalidad.sql, que solo agrega la modalidad.
-- Si ejecutaron la V1 o la V2, límpienlas ANTES de correr este
-- script (borra también los datos de prueba). Descomenten y ejecuten:
--
-- drop view if exists public.oferta_horarios, public.oferta_grupos, public.oferta_cursos,
--   public.grupos_con_vacantes, public.docentes_institucion cascade;
-- drop table if exists public.certificados, public.calificaciones, public.pagos,
--   public.matriculas, public.evaluaciones, public.horarios, public.grupos,
--   public.cursos, public.categorias, public.usuario_roles, public.perfiles,
--   public.roles, public.instituciones cascade;
-- drop function if exists public.matricular, public.seleccionar_rol,
--   public.registrar_institucion, public.validar_roles, public.validar_docente_grupo,
--   public.validar_estudiante_matricula, public.proteger_ultimo_admin,
--   public.vacantes_disponibles, public.es_mi_matricula, public.es_docente_del_grupo,
--   public.estoy_matriculado_en, public.es_estudiante_de_mis_grupos,
--   public.tiene_rol, public.mi_rol_activo, public.mi_rol, public.mi_institucion cascade;
-- drop type if exists public.rol_usuario, public.estado_curso, public.estado_grupo,
--   public.estado_matricula, public.estado_final, public.estado_pago,
--   public.modalidad_curso cascade;
-- drop schema if exists privado cascade;
-- =====================================================================
