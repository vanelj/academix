import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CircleAlert, Info, Lock, Mail, Phone } from "lucide-react"

import { SolicitudAcciones } from "@/components/admin/solicitudes/solicitud-acciones"
import { DisponibilidadBadge, ETIQUETA_ESTADO_GRUPO } from "@/components/admin/grupos/grupo-ui"
import {
  ETIQUETA_TIPO_SOLICITUD,
  EstadoSolicitudBadge,
  fechaSimple,
  formatoFechaHoraSolicitud,
  formatoSolesSolicitud,
} from "@/components/solicitudes/solicitud-ui"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerSolicitud } from "@/lib/solicitudes/datos"
import { cn } from "@/lib/utils"
import { idSchema, type EstadoGrupo } from "@/lib/validations/grupo"

export const metadata: Metadata = {
  title: "Solicitud · Academix",
}

const ETIQUETA_PAGO = { pendiente: "En revisión", pagado: "Aprobado", rechazado: "Rechazado" } as const

export default async function SolicitudPage({ params }: PageProps<"/admin/solicitudes/[id]">) {
  const sesion = await requerirPanel("admin")
  const { id } = await params
  const institucionId = sesion.perfil.institucionId
  if (!institucionId || !idSchema.safeParse(id).success) notFound()

  // Una solicitud de otra institución se trata como inexistente (RLS + filtro explícito).
  const s = await obtenerSolicitud(institucionId, id)
  if (!s) notFound()

  const pagoEnRevision = s.pagos.some((p) => p.estado === "pendiente")
  const cancelable = (s.estado === "pendiente" || s.estado === "reservada") && !pagoEnRevision
  const motivo = pagoEnRevision
    ? "Hay un comprobante en revisión: no se puede cancelar hasta revisar el pago."
    : "Solo se pueden cancelar solicitudes pendientes o reservas."

  // Historial con los datos que guarda V5 (no hay tabla de auditoría).
  const historial = [
    { fecha: s.fecha_solicitud, texto: "Solicitud registrada y condiciones aceptadas" },
    ...s.pagos.map((p) => ({ fecha: p.fecha_pago, texto: `Comprobante presentado (${formatoSolesSolicitud.format(p.monto)})` })),
    ...s.pagos.filter((p) => p.verificado_en).map((p) => ({ fecha: p.verificado_en!, texto: `Pago ${ETIQUETA_PAGO[p.estado].toLowerCase()}` })),
    ...(s.fecha_verificacion ? [{ fecha: s.fecha_verificacion, texto: s.estado === "reservada" ? "Reserva confirmada" : "Solicitud verificada" }] : []),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha))

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <Link href="/admin/solicitudes" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}>
          <ArrowLeft aria-hidden />
          Volver a solicitudes
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight break-words">{ETIQUETA_TIPO_SOLICITUD[s.tipo]}</h2>
              <EstadoSolicitudBadge estado={s.estado} reservaVencida={s.reservaVencida} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {s.estudiante.nombre ?? "Estudiante"} · {s.curso?.nombre ?? "Curso"} · Grupo {s.grupo?.codigo ?? "—"}
            </p>
          </div>
          <SolicitudAcciones solicitudId={s.id} cancelable={cancelable} motivoNoCancelable={cancelable ? undefined : motivo} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos de la solicitud</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Dato etiqueta="Institución">{sesion.institucion ?? "—"}</Dato>
                <Dato etiqueta="Importe esperado">{formatoSolesSolicitud.format(s.importe_esperado)}</Dato>
                <Dato etiqueta="Curso">
                  {s.curso ? <Link href={`/admin/cursos/${s.curso.id}`} className="hover:underline">{s.curso.nombre}</Link> : "—"}
                </Dato>
                <Dato etiqueta="Grupo">
                  {s.grupo ? (
                    <Link href={`/admin/grupos/${s.grupo.id}`} className="hover:underline">
                      {s.grupo.codigo} · {fechaSimple(s.grupo.fecha_inicio)} – {fechaSimple(s.grupo.fecha_fin)}
                    </Link>
                  ) : "—"}
                  {s.grupo && (
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted-foreground">
                      {ETIQUETA_ESTADO_GRUPO[s.grupo.estado as EstadoGrupo] ?? s.grupo.estado}
                      {s.vacantes && (
                        <>
                          · {s.vacantes.disponibles ?? "—"} libres de {s.vacantes.total}
                          <DisponibilidadBadge vacantes={s.vacantes.total} disponibles={s.vacantes.disponibles} />
                        </>
                      )}
                    </span>
                  )}
                </Dato>
                <Dato etiqueta="Fecha de solicitud">{formatoFechaHoraSolicitud.format(new Date(s.fecha_solicitud))}</Dato>
                <Dato etiqueta="Condiciones aceptadas el">{formatoFechaHoraSolicitud.format(new Date(s.aceptadas_en))}</Dato>
                {s.matricula_id && (
                  <Dato etiqueta="Matrícula">
                    <Link href={`/admin/matriculas/${s.matricula_id}`} className="hover:underline">Ver matrícula</Link>
                  </Dato>
                )}
                {s.tipo === "reserva" && (
                  <Dato etiqueta="Vencimiento de la reserva">
                    {s.reserva_vence_en ? (
                      <span className={cn(s.reservaVencida && "text-destructive")}>
                        {formatoFechaHoraSolicitud.format(new Date(s.reserva_vence_en))}
                        {s.reservaVencida && " (vencida)"}
                      </span>
                    ) : (
                      <span className="font-normal text-muted-foreground">
                        Se fija al aprobar el pago{s.condicionesActuales?.reserva_plazo_horas ? `: ${s.condicionesActuales.reserva_plazo_horas} h de plazo` : ""}
                      </span>
                    )}
                  </Dato>
                )}
              </dl>
              {s.reservaVencida && (
                <p className="mt-4 flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm dark:bg-warning/10">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  La reserva venció: ya no ocupa vacante, pero sigue impidiendo una nueva reserva del estudiante en este grupo
                  hasta que se cancele.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Condiciones aceptadas</CardTitle>
              <CardDescription>Texto que el estudiante aceptó al registrar la solicitud (requisitos, condiciones del curso y políticas).</CardDescription>
            </CardHeader>
            <CardContent>
              {s.condiciones_aceptadas.trim() ? (
                <p className="max-h-80 overflow-y-auto rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-line">{s.condiciones_aceptadas}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No se registraron textos de condiciones.</p>
              )}
              {s.condicionesActuales?.requisitos && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-muted-foreground">Requisitos vigentes del curso</p>
                  <p className="mt-1 text-sm whitespace-pre-line">{s.condicionesActuales.requisitos}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pagos y comprobantes</CardTitle>
              <CardDescription>Comprobantes presentados para esta solicitud.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {s.pagos.length === 0 ? (
                <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                  {s.importe_esperado > 0 ? "El estudiante aún no presentó un comprobante." : "Esta solicitud no requiere pago."}
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {s.pagos.map((p) => (
                    <li key={p.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">
                          <Link href={`/admin/pagos/${p.id}`} className="hover:underline">{formatoSolesSolicitud.format(p.monto)} · {p.metodo}</Link>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatoFechaHoraSolicitud.format(new Date(p.fecha_pago))}
                          {p.referencia_operacion && ` · Ref. ${p.referencia_operacion}`}
                          {p.observacion && ` · ${p.observacion}`}
                        </p>
                      </div>
                      <Badge variant={p.estado === "pagado" ? "success" : p.estado === "pendiente" ? "warning" : "outline"}>{ETIQUETA_PAGO[p.estado]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="flex gap-2 text-xs text-muted-foreground">
                <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
                Los comprobantes se consultan y revisan desde el módulo «Pagos y mensualidades».
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
                <Link href={`/admin/estudiantes/${s.estudiante.id}`} className="hover:underline">{s.estudiante.nombre ?? "Estudiante"}</Link>
              </p>
              {s.contacto !== null && s.contacto !== "error" ? (
                <dl className="space-y-2 text-sm">
                  <Dato etiqueta="Documento">{s.contacto.dni ?? <Sin />}</Dato>
                  <Dato etiqueta="Teléfono">
                    {s.contacto.telefono ? (
                      <a href={`tel:${s.contacto.telefono.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:underline">
                        <Phone className="size-3.5" aria-hidden />{s.contacto.telefono}
                      </a>
                    ) : <Sin />}
                  </Dato>
                  <Dato etiqueta="Correo">
                    {s.contacto.correo ? (
                      <a href={`mailto:${s.contacto.correo}`} className="inline-flex items-center gap-1.5 break-all hover:underline">
                        <Mail className="size-3.5 shrink-0" aria-hidden />{s.contacto.correo}
                      </a>
                    ) : <Sin />}
                  </Dato>
                </dl>
              ) : (
                <p className="flex gap-2 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {s.contacto === "error"
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

function Sin() {
  return <span className="font-normal text-muted-foreground">Sin especificar</span>
}
