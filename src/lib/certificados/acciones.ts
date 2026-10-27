"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { BUCKET_EMITIDOS, BUCKET_RECURSOS, MODALIDADES, TAMANO_MAX_FIRMA, TAMANO_MAX_FONDO, VIGENCIA_ENLACE_CERTIFICADO } from "@/lib/certificados/config"
import { leerContenido, tablaInexistente } from "@/lib/certificados/datos"
import { camposPredeterminados, disenoSchema } from "@/lib/certificados/diseno"
import { pdfEmitido } from "@/lib/certificados/emision"
import { BUCKET_COMPROBANTES, MOTIVO_REVISION_DESHABILITADA, REVISION_PAGOS_HABILITADA, TIPOS_COMPROBANTE, tipoPorFirma, VIGENCIA_ENLACE_COMPROBANTE } from "@/lib/pagos/config"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"

/**
 * Acciones del ADMINISTRADOR sobre certificados (migración certificados_v5).
 * - institucion_id sale SIEMPRE del perfil; RLS lo vuelve a exigir.
 * - Emisión y pagos SOLO mediante RPC transaccionales (emitir_certificado,
 *   adjuntar_pdf_certificado, revisar_pago_certificado): la BD comprueba los
 *   requisitos académicos y económicos; la app nunca inserta certificados.
 * - Archivos privados: se suben con la sesión a la carpeta de la institución
 *   y se abren solo con enlaces firmados de corta duración.
 */

export type ResultadoCert =
  | { ok: true; id?: string; codigo?: string; aviso?: string; url?: string }
  | { ok: false; mensaje: string; gravedad: "error" | "advertencia"; campos?: Record<string, string> }
type Fallo = Extract<ResultadoCert, { ok: false }>

const SIN_PERMISO: Fallo = { ok: false, gravedad: "error", mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión." }
const NO_ENCONTRADO: Fallo = { ok: false, gravedad: "error", mensaje: "El registro no existe o no pertenece a tu institución. Recarga la página." }
const NO_DISPONIBLE: Fallo = { ok: false, gravedad: "advertencia", mensaje: "Los certificados personalizables requieren la migración certificados_v5 (pendiente de aplicar)." }
const uuid = z.uuid()
const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

function revalidar() {
  revalidatePath("/admin/certificados", "layout")
  revalidatePath("/admin/cursos", "layout")
}

function campos(error: z.ZodError) {
  const c: Record<string, string> = {}
  for (const i of error.issues) c[String(i.path[0] ?? "general")] ??= i.message
  return c
}

/** Comprueba que el archivo subido exista, no supere el tamaño y que su contenido real coincida con su extensión. */
async function verificarArchivo(supabase: Awaited<ReturnType<typeof createClient>>, ruta: string, maximo: number, permitidos: string[]) {
  const { data, error } = await supabase.storage.from(BUCKET_RECURSOS).download(ruta)
  if (error || !data) return null
  if (data.size === 0 || data.size > maximo) return null
  const firma = tipoPorFirma(new Uint8Array(await data.slice(0, 8).arrayBuffer()))
  const extension = ruta.split(".").pop()
  return firma && permitidos.includes(firma) && TIPOS_COMPROBANTE[firma] === extension ? firma : null
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

const nombrePlantilla = z.string().trim().min(1, "Introduce un nombre.").max(100, "Máximo 100 caracteres.")

export async function crearPlantilla(datos: unknown): Promise<ResultadoCert> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const v = z.object({ nombre: nombrePlantilla, base: z.enum(["clasico", "ornamental", "moderno"]) }).safeParse(datos)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: "Revisa los datos de la plantilla.", campos: campos(v.error) }
  const supabase = await createClient()
  const { count } = await supabase.from("plantillas_certificado").select("id", { count: "exact", head: true }).eq("institucion_id", institucionId).eq("predeterminada", true)
  const { data, error } = await supabase.from("plantillas_certificado")
    .insert({ institucion_id: institucionId, nombre: v.data.nombre, base: v.data.base, diseno: { version: 1, campos: camposPredeterminados(v.data.base) }, predeterminada: (count ?? 0) === 0 })
    .select("id")
  if (error) return fallo(error)
  revalidar()
  return { ok: true, id: (data?.[0] as { id: string }).id }
}

