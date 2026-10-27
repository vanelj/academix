"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { despacharCorreos } from "@/lib/correos/despachar"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import { idSchema } from "@/lib/validations/grupo"

/**
 * Anulación de matrículas por el administrador mediante la RPC
 * anular_matricula (docs/migraciones/anular_matricula_v5.sql). La RPC es la
 * autoridad: comprueba en la BD que sea admin de la institución (activa),
 * bloquea grupo → matrícula → cuotas y repite todas las reglas (matrícula
 * activa y en curso, grupo no cerrado, sin certificado, sin comprobantes en
 * revisión). Anula la matrícula y sus cuotas 'pendiente'; las 'parcial' y los
 * pagos aprobados se conservan (anular no es devolver dinero).
 * La app no actualiza matriculas directamente.
 */

export type ResultadoMatricula = { ok: true } | { ok: false; mensaje: string; gravedad: "error" | "advertencia" }

const anulacionSchema = z.object({ id: idSchema, confirmado: z.literal(true) })

export async function anularMatricula(datos: unknown): Promise<ResultadoMatricula> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return { ok: false, gravedad: "error", mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión." }
  const v = anulacionSchema.safeParse(datos)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: "Confirma la anulación para continuar." }
  const id = v.data.id

  const supabase = await createClient()
  // Solo para dar un mensaje claro si no es de esta institución; la RPC lo vuelve a comprobar.
  const { data: m, error: lecturaError } = await supabase
    .from("matriculas")
    .select("id")
    .eq("id", id)
    .eq("institucion_id", institucionId)
    .maybeSingle()
  if (lecturaError) return fallo(lecturaError)
  if (!m) return { ok: false, gravedad: "error", mensaje: "La matrícula no existe o no pertenece a tu institución." }

  const { error } = await supabase.rpc("anular_matricula", { p_matricula_id: id })
  if (error) return fallo(error)

  despacharCorreos()
  revalidatePath("/admin/matriculas", "layout")
  revalidatePath("/admin/pagos", "layout")
  revalidatePath("/admin/grupos", "layout")
  revalidatePath("/admin/estudiantes", "layout")
  revalidatePath("/admin")
  return { ok: true }
}

/** Traduce los mensajes de RAISE EXCEPTION de anular_matricula. */
function fallo(error: { code?: string; message: string }): Extract<ResultadoMatricula, { ok: false }> {
  if (esErrorDeRed(error)) return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  console.error("[matriculas] anulación", error.code, error.message)
  const m = error.message
  const aviso = (mensaje: string): Extract<ResultadoMatricula, { ok: false }> => ({ ok: false, gravedad: "advertencia", mensaje })
  if (/ya está anulada/i.test(m)) return aviso("La matrícula ya está anulada. Recarga la página.")
  if (/resultado final/i.test(m)) return aviso("La matrícula ya tiene un resultado final registrado y no se puede anular.")
  if (/grupo está cerrado/i.test(m)) return aviso("El grupo ya está cerrado: su matrícula forma parte del historial y no se anula.")
  if (/certificado/i.test(m)) return aviso("La matrícula tiene un certificado emitido y no se puede anular.")
  if (/pago bajo revisión/i.test(m)) return aviso("Hay un comprobante de pago en revisión: primero debe revisarse el pago.")
  if (/institución no está activa/i.test(m)) return { ok: false, gravedad: "error", mensaje: "Tu institución no está activa. Comunícate con el soporte de Academix." }
  if (/inaccesible/i.test(m) || error.code === "42501") return { ok: false, gravedad: "error", mensaje: "No tienes permiso para anular esta matrícula." }
  if (error.code === "PGRST202") return { ok: false, gravedad: "error", mensaje: "La anulación no está disponible en este momento. Contacta al soporte de Academix." }
  return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación. Inténtalo de nuevo en unos minutos." }
}
