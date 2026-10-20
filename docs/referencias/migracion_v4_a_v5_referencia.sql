-- CURSOS VIRTUALES | MIGRACIÓN V4 -> V5 (FASE DE MODELO Y SEGURIDAD)
-- Ejecutar exclusivamente sobre la V4 instalada; NO sobre una base vacía.
-- Exige PostgreSQL 15+. Realizar respaldo y probar previamente en un clon.
-- ALCANCE: estructura, lecturas seguras, solicitudes de reserva/inscripción y comprobantes pendientes.
-- IMPORTANTE: Incluye RPC transaccionales para solicitudes, comprobantes y revisión manual.
-- La habilitación productiva requiere pruebas y configuración de Storage privado.
-- NO vuelve a ejecutar el script V4. NO borra datos ni tablas existentes.

begin;

-- Verificación antes de cambiar la estructura.
do $$
begin
  if to_regclass('public.perfiles') is null
     or to_regclass('public.usuario_roles') is null
     or to_regclass('public.matriculas') is null
     or to_regclass('public.pagos') is null
     or to_regclass('public.grupos') is null
     or to_regprocedure('public.matricular(uuid,uuid)') is null then
    raise exception 'No se detectó la V4 requerida. No se ejecutó la migración.';
  end if;
  if to_regclass('public.solicitudes_inscripcion') is not null then
    raise exception 'Parece que la V5 ya fue aplicada. No se ejecutó nuevamente.';
  end if;
end $$;

-- 1. IDENTIDAD INDEPENDIENTE DE LA INSTITUCIÓN.
-- En esta fase los administradores y docentes mantienen su institución V4.
-- Un estudiante global podrá tener institucion_id NULL.
alter table public.perfiles alter column institucion_id drop not null;

-- La restricción compuesta en matrícula impedía que un estudiante global
-- pudiera inscribirse en grupos pertenecientes a otras instituciones.
alter table public.matriculas
  drop constraint if exists matriculas_estudiante_id_institucion_id_fkey;
alter table public.matriculas
  add constraint matriculas_estudiante_id_fkey
  foreign key (estudiante_id) references public.perfiles(id);

-- Las nuevas cuentas globales tendrán un rol estudiante sin institución.
-- El vínculo compuesto existente en usuario_roles admite NULL en institucion_id.
-- Se preserva el rol multirrol V4 para personal de una sola institución.
alter table public.usuario_roles alter column institucion_id drop not null;

-- Evitar que el mismo usuario tenga un rol admin/docente desligado de la institución.
-- Los estudiantes pueden tener institucion_id NULL para el rol global.
alter table public.usuario_roles
  add constraint usuario_roles_ambito_v5
  check (rol = 'estudiante' or institucion_id is not null);

-- Trigger V4 de matrícula obliga a que el estudiante sea de la misma institución.
-- Cambiar la función sin eliminar el trigger.
create or replace function privado.validar_estudiante_matricula()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = new.estudiante_id and p.activo
  ) then
    raise exception 'El estudiante no tiene un perfil activo';
  end if;
  if not privado.tiene_rol(new.estudiante_id, 'estudiante') then
    raise exception 'La cuenta no tiene el rol Estudiante habilitado';
  end if;
  if not exists (
    select 1 from public.grupos g
    where g.id = new.grupo_id and g.institucion_id = new.institucion_id
  ) then
    raise exception 'La matrícula no coincide con la institución del grupo';
  end if;
  return new;
end
$$;

-- 2. POLÍTICAS GENERALES INSTITUCIONALES (SIN PLAZOS IMPUESTOS).
create table public.politicas_institucion (
  institucion_id uuid primary key references public.instituciones(id),
  texto_matricula text,
  texto_reservas text,
  texto_pagos text,
  texto_devoluciones text,
  texto_morosidad text,
  actualizado_en timestamptz not null default now()
);

-- 3. CONDICIONES ESPECÍFICAS DE CADA CURSO.
-- Los valores monetarios se expresan en soles PEN durante la V5.
-- El curso puede ser gratuito, de pago único o con cuotas.
create table public.condiciones_curso (
  curso_id uuid primary key,
  institucion_id uuid not null,
  tipo_cobro text not null default 'unico'
    check (tipo_cobro in ('gratuito','unico','cuotas')),
  matricula_importe numeric(12,2) not null default 0 check (matricula_importe >= 0),
  importe_curso numeric(12,2) not null default 0 check (importe_curso >= 0),
  permite_reserva boolean not null default false,
  reserva_importe numeric(12,2) not null default 0 check (reserva_importe >= 0),
  reserva_plazo_horas integer check (reserva_plazo_horas is null or reserva_plazo_horas > 0),
  reserva_descuenta_matricula boolean not null default true,
  requisitos text,
  condiciones_especiales text,
  actualizado_en timestamptz not null default now(),
  unique (curso_id,institucion_id),
  foreign key (curso_id,institucion_id) references public.cursos(id,institucion_id),
  check (not permite_reserva or (reserva_importe > 0 and reserva_plazo_horas is not null)),
  check (tipo_cobro <> 'gratuito' or (matricula_importe = 0 and importe_curso = 0 and not permite_reserva))
);

-- 4. PLAN DE CUOTAS DEL CURSO (fechas definidas por institución).
create table public.plan_cuotas (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null,
  institucion_id uuid not null,
  numero integer not null check (numero > 0),
  concepto text not null default 'Mensualidad',
  importe numeric(12,2) not null check (importe >= 0),
  dias_desde_inicio integer check (dias_desde_inicio is null or dias_desde_inicio >= 0),
  descripcion_vencimiento text,
  unique(curso_id, numero),
  foreign key (curso_id,institucion_id) references public.condiciones_curso(curso_id,institucion_id)
);

