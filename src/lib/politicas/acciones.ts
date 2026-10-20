"use server"

import { revalidatePath } from "next/cache"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import {
  COLUMNAS_POLITICAS,
  politicasDesdeFila,
  politicasEstanVacias,
  politicasParaGuardar,
  politicasSchema,
  type CampoPolitica,
  type PoliticasValues,
} from "@/lib/validations/politicas"

/** Versión guardada: valores y fecha (null = sin políticas configuradas). */
export type VersionPoliticas = { valores: PoliticasValues; actualizadoEn: string | null }

export type ResultadoPoliticas =
  | ({ ok: true } & VersionPoliticas)
  | { ok: false; mensaje: string; conflicto?: VersionPoliticas }

type FilaPoliticas = Record<CampoPolitica, string | null> & { actualizado_en: string }
type ErrorBD = { code?: string; message: string }
type Supabase = Awaited<ReturnType<typeof createClient>>

const MENSAJE_CONFLICTO =
  "Las políticas se modificaron desde otra sesión después de que abrieras esta página. Tus cambios no se guardaron."

/**
 * Crea, actualiza o vacía las políticas de la institución del administrador.
 *
 * - institucion_id se toma del perfil en el servidor, nunca del navegador.
 * - Una fila por institución (institucion_id es la clave primaria).
 * - Control de concurrencia optimista: el formulario envía el actualizado_en que
 *   leyó (versionBase). Solo se escribe si la fila sigue en esa versión; si otra
 *   sesión guardó antes, no se sobrescribe y se devuelve la versión actual.
 *   · Sin versión (no había fila): INSERT; si otra sesión la creó antes, la
 *     clave primaria lo impide (23505) → conflicto. Nunca hay duplicados.
 *   · Con versión: UPDATE/DELETE ... WHERE actualizado_en = versionBase.
 * - RLS ("admin administra politicas") exige que institucion_id sea la del
 *   usuario y que su rol activo sea admin.
 * - Si todas las políticas quedan vacías, se elimina la fila: la institución
 *   vuelve a "sin políticas configuradas" en vez de publicar textos vacíos.
 */
export async function guardarPoliticas(datos: unknown, versionBase: unknown): Promise<ResultadoPoliticas> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) {
    return { ok: false, mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión." }
  }

  const validacion = politicasSchema.safeParse(datos)
  const version =
    versionBase === null ? null : typeof versionBase === "string" && !Number.isNaN(Date.parse(versionBase)) ? versionBase : undefined
  if (!validacion.success || version === undefined) {
    return { ok: false, mensaje: "Revisa los textos de las políticas." }
  }
  const valores = validacion.data
  const supabase = await createClient()
  const tabla = () => supabase.from("politicas_institucion")

  // 1. Todo vacío → quitar la configuración.
  if (politicasEstanVacias(valores)) {
    if (version === null) return { ok: true, valores, actualizadoEn: null } // ya no existía
    const { data, error } = await tabla()
      .delete()
      .eq("institucion_id", institucionId)
      .eq("actualizado_en", version)
      .select("institucion_id")
    if (error) return errorAlGuardar(error)
    if (!data?.length) return sinFilasAfectadas(supabase, institucionId)
    revalidarPoliticas()
    return { ok: true, valores, actualizadoEn: null }
  }

  const fila = {
    ...politicasParaGuardar(valores),
    // La tabla no tiene trigger de actualización: la fecha (y versión) se fija aquí.
    actualizado_en: new Date().toISOString(),
  }

  // 2. Configuración inicial → INSERT (la PK impide una segunda fila).
  if (version === null) {
    const { data, error } = await tabla()
      .insert({ institucion_id: institucionId, ...fila })
      .select(COLUMNAS_POLITICAS)
      .overrideTypes<FilaPoliticas[], { merge: false }>()
    if (error?.code === "23505") return conflicto(supabase, institucionId)
    if (error) return errorAlGuardar(error)
    if (!data?.[0]) return { ok: false, mensaje: "No tienes permiso para modificar las políticas de esta institución." }
    revalidarPoliticas()
    return { ok: true, valores: politicasDesdeFila(data[0]), actualizadoEn: data[0].actualizado_en }
  }

  // 3. Edición → UPDATE solo si la fila sigue en la versión leída.
  const { data, error } = await tabla()
    .update(fila)
    .eq("institucion_id", institucionId)
    .eq("actualizado_en", version)
    .select(COLUMNAS_POLITICAS)
    .overrideTypes<FilaPoliticas[], { merge: false }>()
  if (error) return errorAlGuardar(error)
  if (!data?.[0]) return sinFilasAfectadas(supabase, institucionId)
  revalidarPoliticas()
  return { ok: true, valores: politicasDesdeFila(data[0]), actualizadoEn: data[0].actualizado_en }
}

/** Versión actual guardada (null si no hay fila o RLS no la deja ver). */
async function versionActual(supabase: Supabase, institucionId: string): Promise<VersionPoliticas | null | "error"> {
  const { data, error } = await supabase
    .from("politicas_institucion")
    .select(COLUMNAS_POLITICAS)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<FilaPoliticas, { merge: false }>()
  if (error) return "error"
  return data ? { valores: politicasDesdeFila(data), actualizadoEn: data.actualizado_en } : null
}

/** INSERT rechazado por la PK: otra sesión creó la configuración antes. */
async function conflicto(supabase: Supabase, institucionId: string): Promise<ResultadoPoliticas> {
  const actual = await versionActual(supabase, institucionId)
  if (actual === "error") return { ok: false, mensaje: `${MENSAJE_CONFLICTO} Recarga la página.` }
  return conflictoCon(actual)
}

/**
 * UPDATE/DELETE sin filas: o la versión cambió (otra sesión guardó o vació las
 * políticas) o RLS lo impidió. Si la fila no se puede leer y tampoco existe
 * para RLS, se trata como conflicto (fue eliminada).
 */
async function sinFilasAfectadas(supabase: Supabase, institucionId: string): Promise<ResultadoPoliticas> {
  const actual = await versionActual(supabase, institucionId)
  if (actual === "error") {
    return { ok: false, mensaje: "No se pudieron guardar las políticas. Inténtalo de nuevo en unos minutos." }
  }
  return conflictoCon(actual)
}

function conflictoCon(actual: VersionPoliticas | null): ResultadoPoliticas {
  return {
    ok: false,
    mensaje: MENSAJE_CONFLICTO,
    conflicto: actual ?? { valores: politicasDesdeFila({}), actualizadoEn: null },
  }
}

function errorAlGuardar(error: ErrorBD): ResultadoPoliticas {
  if (esErrorDeRed(error)) {
    return { ok: false, mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  }
  console.error("[politicas] guardado", error.code, error.message)
  if (error.code === "42501") {
    return { ok: false, mensaje: "No tienes permiso para modificar las políticas de esta institución." }
  }
  if (error.code === "23503") {
    return { ok: false, mensaje: "No se encontró la institución asociada a tu cuenta. Vuelve a iniciar sesión." }
  }
  return { ok: false, mensaje: "No se pudieron guardar las políticas. Inténtalo de nuevo en unos minutos." }
}

function revalidarPoliticas() {
  // La página del módulo y el resumen del panel (estado "Definir políticas").
  revalidatePath("/admin/politicas")
  revalidatePath("/admin")
}
