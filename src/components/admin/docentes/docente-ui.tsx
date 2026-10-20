import { Badge } from "@/components/ui/badge"
import type { CuentaDocente, DocenteResumen } from "@/lib/docentes/datos"

/** Elementos de presentación compartidos por el listado y la ficha de docentes. */

export const formatoFechaDocente = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" })
export const formatoFechaHoraDocente = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" })

export const ETIQUETA_ESTADO_GRUPO: Record<string, string> = {
  programado: "Programado",
  abierto: "Abierto",
  en_curso: "En curso",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
}

export function EstadoRol({ docente }: { docente: Pick<DocenteResumen, "rolActivo" | "perfilActivo"> }) {
  if (!docente.perfilActivo) return <Badge variant="outline">Cuenta desactivada</Badge>
  return docente.rolActivo ? <Badge variant="success">Habilitado</Badge> : <Badge variant="outline">Deshabilitado</Badge>
}

export function EstadoCuenta({ cuenta }: { cuenta: CuentaDocente | null }) {
  if (!cuenta) return <span className="text-xs text-muted-foreground">—</span>
  return cuenta.activada ? (
    <span className="text-xs text-success">Activada</span>
  ) : (
    <span className="text-xs text-warning">Invitación pendiente</span>
  )
}
