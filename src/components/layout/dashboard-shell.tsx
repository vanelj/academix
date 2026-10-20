"use client"

import { useEffect, useState } from "react"

import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { ProteccionCambiosProvider } from "@/components/layout/proteccion-cambios"
import type { ShellUser } from "@/config/demo-user"

type DashboardShellProps = {
  user: ShellUser
  isDemo?: boolean
  children: React.ReactNode
}

/**
 * Marco común de los paneles (admin, docente, estudiante):
 * sidebar según el rol del usuario + cabecera + área de contenido.
 */
export function DashboardShell({ user, isDemo, children }: DashboardShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [menuOpen])

  return (
    // Protección de cambios sin guardar compartida por los tres paneles.
    <ProteccionCambiosProvider>
      <div className="min-h-dvh bg-background">
        <AppSidebar
          role={user.role}
          institution={user.institution}
          institutionLogo={user.institutionLogo ?? null}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
        />

        {menuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
        )}

        <div className="flex min-h-dvh flex-col lg:pl-64">
          <AppHeader
            user={user}
            isDemo={isDemo}
            menuOpen={menuOpen}
            onMenuClick={() => setMenuOpen(true)}
          />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </ProteccionCambiosProvider>
  )
}
