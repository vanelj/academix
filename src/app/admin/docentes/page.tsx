import type { Metadata } from "next"

import { DocentesPanel } from "@/components/admin/docentes/docentes-panel"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { miembrosSinRolDocente, obtenerDocentes, type DocenteResumen, type MiembroInstitucion } from "@/lib/docentes/datos"
import { cuentasConfiguradas } from "@/lib/supabase/admin"

export const metadata: Metadata = {
  title: "Docentes · Academix",
}

// Módulo "Docentes": solo administrador con rol activo; la institución sale del perfil.
export default async function DocentesPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId

  const encabezado = (
    <PageHeader title="Docentes" description="Registra y gestiona al personal docente de tu institución." />
  )

  if (!institucionId) {
    return (
      <>
        {encabezado}
        <Aviso>No se encontró la institución asociada a tu cuenta. Si el problema continúa, vuelve a iniciar sesión.</Aviso>
      </>
    )
  }

  let docentes: DocenteResumen[]
  let miembros: MiembroInstitucion[]
  try {
    ;[docentes, miembros] = await Promise.all([obtenerDocentes(institucionId), miembrosSinRolDocente(institucionId)])
  } catch {
    return (
      <>
        {encabezado}
        <Aviso>No se pudieron cargar los docentes. Recarga la página en unos minutos.</Aviso>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <DocentesPanel docentes={docentes} miembros={miembros} cuentasConfiguradas={cuentasConfiguradas()} />
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
