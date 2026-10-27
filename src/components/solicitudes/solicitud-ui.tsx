import { Badge } from "@/components/ui/badge"
import type { EstadoSolicitud } from "@/lib/estudiantes/datos"

/**
 * Presentación de solicitudes (estados reales de V5). "Reserva vencida" NO es
 * un estado de la BD: es una reserva 'reservada' cuyo plazo ya pasó (V5 no
 * cambia su estado automáticamente).
 */

export const ETIQUETA_ESTADO_SOLICITUD: Record<EstadoSolicitud, string> = {
  pendiente: "Pendiente",
  reservada: "Vacante reservada",
  matriculada: "Matriculada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  vencida: "Vencida",
}

export const ETIQUETA_TIPO_SOLICITUD = { matricula: "Matrícula", reserva: "Reserva de vacante" } as const

export type FiltroEstadoSolicitud = EstadoSolicitud | "reserva_vencida"

export function estadoVisible(estado: EstadoSolicitud, reservaVencida: boolean): FiltroEstadoSolicitud {
  return reservaVencida ? "reserva_vencida" : estado
}

export function EstadoSolicitudBadge({ estado, reservaVencida = false }: { estado: EstadoSolicitud; reservaVencida?: boolean }) {
  if (reservaVencida) return <Badge variant="outline">Reserva vencida</Badge>
  const variante =
    estado === "matriculada" ? "success" : estado === "reservada" ? "default" : estado === "pendiente" ? "warning" : "outline"
  return <Badge variant={variante}>{ETIQUETA_ESTADO_SOLICITUD[estado]}</Badge>
}

export const formatoSolesSolicitud = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })
export const formatoFechaHoraSolicitud = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" })
const formatoFechaUtc = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "UTC" })
/** Fecha "AAAA-MM-DD" sin desfase de zona horaria. */
export const fechaSimple = (iso: string) => formatoFechaUtc.format(new Date(`${iso}T00:00:00Z`))
