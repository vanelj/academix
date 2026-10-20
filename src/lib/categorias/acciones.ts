"use server"

import { revalidatePath } from "next/cache"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import {
  categoriaParaGuardar,
  categoriaSchema,
  claveNombre,
  idCategoriaSchema,
  type CategoriaValues,
} from "@/lib/validations/categoria"

/**
 * Gestión de categorías de la institución del administrador.
 *
 * - institucion_id siempre sale del perfil en el servidor (nunca del navegador)
 *   y se usa como filtro en cada UPDATE/DELETE junto con el id.
 * - RLS ("admin gestiona categorias") vuelve a exigir en la BD rol admin activo
 *   y que la fila sea de su institución. Sin filas afectadas = sin permiso o
 *   categoría inexistente.
 * - La FK cursos(categoria_id, institucion_id) impide borrar categorías en uso.
 */

export type ResultadoCategoria =
  | { ok: true }
  | {
      ok: false
      mensaje: string
      /** advertencia = operación rechazada por una regla (no es un fallo técnico). */
      gravedad: "error" | "advertencia"
      campo?: keyof CategoriaValues
    }

const SIN_PERMISO: ResultadoCategoria = {
  ok: false,
  gravedad: "error",
  mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión.",
}
const NO_ENCONTRADA: ResultadoCategoria = {
  ok: false,
  gravedad: "error",
  mensaje: "La categoría ya no existe o no tienes permiso para modificarla. Recarga la página.",
}
const EN_USO: ResultadoCategoria = {
  ok: false,
  gravedad: "advertencia",
  mensaje: "Esta categoría está siendo utilizada y no puede eliminarse.",
}

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function crearCategoria(datos: unknown): Promise<ResultadoCategoria> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO

  const validacion = categoriaSchema.safeParse(datos)
  if (!validacion.success) return { ok: false, gravedad: "error", mensaje: "Revisa los datos de la categoría." }
  const fila = categoriaParaGuardar(validacion.data)

  const supabase = await createClient()
  const duplicado = await nombreEquivalente(supabase, institucionId, fila.nombre)
  if (duplicado) return duplicado

  const { data, error } = await supabase
    .from("categorias")
    .insert({ institucion_id: institucionId, ...fila })
    .select("id")
  if (error) return errorDeBD(error, "guardar")
  if (!data?.length) return SIN_PERMISO

  revalidarCategorias()
  return { ok: true }
}

export async function editarCategoria(id: unknown, datos: unknown): Promise<ResultadoCategoria> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO

  const idValido = idCategoriaSchema.safeParse(id)
  const validacion = categoriaSchema.safeParse(datos)
  if (!idValido.success || !validacion.success) {
    return { ok: false, gravedad: "error", mensaje: "Revisa los datos de la categoría." }
  }
  const fila = categoriaParaGuardar(validacion.data)

  const supabase = await createClient()
  const duplicado = await nombreEquivalente(supabase, institucionId, fila.nombre, idValido.data)
  if (duplicado) return duplicado

  const { data, error } = await supabase
    .from("categorias")
    .update(fila)
    .eq("id", idValido.data)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return errorDeBD(error, "guardar")
  if (!data?.length) return NO_ENCONTRADA

  revalidarCategorias()
  return { ok: true }
}

export async function cambiarEstadoCategoria(id: unknown, activo: unknown): Promise<ResultadoCategoria> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO

  const idValido = idCategoriaSchema.safeParse(id)
  if (!idValido.success || typeof activo !== "boolean") {
    return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("categorias")
    .update({ activo })
    .eq("id", idValido.data)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return errorDeBD(error, "guardar")
  if (!data?.length) return NO_ENCONTRADA

  revalidarCategorias()
  return { ok: true }
}

export async function eliminarCategoria(id: unknown): Promise<ResultadoCategoria> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO

  const idValido = idCategoriaSchema.safeParse(id)
  if (!idValido.success) return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación." }

  const supabase = await createClient()

  // Comprobación previa para un mensaje claro; la FK de cursos lo garantiza igualmente.
  const { count, error: conteoError } = await supabase
    .from("cursos")
    .select("id", { count: "exact", head: true })
    .eq("categoria_id", idValido.data)
    .eq("institucion_id", institucionId)
  if (conteoError) return errorDeBD(conteoError, "eliminar")
  if ((count ?? 0) > 0) return EN_USO

  const { data, error } = await supabase
    .from("categorias")
    .delete()
    .eq("id", idValido.data)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return errorDeBD(error, "eliminar")
  if (!data?.length) return NO_ENCONTRADA

  revalidarCategorias()
  return { ok: true }
}

/** Otra categoría de la institución con un nombre equivalente (mayúsculas, tildes, espacios). */
async function nombreEquivalente(
  supabase: Supabase,
  institucionId: string,
  nombre: string,
  excluirId?: string
): Promise<ResultadoCategoria | null> {
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre")
    .eq("institucion_id", institucionId)
    .overrideTypes<{ id: string; nombre: string }[], { merge: false }>()
  if (error) return errorDeBD(error, "guardar")

  const clave = claveNombre(nombre)
  const existente = data?.find((c) => c.id !== excluirId && claveNombre(c.nombre) === clave)
  if (!existente) return null
  return {
    ok: false,
    gravedad: "advertencia",
    campo: "nombre",
    mensaje: `Ya existe una categoría con ese nombre: «${existente.nombre}».`,
  }
}

function errorDeBD(error: { code?: string; message: string }, operacion: "guardar" | "eliminar"): ResultadoCategoria {
  if (esErrorDeRed(error)) {
    return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  }
  console.error(`[categorias] ${operacion}`, error.code, error.message)
  switch (error.code) {
    case "23505": // UNIQUE (institucion_id, nombre)
      return { ok: false, gravedad: "advertencia", campo: "nombre", mensaje: "Ya existe una categoría con ese nombre." }
    case "23514": // CHECK nombre no vacío
      return { ok: false, gravedad: "error", campo: "nombre", mensaje: "El nombre de la categoría no puede quedar vacío." }
    case "23503": // FK de cursos: categoría en uso
      return EN_USO
    case "42501":
      return { ok: false, gravedad: "error", mensaje: "No tienes permiso para gestionar las categorías de esta institución." }
    default:
      return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación. Inténtalo de nuevo en unos minutos." }
  }
}

function revalidarCategorias() {
  // Módulo, resumen del panel y catálogo público (nombres de categoría y
  // cursos ocultos cuando su categoría está inactiva).
  revalidatePath("/admin/categorias")
  revalidatePath("/admin")
  revalidatePath("/cursos")
  revalidatePath("/")
}
