import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building2, CalendarDays, Clock, UserRound } from "lucide-react"

import { CategoryIcon } from "@/academix/components/ui/CategoryIcon"
import { getCategoryVisual } from "@/academix/lib/visuals"
import { InscripcionGrupo, type EstadoSesionInscripcion } from "@/components/public/inscripcion-grupo"
import { importeAlInscribirse } from "@/lib/inscripcion/precio"
import { duracionGrupo } from "@/lib/cursos/duracion"
import { AcademixPublico } from "@/components/public/academix-publico"
import { AxCabecera, AxPie } from "@/components/public/academix-secciones"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { obtenerContexto } from "@/lib/auth/contexto"
import { obtenerDetalleCurso } from "@/lib/inscripcion/datos"
import { estadoEnCurso } from "@/lib/inscripcion/estado-estudiante"
import { courseFiltersToSearchParams, parseCourseSearchParams } from "@/academix/lib/filters"
import { consultaExplorar } from "@/lib/oferta/explorar"
import { obtenerGruposOferta } from "@/lib/oferta/grupos"
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
export default async function CursoPublicoPage({ params, searchParams }: PageProps<"/cursos/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  if (!idSchema.safeParse(id).success) notFound()
  const [curso, ctx, gruposOferta] = await Promise.all([obtenerDetalleCurso(id), obtenerContexto(), obtenerGruposOferta([id]).catch(() => null)])
  if (!curso) notFound()
  // Grupos ya iniciados: se informan (el curso sigue activo), sin inscripción.
  const enCurso = (gruposOferta ?? []).filter((g) => g.estado === "en_curso")

  const sesion: EstadoSesionInscripcion =
    ctx.estado === "sin_sesion" ? "sin_sesion" : ctx.estado === "sin_perfil" ? "sin_perfil" : ctx.rolActivo === "estudiante" ? "estudiante" : "no_estudiante"
  // Situación real del estudiante en este curso (sus solicitudes y matrículas).
  const estadoEstudiante = sesion === "estudiante" && ctx.estado === "con_perfil"
    ? await estadoEnCurso(ctx.userId, curso.id, curso.grupos.map((g) => g.id))
    : null
  // Volver al catálogo con los mismos filtros (?volver=…, reconstruido solo con filtros válidos).
  // Desde el panel del estudiante (?desde=panel) se vuelve a «Explorar cursos» del panel.
  const desdePanel = sp.desde === "panel" && sesion === "estudiante"
  const volver = typeof sp.volver === "string"
    ? (desdePanel ? consultaExplorar(new URLSearchParams(sp.volver)) : courseFiltersToSearchParams(parseCourseSearchParams(Object.fromEntries(new URLSearchParams(sp.volver)))).toString())
    : ""
  const c = curso.condiciones
  const politicas = curso.politicas
  const categoriaVisual = getCategoryVisual({ slug: "", name: curso.categoria })
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
    <AcademixPublico>
    <div className="flex min-h-svh flex-1 flex-col">
      <AxCabecera activa="courses" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <nav aria-label="Navegación" className="-ml-2.5 mb-4 flex flex-wrap items-center gap-1">
          {desdePanel ? (
            <>
              <Link href={volver ? `/estudiante/explorar?${volver}` : "/estudiante/explorar"} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <ArrowLeft aria-hidden />
                Volver al catálogo
              </Link>
              <Link href="/estudiante/cursos" className={buttonVariants({ variant: "ghost", size: "sm" })}>Mis cursos</Link>
              <Link href="/estudiante" className={buttonVariants({ variant: "ghost", size: "sm" })}>Mi panel</Link>
            </>
          ) : (
            <>
              <Link href={volver ? `/cursos?${volver}` : "/cursos"} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <ArrowLeft aria-hidden />
                Volver a cursos
              </Link>
              {sesion === "estudiante" && <Link href="/estudiante" className={buttonVariants({ variant: "ghost", size: "sm" })}>Mi panel</Link>}
            </>
          )}
        </nav>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-6">
            <div className="space-y-3">
              {curso.portada_url ? (
                // Portada oficial del curso (bucket público de Supabase): la misma que en el catálogo.
                <div className="relative mb-2 aspect-video w-full overflow-hidden rounded-3xl bg-muted ring-1 ring-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={curso.portada_url} alt={`Portada del curso ${curso.nombre}`} className="h-full w-full object-cover" />
                </div>
              ) : (
                // Mantiene la portada generada por categoría para los cursos sin imagen o antes de V5.
                <div aria-hidden className={`ax-cover ax-cover--${categoriaVisual} mb-2 aspect-video w-full rounded-3xl`}>
                  <span className="ax-cover-icon"><CategoryIcon visual={categoriaVisual} size={30} /></span>
                </div>
              )}
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

            {estadoEstudiante?.matriculadoEnCurso && (
              <div role="status" className="flex flex-col gap-3 rounded-2xl border border-success/40 bg-success/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium">Ya estás matriculado en este curso.</p>
                <Link href="/estudiante/cursos" className={buttonVariants({ size: "sm" })}>Ir a mi curso</Link>
              </div>
            )}

            <section aria-labelledby="grupos-titulo" className="space-y-3">
              <h2 id="grupos-titulo" className="text-xl font-semibold">Grupos</h2>
              {curso.gruposNoDisponibles ? (
                // Un error al consultar los grupos no debe presentarse como «no hay grupos».
                <p role="alert" className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No pudimos cargar los grupos de este curso en este momento. Inténtalo de nuevo más tarde.
                </p>
              ) : curso.grupos.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {enCurso.length ? "Sin inscripciones abiertas: los grupos de este curso ya están en curso. Vuelve pronto para el siguiente grupo." : "Por ahora no hay grupos programados ni con inscripciones abiertas."}
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
                              {g.estado === "abierto" && (g.vacantes_disponibles ?? 1) < 1 ? (
                                <Badge variant="outline">Sin vacantes</Badge>
                              ) : g.estado === "abierto" ? (
                                <Badge variant="success">Inscripciones abiertas</Badge>
                              ) : (
                                <Badge variant="warning">Próximamente</Badge>
                              )}
                            </div>
                            <p className="flex items-center gap-1.5 text-muted-foreground">
                              <CalendarDays className="size-3.5" aria-hidden />
                              {duracionGrupo(g.fecha_inicio, g.fecha_fin) && <span className="font-medium text-foreground">{duracionGrupo(g.fecha_inicio, g.fecha_fin)} ·</span>}
                              {f(g.fecha_inicio)} – {f(g.fecha_fin)}
                            </p>
                            {g.horarios.length > 0 && (
                              <p className="flex items-start gap-1.5 text-muted-foreground">
                                <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                {g.horarios.map((h) => `${DIAS_SEMANA[h.dia_semana - 1]} ${h.hora_inicio}–${h.hora_fin}`).join(" · ")}
                              </p>
                            )}
                            <p className="flex items-center gap-1.5 text-muted-foreground">
                              <UserRound className="size-3.5" aria-hidden />
                              {g.docente?.trim() || "Docente por asignar"}
                            </p>
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
                                cursoId={curso.id}
                                cursoNombre={curso.nombre}
                                duracion={duracionGrupo(g.fecha_inicio, g.fecha_fin)}
                                estado={estadoEstudiante?.porGrupo[g.id] ?? null}
                                matriculadoEnCurso={estadoEstudiante?.matriculadoEnCurso ?? false}
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
              {enCurso.length > 0 && (
                <ul className="space-y-2" aria-label="Grupos en curso">
                  {enCurso.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-sm">
                      <span className="font-medium">Grupo {g.codigo}</span>
                      <Badge variant="secondary">En curso</Badge>
                      <span className="text-muted-foreground">{f(g.fecha_inicio)} – {f(g.fecha_fin)} · ya no admite nuevas matrículas</span>
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
                <CardTitle>Precio</CardTitle>
                {!c && <CardDescription>La institución aún no publicó las condiciones de inscripción.</CardDescription>}
              </CardHeader>
              {c && (
                <CardContent className="space-y-2 text-sm">
                  {c.tipo_cobro === "gratuito" ? (
                    <p className="text-3xl font-extrabold">Gratis</p>
                  ) : c.tipo_cobro === "unico" ? (
                    <>
                      {/* Pago completo: un solo precio, como en una tienda de cursos. */}
                      <p className="text-3xl font-extrabold tabular-nums">{soles.format(importeAlInscribirse(c))}</p>
                      <p className="text-muted-foreground">Pago único al inscribirte.</p>
                    </>
                  ) : (
                    <>
                      {/* Curso anterior con cuotas: se muestra tal cual lo configuró la institución. */}
                      <Fila etiqueta="Al inscribirte" valor={soles.format(c.matricula_importe)} />
                      <Fila etiqueta="Curso (en cuotas)" valor={soles.format(c.importe_curso)} />
                    </>
                  )}
                  <p className="pt-2 text-xs text-muted-foreground">
                    Pagas directamente a la institución (Yape, Plin, transferencia o depósito) y ella verifica tu comprobante.
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
      <AxPie />
    </div>
    </AcademixPublico>
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
