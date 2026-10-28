import type { ReactNode } from "react"

import { PublicShell } from "@/academix/components/layout/PublicShell"
import { academixFontVariables } from "@/academix/fonts/academix-fonts"
import { AcademixProviders } from "@/components/public/academix-providers"

// Envoltorio de la interfaz pública Creative Tech (Inicio, Cursos e Instituciones).
// Se usa página a página en lugar de un grupo de rutas para no mover archivos ni
// afectar a /cursos/[id], /verificar, la autenticación o los paneles privados.
export function AcademixPublico({ children }: { children: ReactNode }) {
  return (
    <PublicShell className={academixFontVariables}>
      <AcademixProviders>{children}</AcademixProviders>
    </PublicShell>
  )
}
