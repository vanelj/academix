-- =====================================================================
-- ACADEMIX | MIGRACIÓN DEFINITIVA (NO EJECUTADA) — Certificados personalizables
-- Orden: DESPUÉS de medios_cobro_v5 (aplicada) y evaluaciones_admin_v5.
--
-- QUÉ REUTILIZA DE V5
--   public.certificados (id, institucion_id, matricula_id UNIQUE, codigo
--   UNIQUE de 12 caracteres, fecha_emision, archivo_url). Sin UPDATE ni
--   DELETE para authenticated: un certificado emitido no se modifica.
--   Disparador validar_certificado: solo matrícula activa y aprobada.
--
-- QUÉ AÑADE (todo nuevo; no modifica tablas ni funciones existentes)
--   1. certificacion_curso: modalidad por curso (sin certificado, gratuito,
--      incluido en el precio, costo adicional), importe, nota mínima, horas
--      académicas declaradas, requisitos adicionales, plantilla y firmante.
--      Vista pública oferta_certificacion para mostrarlo antes de inscribirse.
--   2. plantillas_certificado: varias por institución; base de Academix
--      (clasico, ornamental, moderno) o fondo propio (PNG/JPG/PDF). Los campos
--      y sus posiciones se guardan como JSON estructurado (diseno), en
--      coordenadas relativas 0–1: independientes de la imagen y aptos para
--      que en el futuro una IA proponga posiciones sin rehacer el editor.
--   3. firmantes_certificado: nombre, cargo y firma (imagen) de personas que
--      la institución declara autorizadas. Solo archivos de su carpeta.
--   4. Buckets PRIVADOS:
--        certificados-recursos  <institucion>/fondos|firmas/<uuid>.<ext>
--        certificados-emitidos  <institucion>/<certificado_id>.pdf
--      Sin políticas UPDATE/DELETE: los archivos son inmutables, así un
--      certificado emitido nunca pierde su fondo, su firma ni su PDF.
--   5. certificados_contenido: copia FIJA de los datos y del diseño en el
--      momento de la emisión (lo que se imprimió). Sin escritura directa.
--   6. Pago del certificado con costo adicional, SEPARADO de los pagos de
--      V5 (presentar_comprobante y revisar_pago no admiten este concepto):
--        solicitudes_certificado + pagos_certificado y las funciones
--        solicitar_certificado, presentar_comprobante_certificado y
--        revisar_pago_certificado (transaccionales, con bloqueos).
--      El comprobante va al bucket V5 comprobantes-cursos-v5 (carpeta del
--      estudiante); se añade una política de LECTURA para el administrador.
--   7. emitir_certificado: comprueba requisitos en la BD y registra la
--      emisión con su copia fija. adjuntar_pdf_certificado: enlaza el PDF
--      generado (una sola vez).
--   8. verificar_certificado(codigo): consulta pública mínima (nombre del
--      titular, curso, institución, fecha y horas). Sin DNI, contacto, pagos
--      ni notas.
--   9. mis_certificados(): estado de certificación del propio estudiante.
--  10. Evento de correo "certificado_emitido": se encola cuando el PDF queda
--      ADJUNTO (no al emitir), y solo si la migración de correos está aplicada.
--  11. Endurecimiento de V5: se retira el INSERT directo en public.certificados
--      (V4 lo concedía al admin y permitía emitir sin requisitos económicos ni
--      copia fija). Desde aquí, solo emitir_certificado crea certificados.
--
-- DISPONIBILIDAD DEL PDF
--   Un certificado sin archivo_url NO está disponible para descarga: el
--   estudiante ve «PDF en preparación», la descarga devuelve aviso y no se
--   envía correo. adjuntar_pdf_certificado solo acepta un PDF real (tipo y
--   tamaño) en <institucion>/<certificado_id>.pdf, una única vez; la política
--   de Storage solo permite subir esa ruta exacta mientras falte el PDF.
--
-- REQUISITOS QUE SE COMPRUEBAN AL EMITIR (en la BD, no en el navegador)
--   - Administrador activo de la institución de la matrícula.
--   - Matrícula activa con estado_final = 'aprobado' (además del disparador V5).
--   - El curso ofrece certificado (modalidad distinta de sin_certificado).
--   - Nota mínima del curso, si se configuró: promedio ponderado calculado
--     con las notas reales (pesos = 100 % y todas registradas).
--   - Costo adicional: solicitud de certificado 'pagada' (pago verificado).
--   - Un solo certificado por matrícula (UNIQUE de V5 + bloqueo).
--   La asistencia NO se exige: V5 no la registra.
--
-- Idempotente. Reversión al final. CÓMO APLICAR: revisar y ejecutar en
-- Supabase > SQL Editor; después ejecutar la VERIFICACIÓN.
-- =====================================================================

