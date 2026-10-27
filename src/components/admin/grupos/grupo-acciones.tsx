"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Ban, CheckCircle2, DoorOpen, Loader2, Pause, Pencil, PlayCircle, RotateCcw, Trash2 } from "lucide-react"

import { ETIQUETA_ESTADO_GRUPO } from "@/components/admin/grupos/grupo-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cambiarEstadoGrupo, eliminarGrupo } from "@/lib/grupos/acciones"
import { notificar } from "@/lib/notificaciones"
import { TRANSICIONES, type EstadoGrupo } from "@/lib/validations/grupo"

type Icono = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>

const ACCION: Record<EstadoGrupo, { etiqueta: string; icono: Icono; exito: string; confirmar?: string }> = {
  abierto: { etiqueta: "Abrir inscripciones", icono: DoorOpen, exito: "Inscripciones abiertas" },
  programado: { etiqueta: "Volver a programado", icono: Pause, exito: "El grupo volvió a programado" },
  en_curso: { etiqueta: "Iniciar clases", icono: PlayCircle, exito: "El grupo está en curso" },
  cerrado: { etiqueta: "Cerrar grupo", icono: CheckCircle2, exito: "Grupo cerrado", confirmar: "El grupo quedará como terminado. No podrá volver a abrirse." },
  cancelado: { etiqueta: "Cancelar grupo", icono: Ban, exito: "Grupo cancelado", confirmar: "El grupo no se dictará y dejará de mostrarse en el catálogo. Las matrículas y solicitudes existentes no se modifican: revísalas en sus módulos." },
}

/** Acciones de la ficha del grupo. El servidor vuelve a comprobar cada regla. */
export function GrupoAcciones({
  grupoId,
  codigo,
  estado,
  eliminable,
}: {
  grupoId: string
  codigo: string
  estado: EstadoGrupo
  eliminable: boolean
}) {
  const router = useRouter()
  const [confirmar, setConfirmar] = useState<EstadoGrupo | "eliminar" | null>(null)
  const [procesando, setProcesando] = useState<string | null>(null)
  const ocupado = procesando !== null

  async function ejecutar(accion: EstadoGrupo | "eliminar") {
    if (ocupado) return
    setProcesando(accion)
    const op = notificar.operacion(accion === "eliminar" ? "Eliminando grupo…" : "Actualizando el grupo…")
    try {
      const r = accion === "eliminar" ? await eliminarGrupo(grupoId) : await cambiarEstadoGrupo(grupoId, accion)
      if (r.ok) {
        op.exito(accion === "eliminar" ? "Grupo eliminado" : ACCION[accion].exito, {
          descripcion: accion === "eliminar" ? `Se eliminó el grupo ${codigo}.` : undefined,
        })
        setConfirmar(null)
        if (accion === "eliminar") router.push("/admin/grupos")
        router.refresh()
      } else {
        const avisar = r.gravedad === "advertencia" ? op.advertencia : op.error
        avisar(accion === "abierto" ? "No es posible abrir inscripciones todavía" : "No se pudo completar la operación", {
          descripcion: r.mensaje,
        })
        setConfirmar(null)
      }
    } catch {
      op.error("No se pudo completar la operación", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
  }

  const solicitar = (accion: EstadoGrupo) => (ACCION[accion].confirmar ? setConfirmar(accion) : ejecutar(accion))

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/grupos/${grupoId}/editar`} className={buttonVariants({ variant: "outline" })}>
          <Pencil aria-hidden />
          Editar
        </Link>
        {TRANSICIONES[estado].map((destino) => {
          const { etiqueta, icono: Icono } = ACCION[destino]
          const principal = destino === "abierto" || destino === "en_curso"
          return (
            <Button
              key={destino}
              variant={principal ? "default" : destino === "cancelado" ? "outline" : "outline"}
              onClick={() => solicitar(destino)}
              disabled={ocupado}
            >
              {procesando === destino ? <Loader2 className="animate-spin" aria-hidden /> : estado === "cancelado" ? <RotateCcw aria-hidden /> : <Icono aria-hidden />}
              {estado === "cancelado" && destino === "programado" ? "Reactivar" : etiqueta}
            </Button>
          )
        })}
        <Button
          variant="destructive"
          onClick={() => setConfirmar("eliminar")}
          disabled={ocupado || !eliminable}
          title={eliminable ? undefined : "Tiene matrículas, solicitudes o evaluaciones: cancélalo o ciérralo en su lugar."}
        >
          {procesando === "eliminar" ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
          Eliminar
        </Button>
      </div>

      <Dialog open={confirmar !== null} onOpenChange={(v) => !v && !ocupado && setConfirmar(null)}>
        <DialogContent showCloseButton={false}>
          {confirmar && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirmar === "eliminar" ? "¿Eliminar el grupo?" : `¿${ACCION[confirmar].etiqueta}?`}
                </DialogTitle>
                <DialogDescription>
                  {confirmar === "eliminar"
                    ? `Se eliminará el grupo ${codigo} y sus horarios de forma permanente.`
                    : `${ACCION[confirmar].confirmar} Estado nuevo: ${ETIQUETA_ESTADO_GRUPO[confirmar]}.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" disabled={ocupado} autoFocus />}>Volver</DialogClose>
                <Button variant="destructive" onClick={() => ejecutar(confirmar)} disabled={ocupado}>
                  {ocupado && <Loader2 className="animate-spin" aria-hidden />}
                  {confirmar === "eliminar" ? "Eliminar" : ACCION[confirmar].etiqueta}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
