-- =====================================================================
-- ACADEMIX | PROPUESTA (NO EJECUTADA) — Imagen QR de Yape y Plin
--
-- QUÉ HACE
--   1. Añade public.medios_cobro_institucion.qr_url (opcional, null = sin QR).
--      Solo se admite en medios de tipo yape o plin y debe ser la URL pública
--      del bucket qr-medios-cobro. Los medios actuales quedan en null.
--   2. Crea el bucket qr-medios-cobro: público, 2 MB, PNG/JPEG/WebP.
--      La imagen la sube el administrador desde su dispositivo; Academix no
--      genera QR ni procesa pagos.
--   3. Políticas de Storage: el administrador ACTIVO solo escribe, reemplaza
--      y borra en <su institución>/<un medio de su institución>/.
--
-- POR QUÉ BUCKET PÚBLICO
--   El QR solo muestra lo que el estudiante ya ve (celular y titular del
--   medio). La URL se obtiene únicamente desde la fila del medio, que la RLS
--   existente («v5 estudiante ve medios para pagar») solo entrega a quien
--   tiene una obligación abierta con la institución. La ruta incluye un
--   sufijo aleatorio. Mismo criterio que portadas-cursos.
--
-- NO MODIFICA: filas existentes, políticas de la tabla, otras tablas ni
-- funciones. Idempotente. Reversión al final.
-- CÓMO APLICAR: revisar y ejecutar en Supabase > SQL Editor.
-- =====================================================================

begin;

-- 0. REQUISITOS ---------------------------------------------------------
do $$
begin
  if to_regclass('public.medios_cobro_institucion') is null then
    raise exception 'Requisito: falta public.medios_cobro_institucion (aplicar medios_cobro_v5.sql antes)';
  end if;
  if to_regprocedure('privado.mi_institucion()') is null or to_regprocedure('privado.mi_rol_activo()') is null then
    raise exception 'Requisito: faltan privado.mi_institucion() o privado.mi_rol_activo()';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and ((cmd in ('INSERT', 'UPDATE', 'ALL') and coalesce(with_check, '') not ilike '%bucket_id%')
        or (cmd in ('SELECT', 'UPDATE', 'DELETE', 'ALL') and coalesce(qual, '') not ilike '%bucket_id%'))
  ) then
    raise exception 'Hay políticas globales de Storage sin filtro bucket_id; revisar el aislamiento antes de continuar';
  end if;
end $$;

-- 1. COLUMNA -------------------------------------------------------------
alter table public.medios_cobro_institucion add column if not exists qr_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'medios_cobro_qr_url_check') then
    alter table public.medios_cobro_institucion add constraint medios_cobro_qr_url_check
      check (qr_url is null or (tipo in ('yape', 'plin') and qr_url ~ '^https://[^\s]+/storage/v1/object/public/qr-medios-cobro/[^\s]+$' and length(qr_url) <= 600));
  end if;
end $$;

comment on column public.medios_cobro_institucion.qr_url is
  'URL pública del QR (bucket qr-medios-cobro) que sube el administrador. Solo Yape y Plin. null = sin QR.';

-- 2. BUCKET --------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qr-medios-cobro', 'qr-medios-cobro', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'qr-medios-cobro' and public and file_size_limit = 2097152
      and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']
  ) then
    raise exception 'El bucket qr-medios-cobro ya existe con una configuración distinta; revisar manualmente, no se modificó';
  end if;
end $$;

-- 3. POLÍTICAS DE STORAGE (carpeta 1 = institución; carpeta 2 = medio de esa institución)
drop policy if exists "qr medios: admin lee su carpeta" on storage.objects;
create policy "qr medios: admin lee su carpeta" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'qr-medios-cobro'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
  );

drop policy if exists "qr medios: admin sube" on storage.objects;
create policy "qr medios: admin sube" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'qr-medios-cobro'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
    and exists (
      select 1 from public.medios_cobro_institucion m
      where m.id::text = (storage.foldername(name))[2] and m.institucion_id = privado.mi_institucion()
        and m.tipo in ('yape', 'plin')
    )
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
  );

drop policy if exists "qr medios: admin reemplaza" on storage.objects;
create policy "qr medios: admin reemplaza" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'qr-medios-cobro'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
  )
  with check (
    bucket_id = 'qr-medios-cobro'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
  );

drop policy if exists "qr medios: admin elimina" on storage.objects;
create policy "qr medios: admin elimina" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'qr-medios-cobro'
    and (storage.foldername(name))[1] = privado.mi_institucion()::text
    and privado.mi_rol_activo() = 'admin'
  );

-- 4. ASERCIONES ----------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'medios_cobro_institucion' and column_name = 'qr_url') then
    raise exception 'No se creó la columna qr_url';
  end if;
end $$;

commit;

-- =====================================================================
-- VERIFICACIÓN (solo lectura)
-- =====================================================================
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'medios_cobro_institucion' and column_name = 'qr_url';
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'qr-medios-cobro';
-- select policyname, cmd from pg_policies where schemaname = 'storage' and policyname like 'qr medios:%';

-- =====================================================================
-- REVERSIÓN (vaciar antes el bucket desde el panel de Storage)
-- =====================================================================
-- begin;
-- drop policy if exists "qr medios: admin lee su carpeta" on storage.objects;
-- drop policy if exists "qr medios: admin sube" on storage.objects;
-- drop policy if exists "qr medios: admin reemplaza" on storage.objects;
-- drop policy if exists "qr medios: admin elimina" on storage.objects;
-- alter table public.medios_cobro_institucion drop constraint if exists medios_cobro_qr_url_check;
-- alter table public.medios_cobro_institucion drop column if exists qr_url;
-- delete from storage.buckets where id = 'qr-medios-cobro';
-- commit;
