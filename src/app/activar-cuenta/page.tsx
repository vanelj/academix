import type { Metadata } from "next"
import Link from "next/link"
import { MailWarning } from "lucide-react"

import { PantallaAcceso } from "@/components/auth/pantalla-acceso"
import { RestablecerForm } from "@/components/auth/restablecer-form"
import { Card, CardContent } from "@/components/ui/card"
import { usuarioEnRecuperacion } from "@/lib/auth/enlaces"

export const metadata: Metadata = {
  title: "Activar cuenta · Academix",
}

/**
 * Activación de una cuenta creada por la institución: el invitado crea su
 * contraseña. Solo con la sesión verificada por /auth/activar (enlace de
 * invitación) más su marca httpOnly; cualquier otra visita ve un aviso.
 */
export default async function ActivarCuentaPage({ searchParams }: PageProps<"/activar-cuenta">) {
  const autorizado = Boolean(await usuarioEnRecuperacion())

  if (!autorizado) {
    const { aviso } = await searchParams
    return (
      <PantallaAcceso titulo="No se pudo activar la cuenta">
        <Card className="gap-0 py-0 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 px-5 py-10 text-center sm:px-8">
            <div className="flex size-12 items-center justify-center rounded-full bg-warning/10 text-warning dark:bg-warning/20">
              <MailWarning className="size-6" aria-hidden />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              {aviso === "enlace-vencido"
                ? "El enlace de invitación venció o ya se utilizó."
                : "Para activar tu cuenta necesitas abrir el enlace de invitación que recibiste por correo."}{" "}
              Si ya activaste tu cuenta, inicia sesión; si no, pide a tu institución que te reenvíe la
              invitación.
            </p>
            <Link href="/login" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Ir a iniciar sesión
            </Link>
          </CardContent>
        </Card>
      </PantallaAcceso>
    )
  }

  return (
    <PantallaAcceso titulo="Activa tu cuenta" descripcion="Crea la contraseña con la que ingresarás a Academix.">
      <RestablecerForm activacion />
    </PantallaAcceso>
  )
}
