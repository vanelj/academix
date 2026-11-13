/**
 * Configuración de los correos transaccionales (SOLO servidor).
 *
 * Variables (sin prefijo NEXT_PUBLIC_, nunca llegan al navegador):
 *   RESEND_API_KEY      clave de la API de Resend (permiso solo de envío).
 *   RESEND_FROM_EMAIL   remitente, p. ej. "Academix <no-reply@notificaciones.academix.mundosubs.net.pe>".
 *                       Debe pertenecer al dominio verificado en Resend.
 *                       (CORREO_REMITENTE se acepta como nombre anterior.)
 *   CRON_SECRET         protege /api/correos/procesar (Vercel Cron lo envía como Bearer).
 *   NEXT_PUBLIC_SITE_URL  URL pública del sitio para los enlaces de los correos.
 *
 * Sin RESEND_API_KEY o sin remitente no se envía nada: los correos se quedan
 * en la bandeja 'pendiente' y salen cuando se configure.
 */

export const SITIO_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://academix.mundosubs.net.pe").replace(/\/+$/, "")

/** Correos tomados por cada llamada al procesador (y en cada envío inmediato). */
export const LOTE_CORREOS = 20

/** Remitente con formato válido: «Nombre <correo@dominio>» o «correo@dominio». */
export function remitenteValido(v: string): boolean {
  return /^([^<>@\r\n]{1,80}\s<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>|[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)$/.test(v)
}

export function configuracionCorreo(entorno: Record<string, string | undefined> = process.env): { apiKey: string; remitente: string } | null {
  const apiKey = entorno.RESEND_API_KEY?.trim()
  const remitente = (entorno.RESEND_FROM_EMAIL ?? entorno.CORREO_REMITENTE)?.trim()
  if (!apiKey || !remitente || !remitenteValido(remitente)) return null
  return { apiKey, remitente }
}
