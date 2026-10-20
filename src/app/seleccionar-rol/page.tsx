import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { BotonCerrarSesion } from "@/components/auth/boton-cerrar-sesion"
import { PantallaAcceso } from "@/components/auth/pantalla-acceso"
import { SelectorRol } from "@/components/auth/selector-rol"
import { nombreCompleto, obtenerContexto } from "@/lib/auth/contexto"

export const metadata: Metadata = {
  title: "Elegir rol · Academix",
}

// Solo muestra los roles asignados y habilitados de la cuenta (usuario_roles).
export default async function SeleccionarRolPage() {
  const ctx = await obtenerContexto()

  if (ctx.estado === "sin_sesion") redirect("/login")
  if (ctx.estado === "sin_perfil") redirect("/completar-registro")
  if (!ctx.perfil.activo || ctx.roles.length === 0) redirect("/cuenta")

  return (
    <PantallaAcceso
      titulo="¿Con qué rol quieres ingresar?"
      descripcion={
        <>
          Hola, <span className="font-medium text-foreground">{nombreCompleto(ctx.perfil)}</span>.
          {ctx.institucion && <> Institución: {ctx.institucion}.</>} Podrás cambiar de rol
          más adelante desde tu panel.
        </>
      }
    >
      <SelectorRol roles={ctx.roles} rolActivo={ctx.rolActivo} />
      <div className="mt-6 flex justify-center">
        <BotonCerrarSesion />
      </div>
    </PantallaAcceso>
  )
}
