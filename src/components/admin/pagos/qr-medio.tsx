"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ImageUp, Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { notificar } from "@/lib/notificaciones"
import { QR_ACCEPT, QR_MAX_BYTES } from "@/lib/pagos/qr"
import { quitarQrMedio, subirQrMedio } from "@/lib/pagos/qr-acciones"

/**
 * Carga del QR de un medio Yape/Plin: elegir imagen → vista previa → guardar.
 * También permite reemplazarlo o quitarlo. El medio sigue funcionando sin QR.
 */
export function GestorQrMedio({ medioId, tieneQr, disponible }: { medioId: string; tieneQr: boolean; disponible: boolean }) {
  const id = useId()
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [vista, setVista] = useState<{ archivo: File; url: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista.url) }, [vista])

  if (!disponible) {
    return <p className="text-xs text-muted-foreground">Subir el QR estará disponible cuando se aplique la migración «qr_medios_cobro_v5».</p>
  }

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = ""
    if (!archivo) return
    if (archivo.size > QR_MAX_BYTES) {
      notificar.advertencia("La imagen es muy pesada", { descripcion: "El máximo es 2 MB. Usa una captura del QR." })
      return
    }
    setVista({ archivo, url: URL.createObjectURL(archivo) })
  }

  async function guardar() {
    if (!vista || ocupado) return
    setOcupado(true)
    const op = notificar.operacion("Subiendo QR…")
    try {
      const fd = new FormData()
      fd.set("qr", vista.archivo, vista.archivo.name)
      const r = await subirQrMedio(medioId, fd)
      if (r.ok) {
        op.exito("QR guardado", { descripcion: "Tus estudiantes lo verán al pagar." })
        setVista(null)
        router.refresh()
      } else (r.migracionPendiente ? op.advertencia : op.error)("No se pudo guardar el QR", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo guardar el QR", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setOcupado(false)
    }
  }

  async function quitar() {
    if (ocupado) return
    setOcupado(true)
    const op = notificar.operacion("Quitando QR…")
    try {
      const r = await quitarQrMedio(medioId)
      if (r.ok) {
        op.exito("QR quitado", { descripcion: "El medio sigue disponible con su número y titular." })
        router.refresh()
      } else op.error("No se pudo quitar el QR", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo quitar el QR", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-dashed p-2.5">
      <input ref={input} id={`${id}-qr`} type="file" accept={QR_ACCEPT} className="sr-only" onChange={elegir} tabIndex={-1} aria-hidden />
      {vista ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local antes de subir */}
          <img src={vista.url} alt="Vista previa del código QR" className="size-24 rounded-lg border bg-white object-contain p-1" />
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Comprueba que se lea bien antes de guardar.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={guardar} disabled={ocupado}>
                {ocupado && <Loader2 className="animate-spin" aria-hidden />}
                Guardar QR
              </Button>
              <Button size="sm" variant="outline" onClick={() => setVista(null)} disabled={ocupado}>Cancelar</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={ocupado}>
            <ImageUp aria-hidden />
            {tieneQr ? "Reemplazar QR" : "Subir QR"}
          </Button>
          {tieneQr && (
            <Button size="sm" variant="ghost" onClick={quitar} disabled={ocupado}>
              {ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              Quitar QR
            </Button>
          )}
          {!tieneQr && <span className="text-xs text-muted-foreground">Opcional · JPG, PNG o WebP, hasta 2 MB.</span>}
        </div>
      )}
    </div>
  )
}
