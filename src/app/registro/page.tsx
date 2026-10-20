import type { Metadata } from "next"

import { AuthHeader } from "@/components/public/auth-header"
import { BackToHome } from "@/components/public/back-to-home"
import { RegistroForm } from "@/components/registro/registro-form"

export const metadata: Metadata = {
  title: "Crear institución · Academix",
  description: "Registra tu institución y crea la cuenta de su administrador.",
}

// Pantalla pública (sin sesión): no usa el DashboardShell del panel administrativo.
export default function RegistroPage() {
  return (
    <div className="relative isolate flex min-h-svh flex-1 flex-col bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-linear-to-b from-primary/10 to-transparent dark:from-primary/15"
      />

      <AuthHeader className="max-w-3xl" />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-12 sm:px-6 sm:pt-6">
        <BackToHome />
        <div className="mt-4 mb-6 space-y-2 sm:mb-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Crear institución
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
            Registra tu institución en la plataforma y crea la cuenta del
            administrador que gestionará sus cursos, docentes y estudiantes.
          </p>
        </div>

        <RegistroForm />
      </main>
    </div>
  )
}
