import { createClient } from "@/lib/supabase/server"
import type { EstadoCurso, TipoCobro } from "@/lib/validations/curso"

/**
 * Lectura de cursos de la institución del administrador (SOLO servidor).
 * El id de la institución sale del perfil autenticado; RLS ("ver cursos",
 * "ver categorias", "ver grupos", "admin lee condiciones") limita cada consulta
 * a la propia institución y además se filtra explícitamente por institucion_id.
 */

export type Condiciones = {
  tipo_cobro: TipoCobro
  matricula_importe: number
  importe_curso: number
  permite_reserva: boolean
  reserva_importe: number
  reserva_plazo_horas: number | null
  reserva_descuenta_matricula: boolean
  requisitos: string | null
  condiciones_especiales: string | null
  actualizado_en: string
}

export type CursoResumen = {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  nota_aprobatoria: number
  modalidad: string
  estado: EstadoCurso
  created_at: string
  categoria: { id: string; nombre: string; activo: boolean } | null
  /** Grupos del curso (cualquier estado). null = no se pudo contar. */
  grupos: number | null
  tieneCondiciones: boolean | null
}

export type CursoDetalle = CursoResumen & {
  condiciones: Condiciones | null
  /** Filas de plan_cuotas (se gestionan en «Plan de cuotas» del detalle del curso). */
  cuotasPlan: number | null
}

export type CategoriaOpcion = { id: string; nombre: string; activo: boolean }

const COLUMNAS_CURSO = "id, nombre, descripcion, precio, nota_aprobatoria, modalidad, estado, created_at, categoria_id"
export const COLUMNAS_CONDICIONES =
  "tipo_cobro, matricula_importe, importe_curso, permite_reserva, reserva_importe, reserva_plazo_horas, reserva_descuenta_matricula, requisitos, condiciones_especiales, actualizado_en"

type FilaCurso = Omit<CursoResumen, "categoria" | "grupos" | "tieneCondiciones"> & { categoria_id: string }

// numeric llega como número o como texto según el driver: se normaliza.
const num = (v: unknown) => Number(v)

function normalizarCurso(f: FilaCurso): FilaCurso {
  return { ...f, precio: num(f.precio), nota_aprobatoria: num(f.nota_aprobatoria) }
}

export function normalizarCondiciones(c: Condiciones): Condiciones {
  return {
    ...c,
    matricula_importe: num(c.matricula_importe),
    importe_curso: num(c.importe_curso),
    reserva_importe: num(c.reserva_importe),
    reserva_plazo_horas: c.reserva_plazo_horas == null ? null : num(c.reserva_plazo_horas),
  }
}

function contarPor<T extends Record<string, unknown>>(filas: T[] | null, clave: keyof T) {
  const mapa = new Map<string, number>()
  for (const f of filas ?? []) mapa.set(String(f[clave]), (mapa.get(String(f[clave])) ?? 0) + 1)
  return mapa
}

/** Listado: 4 consultas en total (no una por curso). */
export async function obtenerCursos(institucionId: string): Promise<CursoResumen[]> {
  const supabase = await createClient()
  const [cursos, categorias, grupos, condiciones] = await Promise.all([
    supabase
      .from("cursos")
      .select(COLUMNAS_CURSO)
      .eq("institucion_id", institucionId)
      .order("created_at", { ascending: false })
      .overrideTypes<FilaCurso[], { merge: false }>(),
    supabase
      .from("categorias")
      .select("id, nombre, activo")
      .eq("institucion_id", institucionId)
      .overrideTypes<CategoriaOpcion[], { merge: false }>(),
    supabase
      .from("grupos")
      .select("curso_id")
      .eq("institucion_id", institucionId)
      .overrideTypes<{ curso_id: string }[], { merge: false }>(),
    supabase
      .from("condiciones_curso")
      .select("curso_id")
      .eq("institucion_id", institucionId)
      .overrideTypes<{ curso_id: string }[], { merge: false }>(),
  ])

  if (cursos.error) {
    console.error("[cursos] lectura", cursos.error.code, cursos.error.message)
    throw new Error("No se pudieron cargar los cursos.")
  }
  for (const [etiqueta, r] of [["categorias", categorias], ["grupos", grupos], ["condiciones", condiciones]] as const) {
    if (r.error) console.error(`[cursos] ${etiqueta}`, r.error.code, r.error.message)
  }

  const porCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c]))
  const gruposPorCurso = contarPor(grupos.data, "curso_id")
  const conCondiciones = new Set((condiciones.data ?? []).map((c) => c.curso_id))

  return (cursos.data ?? []).map((fila) => {
    const { categoria_id, ...curso } = normalizarCurso(fila)
    return {
      ...curso,
      categoria: porCategoria.get(categoria_id) ?? null,
      grupos: grupos.error ? null : (gruposPorCurso.get(curso.id) ?? 0),
      tieneCondiciones: condiciones.error ? null : conCondiciones.has(curso.id),
    }
  })
}

