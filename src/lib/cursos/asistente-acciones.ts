"use server"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { createClient } from "@/lib/supabase/server"
import { idCursoSchema } from "@/lib/validations/curso"

/**
 * Marca de versión de las condiciones del curso (condiciones_curso.actualizado_en).
 * El asistente la compara con la que cargó antes de guardar, para no sobrescribir
 * cambios hechos desde otra pestaña o por otro administrador.
 * `null` = el curso aún no tiene condiciones; `undefined` = no se pudo comprobar.
 */
export async function versionCondiciones(cursoId: unknown): Promise<{ ok: true; actualizadoEn: string | null } | { ok: false }> {
  const institucionId = await institucionDelAdmin()
  const id = idCursoSchema.safeParse(cursoId)
  if (!institucionId || !id.success) return { ok: false }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("condiciones_curso")
    .select("actualizado_en")
    .eq("curso_id", id.data)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<{ actualizado_en: string }, { merge: false }>()
  if (error) return { ok: false }
  return { ok: true, actualizadoEn: data?.actualizado_en ?? null }
}
