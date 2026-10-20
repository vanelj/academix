import type { Metadata } from "next"
import Link from "next/link"
import { KeyRound } from "lucide-react"

import { PantallaAcceso } from "@/components/auth/pantalla-acceso"
import { RestablecerForm } from "@/components/auth/restablecer-form"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { usuarioEnRecuperacion } from "@/lib/auth/enlaces"

export const metadata: Metadata = {
  title: "Nueva contraseña · Academix",
}

// Solo con una sesión de recuperación verificada (enlace del correo → /auth/restablecer).
export default async function RestablecerContrasenaPage() {
  const autorizado = Boolean(await usuarioEnRecuperacion())

  if (!autorizado) {
    return (
      <PantallaAcceso titulo="Enlace no válido">
        <Card className="gap-0 py-0 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 px-5 py-10 text-center sm:px-8">
            <div className="flex size-12 items-center justify-center rounded-full bg-warning/10 text-warning dark:bg-warning/20">
              <KeyRound className="size-6" aria-hidden />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Para crear una contraseña nueva necesitas abrir un enlace de recuperación
              válido. El enlace puede haber vencido o ya haberse utilizado.
            </p>
            <Link href="/recuperar-contrasena" className={buttonVariants()}>
              Solicitar un enlace nuevo
            </Link>
            <Link href="/login" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Volver a iniciar sesión
            </Link>
          </CardContent>
        </Card>
      </PantallaAcceso>
    )
  }

  return (
    <PantallaAcceso
      titulo="Crea una contraseña nueva"
      descripcion="Elige una contraseña que no hayas usado antes en esta cuenta."
    >
      <RestablecerForm />
    </PantallaAcceso>
  )
}
