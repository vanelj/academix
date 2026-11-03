# Orden seguro de aplicación — Evaluaciones y Certificados

Estado al 27-10-2026: `medios_cobro_v5.sql` **aplicada**. Pendientes: las dos de abajo.

| Paso | Archivo | Tipo |
|---|---|---|
| 1 | `docs/diagnostico/verificacion_previa_evaluaciones_certificados_v5.sql` | Solo lectura |
| 2 | `docs/migraciones/evaluaciones_admin_v5.sql` | Migración |
| 3 | Bloque «VERIFICACIÓN» al final de `evaluaciones_admin_v5.sql` | Solo lectura |
| 4 | `docs/migraciones/certificados_v5.sql` | Migración |
| 5 | Bloque «VERIFICACIÓN» al final de `certificados_v5.sql` | Solo lectura |
| 6 | `docs/diagnostico/pruebas_evaluaciones_certificados_v5.sql` | Pruebas con `ROLLBACK` (cuentas de prueba) |
| 7 | `/admin/pagos/verificacion` con la sesión del administrador | Solo lectura |

## Antes del paso 2

En el resumen (bloque 12) del diagnóstico deben salir en `true`:

- `pg15`: PostgreSQL 15 o superior.
- `funciones_v5`: existen las funciones de V5 que usan las migraciones.

`pesos_ok = false` no impide aplicar. Solo señala grupos con pesos por encima de 100 % que deberán corregirse.

## Por qué en este orden

`certificados_v5` confía en que `matriculas.estado_final` solo cambie con `registrar_resultado_final`. Por eso su bloque de requisitos aborta si `evaluaciones_admin_v5` no está aplicada.

Cada archivo es una sola transacción: si su bloque 0 falla, no se aplica nada.

## Permisos que se retiran (intencionado)

- `UPDATE` directo sobre `public.matriculas`. Ninguna parte de la app lo usa. Las funciones `anular_matricula`, `registrar_resultado_final` y `reabrir_resultado_final` siguen funcionando.
- `INSERT/UPDATE/DELETE` directo sobre `public.certificados`. La emisión solo es posible con `emitir_certificado`, que comprueba los requisitos.

Las reversiones no restauran estos permisos, porque hacerlo reabriría los huecos.

## Después

- Cargar los datos de simulación.
- `REVISION_PAGOS_HABILITADA` sigue en `false` hasta superar las pruebas de pagos (T1–T17) y estas (E1–E14, C1–C33).

## Migración incremental posterior (31-10-2026)

| Paso | Archivo | Tipo |
|---|---|---|
| 8 | `docs/migraciones/oferta_grupos_anon_v5.sql` | Migración (independiente) |

Permite que los visitantes sin sesión vean los grupos y las vacantes en la ficha del curso (hoy reciben el error 42501).
No concede a `anon` el esquema `privado`: usa la función pública mínima `public.vacantes_oferta`.
Su bloque 0 aborta si la vista no coincide con la definición V5. Detalle en `docs/auditoria-2026-10-31.md`.

## Migración incremental posterior (02-11-2026)

| Paso | Archivo | Tipo |
|---|---|---|
| 9 | `docs/migraciones/portadas_cursos_v5.sql` | Migración (independiente del paso 8) |
| 10 | Bloque «VERIFICACIÓN» al final de `portadas_cursos_v5.sql` | Solo lectura |

Añade la portada opcional de cada curso para el asistente de creación (`/admin/cursos/nuevo` y `/admin/cursos/[id]/asistente`):

- la columna `public.cursos.portada_url`. Es opcional y los cursos actuales quedan en `null`, con la portada generada de siempre;
- el bucket público `portadas-cursos`, de 3 MB, que solo admite PNG, JPEG y WebP;
- las políticas de Storage. Un administrador solo escribe en `<su institución>/<curso de su institución>/`;
- la vista `oferta_cursos` con `portada_url` al final. Mantiene las columnas, el filtro y los permisos anteriores.

No modifica filas existentes. Su bloque 0 aborta si `oferta_cursos` no coincide con la definición V5.
Antes de aplicarla, el asistente funciona igual, pero el paso 1 indica que la carga de portada está pendiente de esta migración.
La reversión no usa `CASCADE`: deja `portada_url` en la vista con valor `null`, para no borrar `oferta_grupos`.
