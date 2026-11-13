/**
 * Programación automática de un grupo (pura, sin Next.js ni Supabase).
 *
 * La institución define UNA vez: fecha de inicio, días con su horario (tabla
 * horarios: puede ser distinto por día) y UN criterio de duración (semanas,
 * sesiones u horas reloj). Academix calcula las fechas de clase, la cantidad de
 * sesiones, las horas reloj y la fecha de fin. Las sesiones NO se guardan en la
 * base de datos: se derivan siempre de horarios + fechas del grupo, así que
 * guardar o editar nunca duplica clases.
 *
 * - Fechas «AAAA-MM-DD» en la zona académica (America/Lima); la aritmética es
 *   en UTC, de modo que los cambios de mes y año no tienen casos especiales.
 * - No descuenta feriados (no hay feriados configurados).
 * - Horas RELOJ (60 min). Las horas académicas solo se calculan si la
 *   institución indica cuántos minutos dura su hora académica: no se asume
 *   ninguna equivalencia.
 */

import { diaSemana, esFecha, hhmm, sumarDias } from "@/lib/horarios/calendario"

export type FranjaProgramacion = { dia_semana: number; hora_inicio: string; hora_fin: string }

export type CriterioDuracion =
  | { tipo: "semanas"; valor: number }
  | { tipo: "sesiones"; valor: number }
  | { tipo: "horas"; valor: number }

export type SesionProgramada = { numero: number; fecha: string; dia_semana: number; hora_inicio: string; hora_fin: string; minutos: number }

export type Programacion = {
  sesiones: SesionProgramada[]
  totalSesiones: number
  minutosReloj: number
  horasReloj: number
  fechaInicio: string
  fechaFin: string
  /** Semanas calendario que abarca (de la semana de inicio a la del fin). */
  semanas: number
  /** Solo con criterio «horas»: la última sesión supera el objetivo (no se corta una clase). */
  excedenteMinutos: number
}

export type ResultadoProgramacion = { ok: true; programacion: Programacion } | { ok: false; errores: string[] }

export const LIMITES = { semanas: 104, sesiones: 500, horas: 2000 } as const

const minutos = (h: string) => {
  const [a, b] = hhmm(h).split(":").map(Number)
  return a * 60 + b
}

/** Valida las franjas semanales: al menos una, horas coherentes y sin cruces el mismo día. */
export function validarFranjas(franjas: FranjaProgramacion[]): string[] {
  const errores: string[] = []
  if (franjas.length === 0) errores.push("Agrega al menos un día con su horario.")
  for (const f of franjas) {
    if (!(f.dia_semana >= 1 && f.dia_semana <= 7)) errores.push("Hay un día de la semana no válido.")
    if (!/^\d{2}:\d{2}/.test(f.hora_inicio) || !/^\d{2}:\d{2}/.test(f.hora_fin) || minutos(f.hora_fin) <= minutos(f.hora_inicio)) {
      errores.push("Cada horario necesita una hora de fin posterior a la de inicio.")
    }
  }
  for (let i = 0; i < franjas.length; i++) {
    for (let j = i + 1; j < franjas.length; j++) {
      const a = franjas[i]
      const b = franjas[j]
      if (a.dia_semana === b.dia_semana && minutos(a.hora_inicio) < minutos(b.hora_fin) && minutos(b.hora_inicio) < minutos(a.hora_fin)) {
        errores.push("Dos horarios del mismo día se cruzan.")
      }
    }
  }
  return [...new Set(errores)]
}

function validarCriterio(c: CriterioDuracion): string | null {
  if (!Number.isFinite(c.valor) || c.valor <= 0) return "Indica una duración mayor que cero."
  if ((c.tipo === "semanas" || c.tipo === "sesiones") && !Number.isInteger(c.valor)) return `El número de ${c.tipo} debe ser entero.`
  if (c.valor > LIMITES[c.tipo]) return `La duración máxima es ${LIMITES[c.tipo]} ${c.tipo === "horas" ? "horas" : c.tipo}.`
  return null
}

