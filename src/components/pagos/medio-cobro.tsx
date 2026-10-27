"use client"

import { useState } from "react"
import { Building2, Check, Copy, Smartphone } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { MedioCobro } from "@/lib/pagos/medios"
import { ETIQUETA_TIPO_MEDIO, esBilletera } from "@/lib/validations/medio-cobro"
import { cn } from "@/lib/utils"

/** Datos de un medio de cobro tal como los verá el estudiante (con botón para copiar). */
export function DatosMedioCobro({ medio, className }: { medio: Pick<MedioCobro, "tipo" | "titular" | "celular" | "banco" | "numero_cuenta" | "cci" | "instrucciones">; className?: string }) {
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
      {medio.instrucciones && <p className="whitespace-pre-line text-muted-foreground">{medio.instrucciones}</p>}
    </div>
  )
}

export function IconoMedio({ tipo, className }: { tipo: MedioCobro["tipo"]; className?: string }) {
  const Icono = esBilletera(tipo) ? Smartphone : Building2
  return <Icono className={cn("size-4", className)} aria-hidden />
}

export const tituloMedio = (m: Pick<MedioCobro, "tipo" | "banco">) =>
  esBilletera(m.tipo) || !m.banco ? ETIQUETA_TIPO_MEDIO[m.tipo] : `${ETIQUETA_TIPO_MEDIO[m.tipo]} · ${m.banco}`

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
