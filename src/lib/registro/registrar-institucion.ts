import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
  type AuthError,
} from "@supabase/supabase-js"

import { rutaConfirmacion } from "@/lib/auth/correos"
import {
  esErrorDeRed,
  mensajeErrorRegistro,
  MENSAJES_REGISTRO as MENSAJES,
} from "@/lib/registro/errores"
import {
  CLAVE_REGISTRO_PENDIENTE,
  parametrosRegistrarInstitucion,
  type DatosRegistro,
} from "@/lib/registro/pendiente"
import { createClient } from "@/lib/supabase/client"
import type { RegistroValues } from "@/lib/validations/registro"

/**
 * Registro de una institución y de su administrador (V4, sin cambios en V5).
 *
 * 1. Crea la cuenta en Supabase Auth (correo + contraseña). Los datos de la
 *    institución se guardan como registro pendiente en user_metadata.
 * 2. Con sesión activa, llama a la RPC public.registrar_institucion(), que en
 *    una sola transacción crea la institución, el perfil, el rol 'admin' y lo
 *    deja como rol activo. El cliente no elige el rol ni el institucion_id.
 *
 * Si Supabase exige confirmar el correo, signUp() no devuelve sesión y la RPC
 * NO se llama (fallaría con auth.uid() = NULL). El registro se completa en
 * /completar-registro después de confirmar el correo e iniciar sesión.
 */

export type ResultadoRegistro =
  | { estado: "completado" }
  | { estado: "confirmar_correo"; correo: string }
  | { estado: "error"; mensaje: string }

const error = (mensaje: string): ResultadoRegistro => ({ estado: "error", mensaje })

export async function registrarInstitucion(
  valores: RegistroValues
): Promise<ResultadoRegistro> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return error(MENSAJES.sinConexion)
  }

  const { institucion, administrador } = valores
  const datos: DatosRegistro = {
    institucion,
    administrador: {
      nombres: administrador.nombres,
      apellidos: administrador.apellidos,
      dni: administrador.dni,
    },
  }
  const supabase = createClient()

  try {
    // Reintento: si un intento anterior creó la cuenta con sesión pero la RPC
    // falló (p. ej. RUC duplicado), se reutiliza esa sesión en lugar de volver
    // a llamar a signUp(), que respondería "correo ya registrado".
    const {
      data: { user: usuarioActual },
    } = await supabase.auth.getUser()
    const mismaCuenta =
      usuarioActual?.email?.toLowerCase() === administrador.correo.toLowerCase()

    if (!mismaCuenta) {
      const { data, error: authError } = await supabase.auth.signUp({
        email: administrador.correo,
        password: administrador.password,
        options: {
          // Datos para completar el registro tras confirmar el correo (no conceden permisos).
          data: { [CLAVE_REGISTRO_PENDIENTE]: datos },
          // El enlace del correo vuelve a la app, que crea la sesión y continúa el registro.
          emailRedirectTo: rutaConfirmacion(),
        },
      })

      if (authError) {
        return error(mensajeAuth(authError))
      }

      // Con la confirmación de correo activa, Supabase no revela si el correo
      // ya existía: devuelve un usuario sin identidades y sin sesión.
      if (data.user && data.user.identities?.length === 0) {
        return error(MENSAJES.correoRegistrado)
      }

      if (!data.session) {
        return { estado: "confirmar_correo", correo: administrador.correo }
      }
    }

    const { error: rpcError } = await supabase.rpc(
      "registrar_institucion",
      parametrosRegistrarInstitucion(datos)
    )

    if (rpcError) {
      return error(mensajeErrorRegistro(rpcError))
    }

    // El registro ya existe: se descarta el pendiente (si falla no afecta, la cuenta ya tiene perfil).
    await supabase.auth.updateUser({ data: { [CLAVE_REGISTRO_PENDIENTE]: null } })

    return { estado: "completado" }
  } catch (e) {
    console.error("[registro] error inesperado", e)
    return error(esErrorDeRed(e) ? MENSAJES.sinConexion : MENSAJES.inesperado)
  }
}

function mensajeAuth(e: AuthError): string {
  if (isAuthRetryableFetchError(e)) return MENSAJES.sinConexion
  if (isAuthWeakPasswordError(e)) return MENSAJES.passwordDebil

  console.error("[registro] error de Supabase Auth", e.code, e.message)

  if (isAuthApiError(e)) {
    switch (e.code) {
      case "user_already_exists":
      case "email_exists":
        return MENSAJES.correoRegistrado
      case "weak_password":
        return MENSAJES.passwordDebil
      case "email_address_invalid":
      case "email_address_not_authorized":
        return MENSAJES.correoNoAceptado
      case "over_request_rate_limit":
      case "over_email_send_rate_limit":
        return MENSAJES.demasiadosIntentos
      case "signup_disabled":
      case "email_provider_disabled":
        return MENSAJES.registroDeshabilitado
    }
  }

  return MENSAJES.errorAuth
}
