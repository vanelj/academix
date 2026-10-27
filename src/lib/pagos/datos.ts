import { createClient } from "@/lib/supabase/server"
import type { EstadoMatricula, EstadoSolicitud } from "@/lib/estudiantes/datos"

/**
 * Pagos y cuotas de la institución del administrador (SOLO servidor, solo lectura).
 * Todo con la sesión del administrador (nunca la clave secreta):
 * - pagos: RLS "ver pagos" → admin de la institución del pago.
 * - cuotas: RLS "ver cuotas propias o institucionales".
 * - solicitudes_inscripcion, matriculas, grupos, cursos, perfiles: RLS de su institución.
 * - Nombres de estudiantes: RPC estudiantes_de_mi_institucion().
 * Además, cada consulta filtra por institucion_id. La ruta del comprobante
 * nunca sale del servidor: el navegador solo recibe si existe o no.
 *
 * Importes en soles (PEN), única moneda de V5. Saldo de una cuota = importe −
 * pagos aprobados ('pagado'), igual que presentar_comprobante y revisar_pago.
 */

export type EstadoPago = "pendiente" | "pagado" | "rechazado"
export type EstadoCuota = "pendiente" | "parcial" | "pagada" | "anulada"
/** A qué corresponde el pago en V5 (exactamente uno; 'matricula' = pago heredado de V4). */
export type DestinoPago = "solicitud" | "cuota" | "matricula" | "desconocido"

type GrupoRef = { id: string; codigo: string; estado: string; fecha_inicio: string; fecha_fin: string }
type CursoRef = { id: string; nombre: string }
type EstudianteRef = { id: string | null; nombre: string | null }

export type PagoAdmin = {
  id: string
  monto: number
  metodo: string
  estado: EstadoPago
  fecha_pago: string
  referencia_operacion: string | null
  observacion: string | null
  verificado_en: string | null
  tieneComprobante: boolean
  destino: DestinoPago
  concepto: string
  estudiante: EstudianteRef
  grupo: GrupoRef | null
  curso: CursoRef | null
  solicitud: { id: string; tipo: "reserva" | "matricula"; estado: EstadoSolicitud; importe_esperado: number } | null
  cuota: { id: string; numero: number; concepto: string; importe: number; vencimiento: string; estado: EstadoCuota } | null
  matricula: { id: string; estado: EstadoMatricula } | null
}

export type PagoDetalle = PagoAdmin & {
  verificadoPor: string | null
  /** Comprobante en el bucket privado de V5, en formato heredado (URL) o ausente. */
  comprobante: "privado" | "anterior" | null
  /**
   * Importe contra el que se valida el pago: el importe de la solicitud o el
   * saldo de la cuota sin contar este pago. null si no aplica.
   */
  esperado: number | null
  /** Pagos aprobados de la cuota, sin contar este pago. */
  aplicadoOtros: number | null
}

export type CuotaAdmin = {
  id: string
  numero: number
  concepto: string
  importe: number
  vencimiento: string
  estado: EstadoCuota
  /** Suma de pagos aprobados. */
  aplicado: number
  /** importe − aplicado (nunca negativo). */
  saldo: number
  /** Suma de comprobantes pendientes de revisión. */
  enRevision: number
  /** Pendiente o parcial, con vencimiento pasado y matrícula activa. */
  vencida: boolean
  matricula: { id: string; estado: EstadoMatricula } | null
  estudiante: EstudianteRef
  grupo: GrupoRef | null
  curso: CursoRef | null
}

export type CuotaDetalle = CuotaAdmin & { pagos: PagoAdmin[] }

type ErrorPg = { code?: string; message: string }
type Respuesta = PromiseLike<{ data: unknown; error: ErrorPg | null }>
type Cliente = Awaited<ReturnType<typeof createClient>>

type FilaPago = {
  id: string
  monto: number | string
  metodo: string
  fecha_pago: string
  estado: EstadoPago
  comprobante_url: string | null
  referencia_operacion: string | null
  observacion: string | null
  verificado_por: string | null
  verificado_en: string | null
  solicitud_id: string | null
  cuota_id: string | null
  matricula_id: string | null
  estudiante_id: string | null
}
type FilaSolicitud = { id: string; tipo: "reserva" | "matricula"; estado: EstadoSolicitud; importe_esperado: number | string; grupo_id: string; estudiante_id: string; matricula_id: string | null }
type FilaCuota = { id: string; numero: number; concepto: string; importe: number | string; vencimiento: string; estado: EstadoCuota; matricula_id: string }
type FilaMatricula = { id: string; grupo_id: string; estudiante_id: string; estado: EstadoMatricula }
type FilaGrupo = GrupoRef & { curso_id: string }

