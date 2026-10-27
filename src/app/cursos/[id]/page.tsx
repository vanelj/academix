import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building2, CalendarDays, Clock, UserRound } from "lucide-react"

import { InscripcionGrupo, type EstadoSesionInscripcion } from "@/components/public/inscripcion-grupo"
import { PublicFooter } from "@/components/public/public-footer"
import { PublicHeader } from "@/components/public/public-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { obtenerContexto } from "@/lib/auth/contexto"
import { obtenerDetalleCurso } from "@/lib/inscripcion/datos"
import { cn } from "@/lib/utils"
import { DIAS_SEMANA, idSchema } from "@/lib/validations/grupo"

const soles = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })
const fecha = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "UTC" })
const f = (iso: string) => fecha.format(new Date(`${iso}T00:00:00Z`))

export async function generateMetadata({ params }: PageProps<"/cursos/[id]">): Promise<Metadata> {
  const { id } = await params
  if (!idSchema.safeParse(id).success) return { title: "Curso · Academix" }
  const curso = await obtenerDetalleCurso(id).catch(() => null)
  return { title: curso ? `${curso.nombre} · Academix` : "Curso · Academix", description: curso?.descripcion ?? undefined }
}

// Detalle público de un curso publicado: solo vistas públicas de V5.
export default async function CursoPublicoPage({ params }: PageProps<"/cursos/[id]">) {
  const { id } = await params
  if (!idSchema.safeParse(id).success) notFound()
  const [curso, ctx] = await Promise.all([obtenerDetalleCurso(id), obtenerContexto()])
  if (!curso) notFound()

  const sesion: EstadoSesionInscripcion =
    ctx.estado === "sin_sesion" ? "sin_sesion" : ctx.estado === "sin_perfil" ? "sin_perfil" : ctx.rolActivo === "estudiante" ? "estudiante" : "no_estudiante"
  const c = curso.condiciones
  const politicas = curso.politicas
  const textosPoliticas = politicas
    ? ([
        ["Matrícula", politicas.texto_matricula],
        ["Reservas", politicas.texto_reservas],
        ["Pagos y comprobantes", politicas.texto_pagos],
        ["Cancelaciones y devoluciones", politicas.texto_devoluciones],
        ["Morosidad", politicas.texto_morosidad],
      ].filter((t): t is [string, string] => Boolean(t[1]?.trim())))
    : []

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-background">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/cursos" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5 mb-4")}>
          <ArrowLeft aria-hidden />
          Volver a cursos
        </Link>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{curso.categoria}</Badge>
                <Badge variant="outline" className="text-muted-foreground">Virtual</Badge>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-balance">{curso.nombre}</h1>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="size-4" aria-hidden />
                <Link href={`/cursos?institucion=${curso.institucion_id}`} className="hover:underline">{curso.institucion}</Link>
              </p>
              {curso.descripcion && <p className="text-base whitespace-pre-line text-muted-foreground">{curso.descripcion}</p>}
            </div>

            <section aria-labelledby="grupos-titulo" className="space-y-3">
              <h2 id="grupos-titulo" className="text-xl font-semibold">Grupos</h2>
              {curso.grupos.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Por ahora no hay grupos programados ni con inscripciones abiertas.
                </p>
              ) : (
                <ul className="space-y-3">
                  {curso.grupos.map((g) => (
                    <li key={g.id}>
                      <Card size="sm">
                        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1.5 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">Grupo {g.codigo}</p>
                              {g.estado === "abierto" ? <Badge variant="success">Inscripciones abiertas</Badge> : <Badge variant="warning">Próximamente</Badge>}
                            </div>
                            <p className="flex items-center gap-1.5 text-muted-foreground">
                              <CalendarDays className="size-3.5" aria-hidden />
                              {f(g.fecha_inicio)} – {f(g.fecha_fin)}
                            </p>
                            {g.horarios.length > 0 && (
                              <p className="flex items-start gap-1.5 text-muted-foreground">
                                <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                {g.horarios.map((h) => `${DIAS_SEMANA[h.dia_semana - 1]} ${h.hora_inicio}–${h.hora_fin}`).join(" · ")}
                              </p>
                            )}
                            {g.docente && (
                              <p className="flex items-center gap-1.5 text-muted-foreground">
                                <UserRound className="size-3.5" aria-hidden />
                                {g.docente}
                              </p>
                            )}
                            {g.vacantes_disponibles !== null && (
                              <p className="text-xs text-muted-foreground">
                                {g.vacantes_disponibles > 0 ? `${g.vacantes_disponibles} vacantes disponibles` : "Sin vacantes disponibles"}
                              </p>
                            )}
                          </div>
                          {g.estado === "abierto" && (
                            <div className="shrink-0">
                              <InscripcionGrupo
                                grupoId={g.id}
                                grupoCodigo={g.codigo}
                                sinVacantes={(g.vacantes_disponibles ?? 1) < 1}
                                condiciones={c}
                                politicas={politicas}
                                sesion={sesion}
                              />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {textosPoliticas.length > 0 && (
              <section aria-labelledby="politicas-titulo" className="space-y-3">
                <h2 id="politicas-titulo" className="text-xl font-semibold">Políticas de la institución</h2>
                <div className="space-y-2">
                  {textosPoliticas.map(([titulo, texto]) => (
                    <details key={titulo} className="group rounded-lg border px-4 py-3">
                      <summary className="cursor-pointer text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">{titulo}</summary>
                      <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{texto}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20">
            <Card>
              <CardHeader>
                <CardTitle>Inversión</CardTitle>
                {!c && <CardDescription>La institución aún no publicó las condiciones de inscripción.</CardDescription>}
              </CardHeader>
              {c && (
                <CardContent className="space-y-2 text-sm">
                  {c.tipo_cobro === "gratuito" ? (
                    <p className="text-lg font-semibold">Gratuito</p>
                  ) : (
                    <>
                      <Fila etiqueta="Matrícula" valor={soles.format(c.matricula_importe)} />
                      <Fila etiqueta={c.tipo_cobro === "cuotas" ? "Curso (en cuotas)" : "Curso"} valor={soles.format(c.importe_curso)} />
                      {c.permite_reserva && (
                        <Fila etiqueta="Reserva de vacante" valor={`${soles.format(c.reserva_importe)} · ${c.reserva_plazo_horas ?? "—"} h`} />
                      )}
                    </>
                  )}
                  <p className="pt-2 text-xs text-muted-foreground">
                    Los pagos se realizan por medios externos y la institución verifica el comprobante.
                  </p>
                  {c.requisitos && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold">Requisitos</p>
                      <p className="whitespace-pre-line text-muted-foreground">{c.requisitos}</p>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
            {curso.certificacion && (
              <Card>
                <CardHeader>
                  <CardTitle>Certificado</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="font-medium">
                    {curso.certificacion.modalidad === "sin_certificado" && "Este curso no entrega certificado."}
                    {curso.certificacion.modalidad === "gratuito" && "Certificado gratuito al aprobar."}
                    {curso.certificacion.modalidad === "incluido" && "Certificado incluido en el precio del curso."}
                    {curso.certificacion.modalidad === "costo_adicional" && `Certificado opcional con costo adicional de ${soles.format(curso.certificacion.importe)}.`}
                  </p>
                  {curso.certificacion.modalidad !== "sin_certificado" && (
                    <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                      <li>Se emite al aprobar el curso{curso.certificacion.nota_minima !== null ? ` con nota mínima de ${curso.certificacion.nota_minima}` : ""}.</li>
                      {curso.certificacion.horas_academicas && <li>{curso.certificacion.horas_academicas} horas académicas.</li>}
                      {curso.certificacion.modalidad === "costo_adicional" && <li>El pago del certificado es aparte y no afecta tu resultado académico.</li>}
                      {curso.certificacion.requisitos_adicionales && <li className="whitespace-pre-line">{curso.certificacion.requisitos_adicionales}</li>}
                      <li>Incluye un código para verificar su autenticidad en Academix.</li>
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="font-medium tabular-nums">{valor}</span>
    </div>
  )
}