/** Un curso de la institución con sus condiciones. null = no existe o es ajeno. */
export async function obtenerCurso(institucionId: string, cursoId: string): Promise<CursoDetalle | null> {
  const supabase = await createClient()
  const [curso, condiciones, grupos, plan] = await Promise.all([
    supabase
      .from("cursos")
      .select(COLUMNAS_CURSO)
      .eq("institucion_id", institucionId)
      .eq("id", cursoId)
      .maybeSingle()
      .overrideTypes<FilaCurso, { merge: false }>(),
    supabase
      .from("condiciones_curso")
      .select(COLUMNAS_CONDICIONES)
      .eq("institucion_id", institucionId)
      .eq("curso_id", cursoId)
      .maybeSingle()
      .overrideTypes<Condiciones, { merge: false }>(),
    supabase
      .from("grupos")
      .select("id", { count: "exact", head: true })
      .eq("institucion_id", institucionId)
      .eq("curso_id", cursoId),
    supabase
      .from("plan_cuotas")
      .select("id", { count: "exact", head: true })
      .eq("institucion_id", institucionId)
      .eq("curso_id", cursoId),
  ])

  if (curso.error) {
    console.error("[cursos] detalle", curso.error.code, curso.error.message)
    throw new Error("No se pudo cargar el curso.")
  }
  if (!curso.data) return null
  if (condiciones.error) console.error("[cursos] condiciones", condiciones.error.code, condiciones.error.message)

  const { categoria_id, ...datos } = normalizarCurso(curso.data)
  const { data: categoria } = await supabase
    .from("categorias")
    .select("id, nombre, activo")
    .eq("institucion_id", institucionId)
    .eq("id", categoria_id)
    .maybeSingle()
    .overrideTypes<CategoriaOpcion, { merge: false }>()

  return {
    ...datos,
    categoria: categoria ?? null,
    grupos: grupos.error ? null : (grupos.count ?? 0),
    tieneCondiciones: condiciones.error ? null : condiciones.data !== null,
    condiciones: condiciones.data ? normalizarCondiciones(condiciones.data) : null,
    cuotasPlan: plan.error ? null : (plan.count ?? 0),
  }
}

/**
 * Opciones del selector: categorías ACTIVAS de la institución. Si el curso ya
 * tiene una categoría inactiva, se incluye para no perder la relación.
 */
export async function obtenerCategoriasParaCurso(
  institucionId: string,
  categoriaActual?: string
): Promise<CategoriaOpcion[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre, activo")
    .eq("institucion_id", institucionId)
    .order("nombre")
    .overrideTypes<CategoriaOpcion[], { merge: false }>()
  if (error) {
    console.error("[cursos] categorías", error.code, error.message)
    throw new Error("No se pudieron cargar las categorías.")
  }
  return (data ?? []).filter((c) => c.activo || c.id === categoriaActual)
}

export type CuotaPlan = {
  id: string
  numero: number
  concepto: string
  importe: number
  dias_desde_inicio: number | null
  descripcion_vencimiento: string | null
}

/** Plan de cuotas del curso (RLS "admin administra plan cuotas"). null = no se pudo leer. */
export async function obtenerPlanCuotas(institucionId: string, cursoId: string): Promise<CuotaPlan[] | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("plan_cuotas")
    .select("id, numero, concepto, importe, dias_desde_inicio, descripcion_vencimiento")
    .eq("institucion_id", institucionId)
    .eq("curso_id", cursoId)
    .order("numero")
    .overrideTypes<CuotaPlan[], { merge: false }>()
  if (error) {
    console.error("[cursos] plan de cuotas", error.code, error.message)
    return null
  }
  return (data ?? []).map((c) => ({ ...c, importe: Number(c.importe) }))
}
