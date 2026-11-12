import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, BookCheck, CalendarDays, MapPin, UsersRound, Video } from "lucide-react"

import { EstadoGrupoBadge, fechaCorta } from "@/components/admin/grupos/grupo-ui"
import { AvanceNotas, ErrorCarga } from "@/components/docente/docente-ui"
import { Pestanas, seccionValida } from "@/components/layout/pestanas"
import { MaterialesCurso } from "@/components/materiales/materiales-curso"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerRegistroGrupo, type RegistroGrupo } from "@/lib/docente/datos"
import { ETIQUETA_CALCULO } from "@/lib/evaluaciones/calculo"
import { DIAS_LARGOS, enlaceHttps, rangoHora } from "@/lib/horarios/calendario"
import { leerMateriales, type LecturaMateriales } from "@/lib/materiales/datos"
import { cn } from "@/lib/utils"
import { idSchema } from "@/lib/validations/grupo"

export const metadata: Metadata = { title: "Grupo · Academix" }

const SECCIONES = ["resumen", "estudiantes", "materiales"] as const

/**
 * Espacio del grupo para el docente: todo lo de un grupo en un solo lugar
 * (horario, estudiantes, materiales) con acceso directo al registro de notas.
 * Un grupo que no es suyo se trata como inexistente.
 */
export default async function GrupoDocentePage({ params, searchParams }: PageProps<"/docente/grupos/[grupoId]">) {
  const sesion = await requerirPanel("docente")
  const { grupoId } = await params
  const seccion = seccionValida((await searchParams).seccion, SECCIONES)
  if (!sesion.perfil.institucionId || !idSchema.safeParse(grupoId).success) notFound()

  let registro: RegistroGrupo | null
  let materiales: LecturaMateriales = { disponible: false }
  try {
    registro = await obtenerRegistroGrupo(sesion.userId, sesion.perfil.institucionId, grupoId)
    if (registro && seccion === "materiales") materiales = await leerMateriales(grupoId)
  } catch {
    return <ErrorCarga texto="No se pudo cargar el grupo. Recarga la página en unos minutos." />
  }
  if (!registro) notFound()
  const g = registro.grupo
  const base = `/docente/grupos/${g.id}`

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <Link href="/docente/grupos" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Mis grupos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight break-words">{g.curso?.nombre ?? "Curso"}</h2>
          <EstadoGrupoBadge estado={g.estado} />
        </div>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Grupo {g.codigo}{sesion.institucion ? ` · ${sesion.institucion}` : ""}</span>
          <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden />{fechaCorta(g.fecha_inicio)} – {fechaCorta(g.fecha_fin)}</span>
          <span className="flex items-center gap-1.5"><UsersRound className="size-3.5" aria-hidden />{g.estudiantes} {g.estudiantes === 1 ? "estudiante" : "estudiantes"}</span>
        </p>
        {g.estado !== "cancelado" && (
          <Link href={`/docente/calificaciones/${g.id}`} className={cn(buttonVariants(), "w-fit")}>
            <BookCheck aria-hidden />
            Registrar notas
          </Link>
        )}
      </div>

      <Pestanas
        etiqueta="Secciones del grupo"
        activa={seccion}
        pestanas={[
          { valor: "resumen", etiqueta: "Resumen", href: base },
          { valor: "estudiantes", etiqueta: "Estudiantes", href: `${base}?seccion=estudiantes`, contador: registro.filas.length },
          { valor: "materiales", etiqueta: "Materiales", href: `${base}?seccion=materiales` },
        ]}
      />

      {seccion === "resumen" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Horario semanal</CardTitle></CardHeader>
            <CardContent>
              {g.horarios.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin horarios registrados. La institución los define en «Grupos y horarios».</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {g.horarios.map((h) => {
                    const enlace = enlaceHttps(h.enlace_clase)
                    return (
                      <li key={h.id} className="flex flex-col gap-1 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">{DIAS_LARGOS[h.dia_semana - 1]} · <span className="tabular-nums">{rangoHora(h.hora_inicio, h.hora_fin)}</span></p>
                          {h.ubicacion && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="size-3.5" aria-hidden />{h.ubicacion}</p>}
                        </div>
                        {enlace && (
                          <a href={enlace} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
                            <Video aria-hidden />
                            Enlace de clase
                          </a>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Evaluaciones y notas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <AvanceNotas grupo={g} />
              {g.evaluaciones.length > 0 && (
                <ul className="divide-y rounded-xl border text-sm">
                  {g.evaluaciones.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0 break-words">{e.nombre} <span className="text-muted-foreground">· {e.peso} %</span></span>
                      {g.publicacionActiva && <Badge variant={e.publicada_en ? "success" : "outline"}>{e.publicada_en ? "Publicada" : "Borrador"}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {seccion === "estudiantes" && (
        registro.filas.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Este grupo aún no tiene estudiantes con matrícula confirmada.</CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Estudiantes del grupo {g.codigo}</caption>
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th scope="col" className="px-3 py-2 font-medium">Estudiante</th>
                  <th scope="col" className="px-3 py-2 font-medium">Avance</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Promedio</th>
                  <th scope="col" className="px-3 py-2 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {registro.filas.map((f) => (
                  <tr key={f.matriculaId} className="border-b last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-normal break-words">{f.nombre}</th>
                    <td className="px-3 py-2 text-muted-foreground">{ETIQUETA_CALCULO[f.calculo.estado]}{f.calculo.faltantes > 0 && f.calculo.estado !== "sin_evaluaciones" ? ` · faltan ${f.calculo.faltantes}` : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {f.calculo.promedio !== null ? f.calculo.promedio.toFixed(2) : f.calculo.parcial !== null ? <span className="text-muted-foreground">{f.calculo.parcial.toFixed(2)}*</span> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {f.estadoFinal === "en_curso" ? <span className="text-xs text-muted-foreground">En curso</span>
                        : <Badge variant={f.estadoFinal === "aprobado" ? "success" : "destructive"}>{f.estadoFinal === "aprobado" ? "Aprobado" : "Desaprobado"}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">* Promedio parcial con las evaluaciones que ya tienen nota.</p>
          </div>
        )
      )}

      {seccion === "materiales" && (
        materiales.disponible ? (
          <MaterialesCurso
            materiales={materiales.materiales}
            gestion={g.estado !== "cancelado" ? { grupoId: g.id, institucionId: sesion.perfil.institucionId, userId: sesion.userId, esAdmin: false } : undefined}
          />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Los materiales se habilitarán cuando la institución aplique la actualización «aula_academica_v5».
            </CardContent>
          </Card>
        )
      )}
    </>
  )
}
