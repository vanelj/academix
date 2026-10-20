import {
  isAuthApiError,
  isAuthRetryableFetchError,
  type AuthError,
} from "@supabase/supabase-js"

/**
 * Clasificación de errores de Supabase Auth en mensajes para el usuario.
 * Nunca se muestra el texto técnico; en desarrollo se registra solo nombre,
 * código y estado HTTP (sin contraseñas, sesiones ni tokens).
 */

export type TipoErrorAuth =
  | "credenciales"
  | "correo_sin_confirmar"
  | "limite"
  | "sin_conexion"
  | "servicio"
  | "contrasena_debil"
  | "misma_contrasena"
  | "sesion_vencida"
  | "cuenta_bloqueada"
  | "desconocido"

export function clasificarErrorAuth(error: AuthError): TipoErrorAuth {
  // Fallos de red (estado 0) o del servicio (5xx) que el SDK marca como reintentables.
  if (isAuthRetryableFetchError(error)) {
    return error.status && error.status >= 500 ? "servicio" : "sin_conexion"
  }

  if (error.status === 429) return "limite"

  if (isAuthApiError(error)) {
    switch (error.code) {
      case "invalid_credentials":
        return "credenciales"
      case "email_not_confirmed":
        return "correo_sin_confirmar"
      case "over_request_rate_limit":
      case "over_email_send_rate_limit":
        return "limite"
      case "weak_password":
        return "contrasena_debil"
      case "same_password":
        return "misma_contrasena"
      case "session_not_found":
      case "session_expired":
      case "refresh_token_not_found":
      case "refresh_token_already_used":
        return "sesion_vencida"
      case "user_banned":
        return "cuenta_bloqueada"
    }
    if (error.status && error.status >= 500) return "servicio"
  }

  return "desconocido"
}

export function registrarErrorAuth(contexto: string, error: AuthError) {
  console.error(`[${contexto}]`, { nombre: error.name, codigo: error.code, estado: error.status })
}

export const MENSAJES_AUTH = {
  credenciales: "El correo o la contraseña no son correctos.",
  limite:
    "Se alcanzó el límite de solicitudes. Espera unos minutos antes de volver a intentarlo.",
  limiteCorreo:
    "Se alcanzó el límite de envío de correos. Espera unos minutos antes de solicitar otro enlace.",
  sinConexion:
    "No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.",
  servicio:
    "El servicio de autenticación no está disponible en este momento. Inténtalo de nuevo en unos minutos.",
  contrasenaDebil:
    "La contraseña no cumple los requisitos de seguridad. Usa una contraseña más segura.",
  mismaContrasena: "La nueva contraseña debe ser distinta de la anterior.",
  sesionVencida:
    "El enlace de recuperación ya no es válido. Solicita uno nuevo para cambiar tu contraseña.",
  cuentaBloqueada:
    "Esta cuenta no puede iniciar sesión en este momento. Comunícate con tu institución.",
  generico: "No se pudo completar la operación. Inténtalo de nuevo en unos minutos.",
} as const

/** Mensaje para errores al enviar correos (confirmación, recuperación). */
export function mensajeErrorCorreo(error: AuthError): string {
  switch (clasificarErrorAuth(error)) {
    case "limite":
      return MENSAJES_AUTH.limiteCorreo
    case "sin_conexion":
      return MENSAJES_AUTH.sinConexion
    case "servicio":
      return MENSAJES_AUTH.servicio
    default:
      return MENSAJES_AUTH.generico
  }
}
