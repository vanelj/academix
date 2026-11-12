/**
 * Horario semanal (puro): agrupa las sesiones REALES de la tabla horarios por
 * día de la semana. No inventa fechas ni sesiones: solo repite lo registrado
 * (día, hora de inicio y fin) para los grupos vigentes.
 */

export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const

export type Sesion = {
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  curso: string
  grupo: string
  institucion?: string | null
  docente?: string | null
  modalidad?: string
  /** Solo se muestra si es un enlace https válido. */
  enlace?: string | null
  /** Periodo del grupo, para que se entienda desde y hasta cuándo aplica. */
  desde?: string
  hasta?: string
}

export type DiaConSesiones = { dia: number; nombre: string; sesiones: Sesion[] }

const hhmm = (h: string) => h.slice(0, 5)

export function agruparPorDia(sesiones: Sesion[]): DiaConSesiones[] {
  const dias: DiaConSesiones[] = []
  for (let d = 1; d <= 7; d++) {
    const delDia = sesiones
      .filter((s) => s.dia_semana === d)
      .map((s) => ({ ...s, hora_inicio: hhmm(s.hora_inicio), hora_fin: hhmm(s.hora_fin) }))
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio) || a.curso.localeCompare(b.curso, "es"))
    if (delDia.length) dias.push({ dia: d, nombre: DIAS[d - 1], sesiones: delDia })
  }
  return dias
}

/** Detecta cruces de horario entre sesiones del mismo día (útil para el estudiante con varias instituciones). */
export function hayCruce(a: Pick<Sesion, "dia_semana" | "hora_inicio" | "hora_fin">, b: Pick<Sesion, "dia_semana" | "hora_inicio" | "hora_fin">) {
  return a.dia_semana === b.dia_semana && hhmm(a.hora_inicio) < hhmm(b.hora_fin) && hhmm(b.hora_inicio) < hhmm(a.hora_fin)
}

/** Enlace de clase solo si es https (evita javascript:, http sin cifrar o textos sueltos). */
export function enlaceSeguro(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url.trim())
    return u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

/** Grupos cuyo horario semanal sigue vigente (no terminados ni cancelados). */
export const grupoVigente = (estado: string | null | undefined) => estado === "programado" || estado === "abierto" || estado === "en_curso"
