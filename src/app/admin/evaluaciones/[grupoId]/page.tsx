import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { GrupoEvaluaciones } from "@/components/admin/evaluaciones/grupo-evaluaciones"
import { EstadoGrupoBadge, fechaCorta } from "@/components/admin/grupos/grupo-ui"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerEvaluacionesGrupo, type EvaluacionesGrupo } from "@/lib/evaluaciones/datos"
import { cn } from "@/lib/utils"
import { idSchema } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Evaluaciones del grupo · Academix",
}

export default async function EvaluacionesGrupoPage({ params }: PageProps<"/admin/evaluaciones/[grupoId]">) {
  const sesion = await requerirPanel("admin")
  const { grupoId } = await params
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idSchema.safeParse(grupoId).success) notFound()

  let datos: EvaluacionesGrupo | null
  try {
    datos = await obtenerEvaluacionesGrupo(institucionId, grupoId)
  } catch {
    return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No se pudieron cargar las evaluaciones del grupo. Recarga la página.</CardContent></Card>
    )
  }
  // Un grupo de otra institución se trata como inexistente.
  if (!datos) notFound()
  const g = datos.grupo

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Link href="/admin/evaluaciones" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Volver a evaluaciones
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight break-words">{g.curso?.nombre ?? "Curso"} · Grupo {g.codigo}</h2>
            <EstadoGrupoBadge estado={g.estado} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {fechaCorta(g.fecha_inicio)} – {fechaCorta(g.fecha_fin)} · {g.docente?.nombre ?? "Sin docente"} ·{" "}
            <Link href={`/admin/grupos/${g.id}`} className="hover:underline">Ver grupo</Link>
          </p>
        </div>
      </div>
      <GrupoEvaluaciones datos={datos} />
    </>
  )
}
