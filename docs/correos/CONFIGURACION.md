# Correos de Academix — configuración manual

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

- **Reset password**: pegar `plantilla_auth_recuperar.html`. El asunto sugerido está dentro del archivo.
- **Invite user**: pegar `plantilla_auth_invitacion.html`.
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
| `CORREO_REMITENTE` | `Academix <notificaciones@<dominio verificado>>` |
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
