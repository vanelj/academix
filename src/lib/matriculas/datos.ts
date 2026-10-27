import { createClient } from "@/lib/supabase/server"
import type { EstadoFinal, EstadoMatricula } from "@/lib/estudiantes/datos"
import { obtenerContacto, type ContactoEstudiante } from "@/lib/estudiantes/datos"

/**
 * Matrículas de la institución del administrador (SOLO servidor, solo lectura).
 * Todo con la sesión del administrador (nunca la clave secreta):
 * - matriculas: RLS "ver matriculas" → admin de la institución del grupo.
 * - grupos, cursos, perfiles (docente): RLS de su institución.
 * - solicitudes_inscripcion, cuotas, pagos: RLS de admin de su institución.
 *   Cuotas y pagos se muestran solo como consulta (el módulo de pagos no está
 *   habilitado).
 * - Nombres: RPC estudiantes_de_mi_institucion(); contacto: contacto_estudiante().
 * V5 crea las matrículas solo mediante RPC (revisar_pago o
 * confirmar_matricula_sin_saldo); aquí no se crea ninguna.
 */

export type MatriculaAdmin = {
  id: string
  estado: EstadoMatricula
  estado_final: EstadoFinal
  fecha_matricula: string
  estudiante: { id: string; nombre: string | null }
  grupo: { id: string; codigo: string; estado: string; fecha_inicio: string; fecha_fin: string } | null
  curso: { id: string; nombre: string } | null
}

export type CuotaMatricula = {
  id: string
  numero: number
  concepto: string
  importe: number
  vencimiento: string
  estado: "pendiente" | "parcial" | "pagada" | "anulada"
}

export type PagoMatricula = {
  id: string
  monto: number
  metodo: string
  estado: "pendiente" | "pagado" | "rechazado"
  fecha_pago: string
  cuota_id: string | null
  verificado_en: string | null
}

export type MatriculaDetalle = MatriculaAdmin & {
  docente: string | null
  contacto: ContactoEstudiante | null | "error"
  /** Solicitud de inscripción que originó la matrícula (V5); null en matrículas V4. */
  solicitud: { id: string; tipo: "reserva" | "matricula"; fecha_solicitud: string; fecha_verificacion: string | null; importe_esperado: number } | null
  cuotas: CuotaMatricula[]
  pagos: PagoMatricula[]
  certificado: { codigo: string; fecha_emision: string } | null
  /** Las lecturas complementarias (cuotas, pagos, certificado) fallaron: no se puede evaluar la anulación. */
  lecturaIncompleta: boolean
}

type Fila = {
  id: string
  grupo_id: string
  estudiante_id: string
  estado: EstadoMatricula
  estado_final: EstadoFinal
  fecha_matricula: string
}

const COLUMNAS = "id, grupo_id, estudiante_id, estado, estado_final, fecha_matricula"

type GrupoFila = { id: string; codigo: string; estado: string; fecha_inicio: string; fecha_fin: string; curso_id: string; docente_id: string | null }

async function completar(institucionId: string, filas: Fila[]) {
  const supabase = await createClient()
  const grupoIds = [...new Set(filas.map((f) => f.grupo_id))]
  const [grupos, nombres] = await Promise.all([
    grupoIds.length
      ? supabase.from("grupos").select("id, codigo, estado, fecha_inicio, fecha_fin, curso_id, docente_id").eq("institucion_id", institucionId).in("id", grupoIds)
          .overrideTypes<GrupoFila[], { merge: false }>()
      : Promise.resolve({ data: [], error: null }),
    filas.length ? supabase.rpc("estudiantes_de_mi_institucion") : Promise.resolve({ data: [], error: null }),
  ])
  if (grupos.error) console.error("[matriculas] grupos", grupos.error.code, grupos.error.message)
  if (nombres.error) console.error("[matriculas] nombres", nombres.error.code, nombres.error.message)

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

  const lista = filas.map((f): MatriculaAdmin => {
    const g = porGrupo.get(f.grupo_id)
    return {
      id: f.id,
      estado: f.estado,
      estado_final: f.estado_final,
      fecha_matricula: f.fecha_matricula,
      estudiante: { id: f.estudiante_id, nombre: porEstudiante.get(f.estudiante_id) ?? null },
      grupo: g ? { id: g.id, codigo: g.codigo, estado: g.estado, fecha_inicio: g.fecha_inicio, fecha_fin: g.fecha_fin } : null,
      curso: g ? (porCurso.get(g.curso_id) ?? null) : null,
    }
  })
  return { lista, porGrupo }
}

