import { createClient } from "@/lib/supabase/server"
import { reservaVencida } from "@/lib/solicitudes/datos"

/**
 * Situación del estudiante en un curso del catálogo (SOLO servidor, con su sesión):
 * sus propias solicitudes y matrículas (RLS: estudiante_id = auth.uid()). Sirve para
 * mostrar «Inscribirme», «Continuar inscripción» o «Ir a mi curso». No decide nada:
 * la RPC crear_solicitud_inscripcion vuelve a impedir duplicados en la base.
 */

export type EstadoEnGrupo =
  | { tipo: "matriculado" }
  | {
      tipo: "solicitud"
      estado: "pendiente" | "reservada"
      solicitud: "reserva" | "matricula"
      /** Para ir a pagar o seguirla. */
      id: string
      importe: number
      /** Ya envió un comprobante y la institución aún no lo revisa. */
      pagoEnRevision: boolean
    }

export type EstadoEnCurso = {
  porGrupo: Record<string, EstadoEnGrupo>
  /** Matrícula activa en cualquier grupo de este curso (también en uno que ya no está en la oferta). */
  matriculadoEnCurso: boolean
}

/** null = no se pudo consultar (se muestra «Inscribirme» y la base sigue protegiendo). */
export async function estadoEnCurso(estudianteId: string, cursoId: string, grupoIds: string[]): Promise<EstadoEnCurso | null> {
  const supabase = await createClient()
  const [solicitudes, matriculas, misCursos] = await Promise.all([
    grupoIds.length
      ? supabase.from("solicitudes_inscripcion").select("id, grupo_id, tipo, estado, reserva_vence_en, importe_esperado")
          .eq("estudiante_id", estudianteId).in("grupo_id", grupoIds).in("estado", ["pendiente", "reservada"])
          .overrideTypes<{ id: string; grupo_id: string; tipo: "reserva" | "matricula"; estado: "pendiente" | "reservada"; reserva_vence_en: string | null; importe_esperado: number }[], { merge: false }>()
      : Promise.resolve({ data: [], error: null }),
    grupoIds.length
      ? supabase.from("matriculas").select("grupo_id").eq("estudiante_id", estudianteId).in("grupo_id", grupoIds).eq("estado", "activa")
          .overrideTypes<{ grupo_id: string }[], { merge: false }>()
      : Promise.resolve({ data: [], error: null }),
    // Matrículas en grupos de este curso que ya no están en la oferta (en curso): migración mis_cursos_v5.
    supabase.rpc("mis_cursos"),
  ])
  if (solicitudes.error || matriculas.error) {
    console.error("[inscripcion] estado del estudiante", solicitudes.error?.code ?? matriculas.error?.code)
    return null
  }

  // Comprobantes enviados y aún sin revisar (RLS: pagos de sus propias solicitudes).
  const ids = (solicitudes.data ?? []).map((s) => s.id)
  const { data: pagos } = ids.length
    ? await supabase.from("pagos").select("solicitud_id").in("solicitud_id", ids).eq("estado", "pendiente")
        .overrideTypes<{ solicitud_id: string }[], { merge: false }>()
    : { data: [] as { solicitud_id: string }[] }
  const enRevision = new Set((pagos ?? []).map((p) => p.solicitud_id))

  const porGrupo: Record<string, EstadoEnGrupo> = {}
  for (const s of solicitudes.data ?? []) {
    if (reservaVencida(s.estado, s.reserva_vence_en)) continue
    // Una reserva vigente pesa más que una solicitud pendiente del mismo grupo.
    if (porGrupo[s.grupo_id]?.tipo === "solicitud" && s.estado !== "reservada") continue
    porGrupo[s.grupo_id] = { tipo: "solicitud", estado: s.estado, solicitud: s.tipo, id: s.id, importe: Number(s.importe_esperado), pagoEnRevision: enRevision.has(s.id) }
  }
  for (const m of matriculas.data ?? []) porGrupo[m.grupo_id] = { tipo: "matriculado" }

  const enOtroGrupo = !misCursos.error && Array.isArray(misCursos.data)
    ? (misCursos.data as { curso_id: string; estado: string }[]).some((c) => c.curso_id === cursoId && c.estado === "activa")
    : false
  return { porGrupo, matriculadoEnCurso: enOtroGrupo || Object.values(porGrupo).some((e) => e.tipo === "matriculado") }
}
