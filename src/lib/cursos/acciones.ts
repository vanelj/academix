"use server"

import { revalidatePath } from "next/cache"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { COLUMNAS_CONDICIONES } from "@/lib/cursos/datos"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import {
  ESTADOS_CURSO,
  condicionesParaGuardar,
  cursoParaGuardar,
  cursoSchema,
  idCursoSchema,
  type CursoValues,
  type EstadoCurso,
} from "@/lib/validations/curso"

/**
 * Gestión de cursos de la institución del administrador.
 *
 * - institucion_id sale SIEMPRE del perfil en el servidor y filtra cada
 *   lectura, UPDATE y DELETE junto con el id del curso.
 * - RLS ("admin gestiona cursos", "admin administra condiciones") vuelve a
 *   exigir en la BD rol admin activo y la misma institución.
 * - La FK compuesta cursos(categoria_id, institucion_id) impide usar una
 *   categoría de otra institución; además se valida aquí que exista y esté activa.
 * - El estado no se edita en el formulario: tiene su propia acción con las
 *   comprobaciones de publicación.
 */

export type ResultadoCurso =
  | { ok: true; id: string; aviso?: string }
  | {
      ok: false
      mensaje: string
      gravedad: "error" | "advertencia"
      campo?: "nombre" | "categoria_id" | "precio" | "nota_aprobatoria"
    }

type Fallo = Extract<ResultadoCurso, { ok: false }>
type Supabase = Awaited<ReturnType<typeof createClient>>

const SIN_PERMISO: Fallo = {
  ok: false,
  gravedad: "error",
  mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión.",
}
const NO_ENCONTRADO: Fallo = {
  ok: false,
  gravedad: "error",
  mensaje: "El curso no existe o no pertenece a tu institución. Recarga la página.",
}
const DATOS_INVALIDOS: Fallo = { ok: false, gravedad: "error", mensaje: "Revisa los datos del curso." }
const CATEGORIA_INVALIDA: Fallo = {
  ok: false,
  gravedad: "error",
  campo: "categoria_id",
  mensaje: "Selecciona una categoría válida.",
}

// ---------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------

export async function crearCurso(datos: unknown): Promise<ResultadoCurso> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO

  const validacion = cursoSchema.safeParse(datos)
  if (!validacion.success) return DATOS_INVALIDOS
  const valores = validacion.data

  const supabase = await createClient()
  const categoria = await categoriaDeInstitucion(supabase, institucionId, valores.categoria_id)
  if (categoria === "error") return falloBD({ message: "lectura de categoría" })
  if (!categoria?.activo) return CATEGORIA_INVALIDA

  // estado y modalidad toman su valor por defecto en la BD: 'borrador' y 'virtual'.
  const { data, error } = await supabase
    .from("cursos")
    .insert({ institucion_id: institucionId, ...cursoParaGuardar(valores) })
    .select("id")
  if (error) return falloBD(error)
  const id = data?.[0]?.id as string | undefined
  if (!id) return SIN_PERMISO

  if (valores.configurarCondiciones) {
    const { error: condError } = await supabase
      .from("condiciones_curso")
      .insert({ curso_id: id, institucion_id: institucionId, ...condiciones(valores) })
    if (condError) {
      // El curso se acaba de crear y no tiene dependencias: se revierte para no
      // dejar un registro a medias. Los datos siguen en el formulario.
      const { error: revertirError } = await supabase
        .from("cursos")
        .delete()
        .eq("id", id)
        .eq("institucion_id", institucionId)
      if (revertirError) {
        console.error("[cursos] revertir creación", revertirError.code, revertirError.message)
        revalidarCursos(id)
        return {
          ok: true,
          id,
          aviso: "El curso se creó como borrador, pero no se pudieron guardar sus condiciones. Configúralas al editarlo.",
        }
      }
      return falloBD(condError)
    }
  }

  revalidarCursos(id)
  return { ok: true, id }
}

// ---------------------------------------------------------------------------
// Editar
// ---------------------------------------------------------------------------

