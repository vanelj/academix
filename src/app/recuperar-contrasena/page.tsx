import type { Metadata } from "next"

import { PantallaAcceso } from "@/components/auth/pantalla-acceso"
import { RecuperarForm } from "@/components/auth/recuperar-form"
import type { AvisoLogin } from "@/components/login/login-form"

export const metadata: Metadata = {
  title: "Recuperar contraseña · Academix",
}

// Avisos fijos según ?aviso= (enviado por /auth/restablecer). Nada se toma literal de la URL.
const AVISOS: Record<string, AvisoLogin> = {
  "enlace-vencido": {
    tipo: "error",
    mensaje: "El enlace de recuperación venció o ya fue utilizado. Solicita uno nuevo.",
  },
  "enlace-invalido": {
    tipo: "error",
    mensaje: "El enlace de recuperación no es válido. Solicita uno nuevo.",
  },
  "otro-navegador": {
    tipo: "error",
    mensaje:
      "No se pudo validar el enlace en este navegador. Ábrelo en el mismo navegador donde lo solicitaste o solicita uno nuevo aquí.",
  },
}

export default async function RecuperarContrasenaPage({
  searchParams,
}: PageProps<"/recuperar-contrasena">) {
  const { aviso } = await searchParams
  const avisoInicial =
    typeof aviso === "string" && Object.hasOwn(AVISOS, aviso) ? AVISOS[aviso] : null

  return (
    <PantallaAcceso
      titulo="Recuperar contraseña"
      descripcion="Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva."
    >
      <RecuperarForm aviso={avisoInicial} />
    </PantallaAcceso>
  )
}