export async function obtenerMatriculas(institucionId: string): Promise<MatriculaAdmin[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("matriculas")
    .select(COLUMNAS)
    .eq("institucion_id", institucionId)
    .order("fecha_matricula", { ascending: false })
    .overrideTypes<Fila[], { merge: false }>()
  if (error) {
    console.error("[matriculas] lectura", error.code, error.message)
    throw new Error("No se pudieron cargar las matrículas.")
  }
  return (await completar(institucionId, data ?? [])).lista
}

/** Una matrícula de la institución; null si no existe o es de otra institución. */
export async function obtenerMatricula(institucionId: string, matriculaId: string): Promise<MatriculaDetalle | null> {
  const supabase = await createClient()
  const { data: fila, error } = await supabase
    .from("matriculas")
    .select(COLUMNAS)
    .eq("institucion_id", institucionId)
    .eq("id", matriculaId)
    .maybeSingle()
    .overrideTypes<Fila, { merge: false }>()
  if (error) {
    console.error("[matriculas] detalle", error.code, error.message)
    throw new Error("No se pudo cargar la matrícula.")
  }
  if (!fila) return null

  const { lista, porGrupo } = await completar(institucionId, [fila])
  const base = lista[0]
  const docenteId = porGrupo.get(fila.grupo_id)?.docente_id ?? null

  const [docente, solicitud, cuotas, pagosDirectos, certificado, contacto] = await Promise.all([
    docenteId
      ? supabase.from("perfiles").select("nombres, apellidos").eq("institucion_id", institucionId).eq("id", docenteId).maybeSingle()
          .overrideTypes<{ nombres: string; apellidos: string }, { merge: false }>()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("solicitudes_inscripcion").select("id, tipo, fecha_solicitud, fecha_verificacion, importe_esperado")
      .eq("institucion_id", institucionId).eq("matricula_id", matriculaId).limit(1).maybeSingle()
      .overrideTypes<NonNullable<MatriculaDetalle["solicitud"]>, { merge: false }>(),
    supabase.from("cuotas").select("id, numero, concepto, importe, vencimiento, estado")
      .eq("institucion_id", institucionId).eq("matricula_id", matriculaId).order("numero")
      .overrideTypes<CuotaMatricula[], { merge: false }>(),
    supabase.from("pagos").select("id, monto, metodo, estado, fecha_pago, cuota_id, verificado_en")
      .eq("institucion_id", institucionId).eq("matricula_id", matriculaId)
      .overrideTypes<PagoMatricula[], { merge: false }>(),
    supabase.from("certificados").select("codigo, fecha_emision").eq("institucion_id", institucionId).eq("matricula_id", matriculaId).maybeSingle()
      .overrideTypes<{ codigo: string; fecha_emision: string }, { merge: false }>(),
    obtenerContacto(fila.estudiante_id).catch(() => "error" as const),
  ])

  // Pagos de las cuotas de la matrícula (V5 los vincula a la cuota, no a la matrícula).
  const cuotaIds = (cuotas.data ?? []).map((q) => q.id)
  const pagosCuotas = cuotaIds.length
    ? await supabase.from("pagos").select("id, monto, metodo, estado, fecha_pago, cuota_id, verificado_en")
        .eq("institucion_id", institucionId).in("cuota_id", cuotaIds)
        .overrideTypes<PagoMatricula[], { merge: false }>()
    : { data: [] as PagoMatricula[], error: null }

  const errores = { solicitud, cuotas, pagosDirectos, pagosCuotas, certificado }
  for (const [etiqueta, r] of Object.entries(errores)) {
    if (r.error) console.error(`[matriculas] ${etiqueta}`, r.error.code, r.error.message)
  }

  const pagos = [...(pagosDirectos.data ?? []), ...(pagosCuotas.data ?? [])]
    .map((p) => ({ ...p, monto: Number(p.monto) }))
    .sort((a, b) => b.fecha_pago.localeCompare(a.fecha_pago))

  return {
    ...base,
    docente: docente.data ? `${docente.data.nombres} ${docente.data.apellidos}` : null,
    contacto,
    solicitud: solicitud.data ? { ...solicitud.data, importe_esperado: Number(solicitud.data.importe_esperado) } : null,
    cuotas: (cuotas.data ?? []).map((q) => ({ ...q, importe: Number(q.importe) })),
    pagos,
    certificado: certificado.data ?? null,
    lecturaIncompleta: Object.values(errores).some((r) => r.error),
  }
}
