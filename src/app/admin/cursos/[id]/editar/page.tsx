import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { CursoForm } from "@/components/admin/cursos/curso-form"
import { PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerCategoriasParaCurso, obtenerCurso } from "@/lib/cursos/datos"
import { CONDICIONES_INICIALES, idCursoSchema, type CursoValues } from "@/lib/validations/curso"

export const metadata: Metadata = {
  title: "Editar curso · Academix",
}

const texto = (n: number) => String(n)

export default async function EditarCursoPage({ params }: PageProps<"/admin/cursos/[id]/editar">) {
  const sesion = await requerirPanel("admin")
  const { id } = await params
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idCursoSchema.safeParse(id).success) notFound()

  const curso = await obtenerCurso(institucionId, id)
  if (!curso) notFound()
  // Incluye la categoría actual aunque esté inactiva, para no perder la relación.
  const categorias = await obtenerCategoriasParaCurso(institucionId, curso.categoria?.id)

  const c = curso.condiciones
  const valores: CursoValues = {
    nombre: curso.nombre,
    categoria_id: curso.categoria?.id ?? "",
    descripcion: curso.descripcion ?? "",
    precio: texto(curso.precio),
    nota_aprobatoria: texto(curso.nota_aprobatoria),
    configurarCondiciones: c !== null,
    condiciones: c
      ? {
          tipo_cobro: c.tipo_cobro,
          matricula_importe: texto(c.matricula_importe),
          importe_curso: texto(c.importe_curso),
          permite_reserva: c.permite_reserva,
          reserva_importe: texto(c.reserva_importe),
          reserva_plazo_horas: c.reserva_plazo_horas == null ? "" : texto(c.reserva_plazo_horas),
          reserva_descuenta_matricula: c.reserva_descuenta_matricula,
          requisitos: c.requisitos ?? "",
          condiciones_especiales: c.condiciones_especiales ?? "",
        }
      : CONDICIONES_INICIALES,
  }

  return (
    <>
      <PageHeader
        title="Editar curso"
        description={curso.nombre}
        actions={
          <Link href={`/admin/cursos/${curso.id}`} className={buttonVariants({ variant: "ghost" })}>
            <ArrowLeft aria-hidden />
            Volver al curso
          </Link>
        }
      />
      <div className="max-w-4xl">
        <CursoForm cursoId={curso.id} valoresIniciales={valores} categorias={categorias} condicionesExistentes={c !== null} />
      </div>
    </>
  )
}
