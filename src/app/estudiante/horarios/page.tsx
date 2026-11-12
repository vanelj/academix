import type { Metadata } from "next"
import Link from "next/link"

import { CalendarioAcademico } from "@/components/horarios/calendario-academico"
import { PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { franjasDeGrupos, gruposCalendarioEstudiante } from "@/lib/estudiantes/academico"
import { obtenerMisCursos } from "@/lib/estudiantes/mis-cursos"
import { ahoraAcademico, crucesSemanales, DIAS_LARGOS, type GrupoCalendario } from "@/lib/horarios/calendario"

export const metadata: Metadata = { title: "Mis horarios · Academix" }

/**
 * Calendario académico del estudiante: todas sus matrículas activas, de
 * cualquier institución. Las clases se proyectan desde los horarios semanales
 * reales dentro del periodo de cada grupo (sin crear sesiones).
 */
export default async function MisHorariosPage() {
  const sesion = await requerirPanel("estudiante")
  const encabezado = <PageHeader title="Mis horarios" description="Tus clases por semana, por mes o en lista, de todas tus instituciones." />

  let grupos: GrupoCalendario[]
  try {
    const { cursos } = await obtenerMisCursos(sesion.userId)
    const activas = cursos.filter((c) => c.estado === "activa" && c.grupo && c.grupo.estado !== "cerrado" && c.grupo.estado !== "cancelado")
    grupos = gruposCalendarioEstudiante(activas, await franjasDeGrupos([...new Set(activas.map((c) => c.grupoId))]))
  } catch {
    return <>{encabezado}<Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No se pudo cargar tu horario. Recarga la página en unos minutos.</CardContent></Card></>
  }

  if (grupos.length === 0 || grupos.every((g) => g.franjas.length === 0)) {
    return (
      <>
        {encabezado}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            <p>{grupos.length === 0 ? "No tienes cursos vigentes con matrícula confirmada." : "Tus cursos vigentes aún no tienen horarios registrados."}</p>
            <Link href="/estudiante/cursos" className={buttonVariants({ variant: "outline" })}>Ir a Mis cursos</Link>
          </CardContent>
        </Card>
      </>
    )
  }

  const cruces = crucesSemanales(grupos)
  return (
    <>
      {encabezado}
      {cruces.length > 0 && (
        <p role="status" className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          Tienes cursos con horarios que se cruzan:{" "}
          {cruces.map((c) => `${c.a.curso} y ${c.b.curso} el ${DIAS_LARGOS[c.dia - 1].toLowerCase()}`).join("; ")}.
        </p>
      )}
      <CalendarioAcademico grupos={grupos} ahoraInicial={ahoraAcademico()} mostrarInstitucion mostrarDocente />
    </>
  )
}