const COLUMNAS_PAGO =
  "id, monto, metodo, fecha_pago, estado, comprobante_url, referencia_operacion, observacion, verificado_por, verificado_en, solicitud_id, cuota_id, matricula_id, estudiante_id"
const COLUMNAS_CUOTA = "id, numero, concepto, importe, vencimiento, estado, matricula_id"

const LOTE = 1000
const LOTE_IDS = 100

/** Lee todas las filas en lotes (PostgREST limita cada respuesta). Lanza el error de la BD. */
export async function leerTodo<T>(armar: (desde: number, hasta: number) => Respuesta): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await armar(desde, desde + LOTE - 1)
    if (error) throw error
    const lote = (data ?? []) as T[]
    filas.push(...lote)
    if (lote.length < LOTE) return filas
  }
}

/** Filas de la institución cuyo `campo` está en `ids` (por tandas, para no exceder la URL). */
async function porIds<T>(supabase: Cliente, tabla: string, columnas: string, institucionId: string, campo: string, ids: Iterable<string | null>) {
  const unicos = [...new Set([...ids].filter((x): x is string => !!x))]
  const filas: T[] = []
  for (let i = 0; i < unicos.length; i += LOTE_IDS) {
    const tanda = unicos.slice(i, i + LOTE_IDS)
    filas.push(
      ...(await leerTodo<T>((d, h) =>
        supabase.from(tabla).select(columnas).eq("institucion_id", institucionId).in(campo, tanda).order("id").range(d, h)
      ))
    )
  }
  return filas
}

async function nombresEstudiantes(supabase: Cliente) {
  const { data, error } = await supabase.rpc("estudiantes_de_mi_institucion")
  if (error) console.error("[pagos] estudiantes_de_mi_institucion", error.code, error.message)
  return new Map(
    ((data ?? []) as { estudiante_id: string; nombres: string; apellidos: string }[]).map((n) => [n.estudiante_id, `${n.apellidos}, ${n.nombres}`])
  )
}

/** Grupos y cursos de la institución para un conjunto de grupos. */
async function gruposYCursos(supabase: Cliente, institucionId: string, grupoIds: Iterable<string | null>) {
  const grupos = await porIds<FilaGrupo>(supabase, "grupos", "id, codigo, estado, fecha_inicio, fecha_fin, curso_id", institucionId, "id", grupoIds)
  const cursos = await porIds<CursoRef>(supabase, "cursos", "id, nombre", institucionId, "id", grupos.map((g) => g.curso_id))
  const porCurso = new Map(cursos.map((c) => [c.id, c]))
  return new Map(
    grupos.map((g) => [
      g.id,
      {
        grupo: { id: g.id, codigo: g.codigo, estado: g.estado, fecha_inicio: g.fecha_inicio, fecha_fin: g.fecha_fin },
        curso: porCurso.get(g.curso_id) ?? null,
      },
    ])
  )
}

export const ETIQUETA_TIPO_PAGO_SOLICITUD = { reserva: "Reserva de vacante", matricula: "Matrícula (pago inicial)" } as const

function conceptoPago(destino: DestinoPago, s: FilaSolicitud | undefined, q: FilaCuota | undefined) {
  if (destino === "solicitud" && s) return ETIQUETA_TIPO_PAGO_SOLICITUD[s.tipo]
  if (destino === "cuota" && q) return `Cuota ${q.numero} · ${q.concepto}`
  if (destino === "matricula") return "Pago de matrícula (versión anterior)"
  return "Concepto no disponible"
}

