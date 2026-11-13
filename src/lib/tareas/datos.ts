import { createClient } from "@/lib/supabase/server"
import type { Entrega, Tarea } from "@/lib/tareas/reglas"

/**
 * Lecturas de tareas (SOLO servidor, con la sesión del usuario: RLS decide).
 * Sin la migración revision_funcional_v5 → { disponible: false }.
 */
const TABLA_INEXISTENTE = new Set(["42P01", "PGRST205"])
const COL_TAREA = "id, grupo_id, institucion_id, titulo, instrucciones, fecha_limite, permite_tardias, tardias_hasta, max_envios, puntaje_max, evaluacion_id, materiales, enlace, estado, publicada_en"
const COL_ENTREGA = "id, tarea_id, matricula_id, estudiante_id, texto, archivo_path, archivo_nombre, archivo_tipo, archivo_bytes, envios, entregada_en, tardia, estado, puntaje, comentario, calificada_en"

export type LecturaTareas<T> = { disponible: false } | { disponible: true; datos: T }

const normalizarTarea = (t: Tarea): Tarea => ({ ...t, puntaje_max: Number(t.puntaje_max), max_envios: Number(t.max_envios), materiales: t.materiales ?? [] })
const normalizarEntrega = (e: Entrega): Entrega => ({ ...e, puntaje: e.puntaje === null ? null : Number(e.puntaje), envios: Number(e.envios) })

/** Docente o administrador: tareas del grupo con todas sus entregas. */
export async function leerTareasGrupo(grupoId: string): Promise<LecturaTareas<{ tareas: Tarea[]; entregas: Entrega[] }>> {
  const supabase = await createClient()
  const { data: tareas, error } = await supabase.from("tareas").select(COL_TAREA).eq("grupo_id", grupoId).order("fecha_limite")
  if (error) {
    if (TABLA_INEXISTENTE.has(error.code ?? "")) return { disponible: false }
    throw error
  }
  const ids = (tareas ?? []).map((t) => t.id as string)
  const { data: entregas, error: e2 } = ids.length
    ? await supabase.from("entregas_tarea").select(COL_ENTREGA).in("tarea_id", ids).order("entregada_en")
    : { data: [], error: null }
  if (e2) throw e2
  return { disponible: true, datos: { tareas: ((tareas ?? []) as Tarea[]).map(normalizarTarea), entregas: ((entregas ?? []) as Entrega[]).map(normalizarEntrega) } }
}

/** Estudiante: tareas publicadas de su grupo y SU entrega (RLS solo devuelve las propias). */
export async function leerTareasAlumno(grupoId: string, matriculaId: string): Promise<LecturaTareas<{ tarea: Tarea; entrega: Entrega | null }[]>> {
  const r = await leerTareasGrupo(grupoId)
  if (!r.disponible) return r
  return {
    disponible: true,
    datos: r.datos.tareas
      .filter((t) => t.estado !== "borrador")
      .map((tarea) => ({ tarea, entrega: r.datos.entregas.find((e) => e.tarea_id === tarea.id && e.matricula_id === matriculaId) ?? null })),
  }
}