-- 5. SOLICITUDES (antes de matricular) Y RESERVAS CONFIRMADAS.
-- Un comprobante adjuntado NO cambia su estado automáticamente.
create table public.solicitudes_inscripcion (
  id uuid primary key default gen_random_uuid(),
  institucion_id uuid not null references public.instituciones(id),
  grupo_id uuid not null,
  estudiante_id uuid not null references public.perfiles(id),
  tipo text not null check (tipo in ('reserva','matricula')),
  estado text not null default 'pendiente'
    check (estado in ('pendiente','reservada','matriculada','rechazada','cancelada','vencida')),
  importe_esperado numeric(12,2) not null check (importe_esperado >= 0),
  fecha_solicitud timestamptz not null default now(),
  fecha_verificacion timestamptz,
  reserva_vence_en timestamptz,
  matricula_id uuid references public.matriculas(id),
  condiciones_aceptadas text not null,
  aceptadas_en timestamptz not null default now(),
  comentario_revision text,
  unique(id,institucion_id),
  foreign key (grupo_id,institucion_id) references public.grupos(id,institucion_id),
  check (estado <> 'reservada' or (tipo='reserva' and reserva_vence_en is not null)),
  check (estado <> 'matriculada' or matricula_id is not null)
);
create index solicitudes_grupo_estado_idx on public.solicitudes_inscripcion(grupo_id,estado);
create index solicitudes_estudiante_idx on public.solicitudes_inscripcion(estudiante_id);
create unique index solicitudes_pendientes_unicas_v5
  on public.solicitudes_inscripcion(estudiante_id,grupo_id)
  where estado in ('pendiente','reservada');

-- 6. CUOTAS INDIVIDUALES, FIJADAS CUANDO SE CONFIRME LA MATRÍCULA.
create table public.cuotas (
  id uuid primary key default gen_random_uuid(),
  institucion_id uuid not null,
  matricula_id uuid not null,
  numero integer not null check(numero > 0),
  concepto text not null,
  importe numeric(12,2) not null check (importe >= 0),
  vencimiento date not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','parcial','pagada','anulada')),
  unique(matricula_id, numero),
  unique(id,institucion_id),
  foreign key (matricula_id,institucion_id) references public.matriculas(id,institucion_id)
);

-- 7. PAGOS PUEDEN CORRESPONDER A SOLICITUD, MATRÍCULA O CUOTA.
-- Para pagos V4: matricula_id conserva su valor; los nuevos campos quedan NULL.
alter table public.pagos alter column matricula_id drop not null;
alter table public.pagos
  add column solicitud_id uuid,
  add column cuota_id uuid,
  add column estudiante_id uuid,
  add column referencia_operacion text,
  add column observacion text,
  add column verificado_por uuid,
  add column verificado_en timestamptz;
alter table public.pagos
  add constraint pagos_solicitud_institucion_fk
  foreign key (solicitud_id,institucion_id)
  references public.solicitudes_inscripcion(id,institucion_id);
alter table public.pagos
  add constraint pagos_cuota_institucion_fk
  foreign key (cuota_id,institucion_id)
  references public.cuotas(id,institucion_id);
alter table public.pagos
  add constraint pagos_estudiante_fk foreign key(estudiante_id) references public.perfiles(id);
alter table public.pagos
  add constraint pagos_un_destino_v5 check (
     (case when matricula_id is null then 0 else 1 end)
   + (case when solicitud_id is null then 0 else 1 end)
   + (case when cuota_id is null then 0 else 1 end) = 1
  );
create index pagos_solicitud_idx on public.pagos(solicitud_id);
create index pagos_cuota_idx on public.pagos(cuota_id);

-- 8. CONTEO SEGURO DE VACANTES: matrícula + reserva verificada NO vencida.
create or replace function privado.vacantes_disponibles(p_grupo uuid)
returns int language sql stable security definer set search_path = ''
as $$
  select g.vacantes
     - (select count(*) from public.matriculas m
        where m.grupo_id = g.id and m.estado = 'activa')::int
     - (select count(*) from public.solicitudes_inscripcion s
        where s.grupo_id = g.id and s.estado = 'reservada'
          and s.reserva_vence_en > now())::int
  from public.grupos g where g.id = p_grupo
$$;

-- El catálogo público utiliza el nuevo cálculo sin exponer datos privados.
create or replace view public.oferta_grupos
with (security_invoker = false) as
select g.id, g.curso_id, g.codigo, g.fecha_inicio, g.fecha_fin, g.estado,
       privado.vacantes_disponibles(g.id) as vacantes_disponibles,
       p.nombres || ' ' || p.apellidos as docente
from public.grupos g
join public.oferta_cursos oc on oc.id = g.curso_id
left join public.perfiles p on p.id = g.docente_id
where g.estado in ('programado','abierto');

-- 9. EL CAMINO V4 DE MATRÍCULA DIRECTA SE BLOQUEA HASTA TENER
-- VERIFICACIÓN TRANSACCIONAL DE PAGOS + RESERVAS. Evita salto de cobros.
revoke execute on function public.matricular(uuid,uuid) from public, anon, authenticated;

-- Perfil personal visible para el propio usuario global; administración y
-- docentes siguen limitados a su institución y alumnado autorizado.
drop policy if exists "ver perfiles" on public.perfiles;
create policy "ver perfiles" on public.perfiles for select to authenticated
using (
  id=auth.uid()
  or (institucion_id=privado.mi_institucion() and (
       privado.mi_rol_activo()='admin'
       or privado.es_estudiante_de_mis_grupos(id)
  ))
  or (privado.mi_rol_activo()='docente' and privado.es_estudiante_de_mis_grupos(id))
);

