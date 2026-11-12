import type { Metadata } from "next"

import { ActivacionDesdeEnlace } from "@/components/auth/activacion-desde-enlace"
import { PantallaAcceso } from "@/components/auth/pantalla-acceso"
import { RestablecerForm } from "@/components/auth/restablecer-form"
import { usuarioEnActivacion } from "@/lib/auth/enlaces"

export const metadata: Metadata = {
  title: "Activar cuenta · Academix",
}

/**
 * Activación de una cuenta creada por la institución (p. ej. un docente): el
 * invitado crea su contraseña. Solo con la sesión verificada por /auth/activar
 * (marca httpOnly) o con la cuenta marcada como pendiente de activar. Sin eso,
 * ActivacionDesdeEnlace atiende el enlace en formato de fragmento o muestra el aviso.
 */
export default async function ActivarCuentaPage({ searchParams }: PageProps<"/activar-cuenta">) {
  const autorizado = Boolean(await usuarioEnActivacion())

  if (!autorizado) {
    const { aviso } = await searchParams
    return (
      <PantallaAcceso titulo="Activa tu cuenta">
        <ActivacionDesdeEnlace vencidoInicial={aviso === "enlace-vencido"} />
      </PantallaAcceso>
    )
  }

  return (
    <PantallaAcceso
      titulo="Bienvenido a Academix — Configura tu contraseña"
      descripcion="Crea la contraseña con la que ingresarás a Academix. Después inicia sesión con tu correo y esta contraseña."
    >
      <RestablecerForm activacion />
    </PantallaAcceso>
  )
}
