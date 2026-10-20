"use server"

import { revalidatePath } from "next/cache"

import { obtenerContexto } from "@/lib/auth/contexto"
import {
  BUCKET_LOGOS,
  rutaLogoDeInstitucion,
  validarArchivoLogo,
} from "@/lib/institucion/logo"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import {
  institucionParaGuardar,
  institucionSchema,
  type InstitucionValues,
} from "@/lib/validations/institucion"

const MENSAJE_SIN_PERMISO =
  "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión."

/**
 * Institución del administrador autenticado, o null. Se obtiene en el servidor
 * desde el perfil (nunca del navegador) y exige perfil activo y rol admin activo.
 */
async function institucionAutorizada(): Promise<string | null> {
  const ctx = await obtenerContexto()
  if (
    ctx.estado !== "con_perfil" ||
    !ctx.perfil.activo ||
    ctx.rolActivo !== "admin" ||
    !ctx.perfil.institucionId
  ) {
    return null
  }
  return ctx.perfil.institucionId
}

export type ResultadoInstitucion =
  | { ok: true; valores: InstitucionValues }
  | { ok: false; mensaje: string; campo?: keyof InstitucionValues }

/**
 * Actualiza los datos de la institución del administrador autenticado.
 *
 * - La institución se toma del perfil en el servidor, nunca del navegador.
 * - Solo se envían columnas con GRANT UPDATE (nombre, ruc, correo, telefono,
 *   direccion). id, activo y created_at no pueden modificarse.
 * - RLS ("admin edita su institucion") exige rol admin activo en la BD: si no se
 *   cumple, el UPDATE no afecta filas y se informa como falta de permiso.
 */
