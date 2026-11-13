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
import { DialogoEliminacion, type Alternativa } from "@/components/admin/eliminacion-dialogo"
import { cambiarEstadoGrupo } from "@/lib/grupos/acciones"
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
  alEliminar,
}: {
  grupoId: string
  codigo: string
  estado: EstadoGrupo
  eliminable: boolean
  /** Si se indica, se llama tras eliminar en lugar de volver al listado de grupos. */
  alEliminar?: () => void
}) {
  const router = useRouter()
  const [confirmar, setConfirmar] = useState<EstadoGrupo | null>(null)
  const [eliminar, setEliminar] = useState(false)
  void eliminable
  void codigo
  const [procesando, setProcesando] = useState<string | null>(null)
  const ocupado = procesando !== null

  async function ejecutar(accion: EstadoGrupo): Promise<boolean> {
    if (ocupado) return false
    setProcesando(accion)
    const op = notificar.operacion("Actualizando el grupo…")
    try {
      const r = await cambiarEstadoGrupo(grupoId, accion)
      if (r.ok) {
        // Abrir sin docente es válido, pero se avisa que deberá asignarse antes de iniciar las clases.
        if (r.aviso) op.advertencia(ACCION[accion]?.exito ?? "Grupo actualizado", { descripcion: r.aviso })
        else op.exito(ACCION[accion].exito)
        setConfirmar(null)
        router.refresh()
        return true
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
    return false
  }

  // Alternativas cuando el grupo tiene historial: Cancelar (no se dictará) y Cerrar (terminó) no son lo mismo.
  const alternativas: Alternativa[] = (["cancelado", "cerrado"] as const)
    .filter((d) => TRANSICIONES[estado].includes(d))
    .map((d) => ({
      etiqueta: ACCION[d].etiqueta,
      descripcion: d === "cancelado"
        ? "Cancelar: el grupo no se dictará y sale del catálogo. Matrículas, pagos y solicitudes se conservan para revisarlos en sus módulos."
        : "Cerrar: el grupo terminó. Queda como finalizado para registrar resultados y certificados; no puede volver a abrirse.",
      destructiva: d === "cancelado",
      ejecutar: () => ejecutar(d),
    }))

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
        {/* Siempre disponible: la ventana revisa qué tiene el grupo y ofrece la salida correcta. */}
        <Button variant="destructive" onClick={() => setEliminar(true)} disabled={ocupado}>
          <Trash2 aria-hidden />
          Eliminar
        </Button>
      </div>
      <DialogoEliminacion
        objeto="grupo"
        id={grupoId}
        abierto={eliminar}
        onCerrar={() => setEliminar(false)}
        onEliminado={() => {
          setEliminar(false)
          if (alEliminar) alEliminar()
          else router.push("/admin/grupos")
          router.refresh()
        }}
        alternativas={alternativas}
      />

      <Dialog open={confirmar !== null} onOpenChange={(v) => !v && !ocupado && setConfirmar(null)}>
        <DialogContent showCloseButton={false}>
          {confirmar && (
            <>
              <DialogHeader>
                <DialogTitle>{`¿${ACCION[confirmar].etiqueta}?`}</DialogTitle>
                <DialogDescription>
                  {`${ACCION[confirmar].confirmar} Estado nuevo: ${ETIQUETA_ESTADO_GRUPO[confirmar]}.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" disabled={ocupado} autoFocus />}>Volver</DialogClose>
                <Button variant="destructive" onClick={() => ejecutar(confirmar)} disabled={ocupado}>
                  {ocupado && <Loader2 className="animate-spin" aria-hidden />}
                  {ACCION[confirmar].etiqueta}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
