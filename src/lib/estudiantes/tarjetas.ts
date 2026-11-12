import { proximaClase, estadoClase, type Franja, type GrupoCalendario } from "@/lib/horarios/calendario"
import type { MiCurso } from "@/lib/estudiantes/mis-cursos"

/**
 * Tarjetas de «Mis cursos» (puro). Una tarjeta por MATRÍCULA: si el estudiante
 * tiene dos matrículas en grupos distintos del mismo curso, se ven dos tarjetas
 * con su grupo indicado. Nunca una tarjeta por docente. Las solicitudes no son
 * matrículas y no aparecen aquí (están en «Mis solicitudes»).
 */

export type EstadoAcademico = "por_iniciar" | "en_curso" | "finalizado" | "aprobado" | "desaprobado" | "cancelado" | "anulada"

export const ETIQUETA_ESTADO_ACADEMICO: Record<EstadoAcademico, string> = {
  por_iniciar: "Por iniciar",
  en_curso: "En curso",
  finalizado: "Finalizado",
  aprobado: "Aprobado",
  desaprobado: "Desaprobado",
  cancelado: "Grupo cancelado",
  anulada: "Matrícula anulada",
}

export type TarjetaMiCurso = {
  matriculaId: string
  curso: string
  institucion: string
  grupo: string | null
  docente: string | null
  modalidad: string | null
  portadaUrl: string | null
  estado: EstadoAcademico
  fechaInicio: string | null
  fechaFin: string | null
  horarios: { dia_semana: number; hora_inicio: string; hora_fin: string }[]
  /** Próxima clase real (o la que está en curso); null si no hay datos suficientes. */
  proxima: { fecha: string; hora_inicio: string; hora_fin: string; enCurso: boolean } | null
  /** Hay otra matrícula del mismo curso en otro grupo (para diferenciarlas). */
  repetido: boolean
}

export function estadoAcademico(c: Pick<MiCurso, "estado" | "estadoFinal" | "grupo">): EstadoAcademico {
  if (c.estado !== "activa") return "anulada"
  if (c.estadoFinal === "aprobado" || c.estadoFinal === "desaprobado") return c.estadoFinal
  const g = c.grupo?.estado
  if (g === "en_curso") return "en_curso"
  if (g === "cerrado") return "finalizado"
  if (g === "cancelado") return "cancelado"
  return "por_iniciar"
}

export function tarjetasMisCursos(cursos: MiCurso[], franjas: Map<string, Franja[]> | null, ahora: { fecha: string; hora: string }): TarjetaMiCurso[] {
  const porCurso = new Map<string, number>()
  for (const c of cursos) if (c.curso && c.estado === "activa") porCurso.set(c.curso.id, (porCurso.get(c.curso.id) ?? 0) + 1)
  return cursos.map((c) => {
    const estado = estadoAcademico(c)
    let proxima: TarjetaMiCurso["proxima"] = null
    if (c.grupo && (estado === "por_iniciar" || estado === "en_curso")) {
      const g: GrupoCalendario = {
        clave: c.matriculaId,
        curso: c.curso?.nombre ?? "Curso",
        grupo: c.grupo.codigo,
        estado: c.grupo.estado,
        desde: c.grupo.fechaInicio.slice(0, 10),
        hasta: c.grupo.fechaFin.slice(0, 10),
        franjas: franjas?.get(c.grupoId) ?? c.horarios.map((h) => ({ dia_semana: Number(h.dia_semana), hora_inicio: h.hora_inicio, hora_fin: h.hora_fin })),
      }
      const p = proximaClase([g], ahora)
      if (p) proxima = { fecha: p.fecha, hora_inicio: p.hora_inicio, hora_fin: p.hora_fin, enCurso: estadoClase(p, ahora) === "en_curso" }
    }
    return {
      matriculaId: c.matriculaId,
      curso: c.curso?.nombre ?? "Curso (detalle no disponible)",
      institucion: c.institucion ?? "Institución",
      grupo: c.grupo?.codigo ?? null,
      docente: c.docente,
      modalidad: c.modalidad,
      portadaUrl: c.portadaUrl,
      estado,
      fechaInicio: c.grupo?.fechaInicio.slice(0, 10) ?? null,
      fechaFin: c.grupo?.fechaFin.slice(0, 10) ?? null,
      horarios: c.horarios.map((h) => ({ dia_semana: Number(h.dia_semana), hora_inicio: h.hora_inicio, hora_fin: h.hora_fin })),
      proxima,
      repetido: Boolean(c.curso && c.estado === "activa" && (porCurso.get(c.curso.id) ?? 0) > 1),
    }
  })
}

export type FiltroCursos = { texto: string; institucion: string; estado: "" | EstadoAcademico | "activos" }

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Búsqueda por curso, institución, grupo o docente; filtros por institución y estado. */
export function filtrarCursos(tarjetas: TarjetaMiCurso[], f: FiltroCursos): TarjetaMiCurso[] {
  const q = normalizar(f.texto.trim())
  return tarjetas.filter((t) => {
    if (f.institucion && t.institucion !== f.institucion) return false
    if (f.estado === "activos" && (t.estado !== "en_curso" && t.estado !== "por_iniciar")) return false
    if (f.estado && f.estado !== "activos" && t.estado !== f.estado) return false
    if (!q) return true
    return [t.curso, t.institucion, t.grupo ?? "", t.docente ?? ""].some((v) => normalizar(v).includes(q))
  })
}

/** Orden: en curso / por iniciar primero (por próxima clase), luego el resto. */
export function ordenarTarjetas(tarjetas: TarjetaMiCurso[]): TarjetaMiCurso[] {
  const peso: Record<EstadoAcademico, number> = { en_curso: 0, por_iniciar: 1, finalizado: 2, aprobado: 2, desaprobado: 2, cancelado: 3, anulada: 3 }
  return [...tarjetas].sort(
    (a, b) =>
      peso[a.estado] - peso[b.estado] ||
      (a.proxima ? `${a.proxima.fecha}${a.proxima.hora_inicio}` : "9").localeCompare(b.proxima ? `${b.proxima.fecha}${b.proxima.hora_inicio}` : "9") ||
      a.curso.localeCompare(b.curso, "es")
  )
}