async function completarPagos(supabase: Cliente, institucionId: string, filas: FilaPago[]): Promise<PagoAdmin[]> {
  const [solicitudes, cuotas] = await Promise.all([
    porIds<FilaSolicitud>(supabase, "solicitudes_inscripcion", "id, tipo, estado, importe_esperado, grupo_id, estudiante_id, matricula_id", institucionId, "id", filas.map((f) => f.solicitud_id)),
    porIds<FilaCuota>(supabase, "cuotas", COLUMNAS_CUOTA, institucionId, "id", filas.map((f) => f.cuota_id)),
  ])
  const matriculas = await porIds<FilaMatricula>(supabase, "matriculas", "id, grupo_id, estudiante_id, estado", institucionId, "id", [
    ...filas.map((f) => f.matricula_id),
    ...cuotas.map((q) => q.matricula_id),
    ...solicitudes.map((s) => s.matricula_id),
  ])
  const [contexto, nombres] = await Promise.all([
    gruposYCursos(supabase, institucionId, [...solicitudes.map((s) => s.grupo_id), ...matriculas.map((m) => m.grupo_id)]),
    filas.length ? nombresEstudiantes(supabase) : Promise.resolve(new Map<string, string>()),
  ])

  const porSolicitud = new Map(solicitudes.map((s) => [s.id, s]))
  const porCuota = new Map(cuotas.map((q) => [q.id, q]))
  const porMatricula = new Map(matriculas.map((m) => [m.id, m]))

  return filas.map((f): PagoAdmin => {
    const destino: DestinoPago = f.solicitud_id ? "solicitud" : f.cuota_id ? "cuota" : f.matricula_id ? "matricula" : "desconocido"
    const s = f.solicitud_id ? porSolicitud.get(f.solicitud_id) : undefined
    const q = f.cuota_id ? porCuota.get(f.cuota_id) : undefined
    const matriculaId = q?.matricula_id ?? f.matricula_id ?? s?.matricula_id ?? null
    const m = matriculaId ? porMatricula.get(matriculaId) : undefined
    const grupoId = s?.grupo_id ?? m?.grupo_id ?? null
    const ctx = grupoId ? contexto.get(grupoId) : undefined
    const estudianteId = f.estudiante_id ?? s?.estudiante_id ?? m?.estudiante_id ?? null
    return {
      id: f.id,
      monto: Number(f.monto),
      metodo: f.metodo,
      estado: f.estado,
      fecha_pago: f.fecha_pago,
      referencia_operacion: f.referencia_operacion,
      observacion: f.observacion,
      verificado_en: f.verificado_en,
      tieneComprobante: !!f.comprobante_url?.trim(),
      destino,
      concepto: conceptoPago(destino, s, q),
      estudiante: { id: estudianteId, nombre: estudianteId ? (nombres.get(estudianteId) ?? null) : null },
      grupo: ctx?.grupo ?? null,
      curso: ctx?.curso ?? null,
      solicitud: s ? { id: s.id, tipo: s.tipo, estado: s.estado, importe_esperado: Number(s.importe_esperado) } : null,
      cuota: q ? { id: q.id, numero: q.numero, concepto: q.concepto, importe: Number(q.importe), vencimiento: q.vencimiento, estado: q.estado } : null,
      matricula: m ? { id: m.id, estado: m.estado } : null,
    }
  })
}

export async function obtenerPagos(institucionId: string): Promise<PagoAdmin[]> {
  const supabase = await createClient()
  try {
    const filas = await leerTodo<FilaPago>((d, h) =>
      supabase.from("pagos").select(COLUMNAS_PAGO).eq("institucion_id", institucionId)
        .order("fecha_pago", { ascending: false }).order("id").range(d, h)
    )
    return await completarPagos(supabase, institucionId, filas)
  } catch (e) {
    const error = e as ErrorPg
    console.error("[pagos] lectura", error.code, error.message)
    throw new Error("No se pudieron cargar los pagos.")
  }
}

/** Un pago de la institución; null si no existe o es de otra institución. */
export async function obtenerPago(institucionId: string, pagoId: string): Promise<PagoDetalle | null> {
  const supabase = await createClient()
  try {
    const { data: fila, error } = await supabase.from("pagos").select(COLUMNAS_PAGO)
      .eq("institucion_id", institucionId).eq("id", pagoId).maybeSingle()
      .overrideTypes<FilaPago, { merge: false }>()
    if (error) throw error
    if (!fila) return null

    const [[base], verificador, aprobadosCuota] = await Promise.all([
      completarPagos(supabase, institucionId, [fila]),
      fila.verificado_por
        ? supabase.from("perfiles").select("nombres, apellidos").eq("institucion_id", institucionId).eq("id", fila.verificado_por).maybeSingle()
            .overrideTypes<{ nombres: string; apellidos: string }, { merge: false }>()
        : Promise.resolve({ data: null, error: null }),
      fila.cuota_id
        ? porIds<{ id: string; monto: number | string; estado: EstadoPago }>(supabase, "pagos", "id, monto, estado", institucionId, "cuota_id", [fila.cuota_id])
        : Promise.resolve([]),
    ])
    if (verificador.error) console.error("[pagos] verificador", verificador.error.code, verificador.error.message)

    const aplicadoOtros = fila.cuota_id
      ? aprobadosCuota.filter((p) => p.estado === "pagado" && p.id !== fila.id).reduce((t, p) => t + Number(p.monto), 0)
      : null
    const url = fila.comprobante_url?.trim() ?? ""
    return {
      ...base,
      verificadoPor: verificador.data
        ? `${verificador.data.nombres} ${verificador.data.apellidos}`
        : fila.verificado_por ? "Administrador de la institución" : null,
      comprobante: url === "" ? null : /^https?:\/\//i.test(url) ? "anterior" : "privado",
      esperado: base.solicitud ? base.solicitud.importe_esperado : base.cuota && aplicadoOtros !== null ? Math.max(0, base.cuota.importe - aplicadoOtros) : null,
      aplicadoOtros,
    }
  } catch (e) {
    const error = e as ErrorPg
    console.error("[pagos] detalle", error.code, error.message)
    throw new Error("No se pudo cargar el pago.")
  }
}

