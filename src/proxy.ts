import { NextResponse, type NextRequest } from "next/server"

import { actualizarSesion } from "@/lib/supabase/proxy"

// Rutas que exigen sesión. Es una comprobación optimista: cada panel y cada
// acción de servidor vuelve a validar sesión, perfil y rol (lib/auth/contexto.ts).
// /restablecer-contrasena NO está aquí: sin sesión de recuperación muestra su propio aviso.
const PRIVADAS = ["/admin", "/docente", "/estudiante", "/seleccionar-rol", "/cuenta", "/completar-registro", "/acceso"]

function coincide(pathname: string, rutas: string[]) {
  return rutas.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Si Supabase no admite la ruta de retorno, vuelve a la Site URL con el enlace:
  // se reenvía al manejador correspondiente (con los mismos parámetros).
  if (pathname === "/" && (searchParams.has("code") || searchParams.has("token_hash"))) {
    const url = request.nextUrl.clone()
    url.pathname = searchParams.get("type") === "recovery" ? "/auth/restablecer" : "/auth/confirmar"
    return NextResponse.redirect(url)
  }

  const { response, autenticado } = await actualizarSesion(request)

  // Solo se redirigen navegaciones. Las acciones de servidor son POST a la ruta
  // donde se usan (p. ej. destinoTrasLogin en /login, justo después de iniciar
  // sesión): redirigirlas rompe su respuesta. Cada acción valida la sesión por sí misma.
  const esNavegacion =
    (request.method === "GET" || request.method === "HEAD") && !request.headers.has("next-action")

  const redirigir = (destino: string) => {
    const redireccion = NextResponse.redirect(new URL(destino, request.url))
    // Conserva las cookies de sesión renovadas en la redirección.
    response.cookies.getAll().forEach((cookie) => redireccion.cookies.set(cookie))
    return redireccion
  }

  if (coincide(pathname, PRIVADAS)) {
    if (!autenticado && esNavegacion) return redirigir("/login")
    // Las páginas privadas no deben quedar en caché (p. ej. al volver atrás tras cerrar sesión).
    response.headers.set("Cache-Control", "private, no-store")
  }

  if (pathname === "/restablecer-contrasena") {
    response.headers.set("Cache-Control", "private, no-store")
  }

  // Con sesión, /login lleva al destino que corresponda según perfil y rol.
  if (pathname === "/login" && autenticado && esNavegacion) return redirigir("/acceso")

  return response
}

export const config = {
  matcher: [
    // Todo excepto estáticos e imágenes (evita bloquear CSS, JS o el favicon).
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
