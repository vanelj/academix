"use client"

import { useEffect, useState } from "react"
import { ExternalLink, FileText, Loader2, ShieldCheck } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { enlaceComprobante } from "@/lib/pagos/acciones"
import { notificar } from "@/lib/notificaciones"

/**
 * Abre el comprobante con un enlace firmado de corta duración, generado a
 * pedido con la sesión del administrador. El enlace no se guarda ni se reutiliza.
 */
export function ComprobanteVisor({
  pagoId,
  obtenerEnlace = enlaceComprobante,
}: {
  pagoId: string
  /** Acción que firma el enlace (por defecto, la de pagos de V5; otra para pagos de certificados). */
  obtenerEnlace?: (id: string) => ReturnType<typeof enlaceComprobante>
}) {
  const [cargando, setCargando] = useState(false)
  const [enlace, setEnlace] = useState<{ url: string; tipo: string; expira: number } | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())

  // Retira el enlace de la vista cuando caduca.
  useEffect(() => {
    if (!enlace) return
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [enlace])
  const restante = enlace ? Math.max(0, Math.ceil((enlace.expira - ahora) / 1000)) : 0
  const vigente = enlace !== null && restante > 0

  async function generar() {
    if (cargando) return
    setCargando(true)
    try {
      const r = await obtenerEnlace(pagoId)
      if (r.ok) {
        const ahora = Date.now()
        setAhora(ahora)
        setEnlace({ url: r.url, tipo: r.tipo, expira: ahora + r.vigenciaSegundos * 1000 })
      } else {
        const avisar = r.gravedad === "advertencia" ? notificar.advertencia : notificar.error
        avisar("No se pudo abrir el comprobante", { descripcion: r.mensaje })
      }
    } catch {
      notificar.error("No se pudo abrir el comprobante", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setCargando(false)
    }
  }

  if (vigente) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <a href={enlace.url} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
          <ExternalLink aria-hidden />
          Abrir comprobante{enlace.tipo === "pdf" ? " (PDF)" : enlace.tipo === "imagen" ? " (imagen)" : ""}
        </a>
        <p className="text-xs text-muted-foreground" role="status">
          Enlace privado y temporal: caduca en {restante} s.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button variant="outline" onClick={generar} disabled={cargando}>
        {cargando ? <Loader2 className="animate-spin" aria-hidden /> : <FileText aria-hidden />}
        {enlace ? "Generar un nuevo enlace" : "Ver comprobante"}
      </Button>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        {enlace ? "El enlace anterior caducó." : "Se genera un enlace privado y temporal solo para tu sesión."}
      </p>
    </div>
  )
}
