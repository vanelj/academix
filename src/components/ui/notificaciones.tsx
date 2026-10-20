"use client"

import { Toast } from "@base-ui/react/toast"
import { CircleAlert, CircleCheck, Info, Loader2, TriangleAlert, X } from "lucide-react"

import { gestorNotificaciones, type DatosNotificacion, type TipoNotificacion } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"

/**
 * Proveedor y zona de notificaciones (Toast de Base UI). Se monta UNA vez en el
 * layout raíz; las notificaciones se crean con `notificar` (src/lib/notificaciones).
 * - Móvil: arriba, a todo el ancho (no tapa la barra de acciones inferior).
 * - Escritorio: abajo a la derecha.
 * - Región ARIA con anuncio educado o urgente según el tipo; se puede cerrar,
 *   deslizar para descartar y no bloquea la navegación.
 */
export function Notificaciones({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider toastManager={gestorNotificaciones} limit={4}>
      {children}
      <Toast.Portal>
        <Toast.Viewport
          aria-label="Notificaciones"
          className="fixed inset-x-4 top-4 z-[60] flex flex-col gap-2 outline-none sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-4 sm:w-96 sm:flex-col-reverse"
        >
          <Lista />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

const ESTILO: Record<TipoNotificacion, { icono: React.ComponentType<{ className?: string }>; color: string }> = {
  exito: { icono: CircleCheck, color: "text-success" },
  error: { icono: CircleAlert, color: "text-destructive" },
  advertencia: { icono: TriangleAlert, color: "text-warning" },
  info: { icono: Info, color: "text-primary" },
  procesando: { icono: Loader2, color: "animate-spin text-muted-foreground" },
}

const BORDE: Record<TipoNotificacion, string> = {
  exito: "border-l-success",
  error: "border-l-destructive",
  advertencia: "border-l-warning",
  info: "border-l-primary",
  procesando: "border-l-muted-foreground/40",
}

function Lista() {
  const { toasts } = Toast.useToastManager<DatosNotificacion>()

  return toasts.map((toast) => {
    const tipo: TipoNotificacion = toast.data?.tipo ?? "info"
    const { icono: Icono, color } = ESTILO[tipo]
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        swipeDirection={["right", "up"]}
        className={cn(
          "pointer-events-auto relative w-full rounded-xl border border-l-4 bg-popover p-3 pr-9 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-none select-none",
          "[transform:translate(var(--toast-swipe-movement-x),var(--toast-swipe-movement-y))] transition-[opacity,transform,translate] duration-200 ease-out",
          "data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
          "data-[limited]:hidden focus-visible:ring-2 focus-visible:ring-ring",
          BORDE[tipo]
        )}
      >
        <Toast.Content className="flex gap-3">
          <Icono className={cn("mt-0.5 size-4 shrink-0", color)} aria-hidden />
          <div className="min-w-0 flex-1 space-y-0.5">
            <Toast.Title className="font-medium leading-snug">{toast.title}</Toast.Title>
            {toast.description != null && (
              <Toast.Description className="text-muted-foreground">{toast.description}</Toast.Description>
            )}
            {toast.actionProps && (
              <Toast.Action className="mt-2 inline-flex h-7 items-center rounded-md border border-input bg-background px-2.5 text-xs font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30" />
            )}
          </div>
        </Toast.Content>
        {tipo !== "procesando" && (
          <Toast.Close
            aria-label="Cerrar notificación"
            className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" aria-hidden />
          </Toast.Close>
        )}
      </Toast.Root>
    )
  })
}
