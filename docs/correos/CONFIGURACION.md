# Correos de Academix — configuración

## 0. Puesta en marcha (estado al 12-11-2026)

**Ya hecho por el usuario:** dominio `notificaciones.academix.mundosubs.net.pe` verificado en Resend (DNS correcto), API key de envío creada, SMTP de Supabase Auth con Resend (`smtp.resend.com:465`, usuario `resend`, remitente `no-reply@notificaciones.academix.mundosubs.net.pe`, nombre `Academix`) y prueba real de envío correcta. **No repetir nada de eso.**
**Ya aplicada en Supabase:** `correos_transaccionales_v5` (cola `correos_salientes`; comprobado sin escribir).

| Canal | Correos | Quién envía |
|---|---|---|
| Supabase Auth + SMTP de Resend | Invitación de docentes y de administradores, recuperación de contraseña (y confirmación/cambio de correo si estuvieran activos) | Supabase, con las plantillas de `docs/correos/supabase/` |
| App (Next.js) + API de Resend | Solicitudes, comprobante recibido, pago aprobado/rechazado, reservas, matrícula confirmada/anulada, cuotas y recordatorios, cambio de horario, resultado final, certificado disponible | `src/lib/correos` desde la cola `correos_salientes` (un correo por evento: clave única + Idempotency-Key) |

Ningún evento sale por los dos canales: las invitaciones solo las envía Supabase.

### Gestión desde VS Code (sin editar el panel de Supabase)

Todo correo se edita en el repositorio:

| Qué | Dónde se edita |
|---|---|
| Diseño común (logo, colores, botón, pie) | `src/lib/correos/diseno.ts` |
| Invitación (docente / administrador), recuperación, confirmación, cambio de correo — HTML y asunto | `src/lib/correos/auth.ts` |
| Correos de la app (solicitudes, pagos, matrículas, horario, resultado, certificado) | `src/lib/correos/plantillas.ts` |

| Comando | Qué hace |
|---|---|
| `npm run correos:plantillas` | Genera `docs/correos/supabase/*.html` y las vistas previas |
| `npm run correos:vista-previa` | Igual, e indica `docs/correos/vista-previa/index.html` para abrirlas (invitación docente y administrador con datos de ejemplo) |
| `npm run correos:verificar` | Sintaxis, roles, enlaces seguros y variables (sin mostrar valores). Con token, compara con Supabase **sin cambiar nada** |
| `npm run correos:sincronizar` | Vista previa: qué plantillas de Supabase cambiarían. **No envía nada** |
| `npm run correos:sincronizar -- --aplicar` | Guarda un respaldo local (`.correos-respaldo/`, fuera de Git), aplica SOLO las plantillas que difieren y comprueba el resultado |
| `npm run correos:probar` | Pruebas de correos (Resend y Supabase simulados) |

**Cómo sincroniza:** Supabase Management API oficial (`GET`/`PATCH /v1/projects/{ref}/config/auth`). El PATCH solo puede llevar 8 claves (`mailer_subjects_*` y `mailer_templates_*_content` de invite, recovery, confirmation y email_change): SMTP, confirmación obligatoria, URLs y proveedores no se tocan.

**Credenciales:** archivo `.env.herramientas` en la raíz (ignorado por Git), a partir de `docs/correos/herramientas.env.ejemplo`: `SUPABASE_ACCESS_TOKEN` (token personal de Supabase) y, opcional, `SUPABASE_PROJECT_REF`. No va en Vercel ni en `.env.local`.

**Variables y condiciones en Supabase:** la documentación oficial confirma que `.Data` es `user_metadata`, que se usan plantillas Go con `{{ if }}/{{ else }}` y que el asunto admite variables (su ejemplo usa `{{ .Token }}` en el asunto). Las plantillas solo usan esas construcciones. Que `.Data` funcione también en el ASUNTO no está documentado explícitamente: se confirma con la prueba real controlada. Si fallara, la alternativa es el **Send Email Hook** (Supabase llama a un endpoint de Academix y este envía con Resend y las mismas plantillas); **no** se activa ahora para no tener dos mecanismos que dupliquen correos.

