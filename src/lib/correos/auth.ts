/**
 * Plantillas de los correos de Supabase Auth (puro), con el mismo diseño que
 * los correos de Academix. ÚNICA fuente: este archivo y lib/correos/diseno.ts.
 *   npm run correos:plantillas              genera docs/correos/supabase/ y vistas previas
 *   npm run correos:sincronizar             muestra qué cambiaría en Supabase
 *   npm run correos:sincronizar -- --aplicar  las aplica con la Management API
 * No se editan en el panel de Supabase.
 *
 * Variables del motor de plantillas de Supabase (Go templates). Solo se usa
 * {{ if }}/{{ else }}/{{ end }}, la condicional documentada por Supabase:
 *   {{ .RedirectTo }}  destino validado que envía la app (/auth/activar, /auth/restablecer…)
 *   {{ .TokenHash }}   token del enlace (el enlace se verifica en el servidor de Academix)
 *   {{ .Email }}, {{ .Data.* }} (user_metadata de la cuenta)
 *
 * Invitaciones: el SERVIDOR de Academix escribe en user_metadata, al crear la
 * cuenta y justo antes de cada (re)envío, los datos validados de la invitación:
 *   invitacion_institucion (nombre de la institución, leído de la BD),
 *   invitacion_admin (true si es administrador; si no, es docente),
 *   invitacion_nivel (acceso del administrador, p. ej. «Acceso completo»).
 * El invitado no puede modificarlos antes de recibir el correo: aún no puede
 * iniciar sesión. El rol REAL nunca sale de estos datos: lo dan usuario_roles y RLS.
 */

import { boton, COLORES, documento, nota, parrafo } from "@/lib/correos/diseno"

export type PlantillaAuth = {
  archivo: string
  /** Nombre de la plantilla en el panel de Supabase. */
  panel: string
  asunto: string
  html: string
  uso: string
}

const institucion = "{{ if .Data.invitacion_institucion }}{{ .Data.invitacion_institucion }}{{ else }}tu institución{{ end }}"
const nombre = "{{ if .Data.nombres }}Hola, {{ .Data.nombres }}:{{ else }}Hola:{{ end }}"
const pie = "Academix &middot; Plataforma de cursos virtuales<br>Recibiste este correo por una acción en tu cuenta de Academix. Si no la esperabas, puedes ignorarlo."

/** Enlace de activación: vuelve a /auth/activar (que verifica el token en el servidor). */
export const ENLACE_INVITACION = "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite"
export const ENLACE_RECUPERACION = "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery"
export const ENLACE_CONFIRMACION = "{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email"

function invitacion(): string {
  const docente = [
    parrafo(nombre),
    parrafo(`<strong>${institucion}</strong> te invitó a Academix como <strong>docente</strong>.`),
    parrafo("Desde tu panel docente verás tus grupos, horarios y estudiantes, compartirás materiales y registrarás las notas de tus cursos."),
  ].join("\n")
  const admin = [
    parrafo(nombre),
    parrafo(`<strong>${institucion}</strong> te invitó a su <strong>equipo administrativo</strong> en Academix (perfil Administrador).`),
    `{{ if .Data.invitacion_nivel }}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td style="padding:12px 16px;background:${COLORES.violetaSuave};border-radius:12px;font-size:14px;color:${COLORES.texto}"><strong style="color:${COLORES.violeta}">Tu acceso:</strong> {{ .Data.invitacion_nivel }}</td></tr></table>{{ end }}`,
    parrafo("Gestionarás la institución desde el mismo panel de administración, según los permisos que te asignaron."),
  ].join("\n")
  const cuerpo = [
    `{{ if .Data.invitacion_admin }}${admin}{{ else }}${docente}{{ end }}`,
    parrafo("Para empezar, activa tu cuenta y crea tu contraseña:"),
    boton(ENLACE_INVITACION, "Activar mi cuenta", true),
    nota("Por seguridad, el enlace vence y solo puede usarse una vez. Si venció, pide a tu institución que te reenvíe la invitación."),
    nota("Cuenta invitada: {{ .Email }}"),
  ].join("\n")
  return documento({
    titulo: "Invitación a Academix",
    preencabezado: "{{ if .Data.invitacion_admin }}Te invitaron al equipo administrativo{{ else }}Te invitaron como docente{{ end }} de " + institucion,
    etiqueta: "{{ if .Data.invitacion_admin }}Invitación · Administrador{{ else }}Invitación · Docente{{ end }}",
    encabezado: "{{ if .Data.invitacion_admin }}Únete al equipo administrativo{{ else }}Te damos la bienvenida como docente{{ end }}",
    institucion: "{{ if .Data.invitacion_institucion }}{{ .Data.invitacion_institucion }}{{ end }}",
    cuerpo,
    pie,
  })
}

