import { createClient } from "@/lib/supabase/server"

/**
 * Fila de la vista pública public.oferta_cursos (base de datos V4).
 * La vista solo expone cursos publicados de categorías e instituciones activas
 * y tiene permiso de lectura para visitantes (anon): no se consultan tablas.
 */
export type OfertaCurso = {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  categoria_id: string
  categoria: string
  institucion_id: string
  institucion: string
  logo_url: string | null
  modalidad: "virtual"
}

const COLUMNAS =
  "id, nombre, descripcion, precio, categoria_id, categoria, institucion_id, institucion, logo_url, modalidad"

export type ResultadoOferta =
  | { ok: true; cursos: OfertaCurso[] }
  | { ok: false }

export async function obtenerOfertaCursos(limite?: number): Promise<ResultadoOferta> {
  try {
    const supabase = await createClient()
    const consulta = supabase.from("oferta_cursos").select(COLUMNAS).order("nombre")
    const { data, error } = await (limite ? consulta.limit(limite) : consulta)
      .overrideTypes<OfertaCurso[], { merge: false }>()

    if (error) {
      console.error("[oferta_cursos]", error.code, error.message)
      return { ok: false }
    }

    return { ok: true, cursos: data }
  } catch (e) {
    console.error("[oferta_cursos] error inesperado", e)
    return { ok: false }
  }
}

// ---------------------------------------------------------------------------
// Filtros del catálogo (se aplican sobre las filas ya leídas de la vista)
// ---------------------------------------------------------------------------

export type Opcion = { id: string; nombre: string }

export type FiltrosCatalogo = {
  q: string
  institucion: string
  categoria: string
}

/** Lee los filtros de los searchParams de /cursos (?q=&institucion=&categoria=). */
export function leerFiltros(
  params: Record<string, string | string[] | undefined>
): FiltrosCatalogo {
  const texto = (clave: string) => {
    const valor = params[clave]
    return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? ""
  }
  return { q: texto("q"), institucion: texto("institucion"), categoria: texto("categoria") }
}

/** Instituciones y categorías presentes en la oferta pública, sin repetir. */
export function opcionesDeOferta(cursos: OfertaCurso[]) {
  const instituciones = new Map<string, string>()
  const categorias = new Map<string, string>()
  for (const c of cursos) {
    instituciones.set(c.institucion_id, c.institucion)
    categorias.set(c.categoria_id, c.categoria)
  }
  return { instituciones: ordenar(instituciones), categorias: ordenar(categorias) }
}

export function filtrarCursos(cursos: OfertaCurso[], filtros: FiltrosCatalogo) {
  const termino = normalizar(filtros.q)
  return cursos.filter(
    (c) =>
      (!filtros.institucion || c.institucion_id === filtros.institucion) &&
      (!filtros.categoria || c.categoria_id === filtros.categoria) &&
      (!termino ||
        [c.nombre, c.descripcion, c.categoria, c.institucion].some((campo) =>
          normalizar(campo ?? "").includes(termino)
        ))
  )
}

// ---------------------------------------------------------------------------
// Instituciones públicas
// V4 no tiene una vista pública de instituciones: la tabla solo la leen usuarios
// autenticados de su propia institución. Los únicos datos públicos de una
// institución son los que expone oferta_cursos, así que aquí aparecen solo las
// instituciones activas con al menos un curso publicado.
// ---------------------------------------------------------------------------

export type InstitucionPublica = {
  id: string
  nombre: string
  logo_url: string | null
  totalCursos: number
  categorias: string[]
}

export function institucionesDeOferta(cursos: OfertaCurso[]): InstitucionPublica[] {
  const porId = new Map<string, InstitucionPublica & { _categorias: Set<string> }>()
  for (const c of cursos) {
    const actual = porId.get(c.institucion_id) ?? {
      id: c.institucion_id,
      nombre: c.institucion,
      logo_url: c.logo_url,
      totalCursos: 0,
      categorias: [],
      _categorias: new Set<string>(),
    }
    actual.totalCursos += 1
    actual._categorias.add(c.categoria)
    porId.set(c.institucion_id, actual)
  }
  return [...porId.values()]
    .map(({ _categorias, ...inst }) => ({
      ...inst,
      categorias: [..._categorias].sort((a, b) => a.localeCompare(b, "es")),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

function ordenar(mapa: Map<string, string>): Opcion[] {
  return [...mapa]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

// Búsqueda sin distinguir mayúsculas ni tildes ("programacion" encuentra "Programación").
function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()
}