/** Calcula el calendario del grupo a partir del inicio, sus horarios y UN criterio de duración. */
export function programar(fechaInicio: string, franjas: FranjaProgramacion[], criterio: CriterioDuracion): ResultadoProgramacion {
  const errores = validarFranjas(franjas)
  if (!esFecha(fechaInicio)) errores.push("Indica una fecha de inicio válida.")
  const errCriterio = validarCriterio(criterio)
  if (errCriterio) errores.push(errCriterio)
  if (errores.length) return { ok: false, errores }

  const ordenadas = [...franjas].sort((a, b) => a.dia_semana - b.dia_semana || minutos(a.hora_inicio) - minutos(b.hora_inicio))
  const sesiones: SesionProgramada[] = []
  let acumulado = 0
  const limiteFecha = criterio.tipo === "semanas" ? sumarDias(fechaInicio, criterio.valor * 7 - 1) : sumarDias(fechaInicio, 366 * 3)
  const objetivoMin = criterio.tipo === "horas" ? Math.round(criterio.valor * 60) : Infinity

  for (let fecha = fechaInicio; fecha <= limiteFecha; fecha = sumarDias(fecha, 1)) {
    const dia = diaSemana(fecha)
    for (const f of ordenadas) {
      if (f.dia_semana !== dia) continue
      const m = minutos(f.hora_fin) - minutos(f.hora_inicio)
      sesiones.push({ numero: sesiones.length + 1, fecha, dia_semana: dia, hora_inicio: hhmm(f.hora_inicio), hora_fin: hhmm(f.hora_fin), minutos: m })
      acumulado += m
      if (criterio.tipo === "sesiones" && sesiones.length >= criterio.valor) break
      if (criterio.tipo === "horas" && acumulado >= objetivoMin) break
    }
    if (criterio.tipo === "sesiones" && sesiones.length >= criterio.valor) break
    if (criterio.tipo === "horas" && acumulado >= objetivoMin) break
  }

  if (sesiones.length === 0) return { ok: false, errores: ["Con esos días no hay ninguna clase dentro del periodo."] }
  if (criterio.tipo === "sesiones" && sesiones.length < criterio.valor) return { ok: false, errores: ["La duración supera el límite de planificación (3 años)."] }
  if (criterio.tipo === "horas" && acumulado < objetivoMin) return { ok: false, errores: ["La duración supera el límite de planificación (3 años)."] }

  const fechaFin = criterio.tipo === "semanas" ? limiteFecha : sesiones[sesiones.length - 1].fecha
  const lunesInicio = sumarDias(fechaInicio, 1 - diaSemana(fechaInicio))
  const lunesFin = sumarDias(fechaFin, 1 - diaSemana(fechaFin))
  const semanas = Math.round((Date.parse(`${lunesFin}T00:00:00Z`) - Date.parse(`${lunesInicio}T00:00:00Z`)) / (7 * 86400000)) + 1
  return {
    ok: true,
    programacion: {
      sesiones,
      totalSesiones: sesiones.length,
      minutosReloj: acumulado,
      horasReloj: Math.round((acumulado / 60) * 100) / 100,
      fechaInicio,
      fechaFin,
      semanas,
      excedenteMinutos: criterio.tipo === "horas" ? acumulado - objetivoMin : 0,
    },
  }
}

/** Horas académicas SOLO si la institución indica la duración de su hora académica (minutos). */
export function horasAcademicas(minutosReloj: number, minutosPorHoraAcademica: number | null | undefined): number | null {
  if (!minutosPorHoraAcademica || !Number.isFinite(minutosPorHoraAcademica) || minutosPorHoraAcademica < 15 || minutosPorHoraAcademica > 120) return null
  return Math.round((minutosReloj / minutosPorHoraAcademica) * 100) / 100
}

/**
 * Carga DECLARADA del curso frente a horas académicas PROGRAMADAS del grupo.
 * Tolerancia: media hora académica (la última sesión no se corta). null = no
 * hay con qué comparar o coinciden.
 */
export function comparaCarga(declaradas: number | null | undefined, programadas: number | null): "menos" | "mas" | null {
  if (declaradas == null || programadas == null || !Number.isFinite(declaradas) || declaradas <= 0) return null
  if (programadas < declaradas - 0.5) return "menos"
  if (programadas > declaradas + 0.5) return "mas"
  return null
}

/** «1 h 30 min» */
export function duracionLegible(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`
}
