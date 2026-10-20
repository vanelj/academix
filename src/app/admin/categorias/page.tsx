import type { Metadata } from "next"

import { CategoriasPanel } from "@/components/admin/categorias/categorias-panel"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerCategorias, type Categoria } from "@/lib/categorias/datos"

export const metadata: Metadata = {
  title: "Categorías · Academix",
}

// Módulo "Categorías": solo administrador con rol activo. Las categorías son
// de cada institución (categorias.institucion_id); la institución sale del perfil.
export default async function CategoriasPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId

  const encabezado = (
    <PageHeader
      title="Categorías"
      description="Organiza los cursos de tu institución por áreas temáticas."
    />
  )

  if (!institucionId) {
    return (
      <>
        {encabezado}
        <Aviso>
          No se encontró la institución asociada a tu cuenta. Si el problema continúa, vuelve a
          iniciar sesión.
        </Aviso>
      </>
    )
  }

  let categorias: Categoria[]
  try {
    categorias = await obtenerCategorias(institucionId)
  } catch {
    return (
      <>
        {encabezado}
        <Aviso>No se pudieron cargar las categorías. Recarga la página en unos minutos.</Aviso>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <CategoriasPanel categorias={categorias} />
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
