"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import { evaluacionParaGuardar, evaluacionSchema, motivoReaperturaSchema } from "@/lib/validations/evaluacion"

/**
 * Acciones del administrador sobre evaluaciones y resultados.
 * - Evaluaciones: escritura directa con la sesión; RLS decide. Hasta aplicar
 *   evaluaciones_admin_v5 la BD solo permite al docente (42501 → aviso).
 * - Resultado final: SOLO con las RPC registrar_resultado_final /
 *   reabrir_resultado_final, que calculan y registran en la BD. Nunca se
 *   escribe estado_final directamente.
 * - institucion_id sale siempre del perfil y filtra cada operación.
 */

export type ResultadoEvaluacion =
  | { ok: true; id?: string; resultado?: string; procesadas?: number; omitidas?: number }
  | { ok: false; mensaje: string; gravedad: "error" | "advertencia"; campos?: Record<string, string> }
type Fallo = Extract<ResultadoEvaluacion, { ok: false }>

const SIN_PERMISO: Fallo = { ok: false, gravedad: "error", mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión." }
const NO_ENCONTRADO: Fallo = { ok: false, gravedad: "error", mensaje: "El registro no existe o no pertenece a tu institución. Recarga la página." }
const MIGRACION: Fallo = {
  ok: false,
  gravedad: "advertencia",
  mensaje: "La gestión de evaluaciones y resultados por el administrador requiere la migración evaluaciones_admin_v5 (pendiente de aplicar).",
}

const uuid = z.uuid()

function revalidar(grupoId: string) {
  revalidatePath("/admin/evaluaciones")
  revalidatePath(`/admin/evaluaciones/${grupoId}`)
  revalidatePath("/admin/grupos", "layout")
  revalidatePath("/admin/matriculas", "layout")
  revalidatePath("/admin/certificados", "layout")
}

export async function guardarEvaluacion(grupoId: unknown, evaluacionId: unknown, datos: unknown): Promise<ResultadoEvaluacion> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const g = uuid.safeParse(grupoId)
  const e = evaluacionId === null ? null : uuid.safeParse(evaluacionId)
  if (!g.success || (e && !e.success)) return NO_ENCONTRADO
  const v = evaluacionSchema.safeParse(datos)
  if (!v.success) {
    const campos: Record<string, string> = {}
    for (const i of v.error.issues) campos[String(i.path[0])] ??= i.message
    return { ok: false, gravedad: "error", mensaje: "Revisa los datos de la evaluación.", campos }
  }

  const supabase = await createClient()
  const { data: grupo, error: gError } = await supabase.from("grupos").select("id, estado").eq("id", g.data).eq("institucion_id", institucionId).maybeSingle()
    .overrideTypes<{ id: string; estado: string }, { merge: false }>()
  if (gError) return fallo(gError)
  if (!grupo) return NO_ENCONTRADO
  if (grupo.estado === "cerrado" || grupo.estado === "cancelado") {
    return { ok: false, gravedad: "advertencia", mensaje: "El grupo está cerrado o cancelado: sus evaluaciones ya no se modifican." }
  }

  // Aviso previo de pesos (la BD lo vuelve a comprobar con bloqueo).
  const fila = evaluacionParaGuardar(v.data)
  const { data: otras } = await supabase.from("evaluaciones").select("id, peso").eq("institucion_id", institucionId).eq("grupo_id", g.data)
    .overrideTypes<{ id: string; peso: number }[], { merge: false }>()
  const suma = (otras ?? []).filter((o) => !e || o.id !== e.data).reduce((s, o) => s + Math.round(Number(o.peso) * 100), 0) + Math.round(fila.peso * 100)
  if (suma > 10000) {
    return { ok: false, gravedad: "advertencia", mensaje: `Con este peso las evaluaciones sumarían ${suma / 100} %. El total no puede superar 100 %.`, campos: { peso: "Supera el 100 % del grupo." } }
  }

  const { data, error } = e
    ? await supabase.from("evaluaciones").update(fila).eq("id", e.data).eq("grupo_id", g.data).eq("institucion_id", institucionId).select("id")
    : await supabase.from("evaluaciones").insert({ ...fila, grupo_id: g.data, institucion_id: institucionId }).select("id")
  if (error) return fallo(error)
  if (!data?.length) return e ? MIGRACION : NO_ENCONTRADO
  revalidar(g.data)
  return { ok: true, id: (data[0] as { id: string }).id }
}

export async function eliminarEvaluacion(grupoId: unknown, evaluacionId: unknown): Promise<ResultadoEvaluacion> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const g = uuid.safeParse(grupoId), e = uuid.safeParse(evaluacionId)
  if (!g.success || !e.success) return NO_ENCONTRADO
  const supabase = await createClient()
  const { count } = await supabase.from("calificaciones").select("id", { count: "exact", head: true }).eq("institucion_id", institucionId).eq("evaluacion_id", e.data)
  if ((count ?? 0) > 0) return { ok: false, gravedad: "advertencia", mensaje: "La evaluación ya tiene notas registradas: no se puede eliminar." }
  const { data, error } = await supabase.from("evaluaciones").delete().eq("id", e.data).eq("grupo_id", g.data).eq("institucion_id", institucionId).select("id")
  if (error) return fallo(error)
  if (!data?.length) return MIGRACION
  revalidar(g.data)
  return { ok: true, id: e.data }
}

