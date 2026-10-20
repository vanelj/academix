"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArchiveRestore, EyeOff, Globe, Loader2, Pencil, Trash2, Undo2 } from "lucide-react"

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
import { cambiarEstadoCurso, eliminarCurso, type ResultadoCurso } from "@/lib/cursos/acciones"
import { notificar } from "@/lib/notificaciones"
import type { EstadoCurso } from "@/lib/validations/curso"

type Accion = "publicar" | "borrador" | "desactivar" | "eliminar"

const CONFIRMACION: Record<Exclude<Accion, "publicar">, { titulo: string; boton: string; destructiva: boolean }> = {
  borrador: { titulo: "¿Retirar el curso del catálogo?", boton: "Pasar a borrador", destructiva: false },
  desactivar: { titulo: "¿Desactivar el curso?", boton: "Desactivar", destructiva: true },
  eliminar: { titulo: "¿Eliminar el curso?", boton: "Eliminar", destructiva: true },
}

/**
 * Acciones de la ficha del curso. El servidor vuelve a comprobar cada regla
 * (requisitos de publicación, grupos asociados, institución y rol).
 */
export function CursoAcciones({
  cursoId,
  nombre,
  estado,
  puedePublicar,
  grupos,
}: {
  cursoId: string
  nombre: string
  estado: EstadoCurso
  puedePublicar: boolean
  grupos: number | null
}) {
  const router = useRouter()
  const [confirmar, setConfirmar] = useState<Exclude<Accion, "publicar"> | null>(null)
  const [procesando, setProcesando] = useState<Accion | null>(null)
  const conGrupos = (grupos ?? 0) > 0

  async function ejecutar(accion: Accion) {
    if (procesando) return
    setProcesando(accion)
    const textos = {
      publicar: ["Publicando curso…", "Curso publicado", "Ya aparece en el catálogo público."],
      borrador: ["Retirando del catálogo…", "El curso volvió a borrador", "Ya no aparece en el catálogo público."],
      desactivar: ["Desactivando curso…", "Curso desactivado correctamente", "Ya no aparece en el catálogo público."],
      eliminar: ["Eliminando curso…", "Curso eliminado", `«${nombre}» se eliminó definitivamente.`],
    } as const
    const [enCurso, exito, detalle] = textos[accion]
    const operacion = notificar.operacion(enCurso)
    try {
      let resultado: ResultadoCurso
      if (accion === "eliminar") resultado = await eliminarCurso(cursoId)
      else resultado = await cambiarEstadoCurso(cursoId, accion === "publicar" ? "publicado" : accion === "borrador" ? "borrador" : "desactivado")

      if (resultado.ok) {
        operacion.exito(exito, { descripcion: detalle })
        setConfirmar(null)
        if (accion === "eliminar") router.push("/admin/cursos")
        router.refresh()
      } else {
        const avisar = resultado.gravedad === "advertencia" ? operacion.advertencia : operacion.error
        avisar(accion === "eliminar" ? "No se pudo eliminar el curso" : "No se pudo completar la operación", {
          descripcion: resultado.mensaje,
        })
        setConfirmar(null)
      }
    } catch {
      operacion.error("No se pudo completar la operación", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setProcesando(null)
    }
  }

  const ocupado = procesando !== null
  const icono = (accion: Accion, Icono: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>) =>
    procesando === accion ? <Loader2 className="animate-spin" aria-hidden /> : <Icono aria-hidden />

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/cursos/${cursoId}/editar`} className={buttonVariants({ variant: "outline" })}>
          <Pencil aria-hidden />
          Editar
        </Link>
        {estado !== "publicado" && (
          <Button onClick={() => ejecutar("publicar")} disabled={ocupado || !puedePublicar}>
            {icono("publicar", Globe)}
            Publicar
          </Button>
        )}
        {estado === "publicado" && (
          <Button variant="outline" onClick={() => setConfirmar("borrador")} disabled={ocupado}>
            {icono("borrador", Undo2)}
            Pasar a borrador
          </Button>
        )}
        {estado === "desactivado" && (
          <Button variant="outline" onClick={() => ejecutar("borrador")} disabled={ocupado}>
            {icono("borrador", ArchiveRestore)}
            Reactivar como borrador
          </Button>
        )}
        {estado !== "desactivado" && (
          <Button variant="outline" onClick={() => setConfirmar("desactivar")} disabled={ocupado}>
            {icono("desactivar", EyeOff)}
            Desactivar
          </Button>
        )}
        <Button
          variant="destructive"
          onClick={() => setConfirmar("eliminar")}
          disabled={ocupado || conGrupos}
          title={conGrupos ? "Tiene grupos asociados: desactívalo en su lugar." : undefined}
        >
          {icono("eliminar", Trash2)}
          Eliminar
        </Button>
      </div>
      {conGrupos && (
        <p className="mt-2 text-xs text-muted-foreground">
          No se puede eliminar porque tiene grupos asociados. Desactívalo para retirarlo de la oferta.
        </p>
      )}

      <Dialog open={confirmar !== null} onOpenChange={(abierto) => !abierto && !ocupado && setConfirmar(null)}>
        <DialogContent showCloseButton={false}>
          {confirmar && (
            <>
              <DialogHeader>
                <DialogTitle>{CONFIRMACION[confirmar].titulo}</DialogTitle>
                <DialogDescription>
                  {confirmar === "eliminar"
                    ? `Se eliminará «${nombre}» y sus condiciones de forma permanente. Esta acción no se puede deshacer.`
                    : confirmar === "desactivar"
                      ? `«${nombre}» dejará de mostrarse en el catálogo público. Sus datos se conservan y podrás reactivarlo.`
                      : `«${nombre}» dejará de mostrarse en el catálogo público hasta que vuelvas a publicarlo.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" disabled={ocupado} autoFocus />}>Cancelar</DialogClose>
                <Button
                  variant={CONFIRMACION[confirmar].destructiva ? "destructive" : "default"}
                  onClick={() => ejecutar(confirmar)}
                  disabled={ocupado}
                >
                  {ocupado && <Loader2 className="animate-spin" aria-hidden />}
                  {CONFIRMACION[confirmar].boton}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