### Pasos pendientes (en este orden)
1. **Plantillas de Supabase:** crear `.env.herramientas`, ejecutar `npm run correos:sincronizar` (vista previa) y, con tu autorización, `npm run correos:sincronizar -- --aplicar`.
2. **Vercel → Settings → Environment Variables** (entorno **Production**; en **Preview** solo si quieres probar allí):
   | Variable | Valor |
   |---|---|
   | `RESEND_API_KEY` | la API key de Resend (la misma u otra con permiso de envío). **Solo servidor**: nunca `NEXT_PUBLIC_…` |
   | `RESEND_FROM_EMAIL` | `Academix <no-reply@notificaciones.academix.mundosubs.net.pe>` |
   | `CRON_SECRET` | cadena aleatoria ≥ 16 caracteres (`openssl rand -hex 32`) |
   | `NEXT_PUBLIC_SITE_URL` | `https://academix.mundosubs.net.pe` |
   | `SUPABASE_SECRET_KEY` | ya existe (la usa el procesador solo para sus RPC) |
   Tras guardarlas, **volver a desplegar** (las variables solo se cargan en un despliegue nuevo).
3. **Tarea programada:** `vercel.json` ya define `GET /api/correos/procesar` diario a las 13:00 UTC (08:00 Lima). Vercel la activa en el siguiente despliegue y envía `Authorization: Bearer <CRON_SECRET>`.
4. **Migración** `docs/migraciones/correos_academicos_v5.sql` (cambio de horario, resultado final y horario en la matrícula). Sin ella, esos dos correos no se encolan; el resto funciona.
5. **Comprobar:**
   - Variables cargadas: `curl -i -H "Authorization: Bearer <CRON_SECRET>" https://academix.mundosubs.net.pe/api/correos/procesar` → `200` con `{"estado":"ok",…}`. `{"estado":"sin_configurar"}` = falta `RESEND_API_KEY`/`RESEND_FROM_EMAIL`; `401` = `CRON_SECRET` no coincide.
   - Cola: `select tipo, estado, intentos, ultimo_error from public.correos_salientes order by creado_en desc limit 20;`
   - Invitación: invitar a un docente de prueba a **tu propio correo** y comprobar asunto, institución, rol y que el enlace llega a «Bienvenido a Academix — Configura tu contraseña».

---

## Referencia anterior


Sitio: `https://academix.mundosubs.net.pe`. Pagos manuales (Yape, Plin, depósito,
transferencia) con comprobante y verificación del administrador. Sin pasarela.

Hay **dos canales** de correo, y los dos pueden salir por Resend:

| Canal | Correos | Quién los envía |
|---|---|---|
| Supabase Auth (SMTP) | Recuperar contraseña, invitación y activación docente | Supabase, con las plantillas de esta carpeta |
| Transaccionales (API) | Solicitudes, instrucciones de pago, comprobantes, aprobación y rechazo, reservas, matrículas, cancelaciones, vencimientos, cuotas y recordatorios | La app (`src/lib/correos`), desde la bandeja `correos_salientes` |

No se envían correos de confirmación de cuenta.

---

## 1. Confirmación de correo al registrarse

**Estado real (consultado el 27-10-2026 con `GET /auth/v1/settings`):**
`mailer_autoconfirm: true`, o sea que **«Confirm email» ya está desactivado**.
Proveedores activos: `email` y `google`. Registro abierto: `disable_signup: false`.

No hay que cambiar nada. Si alguna vez se reactiva, el código lo soporta: el
registro institucional se guarda como pendiente y se completa tras confirmar.

Para desactivarlo de nuevo: **Authentication → Sign In / Providers → Email →
desmarcar «Confirm email» → Save**. Esa opción solo afecta a `signUp` con
correo y contraseña:

- **Google OAuth**: no depende de ella; Google ya entrega el correo verificado.
- **Registro institucional**: `signUp` devuelve una sesión y la RPC
  `registrar_institucion` se ejecuta en el momento.
