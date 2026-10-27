import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Info, Lock, Mail, Phone } from "lucide-react"

import { ETIQUETA_FINAL, MatriculaBadge } from "@/components/admin/estudiantes/estudiante-ui"
import { ETIQUETA_ESTADO_GRUPO } from "@/components/admin/grupos/grupo-ui"
import { MatriculaAcciones } from "@/components/admin/matriculas/matricula-acciones"
import {
  ETIQUETA_TIPO_SOLICITUD,
  fechaSimple,
  formatoFechaHoraSolicitud,
  formatoSolesSolicitud,
} from "@/components/solicitudes/solicitud-ui"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { ETIQUETA_CALCULO } from "@/lib/evaluaciones/calculo"
import { obtenerResultadoAcademico } from "@/lib/evaluaciones/datos"
import { obtenerMatricula, type MatriculaDetalle } from "@/lib/matriculas/datos"
import { cn } from "@/lib/utils"
import { idSchema, type EstadoGrupo } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Matrícula · Academix",
}

const ETIQUETA_CUOTA = { pendiente: "Pendiente", parcial: "Pago parcial", pagada: "Pagada", anulada: "Anulada" } as const
const ETIQUETA_PAGO = { pendiente: "En revisión", pagado: "Aprobado", rechazado: "Rechazado" } as const

/** Mismas reglas que comprueba la RPC anular_matricula; aquí solo para explicar el botón. */
function motivoNoAnulable(m: MatriculaDetalle): string | null {
  if (m.estado !== "activa") return "La matrícula ya está anulada."
  if (m.lecturaIncompleta) return "No se pudieron consultar los pagos y cuotas de la matrícula. Recarga la página."
  if (m.estado_final !== "en_curso") return "La matrícula ya tiene un resultado final registrado."
  if (m.grupo?.estado === "cerrado") return "El grupo está cerrado: la matrícula forma parte del historial."
  if (m.certificado) return "La matrícula tiene un certificado emitido."
  if (m.pagos.some((p) => p.estado === "pendiente")) return "Hay un comprobante en revisión: primero debe revisarse el pago."
  return null
}