export function plantillasAuth(): PlantillaAuth[] {
  return [
    {
      archivo: "invitacion.html",
      panel: "Invite user",
      asunto:
        "{{ if .Data.invitacion_admin }}Invitación al equipo administrativo de " + institucion + " — Academix{{ else }}Has sido invitado como docente a " + institucion + " — Academix{{ end }}",
      html: invitacion(),
      uso: "Invitaciones de docentes y de administradores (mismo flujo: /auth/activar → crear contraseña → panel).",
    },
    {
      archivo: "recuperacion.html",
      panel: "Reset password",
      asunto: "Restablece tu contraseña de Academix",
      html: documento({
        titulo: "Restablece tu contraseña",
        preencabezado: "Crea una contraseña nueva para tu cuenta de Academix",
        etiqueta: "Seguridad de la cuenta",
        tono: "ambar",
        encabezado: "Restablece tu contraseña",
        cuerpo: [
          parrafo("Hola:"),
          parrafo("Recibimos una solicitud para cambiar la contraseña de la cuenta <strong>{{ .Email }}</strong>."),
          boton(ENLACE_RECUPERACION, "Crear una contraseña nueva", true),
          nota("El enlace vence en una hora y solo puede usarse una vez."),
          nota("Si no lo solicitaste, ignora este correo: tu contraseña no cambiará."),
        ].join("\n"),
        pie,
      }),
      uso: "«¿Olvidaste tu contraseña?» y docentes o administradores que no terminaron de activar su cuenta.",
    },
    {
      archivo: "confirmacion.html",
      panel: "Confirm signup",
      asunto: "Confirma tu correo en Academix",
      html: documento({
        titulo: "Confirma tu correo",
        preencabezado: "Confirma tu correo para usar Academix",
        etiqueta: "Bienvenida",
        tono: "menta",
        encabezado: "Confirma tu correo",
        cuerpo: [
          parrafo("{{ if .Data.nombres }}Hola, {{ .Data.nombres }}:{{ else }}Hola:{{ end }}"),
          parrafo("Gracias por registrarte en Academix. Confirma que <strong>{{ .Email }}</strong> es tu correo:"),
          boton(ENLACE_CONFIRMACION, "Confirmar mi correo", true),
          nota("Si no creaste una cuenta en Academix, ignora este correo."),
        ].join("\n"),
        pie,
      }),
      uso: "Solo si la confirmación de correo está ACTIVADA en Supabase (Academix no la exige como requisito nuevo).",
    },
    {
      archivo: "cambio-correo.html",
      panel: "Change email address",
      asunto: "Confirma el cambio de correo de tu cuenta de Academix",
      html: documento({
        titulo: "Confirma el cambio de correo",
        etiqueta: "Seguridad de la cuenta",
        tono: "ambar",
        encabezado: "Confirma tu nuevo correo",
        cuerpo: [
          parrafo("Hola:"),
          parrafo("Recibimos una solicitud para cambiar el correo de tu cuenta de <strong>{{ .Email }}</strong> a <strong>{{ .NewEmail }}</strong>."),
          boton("{{ .ConfirmationURL }}", "Confirmar el cambio", true),
          nota("Si no lo solicitaste, ignora este correo y tu correo actual seguirá igual."),
        ].join("\n"),
        pie,
      }),
      uso: "Cambio de correo (la app no lo ofrece hoy; se deja en español por seguridad).",
    },
  ]
}
