import { calcular, resultadoSegun, type Calculo } from "@/lib/evaluaciones/calculo"

/**
 * Notas que ve el ESTUDIANTE (puro, sin Supabase).
 *
 * Con la publicación activa (aula_academica_v5), solo cuentan las evaluaciones
 * publicadas; la RLS ya oculta las notas en borrador y aquí se filtra otra vez
 * por si acaso. Sin la migración, la regla anterior: toda nota registrada es visible.
 *
 * - Pendiente nunca es cero: el promedio parcial se normaliza con el peso de las
 *   evaluaciones calificadas y se presenta como PROVISIONAL.
 * - El promedio final solo existe con todos los pesos (100 %) y todas las notas
 *   visibles; el resultado OFICIAL es siempre matriculas.estado_final.
 */

export type EvaluacionAlumno = { id: string; nombre: string; peso: number; fecha: string | null; publicada_en?: string | null }
/**
 * `visible`: la fila ya llegó filtrada por RLS para el estudiante (nota publicada
 * por evaluación o publicada directamente al guardarla).
 */
export type NotaAlumno = { evaluacion_id: string; nota: number; visible?: boolean }

export type EstadoEvaluacionAlumno = "calificado" | "pendiente"

export type TarjetaEvaluacion = EvaluacionAlumno & { nota: number | null; estado: EstadoEvaluacionAlumno }

export type ResumenNotas = {
  tarjetas: TarjetaEvaluacion[]
  calculo: Calculo
  /** Suma de pesos de las evaluaciones ya calificadas y visibles (0–100). */
  pesoCalificado: number
  /** Resultado que daría el promedio final (null si aún no hay promedio final). */
  resultadoPrevisto: "aprobado" | "desaprobado" | null
}

export function resumenNotasAlumno(
  evaluaciones: EvaluacionAlumno[],
  notas: NotaAlumno[],
  opciones: { publicacionActiva: boolean; notaAprobatoria?: number | null }
): ResumenNotas {
  const visibles = opciones.publicacionActiva ? new Set(evaluaciones.filter((e) => e.publicada_en).map((e) => e.id)) : new Set(evaluaciones.map((e) => e.id))
  const notasVisibles = notas.filter((n) => (visibles.has(n.evaluacion_id) || n.visible === true) && Number.isFinite(n.nota))
  const porEval = new Map(notasVisibles.map((n) => [n.evaluacion_id, n.nota]))
  const ordenadas = [...evaluaciones].sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999") || a.nombre.localeCompare(b.nombre, "es"))
  const tarjetas = ordenadas.map((e) => {
    const nota = porEval.get(e.id) ?? null
    return { ...e, nota, estado: (nota === null ? "pendiente" : "calificado") as EstadoEvaluacionAlumno }
  })
  const calculo = calcular(evaluaciones, notasVisibles)
  const pesoCalificado = Math.round(tarjetas.filter((t) => t.nota !== null).reduce((s, t) => s + Math.round(t.peso * 100), 0)) / 100
  const resultadoPrevisto = opciones.notaAprobatoria == null ? null : resultadoSegun(calculo.promedio, opciones.notaAprobatoria)
  return { tarjetas, calculo, pesoCalificado, resultadoPrevisto }
}
