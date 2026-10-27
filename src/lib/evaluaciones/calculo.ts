/**
 * Cálculo académico (puro). Replica EXACTAMENTE la regla de la BD
 * (registrar_resultado_final / promedio_matricula): promedio ponderado
 * = Σ(nota × peso) / 100, redondeado a 2 decimales, solo si los pesos del
 * grupo suman 100 % y la matrícula tiene todas sus notas. Se calcula con
 * enteros (centésimas) para evitar errores de coma flotante.
 *
 * Aquí solo se MUESTRA un resultado provisional: el resultado final lo
 * registra la BD con sus propias comprobaciones.
 */

export type EvaluacionCalculo = { id: string; peso: number }
export type NotaCalculo = { evaluacion_id: string; nota: number }

export type EstadoCalculo = "sin_evaluaciones" | "pesos_incompletos" | "notas_pendientes" | "completo"

export type Calculo = {
  estado: EstadoCalculo
  pesoTotal: number
  registradas: number
  faltantes: number
  /** Promedio final; null si falta algo. */
  promedio: number | null
  /** Avance: promedio sobre las evaluaciones con nota (orientativo). */
  parcial: number | null
}

const cent = (v: number) => Math.round(v * 100)

export function pesoTotal(evaluaciones: EvaluacionCalculo[]) {
  return evaluaciones.reduce((s, e) => s + cent(e.peso), 0) / 100
}

export function calcular(evaluaciones: EvaluacionCalculo[], notas: NotaCalculo[]): Calculo {
  const total = pesoTotal(evaluaciones)
  const porEval = new Map(notas.map((n) => [n.evaluacion_id, n.nota]))
  const conNota = evaluaciones.filter((e) => porEval.has(e.id))
  const faltantes = evaluaciones.length - conNota.length

  // Σ(nota × peso) en unidades de 1e-4; el promedio en centésimas redondea a la mitad hacia arriba.
  const suma = conNota.reduce((s, e) => s + cent(porEval.get(e.id)!) * cent(e.peso), 0)
  const pesoConNota = conNota.reduce((s, e) => s + cent(e.peso), 0)
  const parcial = pesoConNota > 0 ? Math.floor((suma * 100) / pesoConNota / 100 + 0.5) / 100 : null

  let estado: EstadoCalculo = "completo"
  if (evaluaciones.length === 0) estado = "sin_evaluaciones"
  else if (cent(total) !== 10000) estado = "pesos_incompletos"
  else if (faltantes > 0) estado = "notas_pendientes"

  const promedio = estado === "completo" ? Math.floor(suma / 10000 + 0.5) / 100 : null
  return { estado, pesoTotal: total, registradas: conNota.length, faltantes, promedio, parcial }
}

export function resultadoSegun(promedio: number | null, notaAprobatoria: number): "aprobado" | "desaprobado" | null {
  if (promedio === null) return null
  return cent(promedio) >= cent(notaAprobatoria) ? "aprobado" : "desaprobado"
}

export const ETIQUETA_CALCULO: Record<EstadoCalculo, string> = {
  sin_evaluaciones: "Sin evaluaciones",
  pesos_incompletos: "Pesos incompletos",
  notas_pendientes: "Notas pendientes",
  completo: "Notas completas",
}
