import type { NextRequest } from "next/server"

import { verificarEnlace } from "@/lib/auth/enlaces"

/**
 * Destino del enlace de recuperación de contraseña.
 * Con sesión de recuperación válida continúa en /restablecer-contrasena.
 */
export async function GET(request: NextRequest) {
  return verificarEnlace(request, "recuperacion")
}
