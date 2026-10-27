import { obtenerMisSolicitudes, type MiSolicitud } from "@/lib/inscripcion/datos"
import type { EstadoCuota, EstadoPago } from "@/lib/pagos/datos"
import { hoyEnLima } from "@/lib/pagos/datos"
import { obtenerMediosCobro, type LecturaMedios } from "@/lib/pagos/medios"
import { createClient } from "@/lib/supabase/server"

/**
 * Estado de cuenta del ESTUDIANTE (SOLO servidor), con su propia sesión.
 *
 * Importes y estados salen de las tablas con la RLS de V5 (solicitudes,
 * matrículas, cuotas y pagos propios). Los nombres de curso, grupo e
 * institución de las cuotas salen de mis_cuotas() (migración medios_cobro_v5);
 * sin ella se usan las vistas públicas oferta_*, que solo muestran grupos
 * programados o abiertos (en un grupo en curso el nombre puede faltar).
 *
 * Saldo de una cuota = importe − suma de pagos 'pagado' (igual que V5).
 */

type Cliente = Awaited<ReturnType<typeof createClient>>

export type CuotaEstudiante = {
  id: string
  matriculaId: string
  institucionId: string
  institucion: string | null
  curso: string | null
  grupo: string | null
  numero: number
  concepto: string
  importe: number
  aplicado: number
  saldo: number
  vencimiento: string
  estado: EstadoCuota
  matriculaActiva: boolean
  enRevision: boolean
  vencida: boolean
}

export type PagoEstudiante = {
  id: string
  fecha: string
  monto: number
  metodo: string
  referencia: string | null
  estado: EstadoPago
  observacion: string | null
  verificadoEn: string | null
  solicitudId: string | null
  cuotaId: string | null
  concepto: string
  institucion: string | null
  curso: string | null
}

export type EstadoCuenta = {
  solicitudes: MiSolicitud[]
  cuotas: CuotaEstudiante[]
  pagos: PagoEstudiante[]
  /** false = falta mis_cuotas(): algunos nombres pueden no mostrarse. */
  nombresCompletos: boolean
}

const num = (v: unknown) => Number(v)
const redondear = (v: number) => Math.round(v * 100) / 100

async function porLotes<T>(ids: string[], leer: (lote: string[]) => PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>): Promise<T[]> {
  const unicos = [...new Set(ids)]
  const salida: T[] = []
  for (let i = 0; i < unicos.length; i += 100) {
    const { data, error } = await leer(unicos.slice(i, i + 100))
    if (error) throw new Error(error.message)
    salida.push(...(data ?? []))
  }
  return salida
}

type FilaCuota = { id: string; institucion_id: string; matricula_id: string; numero: number; concepto: string; importe: number; vencimiento: string; estado: EstadoCuota }
type FilaPago = {
  id: string
  fecha_pago: string
  monto: number
  metodo: string
  referencia_operacion: string | null
  estado: EstadoPago
  observacion: string | null
  verificado_en: string | null
  solicitud_id: string | null
  cuota_id: string | null
  matricula_id: string | null
}
type Nombres = { institucion: string | null; curso: string | null; grupo: string | null }

const COLUMNAS_PAGO = "id, fecha_pago, monto, metodo, referencia_operacion, estado, observacion, verificado_en, solicitud_id, cuota_id, matricula_id"

