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

Comprobación de solo lectura del 03-11-2026, sin sesión: **sigue sin aplicar**.
- `rpc/vacantes_oferta` responde PGRST202, es decir, la función no existe.
- `oferta_grupos` con `vacantes_disponibles` responde «42501 permission denied for function vacantes_disponibles».

Mientras tanto, la ficha pública reintenta sin esa columna: los visitantes ven los grupos (también los que tienen «Docente por asignar») sin el número de vacantes. Con sesión de estudiante no hay error.

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

Comprobación de solo lectura del 03-11-2026 con la clave pública, sin sesión:
- `oferta_cursos` ya devuelve `portada_url`;
- el bucket `portadas-cursos` existe (responde «Object not found», no «Bucket not found»).

Todo indica que **ya está aplicada**. Falta confirmarlo con el bloque «VERIFICACIÓN» o con `docs/diagnostico/verificacion_portadas_cursos_v5.sql`, porque las políticas de Storage no pueden comprobarse sin sesión.
La reversión no usa `CASCADE`: deja `portada_url` en la vista con valor `null`, para no borrar `oferta_grupos`.

## Migración incremental posterior (04-11-2026)

| Paso | Archivo | Tipo |
|---|---|---|
| 11 | `docs/migraciones/mis_cursos_v5.sql` | Migración (independiente, solo crea una función de lectura) |

**Para qué sirve.** Añade `public.mis_cursos()` para «Mis cursos» del estudiante. Sigue el mismo patrón que `mis_cuotas` y `mis_certificados`.

**Qué devuelve.** Solo las matrículas del propio estudiante (`auth.uid()`, rol estudiante activo), de cualquier institución, con:
- el curso, el grupo y la institución;
- las fechas y los horarios;
- el docente, o null para «Docente por asignar».

No devuelve enlaces de clase ni datos de otros estudiantes. No modifica tablas, filas, políticas ni otros permisos.

**Sin aplicar.** «Mis cursos» funciona igual con las matrículas propias y los nombres de la oferta pública. Si el grupo ya no está en la oferta (en curso o cerrado), la matrícula se muestra sin nombre y la página avisa que el detalle está incompleto.

**Comprobación.**
- Antes: `select to_regprocedure('public.mis_cursos()');` debe devolver null.
- Después: ejecutar el bloque «VERIFICACIÓN» del archivo.

## Aprobación de pagos activada (06-11-2026)

`REVISION_PAGOS_HABILITADA = true` en `src/lib/pagos/config.ts`, para la compra de cursos: pago completo con comprobante que verifica la institución, sin pasarela.

**Antes de aprobar pagos reales** hay que aplicar `docs/migraciones/solicitudes_estado_grupo_v5.sql`, que antes era opcional y ahora es **necesaria**. Sin ella, `revisar_pago` puede aprobar un pago en un grupo cancelado o cerrado y crear una matrícula para un grupo que no se dictará.

`reservas_vencidas_v5.sql` ya no hace falta: los cursos nuevos no ofrecen reserva de vacante.

**Después:** probar con cuentas de prueba (`docs/diagnostico/pruebas_pagos_v5.sql` y el flujo completo desde la app).

## Migraciones incrementales posteriores (12-11-2026)

Ninguna se ha ejecutado. Son independientes entre sí; aplicarlas en este orden:

| Paso | Archivo | Tipo | Sin aplicarla |
|---|---|---|---|
| 12 | `docs/migraciones/solicitudes_estado_grupo_v5.sql` | Disparadores de seguridad | **Necesaria antes de aprobar pagos reales** (ver arriba). No se puede confirmar sin sesión: comprobarla con su bloque «COMPROBACIONES». |
| 13 | `docs/migraciones/notificaciones_v5.sql` | Tabla + disparadores | La campana no aparece; todo lo demás funciona igual. |
| 14 | `docs/migraciones/qr_medios_cobro_v5.sql` | Columna + bucket + políticas de Storage | Los medios Yape/Plin funcionan con celular y titular; «Subir QR» indica que falta la migración. |
| 15 | `docs/migraciones/correos_transaccionales_v5.sql` | Cola de correos | Solo para la etapa de Resend. |
| 16 | `docs/migraciones/aula_academica_v5.sql` | Columnas + política de notas + RPC + tabla y bucket privado | Las notas se ven al guardarlas (regla anterior), «Publicar» indica que falta la migración, no hay materiales ni aula/sede en los horarios. Todo lo demás del aula funciona. |

**notificaciones_v5.** Crea `public.notificaciones` y 7 disparadores AFTER (solicitudes, pagos, matrículas, grupos, horarios, evaluaciones, certificados). Ya **no** hay aviso por nota guardada: una nota guardada es un borrador; el aviso al estudiante lo emite la publicación de la evaluación (paso 16).
- Cada disparador captura sus errores: un aviso **nunca** bloquea una matrícula, un pago ni una nota.
- RLS: cada persona solo ve sus avisos del rol activo. `authenticated` solo puede leer y cambiar `leida_en`; no puede crear ni borrar avisos.
- Avisos agrupados (máx. uno por grupo/matrícula y día) para horarios y nuevos estudiantes.

**qr_medios_cobro_v5.** Añade `qr_url` (solo Yape/Plin), el bucket público `qr-medios-cobro` (2 MB, PNG/JPEG/WebP) y políticas para que el administrador solo escriba en la carpeta de su institución y de sus medios. El QR lo sube la institución: Academix no lo genera.

**Registro de notas del docente.** No requiere migración: usa la política V5 «docente gestiona calificaciones» y el disparador `proteger_calificacion_v5` de `evaluaciones_admin_v5` (ya aplicada).

**aula_academica_v5 (paso 16).** Diagnóstico previo de solo lectura: `docs/diagnostico/verificacion_previa_aula_academica_v5.sql`.
- **Publicación de notas:** `evaluaciones.publicada_en` y la RPC `publicar_evaluacion(evaluación, publicar)` (docente del grupo o administrador). La política «ver calificaciones» del estudiante exige evaluación publicada; admin y docente no cambian. Sin `GRANT UPDATE` sobre `publicada_en`.
- **Compatibilidad:** no toca notas. Las evaluaciones existentes quedan **sin publicar** (sus notas dejan de verse para el estudiante hasta publicarlas). El bloque 7, comentado, publica de una vez las que ya tienen notas: decidir antes de aplicar (el diagnóstico, consulta 4, muestra cuántas hay).
- **Materiales:** tabla `materiales_curso` (RLS: docente del grupo y admin gestionan; matriculados activos leen) y bucket **privado** `materiales-curso` (20 MB; PDF, Office, texto, imágenes; sin vídeos). Ruta `<institución>/<grupo>/<archivo>`; se abren con URL firmada de 5 minutos.
- **Aula o sede:** `horarios.ubicacion` (opcional). La modalidad de cada sesión se deduce (enlace = virtual, ubicación = presencial); `cursos.modalidad` no cambia.
- **`mis_cursos_detalle()`:** modalidad, nota aprobatoria y portada de las matrículas propias del estudiante (solo lectura).
- **Avisos:** si `notificaciones_v5` está aplicada, publicar avisa una vez a cada estudiante con nota en esa evaluación y, cuando todo el grupo está publicado y completo, avisa al administrador «Resultados listos para revisar».
