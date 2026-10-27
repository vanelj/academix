"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import { cuotaPlanParaGuardar, cuotaPlanSchema } from "@/lib/validations/plan-cuotas"

/**
 * Plan de cuotas del curso (public.plan_cuotas).
 * - institucion_id sale del perfil en el servidor y filtra cada escritura.
 * - RLS ("admin administra plan cuotas") exige admin activo de la institución.
 * - La FK (curso_id, institucion_id) → condiciones_curso exige que el curso
 *   tenga condiciones; aquí además se exige tipo de cobro «cuotas».
 * - Cada cuota se guarda por separado: un fallo nunca deja el plan a medias.
 * - Las cuotas de matrículas ya confirmadas no cambian (V5 las congeló).
 */

export type ResultadoPlan =
  | { ok: true; id: string }
  | { ok: false; mensaje: string; gravedad: "error" | "advertencia"; campos?: Record<string, string> }

type Fallo = Extract<ResultadoPlan, { ok: false }>

const SIN_PERMISO: Fallo = { ok: false, gravedad: "error", mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión." }
const NO_ENCONTRADO: Fallo = { ok: false, gravedad: "error", mensaje: "La cuota o el curso no existen o no pertenecen a tu institución. Recarga la página." }
const ids = z.object({ cursoId: z.uuid(), cuotaId: z.uuid().nullable() })

/** Crea (cuotaId null) o actualiza una cuota del plan. */
export async function guardarCuotaPlan(cursoId: unknown, cuotaId: unknown, datos: unknown): Promise<ResultadoPlan> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = ids.safeParse({ cursoId, cuotaId })
  if (!id.success) return NO_ENCONTRADO
  const v = cuotaPlanSchema.safeParse(datos)
  if (!v.success) {
    const campos: Record<string, string> = {}
    for (const i of v.error.issues) campos[String(i.path[0])] ??= i.message
    return { ok: false, gravedad: "error", mensaje: "Revisa los datos de la cuota.", campos }
  }

  const supabase = await createClient()
  const { data: cond, error: condError } = await supabase
    .from("condiciones_curso")
    .select("tipo_cobro")
    .eq("curso_id", id.data.cursoId)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<{ tipo_cobro: string }, { merge: false }>()
  if (condError) return fallo(condError)
  if (!cond) return NO_ENCONTRADO
  if (cond.tipo_cobro !== "cuotas") {
    return { ok: false, gravedad: "advertencia", mensaje: "El plan de cuotas solo se usa cuando el tipo de cobro del curso es «En cuotas»." }
  }

  const fila = cuotaPlanParaGuardar(v.data)
  const { data, error } = id.data.cuotaId
    ? await supabase
        .from("plan_cuotas")
        .update(fila)
        .eq("id", id.data.cuotaId)
        .eq("curso_id", id.data.cursoId)
        .eq("institucion_id", institucionId)
        .select("id")
    : await supabase
        .from("plan_cuotas")
        .insert({ ...fila, curso_id: id.data.cursoId, institucion_id: institucionId })
        .select("id")
  if (error) return fallo(error)
  if (!data?.length) return NO_ENCONTRADO
  revalidar(id.data.cursoId)
  return { ok: true, id: (data[0] as { id: string }).id }
}

export async function eliminarCuotaPlan(cursoId: unknown, cuotaId: unknown): Promise<ResultadoPlan> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = ids.safeParse({ cursoId, cuotaId })
  if (!id.success || !id.data.cuotaId) return NO_ENCONTRADO

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("plan_cuotas")
    .delete()
    .eq("id", id.data.cuotaId)
    .eq("curso_id", id.data.cursoId)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return fallo(error)
  if (!data?.length) return NO_ENCONTRADO
  revalidar(id.data.cursoId)
  return { ok: true, id: id.data.cuotaId }
}

function revalidar(cursoId: string) {
  revalidatePath(`/admin/cursos/${cursoId}`)
  revalidatePath("/admin/cursos")
}

function fallo(error: { code?: string; message: string }): Fallo {
  if (esErrorDeRed(error)) return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  console.error("[plan-cuotas]", error.code, error.message)
  if (error.code === "23505") return { ok: false, gravedad: "advertencia", mensaje: "Ya existe una cuota con ese número en el plan.", campos: { numero: "Número repetido." } }
  if (error.code === "23503") return { ok: false, gravedad: "advertencia", mensaje: "Primero configura las condiciones de inscripción del curso." }
  if (error.code === "42501") return SIN_PERMISO
  return { ok: false, gravedad: "error", mensaje: "No se pudo guardar. Inténtalo de nuevo en unos minutos." }
}
