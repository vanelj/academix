import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import type { CuotaAdmin, DestinoPago, EstadoCuota, EstadoPago } from "@/lib/pagos/datos"
import { cn } from "@/lib/utils"

/** Presentación de pagos y cuotas (estados reales de V5). */

export const ETIQUETA_ESTADO_PAGO: Record<EstadoPago, string> = {
  pendiente: "En revisión",
  pagado: "Aprobado",
  rechazado: "Rechazado",
}

export const ETIQUETA_DESTINO_PAGO: Record<DestinoPago, string> = {
  solicitud: "Solicitud de inscripción",
  cuota: "Cuota",
  matricula: "Matrícula (versión anterior)",
  desconocido: "Sin destino",
}

export const ETIQUETA_ESTADO_CUOTA: Record<EstadoCuota, string> = {
  pendiente: "Pendiente",
  parcial: "Pago parcial",
  pagada: "Pagada",
  anulada: "Anulada",
}

export function EstadoPagoBadge({ estado }: { estado: EstadoPago }) {
  const variante = estado === "pagado" ? "success" : estado === "pendiente" ? "warning" : "destructive"
  return <Badge variant={variante}>{ETIQUETA_ESTADO_PAGO[estado]}</Badge>
}

/** "Vencida" no es un estado de la BD: cuota pendiente o parcial con la fecha pasada. */
export type SituacionCuota = EstadoCuota | "vencida"

export function situacionCuota(c: Pick<CuotaAdmin, "estado" | "vencida">): SituacionCuota {
  return c.vencida ? "vencida" : c.estado
}

export function EstadoCuotaBadge({ cuota }: { cuota: Pick<CuotaAdmin, "estado" | "vencida"> }) {
  if (cuota.vencida) return <Badge variant="destructive">{cuota.estado === "parcial" ? "Parcial vencida" : "Vencida"}</Badge>
  const variante = cuota.estado === "pagada" ? "success" : cuota.estado === "anulada" ? "outline" : "warning"
  return <Badge variant={variante}>{ETIQUETA_ESTADO_CUOTA[cuota.estado]}</Badge>
}

/** Pestañas del módulo «Pagos» (una sola entrada de menú). Las cuotas solo existen en cursos anteriores al pago completo. */
export function PagosTabs({ actual, pendientesCertificado }: { actual: "pagos" | "certificados" | "cuotas" | "medios" | "verificacion"; pendientesCertificado?: number }) {
  const pestañas = [
    { id: "pagos", href: "/admin/pagos", texto: "Comprobantes" },
    { id: "certificados", href: "/admin/pagos/certificados", texto: "Certificados" },
    { id: "medios", href: "/admin/pagos/medios", texto: "Medios de cobro" },
    { id: "cuotas", href: "/admin/pagos/cuotas", texto: "Cuotas anteriores" },
    { id: "verificacion", href: "/admin/pagos/verificacion", texto: "Verificación" },
  ] as const
  return (
    <nav aria-label="Secciones de pagos" className="mb-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {pestañas.map((p) => (
        <Link
          key={p.id}
          href={p.href}
          aria-current={actual === p.id ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            actual === p.id ? "bg-background text-foreground shadow-sm dark:bg-input/40" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p.texto}
          {p.id === "certificados" && pendientesCertificado ? (
            <span className="ml-1.5 rounded-full bg-warning/15 px-1.5 text-xs font-semibold text-warning" aria-label={`${pendientesCertificado} por revisar`}>
              {pendientesCertificado}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  )
}

/** Cifra resumida en una tarjeta compacta. */
export function Indicador({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: string; detalle?: string; tono?: "warning" | "success" | "destructive" }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tono === "warning" && "text-warning",
          tono === "success" && "text-success",
          tono === "destructive" && "text-destructive"
        )}
      >
        {valor}
      </p>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
    </div>
  )
}
