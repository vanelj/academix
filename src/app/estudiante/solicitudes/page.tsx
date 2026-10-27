import type { Metadata } from "next"

import { MisSolicitudes } from "@/components/estudiante/mis-solicitudes"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerMisSolicitudes, type MiSolicitud } from "@/lib/inscripcion/datos"

export const metadata: Metadata = {
  title: "Mis solicitudes · Academix",
}

// Solicitudes del propio estudiante (RLS: estudiante_id = auth.uid()).
export default async function MisSolicitudesPage() {
  const sesion = await requerirPanel("estudiante")
  const encabezado = <PageHeader title="Mis solicitudes" description="Solicitudes de inscripción y reservas que enviaste a las instituciones." />

  let solicitudes: MiSolicitud[]
  try {
    solicitudes = await obtenerMisSolicitudes(sesion.userId)
  } catch {
    return (
      <>
        {encabezado}
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No se pudieron cargar tus solicitudes. Recarga la página en unos minutos.</CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <MisSolicitudes solicitudes={solicitudes} />
    </>
  )
}
