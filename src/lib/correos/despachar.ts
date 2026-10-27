import { after } from "next/server"

import { configuracionCorreo } from "@/lib/correos/config"
import { procesarCorreos } from "@/lib/correos/procesar"

/**
 * Envía los correos recién encolados SIN retrasar la respuesta: se llama al final
 * de una acción que cambió solicitudes, pagos o matrículas. Los disparadores de la
 * BD ya encolaron los correos dentro de esa transacción; esto solo adelanta el
 * envío. Si falla o no está configurado, la tarea programada los envía después.
 * Nunca lanza errores hacia la acción.
 */
export function despacharCorreos(): void {
  if (!configuracionCorreo()) return
  try {
    after(async () => {
      try {
        const r = await procesarCorreos()
        if (r.estado !== "ok") console.warn("[correos] despacho omitido:", r.motivo)
      } catch (e) {
        console.error("[correos] despacho", e instanceof Error ? e.message : e)
      }
    })
  } catch (e) {
    console.error("[correos] after", e instanceof Error ? e.message : e)
  }
}
