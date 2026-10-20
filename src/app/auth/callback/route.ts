import { NextResponse, type NextRequest } from "next/server"

import { destinoTrasLogin } from "@/lib/auth/acciones"
import { registrarErrorAuth } from "@/lib/auth/errores-auth"
import { createClient } from "@/lib/supabase/server"

/**
 * Retorno de Academix tras iniciar sesión con un proveedor OAuth (Google).
 *
 * Flujo: botón → Supabase Auth → Google → Supabase (/auth/v1/callback) → aquí con
 * ?code=... (PKCE). El `state` de OAuth lo genera y verifica Supabase en su propio
 * callback; aquí se canjea el `code` con el code_verifier que el navegador guardó
 * en una cookie al pulsar el botón (solo funciona en ese mismo navegador).
 *
 * Seguridad:
 * - El destino NO sale de la URL: lo decide destinoTrasLogin() en el servidor
 *   (panel, selector de rol o incorporación). Sin redirecciones abiertas.
 * - Iniciar sesión con Google no concede roles: sin perfil, la persona va a
 *   /completar-registro, donde elige registrarse como estudiante o institución.
 * - Respuesta sin caché y sin Referer, para que el code no se filtre.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  const ir = (ruta: string) => {
    const respuesta = NextResponse.redirect(new URL(ruta, request.url))
    respuesta.headers.set("Cache-Control", "no-store")
    respuesta.headers.set("Referrer-Policy", "no-referrer")
    return respuesta
  }

  // Google o Supabase devuelven ?error=... si la persona cancela o algo falla.
  const error = params.get("error")
  if (error) {
    return ir(`/login?aviso=${error === "access_denied" ? "google-cancelado" : "google-error"}`)
  }

  const code = params.get("code")
  if (!code) return ir("/login?aviso=google-error")

  const supabase = await createClient()
  const { error: canjeError } = await supabase.auth.exchangeCodeForSession(code)
  if (canjeError) {
    registrarErrorAuth("oauth-callback", canjeError)
    // Sin code_verifier (otro navegador) o code vencido/reutilizado.
    return ir("/login?aviso=google-error")
  }

  try {
    const resultado = await destinoTrasLogin()
    return ir(resultado.ok ? resultado.destino : "/acceso")
  } catch (e) {
    console.error("[auth] destino tras OAuth", e instanceof Error ? e.message : e)
    return ir("/acceso")
  }
}
