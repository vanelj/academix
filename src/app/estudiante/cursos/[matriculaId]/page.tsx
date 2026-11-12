import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, Building2, CalendarDays, Clock, GraduationCap, MonitorPlay, UserRound } from "lucide-react"

import { MisCertificados } from "@/components/estudiante/mis-certificados"
import { NotasCurso } from "@/components/estudiante/notas-curso"
import { ProximaClase, type DatosProximaClase } from "@/components/estudiante/proxima-clase"
import { CalendarioAcademico } from "@/components/horarios/calendario-academico"
import { Pestanas, seccionValida } from "@/components/layout/pestanas"
import { MaterialesCurso } from "@/components/materiales/materiales-curso"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerMisCertificados, type MiCertificado } from "@/lib/certificados/estudiante"
import { resumenSemanal } from "@/lib/cursos/asistente-logica"
import { franjasDeGrupos, gruposCalendarioEstudiante, obtenerMisNotas, type NotaCurso } from "@/lib/estudiantes/academico"
import { obtenerMisCursos, type MiCurso } from "@/lib/estudiantes/mis-cursos"
import { ETIQUETA_ESTADO_ACADEMICO, estadoAcademico } from "@/lib/estudiantes/tarjetas"
import { ahoraAcademico, proximaClase } from "@/lib/horarios/calendario"
import { leerMateriales, type LecturaMateriales } from "@/lib/materiales/datos"
import { cn } from "@/lib/utils"
import { idSchema } from "@/lib/validations/grupo"

export const metadata: Metadata = { title: "Aula del curso · Academix" }

const SECCIONES = ["inicio", "clases", "materiales", "notas", "certificado"] as const
const fecha = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "UTC" })
const f = (iso: string) => fecha.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
const MODALIDAD: Record<string, string> = { virtual: "Virtual", presencial: "Presencial", mixta: "Mixta (virtual y presencial)" }

/**
 * Aula académica de UNA matrícula del estudiante: inicio, clases y horario,
 * materiales, evaluaciones y notas, y certificado. Solo sus matrículas (RPC
 * mis_cursos / RLS); una ajena se trata como inexistente. Muestra únicamente
 * el docente responsable de su grupo. Enlaces de clase y materiales solo con
 * matrícula ACTIVA (lo exige la RLS).
 */
