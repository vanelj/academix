# Auditoría integral de Academix — 31-10-2026

Rama: `feat/vibrant-ui`, con cambios sin confirmar.

Puntos de recuperación:

| Respaldo | Ubicación |
|---|---|
| Creative Tech | `feat/creative-tech` y etiqueta `creative-tech-v1` (`ba586d1`), más `Desktop/respaldos/academix-creative-tech-2026-10-28.zip` |
| Vibrant V1 (antes de esta auditoría) | `Desktop/respaldos/academix-vibrant-v1-2026-10-31.zip` y su `.patch` |

No se ejecutó SQL, no se insertaron datos y no hubo commits, pushes ni despliegues.

## 1. Resultado de las comprobaciones

| Prueba | Resultado |
|---|---|
| TypeScript, ESLint y `next build` | 0 errores, 0 avisos |
| Pruebas unitarias con simulaciones (8 suites) | 293/293 |
| `npm audit --omit=dev` (producción) | **0 vulnerabilidades** (antes 18: 1 crítica y 8 altas) |
| `npm audit` (incluye herramientas de desarrollo) | 21: 19 moderadas y 2 bajas, solo en `shadcn`/`ts-morph`/`eslint`. Exigen `--force` y no llegan a producción |
| Rutas privadas sin sesión (25) | Todas redirigen a `/login` |
| API sin credenciales | `/api/correos/procesar` → 401; callbacks de auth → `/login?aviso=…` |
| Páginas públicas (11 rutas × escritorio y móvil) | 200, sin errores de consola ni desbordes |
| Accesibilidad (axe-core, WCAG 2.1 AA) | 0 infracciones en 45 vistas: públicas, autenticación, verificación, 404 y los 3 paneles con datos de muestra locales |
| Cabeceras HTTP | CSP (`frame-ancestors`, `base-uri`, `form-action`, `object-src`), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` y HSTS presentes; `x-powered-by` retirado |
| Formularios con la CSP | El login (acción de servidor) responde normalmente |

## 2. Hallazgos y correcciones

| Gravedad | Hallazgo | Archivo | Corrección | Verificación | ¿Intervención humana? |
|---|---|---|---|---|---|
| **CRÍTICO** | Next.js 16.3.6 con avisos críticos (caché/Draft Mode) | `package.json` | `next` y `eslint-config-next` a 16.4.3 (parche, versión fija) | Build, pruebas y auditoría | No |
| **ALTO** | Zod 4.6.5: agotamiento de memoria con colecciones grandes (valida formularios) | `package.json` | `zod` a ^4.6.7 | Pruebas y auditoría | No |
| **ALTO** | `shadcn` (CLI) declarado como dependencia de producción: arrastraba `hono`, `body-parser`, `systeminformation` y otros vulnerables | `package.json` | Movido a `devDependencies`; el build sigue usando su CSS | Build y `npm audit --omit=dev` = 0 | No |
| **ALTO** | Los visitantes sin sesión no ven los grupos de un curso: `oferta_grupos` usa `privado.vacantes_disponibles`, sin permiso para `anon` (error 42501) | Base de datos (V5) | Migración preparada: `docs/migraciones/oferta_grupos_anon_v5.sql` (no aplicada) | Registro del servidor; sintaxis validada con el analizador de PostgreSQL | **Sí: aplicarla en Supabase** |
| **MEDIO** | La ficha mostraba «no hay grupos» cuando en realidad la consulta fallaba | `src/lib/inscripcion/datos.ts`, `src/app/cursos/[id]/page.tsx` | Nuevo estado «No pudimos cargar los grupos» | Captura de la ficha | No |
| **MEDIO** | Faltaban cabeceras de seguridad (clickjacking, sniffing, referrer, permisos) | `next.config.ts` | `headers()` con CSP acotada y `poweredByHeader: false` | `curl -I` y prueba del login | No |
| **MEDIO** | El login mostraba cifras inventadas («248 estudiantes», «96 % pagos al día», «Clase en vivo») y efecto vidrio (`backdrop-blur`) | `src/components/login/panel-marca.tsx` | Rediseño Vibrant con los módulos reales, sin cifras ni vidrio | Captura del login | No |
| **MEDIO** | El texto coral «aquí» tenía un contraste de 2,65:1 | `src/academix/components/ui/Tags.tsx`, `academix.css` | Variable `--ax-coral-display`: `#e94b3b` en claro (3,6:1); `#ff6b5b` en oscuro (6,7:1) | axe | No |
| **MEDIO** | Contraste insuficiente en modo oscuro (`text-primary`, insignias de error y aviso) | `src/app/globals.css` | Tokens ajustados (ver §4) | axe: 0 infracciones | No |
| **MEDIO** | Diseño desigual: la ficha, la verificación y el login conservaban el estilo antiguo; las cabeceras decían «Gestión académica» | Varias | Vibrant aplicado en toda la plataforma mediante tokens; cabecera y pie Vibrant en la ficha y la verificación; denominación oficial | Capturas | No |
| BAJO | `/verificar` sin `<h1>` | `src/app/verificar/**/page.tsx` | `<h1>` para lectores de pantalla | axe | No |
| BAJO | Página 404 y errores con el aspecto por defecto de Next | — | `src/app/not-found.tsx` (Vibrant) y `src/app/error.tsx` (sin detalles técnicos) | Prueba de `/no-existe` | No |
| BAJO | Login con contenido fuera de las regiones principales | `src/app/login/page.tsx`, `panel-marca.tsx` | `<nav>` y `<header>` | axe | No |
| BAJO | En las tarjetas de curso, «· Virtual» quedaba solo en una línea con categorías largas | `CourseCard.tsx` | Texto continuo | Captura | No |

