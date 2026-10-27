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
