import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { GrupoForm } from "@/components/admin/grupos/grupo-form"
import { PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { opcionesCursos, opcionesDocentes } from "@/lib/grupos/datos"
import { GRUPO_INICIAL } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Nuevo grupo · Academix",
}

export default async function NuevoGrupoPage({ searchParams }: PageProps<"/admin/grupos/nuevo">) {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const { curso } = await searchParams

  const encabezado = (
    <PageHeader
      title="Nuevo grupo"
      description="El grupo se crea como programado. Después agrega sus horarios y ábrelo a inscripciones."
      actions={
        <Link href="/admin/grupos" className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeft aria-hidden />
          Volver a grupos
        </Link>
      }
    />
  )

  const [cursos, docentes] = institucionId
    ? await Promise.all([opcionesCursos(institucionId), opcionesDocentes(institucionId)])
    : [[], []]

  if (cursos.length === 0) {
    return (
      <>
        {encabezado}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            Necesitas al menos un curso que no esté desactivado para abrir un grupo.
            <Link href="/admin/cursos" className={buttonVariants()}>Ir a Cursos</Link>
          </CardContent>
        </Card>
      </>
    )
  }

  // ?curso= solo preselecciona si es un curso válido de la institución.
  const preseleccion = typeof curso === "string" && cursos.some((c) => c.id === curso) ? curso : ""

  return (
    <>
      {encabezado}
      <div className="max-w-3xl">
        <GrupoForm valoresIniciales={{ ...GRUPO_INICIAL, curso_id: preseleccion }} cursos={cursos} docentes={docentes} />
      </div>
    </>
  )
}
