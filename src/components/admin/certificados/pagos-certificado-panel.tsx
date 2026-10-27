"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Lock, Receipt, XCircle } from "lucide-react"

import { formatoFechaCert } from "@/components/admin/certificados/certificado-ui"
import { ComprobanteVisor } from "@/components/admin/pagos/comprobante-visor"
import { EstadoPagoBadge } from "@/components/admin/pagos/pago-ui"
import { formatoSolesSolicitud as s } from "@/components/solicitudes/solicitud-ui"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import { enlaceComprobanteCertificado, revisarPagoCertificado } from "@/lib/certificados/acciones"
import type { PagoCertificado } from "@/lib/certificados/datos"
import { notificar } from "@/lib/notificaciones"

/** Pagos de certificados con costo adicional: revisión manual, sin pasarela. */
export function PagosCertificadoPanel({ pagos, habilitada, motivo }: { pagos: PagoCertificado[]; habilitada: boolean; motivo: string }) {
  const router = useRouter()
  const [decision, setDecision] = useState<{ pago: PagoCertificado; aprobar: boolean } | null>(null)
  const [observacion, setObservacion] = useState("")
  const [verificado, setVerificado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function confirmar() {
    if (!decision || enviando) return
    setEnviando(true)
    const op = notificar.operacion(decision.aprobar ? "Aprobando pago…" : "Rechazando pago…")
    try {
      const r = await revisarPagoCertificado({ pagoId: decision.pago.id, aprobar: decision.aprobar, observacion, confirmado: true })
      if (r.ok) { op.exito(decision.aprobar ? "Pago aprobado" : "Pago rechazado", { descripcion: decision.aprobar ? "El certificado ya puede emitirse." : "El estudiante podrá enviar otro comprobante." }); setDecision(null); router.refresh() }
      else (r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo revisar", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo revisar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      {!habilitada && (
        <p className="mb-4 flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {motivo}
        </p>
      )}
      {pagos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted"><Receipt className="size-5 text-muted-foreground" aria-hidden /></div>
            <p className="text-sm text-muted-foreground">No hay pagos de certificados.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {pagos.map((p) => (
            <li key={p.id}>
              <Card size="sm">
                <CardContent className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{p.matricula?.estudiante.nombre ?? "Estudiante"}</p>
                      <EstadoPagoBadge estado={p.estado} />
                    </div>
                    <p className="text-muted-foreground">Certificado · {p.matricula?.curso?.nombre ?? "Curso"} · Grupo {p.matricula?.grupo?.codigo ?? "—"}</p>
                    <p className="text-muted-foreground">
                      {s.format(p.monto)} (importe {s.format(p.importe)}) · {p.metodo} · Op. {p.referencia} · {formatoFechaCert.format(new Date(p.fecha_pago))}
                    </p>
                    {p.observacion && <p className="text-muted-foreground">Observación: {p.observacion}</p>}
                    <ComprobanteVisor pagoId={p.id} obtenerEnlace={enlaceComprobanteCertificado} />
                  </div>
                  {p.estado === "pendiente" && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" disabled={!habilitada} onClick={() => { setDecision({ pago: p, aprobar: true }); setObservacion(""); setVerificado(false) }}>
                        <CheckCircle2 aria-hidden />Aprobar
                      </Button>
                      <Button size="sm" variant="outline" disabled={!habilitada} onClick={() => { setDecision({ pago: p, aprobar: false }); setObservacion(""); setVerificado(false) }}>
                        <XCircle aria-hidden />Rechazar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={decision !== null} onOpenChange={(v) => !v && !enviando && setDecision(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{decision?.aprobar ? "¿Aprobar el pago del certificado?" : "¿Rechazar el pago del certificado?"}</DialogTitle>
            <DialogDescription>
              {decision?.aprobar
                ? "Aprueba solo si confirmaste el ingreso real en tu banco o aplicación. Una imagen por sí sola no demuestra el pago."
                : "Indica el motivo: el estudiante lo verá y podrá enviar un nuevo comprobante."}
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={3} maxLength={500} value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder={decision?.aprobar ? "Observación (opcional)" : "Motivo del rechazo"} aria-label="Observación" disabled={enviando} />
          {decision?.aprobar && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={verificado} onChange={(e) => setVerificado(e.target.checked)} disabled={enviando} />
              Verifiqué el ingreso de {decision && s.format(decision.pago.monto)} en la cuenta de la institución.
            </label>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={enviando} autoFocus />}>Volver</DialogClose>
            <Button variant={decision?.aprobar ? "default" : "destructive"} onClick={confirmar}
              disabled={enviando || (decision?.aprobar ? !verificado : observacion.trim().length < 5)}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              {decision?.aprobar ? "Aprobar" : "Rechazar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
