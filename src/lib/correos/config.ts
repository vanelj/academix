/**
 * Configuración de los correos transaccionales (SOLO servidor).
 *
 * Variables (sin prefijo NEXT_PUBLIC_, nunca llegan al navegador):
 *   RESEND_API_KEY     clave de la API de Resend (con permiso solo de envío).
 *   CORREO_REMITENTE   p. ej. "Academix <notificaciones@academix.mundosubs.net.pe>";
 *                      el dominio debe estar verificado en Resend (SPF y DKIM).
 *   CRON_SECRET        protege /api/correos/procesar (Vercel Cron lo envía como Bearer).
 *   NEXT_PUBLIC_SITE_URL  URL pública del sitio para los enlaces de los correos.
 *
 * Sin RESEND_API_KEY o sin CORREO_REMITENTE no se envía nada: los correos se
 * quedan en la bandeja 'pendiente' y salen cuando se configure.
 */

export const SITIO_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://academix.mundosubs.net.pe").replace(/\/+$/, "")

/** Correos tomados por cada llamada al procesador (y en cada envío inmediato). */
export const LOTE_CORREOS = 20

export function configuracionCorreo(): { apiKey: string; remitente: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const remitente = process.env.CORREO_REMITENTE?.trim()
  if (!apiKey || !remitente) return null
  return { apiKey, remitente }
}
