/**
 * Calendario académico (puro, sin Next.js ni Supabase).
 *
 * Proyecta los horarios SEMANALES reales de cada grupo (tabla horarios) sobre
 * fechas concretas, solo dentro del periodo del grupo (fecha_inicio..fecha_fin)
 * y nunca para grupos cancelados. No crea sesiones en la base de datos ni
 * inventa clases: si un grupo no tiene horario, no aparece.
 *
 * Fechas como texto «AAAA-MM-DD» y horas «HH:MM» en la zona horaria de la
 * institución (America/Lima): la aritmética se hace en UTC para que el
 * resultado no dependa de la zona del navegador ni del servidor.
 */

export const ZONA_ACADEMICA = "America/Lima"
export const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const
export const DIAS_LARGOS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const

export type Franja = {
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  /** Enlace https de la clase virtual (solo para quien ya está autorizado). */
  enlace?: string | null
  /** Aula, sede o ubicación de la clase presencial. */
  ubicacion?: string | null
}

export type AccesoRapido = { etiqueta: string; href: string }

export type GrupoCalendario = {
  /** Identificador estable (grupo o matrícula). */
  clave: string
  curso: string
  grupo: string
  institucion?: string | null
  docente?: string | null
  /** cursos.modalidad: virtual | presencial | mixta. */
  modalidad?: string | null
  estado?: string | null
  desde: string
  hasta: string
  franjas: Franja[]
  /** Accesos del perfil (aula, estudiantes, notas…), rutas internas. */
  accesos?: AccesoRapido[]
}

export type ModalidadSesion = "virtual" | "presencial" | "virtual_presencial" | null

export type Clase = {
  id: string
  fecha: string
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  grupo: GrupoCalendario
  /** Posición del grupo en la lista (para el color). */
  indice: number
  enlace: string | null
  ubicacion: string | null
  modalidad: ModalidadSesion
  /** Se superpone con otra clase de OTRO grupo el mismo día. */
  cruce: boolean
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const aUtc = (f: string) => new Date(`${f}T00:00:00Z`)
const aTexto = (d: Date) => d.toISOString().slice(0, 10)

export const esFecha = (f: unknown): f is string => typeof f === "string" && RE_FECHA.test(f) && !Number.isNaN(aUtc(f).getTime()) && aTexto(aUtc(f)) === f

export function sumarDias(fecha: string, dias: number): string {
  const d = aUtc(fecha)
  d.setUTCDate(d.getUTCDate() + dias)
  return aTexto(d)
}

/** 1 = lunes … 7 = domingo (igual que horarios.dia_semana). */
export function diaSemana(fecha: string): number {
  const d = aUtc(fecha).getUTCDay()
  return d === 0 ? 7 : d
}

export const inicioSemana = (fecha: string) => sumarDias(fecha, 1 - diaSemana(fecha))
export const inicioMes = (fecha: string) => `${fecha.slice(0, 7)}-01`

export function sumarMeses(fecha: string, meses: number): string {
  const d = aUtc(inicioMes(fecha))
  d.setUTCMonth(d.getUTCMonth() + meses)
  return aTexto(d)
}

export function finMes(fecha: string): string {
  return sumarDias(sumarMeses(fecha, 1), -1)
}

export function rangoFechas(desde: string, hasta: string): string[] {
  const salida: string[] = []
  for (let f = desde; f <= hasta && salida.length < 400; f = sumarDias(f, 1)) salida.push(f)
  return salida
}

/** Fecha y hora actuales en la zona académica. */
export function ahoraAcademico(ahora: Date = new Date()): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_ACADEMICA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ahora)
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "00"
  return { fecha: `${v("year")}-${v("month")}-${v("day")}`, hora: `${v("hour")}:${v("minute")}` }
}

/** Semanas (lunes a domingo) que cubren el mes de `fecha`. */
export function semanasDelMes(fecha: string): string[][] {
  const desde = inicioSemana(inicioMes(fecha))
  const hasta = sumarDias(inicioSemana(finMes(fecha)), 6)
  const dias = rangoFechas(desde, hasta)
  const semanas: string[][] = []
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7))
  return semanas
}

// ---------------------------------------------------------------------------
// Horas
// ---------------------------------------------------------------------------

