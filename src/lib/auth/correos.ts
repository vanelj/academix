import { mensajeErrorCorreo, registrarErrorAuth } from "@/lib/auth/errores-auth"
import { createClient } from "@/lib/supabase/client"

/**
 * Envío de correos de Supabase Auth desde el navegador.
 *
 * Los enlaces vuelven a rutas fijas de la app (sin parámetros de destino):
 *   - confirmación de cuenta → /auth/confirmar
 *   - recuperación de contraseña → /auth/restablecer
 * Esas URL deben estar en Authentication → URL Configuration → Redirect URLs.
 */

export type ResultadoCorreo = { ok: true } | { ok: false; mensaje: string }

export const rutaConfirmacion = () => `${window.location.origin}/auth/confirmar`
export const rutaRecuperacion = () => `${window.location.origin}/auth/restablecer`

export async function reenviarConfirmacion(correo: string): Promise<ResultadoCorreo> {
  try {
    const { error } = await createClient().auth.resend({
      type: "signup",
      email: correo,
      options: { emailRedirectTo: rutaConfirmacion() },
    })
    if (error) {
      registrarErrorAuth("reenviar-confirmacion", error)
      return { ok: false, mensaje: mensajeErrorCorreo(error) }
    }
    return { ok: true }
  } catch {
    return { ok: false, mensaje: "No se pudo enviar el correo. Revisa tu conexión e inténtalo de nuevo." }
  }
}

export async function solicitarRecuperacion(correo: string): Promise<ResultadoCorreo> {
  try {
    const { error } = await createClient().auth.resetPasswordForEmail(correo, {
      redirectTo: rutaRecuperacion(),
    })
    if (error) {
      registrarErrorAuth("recuperar-contrasena", error)
      return { ok: false, mensaje: mensajeErrorCorreo(error) }
    }
    return { ok: true }
  } catch {
    return { ok: false, mensaje: "No se pudo enviar el correo. Revisa tu conexión e inténtalo de nuevo." }
  }
}
