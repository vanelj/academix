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
import { anularMatricula } from "@/lib/matriculas/acciones"
import { notificar } from "@/lib/notificaciones"

/**
 * Anulación de una matrícula activa (definitiva en V5). La RPC
 * anular_matricula vuelve a comprobar todas las reglas en la base de datos.
 */
export function MatriculaAcciones({
  matriculaId,
  anulable,
  motivoNoAnulable,
  cuotasPendientes,
  cuotasParciales,
}: {
  matriculaId: string
  anulable: boolean
  motivoNoAnulable?: string
  /** Cuotas sin pagos aprobados: la RPC las anula. */
  cuotasPendientes: number
  /** Cuotas con pagos parciales: se conservan. */
  cuotasParciales: number
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [procesando, setProcesando] = useState(false)

  async function anular() {
    if (procesando || !confirmado) return
    setProcesando(true)
    const op = notificar.operacion("Anulando matrícula…")
    try {
      const r = await anularMatricula({ id: matriculaId, confirmado: true })
      if (r.ok) {
        op.exito("Matrícula anulada", { descripcion: "La vacante del grupo quedó liberada." })
        setAbierto(false)
        router.refresh()
      } else {
        const avisar = r.gravedad === "advertencia" ? op.advertencia : op.error
        avisar("No se pudo anular la matrícula", { descripcion: r.mensaje })
      }
    } catch {
      op.error("No se pudo anular la matrícula", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(false)
    }
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1.5 lg:items-end">
        <Button variant="destructive" onClick={() => { setConfirmado(false); setAbierto(true) }} disabled={!anulable || procesando}>
          {procesando ? <Loader2 className="animate-spin" aria-hidden /> : <Ban aria-hidden />}
          Anular matrícula
        </Button>
        {!anulable && motivoNoAnulable && <p className="max-w-xs text-xs text-muted-foreground lg:text-right">{motivoNoAnulable}</p>}
      </div>
      <Dialog open={abierto} onOpenChange={(v) => !v && !procesando && setAbierto(false)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Anular esta matrícula?</DialogTitle>
            <DialogDescription>
              El estudiante dejará de formar parte del grupo y la vacante se liberará. La anulación es definitiva: si luego
              debe volver, tendrá que inscribirse de nuevo. No genera devoluciones automáticas; gestiónalas según tus políticas.
            </DialogDescription>
          </DialogHeader>
          {(cuotasPendientes > 0 || cuotasParciales > 0) && (
            <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm dark:bg-warning/10">
              {cuotasPendientes > 0 && (
                <p>{cuotasPendientes === 1 ? "La cuota pendiente sin pagos se anulará." : `Las ${cuotasPendientes} cuotas pendientes sin pagos se anularán.`}</p>
              )}
              {cuotasParciales > 0 && (
                <p>
                  {cuotasParciales === 1 ? "La cuota con pago parcial se conserva" : `Las ${cuotasParciales} cuotas con pago parcial se conservan`} con
                  lo ya pagado; el saldo restante y cualquier devolución se gestionan según tus políticas.
                </p>
              )}
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} disabled={procesando} className="mt-0.5 size-4 accent-primary" />
            Entiendo que la anulación no se puede deshacer.
          </label>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={procesando} autoFocus />}>Volver</DialogClose>
            <Button variant="destructive" onClick={anular} disabled={procesando || !confirmado}>
              {procesando && <Loader2 className="animate-spin" aria-hidden />}
              Anular matrícula
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
