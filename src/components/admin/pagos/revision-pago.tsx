"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, CircleAlert, Loader2, Lock, XCircle } from "lucide-react"

import { formatoSolesSolicitud } from "@/components/solicitudes/solicitud-ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { revisarPago } from "@/lib/pagos/acciones"
import { notificar } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"

/**
 * Verificación manual de un comprobante pendiente. La decisión la aplica
 * revisar_pago (V5) en una sola transacción; esta interfaz solo guía la
 * comprobación. Si la revisión está deshabilitada, todo queda de solo lectura.
 */
export function RevisionPago({
  pagoId,
  habilitada,
  motivoDeshabilitada,
  monto,
  esperado,
  regla,
  referencia,
  tieneComprobante,
  alertas,
}: {
  pagoId: string
  habilitada: boolean
  motivoDeshabilitada: string
  monto: number
  esperado: number | null
  /** 'igual': pago inicial de una solicitud; 'maximo': pago a cuenta de una cuota. */
  regla: "igual" | "maximo" | null
  referencia: string | null
  tieneComprobante: boolean
  /** Situaciones detectadas en el servidor que impiden o desaconsejan aprobar. */
  alertas: string[]
}) {
  const router = useRouter()
  const [checks, setChecks] = useState([false, false, false])
  const [observacion, setObservacion] = useState("")
  const [decision, setDecision] = useState<"aprobar" | "rechazar" | null>(null)
  const [procesando, setProcesando] = useState(false)

  const s = formatoSolesSolicitud
  const montoValido =
    esperado === null || regla === null ? false : regla === "igual" ? Math.abs(monto - esperado) < 0.005 : monto > 0 && monto <= esperado + 0.005
  const puedeAprobar = habilitada && montoValido && tieneComprobante && !!referencia && checks.every(Boolean) && alertas.length === 0
  const puedeRechazar = habilitada && observacion.trim().length >= 5
  const bloqueado = !habilitada || procesando

  async function confirmar() {
    if (!decision || procesando) return
    setProcesando(true)
    const aprobar = decision === "aprobar"
    const op = notificar.operacion(aprobar ? "Aprobando pago…" : "Rechazando pago…")
    try {
      const r = await revisarPago({ pagoId, aprobar, observacion, confirmado: true })
      if (r.ok) {
        op.exito(r.estado === "pagado" ? "Pago aprobado" : "Pago rechazado", {
          descripcion: r.estado === "pagado" ? "Se aplicó a la solicitud o cuota correspondiente." : "El estudiante podrá presentar un nuevo comprobante.",
        })
        setDecision(null)
        router.refresh()
      } else {
        const avisar = r.gravedad === "advertencia" ? op.advertencia : op.error
        avisar("No se pudo revisar el pago", { descripcion: r.mensaje })
      }
    } catch {
      op.error("No se pudo revisar el pago", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(false)
    }
  }

  const pasos = [
    "Abrí el comprobante y es legible.",
    "El importe y la fecha coinciden con el abono recibido en la cuenta de la institución.",
    `El número de operación${referencia ? ` «${referencia}»` : ""} figura en el estado de cuenta y no se usó en otro pago.`,
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificación manual</CardTitle>
        <CardDescription>Contrasta el comprobante con el estado de cuenta de la institución antes de decidir.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!habilitada && (
          <p className="flex gap-2 rounded-lg border bg-muted/50 p-3 text-sm">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            {motivoDeshabilitada}
          </p>
        )}

        <dl className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Monto declarado</dt>
            <dd className="text-lg font-semibold tabular-nums">{s.format(monto)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{regla === "maximo" ? "Saldo de la cuota (máximo)" : "Importe esperado"}</dt>
            <dd className="text-lg font-semibold tabular-nums">{esperado === null ? "—" : s.format(esperado)}</dd>
          </div>
          <p className={cn("flex items-center gap-1.5 text-sm sm:col-span-2", montoValido ? "text-success" : "text-destructive")}>
            {montoValido ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
            {esperado === null
              ? "No se pudo determinar el importe esperado."
              : montoValido
                ? regla === "igual" ? "El monto coincide con el importe de la solicitud." : "El monto no supera el saldo de la cuota."
                : regla === "igual" ? "El monto no coincide con el importe de la solicitud." : "El monto supera el saldo de la cuota."}
          </p>
        </dl>

        {alertas.length > 0 && (
          <ul className="space-y-2">
            {alertas.map((a) => (
              <li key={a} className="flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm dark:bg-warning/10">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                {a}
              </li>
            ))}
          </ul>
        )}

        <fieldset className="space-y-2" disabled={bloqueado}>
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Comprobaciones antes de aprobar</legend>
          {pasos.map((texto, i) => (
            <label key={i} className={cn("flex items-start gap-2 text-sm", bloqueado && "text-muted-foreground")}>
              <input
                type="checkbox"
                checked={checks[i]}
                onChange={(e) => setChecks((c) => c.map((v, j) => (j === i ? e.target.checked : v)))}
                className="mt-0.5 size-4 accent-primary"
              />
              {texto}
            </label>
          ))}
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor="observacion-pago" className="text-sm font-medium">Observación</label>
          <Textarea
            id="observacion-pago"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            maxLength={500}
            rows={3}
            disabled={bloqueado}
            placeholder="Obligatoria si rechazas: indica el motivo (monto distinto, operación no encontrada, archivo ilegible…)."
          />
          <p className="text-xs text-muted-foreground">Queda registrada junto con tu nombre y la fecha de revisión.</p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setDecision("rechazar")} disabled={!puedeRechazar || procesando}>
            <XCircle aria-hidden />
            Rechazar pago
          </Button>
          <Button onClick={() => setDecision("aprobar")} disabled={!puedeAprobar || procesando}>
            <CheckCircle2 aria-hidden />
            Aprobar pago
          </Button>
        </div>
      </CardContent>

      <Dialog open={decision !== null} onOpenChange={(v) => !v && !procesando && setDecision(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{decision === "aprobar" ? "¿Aprobar este pago?" : "¿Rechazar este pago?"}</DialogTitle>
            <DialogDescription>
              {decision === "aprobar"
                ? `Se registrará el pago de ${s.format(monto)} como aprobado. Si corresponde a una solicitud, se confirmará la reserva o la matrícula; si es de una cuota, se aplicará a su saldo. La decisión no se puede deshacer desde el panel.`
                : "El pago quedará rechazado con tu observación y el estudiante podrá presentar un nuevo comprobante. La decisión no se puede deshacer desde el panel."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={procesando} autoFocus />}>Volver</DialogClose>
            <Button variant={decision === "aprobar" ? "default" : "destructive"} onClick={confirmar} disabled={procesando}>
              {procesando && <Loader2 className="animate-spin" aria-hidden />}
              {decision === "aprobar" ? "Aprobar pago" : "Rechazar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
