"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { obtenerContexto } from "@/lib/auth/contexto"
import { despacharCorreos } from "@/lib/correos/despachar"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"

/**
 * Acciones del ESTUDIANTE. Todas pasan por las RPC de V5 con la sesión real:
 * la BD toma el estudiante de auth.uid() y la institución del grupo; el
 * navegador solo envía el grupo, el tipo y la aceptación de condiciones.
 * - crear_solicitud_inscripcion(p_grupo_id, p_tipo): exige rol estudiante,
 *   grupo 'abierto', curso publicado, condiciones, vacantes y que no exista
 *   otra solicitud vigente del mismo tipo (también lo impide un índice único).
 *   Guarda la instantánea de condiciones aceptadas y la fecha de aceptación.
 * - cancelar_solicitud(p_solicitud_id): solo la propia, pendiente o reservada.
 * - confirmar_matricula_sin_saldo(p_solicitud_id): solicitud de matrícula
 *   pendiente con importe 0 (curso gratuito o reserva que cubrió el pago).
 */

export type ResultadoInscripcion = { ok: true; id?: string } | { ok: false; mensaje: string; gravedad: "error" | "advertencia" }

const crearSchema = z.object({
  grupoId: z.uuid(),
  tipo: z.enum(["matricula", "reserva"]),
  // La aceptación es obligatoria: la RPC guarda el texto aceptado (condiciones_aceptadas).
  acepta: z.literal(true),
})

async function estudianteActivo(): Promise<string | ResultadoInscripcion> {
  const ctx = await obtenerContexto()
  if (ctx.estado === "sin_sesion") return { ok: false, gravedad: "advertencia", mensaje: "Inicia sesión para inscribirte." }
  if (ctx.estado === "sin_perfil") return { ok: false, gravedad: "advertencia", mensaje: "Completa tu registro como estudiante para inscribirte." }
  if (!ctx.perfil.activo || ctx.rolActivo !== "estudiante") {
    return { ok: false, gravedad: "advertencia", mensaje: "Para inscribirte necesitas entrar con tu rol de estudiante activo." }
  }
  return ctx.userId
}

export async function crearSolicitud(datos: unknown): Promise<ResultadoInscripcion> {
  const v = crearSchema.safeParse(datos)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: "Debes aceptar las condiciones y elegir un grupo válido." }
  const estudiante = await estudianteActivo()
  if (typeof estudiante !== "string") return estudiante

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("crear_solicitud_inscripcion", { p_grupo_id: v.data.grupoId, p_tipo: v.data.tipo })
  if (error) return falloRpc(error)

  despacharCorreos()
  revalidatePath("/estudiante/solicitudes")
  revalidatePath("/estudiante")
  return { ok: true, id: typeof data === "string" ? data : undefined }
}

export async function cancelarMiSolicitud(id: unknown): Promise<ResultadoInscripcion> {
  const v = z.uuid().safeParse(id)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación." }
  const estudiante = await estudianteActivo()
  if (typeof estudiante !== "string") return estudiante

  const supabase = await createClient()
  const { error } = await supabase.rpc("cancelar_solicitud", { p_solicitud_id: v.data })
  if (error) return falloRpc(error)
  despacharCorreos()
  revalidatePath("/estudiante/solicitudes")
  return { ok: true }
}

export async function confirmarMatriculaSinSaldo(id: unknown): Promise<ResultadoInscripcion> {
  const v = z.uuid().safeParse(id)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación." }
  const estudiante = await estudianteActivo()
  if (typeof estudiante !== "string") return estudiante

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("confirmar_matricula_sin_saldo", { p_solicitud_id: v.data })
  if (error) return falloRpc(error)
  despacharCorreos()
  revalidatePath("/estudiante/solicitudes")
  revalidatePath("/estudiante")
  return { ok: true, id: typeof data === "string" ? data : undefined }
}

/** Traduce los mensajes de las RPC de V5 (texto de RAISE EXCEPTION). */
function falloRpc(error: { code?: string; message: string }): Extract<ResultadoInscripcion, { ok: false }> {
  if (esErrorDeRed(error)) return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  console.error("[inscripcion] rpc", error.code, error.message)
  const m = error.message
  const adv = (mensaje: string) => ({ ok: false as const, gravedad: "advertencia" as const, mensaje })
  if (/solicitud vigente/i.test(m) || error.code === "23505") return adv("Ya tienes una solicitud vigente de este tipo para este grupo.")
  if (/Grupo no disponible|Curso o grupo no disponible/i.test(m)) return adv("Este grupo ya no recibe inscripciones.")
  if (/Curso no publicado/i.test(m)) return adv("Este curso no está disponible para inscripciones.")
  if (/vacantes/i.test(m)) return adv("Ya no quedan vacantes libres en este grupo.")
  if (/matrícula activa/i.test(m)) return adv("Ya tienes una matrícula activa en este curso.")
  if (/propio grupo/i.test(m)) return adv("No puedes inscribirte en un grupo que dictas.")
  if (/configurar las condiciones/i.test(m)) return adv("La institución aún no configuró las condiciones de este curso.")
  if (/no ofrece reservas/i.test(m)) return adv("Este curso no ofrece reserva de vacante.")
  if (/cuotas|mensualidades/i.test(m)) return adv("La institución aún no completó el plan de pagos de este curso.")
  if (/pago bajo revisión/i.test(m)) return adv("Tienes un comprobante en revisión: espera la respuesta de la institución.")
  if (/No se puede cancelar este estado/i.test(m)) return adv("Esta solicitud ya no se puede cancelar.")
  if (/saldo inicial cero/i.test(m)) return adv("Esta solicitud requiere un pago antes de confirmar la matrícula.")
  if (/rol estudiante|Se requiere rol estudiante/i.test(m)) return adv("Para inscribirte necesitas entrar con tu rol de estudiante activo.")
  if (/inaccesible|Solicitud inválida/i.test(m) || error.code === "42501") return { ok: false, gravedad: "error", mensaje: "No tienes permiso para realizar esta operación." }
  return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación. Inténtalo de nuevo en unos minutos." }
}
