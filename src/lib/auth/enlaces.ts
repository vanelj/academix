import type { EmailOtpType } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

import { registrarErrorAuth } from "@/lib/auth/errores-auth"
import { COOKIE_RECUPERACION, MINUTOS_RECUPERACION } from "@/lib/auth/recuperacion"
import { createClient } from "@/lib/supabase/server"

/**
 * Verificación de enlaces de correo de Supabase Auth (SOLO servidor).
 *
 * Admite los dos formatos de enlace:
 *  1. token_hash + type → verifyOtp(). Recomendado para SSR: crea la sesión en
 *     CUALQUIER navegador. Requiere la plantilla de correo con {{ .TokenHash }}.
 *  2. code (PKCE, plantilla por defecto) → exchangeCodeForSession(). Solo funciona
 *     en el navegador donde se pidió el correo (allí está el code_verifier).
 *
 * Seguridad: los destinos son fijos (sin parámetros de redirección), la respuesta
 * no se guarda en caché y no envía Referer, para que el token no se filtre.
 */

type Modo = "confirmacion" | "recuperacion" | "activacion"

const TIPOS: Record<Modo, EmailOtpType[]> = {
  // "signup" es el tipo histórico de la plantilla de confirmación; "email" el actual.
  confirmacion: ["signup", "email"],
  recuperacion: ["recovery"],
  // Invitación de una cuenta creada por la institución (p. ej. un docente).
  activacion: ["invite"],
}

const AVISOS = {
  confirmacion: { base: "/login", otroNavegador: "correo-otro-navegador" },
  recuperacion: { base: "/recuperar-contrasena", otroNavegador: "otro-navegador" },
  activacion: { base: "/activar-cuenta", otroNavegador: "enlace-invalido" },
} as const

export async function verificarEnlace(request: NextRequest, modoRuta: Modo) {
  const params = request.nextUrl.searchParams
  const code = params.get("code")
  const tokenHash = params.get("token_hash")
  const tipo = params.get("type") as EmailOtpType | null

  // Un enlace de recuperación que llegue a /auth/confirmar se trata como recuperación.
  const modo: Modo = tipo === "recovery" ? "recuperacion" : modoRuta

  const ir = (ruta: string) => {
    const respuesta = NextResponse.redirect(new URL(ruta, request.url))
    respuesta.headers.set("Cache-Control", "no-store")
    respuesta.headers.set("Referrer-Policy", "no-referrer")
    return respuesta
  }
  const aviso = (clave: string) => ir(`${AVISOS[modo].base}?aviso=${clave}`)

  // Supabase redirige con error=...&error_code=... si el enlace venció o ya se usó.
  const errorCodigo = params.get("error_code")
  if (params.has("error") || errorCodigo) {
    return aviso(errorCodigo === "otp_expired" ? "enlace-vencido" : "enlace-invalido")
  }

  const supabase = await createClient()

  if (tokenHash && tipo) {
    if (!TIPOS[modo].includes(tipo)) return aviso("enlace-invalido")
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })
    if (error) {
      registrarErrorAuth("verificar-enlace", error)
      // GoTrue responde otp_expired tanto para enlaces vencidos como ya utilizados.
      return aviso(error.code === "otp_expired" ? "enlace-vencido" : "enlace-invalido")
    }
    return await destinoConSesion(modo, ir)
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      registrarErrorAuth("canjear-codigo", error)
      // Típicamente: enlace abierto en otro navegador. En confirmación, Supabase ya
      // marcó el correo como confirmado al abrir el enlace; falta iniciar sesión.
      return aviso(AVISOS[modo].otroNavegador)
    }
    return await destinoConSesion(modo, ir)
  }

  return aviso("enlace-invalido")
}

async function destinoConSesion(modo: Modo, ir: (ruta: string) => NextResponse) {
  if (modo === "confirmacion") {
    // /acceso decide: completar el registro pendiente, panel o selector de rol.
    return ir("/acceso")
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  if (!sub) return ir(`${AVISOS[modo].base}?aviso=enlace-invalido`)

  // Activación y recuperación comparten la marca: ambas terminan creando una contraseña.
  const almacen = await cookies()
  almacen.set(COOKIE_RECUPERACION, sub, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MINUTOS_RECUPERACION * 60,
  })
  return ir(modo === "activacion" ? "/activar-cuenta" : "/restablecer-contrasena")
}

/**
 * Usuario con sesión de recuperación válida (sesión + marca del mismo usuario),
 * o null. La usan /restablecer-contrasena y la acción actualizarContrasena.
 */
export async function usuarioEnRecuperacion(): Promise<string | null> {
  const almacen = await cookies()
  const marca = almacen.get(COOKIE_RECUPERACION)?.value
  if (!marca) return null

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  return sub && sub === marca ? sub : null
}