-- 10. RLS DE DATOS EXISTENTES: estudiantes pueden consultar sus datos
-- aunque la institución del grupo sea distinta de la del perfil.
drop policy if exists "ver matriculas" on public.matriculas;
create policy "ver matriculas" on public.matriculas for select to authenticated
using (
  (privado.mi_rol_activo()='estudiante' and estudiante_id=auth.uid())
  or (institucion_id=privado.mi_institucion()
      and (privado.mi_rol_activo()='admin' or privado.es_docente_del_grupo(grupo_id)))
);
drop policy if exists "ver pagos" on public.pagos;
create policy "ver pagos" on public.pagos for select to authenticated
using (
  (privado.mi_rol_activo()='estudiante' and (
     estudiante_id=auth.uid()
     or (solicitud_id is not null and exists(
       select 1 from public.solicitudes_inscripcion s
       where s.id=solicitud_id and s.estudiante_id=auth.uid()
     ))
     or (matricula_id is not null and privado.es_mi_matricula(matricula_id))
     or (cuota_id is not null and exists(
       select 1 from public.cuotas q join public.matriculas m on m.id=q.matricula_id
       where q.id=cuota_id and m.estudiante_id=auth.uid()
     ))
  ))
  or (institucion_id=privado.mi_institucion() and privado.mi_rol_activo()='admin')
);
-- No se permite INSERT directo desde el cliente: la app usará RPC
-- protegidas para registrar solicitudes y comprobantes en la siguiente fase.
drop policy if exists "registrar pago" on public.pagos;
drop policy if exists "admin actualiza pagos" on public.pagos;
revoke insert on public.pagos from authenticated;
revoke update on public.pagos from authenticated;
-- V4 otorgó UPDATE por columnas: revocar explícitamente esos permisos.
revoke update (monto,metodo,fecha_pago,estado,comprobante_url)
  on public.pagos from authenticated;

-- Las políticas previas de lectura de otros módulos incluían una igualdad
-- de institución que impedía al alumno ver clases/calificaciones externas.
drop policy if exists "ver horarios" on public.horarios;
create policy "ver horarios" on public.horarios for select to authenticated
using (
  (privado.mi_rol_activo()='estudiante' and privado.estoy_matriculado_en(grupo_id))
  or (institucion_id=privado.mi_institucion() and
      (privado.mi_rol_activo()='admin' or privado.es_docente_del_grupo(grupo_id)))
);
drop policy if exists "ver evaluaciones" on public.evaluaciones;
create policy "ver evaluaciones" on public.evaluaciones for select to authenticated
using (
  (privado.mi_rol_activo()='estudiante' and privado.estoy_matriculado_en(grupo_id))
  or (institucion_id=privado.mi_institucion() and
      (privado.mi_rol_activo()='admin' or privado.es_docente_del_grupo(grupo_id)))
);
drop policy if exists "ver calificaciones" on public.calificaciones;
create policy "ver calificaciones" on public.calificaciones for select to authenticated
using (
  (privado.mi_rol_activo()='estudiante' and privado.es_mi_matricula(matricula_id))
  or (institucion_id=privado.mi_institucion() and
      (privado.mi_rol_activo()='admin' or privado.es_docente_del_grupo(grupo_id)))
);
drop policy if exists "ver certificados" on public.certificados;
create policy "ver certificados" on public.certificados for select to authenticated
using (
  (privado.mi_rol_activo()='estudiante' and privado.es_mi_matricula(matricula_id))
  or (institucion_id=privado.mi_institucion() and
      (privado.mi_rol_activo()='admin' or privado.es_docente_de_matricula(matricula_id)))
);

-- No se permite editar datos ajenos del estudiante a través de las
-- políticas administrativas V4: los administradores siguen aislados.

-- 11. RLS DE NUEVAS TABLAS. Solo consultas y gestión administrativa de
-- políticas/catálogos. Solicitudes y cuotas requieren RPC de negocio.
alter table public.politicas_institucion enable row level security;
alter table public.condiciones_curso enable row level security;
alter table public.plan_cuotas enable row level security;
alter table public.solicitudes_inscripcion enable row level security;
alter table public.cuotas enable row level security;

create policy "admin lee politicas" on public.politicas_institucion
for select to authenticated using(institucion_id=privado.mi_institucion() and privado.mi_rol_activo()='admin');
create policy "admin administra politicas" on public.politicas_institucion
for all to authenticated
using(institucion_id=privado.mi_institucion() and privado.mi_rol_activo()='admin')
with check(institucion_id=privado.mi_institucion() and privado.mi_rol_activo()='admin');
create policy "admin lee condiciones" on public.condiciones_curso
for select to authenticated using(institucion_id=privado.mi_institucion() and privado.mi_rol_activo()='admin');
create policy "admin administra condiciones" on public.condiciones_curso
for all to authenticated
using(institucion_id=privado.mi_institucion() and privado.mi_rol_activo()='admin')
with check(institucion_id=privado.mi_institucion() and privado.mi_rol_activo()='admin');
create policy "admin administra plan cuotas" on public.plan_cuotas
for all to authenticated
using(institucion_id=privado.mi_institucion() and privado.mi_rol_activo()='admin')
with check(institucion_id=privado.mi_institucion() and privado.mi_rol_activo()='admin');
create policy "ver solicitudes propias o institucionales" on public.solicitudes_inscripcion
for select to authenticated
using(estudiante_id=auth.uid() or
    (institucion_id=privado.mi_institucion() and privado.mi_rol_activo()='admin'));
create policy "ver cuotas propias o institucionales" on public.cuotas
for select to authenticated
using((institucion_id=privado.mi_institucion() and privado.mi_rol_activo()='admin')
 or (privado.mi_rol_activo()='estudiante' and exists(
  select 1 from public.matriculas m where m.id=matricula_id and m.estudiante_id=auth.uid()
 )));

