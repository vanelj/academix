import { headers } from "next/headers"

import { origenPublico, RUTA_ACTIVACION } from "@/lib/auth/activacion"

/**
 * Opciones de inviteUserByEmail (SOLO servidor): el enlace vuelve a
 * /auth/activar del sitio (NEXT_PUBLIC_SITE_URL o el host de esta petición).
 * Sin origen válido, Supabase usa su Site URL. La comparten las invitaciones
 * de docentes y de administradores: un único flujo de activación.
 */
export async function opcionesInvitacion(): Promise<{ redirectTo?: string }> {
  const h = await headers()
  const origen = origenPublico(process.env.NEXT_PUBLIC_SITE_URL, {
    host: h.get("x-forwarded-host") ?? h.get("host"),
    proto: h.get("x-forwarded-proto"),
  })
  return origen ? { redirectTo: `${origen}${RUTA_ACTIVACION}` } : {}
}

