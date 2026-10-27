import { Badge } from "@/components/ui/badge"
import { DIAS_SEMANA, type EstadoGrupo } from "@/lib/validations/grupo"

/** Elementos de presentación compartidos por el listado, la ficha y el formulario de grupos. */

export const ETIQUETA_ESTADO_GRUPO: Record<EstadoGrupo, string> = {
  programado: "Programado",
  abierto: "Inscripciones abiertas",
  en_curso: "En curso",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
}

export const DESCRIPCION_ESTADO_GRUPO: Record<EstadoGrupo, string> = {
  programado: "En preparación: aún no recibe inscripciones.",
  abierto: "Recibe solicitudes de inscripción (si el curso está publicado).",
  en_curso: "Las clases están en marcha.",
  cerrado: "El grupo terminó.",
  cancelado: "El grupo no se dictará.",
}

export function EstadoGrupoBadge({ estado }: { estado: EstadoGrupo }) {
  const variante =
    estado === "abierto" ? "success" : estado === "programado" ? "warning" : estado === "en_curso" ? "default" : "outline"
  return <Badge variant={variante}>{ETIQUETA_ESTADO_GRUPO[estado]}</Badge>
}

/** Disponibilidad de vacantes (mismo cálculo que V5: matrículas activas + reservas vigentes). */
export function DisponibilidadBadge({ vacantes, disponibles }: { vacantes: number; disponibles: number | null }) {
  if (disponibles == null) return null
  if (disponibles <= 0) return <Badge variant="destructive">Completo</Badge>
  if (disponibles <= Math.max(3, Math.ceil(vacantes * 0.1))) return <Badge variant="warning">Pocas vacantes</Badge>
  return <Badge variant="success">Con vacantes</Badge>
}

const formatoFecha = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "UTC" })

/** Fecha "AAAA-MM-DD" (sin hora) → "12 oct 2026", sin desfases de zona horaria. */
export const fechaCorta = (iso: string) => formatoFecha.format(new Date(`${iso}T00:00:00Z`))

export const DIA_CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const

export function nombreDia(dia: number) {
  return DIAS_SEMANA[dia - 1] ?? "—"
}

/** "Lun 19:00–21:00 · Mié 19:00–21:00" */
export function resumenHorarios(horarios: { dia_semana: number; hora_inicio: string; hora_fin: string }[]) {
  if (horarios.length === 0) return "Sin horarios"
  return horarios.map((h) => `${DIA_CORTO[h.dia_semana - 1]} ${h.hora_inicio}–${h.hora_fin}`).join(" · ")
}