begin;

-- 0. REQUISITOS --------------------------------------------------------
do $$ begin
  if to_regprocedure('privado.admin_de_institucion(uuid)') is null
     or to_regprocedure('privado.mi_rol_activo()') is null
     or to_regprocedure('privado.mi_institucion()') is null then
    raise exception 'Requisito: faltan funciones privado.admin_de_institucion / mi_rol_activo / mi_institucion';
  end if;
  if to_regclass('public.certificados') is null or to_regclass('public.oferta_cursos') is null then
    raise exception 'Requisito: faltan public.certificados u oferta_cursos';
  end if;
  -- "on delete set null (columna)" requiere PostgreSQL 15 o superior.
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Requisito: PostgreSQL 15 o superior (actual: %)', current_setting('server_version');
  end if;
  -- La emisión confía en que estado_final solo cambie con registrar_resultado_final.
  if to_regclass('public.historial_resultados') is null
     or has_column_privilege('authenticated', 'public.matriculas', 'estado_final', 'UPDATE') then
    raise exception 'Requisito: aplica antes evaluaciones_admin_v5.sql (resultado final calculado y sin UPDATE directo)';
  end if;
  if to_regclass('public.medios_cobro_institucion') is null then
    raise notice 'AVISO: medios_cobro_v5 no está aplicada; el estudiante no verá medios de cobro para el certificado.';
  end if;
end $$;

-- 1. PLANTILLAS Y FIRMANTES (antes que certificacion_curso, por sus FK) ---
create table if not exists public.plantillas_certificado (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones(id),
  nombre          text not null check (length(trim(nombre)) between 1 and 100),
  base            text not null check (base in ('clasico','ornamental','moderno','propia')),
  fondo_path      text,
  fondo_tipo      text check (fondo_tipo is null or fondo_tipo in ('image/png','image/jpeg','application/pdf')),
  diseno          jsonb not null default '{}'::jsonb check (octet_length(diseno::text) <= 30000),
  predeterminada  boolean not null default false,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (id, institucion_id),
  check (base <> 'propia' or (fondo_path is not null and fondo_tipo is not null)),
  check (fondo_path is null or fondo_path like institucion_id::text || '/fondos/%')
);
create unique index if not exists plantillas_certificado_predeterminada_idx
  on public.plantillas_certificado (institucion_id) where predeterminada;

create table if not exists public.firmantes_certificado (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones(id),
  nombre          text not null check (length(trim(nombre)) between 3 and 150),
  cargo           text not null check (length(trim(cargo)) between 2 and 150),
  firma_path      text check (firma_path is null or firma_path like institucion_id::text || '/firmas/%'),
  activo          boolean not null default true,
  -- Quién declaró que la persona autorizó el uso de su nombre y firma.
  declarado_por   uuid not null default auth.uid(),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (id, institucion_id)
);

-- 2. CERTIFICACIÓN POR CURSO ----------------------------------------------
create table if not exists public.certificacion_curso (
  curso_id                uuid primary key,
  institucion_id          uuid not null,
  modalidad               text not null default 'sin_certificado'
                            check (modalidad in ('sin_certificado','gratuito','incluido','costo_adicional')),
  importe                 numeric(12,2) not null default 0 check (importe >= 0),
  nota_minima             numeric(4,2) check (nota_minima is null or nota_minima between 0 and 20),
  horas_academicas        integer check (horas_academicas is null or horas_academicas between 1 and 10000),
  requisitos_adicionales  text check (requisitos_adicionales is null or length(requisitos_adicionales) <= 2000),
  plantilla_id            uuid,
  firmante_id             uuid,
  actualizado_en          timestamptz not null default now(),
  foreign key (curso_id, institucion_id) references public.cursos(id, institucion_id),
  foreign key (plantilla_id, institucion_id) references public.plantillas_certificado(id, institucion_id) on delete set null (plantilla_id),
  foreign key (firmante_id, institucion_id) references public.firmantes_certificado(id, institucion_id) on delete set null (firmante_id),
  check ((modalidad = 'costo_adicional') = (importe > 0))
);

-- Vista pública: condiciones de certificación de cursos publicados.
create or replace view public.oferta_certificacion with (security_invoker = false) as
select cc.curso_id, cc.modalidad, cc.importe, cc.nota_minima, cc.horas_academicas, cc.requisitos_adicionales
from public.certificacion_curso cc
join public.oferta_cursos oc on oc.id = cc.curso_id;