export default async function MatriculaPage({ params }: PageProps<"/admin/matriculas/[id]">) {
  const sesion = await requerirPanel("admin")
  const { id } = await params
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idSchema.safeParse(id).success) notFound()

  // Una matrícula de otra institución se trata como inexistente (RLS + filtro explícito).
  const m = await obtenerMatricula(institucionId, id)
  if (!m) notFound()

  const motivo = motivoNoAnulable(m)
  const academico = m.grupo ? await obtenerResultadoAcademico(institucionId, m.id, m.grupo.id, m.curso?.id ?? null) : null
  const nota = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const cuotasPendientes = m.cuotas.filter((q) => q.estado === "pendiente").length
  const cuotasParciales = m.cuotas.filter((q) => q.estado === "parcial").length

  // Historial con los datos que guarda V5 (no hay tabla de auditoría ni fecha de anulación).
  const historial = [
    ...(m.solicitud ? [{ fecha: m.solicitud.fecha_solicitud, texto: `${ETIQUETA_TIPO_SOLICITUD[m.solicitud.tipo]} solicitada` }] : []),
    { fecha: m.fecha_matricula, texto: "Matrícula registrada" },
    ...m.pagos.map((p) => ({ fecha: p.fecha_pago, texto: `Comprobante presentado (${formatoSolesSolicitud.format(p.monto)})` })),
    ...m.pagos.filter((p) => p.verificado_en).map((p) => ({ fecha: p.verificado_en!, texto: `Pago ${ETIQUETA_PAGO[p.estado].toLowerCase()}` })),
    ...(m.certificado ? [{ fecha: m.certificado.fecha_emision, texto: `Certificado emitido (${m.certificado.codigo})` }] : []),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha))

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Link href="/admin/matriculas" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Volver a matrículas
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight break-words">{m.estudiante.nombre ?? "Estudiante"}</h2>
              <MatriculaBadge estado={m.estado} final={m.estado_final} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {m.curso?.nombre ?? "Curso"} · Grupo {m.grupo?.codigo ?? "—"}
            </p>
          </div>
          <MatriculaAcciones
            matriculaId={m.id}
            anulable={motivo === null}
            motivoNoAnulable={motivo ?? undefined}
            cuotasPendientes={cuotasPendientes}
            cuotasParciales={cuotasParciales}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos de la matrícula</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Dato etiqueta="Institución">{sesion.institucion ?? "—"}</Dato>
                <Dato etiqueta="Fecha de matrícula">{formatoFechaHoraSolicitud.format(new Date(m.fecha_matricula))}</Dato>
                <Dato etiqueta="Curso">
                  {m.curso ? <Link href={`/admin/cursos/${m.curso.id}`} className="hover:underline">{m.curso.nombre}</Link> : "—"}
                </Dato>
                <Dato etiqueta="Grupo">
                  {m.grupo ? (
                    <Link href={`/admin/grupos/${m.grupo.id}`} className="hover:underline">
                      {m.grupo.codigo} · {fechaSimple(m.grupo.fecha_inicio)} – {fechaSimple(m.grupo.fecha_fin)}
                    </Link>
                  ) : "—"}
                  {m.grupo && (
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {ETIQUETA_ESTADO_GRUPO[m.grupo.estado as EstadoGrupo] ?? m.grupo.estado}
                    </span>
                  )}
                </Dato>
                <Dato etiqueta="Docente">{m.docente ?? <Sin texto="Sin docente asignado" />}</Dato>
                <Dato etiqueta="Estado">{m.estado === "activa" ? "Activa" : "Anulada"}</Dato>
                <Dato etiqueta="Resultado final">{ETIQUETA_FINAL[m.estado_final]}</Dato>
                <Dato etiqueta="Origen">
                  {m.solicitud ? (
                    <Link href={`/admin/solicitudes/${m.solicitud.id}`} className="hover:underline">
                      {ETIQUETA_TIPO_SOLICITUD[m.solicitud.tipo]} · {formatoSolesSolicitud.format(m.solicitud.importe_esperado)}
                    </Link>
                  ) : (
                    <Sin texto="Registrada sin solicitud de inscripción" />
                  )}
                </Dato>
              </dl>
            </CardContent>
          </Card>

          {academico && (
            <Card>
              <CardHeader>
                <CardTitle>Resultado académico</CardTitle>
                <CardDescription>
                  Notas registradas por el docente y promedio ponderado (escala 0–20; aprueba con {nota(academico.notaAprobatoria)}).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {academico.evaluaciones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">El grupo aún no tiene evaluaciones.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {academico.evaluaciones.map((e) => (
                      <li key={e.id} className="flex justify-between gap-3 py-1.5">
                        <span>{e.nombre} <span className="text-muted-foreground">({e.peso.toLocaleString("es-PE")} %)</span></span>
                        <span className={cn("tabular-nums", e.nota !== null && e.nota < academico.notaAprobatoria && "text-destructive")}>{e.nota !== null ? nota(e.nota) : "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-sm">
                  {academico.calculo.promedio !== null ? (
                    <>Promedio final: <strong className="tabular-nums">{nota(academico.calculo.promedio)}</strong></>
                  ) : (
                    <span className="text-muted-foreground">{ETIQUETA_CALCULO[academico.calculo.estado]}: aún no hay promedio final.</span>
                  )}
                  {" · "}Resultado registrado: {ETIQUETA_FINAL[m.estado_final]}
                </p>
                <Link href={`/admin/evaluaciones/${academico.grupoId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Ver evaluaciones del grupo
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Cuotas y pagos</CardTitle>
              <CardDescription>Consulta de las cuotas fijadas al matricular y los comprobantes vinculados.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {m.cuotas.length === 0 && m.pagos.length === 0 ? (
                <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                  Esta matrícula no tiene cuotas ni pagos registrados.
                </p>
              ) : (
                <>
                  {m.cuotas.length > 0 && (
                    <ul className="divide-y rounded-lg border">
                      {m.cuotas.map((q) => (
                        <li key={q.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 text-sm">
                            <p className="font-medium">
                              <Link href={`/admin/pagos/cuotas/${q.id}`} className="hover:underline">Cuota {q.numero} · {q.concepto}</Link>
                            </p>
                            <p className="text-xs text-muted-foreground">{formatoSolesSolicitud.format(q.importe)} · vence el {fechaSimple(q.vencimiento)}</p>
                          </div>
                          <Badge variant={q.estado === "pagada" ? "success" : q.estado === "anulada" ? "outline" : "warning"}>{ETIQUETA_CUOTA[q.estado]}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.pagos.length > 0 && (
                    <ul className="divide-y rounded-lg border">
                      {m.pagos.map((p) => (
                        <li key={p.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 text-sm">
                            <p className="font-medium">
                              <Link href={`/admin/pagos/${p.id}`} className="hover:underline">{formatoSolesSolicitud.format(p.monto)} · {p.metodo}</Link>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatoFechaHoraSolicitud.format(new Date(p.fecha_pago))}
                              {p.cuota_id && ` · Cuota ${m.cuotas.find((q) => q.id === p.cuota_id)?.numero ?? ""}`}
                            </p>
                          </div>
                          <Badge variant={p.estado === "pagado" ? "success" : p.estado === "pendiente" ? "warning" : "outline"}>{ETIQUETA_PAGO[p.estado]}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              <p className="flex gap-2 text-xs text-muted-foreground">
                <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
                El detalle de cada cuota y la revisión de comprobantes están en el módulo «Pagos y mensualidades».
              </p>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Estudiante</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-medium">
                <Link href={`/admin/estudiantes/${m.estudiante.id}`} className="hover:underline">{m.estudiante.nombre ?? "Estudiante"}</Link>
              </p>
              {m.contacto !== null && m.contacto !== "error" ? (
                <dl className="space-y-2 text-sm">
                  <Dato etiqueta="Documento">{m.contacto.dni ?? <Sin />}</Dato>
                  <Dato etiqueta="Teléfono">
                    {m.contacto.telefono ? (
                      <a href={`tel:${m.contacto.telefono.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:underline">
                        <Phone className="size-3.5" aria-hidden />{m.contacto.telefono}
                      </a>
                    ) : <Sin />}
                  </Dato>
                  <Dato etiqueta="Correo">
                    {m.contacto.correo ? (
                      <a href={`mailto:${m.contacto.correo}`} className="inline-flex items-center gap-1.5 break-all hover:underline">
                        <Mail className="size-3.5 shrink-0" aria-hidden />{m.contacto.correo}
                      </a>
                    ) : <Sin />}
                  </Dato>
                </dl>
              ) : (
                <p className="flex gap-2 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {m.contacto === "error"
                    ? "No se pudieron consultar los datos de contacto."
                    : "Los datos de contacto se muestran mientras haya una solicitud vigente o una matrícula activa."}
                </p>
              )}
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Historial</CardTitle>
              <CardDescription>Fechas registradas por el sistema.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2.5 border-l pl-4">
                {historial.map((h, i) => (
                  <li key={i} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" aria-hidden />
                    <p>{h.texto}</p>
                    <p className="text-xs text-muted-foreground">{formatoFechaHoraSolicitud.format(new Date(h.fecha))}</p>
                  </li>
                ))}
              </ol>
              {m.estado === "anulada" && (
                <p className="mt-3 text-xs text-muted-foreground">Matrícula anulada. V5 no registra la fecha de anulación.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children}</dd>
    </div>
  )
}

function Sin({ texto = "Sin especificar" }: { texto?: string }) {
  return <span className="font-normal text-muted-foreground">{texto}</span>
}
