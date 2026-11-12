"use client"

import { useEffect, useState } from "react"
import { CalendarClock, MapPin, Video } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ahoraAcademico, estadoClase, ETIQUETA_MODALIDAD, puedeUnirseAhora, rangoHora, type ModalidadSesion } from "@/lib/horarios/calendario"

const fechaLarga = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })

export type DatosProximaClase = {
  fecha: string
  hora_inicio: string
  hora_fin: string
  enlace: string | null
  ubicacion: string | null
  modalidad: ModalidadSesion
}

/**
 * Próxima clase (o la que está en curso). «Unirse a clase» se destaca desde 15
 * minutos antes; el estado se recalcula cada minuto en la zona académica.
 */
export function ProximaClase({ clase, ahoraInicial }: { clase: DatosProximaClase | null; ahoraInicial: { fecha: string; hora: string } }) {
  const [ahora, setAhora] = useState(ahoraInicial)
  useEffect(() => {
    const t = window.setInterval(() => setAhora(ahoraAcademico()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  if (!clase) {
    return <p className="text-sm text-muted-foreground">No hay próximas clases programadas en el periodo del grupo.</p>
  }
  const estado = estadoClase(clase, ahora)
  const unirse = puedeUnirseAhora(clase, ahora)
  const fecha = new Date(`${clase.fecha}T00:00:00Z`)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="size-5 text-primary" aria-hidden />
        <p className="font-medium">
          {clase.fecha === ahora.fecha ? "Hoy" : fechaLarga.format(fecha).replace(/^./, (c) => c.toUpperCase())}
          <span className="tabular-nums"> · {rangoHora(clase.hora_inicio, clase.hora_fin)}</span>
        </p>
        {estado === "en_curso" && <Badge variant="success">En curso</Badge>}
        {clase.modalidad && <Badge variant="outline">{ETIQUETA_MODALIDAD[clase.modalidad]}</Badge>}
      </div>
      {clase.ubicacion && <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4" aria-hidden />{clase.ubicacion}</p>}
      {clase.enlace ? (
        <div className="space-y-1">
          <a href={clase.enlace} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: unirse ? "default" : "outline" })}>
            <Video aria-hidden />
            {unirse ? "Unirse a clase" : "Enlace de la clase"}
          </a>
          {!unirse && <p className="text-xs text-muted-foreground">«Unirse a clase» se activa 15 minutos antes del inicio.</p>}
        </div>
      ) : (
        clase.modalidad !== "presencial" && <p className="text-xs text-muted-foreground">Tu institución aún no registró el enlace de esta clase.</p>
      )}
    </div>
  )
}
