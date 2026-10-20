import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { BotonCerrarSesion } from "@/components/auth/boton-cerrar-sesion"
import { CompletarRegistroForm } from "@/components/auth/completar-registro-form"
import { Incorporacion } from "@/components/auth/incorporacion"
import { PantallaAcceso } from "@/components/auth/pantalla-acceso"
import { destinoSegunContexto, obtenerContexto } from "@/lib/auth/contexto"
import { leerRegistroPendiente } from "@/lib/registro/pendiente"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Completar registro · Academix",
}

/** Nombres sugeridos a partir de los datos del proveedor (p. ej. Google). Solo rellenan el formulario. */
function nombreSugerido(meta: Record<string, unknown> | undefined) {
  const texto = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 100) : "")
  const nombres = texto(meta?.given_name)
  const apellidos = texto(meta?.family_name)
  if (nombres || apellidos) return { nombres, apellidos }
  const completo = texto(meta?.full_name) || texto(meta?.name)
  const [primero = "", ...resto] = completo.split(/\s+/)
  return { nombres: primero, apellidos: resto.join(" ") }
}

// Cuenta autenticada (correo confirmado o acceso con Google) que todavía no tiene
// perfil. Con un registro institucional pendiente se completa ese registro; si no,
// la persona elige incorporarse como estudiante o registrar su institución.
export default async function CompletarRegistroPage() {
  const ctx = await obtenerContexto()

  if (ctx.estado === "sin_sesion") redirect("/login")
  if (ctx.estado === "con_perfil") redirect(destinoSegunContexto(ctx))

  // user_metadata se lee del servidor de Auth (getUser), no de la cookie.
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const pendiente = leerRegistroPendiente(data.user?.user_metadata)

  if (pendiente) {
    return (
      <PantallaAcceso
        ancho="3xl"
        titulo="Completa el registro de tu institución"
        descripcion="Tu correo ya está confirmado. Revisa los datos que ingresaste y confirma para crear la institución y tu acceso como administrador."
      >
        <CompletarRegistroForm datos={pendiente} correo={ctx.email} />
        <div className="mt-6 flex justify-center">
          <BotonCerrarSesion />
        </div>
      </PantallaAcceso>
    )
  }

  return (
    <PantallaAcceso
      ancho="3xl"
      titulo="Te damos la bienvenida a Academix"
      descripcion="Tu cuenta aún no tiene un perfil. Elige cómo vas a usar la plataforma para continuar."
    >
      <Incorporacion correo={ctx.email} nombreSugerido={nombreSugerido(data.user?.user_metadata)} />
      <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
        <span>¿No es la cuenta correcta?</span>
        <BotonCerrarSesion />
      </div>
    </PantallaAcceso>
  )
}
