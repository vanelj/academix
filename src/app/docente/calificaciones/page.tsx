import type { Metadata } from "next"
import Link from "next/link"
import { BookCheck } from "lucide-react"

import { EstadoGrupoBadge } from "@/components/admin/grupos/grupo-ui"
import { AvanceNotas, ErrorCarga, SinGrupos } from "@/components/docente/docente-ui"
import { PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerGruposDocente, type GrupoDocente } from "@/lib/docente/datos"

export const metadata: Metadata = { title: "Evaluaciones y notas · Academix" }

const fecha = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "UTC" })

/**
 * Evaluaciones de cada grupo (las configura la institución: nombre, peso y
 * fecha) y acceso directo al registro de notas. Un solo lugar para ambas cosas.
 */
export default async function DocenteCalificacionesPage() {
  const sesion = await requerirPanel("docente")
  const encabezado = <PageHeader title="Evaluaciones y notas" description="Evaluaciones de tus grupos y registro de calificaciones." />
  if (!sesion.perfil.institucionId) return <>{encabezado}<SinGrupos /></>

  let grupos: GrupoDocente[]
  try {
    grupos = await obtenerGruposDocente(sesion.userId, sesion.perfil.institucionId)
  } catch {
    return <>{encabezado}<ErrorCarga texto="No se pudieron cargar tus evaluaciones. Recarga la página en unos minutos." /></>
  }
  const activos = grupos.filter((g) => g.estado !== "cancelado")
  if (activos.length === 0) return <>{encabezado}<SinGrupos /></>

  return (
    <>
      {encabezado}
      <ul className="space-y-4">
        {activos.map((g) => (
          <li key={g.id}>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="break-words">{g.curso?.nombre ?? "Curso"} <span className="font-normal text-muted-foreground">· Grupo {g.codigo}</span></CardTitle>
                  <EstadoGrupoBadge estado={g.estado} />
                </div>
                <CardDescription>Nota aprobatoria: {g.curso?.notaAprobatoria ?? 11} · {g.estudiantes} {g.estudiantes === 1 ? "estudiante" : "estudiantes"}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-[1fr_16rem]">
                {g.evaluaciones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">La institución aún no configuró las evaluaciones de este grupo. Podrás registrar notas cuando lo haga.</p>
                ) : (
                  <ul className="divide-y rounded-xl border text-sm">
                    {g.evaluaciones.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0 break-words">{e.nombre}{e.fecha ? <span className="text-xs text-muted-foreground"> · {fecha.format(new Date(`${e.fecha}T00:00:00Z`))}</span> : null}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{e.peso} %</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="space-y-3">
                  <AvanceNotas grupo={g} />
                  {g.evaluaciones.length > 0 && (
                    <Link href={`/docente/calificaciones/${g.id}`} className={buttonVariants({ size: "sm", className: "w-full" })}>
                      <BookCheck aria-hidden />
                      {g.resultadosCerrados === g.estudiantes && g.estudiantes > 0 ? "Ver notas" : "Registrar notas"}
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}
