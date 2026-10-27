import type { Modalidad } from "@/lib/certificados/config"
import type { BasePlantilla } from "@/lib/certificados/diseno"
import { calcular } from "@/lib/evaluaciones/calculo"
import { obtenerMatriculas, type MatriculaAdmin } from "@/lib/matriculas/datos"
import { leerTodo, type EstadoPago } from "@/lib/pagos/datos"
import { createClient } from "@/lib/supabase/server"

/**
 * Lectura de certificados, plantillas, firmantes y certificación por curso de
 * la institución del administrador (SOLO servidor, RLS de certificados_v5).
 * Si la migración no está aplicada, las tablas no existen: se informa con
 * { disponible: false } en lugar de fallar.
 */

type Cliente = Awaited<ReturnType<typeof createClient>>

export type PlantillaCertificado = {
  id: string
  nombre: string
  base: BasePlantilla
  fondo_path: string | null
  fondo_tipo: "image/png" | "image/jpeg" | "application/pdf" | null
  diseno: unknown
  predeterminada: boolean
  activo: boolean
  actualizado_en: string
}
export type Firmante = { id: string; nombre: string; cargo: string; firma_path: string | null; activo: boolean; actualizado_en: string }
export type CertificacionCurso = {
  curso_id: string
  modalidad: Modalidad
  importe: number
  nota_minima: number | null
  horas_academicas: number | null
  requisitos_adicionales: string | null
  plantilla_id: string | null
  firmante_id: string | null
}

export const tablaInexistente = (e: { code?: string } | null | undefined) => e?.code === "PGRST205" || e?.code === "42P01"

const COL_PLANTILLA = "id, nombre, base, fondo_path, fondo_tipo, diseno, predeterminada, activo, actualizado_en"
const COL_FIRMANTE = "id, nombre, cargo, firma_path, activo, actualizado_en"
const COL_CERT_CURSO = "curso_id, modalidad, importe, nota_minima, horas_academicas, requisitos_adicionales, plantilla_id, firmante_id"

const normalizarCert = (c: CertificacionCurso): CertificacionCurso => ({
  ...c,
  importe: Number(c.importe),
  nota_minima: c.nota_minima === null ? null : Number(c.nota_minima),
})

export async function obtenerRecursosCertificado(institucionId: string): Promise<
  { disponible: false } | { disponible: true; plantillas: PlantillaCertificado[]; firmantes: Firmante[] }
> {
  const supabase = await createClient()
  const [p, f] = await Promise.all([
    supabase.from("plantillas_certificado").select(COL_PLANTILLA).eq("institucion_id", institucionId).order("creado_en").overrideTypes<PlantillaCertificado[], { merge: false }>(),
    supabase.from("firmantes_certificado").select(COL_FIRMANTE).eq("institucion_id", institucionId).order("creado_en").overrideTypes<Firmante[], { merge: false }>(),
  ])
  if (tablaInexistente(p.error) || tablaInexistente(f.error)) return { disponible: false }
  if (p.error || f.error) {
    console.error("[certificados] recursos", p.error?.code ?? f.error?.code, p.error?.message ?? f.error?.message)
    throw new Error("No se pudieron cargar las plantillas y firmantes.")
  }
  return { disponible: true, plantillas: p.data ?? [], firmantes: f.data ?? [] }
}

export async function obtenerPlantilla(institucionId: string, id: string): Promise<PlantillaCertificado | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("plantillas_certificado").select(COL_PLANTILLA).eq("institucion_id", institucionId).eq("id", id).maybeSingle()
    .overrideTypes<PlantillaCertificado, { merge: false }>()
  if (error) {
    if (tablaInexistente(error)) return null
    throw new Error(error.message)
  }
  return data
}

export async function obtenerCertificacionCurso(institucionId: string, cursoId: string): Promise<
  { disponible: false } | { disponible: true; config: CertificacionCurso | null; plantillas: PlantillaCertificado[]; firmantes: Firmante[] }
> {
  const recursos = await obtenerRecursosCertificado(institucionId).catch(() => ({ disponible: false as const }))
  if (!recursos.disponible) return { disponible: false }
  const supabase = await createClient()
  const { data, error } = await supabase.from("certificacion_curso").select(COL_CERT_CURSO).eq("institucion_id", institucionId).eq("curso_id", cursoId).maybeSingle()
    .overrideTypes<CertificacionCurso, { merge: false }>()
  if (error) return { disponible: false }
  return { disponible: true, config: data ? normalizarCert(data) : null, plantillas: recursos.plantillas, firmantes: recursos.firmantes }
}

// ---------------------------------------------------------------------------
// Emitidos y elegibles
// ---------------------------------------------------------------------------

