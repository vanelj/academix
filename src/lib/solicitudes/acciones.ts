"use server"

import { revalidatePath } from "next/cache"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { despacharCorreos } from "@/lib/correos/despachar"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import { idSchema } from "@/lib/validations/grupo"

/**
 * Acciones del administrador sobre solicitudes. Solo las que V5 permite:
 * - cancelar_solicitud(): el admin de la institución puede cancelar una
 *   solicitud 'pendiente' o 'reservada' sin pago bajo revisión. La RPC bloquea
 *   el grupo y la solicitud y vuelve a comprobar todo en la BD.
 * V5 no tiene RPC para "rechazar" una solicitud, y la aprobación de pagos
 * (revisar_pago) queda deshabilitada hasta aplicar
 * docs/migraciones/solicitudes_estado_grupo_v5.sql.
 */

export type ResultadoSolicitud = { ok: true } | { ok: false; mensaje: string; gravedad: "error" | "advertencia" }

export async function cancelarSolicitudAdmin(id: unknown): Promise<ResultadoSolicitud> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return { ok: false, gravedad: "error", mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión." }
  const v = idSchema.safeParse(id)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación." }

  const supabase = await createClient()
  // Primera barrera en la app: la solicitud debe ser de esta institución.
  const { data: fila, error: lecturaError } = await supabase
    .from("solicitudes_inscripcion")
    .select("id")
    .eq("id", v.data)
    .eq("institucion_id", institucionId)
    .maybeSingle()
  if (lecturaError) return falloRpc(lecturaError)
  if (!fila) return { ok: false, gravedad: "error", mensaje: "La solicitud no existe o no pertenece a tu institución." }

  const { error } = await supabase.rpc("cancelar_solicitud", { p_solicitud_id: v.data })
  if (error) return falloRpc(error)

  despacharCorreos()
  revalidatePath("/admin/solicitudes")
  revalidatePath(`/admin/solicitudes/${v.data}`)
  revalidatePath("/admin/grupos", "layout")
  revalidatePath("/admin/estudiantes", "layout")
  return { ok: true }
}

function falloRpc(error: { code?: string; message: string }): Extract<ResultadoSolicitud, { ok: false }> {
  if (esErrorDeRed(error)) return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  console.error("[solicitudes] rpc", error.code, error.message)
  const m = error.message
  if (/pago bajo revisión/i.test(m)) {
    return { ok: false, gravedad: "advertencia", mensaje: "Hay un comprobante de pago pendiente de revisión: primero debe revisarse el pago." }
  }
  if (/No se puede cancelar este estado/i.test(m)) {
    return { ok: false, gravedad: "advertencia", mensaje: "Solo se pueden cancelar solicitudes pendientes o reservas." }
  }
  if (/inaccesible/i.test(m) || error.code === "42501") {
    return { ok: false, gravedad: "error", mensaje: "No tienes permiso para gestionar esta solicitud." }
  }
  return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación. Inténtalo de nuevo en unos minutos." }
}
