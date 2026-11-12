/**
 * Reglas de activación de cuentas creadas por la institución (p. ej. docentes).
 * Módulo PURO (sin Next.js ni Supabase) para poder probarlo.
 *
 * Flujo: el administrador crea la cuenta (sin contraseña) con la marca
 * app_metadata.activacion_pendiente = true y Supabase envía la invitación con
 * redirectTo = <origen>/auth/activar. Mientras la marca exista, la cuenta no
 * entra a ningún panel: solo a /activar-cuenta. Se quita al crear la contraseña.
 *
 * app_metadata solo lo escribe el servidor con la clave secreta: el navegador
 * no puede ponerla ni quitarla.
 */

export const MARCA_ACTIVACION = "activacion_pendiente"

/** Ruta fija a la que vuelve el enlace de invitación (debe estar en Redirect URLs). */
export const RUTA_ACTIVACION = "/auth/activar"

/** Minutos durante los que una sesión abierta por el enlace sirve para activar. */
export const MINUTOS_SESION_INVITACION = 60

type Claims = Record<string, unknown> | null | undefined

/** true si el JWT (claims) pertenece a una cuenta con la activación pendiente. */
export function activacionPendiente(claims: Claims): boolean {
  const app = claims?.app_metadata
  return typeof app === "object" && app !== null && (app as Record<string, unknown>)[MARCA_ACTIVACION] === true
}

/**
 * true si la sesión se abrió con un enlace de invitación hace poco (amr de GoTrue:
 * [{ method: "invite", timestamp }]). Sirve para cuentas invitadas antes de que
 * existiera la marca.
 */
export function sesionDeInvitacion(claims: Claims, ahoraSeg = Math.floor(Date.now() / 1000)): boolean {
  const amr = claims?.amr
  if (!Array.isArray(amr)) return false
  return amr.some((m) => {
    if (typeof m !== "object" || m === null) return false
    const { method, timestamp } = m as { method?: unknown; timestamp?: unknown }
    return (
      method === "invite" &&
      typeof timestamp === "number" &&
      ahoraSeg - timestamp >= -60 &&
      ahoraSeg - timestamp <= MINUTOS_SESION_INVITACION * 60
    )
  })
}

const HOST_VALIDO = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+(\.[a-z0-9-]+)+)(:\d{1,5})?$/i

/**
 * Origen público (https://dominio) para los enlaces de los correos de Auth.
 * 1. NEXT_PUBLIC_SITE_URL si está definida (producción).
 * 2. Si no, el host de la petición (desarrollo local o vistas previas).
 * Devuelve null si nada es válido: entonces Supabase usa su Site URL.
 * Supabase además solo acepta destinos incluidos en «Redirect URLs».
 */
export function origenPublico(
  sitioConfigurado: string | undefined,
  cabeceras: { host?: string | null; proto?: string | null }
): string | null {
  const configurado = sitioConfigurado?.trim()
  if (configurado) {
    try {
      const url = new URL(configurado)
      if (url.protocol === "https:" || url.hostname === "localhost") return url.origin
    } catch {
      /* sigue con la cabecera */
    }
  }
  const host = cabeceras.host?.split(",")[0]?.trim()
  if (!host || !HOST_VALIDO.test(host)) return null
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)
  const proto = cabeceras.proto?.split(",")[0]?.trim()
  const esquema = local ? (proto === "https" ? "https" : "http") : "https"
  return `${esquema}://${host.toLowerCase()}`
}

export type ResultadoFragmento =
  | { tipo: "sesion"; accessToken: string; refreshToken: string }
  | { tipo: "error"; vencido: boolean }
  | { tipo: "nada" }

/**
 * Lee el fragmento (#...) con el que vuelve Supabase cuando la plantilla
 * «Invite user» es la predeterminada ({{ .ConfirmationURL }}, flujo implícito).
 * Solo acepta type=invite; cualquier otro tipo se ignora.
 */
export function leerFragmentoInvitacion(hash: string): ResultadoFragmento {
  const p = new URLSearchParams(hash.replace(/^#/, ""))
  if (p.has("error") || p.has("error_code")) {
    return { tipo: "error", vencido: p.get("error_code") === "otp_expired" }
  }
  const accessToken = p.get("access_token")
  const refreshToken = p.get("refresh_token")
  if (accessToken && refreshToken && p.get("type") === "invite") {
    return { tipo: "sesion", accessToken, refreshToken }
  }
  return { tipo: "nada" }
}
