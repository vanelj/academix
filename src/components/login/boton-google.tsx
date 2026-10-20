"use client"

import { useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { registrarErrorAuth } from "@/lib/auth/errores-auth"
import { notificar } from "@/lib/notificaciones"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

/**
 * "Continuar con Google" (Supabase Auth, proveedor google, flujo PKCE).
 * - Sirve para entrar y para crear una cuenta nueva: Supabase crea el usuario de
 *   Auth la primera vez; el perfil y el rol NO se crean aquí (ver /auth/callback).
 * - redirectTo es la URL interna de retorno de Academix; Supabase solo la acepta
 *   si está en su lista de Redirect URLs. No es la URL de callback que se registra
 *   en Google (esa es https://<proyecto>.supabase.co/auth/v1/callback).
 * - El code_verifier lo guarda @supabase/ssr en una cookie; no se guardan tokens
 *   manualmente en localStorage.
 */
export function BotonGoogle({ deshabilitado = false, className }: { deshabilitado?: boolean; className?: string }) {
  const [redirigiendo, setRedirigiendo] = useState(false)
  const bloqueo = useRef(false)

  async function continuar() {
    if (bloqueo.current) return
    bloqueo.current = true
    setRedirigiendo(true)
    try {
      if ((await googleHabilitado()) === false) {
        notificar.advertencia("El acceso con Google aún no está disponible", {
          descripcion: "Ingresa con tu correo y contraseña mientras se habilita.",
        })
        bloqueo.current = false
        setRedirigiendo(false)
        return
      }
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          // Permite elegir otra cuenta de Google si el navegador ya tiene una abierta.
          queryParams: { prompt: "select_account" },
        },
      })
      if (error) {
        registrarErrorAuth("oauth-inicio", error)
        notificar.error("No se pudo continuar con Google", { descripcion: "Inténtalo de nuevo en unos minutos." })
        bloqueo.current = false
        setRedirigiendo(false)
      }
      // Sin error, el navegador sale hacia Google: el botón queda en "Redirigiendo…".
    } catch {
      notificar.error("No se pudo continuar con Google", { descripcion: "Revisa tu conexión e inténtalo de nuevo." })
      bloqueo.current = false
      setRedirigiendo(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={continuar}
      disabled={deshabilitado || redirigiendo}
      aria-busy={redirigiendo}
      className={cn("h-10 w-full gap-2.5 bg-background font-medium dark:bg-input/30", className)}
    >
      {redirigiendo ? <Loader2 className="animate-spin" aria-hidden /> : <IconoGoogle />}
      {redirigiendo ? "Redirigiendo a Google…" : "Continuar con Google"}
    </Button>
  )
}

/**
 * Consulta pública de Supabase Auth (/auth/v1/settings, solo con la clave pública):
 * indica qué proveedores están habilitados. Evita enviar a la persona a una
 * página de error de Supabase si Google aún no está configurado.
 * null = no se pudo comprobar (se intenta igualmente).
 */
async function googleHabilitado(): Promise<boolean | null> {
  try {
    const respuesta = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
      cache: "no-store",
    })
    if (!respuesta.ok) return null
    const ajustes = (await respuesta.json()) as { external?: Record<string, boolean> }
    return ajustes.external?.google === true
  } catch {
    return null
  }
}

/** Logotipo "G" oficial de Google (colores de la guía de marca de Google). */
function IconoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px] shrink-0" aria-hidden focusable="false">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  )
}
