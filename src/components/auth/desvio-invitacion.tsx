"use client"

import { useEffect } from "react"

import { leerFragmentoInvitacion } from "@/lib/auth/activacion"

/**
 * Invitaciones enviadas sin redirectTo (antes de la corrección) vuelven a la
 * portada con #access_token=…&type=invite. Este componente, sin interfaz, las
 * lleva a /activar-cuenta conservando el fragmento (nunca a otro dominio).
 */
export function DesvioInvitacion() {
  useEffect(() => {
    if (leerFragmentoInvitacion(window.location.hash).tipo === "sesion") {
      window.location.replace(`/activar-cuenta${window.location.hash}`)
    }
  }, [])
  return null
}
