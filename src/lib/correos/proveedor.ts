/**
 * Envío con la API REST de Resend (sin dependencias nuevas). SOLO servidor.
 *
 * Idempotencia: la clave única del correo viaja como Idempotency-Key. Si el
 * proceso se corta después de enviar y antes de marcarlo como enviado, el
 * reintento con la misma clave no genera un segundo correo (Resend la recuerda 24 h).
 */

export type MensajeCorreo = {
  para: string
  asunto: string
  html: string
  texto: string
  clave: string
  responderA?: string | null
}

export type ResultadoEnvio =
  | { ok: true; id: string | null }
  /** reintentable: error temporal (red, límite, 5xx). detener: problema de configuración, conviene parar el lote. */
  | { ok: false; error: string; reintentable: boolean; detener?: boolean }

const URL_RESEND = "https://api.resend.com/emails"
const ESPERA_MS = 15_000

export async function enviarConResend(
  m: MensajeCorreo,
  config: { apiKey: string; remitente: string }
): Promise<ResultadoEnvio> {
  let respuesta: Response
  try {
    respuesta = await fetch(URL_RESEND, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": m.clave.slice(0, 256),
      },
      body: JSON.stringify({
        from: config.remitente,
        to: [m.para],
        subject: m.asunto,
        html: m.html,
        text: m.texto,
        ...(m.responderA ? { reply_to: m.responderA } : {}),
      }),
      signal: AbortSignal.timeout(ESPERA_MS),
      cache: "no-store",
    })
  } catch (e) {
    return { ok: false, reintentable: true, error: `Red: ${e instanceof Error ? e.name : "error"}` }
  }

  let cuerpo: { id?: string; name?: string; message?: string } = {}
  try {
    cuerpo = await respuesta.json()
  } catch {
    // Respuesta sin JSON: se clasifica solo por el código HTTP.
  }

  if (respuesta.ok) return { ok: true, id: typeof cuerpo.id === "string" ? cuerpo.id : null }

  const detalle = `HTTP ${respuesta.status}${cuerpo.name ? ` ${cuerpo.name}` : ""}${cuerpo.message ? `: ${cuerpo.message}` : ""}`.slice(0, 500)
  const s = respuesta.status
  // Clave o dominio mal configurados: se reintenta más tarde y se detiene el lote.
  if (s === 401 || s === 403) return { ok: false, reintentable: true, detener: true, error: detalle }
  // La misma clave con otro contenido (cambió la plantilla tras un intento): no reintentar.
  if (s === 409 && cuerpo.name === "invalid_idempotent_request") return { ok: false, reintentable: false, error: detalle }
  if (s === 409 || s === 429 || s >= 500) return { ok: false, reintentable: true, detener: s === 429, error: detalle }
  // 400/422: destinatario o datos inválidos. Reintentar no lo arregla.
  return { ok: false, reintentable: false, error: detalle }
}
