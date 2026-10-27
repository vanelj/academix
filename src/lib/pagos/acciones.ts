"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import {
  BUCKET_COMPROBANTES,
  MOTIVO_REVISION_DESHABILITADA,
  REVISION_PAGOS_HABILITADA,
  VIGENCIA_ENLACE_COMPROBANTE,
} from "@/lib/pagos/config"
import { despacharCorreos } from "@/lib/correos/despachar"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import { idSchema } from "@/lib/validations/grupo"

/**
 * Acciones del administrador sobre pagos. Ninguna usa la clave secreta.
 *
 * - enlaceComprobante(): enlace firmado de corta duración al archivo del
 *   bucket privado. Lo firma Storage con la sesión del administrador: la
 *   política "v5 leer mis comprobantes" solo lo permite si el archivo está
 *   registrado en un pago de su institución. No hay enlaces públicos.
 * - revisarPago(): solo llama a la RPC revisar_pago de V5 (bloqueos, montos,
 *   vacantes, cuotas y trazabilidad viven en la BD). Además está detrás de
 *   REVISION_PAGOS_HABILITADA, que hoy es false.
 */

type Fallo = { ok: false; mensaje: string; gravedad: "error" | "advertencia" }
export type ResultadoEnlace = { ok: true; url: string; tipo: "imagen" | "pdf" | "archivo"; vigenciaSegundos: number } | Fallo
export type ResultadoRevision = { ok: true; estado: "pagado" | "rechazado" } | Fallo

const SIN_PERMISO: Fallo = { ok: false, gravedad: "error", mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión." }

/** Admin con rol activo y perfil activo, de una institución activa. */
async function institucionActivaDelAdmin(): Promise<{ ok: true; institucionId: string } | Fallo> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const supabase = await createClient()
  const { data, error } = await supabase.from("instituciones").select("activo").eq("id", institucionId).maybeSingle()
  if (error) return fallo(error)
  if (data?.activo !== true) return { ok: false, gravedad: "error", mensaje: "Tu institución no está activa. Comunícate con el soporte de Academix." }
  return { ok: true, institucionId }
}

export async function enlaceComprobante(pagoId: unknown): Promise<ResultadoEnlace> {
  const acceso = await institucionActivaDelAdmin()
  if (!acceso.ok) return acceso
  const { institucionId } = acceso
  const v = idSchema.safeParse(pagoId)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: "No se pudo abrir el comprobante." }

  const supabase = await createClient()
  const { data: pago, error } = await supabase
    .from("pagos")
    .select("comprobante_url, estudiante_id")
    .eq("id", v.data)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<{ comprobante_url: string | null; estudiante_id: string | null }, { merge: false }>()
  if (error) return fallo(error)
  if (!pago) return { ok: false, gravedad: "error", mensaje: "El pago no existe o no pertenece a tu institución." }

  const ruta = pago.comprobante_url?.trim() ?? ""
  if (!ruta) return { ok: false, gravedad: "advertencia", mensaje: "Este pago no tiene un comprobante adjunto." }
  // V5 exige la ruta <estudiante_id>/<archivo>; cualquier otra cosa (p. ej. URL de V4) no se firma.
  if (/^https?:\/\//i.test(ruta) || ruta.includes("..") || (pago.estudiante_id && !ruta.startsWith(`${pago.estudiante_id}/`))) {
    return { ok: false, gravedad: "advertencia", mensaje: "El comprobante está registrado en un formato anterior y no se puede abrir desde el panel." }
  }

  const { data: firmado, error: firmaError } = await supabase.storage
    .from(BUCKET_COMPROBANTES)
    .createSignedUrl(ruta, VIGENCIA_ENLACE_COMPROBANTE)
  if (firmaError || !firmado?.signedUrl) {
    console.error("[pagos] enlace comprobante", firmaError?.message)
    return {
      ok: false,
      gravedad: "error",
      mensaje: "No se pudo abrir el comprobante. Puede que el archivo ya no exista o que tu cuenta no tenga acceso a él.",
    }
  }
  const extension = ruta.split(".").pop()?.toLowerCase() ?? ""
  const tipo = extension === "pdf" ? "pdf" : ["jpg", "jpeg", "png"].includes(extension) ? "imagen" : "archivo"
  return { ok: true, url: firmado.signedUrl, tipo, vigenciaSegundos: VIGENCIA_ENLACE_COMPROBANTE }
}

