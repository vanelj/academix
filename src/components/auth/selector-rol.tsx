"use client"

import { useActionState } from "react"
import { ArrowRight, CircleAlert, GraduationCap, Loader2, Presentation, ShieldCheck } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { roleConfig, type Role } from "@/config/navigation"
import { elegirRol, type EstadoAccion } from "@/lib/auth/acciones"
import { cn } from "@/lib/utils"

const detalle: Record<Role, { icono: LucideIcon; texto: string }> = {
  admin: { icono: ShieldCheck, texto: "Gestiona la institución, sus cursos y su personal." },
  docente: { icono: Presentation, texto: "Atiende tus grupos, evaluaciones y calificaciones." },
  estudiante: { icono: GraduationCap, texto: "Consulta tus cursos, horarios, pagos y notas." },
}

export function SelectorRol({ roles, rolActivo }: { roles: Role[]; rolActivo: Role | null }) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(elegirRol, null)

  return (
    <form action={accion} className="space-y-3" aria-busy={pendiente}>
      {roles.map((rol) => {
        const { icono: Icono, texto } = detalle[rol]
        return (
          <button
            key={rol}
            type="submit"
            name="rol"
            value={rol}
            disabled={pendiente}
            className={cn(
              "group flex w-full items-center gap-4 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
            )}
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/15">
              <Icono className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-semibold">{roleConfig[rol].label}</span>
                {rol === rolActivo && <Badge variant="secondary">Último usado</Badge>}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{texto}</span>
            </span>
            {pendiente ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            )}
          </button>
        )
      })}

      {estado?.mensaje && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm dark:bg-destructive/10"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p>{estado.mensaje}</p>
        </div>
      )}
    </form>
  )
}