/** Fecha de hoy en Lima (AAAA-MM-DD), para comparar vencimientos de tipo date. */
export function hoyEnLima() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

async function completarCuotas(supabase: Cliente, institucionId: string, filas: FilaCuota[]): Promise<CuotaAdmin[]> {
  const [matriculas, pagos] = await Promise.all([
    porIds<FilaMatricula>(supabase, "matriculas", "id, grupo_id, estudiante_id, estado", institucionId, "id", filas.map((q) => q.matricula_id)),
    porIds<{ cuota_id: string; monto: number | string; estado: EstadoPago }>(supabase, "pagos", "id, cuota_id, monto, estado", institucionId, "cuota_id", filas.map((q) => q.id)),
  ])
  const [contexto, nombres] = await Promise.all([
    gruposYCursos(supabase, institucionId, matriculas.map((m) => m.grupo_id)),
    filas.length ? nombresEstudiantes(supabase) : Promise.resolve(new Map<string, string>()),
  ])
  const porMatricula = new Map(matriculas.map((m) => [m.id, m]))
  const suma = (cuotaId: string, estado: EstadoPago) =>
    pagos.filter((p) => p.cuota_id === cuotaId && p.estado === estado).reduce((t, p) => t + Number(p.monto), 0)
  const hoy = hoyEnLima()

  return filas.map((q): CuotaAdmin => {
    const m = porMatricula.get(q.matricula_id)
    const ctx = m ? contexto.get(m.grupo_id) : undefined
    const importe = Number(q.importe)
    const aplicado = suma(q.id, "pagado")
    return {
      id: q.id,
      numero: q.numero,
      concepto: q.concepto,
      importe,
      vencimiento: q.vencimiento,
      estado: q.estado,
      aplicado,
      saldo: Math.max(0, Math.round((importe - aplicado) * 100) / 100),
      enRevision: suma(q.id, "pendiente"),
      vencida: (q.estado === "pendiente" || q.estado === "parcial") && q.vencimiento < hoy && m?.estado === "activa",
      matricula: m ? { id: m.id, estado: m.estado } : null,
      estudiante: { id: m?.estudiante_id ?? null, nombre: m ? (nombres.get(m.estudiante_id) ?? null) : null },
      grupo: ctx?.grupo ?? null,
      curso: ctx?.curso ?? null,
    }
  })
}

export async function obtenerCuotas(institucionId: string): Promise<CuotaAdmin[]> {
  const supabase = await createClient()
  try {
    const filas = await leerTodo<FilaCuota>((d, h) =>
      supabase.from("cuotas").select(COLUMNAS_CUOTA).eq("institucion_id", institucionId)
        .order("vencimiento").order("id").range(d, h)
    )
    return await completarCuotas(supabase, institucionId, filas)
  } catch (e) {
    const error = e as ErrorPg
    console.error("[cuotas] lectura", error.code, error.message)
    throw new Error("No se pudieron cargar las cuotas.")
  }
}

/** Una cuota de la institución con sus pagos; null si no existe o es de otra institución. */
export async function obtenerCuota(institucionId: string, cuotaId: string): Promise<CuotaDetalle | null> {
  const supabase = await createClient()
  try {
    const { data: fila, error } = await supabase.from("cuotas").select(COLUMNAS_CUOTA)
      .eq("institucion_id", institucionId).eq("id", cuotaId).maybeSingle()
      .overrideTypes<FilaCuota, { merge: false }>()
    if (error) throw error
    if (!fila) return null
    const [[base], filasPagos] = await Promise.all([
      completarCuotas(supabase, institucionId, [fila]),
      leerTodo<FilaPago>((d, h) =>
        supabase.from("pagos").select(COLUMNAS_PAGO).eq("institucion_id", institucionId).eq("cuota_id", cuotaId)
          .order("fecha_pago", { ascending: false }).order("id").range(d, h)
      ),
    ])
    return { ...base, pagos: await completarPagos(supabase, institucionId, filasPagos) }
  } catch (e) {
    const error = e as ErrorPg
    console.error("[cuotas] detalle", error.code, error.message)
    throw new Error("No se pudo cargar la cuota.")
  }
}
