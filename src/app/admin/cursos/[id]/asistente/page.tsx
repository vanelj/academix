import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { AsistenteCurso } from "@/components/admin/cursos/asistente/asistente-curso"
import { PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerDatosAsistente } from "@/lib/cursos/asistente"
import type { NumeroPaso } from "@/lib/cursos/asistente-logica"
import { idCursoSchema } from "@/lib/validations/curso"

export const metadata: Metadata = {
  title: "Configurar curso · Academix",
}

// Continuar un borrador o editar un curso existente con el asistente.
// Un curso de otra institución se trata como inexistente (filtro + RLS).
export default async function AsistenteCursoPage({ params, searchParams }: PageProps<"/admin/cursos/[id]/asistente">) {
  const sesion = await requerirPanel("admin")
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idCursoSchema.safeParse(id).success) notFound()

  const datos = await obtenerDatosAsistente(institucionId, id)
  if (!datos?.curso) notFound()

  const n = Number(Array.isArray(sp.paso) ? sp.paso[0] : sp.paso)
  const paso = (Number.isInteger(n) && n >= 1 && n <= 6 ? n : 1) as NumeroPaso

  return (
    <>
      <PageHeader
        title={datos.curso.estado === "borrador" ? "Continuar configuración" : "Editar curso"}
        description="Todos los datos del curso en un solo lugar, paso a paso."
        actions={
          <Link href={`/admin/cursos/${id}`} className={buttonVariants({ variant: "ghost" })}>
            <ArrowLeft aria-hidden />
            Ficha del curso
          </Link>
        }
      />
      <div className="max-w-5xl">
        <AsistenteCurso datos={datos} pasoInicial={paso} />
      </div>
    </>
  )
}