-- 3. CONTENIDO FIJO DEL CERTIFICADO EMITIDO --------------------------------
create table if not exists public.certificados_contenido (
  certificado_id  uuid primary key references public.certificados(id),
  institucion_id  uuid not null references public.instituciones(id),
  datos           jsonb not null,
  diseno          jsonb not null,
  plantilla_base  text not null,
  fondo_path      text,
  fondo_tipo      text,
  firma_path      text,
  version_render  integer not null default 1,
  emitido_por     uuid not null,
  creado_en       timestamptz not null default now()
);

-- 4. PAGO DEL CERTIFICADO CON COSTO ADICIONAL ------------------------------
create table if not exists public.solicitudes_certificado (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones(id),
  matricula_id    uuid not null unique references public.matriculas(id),
  estudiante_id   uuid not null references public.perfiles(id),
  importe         numeric(12,2) not null check (importe > 0),
  estado          text not null default 'pendiente' check (estado in ('pendiente','pagada','anulada')),
  creado_en       timestamptz not null default now(),
  pagada_en       timestamptz,
  unique (id, institucion_id)
);

create table if not exists public.pagos_certificado (
  id                    uuid primary key default gen_random_uuid(),
  institucion_id        uuid not null,
  solicitud_id          uuid not null,
  estudiante_id         uuid not null references public.perfiles(id),
  monto                 numeric(12,2) not null check (monto > 0),
  metodo                text not null check (length(trim(metodo)) between 2 and 60),
  referencia_operacion  text not null check (length(trim(referencia_operacion)) between 4 and 40),
  comprobante_url       text not null,
  estado                public.estado_pago not null default 'pendiente',
  observacion           text check (observacion is null or length(observacion) <= 500),
  fecha_pago            timestamptz not null default now(),
  verificado_por        uuid,
  verificado_en         timestamptz,
  foreign key (solicitud_id, institucion_id) references public.solicitudes_certificado(id, institucion_id)
);
create unique index if not exists pagos_certificado_un_pendiente_idx
  on public.pagos_certificado (solicitud_id) where estado = 'pendiente';

-- 5. RLS Y PERMISOS DE TABLAS ---------------------------------------------
alter table public.plantillas_certificado enable row level security;
alter table public.firmantes_certificado enable row level security;
alter table public.certificacion_curso enable row level security;
alter table public.certificados_contenido enable row level security;
alter table public.solicitudes_certificado enable row level security;
alter table public.pagos_certificado enable row level security;

revoke all on table public.plantillas_certificado, public.firmantes_certificado, public.certificacion_curso,
  public.certificados_contenido, public.solicitudes_certificado, public.pagos_certificado
  from public, anon, authenticated;
grant select, insert, update, delete on table public.plantillas_certificado, public.firmantes_certificado,
  public.certificacion_curso to authenticated;
grant select on table public.certificados_contenido, public.solicitudes_certificado, public.pagos_certificado to authenticated;
grant select on public.oferta_certificacion to anon, authenticated;

drop policy if exists "v5 admin gestiona plantillas de certificado" on public.plantillas_certificado;
create policy "v5 admin gestiona plantillas de certificado" on public.plantillas_certificado
  for all to authenticated
  using (privado.admin_de_institucion(institucion_id)) with check (privado.admin_de_institucion(institucion_id));

drop policy if exists "v5 admin gestiona firmantes" on public.firmantes_certificado;
create policy "v5 admin gestiona firmantes" on public.firmantes_certificado
  for all to authenticated
  using (privado.admin_de_institucion(institucion_id)) with check (privado.admin_de_institucion(institucion_id));

drop policy if exists "v5 admin gestiona certificacion de cursos" on public.certificacion_curso;
create policy "v5 admin gestiona certificacion de cursos" on public.certificacion_curso
  for all to authenticated
  using (privado.admin_de_institucion(institucion_id)) with check (privado.admin_de_institucion(institucion_id));

-- Solo el administrador: contiene rutas privadas de fondo y firma. El estudiante
-- usa mis_certificados() y descarga su PDF; no necesita la copia interna.
drop policy if exists "v5 ver contenido de certificados" on public.certificados_contenido;
create policy "v5 ver contenido de certificados" on public.certificados_contenido
  for select to authenticated
  using (privado.admin_de_institucion(institucion_id));

drop policy if exists "v5 ver solicitudes de certificado" on public.solicitudes_certificado;
create policy "v5 ver solicitudes de certificado" on public.solicitudes_certificado
  for select to authenticated
  using (privado.admin_de_institucion(institucion_id)
         or (estudiante_id = auth.uid() and privado.mi_rol_activo() = 'estudiante'));

drop policy if exists "v5 ver pagos de certificado" on public.pagos_certificado;
create policy "v5 ver pagos de certificado" on public.pagos_certificado
  for select to authenticated
  using (privado.admin_de_institucion(institucion_id)
         or (estudiante_id = auth.uid() and privado.mi_rol_activo() = 'estudiante'));

