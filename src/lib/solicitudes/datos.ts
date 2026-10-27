import { createClient } from "@/lib/supabase/server"
import type { EstadoSolicitud } from "@/lib/estudiantes/datos"
import { obtenerContacto, type ContactoEstudiante } from "@/lib/estudiantes/datos"

/**
 * Solicitudes de inscripción y reservas de la institución del administrador
 * (SOLO servidor, solo lectura). Todo con la sesión del administrador:
 * - solicitudes_inscripcion: RLS "ver solicitudes propias o institucionales".
 * - grupos, cursos, condiciones_curso, grupos_con_vacantes: RLS de su institución.
 * - pagos: RLS "ver pagos" (admin de la institución). Solo lectura: la revisión
 *   de comprobantes vive en el módulo de pagos (src/lib/pagos).
 * - Nombres: RPC estudiantes_de_mi_institucion(); contacto: contacto_estudiante().
 */

export type TipoSolicitud = "reserva" | "matricula"

export type SolicitudAdmin = {
  id: string
  tipo: TipoSolicitud
  estado: EstadoSolicitud
  importe_esperado: number
  fecha_solicitud: string
  fecha_verificacion: string | null
  reserva_vence_en: string | null
  matricula_id: string | null
  aceptadas_en: string
  /** Reserva 'reservada' cuyo plazo ya pasó (V5 no cambia su estado). */
  reservaVencida: boolean
  estudiante: { id: string; nombre: string | null }
  grupo: { id: string; codigo: string; estado: string; fecha_inicio: string; fecha_fin: string } | null
  curso: { id: string; nombre: string } | null
}

export type PagoSolicitud = {
  id: string
  monto: number
  metodo: string
  estado: "pendiente" | "pagado" | "rechazado"
  fecha_pago: string
  referencia_operacion: string | null
  observacion: string | null
  verificado_en: string | null
}

export type SolicitudDetalle = SolicitudAdmin & {
  condiciones_aceptadas: string
  comentario_revision: string | null
  contacto: ContactoEstudiante | null | "error"
  vacantes: { total: number; disponibles: number | null } | null
  condicionesActuales: {
    tipo_cobro: string
    requisitos: string | null
    condiciones_especiales: string | null
    reserva_plazo_horas: number | null
  } | null
  pagos: PagoSolicitud[]
}

type Fila = Omit<SolicitudAdmin, "reservaVencida" | "estudiante" | "grupo" | "curso"> & {
  grupo_id: string
  estudiante_id: string
  condiciones_aceptadas?: string
  comentario_revision?: string | null
}

const COLUMNAS =
  "id, grupo_id, estudiante_id, tipo, estado, importe_esperado, fecha_solicitud, fecha_verificacion, reserva_vence_en, matricula_id, aceptadas_en"

export const reservaVencida = (estado: string, vence: string | null) =>
  estado === "reservada" && vence !== null && new Date(vence).getTime() <= Date.now()

async function completar(institucionId: string, filas: Fila[]) {
  const supabase = await createClient()
  const grupoIds = [...new Set(filas.map((f) => f.grupo_id))]
  const [grupos, nombres] = await Promise.all([
    grupoIds.length
      ? supabase.from("grupos").select("id, codigo, estado, fecha_inicio, fecha_fin, curso_id").eq("institucion_id", institucionId).in("id", grupoIds)
          .overrideTypes<{ id: string; codigo: string; estado: string; fecha_inicio: string; fecha_fin: string; curso_id: string }[], { merge: false }>()
      : Promise.resolve({ data: [], error: null }),
    filas.length ? supabase.rpc("estudiantes_de_mi_institucion") : Promise.resolve({ data: [], error: null }),
  ])
  if (grupos.error) console.error("[solicitudes] grupos", grupos.error.code, grupos.error.message)
  if (nombres.error) console.error("[solicitudes] nombres", nombres.error.code, nombres.error.message)

  const cursoIds = [...new Set((grupos.data ?? []).map((g) => g.curso_id))]
  const { data: cursos } = cursoIds.length
    ? await supabase.from("cursos").select("id, nombre").eq("institucion_id", institucionId).in("id", cursoIds)
        .overrideTypes<{ id: string; nombre: string }[], { merge: false }>()
    : { data: [] as { id: string; nombre: string }[] }

  const porGrupo = new Map((grupos.data ?? []).map((g) => [g.id, g]))
  const porCurso = new Map((cursos ?? []).map((c) => [c.id, c]))
  const porEstudiante = new Map(
    ((nombres.data ?? []) as { estudiante_id: string; nombres: string; apellidos: string }[]).map((n) => [
      n.estudiante_id,
      `${n.apellidos}, ${n.nombres}`,
    ])
  )

  return filas.map((f): SolicitudAdmin => {
    const g = porGrupo.get(f.grupo_id)
    return {
      id: f.id,
      tipo: f.tipo,
      estado: f.estado,
      importe_esperado: Number(f.importe_esperado),
      fecha_solicitud: f.fecha_solicitud,
      fecha_verificacion: f.fecha_verificacion,
      reserva_vence_en: f.reserva_vence_en,
      matricula_id: f.matricula_id,
      aceptadas_en: f.aceptadas_en,
      reservaVencida: reservaVencida(f.estado, f.reserva_vence_en),
      estudiante: { id: f.estudiante_id, nombre: porEstudiante.get(f.estudiante_id) ?? null },
      grupo: g ? { id: g.id, codigo: g.codigo, estado: g.estado, fecha_inicio: g.fecha_inicio, fecha_fin: g.fecha_fin } : null,
      curso: g ? (porCurso.get(g.curso_id) ?? null) : null,
    }
  })
}