export type CertificadoEmitido = {
  id: string
  codigo: string
  fecha_emision: string
  tienePdf: boolean
  matricula: MatriculaAdmin | null
}

type FilaCertificado = { id: string; matricula_id: string; codigo: string; fecha_emision: string; archivo_url: string | null }

export async function obtenerEmitidos(institucionId: string): Promise<CertificadoEmitido[]> {
  const supabase = await createClient()
  const [filas, matriculas] = await Promise.all([
    leerTodo<FilaCertificado>((d, h) => supabase.from("certificados").select("id, matricula_id, codigo, fecha_emision, archivo_url").eq("institucion_id", institucionId).order("fecha_emision", { ascending: false }).range(d, h)),
    obtenerMatriculas(institucionId),
  ])
  const porId = new Map(matriculas.map((m) => [m.id, m]))
  return filas.map((c) => ({ id: c.id, codigo: c.codigo, fecha_emision: c.fecha_emision, tienePdf: !!c.archivo_url, matricula: porId.get(c.matricula_id) ?? null }))
}

export type Requisito = { clave: string; texto: string; ok: boolean }
export type Elegible = {
  matricula: MatriculaAdmin
  certificacion: CertificacionCurso | null
  promedio: number | null
  pago: "no_aplica" | "sin_solicitud" | "pendiente" | "en_revision" | "pagada" | "anulada"
  requisitos: Requisito[]
  puedeEmitir: boolean
}

/** Matrículas activas y aprobadas SIN certificado, con el detalle de requisitos. */
export async function obtenerElegibles(institucionId: string): Promise<{ disponible: false } | { disponible: true; elegibles: Elegible[] }> {
  const supabase = await createClient()
  const conf = await leerTodo<CertificacionCurso>((d, h) => supabase.from("certificacion_curso").select(COL_CERT_CURSO).eq("institucion_id", institucionId).order("curso_id").range(d, h))
    .catch((e) => (tablaInexistente(e) ? null : Promise.reject(e)))
  if (conf === null) return { disponible: false }

  const [matriculas, emitidos, solicitudes, pagos] = await Promise.all([
    obtenerMatriculas(institucionId),
    leerTodo<{ matricula_id: string }>((d, h) => supabase.from("certificados").select("matricula_id").eq("institucion_id", institucionId).order("id").range(d, h)),
    leerTodo<{ id: string; matricula_id: string; estado: string }>((d, h) => supabase.from("solicitudes_certificado").select("id, matricula_id, estado").eq("institucion_id", institucionId).order("id").range(d, h)),
    leerTodo<{ solicitud_id: string; estado: string }>((d, h) => supabase.from("pagos_certificado").select("solicitud_id, estado").eq("institucion_id", institucionId).eq("estado", "pendiente").order("id").range(d, h)),
  ])
  const yaEmitidas = new Set(emitidos.map((e) => e.matricula_id))
  const aprobadas = matriculas.filter((m) => m.estado === "activa" && m.estado_final === "aprobado" && !yaEmitidas.has(m.id))
  if (aprobadas.length === 0) return { disponible: true, elegibles: [] }

  const grupoIds = [...new Set(aprobadas.map((m) => m.grupo?.id).filter((x): x is string => !!x))]
  const [evals, notas] = await Promise.all([
    leerTodo<{ id: string; grupo_id: string; peso: number }>((d, h) => supabase.from("evaluaciones").select("id, grupo_id, peso").eq("institucion_id", institucionId).in("grupo_id", grupoIds).order("id").range(d, h)),
    leerTodo<{ evaluacion_id: string; matricula_id: string; nota: number }>((d, h) => supabase.from("calificaciones").select("evaluacion_id, matricula_id, nota").eq("institucion_id", institucionId).in("grupo_id", grupoIds).order("id").range(d, h)),
  ])
  const porCurso = new Map(conf.map((c) => [c.curso_id, normalizarCert(c)]))
  const solPorMat = new Map(solicitudes.map((s) => [s.matricula_id, s]))
  const enRevision = new Set(pagos.map((p) => p.solicitud_id))

  const elegibles = aprobadas.map((m): Elegible => {
    const cc = m.curso ? (porCurso.get(m.curso.id) ?? null) : null
    const ev = evals.filter((e) => e.grupo_id === m.grupo?.id).map((e) => ({ id: e.id, peso: Number(e.peso) }))
    const promedio = calcular(ev, notas.filter((n) => n.matricula_id === m.id).map((n) => ({ evaluacion_id: n.evaluacion_id, nota: Number(n.nota) }))).promedio
    const s = solPorMat.get(m.id)
    const pago: Elegible["pago"] =
      cc?.modalidad !== "costo_adicional" ? "no_aplica" : !s ? "sin_solicitud" : s.estado === "pagada" ? "pagada" : s.estado === "anulada" ? "anulada" : enRevision.has(s.id) ? "en_revision" : "pendiente"
    const ofrece = !!cc && cc.modalidad !== "sin_certificado"
    const requisitos: Requisito[] = [
      { clave: "aprobado", texto: "Matrícula activa con resultado aprobado", ok: true },
      { clave: "ofrece", texto: ofrece ? "El curso ofrece certificado" : "El curso no ofrece certificado (configúralo en el curso)", ok: ofrece },
      ...(cc?.nota_minima !== null && cc?.nota_minima !== undefined
        ? [{ clave: "nota", texto: `Nota mínima ${cc.nota_minima.toFixed(2)} (promedio: ${promedio === null ? "sin calcular" : promedio.toFixed(2)})`, ok: promedio !== null && promedio >= cc.nota_minima }]
        : []),
      ...(cc?.modalidad === "costo_adicional"
        ? [{ clave: "pago", texto: pago === "pagada" ? "Pago del certificado verificado" : pago === "en_revision" ? "Pago del certificado en revisión" : "Pago del certificado pendiente", ok: pago === "pagada" }]
        : []),
    ]
    return { matricula: m, certificacion: cc, promedio, pago, requisitos, puedeEmitir: requisitos.every((r) => r.ok) }
  })
  return { disponible: true, elegibles }
}