-- 6. STORAGE --------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificados-recursos', 'certificados-recursos', false, 5242880, array['image/png','image/jpeg','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificados-emitidos', 'certificados-emitidos', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "v5 recursos: admin sube a su carpeta" on storage.objects;
create policy "v5 recursos: admin sube a su carpeta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'certificados-recursos' and privado.mi_rol_activo() = 'admin'
              and (storage.foldername(name))[1] = privado.mi_institucion()::text
              and (storage.foldername(name))[2] in ('fondos','firmas'));
drop policy if exists "v5 recursos: admin lee su carpeta" on storage.objects;
create policy "v5 recursos: admin lee su carpeta" on storage.objects
  for select to authenticated
  using (bucket_id = 'certificados-recursos' and privado.mi_rol_activo() = 'admin'
         and (storage.foldername(name))[1] = privado.mi_institucion()::text);

-- Solo la ruta exacta <institucion>/<id>.pdf de un certificado propio que aún no tiene PDF.
drop policy if exists "v5 emitidos: admin sube a su carpeta" on storage.objects;
create policy "v5 emitidos: admin sube a su carpeta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'certificados-emitidos' and privado.mi_rol_activo() = 'admin'
              and exists (select 1 from public.certificados c
                          where c.institucion_id = privado.mi_institucion() and c.archivo_url is null
                            and name = c.institucion_id::text || '/' || c.id::text || '.pdf'));
drop policy if exists "v5 emitidos: leer propios" on storage.objects;
create policy "v5 emitidos: leer propios" on storage.objects
  for select to authenticated
  using (bucket_id = 'certificados-emitidos' and (
          (privado.mi_rol_activo() = 'admin' and (storage.foldername(name))[1] = privado.mi_institucion()::text)
          or exists (select 1 from public.certificados c join public.matriculas m on m.id = c.matricula_id
                     where c.archivo_url = name and m.estudiante_id = auth.uid()
                       and privado.mi_rol_activo() = 'estudiante')));

drop policy if exists "v5 admin lee comprobantes de certificados" on storage.objects;
create policy "v5 admin lee comprobantes de certificados" on storage.objects
  for select to authenticated
  using (bucket_id = 'comprobantes-cursos-v5'
         and exists (select 1 from public.pagos_certificado p
                     where p.comprobante_url = name and privado.admin_de_institucion(p.institucion_id)));

-- Si la migración medios_cobro_v5 está aplicada: el estudiante con un
-- certificado por pagar también ve los medios ACTIVOS de esa institución.
do $$ begin
  if to_regclass('public.medios_cobro_institucion') is not null then
    execute 'drop policy if exists "v5 estudiante ve medios para pagar certificado" on public.medios_cobro_institucion';
    execute $p$create policy "v5 estudiante ve medios para pagar certificado" on public.medios_cobro_institucion
      for select to authenticated
      using (activo and privado.mi_rol_activo() = 'estudiante'
             and exists (select 1 from public.solicitudes_certificado s
                         where s.institucion_id = medios_cobro_institucion.institucion_id
                           and s.estudiante_id = auth.uid() and s.estado = 'pendiente'))$p$;
  end if;
end $$;

-- 7. AUXILIAR: promedio ponderado real (null si incompleto) -----------------
create or replace function privado.promedio_matricula(p_matricula uuid)
returns numeric
language sql stable security definer set search_path = ''
as $$
  with m as (select grupo_id from public.matriculas where id = p_matricula),
  ev as (select e.id, e.peso from public.evaluaciones e join m on e.grupo_id = m.grupo_id)
  select case
    when (select coalesce(sum(peso), 0) from ev) <> 100 then null
    when exists (select 1 from ev where not exists (
           select 1 from public.calificaciones c where c.evaluacion_id = ev.id and c.matricula_id = p_matricula)) then null
    else (select round(sum(c.nota * ev.peso) / 100, 2) from ev
           join public.calificaciones c on c.evaluacion_id = ev.id and c.matricula_id = p_matricula)
  end
$$;
revoke all on function privado.promedio_matricula(uuid) from public, anon;