### Revisado sin incidencias

- **Acciones de servidor:** las 18 verifican sesión o rol.
- **Paneles:** cada uno exige su rol en el servidor (`requerirPanel`).
- **Proxy:** solo hace una comprobación optimista; la autorización real la repite cada acción.
- **Clave secreta:** solo la usan módulos de servidor, con un bloqueo si se ejecutan en el navegador, y sin prefijo `NEXT_PUBLIC_`.
- **`.env.local`:** nunca se subió a Git.
- **API de correos:** usa `CRON_SECRET` con comparación en tiempo constante.
- **URL firmadas:** son de corta duración y se entregan al navegador; ninguna redirige desde un formulario.

## 3. Estado funcional por perfil (lógica real, no solo pantallas)

| Perfil | Operativo | En preparación (sin lógica: aparece como «en preparación») |
|---|---|---|
| Administrador | Inicio, categorías, cursos, docentes, grupos y horarios, estudiantes, solicitudes y reservas, matrículas, pagos y cuotas, medios de cobro, evaluaciones, certificados (plantillas, firmantes, emisión), mi institución, políticas, perfil | — |
| Docente | Inicio con indicadores reales, perfil | Mis grupos, horarios, estudiantes, evaluaciones y **calificaciones** |
| Estudiante | Inicio, explorar cursos, solicitudes, pagos y cuotas (con presentación de comprobantes), certificados, perfil | Mis cursos, horarios, evaluaciones y notas, reservas, matrículas |

### Flujos entre perfiles

| Flujo | Estado |
|---|---|
| Solicitud de inscripción → reserva → matrícula | Completo en el código. **Sin probar con datos reales**: el único curso publicado no tiene grupos, y los visitantes no ven grupos hasta aplicar la migración |
| Presentación de comprobante (estudiante) | Completo |
| Revisión de pago (administrador) | **Desactivada a propósito** (`REVISION_PAGOS_HABILITADA = false`) hasta superar las pruebas de pagos |
| Cronograma de cuotas | Completo (estudiante y administrador) |
| Asignación de docentes a grupos | Completo |
| Evaluaciones (creación y pesos por el administrador) | Completo |
| **Registro de calificaciones** | **Pendiente**: el administrador no califica (diseño) y el docente aún no tiene pantalla. Sin notas no hay resultado final ni certificados por la vía normal |
| Resultado final y certificados | Completo en el código; depende de las calificaciones |
| Docente ↔ estudiante (grupos, notas, consulta) | Pendiente: requiere el panel docente y «Evaluaciones y notas» del estudiante |