/** Plantilla con fondo propio: el navegador ya subió el archivo a <institución>/fondos/<uuid>.<ext>. */
export async function registrarPlantillaPropia(datos: unknown): Promise<ResultadoCert> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const v = z.object({ nombre: nombrePlantilla, ruta: z.string().max(200) }).safeParse(datos)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: "Revisa los datos de la plantilla.", campos: campos(v.error) }
  if (!new RegExp(`^${institucionId}/fondos/${UUID_RE}\\.(png|jpg|pdf)$`).test(v.data.ruta)) {
    return { ok: false, gravedad: "error", mensaje: "El archivo del fondo no es válido. Vuelve a subirlo." }
  }
  const supabase = await createClient()
  const tipo = await verificarArchivo(supabase, v.data.ruta, TAMANO_MAX_FONDO, ["image/png", "image/jpeg", "application/pdf"])
  if (!tipo) return { ok: false, gravedad: "error", mensaje: "El fondo debe ser una imagen PNG/JPG o un PDF válido de hasta 5 MB." }
  const { count } = await supabase.from("plantillas_certificado").select("id", { count: "exact", head: true }).eq("institucion_id", institucionId).eq("predeterminada", true)
  const { data, error } = await supabase.from("plantillas_certificado")
    .insert({ institucion_id: institucionId, nombre: v.data.nombre, base: "propia", fondo_path: v.data.ruta, fondo_tipo: tipo, diseno: { version: 1, campos: camposPredeterminados("propia") }, predeterminada: (count ?? 0) === 0 })
    .select("id")
  if (error) return fallo(error)
  revalidar()
  return { ok: true, id: (data?.[0] as { id: string }).id }
}

export async function guardarDiseno(plantillaId: unknown, diseno: unknown): Promise<ResultadoCert> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = uuid.safeParse(plantillaId)
  if (!id.success) return NO_ENCONTRADO
  const v = disenoSchema.safeParse(diseno)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: v.error.issues[0]?.message ?? "El diseño no es válido." }
  const supabase = await createClient()
  const { data, error } = await supabase.from("plantillas_certificado").update({ diseno: v.data, actualizado_en: new Date().toISOString() })
    .eq("id", id.data).eq("institucion_id", institucionId).select("id")
  if (error) return fallo(error)
  if (!data?.length) return NO_ENCONTRADO
  revalidar()
  return { ok: true, id: id.data }
}

export async function actualizarPlantilla(plantillaId: unknown, cambios: unknown): Promise<ResultadoCert> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = uuid.safeParse(plantillaId)
  const v = z.object({ nombre: nombrePlantilla.optional(), activo: z.boolean().optional(), predeterminada: z.literal(true).optional() }).safeParse(cambios)
  if (!id.success || !v.success) return NO_ENCONTRADO
  const supabase = await createClient()
  if (v.data.predeterminada) {
    // Una sola predeterminada por institución (índice único): primero se desmarcan las demás.
    const { error } = await supabase.from("plantillas_certificado").update({ predeterminada: false }).eq("institucion_id", institucionId).eq("predeterminada", true).neq("id", id.data)
    if (error) return fallo(error)
  }
  const fila = { ...v.data, ...(v.data.predeterminada ? { activo: true } : {}), ...(v.data.activo === false ? { predeterminada: false } : {}), actualizado_en: new Date().toISOString() }
  const { data, error } = await supabase.from("plantillas_certificado").update(fila).eq("id", id.data).eq("institucion_id", institucionId).select("id")
  if (error) return fallo(error)
  if (!data?.length) return NO_ENCONTRADO
  revalidar()
  return { ok: true, id: id.data }
}