// ---------------------------------------------------------------------------
// Pagos de certificados
// ---------------------------------------------------------------------------

export type PagoCertificado = {
  id: string
  monto: number
  metodo: string
  referencia: string
  estado: EstadoPago
  observacion: string | null
  fecha_pago: string
  verificado_en: string | null
  importe: number
  solicitudEstado: string
  matricula: MatriculaAdmin | null
}

export async function obtenerPagosCertificado(institucionId: string): Promise<{ disponible: false } | { disponible: true; pagos: PagoCertificado[] }> {
  const supabase = await createClient()
  type Fila = { id: string; solicitud_id: string; monto: number; metodo: string; referencia_operacion: string; estado: EstadoPago; observacion: string | null; fecha_pago: string; verificado_en: string | null }
  const filas = await leerTodo<Fila>((d, h) =>
    supabase.from("pagos_certificado").select("id, solicitud_id, monto, metodo, referencia_operacion, estado, observacion, fecha_pago, verificado_en").eq("institucion_id", institucionId).order("fecha_pago", { ascending: false }).range(d, h)
  ).catch((e) => (tablaInexistente(e) ? null : Promise.reject(e)))
  if (filas === null) return { disponible: false }
  if (filas.length === 0) return { disponible: true, pagos: [] }
  const [sols, matriculas] = await Promise.all([
    leerTodo<{ id: string; matricula_id: string; importe: number; estado: string }>((d, h) => supabase.from("solicitudes_certificado").select("id, matricula_id, importe, estado").eq("institucion_id", institucionId).order("id").range(d, h)),
    obtenerMatriculas(institucionId),
  ])
  const sol = new Map(sols.map((s) => [s.id, s]))
  const mat = new Map(matriculas.map((m) => [m.id, m]))
  return {
    disponible: true,
    pagos: filas.map((p) => {
      const s = sol.get(p.solicitud_id)
      return {
        id: p.id, monto: Number(p.monto), metodo: p.metodo, referencia: p.referencia_operacion, estado: p.estado,
        observacion: p.observacion, fecha_pago: p.fecha_pago, verificado_en: p.verificado_en,
        importe: Number(s?.importe ?? 0), solicitudEstado: s?.estado ?? "desconocido", matricula: s ? (mat.get(s.matricula_id) ?? null) : null,
      }
    }),
  }
}

/** Contenido fijo de un certificado emitido (para regenerar su PDF). */
export type ContenidoCertificado = {
  certificado_id: string
  datos: Record<string, unknown>
  diseno: unknown
  plantilla_base: BasePlantilla
  fondo_path: string | null
  fondo_tipo: string | null
  firma_path: string | null
}

export async function leerContenido(supabase: Cliente, institucionId: string, certificadoId: string): Promise<ContenidoCertificado | null> {
  const { data } = await supabase.from("certificados_contenido").select("certificado_id, datos, diseno, plantilla_base, fondo_path, fondo_tipo, firma_path")
    .eq("institucion_id", institucionId).eq("certificado_id", certificadoId).maybeSingle().overrideTypes<ContenidoCertificado, { merge: false }>()
  return data ?? null
}