export const hhmm = (h: string) => h.slice(0, 5)

/** «19:00» → «7:00 p. m.» */
export function horaLegible(h: string): string {
  const [hs, ms] = hhmm(h).split(":").map(Number)
  const sufijo = hs >= 12 ? "p. m." : "a. m."
  const h12 = hs % 12 === 0 ? 12 : hs % 12
  return `${h12}:${String(ms).padStart(2, "0")} ${sufijo}`
}

export const rangoHora = (inicio: string, fin: string) => `${horaLegible(inicio)} – ${horaLegible(fin)}`

const minutos = (h: string) => {
  const [a, b] = hhmm(h).split(":").map(Number)
  return a * 60 + b
}

// ---------------------------------------------------------------------------
// Clases
// ---------------------------------------------------------------------------

export function enlaceHttps(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url.trim())
    return u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

/** Modalidad de una sesión según lo registrado; si no hay datos, la del curso (salvo «mixta»). */
export function modalidadSesion(franja: Franja, modalidadCurso?: string | null): ModalidadSesion {
  const virtual = Boolean(enlaceHttps(franja.enlace))
  const presencial = Boolean(franja.ubicacion?.trim())
  if (virtual && presencial) return "virtual_presencial"
  if (virtual) return "virtual"
  if (presencial) return "presencial"
  if (modalidadCurso === "virtual" || modalidadCurso === "presencial") return modalidadCurso
  return null
}

export const ETIQUETA_MODALIDAD: Record<Exclude<ModalidadSesion, null>, string> = {
  virtual: "Virtual",
  presencial: "Presencial",
  virtual_presencial: "Virtual y presencial",
}

const vigente = (g: GrupoCalendario) => g.estado !== "cancelado" && esFecha(g.desde) && esFecha(g.hasta) && g.desde <= g.hasta

/** Clases reales entre `desde` y `hasta` (inclusive), ordenadas por fecha y hora, con cruces marcados. */
export function clasesEnRango(grupos: GrupoCalendario[], desde: string, hasta: string): Clase[] {
  const clases: Clase[] = []
  grupos.forEach((g, indice) => {
    if (!vigente(g)) return
    const ini = g.desde > desde ? g.desde : desde
    const fin = g.hasta < hasta ? g.hasta : hasta
    if (ini > fin) return
    for (const fecha of rangoFechas(ini, fin)) {
      const dia = diaSemana(fecha)
      for (const f of g.franjas) {
        if (f.dia_semana !== dia || minutos(f.hora_fin) <= minutos(f.hora_inicio)) continue
        clases.push({
          id: `${g.clave}|${fecha}|${hhmm(f.hora_inicio)}`,
          fecha,
          dia_semana: dia,
          hora_inicio: hhmm(f.hora_inicio),
          hora_fin: hhmm(f.hora_fin),
          grupo: g,
          indice,
          enlace: enlaceHttps(f.enlace),
          ubicacion: f.ubicacion?.trim() || null,
          modalidad: modalidadSesion(f, g.modalidad),
          cruce: false,
        })
      }
    }
  })
  clases.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio) || a.grupo.curso.localeCompare(b.grupo.curso, "es"))
  for (let i = 0; i < clases.length; i++) {
    for (let j = i + 1; j < clases.length && clases[j].fecha === clases[i].fecha; j++) {
      const a = clases[i]
      const b = clases[j]
      if (a.grupo.clave !== b.grupo.clave && minutos(a.hora_inicio) < minutos(b.hora_fin) && minutos(b.hora_inicio) < minutos(a.hora_fin)) {
        a.cruce = true
        b.cruce = true
      }
    }
  }
  return clases
}

const GENERICAS = new Set([
  "curso", "cursos", "taller", "programa", "programación", "programacion", "introducción", "introduccion", "fundamentos", "diplomado",
  "especialización", "especializacion", "básico", "basico", "intermedio", "avanzado", "nivel", "cero", "desde", "de", "del", "con",
  "para", "la", "el", "los", "las", "y", "e", "en", "a", "al", "i", "ii", "iii",
])