export async function editarCurso(id: unknown, datos: unknown): Promise<ResultadoCurso> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO

  const idValido = idCursoSchema.safeParse(id)
  const validacion = cursoSchema.safeParse(datos)
  if (!idValido.success || !validacion.success) return DATOS_INVALIDOS
  const cursoId = idValido.data
  const valores = validacion.data

  const supabase = await createClient()
  const actual = await cursoDeInstitucion(supabase, institucionId, cursoId)
  if (actual === "error") return falloBD({ message: "lectura del curso" })
  if (!actual) return NO_ENCONTRADO

  // Se conserva una categoría que quedó inactiva; para cambiarla, la nueva debe estar activa.
  if (valores.categoria_id !== actual.categoria_id) {
    const categoria = await categoriaDeInstitucion(supabase, institucionId, valores.categoria_id)
    if (categoria === "error") return falloBD({ message: "lectura de categoría" })
    if (!categoria?.activo) return CATEGORIA_INVALIDA
  }

  const { data: existentes, error: condLecturaError } = await supabase
    .from("condiciones_curso")
    .select("curso_id")
    .eq("curso_id", cursoId)
    .eq("institucion_id", institucionId)
  if (condLecturaError) return falloBD(condLecturaError)
  const hayCondiciones = (existentes?.length ?? 0) > 0
  if (hayCondiciones && !valores.configurarCondiciones) {
    return {
      ok: false,
      gravedad: "advertencia",
      mensaje: "Las condiciones de este curso ya están configuradas y no pueden quitarse; puedes modificarlas.",
    }
  }

  const { data, error } = await supabase
    .from("cursos")
    .update(cursoParaGuardar(valores))
    .eq("id", cursoId)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return falloBD(error)
  if (!data?.length) return NO_ENCONTRADO

  if (valores.configurarCondiciones) {
    const consulta = hayCondiciones
      ? supabase
          .from("condiciones_curso")
          .update(condiciones(valores))
          .eq("curso_id", cursoId)
          .eq("institucion_id", institucionId)
      : supabase
          .from("condiciones_curso")
          .insert({ curso_id: cursoId, institucion_id: institucionId, ...condiciones(valores) })
    const { error: condError } = await consulta
    if (condError) {
      revalidarCursos(cursoId)
      const fallo = falloBD(condError)
      return {
        ...fallo,
        gravedad: "advertencia",
        mensaje: `Se guardaron los datos generales, pero no las condiciones. ${fallo.mensaje}`,
      }
    }
  }

  revalidarCursos(cursoId)
  return { ok: true, id: cursoId }
}

// ---------------------------------------------------------------------------
// Estado (borrador / publicado / desactivado)
// ---------------------------------------------------------------------------

export async function cambiarEstadoCurso(id: unknown, estado: unknown): Promise<ResultadoCurso> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO

  const idValido = idCursoSchema.safeParse(id)
  if (!idValido.success || !ESTADOS_CURSO.includes(estado as EstadoCurso)) {
    return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación." }
  }
  const cursoId = idValido.data
  const nuevo = estado as EstadoCurso

  const supabase = await createClient()
  const actual = await cursoDeInstitucion(supabase, institucionId, cursoId)
  if (actual === "error") return falloBD({ message: "lectura del curso" })
  if (!actual) return NO_ENCONTRADO
  if (actual.estado === nuevo) return { ok: true, id: cursoId }

  if (nuevo === "publicado") {
    const faltan = await faltantesParaPublicar(supabase, institucionId, cursoId, actual.categoria_id)
    if (faltan === "error") return falloBD({ message: "comprobación de publicación" })
    if (faltan.length > 0) {
      return { ok: false, gravedad: "advertencia", mensaje: `Aún no se puede publicar: ${faltan.join(" ")}` }
    }
  }

  const { data, error } = await supabase
    .from("cursos")
    .update({ estado: nuevo })
    .eq("id", cursoId)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return falloBD(error)
  if (!data?.length) return NO_ENCONTRADO

  revalidarCursos(cursoId)
  return { ok: true, id: cursoId }
}

/** Requisitos mínimos para mostrar el curso en el catálogo público. */
async function faltantesParaPublicar(
  supabase: Supabase,
  institucionId: string,
  cursoId: string,
  categoriaId: string
): Promise<string[] | "error"> {
  const [categoria, condiciones] = await Promise.all([
    categoriaDeInstitucion(supabase, institucionId, categoriaId),
    supabase
      .from("condiciones_curso")
      .select("curso_id")
      .eq("curso_id", cursoId)
      .eq("institucion_id", institucionId),
  ])
  if (categoria === "error" || condiciones.error) return "error"
  const faltan: string[] = []
  // oferta_cursos solo muestra cursos de categorías activas.
  if (!categoria?.activo) faltan.push("la categoría del curso está inactiva.")
  // Sin condiciones, la RPC de V5 rechaza cualquier solicitud de inscripción.
  if (!condiciones.data?.length) faltan.push("configura las condiciones de inscripción del curso.")
  return faltan
}

// ---------------------------------------------------------------------------
// Eliminar
// ---------------------------------------------------------------------------

/**
 * Solo se elimina un curso sin grupos (los grupos sostienen solicitudes,
 * matrículas, pagos y notas) y sin plan de cuotas. Sus condiciones se borran
 * antes, porque su FK impide borrar el curso; si el borrado del curso fallara,
 * se restauran.
 */