const revisionSchema = z
  .object({
    pagoId: idSchema,
    aprobar: z.boolean(),
    observacion: z.string().trim().max(500, "La observación admite hasta 500 caracteres."),
    confirmado: z.literal(true),
  })
  .refine((d) => d.aprobar || d.observacion.length >= 5, {
    message: "Indica el motivo del rechazo para que el estudiante sepa qué corregir.",
    path: ["observacion"],
  })

export async function revisarPago(datos: unknown): Promise<ResultadoRevision> {
  if (!REVISION_PAGOS_HABILITADA) return { ok: false, gravedad: "advertencia", mensaje: MOTIVO_REVISION_DESHABILITADA }

  const acceso = await institucionActivaDelAdmin()
  if (!acceso.ok) return acceso
  const { institucionId } = acceso
  const v = revisionSchema.safeParse(datos)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: v.error.issues[0]?.message ?? "Revisa los datos de la revisión." }
  const { pagoId, aprobar, observacion } = v.data

  const supabase = await createClient()
  // Primera barrera en la app; revisar_pago vuelve a comprobarlo todo con bloqueos.
  const { data: pago, error: lecturaError } = await supabase
    .from("pagos")
    .select("id, estado, solicitud_id, cuota_id")
    .eq("id", pagoId)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<{ id: string; estado: string; solicitud_id: string | null; cuota_id: string | null }, { merge: false }>()
  if (lecturaError) return fallo(lecturaError)
  if (!pago) return { ok: false, gravedad: "error", mensaje: "El pago no existe o no pertenece a tu institución." }
  if (pago.estado !== "pendiente") return { ok: false, gravedad: "advertencia", mensaje: "Este pago ya fue revisado. Recarga la página." }

  const { data, error } = await supabase.rpc("revisar_pago", {
    p_pago_id: pagoId,
    p_aprobar: aprobar,
    p_observacion: observacion || null,
  })
  if (error) return fallo(error)

  despacharCorreos()
  revalidatePath("/admin/pagos", "layout")
  revalidatePath("/admin/solicitudes", "layout")
  revalidatePath("/admin/matriculas", "layout")
  revalidatePath("/admin/grupos", "layout")
  revalidatePath("/admin/estudiantes", "layout")
  revalidatePath("/admin")
  return { ok: true, estado: data === "rechazado" ? "rechazado" : "pagado" }
}

/** Traduce los mensajes de RAISE EXCEPTION de V5 (y de las migraciones propuestas). */
function fallo(error: ErrorLike): Fallo {
  if (esErrorDeRed(error)) return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  console.error("[pagos] rpc", error.code, error.message)
  const m = error.message
  const aviso = (mensaje: string): Fallo => ({ ok: false, gravedad: "advertencia", mensaje })
  if (/ya fue revisado/i.test(m)) return aviso("Este pago ya fue revisado por otra sesión. Recarga la página.")
  if (/Monto incorrecto/i.test(m)) return aviso("El monto del comprobante no coincide con el importe de la solicitud.")
  if (/excede el saldo/i.test(m)) return aviso("El monto supera el saldo pendiente de la cuota.")
  if (/sin referencia y comprobante/i.test(m)) return aviso("No se puede aprobar un pago sin número de operación y comprobante.")
  if (/ya no está pendiente/i.test(m)) return aviso("La solicitud ya no está pendiente (fue cancelada o confirmada).")
  if (/Sin vacantes/i.test(m)) return aviso("El grupo ya no tiene vacantes libres. Rechaza el pago y coordina la devolución.")
  if (/matrícula activa/i.test(m)) return aviso("El estudiante ya tiene una matrícula activa en este curso.")
  if (/plazo de reserva/i.test(m)) return aviso("El curso no tiene configurado el plazo de reserva.")
  if (/Cuota ya cerrada/i.test(m)) return aviso("La cuota ya está pagada o anulada.")
  if (/matrícula de la cuota no está activa/i.test(m)) {
    return aviso("La matrícula de esta cuota está anulada. Rechaza el pago y coordina la devolución.")
  }
  if (/no admite|no disponible|grupo no/i.test(m) || error.code === "23514") {
    return aviso("El grupo ya no admite nuevas reservas ni matrículas. Rechaza el pago y coordina la devolución.")
  }
  if (/destino compatible/i.test(m)) return aviso("Este pago es de una versión anterior y no puede aprobarse desde aquí.")
  if (/sin autorización|inexistente/i.test(m) || error.code === "42501") {
    return { ok: false, gravedad: "error", mensaje: "No tienes permiso para revisar este pago." }
  }
  return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación. Inténtalo de nuevo en unos minutos." }
}

type ErrorLike = { code?: string; message: string }
