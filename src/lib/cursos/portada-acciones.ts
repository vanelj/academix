"use server"

import { revalidatePath } from "next/cache"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { BUCKET_PORTADAS, rutaPortadaDeCurso, validarArchivoPortada } from "@/lib/cursos/portada"
import { createClient } from "@/lib/supabase/server"
import { idCursoSchema } from "@/lib/validations/curso"

/**
 * Portada del curso (requiere docs/migraciones/portadas_cursos_v5.sql).
 * - El curso debe pertenecer a la institución del administrador (filtro + RLS).
 * - Se valida el tipo REAL del archivo (firma binaria) y su tamaño en el servidor.
 * - Orden seguro: subir el nuevo → actualizar portada_url → borrar el anterior.
 *   Si la actualización falla, se borra el archivo recién subido (sin huérfanos).
 */

export type ResultadoPortada =
  | { ok: true; portadaUrl: string | null }
  | { ok: false; mensaje: string; migracionPendiente?: boolean }

const SIN_PERMISO = "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión."
const MIGRACION =
  "La carga de portadas todavía no está habilitada en la base de datos (migración «portadas_cursos_v5» pendiente)."

type Supabase = Awaited<ReturnType<typeof createClient>>

async function cursoConPortada(supabase: Supabase, institucionId: string, cursoId: string) {
  const { data, error } = await supabase
    .from("cursos")
    .select("id, portada_url")
    .eq("id", cursoId)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<{ id: string; portada_url: string | null }, { merge: false }>()
  if (error) {
    // 42703: la columna portada_url aún no existe.
    if (error.code === "42703") return "migracion" as const
    console.error("[portada] lectura", error.code, error.message)
    return "error" as const
  }
  return data
}

export async function subirPortadaCurso(cursoId: unknown, formData: FormData): Promise<ResultadoPortada> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return { ok: false, mensaje: SIN_PERMISO }
  const id = idCursoSchema.safeParse(cursoId)
  if (!id.success) return { ok: false, mensaje: "No se pudo identificar el curso." }

  const archivo = formData.get("portada")
  if (!(archivo instanceof Blob)) return { ok: false, mensaje: "Selecciona una imagen." }
  const validacion = await validarArchivoPortada(archivo)
  if (!validacion.ok) return { ok: false, mensaje: validacion.mensaje }
  const { mime, extension } = validacion.tipo

  const supabase = await createClient()
  const actual = await cursoConPortada(supabase, institucionId, id.data)
  if (actual === "migracion") return { ok: false, mensaje: MIGRACION, migracionPendiente: true }
  if (actual === "error") return { ok: false, mensaje: "No se pudo leer el curso. Inténtalo de nuevo." }
  if (!actual) return { ok: false, mensaje: "El curso no existe o no pertenece a tu institución." }

  const ruta = `${institucionId}/${id.data}/portada-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`
  const almacen = supabase.storage.from(BUCKET_PORTADAS)
  const { error: subidaError } = await almacen.upload(ruta, await archivo.arrayBuffer(), {
    contentType: mime,
    cacheControl: "31536000", // ruta única: se puede cachear sin riesgo
    upsert: false,
  })
  if (subidaError) {
    console.error("[portada] subida", subidaError.name, subidaError.message)
    const texto = subidaError.message.toLowerCase()
    if (texto.includes("bucket not found")) return { ok: false, mensaje: MIGRACION, migracionPendiente: true }
    if (texto.includes("size") || texto.includes("too large")) return { ok: false, mensaje: "La imagen supera el tamaño máximo de 3 MB." }
    if (texto.includes("mime")) return { ok: false, mensaje: "Formato no permitido. Usa una imagen JPG, PNG o WebP." }
    if (texto.includes("row-level security") || texto.includes("unauthorized")) return { ok: false, mensaje: "No tienes permiso para subir portadas de este curso." }
    return { ok: false, mensaje: "No se pudo subir la portada. Inténtalo de nuevo en unos minutos." }
  }

  const portadaUrl = almacen.getPublicUrl(ruta).data.publicUrl
  const { data: filas, error } = await supabase
    .from("cursos")
    .update({ portada_url: portadaUrl })
    .eq("id", id.data)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error || !filas?.length) {
    console.error("[portada] actualizar portada_url", error?.code, error?.message)
    const { error: limpieza } = await almacen.remove([ruta])
    if (limpieza) console.error("[portada] limpieza tras fallo", limpieza.message)
    return { ok: false, mensaje: "No se pudo registrar la portada en el curso. Inténtalo de nuevo." }
  }

  const anterior = rutaPortadaDeCurso(actual.portada_url, institucionId, id.data, process.env.NEXT_PUBLIC_SUPABASE_URL!)
  if (anterior && anterior !== ruta) {
    const { error: borrar } = await almacen.remove([anterior])
    if (borrar) console.error("[portada] no se pudo borrar la anterior", borrar.message)
  }
  revalidarPortada(id.data)
  return { ok: true, portadaUrl }
}

/** Quita la referencia primero y después borra el archivo (nunca queda una referencia rota). */
export async function eliminarPortadaCurso(cursoId: unknown): Promise<ResultadoPortada> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return { ok: false, mensaje: SIN_PERMISO }
  const id = idCursoSchema.safeParse(cursoId)
  if (!id.success) return { ok: false, mensaje: "No se pudo identificar el curso." }

  const supabase = await createClient()
  const actual = await cursoConPortada(supabase, institucionId, id.data)
  if (actual === "migracion") return { ok: false, mensaje: MIGRACION, migracionPendiente: true }
  if (actual === "error" || !actual) return { ok: false, mensaje: "No se pudo leer el curso. Inténtalo de nuevo." }
  if (!actual.portada_url) return { ok: true, portadaUrl: null }

  const { data: filas, error } = await supabase
    .from("cursos")
    .update({ portada_url: null })
    .eq("id", id.data)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error || !filas?.length) return { ok: false, mensaje: "No se pudo quitar la portada. Inténtalo de nuevo." }

  const ruta = rutaPortadaDeCurso(actual.portada_url, institucionId, id.data, process.env.NEXT_PUBLIC_SUPABASE_URL!)
  if (ruta) {
    const { error: borrar } = await supabase.storage.from(BUCKET_PORTADAS).remove([ruta])
    if (borrar) console.error("[portada] no se pudo borrar el archivo", borrar.message)
  }
  revalidarPortada(id.data)
  return { ok: true, portadaUrl: null }
}

function revalidarPortada(cursoId: string) {
  revalidatePath("/admin/cursos")
  revalidatePath(`/admin/cursos/${cursoId}`)
  revalidatePath(`/cursos/${cursoId}`)
  revalidatePath("/cursos")
  revalidatePath("/")
}
