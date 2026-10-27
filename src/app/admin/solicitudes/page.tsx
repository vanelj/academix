import type { Metadata } from "next"

import { SolicitudesPanel } from "@/components/admin/solicitudes/solicitudes-panel"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerSolicitudes, type SolicitudAdmin } from "@/lib/solicitudes/datos"
import { idSchema } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Solicitudes y reservas · Academix",
}

// Módulo "Solicitudes y reservas": solo administrador con rol activo; la institución sale del perfil.
export default async function SolicitudesPage({ searchParams }: PageProps<"/admin/solicitudes">) {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const { grupo } = await searchParams
  const grupoInicial = typeof grupo === "string" && idSchema.safeParse(grupo).success ? grupo : null

  const encabezado = (
    <PageHeader title="Solicitudes y reservas" description="Solicitudes de inscripción y reservas de vacante en los grupos de tu institución." />
  )

  if (!institucionId) {
    return (
      <>
        {encabezado}
        <Aviso>No se encontró la institución asociada a tu cuenta. Si el problema continúa, vuelve a iniciar sesión.</Aviso>
      </>
    )
  }

  let solicitudes: SolicitudAdmin[]
  try {
    solicitudes = await obtenerSolicitudes(institucionId)
  } catch {
    return (
      <>
        {encabezado}
        <Aviso>No se pudieron cargar las solicitudes. Recarga la página en unos minutos.</Aviso>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <SolicitudesPanel solicitudes={solicitudes} grupoInicial={grupoInicial} />
    </>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  )
}
