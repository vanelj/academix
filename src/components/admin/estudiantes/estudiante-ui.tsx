import { Badge } from "@/components/ui/badge"
import type { EstadoFinal, EstadoMatricula, EstadoSolicitud, EstudianteResumen } from "@/lib/estudiantes/datos"

/** Elementos de presentación compartidos por el listado y la ficha de estudiantes. */

export const ETIQUETA_SOLICITUD: Record<EstadoSolicitud, string> = {
  pendiente: "Pendiente",
  reservada: "Vacante reservada",
  matriculada: "Matriculada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  vencida: "Vencida",
}

export const ETIQUETA_FINAL: Record<EstadoFinal, string> = {
  en_curso: "En curso",
  aprobado: "Aprobado",
  desaprobado: "Desaprobado",
}

export function SolicitudBadge({ estado }: { estado: EstadoSolicitud }) {
  const variante =
    estado === "matriculada" ? "success" : estado === "pendiente" || estado === "reservada" ? "warning" : "outline"
  return <Badge variant={variante}>{ETIQUETA_SOLICITUD[estado]}</Badge>
}

export function MatriculaBadge({ estado, final }: { estado: EstadoMatricula; final: EstadoFinal }) {
  if (estado === "anulada") return <Badge variant="outline">Matrícula anulada</Badge>
  const variante = final === "aprobado" ? "success" : final === "desaprobado" ? "destructive" : "default"
  return <Badge variant={variante}>{ETIQUETA_FINAL[final]}</Badge>
}

/** Situación resumida del estudiante en la institución. */
export type Situacion = "matriculado" | "en_proceso" | "historial"

export const ETIQUETA_SITUACION: Record<Situacion, string> = {
  matriculado: "Con matrícula activa",
  en_proceso: "Solicitud en curso",
  historial: "Solo historial",
}

export function situacion(e: EstudianteResumen): Situacion {
  if (e.matriculas.some((m) => m.estado === "activa")) return "matriculado"
  if (e.solicitudes.some((s) => s.estado === "pendiente" || s.estado === "reservada")) return "en_proceso"
  return "historial"
}

export function SituacionBadge({ valor }: { valor: Situacion }) {
  const variante = valor === "matriculado" ? "success" : valor === "en_proceso" ? "warning" : "outline"
  return <Badge variant={variante}>{ETIQUETA_SITUACION[valor]}</Badge>
}

export function nombreEstudiante(e: Pick<EstudianteResumen, "datosVisibles" | "nombres" | "apellidos">) {
  return e.datosVisibles ? `${e.apellidos ?? ""}, ${e.nombres ?? ""}`.replace(/^, |, $/g, "") : "Nombre no disponible"
}

/** Cursos distintos (de esta institución) en los que tiene solicitud o matrícula. */
export function cursosRelacionados(e: Pick<EstudianteResumen, "matriculas" | "solicitudes">) {
  const ids = new Set<string>()
  for (const r of [...e.matriculas, ...e.solicitudes]) if (r.grupo?.curso) ids.add(r.grupo.curso.id)
  return ids.size
}

export const formatoFechaEstudiante = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" })
export const formatoFechaHoraEstudiante = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" })
