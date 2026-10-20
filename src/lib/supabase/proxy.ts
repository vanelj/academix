import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Refresca la sesión de Supabase en cada petición (patrón oficial de @supabase/ssr):
 * getClaims() valida el JWT y, si está por vencer, lo renueva; las cookies nuevas
 * se copian a la petición (para el render actual) y a la respuesta (para el navegador).
 */
export async function actualizarSesion(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          // Cabeceras anti-caché que indica Supabase al renovar la sesión.
          Object.entries(headers ?? {}).forEach(([clave, valor]) =>
            response.headers.set(clave, valor)
          )
        },
      },
    }
  )

  // No poner código entre createServerClient y getClaims(): podría cerrar la sesión al azar.
  const { data } = await supabase.auth.getClaims()

  return { response, autenticado: Boolean(data?.claims?.sub) }
}
