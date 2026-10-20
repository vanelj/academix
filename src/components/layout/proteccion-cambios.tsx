"use client"

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { notificar } from "@/lib/notificaciones"

/**
 * Protección de cambios sin guardar en los paneles.
 *
 * - Un formulario declara sus cambios pendientes con useProtegerCambios(isDirty).
 * - Los enlaces internos del panel (barra lateral y menú del avatar) pasan
 *   onNavigate={useNavegacionProtegida()(href)} a <Link>: es la API oficial de
 *   Next.js para cancelar una navegación del lado del cliente. Si hay cambios,
 *   se cancela y se pide confirmación. No se intercepta ningún otro enlace ni
 *   se modifica el router.
 * - Al cerrar o recargar la pestaña actúa el aviso nativo del navegador.
 */

type NavigateEvent = { preventDefault: () => void }

type ContextoProteccion = {
  registrar: (id: string, conCambios: boolean) => void
  alNavegar: (href: string) => (event: NavigateEvent) => void
}

const Contexto = createContext<ContextoProteccion | null>(null)

export function ProteccionCambiosProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const conCambios = useRef(new Set<string>())
  const rutaActual = useRef(pathname)
  const [destino, setDestino] = useState<string | null>(null)

  useEffect(() => {
    rutaActual.current = pathname
  }, [pathname])

  const valor = useMemo<ContextoProteccion>(
    () => ({
      registrar: (id, hay) => {
        if (hay) conCambios.current.add(id)
        else conCambios.current.delete(id)
      },
      alNavegar: (href) => (event) => {
        // Sin cambios, o enlace a la misma página: navegación normal.
        if (conCambios.current.size === 0 || href === rutaActual.current) return
        event.preventDefault()
        setDestino(href)
      },
    }),
    []
  )

  function descartarYSalir() {
    if (!destino) return
    conCambios.current.clear()
    setDestino(null)
    notificar.info("Se descartaron los cambios sin guardar.")
    router.push(destino)
  }

  return (
    <Contexto value={valor}>
      {children}
      <Dialog open={destino !== null} onOpenChange={(abierto) => !abierto && setDestino(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Descartar los cambios y salir?</DialogTitle>
            <DialogDescription>
              Tienes cambios sin guardar en esta sección. Si sales ahora, se perderán.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" autoFocus />}>Seguir editando</DialogClose>
            <Button variant="destructive" onClick={descartarYSalir}>
              Descartar y salir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Contexto>
  )
}

/**
 * Declara si el formulario tiene cambios pendientes. Activa el diálogo de los
 * enlaces del panel y el aviso del navegador al cerrar o recargar la pestaña.
 */
export function useProtegerCambios(hayCambios: boolean) {
  const contexto = useContext(Contexto)
  const id = useId()

  useEffect(() => {
    if (!contexto) return
    contexto.registrar(id, hayCambios)
    return () => contexto.registrar(id, false)
  }, [contexto, id, hayCambios])

  useEffect(() => {
    if (!hayCambios) return
    const avisar = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", avisar)
    return () => window.removeEventListener("beforeunload", avisar)
  }, [hayCambios])
}

const sinProteccion = () => () => {}

/** Devuelve `(href) => onNavigate` para los <Link> internos del panel. */
export function useNavegacionProtegida(): (href: string) => (event: NavigateEvent) => void {
  return useContext(Contexto)?.alNavegar ?? sinProteccion
}