/** Nombres por cuota: mis_cuotas() si existe; si no, vistas públicas por grupo. */
async function nombresDeCuotas(supabase: Cliente, matriculas: { id: string; grupo_id: string }[]): Promise<{ porCuota: Map<string, Nombres> | null; porMatricula: Map<string, Nombres> }> {
  const { data, error } = await supabase.rpc("mis_cuotas")
  if (!error) {
    const porCuota = new Map<string, Nombres>()
    for (const f of (data ?? []) as { cuota_id: string; institucion: string; curso: string; grupo: string }[]) {
      porCuota.set(f.cuota_id, { institucion: f.institucion, curso: f.curso, grupo: f.grupo })
    }
    return { porCuota, porMatricula: new Map() }
  }
  if (error.code !== "PGRST202") console.error("[pagos-estudiante] mis_cuotas", error.code, error.message)

  const grupos = await porLotes<{ id: string; curso_id: string; codigo: string }>(
    matriculas.map((m) => m.grupo_id),
    (lote) => supabase.from("oferta_grupos").select("id, curso_id, codigo").in("id", lote).overrideTypes<{ id: string; curso_id: string; codigo: string }[], { merge: false }>()
  ).catch(() => [])
  const cursos = await porLotes<{ id: string; nombre: string; institucion: string }>(
    grupos.map((g) => g.curso_id),
    (lote) => supabase.from("oferta_cursos").select("id, nombre, institucion").in("id", lote).overrideTypes<{ id: string; nombre: string; institucion: string }[], { merge: false }>()
  ).catch(() => [])
  const grupo = new Map(grupos.map((g) => [g.id, g]))
  const curso = new Map(cursos.map((c) => [c.id, c]))
  const porMatricula = new Map<string, Nombres>()
  for (const m of matriculas) {
    const g = grupo.get(m.grupo_id)
    const c = g ? curso.get(g.curso_id) : undefined
    porMatricula.set(m.id, { institucion: c?.institucion ?? null, curso: c?.nombre ?? null, grupo: g?.codigo ?? null })
  }
  return { porCuota: null, porMatricula }
}

export async function obtenerEstadoCuenta(estudianteId: string): Promise<EstadoCuenta> {
  const supabase = await createClient()
  const solicitudes = await obtenerMisSolicitudes(estudianteId)

  const { data: matriculas, error: mError } = await supabase
    .from("matriculas")
    .select("id, grupo_id, estado")
    .eq("estudiante_id", estudianteId)
    .overrideTypes<{ id: string; grupo_id: string; estado: string }[], { merge: false }>()
  if (mError) {
    console.error("[pagos-estudiante] matrículas", mError.code, mError.message)
    throw new Error("No se pudo cargar tu estado de cuenta.")
  }
  const mats = matriculas ?? []
  const matPorId = new Map(mats.map((m) => [m.id, m]))

  let filasCuotas: FilaCuota[] = []
  let pagosFilas: FilaPago[] = []
  try {
    filasCuotas = await porLotes<FilaCuota>(mats.map((m) => m.id), (lote) =>
      supabase.from("cuotas").select("id, institucion_id, matricula_id, numero, concepto, importe, vencimiento, estado").in("matricula_id", lote).overrideTypes<FilaCuota[], { merge: false }>()
    )
    const [propios, deCuotas, deMatriculas] = await Promise.all([
      supabase.from("pagos").select(COLUMNAS_PAGO).eq("estudiante_id", estudianteId).overrideTypes<FilaPago[], { merge: false }>(),
      porLotes<FilaPago>(filasCuotas.map((q) => q.id), (lote) => supabase.from("pagos").select(COLUMNAS_PAGO).in("cuota_id", lote).overrideTypes<FilaPago[], { merge: false }>()),
      // Pagos de la versión anterior (V4) asociados directamente a la matrícula.
      porLotes<FilaPago>(mats.map((m) => m.id), (lote) => supabase.from("pagos").select(COLUMNAS_PAGO).in("matricula_id", lote).overrideTypes<FilaPago[], { merge: false }>()),
    ])
    if (propios.error) throw new Error(propios.error.message)
    const vistos = new Map<string, FilaPago>()
    for (const p of [...(propios.data ?? []), ...deCuotas, ...deMatriculas]) vistos.set(p.id, p)
    pagosFilas = [...vistos.values()]
  } catch (e) {
    console.error("[pagos-estudiante] cuotas/pagos", e instanceof Error ? e.message : e)
    throw new Error("No se pudo cargar tu estado de cuenta.")
  }

  const { porCuota, porMatricula } = await nombresDeCuotas(supabase, mats)
  const hoy = hoyEnLima()

  const cuotas: CuotaEstudiante[] = filasCuotas
    .map((q) => {
      const pagosCuota = pagosFilas.filter((p) => p.cuota_id === q.id)
      const aplicado = redondear(pagosCuota.filter((p) => p.estado === "pagado").reduce((s, p) => s + num(p.monto), 0))
      const importe = num(q.importe)
      const activa = matPorId.get(q.matricula_id)?.estado === "activa"
      const n = porCuota?.get(q.id) ?? porMatricula.get(q.matricula_id) ?? { institucion: null, curso: null, grupo: null }
      const abierta = q.estado === "pendiente" || q.estado === "parcial"
      return {
        id: q.id,
        matriculaId: q.matricula_id,
        institucionId: q.institucion_id,
        ...n,
        numero: q.numero,
        concepto: q.concepto,
        importe,
        aplicado,
        saldo: q.estado === "anulada" ? 0 : Math.max(redondear(importe - aplicado), 0),
        vencimiento: q.vencimiento,
        estado: q.estado,
        matriculaActiva: activa,
        enRevision: pagosCuota.some((p) => p.estado === "pendiente"),
        vencida: abierta && activa && q.vencimiento < hoy,
      }
    })
    .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento) || a.numero - b.numero)

  const solPorId = new Map(solicitudes.map((s) => [s.id, s]))
  const cuotaPorId = new Map(cuotas.map((c) => [c.id, c]))
  const pagos: PagoEstudiante[] = pagosFilas
    .map((p) => {
      const s = p.solicitud_id ? solPorId.get(p.solicitud_id) : undefined
      const q = p.cuota_id ? cuotaPorId.get(p.cuota_id) : undefined
      const concepto = s ? (s.tipo === "reserva" ? "Reserva de vacante" : "Matrícula") : q ? `${q.concepto} ${q.numero}` : "Pago (versión anterior)"
      return {
        id: p.id,
        fecha: p.fecha_pago,
        monto: num(p.monto),
        metodo: p.metodo,
        referencia: p.referencia_operacion,
        estado: p.estado,
        observacion: p.observacion,
        verificadoEn: p.verificado_en,
        solicitudId: p.solicitud_id,
        cuotaId: p.cuota_id,
        concepto,
        institucion: s?.curso?.institucion ?? q?.institucion ?? null,
        curso: s?.curso?.nombre ?? q?.curso ?? null,
      }
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha))

  return { solicitudes, cuotas, pagos, nombresCompletos: porCuota !== null }
}

