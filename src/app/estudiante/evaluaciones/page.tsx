import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Building2 } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerMisNotas, type NotaCurso } from "@/lib/estudiantes/academico"
import { obtenerMisCursos } from "@/lib/estudiantes/mis-cursos"

export const metadata: Metadata = { title: "Evaluaciones y notas · Academix" }

/**
 * Resumen por CURSO (nunca evaluaciones de cursos distintos mezcladas). El
 * detalle de cada curso está en su aula: Mis cursos → curso → Evaluaciones y notas.
 */
export default async function MisNotasPage() {
  const sesion = await requerirPanel("estudiante")
  const encabezado = <PageHeader title="Evaluaciones y notas" description="El avance de cada curso. Entra a un curso para ver cada evaluación y su nota." />

  let cursos: NotaCurso[]
  try {
    cursos = await obtenerMisNotas((await obtenerMisCursos(sesion.userId)).cursos)
  } catch {
    return <>{encabezado}<Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No se pudieron cargar tus notas. Recarga la página en unos minutos.</CardContent></Card></>
  }
  if (cursos.length === 0) {
    return (
      <>
        {encabezado}
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Aún no tienes cursos con matrícula confirmada.</CardContent></Card>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cursos.map((c) => {
          const { calculo, tarjetas, pesoCalificado } = c.resumen
          return (
            <li key={c.matriculaId}>
              <Card className="h-full">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="break-words">{c.curso}</CardTitle>
                    {c.estadoFinal !== "en_curso" && <Badge variant={c.estadoFinal === "aprobado" ? "success" : "destructive"}>{c.estadoFinal === "aprobado" ? "Aprobado" : "Desaprobado"}</Badge>}
                  </div>
                  <CardDescription className="flex items-center gap-1.5"><Building2 className="size-3.5" aria-hidden />{c.institucion ?? "Institución"}{c.grupo ? ` · Grupo ${c.grupo}` : ""}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {tarjetas.length === 0 ? (
                    <p className="text-muted-foreground">Sin evaluaciones configuradas todavía.</p>
                  ) : (
                    <>
                      <p>
                        <span className="font-medium">{calculo.registradas} de {tarjetas.length}</span> evaluaciones calificadas ({pesoCalificado} % del curso)
                      </p>
                      <p className="text-muted-foreground">
                        {calculo.promedio !== null ? <>Promedio final: <strong className="text-foreground">{calculo.promedio.toFixed(2)}</strong></>
                          : calculo.parcial !== null ? <>Promedio parcial (provisional): <strong className="text-foreground">{calculo.parcial.toFixed(2)}</strong></>
                            : "Aún sin notas"}
                      </p>
                    </>
                  )}
                  <Link href={`/estudiante/cursos/${c.matriculaId}?seccion=notas`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Ver detalle
                    <ArrowRight aria-hidden />
                  </Link>
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>
    </>
  )
}
