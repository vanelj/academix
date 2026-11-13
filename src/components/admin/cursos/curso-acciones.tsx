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
import { DialogoEliminacion } from "@/components/admin/eliminacion-dialogo"
import { cambiarEstadoCurso, type ResultadoCurso } from "@/lib/cursos/acciones"
import { notificar } from "@/lib/notificaciones"
import type { EstadoCurso } from "@/lib/validations/curso"

type Accion = "publicar" | "borrador" | "desactivar"

// «desactivado» es el estado ARCHIVADO: fuera del catálogo y sin nuevas
// solicitudes (la BD exige curso publicado), conservando todo su historial.
const CONFIRMACION: Record<Exclude<Accion, "publicar">, { titulo: string; boton: string; destructiva: boolean }> = {
  borrador: { titulo: "¿Retirar el curso del catálogo?", boton: "Pasar a borrador", destructiva: false },
  desactivar: { titulo: "¿Archivar el curso?", boton: "Archivar", destructiva: false },
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
  const [eliminar, setEliminar] = useState(false)
  void grupos

  async function ejecutar(accion: Accion) {
    if (procesando) return
    setProcesando(accion)
    const textos = {
      publicar: ["Publicando curso…", "Curso publicado", "Ya aparece en el catálogo público."],
      borrador: ["Retirando del catálogo…", "El curso volvió a borrador", "Ya no aparece en el catálogo público."],
      desactivar: ["Archivando curso…", "Curso archivado", "Ya no aparece en el catálogo ni recibe solicitudes. Su historial se conserva."],
    } as const
    const [enCurso, exito, detalle] = textos[accion]
    const operacion = notificar.operacion(enCurso)
    try {
      const resultado: ResultadoCurso = await cambiarEstadoCurso(cursoId, accion === "publicar" ? "publicado" : accion === "borrador" ? "borrador" : "desactivado")

      if (resultado.ok) {
        operacion.exito(exito, { descripcion: detalle })
        setConfirmar(null)
        router.refresh()
        return true
      } else {
        const avisar = resultado.gravedad === "advertencia" ? operacion.advertencia : operacion.error
        avisar("No se pudo completar la operación", {
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
        <Link href={`/admin/cursos/${cursoId}/asistente`} className={buttonVariants({ variant: "outline" })}>
          <Pencil aria-hidden />
          {estado === "borrador" ? "Continuar configuración" : "Editar"}
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
            Desarchivar (vuelve a borrador)
          </Button>
        )}
        {estado !== "desactivado" && (
          <Button variant="outline" onClick={() => setConfirmar("desactivar")} disabled={ocupado}>
            {icono("desactivar", EyeOff)}
            Archivar
          </Button>
        )}
        {/* Siempre disponible: la ventana revisa qué tiene el curso y ofrece la salida correcta. */}
        <Button variant="destructive" onClick={() => setEliminar(true)} disabled={ocupado}>
          <Trash2 aria-hidden />
          Eliminar
        </Button>
      </div>
      <DialogoEliminacion
        objeto="curso"
        id={cursoId}
        abierto={eliminar}
        onCerrar={() => setEliminar(false)}
        onEliminado={() => { setEliminar(false); router.push("/admin/cursos"); router.refresh() }}
        alternativas={estado === "desactivado" ? [] : [{
          etiqueta: "Archivar curso",
          descripcion: "Deja de mostrarse en el catálogo y no recibe nuevas solicitudes. Se conservan matrículas, pagos, notas, resultados y certificados, y las clases en curso continúan. Podrás desarchivarlo.",
          ejecutar: async () => (await ejecutar("desactivar")) === true,
        }]}
      />

      <Dialog open={confirmar !== null} onOpenChange={(abierto) => !abierto && !ocupado && setConfirmar(null)}>
        <DialogContent showCloseButton={false}>
          {confirmar && (
            <>
              <DialogHeader>
                <DialogTitle>{CONFIRMACION[confirmar].titulo}</DialogTitle>
                <DialogDescription>
                  {confirmar === "desactivar"
                      ? `«${nombre}» dejará de mostrarse en el catálogo y no recibirá nuevas solicitudes. Se conserva todo su historial y las clases en curso continúan. Podrás desarchivarlo.`
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
