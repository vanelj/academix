import { createClient } from "@/lib/supabase/server"
import type { EstadoSolicitud } from "@/lib/estudiantes/datos"
import { reservaVencida } from "@/lib/solicitudes/datos"

/**
 * Lectura para la inscripción del estudiante (SOLO servidor).
 * - Detalle público del curso: solo vistas públicas de V5 (oferta_cursos,
 *   oferta_grupos, oferta_horarios, oferta_condiciones,
 *   oferta_politicas_institucion). No exponen datos privados.
 * - Mis solicitudes: RLS "ver solicitudes propias o institucionales"
 *   (estudiante_id = auth.uid()). Los nombres de curso y grupo salen de las
 *   vistas públicas: un estudiante global no puede leer las tablas grupos y
 *   cursos de una institución.
 */

export type GrupoOferta = {
  id: string
  codigo: string
  fecha_inicio: string
  fecha_fin: string
  estado: "programado" | "abierto"
  vacantes_disponibles: number | null
  docente: string | null
  horarios: { dia_semana: number; hora_inicio: string; hora_fin: string }[]
}

export type CondicionesOferta = {
  tipo_cobro: "gratuito" | "unico" | "cuotas"
  matricula_importe: number
  importe_curso: number
  permite_reserva: boolean
  reserva_importe: number
  reserva_plazo_horas: number | null
  reserva_descuenta_matricula: boolean
  requisitos: string | null
  condiciones_especiales: string | null
}

export type PoliticasOferta = {
  texto_matricula: string | null
  texto_reservas: string | null
  texto_pagos: string | null
  texto_devoluciones: string | null
  texto_morosidad: string | null
}

/** Condiciones públicas de certificación (vista oferta_certificacion, migración certificados_v5). */
export type CertificacionOferta = {
  modalidad: "sin_certificado" | "gratuito" | "incluido" | "costo_adicional"
  importe: number
  nota_minima: number | null
  horas_academicas: number | null
  requisitos_adicionales: string | null
}

export type DetalleCurso = {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  categoria: string
  institucion_id: string
  institucion: string
  logo_url: string | null
  grupos: GrupoOferta[]
  condiciones: CondicionesOferta | null
  politicas: PoliticasOferta | null
  certificacion: CertificacionOferta | null
}

const num = (v: unknown) => Number(v)

/** null = el curso no está en la oferta pública (no publicado, categoría o institución inactiva). */
export async function obtenerDetalleCurso(cursoId: string): Promise<DetalleCurso | null> {
  const supabase = await createClient()
  const { data: curso, error } = await supabase
    .from("oferta_cursos")
    .select("id, nombre, descripcion, precio, categoria, institucion_id, institucion, logo_url")
    .eq("id", cursoId)
    .maybeSingle()
    .overrideTypes<Omit<DetalleCurso, "grupos" | "condiciones" | "politicas" | "certificacion">, { merge: false }>()
  if (error) {
    console.error("[inscripcion] curso", error.code, error.message)
    throw new Error("No se pudo cargar el curso.")
  }
  if (!curso) return null

  const [grupos, condiciones, politicas, certificacion] = await Promise.all([
    supabase.from("oferta_grupos").select("id, codigo, fecha_inicio, fecha_fin, estado, vacantes_disponibles, docente").eq("curso_id", cursoId).order("fecha_inicio")
      .overrideTypes<Omit<GrupoOferta, "horarios">[], { merge: false }>(),
    supabase.from("oferta_condiciones")
      .select("tipo_cobro, matricula_importe, importe_curso, permite_reserva, reserva_importe, reserva_plazo_horas, reserva_descuenta_matricula, requisitos, condiciones_especiales")
      .eq("curso_id", cursoId).maybeSingle()
      .overrideTypes<CondicionesOferta, { merge: false }>(),
    supabase.from("oferta_politicas_institucion").select("texto_matricula, texto_reservas, texto_pagos, texto_devoluciones, texto_morosidad")
      .eq("institucion_id", curso.institucion_id).maybeSingle()
      .overrideTypes<PoliticasOferta, { merge: false }>(),
    // Si la vista aún no existe (migración pendiente) se ignora: el curso se muestra sin esta sección.
    supabase.from("oferta_certificacion").select("modalidad, importe, nota_minima, horas_academicas, requisitos_adicionales").eq("curso_id", cursoId).maybeSingle()
      .overrideTypes<CertificacionOferta, { merge: false }>(),
  ])
  for (const [k, r] of [["grupos", grupos], ["condiciones", condiciones], ["politicas", politicas]] as const) {
    if (r.error) console.error(`[inscripcion] ${k}`, r.error.code, r.error.message)
  }

  const ids = (grupos.data ?? []).map((g) => g.id)
  const { data: horarios } = ids.length
    ? await supabase.from("oferta_horarios").select("grupo_id, dia_semana, hora_inicio, hora_fin").in("grupo_id", ids).order("dia_semana").order("hora_inicio")
        .overrideTypes<{ grupo_id: string; dia_semana: number; hora_inicio: string; hora_fin: string }[], { merge: false }>()
    : { data: [] as { grupo_id: string; dia_semana: number; hora_inicio: string; hora_fin: string }[] }

  const c = condiciones.data
  return {
    ...curso,
    precio: num(curso.precio),
    grupos: (grupos.data ?? []).map((g) => ({
      ...g,
      horarios: (horarios ?? [])
        .filter((h) => h.grupo_id === g.id)
        .map((h) => ({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio.slice(0, 5), hora_fin: h.hora_fin.slice(0, 5) })),
    })),
    condiciones: c
      ? {
          ...c,
          matricula_importe: num(c.matricula_importe),
          importe_curso: num(c.importe_curso),
          reserva_importe: num(c.reserva_importe),
          reserva_plazo_horas: c.reserva_plazo_horas == null ? null : num(c.reserva_plazo_horas),
        }
      : null,
    politicas: politicas.data ?? null,
    certificacion: certificacion.data
      ? { ...certificacion.data, importe: num(certificacion.data.importe), nota_minima: certificacion.data.nota_minima === null ? null : num(certificacion.data.nota_minima) }
      : null,
  }
}

