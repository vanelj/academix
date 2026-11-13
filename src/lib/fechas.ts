/**
 * Fechas y horas de Academix (puro: servidor y navegador).
 *
 * Regla única:
 *  - Los INSTANTES (timestamptz: pagos, solicitudes, matrículas, avisos…) se
 *    guardan en UTC (Postgres) y se MUESTRAN siempre en la zona operativa de
 *    Academix, America/Lima. Nunca se suma ni se resta horas a mano.
 *  - Las FECHAS DE CALENDARIO ("AAAA-MM-DD": inicio de grupo, vencimiento de
 *    cuota) no tienen hora: se muestran tal cual, sin conversión de zona.
 *  - La hora del servidor (UTC en Vercel) y la del dispositivo NO se usan para
 *    presentar: un formateador sin `timeZone` cambia de resultado según dónde
 *    se ejecute (ese era el desfase de 5 horas en los comprobantes).
 *  - La autoridad para vencimientos y aprobaciones es la base de datos (now()).
 */

export const ZONA_ACADEMIX = "America/Lima"

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

type Entrada = string | number | Date

/** Formateador de INSTANTES en hora de Lima. */
export function formatoInstante(opciones: Omit<Intl.DateTimeFormatOptions, "timeZone">): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("es-PE", { ...opciones, timeZone: ZONA_ACADEMIX })
}

const fechaCalendario = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "UTC" })

/** "AAAA-MM-DD" → "13 nov 2026", sin desfase (no es un instante). */
export const fechaDeCalendario = (iso: string) => fechaCalendario.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))

const fechaHoraLima = formatoInstante({ dateStyle: "medium", timeStyle: "short" })
const soloFechaLima = formatoInstante({ dateStyle: "medium" })

/** Instante → "13 nov 2026, 9:05 a. m." en hora de Lima. */
export const fechaHoraLimaTexto = (v: Entrada) => fechaHoraLima.format(new Date(v))

/** Fecha de un instante en Lima; si recibe "AAAA-MM-DD", la muestra sin conversión. */
export const fechaLimaTexto = (v: Entrada) => (typeof v === "string" && RE_FECHA.test(v) ? fechaDeCalendario(v) : soloFechaLima.format(new Date(v)))

const partesLima = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_ACADEMIX, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
})

/** Fecha ("AAAA-MM-DD") y minutos del día de un instante, en Lima. */
export function enLima(v: Entrada = new Date()): { fecha: string; minutos: number } {
  const p = Object.fromEntries(partesLima.formatToParts(new Date(v)).map((x) => [x.type, x.value]))
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) }
}

/** Hoy en Lima ("AAAA-MM-DD"), sea cual sea la zona del servidor o del navegador. */
export const hoyEnLima = (ahora: Entrada = new Date()) => enLima(ahora).fecha

const RE_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/**
 * «AAAA-MM-DDTHH:mm» escrito en hora de Lima (p. ej. un <input type="datetime-local">)
 * → instante ISO en UTC. El desfase se obtiene de la base de zonas horarias
 * (Intl), no se suma a mano. null si el texto no es válido.
 */
export function instanteDesdeHoraLima(local: string): string | null {
  const m = RE_LOCAL.exec(local.trim())
  if (!m) return null
  const [, a, mes, d, h, min] = m.map(Number)
  const supuesto = Date.UTC(a, mes - 1, d, h, min)
  if (Number.isNaN(supuesto)) return null
  // Lo que marcaría el reloj de Lima en ese instante supuesto → desfase real.
  const p = Object.fromEntries(partesLima.formatToParts(new Date(supuesto)).map((x) => [x.type, x.value]))
  const enLimaMs = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
  const real = new Date(supuesto - (enLimaMs - supuesto))
  return Number.isNaN(real.getTime()) ? null : real.toISOString()
}

/** Instante → «AAAA-MM-DDTHH:mm» en hora de Lima (para rellenar un datetime-local). */
export function horaLimaParaInput(v: Entrada): string {
  const p = Object.fromEntries(partesLima.formatToParts(new Date(v)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
