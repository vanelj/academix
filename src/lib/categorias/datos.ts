import { createClient } from "@/lib/supabase/server"

/**
 * Lectura de las categorías de la institución del administrador (SOLO servidor).
 * El id sale del perfil autenticado. RLS ("ver categorias") limita la lectura a
 * la propia institución; además se filtra explícitamente por institucion_id.
 */

export type Categoria = {
  id: string
  nombre: string
  descripcion: string | null
  activo: boolean
  created_at: string
  /** Cursos de la categoría (cualquier estado). null = no se pudo contar. */
  cursos: number | null
  /** Cursos publicados: dejan de verse en el catálogo si la categoría se desactiva. */
  cursosPublicados: number | null
}

type FilaCategoria = Omit<Categoria, "cursos" | "cursosPublicados">

export async function obtenerCategorias(institucionId: string): Promise<Categoria[]> {
  const supabase = await createClient()
  const [categorias, cursos] = await Promise.all([
    supabase
      .from("categorias")
      .select("id, nombre, descripcion, activo, created_at")
      .eq("institucion_id", institucionId)
      .order("nombre")
      .overrideTypes<FilaCategoria[], { merge: false }>(),
    // Solo categoria_id y estado: lo justo para contar cursos por categoría.
    supabase
      .from("cursos")
      .select("categoria_id, estado")
      .eq("institucion_id", institucionId)
      .overrideTypes<{ categoria_id: string; estado: string }[], { merge: false }>(),
  ])

  if (categorias.error) {
    console.error("[categorias] lectura", categorias.error.code, categorias.error.message)
    throw new Error("No se pudieron cargar las categorías.")
  }

  // Si el conteo falla, se muestra "—"; la BD sigue impidiendo borrar categorías en uso.
  if (cursos.error) console.error("[categorias] conteo de cursos", cursos.error.code, cursos.error.message)
  const total = new Map<string, number>()
  const publicados = new Map<string, number>()
  for (const curso of cursos.data ?? []) {
    total.set(curso.categoria_id, (total.get(curso.categoria_id) ?? 0) + 1)
    if (curso.estado === "publicado") {
      publicados.set(curso.categoria_id, (publicados.get(curso.categoria_id) ?? 0) + 1)
    }
  }

  return (categorias.data ?? []).map((c) => ({
    ...c,
    cursos: cursos.error ? null : (total.get(c.id) ?? 0),
    cursosPublicados: cursos.error ? null : (publicados.get(c.id) ?? 0),
  }))
}
