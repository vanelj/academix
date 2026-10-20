import type { NextRequest } from "next/server"

import { verificarEnlace } from "@/lib/auth/enlaces"

/**
 * Destino del enlace de confirmación de cuenta.
 * Con sesión válida continúa en /acceso (completar registro, panel o selector).
 */
export async function GET(request: NextRequest) {
  return verificarEnlace(request, "confirmacion")
}
