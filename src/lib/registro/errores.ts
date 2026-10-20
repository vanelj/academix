import type { PostgrestError } from "@supabase/supabase-js"

/** Mensajes del registro institucional, sin detalles técnicos de Supabase/PostgreSQL. */
export const MENSAJES_REGISTRO = {
  sinConexion:
    "No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.",
  correoRegistrado:
    "Este correo electrónico ya está registrado. Si ya tienes una cuenta, inicia sesión.",
  cuentaConInstitucion:
    "Esta cuenta ya tiene una institución registrada. Inicia sesión para acceder al panel.",
  rucDuplicado:
    "Ya existe una institución registrada con ese RUC. Revisa el dato e inténtalo de nuevo.",
  sesionNoActiva:
    "Tu sesión no está activa. Inicia sesión e inténtalo de nuevo.",
  passwordDebil:
    "La contraseña no cumple los requisitos de seguridad. Usa una contraseña más segura.",
  correoNoAceptado:
    "No se pudo usar ese correo electrónico. Verifica que esté bien escrito.",
  demasiadosIntentos:
    "Se realizaron demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
  registroDeshabilitado:
    "El registro de nuevas cuentas no está disponible en este momento.",
  errorAuth: "No se pudo crear la cuenta. Inténtalo de nuevo en unos minutos.",
  errorRegistro:
    "No se pudo registrar la institución. Inténtalo de nuevo en unos minutos.",
  inesperado: "Ocurrió un error inesperado. Inténtalo de nuevo.",
} as const

/** Traduce un error de la RPC registrar_institucion() a un mensaje para el usuario. */
export function mensajeErrorRegistro(e: PostgrestError): string {
  if (esErrorDeRed(e)) return MENSAJES_REGISTRO.sinConexion

  console.error("[registro] error de registrar_institucion", e.code, e.message)

  // Violación de unicidad: el único campo único que llega desde el formulario es el RUC.
  if (e.code === "23505") {
    return `${e.message} ${e.details ?? ""}`.includes("ruc")
      ? MENSAJES_REGISTRO.rucDuplicado
      : MENSAJES_REGISTRO.errorRegistro
  }

  // Excepciones lanzadas explícitamente por la función (RAISE EXCEPTION).
  if (e.code === "P0001") {
    if (e.message.includes("ya pertenece a una institución")) {
      return MENSAJES_REGISTRO.cuentaConInstitucion
    }
    if (e.message.includes("iniciar sesión") || e.message.includes("anónima")) {
      return MENSAJES_REGISTRO.sesionNoActiva
    }
  }

  return MENSAJES_REGISTRO.errorRegistro
}

export function esErrorDeRed(e: unknown): boolean {
  const mensaje =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : ""
  return /failed to fetch|fetch failed|networkerror|load failed|network request failed/i.test(
    mensaje
  )
}