-- La información PÚBLICA de condiciones se expone por vista de lectura
-- limitada a cursos publicados; no expone contratos privados o solicitudes.
create view public.oferta_condiciones
with (security_invoker=false) as
select cc.curso_id, cc.tipo_cobro, cc.matricula_importe, cc.importe_curso,
       cc.permite_reserva, cc.reserva_importe, cc.reserva_plazo_horas,
       cc.reserva_descuenta_matricula, cc.requisitos, cc.condiciones_especiales
from public.condiciones_curso cc
join public.oferta_cursos oc on oc.id=cc.curso_id;

-- 12. GRANTS. No hay acceso abierto a tablas financieras nuevas.
revoke all on public.politicas_institucion,public.condiciones_curso,
  public.plan_cuotas,public.solicitudes_inscripcion,public.cuotas
  from public,anon,authenticated;
grant select,insert,update,delete on public.politicas_institucion,
  public.condiciones_curso,public.plan_cuotas to authenticated;
grant select on public.solicitudes_inscripcion, public.cuotas to authenticated;
grant select on public.oferta_condiciones to anon,authenticated;
grant select on public.oferta_grupos to anon,authenticated;


-- 13. CORRECCIONES DE SEGURIDAD Y COMPATIBILIDAD.
-- El perfil global puede existir sin institución. El rol estudiante es global;
-- admin/docente conserva un único ámbito institucional en esta versión.
-- Regla: no permitir un rol estudiante vinculado a institución distinta del perfil
-- para proteger el contrato de clave compuesta heredado.

