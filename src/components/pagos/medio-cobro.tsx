"use client"

import { useState } from "react"
import { Building2, Check, Copy, Download, QrCode, Smartphone } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { MedioCobro } from "@/lib/pagos/medios"
import { urlQrSegura } from "@/lib/pagos/qr"
import { esBilletera, tituloMedio } from "@/lib/validations/medio-cobro"
import { cn } from "@/lib/utils"

/** Datos de un medio de cobro tal como los verá el estudiante (con botón para copiar). */
export function DatosMedioCobro({ medio, className }: { medio: Pick<MedioCobro, "tipo" | "titular" | "celular" | "banco" | "numero_cuenta" | "cci" | "instrucciones"> & { qr_url?: string | null }; className?: string }) {
  const qr = billeteraConQr(medio)
  const billetera = esBilletera(medio.tipo)
  const filas: [string, string | null, boolean][] = billetera
    ? [["Celular", medio.celular, true], ["Titular", medio.titular, false]]
    : [
        ["Banco", medio.banco, false],
        ["Titular", medio.titular, false],
        ["N.° de cuenta", medio.numero_cuenta, true],
        ["CCI", medio.cci, true],
      ]
  return (
    <div className={cn("space-y-2 text-sm", className)}>
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[auto_minmax(0,1fr)]">
        {filas
          .filter(([, v]) => v)
          .map(([k, v, copiable]) => (
            <div key={k} className="contents">
              <dt className="text-xs text-muted-foreground sm:pt-0.5">{k}</dt>
              <dd className="flex min-w-0 items-center gap-1 font-medium">
                <span className={cn("break-all", copiable && "font-mono tabular-nums")}>{v}</span>
                {copiable && <BotonCopiar valor={v!} etiqueta={k} />}
              </dd>
            </div>
          ))}
      </dl>
      {qr && <CodigoQr url={qr} titulo={tituloMedio(medio)} />}
      {medio.instrucciones && <p className="whitespace-pre-line text-muted-foreground">{medio.instrucciones}</p>}
    </div>
  )
}

const billeteraConQr = (m: { tipo: MedioCobro["tipo"]; qr_url?: string | null }) => (esBilletera(m.tipo) ? urlQrSegura(m.qr_url) : null)

/**
 * QR que subió la institución: miniatura que se amplía al tocarla y opción de
 * descargarlo (para escanearlo desde la galería en el mismo celular).
 * Si no hay QR, el medio sigue funcionando con el número y el titular.
 */
export function CodigoQr({ url, titulo }: { url: string; titulo: string }) {
  const [abierto, setAbierto] = useState(false)
  const descarga = `${url}${url.includes("?") ? "&" : "?"}download=`
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <button type="button" onClick={() => setAbierto(true)} className="rounded-xl border bg-white p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ampliar el código QR de ${titulo}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público de la institución */}
        <img src={url} alt={`Código QR de ${titulo}`} className="size-24 object-contain" loading="lazy" decoding="async" />
      </button>
      <div className="flex flex-col gap-1">
        <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(true)}>
          <QrCode aria-hidden />
          Ver QR
        </Button>
        <a href={descarga} className={buttonVariants({ size: "sm", variant: "ghost" })}>
          <Download aria-hidden />
          Descargar
        </a>
      </div>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>Escanéalo con tu aplicación. Verifica que el titular coincida antes de pagar.</DialogDescription>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen del bucket público de la institución */}
          <img src={url} alt={`Código QR de ${titulo}`} className="mx-auto w-full max-w-xs rounded-xl border bg-white p-3" />
          <a href={descarga} className={buttonVariants({ variant: "outline", className: "w-full" })}>
            <Download aria-hidden />
            Descargar imagen
          </a>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function IconoMedio({ tipo, className }: { tipo: MedioCobro["tipo"]; className?: string }) {
  const Icono = esBilletera(tipo) ? Smartphone : Building2
  return <Icono className={cn("size-4", className)} aria-hidden />
}

export { tituloMedio }

function BotonCopiar({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permiso de portapapeles: el valor sigue visible para copiarlo a mano.
    }
  }
  return (
    <Button type="button" variant="ghost" size="icon-xs" onClick={copiar} aria-label={`Copiar ${etiqueta}`} title={`Copiar ${etiqueta}`}>
      {copiado ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
    </Button>
  )
}
