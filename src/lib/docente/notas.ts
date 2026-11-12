/**
 * Reglas puras del registro de notas (navegador y servidor).
 * Escala de V5: 0 a 20 con hasta 2 decimales (calificaciones.nota numeric(4,2)).
 * Una celda vacía significa «sin nota» (pendiente), nunca cero.
 */

export const NOTA_MIN = 0
export const NOTA_MAX = 20
export const MAX_CAMBIOS = 2000

export type LecturaNota = { ok: true; nota: number | null } | { ok: false; mensaje: string }

/** Interpreta lo que escribe el docente: «15», «15.5» o «15,5»; vacío = sin nota. */
export function leerNota(texto: string): LecturaNota {
  const t = texto.trim().replace(",", ".")
  if (t === "") return { ok: true, nota: null }
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return { ok: false, mensaje: "Usa un número de 0 a 20, con hasta 2 decimales." }
  const nota = Number(t)
  if (nota < NOTA_MIN || nota > NOTA_MAX) return { ok: false, mensaje: "La nota debe estar entre 0 y 20." }
  return { ok: true, nota }
}

/** Texto de una nota guardada para el campo («15», «15.5», «15.25»). */
export const textoNota = (nota: number | null | undefined) => (nota == null ? "" : String(Number(nota.toFixed(2))))

export type CambioNota = { matriculaId: string; evaluacionId: string; nota: string }
export type ErrorNota = { matriculaId: string; evaluacionId: string; mensaje: string }

export type PlanNotas = {
  insertar: { matriculaId: string; evaluacionId: string; nota: number }[]
  actualizar: { id: string; matriculaId: string; evaluacionId: string; nota: number }[]
  borrar: { id: string; matriculaId: string; evaluacionId: string }[]
  errores: ErrorNota[]
  sinCambio: number
}

export type ContextoPlan = {
  evaluaciones: Set<string>
  /** Matrículas activas del grupo con su resultado final. */
  matriculas: Map<string, "en_curso" | "aprobado" | "desaprobado">
  /** Notas existentes: clave `${matriculaId}:${evaluacionId}`. */
  existentes: Map<string, { id: string; nota: number }>
}

export const claveNota = (matriculaId: string, evaluacionId: string) => `${matriculaId}:${evaluacionId}`

/**
 * Decide qué hacer con cada celda cambiada. Comprueba en el servidor lo mismo
 * que la BD (evaluación del grupo, matrícula activa, resultado abierto, escala),
 * para dar un error claro por estudiante y evaluación en lugar de uno genérico.
 */
export function planificarNotas(cambios: CambioNota[], ctx: ContextoPlan): PlanNotas {
  const plan: PlanNotas = { insertar: [], actualizar: [], borrar: [], errores: [], sinCambio: 0 }
  const vistos = new Set<string>()
  for (const c of cambios) {
    const clave = claveNota(c.matriculaId, c.evaluacionId)
    if (vistos.has(clave)) continue
    vistos.add(clave)
    const error = (mensaje: string) => plan.errores.push({ matriculaId: c.matriculaId, evaluacionId: c.evaluacionId, mensaje })
    if (!ctx.evaluaciones.has(c.evaluacionId)) { error("La evaluación ya no existe en este grupo. Recarga la página."); continue }
    const resultado = ctx.matriculas.get(c.matriculaId)
    if (!resultado) { error("El estudiante ya no tiene matrícula activa en este grupo."); continue }
    if (resultado !== "en_curso") { error("El resultado final ya está cerrado: la institución debe reabrirlo para cambiar notas."); continue }
    const lectura = leerNota(c.nota)
    if (!lectura.ok) { error(lectura.mensaje); continue }
    const actual = ctx.existentes.get(clave)
    if (lectura.nota === null) {
      if (actual) plan.borrar.push({ id: actual.id, matriculaId: c.matriculaId, evaluacionId: c.evaluacionId })
      else plan.sinCambio++
    } else if (!actual) {
      plan.insertar.push({ matriculaId: c.matriculaId, evaluacionId: c.evaluacionId, nota: lectura.nota })
    } else if (Math.round(actual.nota * 100) !== Math.round(lectura.nota * 100)) {
      plan.actualizar.push({ id: actual.id, matriculaId: c.matriculaId, evaluacionId: c.evaluacionId, nota: lectura.nota })
    } else {
      plan.sinCambio++
    }
  }
  return plan
}
