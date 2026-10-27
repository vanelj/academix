import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CircleAlert, CircleCheck, Info } from "lucide-react"

import { CertificacionCursoForm } from "@/components/admin/cursos/certificacion-curso"
import { CursoAcciones } from "@/components/admin/cursos/curso-acciones"
import { PlanCuotas } from "@/components/admin/cursos/plan-cuotas"
import {
  DESCRIPCION_ESTADO,
  ETIQUETA_COBRO,
  EstadoCursoBadge,
  formatoFechaCurso,
  formatoHoras,
  formatoSoles,
} from "@/components/admin/cursos/curso-ui"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerCertificacionCurso } from "@/lib/certificados/datos"
import { obtenerCurso, obtenerPlanCuotas } from "@/lib/cursos/datos"
import { cn } from "@/lib/utils"
import { idCursoSchema, importeTotalCondiciones } from "@/lib/validations/curso"

export const metadata: Metadata = {
  title: "Curso · Academix",
}

const formatoFechaHora = new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeStyle: "short" })

export default async function CursoPage({ params }: PageProps<"/admin/cursos/[id]">) {
  const sesion = await requerirPanel("admin")
  const { id } = await params
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idCursoSchema.safeParse(id).success) notFound()

  // Un curso de otra institución se trata como inexistente (RLS + filtro explícito).
  const curso = await obtenerCurso(institucionId, id)
  if (!curso) notFound()

  const c = curso.condiciones
  const categoriaActiva = curso.categoria?.activo === true
  const puedePublicar = categoriaActiva && curso.tieneCondiciones === true
  const faltaPlan = c?.tipo_cobro === "cuotas" && c.importe_curso > 0 && curso.cuotasPlan === 0
  const plan = c?.tipo_cobro === "cuotas" ? await obtenerPlanCuotas(institucionId, curso.id) : null
  const certificacion = await obtenerCertificacionCurso(institucionId, curso.id).catch(() => ({ disponible: false as const }))

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Link href="/admin/cursos" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Volver a cursos
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight break-words">{curso.nombre}</h2>
              <EstadoCursoBadge estado={curso.estado} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{DESCRIPCION_ESTADO[curso.estado]}</p>
          </div>
          <CursoAcciones
            cursoId={curso.id}
            nombre={curso.nombre}
            estado={curso.estado}
            puedePublicar={puedePublicar}
            grupos={curso.grupos}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Información general</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Dato etiqueta="Categoría">
                  {curso.categoria?.nombre ?? "—"}
                  {curso.categoria && !curso.categoria.activo && <span className="text-warning"> (inactiva)</span>}
                </Dato>
                <Dato etiqueta="Creado el">{formatoFechaCurso.format(new Date(curso.created_at))}</Dato>
                <Dato etiqueta="Descripción" className="sm:col-span-2">
                  {curso.descripcion ? <span className="whitespace-pre-line">{curso.descripcion}</span> : <Vacio />}
                </Dato>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Información académica</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Dato etiqueta="Modalidad">Virtual</Dato>
                <Dato etiqueta="Nota aprobatoria">{curso.nota_aprobatoria.toLocaleString("es-PE")} / 20</Dato>
                <Dato etiqueta="Grupos">{curso.grupos ?? "—"}</Dato>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Precio y condiciones</CardTitle>
              <CardDescription>
                {c ? `Actualizadas el ${formatoFechaHora.format(new Date(c.actualizado_en))}.` : "Aún no se han configurado las condiciones de inscripción."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Dato etiqueta="Precio publicado">{formatoSoles.format(curso.precio)}</Dato>
                {c && (
                  <>
                    <Dato etiqueta="Tipo de cobro">{ETIQUETA_COBRO[c.tipo_cobro]}</Dato>
                    {c.tipo_cobro !== "gratuito" && (
                      <>
                        <Dato etiqueta="Matrícula">{formatoSoles.format(c.matricula_importe)}</Dato>
                        <Dato etiqueta="Importe del curso">{formatoSoles.format(c.importe_curso)}</Dato>
                        <Dato etiqueta="Total">{formatoSoles.format(importeTotalCondiciones(c))}</Dato>
                        <Dato etiqueta="Reserva de vacante">
                          {c.permite_reserva
                            ? `${formatoSoles.format(c.reserva_importe)} · plazo ${formatoHoras(c.reserva_plazo_horas ?? 0)}${c.reserva_descuenta_matricula ? " · se descuenta de la matrícula" : ""}`
                            : "No se ofrece"}
                        </Dato>
                      </>
                    )}
                    <Dato etiqueta="Requisitos" className="sm:col-span-3">
                      {c.requisitos ? <span className="whitespace-pre-line">{c.requisitos}</span> : <Vacio />}
                    </Dato>
                    <Dato etiqueta="Condiciones particulares" className="sm:col-span-3">
                      {c.condiciones_especiales ? <span className="whitespace-pre-line">{c.condiciones_especiales}</span> : <Vacio />}
                    </Dato>
                  </>
                )}
              </dl>
              {!c && (
                <Link href={`/admin/cursos/${curso.id}/editar`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4")}>
                  Configurar condiciones
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Certificado</CardTitle>
              <CardDescription>Si el curso entrega certificado, cómo se cobra y qué se exige. Se muestra en el catálogo antes de la inscripción.</CardDescription>
            </CardHeader>
            <CardContent>
              {certificacion.disponible ? (
                <CertificacionCursoForm
                  cursoId={curso.id}
                  config={certificacion.config}
                  plantillas={certificacion.plantillas}
                  firmantes={certificacion.firmantes}
                  notaAprobatoria={curso.nota_aprobatoria}
                />
              ) : (
                <p className="text-sm text-muted-foreground">La configuración de certificados requiere la migración «certificados_v5», pendiente de aplicar.</p>
              )}
            </CardContent>
          </Card>

          {c?.tipo_cobro === "cuotas" && (
            <Card>
              <CardHeader>
                <CardTitle>Plan de cuotas</CardTitle>
                <CardDescription>
                  Mensualidades que se generan al confirmar cada matrícula. La matrícula ({formatoSoles.format(c.matricula_importe)}) se paga
                  aparte, al inscribirse.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {plan ? (
                  <PlanCuotas cursoId={curso.id} plan={plan} importeCurso={c.importe_curso} />
                ) : (
                  <p className="text-sm text-muted-foreground">No se pudo cargar el plan de cuotas. Recarga la página.</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Para publicar</CardTitle>
              <CardDescription>Publicar lo muestra en el catálogo; no abre inscripciones por sí solo.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                <Requisito ok={categoriaActiva}>Categoría activa</Requisito>
                <Requisito ok={curso.tieneCondiciones === true}>Condiciones de inscripción configuradas</Requisito>
              </ul>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Para recibir inscripciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-muted-foreground">
              <p className="flex gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                Además de estar publicado, el curso necesitará al menos un grupo abierto con docente,
                horarios y vacantes (módulo «Grupos y horarios»).
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`/admin/grupos?curso=${curso.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Ver grupos ({curso.grupos ?? 0})
                </Link>
                {curso.estado !== "desactivado" && (
                  <Link href={`/admin/grupos/nuevo?curso=${curso.id}`} className={buttonVariants({ size: "sm" })}>
                    Nuevo grupo
                  </Link>
                )}
              </div>
              {faltaPlan && (
                <p className="flex gap-2">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  El cobro es en cuotas y aún no tiene plan de cuotas. Sin él no se aceptarán matrículas:
                  configúralo en «Plan de cuotas».
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  )
}

function Dato({ etiqueta, className, children }: { etiqueta: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children}</dd>
    </div>
  )
}

function Vacio() {
  return <span className="font-normal text-muted-foreground">Sin especificar</span>
}

function Requisito({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Cumplido" />
      ) : (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Pendiente" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{children}</span>
    </li>
  )
}
