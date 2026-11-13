"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { validarArchivoPortada } from "@/lib/cursos/portada"
import { columnaInexistente } from "@/lib/pagos/medios"
import { BUCKET_QR, QR_MAX_BYTES, rutaQrDeMedio } from "@/lib/pagos/qr"
import { createClient } from "@/lib/supabase/server"

/**
 * Imagen QR de un medio Yape o Plin (requiere docs/migraciones/qr_medios_cobro_v5.sql).
 * - El medio debe ser de la institución del administrador (filtro + RLS) y de tipo yape/plin.
 * - Se valida el tipo REAL del archivo (firma binaria) y su tamaño en el servidor.
 * - Orden seguro: subir → registrar qr_url → borrar la imagen anterior.
 * Academix no genera QR ni procesa pagos: solo muestra la imagen que sube la institución.
 */

export type ResultadoQr = { ok: true; qrUrl: string | null } | { ok: false; mensaje: string; migracionPendiente?: boolean }

const SIN_PERMISO = "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión."
const MIGRACION = "La carga de códigos QR todavía no está habilitada en la base de datos (migración «qr_medios_cobro_v5» pendiente)."

type Supabase = Awaited<ReturnType<typeof createClient>>

async function leerMedio(supabase: Supabase, institucionId: string, medioId: string) {
  const { data, error } = await supabase
    .from("medios_cobro_institucion")
    .select("id, tipo, qr_url")
    .eq("id", medioId)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<{ id: string; tipo: string; qr_url: string | null }, { merge: false }>()
  if (error) {
    if (columnaInexistente(error)) return "migracion" as const
    console.error("[qr] lectura", error.code, error.message)
    return "error" as const
  }
  return data
}

export async function subirQrMedio(medioId: unknown, formData: FormData): Promise<ResultadoQr> {
  const institucionId = await institucionDelAdmin("pagos")
  if (!institucionId) return { ok: false, mensaje: SIN_PERMISO }
  const id = z.uuid().safeParse(medioId)
  if (!id.success) return { ok: false, mensaje: "No se pudo identificar el medio de cobro." }

  const archivo = formData.get("qr")
  if (!(archivo instanceof Blob)) return { ok: false, mensaje: "Selecciona una imagen." }
  const validacion = await validarArchivoPortada(archivo, QR_MAX_BYTES)
  if (!validacion.ok) return { ok: false, mensaje: validacion.mensaje }
  const { mime, extension } = validacion.tipo

  const supabase = await createClient()
  const medio = await leerMedio(supabase, institucionId, id.data)
  if (medio === "migracion") return { ok: false, mensaje: MIGRACION, migracionPendiente: true }
  if (medio === "error") return { ok: false, mensaje: "No se pudo leer el medio de cobro. Inténtalo de nuevo." }
  if (!medio) return { ok: false, mensaje: "El medio de cobro no existe o no pertenece a tu institución." }
  if (medio.tipo !== "yape" && medio.tipo !== "plin") return { ok: false, mensaje: "El código QR solo se usa con Yape o Plin." }

  const ruta = `${institucionId}/${medio.id}/qr-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`
  const almacen = supabase.storage.from(BUCKET_QR)
  const { error: subidaError } = await almacen.upload(ruta, await archivo.arrayBuffer(), { contentType: mime, cacheControl: "31536000", upsert: false })
  if (subidaError) {
    console.error("[qr] subida", subidaError.name, subidaError.message)
    const texto = subidaError.message.toLowerCase()
    if (texto.includes("bucket not found")) return { ok: false, mensaje: MIGRACION, migracionPendiente: true }
    if (texto.includes("size") || texto.includes("too large")) return { ok: false, mensaje: "La imagen supera el tamaño máximo de 2 MB." }
    if (texto.includes("mime")) return { ok: false, mensaje: "Formato no permitido. Usa una imagen JPG, PNG o WebP." }
    if (texto.includes("row-level security") || texto.includes("unauthorized")) return { ok: false, mensaje: "No tienes permiso para subir el QR de este medio." }
    return { ok: false, mensaje: "No se pudo subir la imagen. Inténtalo de nuevo en unos minutos." }
  }

  const qrUrl = almacen.getPublicUrl(ruta).data.publicUrl
  const { data: filas, error } = await supabase
    .from("medios_cobro_institucion")
    .update({ qr_url: qrUrl, actualizado_en: new Date().toISOString() })
    .eq("id", medio.id)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error || !filas?.length) {
    console.error("[qr] registrar qr_url", error?.code, error?.message)
    const { error: limpieza } = await almacen.remove([ruta])
    if (limpieza) console.error("[qr] limpieza tras fallo", limpieza.message)
    return { ok: false, mensaje: "No se pudo registrar el QR en el medio de cobro. Inténtalo de nuevo." }
  }

  const anterior = rutaQrDeMedio(medio.qr_url, institucionId, medio.id, process.env.NEXT_PUBLIC_SUPABASE_URL!)
  if (anterior && anterior !== ruta) {
    const { error: borrar } = await almacen.remove([anterior])
    if (borrar) console.error("[qr] no se pudo borrar el anterior", borrar.message)
  }
  revalidar()
  return { ok: true, qrUrl }
}

/** Quita la referencia primero y luego borra la imagen (nunca queda una referencia rota). */
export async function quitarQrMedio(medioId: unknown): Promise<ResultadoQr> {
  const institucionId = await institucionDelAdmin("pagos")
  if (!institucionId) return { ok: false, mensaje: SIN_PERMISO }
  const id = z.uuid().safeParse(medioId)
  if (!id.success) return { ok: false, mensaje: "No se pudo identificar el medio de cobro." }

  const supabase = await createClient()
  const medio = await leerMedio(supabase, institucionId, id.data)
  if (medio === "migracion") return { ok: false, mensaje: MIGRACION, migracionPendiente: true }
  if (medio === "error" || !medio) return { ok: false, mensaje: "No se pudo leer el medio de cobro. Inténtalo de nuevo." }
  if (!medio.qr_url) return { ok: true, qrUrl: null }

  const { data: filas, error } = await supabase
    .from("medios_cobro_institucion")
    .update({ qr_url: null, actualizado_en: new Date().toISOString() })
    .eq("id", medio.id)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error || !filas?.length) {
    console.error("[qr] quitar", error?.code, error?.message)
    return { ok: false, mensaje: "No se pudo quitar el QR. Inténtalo de nuevo." }
  }
  const ruta = rutaQrDeMedio(medio.qr_url, institucionId, medio.id, process.env.NEXT_PUBLIC_SUPABASE_URL!)
  if (ruta) {
    const { error: borrar } = await supabase.storage.from(BUCKET_QR).remove([ruta])
    if (borrar) console.error("[qr] no se pudo borrar la imagen", borrar.message)
  }
  revalidar()
  return { ok: true, qrUrl: null }
}

function revalidar() {
  revalidatePath("/admin/pagos/medios")
  revalidatePath("/estudiante/pagos", "layout")
}