export async function eliminarPlantilla(plantillaId: unknown): Promise<ResultadoCert> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = uuid.safeParse(plantillaId)
  if (!id.success) return NO_ENCONTRADO
  const supabase = await createClient()
  // Los certificados ya emitidos conservan su copia fija del diseño; los cursos que la usaban pasan a la predeterminada.
  const { data, error } = await supabase.from("plantillas_certificado").delete().eq("id", id.data).eq("institucion_id", institucionId).select("id")
  if (error) return fallo(error)
  if (!data?.length) return NO_ENCONTRADO
  revalidar()
  return { ok: true, id: id.data }
}

// ---------------------------------------------------------------------------
// Firmantes
// ---------------------------------------------------------------------------

const firmanteSchema = z.object({
  nombre: z.string().trim().min(3, "Introduce el nombre completo.").max(150),
  cargo: z.string().trim().min(2, "Introduce el cargo.").max(150),
  ruta: z.string().max(200).nullable(),
  declaracion: z.literal(true, { error: "Debes declarar que la persona autorizó el uso de su nombre y firma." }),
})

export async function guardarFirmante(firmanteId: unknown, datos: unknown): Promise<ResultadoCert> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = firmanteId === null ? null : uuid.safeParse(firmanteId)
  if (id && !id.success) return NO_ENCONTRADO
  const v = firmanteSchema.safeParse(datos)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: v.error.issues[0]?.message ?? "Revisa los datos del firmante.", campos: campos(v.error) }
  const supabase = await createClient()
  if (v.data.ruta) {
    if (!new RegExp(`^${institucionId}/firmas/${UUID_RE}\\.(png|jpg)$`).test(v.data.ruta)) return { ok: false, gravedad: "error", mensaje: "La imagen de la firma no es válida. Vuelve a subirla." }
    if (!(await verificarArchivo(supabase, v.data.ruta, TAMANO_MAX_FIRMA, ["image/png", "image/jpeg"]))) {
      return { ok: false, gravedad: "error", mensaje: "La firma debe ser una imagen PNG o JPG de hasta 2 MB." }
    }
  }
  const fila = {
    nombre: v.data.nombre.replace(/\s+/g, " "),
    cargo: v.data.cargo.replace(/\s+/g, " "),
    ...(v.data.ruta ? { firma_path: v.data.ruta } : {}),
    actualizado_en: new Date().toISOString(),
  }
  const { data, error } = id
    ? await supabase.from("firmantes_certificado").update(fila).eq("id", id.data).eq("institucion_id", institucionId).select("id")
    : await supabase.from("firmantes_certificado").insert({ ...fila, institucion_id: institucionId }).select("id")
  if (error) return fallo(error)
  if (!data?.length) return NO_ENCONTRADO
  revalidar()
  return { ok: true, id: (data[0] as { id: string }).id }
}

export async function cambiarEstadoFirmante(firmanteId: unknown, activo: unknown): Promise<ResultadoCert> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const v = z.object({ id: uuid, activo: z.boolean() }).safeParse({ id: firmanteId, activo })
  if (!v.success) return NO_ENCONTRADO
  const supabase = await createClient()
  const { data, error } = await supabase.from("firmantes_certificado").update({ activo: v.data.activo, actualizado_en: new Date().toISOString() })
    .eq("id", v.data.id).eq("institucion_id", institucionId).select("id")
  if (error) return fallo(error)
  if (!data?.length) return NO_ENCONTRADO
  revalidar()
  return { ok: true, id: v.data.id }
}

/** Enlace firmado (120 s) a una imagen privada de la institución (fondo o firma) para el editor. */
export async function enlaceRecurso(ruta: unknown): Promise<ResultadoCert> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const r = z.string().max(200).safeParse(ruta)
  if (!r.success || !new RegExp(`^${institucionId}/(fondos|firmas)/${UUID_RE}\\.(png|jpg|pdf)$`).test(r.data)) return NO_ENCONTRADO
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(BUCKET_RECURSOS).createSignedUrl(r.data, VIGENCIA_ENLACE_CERTIFICADO)
  if (error || !data?.signedUrl) return { ok: false, gravedad: "error", mensaje: "No se pudo abrir el archivo." }
  return { ok: true, url: data.signedUrl }
}

// ---------------------------------------------------------------------------
// Certificación por curso
// ---------------------------------------------------------------------------

