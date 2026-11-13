"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArchiveRestore, Copy, Eye, EyeOff, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react"

import { DialogoEliminacion } from "@/components/admin/eliminacion-dialogo"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cambiarEstadoCurso } from "@/lib/cursos/acciones"
import { duplicarCurso } from "@/lib/cursos/duplicar-acciones"
import { notificar } from "@/lib/notificaciones"
import type { EstadoCurso } from "@/lib/validations/curso"

/**
 * Acciones rápidas de cada curso en el listado (Ver, Editar, Duplicar,
 * Archivar/Desarchivar, Eliminar). Todas funcionan de verdad y el servidor
 * vuelve a validar permisos, institución e historial en cada una.
 */
export function CursoMenuFila({ curso }: { curso: { id: string; nombre: string; estado: EstadoCurso } }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<"duplicar" | "archivar" | "desarchivar" | null>(null)
  const [archivar, setArchivar] = useState(false)
  const [eliminar, setEliminar] = useState(false)

  async function cambiarEstado(destino: "desactivado" | "borrador"): Promise<boolean> {
    if (ocupado) return false
    setOcupado(destino === "desactivado" ? "archivar" : "desarchivar")
    const op = notificar.operacion(destino === "desactivado" ? "Archivando curso…" : "Desarchivando curso…")
    try {
      const r = await cambiarEstadoCurso(curso.id, destino)
      if (r.ok) {
        op.exito(destino === "desactivado" ? "Curso archivado" : "Curso desarchivado", {
          descripcion: destino === "desactivado" ? "Ya no aparece en el catálogo. Su historial se conserva." : "Volvió a borrador: publícalo cuando esté listo.",
        })
        setArchivar(false)
        router.refresh()
        return true
      }
      ;(r.gravedad === "advertencia" ? op.advertencia : op.error)("No se pudo completar la operación", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo completar la operación", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setOcupado(null)
    }
    return false
  }

  async function duplicar() {
    if (ocupado) return
    setOcupado("duplicar")
    const op = notificar.operacion("Duplicando curso…")
    try {
      const r = await duplicarCurso(curso.id)
      if (r.ok) {
        ;(r.aviso ? op.advertencia : op.exito)("Copia creada como borrador", {
          descripcion: r.aviso ?? "Sin grupos ni historial. Revisa y ajusta la copia en el asistente.",
        })
        router.push(`/admin/cursos/${r.id}/asistente`)
      } else op.error("No se pudo duplicar", { descripcion: r.mensaje })
    } catch {
      op.error("No se pudo duplicar", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link href={`/admin/cursos/${curso.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Ver ${curso.nombre}`} title="Ver">
        <Eye aria-hidden />
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Más acciones para ${curso.nombre}`} disabled={ocupado !== null}>
          {ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href={`/admin/cursos/${curso.id}`} />}>
              <Eye aria-hidden />
              Ver ficha
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href={`/admin/cursos/${curso.id}/asistente`} />}>
              <Pencil aria-hidden />
              {curso.estado === "borrador" ? "Continuar configuración" : "Editar"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={duplicar}>
              <Copy aria-hidden />
              Duplicar
            </DropdownMenuItem>
            {curso.estado === "desactivado" ? (
              <DropdownMenuItem onClick={() => void cambiarEstado("borrador")}>
                <ArchiveRestore aria-hidden />
                Desarchivar
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setArchivar(true)}>
                <EyeOff aria-hidden />
                Archivar
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setEliminar(true)}>
            <Trash2 aria-hidden />
            Eliminar…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={archivar} onOpenChange={(a) => !a && !ocupado && setArchivar(false)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Archivar el curso?</DialogTitle>
            <DialogDescription>
              «{curso.nombre}» dejará de mostrarse en el catálogo y no recibirá nuevas solicitudes. Se conserva todo su historial y las clases en curso continúan. Podrás desarchivarlo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={ocupado !== null} autoFocus />}>Cancelar</DialogClose>
            <Button onClick={() => void cambiarEstado("desactivado")} disabled={ocupado !== null}>
              {ocupado === "archivar" && <Loader2 className="animate-spin" aria-hidden />}
              Archivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {eliminar && (
        <DialogoEliminacion
          objeto="curso"
          id={curso.id}
          abierto={eliminar}
          onCerrar={() => setEliminar(false)}
          onEliminado={() => { setEliminar(false); router.refresh() }}
          alternativas={curso.estado === "desactivado" ? [] : [{
            etiqueta: "Archivar curso",
            descripcion: "Deja de mostrarse en el catálogo y no recibe nuevas solicitudes. Se conservan matrículas, pagos, notas, resultados y certificados.",
            ejecutar: () => cambiarEstado("desactivado"),
          }]}
        />
      )}
    </div>
  )
}
