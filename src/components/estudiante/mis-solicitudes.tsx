"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, Inbox, Loader2, Wallet } from "lucide-react"

import {
  ETIQUETA_TIPO_SOLICITUD,
  EstadoSolicitudBadge,
  fechaSimple,
  formatoFechaHoraSolicitud,
  formatoSolesSolicitud,
} from "@/components/solicitudes/solicitud-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cancelarMiSolicitud, confirmarMatriculaSinSaldo } from "@/lib/inscripcion/acciones"
import type { MiSolicitud } from "@/lib/inscripcion/datos"
import { notificar } from "@/lib/notificaciones"

/** Solicitudes del propio estudiante (todas las instituciones). Acciones vía RPC de V5. */
export function MisSolicitudes({ solicitudes }: { solicitudes: MiSolicitud[] }) {
  const router = useRouter()
  const [cancelar, setCancelar] = useState<MiSolicitud | null>(null)
  const [procesando, setProcesando] = useState<string | null>(null)

  async function ejecutar(s: MiSolicitud, accion: "cancelar" | "confirmar") {
    if (procesando) return
    setProcesando(s.id)
    const op = notificar.operacion(accion === "cancelar" ? "Cancelando solicitud…" : "Confirmando matrícula…")
    try {
      const r = accion === "cancelar" ? await cancelarMiSolicitud(s.id) : await confirmarMatriculaSinSaldo(s.id)
      if (r.ok) {
        op.exito(accion === "cancelar" ? "Solicitud cancelada" : "Matrícula confirmada", {
          descripcion: accion === "confirmar" ? "Ya formas parte del grupo." : undefined,
        })
        setCancelar(null)
        router.refresh()
      } else {
        const avisar = r.gravedad === "advertencia" ? op.advertencia : op.error
        avisar("No se pudo completar la operación", { descripcion: r.mensaje })
      }
    } catch {
      op.error("No se pudo completar la operación", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
  }

  if (solicitudes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Inbox className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <p className="font-medium">Aún no tienes solicitudes</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Explora el catálogo y elige un grupo con inscripciones abiertas.</p>
          </div>
          <Link href="/cursos" className={buttonVariants()}>Explorar cursos</Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <ul className="space-y-3">
        {solicitudes.map((s) => {
          const vigente = s.estado === "pendiente" || s.estado === "reservada"
          const sinCosto = s.tipo === "matricula" && s.estado === "pendiente" && s.importe_esperado === 0
          return (
            <li key={s.id}>
              <Card size="sm">
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium break-words">
                        {s.curso ? <Link href={`/cursos/${s.curso.id}`} className="hover:underline">{s.curso.nombre}</Link> : "Curso"}
                      </p>
                      <EstadoSolicitudBadge estado={s.estado} reservaVencida={s.reservaVencida} />
                    </div>
                    <p className="text-muted-foreground">
                      {s.curso?.institucion ?? "Institución"}
                      {s.grupo ? ` · Grupo ${s.grupo.codigo} · ${fechaSimple(s.grupo.fecha_inicio)} – ${fechaSimple(s.grupo.fecha_fin)}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ETIQUETA_TIPO_SOLICITUD[s.tipo]} · {formatoSolesSolicitud.format(s.importe_esperado)} · {formatoFechaHoraSolicitud.format(new Date(s.fecha_solicitud))}
                      {s.estado === "reservada" && s.reserva_vence_en && ` · vence el ${formatoFechaHoraSolicitud.format(new Date(s.reserva_vence_en))}`}
                    </p>
                    {s.estado === "pendiente" && s.importe_esperado > 0 && (
                      <p className="text-xs text-warning">
                        {s.pagoPendiente
                          ? "Tu comprobante está en revisión por la institución."
                          : "Pendiente de pago: paga a la institución y envía tu comprobante. La vacante no queda asegurada hasta que lo aprueben."}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {s.estado === "pendiente" && s.importe_esperado > 0 && !s.pagoPendiente && (
                      <Link href={`/estudiante/pagos/pagar?solicitud=${s.id}`} className={buttonVariants({ size: "sm" })}>
                        <Wallet aria-hidden />
                        Pagar y enviar comprobante
                      </Link>
                    )}
                    {sinCosto && (
                      <Button size="sm" onClick={() => ejecutar(s, "confirmar")} disabled={procesando !== null}>
                        {procesando === s.id ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
                        Confirmar matrícula
                      </Button>
                    )}
                    {vigente && !s.pagoPendiente && (
                      <Button size="sm" variant="outline" onClick={() => setCancelar(s)} disabled={procesando !== null}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>
      <Dialog open={cancelar !== null} onOpenChange={(v) => !v && !procesando && setCancelar(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Cancelar la solicitud?</DialogTitle>
            <DialogDescription>
              Si era una reserva, perderás la vacante. Cancelar no genera devoluciones automáticas: consulta la política de
              devoluciones de la institución.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={procesando !== null} autoFocus />}>Volver</DialogClose>
            <Button variant="destructive" onClick={() => cancelar && ejecutar(cancelar, "cancelar")} disabled={procesando !== null}>
              {procesando && <Loader2 className="animate-spin" aria-hidden />}
              Cancelar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