const certCursoSchema = z
  .object({
    modalidad: z.enum(MODALIDADES),
    importe: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Importe no válido.").or(z.literal("")),
    nota_minima: z.string().trim().regex(/^\d{1,2}(\.\d{1,2})?$/, "Nota no válida.").or(z.literal("")),
    horas_academicas: z.string().trim().regex(/^\d{1,5}$/, "Introduce un número entero de horas.").or(z.literal("")),
    requisitos_adicionales: z.string().trim().max(2000, "Máximo 2000 caracteres."),
    plantilla_id: uuid.nullable(),
    firmante_id: uuid.nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.modalidad === "costo_adicional" && !(Number(v.importe) > 0)) ctx.addIssue({ code: "custom", path: ["importe"], message: "Indica el importe del certificado." })
    if (v.nota_minima !== "" && Number(v.nota_minima) > 20) ctx.addIssue({ code: "custom", path: ["nota_minima"], message: "La nota máxima es 20." })
    if (v.horas_academicas !== "" && (Number(v.horas_academicas) < 1 || Number(v.horas_academicas) > 10000)) ctx.addIssue({ code: "custom", path: ["horas_academicas"], message: "Entre 1 y 10 000 horas." })
  })

export async function guardarCertificacionCurso(cursoId: unknown, datos: unknown): Promise<ResultadoCert> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const c = uuid.safeParse(cursoId)
  if (!c.success) return NO_ENCONTRADO
  const v = certCursoSchema.safeParse(datos)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: "Revisa la configuración del certificado.", campos: campos(v.error) }
  const supabase = await createClient()
  const { data: curso } = await supabase.from("cursos").select("id").eq("id", c.data).eq("institucion_id", institucionId).maybeSingle()
  if (!curso) return NO_ENCONTRADO
  const d = v.data
  const sin = d.modalidad === "sin_certificado"
  const fila = {
    curso_id: c.data,
    institucion_id: institucionId,
    modalidad: d.modalidad,
    importe: d.modalidad === "costo_adicional" ? Number(d.importe) : 0,
    nota_minima: sin || d.nota_minima === "" ? null : Number(d.nota_minima),
    horas_academicas: d.horas_academicas === "" ? null : Number(d.horas_academicas),
    requisitos_adicionales: sin || d.requisitos_adicionales === "" ? null : d.requisitos_adicionales,
    plantilla_id: sin ? null : d.plantilla_id,
    firmante_id: sin ? null : d.firmante_id,
    actualizado_en: new Date().toISOString(),
  }
  const { error } = await supabase.from("certificacion_curso").upsert(fila, { onConflict: "curso_id" })
  if (error) return fallo(error)
  revalidatePath(`/admin/cursos/${c.data}`)
  revalidatePath(`/cursos/${c.data}`)
  revalidar()
  return { ok: true, id: c.data }
}

// ---------------------------------------------------------------------------
// Emisión y PDF
// ---------------------------------------------------------------------------

async function generarYAdjuntar(supabase: Awaited<ReturnType<typeof createClient>>, institucionId: string, certificadoId: string): Promise<string | null> {
  const contenido = await leerContenido(supabase, institucionId, certificadoId)
  if (!contenido) return "No se encontró el contenido del certificado."
  let bytes: Uint8Array
  try {
    bytes = await pdfEmitido(contenido)
  } catch (e) {
    console.error("[certificados] pdf", e instanceof Error ? e.message : e)
    return "No se pudo generar el PDF."
  }
  const ruta = `${institucionId}/${certificadoId}.pdf`
  const subida = await supabase.storage.from(BUCKET_EMITIDOS).upload(ruta, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "0" })
  // Si ya existía (reintento), se reutiliza: los PDF emitidos son inmutables.
  if (subida.error && !/exists|duplicate/i.test(subida.error.message)) {
    console.error("[certificados] subir pdf", subida.error.message)
    return "No se pudo guardar el PDF."
  }
  const { error } = await supabase.rpc("adjuntar_pdf_certificado", { p_certificado: certificadoId, p_path: ruta })
  if (error && !/ya tiene su PDF/i.test(error.message)) {
    console.error("[certificados] adjuntar", error.code, error.message)
    return "No se pudo registrar el PDF."
  }
  return null
}