-- La administración de cuentas institucionales se mantiene en las funciones V4.
-- El registro público de estudiantes es un procedimiento separado.
create or replace function public.registrar_estudiante(
 p_nombres text, p_apellidos text, p_dni text default null, p_telefono text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := auth.uid();
begin
 if v_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
   raise exception 'Debes iniciar sesión con una cuenta verificada';
 end if;
 if nullif(trim(p_nombres),'') is null or nullif(trim(p_apellidos),'') is null then
   raise exception 'Nombres y apellidos son obligatorios';
 end if;
 if exists(select 1 from public.perfiles where id=v_id) then
   raise exception 'La cuenta ya tiene un perfil; no se puede registrar dos veces';
 end if;
 insert into public.perfiles(id,institucion_id,nombres,apellidos,dni,telefono,rol_activo)
 values(v_id,null,trim(p_nombres),trim(p_apellidos),nullif(trim(p_dni),''),nullif(trim(p_telefono),''),null);
 insert into public.usuario_roles(perfil_id,institucion_id,rol)
 values(v_id,null,'estudiante');
 update public.perfiles set rol_activo='estudiante' where id=v_id;
 return v_id;
end $$;

-- Los usuarios antiguos ligados a una institución pueden matricularse fuera
-- de ella; los usuarios globales tienen NULL institucion_id.
-- Mantener una asignación de estudiante por perfil durante V5.
-- La RPC heredada de matrícula directa sigue inaccesible.

-- 14. UN CUPO NO PUEDE QUEDAR RETENIDO POR DOS SOLICITUDES DE MATRÍCULA.
-- Una solicitud de pago de matrícula puede coexistir con la reserva del MISMO alumno.
drop index if exists public.solicitudes_pendientes_unicas_v5;
create unique index solicitudes_pendientes_por_tipo_v5
 on public.solicitudes_inscripcion(estudiante_id,grupo_id,tipo)
 where estado in ('pendiente','reservada');

-- La referencia bancaria o URL no equivale a dinero recibido.
-- Las RPC son el único medio autorizado para confirmar cobros.
create or replace function privado.admin_de_institucion(p_institucion uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(privado.mi_rol_activo()='admin'
   and privado.mi_institucion()=p_institucion,false)
$$;

-- Las cuotas con vencimiento determinado requieren un desplazamiento
-- desde la fecha de inicio (cada institución decide su calendario).
-- El plan debe estar listo antes de admitir una solicitud de matrícula.

-- 15. SOLICITUD DE RESERVA O MATRÍCULA (sin pago aprobado).
create or replace function public.crear_solicitud_inscripcion(
 p_grupo_id uuid, p_tipo text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_grupo public.grupos%rowtype;
 v_cond public.condiciones_curso%rowtype;
 v_id uuid; v_importe numeric(12,2); v_politicas text;
 v_reserva public.solicitudes_inscripcion%rowtype;
begin
 if auth.uid() is null or privado.mi_rol_activo() <> 'estudiante' then
   raise exception 'Necesitas una sesión con rol estudiante activo';
 end if;
 if p_tipo not in ('reserva','matricula') then raise exception 'Tipo de solicitud inválido'; end if;
 -- Bloqueo usado también por la revisión manual para evitar sobreventa.
 select * into v_grupo from public.grupos where id=p_grupo_id for update;
 if not found or v_grupo.estado <> 'abierto' then raise exception 'Grupo no disponible'; end if;
 if not exists(select 1 from public.cursos c where c.id=v_grupo.curso_id and c.estado='publicado') then
   raise exception 'Curso no publicado';
 end if;
 if v_grupo.docente_id=auth.uid() then raise exception 'No puedes inscribirte en tu propio grupo'; end if;
 if exists(select 1 from public.matriculas m join public.grupos g on g.id=m.grupo_id
    where m.estudiante_id=auth.uid() and g.curso_id=v_grupo.curso_id and m.estado='activa') then
   raise exception 'Ya tienes una matrícula activa en este curso';
 end if;
 select * into v_cond from public.condiciones_curso
 where curso_id=v_grupo.curso_id and institucion_id=v_grupo.institucion_id;
 if not found then raise exception 'La institución debe configurar las condiciones del curso'; end if;
 if p_tipo='reserva' then
   if not v_cond.permite_reserva then raise exception 'Este curso no ofrece reservas'; end if;
   v_importe:=v_cond.reserva_importe;
 else
   if v_cond.tipo_cobro='cuotas' and exists(
      select 1 from public.plan_cuotas pc
      where pc.curso_id=v_cond.curso_id and pc.dias_desde_inicio is null) then
     raise exception 'La institución debe definir las fechas de las cuotas';
   end if;
   if v_cond.tipo_cobro='cuotas' and v_cond.importe_curso>0 and not exists(
       select 1 from public.plan_cuotas pc where pc.curso_id=v_cond.curso_id) then
     raise exception 'Falta el cronograma de mensualidades';
   end if;
   v_importe:=v_cond.matricula_importe
      + case when v_cond.tipo_cobro='unico' then v_cond.importe_curso else 0 end;
   select * into v_reserva from public.solicitudes_inscripcion s
      where s.grupo_id=p_grupo_id and s.estudiante_id=auth.uid()
        and s.tipo='reserva' and s.estado='reservada' and s.reserva_vence_en>now()
      order by s.fecha_verificacion desc limit 1;
   if found and v_cond.reserva_descuenta_matricula then
     v_importe:=greatest(0,v_importe-v_reserva.importe_esperado);
   end if;
 end if;
 if privado.vacantes_disponibles(p_grupo_id) < 1
    and not (p_tipo='matricula' and v_reserva.id is not null) then
   raise exception 'No hay vacantes libres';
 end if;
 if exists(select 1 from public.solicitudes_inscripcion s
      where s.estudiante_id=auth.uid() and s.grupo_id=p_grupo_id and s.tipo=p_tipo
        and s.estado in ('pendiente','reservada')) then
    raise exception 'Ya existe una solicitud vigente de este tipo';
 end if;
 -- Una instantánea simple de condiciones; en la interfaz se mostrará el texto
 -- íntegro de políticas antes de llamar a esta RPC.
 select concat_ws(E'\n',coalesce(pi.texto_matricula,''),coalesce(pi.texto_reservas,''),
   coalesce(pi.texto_pagos,''),coalesce(pi.texto_devoluciones,''))
   into v_politicas from public.politicas_institucion pi
   where pi.institucion_id=v_grupo.institucion_id;
 insert into public.solicitudes_inscripcion
 (institucion_id,grupo_id,estudiante_id,tipo,importe_esperado,condiciones_aceptadas)
 values (v_grupo.institucion_id,p_grupo_id,auth.uid(),p_tipo,v_importe,
   concat_ws(E'\n',v_cond.requisitos,v_cond.condiciones_especiales,v_politicas))
 returning id into v_id;
 return v_id;
end $$;

-- 16. PRESENTACIÓN DE COMPROBANTE DE SOLICITUD / CUOTA.
-- Registrar la referencia NO equivale a aprobar el pago.
create or replace function public.presentar_comprobante(
 p_solicitud_id uuid default null,
 p_cuota_id uuid default null,
 p_monto numeric default null,
 p_metodo text default null,
 p_referencia text default null,
 p_comprobante_path text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_inst uuid; v_esperado numeric(12,2); v_pago uuid; v_estudiante uuid;
 v_s public.solicitudes_inscripcion%rowtype;
 v_q public.cuotas%rowtype;
begin
 if privado.mi_rol_activo()<>'estudiante' then raise exception 'Solo estudiantes pueden presentar sus pagos'; end if;
 if (p_solicitud_id is null)=(p_cuota_id is null) then
  raise exception 'Indica exactamente una solicitud o una cuota'; end if;
 if nullif(trim(coalesce(p_metodo,'')),'') is null or
    nullif(trim(coalesce(p_referencia,'')),'') is null or
    nullif(trim(coalesce(p_comprobante_path,'')),'') is null then
   raise exception 'Método, referencia y comprobante son obligatorios';
 end if;
 if p_comprobante_path not like auth.uid()::text || '/%' then
   raise exception 'El archivo debe estar en la carpeta privada del estudiante';
 end if;
 -- Nota: la existencia/propiedad real del objeto se valida en Storage.
 if p_solicitud_id is not null then
   select * into v_s from public.solicitudes_inscripcion where id=p_solicitud_id for update;
   if not found or v_s.estudiante_id<>auth.uid() or v_s.estado<>'pendiente' then
     raise exception 'Solicitud no disponible para comprobante';
   end if;
   v_inst:=v_s.institucion_id; v_esperado:=v_s.importe_esperado;
 else
   select * into v_q from public.cuotas where id=p_cuota_id for update;
   if not found or v_q.estado not in ('pendiente','parcial') or not exists (
      select 1 from public.matriculas m where m.id=v_q.matricula_id
       and m.estudiante_id=auth.uid() and m.estado='activa') then
     raise exception 'La cuota no pertenece a una matrícula activa de esta cuenta';
   end if;
   v_inst:=v_q.institucion_id;
   v_esperado:=v_q.importe - coalesce((select sum(p.monto) from public.pagos p
      where p.cuota_id=v_q.id and p.estado='pagado'),0);
 end if;
 if p_monto is null or p_monto<=0 or p_monto>v_esperado then
   raise exception 'Importe fuera del saldo permitido';
 end if;
 if p_solicitud_id is not null and p_monto<>v_esperado then
   raise exception 'El pago inicial debe coincidir con el importe solicitado';
 end if;
 if exists (select 1 from public.pagos p where p.estado='pendiente' and
  ((p_solicitud_id is not null and p.solicitud_id=p_solicitud_id)
   or (p_cuota_id is not null and p.cuota_id=p_cuota_id))) then
   raise exception 'Ya existe un comprobante pendiente de revisión';
 end if;
 insert into public.pagos(institucion_id,solicitud_id,cuota_id,estudiante_id,
 monto,metodo,estado,comprobante_url,referencia_operacion)
 values(v_inst,p_solicitud_id,p_cuota_id,auth.uid(),p_monto,trim(p_metodo),
 'pendiente',p_comprobante_path,trim(p_referencia)) returning id into v_pago;
 return v_pago;
end $$;

-- 17. APROBACIÓN / RECHAZO EN UNA ÚNICA TRANSACCIÓN.
-- Bloquea grupo antes de confirmar cupo. No libera ni consume cupo por imagen subida.
create or replace function public.revisar_pago(
 p_pago_id uuid, p_aprobar boolean, p_observacion text default null
) returns text language plpgsql security definer set search_path='' as $$
declare v_p public.pagos%rowtype; v_s public.solicitudes_inscripcion%rowtype;
 v_q public.cuotas%rowtype; v_g public.grupos%rowtype; v_cond public.condiciones_curso%rowtype;
 v_matricula uuid; v_reserva public.solicitudes_inscripcion%rowtype;
 v_pagos numeric(12,2); v_n integer;
begin
 -- Primero ubica la institución; después bloquea de forma consistente.
 select * into v_p from public.pagos where id=p_pago_id;
 if not found or not privado.admin_de_institucion(v_p.institucion_id) then
   raise exception 'Pago inexistente o sin autorización';
 end if;
 if v_p.solicitud_id is not null then
   select * into v_s from public.solicitudes_inscripcion where id=v_p.solicitud_id;
   if not found then raise exception 'Solicitud inexistente'; end if;
   select * into v_g from public.grupos where id=v_s.grupo_id for update;
 end if;
 select * into v_p from public.pagos where id=p_pago_id for update;
 if v_p.estado<>'pendiente' then raise exception 'El pago ya fue revisado'; end if;
 if not p_aprobar then
   update public.pagos set estado='rechazado',verificado_por=auth.uid(),
       verificado_en=now(),observacion=p_observacion where id=p_pago_id;
   return 'rechazado';
 end if;
 if nullif(v_p.comprobante_url,'') is null or nullif(v_p.referencia_operacion,'') is null then
   raise exception 'No se puede aprobar un pago sin referencia y comprobante';
 end if;
 if v_p.solicitud_id is not null then
   select * into v_s from public.solicitudes_inscripcion where id=v_p.solicitud_id for update;
   if v_s.estado<>'pendiente' then raise exception 'La solicitud ya no está pendiente'; end if;
   select * into v_cond from public.condiciones_curso where curso_id=v_g.curso_id;
   if v_p.monto<>v_s.importe_esperado then raise exception 'Monto incorrecto'; end if;
   if v_s.tipo='reserva' then
     if v_cond.reserva_plazo_horas is null then raise exception 'No hay plazo de reserva configurado'; end if;
     if privado.vacantes_disponibles(v_g.id)<1 then raise exception 'Sin vacantes para reserva'; end if;
     update public.solicitudes_inscripcion
      set estado='reservada',fecha_verificacion=now(),
          reserva_vence_en=now()+make_interval(hours=>v_cond.reserva_plazo_horas)
      where id=v_s.id;
   else
     if exists(select 1 from public.matriculas m join public.grupos g on g.id=m.grupo_id
       where m.estudiante_id=v_s.estudiante_id and g.curso_id=v_g.curso_id and m.estado='activa') then
       raise exception 'Ya tiene matrícula activa en este curso';
     end if;
     select * into v_reserva from public.solicitudes_inscripcion r
       where r.estudiante_id=v_s.estudiante_id and r.grupo_id=v_s.grupo_id
         and r.tipo='reserva' and r.estado='reservada' and r.reserva_vence_en>now()
       order by r.fecha_verificacion desc limit 1 for update;
     if privado.vacantes_disponibles(v_g.id)<1 and v_reserva.id is null then
       raise exception 'Sin vacantes para confirmar matrícula'; end if;
     insert into public.matriculas(institucion_id,grupo_id,estudiante_id)
       values(v_g.institucion_id,v_g.id,v_s.estudiante_id) returning id into v_matricula;
     -- La reserva anterior de esta misma persona deja de consumir otro cupo.
     if v_reserva.id is not null then
       update public.solicitudes_inscripcion set estado='matriculada',matricula_id=v_matricula
        where id=v_reserva.id;
     end if;
     update public.solicitudes_inscripcion set estado='matriculada',
        fecha_verificacion=now(),matricula_id=v_matricula where id=v_s.id;
     -- Cuotas con valores congelados en la fecha de confirmación.
     if v_cond.tipo_cobro='cuotas' then
       insert into public.cuotas(institucion_id,matricula_id,numero,concepto,importe,vencimiento)
       select v_g.institucion_id,v_matricula,pc.numero,pc.concepto,pc.importe,
              v_g.fecha_inicio+pc.dias_desde_inicio
       from public.plan_cuotas pc where pc.curso_id=v_g.curso_id;
     end if;
   end if;
 elsif v_p.cuota_id is not null then
   select * into v_q from public.cuotas where id=v_p.cuota_id for update;
   if v_q.estado not in ('pendiente','parcial') then raise exception 'Cuota ya cerrada'; end if;
   select coalesce(sum(monto),0) into v_pagos from public.pagos
       where cuota_id=v_q.id and estado='pagado';
   if v_p.monto>v_q.importe-v_pagos then raise exception 'El pago excede el saldo de la cuota'; end if;
   update public.cuotas set estado=case when v_pagos+v_p.monto>=v_q.importe
             then 'pagada' else 'parcial' end where id=v_q.id;
 else
   raise exception 'El pago no tiene un destino compatible con V5';
 end if;
 update public.pagos set estado='pagado',verificado_por=auth.uid(),
   verificado_en=now(),observacion=p_observacion where id=p_pago_id;
 return 'pagado';
end $$;

-- 18. CANCELACIÓN DE SOLICITUD PROPIA.
create or replace function public.cancelar_solicitud(p_solicitud_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_s public.solicitudes_inscripcion%rowtype;
begin
 select * into v_s from public.solicitudes_inscripcion where id=p_solicitud_id;
 if not found or (v_s.estudiante_id<>auth.uid() and
       not privado.admin_de_institucion(v_s.institucion_id)) then
   raise exception 'Solicitud inaccesible';
 end if;
 perform 1 from public.grupos where id=v_s.grupo_id for update;
 select * into v_s from public.solicitudes_inscripcion where id=p_solicitud_id for update;
 if v_s.estado not in ('pendiente','reservada') then raise exception 'No se puede cancelar este estado'; end if;
 if exists(select 1 from public.pagos where solicitud_id=v_s.id and estado='pendiente') then
   raise exception 'Hay un pago bajo revisión; solicite la revisión institucional';
 end if;
 update public.solicitudes_inscripcion set estado='cancelada' where id=v_s.id;
 -- La devolución de un pago confirmado se tramita por proceso administrativo;
 -- cancelar la reserva no genera automáticamente devolución.
end $$;

-- 19. CONSULTA PÚBLICA DE POLÍTICAS (solo textos institucionales publicados).
-- La institución puede gestionar sus textos vía RLS; no se exponen datos privados.
create view public.oferta_politicas_institucion with (security_invoker=false) as
 select i.id as institucion_id, p.texto_matricula,p.texto_reservas,
   p.texto_pagos,p.texto_devoluciones,p.texto_morosidad
 from public.instituciones i join public.politicas_institucion p on p.institucion_id=i.id
 where i.activo;

-- Impedir UPDATE directo del alumno y comprobante a través de GRANT heredados.
revoke execute on function public.registrar_estudiante(text,text,text,text) from public,anon;
revoke execute on function public.crear_solicitud_inscripcion(uuid,text) from public,anon;
revoke execute on function public.presentar_comprobante(uuid,uuid,numeric,text,text,text) from public,anon;
revoke execute on function public.revisar_pago(uuid,boolean,text) from public,anon;
revoke execute on function public.cancelar_solicitud(uuid) from public,anon;
grant execute on function public.registrar_estudiante(text,text,text,text) to authenticated;
grant execute on function public.crear_solicitud_inscripcion(uuid,text) to authenticated;
grant execute on function public.presentar_comprobante(uuid,uuid,numeric,text,text,text) to authenticated;
grant execute on function public.revisar_pago(uuid,boolean,text) to authenticated;
grant execute on function public.cancelar_solicitud(uuid) to authenticated;
grant select on public.oferta_politicas_institucion to anon,authenticated;

-- 20. RECORDATORIO: Supabase Storage requiere bucket privado y RLS específica.
-- No declarar aprobado ningún comprobante antes de comprobar recepción bancaria.
-- Las políticas de reembolso son individuales y deben respetar la normativa aplicable.


-- 21. ARCHIVOS DE COMPROBANTES: BUCKET PRIVADO.
-- Cada archivo debe ubicarse en ruta: <auth.uid()>/<nombre-aleatorio>.pdf|jpg|png
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('comprobantes-cursos-v5','comprobantes-cursos-v5',false,5242880,
 array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;

create policy "v5 subir mis comprobantes" on storage.objects
for insert to authenticated
with check (bucket_id='comprobantes-cursos-v5'
 and (storage.foldername(name))[1]=auth.uid()::text);

create policy "v5 leer mis comprobantes" on storage.objects
for select to authenticated
using (bucket_id='comprobantes-cursos-v5'
 and ((storage.foldername(name))[1]=auth.uid()::text
  or exists(select 1 from public.pagos p
     where p.comprobante_url=name
      and privado.admin_de_institucion(p.institucion_id))));

-- El verificador debe comprobar el archivo físicamente y contrastar
-- fecha/referencia/monto con su cuenta bancaria antes de aprobarlo.
-- Se sustituye la función de presentación anterior para validar Storage.
create or replace function public.presentar_comprobante(
 p_solicitud_id uuid default null,
 p_cuota_id uuid default null,
 p_monto numeric default null,
 p_metodo text default null,
 p_referencia text default null,
 p_comprobante_path text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_inst uuid; v_esperado numeric(12,2); v_pago uuid;
 v_s public.solicitudes_inscripcion%rowtype;
 v_q public.cuotas%rowtype;
begin
 if privado.mi_rol_activo()<>'estudiante' then raise exception 'Solo estudiantes pueden presentar sus pagos'; end if;
 if (p_solicitud_id is null)=(p_cuota_id is null) then
   raise exception 'Indica exactamente una solicitud o una cuota'; end if;
 if nullif(trim(coalesce(p_metodo,'')),'') is null or
    nullif(trim(coalesce(p_referencia,'')),'') is null or
    nullif(trim(coalesce(p_comprobante_path,'')),'') is null then
   raise exception 'Método, referencia y comprobante son obligatorios';
 end if;
 if p_comprobante_path not like auth.uid()::text || '/%' then
   raise exception 'El archivo debe estar en tu carpeta privada'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='comprobantes-cursos-v5'
       and o.name=p_comprobante_path) then
   raise exception 'No se encontró el comprobante en Storage'; end if;
 if p_solicitud_id is not null then
   select * into v_s from public.solicitudes_inscripcion where id=p_solicitud_id for update;
   if not found or v_s.estudiante_id<>auth.uid() or v_s.estado<>'pendiente' then
     raise exception 'Solicitud no disponible para comprobante'; end if;
   v_inst:=v_s.institucion_id; v_esperado:=v_s.importe_esperado;
 else
   select * into v_q from public.cuotas where id=p_cuota_id for update;
   if not found or v_q.estado not in ('pendiente','parcial') or not exists (
      select 1 from public.matriculas m where m.id=v_q.matricula_id
       and m.estudiante_id=auth.uid() and m.estado='activa') then
     raise exception 'La cuota no pertenece a una matrícula activa de esta cuenta'; end if;
   v_inst:=v_q.institucion_id;
   v_esperado:=v_q.importe-coalesce((select sum(p.monto) from public.pagos p
      where p.cuota_id=v_q.id and p.estado='pagado'),0);
 end if;
 if p_monto is null or p_monto<=0 or p_monto>v_esperado then
   raise exception 'Importe fuera del saldo permitido'; end if;
 if p_solicitud_id is not null and p_monto<>v_esperado then
   raise exception 'El pago inicial debe coincidir con el importe solicitado'; end if;
 if exists (select 1 from public.pagos p where p.estado='pendiente' and
  ((p_solicitud_id is not null and p.solicitud_id=p_solicitud_id)
   or (p_cuota_id is not null and p.cuota_id=p_cuota_id))) then
   raise exception 'Ya existe un comprobante pendiente de revisión'; end if;
 insert into public.pagos(institucion_id,solicitud_id,cuota_id,estudiante_id,
 monto,metodo,estado,comprobante_url,referencia_operacion)
 values(v_inst,p_solicitud_id,p_cuota_id,auth.uid(),p_monto,trim(p_metodo),
 'pendiente',p_comprobante_path,trim(p_referencia)) returning id into v_pago;
 return v_pago;
end $$;

-- 22. MATRÍCULA SIN COBRO SI EL IMPORTE INICIAL CONFIGURADO ES CERO.
-- También sirve cuando una reserva confirmada cubrió todo el pago inicial.
create or replace function public.confirmar_matricula_sin_saldo(p_solicitud_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_s public.solicitudes_inscripcion%rowtype; v_g public.grupos%rowtype;
 v_cond public.condiciones_curso%rowtype; v_reserva public.solicitudes_inscripcion%rowtype;
 v_m uuid;
begin
 if privado.mi_rol_activo()<>'estudiante' then raise exception 'Se requiere rol estudiante'; end if;
 select * into v_s from public.solicitudes_inscripcion where id=p_solicitud_id;
 if not found or v_s.estudiante_id<>auth.uid() or v_s.tipo<>'matricula' then
    raise exception 'Solicitud inválida'; end if;
 select * into v_g from public.grupos where id=v_s.grupo_id for update;
 select * into v_s from public.solicitudes_inscripcion where id=p_solicitud_id for update;
 if v_s.estado<>'pendiente' or v_s.importe_esperado<>0 then
    raise exception 'Solo se admiten solicitudes pendientes con saldo inicial cero'; end if;
 if not exists(select 1 from public.cursos where id=v_g.curso_id and estado='publicado')
    or v_g.estado<>'abierto' then raise exception 'Curso o grupo no disponible'; end if;
 if exists(select 1 from public.matriculas m join public.grupos g on g.id=m.grupo_id
    where m.estudiante_id=auth.uid() and g.curso_id=v_g.curso_id and m.estado='activa') then
   raise exception 'Ya tienes matrícula activa en el curso'; end if;
 select * into v_reserva from public.solicitudes_inscripcion r
 where r.estudiante_id=auth.uid() and r.grupo_id=v_g.id and r.tipo='reserva'
  and r.estado='reservada' and r.reserva_vence_en>now()
 order by r.fecha_verificacion desc limit 1 for update;
 if privado.vacantes_disponibles(v_g.id)<1 and v_reserva.id is null then
   raise exception 'No hay vacantes disponibles'; end if;
 insert into public.matriculas(institucion_id,grupo_id,estudiante_id)
 values(v_g.institucion_id,v_g.id,auth.uid()) returning id into v_m;
 if v_reserva.id is not null then
  update public.solicitudes_inscripcion set estado='matriculada',matricula_id=v_m
  where id=v_reserva.id;
 end if;
 update public.solicitudes_inscripcion set estado='matriculada',matricula_id=v_m,
 fecha_verificacion=now() where id=v_s.id;
 select * into v_cond from public.condiciones_curso where curso_id=v_g.curso_id;
 if v_cond.tipo_cobro='cuotas' then
   insert into public.cuotas(institucion_id,matricula_id,numero,concepto,importe,vencimiento)
   select v_g.institucion_id,v_m,pc.numero,pc.concepto,pc.importe,
     v_g.fecha_inicio+pc.dias_desde_inicio
   from public.plan_cuotas pc where pc.curso_id=v_g.curso_id;
 end if;
 return v_m;
end $$;
revoke execute on function public.confirmar_matricula_sin_saldo(uuid) from public,anon;
grant execute on function public.confirmar_matricula_sin_saldo(uuid) to authenticated;

commit;

-- POSTERIOR A ESTA MIGRACIÓN:
-- 1. Probar en una copia real de Supabase; este script NO fue ejecutado allí.
-- 2. Verificar privilegios RLS con cuentas estudiante/admin/otra institución.
-- 3. Verificar manualmente la recepción del dinero antes de revisar_pago(...,true).
-- 4. No activar botones productivos hasta pruebas de concurrencia, reversión,
--    aceptación de condiciones, integridad de cuotas y devolución de pagos.
-- 5. La función heredada public.matricular() permanece sin EXECUTE público.
