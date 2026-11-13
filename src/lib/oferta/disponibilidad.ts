/**
 * Disponibilidad de un curso según el estado REAL de cada uno de sus grupos
 * (puro). Un curso puede tener varios grupos con estados distintos: que uno ya
 * haya empezado NO desactiva el curso ni impide abrir otro grupo.
 *
 *   abierto + vacantes      → «Inscripciones abiertas» (único caso inscribible)
 *   abierto sin vacantes    → «Sin vacantes»
 *   programado              → «Próximamente»
 *   en_curso                → «En curso» (sin matrículas ordinarias)
 *   cerrado                 → «Finalizado»
 *   cancelado               → «Cancelado»
 *
 * Esta función solo PRESENTA: la inscripción la vuelven a validar el servidor y
 * la BD (solo se acepta en grupos 'abierto' con vacantes).
 */

export type EstadoGrupoOferta = "programado" | "abierto" | "en_curso" | "cerrado" | "cancelado"

export type GrupoDisponible = {
  id: string
  curso_id: string
  codigo: string
  estado: EstadoGrupoOferta
  fecha_inicio: string
  fecha_fin: string
  vacantes_disponibles: number | null
}

export type EstadoInscripcionGrupo = "abiertas" | "sin_vacantes" | "proximamente" | "en_curso" | "finalizado" | "cancelado"

export function estadoInscripcionGrupo(g: Pick<GrupoDisponible, "estado" | "vacantes_disponibles">): EstadoInscripcionGrupo {
  switch (g.estado) {
    case "abierto":
      return g.vacantes_disponibles !== null && g.vacantes_disponibles <= 0 ? "sin_vacantes" : "abiertas"
    case "programado":
      return "proximamente"
    case "en_curso":
      return "en_curso"
    case "cerrado":
      return "finalizado"
    default:
      return "cancelado"
  }
}

export const ETIQUETA_INSCRIPCION: Record<EstadoInscripcionGrupo | "sin_inscripciones", string> = {
  abiertas: "Inscripciones abiertas",
  sin_vacantes: "Sin vacantes",
  proximamente: "Próximamente",
  en_curso: "En curso",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
  sin_inscripciones: "Sin inscripciones abiertas",
}

/** ¿Admite matrícula ordinaria? Solo grupo abierto con vacantes. */
export const admiteInscripcion = (g: Pick<GrupoDisponible, "estado" | "vacantes_disponibles">) => estadoInscripcionGrupo(g) === "abiertas"

export type DisponibilidadCurso = {
  estado: "abiertas" | "sin_vacantes" | "proximamente" | "en_curso" | "sin_inscripciones"
  etiqueta: string
  /** Grupo recomendado: el abierto con vacantes que empieza antes; si no, el próximo. */
  grupo: GrupoDisponible | null
  abiertos: number
}

const PRIORIDAD: DisponibilidadCurso["estado"][] = ["abiertas", "proximamente", "sin_vacantes", "en_curso"]

/** Estado de un curso a partir de TODOS sus grupos (prioriza lo que admite inscripción). */
export function disponibilidadCurso(grupos: GrupoDisponible[]): DisponibilidadCurso {
  const porEstado = new Map<DisponibilidadCurso["estado"], GrupoDisponible[]>()
  for (const g of grupos) {
    const e = estadoInscripcionGrupo(g)
    if (e === "finalizado" || e === "cancelado") continue
    porEstado.set(e, [...(porEstado.get(e) ?? []), g])
  }
  const abiertos = porEstado.get("abiertas")?.length ?? 0
  for (const e of PRIORIDAD) {
    const lista = porEstado.get(e)
    if (lista?.length) {
      const grupo = [...lista].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))[0]
      return { estado: e, etiqueta: ETIQUETA_INSCRIPCION[e], grupo, abiertos }
    }
  }
  return { estado: "sin_inscripciones", etiqueta: ETIQUETA_INSCRIPCION.sin_inscripciones, grupo: null, abiertos }
}

export const ESTADOS_FILTRO = ["abiertas", "proximamente", "en_curso", "sin_inscripciones"] as const
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number] | "todos"

/** Filtro por estado del catálogo: «Sin vacantes» cuenta como sin inscripciones. */
export function coincideEstado(d: DisponibilidadCurso, filtro: EstadoFiltro): boolean {
  if (filtro === "todos") return true
  if (filtro === "sin_inscripciones") return d.estado === "sin_inscripciones" || d.estado === "sin_vacantes"
  return d.estado === filtro
}