**Propuesta separada:** el panel docente (grupos asignados, estudiantes matriculados y registro de calificaciones) puede apoyarse en las RPC y políticas de `evaluaciones_admin_v5` y conviene implementarlo como fase propia.

## 4. Identidad Academix Vibrant

Se aplica en toda la plataforma mediante los tokens de `src/app/globals.css`.

| Elemento | Claro | Oscuro |
|---|---|---|
| Fondo | Crema `#fff8ee` | Índigo `#120e2b` |
| Texto | Índigo `#1b1446` | Lila `#f5f2ff` |
| Primario | Violeta `#6c3bf5` | `#7a55ff`; como texto, `#b9a3ff` |
| Bordes | `#efe4d2` | `#2e2760` |
| Éxito | `#0e7a55` | `#2ec4a0` |
| Aviso | `#92400e` | `#ffc93c` |
| Error | `#b91c1c` | `#fca5a5` |

- **Tipografía:** DM Sans para textos y Bricolage Grotesque para títulos (locales, licencia OFL).
- **Radio:** `0.875rem`.
- **Logotipo:** el oficial (`LogoAcademix`) en todas partes.
- **Denominación:** «Plataforma de Oferta y Gestión de Cursos Virtuales».

## 5. Pendientes antes de publicar

1. **Licencia de las fotografías** (`public/academix/estudiante-en-casa.jpg` y `estudiantes-biblioteca.jpg`): sin metadatos ni licencia acreditada. Alternativas legales:
   - fotos propias de la institución, con autorización de las personas que aparecen;
   - un banco con licencia comercial y la licencia guardada;
   - retirarlas: el diseño funciona con las formas.
2. **Aplicar `docs/migraciones/oferta_grupos_anon_v5.sql`** y probar el flujo completo con un grupo real en un entorno de pruebas.
3. **Revisión visual con sesión real** de los tres paneles: esta auditoría los verificó con su armazón real y datos de muestra locales.
4. **CSP completa con nonces** (`script-src`/`style-src`): hoy la CSP es acotada porque Next y el script de tema usan código en línea.
5. **Componentes sin uso**, que conviene borrar con autorización:
   - `src/components/public/catalogo-cursos.tsx`, `filtros-cursos.tsx`, `institucion-card.tsx`, `public-header.tsx`, `public-footer.tsx`;
   - `curso-card.tsx` y `estado-vacio.tsx`, que solo usa `catalogo-cursos`;
   - `leerFiltros` en `src/lib/oferta/cursos.ts` y `demoUsers` en `src/config/demo-user.ts`.
6. **Aviso informativo del build** («Dynamic server usage» en `/`): no afecta al funcionamiento; se elimina relanzando el error dinámico en `obtenerOfertaCursos`.

## 6. Correos (Resend): pendiente de configurar, arquitectura intacta

Ver `docs/correos/CONFIGURACION.md`.

| Correo | Canal | Estado |
|---|---|---|
| Recuperación de contraseña | Supabase Auth (SMTP) | Plantilla en `docs/correos/plantilla_auth_recuperar.html` |
| Invitación docente | Supabase Auth (SMTP) | Plantilla en `docs/correos/plantilla_auth_invitacion.html` |
| Solicitud recibida, matrícula confirmada, pago confirmado o rechazado, recordatorio de cuota, reservas | API (`src/lib/correos`) | Plantillas listas |
| Certificado emitido | API | Evento en `certificados_v5`, inerte sin la bandeja |

Para activarlos:

1. Verificar el dominio en Resend (SPF y DKIM).
2. Configurar estas variables:
   - `RESEND_API_KEY` (solo permiso de envío);
   - `CORREO_REMITENTE`;
   - `CRON_SECRET` (al menos 16 caracteres);
   - `NEXT_PUBLIC_SITE_URL`.
3. Aplicar `docs/migraciones/correos_transaccionales_v5.sql`.
4. Configurar el SMTP de Supabase Auth con Resend.

La confirmación obligatoria de correo al registrarse sigue desactivada y no debe reactivarse.
