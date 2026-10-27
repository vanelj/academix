-- =====================================================================
-- ACADEMIX | DIAGNÓSTICO DE PAGOS V5 (SOLO LECTURA)
-- Consultas para confirmar en la base REAL lo que el panel de pagos asume.
-- No modifican nada. Ejecutar en Supabase > SQL Editor y revisar el resultado.
-- =====================================================================

-- 1. Definición real de las funciones de pago. Comprobar en revisar_pago:
--    a) que exige grupo 'abierto' antes de confirmar reservas o matrículas;
--    b) si en la rama de cuotas comprueba que la matrícula esté activa;
--    c) que bloquea el pago (FOR UPDATE) y rechaza si ya no está 'pendiente'.
select p.proname, pg_get_functiondef(p.oid) as definicion
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('revisar_pago', 'presentar_comprobante', 'confirmar_matricula_sin_saldo', 'cancelar_solicitud');

-- 2. Quién puede ejecutarlas (anon no debe aparecer).
select p.proname, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('revisar_pago', 'presentar_comprobante', 'confirmar_matricula_sin_saldo', 'anular_matricula');

-- 3. Bucket de comprobantes: debe existir y ser privado (public = false).
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'comprobantes-cursos-v5';

-- 4. Políticas de Storage del bucket ("v5 subir mis comprobantes" y
--    "v5 leer mis comprobantes"). La de lectura permite al admin ver solo
--    archivos registrados en pagos de su institución.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (qual ilike '%comprobantes-cursos-v5%' or with_check ilike '%comprobantes-cursos-v5%');

-- 5. Políticas RLS de las tablas económicas.
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename in ('pagos', 'cuotas', 'matriculas', 'solicitudes_inscripcion')
order by tablename, policyname;

-- 6. Permisos de columna de authenticated sobre pagos y matriculas
--    (pagos no debe tener INSERT/UPDATE; matriculas: UPDATE de estado/estado_final).
select table_name, column_name, privilege_type
from information_schema.column_privileges
where grantee = 'authenticated' and table_schema = 'public'
  and table_name in ('pagos', 'matriculas') and privilege_type in ('INSERT', 'UPDATE')
order by table_name, column_name;

-- 7. Disparadores relacionados (incluye los de migraciones propuestas, si se aplicaron).
select tgrelid::regclass as tabla, tgname, tgenabled
from pg_trigger
where not tgisinternal
  and tgrelid in ('public.pagos'::regclass, 'public.cuotas'::regclass, 'public.matriculas'::regclass,
                  'public.solicitudes_inscripcion'::regclass, 'public.grupos'::regclass)
order by 1, 2;

-- 8. Integridad actual (conteos, sin datos personales):
-- 8a. Pagos pendientes de cuotas cuya matrícula ya está anulada.
select count(*) as pagos_pendientes_en_matriculas_anuladas
from public.pagos p
join public.cuotas q on q.id = p.cuota_id
join public.matriculas m on m.id = q.matricula_id
where p.estado = 'pendiente' and m.estado = 'anulada';

-- 8b. Pagos pendientes de solicitudes cuyo grupo ya no está abierto.
select g.estado, count(*) as pagos_pendientes
from public.pagos p
join public.solicitudes_inscripcion s on s.id = p.solicitud_id
join public.grupos g on g.id = s.grupo_id
where p.estado = 'pendiente' and g.estado <> 'abierto'
group by g.estado;

-- 8c. Cuotas cuyo estado no coincide con sus pagos aprobados.
select q.estado, count(*) as cuotas_inconsistentes
from public.cuotas q
left join lateral (
  select coalesce(sum(p.monto), 0) as aplicado
  from public.pagos p where p.cuota_id = q.id and p.estado = 'pagado'
) a on true
where (q.estado = 'pagada' and a.aplicado < q.importe)
   or (q.estado = 'pendiente' and a.aplicado > 0)
   or (q.estado = 'parcial' and (a.aplicado = 0 or a.aplicado >= q.importe))
group by q.estado;
