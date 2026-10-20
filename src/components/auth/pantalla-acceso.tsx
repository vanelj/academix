import { AuthHeader } from "@/components/public/auth-header"
import { cn } from "@/lib/utils"

type PantallaAccesoProps = {
  titulo: string
  descripcion?: React.ReactNode
  ancho?: "md" | "3xl"
  children: React.ReactNode
}

// Marco de las pantallas de acceso (selector de rol, cuenta, completar registro):
// mismo encabezado, fondo y tipografía que /login y /registro.
export function PantallaAcceso({ titulo, descripcion, ancho = "md", children }: PantallaAccesoProps) {
  const max = ancho === "md" ? "max-w-md" : "max-w-3xl"

  return (
    <div className="relative isolate flex min-h-svh flex-1 flex-col bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-linear-to-b from-primary/10 to-transparent dark:from-primary/15"
      />
      <AuthHeader className={max} />
      <main className={cn("mx-auto w-full flex-1 px-4 pt-4 pb-12 sm:px-6 sm:pt-6", max)}>
        <div className="mt-4 mb-6 space-y-2 sm:mt-6 sm:mb-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{titulo}</h1>
          {descripcion && (
            <p className="text-sm text-muted-foreground sm:text-base">{descripcion}</p>
          )}
        </div>
        {children}
      </main>
    </div>
  )
}
