import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { AsistenteCurso } from "@/components/admin/cursos/asistente/asistente-curso"
import { PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerDatosAsistente, type DatosAsistente } from "@/lib/cursos/asistente"

export const metadata: Metadata = {
  title: "Nuevo curso · Academix",
}

// Creación guiada en 6 pasos: todo se configura en memoria y el curso se crea
// (como borrador o publicado) solo al guardar en el último paso.
export default async function NuevoCursoPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId

  const encabezado = (
    <PageHeader
      title="Nuevo curso"
      description="Completa los pasos a tu ritmo: nada se guarda hasta el paso final, donde eliges guardarlo como borrador o publicarlo."
      actions={
        <Link href="/admin/cursos" className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeft aria-hidden />
          Volver a cursos
        </Link>
      }
    />
  )

  let datos: DatosAsistente | null = null
  let error = !institucionId
  if (institucionId) {
    try {
      datos = await obtenerDatosAsistente(institucionId, null)
    } catch {
      error = true
    }
  }

  if (error || !datos || datos.categorias.length === 0) {
    return (
      <>
        {encabezado}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            {error || !datos
              ? "No se pudieron cargar las categorías. Recarga la página en unos minutos."
              : "Necesitas al menos una categoría activa para crear un curso."}
            {!error && datos && (
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
      <div className="max-w-5xl">
        <AsistenteCurso datos={datos} pasoInicial={1} />
      </div>
    </>
  )
}