/**
 * Nombre corto de un curso para celdas pequeñas del calendario mensual:
 * «Programación con Python desde Cero» → «Python», «Excel Avanzado» → «Excel».
 * Si todo es genérico, la primera palabra. Máximo 14 caracteres.
 */
export function nombreCortoCurso(nombre: string): string {
  const palabras = nombre.replace(/[«»"()[\]:,.;]/g, " ").split(/\s+/).filter(Boolean)
  const util = palabras.find((p) => !GENERICAS.has(p.toLocaleLowerCase("es"))) ?? palabras[0] ?? nombre
  return util.length > 14 ? `${util.slice(0, 13)}…` : util
}

/** Primera y última fecha entre `desde` y `hasta` que caen en `dia` (1 = lunes). null si ninguna. */
export function fechasDelDia(desde: string, hasta: string, dia: number): { primera: string; ultima: string } | null {
  if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) return null
  const primera = sumarDias(desde, (dia - diaSemana(desde) + 7) % 7)
  if (primera > hasta) return null
  const ultima = sumarDias(hasta, -((diaSemana(hasta) - dia + 7) % 7))
  return { primera, ultima }
}

/** Periodo, día y horas en que dos programaciones coinciden DE VERDAD. */
export type Coincidencia = { dia: number; desde: string; hasta: string; inicio: string; fin: string }

type Programado = { desde: string; hasta: string; franjas: Pick<Franja, "dia_semana" | "hora_inicio" | "hora_fin">[] }

/**
 * Coincidencias reales entre dos programaciones: mismo día de la semana, horas
 * que se superponen y AL MENOS UNA FECHA de ese día dentro de ambos periodos.
 * Un horario parecido en meses distintos (o un lunes en un periodo que no
 * contiene lunes comunes) no es un cruce. Base única de todos los avisos de cruce.
 */
export function coincidencias(a: Programado, b: Programado): Coincidencia[] {
  const desde = a.desde > b.desde ? a.desde : b.desde
  const hasta = a.hasta < b.hasta ? a.hasta : b.hasta
  if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) return []
  const salida: Coincidencia[] = []
  for (const fa of a.franjas) {
    for (const fb of b.franjas) {
      if (fa.dia_semana !== fb.dia_semana) continue
      const ini = Math.max(minutos(fa.hora_inicio), minutos(fb.hora_inicio))
      const fin = Math.min(minutos(fa.hora_fin), minutos(fb.hora_fin))
      if (ini >= fin) continue
      const fechas = fechasDelDia(desde, hasta, fa.dia_semana)
      if (!fechas) continue
      const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
      salida.push({ dia: fa.dia_semana, desde: fechas.primera, hasta: fechas.ultima, inicio: hh(ini), fin: hh(fin) })
    }
  }
  return salida
}

/** Cruces semanales entre franjas de grupos distintos con fechas que realmente coinciden. */
export function crucesSemanales(grupos: GrupoCalendario[]): { a: GrupoCalendario; b: GrupoCalendario; dia: number }[] {
  const salida: { a: GrupoCalendario; b: GrupoCalendario; dia: number }[] = []
  const vigentes = grupos.filter(vigente)
  for (let i = 0; i < vigentes.length; i++) {
    for (let j = i + 1; j < vigentes.length; j++) {
      const c = coincidencias(vigentes[i], vigentes[j])[0]
      if (c) salida.push({ a: vigentes[i], b: vigentes[j], dia: c.dia })
    }
  }
  return salida
}

/** Cruce del docente con UNO de sus otros grupos (datos ya filtrados por privacidad). */
export type CruceDocente = Coincidencia & {
  curso: string
  grupo: string
  /** Nombre de la institución; null si es OTRA institución (no se revela cuál ni su curso). */
  institucion: string | null
  otraInstitucion: boolean
  /** Franja completa del otro grupo (p. ej. 19:00–21:00). */
  franjaOtro: string
}

export type OtroGrupoDocente = Programado & { curso: string; grupo: string; institucion: string | null; otraInstitucion: boolean; estado?: string | null }