export default async function AulaPage({ params, searchParams }: PageProps<"/estudiante/cursos/[matriculaId]">) {
  const sesion = await requerirPanel("estudiante")
  const { matriculaId } = await params
  const seccion = seccionValida((await searchParams).seccion, SECCIONES)
  if (!idSchema.safeParse(matriculaId).success) notFound()

  let curso: MiCurso | undefined
  try {
    curso = (await obtenerMisCursos(sesion.userId)).cursos.find((c) => c.matriculaId === matriculaId)
  } catch {
    return <ErrorAula />
  }
  if (!curso) notFound()

  const activa = curso.estado === "activa"
  const ahora = ahoraAcademico()
  const estado = estadoAcademico(curso)
  const base = `/estudiante/cursos/${curso.matriculaId}`

  // Solo lo que necesita la sección abierta (y lo mínimo del inicio).
  const franjas = activa && (seccion === "inicio" || seccion === "clases") ? await franjasDeGrupos([curso.grupoId]) : null
  const calendario = gruposCalendarioEstudiante([curso], franjas)
  const prox = calendario.length ? proximaClase(calendario, ahora) : null
  const datosProxima: DatosProximaClase | null = prox
    ? { fecha: prox.fecha, hora_inicio: prox.hora_inicio, hora_fin: prox.hora_fin, enlace: prox.enlace, ubicacion: prox.ubicacion, modalidad: prox.modalidad }
    : null

  let notas: NotaCurso | null = null
  let materiales: LecturaMateriales | "error" = { disponible: false }
  let certificados: MiCertificado[] | "no_disponible" | "error" = []
  try {
    if (activa && (seccion === "inicio" || seccion === "notas")) notas = (await obtenerMisNotas([curso]))[0] ?? null
  } catch {
    notas = null
  }
  if (activa && seccion === "materiales") {
    try {
      materiales = await leerMateriales(curso.grupoId)
    } catch {
      materiales = "error"
    }
  }
  if (seccion === "certificado") {
    try {
      const r = await obtenerMisCertificados()
      certificados = r.disponible ? r.certificados.filter((c) => c.matriculaId === curso!.matriculaId) : "no_disponible"
    } catch {
      certificados = "error"
    }
  }

  return (
    <>
      <Link href="/estudiante/cursos" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-3 w-fit")}>
        <ArrowLeft aria-hidden />
        Mis cursos
      </Link>

      <Card className="mb-6 gap-0 overflow-hidden py-0 md:flex-row">
        <div className="relative aspect-video bg-gradient-to-br from-primary/25 via-primary/10 to-muted md:aspect-auto md:w-72 md:shrink-0">
          {curso.portadaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={curso.portadaUrl} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <GraduationCap className="absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 text-primary/60" aria-hidden />
          )}
        </div>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight break-words">{curso.curso?.nombre ?? "Curso"}</h2>
            <Badge variant={estado === "en_curso" || estado === "aprobado" ? "success" : estado === "desaprobado" ? "destructive" : "secondary"}>{ETIQUETA_ESTADO_ACADEMICO[estado]}</Badge>
          </div>
          <ul className="grid gap-x-6 gap-y-1.5 text-sm text-muted-foreground sm:grid-cols-2">
            <li className="flex items-center gap-1.5"><Building2 className="size-4 shrink-0" aria-hidden />{curso.institucion ?? "Institución"}</li>
            <li className="flex items-center gap-1.5"><UserRound className="size-4 shrink-0" aria-hidden />{curso.docente ?? "Docente por asignar"}</li>
            {curso.grupo && <li className="flex items-center gap-1.5"><CalendarDays className="size-4 shrink-0" aria-hidden />Grupo {curso.grupo.codigo} · {f(curso.grupo.fechaInicio)} – {f(curso.grupo.fechaFin)}</li>}
            {curso.modalidad && <li className="flex items-center gap-1.5"><MonitorPlay className="size-4 shrink-0" aria-hidden />{MODALIDAD[curso.modalidad] ?? curso.modalidad}</li>}
            {curso.horarios.length > 0 && (
              <li className="flex items-start gap-1.5 sm:col-span-2"><Clock className="mt-0.5 size-4 shrink-0" aria-hidden />{resumenSemanal(curso.horarios.map((h) => ({ dia_semana: String(h.dia_semana), hora_inicio: h.hora_inicio, hora_fin: h.hora_fin })))}</li>
            )}
          </ul>
        </CardContent>
      </Card>

      {!activa ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Esta matrícula fue anulada: el aula ya no está disponible. Si tienes dudas, comunícate con la institución.</CardContent></Card>
      ) : (
        <>
          <Pestanas
            etiqueta="Secciones del curso"
            activa={seccion}
            pestanas={[
              { valor: "inicio", etiqueta: "Inicio", href: base },
              { valor: "clases", etiqueta: "Clases y horario", href: `${base}?seccion=clases` },
              { valor: "materiales", etiqueta: "Materiales", href: `${base}?seccion=materiales` },
              { valor: "notas", etiqueta: "Evaluaciones y notas", href: `${base}?seccion=notas` },
              { valor: "certificado", etiqueta: "Certificado", href: `${base}?seccion=certificado` },
            ]}
          />

          {seccion === "inicio" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Próxima clase</CardTitle></CardHeader>
                <CardContent><ProximaClase clase={datosProxima} ahoraInicial={ahora} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Tus notas</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {!notas || notas.resumen.tarjetas.length === 0 ? (
                    <p className="text-muted-foreground">Aún no hay evaluaciones configuradas.</p>
                  ) : (
                    <>
                      <p>
                        {notas.resumen.calculo.registradas} de {notas.resumen.tarjetas.length} evaluaciones calificadas
                        {notas.resumen.calculo.promedio !== null
                          ? ` · Promedio final ${notas.resumen.calculo.promedio.toFixed(2)}`
                          : notas.resumen.calculo.parcial !== null ? ` · Promedio parcial ${notas.resumen.calculo.parcial.toFixed(2)} (provisional)` : ""}
                      </p>
                      <Link href={`${base}?seccion=notas`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        Ver evaluaciones y notas
                        <ArrowRight aria-hidden />
                      </Link>
                    </>
                  )}
                </CardContent>
              </Card>
              {curso.descripcion && (
                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-base">Sobre el curso</CardTitle></CardHeader>
                  <CardContent><p className="text-sm whitespace-pre-line text-muted-foreground">{curso.descripcion}</p></CardContent>
                </Card>
              )}
            </div>
          )}

          {seccion === "clases" && (
            calendario[0]?.franjas.length ? (
              <CalendarioAcademico grupos={calendario} ahoraInicial={ahora} />
            ) : (
              <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">La institución aún no registró el horario de tu grupo.</CardContent></Card>
            )
          )}

          {seccion === "materiales" && (
            materiales === "error" ? <ErrorAula texto="No se pudieron cargar los materiales. Recarga la página en unos minutos." />
              : materiales.disponible ? <MaterialesCurso materiales={materiales.materiales} />
                : <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Los materiales del curso estarán disponibles próximamente.</CardContent></Card>
          )}

          {seccion === "notas" && (notas ? <NotasCurso datos={notas} /> : <ErrorAula texto="No se pudieron cargar tus notas. Recarga la página en unos minutos." />)}

          {seccion === "certificado" && (
            certificados === "error" ? <ErrorAula texto="No se pudo cargar tu certificado. Recarga la página en unos minutos." />
              : certificados !== "no_disponible" && certificados.length > 0 && certificados.every((c) => !c.certificado && c.modalidad === "sin_certificado") ? (
                <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Este curso no otorga certificado.</CardContent></Card>
              ) : certificados === "no_disponible" || certificados.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    {curso.estadoFinal === "desaprobado"
                      ? "El resultado registrado para este curso no permite emitir certificado."
                      : "El certificado estará disponible cuando la institución registre tu resultado aprobado y se cumplan los requisitos del curso."}
                  </CardContent>
                </Card>
              ) : <MisCertificados certificados={certificados} />
          )}
        </>
      )}
    </>
  )
}

function ErrorAula({ texto = "No se pudo cargar el curso. Recarga la página en unos minutos." }: { texto?: string }) {
  return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{texto}</CardContent></Card>
}
