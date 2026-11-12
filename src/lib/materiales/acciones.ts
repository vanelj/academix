"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { docenteActual, institucionDelAdmin, obtenerContexto } from "@/lib/auth/contexto"
import {
  BUCKET_MATERIALES,
  enlaceMaterialValido,
  MATERIAL_MAX_BYTES,
  nombreArchivoSeguro,
  rutaDeGrupo,
  SEGUNDOS_URL_FIRMADA,
  TIPOS_MATERIAL,
} from "@/lib/materiales/reglas"
import { createClient } from "@/lib/supabase/server"

/**
 * Materiales del curso. Autorización en dos capas:
 * 1. Servidor: el docente debe tener el rol docente ACTIVO y ser el docente del
 *    grupo; el administrador, rol admin activo y el grupo de su institución.
 * 2. BD: RLS de materiales_curso y políticas del bucket privado (todo con la
 *    sesión del usuario; nunca con la clave secreta).
 * Los archivos los sube el navegador directamente al bucket (las políticas
 * limitan la carpeta <institución>/<grupo>/); aquí se registran y validan.
 */

export type ResultadoMaterial = { ok: true; id?: string; url?: string } | { ok: false; mensaje: string; migracionPendiente?: boolean }

const SIN_PERMISO = { ok: false as const, mensaje: "No tienes permiso para gestionar los materiales de este grupo." }
const PENDIENTE = { ok: false as const, migracionPendiente: true, mensaje: "Los materiales aún no están habilitados (falta la actualización «aula_academica_v5»)." }
const TABLA_INEXISTENTE = new Set(["42P01", "PGRST205"])

const uuid = z.uuid()
const texto = (max: number) => z.string().trim().max(max)
const comunes = {
  titulo: z.string().trim().min(1, "Escribe un título.").max(160),
  tema: texto(80).optional().default(""),
  descripcion: texto(1000).optional().default(""),
}
const nuevoMaterial = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("enlace"), enlace: z.string().max(1000), ...comunes }),
  z.object({
    tipo: z.literal("archivo"),
    ruta: z.string().max(500),
    nombre: z.string().max(400),
    mime: z.string().max(120),
    bytes: z.number().int().positive().max(MATERIAL_MAX_BYTES),
    ...comunes,
  }),
])
const edicion = z.object({ ...comunes, enlace: z.string().max(1000).optional() })

type Gestor = { userId: string; institucionId: string }

/** Docente del grupo o administrador de su institución; null en otro caso. */
async function gestorDeGrupo(grupoId: string): Promise<Gestor | null> {
  const supabase = await createClient()
  const docente = await docenteActual()
  if (docente) {
    const { data } = await supabase.from("grupos").select("id, estado").eq("id", grupoId)
      .eq("docente_id", docente.userId).eq("institucion_id", docente.institucionId).maybeSingle()
    return data && data.estado !== "cancelado" ? docente : null
  }
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return null
  const ctx = await obtenerContexto()
  if (ctx.estado !== "con_perfil") return null
  const { data } = await supabase.from("grupos").select("id, estado").eq("id", grupoId).eq("institucion_id", institucionId).maybeSingle()
  return data && data.estado !== "cancelado" ? { userId: ctx.userId, institucionId } : null
}

const nulo = (t: string | undefined) => (t && t.trim() ? t.trim() : null)

export async function crearMaterial(grupoId: unknown, datos: unknown): Promise<ResultadoMaterial> {
  const g = uuid.safeParse(grupoId)
  const v = nuevoMaterial.safeParse(datos)
  if (!g.success || !v.success) return { ok: false, mensaje: v.success ? "Grupo no válido." : (v.error.issues[0]?.message ?? "Revisa los datos.") }
  const gestor = await gestorDeGrupo(g.data)
  if (!gestor) return SIN_PERMISO
  const supabase = await createClient()

  const base = {
    institucion_id: gestor.institucionId,
    grupo_id: g.data,
    titulo: v.data.titulo,
    tema: nulo(v.data.tema),
    descripcion: nulo(v.data.descripcion),
    creado_por: gestor.userId,
  }
  let fila: Record<string, unknown>
  if (v.data.tipo === "enlace") {
    const enlace = enlaceMaterialValido(v.data.enlace)
    if (!enlace) return { ok: false, mensaje: "El enlace debe empezar por https:// (por ejemplo, un documento compartido o un vídeo)." }
    fila = { ...base, tipo: "enlace", enlace }
  } else {
    const d = v.data
    if (!(d.mime in TIPOS_MATERIAL) || !rutaDeGrupo(d.ruta, gestor.institucionId, g.data) || !d.ruta.endsWith(`.${TIPOS_MATERIAL[d.mime as keyof typeof TIPOS_MATERIAL].ext}`)) {
      return { ok: false, mensaje: "El archivo no es válido para este grupo." }
    }
    // El objeto debe existir en la carpeta del grupo (lo subió el navegador con su sesión).
    const carpeta = d.ruta.slice(0, d.ruta.lastIndexOf("/"))
    const archivo = d.ruta.slice(d.ruta.lastIndexOf("/") + 1)
    const { data: lista, error: listaError } = await supabase.storage.from(BUCKET_MATERIALES).list(carpeta, { search: archivo, limit: 1 })
    if (listaError) {
      console.error("[materiales] comprobar archivo", listaError.message)
      return /bucket/i.test(listaError.message) ? PENDIENTE : { ok: false, mensaje: "No se pudo comprobar el archivo. Inténtalo de nuevo." }
    }
    const objeto = lista?.find((o) => o.name === archivo)
    if (!objeto) return { ok: false, mensaje: "No se encontró el archivo subido. Vuelve a intentarlo." }
    const tamano = Number((objeto.metadata as { size?: number } | null)?.size ?? d.bytes)
    if (tamano > MATERIAL_MAX_BYTES) return { ok: false, mensaje: "El archivo supera 20 MB." }
    fila = { ...base, tipo: "archivo", archivo_path: d.ruta, archivo_nombre: nombreArchivoSeguro(d.nombre), archivo_tipo: d.mime, archivo_bytes: tamano }
  }

  const { data, error } = await supabase.from("materiales_curso").insert(fila).select("id").maybeSingle()
  if (error) {
    if (TABLA_INEXISTENTE.has(error.code ?? "")) return PENDIENTE
    console.error("[materiales] crear", error.code, error.message)
    return { ok: false, mensaje: error.code === "42501" ? SIN_PERMISO.mensaje : "No se pudo guardar el material. Inténtalo de nuevo." }
  }
  revalidar(g.data)
  return { ok: true, id: data?.id as string | undefined }
}