// ---------------------------------------------------------------------------
// Pantalla de pago: qué se paga, a quién y cuánto
// ---------------------------------------------------------------------------

export type ObjetivoPago = {
  destino: "solicitud" | "cuota" | "certificado"
  id: string
  institucionId: string
  institucion: string | null
  curso: string | null
  grupo: string | null
  concepto: string
  /** 'igual': el monto debe ser exactamente el importe (solicitud). 'maximo': hasta el saldo (cuota). */
  regla: "igual" | "maximo"
  importe: number
  saldo: number
  vencimiento: string | null
  vencida: boolean
}

export type ResultadoObjetivo =
  | { estado: "pagable"; objetivo: ObjetivoPago; medios: LecturaMedios; textoPagos: string | null }
  | { estado: "no_pagable"; motivo: string }

export async function obtenerObjetivoPago(estudianteId: string, destino: { solicitud?: string; cuota?: string; certificado?: string }): Promise<ResultadoObjetivo> {
  const supabase = await createClient()
  let objetivo: ObjetivoPago

  if (destino.solicitud) {
    const { data: s, error } = await supabase
      .from("solicitudes_inscripcion")
      .select("id, institucion_id, grupo_id, tipo, estado, importe_esperado")
      .eq("id", destino.solicitud)
      .eq("estudiante_id", estudianteId)
      .maybeSingle()
      .overrideTypes<{ id: string; institucion_id: string; grupo_id: string; tipo: "reserva" | "matricula"; estado: string; importe_esperado: number }, { merge: false }>()
    if (error) throw new Error(error.message)
    if (!s) return { estado: "no_pagable", motivo: "La solicitud no existe o no es tuya." }
    if (s.estado !== "pendiente") return { estado: "no_pagable", motivo: "Esta solicitud ya no está pendiente de pago." }
    const importe = num(s.importe_esperado)
    if (importe <= 0) return { estado: "no_pagable", motivo: "Esta solicitud no requiere pago: confírmala desde «Mis solicitudes»." }
    const { data: pend } = await supabase.from("pagos").select("id").eq("solicitud_id", s.id).eq("estado", "pendiente").limit(1)
    if (pend?.length) return { estado: "no_pagable", motivo: "Ya enviaste un comprobante para esta solicitud y está en revisión." }

    const { data: g } = await supabase.from("oferta_grupos").select("codigo, curso_id").eq("id", s.grupo_id).maybeSingle().overrideTypes<{ codigo: string; curso_id: string }, { merge: false }>()
    const { data: c } = g
      ? await supabase.from("oferta_cursos").select("nombre, institucion").eq("id", g.curso_id).maybeSingle().overrideTypes<{ nombre: string; institucion: string }, { merge: false }>()
      : { data: null }
    objetivo = {
      destino: "solicitud",
      id: s.id,
      institucionId: s.institucion_id,
      institucion: c?.institucion ?? null,
      curso: c?.nombre ?? null,
      grupo: g?.codigo ?? null,
      concepto: s.tipo === "reserva" ? "Reserva de vacante" : "Matrícula",
      regla: "igual",
      importe,
      saldo: importe,
      vencimiento: null,
      vencida: false,
    }
  } else if (destino.cuota) {
    const cuenta = await obtenerEstadoCuenta(estudianteId)
    const q = cuenta.cuotas.find((x) => x.id === destino.cuota)
    if (!q) return { estado: "no_pagable", motivo: "La cuota no existe o no es tuya." }
    if (!q.matriculaActiva) return { estado: "no_pagable", motivo: "La matrícula de esta cuota no está activa." }
    if (q.estado !== "pendiente" && q.estado !== "parcial") return { estado: "no_pagable", motivo: "Esta cuota ya no tiene saldo pendiente." }
    if (q.enRevision) return { estado: "no_pagable", motivo: "Ya enviaste un comprobante para esta cuota y está en revisión." }
    if (q.saldo <= 0) return { estado: "no_pagable", motivo: "Esta cuota ya no tiene saldo pendiente." }
    objetivo = {
      destino: "cuota",
      id: q.id,
      institucionId: q.institucionId,
      institucion: q.institucion,
      curso: q.curso,
      grupo: q.grupo,
      concepto: `${q.concepto} ${q.numero}`,
      regla: "maximo",
      importe: q.importe,
      saldo: q.saldo,
      vencimiento: q.vencimiento,
      vencida: q.vencida,
    }
  } else if (destino.certificado) {
    // Certificado con costo adicional (migración certificados_v5): tablas y RPC propias, no las de V5.
    const { data: sc, error } = await supabase
      .from("solicitudes_certificado")
      .select("id, institucion_id, matricula_id, importe, estado")
      .eq("id", destino.certificado)
      .eq("estudiante_id", estudianteId)
      .maybeSingle()
      .overrideTypes<{ id: string; institucion_id: string; matricula_id: string; importe: number; estado: string }, { merge: false }>()
    if (error) return { estado: "no_pagable", motivo: "El pago de certificados aún no está disponible." }
    if (!sc) return { estado: "no_pagable", motivo: "La solicitud de certificado no existe o no es tuya." }
    if (sc.estado !== "pendiente") return { estado: "no_pagable", motivo: sc.estado === "pagada" ? "El certificado ya está pagado." : "Esta solicitud de certificado ya no está pendiente." }
    const { data: pend } = await supabase.from("pagos_certificado").select("id").eq("solicitud_id", sc.id).eq("estado", "pendiente").limit(1)
    if (pend?.length) return { estado: "no_pagable", motivo: "Ya enviaste un comprobante para este certificado y está en revisión." }
    const { data: info } = await supabase.rpc("mis_certificados")
    const fila = ((info ?? []) as { matricula_id: string; institucion: string; curso: string; grupo: string }[]).find((f) => f.matricula_id === sc.matricula_id)
    const importe = num(sc.importe)
    objetivo = {
      destino: "certificado",
      id: sc.id,
      institucionId: sc.institucion_id,
      institucion: fila?.institucion ?? null,
      curso: fila?.curso ?? null,
      grupo: fila?.grupo ?? null,
      concepto: "Certificado",
      regla: "igual",
      importe,
      saldo: importe,
      vencimiento: null,
      vencida: false,
    }
  } else {
    return { estado: "no_pagable", motivo: "Elige una solicitud, cuota o certificado para pagar." }
  }

  const [medios, politicas] = await Promise.all([
    obtenerMediosCobro(objetivo.institucionId, true).catch((): LecturaMedios => ({ disponible: false })),
    supabase.from("oferta_politicas_institucion").select("texto_pagos").eq("institucion_id", objetivo.institucionId).maybeSingle().overrideTypes<{ texto_pagos: string | null }, { merge: false }>(),
  ])
  return { estado: "pagable", objetivo, medios, textoPagos: politicas.data?.texto_pagos ?? null }
}
