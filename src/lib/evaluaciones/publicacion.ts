"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { docenteActual, institucionDelAdmin } from "@/lib/auth/contexto"
import { createClient } from "@/lib/supabase/server"

/**
 * Publicar (o retirar la publicación de) las notas de UNA evaluación.
 * Guardar ≠ publicar: el estudiante solo ve notas de evaluaciones publicadas
 * (RLS de aula_academica_v5). Pueden publicar el docente del grupo y el
 * administrador de la institución; la RPC publicar_evaluacion lo vuelve a
 * comprobar y genera UN aviso por estudiante (si las notificaciones están activas).
 */

export type ResultadoPublicacion =
  | { ok: true; publicadaEn: string | null }
  | { ok: false; mensaje: string; migracionPendiente?: boolean }

const entrada = z.object({ evaluacionId: z.uuid(), publicar: z.boolean() })
const FUNCION_INEXISTENTE = new Set(["PGRST202", "42883"])

export async function publicarEvaluacion(evaluacionId: unknown, publicar: unknown): Promise<ResultadoPublicacion> {
  const v = entrada.safeParse({ evaluacionId, publicar })
  if (!v.success) return { ok: false, mensaje: "Solicitud no válida." }

  const supabase = await createClient()
  // Capa 1 (servidor): docente del grupo o administrador de la institución.
  const { data: ev } = await supabase.from("evaluaciones").select("id, grupo_id, institucion_id").eq("id", v.data.evaluacionId).maybeSingle()
  if (!ev) return { ok: false, mensaje: "La evaluación no existe o no tienes acceso." }
  const docente = await docenteActual()
  let autorizado = false
  if (docente) {
    const { data: g } = await supabase.from("grupos").select("id").eq("id", ev.grupo_id).eq("docente_id", docente.userId).eq("institucion_id", docente.institucionId).maybeSingle()
    autorizado = Boolean(g)
  } else {
    autorizado = (await institucionDelAdmin()) === ev.institucion_id
  }
  if (!autorizado) return { ok: false, mensaje: "No tienes permiso para publicar las notas de este grupo." }

  // Capa 2 (BD): la RPC repite la autorización y aplica las reglas.
  const { data, error } = await supabase.rpc("publicar_evaluacion", { p_evaluacion: v.data.evaluacionId, p_publicar: v.data.publicar })
  if (error) {
    if (FUNCION_INEXISTENTE.has(error.code ?? "")) {
      return { ok: false, migracionPendiente: true, mensaje: "La publicación de notas aún no está habilitada (falta la actualización «aula_academica_v5»). Mientras tanto, los estudiantes ven las notas al guardarlas." }
    }
    console.error("[evaluaciones] publicar", error.code, error.message)
    const m = error.message ?? ""
    if (/no tiene notas/i.test(m)) return { ok: false, mensaje: "Registra y guarda al menos una nota antes de publicar." }
    if (/resultados finales/i.test(m)) return { ok: false, mensaje: "El grupo ya tiene resultados finales: no se puede retirar la publicación." }
    if (/cancelado/i.test(m)) return { ok: false, mensaje: "El grupo está cancelado." }
    if (error.code === "42501") return { ok: false, mensaje: "No tienes permiso para publicar las notas de este grupo." }
    return { ok: false, mensaje: "No se pudo completar la publicación. Inténtalo de nuevo." }
  }

  revalidatePath(`/docente/calificaciones/${ev.grupo_id}`)
  revalidatePath("/docente/calificaciones")
  revalidatePath(`/admin/evaluaciones/${ev.grupo_id}`)
  revalidatePath("/estudiante/cursos", "layout")
  revalidatePath("/estudiante/evaluaciones")
  return { ok: true, publicadaEn: (data as string | null) ?? null }
}
