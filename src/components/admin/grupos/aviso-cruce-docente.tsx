"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import { revisarCruceDocente } from "@/lib/grupos/acciones"

type Franja = { dia_semana: number; hora_inicio: string; hora_fin: string }

/**
 * Aviso EN VIVO de cruce de horario del docente mientras se llena el
 * formulario (sin esperar a guardar). Es informativo: el servidor vuelve a
 * comprobarlo al confirmar y rechaza la operación si el cruce es real.
 */
export function AvisoCruceDocente({
  grupoId,
  docenteId,
  fechaInicio,
  fechaFin,
  franjas,
}: {
  grupoId?: string | null
  docenteId: string | null | undefined
  fechaInicio: string | null | undefined
  fechaFin: string | null | undefined
  /** Horarios propuestos; sin ellos se usan los guardados del grupo. */
  franjas?: Franja[]
}) {
  const [estado, setEstado] = useState<{ clave: string; cruces: string[] } | null>(null)
  const clave = JSON.stringify([grupoId ?? null, docenteId ?? null, fechaInicio ?? null, fechaFin ?? null, franjas ?? null])
  const completo = Boolean(docenteId && fechaInicio && fechaFin && /^\d{4}-\d{2}-\d{2}$/.test(fechaInicio) && /^\d{4}-\d{2}-\d{2}$/.test(fechaFin) && (grupoId || franjas?.length))

  useEffect(() => {
    if (!completo) return
    let vigente = true
    const t = setTimeout(async () => {
      try {
        const r = await revisarCruceDocente({ grupoId: grupoId ?? null, docenteId, fechaInicio, fechaFin, franjas })
        if (vigente) setEstado({ clave, cruces: r.ok ? r.cruces : [] })
      } catch {
        if (vigente) setEstado({ clave, cruces: [] })
      }
    }, 400)
    return () => { vigente = false; clearTimeout(t) }
    // `clave` resume todas las entradas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, completo])

  if (!completo) return null
  if (!estado || estado.clave !== clave) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Revisando el horario del docente…
      </p>
    )
  }
  if (estado.cruces.length === 0) return null
  return (
    <div role="alert" className="space-y-1 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />Cruce de horario del docente</p>
      <ul className="list-disc space-y-1 pl-5">
        {estado.cruces.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <p className="text-xs text-muted-foreground">No se podrá guardar así: cambia el horario, las fechas o elige otro docente.</p>
    </div>
  )
}
