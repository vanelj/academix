"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, MailWarning } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { confirmarSesionInvitacion } from "@/lib/auth/acciones"
import { leerFragmentoInvitacion } from "@/lib/auth/activacion"
import { createClient } from "@/lib/supabase/client"

type Estado = "aviso" | "verificando" | "vencido" | "invalido"

/**
 * Pantalla de /activar-cuenta cuando aún no hay sesión de activación.
 *
 * Con la plantilla «Invite user» predeterminada de Supabase, el enlace vuelve con
 * la sesión en el fragmento (#access_token=…&type=invite), que el servidor no ve.
 * Aquí se lee, se borra de la barra de direcciones de inmediato (sin registrarlo),
 * se guarda la sesión y el servidor la valida (confirmarSesionInvitacion) antes
 * de mostrar el formulario. Con la plantilla token_hash este paso no se usa.
 */
export function ActivacionDesdeEnlace({ vencidoInicial }: { vencidoInicial: boolean }) {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado>(vencidoInicial ? "vencido" : "aviso")

  useEffect(() => {
    const fragmento = leerFragmentoInvitacion(window.location.hash)
    if (fragmento.tipo === "nada") return
    // Quita el token de la URL antes de cualquier otra cosa.
    window.history.replaceState(null, "", window.location.pathname)
    let vigente = true

    void Promise.resolve().then(async () => {
      if (fragmento.tipo === "error") {
        if (vigente) setEstado(fragmento.vencido ? "vencido" : "invalido")
        return
      }
      if (vigente) setEstado("verificando")
      try {
        const { error } = await createClient().auth.setSession({
          access_token: fragmento.accessToken,
          refresh_token: fragmento.refreshToken,
        })
        if (error) throw error
        const r = await confirmarSesionInvitacion()
        if (!r.ok) throw new Error("sesion-no-valida")
        if (vigente) router.refresh()
      } catch {
        if (vigente) setEstado("vencido")
      }
    })
    return () => {
      vigente = false
    }
  }, [router])

  if (estado === "verificando") {
    return (
      <Card className="gap-0 py-0 shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 px-5 py-10 text-center sm:px-8" role="status">
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Verificando tu invitación…</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="flex flex-col items-center gap-4 px-5 py-10 text-center sm:px-8">
        <div className="flex size-12 items-center justify-center rounded-full bg-warning/10 text-warning dark:bg-warning/20">
          <MailWarning className="size-6" aria-hidden />
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">
          {estado === "vencido"
            ? "El enlace de invitación venció o ya se utilizó."
            : estado === "invalido"
              ? "El enlace de invitación no es válido."
              : "Para activar tu cuenta necesitas abrir el enlace de invitación que recibiste por correo."}{" "}
          Si ya creaste tu contraseña, inicia sesión. Si no, pide a tu institución que te reenvíe la invitación, o
          usa «¿Olvidaste tu contraseña?» con tu correo si ya abriste el enlace antes.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-medium">
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Ir a iniciar sesión
          </Link>
          <Link href="/recuperar-contrasena" className="text-primary underline-offset-4 hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
