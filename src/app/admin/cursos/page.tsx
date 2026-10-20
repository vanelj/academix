import type { Metadata } from "next"

import { CursosPanel } from "@/components/admin/cursos/cursos-panel"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerCategoriasParaCurso, obtenerCursos, type CursoResumen } from "@/lib/cursos/datos"

export const metadata: Metadata = {
  title: "Gestión de cursos · Academix",
}

// Módulo "Cursos": solo administrador con rol activo; la institución sale del perfil.
export default async function CursosPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId

  const encabezado = (
    <PageHeader title="Gestión de cursos" description="Crea, prepara y publica los cursos virtuales de tu institución." />
  )

  if (!institucionId) {
    return (
      <>
        {encabezado}
        <Aviso>No se encontró la institución asociada a tu cuenta. Si el problema continúa, vuelve a iniciar sesión.</Aviso>
      </>
    )
  }

  let cursos: CursoResumen[]
  let hayCategoriasActivas: boolean
  try {
    const [lista, categorias] = await Promise.all([obtenerCursos(institucionId), obtenerCategoriasParaCurso(institucionId)])
    cursos = lista
    hayCategoriasActivas = categorias.length > 0
  } catch {
    return (
      <>
        {encabezado}
        <Aviso>No se pudieron cargar los cursos. Recarga la página en unos minutos.</Aviso>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <CursosPanel cursos={cursos} hayCategoriasActivas={hayCategoriasActivas} />
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