export async function eliminarCurso(id: unknown): Promise<ResultadoCurso> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO

  const idValido = idCursoSchema.safeParse(id)
  if (!idValido.success) return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación." }
  const cursoId = idValido.data

  const supabase = await createClient()
  const actual = await cursoDeInstitucion(supabase, institucionId, cursoId)
  if (actual === "error") return falloBD({ message: "lectura del curso" })
  if (!actual) return NO_ENCONTRADO

  const [grupos, plan, condActual] = await Promise.all([
    supabase.from("grupos").select("id", { count: "exact", head: true }).eq("curso_id", cursoId).eq("institucion_id", institucionId),
    supabase.from("plan_cuotas").select("id", { count: "exact", head: true }).eq("curso_id", cursoId).eq("institucion_id", institucionId),
    supabase.from("condiciones_curso").select(`curso_id, institucion_id, ${COLUMNAS_CONDICIONES}`).eq("curso_id", cursoId).eq("institucion_id", institucionId).maybeSingle(),
  ])
  if (grupos.error) return falloBD(grupos.error)
  if (plan.error) return falloBD(plan.error)
  if (condActual.error) return falloBD(condActual.error)
  if ((grupos.count ?? 0) > 0 || (plan.count ?? 0) > 0) return enUso()

  if (condActual.data) {
    const { error } = await supabase
      .from("condiciones_curso")
      .delete()
      .eq("curso_id", cursoId)
      .eq("institucion_id", institucionId)
    if (error) return falloBD(error, true)
  }

  const { data, error } = await supabase
    .from("cursos")
    .delete()
    .eq("id", cursoId)
    .eq("institucion_id", institucionId)
    .select("id")

  if (error || !data?.length) {
    if (condActual.data) {
      const { error: restaurarError } = await supabase.from("condiciones_curso").insert(condActual.data)
      if (restaurarError) console.error("[cursos] restaurar condiciones", restaurarError.code, restaurarError.message)
    }
    return error ? falloBD(error, true) : NO_ENCONTRADO
  }

  revalidarCursos()
  return { ok: true, id: cursoId }
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function condiciones(valores: CursoValues) {
  // La tabla no tiene trigger de actualización: la fecha se fija aquí.
  return { ...condicionesParaGuardar(valores.condiciones), actualizado_en: new Date().toISOString() }
}

async function categoriaDeInstitucion(supabase: Supabase, institucionId: string, categoriaId: string) {
  const { data, error } = await supabase
    .from("categorias")
    .select("id, activo")
    .eq("id", categoriaId)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<{ id: string; activo: boolean }, { merge: false }>()
  if (error) {
    console.error("[cursos] categoría", error.code, error.message)
    return "error" as const
  }
  return data
}

async function cursoDeInstitucion(supabase: Supabase, institucionId: string, cursoId: string) {
  const { data, error } = await supabase
    .from("cursos")
    .select("id, estado, categoria_id")
    .eq("id", cursoId)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<{ id: string; estado: EstadoCurso; categoria_id: string }, { merge: false }>()
  if (error) {
    console.error("[cursos] curso", error.code, error.message)
    return "error" as const
  }
  return data
}

function enUso(): Fallo {
  return {
    ok: false,
    gravedad: "advertencia",
    mensaje:
      "No puedes eliminar este curso porque tiene registros asociados (grupos o plan de cuotas). Desactívalo para retirarlo de la oferta.",
  }
}

function falloBD(error: { code?: string; message: string }, eliminando = false): Fallo {
  if (esErrorDeRed(error)) {
    return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  }
  console.error("[cursos] BD", error.code, error.message)
  switch (error.code) {
    case "23503":
      return eliminando ? enUso() : CATEGORIA_INVALIDA
    case "23514":
      return { ok: false, gravedad: "error", mensaje: "Algún dato no cumple las reglas del curso. Revisa los importes y la nota." }
    case "42501":
      return { ok: false, gravedad: "error", mensaje: "No tienes permiso para gestionar los cursos de esta institución." }
    default:
      return { ok: false, gravedad: "error", mensaje: "No se pudo guardar el curso. Inténtalo de nuevo en unos minutos." }
  }
}

function revalidarCursos(cursoId?: string) {
  revalidatePath("/admin/cursos")
  if (cursoId) revalidatePath(`/admin/cursos/${cursoId}`)
  revalidatePath("/admin") // resumen: cursos publicados
  revalidatePath("/admin/categorias") // conteo de cursos por categoría
  revalidatePath("/cursos") // catálogo público
  revalidatePath("/")
}
