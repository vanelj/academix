"use client"

import { useEffect, useState } from "react"

/**
 * Cuenta regresiva para no reenviar correos antes de tiempo. Supabase limita
 * el envío por usuario (por defecto, un correo cada 60 s); esperar evita
 * errores 429. No intenta evadir los límites, solo los respeta en la interfaz.
 */
export function useEspera(inicial = 0) {
  const [restante, setRestante] = useState(inicial)

  useEffect(() => {
    if (restante <= 0) return
    const id = setTimeout(() => setRestante((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [restante])

  return {
    restante,
    enEspera: restante > 0,
    iniciar: (segundos: number) => setRestante(segundos),
  }
}

/** Segundos de espera tras solicitar un correo (alineado con el límite por defecto de Supabase). */
export const ESPERA_REENVIO_S = 60
