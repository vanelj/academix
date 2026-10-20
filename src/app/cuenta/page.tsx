import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ShieldAlert, UserX } from "lucide-react"

import { BotonCerrarSesion } from "@/components/auth/boton-cerrar-sesion"
import { PantallaAcceso } from "@/components/auth/pantalla-acceso"
import { Card, CardContent } from "@/components/ui/card"
import { destinoSegunContexto, obtenerContexto } from "@/lib/auth/contexto"

export const metadata: Metadata = {
  title: "Estado de la cuenta · Academix",
}

// Cuenta autenticada que no puede entrar a ningún panel: perfil desactivado o
// sin roles habilitados. No se asigna ningún privilegio automáticamente.
export default async function CuentaPage() {
  const ctx = await obtenerContexto()

  if (ctx.estado === "sin_sesion") redirect("/login")
  if (ctx.estado === "sin_perfil") redirect("/completar-registro")

  const destino = destinoSegunContexto(ctx)
  if (destino !== "/cuenta") redirect(destino)

  const desactivada = !ctx.perfil.activo
  const Icono = desactivada ? UserX : ShieldAlert

  return (
    <PantallaAcceso titulo={desactivada ? "Cuenta desactivada" : "Sin acceso a paneles"}>
      <Card className="gap-0 py-0 shadow-sm">
        <CardContent className="flex flex-col items-center gap-4 px-5 py-10 text-center sm:px-8">
          <div className="flex size-12 items-center justify-center rounded-full bg-warning/10 text-warning dark:bg-warning/20">
            <Icono className="size-6" aria-hidden />
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            {desactivada
              ? "Tu cuenta fue desactivada por tu institución, por lo que no puedes acceder a los paneles. Si crees que es un error, comunícate con el administrador de tu institución."
              : "Tu cuenta no tiene ningún rol habilitado en este momento. El administrador de tu institución debe asignarte un rol para que puedas ingresar."}
          </p>
          {ctx.email && (
            <p className="text-xs text-muted-foreground">
              Sesión iniciada como <span className="font-medium text-foreground">{ctx.email}</span>
            </p>
          )}
          <BotonCerrarSesion />
        </CardContent>
      </Card>
    </PantallaAcceso>
  )
}