export async function actualizarInstitucion(datos: unknown): Promise<ResultadoInstitucion> {
  const institucionId = await institucionAutorizada()
  if (!institucionId) {
    return { ok: false, mensaje: MENSAJE_SIN_PERMISO }
  }

  const validacion = institucionSchema.safeParse(datos)
  if (!validacion.success) {
    return { ok: false, mensaje: "Revisa los datos del formulario." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("instituciones")
    .update(institucionParaGuardar(validacion.data))
    .eq("id", institucionId)
    .select("nombre, ruc, correo, telefono, direccion")

  if (error) {
    if (esErrorDeRed(error)) {
      return { ok: false, mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
    }
    console.error("[institucion] actualización", error.code, error.message)
    if (error.code === "23505") {
      return {
        ok: false,
        campo: "ruc",
        mensaje: "Ya existe otra institución registrada con ese RUC.",
      }
    }
    if (error.code === "23514") {
      return { ok: false, campo: "nombre", mensaje: "El nombre de la institución no puede quedar vacío." }
    }
    if (error.code === "42501") {
      return { ok: false, mensaje: "No tienes permiso para modificar estos datos." }
    }
    return { ok: false, mensaje: "No se pudieron guardar los cambios. Inténtalo de nuevo en unos minutos." }
  }

  // Sin filas afectadas: RLS rechazó la edición (rol activo distinto de admin u otra institución).
  const fila = data?.[0]
  if (!fila) {
    return { ok: false, mensaje: "No tienes permiso para modificar esta institución." }
  }

  // El nombre aparece en la cabecera y la barra lateral de todo el panel.
  revalidatePath("/admin", "layout")

  return {
    ok: true,
    valores: {
      nombre: fila.nombre ?? "",
      ruc: fila.ruc ?? "",
      correo: fila.correo ?? "",
      telefono: fila.telefono ?? "",
      direccion: fila.direccion ?? "",
    },
  }
}

// ---------------------------------------------------------------------------
// Logotipo institucional (Supabase Storage, bucket "logos-instituciones")
// ---------------------------------------------------------------------------

export type ResultadoLogo = { ok: true; logoUrl: string | null } | { ok: false; mensaje: string }

const MENSAJE_STORAGE_NO_CONFIGURADO =
  "El almacenamiento de logotipos aún no está configurado en Supabase. Aplica la migración docs/migraciones/storage_logos_instituciones.sql."

function mensajeErrorStorage(error: { message: string; statusCode?: string | number }): string {
  const texto = error.message.toLowerCase()
  if (texto.includes("bucket not found")) return MENSAJE_STORAGE_NO_CONFIGURADO
  if (texto.includes("row-level security") || String(error.statusCode) === "403") {
    return "No tienes permiso para gestionar el logotipo de esta institución."
  }
  if (texto.includes("exceeded") || texto.includes("too large") || String(error.statusCode) === "413") {
    return "El logotipo supera el tamaño máximo de 2 MB."
  }
  if (texto.includes("mime")) return "Formato no permitido. Usa una imagen PNG, JPG o WebP."
  return "No se pudo guardar el logotipo. Inténtalo de nuevo en unos minutos."
}

/**
 * Sube (o reemplaza) el logotipo.
 * 1. Valida tamaño y tipo REAL del archivo (firma binaria) en el servidor.
 * 2. Lo sube a <institución>/logo-<tiempo>-<aleatorio>.<ext>: ruta única, sin
 *    colisiones ni problemas de caché. Las políticas de Storage exigen que la
 *    carpeta sea la institución del admin activo.
 * 3. Actualiza instituciones.logo_url. Si falla, borra el archivo nuevo.
 * 4. Solo entonces borra el logotipo anterior (si era de esta institución).
 */
export async function subirLogo(formData: FormData): Promise<ResultadoLogo> {
  const institucionId = await institucionAutorizada()
  if (!institucionId) return { ok: false, mensaje: MENSAJE_SIN_PERMISO }

  const archivo = formData.get("logo")
  if (!(archivo instanceof Blob)) return { ok: false, mensaje: "Selecciona una imagen." }

  const validacion = await validarArchivoLogo(archivo)
  if (!validacion.ok) return { ok: false, mensaje: validacion.mensaje }
  const { mime, extension } = validacion.tipo

  const supabase = await createClient()

  const { data: actual, error: lecturaError } = await supabase
    .from("instituciones")
    .select("logo_url")
    .eq("id", institucionId)
    .maybeSingle()
  if (lecturaError || !actual) {
    console.error("[logo] lectura", lecturaError?.code, lecturaError?.message)
    return { ok: false, mensaje: "No se pudo leer la institución. Inténtalo de nuevo." }
  }

  const ruta = `${institucionId}/logo-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`
  const almacen = supabase.storage.from(BUCKET_LOGOS)

  const { error: subidaError } = await almacen.upload(ruta, await archivo.arrayBuffer(), {
    contentType: mime,
    cacheControl: "31536000", // la ruta es única: puede cachearse sin riesgo
    upsert: false,
  })
  if (subidaError) {
    console.error("[logo] subida", subidaError.name, subidaError.message)
    return { ok: false, mensaje: mensajeErrorStorage(subidaError) }
  }

  const logoUrl = almacen.getPublicUrl(ruta).data.publicUrl

  const { data: filas, error: actualizarError } = await supabase
    .from("instituciones")
    .update({ logo_url: logoUrl })
    .eq("id", institucionId)
    .select("id")

  if (actualizarError || !filas?.length) {
    console.error("[logo] actualización de logo_url", actualizarError?.code, actualizarError?.message)
    // El archivo nuevo no quedó referenciado: se elimina para no dejar huérfanos.
    const { error: limpiezaError } = await almacen.remove([ruta])
    if (limpiezaError) console.error("[logo] limpieza tras fallo", limpiezaError.message)
    return {
      ok: false,
      mensaje: actualizarError
        ? "No se pudo registrar el logotipo en la institución. Inténtalo de nuevo."
        : "No tienes permiso para modificar esta institución.",
    }
  }

  // El nuevo ya está guardado y referenciado: ahora sí se elimina el anterior.
  const anterior = rutaLogoDeInstitucion(
    actual.logo_url,
    institucionId,
    process.env.NEXT_PUBLIC_SUPABASE_URL!
  )
  if (anterior && anterior !== ruta) {
    const { error } = await almacen.remove([anterior])
    if (error) console.error("[logo] no se pudo borrar el logotipo anterior", error.message)
  }

  revalidarLogo()
  return { ok: true, logoUrl }
}

/**
 * Elimina el logotipo: primero quita la referencia (logo_url = null) y después
 * borra el archivo. Si el borrado del archivo fallara, solo quedaría un archivo
 * sin usar, nunca una referencia rota.
 */
export async function eliminarLogo(): Promise<ResultadoLogo> {
  const institucionId = await institucionAutorizada()
  if (!institucionId) return { ok: false, mensaje: MENSAJE_SIN_PERMISO }

  const supabase = await createClient()
  const { data: actual, error: lecturaError } = await supabase
    .from("instituciones")
    .select("logo_url")
    .eq("id", institucionId)
    .maybeSingle()
  if (lecturaError || !actual) {
    return { ok: false, mensaje: "No se pudo leer la institución. Inténtalo de nuevo." }
  }
  if (!actual.logo_url) return { ok: true, logoUrl: null }

  const { data: filas, error } = await supabase
    .from("instituciones")
    .update({ logo_url: null })
    .eq("id", institucionId)
    .select("id")
  if (error || !filas?.length) {
    console.error("[logo] quitar logo_url", error?.code, error?.message)
    return { ok: false, mensaje: "No se pudo eliminar el logotipo. Inténtalo de nuevo." }
  }

  const ruta = rutaLogoDeInstitucion(actual.logo_url, institucionId, process.env.NEXT_PUBLIC_SUPABASE_URL!)
  if (ruta) {
    const { error: borrarError } = await supabase.storage.from(BUCKET_LOGOS).remove([ruta])
    if (borrarError) console.error("[logo] no se pudo borrar el archivo", borrarError.message)
  }

  revalidarLogo()
  return { ok: true, logoUrl: null }
}

function revalidarLogo() {
  // Panel (barra lateral) y páginas públicas que muestran logo_url.
  revalidatePath("/admin", "layout")
  revalidatePath("/cursos")
  revalidatePath("/instituciones")
  revalidatePath("/")
}
