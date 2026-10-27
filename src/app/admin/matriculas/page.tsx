import type { Metadata } from "next"

import { MatriculasPanel } from "@/components/admin/matriculas/matriculas-panel"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerMatriculas, type MatriculaAdmin } from "@/lib/matriculas/datos"
import { idSchema } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Matrículas · Academix",
}

// Módulo "Matrículas": solo administrador con rol activo; la institución sale del perfil.
export default async function MatriculasPage({ searchParams }: PageProps<"/admin/matriculas">) {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const { grupo } = await searchParams
  const grupoInicial = typeof grupo === "string" && idSchema.safeParse(grupo).success ? grupo : null

  const encabezado = (
    <PageHeader title="Matrículas" description="Estudiantes matriculados en los grupos de tu institución." />
  )

  if (!institucionId) {
    return (
      <>
        {encabezado}
        <Aviso>No se encontró la institución asociada a tu cuenta. Si el problema continúa, vuelve a iniciar sesión.</Aviso>
      </>
    )
  }

  let matriculas: MatriculaAdmin[]
  try {
    matriculas = await obtenerMatriculas(institucionId)
  } catch {
    return (
      <>
        {encabezado}
        <Aviso>No se pudieron cargar las matrículas. Recarga la página en unos minutos.</Aviso>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <MatriculasPanel matriculas={matriculas} grupoInicial={grupoInicial} />
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
