import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { LoginForm, type AvisoLogin } from "@/components/login/login-form"
import { CabeceraMarcaMovil, PanelMarca } from "@/components/login/panel-marca"
import { ThemeToggle } from "@/components/theme/theme-toggle"

export const metadata: Metadata = {
  title: "Iniciar sesión · Academix",
  description: "Accede a Academix con tu cuenta.",
}

// Avisos que puede mostrar el login según ?aviso=. Solo se aceptan estas claves:
// ningún texto ni destino se toma de la URL.
const AVISO_OTRO_NAVEGADOR: AvisoLogin = {
  tipo: "info",
  // Con la plantilla por defecto (PKCE) la sesión solo se crea en el navegador del
  // registro; el correo sí queda confirmado. Si no lo estuviera, el login permite reenviarlo.
  mensaje:
    "No pudimos iniciar tu sesión con ese enlace en este navegador (suele pasar al abrirlo en un navegador distinto al del registro). Si tu correo quedó confirmado, inicia sesión aquí para continuar con el registro de tu institución.",
}

const AVISOS: Record<string, AvisoLogin> = {
  "correo-otro-navegador": AVISO_OTRO_NAVEGADOR,
  // Clave anterior, conservada por si quedan enlaces o pestañas con ella.
  "correo-confirmado": AVISO_OTRO_NAVEGADOR,
  "enlace-vencido": {
    tipo: "error",
    mensaje:
      "El enlace de confirmación venció o ya fue utilizado. Si ya confirmaste tu correo, inicia sesión; si no, intenta iniciar sesión y solicita un enlace nuevo.",
  },
  "enlace-invalido": {
    tipo: "error",
    mensaje:
      "El enlace no es válido. Inicia sesión; si tu correo aún no está confirmado, podrás solicitar un enlace nuevo.",
  },
  "contrasena-actualizada": {
    tipo: "exito",
    mensaje: "Tu contraseña se actualizó. Inicia sesión con tu contraseña nueva.",
  },
  "google-cancelado": {
    tipo: "info",
    mensaje: "Cancelaste el acceso con Google. Puedes intentarlo de nuevo o ingresar con tu correo.",
  },
  "google-error": {
    tipo: "error",
    mensaje:
      "No pudimos completar el acceso con Google. Inténtalo de nuevo desde este mismo navegador o ingresa con tu correo y contraseña.",
  },
}

// Login único para todos los roles: no hay selector de rol en esta pantalla.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { aviso } = await searchParams
  const avisoLogin =
    typeof aviso === "string" && Object.hasOwn(AVISOS, aviso) ? AVISOS[aviso] : null

  return (
    <div className="grid min-h-svh flex-1 bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <PanelMarca className="hidden lg:flex" />

      <div className="flex min-w-0 flex-col">
        <CabeceraMarcaMovil className="lg:hidden" />

        <div className="flex items-center justify-between px-5 pt-5 sm:px-8 lg:px-12">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Volver al inicio
          </Link>
          <ThemeToggle />
        </div>

        <main className="flex flex-1 items-start justify-center px-5 py-8 sm:px-8 lg:items-center lg:px-12">
          <div className="w-full max-w-sm">
            <div className="mb-7 space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Iniciar sesión</h1>
              <p className="text-sm text-muted-foreground sm:text-base">Ingresa con el correo de tu cuenta</p>
            </div>
            <LoginForm aviso={avisoLogin} />
          </div>
        </main>
      </div>
    </div>
  )
}
