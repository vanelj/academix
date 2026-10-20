import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { CursoForm } from "@/components/admin/cursos/curso-form"
import { PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerCategoriasParaCurso, type CategoriaOpcion } from "@/lib/cursos/datos"
import { CURSO_INICIAL } from "@/lib/validations/curso"

export const metadata: Metadata = {
  title: "Nuevo curso · Academix",
}

export default async function NuevoCursoPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId

  const volver = (
    <Link href="/admin/cursos" className={buttonVariants({ variant: "ghost" })}>
      <ArrowLeft aria-hidden />
      Volver a cursos
    </Link>
  )
  const encabezado = (
    <PageHeader
      title="Nuevo curso"
      description="El curso se guardará como borrador. Podrás publicarlo cuando tenga sus condiciones."
      actions={volver}
    />
  )

  let categorias: CategoriaOpcion[] = []
  let error = !institucionId
  if (institucionId) {
    try {
      categorias = await obtenerCategoriasParaCurso(institucionId)
    } catch {
      error = true
    }
  }

  if (error || categorias.length === 0) {
    return (
      <>
        {encabezado}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            {error
              ? "No se pudieron cargar las categorías. Recarga la página en unos minutos."
              : "Necesitas al menos una categoría activa para crear un curso."}
            {!error && (
              <Link href="/admin/categorias" className={buttonVariants()}>
                Ir a Categorías
              </Link>
            )}
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <div className="max-w-4xl">
        <CursoForm valoresIniciales={CURSO_INICIAL} categorias={categorias} condicionesExistentes={false} />
      </div>
    </>
  )
}