export async function obtenerSolicitudes(institucionId: string): Promise<SolicitudAdmin[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("solicitudes_inscripcion")
    .select(COLUMNAS)
    .eq("institucion_id", institucionId)
    .order("fecha_solicitud", { ascending: false })
    .overrideTypes<Fila[], { merge: false }>()
  if (error) {
    console.error("[solicitudes] lectura", error.code, error.message)
    throw new Error("No se pudieron cargar las solicitudes.")
  }
  return completar(institucionId, data ?? [])
}

/** Una solicitud de la institución; null si no existe o es de otra institución. */
export async function obtenerSolicitud(institucionId: string, solicitudId: string): Promise<SolicitudDetalle | null> {
  const supabase = await createClient()
  const { data: fila, error } = await supabase
    .from("solicitudes_inscripcion")
    .select(`${COLUMNAS}, condiciones_aceptadas, comentario_revision`)
    .eq("institucion_id", institucionId)
    .eq("id", solicitudId)
    .maybeSingle()
    .overrideTypes<Fila, { merge: false }>()
  if (error) {
    console.error("[solicitudes] detalle", error.code, error.message)
    throw new Error("No se pudo cargar la solicitud.")
  }
  if (!fila) return null

  const [base] = await completar(institucionId, [fila])
  const cursoId = base.curso?.id

  const [vacantes, condiciones, pagos, contacto] = await Promise.all([
    supabase.from("grupos_con_vacantes").select("vacantes, vacantes_disponibles").eq("institucion_id", institucionId).eq("id", fila.grupo_id).maybeSingle()
      .overrideTypes<{ vacantes: number; vacantes_disponibles: number | null }, { merge: false }>(),
    cursoId
      ? supabase.from("condiciones_curso").select("tipo_cobro, requisitos, condiciones_especiales, reserva_plazo_horas").eq("institucion_id", institucionId).eq("curso_id", cursoId).maybeSingle()
          .overrideTypes<NonNullable<SolicitudDetalle["condicionesActuales"]>, { merge: false }>()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("pagos").select("id, monto, metodo, estado, fecha_pago, referencia_operacion, observacion, verificado_en")
      .eq("institucion_id", institucionId).eq("solicitud_id", solicitudId).order("fecha_pago", { ascending: false })
      .overrideTypes<PagoSolicitud[], { merge: false }>(),
    obtenerContacto(fila.estudiante_id).catch(() => "error" as const),
  ])
  if (pagos.error) console.error("[solicitudes] pagos", pagos.error.code, pagos.error.message)

  return {
    ...base,
    condiciones_aceptadas: fila.condiciones_aceptadas ?? "",
    comentario_revision: fila.comentario_revision ?? null,
    contacto,
    vacantes: vacantes.data ? { total: vacantes.data.vacantes, disponibles: vacantes.data.vacantes_disponibles } : null,
    condicionesActuales: condiciones.data ?? null,
    pagos: (pagos.data ?? []).map((p) => ({ ...p, monto: Number(p.monto) })),
  }
}
