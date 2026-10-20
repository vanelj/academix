import { CircleAlert, CircleCheck, Info, MailWarning } from "lucide-react"

import { cn } from "@/lib/utils"

const estilos = {
  error: { icono: CircleAlert, clases: "border-destructive/30 bg-destructive/5 dark:bg-destructive/10", color: "text-destructive" },
  advertencia: { icono: MailWarning, clases: "border-warning/30 bg-warning/5 dark:bg-warning/10", color: "text-warning" },
  exito: { icono: CircleCheck, clases: "border-success/30 bg-success/5 dark:bg-success/10", color: "text-success" },
  info: { icono: Info, clases: "border-primary/30 bg-primary/5 dark:bg-primary/10", color: "text-primary" },
} as const

export type TipoAviso = keyof typeof estilos

/** Mensaje accesible de las pantallas de acceso (errores con role="alert"). */
export function Aviso({ tipo, children }: { tipo: TipoAviso; children: React.ReactNode }) {
  const { icono: Icono, clases, color } = estilos[tipo]
  return (
    <div
      role={tipo === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-3 text-sm", clases)}
    >
      <Icono className={cn("mt-0.5 size-4 shrink-0", color)} aria-hidden />
      <div>{children}</div>
    </div>
  )
}
