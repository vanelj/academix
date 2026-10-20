"use client"

import { useFormStatus } from "react-dom"
import { Loader2, LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cerrarSesion } from "@/lib/auth/acciones"

type BotonCerrarSesionProps = {
  /** "icono": botón compacto del encabezado del panel; "texto": botón con etiqueta. */
  variante?: "icono" | "texto"
}

export function BotonCerrarSesion({ variante = "texto" }: BotonCerrarSesionProps) {
  return (
    <form action={cerrarSesion}>
      <Contenido variante={variante} />
    </form>
  )
}

function Contenido({ variante }: Required<BotonCerrarSesionProps>) {
  const { pending } = useFormStatus()

  if (variante === "icono") {
    return (
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        disabled={pending}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        {pending ? <Loader2 className="animate-spin" /> : <LogOut />}
      </Button>
    )
  }

  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
      Cerrar sesión
    </Button>
  )
}
