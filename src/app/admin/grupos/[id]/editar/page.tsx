import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { GrupoForm } from "@/components/admin/grupos/grupo-form"
import { PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerGrupo, opcionesCursos, opcionesDocentes } from "@/lib/grupos/datos"
import { idSchema } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Editar grupo · Academix",
}

export default async function EditarGrupoPage({ params }: PageProps<"/admin/grupos/[id]/editar">) {
  const sesion = await requerirPanel("admin")
  const { id } = await params
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idSchema.safeParse(id).success) notFound()

  const grupo = await obtenerGrupo(institucionId, id)
  if (!grupo) notFound()
  const [cursos, docentes] = await Promise.all([opcionesCursos(institucionId), opcionesDocentes(institucionId, grupo.docente?.id)])
  // El curso actual siempre aparece en la lista (aunque luego se haya desactivado).
  const listaCursos = grupo.curso && !cursos.some((c) => c.id === grupo.curso!.id) ? [grupo.curso, ...cursos] : cursos

  return (
    <>
      <PageHeader
        title="Editar grupo"
        description={`${grupo.curso?.nombre ?? "Curso"} · ${grupo.codigo}`}
        actions={
          <Link href={`/admin/grupos/${grupo.id}`} className={buttonVariants({ variant: "ghost" })}>
            <ArrowLeft aria-hidden />
            Volver al grupo
          </Link>
        }
      />
      <div className="max-w-3xl">
        <GrupoForm
          grupoId={grupo.id}
          estado={grupo.estado}
          valoresIniciales={{
            curso_id: grupo.curso?.id ?? "",
            codigo: grupo.codigo,
            vacantes: String(grupo.vacantes),
            fecha_inicio: grupo.fecha_inicio,
            fecha_fin: grupo.fecha_fin,
            docente_id: grupo.docente?.id ?? "",
          }}
          cursos={listaCursos}
          docentes={docentes}
        />
      </div>
    </>
  )
}
