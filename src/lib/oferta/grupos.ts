import { createClient } from "@/lib/supabase/server"
import type { GrupoDisponible } from "@/lib/oferta/disponibilidad"

const FUNCION_INEXISTENTE = new Set(["PGRST202", "42883"])

/**
 * Grupos visibles en la oferta pública (SOLO servidor, también sin sesión).
 * 1. Con revision_funcional_v5: resumen_oferta_grupos() incluye además los
 *    grupos EN CURSO (sin docente ni enlaces: solo código, fechas y estado).
 * 2. Sin ella: la vista oferta_grupos (programados y abiertos).
 * Devuelve null si no se pudo leer (la interfaz no inventa estados).
 */
export async function obtenerGruposOferta(cursoIds?: string[]): Promise<GrupoDisponible[] | null> {
  const supabase = await createClient()
  const rpc = await supabase.rpc("resumen_oferta_grupos")
  if (!rpc.error) {
    const filas = (rpc.data ?? []) as GrupoDisponible[]
    return cursoIds ? filas.filter((g) => cursoIds.includes(g.curso_id)) : filas
  }
  if (!FUNCION_INEXISTENTE.has(rpc.error.code ?? "")) console.error("[oferta] resumen de grupos", rpc.error.code, rpc.error.message)
  const leer = (columnas: string) => {
    const q = supabase.from("oferta_grupos").select(columnas)
    return (cursoIds ? q.in("curso_id", cursoIds) : q).overrideTypes<GrupoDisponible[], { merge: false }>()
  }
  let r = await leer("id, curso_id, codigo, estado, fecha_inicio, fecha_fin, vacantes_disponibles")
  // Sin oferta_grupos_anon_v5 los visitantes no leen vacantes: sin esa columna.
  if (r.error?.code === "42501") r = await leer("id, curso_id, codigo, estado, fecha_inicio, fecha_fin")
  if (r.error) {
    console.error("[oferta] grupos", r.error.code, r.error.message)
    return null
  }
  return (r.data ?? []).map((g) => ({ ...g, vacantes_disponibles: g.vacantes_disponibles ?? null }))
}