export async function emitirCertificado(datos: unknown): Promise<ResultadoCert> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const v = z.object({ matriculaId: uuid, plantillaId: uuid.nullable(), firmanteId: uuid.nullable(), confirmado: z.literal(true) }).safeParse(datos)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: "Confirma la emisión para continuar." }
  const supabase = await createClient()
  const { data: m } = await supabase.from("matriculas").select("id").eq("id", v.data.matriculaId).eq("institucion_id", institucionId).maybeSingle()
  if (!m) return NO_ENCONTRADO
  const { data, error } = await supabase.rpc("emitir_certificado", { p_matricula: v.data.matriculaId, p_plantilla: v.data.plantillaId, p_firmante: v.data.firmanteId })
  if (error) return fallo(error)
  const fila = (Array.isArray(data) ? data[0] : data) as { certificado_id: string; codigo: string } | null
  if (!fila) return { ok: false, gravedad: "error", mensaje: "No se pudo confirmar la emisión. Recarga la página." }
  const problema = await generarYAdjuntar(supabase, institucionId, fila.certificado_id)
  revalidar()
  revalidatePath(`/admin/matriculas/${v.data.matriculaId}`)
  return { ok: true, id: fila.certificado_id, codigo: fila.codigo, aviso: problema ? `${problema} El certificado quedó emitido; usa «Generar PDF» para reintentar.` : undefined }
}

export async function generarPdf(certificadoId: unknown): Promise<ResultadoCert> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = uuid.safeParse(certificadoId)
  if (!id.success) return NO_ENCONTRADO
  const supabase = await createClient()
  const problema = await generarYAdjuntar(supabase, institucionId, id.data)
  if (problema) return { ok: false, gravedad: "error", mensaje: problema }
  revalidar()
  return { ok: true, id: id.data }
}

export async function enlaceCertificado(certificadoId: unknown): Promise<ResultadoCert> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = uuid.safeParse(certificadoId)
  if (!id.success) return NO_ENCONTRADO
  const supabase = await createClient()
  const { data } = await supabase.from("certificados").select("archivo_url").eq("id", id.data).eq("institucion_id", institucionId).maybeSingle()
    .overrideTypes<{ archivo_url: string | null }, { merge: false }>()
  if (!data) return NO_ENCONTRADO
  if (!data.archivo_url) return { ok: false, gravedad: "advertencia", mensaje: "El PDF aún no se ha generado. Usa «Generar PDF»." }
  const { data: firmado, error } = await supabase.storage.from(BUCKET_EMITIDOS).createSignedUrl(data.archivo_url, VIGENCIA_ENLACE_CERTIFICADO, { download: true })
  if (error || !firmado?.signedUrl) return { ok: false, gravedad: "error", mensaje: "No se pudo abrir el PDF." }
  return { ok: true, url: firmado.signedUrl }
}

// ---------------------------------------------------------------------------
// Pagos de certificados (revisión manual, misma salvaguarda que los pagos)
// ---------------------------------------------------------------------------

export async function revisarPagoCertificado(datos: unknown): Promise<ResultadoCert> {
  if (!REVISION_PAGOS_HABILITADA) return { ok: false, gravedad: "advertencia", mensaje: MOTIVO_REVISION_DESHABILITADA }
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const v = z
    .object({ pagoId: uuid, aprobar: z.boolean(), observacion: z.string().trim().max(500), confirmado: z.literal(true) })
    .refine((x) => x.aprobar || x.observacion.length >= 5, { path: ["observacion"], message: "Indica el motivo del rechazo (mínimo 5 caracteres)." })
    .safeParse(datos)
  if (!v.success) return { ok: false, gravedad: "error", mensaje: v.error.issues[0]?.message ?? "Revisa la decisión." }
  const supabase = await createClient()
  const { data: p } = await supabase.from("pagos_certificado").select("id, estado").eq("id", v.data.pagoId).eq("institucion_id", institucionId).maybeSingle()
    .overrideTypes<{ id: string; estado: string }, { merge: false }>()
  if (!p) return NO_ENCONTRADO
  if (p.estado !== "pendiente") return { ok: false, gravedad: "advertencia", mensaje: "Este pago ya fue revisado. Recarga la página." }
  const { error } = await supabase.rpc("revisar_pago_certificado", { p_pago: v.data.pagoId, p_aprobar: v.data.aprobar, p_observacion: v.data.observacion || null })
  if (error) return fallo(error)
  revalidar()
  return { ok: true, id: v.data.pagoId }
}

