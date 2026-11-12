import { createClient } from "@/lib/supabase/server"

/**
 * Lectura de materiales de un grupo (SOLO servidor, con la sesión del usuario).
 * RLS «v5 ver materiales»: docente del grupo, administrador de la institución
 * o estudiante con matrícula ACTIVA. Sin la migración aula_academica_v5 la
 * tabla no existe y se informa como «no disponible» (nunca como error).
 */

export type Material = {
  id: string
  grupo_id: string
  titulo: string
  descripcion: string | null
  tema: string | null
  tipo: "archivo" | "enlace"
  enlace: string | null
  archivo_nombre: string | null
  archivo_tipo: string | null
  archivo_bytes: number | null
  creado_por: string | null
  creado_en: string
}

export type LecturaMateriales = { disponible: false } | { disponible: true; materiales: Material[] }

const TABLA_INEXISTENTE = new Set(["42P01", "PGRST205"])

export async function leerMateriales(grupoId: string): Promise<LecturaMateriales> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("materiales_curso")
    .select("id, grupo_id, titulo, descripcion, tema, tipo, enlace, archivo_nombre, archivo_tipo, archivo_bytes, creado_por, creado_en")
    .eq("grupo_id", grupoId)
    .order("creado_en")
    .overrideTypes<Material[], { merge: false }>()
  if (error) {
    if (TABLA_INEXISTENTE.has(error.code ?? "")) return { disponible: false }
    console.error("[materiales] lectura", error.code, error.message)
    throw new Error("No se pudieron cargar los materiales.")
  }
  return { disponible: true, materiales: data ?? [] }
}