/** Cruces de una programación propuesta con los demás grupos vigentes del docente. */
export function crucesDocente(propuesta: Programado, otros: OtroGrupoDocente[]): CruceDocente[] {
  const salida: CruceDocente[] = []
  for (const o of otros) {
    if (o.estado === "cancelado" || o.estado === "cerrado") continue
    for (const c of coincidencias(propuesta, o)) {
      const franja = o.franjas.find((f) => f.dia_semana === c.dia && minutos(f.hora_inicio) < minutos(c.fin) && minutos(c.inicio) < minutos(f.hora_fin))
      salida.push({
        ...c,
        curso: o.curso,
        grupo: o.grupo,
        institucion: o.institucion,
        otraInstitucion: o.otraInstitucion,
        franjaOtro: franja ? `${hhmm(franja.hora_inicio)} a ${hhmm(franja.hora_fin)}` : `${c.inicio} a ${c.fin}`,
      })
    }
  }
  return salida.sort((x, y) => x.desde.localeCompare(y.desde) || x.dia - y.dia)
}

const fechaCruce = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const fc = (f: string) => fechaCruce.format(new Date(`${f}T00:00:00Z`))

/**
 * «Este docente ya tiene asignado Programación con Python los lunes de 19:00 a
 * 21:00. Existe un cruce de horario.» + grupo, horas afectadas y periodo.
 */
export function mensajeCruce(c: CruceDocente): string {
  const dia = DIAS_LARGOS[c.dia - 1].toLowerCase()
  const plural = dia.endsWith("s") ? dia : `${dia}s`
  if (c.otraInstitucion) {
    return `Este docente ya tiene una clase en otra institución los ${plural} de ${c.franjaOtro}. Existe un cruce de horario de ${c.inicio} a ${c.fin} (del ${fc(c.desde)} al ${fc(c.hasta)}).`
  }
  return `Este docente ya tiene asignado ${c.curso} los ${plural} de ${c.franjaOtro}. Existe un cruce de horario: grupo ${c.grupo}${c.institucion ? ` (${c.institucion})` : ""}, horas afectadas ${c.inicio} a ${c.fin}, del ${fc(c.desde)} al ${fc(c.hasta)}.`
}

export type EstadoClase = "en_curso" | "proxima" | "terminada"

/** Estado respecto a «ahora» (zona académica). */
export function estadoClase(c: Pick<Clase, "fecha" | "hora_inicio" | "hora_fin">, ahora: { fecha: string; hora: string }): EstadoClase {
  if (c.fecha < ahora.fecha) return "terminada"
  if (c.fecha > ahora.fecha) return "proxima"
  const m = minutos(ahora.hora)
  if (m >= minutos(c.hora_fin)) return "terminada"
  if (m >= minutos(c.hora_inicio)) return "en_curso"
  return "proxima"
}

/** «Unirse a clase» se destaca desde 15 minutos antes del inicio hasta el final. */
export function puedeUnirseAhora(c: Pick<Clase, "fecha" | "hora_inicio" | "hora_fin" | "enlace">, ahora: { fecha: string; hora: string }): boolean {
  if (!c.enlace || c.fecha !== ahora.fecha) return false
  const m = minutos(ahora.hora)
  return m >= minutos(c.hora_inicio) - 15 && m < minutos(c.hora_fin)
}

/** Próxima clase (o la que está en curso) dentro de los próximos `dias` días; null si no hay datos suficientes. */
export function proximaClase(grupos: GrupoCalendario[], ahora: { fecha: string; hora: string }, dias = 120): Clase | null {
  const clases = clasesEnRango(grupos, ahora.fecha, sumarDias(ahora.fecha, dias))
  return clases.find((c) => estadoClase(c, ahora) !== "terminada") ?? null
}

/** Paleta estable por curso (índice). */
export const COLORES_CURSO = [
  "border-l-sky-500 bg-sky-500/10",
  "border-l-violet-500 bg-violet-500/10",
  "border-l-emerald-500 bg-emerald-500/10",
  "border-l-amber-500 bg-amber-500/10",
  "border-l-rose-500 bg-rose-500/10",
  "border-l-cyan-500 bg-cyan-500/10",
] as const
export const PUNTOS_CURSO = ["bg-sky-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"] as const
export const colorCurso = (indice: number) => COLORES_CURSO[indice % COLORES_CURSO.length]
export const puntoCurso = (indice: number) => PUNTOS_CURSO[indice % PUNTOS_CURSO.length]
