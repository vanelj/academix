import type { Metadata } from "next"

import { GruposPanel } from "@/components/admin/grupos/grupos-panel"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerGrupos, opcionesCursos, type GrupoResumen } from "@/lib/grupos/datos"
import { idSchema } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Grupos y horarios · Academix",
}

// Módulo "Grupos y horarios": solo administrador con rol activo; la institución sale del perfil.
export default async function GruposPage({ searchParams }: PageProps<"/admin/grupos">) {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const { curso } = await searchParams
  const cursoInicial = typeof curso === "string" && idSchema.safeParse(curso).success ? curso : null

  const encabezado = (
    <PageHeader title="Grupos y horarios" description="Abre grupos de tus cursos, asigna docentes y define sus horarios y vacantes." />
  )

  if (!institucionId) {
    return (
      <>
        {encabezado}
        <Aviso>No se encontró la institución asociada a tu cuenta. Si el problema continúa, vuelve a iniciar sesión.</Aviso>
      </>
    )
  }

  let grupos: GrupoResumen[]
  let hayCursos: boolean
  try {
    const [lista, cursos] = await Promise.all([obtenerGrupos(institucionId), opcionesCursos(institucionId)])
    grupos = lista
    hayCursos = cursos.length > 0
  } catch {
    return (
      <>
        {encabezado}
        <Aviso>No se pudieron cargar los grupos. Recarga la página en unos minutos.</Aviso>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <GruposPanel grupos={grupos} cursoInicial={cursoInicial} hayCursos={hayCursos} />
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
