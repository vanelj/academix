import { getCategoryVisual } from "@/academix/lib/visuals"
import {
  ALL,
  type CourseFilters,
  type CourseSort,
  type CourseSummary,
  type FilterOption,
  type InstitutionSummary,
} from "@/academix/types"
import {
  filtrarCursos,
  opcionesDeOferta,
  type FiltrosCatalogo,
  type InstitucionPublica,
  type OfertaCurso,
} from "@/lib/oferta/cursos"

// La BD guarda solo el número (numeric(10,2)); la moneda se asume en soles,
// igual que en la tarjeta pública anterior y en la ficha del curso.
const formatoPrecio = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })

/**
 * Convierte una fila de la vista pública oferta_cursos al tipo del kit Creative Tech.
 * oferta_cursos no tiene slug ni portada: la ficha se enlaza por id y se dibuja
 * la portada generada de la categoría. La categoría se identifica por su id,
 * el mismo valor que usa el filtro ?categoria= del catálogo.
 */
export function aCursoAcademix(c: OfertaCurso): CourseSummary {
  return {
    id: c.id,
    title: c.nombre,
    description: c.descripcion,
    modality: "virtual",
    category: {
      id: c.categoria_id,
      name: c.categoria,
      slug: c.categoria_id,
      visual: getCategoryVisual({ slug: "", name: c.categoria }),
    },
    institution: { id: c.institucion_id, name: c.institucion, logoUrl: c.logo_url },
    price: Number(c.precio),
    priceLabel: formatoPrecio.format(Number(c.precio)),
  }
}

/** Filtros del kit (valor 'all' = sin filtro) → filtros del catálogo (cadena vacía = sin filtro). */
export function aFiltrosCatalogo(f: CourseFilters): FiltrosCatalogo {
  return {
    q: f.q.trim(),
    categoria: f.category === ALL ? "" : f.category,
    institucion: f.institution === ALL ? "" : f.institution,
  }
}

/**
 * Orden del catálogo. precio es numeric(10,2) not null >= 0, así que el orden por
 * precio es fiable; a igual precio se desempata por nombre. No hay «Más recientes»:
 * oferta_cursos no expone fecha de publicación.
 */
export function ordenarCursos(cursos: OfertaCurso[], orden: CourseSort): OfertaCurso[] {
  const az = (a: OfertaCurso, b: OfertaCurso) => a.nombre.localeCompare(b.nombre, "es")
  const precio = (c: OfertaCurso) => Number(c.precio)
  if (orden === "precio-asc") return [...cursos].sort((a, b) => precio(a) - precio(b) || az(a, b))
  if (orden === "precio-desc") return [...cursos].sort((a, b) => precio(b) - precio(a) || az(a, b))
  return [...cursos].sort(az)
}

/**
 * Opciones de los filtros a partir de toda la oferta publicada.
 * El conteo de cada categoría respeta la búsqueda y la institución elegidas,
 * pero no la propia categoría (para poder cambiar de una a otra).
 */
export function opcionesCatalogo(cursos: OfertaCurso[], filtros: FiltrosCatalogo) {
  const { categorias, instituciones } = opcionesDeOferta(cursos)
  const base = filtrarCursos(cursos, { ...filtros, categoria: "" })
  const conteo = new Map<string, number>()
  for (const c of base) conteo.set(c.categoria_id, (conteo.get(c.categoria_id) ?? 0) + 1)

  const categoryOptions: FilterOption[] = [
    { value: ALL, label: "Todas", count: base.length },
    ...categorias.map((c) => ({
      value: c.id,
      label: c.nombre,
      count: conteo.get(c.id) ?? 0,
      visual: getCategoryVisual({ slug: "", name: c.nombre }),
    })),
  ]
  const institutionOptions: FilterOption[] = instituciones.map((i) => ({ value: i.id, label: i.nombre }))
  return { categoryOptions, institutionOptions }
}

/**
 * Institución del directorio público → tipo del kit. Solo datos públicos de
 * oferta_cursos: nombre, logotipo, áreas (categorías de sus cursos publicados) y
 * número real de cursos publicados. Sin descripción, siglas ni acreditaciones:
 * la vista no las expone y no se inventan.
 */
export function aInstitucionAcademix(i: InstitucionPublica): InstitutionSummary {
  return {
    id: i.id,
    name: i.nombre,
    logoUrl: i.logo_url,
    areas: i.categorias,
    publishedCoursesCount: i.totalCursos,
    modality: "virtual",
  }
}