-- 8. EMISIÓN ---------------------------------------------------------------
create or replace function public.emitir_certificado(p_matricula uuid, p_plantilla uuid default null, p_firmante uuid default null)
returns table (certificado_id uuid, codigo text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_m public.matriculas%rowtype; v_g public.grupos%rowtype; v_c public.cursos%rowtype;
  v_cc public.certificacion_curso%rowtype; v_pl public.plantillas_certificado%rowtype;
  v_f public.firmantes_certificado%rowtype; v_i public.instituciones%rowtype; v_p public.perfiles%rowtype;
  v_promedio numeric; v_id uuid; v_codigo text; v_fecha timestamptz;
begin
  select * into v_m from public.matriculas where id = p_matricula;
  if not found or not privado.admin_de_institucion(v_m.institucion_id) then
    raise exception 'Matrícula inaccesible' using errcode = '42501';
  end if;
  if not exists (select 1 from public.instituciones i where i.id = v_m.institucion_id and i.activo) then
    raise exception 'La institución no está activa';
  end if;
  select * into v_m from public.matriculas where id = p_matricula for update;
  if v_m.estado::text <> 'activa' or v_m.estado_final::text <> 'aprobado' then
    raise exception 'Solo se emite certificado a una matrícula activa y aprobada';
  end if;
  if exists (select 1 from public.certificados c where c.matricula_id = v_m.id) then
    raise exception 'El certificado de esta matrícula ya fue emitido';
  end if;
  select * into v_g from public.grupos where id = v_m.grupo_id;
  select * into v_c from public.cursos where id = v_g.curso_id;
  select * into v_cc from public.certificacion_curso where curso_id = v_c.id;
  if not found or v_cc.modalidad = 'sin_certificado' then raise exception 'El curso no ofrece certificado'; end if;

  v_promedio := privado.promedio_matricula(v_m.id);
  if v_cc.nota_minima is not null and (v_promedio is null or v_promedio < v_cc.nota_minima) then
    raise exception 'No cumple la nota mínima de certificación (%)', v_cc.nota_minima;
  end if;
  if v_cc.modalidad = 'costo_adicional' and not exists (
       select 1 from public.solicitudes_certificado s where s.matricula_id = v_m.id and s.estado = 'pagada') then
    raise exception 'El pago del certificado no está verificado';
  end if;

  if coalesce(p_plantilla, v_cc.plantilla_id) is not null then
    select * into v_pl from public.plantillas_certificado
     where id = coalesce(p_plantilla, v_cc.plantilla_id) and institucion_id = v_m.institucion_id and activo;
    if not found then raise exception 'Plantilla no disponible'; end if;
  else
    select * into v_pl from public.plantillas_certificado
     where institucion_id = v_m.institucion_id and predeterminada and activo;
  end if;
  if coalesce(p_firmante, v_cc.firmante_id) is not null then
    select * into v_f from public.firmantes_certificado
     where id = coalesce(p_firmante, v_cc.firmante_id) and institucion_id = v_m.institucion_id and activo;
    if not found then raise exception 'Firmante no disponible'; end if;
  end if;

  select * into v_i from public.instituciones where id = v_m.institucion_id;
  select * into v_p from public.perfiles where id = v_m.estudiante_id;

  insert into public.certificados (institucion_id, matricula_id)
  values (v_m.institucion_id, v_m.id)
  returning id, certificados.codigo, fecha_emision into v_id, v_codigo, v_fecha;

  insert into public.certificados_contenido
    (certificado_id, institucion_id, datos, diseno, plantilla_base, fondo_path, fondo_tipo, firma_path, emitido_por)
  values (v_id, v_m.institucion_id,
    jsonb_build_object(
      'codigo', v_codigo, 'fecha_emision', v_fecha,
      'institucion', v_i.nombre, 'logo_url', v_i.logo_url,
      'estudiante', trim(v_p.nombres) || ' ' || trim(v_p.apellidos),
      'curso', v_c.nombre, 'grupo', v_g.codigo,
      'fecha_inicio', v_g.fecha_inicio, 'fecha_fin', v_g.fecha_fin,
      'horas', v_cc.horas_academicas,
      'promedio', v_promedio, 'nota_aprobatoria', v_c.nota_aprobatoria,
      'firmante', v_f.nombre, 'cargo', v_f.cargo),
    coalesce(v_pl.diseno, '{}'::jsonb), coalesce(v_pl.base, 'clasico'),
    v_pl.fondo_path, v_pl.fondo_tipo, v_f.firma_path, auth.uid());

  certificado_id := v_id; codigo := v_codigo;
  return next;
end
$$;

create or replace function public.adjuntar_pdf_certificado(p_certificado uuid, p_path text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_c public.certificados%rowtype;
begin
  select * into v_c from public.certificados where id = p_certificado for update;
  if not found or not privado.admin_de_institucion(v_c.institucion_id) then
    raise exception 'Certificado inaccesible' using errcode = '42501';
  end if;
  if v_c.archivo_url is not null then raise exception 'El certificado ya tiene su PDF'; end if;
  if p_path is distinct from v_c.institucion_id::text || '/' || v_c.id::text || '.pdf' then
    raise exception 'Ruta de PDF no válida';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'certificados-emitidos' and o.name = p_path
                 and coalesce(o.metadata->>'mimetype', '') = 'application/pdf'
                 and coalesce((o.metadata->>'size')::bigint, 0) > 0) then
    raise exception 'No se encontró el PDF en Storage';
  end if;
  update public.certificados set archivo_url = p_path where id = v_c.id;
end
$$;

-- 9. PAGO DEL CERTIFICADO ----------------------------------------------------
create or replace function public.solicitar_certificado(p_matricula uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_m public.matriculas%rowtype; v_cc public.certificacion_curso%rowtype; v_id uuid;
begin
  if privado.mi_rol_activo() <> 'estudiante' then raise exception 'Solo estudiantes pueden solicitar su certificado'; end if;
  select * into v_m from public.matriculas where id = p_matricula and estudiante_id = auth.uid() for update;
  if not found then raise exception 'Matrícula inaccesible' using errcode = '42501'; end if;
  if v_m.estado::text <> 'activa' or v_m.estado_final::text <> 'aprobado' then
    raise exception 'El certificado se solicita con la matrícula activa y aprobada';
  end if;
  if exists (select 1 from public.certificados c where c.matricula_id = v_m.id) then
    raise exception 'El certificado ya fue emitido';
  end if;
  select cc.* into v_cc from public.certificacion_curso cc join public.grupos g on g.curso_id = cc.curso_id where g.id = v_m.grupo_id;
  if not found or v_cc.modalidad <> 'costo_adicional' then raise exception 'Este certificado no tiene costo adicional'; end if;
  select id into v_id from public.solicitudes_certificado where matricula_id = v_m.id;
  if v_id is not null then return v_id; end if;
  insert into public.solicitudes_certificado (institucion_id, matricula_id, estudiante_id, importe)
  values (v_m.institucion_id, v_m.id, auth.uid(), v_cc.importe) returning id into v_id;
  return v_id;
end
$$;

create or replace function public.presentar_comprobante_certificado(
  p_solicitud uuid, p_monto numeric, p_metodo text, p_referencia text, p_comprobante_path text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_s public.solicitudes_certificado%rowtype; v_id uuid;
begin
  if privado.mi_rol_activo() <> 'estudiante' then raise exception 'Solo estudiantes pueden presentar sus pagos'; end if;
  if nullif(trim(coalesce(p_metodo, '')), '') is null or nullif(trim(coalesce(p_referencia, '')), '') is null
     or nullif(trim(coalesce(p_comprobante_path, '')), '') is null then
    raise exception 'Método, referencia y comprobante son obligatorios';
  end if;
  if p_comprobante_path not like auth.uid()::text || '/%' then raise exception 'El archivo debe estar en tu carpeta privada'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'comprobantes-cursos-v5' and o.name = p_comprobante_path) then
    raise exception 'No se encontró el comprobante en Storage';
  end if;
  select * into v_s from public.solicitudes_certificado where id = p_solicitud for update;
  if not found or v_s.estudiante_id <> auth.uid() or v_s.estado <> 'pendiente' then
    raise exception 'Solicitud de certificado no disponible para comprobante';
  end if;
  if p_monto is null or p_monto <> v_s.importe then raise exception 'El pago debe coincidir con el importe del certificado'; end if;
  if exists (select 1 from public.pagos_certificado p where p.solicitud_id = v_s.id and p.estado = 'pendiente') then
    raise exception 'Ya existe un comprobante pendiente de revisión';
  end if;
  insert into public.pagos_certificado (institucion_id, solicitud_id, estudiante_id, monto, metodo, referencia_operacion, comprobante_url)
  values (v_s.institucion_id, v_s.id, auth.uid(), p_monto, trim(p_metodo), trim(p_referencia), p_comprobante_path)
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.revisar_pago_certificado(p_pago uuid, p_aprobar boolean, p_observacion text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_p public.pagos_certificado%rowtype; v_s public.solicitudes_certificado%rowtype;
begin
  select * into v_p from public.pagos_certificado where id = p_pago;
  if not found or not privado.admin_de_institucion(v_p.institucion_id) then
    raise exception 'Pago inexistente o sin autorización' using errcode = '42501';
  end if;
  if not exists (select 1 from public.instituciones i where i.id = v_p.institucion_id and i.activo) then
    raise exception 'La institución no está activa';
  end if;
  -- Orden de bloqueo: solicitud → pago (igual que revisar_pago de V5).
  select * into v_s from public.solicitudes_certificado where id = v_p.solicitud_id for update;
  select * into v_p from public.pagos_certificado where id = p_pago for update;
  if v_p.estado::text <> 'pendiente' then raise exception 'El pago ya fue revisado'; end if;
  if not p_aprobar then
    if length(trim(coalesce(p_observacion, ''))) < 5 then raise exception 'Indica el motivo del rechazo'; end if;
    update public.pagos_certificado set estado = 'rechazado', verificado_por = auth.uid(), verificado_en = now(),
      observacion = left(trim(p_observacion), 500) where id = p_pago;
    return 'rechazado';
  end if;
  if v_s.estado <> 'pendiente' then raise exception 'La solicitud de certificado ya no está pendiente'; end if;
  if v_p.monto <> v_s.importe then raise exception 'Monto incorrecto'; end if;
  update public.pagos_certificado set estado = 'pagado', verificado_por = auth.uid(), verificado_en = now(),
    observacion = nullif(left(trim(coalesce(p_observacion, '')), 500), '') where id = p_pago;
  update public.solicitudes_certificado set estado = 'pagada', pagada_en = now() where id = v_s.id;
  return 'pagado';
end
$$;

-- 10. VERIFICACIÓN PÚBLICA (datos mínimos, desde la copia fija) -------------
create or replace function public.verificar_certificado(p_codigo text)
returns table (codigo text, estudiante text, curso text, institucion text, fecha_emision timestamptz, horas integer)
language sql stable security definer set search_path = ''
as $$
  select c.codigo, cc.datos->>'estudiante', cc.datos->>'curso', cc.datos->>'institucion',
         c.fecha_emision, nullif(cc.datos->>'horas', '')::integer
  from public.certificados c
  join public.certificados_contenido cc on cc.certificado_id = c.id
  where c.codigo = upper(trim(coalesce(p_codigo, '')))
    and length(trim(coalesce(p_codigo, ''))) between 8 and 32
$$;

-- 11. ESTADO DE CERTIFICACIÓN DEL PROPIO ESTUDIANTE ---------------------------
create or replace function public.mis_certificados()
returns table (
  matricula_id uuid, institucion_id uuid, institucion text, curso text, grupo text, estado_final text,
  modalidad text, importe numeric, solicitud_id uuid, solicitud_estado text, pago_pendiente boolean,
  certificado_id uuid, codigo text, fecha_emision timestamptz, tiene_pdf boolean)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.institucion_id, i.nombre::text, c.nombre::text, g.codigo::text, m.estado_final::text,
         coalesce(cc.modalidad, 'sin_certificado'), coalesce(cc.importe, 0)::numeric,
         s.id, s.estado,
         exists (select 1 from public.pagos_certificado p where p.solicitud_id = s.id and p.estado = 'pendiente'),
         ce.id, ce.codigo, ce.fecha_emision, ce.archivo_url is not null
  from public.matriculas m
  join public.grupos g on g.id = m.grupo_id
  join public.cursos c on c.id = g.curso_id
  join public.instituciones i on i.id = m.institucion_id
  left join public.certificacion_curso cc on cc.curso_id = c.id
  left join public.solicitudes_certificado s on s.matricula_id = m.id
  left join public.certificados ce on ce.matricula_id = m.id
  where auth.uid() is not null and m.estudiante_id = auth.uid() and privado.mi_rol_activo() = 'estudiante'
    and m.estado::text = 'activa' and (m.estado_final::text = 'aprobado' or ce.id is not null)
  order by ce.fecha_emision desc nulls first, c.nombre
$$;

-- 12. EVENTO DE CORREO (inactivo hasta aplicar correos_transaccionales_v5) ----
-- Se dispara cuando el PDF queda ADJUNTO (archivo_url pasa de NULL a una ruta):
-- nunca se avisa de un certificado cuyo PDF falló.
create or replace function privado.correo_certificado_emitido()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_estudiante uuid; v_datos jsonb;
begin
  if old.archivo_url is not null or new.archivo_url is null then return null; end if;
  if to_regprocedure('privado.encolar_correo(text,text,uuid,text,uuid,jsonb)') is null then return null; end if;
  begin
    select m.estudiante_id into v_estudiante from public.matriculas m where m.id = new.matricula_id;
    select cc.datos into v_datos from public.certificados_contenido cc where cc.certificado_id = new.id;
    execute 'select privado.encolar_correo($1, $2, $3, null, $4, $5)'
      using 'certificado_emitido', 'certificado_emitido:' || new.id, v_estudiante, new.institucion_id,
            jsonb_build_object('curso', v_datos->>'curso', 'institucion', v_datos->>'institucion',
                               'codigo', new.codigo, 'nombre', split_part(v_datos->>'estudiante', ' ', 1));
  exception when others then raise warning 'correo_certificado_emitido: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end
$$;
drop trigger if exists correo_certificado_emitido_v5 on public.certificados_contenido;
drop trigger if exists correo_certificado_emitido_v5 on public.certificados;
create trigger correo_certificado_emitido_v5
  after update of archivo_url on public.certificados
  for each row execute function privado.correo_certificado_emitido();

-- 12b. SIN ESCRITURA DIRECTA EN CERTIFICADOS (solo emitir_certificado y
--      adjuntar_pdf_certificado, ambas SECURITY DEFINER).
revoke insert, update, delete on table public.certificados from public, anon, authenticated;
do $$ begin
  if has_table_privilege('authenticated', 'public.certificados', 'INSERT')
     or has_table_privilege('authenticated', 'public.certificados', 'UPDATE')
     or has_table_privilege('authenticated', 'public.certificados', 'DELETE') then
    raise exception 'authenticated conserva escritura sobre certificados. Revísalo antes de continuar.';
  end if;
end $$;

-- 13. PERMISOS DE FUNCIONES ---------------------------------------------------
revoke all on function public.emitir_certificado(uuid, uuid, uuid) from public, anon;
revoke all on function public.adjuntar_pdf_certificado(uuid, text) from public, anon;
revoke all on function public.solicitar_certificado(uuid) from public, anon;
revoke all on function public.presentar_comprobante_certificado(uuid, numeric, text, text, text) from public, anon;
revoke all on function public.revisar_pago_certificado(uuid, boolean, text) from public, anon;
revoke all on function public.mis_certificados() from public, anon;
revoke all on function public.verificar_certificado(text) from public;
revoke all on function privado.correo_certificado_emitido() from public, anon, authenticated;
revoke all on function privado.promedio_matricula(uuid) from authenticated;
grant execute on function public.emitir_certificado(uuid, uuid, uuid), public.adjuntar_pdf_certificado(uuid, text),
  public.solicitar_certificado(uuid), public.presentar_comprobante_certificado(uuid, numeric, text, text, text),
  public.revisar_pago_certificado(uuid, boolean, text), public.mis_certificados() to authenticated;
grant execute on function public.verificar_certificado(text) to anon, authenticated;

commit;

-- =====================================================================
-- VERIFICACIÓN (solo lectura)
-- =====================================================================
-- select tablename, policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename in ('plantillas_certificado','firmantes_certificado','certificacion_curso',
--        'certificados_contenido','solicitudes_certificado','pagos_certificado') order by 1, 2;
-- select policyname, cmd from pg_policies where schemaname = 'storage' and policyname like 'v5 %certificad%' or policyname like 'v5 recursos%' or policyname like 'v5 emitidos%';
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id like 'certificados-%';
-- select p.oid::regprocedure, p.prosecdef, pg_get_userbyid(p.proowner) as dueno, p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
--   from pg_proc p where p.proname in ('emitir_certificado','adjuntar_pdf_certificado','solicitar_certificado',
--        'presentar_comprobante_certificado','revisar_pago_certificado','verificar_certificado','mis_certificados');
-- Esperado: anon solo ejecuta verificar_certificado.

-- =====================================================================
-- REVERSIÓN (solo si NO se emitieron certificados con esta estructura).
-- No restaura el INSERT directo en certificados: hacerlo sería inseguro.
-- =====================================================================
-- begin;
-- drop trigger if exists correo_certificado_emitido_v5 on public.certificados;
-- drop function if exists public.emitir_certificado(uuid, uuid, uuid), public.adjuntar_pdf_certificado(uuid, text),
--   public.solicitar_certificado(uuid), public.presentar_comprobante_certificado(uuid, numeric, text, text, text),
--   public.revisar_pago_certificado(uuid, boolean, text), public.verificar_certificado(text), public.mis_certificados(),
--   privado.promedio_matricula(uuid), privado.correo_certificado_emitido();
-- drop policy if exists "v5 estudiante ve medios para pagar certificado" on public.medios_cobro_institucion;
-- drop policy if exists "v5 admin lee comprobantes de certificados" on storage.objects;
-- drop policy if exists "v5 recursos: admin sube a su carpeta" on storage.objects;
-- drop policy if exists "v5 recursos: admin lee su carpeta" on storage.objects;
-- drop policy if exists "v5 emitidos: admin sube a su carpeta" on storage.objects;
-- drop policy if exists "v5 emitidos: leer propios" on storage.objects;
-- drop view if exists public.oferta_certificacion;
-- drop table if exists public.pagos_certificado, public.solicitudes_certificado, public.certificados_contenido,
--   public.certificacion_curso, public.firmantes_certificado, public.plantillas_certificado;
-- commit;
-- (Los buckets se eliminan desde Storage solo si están vacíos.)
