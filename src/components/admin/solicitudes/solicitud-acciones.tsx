"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Ban, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { notificar } from "@/lib/notificaciones"
import { cancelarSolicitudAdmin } from "@/lib/solicitudes/acciones"

/**
 * Única acción administrativa de V5 sobre la solicitud: cancelarla
 * (pendiente o reservada, sin pago bajo revisión). La RPC lo vuelve a comprobar.
 */
export function SolicitudAcciones({
  solicitudId,
  cancelable,
  motivoNoCancelable,
}: {
  solicitudId: string
  cancelable: boolean
  motivoNoCancelable?: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [procesando, setProcesando] = useState(false)

  async function cancelar() {
    if (procesando) return
    setProcesando(true)
    const op = notificar.operacion("Cancelando solicitud…")
    try {
      const r = await cancelarSolicitudAdmin(solicitudId)
      if (r.ok) {
        op.exito("Solicitud cancelada", { descripcion: "Si había una vacante reservada, quedó liberada." })
        setAbierto(false)
        router.refresh()
      } else {
        const avisar = r.gravedad === "advertencia" ? op.advertencia : op.error
        avisar("No se pudo completar la operación", { descripcion: r.mensaje })
      }
    } catch {
      op.error("No se pudo completar la operación", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(false)
    }
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1.5 lg:items-end">
        <Button variant="destructive" onClick={() => setAbierto(true)} disabled={!cancelable || procesando}>
          {procesando ? <Loader2 className="animate-spin" aria-hidden /> : <Ban aria-hidden />}
          Cancelar solicitud
        </Button>
        {!cancelable && motivoNoCancelable && <p className="max-w-xs text-xs text-muted-foreground lg:text-right">{motivoNoCancelable}</p>}
      </div>
      <Dialog open={abierto} onOpenChange={(v) => !v && !procesando && setAbierto(false)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Cancelar esta solicitud?</DialogTitle>
            <DialogDescription>
              La solicitud quedará cancelada y, si era una reserva, la vacante se liberará. Cancelar no genera
              devoluciones automáticas: si hubo un pago confirmado, gestiona la devolución según tus políticas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={procesando} autoFocus />}>Volver</DialogClose>
            <Button variant="destructive" onClick={cancelar} disabled={procesando}>
              {procesando && <Loader2 className="animate-spin" aria-hidden />}
              Cancelar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
