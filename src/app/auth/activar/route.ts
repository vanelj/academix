import type { NextRequest } from "next/server"

import { verificarEnlace } from "@/lib/auth/enlaces"

/**
 * Destino del enlace de invitación (cuentas creadas por la institución, p. ej.
 * docentes). Requiere la plantilla "Invite user" con token_hash y type=invite.
 * Con sesión de activación válida continúa en /activar-cuenta.
 */
export async function GET(request: NextRequest) {
  return verificarEnlace(request, "activacion")
}