export type MiSolicitud = {
  id: string
  tipo: "reserva" | "matricula"
  estado: EstadoSolicitud
  importe_esperado: number
  fecha_solicitud: string
  reserva_vence_en: string | null
  reservaVencida: boolean
  /** null = el grupo ya no está en la oferta pública (no se puede mostrar su nombre). */
  grupo: { codigo: string; fecha_inicio: string; fecha_fin: string } | null
  curso: { id: string; nombre: string; institucion: string } | null
  pagoPendiente: boolean
}

export async function obtenerMisSolicitudes(estudianteId: string): Promise<MiSolicitud[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("solicitudes_inscripcion")
    .select("id, grupo_id, tipo, estado, importe_esperado, fecha_solicitud, reserva_vence_en")
    .eq("estudiante_id", estudianteId)
    .order("fecha_solicitud", { ascending: false })
    .overrideTypes<{ id: string; grupo_id: string; tipo: "reserva" | "matricula"; estado: EstadoSolicitud; importe_esperado: number; fecha_solicitud: string; reserva_vence_en: string | null }[], { merge: false }>()
  if (error) {
    console.error("[inscripcion] mis solicitudes", error.code, error.message)
    throw new Error("No se pudieron cargar tus solicitudes.")
  }
  const filas = data ?? []
  if (filas.length === 0) return []

  const grupoIds = [...new Set(filas.map((f) => f.grupo_id))]
  const [grupos, pagos] = await Promise.all([
    supabase.from("oferta_grupos").select("id, curso_id, codigo, fecha_inicio, fecha_fin").in("id", grupoIds)
      .overrideTypes<{ id: string; curso_id: string; codigo: string; fecha_inicio: string; fecha_fin: string }[], { merge: false }>(),
    supabase.from("pagos").select("solicitud_id, estado").in("solicitud_id", filas.map((f) => f.id)).eq("estado", "pendiente")
      .overrideTypes<{ solicitud_id: string; estado: string }[], { merge: false }>(),
  ])
  const cursoIds = [...new Set((grupos.data ?? []).map((g) => g.curso_id))]
  const { data: cursos } = cursoIds.length
    ? await supabase.from("oferta_cursos").select("id, nombre, institucion").in("id", cursoIds)
        .overrideTypes<{ id: string; nombre: string; institucion: string }[], { merge: false }>()
    : { data: [] as { id: string; nombre: string; institucion: string }[] }

  const porGrupo = new Map((grupos.data ?? []).map((g) => [g.id, g]))
  const porCurso = new Map((cursos ?? []).map((c) => [c.id, c]))
  const conPago = new Set((pagos.data ?? []).map((p) => p.solicitud_id))

  return filas.map((f) => {
    const g = porGrupo.get(f.grupo_id)
    return {
      id: f.id,
      tipo: f.tipo,
      estado: f.estado,
      importe_esperado: num(f.importe_esperado),
      fecha_solicitud: f.fecha_solicitud,
      reserva_vence_en: f.reserva_vence_en,
      reservaVencida: reservaVencida(f.estado, f.reserva_vence_en),
      grupo: g ? { codigo: g.codigo, fecha_inicio: g.fecha_inicio, fecha_fin: g.fecha_fin } : null,
      curso: g ? (porCurso.get(g.curso_id) ?? null) : null,
      pagoPendiente: conPago.has(f.id),
    }
  })
}