export async function enlaceComprobanteCertificado(pagoId: unknown): Promise<{ ok: true; url: string; tipo: "imagen" | "pdf" | "archivo"; vigenciaSegundos: number } | Fallo> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = uuid.safeParse(pagoId)
  if (!id.success) return NO_ENCONTRADO
  const supabase = await createClient()
  const { data } = await supabase.from("pagos_certificado").select("comprobante_url, estudiante_id").eq("id", id.data).eq("institucion_id", institucionId).maybeSingle()
    .overrideTypes<{ comprobante_url: string; estudiante_id: string }, { merge: false }>()
  if (!data) return NO_ENCONTRADO
  if (data.comprobante_url.includes("..") || !data.comprobante_url.startsWith(`${data.estudiante_id}/`)) return { ok: false, gravedad: "advertencia", mensaje: "El comprobante no se puede abrir." }
  const { data: firmado, error } = await supabase.storage.from(BUCKET_COMPROBANTES).createSignedUrl(data.comprobante_url, VIGENCIA_ENLACE_COMPROBANTE)
  if (error || !firmado?.signedUrl) return { ok: false, gravedad: "error", mensaje: "No se pudo abrir el comprobante." }
  const ext = data.comprobante_url.split(".").pop()?.toLowerCase() ?? ""
  return { ok: true, url: firmado.signedUrl, tipo: ext === "pdf" ? "pdf" : ext === "png" || ext === "jpg" ? "imagen" : "archivo", vigenciaSegundos: VIGENCIA_ENLACE_COMPROBANTE }
}

/** Traduce los mensajes de las funciones de certificados_v5. */
function fallo(error: { code?: string; message: string }): Fallo {
  if (esErrorDeRed(error)) return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  if (tablaInexistente(error) || error.code === "PGRST202") return NO_DISPONIBLE
  console.error("[certificados]", error.code, error.message)
  const m = error.message
  const aviso = (mensaje: string): Fallo => ({ ok: false, gravedad: "advertencia", mensaje })
  if (/ya fue emitido|duplicate key.*matricula/i.test(m) || error.code === "23505") return aviso("El certificado de esta matrícula ya fue emitido.")
  if (/activa y aprobada/i.test(m)) return aviso("Solo se emite certificado a una matrícula activa y aprobada.")
  if (/no ofrece certificado/i.test(m)) return aviso("El curso no ofrece certificado. Configúralo en el detalle del curso.")
  if (/nota mínima/i.test(m)) return aviso("El estudiante no alcanza la nota mínima de certificación del curso.")
  if (/pago del certificado no está verificado/i.test(m)) return aviso("El pago del certificado aún no está verificado.")
  if (/Plantilla no disponible/i.test(m)) return aviso("La plantilla elegida no está disponible (desactivada o eliminada).")
  if (/Firmante no disponible/i.test(m)) return aviso("El firmante elegido no está disponible.")
  if (/ya fue revisado/i.test(m)) return aviso("Este pago ya fue revisado por otra sesión. Recarga la página.")
  if (/Monto incorrecto/i.test(m)) return aviso("El monto no coincide con el importe del certificado.")
  if (/ya no está pendiente/i.test(m)) return aviso("La solicitud del certificado ya no está pendiente.")
  if (/motivo del rechazo/i.test(m)) return aviso("Indica el motivo del rechazo.")
  if (error.code === "23514") return aviso("Algún dato no cumple las reglas (importe, nota o texto demasiado largo).")
  if (error.code === "42501" || /inaccesible|row-level security/i.test(m)) return SIN_PERMISO
  return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación. Inténtalo de nuevo en unos minutos." }
}

