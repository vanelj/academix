"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { nombreCopiaCurso, sinCamposDeHistorial } from "@/lib/cursos/duplicar"
import { createClient } from "@/lib/supabase/server"

/**
 * Duplicar un curso: crea un BORRADOR nuevo con la misma configuración
 * (datos del curso, condiciones de cobro, plan de cuotas y condiciones de
 * certificación). NUNCA copia grupos, horarios, matrículas, solicitudes, pagos,
 * notas, certificados ni la portada (su archivo pertenece al curso original).
 * Cada inserción pasa por RLS con la sesión del administrador.
 */
export type ResultadoDuplicar = { ok: true; id: string; aviso?: string } | { ok: false; mensaje: string }

const uuid = z.uuid()

export async function duplicarCurso(cursoId: unknown): Promise<ResultadoDuplicar> {
  const institucionId = await institucionDelAdmin("cursos")
  if (!institucionId) return { ok: false, mensaje: "No tienes permiso para gestionar los cursos." }
  const id = uuid.safeParse(cursoId)
  if (!id.success) return { ok: false, mensaje: "Curso no válido." }
  const supabase = await createClient()

  const { data: original, error } = await supabase.from("cursos").select("*").eq("id", id.data).eq("institucion_id", institucionId).maybeSingle()
  if (error || !original) return { ok: false, mensaje: "El curso no existe o no pertenece a tu institución." }

  const fila = { ...sinCamposDeHistorial(original as Record<string, unknown>), institucion_id: institucionId, nombre: nombreCopiaCurso(String(original.nombre)), estado: "borrador" }
  const { data: nuevo, error: insError } = await supabase.from("cursos").insert(fila).select("id").maybeSingle()
  if (insError || !nuevo) {
    console.error("[cursos] duplicar", insError?.code, insError?.message)
    return { ok: false, mensaje: insError?.code === "23505" ? "Ya existe un curso con ese nombre. Renombra la copia anterior e inténtalo de nuevo." : "No se pudo duplicar el curso." }
  }
  const nuevoId = nuevo.id as string

  // Configuración asociada (cada tabla es opcional: si falla, se avisa y el borrador queda editable).
  const faltan: string[] = []
  for (const [tabla, etiqueta, varias] of [["condiciones_curso", "condiciones de cobro", false], ["plan_cuotas", "plan de cuotas", true], ["certificacion_curso", "certificación", false]] as const) {
    const { data: filas, error: e } = await supabase.from(tabla).select("*").eq("curso_id", id.data).eq("institucion_id", institucionId)
    if (e) { if (!["42P01", "PGRST205"].includes(e.code ?? "")) faltan.push(etiqueta); continue }
    const copias = (filas ?? []).slice(0, varias ? 60 : 1).map((f) => ({ ...sinCamposDeHistorial(f as Record<string, unknown>), curso_id: nuevoId, institucion_id: institucionId }))
    if (copias.length === 0) continue
    const { error: ce } = await supabase.from(tabla).insert(copias)
    if (ce) { console.error(`[cursos] duplicar ${tabla}`, ce.code, ce.message); faltan.push(etiqueta) }
  }
  revalidatePath("/admin/cursos", "layout")
  return { ok: true, id: nuevoId, aviso: faltan.length ? `No se copiaron: ${faltan.join(", ")}. Configúralo en el asistente.` : undefined }
}