export async function editarMaterial(materialId: unknown, datos: unknown): Promise<ResultadoMaterial> {
  const id = uuid.safeParse(materialId)
  const v = edicion.safeParse(datos)
  if (!id.success || !v.success) return { ok: false, mensaje: v.success ? "Material no válido." : (v.error.issues[0]?.message ?? "Revisa los datos.") }
  const supabase = await createClient()
  const { data: actual } = await supabase.from("materiales_curso").select("id, grupo_id, tipo").eq("id", id.data).maybeSingle()
  if (!actual) return { ok: false, mensaje: "El material ya no existe o no tienes acceso." }
  if (!(await gestorDeGrupo(actual.grupo_id as string))) return SIN_PERMISO
  const cambios: Record<string, unknown> = { titulo: v.data.titulo, tema: nulo(v.data.tema), descripcion: nulo(v.data.descripcion) }
  if (actual.tipo === "enlace" && v.data.enlace !== undefined) {
    const enlace = enlaceMaterialValido(v.data.enlace)
    if (!enlace) return { ok: false, mensaje: "El enlace debe empezar por https://." }
    cambios.enlace = enlace
  }
  // RLS: el docente solo edita SUS materiales; el administrador, los de su institución.
  const { data, error } = await supabase.from("materiales_curso").update(cambios).eq("id", id.data).select("id")
  if (error) {
    console.error("[materiales] editar", error.code, error.message)
    return { ok: false, mensaje: "No se pudo guardar el cambio." }
  }
  if (!data?.length) return { ok: false, mensaje: "Solo puedes editar los materiales que tú compartiste." }
  revalidar(actual.grupo_id as string)
  return { ok: true, id: id.data }
}

export async function retirarMaterial(materialId: unknown): Promise<ResultadoMaterial> {
  const id = uuid.safeParse(materialId)
  if (!id.success) return { ok: false, mensaje: "Material no válido." }
  const supabase = await createClient()
  const { data: actual } = await supabase.from("materiales_curso").select("id, grupo_id, archivo_path").eq("id", id.data).maybeSingle()
  if (!actual) return { ok: false, mensaje: "El material ya no existe o no tienes acceso." }
  if (!(await gestorDeGrupo(actual.grupo_id as string))) return SIN_PERMISO
  const { data, error } = await supabase.from("materiales_curso").delete().eq("id", id.data).select("id")
  if (error) {
    console.error("[materiales] retirar", error.code, error.message)
    return { ok: false, mensaje: "No se pudo retirar el material." }
  }
  if (!data?.length) return { ok: false, mensaje: "Solo puedes retirar los materiales que tú compartiste." }
  if (actual.archivo_path) {
    const { error: borrar } = await supabase.storage.from(BUCKET_MATERIALES).remove([actual.archivo_path as string])
    if (borrar) console.error("[materiales] archivo huérfano", borrar.message)
  }
  revalidar(actual.grupo_id as string)
  return { ok: true }
}

/**
 * Abre un material: enlace externo o URL FIRMADA de 5 minutos. La lectura de la
 * fila y la firma usan la sesión del usuario: si no es estudiante activo del
 * grupo, su docente o su administrador, RLS no devuelve nada.
 */
export async function abrirMaterial(materialId: unknown, descargar = false): Promise<ResultadoMaterial> {
  const id = uuid.safeParse(materialId)
  if (!id.success) return { ok: false, mensaje: "Material no válido." }
  const ctx = await obtenerContexto()
  if (ctx.estado !== "con_perfil" || !ctx.rolActivo) return { ok: false, mensaje: "Tu sesión terminó. Vuelve a iniciar sesión." }
  const supabase = await createClient()
  const { data } = await supabase.from("materiales_curso").select("tipo, enlace, archivo_path, archivo_nombre").eq("id", id.data).maybeSingle()
  if (!data) return { ok: false, mensaje: "El material ya no está disponible." }
  if (data.tipo === "enlace") {
    const enlace = enlaceMaterialValido(String(data.enlace ?? ""))
    return enlace ? { ok: true, url: enlace } : { ok: false, mensaje: "El enlace no es válido." }
  }
  const { data: firmada, error } = await supabase.storage
    .from(BUCKET_MATERIALES)
    .createSignedUrl(String(data.archivo_path), SEGUNDOS_URL_FIRMADA, descargar ? { download: String(data.archivo_nombre ?? "material") } : undefined)
  if (error || !firmada?.signedUrl) {
    console.error("[materiales] url firmada", error?.message)
    return { ok: false, mensaje: "No se pudo abrir el archivo. Inténtalo de nuevo." }
  }
  return { ok: true, url: firmada.signedUrl }
}

function revalidar(grupoId: string) {
  revalidatePath(`/docente/grupos/${grupoId}`)
  revalidatePath("/estudiante/cursos", "layout")
}
