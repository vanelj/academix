"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarDays, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react"

import { DialogoEliminacion } from "@/components/admin/eliminacion-dialogo"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Acciones rápidas de cada grupo en el listado. Los cambios de estado (abrir,
 * iniciar, cancelar, cerrar) siguen en la ficha, donde se explican sus efectos;
 * si el grupo tiene historial, «Eliminar» lleva a esas alternativas.
 */
export function GrupoMenuFila({ grupo }: { grupo: { id: string; codigo: string } }) {
  const router = useRouter()
  const [eliminar, setEliminar] = useState(false)
  return (
    <div className="flex items-center justify-end gap-1">
      <Link href={`/admin/grupos/${grupo.id}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Ver grupo ${grupo.codigo}`} title="Ver">
        <Eye aria-hidden />
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Más acciones para el grupo ${grupo.codigo}`}>
          <MoreHorizontal aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href={`/admin/grupos/${grupo.id}`} />}>
              <Eye aria-hidden />
              Ver ficha y estado
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href={`/admin/grupos/${grupo.id}/editar`} />}>
              <Pencil aria-hidden />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href={`/admin/grupos/${grupo.id}#programacion`} />}>
              <CalendarDays aria-hidden />
              Horarios y programación
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setEliminar(true)}>
            <Trash2 aria-hidden />
            Eliminar…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {eliminar && (
        <DialogoEliminacion
          objeto="grupo"
          id={grupo.id}
          abierto={eliminar}
          onCerrar={() => setEliminar(false)}
          onEliminado={() => { setEliminar(false); router.refresh() }}
          alternativas={[{
            etiqueta: "Ir a la ficha del grupo",
            descripcion: "Desde la ficha puedes Cancelar el grupo (no se dictará) o Cerrarlo (terminó), conservando matrículas, pagos y notas.",
            ejecutar: async () => { router.push(`/admin/grupos/${grupo.id}`); return true },
          }]}
        />
      )}
    </div>
  )
}
