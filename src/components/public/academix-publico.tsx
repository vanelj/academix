import type { ReactNode } from "react"

import { PublicShell } from "@/academix/components/layout/PublicShell"
import { academixFontVariables } from "@/academix/fonts/academix-fonts"
import { AcademixProviders } from "@/components/public/academix-providers"
import { obtenerContexto } from "@/lib/auth/contexto"
import { cuentaPublica } from "@/lib/auth/cuenta-publica"

// Envoltorio de la interfaz pública Academix Vibrant (Inicio, Cursos e Instituciones).
// Se usa página a página en lugar de un grupo de rutas para no mover archivos ni
// afectar a /cursos/[id], /verificar, la autenticación o los paneles privados.
//
// Lee la sesión en el servidor (obtenerContexto está en caché por petición) para que
// la cabecera reconozca a quien ya inició sesión: el catálogo sigue siendo público.
export async function AcademixPublico({ children }: { children: ReactNode }) {
  const cuenta = cuentaPublica(await obtenerContexto().catch(() => ({ estado: "sin_sesion" as const })))
  return (
    <PublicShell className={academixFontVariables}>
      <AcademixProviders cuenta={cuenta}>{children}</AcademixProviders>
    </PublicShell>
  )
}