- **Registro de estudiantes**: entra con Google o con su cuenta y luego llama a
  `registrar_estudiante`; tampoco depende de la opción.
- **Invitaciones docentes** (`inviteUserByEmail`) y **recuperación**
  (`resetPasswordForEmail`) siguen enviándose siempre. No desactivar el
  proveedor Email: también apagaría la recuperación y las invitaciones.

**Mantener activado**: «Secure email change» (el cambio de correo exige
confirmar el nuevo y el anterior).

**Riesgo conocido sin confirmación:** cualquiera puede registrarse con un correo
ajeno. Supabase marca ese correo como verificado y, si el dueño real entra luego
con Google, ambas identidades quedan en la misma cuenta (quien la creó conserva
su contraseña). Mitigaciones: el dueño puede usar «Recuperar contraseña» para
tomar el control; para cerrar el hueco del todo habría que exigir verificación
solo al registro institucional o enviar un aviso de «cuenta creada» (pendiente
de decisión).

## 2. Resend

1. Crear la cuenta en resend.com y **añadir el dominio** de envío. Se recomienda
   un subdominio dedicado, por ejemplo `academix.mundosubs.net.pe` o
   `correo.mundosubs.net.pe`.
2. En el DNS de `mundosubs.net.pe`, crear los registros que indique Resend
   (DKIM `resend._domainkey`, SPF y MX del subdominio de rebote). Añadir DMARC si
   no existe, por ejemplo `_dmarc` con `v=DMARC1; p=none; rua=mailto:…`.
   Esperar a que Resend muestre el dominio como **Verified**.
3. Crear una **API key con permiso «Sending access»** limitada a ese dominio.

## 3. SMTP de Supabase (recuperación e invitaciones)

El SMTP integrado de Supabase permite muy pocos correos por hora y no sirve en
producción.

**Authentication → Emails → SMTP Settings → Enable custom SMTP:**

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | la API key de Resend (puede ser otra key distinta de la de la app) |
| Sender email | `notificaciones@<dominio verificado>` |
| Sender name | `Academix` |

Después, en **Authentication → Rate Limits**, subir «emails per hour» según el
volumen esperado.

**Authentication → Emails → Templates:**

- **Reset password** e **Invite user**: se gestionan desde el repositorio con `npm run correos:sincronizar` (ver sección 0); no editarlas en el panel.
- Enlace de la invitación:
  `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite`: vuelve a la
  `/auth/activar` que envía la app (local o producción). Mientras no se cambie,
  la plantilla predeterminada (`{{ .ConfirmationURL }}`) también funciona: la
  app lee la sesión del fragmento `#access_token` en `/activar-cuenta`.
- Confirm signup, Magic link: no se usan.
- Change email address: puede quedar con la plantilla por defecto.

**Authentication → URL Configuration:**

- Site URL: `https://academix.mundosubs.net.pe`
- Redirect URLs:
  - `https://academix.mundosubs.net.pe/auth/callback` (Google)
  - `https://academix.mundosubs.net.pe/auth/restablecer`
  - `https://academix.mundosubs.net.pe/auth/activar`
  - `https://academix.mundosubs.net.pe/auth/confirmar`
  - `http://localhost:3000/**` (solo para desarrollo)

**Activación de docentes (invitación).** La app envía la invitación con
`redirectTo = <origen>/auth/activar`, donde `<origen>` es `NEXT_PUBLIC_SITE_URL`
si está definida o, si no, el dominio desde el que el administrador registró al
docente. Si ese destino no está en Redirect URLs, Supabase usa la Site URL y el
enlace no llega a la pantalla de activación. Flujo: enlace → `/auth/activar`
(verifica el token) → `/activar-cuenta` («Bienvenido a Academix — Configura tu
contraseña») → `/login` → `/docente`. Hasta crear la contraseña, la cuenta
(marca `app_metadata.activacion_pendiente`) no entra a ningún panel.

**Google Cloud Console:** el URI de redirección autorizado sigue siendo el de
Supabase (`https://<proyecto>.supabase.co/auth/v1/callback`). No cambia con el
dominio. Si la pantalla de consentimiento muestra dominios autorizados, añadir
`mundosubs.net.pe`.

