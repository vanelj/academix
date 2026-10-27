import type { Metadata } from "next"

import { EstudiantesPanel } from "@/components/admin/estudiantes/estudiantes-panel"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerEstudiantes, type EstudianteResumen } from "@/lib/estudiantes/datos"

export const metadata: Metadata = {
  title: "Estudiantes · Academix",
}

// Módulo "Estudiantes" (consulta): solo administrador con rol activo. Los
// estudiantes son cuentas globales; aquí aparecen los que tienen solicitudes
// o matrículas en grupos de esta institución.
export default async function EstudiantesPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId

  const encabezado = (
    <PageHeader title="Estudiantes" description="Estudiantes con solicitudes o matrículas en los grupos de tu institución." />
  )

  if (!institucionId) {
    return (
      <>
        {encabezado}
        <Aviso>No se encontró la institución asociada a tu cuenta. Si el problema continúa, vuelve a iniciar sesión.</Aviso>
      </>
    )
  }

  let estudiantes: EstudianteResumen[]
  try {
    estudiantes = await obtenerEstudiantes(institucionId)
  } catch {
    return (
      <>
        {encabezado}
        <Aviso>No se pudieron cargar los estudiantes. Recarga la página en unos minutos.</Aviso>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <EstudiantesPanel estudiantes={estudiantes} />
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
