import { redirect } from "next/navigation"

import { destinoSegunContexto, obtenerContexto } from "@/lib/auth/contexto"

// Punto de entrada tras iniciar sesión o confirmar el correo: decide el destino
// en el servidor según el perfil y los roles reales. No acepta parámetros de destino.
export default async function AccesoPage() {
  redirect(destinoSegunContexto(await obtenerContexto()))
}