## 4. Base de datos (migración, a revisar y autorizar)

`docs/migraciones/correos_transaccionales_v5.sql`: crea la bandeja, los
disparadores y las funciones del procesador. Solo añade objetos y la reversión
está al final del archivo. Hasta que se aplique, la app no encola ni envía
nada, y las acciones funcionan igual que hoy.

## 5. Variables de entorno (Vercel y `.env.local`)

| Variable | Valor |
|---|---|
| `RESEND_API_KEY` | API key de envío de Resend |
| `RESEND_FROM_EMAIL` (antes `CORREO_REMITENTE`) | `Academix <no-reply@notificaciones.academix.mundosubs.net.pe>` |
| `CRON_SECRET` | cadena aleatoria de al menos 16 caracteres (p. ej. `openssl rand -hex 32`) |
| `NEXT_PUBLIC_SITE_URL` | `https://academix.mundosubs.net.pe` |
| `SUPABASE_SECRET_KEY` | ya existe; el procesador la usa solo para sus 3 RPC exclusivas |

Sin `RESEND_API_KEY` o sin `CORREO_REMITENTE` no se envía nada: los correos se
quedan en `pendiente` y salen al configurarlas.

## 6. Tarea programada

`GET /api/correos/procesar` con la cabecera `Authorization: Bearer <CRON_SECRET>`.

La tarea encola los recordatorios del día y envía o reintenta los correos
pendientes. Es idempotente.

- **Vercel Cron** (`vercel.json`, no creado; requiere autorización):
  ```json
  { "crons": [{ "path": "/api/correos/procesar", "schedule": "0 13 * * *" }] }
  ```
  `0 13 * * *` UTC son las 08:00 en Lima. El plan Hobby solo permite una
  ejecución diaria; en Pro se puede usar `*/10 * * * *` para reintentos más
  frecuentes.
- **Alternativa:** pg_cron con pg_net en Supabase, o cualquier servicio de cron
  externo con la misma cabecera.

Los correos de eventos (pagos, solicitudes, matrículas) no esperan a la tarea:
salen en cuanto termina la acción, mediante `after()`. La tarea solo cubre los
recordatorios y los reintentos.

## 7. Comprobación

1. Con la migración aplicada, crear una solicitud con una cuenta de prueba y ver
   la fila con `select tipo, estado, intentos, ultimo_error from public.correos_salientes order by creado_en desc limit 10;`.
2. Llamar a la tarea:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://academix.mundosubs.net.pe/api/correos/procesar`.
   Debe devolver `{"estado":"ok", ...}`.
3. Revisar la entrega en Resend → Emails.
4. Si un correo queda en `fallido`, corregir la causa (visible en `ultimo_error`)
   y reintentarlo como admin con `select public.correos_reintentar('<id>');`.

## 8. Puntos de integración (estado al 12-11-2026)

La infraestructura ya existe (`src/lib/correos`, `/api/correos/procesar`, `correos_transaccionales_v5.sql`). No hay que crear otra. Ninguna operación académica depende de que el correo salga.

| Correo | Origen | Estado |
|---|---|---|
| Invitación a docentes | Supabase Auth (`inviteUserByEmail`) + plantilla `plantilla_auth_invitacion.html` | Requiere SMTP de Resend en Supabase (sección 3) |
| Recuperación de contraseña | Supabase Auth + `plantilla_auth_recuperar.html` | Requiere SMTP de Resend en Supabase (sección 3) |
| Solicitud recibida, comprobante recibido/por revisar, pago rechazado | Disparadores de `correos_transaccionales_v5` → plantillas de `src/lib/correos/plantillas.ts` | Requiere migración + variables (secciones 4 y 5) |
| Matrícula confirmada / anulada | Ídem | Ídem |
| Certificado emitido | Ídem | Ídem |
| Recordatorio de cuota | `encolar_recordatorios_correo` + tarea programada | Sección 6 |

Las notificaciones internas (`notificaciones_v5`) son independientes del correo: la campana funciona sin Resend.