/** Registra el resultado CALCULADO por la BD de una matrícula. */
export async function registrarResultado(grupoId: unknown, matriculaId: unknown): Promise<ResultadoEvaluacion> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const g = uuid.safeParse(grupoId), m = uuid.safeParse(matriculaId)
  if (!g.success || !m.success) return NO_ENCONTRADO
  const supabase = await createClient()
  const { data: fila } = await supabase.from("matriculas").select("id").eq("id", m.data).eq("grupo_id", g.data).eq("institucion_id", institucionId).maybeSingle()
  if (!fila) return NO_ENCONTRADO
  const { data, error } = await supabase.rpc("registrar_resultado_final", { p_matricula: m.data })
  if (error) return fallo(error)
  revalidar(g.data)
  revalidatePath(`/admin/matriculas/${m.data}`)
  return { ok: true, resultado: typeof data === "string" ? data : undefined }
}

/** Registra los resultados de todas las matrículas activas y completas del grupo (una RPC por matrícula). */
export async function registrarResultadosGrupo(grupoId: unknown): Promise<ResultadoEvaluacion> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const g = uuid.safeParse(grupoId)
  if (!g.success) return NO_ENCONTRADO
  const supabase = await createClient()
  const { data: mats, error } = await supabase.from("matriculas").select("id").eq("grupo_id", g.data).eq("institucion_id", institucionId).eq("estado", "activa").eq("estado_final", "en_curso")
  if (error) return fallo(error)
  let procesadas = 0, omitidas = 0
  for (const { id } of (mats ?? []) as { id: string }[]) {
    const r = await supabase.rpc("registrar_resultado_final", { p_matricula: id })
    if (r.error) {
      if (r.error.code === "PGRST202") return MIGRACION
      if (esErrorDeRed(r.error)) return fallo(r.error)
      omitidas++
    } else procesadas++
  }
  revalidar(g.data)
  return { ok: true, procesadas, omitidas }
}

export async function reabrirResultado(grupoId: unknown, matriculaId: unknown, motivo: unknown): Promise<ResultadoEvaluacion> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const g = uuid.safeParse(grupoId), m = uuid.safeParse(matriculaId)
  if (!g.success || !m.success) return NO_ENCONTRADO
  const mo = motivoReaperturaSchema.safeParse(motivo)
  if (!mo.success) return { ok: false, gravedad: "error", mensaje: mo.error.issues[0].message, campos: { motivo: mo.error.issues[0].message } }
  const supabase = await createClient()
  const { data: fila } = await supabase.from("matriculas").select("id").eq("id", m.data).eq("grupo_id", g.data).eq("institucion_id", institucionId).maybeSingle()
  if (!fila) return NO_ENCONTRADO
  const { error } = await supabase.rpc("reabrir_resultado_final", { p_matricula: m.data, p_motivo: mo.data })
  if (error) return fallo(error)
  revalidar(g.data)
  revalidatePath(`/admin/matriculas/${m.data}`)
  return { ok: true }
}

/** Traduce los mensajes de las funciones y disparadores de evaluaciones_admin_v5. */
function fallo(error: { code?: string; message: string }): Fallo {
  if (esErrorDeRed(error)) return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  console.error("[evaluaciones]", error.code, error.message)
  const m = error.message
  const aviso = (mensaje: string): Fallo => ({ ok: false, gravedad: "advertencia", mensaje })
  if (error.code === "PGRST202") return MIGRACION
  if (/supera 100/i.test(m)) return aviso("La suma de pesos del grupo superaría 100 %.")
  if (/deben sumar 100/i.test(m)) return aviso("Las evaluaciones del grupo deben sumar exactamente 100 % para registrar resultados.")
  if (/Faltan .* calificaciones/i.test(m)) return aviso("Faltan notas de esta matrícula. El docente debe registrarlas primero.")
  if (/resultados finales registrados|ya tiene resultado final/i.test(m)) return aviso("Hay resultados finales registrados. Reábrelos (con motivo) antes de cambiar evaluaciones o notas.")
  if (/en curso o cerrado/i.test(m)) return aviso("Los resultados se registran cuando el grupo está en curso o cerrado.")
  if (/certificado emitido/i.test(m)) return aviso("La matrícula tiene un certificado emitido: su resultado no se puede reabrir.")
  if (/no está activa/i.test(m)) return aviso("La matrícula no está activa.")
  if (/no tiene resultado final/i.test(m)) return aviso("La matrícula no tiene resultado final registrado.")
  if (error.code === "23503") return aviso("La evaluación tiene notas registradas y no se puede eliminar.")
  if (error.code === "42501" || /inaccesible|row-level security/i.test(m)) return MIGRACION
  return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación. Inténtalo de nuevo en unos minutos." }
}
